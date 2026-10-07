from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import (
    Base,
    BillingRecord,
    ConsumptionRecord,
    ElectricityRate,
    app,
    get_db,
    utc_today,
)


@pytest.fixture()
def client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(test_engine, "connect")
    def enforce_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(test_engine)
    test_sessions = sessionmaker(bind=test_engine, expire_on_commit=False)

    def override_get_db():
        with test_sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, test_sessions
    app.dependency_overrides.clear()
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


def create_account(client: TestClient, email: str, name: str = "Alex Test") -> str:
    response = client.post(
        "/api/auth/register",
        json={"full_name": name, "email": email, "password": "correct horse battery"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def register_and_create_home(client: TestClient) -> tuple[dict, dict]:
    token = create_account(client, "alex@example.com")
    client.headers["Authorization"] = f"Bearer {token}"
    home_response = client.post(
        "/api/households",
        json={"household_name": "A Little Test Home", "address": "Makati"},
    )
    assert home_response.status_code == 201, home_response.text
    household = home_response.json()
    rate_response = client.patch(
        f"/api/households/{household['household_id']}/rate",
        json={"provider_name": "Sample Electricity", "rate_per_kwh": "12.5000"},
    )
    assert rate_response.status_code == 200, rate_response.text
    return household, rate_response.json()


def test_empty_or_inactive_household_usage_does_not_create_bill(client):
    test_client, _ = client
    household, _ = register_and_create_home(test_client)
    household_id = household["household_id"]

    empty_calculation = test_client.post(
        f"/api/households/{household_id}/calculate", json={}
    )
    assert empty_calculation.status_code == 200, empty_calculation.text
    assert empty_calculation.json()["has_usage"] is False
    assert empty_calculation.json()["current_kwh"] == 0
    assert empty_calculation.json()["estimated_cost"] == 0
    assert empty_calculation.json()["bill_id"] is None
    assert test_client.get(f"/api/households/{household_id}/bills").json() == []

    appliance_response = test_client.post(
        f"/api/households/{household_id}/appliances",
        json={"appliance_name": "Fan", "category": "Cooling", "wattage": 100, "quantity": 1},
    )
    assert appliance_response.status_code == 201, appliance_response.text
    appliance_id = appliance_response.json()["appliance_id"]
    schedule_response = test_client.post(
        f"/api/appliances/{appliance_id}/schedules",
        json={
            "days_of_week": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "hours_per_day": 1,
            "is_active": False,
        },
    )
    assert schedule_response.status_code == 201, schedule_response.text

    inactive_calculation = test_client.post(
        f"/api/households/{household_id}/calculate", json={}
    )
    assert inactive_calculation.status_code == 200, inactive_calculation.text
    assert inactive_calculation.json()["has_usage"] is False
    assert inactive_calculation.json()["bill_id"] is None
    assert test_client.get(f"/api/households/{household_id}/bills").json() == []

    dashboard = test_client.get(f"/api/households/{household_id}/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["has_usage"] is False


def test_setting_rate_updates_period_saved_with_placeholder_rate(client):
    test_client, _ = client
    token = create_account(test_client, "new-home@example.com")
    test_client.headers["Authorization"] = f"Bearer {token}"
    household_response = test_client.post(
        "/api/households",
        json={"household_name": "New Home"},
    )
    assert household_response.status_code == 201, household_response.text
    household_id = household_response.json()["household_id"]

    appliance_response = test_client.post(
        f"/api/households/{household_id}/appliances",
        json={"appliance_name": "Fan", "category": "Cooling", "wattage": 1000, "quantity": 1},
    )
    assert appliance_response.status_code == 201, appliance_response.text
    appliance_id = appliance_response.json()["appliance_id"]
    schedule_response = test_client.post(
        f"/api/appliances/{appliance_id}/schedules",
        json={
            "days_of_week": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "hours_per_day": 1,
        },
    )
    assert schedule_response.status_code == 201, schedule_response.text

    period = {"period_start": "2026-10-01", "period_end": "2026-10-31"}
    initial_calculation = test_client.post(
        f"/api/households/{household_id}/calculate", json=period
    )
    assert initial_calculation.status_code == 200, initial_calculation.text
    assert initial_calculation.json()["estimated_cost"] == 0
    assert initial_calculation.json()["provider_name"] == "Set your provider"

    rate_response = test_client.patch(
        f"/api/households/{household_id}/rate",
        json={"provider_name": "Sample Electricity", "rate_per_kwh": "12.5000"},
    )
    assert rate_response.status_code == 200, rate_response.text

    updated_calculation = test_client.post(
        f"/api/households/{household_id}/calculate", json=period
    )
    assert updated_calculation.status_code == 200, updated_calculation.text
    assert updated_calculation.json()["current_kwh"] == 31
    assert updated_calculation.json()["estimated_cost"] == 387.5
    assert updated_calculation.json()["provider_name"] == "Sample Electricity"

    saved_bill = test_client.get(f"/api/households/{household_id}/bills").json()[0]
    assert saved_bill["provider_name"] == "Sample Electricity"
    assert saved_bill["rate_per_kwh"] == 12.5
    assert saved_bill["estimated_cost"] == 387.5


def test_changing_provider_rate_updates_current_estimate_but_keeps_history(client):
    test_client, _ = client
    household, _ = register_and_create_home(test_client)
    household_id = household["household_id"]
    appliance_response = test_client.post(
        f"/api/households/{household_id}/appliances",
        json={"appliance_name": "Fan", "category": "Cooling", "wattage": 1000, "quantity": 1},
    )
    assert appliance_response.status_code == 201, appliance_response.text
    appliance_id = appliance_response.json()["appliance_id"]
    schedule_response = test_client.post(
        f"/api/appliances/{appliance_id}/schedules",
        json={
            "days_of_week": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "hours_per_day": 1,
        },
    )
    assert schedule_response.status_code == 201, schedule_response.text

    last_month_end = utc_today().replace(day=1) - timedelta(days=1)
    historical_period = {
        "period_start": last_month_end.replace(day=1).isoformat(),
        "period_end": last_month_end.isoformat(),
    }
    historical_bill = test_client.post(
        f"/api/households/{household_id}/calculate", json=historical_period
    )
    assert historical_bill.status_code == 200, historical_bill.text
    assert historical_bill.json()["rate_per_kwh"] == 12.5
    historical_estimate = historical_bill.json()["estimated_cost"]

    current_bill = test_client.post(f"/api/households/{household_id}/calculate", json={})
    assert current_bill.status_code == 200, current_bill.text
    current_period = {
        "period_start": current_bill.json()["period_start"],
        "period_end": current_bill.json()["period_end"],
    }
    assert current_bill.json()["rate_per_kwh"] == 12.5
    previous_current_estimate = current_bill.json()["estimated_cost"]
    assert previous_current_estimate > 0

    changed_rate = test_client.patch(
        f"/api/households/{household_id}/rate",
        json={"provider_name": "A Different Electricity Provider", "rate_per_kwh": "15.0000"},
    )
    assert changed_rate.status_code == 200, changed_rate.text

    updated_current_bill = test_client.post(
        f"/api/households/{household_id}/calculate", json=current_period
    )
    assert updated_current_bill.status_code == 200, updated_current_bill.text
    assert updated_current_bill.json()["current_kwh"] == current_bill.json()["current_kwh"]
    assert updated_current_bill.json()["rate_per_kwh"] == 15
    assert updated_current_bill.json()["estimated_cost"] == (
        previous_current_estimate * 15 / 12.5
    )

    preserved_historical_bill = test_client.post(
        f"/api/households/{household_id}/calculate", json=historical_period
    )
    assert preserved_historical_bill.status_code == 200, preserved_historical_bill.text
    assert preserved_historical_bill.json()["rate_per_kwh"] == 12.5
    assert preserved_historical_bill.json()["estimated_cost"] == historical_estimate


def test_estimates_history_and_scenarios_are_persistent(client):
    test_client, sessions = client
    household, saved_rate = register_and_create_home(test_client)
    household_id = household["household_id"]
    previous_period_end = utc_today().replace(day=1) - timedelta(days=1)
    previous_period_start = previous_period_end.replace(day=1)

    appliance_response = test_client.post(
        f"/api/households/{household_id}/appliances",
        json={
            "appliance_name": "Living room air conditioner",
            "category": "Cooling",
            "wattage": 1000,
            "quantity": 1,
        },
    )
    assert appliance_response.status_code == 201, appliance_response.text
    appliance = appliance_response.json()
    schedule_response = test_client.post(
        f"/api/appliances/{appliance['appliance_id']}/schedules",
        json={
            "days_of_week": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "hours_per_day": 8,
            "is_active": True,
        },
    )
    assert schedule_response.status_code == 201, schedule_response.text

    period = {
        "period_start": previous_period_start.isoformat(),
        "period_end": previous_period_end.isoformat(),
    }
    previous_period_days = (previous_period_end - previous_period_start).days + 1
    calculation = test_client.post(
        f"/api/households/{household_id}/calculate",
        json=period,
    )
    assert calculation.status_code == 200, calculation.text
    assert calculation.json()["current_kwh"] == previous_period_days * 8
    assert calculation.json()["estimated_cost"] == previous_period_days * 8 * 12.5
    assert calculation.json()["provider_name"] == "Sample Electricity"

    # Repeated calculations update the same saved period rather than duplicate it.
    assert (
        test_client.post(f"/api/households/{household_id}/calculate", json=period).status_code
        == 200
    )
    with sessions() as db:
        assert len(list(db.scalars(select(ConsumptionRecord)))) == 1
        assert len(list(db.scalars(select(BillingRecord)))) == 1

    actual_bill = test_client.patch(
        f"/api/households/{household_id}/bills/{calculation.json()['bill_id']}/actual",
        json={"actual_bill_amount": "3200.00"},
    )
    assert actual_bill.status_code == 200, actual_bill.text

    recommendations = test_client.get(f"/api/households/{household_id}/recommendations").json()
    assert len(recommendations) == 1
    recommendation = recommendations[0]
    assert recommendation["potential_savings_kwh"] == 30.0
    assert recommendation["potential_savings_cost"] == 375.0

    changed_rate = test_client.patch(
        f"/api/households/{household_id}/rate",
        json={"provider_name": "A Different Electricity Provider", "rate_per_kwh": "15.0000"},
    )
    assert changed_rate.status_code == 200, changed_rate.text
    assert changed_rate.json()["rate_id"] != saved_rate["rate_id"]

    # Recalculating a historical period must not rewrite its captured tariff or actual bill.
    historical_calculation = test_client.post(
        f"/api/households/{household_id}/calculate",
        json=period,
    )
    assert historical_calculation.json()["estimated_cost"] == previous_period_days * 8 * 12.5
    history = test_client.get(f"/api/households/{household_id}/bills").json()
    previous_bill = next(bill for bill in history if bill["period_start"] == period["period_start"])
    assert previous_bill["provider_name"] == "Sample Electricity"
    assert previous_bill["rate_per_kwh"] == 12.5
    assert previous_bill["actual_bill_amount"] == 3200.0

    updated_recommendations = test_client.get(
        f"/api/households/{household_id}/recommendations"
    ).json()
    assert updated_recommendations[0]["potential_savings_cost"] == 450.0
    dismissed = test_client.patch(
        f"/api/recommendations/{recommendation['recommendation_id']}",
        json={"is_dismissed": True},
    )
    assert dismissed.status_code == 200, dismissed.text
    assert test_client.get(f"/api/households/{household_id}/recommendations").json() == []

    preview = test_client.post(
        f"/api/households/{household_id}/scenarios/preview",
        json={
            "items": [
                {
                    "appliance_id": appliance["appliance_id"],
                    "adjusted_hours_per_day": 4,
                }
            ]
        },
    )
    assert preview.status_code == 200, preview.text
    preview_current = preview.json()["current_kwh"]
    assert preview_current > 0
    assert preview.json()["scenario_kwh"] == preview_current / 2
    assert preview.json()["savings_cost"] == preview_current / 2 * 15

    scenario_response = test_client.post(
        f"/api/households/{household_id}/scenarios",
        json={
            "scenario_name": "Quieter evenings",
            "items": [
                {
                    "appliance_id": appliance["appliance_id"],
                    "adjusted_hours_per_day": 4,
                    "adjusted_quantity": None,
                }
            ],
        },
    )
    assert scenario_response.status_code == 201, scenario_response.text
    scenario_id = scenario_response.json()["scenario_id"]
    saved_scenario = test_client.get(f"/api/households/{household_id}/scenarios/{scenario_id}")
    assert saved_scenario.status_code == 200, saved_scenario.text
    assert saved_scenario.json()["scenario_name"] == "Quieter evenings"
    assert saved_scenario.json()["items"][0]["appliance_name"] == "Living room air conditioner"
    with sessions() as db:
        assert len(list(db.scalars(select(ConsumptionRecord)))) == 1
        assert len(list(db.scalars(select(BillingRecord)))) == 1


def test_historical_appliance_is_archived_and_cannot_be_crossed_by_another_user(client):
    test_client, sessions = client
    household, _ = register_and_create_home(test_client)
    household_id = household["household_id"]
    appliance = test_client.post(
        f"/api/households/{household_id}/appliances",
        json={
            "appliance_name": "Refrigerator",
            "category": "Kitchen",
            "wattage": 150,
            "quantity": 1,
        },
    ).json()
    scheduled = test_client.post(
        f"/api/appliances/{appliance['appliance_id']}/schedules",
        json={"days_of_week": ["Mon"], "hours_per_day": 12},
    )
    assert scheduled.status_code == 201, scheduled.text
    calculate = test_client.post(f"/api/households/{household_id}/calculate", json={})
    assert calculate.status_code == 200, calculate.text

    deletion = test_client.delete(f"/api/appliances/{appliance['appliance_id']}")
    assert deletion.status_code == 200
    assert deletion.json()["archived"] is True
    assert test_client.get(f"/api/households/{household_id}/appliances").json() == []
    saved_bill = test_client.get(f"/api/households/{household_id}/bills").json()[0]
    assert saved_bill["total_kwh"] > 0
    no_active_appliance_estimate = test_client.post(
        f"/api/households/{household_id}/calculate", json={}
    )
    assert no_active_appliance_estimate.status_code == 200
    assert no_active_appliance_estimate.json()["has_usage"] is False
    assert no_active_appliance_estimate.json()["current_kwh"] == saved_bill["total_kwh"]
    assert test_client.get(f"/api/households/{household_id}/bills").json()[0]["total_kwh"] == (
        saved_bill["total_kwh"]
    )
    assert test_client.get(f"/api/households/{household_id}/dashboard").json()["has_usage"] is False

    unused_appliance = test_client.post(
        f"/api/households/{household_id}/appliances",
        json={
            "appliance_name": "Unused desk lamp",
            "category": "Lighting",
            "wattage": 10,
            "quantity": 1,
        },
    ).json()
    unused_deletion = test_client.delete(
        f"/api/appliances/{unused_appliance['appliance_id']}"
    )
    assert unused_deletion.status_code == 200
    assert unused_deletion.json()["archived"] is False

    with sessions() as db:
        record = db.scalar(
            select(ConsumptionRecord).where(
                ConsumptionRecord.appliance_id == appliance["appliance_id"]
            )
        )
        assert record is not None
        assert Decimal(record.estimated_kwh) > 0
        assert db.get(ElectricityRate, household["rate_id"]) is not None

    another_user_token = create_account(test_client, "sam@example.com", "Sam Test")
    test_client.headers["Authorization"] = f"Bearer {another_user_token}"
    assert test_client.get(f"/api/households/{household_id}/appliances").status_code == 404
    assert (
        test_client.get(f"/api/appliances/{appliance['appliance_id']}/schedules").status_code == 404
    )


def test_active_schedules_cannot_add_up_to_over_24_hours(client):
    test_client, _ = client
    household, _ = register_and_create_home(test_client)
    appliance = test_client.post(
        f"/api/households/{household['household_id']}/appliances",
        json={"appliance_name": "Fan", "category": "Cooling", "wattage": 80, "quantity": 1},
    ).json()
    first = test_client.post(
        f"/api/appliances/{appliance['appliance_id']}/schedules",
        json={"days_of_week": ["Mon"], "hours_per_day": 20},
    )
    assert first.status_code == 201, first.text

    overbooked = test_client.post(
        f"/api/appliances/{appliance['appliance_id']}/schedules",
        json={"days_of_week": ["Mon"], "hours_per_day": 5},
    )
    assert overbooked.status_code == 422
    assert "24 operating hours" in overbooked.json()["detail"]
