from __future__ import annotations

import hashlib
import json
import secrets
import smtplib
import ssl
from calendar import monthrange
from collections import defaultdict
from collections.abc import Generator
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from email.message import EmailMessage
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import jwt
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    TypeAdapter,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Time,
    UniqueConstraint,
    create_engine,
    or_,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/energeia"
    jwt_secret: str = "development-only-change-before-deploying"
    jwt_expire_minutes: int = Field(default=1440, ge=1, le=10080)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    frontend_url: str = "http://localhost:5173"
    api_public_url: str = "http://localhost:8000"
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_ssl: bool = False
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/api")


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def utc_today() -> date:
    return datetime.now(UTC).date()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "Users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    barangay: Mapped[str | None] = mapped_column(String(100), nullable=True)
    street_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    auth_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class OAuthIdentity(Base):
    __tablename__ = "OAuthIdentities"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_oauth_provider_subject"),
        Index("idx_oauth_identity_user", "user_id"),
    )

    identity_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    provider_email: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class OAuthState(Base):
    __tablename__ = "OAuthStates"

    state_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(20))
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("Users.user_id", ondelete="CASCADE"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class PasswordResetToken(Base):
    __tablename__ = "PasswordResetTokens"
    __table_args__ = (Index("idx_password_reset_user", "user_id"),)

    token_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class OAuthIdentityError(Exception):
    def __init__(self, error_code: str):
        self.error_code = error_code


class NativeGoogleSignInInput(BaseModel):
    id_token: str = Field(min_length=1, max_length=8192)
    nonce: str = Field(min_length=1, max_length=128)


class ElectricityRate(Base):
    __tablename__ = "ElectricityRates"

    rate_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_name: Mapped[str] = mapped_column(String(150))
    rate_per_kwh: Mapped[Decimal] = mapped_column(Numeric(10, 4))
    effective_date: Mapped[date] = mapped_column(Date)


class Household(Base):
    __tablename__ = "Households"
    __table_args__ = (Index("idx_households_user", "user_id"),)

    household_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id", ondelete="CASCADE"))
    household_name: Mapped[str] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rate_id: Mapped[int] = mapped_column(ForeignKey("ElectricityRates.rate_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Appliance(Base):
    __tablename__ = "Appliances"
    __table_args__ = (Index("idx_appliances_household", "household_id"),)

    appliance_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("Households.household_id", ondelete="CASCADE")
    )
    appliance_name: Mapped[str] = mapped_column(String(150))
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wattage: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class UsageSchedule(Base):
    __tablename__ = "UsageSchedules"
    __table_args__ = (Index("idx_schedules_appliance", "appliance_id"),)

    schedule_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appliance_id: Mapped[int] = mapped_column(
        ForeignKey("Appliances.appliance_id", ondelete="CASCADE")
    )
    days_of_week: Mapped[str] = mapped_column(String(50))
    hours_per_day: Mapped[Decimal] = mapped_column(Numeric(4, 2))
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class BillingRecord(Base):
    __tablename__ = "BillingRecords"
    __table_args__ = (
        Index("idx_billing_household", "household_id"),
        Index("idx_billing_rate", "rate_id"),
        Index("idx_billing_period", "period_start", "period_end"),
    )

    bill_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("Households.household_id", ondelete="CASCADE")
    )
    rate_id: Mapped[int] = mapped_column(
        ForeignKey("ElectricityRates.rate_id", ondelete="RESTRICT")
    )
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    total_kwh: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    actual_bill_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ConsumptionRecord(Base):
    __tablename__ = "ConsumptionRecords"
    __table_args__ = (
        Index("idx_consumption_appliance", "appliance_id"),
        Index("idx_consumption_period", "period_start", "period_end"),
    )

    record_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appliance_id: Mapped[int] = mapped_column(
        ForeignKey("Appliances.appliance_id", ondelete="RESTRICT")
    )
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    estimated_kwh: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class WhatIfScenario(Base):
    __tablename__ = "WhatIfScenarios"
    __table_args__ = (Index("idx_scenarios_household", "household_id"),)

    scenario_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("Households.household_id", ondelete="CASCADE")
    )
    scenario_name: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ScenarioAppliance(Base):
    __tablename__ = "ScenarioAppliances"
    __table_args__ = (
        Index("idx_scenarioapp_scenario", "scenario_id"),
        Index("idx_scenarioapp_appliance", "appliance_id"),
    )

    scenario_appliance_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("WhatIfScenarios.scenario_id", ondelete="CASCADE")
    )
    appliance_id: Mapped[int] = mapped_column(
        ForeignKey("Appliances.appliance_id", ondelete="CASCADE")
    )
    adjusted_hours_per_day: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    adjusted_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Recommendation(Base):
    __tablename__ = "Recommendations"
    __table_args__ = (
        Index("idx_reco_household", "household_id"),
        Index("idx_reco_appliance", "appliance_id"),
    )

    recommendation_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("Households.household_id", ondelete="CASCADE")
    )
    appliance_id: Mapped[int | None] = mapped_column(
        ForeignKey("Appliances.appliance_id", ondelete="CASCADE"), nullable=True
    )
    message: Mapped[str] = mapped_column(String(500))
    potential_savings_kwh: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    potential_savings_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


Db = Annotated[Session, Depends(get_db)]


def get_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Db,
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=401, detail="Sign in to continue.", headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        auth_version = payload.get("ver", 0)
        if (
            not isinstance(user_id, str)
            or not user_id.isdigit()
            or not isinstance(auth_version, int)
            or auth_version < 0
        ):
            raise ValueError("Invalid account ID")
    except (InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    user = db.get(User, int(user_id))
    if user is None:
        raise HTTPException(status_code=401, detail="Your account could not be verified.")
    if payload.get("ver", 0) != user.auth_version:
        raise HTTPException(
            status_code=401,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(get_user)]


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    full_name: str | None
    email: EmailStr
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    country: str | None
    region: str | None
    city: str | None
    barangay: str | None
    street_address: str | None
    unit_number: str | None
    postal_code: str | None
    phone_number: str | None
    terms_accepted: bool
    profile_complete: bool


def profile_is_complete(user: User) -> bool:
    return bool(
        user.first_name
        and user.last_name
        and user.country
        and user.region
        and user.city
        and user.street_address
        and user.terms_accepted_at
    )


def serialize_user(user: User) -> dict:
    return UserOutput(
        user_id=user.user_id,
        full_name=user.full_name,
        email=user.email,
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        country=user.country,
        region=user.region,
        city=user.city,
        barangay=user.barangay,
        street_address=user.street_address,
        unit_number=user.unit_number,
        postal_code=user.postal_code,
        phone_number=user.phone_number,
        terms_accepted=user.terms_accepted_at is not None,
        profile_complete=profile_is_complete(user),
    ).model_dump(mode="json")


class AccountInput(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)
    country: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    barangay: str | None = Field(default=None, max_length=100)
    street_address: str = Field(min_length=1, max_length=255)
    unit_number: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=32)
    phone_number: str | None = Field(default=None, max_length=32)
    terms_accepted: bool

    @field_validator(
        "first_name", "middle_name", "last_name", "country", "region", "city",
        "barangay", "street_address", "unit_number", "postal_code", "phone_number",
    )
    @classmethod
    def clean_profile_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def validate_registration(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match.")
        if not all((self.first_name, self.last_name, self.country, self.region, self.city, self.street_address)):
            raise ValueError("Complete the required name and home address fields.")
        if not self.terms_accepted:
            raise ValueError("Accept the Terms of Service and Privacy Policy to continue.")
        return self


class ProfileUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    country: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    barangay: str | None = Field(default=None, max_length=100)
    street_address: str = Field(min_length=1, max_length=255)
    unit_number: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=32)
    phone_number: str | None = Field(default=None, max_length=32)
    terms_accepted: bool = False

    @field_validator(
        "first_name", "middle_name", "last_name", "country", "region", "city",
        "barangay", "street_address", "unit_number", "postal_code", "phone_number",
    )
    @classmethod
    def clean_profile_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetComplete(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match.")
        return self


class PasswordChangeInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match.")
        return self


class HouseholdInput(BaseModel):
    household_name: str = Field(min_length=1, max_length=150)
    address: str | None = Field(default=None, max_length=255)

    @field_validator("household_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A household name is required.")
        return value


class HouseholdOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    household_id: int
    household_name: str
    address: str | None
    rate_id: int
    created_at: datetime


class ApplianceInput(BaseModel):
    appliance_name: str = Field(min_length=1, max_length=150)
    category: str | None = Field(default=None, max_length=100)
    wattage: Decimal = Field(gt=0, le=100000)
    quantity: int = Field(ge=1, le=999)

    @field_validator("appliance_name")
    @classmethod
    def clean_appliance_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("An appliance name is required.")
        return value


class ApplianceUpdate(BaseModel):
    appliance_name: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, max_length=100)
    wattage: Decimal | None = Field(default=None, gt=0, le=100000)
    quantity: int | None = Field(default=None, ge=1, le=999)


class ApplianceOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    appliance_id: int
    household_id: int
    appliance_name: str
    category: str | None
    wattage: Decimal
    quantity: int
    is_active: bool
    average_hours_per_day: float = 0


class ScheduleInput(BaseModel):
    days_of_week: list[str] = Field(min_length=1, max_length=7)
    hours_per_day: Decimal = Field(gt=0, le=24)
    start_time: time | None = None
    is_active: bool = True

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, days: list[str]) -> list[str]:
        allowed = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
        if any(day not in allowed for day in days) or len(set(days)) != len(days):
            raise ValueError("Choose each valid day of the week at most once.")
        order = {
            day: index
            for index, day in enumerate(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"))
        }
        return sorted(days, key=order.__getitem__)


class ScheduleUpdate(BaseModel):
    days_of_week: list[str] | None = Field(default=None, min_length=1, max_length=7)
    hours_per_day: Decimal | None = Field(default=None, gt=0, le=24)
    start_time: time | None = None
    is_active: bool | None = None

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, days: list[str] | None) -> list[str] | None:
        if days is None:
            return days
        allowed = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
        if any(day not in allowed for day in days) or len(set(days)) != len(days):
            raise ValueError("Choose each valid day of the week at most once.")
        order = {
            day: index
            for index, day in enumerate(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"))
        }
        return sorted(days, key=order.__getitem__)


class RateInput(BaseModel):
    provider_name: str = Field(min_length=1, max_length=150)
    rate_per_kwh: Decimal = Field(gt=0, le=999999)

    @field_validator("provider_name")
    @classmethod
    def clean_provider(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("An electricity provider is required.")
        return value


class ActualBillInput(BaseModel):
    actual_bill_amount: Decimal = Field(ge=0, le=999999999)


class PeriodInput(BaseModel):
    period_start: date | None = None
    period_end: date | None = None


class ScenarioItemInput(BaseModel):
    appliance_id: int = Field(gt=0)
    adjusted_hours_per_day: Decimal | None = Field(default=None, ge=0, le=24)
    adjusted_quantity: int | None = Field(default=None, ge=1, le=999)


class ScenarioInput(BaseModel):
    scenario_name: str = Field(min_length=1, max_length=150)
    items: list[ScenarioItemInput] = Field(default_factory=list, max_length=100)

    @field_validator("scenario_name")
    @classmethod
    def clean_scenario_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give your scenario a name.")
        return value


class ScenarioPreviewInput(BaseModel):
    items: list[ScenarioItemInput] = Field(default_factory=list, max_length=100)


class RecommendationUpdate(BaseModel):
    is_dismissed: bool


def issue_token(user: User) -> str:
    expires = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": str(user.user_id), "ver": user.auth_version, "exp": expires},
        settings.jwt_secret,
        algorithm="HS256",
    )


def oauth_credentials(provider: str) -> tuple[str, str]:
    credentials = {
        "google": (settings.google_client_id, settings.google_client_secret),
        "github": (settings.github_client_id, settings.github_client_secret),
    }.get(provider)
    if credentials is None:
        raise HTTPException(status_code=404, detail="That sign-in provider is not supported.")
    if not all(credentials):
        raise HTTPException(
            status_code=503,
            detail=f"{provider.title()} sign-in is not configured on the Energeia API.",
        )
    return credentials


def start_oauth(
    provider: str,
    db: Session,
    user_id: int | None = None,
    native_app: bool = False,
) -> dict[str, str]:
    client_id, _ = oauth_credentials(provider)
    state_id = secrets.token_urlsafe(32)
    expires_at = utc_now() + timedelta(minutes=10)
    db.add(
        OAuthState(
            state_id=state_id,
            provider=provider,
            user_id=user_id,
            expires_at=expires_at,
        )
    )
    db.commit()
    state = jwt.encode(
        {
            "typ": "oauth_state",
            "provider": provider,
            "jti": state_id,
            "native_app": native_app,
            "exp": expires_at.replace(tzinfo=UTC),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    redirect_uri = (
        f"{settings.api_public_url.rstrip('/')}/api/auth/oauth/{provider}/callback"
    )
    if provider == "google":
        authorization_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
            }
        )
    else:
        authorization_url = "https://github.com/login/oauth/authorize?" + urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "scope": "read:user user:email",
                "state": state,
            }
        )
    return {"authorization_url": authorization_url}


