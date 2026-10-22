"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { checkBackendHealth, postForecast } from "@/lib/client";
import { explainForecast } from "@/lib/agent-client";
import { DEMO_FORECAST_REQUEST, DEMO_INPUTS_NOTICE } from "@/lib/demo-inputs";
import { displayApiAmount, shiftIsoDate } from "@/lib/format";
import type {
  ForecastRequest,
  ForecastResponse,
  HorizonForecast,
  IncomeStatus,
} from "@/lib/types";
import {
  Home,
  TrendingUp,
  AlertTriangle,
  Sliders,
  Database,
  FileText,
  Settings as SettingsIcon,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Sparkles,
  ShieldAlert,
  ArrowUpRight,
  Info,
} from "lucide-react";

type HorizonKey = "7" | "14" | "30";
type TabKey = "overview" | "cashflow" | "risks" | "scenarios" | "data" | "reports" | "settings";

function cloneRequest(request: ForecastRequest): ForecastRequest {
  return structuredClone(request);
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function emptyRequest(): ForecastRequest {
  return {
    current_cash_balance: "",
    reserve_target: "",
    as_of_date: "",
    include_uncertain_income: false,
    income: [],
    expenses: [],
  };
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [form, setForm] = useState<ForecastRequest>(emptyRequest);
  const [health, setHealth] = useState<string>("Checking forecast API…");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ForecastResponse | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiExplanationError, setAiExplanationError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ForecastResponse | null>(null);
  const [horizonKey, setHorizonKey] = useState<HorizonKey>("7");
  const [scenarioUncertain, setScenarioUncertain] = useState(false);
  const [scenarioReserve, setScenarioReserve] = useState("");
  const [deferExpenseId, setDeferExpenseId] = useState("");
  const [deferDays, setDeferDays] = useState("7");

  useEffect(() => {
    void checkBackendHealth().then((result) => {
      setHealthOk(result.ok);
      setHealth(result.message);
    });
  }, []);

  const selectedHorizon: HorizonForecast | undefined = baseline?.horizons[horizonKey];
  const scenarioHorizon: HorizonForecast | undefined = scenario?.horizons[horizonKey];

  const uncertainIds = useMemo(
    () => form.income.filter((item) => item.status === "uncertain").map((item) => item.id),
    [form.income],
  );

  function loadDemoInputs() {
    setForm(cloneRequest(DEMO_FORECAST_REQUEST));
    setScenario(null);
    setError(null);
    setScenarioReserve(DEMO_FORECAST_REQUEST.reserve_target);
    setScenarioUncertain(false);
    setDeferExpenseId(DEMO_FORECAST_REQUEST.expenses[0]?.id ?? "");
  }

  // async function runForecast(event: FormEvent) {
  //   event.preventDefault();
  //   setLoading(true);
  //   setError(null);
  //   setScenario(null);
  //   const result = await postForecast(form);
  //   setLoading(false);
  //   if (!result.ok) {
  //     setBaseline(null);
  //     setError(result.message);
  //     return;
  //   }
  //   setBaseline(result.data);
  //   setScenarioReserve(form.reserve_target);
  //   setScenarioUncertain(form.include_uncertain_income);
  //   setDeferExpenseId(form.expenses[0]?.id ?? "");
  // }

  
  async function runForecast(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setScenario(null);
    setAiExplanation(null);
    setAiExplanationError(null);

    const result = await postForecast(form);
    setLoading(false);

    if (!result.ok) {
      setBaseline(null);
      setAiExplanation(null);
      setError(result.message);
      return;
    }

    setBaseline(result.data);
    setScenarioReserve(form.reserve_target);
    setScenarioUncertain(form.include_uncertain_income);
    setDeferExpenseId(form.expenses[0]?.id ?? "");

    setAiExplanationLoading(true);
    try {
      const explanationResult = await explainForecast(result.data);
      if (explanationResult.explanation) {
        setAiExplanation(explanationResult.explanation);
      } else {
        setAiExplanationError(
          explanationResult.error || "No explanation was returned."
        );
      }
    } catch (err) {
      setAiExplanationError(
        err instanceof Error
          ? err.message
          : "Could not load the AI explanation."
      );
    } finally {
      setAiExplanationLoading(false);
    }
  }


  async function runScenario() {
    if (!baseline) {
      setError("Run a baseline forecast from the API before comparing a scenario.");
      return;
    }
    const payload = cloneRequest(form);
    payload.include_uncertain_income = scenarioUncertain;
    if (scenarioReserve.trim()) {
      payload.reserve_target = scenarioReserve.trim();
    }
    const days = Number(deferDays);
    if (deferExpenseId && Number.isInteger(days) && days !== 0) {
      payload.expenses = payload.expenses.map((item) =>
        item.id === deferExpenseId
          ? { ...item, due_date: shiftIsoDate(item.due_date, days) }
          : item,
      );
    }
    setScenarioLoading(true);
    setError(null);
    const result = await postForecast(payload);
    setScenarioLoading(false);
    if (!result.ok) {
      setScenario(null);
      setError(result.message);
      return;
    }
    setScenario(result.data);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased selection:bg-teal-500 selection:text-white">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center text-slate-950 font-bold text-lg shadow-sm">
              P
            </div>
            <div>
              <span className="text-base font-semibold text-white tracking-tight block">PaisaPilot</span>
              <span className="text-xs text-slate-400 font-mono">AI Cash Engine</span>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1 text-sm font-medium flex-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "overview" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Home className="w-4 h-4 text-teal-400" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab("cashflow")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "cashflow" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span>Cash Flow</span>
          </button>
          <button
            onClick={() => setActiveTab("risks")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "risks" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Risk Alerts</span>
          </button>
          <button
            onClick={() => setActiveTab("scenarios")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "scenarios" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-4 h-4 text-teal-400" />
            <span>Scenarios</span>
          </button>
          <button
            onClick={() => setActiveTab("data")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "data" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Database className="w-4 h-4 text-teal-400" />
            <span>Transactions & Ledger</span>
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "reports" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4 text-slate-400" />
            <span>Reports (Planned)</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "settings" ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-slate-400" />
            <span>Settings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${healthOk ? "bg-emerald-500" : healthOk === false ? "bg-rose-500" : "bg-amber-500"}`} />
            <span className="font-mono text-slate-400">{healthOk ? "FastAPI Connected" : "Checking API"}</span>
          </div>
          <span>Hackathon Engine v0.1</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span>PaisaPilot AI</span>
                <span>/</span>
                <span className="capitalize text-slate-800 font-semibold">{activeTab}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {activeTab === "overview" && "Cash-Flow Intelligence Overview"}
                {activeTab === "cashflow" && "Cash-Flow Horizon & Chart"}
                {activeTab === "risks" && "Reserve Breach & Risk Monitor"}
                {activeTab === "scenarios" && "What-If Scenario Modeling"}
                {activeTab === "data" && "Transaction Ledger & Inputs"}
                {activeTab === "reports" && "Financial Reports"}
                {activeTab === "settings" && "API & Engine Settings"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium">
              {(["7", "14", "30"] as HorizonKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setHorizonKey(key)}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    horizonKey === key ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {key}d Horizon
                </button>
              ))}
            </div>
            <button
              onClick={loadDemoInputs}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              Load Demo Inputs
            </button>
          </div>
        </header>

        {/* Global Error Notice */}
        {error ? (
          <div className="m-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3" role="alert">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Forecast API Error</span>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {/* Content View Routing */}
        <div className="p-6 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {/* Notice Banner */}
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Deterministic Calculation Notice</span>
                  <span>{DEMO_INPUTS_NOTICE} Projections are estimates generated by FastAPI based strictly on your dated entries.</span>
                </div>
              </div>

              {/* KPI Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
                    <span>Current Cash Balance</span>
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                    {displayApiAmount(baseline?.evidence.starting_cash_balance)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">As of {baseline?.evidence.as_of_date || form.as_of_date || "—"}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
                    <span>{horizonKey}-Day Projected Balance</span>
                    <ArrowUpRight className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                    {displayApiAmount(selectedHorizon?.projected_balance)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Reserve target: {displayApiAmount(baseline?.evidence.reserve_target || form.reserve_target)}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
                    <span>Reserve Gap</span>
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                    {displayApiAmount(selectedHorizon?.reserve_gap)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Min projected: {displayApiAmount(selectedHorizon?.minimum_projected_balance)}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
                    <span>Reserve Breach Risk</span>
                    {selectedHorizon?.first_date_below_reserve ? (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="text-lg font-bold tracking-tight text-slate-900 font-mono">
                    {selectedHorizon?.first_date_below_reserve ? `Breach on ${selectedHorizon.first_date_below_reserve}` : "No Breach in Horizon"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Conservative inclusion model</div>
                </div>
              </div>

              {/* Chart & AI Investigation Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Cash-Flow Trajectory</h2>
                      <p className="text-xs text-slate-500">Daily balances mapped against your reserve threshold</p>
                    </div>
                    <div className="text-xs font-mono bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                      {baseline ? "FastAPI Data Active" : "No Forecast Run"}
                    </div>
                  </div>

                  {!baseline && !loading ? (
                    <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
                      <p>No forecast calculated yet. Load demo inputs or submit your cash balance & dated ledger.</p>
                      <button
                        onClick={loadDemoInputs}
                        className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                      >
                        Load Demo & Run Forecast
                      </button>
                    </div>
                  ) : loading ? (
                    <div className="py-20 text-center text-slate-500 text-sm">Requesting FastAPI forecast estimate…</div>
                  ) : (
                    <ForecastChart horizon={selectedHorizon} reserveTarget={baseline?.evidence.reserve_target} />
                  )}
                </div>

                {/* AI Investigation Panel */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-teal-600 font-semibold text-sm mb-3">
                      <Sparkles className="w-4 h-4" />
                      <span>AI Intelligence & Evidence</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-2">Evidence Trace Analysis</h3>

                                        
                    {aiExplanationLoading && (
                      <p className="mb-3 rounded-lg border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">
                        Generating forecast explanation...
                      </p>
                    )}

                    {aiExplanation && (
                      <div className="mb-3 rounded-lg border border-teal-100 bg-teal-50 p-3 text-xs leading-relaxed text-slate-700">
                        <p className="mb-1 font-semibold text-teal-800">
                          AI Forecast Explanation
                        </p>
                        <p className="whitespace-pre-wrap">{aiExplanation}</p>
                      </div>
                    )}

                    {aiExplanationError && (
                      <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Explanation unavailable: {aiExplanationError}
                      </p>
                    )}

                    {baseline ? (
                      <div className="space-y-3 text-xs text-slate-600">
                        <p className="p-3 bg-slate-50 rounded-lg border border-slate-100 leading-relaxed">
                          {baseline.evidence.note}
                        </p>
                        <div className="space-y-1.5 font-mono text-[11px]">
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="text-slate-500">Conservative Income:</span>
                            <span className="text-slate-800">{baseline.evidence.conservative_income_ids.join(", ") || "none"}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="text-slate-500">Uncertain Excluded:</span>
                            <span className="text-slate-800">{baseline.evidence.uncertain_income_ids.join(", ") || "none"}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="text-slate-500">Same-Day Rule:</span>
                            <span className="text-slate-800">Expenses first</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Run a baseline forecast to unlock AI trace explanations, same-day settlement order, and transaction inclusion audits.
                      </p>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setActiveTab("cashflow")}
                      className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                    >
                      Inspect Full Cash Flow & Ledger
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: CASH FLOW & INPUTS */}
          {activeTab === "cashflow" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form onSubmit={runForecast} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Financial Ledger Inputs</h2>
                  <button
                    type="button"
                    onClick={loadDemoInputs}
                    className="text-xs text-teal-600 font-semibold hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1"
                  >
                    Load Demo Data
                  </button>
                </div>

                {uncertainIds.length > 0 && !form.include_uncertain_income ? (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                    Uncertain income IDs excluded by default: {uncertainIds.join(", ")}
                  </p>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Current Cash Balance ($)</label>
                    <input
                      required
                      inputMode="decimal"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-600 font-mono"
                      value={form.current_cash_balance}
                      onChange={(e) => setForm({ ...form, current_cash_balance: e.target.value })}
                      placeholder="1000.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reserve Target ($)</label>
                    <input
                      required
                      inputMode="decimal"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-600 font-mono"
                      value={form.reserve_target}
                      onChange={(e) => setForm({ ...form, reserve_target: e.target.value })}
                      placeholder="400.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">As Of Date</label>
                    <input
                      required
                      type="date"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-600 font-mono"
                      value={form.as_of_date}
                      onChange={(e) => setForm({ ...form, as_of_date: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        checked={form.include_uncertain_income}
                        onChange={(e) => setForm({ ...form, include_uncertain_income: e.target.checked })}
                      />
                      Include uncertain income
                    </label>
                  </div>
                </div>

                {/* Income Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900">Income Streams</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          income: [
                            ...form.income,
                            { id: newId("inc"), amount: "", expected_date: form.as_of_date, status: "scheduled" },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-750 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Income
                    </button>
                  </div>
                  <div className="space-y-3">
                    {form.income.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <input
                          aria-label="Income ID"
                          className="w-28 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          value={item.id}
                          onChange={(e) => {
                            const income = [...form.income];
                            income[index] = { ...item, id: e.target.value };
                            setForm({ ...form, income });
                          }}
                        />
                        <input
                          aria-label="Income amount"
                          className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          inputMode="decimal"
                          placeholder="Amount"
                          value={item.amount}
                          onChange={(e) => {
                            const income = [...form.income];
                            income[index] = { ...item, amount: e.target.value };
                            setForm({ ...form, income });
                          }}
                        />
                        <input
                          aria-label="Expected date"
                          type="date"
                          className="w-32 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          value={item.expected_date}
                          onChange={(e) => {
                            const income = [...form.income];
                            income[index] = { ...item, expected_date: e.target.value };
                            setForm({ ...form, income });
                          }}
                        />
                        <select
                          aria-label="Income status"
                          className="w-28 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25 cursor-pointer"
                          value={item.status}
                          onChange={(e) => {
                            const income = [...form.income];
                            income[index] = { ...item, status: e.target.value as IncomeStatus };
                            setForm({ ...form, income });
                          }}
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="uncertain">Uncertain</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, income: form.income.filter((_, i) => i !== index) })}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                          aria-label="Remove income stream"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expenses Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900">Expenses & Obligations</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          expenses: [
                            ...form.expenses,
                            { id: newId("exp"), amount: "", due_date: form.as_of_date, description: "" },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-750 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Expense
                    </button>
                  </div>
                  <div className="space-y-3">
                    {form.expenses.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <input
                          aria-label="Expense ID"
                          className="w-28 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          value={item.id}
                          onChange={(e) => {
                            const expenses = [...form.expenses];
                            expenses[index] = { ...item, id: e.target.value };
                            setForm({ ...form, expenses });
                          }}
                        />
                        <input
                          aria-label="Expense amount"
                          className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          inputMode="decimal"
                          placeholder="Amount"
                          value={item.amount}
                          onChange={(e) => {
                            const expenses = [...form.expenses];
                            expenses[index] = { ...item, amount: e.target.value };
                            setForm({ ...form, expenses });
                          }}
                        />
                        <input
                          aria-label="Due date"
                          type="date"
                          className="w-32 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          value={item.due_date}
                          onChange={(e) => {
                            const expenses = [...form.expenses];
                            expenses[index] = { ...item, due_date: e.target.value };
                            setForm({ ...form, expenses });
                          }}
                        />
                        <input
                          aria-label="Expense description"
                          className="w-36 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => {
                            const expenses = [...form.expenses];
                            expenses[index] = { ...item, description: e.target.value };
                            setForm({ ...form, expenses });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, expenses: form.expenses.filter((_, i) => i !== index) })}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                          aria-label="Remove expense obligation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {loading ? "Calculating FastAPI Estimate…" : "Run Deterministic Forecast"}
                </button>
              </form>

              {/* Live Preview / Results Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 mb-4">Forecast Results & Summary</h2>
                  {baseline && selectedHorizon ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Disclaimer</span>
                        <p className="text-xs text-slate-700 leading-relaxed">{baseline.disclaimer}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                          <span className="text-xs text-slate-500 block">Starting Cash</span>
                          <span className="text-lg font-bold font-mono">{displayApiAmount(baseline.evidence.starting_cash_balance)}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                          <span className="text-xs text-slate-500 block">{horizonKey}d Ending Balance</span>
                          <span className="text-lg font-bold font-mono">{displayApiAmount(selectedHorizon.projected_balance)}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Reserve Target:</span>
                          <span className="font-mono font-semibold">{displayApiAmount(baseline.evidence.reserve_target)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Reserve Gap:</span>
                          <span className="font-mono font-semibold">{displayApiAmount(selectedHorizon.reserve_gap)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">First Date Below Reserve:</span>
                          <span className="font-mono font-semibold text-rose-600">{selectedHorizon.first_date_below_reserve ?? "None in horizon"}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-24 text-center text-slate-400 text-sm">
                      Submit valid ledger inputs on the left to view FastAPI projection metrics.
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                  <span>FastAPI Deterministic Engine</span>
                  <button
                    onClick={() => setActiveTab("overview")}
                    className="text-teal-600 font-semibold hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1"
                  >
                    View Chart Overview →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: RISK ALERTS */}
          {activeTab === "risks" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Upcoming Risk & Breach Analysis</h2>
                    <p className="text-xs text-slate-500">Real-time alerts derived from FastAPI daily projections and reserve gaps</p>
                  </div>
                </div>

                {baseline && selectedHorizon ? (
                  <div className="space-y-4">
                    {selectedHorizon.first_date_below_reserve ? (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold text-rose-900">Reserve Breach Detected</h3>
                          <p className="text-xs text-rose-700 mt-1">
                            Within the {horizonKey}-day horizon, projected cash balance falls below your reserve target of ${baseline.evidence.reserve_target} on <span className="font-semibold">{selectedHorizon.first_date_below_reserve}</span>.
                          </p>
                          <div className="mt-3 text-xs text-rose-800 font-mono">
                            End-of-horizon reserve gap: {displayApiAmount(selectedHorizon.reserve_gap)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold text-emerald-900">No Reserve Breach in {horizonKey}-Day Horizon</h3>
                          <p className="text-xs text-emerald-700 mt-1">
                            Your cash balance remains safely at or above the reserve target throughout the selected forecast period.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Uncertain Income Audit</h4>
                      <p className="text-xs text-slate-600">
                        {baseline.evidence.include_uncertain_income
                          ? "Uncertain income items are currently INCLUDED in this conservative projection."
                          : `Uncertain income items (${baseline.evidence.uncertain_income_ids.join(", ") || "none"}) are excluded by default in conservative mode.`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center text-slate-400 text-sm">
                    Run a forecast on the Cash Flow tab to generate real risk alerts.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: SCENARIOS */}
          {activeTab === "scenarios" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">What-If Scenario Modeling</h2>
                    <p className="text-xs text-slate-500">Test income inclusion, reserve thresholds, and expense deferrals against baseline</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      checked={scenarioUncertain}
                      onChange={(e) => setScenarioUncertain(e.target.checked)}
                    />
                    Include uncertain income in scenario
                  </label>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Scenario Reserve Target ($)</label>
                    <input
                      inputMode="decimal"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/25 font-mono"
                      value={scenarioReserve}
                      onChange={(e) => setScenarioReserve(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Defer Expense</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                      value={deferExpenseId}
                      onChange={(e) => setDeferExpenseId(e.target.value)}
                    >
                      <option value="">Do not defer</option>
                      {form.expenses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} — {item.description || "expense"} (${item.amount})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Days to Defer</label>
                    <input
                      inputMode="numeric"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/25 font-mono"
                      value={deferDays}
                      onChange={(e) => setDeferDays(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={scenarioLoading || !baseline}
                  onClick={() => void runScenario()}
                  className="px-6 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                >
                  {scenarioLoading ? "Calculating Scenario…" : "Run Scenario Forecast"}
                </button>

                {scenario && scenarioHorizon && selectedHorizon ? (
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Baseline Estimate</span>
                      <div className="text-2xl font-bold font-mono text-slate-900">{displayApiAmount(selectedHorizon.projected_balance)}</div>
                      <div className="text-xs text-slate-600">
                        First below reserve: <span className="font-semibold text-slate-900">{selectedHorizon.first_date_below_reserve ?? "None"}</span>
                      </div>
                    </div>

                    <div className="p-5 bg-teal-50/50 border border-teal-200 rounded-xl space-y-3">
                      <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Scenario Estimate</span>
                      <div className="text-2xl font-bold font-mono text-slate-900">{displayApiAmount(scenarioHorizon.projected_balance)}</div>
                      <div className="text-xs text-slate-600">
                        First below reserve: <span className="font-semibold text-slate-900">{scenarioHorizon.first_date_below_reserve ?? "None"}</span>
                      </div>
                      <div className="text-xs text-teal-800 font-mono">
                        Uncertain included: {scenario.evidence.include_uncertain_income ? "yes" : "no"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 p-4 bg-slate-50 text-slate-500 text-xs text-center rounded-lg">
                    Run a baseline forecast first, then apply scenario parameters above to compare outcomes.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: TRANSACTIONS & DATA LEDGER */}
          {activeTab === "data" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h2 className="text-base font-bold text-slate-900 mb-1">Transaction & Event Evidence Ledger</h2>
                <p className="text-xs text-slate-500 mb-6">Auditing inclusion reasons, balance after event, and reserve gaps returned by FastAPI</p>

                {!baseline ? (
                  <div className="py-16 text-center text-slate-400 text-sm">
                    No transaction evidence yet. Run a forecast on the Cash Flow tab.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                          <th className="p-3">ID</th>
                          <th className="p-3">Kind</th>
                          <th className="p-3">Date</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3 text-center">Included</th>
                          <th className="p-3 text-right">Balance After</th>
                          <th className="p-3 text-right">Reserve Gap After</th>
                          <th className="p-3">Exclusion Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {baseline.events.map((event) => (
                          <tr key={event.transaction_id} className={event.included_in_forecast ? "hover:bg-slate-50" : "bg-slate-50/60 text-slate-400"}>
                            <td className="p-3 font-semibold text-slate-800">{event.transaction_id}</td>
                            <td className="p-3 capitalize">{event.kind}</td>
                            <td className="p-3">{event.date}</td>
                            <td className="p-3 text-right font-semibold">{displayApiAmount(event.amount)}</td>
                            <td className="p-3 text-center">
                              {event.included_in_forecast ? (
                                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px]">Yes</span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px]">No</span>
                              )}
                            </td>
                            <td className="p-3 text-right">{displayApiAmount(event.projected_balance_after)}</td>
                            <td className="p-3 text-right">{displayApiAmount(event.reserve_gap_after)}</td>
                            <td className="p-3 text-slate-500">{event.exclusion_reason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: REPORTS (Planned) */}
          {activeTab === "reports" && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Financial Reports (Planned Feature)</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Automated monthly cash-flow PDF export and executive audit summaries. This view is planned for future releases.
              </p>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === "settings" && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
              <h2 className="text-base font-bold text-slate-900">Engine & API Health Status</h2>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Forecast Service Endpoint:</span>
                  <span className="font-mono text-slate-800">http://127.0.0.1:8000</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">API Health Status:</span>
                  <span className={`font-semibold ${healthOk ? "text-emerald-600" : "text-amber-600"}`}>{health}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
