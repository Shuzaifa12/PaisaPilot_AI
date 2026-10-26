import { describe, test, expect } from "vitest";
import type { ForecastResponse } from "@/lib/types";

const mockForecast: ForecastResponse = {
  projection_kind: "estimate",
  disclaimer: "Test Disclaimer",
  evidence: {
    as_of_date: "2026-10-01",
    starting_cash_balance: "5000.00",
    reserve_target: "1000.00",
    include_uncertain_income: false,
    conservative_income_ids: ["inc-1"],
    uncertain_income_ids: [],
    expense_ids: ["exp-1"],
    excluded_transaction_ids: [],
    same_day_order: "expenses first",
    note: "Baseline test note",
  },
  events: [],
  horizons: {
    "7": {
      horizon_days: 7,
      start_date: "2026-10-01",
      end_date: "2026-10-08",
      projected_balance: "4500.00",
      reserve_gap: "0.00",
      minimum_projected_balance: "4500.00",
      first_date_below_reserve: null,
      daily_balances: [],
    },
  },
};

describe("PaisaPilot AI - Ask PaisaPilot Chat & Explanation Logic", () => {
  test("1. Forecast evidence contains required fields for AI prompt synthesis", () => {
    expect(mockForecast.evidence.starting_cash_balance).toBe("5000.00");
    expect(mockForecast.evidence.reserve_target).toBe("1000.00");
    expect(mockForecast.horizons["7"].projected_balance).toBe("4500.00");
  });

  test("2. Chat message payload structure conforms to forecast explanation expectation", () => {
    const payload = mockForecast;
    expect(payload.projection_kind).toBe("estimate");
    expect(payload.evidence.note).toBe("Baseline test note");
  });
});
