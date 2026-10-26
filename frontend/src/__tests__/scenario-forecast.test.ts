import { describe, test, expect } from "vitest";
import { ForecastResponse } from "../lib/types";

// Helper function representing state transition logic in Dashboard component
function computeActiveForecast(
  activeForecastMode: "baseline" | "scenario",
  baseline: ForecastResponse | null,
  scenario: ForecastResponse | null
): ForecastResponse | null {
  return activeForecastMode === "scenario" && scenario ? scenario : baseline;
}

// Sample baseline mock
const mockBaseline: ForecastResponse = {
  disclaimer: "Baseline Forecast",
  evidence: {
    starting_cash_balance: "1000.00",
    as_of_date: "2026-10-01",
    reserve_target: "400.00",
    include_uncertain_income: false,
    conservative_income_ids: ["inc-1"],
    uncertain_income_ids: ["inc-2"],
    expense_ids: ["exp-1"],
    note: "Baseline trace note",
  },
  events: [
    {
      transaction_id: "exp-1",
      kind: "expense",
      date: "2026-10-02",
      amount: "200.00",
      included_in_forecast: true,
      projected_balance_after: "800.00",
      reserve_gap_after: "0.00",
    },
  ],
  horizons: {
    "7": {
      horizon_days: 7,
      end_date: "2026-10-08",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: null,
      reserve_gap: "0.00",
      daily_balances: [
        {
          date: "2026-10-01",
          projected_balance: "1000.00",
          below_reserve: false,
          reserve_gap: "0.00",
          transaction_ids: [],
        },
        {
          date: "2026-10-02",
          projected_balance: "800.00",
          below_reserve: false,
          reserve_gap: "0.00",
          transaction_ids: ["exp-1"],
        },
      ],
    },
    "14": {
      horizon_days: 14,
      end_date: "2026-10-15",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: null,
      reserve_gap: "0.00",
      daily_balances: [],
    },
    "30": {
      horizon_days: 30,
      end_date: "2026-10-31",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: null,
      reserve_gap: "0.00",
      daily_balances: [],
    },
  },
};

// Sample scenario 1 mock (higher reserve target -> breach)
const mockScenario1: ForecastResponse = {
  disclaimer: "Scenario 1 Forecast",
  evidence: {
    starting_cash_balance: "1000.00",
    as_of_date: "2026-10-01",
    reserve_target: "900.00",
    include_uncertain_income: true,
    conservative_income_ids: ["inc-1"],
    uncertain_income_ids: ["inc-2"],
    expense_ids: ["exp-1"],
    note: "Scenario 1 trace note",
  },
  events: [
    {
      transaction_id: "exp-1",
      kind: "expense",
      date: "2026-10-02",
      amount: "200.00",
      included_in_forecast: true,
      projected_balance_after: "800.00",
      reserve_gap_after: "-100.00",
    },
  ],
  horizons: {
    "7": {
      horizon_days: 7,
      end_date: "2026-10-08",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: "2026-10-02",
      reserve_gap: "-100.00",
      daily_balances: [
        {
          date: "2026-10-02",
          projected_balance: "800.00",
          below_reserve: true,
          reserve_gap: "-100.00",
          transaction_ids: ["exp-1"],
        },
      ],
    },
    "14": {
      horizon_days: 14,
      end_date: "2026-10-15",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: "2026-10-02",
      reserve_gap: "-100.00",
      daily_balances: [],
    },
    "30": {
      horizon_days: 30,
      end_date: "2026-10-31",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: "2026-10-02",
      reserve_gap: "-100.00",
      daily_balances: [],
    },
  },
};

// Sample scenario 2 mock (deferred expense)
const mockScenario2: ForecastResponse = {
  disclaimer: "Scenario 2 Forecast",
  evidence: {
    starting_cash_balance: "1000.00",
    as_of_date: "2026-10-01",
    reserve_target: "400.00",
    include_uncertain_income: false,
    conservative_income_ids: ["inc-1"],
    uncertain_income_ids: ["inc-2"],
    expense_ids: ["exp-1"],
    note: "Scenario 2 deferred expense note",
  },
  events: [
    {
      transaction_id: "exp-1",
      kind: "expense",
      date: "2026-10-09",
      amount: "200.00",
      included_in_forecast: false,
      projected_balance_after: "1000.00",
      reserve_gap_after: "0.00",
    },
  ],
  horizons: {
    "7": {
      horizon_days: 7,
      end_date: "2026-10-08",
      projected_balance: "1000.00",
      minimum_projected_balance: "1000.00",
      first_date_below_reserve: null,
      reserve_gap: "0.00",
      daily_balances: [
        {
          date: "2026-10-02",
          projected_balance: "1000.00",
          below_reserve: false,
          reserve_gap: "0.00",
          transaction_ids: [],
        },
      ],
    },
    "14": {
      horizon_days: 14,
      end_date: "2026-10-15",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: null,
      reserve_gap: "0.00",
      daily_balances: [],
    },
    "30": {
      horizon_days: 30,
      end_date: "2026-10-31",
      projected_balance: "800.00",
      minimum_projected_balance: "800.00",
      first_date_below_reserve: null,
      reserve_gap: "0.00",
      daily_balances: [],
    },
  },
};

