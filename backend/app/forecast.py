from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.models import (
    DailyBalance,
    EventProjection,
    ForecastEvidence,
    ForecastRequest,
    ForecastResponse,
    HorizonForecast,
    IncomeStatus,
    PROJECTION_DISCLAIMER,
)

HORIZONS = (7, 14, 30)
SAME_DAY_ORDER = "expenses before income, then transaction id"


@dataclass(frozen=True)
class PlannedEvent:
    transaction_id: str
    kind: str
    event_date: date
    amount: Decimal
    signed_amount: Decimal
    included_in_forecast: bool
    exclusion_reason: str | None
    sort_priority: int


def _reserve_gap(balance: Decimal, reserve_target: Decimal) -> Decimal:
    gap = reserve_target - balance
    return gap if gap > 0 else Decimal("0.00")


def _build_planned_events(request: ForecastRequest) -> list[PlannedEvent]:
    planned: list[PlannedEvent] = []

    for item in request.income:
        uncertain = item.status == IncomeStatus.uncertain
        excluded_uncertain = uncertain and not request.include_uncertain_income
        before_as_of = item.expected_date < request.as_of_date
        if excluded_uncertain:
            reason = "uncertain income is excluded from the conservative forecast"
        elif before_as_of:
            reason = "expected date is before as_of_date"
        else:
            reason = None
        included = reason is None
        planned.append(
            PlannedEvent(
                transaction_id=item.id,
                kind="income",
                event_date=item.expected_date,
                amount=item.amount,
                signed_amount=item.amount if included else Decimal("0.00"),
                included_in_forecast=included,
                exclusion_reason=reason,
                sort_priority=1,
            )
        )

    for item in request.expenses:
        before_as_of = item.due_date < request.as_of_date
        reason = "due date is before as_of_date" if before_as_of else None
        included = reason is None
        planned.append(
            PlannedEvent(
                transaction_id=item.id,
                kind="expense",
                event_date=item.due_date,
                amount=item.amount,
                signed_amount=-item.amount if included else Decimal("0.00"),
                included_in_forecast=included,
                exclusion_reason=reason,
                sort_priority=0,
            )
        )

    return sorted(
        planned,
        key=lambda event: (event.event_date, event.sort_priority, event.transaction_id),
    )


def build_forecast(request: ForecastRequest) -> ForecastResponse:
    planned = _build_planned_events(request)
    conservative_income_ids = [
        item.id
        for item in request.income
        if item.status != IncomeStatus.uncertain
    ]
    uncertain_income_ids = [
        item.id
        for item in request.income
        if item.status == IncomeStatus.uncertain
    ]
    expense_ids = [item.id for item in request.expenses]
    excluded_ids = [event.transaction_id for event in planned if not event.included_in_forecast]

    included_by_date: dict[date, list[PlannedEvent]] = {}
    for event in planned:
        if event.included_in_forecast:
            included_by_date.setdefault(event.event_date, []).append(event)

    max_horizon = max(HORIZONS)
    daily: list[DailyBalance] = []
    balance = request.current_cash_balance
    first_date_below_reserve: date | None = None
    if balance < request.reserve_target:
        first_date_below_reserve = request.as_of_date

    event_balance_after: dict[str, Decimal] = {}
    intra_day_minimums: list[Decimal] = []

    for offset in range(max_horizon):
        day = request.as_of_date + timedelta(days=offset)
        day_events = included_by_date.get(day, [])
        day_minimum = balance
        for event in day_events:
            balance += event.signed_amount
            event_balance_after[event.transaction_id] = balance
            day_minimum = min(day_minimum, balance)
            if balance < request.reserve_target and first_date_below_reserve is None:
                first_date_below_reserve = day
        gap = _reserve_gap(balance, request.reserve_target)
        below = balance < request.reserve_target
        intra_day_minimums.append(day_minimum)
        daily.append(
            DailyBalance(
                date=day,
                projected_balance=balance,
                reserve_gap=gap,
                below_reserve=below,
                transaction_ids=[event.transaction_id for event in day_events],
            )
        )

    # Apply remaining included events after the 30-day window so event evidence stays complete.
    later_events = [
        event
        for event in planned
        if event.included_in_forecast
        and event.event_date > request.as_of_date + timedelta(days=max_horizon - 1)
    ]
    running = daily[-1].projected_balance if daily else request.current_cash_balance
    for event in later_events:
        running += event.signed_amount
        event_balance_after[event.transaction_id] = running
        if running < request.reserve_target and first_date_below_reserve is None:
            first_date_below_reserve = event.event_date

    event_projections: list[EventProjection] = []
    for event in planned:
        after = event_balance_after.get(event.transaction_id)
        event_projections.append(
            EventProjection(
                transaction_id=event.transaction_id,
                kind=event.kind,  # type: ignore[arg-type]
                date=event.event_date,
                amount=event.amount,
                included_in_forecast=event.included_in_forecast,
                exclusion_reason=event.exclusion_reason,
                projected_balance_after=after,
                reserve_gap_after=(
                    _reserve_gap(after, request.reserve_target) if after is not None else None
                ),
            )
        )

    horizons: dict[str, HorizonForecast] = {}
    for days in HORIZONS:
        slice_days = daily[:days]
        projected = slice_days[-1].projected_balance
        min_balance = min(intra_day_minimums[:days], default=request.current_cash_balance)
        horizon_end = request.as_of_date + timedelta(days=days - 1)
        first_in_horizon = (
            first_date_below_reserve
            if first_date_below_reserve is not None and first_date_below_reserve <= horizon_end
            else None
        )
        horizons[str(days)] = HorizonForecast(
            horizon_days=days,
            start_date=request.as_of_date,
            end_date=request.as_of_date + timedelta(days=days - 1),
            projected_balance=projected,
            reserve_gap=_reserve_gap(projected, request.reserve_target),
            minimum_projected_balance=min_balance,
            first_date_below_reserve=first_in_horizon,
            daily_balances=slice_days,
        )

    evidence = ForecastEvidence(
        as_of_date=request.as_of_date,
        starting_cash_balance=request.current_cash_balance,
        reserve_target=request.reserve_target,
        include_uncertain_income=request.include_uncertain_income,
        conservative_income_ids=conservative_income_ids,
        uncertain_income_ids=uncertain_income_ids,
        expense_ids=expense_ids,
        excluded_transaction_ids=excluded_ids,
        same_day_order=SAME_DAY_ORDER,
        note=(
            "Forecast uses only submitted transactions. "
            "No dates, amounts, or cash events were inferred."
        ),
    )

    return ForecastResponse(
        projection_kind="estimate",
        disclaimer=PROJECTION_DISCLAIMER,
        evidence=evidence,
        events=event_projections,
        horizons=horizons,
    )