def oauth_request_json(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> dict | list:
    request = UrlRequest(
        url,
        data=data,
        headers={"Accept": "application/json", **(headers or {})},
        method="POST" if data is not None else "GET",
    )
    with urlopen(request, timeout=15) as response:
        return json.loads(response.read())


def fetch_oauth_identity(
    provider: str, code: str
) -> tuple[str, str, str | None, str | None, str | None]:
    client_id, client_secret = oauth_credentials(provider)
    redirect_uri = (
        f"{settings.api_public_url.rstrip('/')}/api/auth/oauth/{provider}/callback"
    )
    if provider == "google":
        token_result = oauth_request_json(
            "https://oauth2.googleapis.com/token",
            data=urlencode(
                {
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                }
            ).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if not isinstance(token_result, dict) or not token_result.get("access_token"):
            raise ValueError("The provider did not issue an access token.")
        profile = oauth_request_json(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token_result['access_token']}"},
        )
        if not isinstance(profile, dict) or not profile.get("sub") or not profile.get("email"):
            raise ValueError("The provider did not return a usable account.")
        if profile.get("email_verified") is not True:
            raise ValueError("Verify your Google email address before signing in.")
        first_name = profile.get("given_name")
        last_name = profile.get("family_name")
        first_name = (
            first_name.strip()[:100] if isinstance(first_name, str) and first_name.strip() else None
        )
        last_name = (
            last_name.strip()[:100] if isinstance(last_name, str) and last_name.strip() else None
        )
        full_name = " ".join(part for part in (first_name, last_name) if part) or None
        if full_name:
            full_name = full_name[:150]
        return str(profile["sub"]), str(profile["email"]).lower(), full_name, first_name, last_name

    token_result = oauth_request_json(
        "https://github.com/login/oauth/access_token",
        data=urlencode(
            {
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
            }
        ).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if not isinstance(token_result, dict) or not token_result.get("access_token"):
        raise ValueError("The provider did not issue an access token.")
    access_token = str(token_result["access_token"])
    headers = {
        "Authorization": f"Bearer {access_token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    profile = oauth_request_json("https://api.github.com/user", headers=headers)
    if not isinstance(profile, dict) or profile.get("id") is None:
        raise ValueError("The provider did not return a usable account.")
    emails = oauth_request_json("https://api.github.com/user/emails", headers=headers)
    if not isinstance(emails, list):
        raise ValueError("The provider did not return a verified email address.")
    email_entry = next(
        (
            item for item in emails
            if isinstance(item, dict) and item.get("primary") and item.get("verified")
        ),
        None,
    )
    if email_entry is None:
        raise ValueError("Add and verify a primary email address with GitHub before signing in.")
    full_name = profile.get("name")
    if not isinstance(full_name, str):
        full_name = None
    return (
        str(profile["id"]),
        str(email_entry["email"]).lower(),
        full_name[:150] if full_name else None,
        None,
        None,
    )


def start_native_google(db: Session, user_id: int | None = None) -> dict[str, str]:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on the Energeia API.",
        )
    nonce = secrets.token_urlsafe(32)
    db.add(
        OAuthState(
            state_id=nonce,
            provider="google",
            user_id=user_id,
            expires_at=utc_now() + timedelta(minutes=10),
        )
    )
    db.commit()
    return {"web_client_id": settings.google_client_id, "nonce": nonce}


def fetch_native_google_identity(id_token: str, nonce: str) -> tuple[str, str, str | None, str | None, str | None]:
    try:
        claims = google_id_token.verify_oauth2_token(
            id_token,
            GoogleAuthRequest(),
            audience=settings.google_client_id,
        )
    except ValueError as exception:
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified.") from exception
    except GoogleAuthError as exception:
        raise HTTPException(
            status_code=502,
            detail="Google sign-in could not be reached. Please try again.",
        ) from exception

    if claims.get("nonce") != nonce:
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified.")
    subject = claims.get("sub")
    email = claims.get("email")
    if (
        not isinstance(subject, str)
        or not subject
        or not isinstance(email, str)
        or not email
        or claims.get("email_verified") is not True
    ):
        raise HTTPException(
            status_code=401,
            detail="Google did not return a verified email address.",
        )
    try:
        email = str(TypeAdapter(EmailStr).validate_python(email)).lower()
    except ValueError as exception:
        raise HTTPException(status_code=401, detail="Google returned an invalid email address.") from exception
    if len(email) > 150 or len(subject) > 255:
        raise HTTPException(status_code=401, detail="Google returned invalid account details.")

    first_name = claims.get("given_name")
    last_name = claims.get("family_name")
    first_name = first_name.strip()[:100] if isinstance(first_name, str) and first_name.strip() else None
    last_name = last_name.strip()[:100] if isinstance(last_name, str) and last_name.strip() else None
    full_name = " ".join(part for part in (first_name, last_name) if part) or None
    return subject, email, full_name[:150] if full_name else None, first_name, last_name


def complete_oauth_identity(
    db: Session,
    provider: str,
    subject: str,
    email: str,
    full_name: str | None,
    first_name: str | None,
    last_name: str | None,
    user_id: int | None = None,
) -> User:
    identity = db.scalar(
        select(OAuthIdentity).where(
            OAuthIdentity.provider == provider,
            OAuthIdentity.subject == subject,
        )
    )
    if user_id is not None:
        user = db.get(User, user_id)
        if user is None:
            raise OAuthIdentityError("account_unavailable")
        if identity and identity.user_id != user.user_id:
            raise OAuthIdentityError("provider_already_linked")
        if identity is None:
            db.add(
                OAuthIdentity(
                    user_id=user.user_id,
                    provider=provider,
                    subject=subject,
                    provider_email=email,
                )
            )
    elif identity is not None:
        user = db.get(User, identity.user_id)
        if user is None:
            raise OAuthIdentityError("account_unavailable")
    else:
        if db.scalar(select(User).where(User.email == email)):
            raise OAuthIdentityError("account_exists")
        user = User(
            email=email,
            full_name=full_name,
            first_name=first_name,
            last_name=last_name,
            password_hash=None,
        )
        db.add(user)
        db.flush()
        db.add(
            OAuthIdentity(
                user_id=user.user_id,
                provider=provider,
                subject=subject,
                provider_email=email,
            )
        )
    try:
        db.commit()
    except IntegrityError as exception:
        db.rollback()
        raise OAuthIdentityError("account_conflict") from exception
    db.refresh(user)
    return user


def complete_native_google(
    body: NativeGoogleSignInInput,
    db: Session,
    user: User | None = None,
) -> dict:
    state = db.get(OAuthState, body.nonce)
    if (
        state is None
        or state.provider != "google"
        or state.consumed_at is not None
        or state.expires_at <= utc_now()
        or (user is None and state.user_id is not None)
        or (user is not None and state.user_id != user.user_id)
    ):
        raise HTTPException(status_code=400, detail="The Google sign-in request expired. Please try again.")
    state.consumed_at = utc_now()
    db.commit()

    subject, email, full_name, first_name, last_name = fetch_native_google_identity(
        body.id_token,
        body.nonce,
    )
    try:
        user = complete_oauth_identity(
            db,
            "google",
            subject,
            email,
            full_name,
            first_name,
            last_name,
            state.user_id,
        )
    except OAuthIdentityError as exception:
        messages = {
            "account_exists": (
                "An account with this email already exists. Sign in with that account, "
                "then connect Google in Account settings."
            ),
            "provider_already_linked": "This Google account is already connected to another Energeia account.",
            "account_unavailable": "The Energeia account could not be found.",
            "account_conflict": "This Google account is already in use by another Energeia account.",
        }
        raise HTTPException(status_code=409, detail=messages[exception.error_code]) from exception

    return {
        "access_token": issue_token(user),
        "user": serialize_user(user),
    }


def oauth_redirect(
    *,
    token: str | None = None,
    profile_complete: bool = False,
    error: str | None = None,
    native_app: bool = False,
):
    fragment = {}
    if token:
        fragment["access_token"] = token
        fragment["profile_complete"] = "true" if profile_complete else "false"
    if error:
        fragment["oauth_error"] = error
    destination = (
        f"io.ionic.starter://oauth#{urlencode(fragment)}"
        if native_app
        else f"{settings.frontend_url.rstrip('/')}/#{urlencode(fragment)}"
    )
    return RedirectResponse(destination, status_code=303)


def send_password_reset_email(email: str, token: str) -> None:
    if not all((settings.smtp_host, settings.smtp_from_email)):
        raise RuntimeError("Password reset email is not configured.")
    message = EmailMessage()
    message["Subject"] = "Reset your Energeia password"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        "A password reset was requested for your Energeia account.\n\n"
        f"Use this link within 30 minutes: "
        f"{settings.frontend_url.rstrip('/')}/#password_reset={token}\n\n"
        "If you did not request this, you can ignore this email."
    )
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=15, context=ssl.create_default_context()
        ) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_household(db: Session, household_id: int, user: User) -> Household:
    household = db.scalar(
        select(Household).where(
            Household.household_id == household_id,
            Household.user_id == user.user_id,
        )
    )
    if household is None:
        raise HTTPException(status_code=404, detail="We couldn't find that household.")
    return household


def get_appliance(
    db: Session, appliance_id: int, user: User, *, allow_inactive: bool = False
) -> Appliance:
    appliance = db.scalar(
        select(Appliance)
        .join(Household, Household.household_id == Appliance.household_id)
        .where(
            Appliance.appliance_id == appliance_id,
            Household.user_id == user.user_id,
            Appliance.is_active.is_(True) if not allow_inactive else True,
        )
    )
    if appliance is None:
        raise HTTPException(status_code=404, detail="We couldn't find that active appliance.")
    return appliance


def average_daily_hours(db: Session, appliance_id: int) -> Decimal:
    schedules = db.scalars(
        select(UsageSchedule).where(
            UsageSchedule.appliance_id == appliance_id,
            UsageSchedule.is_active.is_(True),
        )
    )
    hours_per_week = sum(
        (
            Decimal(schedule.hours_per_day) * len(schedule.days_of_week.split(","))
            for schedule in schedules
        ),
        Decimal(0),
    )
    return hours_per_week / Decimal(7)


def effective_daily_hours(
    db: Session,
    appliance_id: int,
    overrides: dict[int, ScenarioItemInput] | None = None,
) -> Decimal:
    override = (overrides or {}).get(appliance_id)
    if override and override.adjusted_hours_per_day is not None:
        return override.adjusted_hours_per_day
    return average_daily_hours(db, appliance_id)


def projected_kwh(
    appliance: Appliance,
    hours_per_day: Decimal,
    period_days: int,
    quantity: int | None = None,
) -> Decimal:
    count = quantity if quantity is not None else appliance.quantity
    return Decimal(appliance.wattage) * count * hours_per_day * period_days / Decimal(1000)


def get_period(start: date | None, end: date | None) -> tuple[date, date]:
    now = utc_today()
    start = start or now.replace(day=1)
    end = end or start.replace(day=monthrange(start.year, start.month)[1])
    if end < start:
        raise HTTPException(
            status_code=422, detail="The billing period end must be on or after its start."
        )
    if (end - start).days > 366:
        raise HTTPException(status_code=422, detail="Billing periods cannot exceed one year.")
    return start, end


def stored_total_for_period(db: Session, household: Household, start: date, end: date) -> Decimal:
    records = db.scalars(
        select(ConsumptionRecord)
        .join(Appliance, Appliance.appliance_id == ConsumptionRecord.appliance_id)
        .where(
            Appliance.household_id == household.household_id,
            ConsumptionRecord.period_start == start,
            ConsumptionRecord.period_end == end,
        )
    )
    return sum((Decimal(record.estimated_kwh or 0) for record in records), Decimal(0))


