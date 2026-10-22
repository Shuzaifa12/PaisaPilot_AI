export type IncomeStatus = "confirmed" | "scheduled" | "uncertain";

export type IncomeItem = {
  id: string;
  amount: string;
  expected_date: string;
  status: IncomeStatus;
};

export type ExpenseItem = {
  id: string;
  amount: string;
  due_date: string;
  description: string;
};

export type ForecastRequest = {
  current_cash_balance: string;
  reserve_target: string;
  as_of_date: string;
  income: IncomeItem[];
  expenses: ExpenseItem[];
  include_uncertain_income: boolean;
};

export type DailyBalance = {
  date: string;
  projected_balance: string;
  reserve_gap: string;
  below_reserve: boolean;
  transaction_ids: string[];
};

export type EventProjection = {
  transaction_id: string;
  kind: "income" | "expense";
  date: string;
  amount: string;
  included_in_forecast: boolean;
  exclusion_reason: string | null;
  projected_balance_after: string | null;
  reserve_gap_after: string | null;
};

export type HorizonForecast = {
  horizon_days: number;
  start_date: string;
  end_date: string;
  projected_balance: string;
  reserve_gap: string;
  minimum_projected_balance: string;
  first_date_below_reserve: string | null;
  daily_balances: DailyBalance[];
};

export type ForecastEvidence = {
  as_of_date: string;
  starting_cash_balance: string;
  reserve_target: string;
  include_uncertain_income: boolean;
  conservative_income_ids: string[];
  uncertain_income_ids: string[];
  expense_ids: string[];
  excluded_transaction_ids: string[];
  same_day_order: string;
  note: string;
};

export type ForecastResponse = {
  projection_kind: "estimate";
  disclaimer: string;
  evidence: ForecastEvidence;
  events: EventProjection[];
  horizons: Record<string, HorizonForecast>;
};

export type ValidationIssue = {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
};

export type ForecastApiError = {
  error?: string;
  detail?: string | ValidationIssue[];
};