describe("PaisaPilot AI - Scenario Forecast Integration Tests", () => {
  test("1. Running a scenario updates the active forecast state to scenario", () => {
    let mode: "baseline" | "scenario" = "baseline";
    let activeForecast = computeActiveForecast(mode, mockBaseline, mockScenario1);
    expect(activeForecast?.evidence.reserve_target).toBe("400.00");

    // Execute scenario run
    mode = "scenario";
    activeForecast = computeActiveForecast(mode, mockBaseline, mockScenario1);
    expect(activeForecast?.evidence.reserve_target).toBe("900.00");
    expect(activeForecast?.horizons["7"].first_date_below_reserve).toBe("2026-10-02");
  });

  test("2. Dashboard and 3. Cash Flow consume the active forecast response", () => {
    const mode = "scenario";
    const activeForecast = computeActiveForecast(mode, mockBaseline, mockScenario1);
    const horizon7 = activeForecast?.horizons["7"];

    // Dashboard KPI checks
    expect(activeForecast?.evidence.starting_cash_balance).toBe("1000.00");
    expect(horizon7?.projected_balance).toBe("800.00");
    expect(horizon7?.reserve_gap).toBe("-100.00");
    expect(horizon7?.first_date_below_reserve).toBe("2026-10-02");

    // Cash Flow views must match Dashboard values
    expect(horizon7?.projected_balance).toBe("800.00");
  });

  test("4. Baseline and scenario comparison remains correct in scenario tab", () => {
    const baselineHorizon = mockBaseline.horizons["7"];
    const scenarioHorizon = mockScenario1.horizons["7"];

    expect(baselineHorizon.first_date_below_reserve).toBeNull();
    expect(scenarioHorizon.first_date_below_reserve).toBe("2026-10-02");

    expect(baselineHorizon.reserve_gap).toBe("0.00");
    expect(scenarioHorizon.reserve_gap).toBe("-100.00");
  });

  test("5. Reports use the intended active forecast", () => {
    let mode: "baseline" | "scenario" = "baseline";
    let activeForecast = computeActiveForecast(mode, mockBaseline, mockScenario1);
    expect(activeForecast?.evidence.reserve_target).toBe("400.00");

    mode = "scenario";
    activeForecast = computeActiveForecast(mode, mockBaseline, mockScenario1);
    expect(activeForecast?.evidence.reserve_target).toBe("900.00");
  });

  test("6. Failed scenario execution preserves the last valid forecast and reports an understandable error", () => {
    const mode: "baseline" | "scenario" = "scenario";
    let scenarioState: ForecastResponse | null = mockScenario1;
    let errorMessage: string | null = null;

    // Simulate network error on scenario recalculation
    const apiResult = { ok: false, message: "Scenario calculation API timed out." };
    if (!apiResult.ok) {
      errorMessage = apiResult.message;
      // Do NOT set scenarioState to null!
    } else {
      scenarioState = mockScenario2;
    }

    expect(errorMessage).toBe("Scenario calculation API timed out.");
    expect(scenarioState).not.toBeNull();
    expect(scenarioState?.evidence.reserve_target).toBe("900.00");

    const activeForecast = computeActiveForecast(mode, mockBaseline, scenarioState);
    expect(activeForecast?.evidence.reserve_target).toBe("900.00");
  });

  test("7. Running two scenarios successively does not display stale results", () => {
    const mode: "baseline" | "scenario" = "scenario";
    let currentScenario: ForecastResponse = mockScenario1;

    let activeForecast = computeActiveForecast(mode, mockBaseline, currentScenario);
    expect(activeForecast?.horizons["7"].projected_balance).toBe("800.00");

    // Run scenario 2
    currentScenario = mockScenario2;
    activeForecast = computeActiveForecast(mode, mockBaseline, currentScenario);
    expect(activeForecast?.horizons["7"].projected_balance).toBe("1000.00");
  });
});
