"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { ChatPanel } from "@/components/ChatPanel";
import { checkBackendHealth, postForecast } from "@/lib/client";
import { explainForecast, saveAgentMemory, searchAgentMemory } from "@/lib/agent-client";
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
  Search,
  Download,
  Printer,
  RefreshCw,
  Server,
  Cpu,
  ShieldCheck,
  Menu,
  X,
  Globe,
  BotMessageSquare,
} from "lucide-react";

type HorizonKey = "7" | "14" | "30";
type TabKey = "overview" | "cashflow" | "risks" | "scenarios" | "chat" | "data" | "reports" | "settings";

const TAB_LABELS: Record<TabKey, { en: string; ur: string }> = {
  overview: { en: "Overview", ur: "جائزہ" },
  cashflow: { en: "Cash Flow", ur: "کیش فلو" },
  risks: { en: "Risk Alerts", ur: "خطرات کے انتباہات" },
  scenarios: { en: "Scenarios", ur: "منظر نامے" },
  chat: { en: "Ask PaisaPilot", ur: "آسک پیسہ پائلٹ" },
  data: { en: "Transactions & Ledger", ur: "کھاتہ و لین دین" },
  reports: { en: "Forecast Reports", ur: "رپورٹس" },
  settings: { en: "Settings", ur: "ترتیبات" },
};

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

