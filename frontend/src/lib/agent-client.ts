import type { ForecastResponse } from "@/lib/types";

export type AgentExplanation = {
  mode?: string;
  explanation?: string;
  error?: string;
};

export type MemoryRecord = {
  id?: string;
  content?: string;
  type?: string;
};

export type MemorySearchResult = {
  memories?: MemoryRecord[];
  context?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const message =
      (body as { error?: string }).error ||
      `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

export async function explainForecast(
  forecast: ForecastResponse,
): Promise<AgentExplanation> {
  const response = await fetch("/api/agent/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(forecast),
    cache: "no-store",
  });

  return readJson<AgentExplanation>(response);
}

export async function searchAgentMemory(
  query: string,
): Promise<MemorySearchResult> {
  const response = await fetch(
    `/api/agent/memory?q=${encodeURIComponent(query)}`,
    { method: "GET", cache: "no-store" },
  );

  return readJson<MemorySearchResult>(response);
}

export async function saveAgentMemory(
  content: string,
): Promise<{ ok?: boolean; error?: string }> {
  const response = await fetch("/api/agent/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, type: "general" }),
    cache: "no-store",
  });

  return readJson<{ ok?: boolean; error?: string }>(response);
}
