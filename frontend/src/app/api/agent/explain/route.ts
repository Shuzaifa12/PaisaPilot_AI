import { NextResponse } from "next/server";
import path from "node:path";
import { HMEM } from "../../../../../../vendor/hmem/src/index";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8001";

const persistDir = path.resolve(process.cwd(), "..", ".notebook-agent");

async function getForecastMemoryContext(): Promise<string> {
  try {
    const hmem = new HMEM({
      persistDir,
      actor: "paisapilot-agent",
    });

    const result = hmem.query(
      "forecast investigation preferences cash flow planning reserve risk notes",
      { topN: 5, threshold: 0.2 },
    );

    return typeof result.context === "string"
      ? result.context.slice(0, 3000)
      : "";
  } catch (error) {
    console.error("[H-MEM] Memory retrieval unavailable:", error);
    return "";
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const rawBackendUrl = process.env.BACKEND_URL;
  const backendUrl =
    rawBackendUrl && !rawBackendUrl.includes(":8000")
      ? rawBackendUrl
      : DEFAULT_BACKEND_URL;

  try {
    const authHeader = request.headers.get("authorization") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const memoryContext = await getForecastMemoryContext();

    if (memoryContext) {
      headers["X-PaisaPilot-Memory-Context"] = memoryContext;
    }
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const upstream = await fetch(`${backendUrl}/agent/explain`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await upstream.text();

    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "The AI explanation API returned a non-JSON response." },
          { status: 502 },
        );
      }
    }

    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not reach FastAPI. Confirm the backend is running at http://127.0.0.1:8001.",
      },
      { status: 502 },
    );
  }
}
