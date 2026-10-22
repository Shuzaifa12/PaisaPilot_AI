from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.forecast import build_forecast
from app.models import ExpenseItem, ForecastRequest, IncomeItem, IncomeStatus, PROJECTION_DISCLAIMER


AS_OF = date(2026, 10, 21)


def _request(**overrides) -> ForecastRequest:
    payload = {
        "current_cash_balance": Decimal("1000.00"),
        "reserve_target": Decimal("400.00"),
        "as_of_date": AS_OF,
        "income": [
            IncomeItem(
                id="inc-confirmed",
                amount=Decimal("500.00"),
                expected_date=date(2026, 10, 25),
                status=IncomeStatus.confirmed,
            ),
            IncomeItem(
                id="inc-scheduled",
                amount=Decimal("200.00"),
                expected_date=date(2026, 11, 1),
                status=IncomeStatus.scheduled,
            ),
            IncomeItem(
                id="inc-uncertain",
                amount=Decimal("3000.00"),
                expected_date=date(2026, 10, 22),
                status=IncomeStatus.uncertain,
            ),
        ],
        "expenses": [
            ExpenseItem(
                id="exp-rent",
                amount=Decimal("800.00"),
                due_date=date(2026, 10, 23),
                description="Rent",
            ),
            ExpenseItem(
                id="exp-utilities",
                amount=Decimal("150.00"),
                due_date=date(2026, 11, 5),
                description="Utilities",
            ),
        ],
        "include_uncertain_income": False,
    }
    payload.update(overrides)
    return ForecastRequest(**payload)


def test_normal_forecast_daily_event_and_horizon_math() -> None:
    result = build_forecast(_request())

    assert result.projection_kind == "estimate"
    assert result.disclaimer == PROJECTION_DISCLAIMER
    assert "not guarantees" in result.disclaimer.lower()

    day_map_7 = {item.date: item for item in result.horizons["7"].daily_balances}
    assert len(result.horizons["7"].daily_balances) == 7
    assert len(result.horizons["14"].daily_balances) == 14
    assert len(result.horizons["30"].daily_balances) == 30

    assert day_map_7[date(2026, 10, 21)].projected_balance == Decimal("1000.00")
    assert day_map_7[date(2026, 10, 21)].transaction_ids == []

    assert day_map_7[date(2026, 10, 22)].projected_balance == Decimal("1000.00")
    assert day_map_7[date(2026, 10, 22)].transaction_ids == []

    assert day_map_7[date(2026, 10, 23)].projected_balance == Decimal("200.00")
    assert day_map_7[date(2026, 10, 23)].transaction_ids == ["exp-rent"]
    assert day_map_7[date(2026, 10, 23)].below_reserve is True
    assert day_map_7[date(2026, 10, 23)].reserve_gap == Decimal("200.00")

    assert day_map_7[date(2026, 10, 25)].projected_balance == Decimal("700.00")
    assert day_map_7[date(2026, 10, 25)].transaction_ids == ["inc-confirmed"]
    assert day_map_7[date(2026, 10, 25)].below_reserve is False
    assert day_map_7[date(2026, 10, 25)].reserve_gap == Decimal("0.00")

    assert result.horizons["7"].projected_balance == Decimal("700.00")
    assert result.horizons["7"].reserve_gap == Decimal("0.00")
    assert result.horizons["7"].first_date_below_reserve == date(2026, 10, 23)
    assert result.horizons["7"].minimum_projected_balance == Decimal("200.00")

    assert result.horizons["14"].projected_balance == Decimal("900.00")
    assert result.horizons["14"].first_date_below_reserve == date(2026, 10, 23)

    utilities_day = next(
        item for item in result.horizons["30"].daily_balances if item.date == date(2026, 11, 5)
    )
    assert utilities_day.projected_balance == Decimal("750.00")
    assert utilities_day.transaction_ids == ["exp-utilities"]
    assert result.horizons["30"].projected_balance == Decimal("750.00")

    event_ids = [event.transaction_id for event in result.events]
    assert event_ids == [
        "inc-uncertain",
        "exp-rent",
        "inc-confirmed",
        "inc-scheduled",
        "exp-utilities",
    ]

    rent = next(event for event in result.events if event.transaction_id == "exp-rent")
    assert rent.projected_balance_after == Decimal("200.00")
    assert rent.reserve_gap_after == Decimal("200.00")
    assert rent.included_in_forecast is True

    confirmed = next(event for event in result.events if event.transaction_id == "inc-confirmed")
    assert confirmed.projected_balance_after == Decimal("700.00")

    scheduled = next(event for event in result.events if event.transaction_id == "inc-scheduled")
    assert scheduled.projected_balance_after == Decimal("900.00")

    assert result.evidence.conservative_income_ids == ["inc-confirmed", "inc-scheduled"]
    assert result.evidence.uncertain_income_ids == ["inc-uncertain"]
    assert result.evidence.excluded_transaction_ids == ["inc-uncertain"]
    assert result.evidence.expense_ids == ["exp-rent", "exp-utilities"]
    assert "inferred" in result.evidence.note


