import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_zetaris_status_endpoint() -> None:
    response = client.get("/zetaris/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_configured"
    assert "credentials" in body["message"].lower()


def test_agent_explain_fallback_without_key() -> None:
    response = client.post(
        "/agent/explain",
        json={
            "projection_kind": "estimate",
            "disclaimer": "Disclaimer",
            "evidence": {
                "as_of_date": "2026-10-21",
                "starting_cash_balance": "1000.00",
                "reserve_target": "400.00",
                "include_uncertain_income": False,
                "conservative_income_ids": [],
                "uncertain_income_ids": [],
                "expense_ids": [],
                "excluded_transaction_ids": [],
                "same_day_order": "expenses first",
                "note": "Test note",
            },
            "events": [],
            "horizons": {},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "fallback"
    assert "1000.00" in body["explanation"]
