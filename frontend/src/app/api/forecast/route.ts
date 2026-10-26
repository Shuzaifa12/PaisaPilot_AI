import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8001";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const rawBackendUrl = process.env.BACKEND_URL;
  const backendUrl =
    rawBackendUrl && !rawBackendUrl.includes(":8000")
      ? rawBackendUrl
      : DEFAULT_BACKEND_URL;

  try {
    const upstream = await fetch(`${backendUrl}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "The forecast API returned a non-JSON response." },
          { status: 502 },
        );
      }
    }
    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not reach the FastAPI forecast service. Start it with uvicorn and set BACKEND_URL if it is not at http://127.0.0.1:8001.",
      },
      { status: 502 },
    );
  }
}