def test_missing_fields_are_rejected() -> None:
    with pytest.raises(ValidationError) as income_error:
        IncomeItem(
            id="inc-1",
            amount=Decimal("10.00"),
            expected_date=date(2026, 10, 22),
        )
    assert "status" in str(income_error.value)

    with pytest.raises(ValidationError) as expense_error:
        ExpenseItem(
            id="exp-1",
            amount=Decimal("10.00"),
            due_date=date(2026, 10, 22),
        )
    assert "description" in str(expense_error.value)

    with pytest.raises(ValidationError) as request_error:
        ForecastRequest(
            current_cash_balance=Decimal("10.00"),
            income=[],
            expenses=[],
        )
    message = str(request_error.value)
    assert "reserve_target" in message
    assert "as_of_date" in message


def test_invalid_amounts_are_rejected() -> None:
    with pytest.raises(ValidationError):
        IncomeItem(
            id="inc-neg",
            amount=Decimal("-1.00"),
            expected_date=date(2026, 10, 22),
            status=IncomeStatus.confirmed,
        )

    with pytest.raises(ValidationError):
        ExpenseItem(
            id="exp-zero",
            amount=Decimal("0.00"),
            due_date=date(2026, 10, 22),
            description="Invalid",
        )

    with pytest.raises(ValidationError):
        ForecastRequest(
            current_cash_balance=Decimal("-5.00"),
            reserve_target=Decimal("10.00"),
            as_of_date=AS_OF,
        )

    with pytest.raises(ValidationError):
        IncomeItem(
            id="inc-extra-cents",
            amount=Decimal("10.001"),
            expected_date=date(2026, 10, 22),
            status=IncomeStatus.confirmed,
        )


def test_expense_reserve_breach() -> None:
    result = build_forecast(
        _request(
            current_cash_balance=Decimal("500.00"),
            reserve_target=Decimal("300.00"),
            income=[],
            expenses=[
                ExpenseItem(
                    id="exp-bill",
                    amount=Decimal("250.00"),
                    due_date=date(2026, 10, 24),
                    description="Insurance",
                )
            ],
        )
    )

    assert result.horizons["7"].first_date_below_reserve == date(2026, 10, 24)
    assert result.horizons["7"].projected_balance == Decimal("250.00")
    assert result.horizons["7"].reserve_gap == Decimal("50.00")
    bill = result.events[0]
    assert bill.transaction_id == "exp-bill"
    assert bill.projected_balance_after == Decimal("250.00")
    assert bill.reserve_gap_after == Decimal("50.00")


def test_uncertain_income_excluded_by_default_and_optional_include() -> None:
    conservative = build_forecast(_request())
    uncertain = next(event for event in conservative.events if event.transaction_id == "inc-uncertain")
    assert uncertain.included_in_forecast is False
    assert uncertain.projected_balance_after is None
    assert uncertain.exclusion_reason is not None
    assert "uncertain" in uncertain.exclusion_reason

    day_22 = next(
        item
        for item in conservative.horizons["7"].daily_balances
        if item.date == date(2026, 10, 22)
    )
    assert day_22.projected_balance == Decimal("1000.00")
    assert "inc-uncertain" not in day_22.transaction_ids

    inclusive = build_forecast(_request(include_uncertain_income=True))
    included = next(event for event in inclusive.events if event.transaction_id == "inc-uncertain")
    assert included.included_in_forecast is True
    assert included.projected_balance_after == Decimal("4000.00")
    assert inclusive.evidence.excluded_transaction_ids == []

    day_22_inclusive = next(
        item
        for item in inclusive.horizons["7"].daily_balances
        if item.date == date(2026, 10, 22)
    )
    assert day_22_inclusive.projected_balance == Decimal("4000.00")
    assert day_22_inclusive.transaction_ids == ["inc-uncertain"]
    assert inclusive.horizons["7"].first_date_below_reserve is None


def test_same_day_expenses_apply_before_income() -> None:
    result = build_forecast(
        _request(
            current_cash_balance=Decimal("100.00"),
            reserve_target=Decimal("50.00"),
            income=[
                IncomeItem(
                    id="inc-same",
                    amount=Decimal("40.00"),
                    expected_date=AS_OF,
                    status=IncomeStatus.confirmed,
                )
            ],
            expenses=[
                ExpenseItem(
                    id="exp-same",
                    amount=Decimal("80.00"),
                    due_date=AS_OF,
                    description="Same-day bill",
                )
            ],
        )
    )
    day_one = result.horizons["7"].daily_balances[0]
    assert day_one.transaction_ids == ["exp-same", "inc-same"]
    assert day_one.projected_balance == Decimal("60.00")
    assert result.horizons["7"].minimum_projected_balance == Decimal("20.00")
    assert result.horizons["7"].first_date_below_reserve == AS_OF

    expense_event = next(event for event in result.events if event.transaction_id == "exp-same")
    income_event = next(event for event in result.events if event.transaction_id == "inc-same")
    assert expense_event.projected_balance_after == Decimal("20.00")
    assert income_event.projected_balance_after == Decimal("60.00")