def bill_for_period(
    db: Session, household: Household, start: date, end: date
) -> BillingRecord | None:
    total = stored_total_for_period(db, household, start, end)
    bill = db.scalar(
        select(BillingRecord).where(
            BillingRecord.household_id == household.household_id,
            BillingRecord.period_start == start,
            BillingRecord.period_end == end,
        )
    )
    if total <= 0 and bill is None:
        return None

    current_start, current_end = get_period(None, None)
    is_current_period = start == current_start and end == current_end
    rate_id = bill.rate_id if bill is not None else household.rate_id
    if bill is not None:
        captured_rate = db.get(ElectricityRate, bill.rate_id)
        if captured_rate is None:
            raise HTTPException(
                status_code=409, detail="The electricity rate for this billing period is missing."
            )
        is_unconfigured_placeholder = (
            captured_rate.provider_name == "Set your provider"
            and Decimal(captured_rate.rate_per_kwh) == 0
        )
        if is_current_period or is_unconfigured_placeholder:
            rate_id = household.rate_id

    rate = db.get(ElectricityRate, rate_id)
    if rate is None:
        raise HTTPException(
            status_code=409, detail="Choose an electricity provider before calculating a bill."
        )
    estimated = money(total * Decimal(rate.rate_per_kwh))
    if bill is None:
        bill = BillingRecord(
            household_id=household.household_id,
            rate_id=rate.rate_id,
            period_start=start,
            period_end=end,
            total_kwh=money(total),
            estimated_cost=estimated,
        )
        db.add(bill)
    else:
        bill.rate_id = rate.rate_id
        bill.total_kwh = money(total)
        bill.estimated_cost = estimated
    return bill


def calculate_period(
    db: Session,
    household: Household,
    start: date,
    end: date,
) -> dict:
    period_days = (end - start).days + 1
    scheduled_total = Decimal(0)
    appliances = list(
        db.scalars(
            select(Appliance).where(
                Appliance.household_id == household.household_id,
                Appliance.is_active.is_(True),
            )
        )
    )
    for appliance in appliances:
        kwh = projected_kwh(appliance, average_daily_hours(db, appliance.appliance_id), period_days)
        scheduled_total += money(kwh)
        record = db.scalar(
            select(ConsumptionRecord).where(
                ConsumptionRecord.appliance_id == appliance.appliance_id,
                ConsumptionRecord.period_start == start,
                ConsumptionRecord.period_end == end,
            )
        )
        if record is None:
            db.add(
                ConsumptionRecord(
                    appliance_id=appliance.appliance_id,
                    period_start=start,
                    period_end=end,
                    estimated_kwh=money(kwh),
                )
            )
        else:
            record.estimated_kwh = money(kwh)
            record.calculated_at = utc_now()
    db.flush()
    bill = bill_for_period(db, household, start, end)
    if bill is None:
        rate = db.get(ElectricityRate, household.rate_id)
        if rate is None:
            raise HTTPException(
                status_code=409, detail="Choose an electricity provider before calculating a bill."
            )
        db.commit()
        return {
            "bill_id": None,
            "period_start": start,
            "period_end": end,
            "current_kwh": 0,
            "estimated_cost": 0,
            "rate_per_kwh": float(rate.rate_per_kwh),
            "provider_name": rate.provider_name,
            "has_usage": False,
        }

    db.flush()
    rate = db.get(ElectricityRate, bill.rate_id)
    db.commit()
    db.refresh(bill)
    return {
        "bill_id": bill.bill_id,
        "period_start": bill.period_start,
        "period_end": bill.period_end,
        "current_kwh": float(bill.total_kwh or 0),
        "estimated_cost": float(bill.estimated_cost or 0),
        "rate_per_kwh": float(rate.rate_per_kwh),
        "provider_name": rate.provider_name,
        "has_usage": (
            scheduled_total > 0
            if (start, end) == get_period(None, None)
            else Decimal(bill.total_kwh or 0) > 0
        ),
    }


def active_schedules(db: Session, appliance_id: int) -> list[UsageSchedule]:
    return list(
        db.scalars(
            select(UsageSchedule).where(
                UsageSchedule.appliance_id == appliance_id,
                UsageSchedule.is_active.is_(True),
            )
        )
    )


def check_schedule_hours(
    db: Session,
    appliance_id: int,
    days: list[str],
    hours: Decimal,
    exclude_id: int | None = None,
) -> None:
    active = list(
        db.scalars(
            select(UsageSchedule).where(
                UsageSchedule.appliance_id == appliance_id,
                UsageSchedule.is_active.is_(True),
            )
        )
    )
    totals = defaultdict(Decimal)
    for schedule in active:
        if schedule.schedule_id == exclude_id:
            continue
        for day in schedule.days_of_week.split(","):
            totals[day] += Decimal(schedule.hours_per_day)
    for day in days:
        if totals[day] + hours > 24:
            raise HTTPException(
                status_code=422,
                detail=f"{day}: active schedules can't total more than 24 operating hours per day.",
            )


def appliance_daily_energy(
    db: Session, appliances: list[Appliance]
) -> list[tuple[Appliance, Decimal]]:
    return [
        (appliance, projected_kwh(appliance, average_daily_hours(db, appliance.appliance_id), 1))
        for appliance in appliances
    ]


def generate_recommendations(
    db: Session,
    household: Household,
    rate: ElectricityRate,
    appliances: list[Appliance],
) -> None:
    daily = appliance_daily_energy(db, appliances)
    total = sum((kwh for _, kwh in daily), Decimal(0))
    active_appliance_ids = {appliance.appliance_id for appliance in appliances}
    existing_active = list(
        db.scalars(
            select(Recommendation).where(
                Recommendation.household_id == household.household_id,
                Recommendation.is_dismissed.is_(False),
                Recommendation.appliance_id.is_not(None),
            )
        )
    )
    for recommendation in existing_active:
        if recommendation.appliance_id not in active_appliance_ids:
            recommendation.is_dismissed = True
    if total <= 0:
        for recommendation in existing_active:
            recommendation.is_dismissed = True
        return
    for appliance, appliance_daily in daily:
        matches = [
            recommendation
            for recommendation in existing_active
            if recommendation.appliance_id == appliance.appliance_id
            and not recommendation.is_dismissed
        ]
        if appliance_daily <= 0 or appliance_daily / total < Decimal("0.25"):
            for recommendation in matches:
                recommendation.is_dismissed = True
            continue
        message = (
            f"{appliance.appliance_name} accounts for {round(float(appliance_daily / total) * 100)}% "
            "of your currently estimated daily household energy use. Try reducing its active "
            "schedule by one hour to explore a small, low-pressure change."
        )
        active_hours_by_day = defaultdict(Decimal)
        for schedule in active_schedules(db, appliance.appliance_id):
            for day in schedule.days_of_week.split(","):
                active_hours_by_day[day] += Decimal(schedule.hours_per_day)
        saved = (
            Decimal(appliance.wattage)
            * appliance.quantity
            * sum(
                (min(hours, Decimal(1)) for hours in active_hours_by_day.values()),
                Decimal(0),
            )
            * Decimal(30)
            / Decimal(7_000)
        )
        saved_kwh = money(saved)
        dismissed_exists = db.scalar(
            select(Recommendation.recommendation_id).where(
                Recommendation.household_id == household.household_id,
                Recommendation.appliance_id == appliance.appliance_id,
                Recommendation.message == message,
                Recommendation.is_dismissed.is_(True),
            )
        )
        if dismissed_exists:
            continue
        if matches:
            existing = matches[0]
            existing.message = message[:500]
            existing.potential_savings_kwh = saved_kwh
            existing.potential_savings_cost = money(saved_kwh * Decimal(rate.rate_per_kwh))
            continue
        db.add(
            Recommendation(
                household_id=household.household_id,
                appliance_id=appliance.appliance_id,
                message=message[:500],
                potential_savings_kwh=saved_kwh,
                potential_savings_cost=money(saved_kwh * Decimal(rate.rate_per_kwh)),
            )
        )


@router.get("/health")
def health() -> dict[str, str]:
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    return {"status": "ok", "database": "connected"}


