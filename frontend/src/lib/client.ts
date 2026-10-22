import type { ForecastApiError, ForecastRequest, ForecastResponse } from "@/lib/types";
import { formatApiError } from "@/lib/format";

export type ForecastCallResult =
  | { ok: true; data: ForecastResponse }
  | { ok: false; status: number; message: string };

export async function postForecast(payload: ForecastRequest): Promise<ForecastCallResult> {
  let response: Response;
  try {
    response = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Could not reach the Next.js proxy. Confirm the frontend is running.",
    };
  }

  let body: ForecastResponse | ForecastApiError | null = null;
  try {
    body = (await response.json()) as ForecastResponse | ForecastApiError;
  } catch {
    body = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: formatApiError(
        body as ForecastApiError | null,
        response.status === 422
          ? "The forecast API rejected this request. Check amounts, dates, and required fields."
          : "The forecast API is unavailable. Confirm FastAPI is running at BACKEND_URL.",
      ),
    };
  }

  const data = body as ForecastResponse | null;
  if (!data || data.projection_kind !== "estimate" || !data.horizons || !data.evidence) {
    return {
      ok: false,
      status: response.status,
      message: "The API response was missing forecast fields. No values were invented.",
    };
  }

  return { ok: true, data };
}

export async function checkBackendHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch("/api/health", { method: "GET" });
    if (!response.ok) {
      return {
        ok: false,
        message: "Forecast API health check failed. Start FastAPI on http://127.0.0.1:8000.",
      };
    }
    const body = (await response.json()) as { status?: string };
    if (body.status !== "ok") {
      return { ok: false, message: "Forecast API did not report status ok." };
    }
    return { ok: true, message: "Forecast API reachable through the Next.js proxy." };
  } catch {
    return {
      ok: false,
      message: "Could not run a health check. Confirm the frontend and FastAPI processes are running.",
    };
  }
}
