from fastapi.testclient import TestClient

from app.main import app
from app.models import PROJECTION_DISCLAIMER

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_forecast_endpoint_returns_estimates() -> None:
    response = client.post(
        "/forecast",
        json={
            "current_cash_balance": "1000.00",
            "reserve_target": "400.00",
            "as_of_date": "2026-10-21",
            "income": [
                {
                    "id": "inc-1",
                    "amount": "250.00",
                    "expected_date": "2026-10-28",
                    "status": "scheduled",
                }
            ],
            "expenses": [
                {
                    "id": "exp-1",
                    "amount": "700.00",
                    "due_date": "2026-10-22",
                    "description": "Vendor payment",
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["disclaimer"] == PROJECTION_DISCLAIMER
    assert body["projection_kind"] == "estimate"
    assert body["horizons"]["7"]["first_date_below_reserve"] == "2026-10-22"
    assert body["horizons"]["7"]["projected_balance"] == "300.00"
    assert body["events"][0]["transaction_id"] == "exp-1"


def test_api_rejects_missing_and_invalid_fields() -> None:
    missing = client.post(
        "/forecast",
        json={
            "current_cash_balance": "10.00",
            "as_of_date": "2026-10-21",
            "income": [],
            "expenses": [],
        },
    )
    assert missing.status_code == 422

    invalid_amount = client.post(
        "/forecast",
        json={
            "current_cash_balance": "10.00",
            "reserve_target": "5.00",
            "as_of_date": "2026-10-21",
            "income": [
                {
                    "id": "inc-bad",
                    "amount": "-2.00",
                    "expected_date": "2026-10-22",
                    "status": "confirmed",
                }
            ],
            "expenses": [],
        },
    )
    assert invalid_amount.status_code == 422

    bad_status = client.post(
        "/forecast",
        json={
            "current_cash_balance": "10.00",
            "reserve_target": "5.00",
            "as_of_date": "2026-10-21",
            "income": [
                {
                    "id": "inc-status",
                    "amount": "2.00",
                    "expected_date": "2026-10-22",
                    "status": "maybe",
                }
            ],
            "expenses": [],
        },
    )
    assert bad_status.status_code == 422

    bad_date = client.post(
        "/forecast",
        json={
            "current_cash_balance": "10.00",
            "reserve_target": "5.00",
            "as_of_date": "21-10-2026",
            "income": [],
            "expenses": [],
        },
    )
    assert bad_date.status_code == 422