@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(body: AccountInput, db: Db) -> dict:
    normalized_email = str(body.email).lower()
    if db.scalar(select(User).where(User.email == normalized_email)):
        raise HTTPException(
            status_code=409, detail="An account with this email already exists. Sign in instead."
        )
    rate = db.scalar(
        select(ElectricityRate).where(ElectricityRate.provider_name == "Set your provider")
    )
    if rate is None:
        rate = ElectricityRate(
            provider_name="Set your provider",
            rate_per_kwh=Decimal(0),
            effective_date=utc_today(),
        )
        db.add(rate)
        db.flush()
    user = User(
        full_name=" ".join(
            part for part in (body.first_name, body.middle_name, body.last_name) if part
        ),
        email=normalized_email,
        password_hash=password_hash.hash(body.password),
        first_name=body.first_name,
        middle_name=body.middle_name or None,
        last_name=body.last_name,
        country=body.country,
        region=body.region,
        city=body.city,
        barangay=body.barangay or None,
        street_address=body.street_address,
        unit_number=body.unit_number or None,
        postal_code=body.postal_code or None,
        phone_number=body.phone_number or None,
        terms_accepted_at=utc_now(),
    )
    db.add(user)
    db.flush()
    db.commit()
    db.refresh(user)
    return {
        "access_token": issue_token(user),
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@router.post("/auth/login")
def login(body: LoginInput, db: Db) -> dict:
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if user is None or not user.password_hash or not password_hash.verify(
        body.password, user.password_hash
    ):
        raise HTTPException(
            status_code=401, detail="That email and password don't match. Please try again."
        )
    return {
        "access_token": issue_token(user),
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@router.get("/auth/me", response_model=UserOutput)
def current_account(user: CurrentUser) -> User:
    return serialize_user(user)


@router.patch("/auth/profile", response_model=UserOutput)
def update_profile(body: ProfileUpdate, db: Db, user: CurrentUser) -> dict:
    values = body.model_dump(exclude={"terms_accepted"})
    optional_fields = {
        "middle_name", "barangay", "unit_number", "postal_code", "phone_number"
    }
    for field, value in values.items():
        if field in optional_fields and not value:
            value = None
        setattr(user, field, value)
    user.full_name = " ".join(
        part for part in (user.first_name, user.middle_name, user.last_name) if part
    ) or None
    if body.terms_accepted:
        user.terms_accepted_at = user.terms_accepted_at or utc_now()
    if not profile_is_complete(user):
        raise HTTPException(
            status_code=422,
            detail="Add your name, home location, street address, and accept the policies to continue.",
        )
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.get("/auth/providers")
def connected_providers(db: Db, user: CurrentUser) -> dict[str, object]:
    providers = db.scalars(
        select(OAuthIdentity.provider).where(OAuthIdentity.user_id == user.user_id)
    )
    return {
        "providers": sorted(set(providers)),
        "password_enabled": bool(user.password_hash),
    }


@router.post("/auth/oauth/{provider}/start")
def oauth_start(provider: str, db: Db, native_app: bool = False) -> dict[str, str]:
    return start_oauth(provider, db, native_app=native_app)


@router.post("/auth/oauth/google/native/start")
def native_google_start(db: Db) -> dict[str, str]:
    return start_native_google(db)


@router.post("/auth/oauth/google/native/complete")
def native_google_complete(body: NativeGoogleSignInInput, db: Db) -> dict:
    return complete_native_google(body, db)


@router.post("/auth/providers/{provider}/start")
def oauth_link_start(
    provider: str,
    db: Db,
    user: CurrentUser,
    native_app: bool = False,
) -> dict[str, str]:
    return start_oauth(provider, db, user.user_id, native_app=native_app)


@router.post("/auth/providers/google/native/start")
def native_google_link_start(db: Db, user: CurrentUser) -> dict[str, str]:
    return start_native_google(db, user.user_id)


@router.post("/auth/providers/google/native/complete")
def native_google_link_complete(
    body: NativeGoogleSignInInput,
    db: Db,
    user: CurrentUser,
) -> dict[str, str]:
    complete_native_google(body, db, user=user)
    return {"message": "Google account connected."}


@router.get("/auth/oauth/{provider}/callback", name="oauth_callback")
def oauth_callback(
    provider: str,
    db: Db,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if provider not in {"google", "github"}:
        return oauth_redirect(error="unsupported_provider")
    if error:
        native_app = False
        if state:
            try:
                claims = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
                native_app = (
                    claims.get("typ") == "oauth_state"
                    and claims.get("provider") == provider
                    and claims.get("native_app") is True
                )
            except InvalidTokenError:
                pass
        return oauth_redirect(error="sign_in_cancelled", native_app=native_app)
    if not code or not state:
        return oauth_redirect(error="invalid_callback")
    try:
        claims = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
        if claims.get("typ") != "oauth_state" or claims.get("provider") != provider:
            raise InvalidTokenError("Invalid OAuth state")
    except InvalidTokenError:
        return oauth_redirect(error="invalid_state")
    native_app = claims.get("native_app") is True

    def redirect(**kwargs):
        return oauth_redirect(native_app=native_app, **kwargs)

    state_record = db.get(OAuthState, claims.get("jti"))
    if (
        state_record is None
        or state_record.provider != provider
        or state_record.consumed_at is not None
        or state_record.expires_at <= utc_now()
    ):
        return redirect(error="expired_state")
    state_record.consumed_at = utc_now()
    db.commit()

    try:
        subject, email, full_name, first_name, last_name = fetch_oauth_identity(provider, code)
        email = str(TypeAdapter(EmailStr).validate_python(email)).lower()
        if len(email) > 150 or not subject or len(subject) > 255:
            raise ValueError("The provider account details are not valid.")
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return redirect(error="provider_failure")

    try:
        user = complete_oauth_identity(
            db,
            provider,
            subject,
            email,
            full_name,
            first_name,
            last_name,
            state_record.user_id,
        )
    except OAuthIdentityError as exception:
        return redirect(error=exception.error_code)
    return redirect(
        token=issue_token(user),
        profile_complete=profile_is_complete(user),
    )


@router.post("/auth/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(body: PasswordResetRequest, db: Db) -> dict[str, str]:
    if not all((settings.smtp_host, settings.smtp_from_email)):
        raise HTTPException(
            status_code=503,
            detail="Password reset email is not configured on the Energeia API.",
        )
    email = str(body.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        return {"message": "If the account exists, password reset instructions will be sent."}
    recent = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.user_id,
            PasswordResetToken.created_at >= utc_now() - timedelta(minutes=15),
        )
    )
    if recent:
        return {"message": "If the account exists, password reset instructions will be sent."}

    raw_token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.user_id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=utc_now() + timedelta(minutes=30),
        )
    )
    try:
        send_password_reset_email(user.email, raw_token)
        db.commit()
    except (smtplib.SMTPException, OSError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="We could not send the reset email. Try again later.",
        ) from None
    return {"message": "If the account exists, password reset instructions will be sent."}


@router.post("/auth/password-reset/complete")
def complete_password_reset(body: PasswordResetComplete, db: Db) -> dict[str, str]:
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    reset_token = db.scalar(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash)
        .with_for_update()
    )
    if (
        reset_token is None
        or reset_token.used_at is not None
        or reset_token.expires_at <= utc_now()
    ):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    user = db.get(User, reset_token.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    user.password_hash = password_hash.hash(body.password)
    user.auth_version += 1
    for active_token in db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.user_id,
            PasswordResetToken.used_at.is_(None),
        )
    ):
        active_token.used_at = utc_now()
    db.commit()
    return {"message": "Your password has been updated. Sign in with your new password."}


