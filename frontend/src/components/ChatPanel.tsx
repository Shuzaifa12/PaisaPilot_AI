"use client";

import { useState } from "react";
import { Sparkles, Send, Bot, User, AlertCircle, RefreshCw } from "lucide-react";
import type { ForecastResponse } from "@/lib/types";
import { explainForecast } from "@/lib/agent-client";
import { displayApiAmount } from "@/lib/format";

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  mode?: string;
  timestamp: string;
};

type Props = {
  activeForecast: ForecastResponse | null;
  lang: "en" | "ur";
};

export function ChatPanel({ activeForecast, lang }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: lang === "ur"
        ? "ہیلو! میں آسک پیسہ پائلٹ ہوں۔ اپنے موجودہ کیش فلو تخمینے اور خطرات کے بارے میں مجھ سے کوئی بھی سوال پوچھیں۔"
        : "Hello! I am Ask PaisaPilot. Ask me anything about your current cash-flow forecast, upcoming reserve gaps, or expense risks.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickPrompts = [
    lang === "ur" ? "کیا مجھے کیش کی کمی کا سامنا ہوگا؟" : "Will I face a cash shortage in the forecast period?",
    lang === "ur" ? "کون سا خرچہ سب سے بڑا خطرہ ہے؟" : "Which expenses create the biggest cash-flow risk?",
    lang === "ur" ? "موجودہ تخمینے کی سادہ زبان میں وضاحت کریں" : "Explain my current forecast in simple language.",
    lang === "ur" ? "اگر کلائنٹ کی ادائیگی میں تاخیر ہو تو کیا ہوگا؟" : "What happens if my client pays late?",
  ];

  async function handleSend(questionText?: string) {
    const q = questionText || input;
    if (!q.trim() || loading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: q.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInput("");
    setLoading(true);
    setError(null);

    const targetForecast = activeForecast || {
      projection_kind: "estimate",
      disclaimer: "Default forecast evidence",
      evidence: {
        as_of_date: new Date().toISOString().slice(0, 10),
        starting_cash_balance: "5000.00",
        reserve_target: "1000.00",
        include_uncertain_income: false,
        conservative_income_ids: [],
        uncertain_income_ids: [],
        expense_ids: [],
        excluded_transaction_ids: [],
        same_day_order: "expenses first",
        note: "Default baseline ledger",
      },
      events: [],
      horizons: {},
    };

    try {
      const res = await explainForecast(targetForecast);
      const explanationText = res.explanation || "No explanation returned by engine.";
      const mode = res.mode || "fallback";

      const engineLabel = mode === "openrouter" ? "OpenRouter AI" : mode === "nemotron" ? "NVIDIA Nemotron NIM" : "Deterministic Fallback";
      const enhancedText = `Q: "${q.trim()}"\n\nAI Analysis (${engineLabel}):\n${explanationText}`;

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: "assistant",
        text: enhancedText,
        mode,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Failed to reach AI explanation service.";
      setError(errText);
      const errAssistantMsg: Message = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: `Error connecting to AI service: ${errText}. Using rule-based fallback: Starting balance is ${displayApiAmount(targetForecast.evidence.starting_cash_balance)}, reserve target is ${displayApiAmount(targetForecast.evidence.reserve_target)}.`,
        mode: "fallback",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errAssistantMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-teal-700 font-semibold mb-1">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span>Interactive Financial Intelligence</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Ask PaisaPilot — AI Risk & Forecast Assistant
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ask questions about your active forecast, reserve gaps, and burn rate. Backed by FastAPI & NVIDIA Nemotron with deterministic fallbacks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs font-medium">
            <Bot className="w-3.5 h-3.5 text-teal-600" />
            {activeForecast ? "Active Forecast Loaded" : "Default Evidence Loaded"}
          </span>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2">
        <span className="text-xs font-bold text-slate-700 block">Suggested Investigation Queries:</span>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((promptText, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void handleSend(promptText)}
              disabled={loading}
              className="text-xs bg-slate-50 hover:bg-teal-50 hover:text-teal-800 text-slate-700 border border-slate-200 hover:border-teal-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left disabled:opacity-50"
            >
              {promptText}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Conversation Box */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col h-[500px]">
        {/* Message List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  msg.sender === "user"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-slate-900 text-teal-400 shadow-xs"
                }`}
              >
                {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                  msg.sender === "user"
                    ? "bg-teal-600 text-white rounded-tr-none"
                    : "bg-white text-slate-800 border border-slate-200 rounded-tl-none space-y-1.5"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.sender === "assistant" && msg.mode && (
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Engine: {msg.mode === "openrouter" ? "OpenRouter AI" : msg.mode === "nemotron" ? "NVIDIA Nemotron NIM" : "Deterministic Fallback"}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-teal-400 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-slate-500 shadow-xs flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                <span>Analyzing forecast evidence and synthesizing response…</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-6 py-2 bg-rose-50 border-t border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Input Form */}
        <div className="p-4 bg-white border-t border-slate-200 rounded-b-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cash shortages, reserve breaches, or forecast evidence…"
              disabled={loading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
