from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


PROJECTION_DISCLAIMER = (
    "These projections are estimates based only on the transactions you provided. "
    "They are not guarantees of future cash balances."
)


class IncomeStatus(str, Enum):
    confirmed = "confirmed"
    scheduled = "scheduled"
    uncertain = "uncertain"


def _require_positive_amount(value: Decimal) -> Decimal:
    if value <= 0:
        raise ValueError("amount must be greater than 0")
    quantized = value.quantize(Decimal("0.01"))
    if quantized != value:
        raise ValueError("amount must have at most 2 decimal places")
    return quantized


def _require_money(value: Decimal, field_name: str) -> Decimal:
    if value < 0:
        raise ValueError(f"{field_name} must be greater than or equal to 0")
    quantized = value.quantize(Decimal("0.01"))
    if quantized != value:
        raise ValueError(f"{field_name} must have at most 2 decimal places")
    return quantized


class IncomeItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    amount: Decimal
    expected_date: date
    status: IncomeStatus

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        return _require_positive_amount(value)

    @field_validator("id")
    @classmethod
    def strip_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("id must not be blank")
        return stripped


class ExpenseItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    amount: Decimal
    due_date: date
    description: str = Field(min_length=1)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        return _require_positive_amount(value)

    @field_validator("id", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_cash_balance: Decimal
    reserve_target: Decimal
    as_of_date: date
    income: list[IncomeItem] = Field(default_factory=list)
    expenses: list[ExpenseItem] = Field(default_factory=list)
    include_uncertain_income: bool = False

    @field_validator("current_cash_balance")
    @classmethod
    def validate_balance(cls, value: Decimal) -> Decimal:
        return _require_money(value, "current_cash_balance")

    @field_validator("reserve_target")
    @classmethod
    def validate_reserve(cls, value: Decimal) -> Decimal:
        return _require_money(value, "reserve_target")

    @model_validator(mode="after")
    def unique_ids(self) -> ForecastRequest:
        ids = [item.id for item in self.income] + [item.id for item in self.expenses]
        duplicates = sorted({item_id for item_id in ids if ids.count(item_id) > 1})
        if duplicates:
            raise ValueError(f"transaction ids must be unique: {', '.join(duplicates)}")
        return self


class DailyBalance(BaseModel):
    date: date
    projected_balance: Decimal
    reserve_gap: Decimal
    below_reserve: bool
    transaction_ids: list[str]


class EventProjection(BaseModel):
    transaction_id: str
    kind: Literal["income", "expense"]
    date: date
    amount: Decimal
    included_in_forecast: bool
    exclusion_reason: str | None
    projected_balance_after: Decimal | None
    reserve_gap_after: Decimal | None


class HorizonForecast(BaseModel):
    horizon_days: int
    start_date: date
    end_date: date
    projected_balance: Decimal
    reserve_gap: Decimal
    minimum_projected_balance: Decimal
    first_date_below_reserve: date | None
    daily_balances: list[DailyBalance]


class ForecastEvidence(BaseModel):
    as_of_date: date
    starting_cash_balance: Decimal
    reserve_target: Decimal
    include_uncertain_income: bool
    conservative_income_ids: list[str]
    uncertain_income_ids: list[str]
    expense_ids: list[str]
    excluded_transaction_ids: list[str]
    same_day_order: str
    note: str


class ForecastResponse(BaseModel):
    projection_kind: Literal["estimate"] = "estimate"
    disclaimer: str = PROJECTION_DISCLAIMER
    evidence: ForecastEvidence
    events: list[EventProjection]
    horizons: dict[str, HorizonForecast]
