from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from collections.abc import Generator
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
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
    create_engine,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:@127.0.0.1:3306/energeia_db?charset=utf8mb4"
    jwt_secret: str = "development-only-change-before-deploying"
    jwt_expire_minutes: int = Field(default=1440, ge=1, le=10080)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
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
    full_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")


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
        if not isinstance(user_id, str) or not user_id.isdigit():
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
    return user


CurrentUser = Annotated[User, Depends(get_user)]


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    full_name: str
    email: EmailStr


class AccountInput(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Your name is required.")
        return value


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


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
        {"sub": str(user.user_id), "exp": expires},
        settings.jwt_secret,
        algorithm="HS256",
    )


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


def bill_for_period(db: Session, household: Household, start: date, end: date) -> BillingRecord:
    total = stored_total_for_period(db, household, start, end)
    bill = db.scalar(
        select(BillingRecord).where(
            BillingRecord.household_id == household.household_id,
            BillingRecord.period_start == start,
            BillingRecord.period_end == end,
        )
    )
    # A saved billing period keeps the provider and tariff it originally captured.
    rate_id = bill.rate_id if bill is not None else household.rate_id
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
        full_name=body.full_name,
        email=normalized_email,
        password_hash=password_hash.hash(body.password),
    )
    db.add(user)
    db.flush()
    db.commit()
    db.refresh(user)
    return {
        "access_token": issue_token(user),
        "token_type": "bearer",
        "user": UserOutput.model_validate(user).model_dump(mode="json"),
    }


@router.post("/auth/login")
def login(body: LoginInput, db: Db) -> dict:
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if user is None or not password_hash.verify(body.password, user.password_hash):
        raise HTTPException(
            status_code=401, detail="That email and password don't match. Please try again."
        )
    return {
        "access_token": issue_token(user),
        "token_type": "bearer",
        "user": UserOutput.model_validate(user).model_dump(mode="json"),
    }


@router.get("/auth/me", response_model=UserOutput)
def current_account(user: CurrentUser) -> User:
    return user


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
    daily_kwh_by_weekday = [Decimal(0)] * 7
    for appliance in appliances:
        daily_hours = average_daily_hours(db, appliance.appliance_id)
        estimate = projected_kwh(appliance, daily_hours, period_days)
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