@router.post("/auth/password/change")
def change_password(body: PasswordChangeInput, db: Db, user: CurrentUser) -> dict[str, str]:
    if not user.password_hash or not password_hash.verify(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Your current password is incorrect.")
    user.password_hash = password_hash.hash(body.password)
    user.auth_version += 1
    db.commit()
    return {"message": "Your password has been updated."}


@router.get("/rates")
def list_rates(db: Db, user: CurrentUser) -> list[dict]:
    rates = db.scalars(
        select(ElectricityRate).order_by(
            ElectricityRate.provider_name, ElectricityRate.effective_date.desc()
        )
    )
    return [
        {
            "rate_id": rate.rate_id,
            "provider_name": rate.provider_name,
            "rate_per_kwh": float(rate.rate_per_kwh),
            "effective_date": rate.effective_date,
        }
        for rate in rates
    ]


@router.get("/households", response_model=list[HouseholdOutput])
def list_households(db: Db, user: CurrentUser) -> list[Household]:
    return list(
        db.scalars(
            select(Household)
            .where(Household.user_id == user.user_id)
            .order_by(Household.household_id)
        )
    )


@router.post("/households", response_model=HouseholdOutput, status_code=status.HTTP_201_CREATED)
def create_household(body: HouseholdInput, db: Db, user: CurrentUser) -> Household:
    rate = db.scalar(
        select(ElectricityRate)
        .where(ElectricityRate.provider_name == "Set your provider")
        .order_by(ElectricityRate.rate_id)
    )
    if rate is None:
        rate = ElectricityRate(
            provider_name="Set your provider",
            rate_per_kwh=Decimal(0),
            effective_date=utc_today(),
        )
        db.add(rate)
        db.flush()
    household = Household(
        user_id=user.user_id,
        household_name=body.household_name,
        address=body.address.strip() if body.address and body.address.strip() else None,
        rate_id=rate.rate_id,
    )
    db.add(household)
    db.commit()
    db.refresh(household)
    return household


@router.patch("/households/{household_id}", response_model=HouseholdOutput)
def update_household(
    household_id: int, body: HouseholdInput, db: Db, user: CurrentUser
) -> Household:
    household = get_household(db, household_id, user)
    household.household_name = body.household_name
    household.address = body.address.strip() if body.address and body.address.strip() else None
    db.commit()
    db.refresh(household)
    return household


@router.patch("/households/{household_id}/rate")
def update_household_rate(household_id: int, body: RateInput, db: Db, user: CurrentUser) -> dict:
    household = get_household(db, household_id, user)
    rate = ElectricityRate(
        provider_name=body.provider_name,
        rate_per_kwh=body.rate_per_kwh,
        effective_date=utc_today(),
    )
    db.add(rate)
    db.flush()
    household.rate_id = rate.rate_id
    db.commit()
    return {
        "rate_id": rate.rate_id,
        "provider_name": rate.provider_name,
        "rate_per_kwh": float(rate.rate_per_kwh),
        "effective_date": rate.effective_date,
    }


@router.get("/households/{household_id}/appliances", response_model=list[ApplianceOutput])
def list_appliances(household_id: int, db: Db, user: CurrentUser) -> list[dict]:
    get_household(db, household_id, user)
    appliances = db.scalars(
        select(Appliance)
        .where(
            Appliance.household_id == household_id,
            Appliance.is_active.is_(True),
        )
        .order_by(Appliance.appliance_id)
    )
    return [
        {
            **{
                name: getattr(appliance, name)
                for name in (
                    "appliance_id",
                    "household_id",
                    "appliance_name",
                    "category",
                    "wattage",
                    "quantity",
                    "is_active",
                )
            },
            "average_hours_per_day": float(average_daily_hours(db, appliance.appliance_id)),
        }
        for appliance in appliances
    ]


@router.post(
    "/households/{household_id}/appliances",
    response_model=ApplianceOutput,
    status_code=status.HTTP_201_CREATED,
)
def create_appliance(household_id: int, body: ApplianceInput, db: Db, user: CurrentUser) -> dict:
    get_household(db, household_id, user)
    appliance = Appliance(
        household_id=household_id,
        appliance_name=body.appliance_name,
        category=body.category,
        wattage=body.wattage,
        quantity=body.quantity,
    )
    db.add(appliance)
    db.commit()
    db.refresh(appliance)
    return {
        **body.model_dump(),
        "appliance_id": appliance.appliance_id,
        "household_id": household_id,
        "is_active": True,
        "average_hours_per_day": 0,
    }


@router.patch("/appliances/{appliance_id}", response_model=ApplianceOutput)
def update_appliance(appliance_id: int, body: ApplianceUpdate, db: Db, user: CurrentUser) -> dict:
    appliance = get_appliance(db, appliance_id, user)
    data = body.model_dump(exclude_unset=True)
    if data.get("appliance_name"):
        data["appliance_name"] = data["appliance_name"].strip()
        if not data["appliance_name"]:
            raise HTTPException(status_code=422, detail="An appliance name is required.")
    for name, value in data.items():
        setattr(appliance, name, value)
    db.commit()
    db.refresh(appliance)
    return {
        **{
            name: getattr(appliance, name)
            for name in (
                "appliance_id",
                "household_id",
                "appliance_name",
                "category",
                "wattage",
                "quantity",
                "is_active",
            )
        },
        "average_hours_per_day": float(average_daily_hours(db, appliance_id)),
    }


@router.delete("/appliances/{appliance_id}")
def delete_appliance(appliance_id: int, db: Db, user: CurrentUser) -> dict:
    appliance = get_appliance(db, appliance_id, user)
    history = db.scalar(
        select(ConsumptionRecord.record_id)
        .where(ConsumptionRecord.appliance_id == appliance_id)
        .limit(1)
    )
    if history is not None:
        appliance.is_active = False
        db.commit()
        return {
            "archived": True,
            "message": (
                "This appliance has saved billing-period history. It has been archived to preserve "
                "those records and can no longer be edited. Historical consumption is never deleted."
            ),
        }
    db.delete(appliance)
    db.commit()
    return {"archived": False, "message": "The appliance was removed."}


@router.get("/appliances/{appliance_id}/schedules")
def list_schedules(appliance_id: int, db: Db, user: CurrentUser) -> list[dict]:
    get_appliance(db, appliance_id, user)
    schedules = db.scalars(
        select(UsageSchedule)
        .where(UsageSchedule.appliance_id == appliance_id)
        .order_by(UsageSchedule.schedule_id)
    )
    return [
        {
            "schedule_id": schedule.schedule_id,
            "appliance_id": schedule.appliance_id,
            "days_of_week": schedule.days_of_week.split(","),
            "hours_per_day": float(schedule.hours_per_day),
            "start_time": schedule.start_time,
            "is_active": schedule.is_active,
        }
        for schedule in schedules
    ]


@router.post("/appliances/{appliance_id}/schedules", status_code=status.HTTP_201_CREATED)
def create_schedule(appliance_id: int, body: ScheduleInput, db: Db, user: CurrentUser) -> dict:
    get_appliance(db, appliance_id, user)
    if body.is_active:
        check_schedule_hours(db, appliance_id, body.days_of_week, body.hours_per_day)
    schedule = UsageSchedule(
        appliance_id=appliance_id,
        days_of_week=",".join(body.days_of_week),
        hours_per_day=body.hours_per_day,
        start_time=body.start_time,
        is_active=body.is_active,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return {
        "schedule_id": schedule.schedule_id,
        "appliance_id": schedule.appliance_id,
        "days_of_week": body.days_of_week,
        "hours_per_day": float(schedule.hours_per_day),
        "start_time": schedule.start_time,
        "is_active": schedule.is_active,
    }


@router.patch("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, body: ScheduleUpdate, db: Db, user: CurrentUser) -> dict:
    schedule = db.scalar(
        select(UsageSchedule)
        .join(Appliance, Appliance.appliance_id == UsageSchedule.appliance_id)
        .join(Household, Household.household_id == Appliance.household_id)
        .where(
            UsageSchedule.schedule_id == schedule_id,
            Household.user_id == user.user_id,
            Appliance.is_active.is_(True),
        )
    )
    if schedule is None:
        raise HTTPException(status_code=404, detail="We couldn't find that usage schedule.")
    data = body.model_dump(exclude_unset=True)
    days = data.pop("days_of_week", schedule.days_of_week.split(","))
    hours = data.get("hours_per_day", schedule.hours_per_day)
    activating = data.get("is_active", schedule.is_active)
    if activating:
        check_schedule_hours(db, schedule.appliance_id, days, hours, exclude_id=schedule_id)
    if "start_time" in data and data["start_time"] is None:
        schedule.start_time = None
    for name, value in data.items():
        if name != "start_time" or value is not None:
            setattr(schedule, name, value)
    schedule.days_of_week = ",".join(days)
    db.commit()
    db.refresh(schedule)
    return {
        "schedule_id": schedule.schedule_id,
        "appliance_id": schedule.appliance_id,
        "days_of_week": schedule.days_of_week.split(","),
        "hours_per_day": float(schedule.hours_per_day),
        "start_time": schedule.start_time,
        "is_active": schedule.is_active,
    }


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(schedule_id: int, db: Db, user: CurrentUser) -> Response:
    schedule = db.scalar(
        select(UsageSchedule)
        .join(Appliance, Appliance.appliance_id == UsageSchedule.appliance_id)
        .join(Household, Household.household_id == Appliance.household_id)
        .where(
            UsageSchedule.schedule_id == schedule_id,
            Household.user_id == user.user_id,
            Appliance.is_active.is_(True),
        )
    )
    if schedule is None:
        raise HTTPException(status_code=404, detail="We couldn't find that usage schedule.")
    db.delete(schedule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/households/{household_id}/calculate")
def calculate_household(household_id: int, body: PeriodInput, db: Db, user: CurrentUser) -> dict:
    household = get_household(db, household_id, user)
    start, end = get_period(body.period_start, body.period_end)
    return calculate_period(db, household, start, end)


@router.get("/households/{household_id}/dashboard")
def household_dashboard(
    household_id: int,
    db: Db,
    user: CurrentUser,
    _household_id: int | None = Query(default=None, alias="household_id"),
) -> dict:
    household = get_household(db, household_id, user)
    start, end = get_period(None, None)
    previous_month_end = start - timedelta(days=1)
    previous_start = previous_month_end.replace(day=1)
    current_total = stored_total_for_period(db, household, start, end)
    previous_total = stored_total_for_period(db, household, previous_start, previous_month_end)
    rate = db.get(ElectricityRate, household.rate_id)
    rate_value = Decimal(rate.rate_per_kwh)
    appliances = list(
        db.scalars(
            select(Appliance).where(
                Appliance.household_id == household_id, Appliance.is_active.is_(True)
            )
        )
    )
    period_days = (end - start).days + 1
    tops = []
    active_total = Decimal(0)
    daily_kwh_by_weekday = [Decimal(0)] * 7
    for appliance in appliances:
        daily_hours = average_daily_hours(db, appliance.appliance_id)
        estimate = projected_kwh(appliance, daily_hours, period_days)
        active_total += money(estimate)
        tops.append(
            {
                "appliance_id": appliance.appliance_id,
                "appliance_name": appliance.appliance_name,
                "category": appliance.category,
                "quantity": appliance.quantity,
                "current_kwh": float(money(estimate)),
                "average_hours_per_day": float(daily_hours),
            }
        )
        for schedule in active_schedules(db, appliance.appliance_id):
            schedule_kwh = (
                Decimal(appliance.wattage)
                * appliance.quantity
                * Decimal(schedule.hours_per_day)
                / Decimal(1000)
            )
            for day in schedule.days_of_week.split(","):
                weekday_index = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun").index(day)
                daily_kwh_by_weekday[weekday_index] += schedule_kwh
    tops.sort(key=lambda item: item["current_kwh"], reverse=True)
    bill = db.scalar(
        select(BillingRecord).where(
            BillingRecord.household_id == household_id,
            BillingRecord.period_start == start,
            BillingRecord.period_end == end,
        )
    )
    generate_recommendations(db, household, rate, appliances)
    db.commit()
    return {
        "period_start": start,
        "period_end": end,
        "current_kwh": float(money(current_total)),
        "previous_kwh": float(money(previous_total)),
        "estimated_cost": float(money(current_total * rate_value)),
        "actual_bill_amount": float(bill.actual_bill_amount)
        if bill and bill.actual_bill_amount is not None
        else None,
        "rate_per_kwh": float(rate_value),
        "provider_name": rate.provider_name,
        "has_rate": rate_value > 0,
        "has_usage": active_total > 0,
        "appliance_count": len(appliances),
        "top_appliances": tops[:5],
        "weekly": [
            {
                "day": day,
                "kwh": float(money(kwh)),
                "highlight": kwh > sum(daily_kwh_by_weekday, Decimal(0)) / 7,
            }
            for day, kwh in zip(
                ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"), daily_kwh_by_weekday
            )
        ],
    }


@router.get("/households/{household_id}/bills")
def list_bills(household_id: int, db: Db, user: CurrentUser) -> list[dict]:
    get_household(db, household_id, user)
    rows = db.execute(
        select(BillingRecord, ElectricityRate)
        .join(ElectricityRate, ElectricityRate.rate_id == BillingRecord.rate_id)
        .where(BillingRecord.household_id == household_id)
        .where(
            or_(
                BillingRecord.total_kwh > 0,
                BillingRecord.actual_bill_amount.is_not(None),
            )
        )
        .order_by(BillingRecord.period_start.desc())
    )
    return [
        {
            "bill_id": bill.bill_id,
            "period_start": bill.period_start,
            "period_end": bill.period_end,
            "total_kwh": float(bill.total_kwh or 0),
            "estimated_cost": float(bill.estimated_cost or 0),
            "actual_bill_amount": float(bill.actual_bill_amount)
            if bill.actual_bill_amount is not None
            else None,
            "provider_name": rate.provider_name,
            "rate_per_kwh": float(rate.rate_per_kwh),
        }
        for bill, rate in rows
    ]


@router.patch("/households/{household_id}/bills/{bill_id}/actual")
def add_actual_bill(
    household_id: int,
    bill_id: int,
    body: ActualBillInput,
    db: Db,
    user: CurrentUser,
) -> dict:
    get_household(db, household_id, user)
    bill = db.scalar(
        select(BillingRecord).where(
            BillingRecord.bill_id == bill_id,
            BillingRecord.household_id == household_id,
        )
    )
    if bill is None:
        raise HTTPException(status_code=404, detail="We couldn't find that billing period.")
    bill.actual_bill_amount = body.actual_bill_amount
    db.commit()
    return {"bill_id": bill.bill_id, "actual_bill_amount": float(bill.actual_bill_amount)}


@router.get("/households/{household_id}/recommendations")
def list_recommendations(household_id: int, db: Db, user: CurrentUser) -> list[dict]:
    household = get_household(db, household_id, user)
    rate = db.get(ElectricityRate, household.rate_id)
    appliances = list(
        db.scalars(
            select(Appliance).where(
                Appliance.household_id == household_id,
                Appliance.is_active.is_(True),
            )
        )
    )
    generate_recommendations(db, household, rate, appliances)
    db.commit()
    rows = db.execute(
        select(Recommendation, Appliance.appliance_name)
        .outerjoin(Appliance, Appliance.appliance_id == Recommendation.appliance_id)
        .where(
            Recommendation.household_id == household_id,
            Recommendation.is_dismissed.is_(False),
        )
        .order_by(Recommendation.generated_at.desc())
    )
    return [
        {
            "recommendation_id": recommendation.recommendation_id,
            "appliance_id": recommendation.appliance_id,
            "appliance_name": appliance_name,
            "message": recommendation.message,
            "potential_savings_kwh": float(recommendation.potential_savings_kwh or 0),
            "potential_savings_cost": float(recommendation.potential_savings_cost or 0),
            "generated_at": recommendation.generated_at,
            "is_dismissed": recommendation.is_dismissed,
        }
        for recommendation, appliance_name in rows
    ]


@router.patch("/recommendations/{recommendation_id}")
def update_recommendation(
    recommendation_id: int,
    body: RecommendationUpdate,
    db: Db,
    user: CurrentUser,
) -> dict:
    recommendation = db.scalar(
        select(Recommendation)
        .join(Household, Household.household_id == Recommendation.household_id)
        .where(
            Recommendation.recommendation_id == recommendation_id,
            Household.user_id == user.user_id,
        )
    )
    if recommendation is None:
        raise HTTPException(status_code=404, detail="We couldn't find that recommendation.")
    recommendation.is_dismissed = body.is_dismissed
    db.commit()
    return {
        "recommendation_id": recommendation.recommendation_id,
        "is_dismissed": recommendation.is_dismissed,
    }


def ensure_scenario_items(
    db: Session,
    household: Household,
    items: list[ScenarioItemInput],
) -> dict[int, ScenarioItemInput]:
    overrides: dict[int, ScenarioItemInput] = {}
    for item in items:
        if item.appliance_id in overrides:
            raise HTTPException(
                status_code=422, detail="Each appliance can only appear once in a scenario."
            )
        appliance = db.scalar(
            select(Appliance).where(
                Appliance.appliance_id == item.appliance_id,
                Appliance.household_id == household.household_id,
                Appliance.is_active.is_(True),
            )
        )
        if appliance is None:
            raise HTTPException(
                status_code=422, detail="Every scenario appliance must belong to this household."
            )
        overrides[item.appliance_id] = item
    return overrides


def scenario_totals(
    db: Session,
    household: Household,
    overrides: dict[int, ScenarioItemInput],
) -> dict:
    appliances = list(
        db.scalars(
            select(Appliance).where(
                Appliance.household_id == household.household_id,
                Appliance.is_active.is_(True),
            )
        )
    )
    start, end = get_period(None, None)
    period_days = (end - start).days + 1
    current = Decimal(0)
    projected = Decimal(0)
    for appliance in appliances:
        hours = average_daily_hours(db, appliance.appliance_id)
        override = overrides.get(appliance.appliance_id)
        current += projected_kwh(appliance, hours, period_days)
        projected += projected_kwh(
            appliance,
            override.adjusted_hours_per_day
            if override and override.adjusted_hours_per_day is not None
            else hours,
            period_days,
            override.adjusted_quantity
            if override and override.adjusted_quantity is not None
            else appliance.quantity,
        )
    rate = db.get(ElectricityRate, household.rate_id)
    rate_value = Decimal(rate.rate_per_kwh)
    current_cost = money(current * rate_value)
    scenario_cost = money(projected * rate_value)
    return {
        "current_kwh": float(money(current)),
        "scenario_kwh": float(money(projected)),
        "current_cost": float(current_cost),
        "scenario_cost": float(scenario_cost),
        "savings_kwh": float(money(current - projected)),
        "savings_cost": float(money(current_cost - scenario_cost)),
    }


@router.post("/households/{household_id}/scenarios/preview")
def preview_scenario(
    household_id: int,
    body: ScenarioPreviewInput,
    db: Db,
    user: CurrentUser,
) -> dict:
    household = get_household(db, household_id, user)
    overrides = ensure_scenario_items(db, household, body.items)
    return scenario_totals(db, household, overrides)


@router.get("/households/{household_id}/scenarios")
def list_scenarios(household_id: int, db: Db, user: CurrentUser) -> list[dict]:
    household = get_household(db, household_id, user)
    scenarios = list(
        db.scalars(
            select(WhatIfScenario)
            .where(WhatIfScenario.household_id == household.household_id)
            .order_by(WhatIfScenario.created_at.desc())
        )
    )
    result = []
    for scenario in scenarios:
        saved_items = list(
            db.scalars(
                select(ScenarioAppliance).where(
                    ScenarioAppliance.scenario_id == scenario.scenario_id
                )
            )
        )
        saved = {
            item.appliance_id: ScenarioItemInput(
                appliance_id=item.appliance_id,
                adjusted_hours_per_day=item.adjusted_hours_per_day,
                adjusted_quantity=item.adjusted_quantity,
            )
            for item in saved_items
        }
        appliance_names = (
            {
                appliance.appliance_id: appliance.appliance_name
                for appliance in db.scalars(
                    select(Appliance).where(
                        Appliance.appliance_id.in_([item.appliance_id for item in saved_items])
                    )
                )
            }
            if saved_items
            else {}
        )
        result.append(
            {
                "scenario_id": scenario.scenario_id,
                "household_id": scenario.household_id,
                "scenario_name": scenario.scenario_name,
                "created_at": scenario.created_at,
                "items": [
                    {
                        "appliance_id": item.appliance_id,
                        "appliance_name": appliance_names.get(
                            item.appliance_id, "Archived appliance"
                        ),
                        "adjusted_hours_per_day": float(item.adjusted_hours_per_day)
                        if item.adjusted_hours_per_day is not None
                        else None,
                        "adjusted_quantity": item.adjusted_quantity,
                    }
                    for item in saved_items
                ],
                **scenario_totals(db, household, saved),
            }
        )
    return result


@router.post("/households/{household_id}/scenarios", status_code=status.HTTP_201_CREATED)
def create_scenario(
    household_id: int,
    body: ScenarioInput,
    db: Db,
    user: CurrentUser,
) -> dict:
    household = get_household(db, household_id, user)
    overrides = ensure_scenario_items(db, household, body.items)
    scenario = WhatIfScenario(
        household_id=household.household_id,
        scenario_name=body.scenario_name,
    )
    db.add(scenario)
    db.flush()
    for appliance_id, override in overrides.items():
        db.add(
            ScenarioAppliance(
                scenario_id=scenario.scenario_id,
                appliance_id=appliance_id,
                adjusted_hours_per_day=override.adjusted_hours_per_day,
                adjusted_quantity=override.adjusted_quantity,
            )
        )
    db.commit()
    db.refresh(scenario)
    appliances = list(
        db.scalars(
            select(Appliance).where(
                Appliance.household_id == household.household_id,
                Appliance.is_active.is_(True),
            )
        )
    )
    details = [
        {
            "appliance_id": appliance.appliance_id,
            "appliance_name": appliance.appliance_name,
            "adjusted_hours_per_day": float(
                overrides[appliance.appliance_id].adjusted_hours_per_day
            )
            if overrides[appliance.appliance_id].adjusted_hours_per_day is not None
            else None,
            "adjusted_quantity": overrides[appliance.appliance_id].adjusted_quantity,
        }
        for appliance in appliances
        if appliance.appliance_id in overrides
    ]
    return {
        "scenario_id": scenario.scenario_id,
        "household_id": scenario.household_id,
        "scenario_name": scenario.scenario_name,
        "created_at": scenario.created_at,
        "items": details,
        **scenario_totals(db, household, overrides),
    }


@router.get("/households/{household_id}/scenarios/{scenario_id}")
def get_scenario(
    household_id: int,
    scenario_id: int,
    db: Db,
    user: CurrentUser,
) -> dict:
    household = get_household(db, household_id, user)
    scenario = db.scalar(
        select(WhatIfScenario).where(
            WhatIfScenario.scenario_id == scenario_id,
            WhatIfScenario.household_id == household.household_id,
        )
    )
    if scenario is None:
        raise HTTPException(status_code=404, detail="We couldn't find that what-if plan.")
    saved_items = list(
        db.scalars(
            select(ScenarioAppliance).where(ScenarioAppliance.scenario_id == scenario.scenario_id)
        )
    )
    overrides = {
        item.appliance_id: ScenarioItemInput(
            appliance_id=item.appliance_id,
            adjusted_hours_per_day=item.adjusted_hours_per_day,
            adjusted_quantity=item.adjusted_quantity,
        )
        for item in saved_items
    }
    appliance_names = (
        {
            appliance.appliance_id: appliance.appliance_name
            for appliance in db.scalars(
                select(Appliance).where(
                    Appliance.appliance_id.in_([item.appliance_id for item in saved_items])
                )
            )
        }
        if saved_items
        else {}
    )
    return {
        "scenario_id": scenario.scenario_id,
        "household_id": scenario.household_id,
        "scenario_name": scenario.scenario_name,
        "created_at": scenario.created_at,
        "items": [
            {
                "appliance_id": item.appliance_id,
                "appliance_name": appliance_names.get(item.appliance_id, "Archived appliance"),
                "adjusted_hours_per_day": float(item.adjusted_hours_per_day)
                if item.adjusted_hours_per_day is not None
                else None,
                "adjusted_quantity": item.adjusted_quantity,
            }
            for item in saved_items
        ],
        **scenario_totals(db, household, overrides),
    }


@router.delete(
    "/households/{household_id}/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_scenario(
    household_id: int,
    scenario_id: int,
    db: Db,
    user: CurrentUser,
) -> Response:
    household = get_household(db, household_id, user)
    scenario = db.scalar(
        select(WhatIfScenario).where(
            WhatIfScenario.scenario_id == scenario_id,
            WhatIfScenario.household_id == household.household_id,
        )
    )
    if scenario is None:
        raise HTTPException(status_code=404, detail="We couldn't find that what-if plan.")
    db.delete(scenario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


app = FastAPI(
    title="Energeia API",
    description="Personal, historical, rule-based household electricity estimates.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router)