type RetrievedMemoryItem = {
  memory?: {
    id?: string;
    content?: string;
    type?: string;
    confidence?: number;
    timestamp?: number;
    provenance?: {
      label?: string;
      learnedAt?: number;
      origin?: string;
    };
  };
  relevance?: number;
  id?: string;
  content?: string;
  type?: string;
  confidence?: number;
  timestamp?: number;
  provenance?: {
    label?: string;
    learnedAt?: number;
    origin?: string;
  };
};

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState<"en" | "ur">("en");
  const [form, setForm] = useState<ForecastRequest>(emptyRequest);
  const [health, setHealth] = useState<string>("Checking forecast API…");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ForecastResponse | null>(null);
  const [scenario, setScenario] = useState<ForecastResponse | null>(null);
  const [activeForecastMode, setActiveForecastMode] = useState<"baseline" | "scenario">("baseline");
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiExplanationError, setAiExplanationError] = useState<string | null>(null);
  const [horizonKey, setHorizonKey] = useState<HorizonKey>("7");
  const [scenarioUncertain, setScenarioUncertain] = useState(false);
  const [scenarioReserve, setScenarioReserve] = useState("");
  const [deferExpenseId, setDeferExpenseId] = useState("");
  const [deferDays, setDeferDays] = useState("7");

  // H-MEM Investigation Notes & Memory state
  const [noteContent, setNoteContent] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("deterministic");
  const [isSearchingMemory, setIsSearchingMemory] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retrievedMemories, setRetrievedMemories] = useState<RetrievedMemoryItem[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // System Diagnostics & Settings state
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [lastHealthCheckTime, setLastHealthCheckTime] = useState<string | null>(null);
  const [aiExplanationMode, setAiExplanationMode] = useState<"openrouter" | "nemotron" | "fallback" | "unknown">("unknown");
  const [aiDiagnosticMessage, setAiDiagnosticMessage] = useState<string | null>(null);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiLastTestedAt, setAiLastTestedAt] = useState<string | null>(null);
  const [isTestingMemory, setIsTestingMemory] = useState(false);
  const [memoryTestMessage, setMemoryTestMessage] = useState<string | null>(null);

  async function handleCheckHealth() {
    setIsCheckingHealth(true);
    try {
      const result = await checkBackendHealth();
      setHealthOk(result.ok);
      setHealth(result.message);
      setLastHealthCheckTime(new Date().toLocaleTimeString());
    } catch (err) {
      setHealthOk(false);
      setHealth(err instanceof Error ? err.message : "Health check request failed.");
      setLastHealthCheckTime(new Date().toLocaleTimeString());
    } finally {
      setIsCheckingHealth(false);
    }
  }

  async function handleTestAiDiagnostic() {
    setIsTestingAi(true);
    setAiDiagnosticMessage(null);
    try {
      let targetBaseline = baseline;
      if (!targetBaseline) {
        const demoRes = await postForecast(cloneRequest(DEMO_FORECAST_REQUEST));
        if (demoRes.ok) {
          targetBaseline = demoRes.data;
          setBaseline(demoRes.data);
        } else {
          setAiExplanationMode("unknown");
          setAiDiagnosticMessage(`Cannot test AI mode: FastAPI service unreachable (${demoRes.message}).`);
          return;
        }
      }
      const explanationResult = await explainForecast(targetBaseline);
      setAiLastTestedAt(new Date().toLocaleTimeString());
      if (explanationResult.mode === "openrouter") {
        setAiExplanationMode("openrouter");
        setAiDiagnosticMessage("Confirmed: OpenRouter AI live response received.");
      } else if (explanationResult.mode === "nemotron") {
        setAiExplanationMode("nemotron");
        setAiDiagnosticMessage("Confirmed: NVIDIA Nemotron live response received.");
      } else if (explanationResult.mode === "fallback") {
        setAiExplanationMode("fallback");
        setAiDiagnosticMessage(
          explanationResult.explanation?.includes("No AI API key")
            ? "Confirmed: Deterministic fallback active (No AI API key is configured)."
            : `Confirmed: Deterministic fallback active (${explanationResult.explanation?.slice(0, 80) || "fallback mode"}).`
        );
      } else {
        setAiExplanationMode("unknown");
        setAiDiagnosticMessage("Unconfirmed: Explanation endpoint returned unexpected payload format.");
      }
    } catch (err) {
      setAiExplanationMode("unknown");
      setAiDiagnosticMessage(err instanceof Error ? err.message : "Diagnostic test failed to reach AI explanation API.");
    } finally {
      setIsTestingAi(false);
    }
  }

  async function handleTestMemoryEngine() {
    setIsTestingMemory(true);
    setMemoryTestMessage(null);
    try {
      const result = await searchAgentMemory(memoryQuery.trim() || "deterministic");
      if (result.error) {
        setMemoryTestMessage(`Error: ${result.error}`);
      } else {
        const count = result.memories ? result.memories.length : 0;
        setRetrievedMemories((result.memories as RetrievedMemoryItem[]) || []);
        setMemoryTestMessage(`Success: Retrieved ${count} matching institutional notes from .notebook-agent/ ledger.`);
      }
    } catch (err) {
      setMemoryTestMessage(err instanceof Error ? err.message : "Failed to query H-MEM.");
    } finally {
      setIsTestingMemory(false);
    }
  }

  async function handleSearchMemory(queryToSearch?: string) {
    const q = (typeof queryToSearch === "string" ? queryToSearch : memoryQuery).trim();
    if (!q) {
      setSearchError("Please enter a search keyword or query.");
      return;
    }

    setIsSearchingMemory(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const result = await searchAgentMemory(q);
      if (result.error) {
        setSearchError(result.error);
        setRetrievedMemories([]);
      } else {
        setRetrievedMemories((result.memories as RetrievedMemoryItem[]) || []);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to query H-MEM memory.");
      setRetrievedMemories([]);
    } finally {
      setIsSearchingMemory(false);
    }
  }

  async function handleSaveNote(event: FormEvent) {
    event.preventDefault();
    const trimmed = noteContent.trim();
    if (!trimmed) {
      setSaveError("Investigation note cannot be empty.");
      return;
    }
    if (trimmed.length > 500) {
      setSaveError("Investigation note exceeds 500 characters limit.");
      return;
    }

    const forbiddenPatterns = [/balance/i, /api_key/i, /password/i, /secret/i, /credit_card/i, /\$\d/];
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(trimmed)) {
        setSaveError(
          "Privacy protection: Content contains restricted financial patterns or keywords (e.g. balance, api_key, password, dollar amounts). Please record only high-level investigation rationale."
        );
        return;
      }
    }

    setIsSavingNote(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const result = await saveAgentMemory(trimmed);
      if (result.ok) {
        setSaveSuccess("Investigation note successfully committed to H-MEM persistence ledger.");
        setNoteContent("");
        void handleSearchMemory(memoryQuery.trim() || trimmed.slice(0, 30));
      } else {
        setSaveError(result.error || "Failed to save memory.");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to connect to the memory service.");
    } finally {
      setIsSavingNote(false);
    }
  }

  useEffect(() => {
    void checkBackendHealth().then((result) => {
      setHealthOk(result.ok);
      setHealth(result.message);
      setLastHealthCheckTime(new Date().toLocaleTimeString());
    });

    let isMounted = true;
    setIsSearchingMemory(true);
    setHasSearched(true);
    searchAgentMemory("deterministic")
      .then((result) => {
        if (!isMounted) return;
        if (result.error) {
          setSearchError(result.error);
        } else {
          setRetrievedMemories((result.memories as RetrievedMemoryItem[]) || []);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setSearchError(err instanceof Error ? err.message : "Failed to query H-MEM memory.");
      })
      .finally(() => {
        if (isMounted) setIsSearchingMemory(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const activeForecast: ForecastResponse | null =
    activeForecastMode === "scenario" && scenario ? scenario : baseline;

  const selectedHorizon: HorizonForecast | undefined = activeForecast?.horizons[horizonKey];
  const baselineHorizon: HorizonForecast | undefined = baseline?.horizons[horizonKey];
  const scenarioHorizon: HorizonForecast | undefined = scenario?.horizons[horizonKey];

  const uncertainIds = useMemo(
    () => form.income.filter((item) => item.status === "uncertain").map((item) => item.id),
    [form.income],
  );

  function loadDemoInputs() {
    setForm(cloneRequest(DEMO_FORECAST_REQUEST));
    setScenario(null);
    setActiveForecastMode("baseline");
    setError(null);
    setScenarioReserve(DEMO_FORECAST_REQUEST.reserve_target);
    setScenarioUncertain(false);
    setDeferExpenseId(DEMO_FORECAST_REQUEST.expenses[0]?.id ?? "");
  }

  async function executeForecast(targetPayload: ForecastRequest) {
    setLoading(true);
    setError(null);
    setScenario(null);
    setActiveForecastMode("baseline");
    setAiExplanation(null);
    setAiExplanationError(null);

    const result = await postForecast(targetPayload);
    setLoading(false);

    if (!result.ok) {
      setBaseline(null);
      setAiExplanation(null);
      setError(result.message);
      return;
    }

    setBaseline(result.data);
    setScenarioReserve(targetPayload.reserve_target);
    setScenarioUncertain(targetPayload.include_uncertain_income);
    setDeferExpenseId(targetPayload.expenses[0]?.id ?? "");

    setAiExplanationLoading(true);
    try {
      const explanationResult = await explainForecast(result.data);
      setAiLastTestedAt(new Date().toLocaleTimeString());
      if (explanationResult.mode === "openrouter") {
        setAiExplanationMode("openrouter");
        setAiDiagnosticMessage("Confirmed: OpenRouter AI live response received.");
      } else if (explanationResult.mode === "nemotron") {
        setAiExplanationMode("nemotron");
        setAiDiagnosticMessage("Confirmed: NVIDIA Nemotron live response received.");
      } else if (explanationResult.mode === "fallback") {
        setAiExplanationMode("fallback");
        setAiDiagnosticMessage("Confirmed: Deterministic fallback active.");
      } else {
        setAiExplanationMode("unknown");
      }

      if (explanationResult.explanation) {
        setAiExplanation(explanationResult.explanation);
      } else {
        setAiExplanationError(
          explanationResult.error || "No explanation was returned."
        );
      }
    } catch (err) {
      setAiExplanationMode("unknown");
      setAiExplanationError(
        err instanceof Error
          ? err.message
          : "Could not load the AI explanation."
      );
    } finally {
      setAiExplanationLoading(false);
    }
  }

  async function loadAndRunDemoForecast() {
    const demoPayload = cloneRequest(DEMO_FORECAST_REQUEST);
    setForm(demoPayload);
    await executeForecast(demoPayload);
  }

  async function runForecast(event: FormEvent) {
    event.preventDefault();
    await executeForecast(form);
  }

  function downloadCsv() {
    const targetForecast = activeForecast;
    const targetHorizon = selectedHorizon;
    if (!targetForecast || !targetHorizon) return;
    const rows = [
      ["Date", "Projected Balance", "Reserve Target", "Below Reserve", "Reserve Gap", "Transaction IDs"],
      ...targetHorizon.daily_balances.map((day) => [
        day.date,
        day.projected_balance,
        targetForecast.evidence.reserve_target,
        day.below_reserve ? "YES" : "NO",
        day.reserve_gap,
        day.transaction_ids.join(";") || "none",
      ]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.map((val) => `"${val}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paisapilot-forecast-${horizonKey}d-${targetForecast.evidence.as_of_date || "report"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadHtmlReport() {
    const targetForecast = activeForecast;
    const targetHorizon = selectedHorizon;
    if (!targetForecast || !targetHorizon) return;
    const H = "ht" + "ml";
    const B = "bo" + "dy";
    const reportHtml = `<!DOCTYPE html>
<${H}>
<head>
  <meta charset="utf-8">
  <title>PaisaPilot AI — Cash-Flow Forecast Report (${horizonKey}d)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #0f172a; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #0f172a; border-bottom: 2px solid #0d9488; padding-bottom: 8px; font-size: 24px; }
    h2 { color: #1e293b; font-size: 16px; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi-title { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .kpi-value { font-size: 18px; font-weight: bold; font-family: monospace; color: #0f172a; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
    th { background: #f1f5f9; color: #475569; }
    .breach { color: #e11d48; font-weight: bold; background: #fff1f2; }
    .notice { background: #fefce8; border: 1px solid #fef08a; padding: 12px; border-radius: 6px; font-size: 12px; color: #854d0e; margin: 16px 0; }
    .note-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-size: 12px; margin: 12px 0; }
    @media print { body { max-width: 100%; margin: 0; padding: 0; } }
</head>
<${B}>
  <h1>PaisaPilot AI — Cash-Flow Forecast & Audit Report</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleString()} | Active Mode: ${activeForecastMode === "scenario" ? "What-If Scenario Forecast" : "Baseline Forecast"} | As of Date: ${targetForecast.evidence.as_of_date} | Horizon: ${horizonKey} Days | Engine: FastAPI Deterministic + H-MEM
  </div>

  <div class="notice">
    <strong>Decision-Support Notice:</strong> ${targetForecast.disclaimer} All projections are estimates calculated strictly from dated ledger items and do not constitute financial advice.
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-title">Starting Balance</div>
      <div class="kpi-value">${displayApiAmount(targetForecast.evidence.starting_cash_balance)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-title">${horizonKey}d Ending Balance</div>
      <div class="kpi-value">${displayApiAmount(targetHorizon.projected_balance)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-title">Reserve Target</div>
      <div class="kpi-value">${displayApiAmount(targetForecast.evidence.reserve_target)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-title">Reserve Breach Risk</div>
      <div class="kpi-value">${targetHorizon.first_date_below_reserve ? "Breach: " + targetHorizon.first_date_below_reserve : "Safe (No Breach)"}</div>
    </div>
  </div>

  <h2>AI Evidence & Trace Summary</h2>
  <div class="note-box">
    <strong>Trace Rationale:</strong> ${targetForecast.evidence.note}<br>
    <strong>Conservative Inclusions:</strong> ${targetForecast.evidence.conservative_income_ids.join(", ") || "None"}<br>
    <strong>Uncertain Inclusions (Excluded by default):</strong> ${targetForecast.evidence.uncertain_income_ids.join(", ") || "None"}<br>
    <strong>Settlement Order:</strong> Expenses applied first on same calendar day
    ${aiExplanation ? `<br><br><strong>Executive AI Summary:</strong> ${aiExplanation}` : ""}
  </div>

  <h2>Daily Cash Projections (${horizonKey} Days)</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Projected Ending Balance</th>
        <th>Reserve Gap</th>
        <th>Status</th>
        <th>Transactions on Date</th>
      </tr>
    </thead>
    <tbody>
      ${targetHorizon.daily_balances.map((d) => `
        <tr class="${d.below_reserve ? "breach" : ""}">
          <td>${d.date}</td>
          <td>${displayApiAmount(d.projected_balance)}</td>
          <td>${displayApiAmount(d.reserve_gap)}</td>
          <td>${d.below_reserve ? "BELOW RESERVE" : "Healthy"}</td>
          <td>${d.transaction_ids.join(", ") || "None"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  ${baseline && scenario && baselineHorizon && scenarioHorizon ? `
  <h2>What-If Scenario Comparison</h2>
  <div class="note-box">
    <strong>Baseline ${horizonKey}d Balance:</strong> ${displayApiAmount(baselineHorizon.projected_balance)} (Breach: ${baselineHorizon.first_date_below_reserve ?? "None"})<br>
    <strong>Scenario ${horizonKey}d Balance:</strong> ${displayApiAmount(scenarioHorizon.projected_balance)} (Breach: ${scenarioHorizon.first_date_below_reserve ?? "None"})<br>
    <strong>Scenario Uncertain Income Included:</strong> ${scenario.evidence.include_uncertain_income ? "Yes" : "No"}<br>
    <strong>Scenario Reserve Target:</strong> ${displayApiAmount(scenario.evidence.reserve_target)}
  </div>
  ` : ""}

  ${retrievedMemories && retrievedMemories.length > 0 ? `
  <h2>H-MEM Institutional Investigation Notes</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Type</th>
        <th>Investigation Note</th>
        <th>Recorded At</th>
      </tr>
    </thead>
    <tbody>
      ${retrievedMemories.map((m) => {
        const rec = m.memory || m;
        return `<tr>
          <td>${rec.id || "-"}</td>
          <td>${rec.type || "general"}</td>
          <td>${rec.content || ""}</td>
          <td>${rec.timestamp ? new Date(rec.timestamp).toLocaleString() : "Audit Log"}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
  ` : ""}
</${B}>
</${H}>`;

    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paisapilot-report-${horizonKey}d-${targetForecast.evidence.as_of_date || "audit"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handlePrintReport() {
    if (typeof window !== "undefined") {
      window.print();
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
      setError(result.message);
      return;
    }
    setScenario(result.data);
    setActiveForecastMode("scenario");

    setAiExplanationLoading(true);
    try {
      const explanationResult = await explainForecast(result.data);
      if (explanationResult.explanation) {
        setAiExplanation(explanationResult.explanation);
      }
    } catch {
      // ignore explanation error on scenario
    } finally {
      setAiExplanationLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased selection:bg-teal-500 selection:text-white"
      dir={lang === "ur" ? "rtl" : "ltr"}
    >
      {/* Mobile Top App Bar (visible on < md) */}
      <div className="md:hidden bg-slate-900 text-slate-200 border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-slate-950 font-bold text-base shadow-xs shrink-0">
            P
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-white tracking-tight block truncate">PaisaPilot AI</span>
            <span className="text-[10px] text-teal-400 font-mono block truncate">{TAB_LABELS[activeTab][lang]}</span>
          </div>
        </div>

        <div className="flex items-center shrink-0">
          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-drawer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-teal-400" /> : <Menu className="w-5 h-5 text-teal-400" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Dropdown Menu */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-drawer"
          className="fixed top-[53px] inset-x-0 bg-slate-900 border-b border-slate-800 p-3.5 space-y-3 shadow-2xl z-50 max-h-[calc(100vh-60px)] overflow-y-auto md:hidden"
          role="dialog"
          aria-label={lang === "ur" ? "نیویگیشن مینو" : "Navigation Menu"}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {lang === "ur" ? "نیویگیشن مینو" : "Navigation Menu"}
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              aria-label="Close navigation menu"
            >
              <X className="w-3.5 h-3.5 text-teal-400" />
              <span>{lang === "ur" ? "بند کریں" : "Close"}</span>
            </button>
          </div>

          {/* Quick Action Controls Inside Drawer */}
          <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
            {/* Language Toggle */}
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "ur" : "en")}
              className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              title="Toggle English / اردو"
              aria-label="Toggle language between English and Urdu"
            >
              <Globe className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="truncate">{lang === "en" ? "اردو" : "EN"}</span>
            </button>

            {/* Quick Demo Run */}
            <button
              type="button"
              onClick={() => {
                void loadAndRunDemoForecast();
                setMobileMenuOpen(false);
              }}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              title="Load & Run Demo Forecast"
              aria-label="Run demo forecast"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{lang === "ur" ? "ڈیمو" : "Run Demo"}</span>
            </button>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1">
            {(
              [
                { key: "overview", label: TAB_LABELS.overview[lang], icon: Home },
                { key: "cashflow", label: TAB_LABELS.cashflow[lang], icon: TrendingUp },
                { key: "risks", label: TAB_LABELS.risks[lang], icon: AlertTriangle },
                { key: "scenarios", label: TAB_LABELS.scenarios[lang], icon: Sliders },
                { key: "chat", label: TAB_LABELS.chat[lang], icon: BotMessageSquare },
                { key: "data", label: TAB_LABELS.data[lang], icon: Database },
                { key: "reports", label: TAB_LABELS.reports[lang], icon: FileText },
                { key: "settings", label: TAB_LABELS.settings[lang], icon: SettingsIcon },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isCurrent = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                    isCurrent ? "bg-teal-600 text-white font-semibold shadow-xs" : "text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isCurrent ? "text-white" : "text-teal-400"}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Drawer Footer Status */}
          <div className="pt-2 mt-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${healthOk ? "bg-emerald-500" : healthOk === false ? "bg-rose-500" : "bg-amber-500"}`} />
              <span className="font-mono text-[11px]">{healthOk ? "FastAPI Connected" : "Checking API"}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">v0.1.0</span>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Navigation (hidden on mobile, visible on md+) */}
      <aside className="hidden md:flex md:w-64 bg-slate-900 text-slate-300 flex-col shrink-0 border-r border-slate-800 min-h-screen">
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
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "ur" : "en")}
            className="p-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer flex items-center gap-1"
            title="Switch Language / زبان تبدیل کریں"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-[10px] font-mono">{lang === "en" ? "اردو" : "EN"}</span>
          </button>
        </div>

        <nav className="p-4 space-y-1 text-sm font-medium flex-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "overview" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Home className="w-4 h-4 text-teal-400" />
            <span>{TAB_LABELS.overview[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("cashflow")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "cashflow" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span>{TAB_LABELS.cashflow[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("risks")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "risks" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>{TAB_LABELS.risks[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("scenarios")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "scenarios" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-4 h-4 text-teal-400" />
            <span>{TAB_LABELS.scenarios[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "chat" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <BotMessageSquare className="w-4 h-4 text-teal-400" />
            <span>{TAB_LABELS.chat[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("data")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "data" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Database className="w-4 h-4 text-teal-400" />
            <span>{TAB_LABELS.data[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "reports" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4 text-teal-400" />
            <span>{TAB_LABELS.reports[lang]}</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeTab === "settings" ? "bg-slate-800 text-white font-semibold" : "hover:bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-slate-400" />
            <span>{TAB_LABELS.settings[lang]}</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${healthOk ? "bg-emerald-500" : healthOk === false ? "bg-rose-500" : "bg-amber-500"}`} />
            <span className="font-mono text-slate-400">{healthOk ? "FastAPI Connected" : "Checking API"}</span>
          </div>
          <span>Hackathon Engine v0.1.0</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-0 z-10 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span>PaisaPilot AI</span>
                <span>/</span>
                <span className="capitalize text-slate-800 font-semibold">{TAB_LABELS[activeTab][lang]}</span>
              </div>
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 truncate">
                {activeTab === "overview" && (lang === "ur" ? "کیش فلو انٹیلیجنس جائزہ" : "Cash-Flow Intelligence Overview")}
                {activeTab === "cashflow" && (lang === "ur" ? "کیش فلو تخمینہ و چارٹ" : "Cash-Flow Horizon & Chart")}
                {activeTab === "risks" && (lang === "ur" ? "ریزرو خطرات کی نگرانی" : "Reserve Breach & Risk Monitor")}
                {activeTab === "scenarios" && (lang === "ur" ? "منظر نامے کی ماڈلنگ" : "What-If Scenario Modeling")}
                {activeTab === "chat" && (lang === "ur" ? "آسک پیسہ پائلٹ AI چیٹ" : "Ask PaisaPilot AI Financial Q&A")}
                {activeTab === "data" && (lang === "ur" ? "کھاتہ و لین دین کا اندراج" : "Transaction Ledger & Inputs")}
                {activeTab === "reports" && (lang === "ur" ? "ایگزیکٹو رپورٹ و آڈٹ" : "Executive Forecast & Audit Reports")}
                {activeTab === "settings" && (lang === "ur" ? "سسٹم اسٹیٹس و ترتیبات" : "System Status & Engine Architecture")}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {scenario && (
              <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveForecastMode("baseline")}
                  className={`px-2.5 py-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeForecastMode === "baseline"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Switch to Baseline Forecast"
                >
                  {lang === "ur" ? "بنیادی" : "Baseline"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveForecastMode("scenario")}
                  className={`px-2.5 py-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeForecastMode === "scenario"
                      ? "bg-teal-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Switch to Scenario Forecast"
                >
                  {lang === "ur" ? "منظر نامہ" : "Scenario"}
                </button>
              </div>
            )}

            <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium flex-1 sm:flex-none justify-center">
              {(["7", "14", "30"] as HorizonKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setHorizonKey(key)}
                  className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 text-center ${
                    horizonKey === key ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {key}d{lang === "ur" ? " دن" : " Horizon"}
                </button>
              ))}
            </div>
            <button
              onClick={() => void loadAndRunDemoForecast()}
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>{loading ? "Calculating…" : lang === "ur" ? "ڈیمو تخمینہ چلائیں" : "Load & Run Demo Forecast"}</span>
            </button>
          </div>
        </header>

        {/* Global Error Notice */}
        {error ? (
          <div className="mx-3.5 sm:mx-6 my-3 p-3.5 sm:p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs sm:text-sm flex items-start gap-3" role="alert">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Forecast API Error</span>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {/* Content View Routing */}
        <div className="p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
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

              {/* Active Scenario Indicator Banner */}
              {activeForecastMode === "scenario" && scenario && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 text-teal-900 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="font-semibold">
                      {lang === "ur"
                        ? "منظر نامہ فورکاسٹ فعال ہے - ڈیش بورڈ منظر نامے کے نتائج دکھا رہا ہے۔"
                        : "Scenario Forecast Active — Displaying what-if scenario metrics across Dashboard & Cash Flow."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveForecastMode("baseline")}
                    className="text-xs font-bold text-teal-700 hover:text-teal-950 underline cursor-pointer shrink-0"
                  >
                    {lang === "ur" ? "بنیادی حالت پر واپس جائیں" : "Switch to Baseline Forecast"}
                  </button>
                </div>
              )}

              {/* KPI Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
                    <span>Current Cash Balance</span>
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                    {displayApiAmount(activeForecast?.evidence.starting_cash_balance)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">As of {activeForecast?.evidence.as_of_date || form.as_of_date || "—"}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
                    <span>{horizonKey}-Day Projected Balance</span>
                    <ArrowUpRight className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                    {displayApiAmount(selectedHorizon?.projected_balance)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Reserve target: {displayApiAmount(activeForecast?.evidence.reserve_target || form.reserve_target)}</div>
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
                  <div className="text-xs text-slate-500 mt-1">
                    {activeForecastMode === "scenario" ? "Scenario Inclusion Model" : "Conservative Inclusion Model"}
                  </div>
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
                      {activeForecast ? (activeForecastMode === "scenario" ? "Scenario Forecast Active" : "FastAPI Data Active") : "No Forecast Run"}
                    </div>
                  </div>

                  {!activeForecast && !loading ? (
                    <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
                      <p>No forecast calculated yet. Load demo inputs or submit your cash balance & dated ledger.</p>
                      <button
                        onClick={() => void loadAndRunDemoForecast()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {loading ? "Calculating Forecast…" : "Load & Run Demo Forecast"}
                      </button>
                    </div>
                  ) : loading ? (
                    <div className="py-20 text-center text-slate-500 text-sm">Requesting FastAPI forecast estimate…</div>
                  ) : (
                    <ForecastChart horizon={selectedHorizon} reserveTarget={activeForecast?.evidence.reserve_target} />
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
                          AI Forecast Explanation ({activeForecastMode === "scenario" ? "Scenario Mode" : "Baseline Mode"})
                        </p>
                        <p className="whitespace-pre-wrap">{aiExplanation}</p>
                      </div>
                    )}

                    {aiExplanationError && (
                      <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Explanation unavailable: {aiExplanationError}
                      </p>
                    )}

                    {activeForecast ? (
                      <div className="space-y-3 text-xs text-slate-600">
                        <p className="p-3 bg-slate-50 rounded-lg border border-slate-100 leading-relaxed">
                          {activeForecast.evidence.note}
                        </p>
                        <div className="space-y-1.5 font-mono text-[11px]">
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="text-slate-500">Conservative Income:</span>
                            <span className="text-slate-800">{activeForecast.evidence.conservative_income_ids.join(", ") || "none"}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="text-slate-500">Uncertain Income:</span>
                            <span className="text-slate-800">{activeForecast.evidence.uncertain_income_ids.join(", ") || "none"}</span>
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

              {/* Investigation Notes & Memory Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-50 rounded-xl text-teal-600 border border-teal-100/60">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">Investigation Notes & Memory</h2>
                        <span className="px-2.5 py-0.5 text-[10px] font-mono font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded-full">
                          H-MEM Reference Engine
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Store high-level forecast investigation notes and recall institutional memory across runs
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Column 1: Save Investigation Note */}
                  <div className="flex flex-col justify-between p-5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Commit Investigation Note</h3>
                        <span className={`text-[11px] font-mono font-medium ${noteContent.length > 500 ? "text-rose-600 font-semibold" : noteContent.length > 450 ? "text-amber-600" : "text-slate-400"}`}>
                          {noteContent.length} / 500 chars
                        </span>
                      </div>

                      {/* Privacy Notice Banner */}
                      <div className="mb-3 p-3 bg-amber-50/80 border border-amber-200/70 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <span className="font-semibold block">Privacy Allowlist Policy</span>
                          <span>Do not enter specific bank balances, account numbers, dollar amounts, passwords, or API keys. Record only high-level decision rationale and risk assumptions.</span>
                        </div>
                      </div>

                      <form onSubmit={handleSaveNote} className="space-y-3">
                        <textarea
                          aria-label="Investigation note content"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-600 bg-white placeholder:text-slate-400 font-sans resize-none"
                          rows={4}
                          maxLength={500}
                          placeholder="e.g., Reviewed 7-day reserve breach: postponing insurance expense resolves cash dip before confirmed client payout."
                          value={noteContent}
                          onChange={(e) => setNoteContent(e.target.value)}
                        />

                        {saveSuccess && (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{saveSuccess}</span>
                          </div>
                        )}

                        {saveError && (
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <span>{saveError}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-500 font-mono">Actor: paisapilot-agent</span>
                          <button
                            type="submit"
                            disabled={isSavingNote || !noteContent.trim() || noteContent.trim().length > 500}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                          >
                            {isSavingNote ? "Committing to Ledger…" : "Save Note to H-MEM"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Column 2: Query & Recall Memories */}
                  <div className="flex flex-col p-5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Search Relevant Memories</h3>
                        <span className="text-[11px] text-slate-500 font-mono">Hybrid Semantic & Keyword</span>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1">
                          <input
                            aria-label="Search query for memories"
                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-600 bg-white placeholder:text-slate-400"
                            placeholder="Search memories (e.g. deterministic, rent, reserve)..."
                            value={memoryQuery}
                            onChange={(e) => setMemoryQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleSearchMemory();
                              }
                            }}
                          />
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>
                        <button
                          type="button"
                          disabled={isSearchingMemory || !memoryQuery.trim()}
                          onClick={() => void handleSearchMemory()}
                          className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                        >
                          {isSearchingMemory ? "Recalling…" : "Search"}
                        </button>
                      </div>

                      {searchError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2 mb-3">
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{searchError}</span>
                        </div>
                      )}

                      {/* Results Container */}
                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                        {isSearchingMemory ? (
                          <div className="py-12 text-center text-slate-500 text-xs">
                            Querying H-MEM hybrid retrieval index…
                          </div>
                        ) : retrievedMemories && retrievedMemories.length > 0 ? (
                          retrievedMemories.map((item, idx) => {
                            const record = item.memory || item;
                            const content = record.content || "";
                            const id = record.id || `mem-${idx}`;
                            const type = record.type;
                            const confidence = typeof record.confidence === "number" ? Math.round(record.confidence * 100) : undefined;
                            const provenanceLabel = record.provenance?.label;
                            const learnedAt = record.timestamp || record.provenance?.learnedAt;
                            const relevance = typeof item.relevance === "number" ? Math.round(item.relevance * 100) : undefined;

                            return (
                              <div key={id} className="p-3 bg-white rounded-lg border border-slate-200/90 shadow-2xs space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                                    {id}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    {type && (
                                      <span className="capitalize px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                                        {type}
                                      </span>
                                    )}
                                    {confidence !== undefined && (
                                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                                        conf: {confidence}%
                                      </span>
                                    )}
                                    {relevance !== undefined && (
                                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-mono font-medium">
                                        score: {relevance}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-slate-800 leading-relaxed font-sans">{content}</p>
                                {(provenanceLabel || learnedAt) && (
                                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                                    <span>{provenanceLabel || "H-MEM Record"}</span>
                                    {learnedAt && <span>{new Date(learnedAt).toLocaleString()}</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : hasSearched ? (
                          <div className="py-12 text-center text-slate-400 text-xs">
                            No matching memories found in H-MEM for &ldquo;{memoryQuery}&rdquo;.
                          </div>
                        ) : (
                          <div className="py-12 text-center text-slate-400 text-xs">
                            Enter a keyword above to retrieve past investigation notes from the persistent ledger.
                          </div>
                        )}
                      </div>
                    </div>
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
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-slate-600 text-[11px]">Income #{index + 1} ({item.id})</span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, income: form.income.filter((_, i) => i !== index) })}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                            aria-label="Remove income stream"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">ID</label>
                            <input
                              aria-label="Income ID"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              value={item.id}
                              onChange={(e) => {
                                const income = [...form.income];
                                income[index] = { ...item, id: e.target.value };
                                setForm({ ...form, income });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Amount ($)</label>
                            <input
                              aria-label="Income amount"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              inputMode="decimal"
                              placeholder="Amount"
                              value={item.amount}
                              onChange={(e) => {
                                const income = [...form.income];
                                income[index] = { ...item, amount: e.target.value };
                                setForm({ ...form, income });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Expected Date</label>
                            <input
                              aria-label="Expected date"
                              type="date"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              value={item.expected_date}
                              onChange={(e) => {
                                const income = [...form.income];
                                income[index] = { ...item, expected_date: e.target.value };
                                setForm({ ...form, income });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Status</label>
                            <select
                              aria-label="Income status"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25 cursor-pointer"
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
                          </div>
                        </div>
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
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-slate-600 text-[11px]">Expense #{index + 1} ({item.id})</span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, expenses: form.expenses.filter((_, i) => i !== index) })}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                            aria-label="Remove expense obligation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">ID</label>
                            <input
                              aria-label="Expense ID"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              value={item.id}
                              onChange={(e) => {
                                const expenses = [...form.expenses];
                                expenses[index] = { ...item, id: e.target.value };
                                setForm({ ...form, expenses });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Amount ($)</label>
                            <input
                              aria-label="Expense amount"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              inputMode="decimal"
                              placeholder="Amount"
                              value={item.amount}
                              onChange={(e) => {
                                const expenses = [...form.expenses];
                                expenses[index] = { ...item, amount: e.target.value };
                                setForm({ ...form, expenses });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Due Date</label>
                            <input
                              aria-label="Due date"
                              type="date"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              value={item.due_date}
                              onChange={(e) => {
                                const expenses = [...form.expenses];
                                expenses[index] = { ...item, due_date: e.target.value };
                                setForm({ ...form, expenses });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Description</label>
                            <input
                              aria-label="Expense description"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                              placeholder="Description"
                              value={item.description}
                              onChange={(e) => {
                                const expenses = [...form.expenses];
                                expenses[index] = { ...item, description: e.target.value };
                                setForm({ ...form, expenses });
                              }}
                            />
                          </div>
                        </div>
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
                  {activeForecast && selectedHorizon ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
                        <span className="font-semibold text-slate-600 uppercase tracking-wider">Active Forecast Mode</span>
                        <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-[10px] ${activeForecastMode === "scenario" ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-800"}`}>
                          {activeForecastMode === "scenario" ? "What-If Scenario Active" : "Baseline Active"}
                        </span>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Disclaimer</span>
                        <p className="text-xs text-slate-700 leading-relaxed">{activeForecast.disclaimer}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                          <span className="text-xs text-slate-500 block">Starting Cash</span>
                          <span className="text-lg font-bold font-mono">{displayApiAmount(activeForecast.evidence.starting_cash_balance)}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                          <span className="text-xs text-slate-500 block">{horizonKey}d Ending Balance</span>
                          <span className="text-lg font-bold font-mono">{displayApiAmount(selectedHorizon.projected_balance)}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Reserve Target:</span>
                          <span className="font-mono font-semibold">{displayApiAmount(activeForecast.evidence.reserve_target)}</span>
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

                {activeForecast && selectedHorizon ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
                      <span className="font-semibold text-slate-600 uppercase tracking-wider">Active Risk Evaluation Target</span>
                      <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-[10px] ${activeForecastMode === "scenario" ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-800"}`}>
                        {activeForecastMode === "scenario" ? "What-If Scenario Active" : "Baseline Active"}
                      </span>
                    </div>

                    {selectedHorizon.first_date_below_reserve ? (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold text-rose-900">Reserve Breach Detected</h3>
                          <p className="text-xs text-rose-700 mt-1">
                            Within the {horizonKey}-day horizon, projected cash balance falls below your reserve target of ${activeForecast.evidence.reserve_target} on <span className="font-semibold">{selectedHorizon.first_date_below_reserve}</span>.
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
                        {activeForecast.evidence.include_uncertain_income
                          ? "Uncertain income items are currently INCLUDED in this active projection."
                          : `Uncertain income items (${activeForecast.evidence.uncertain_income_ids.join(", ") || "none"}) are excluded by default in conservative mode.`}
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

                {scenario && scenarioHorizon && baselineHorizon ? (
                  <div className="mt-8 space-y-4 pt-6 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Baseline Estimate</span>
                        <div className="text-2xl font-bold font-mono text-slate-900">{displayApiAmount(baselineHorizon.projected_balance)}</div>
                        <div className="text-xs text-slate-600">
                          First below reserve: <span className="font-semibold text-slate-900">{baselineHorizon.first_date_below_reserve ?? "None"}</span>
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

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold text-slate-800 block">Active Forecast View:</span>
                        <span className="text-slate-500">
                          {activeForecastMode === "scenario"
                            ? "Scenario forecast results are currently displayed across Dashboard, Cash Flow, and Reports."
                            : "Baseline forecast results are currently displayed across Dashboard, Cash Flow, and Reports."}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveForecastMode("baseline")}
                          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                            activeForecastMode === "baseline"
                              ? "bg-slate-800 text-white shadow-xs"
                              : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          Use Baseline
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveForecastMode("scenario")}
                          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                            activeForecastMode === "scenario"
                              ? "bg-teal-600 text-white shadow-xs"
                              : "bg-white text-teal-700 border border-teal-300 hover:bg-teal-50"
                          }`}
                        >
                          Use Scenario
                        </button>
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

          {/* TAB: ASK PAISAPILOT CHAT */}
          {activeTab === "chat" && (
            <ChatPanel activeForecast={activeForecast} lang={lang} />
          )}

          {/* TAB: TRANSACTIONS & DATA LEDGER */}
          {activeTab === "data" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h2 className="text-base font-bold text-slate-900 mb-1">Transaction & Event Evidence Ledger</h2>
                <p className="text-xs text-slate-500 mb-6">Auditing inclusion reasons, balance after event, and reserve gaps returned by FastAPI</p>

                {!activeForecast ? (
                  <div className="py-16 text-center text-slate-400 text-sm">
                    No transaction evidence yet. Run a forecast on the Cash Flow tab.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span>Displaying ledger event sequence for: <strong className="text-slate-800 font-semibold">{activeForecastMode === "scenario" ? "Scenario Forecast" : "Baseline Forecast"}</strong></span>
                      <span className="font-mono text-[11px]">{activeForecast.events.length} events processed</span>
                    </div>
                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                      <table className="w-full text-left border-collapse text-xs min-w-[680px]">
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
                          {activeForecast.events.map((event) => (
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
                </div>
              )}
            </div>
          </div>
        )}

          {/* TAB: REPORTS */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              {!activeForecast || !selectedHorizon ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4 shadow-xs">
                  <div className="w-14 h-14 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-center mx-auto text-teal-600">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900">No Forecast Data Available for Reporting</h2>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                      Generate a cash-flow projection or load the verified demo dataset to compile, preview, and download executive audit reports and CSVs.
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => void loadAndRunDemoForecast()}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      {loading ? "Running Forecast..." : "Load & Run Demo Forecast"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Action Header Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-teal-700 font-semibold mb-1">
                        <FileText className="w-4 h-4 text-teal-600" />
                        <span>Executive Audit & Projections Report</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500 font-mono">{horizonKey}-Day Horizon</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeForecastMode === "scenario" ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-800"}`}>
                          {activeForecastMode === "scenario" ? "Scenario Mode" : "Baseline Mode"}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                        PaisaPilot Cash-Flow Forecast Report
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        As of <span className="font-mono text-slate-700 font-medium">{activeForecast.evidence.as_of_date}</span> • Starting Balance: <span className="font-mono text-slate-700 font-medium">{displayApiAmount(activeForecast.evidence.starting_cash_balance)}</span> • Reserve Target: <span className="font-mono text-slate-700 font-medium">{displayApiAmount(activeForecast.evidence.reserve_target)}</span>
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                      <button
                        type="button"
                        onClick={downloadCsv}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs font-medium rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        title="Export projected daily balances, targets, and transaction IDs to CSV"
                      >
                        <Download className="w-3.5 h-3.5 text-teal-600" />
                        <span>Download CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={downloadHtmlReport}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-teal-600 text-white hover:bg-teal-700 text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        title="Download standalone HTML audit report with styled KPI cards and tables"
                      >
                        <Download className="w-3.5 h-3.5 text-teal-100" />
                        <span>Download Report (HTML)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePrintReport}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                        title="Print or save as PDF using system print dialogue"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-300" />
                        <span>Print / Save PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Decision Support Disclaimer Notice */}
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold block">Decision-Support Report Notice</span>
                      <p className="text-amber-800 leading-relaxed">
                        {activeForecast.disclaimer} All figures, breach projections, and scenario outcomes reflect scheduled ledger transactions and policy assumptions. They are estimates for operational planning and do not constitute professional accounting, tax, or legal advice.
                      </p>
                    </div>
                  </div>

                  {/* Executive KPI Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Starting Balance</span>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                        {displayApiAmount(activeForecast.evidence.starting_cash_balance)}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">Ledger as of {activeForecast.evidence.as_of_date}</span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Ending Projected Balance</span>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                        {displayApiAmount(selectedHorizon.projected_balance)}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">At day {horizonKey} of forecast horizon</span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Minimum Balance & Gap</span>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                        {displayApiAmount(selectedHorizon.minimum_projected_balance)}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Gap: <span className="font-mono font-medium text-slate-700">{displayApiAmount(selectedHorizon.reserve_gap)}</span> (Target: {displayApiAmount(activeForecast.evidence.reserve_target)})
                      </span>
                    </div>

                    <div className={`border rounded-xl p-4 shadow-xs ${selectedHorizon.first_date_below_reserve ? "bg-rose-50/50 border-rose-200" : "bg-emerald-50/50 border-emerald-200"}`}>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider block ${selectedHorizon.first_date_below_reserve ? "text-rose-700" : "text-emerald-700"}`}>
                        Breach Status ({horizonKey}d)
                      </span>
                      <div className={`text-xl font-bold mt-1 ${selectedHorizon.first_date_below_reserve ? "text-rose-700" : "text-emerald-700"}`}>
                        {selectedHorizon.first_date_below_reserve ? `Breached: ${selectedHorizon.first_date_below_reserve}` : "No Breach"}
                      </div>
                      <span className={`text-[11px] mt-1 block ${selectedHorizon.first_date_below_reserve ? "text-rose-600" : "text-emerald-600"}`}>
                        {selectedHorizon.first_date_below_reserve ? "Projected cash drops below target reserve" : "Maintains target liquidity cushion"}
                      </span>
                    </div>
                  </div>

                  {/* AI Risk & Trace Section */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-teal-600" />
                        <h3 className="text-sm font-bold text-slate-900">AI Risk Assessment & Engine Audit Trace</h3>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        Deterministic Ruleset • Expenses Settled First
                      </span>
                    </div>

                    {aiExplanation ? (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-xs text-slate-700 space-y-2">
                        <span className="font-semibold text-slate-900 block">Synthesized Risk Summary ({activeForecastMode === "scenario" ? "Scenario Mode" : "Baseline Mode"}):</span>
                        <p className="leading-relaxed whitespace-pre-wrap">{aiExplanation}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No AI explanation generated yet. Switch to the Overview tab to generate Nemotron / deterministic AI insights.
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                        <span className="text-slate-500 font-medium">Confirmed Incomes:</span>
                        <div className="font-mono font-semibold text-slate-800">
                          {activeForecast.evidence.conservative_income_ids.length > 0
                            ? activeForecast.evidence.conservative_income_ids.join(", ")
                            : "None"}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                        <span className="text-slate-500 font-medium">Uncertain Incomes:</span>
                        <div className="font-mono font-semibold text-slate-800">
                          {activeForecast.evidence.uncertain_income_ids.length > 0
                            ? activeForecast.evidence.uncertain_income_ids.join(", ")
                            : "None"}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                        <span className="text-slate-500 font-medium">Scheduled Expenses:</span>
                        <div className="font-mono font-semibold text-slate-800">
                          {activeForecast.evidence.expense_ids.length > 0
                            ? activeForecast.evidence.expense_ids.join(", ")
                            : "None"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Daily Balances Projection Table */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Projected Daily Balances & Reserve Gaps</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Chronological daily balance ledger for the active {horizonKey}-day forecast horizon</p>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{selectedHorizon.daily_balances.length} days projected</span>
                    </div>

                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                      <table className="w-full text-xs text-left border-collapse min-w-[620px]">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-3.5">Date</th>
                            <th className="p-3.5 text-right">Projected Balance</th>
                            <th className="p-3.5 text-right">Reserve Target</th>
                            <th className="p-3.5 text-right">Reserve Gap</th>
                            <th className="p-3.5 text-center">Status</th>
                            <th className="p-3.5">Settled Transaction IDs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {selectedHorizon.daily_balances.map((day) => (
                            <tr
                              key={day.date}
                              className={`transition-colors ${
                                day.below_reserve ? "bg-rose-50/40 hover:bg-rose-50/70" : "hover:bg-slate-50/60"
                              }`}
                            >
                              <td className="p-3.5 font-medium text-slate-900">{day.date}</td>
                              <td className="p-3.5 text-right font-semibold text-slate-900">
                                {displayApiAmount(day.projected_balance)}
                              </td>
                              <td className="p-3.5 text-right text-slate-500">
                                {displayApiAmount(activeForecast.evidence.reserve_target)}
                              </td>
                              <td className={`p-3.5 text-right font-semibold ${day.below_reserve ? "text-rose-600" : "text-emerald-600"}`}>
                                {displayApiAmount(day.reserve_gap)}
                              </td>
                              <td className="p-3.5 text-center">
                                {day.below_reserve ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-rose-100 text-rose-700">
                                    Breach
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-emerald-100 text-emerald-700">
                                    Healthy
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-slate-500 text-[11px]">
                                {day.transaction_ids.length > 0 ? day.transaction_ids.join(", ") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Scenario Comparison Section (if scenario is modeled) */}
                  {scenario && scenarioHorizon && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Sliders className="w-4 h-4 text-teal-600" />
                        <h3 className="text-sm font-bold text-slate-900">What-If Scenario Comparison Audit</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500 block">Baseline {horizonKey}d Balance</span>
                          <span className="text-base font-bold font-mono text-slate-900 mt-1 block">
                            {displayApiAmount(selectedHorizon.projected_balance)}
                          </span>
                        </div>
                        <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
                          <span className="text-teal-700 block">Scenario {horizonKey}d Balance</span>
                          <span className="text-base font-bold font-mono text-teal-900 mt-1 block">
                            {displayApiAmount(scenarioHorizon.projected_balance)}
                          </span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500 block">Baseline Breach Date</span>
                          <span className="text-sm font-semibold font-mono text-slate-800 mt-1 block">
                            {selectedHorizon.first_date_below_reserve ?? "None"}
                          </span>
                        </div>
                        <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
                          <span className="text-teal-700 block">Scenario Breach Date</span>
                          <span className="text-sm font-semibold font-mono text-teal-900 mt-1 block">
                            {scenarioHorizon.first_date_below_reserve ?? "None"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Institutional Memory Section (if recalled) */}
                  {retrievedMemories && retrievedMemories.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Sparkles className="w-4 h-4 text-teal-600" />
                        <h3 className="text-sm font-bold text-slate-900">H-MEM Institutional Investigation Notes Included</h3>
                      </div>
                      <div className="space-y-2">
                        {retrievedMemories.map((m, idx) => {
                          const record = m.memory || m;
                          return (
                            <div key={record.id || idx} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                                <span>Note ID: {record.id || `mem-${idx}`}</span>
                                <span>{record.timestamp ? new Date(record.timestamp).toLocaleString() : "Audit Note"}</span>
                              </div>
                              <p className="text-slate-800">{record.content}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB: SETTINGS & SYSTEM STATUS */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-teal-700 font-semibold mb-1">
                    <Server className="w-4 h-4 text-teal-600" />
                    <span>System Architecture & Engine Telemetry</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    PaisaPilot AI Engine & Service Status
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live connection status, verified AI model modes, H-MEM ledger state, and privacy safeguards.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => void handleCheckHealth()}
                    disabled={isCheckingHealth}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 w-full sm:w-auto"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? "animate-spin" : ""}`} />
                    <span>{isCheckingHealth ? "Checking Services…" : "Re-test Connection"}</span>
                  </button>
                </div>
              </div>

              {/* 4 Core System Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. FastAPI Backend Service */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-100 rounded-xl text-slate-700">
                        <Server className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Deterministic Forecast API</h3>
                        <span className="text-[11px] font-mono text-slate-500">FastAPI • Python 3</span>
                      </div>
                    </div>
                    <div>
                      {isCheckingHealth ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Checking
                        </span>
                      ) : healthOk === true ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          Unavailable
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-600">
                      <span className="font-medium text-slate-500">Target Endpoint:</span>
                      <span className="font-mono text-slate-800 break-all">http://127.0.0.1:8000</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-600">
                      <span className="font-medium text-slate-500">Proxy Gateway:</span>
                      <span className="font-mono text-slate-800 break-all">/api/forecast & /api/health</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-600">
                      <span className="font-medium text-slate-500">Last Verified:</span>
                      <span className="text-slate-700 font-mono">{lastHealthCheckTime || "Initial check on load"}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {health}
                  </p>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => void handleCheckHealth()}
                      disabled={isCheckingHealth}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingHealth ? "animate-spin" : ""}`} />
                      <span>Test Forecast API Health</span>
                    </button>
                  </div>
                </div>

                {/* 2. AI Explanation Engine (Nemotron vs Fallback) */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-teal-50 rounded-xl text-teal-600">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">AI Risk Explanation Engine</h3>
                        <span className="text-[11px] font-mono text-slate-500">NVIDIA NIM / Nemotron</span>
                      </div>
                    </div>
                    <div>
                      {aiExplanationMode === "openrouter" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                          Live OpenRouter AI
                        </span>
                      ) : aiExplanationMode === "nemotron" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          Live Nemotron
                        </span>
                      ) : aiExplanationMode === "fallback" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
                          Deterministic Fallback
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Info className="w-3.5 h-3.5 text-amber-600" />
                          Unknown / Not Tested
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-600">
                      <span className="font-medium text-slate-500">Provider Status:</span>
                      <span className="font-mono text-slate-800 break-all">{aiExplanationMode === "openrouter" ? "OpenRouter AI Engine" : aiExplanationMode === "nemotron" ? "NVIDIA Nemotron NIM" : "Deterministic Rules Engine"}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-600">
                      <span className="font-medium text-slate-500">Last Verified:</span>
                      <span className="text-slate-700 font-mono">{aiLastTestedAt || "Not verified in session"}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {aiExplanationMode === "openrouter"
                        ? "Active mode: Live OpenRouter AI endpoint confirmed. Generates natural language risk audit based strictly on computed forecast evidence."
                        : aiExplanationMode === "nemotron"
                        ? "Active mode: Live NVIDIA Nemotron NIM endpoint confirmed. Generates natural language risk audit based strictly on computed forecast evidence."
                        : aiExplanationMode === "fallback"
                        ? "Active mode: Deterministic fallback enabled. Rule-based risk summary is synthesized without external API reliance."
                        : "Mode is confirmed only upon live request. Live AI is never inferred from configuration alone."}
                    </p>
                    {aiDiagnosticMessage && (
                      <p className="text-[11px] font-mono text-teal-700 bg-teal-50/60 p-2 rounded border border-teal-100">
                        {aiDiagnosticMessage}
                      </p>
                    )}
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => void handleTestAiDiagnostic()}
                      disabled={isTestingAi}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-3 h-3 ${isTestingAi ? "animate-spin text-teal-600" : ""}`} />
                      <span>{isTestingAi ? "Testing AI Mode…" : "Run AI Diagnostic Test"}</span>
                    </button>
                  </div>
                </div>

                {/* 3. H-MEM Institutional Memory & Persistence */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-teal-50 rounded-xl text-teal-600">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">H-MEM Investigation Memory</h3>
                        <span className="text-[11px] font-mono text-slate-500">vendor/hmem Reference Engine</span>
                      </div>
                    </div>
                    <div>
                      {searchError ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          Error
                        </span>
                      ) : retrievedMemories !== null ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          Active & Persistent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <Info className="w-3.5 h-3.5 text-slate-500" />
                          Idle
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-2">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium text-slate-500">Storage Location:</span>
                      <span className="font-mono text-slate-800">.notebook-agent/ (Trust Ledger)</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium text-slate-500">Active Query Matches:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {retrievedMemories !== null ? `${retrievedMemories.length} notes matched` : "Not queried yet"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium text-slate-500">Total Count Metric:</span>
                      <span className="text-slate-500 italic text-[11px]">Not exposed by query API (unverified counts omitted)</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      H-MEM stores persistent investigation notes with provenance tracking and hybrid semantic retrieval. Per design specifications, only verified query match counts are displayed.
                    </p>
                    {memoryTestMessage && (
                      <p className="text-[11px] font-mono text-teal-700 bg-teal-50/60 p-2 rounded border border-teal-100">
                        {memoryTestMessage}
                      </p>
                    )}
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => void handleTestMemoryEngine()}
                      disabled={isTestingMemory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Database className={`w-3 h-3 ${isTestingMemory ? "animate-spin text-teal-600" : ""}`} />
                      <span>{isTestingMemory ? "Querying H-MEM…" : "Test Memory Retrieval"}</span>
                    </button>
                  </div>
                </div>

                {/* 4. Security, Privacy & Secret Protection */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Privacy & Secret Shield</h3>
                        <span className="text-[11px] font-mono text-slate-500">Client-Side Zero Leakage</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Enforced
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-2">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium text-slate-500">API Key Exposure:</span>
                      <span className="font-mono text-emerald-700 font-semibold">Masked / Server-side only</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium text-slate-500">Financial PII Gate:</span>
                      <span className="font-mono text-emerald-700 font-semibold">Regex blocked from memory</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium text-slate-500">Banking Integrations:</span>
                      <span className="text-slate-700 font-mono">None (user-supplied inputs only)</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    PaisaPilot AI operates without live bank feeds or account credentials. Secrets and API keys are never rendered in the DOM or returned in diagnostic payloads.
                  </p>

                  <div className="pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Compliance with hackathon privacy boundaries verified
                    </span>
                  </div>
                </div>
              </div>

              {/* System Architecture Specifications */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Engine Configuration & Specification Matrix</h3>
                  <span className="text-xs font-mono text-slate-400">PaisaPilot AI v0.1.0</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <span className="font-bold text-slate-900 block">Forecast Math Rules</span>
                    <ul className="text-slate-600 space-y-1.5 list-disc list-inside">
                      <li>Same-day expenses deducted before income credits</li>
                      <li>Uncertain incomes excluded from baseline projections</li>
                      <li>7, 14, and 30-day discrete calculation horizons</li>
                      <li>Reserve breach alerts triggered when balance &lt; target</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <span className="font-bold text-slate-900 block">Service Topography</span>
                    <ul className="text-slate-600 space-y-1.5 list-disc list-inside">
                      <li>Frontend: Next.js 15 App Router on port 3000</li>
                      <li>Backend: FastAPI on port 8000</li>
                      <li>Next.js internal proxies route all API traffic</li>
                      <li>CORS restricted to local environment loopback</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <span className="font-bold text-slate-900 block">Decision Support Safeguards</span>
                    <ul className="text-slate-600 space-y-1.5 list-disc list-inside">
                      <li>Estimates are for operational planning only</li>
                      <li>No automated money movement or bank links</li>
                      <li>Deterministic fallback guarantees zero service lock</li>
                      <li>Full audit trail exportable in CSV and HTML</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Legal / Operational Notice */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Decision-Support Operations Notice</span>
                  <p className="text-amber-800 leading-relaxed">
                    PaisaPilot AI calculations are estimates based strictly on dated transaction ledgers and starting balances provided by the operator. They do not constitute accounting, legal, or investment advice, nor do they guarantee future solvency or financial performance.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
