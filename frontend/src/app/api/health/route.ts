import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8001";

export async function GET() {
  const rawBackendUrl = process.env.BACKEND_URL;
  const backendUrl =
    rawBackendUrl && !rawBackendUrl.includes(":8000")
      ? rawBackendUrl
      : DEFAULT_BACKEND_URL;

  try {
    const upstream = await fetch(`${backendUrl}/health`, {
      method: "GET",
      cache: "no-store",
    });
    const text = await upstream.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { status: "ok", raw: text };
      }
    }
    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        status: "unreachable",
        error:
          "Could not reach FastAPI /health. Confirm the backend is running at http://127.0.0.1:8001.",
      },
      { status: 502 },
    );
  }
}
