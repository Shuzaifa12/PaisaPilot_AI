import type { ForecastRequest } from "@/lib/types";

/** Illustrative sample *inputs* only. Not a forecast and not live financial records. */
export const DEMO_INPUTS_NOTICE =
  "These are illustrative demo inputs for the hackathon UI. They are not live bank data, not a forecast, and not a guarantee.";

export const DEMO_FORECAST_REQUEST: ForecastRequest = {
  current_cash_balance: "1000.00",
  reserve_target: "400.00",
  as_of_date: "2026-10-21",
  include_uncertain_income: false,
  income: [
    {
      id: "inc-salary",
      amount: "500.00",
      expected_date: "2026-10-25",
      status: "confirmed",
    },
    {
      id: "inc-client",
      amount: "200.00",
      expected_date: "2026-11-01",
      status: "scheduled",
    },
    {
      id: "inc-bonus",
      amount: "3000.00",
      expected_date: "2026-10-22",
      status: "uncertain",
    },
  ],
  expenses: [
    {
      id: "exp-rent",
      amount: "800.00",
      due_date: "2026-10-23",
      description: "Rent",
    },
    {
      id: "exp-utilities",
      amount: "150.00",
      due_date: "2026-11-05",
      description: "Utilities",
    },
  ],
};
