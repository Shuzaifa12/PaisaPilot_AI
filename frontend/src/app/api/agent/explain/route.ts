import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

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

  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;

  try {
    const upstream = await fetch(`${backendUrl}/agent/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          "Could not reach FastAPI. Confirm the backend is running at http://127.0.0.1:8000.",
      },
      { status: 502 },
    );
  }
}
