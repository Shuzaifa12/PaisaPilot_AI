import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;

  try {
    const upstream = await fetch(`${backendUrl}/health`, { method: "GET" });
    const text = await upstream.text();
    const body = text ? JSON.parse(text) : {};
    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        status: "unreachable",
        error:
          "Could not reach FastAPI /health. Confirm the backend is running at BACKEND_URL.",
      },
      { status: 502 },
    );
  }
}
