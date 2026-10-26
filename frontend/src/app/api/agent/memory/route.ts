// import { NextResponse } from "next/server";
// import fs from "node:fs";
// import path from "node:path";
// import { pathToFileURL } from "node:url";

import { NextResponse } from "next/server";
import path from "node:path";
import { HMEM } from "../../../../../../vendor/hmem/src/index";

// Isolated agent memory persist directory at root
const persistDir = path.resolve(process.cwd(), "..", ".notebook-agent");

async function getAgentHMEM() {
  // const entry = path.resolve(process.cwd(), "..", "vendor", "hmem", "src", "index.ts");
  // if (!fs.existsSync(entry)) {
  //   throw new Error("H-MEM engine not found. Run npm run setup first.");
  // }
  // const mod = await import(pathToFileURL(entry).href);
  // return new mod.HMEM({ persistDir, actor: "paisapilot-agent" });
  return new HMEM({ persistDir, actor: "paisapilot-agent" });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { content, type = "factual" } = body as { content?: string; type?: string };

  if (!content || typeof content !== "string" || content.trim() === "") {
    return NextResponse.json({ error: "Memory content is required and must be non-empty." }, { status: 400 });
  }

  const trimmed = content.trim();
  if (trimmed.length > 500) {
    return NextResponse.json({ error: "Memory content exceeds maximum length of 500 characters." }, { status: 400 });
  }

  // Strict privacy allowlist check: prevent storing raw bank balances, financial account numbers, or api keys
  const forbiddenPatterns = [/balance/i, /api_key/i, /password/i, /secret/i, /credit_card/i, /\$\d/];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(trimmed)) {
      return NextResponse.json(
        { error: "Privacy violation: Content contains restricted financial or sensitive patterns and cannot be stored in memory." },
        { status: 422 }
      );
    }
  }

  try {
    const hmem = await getAgentHMEM();
    const record = hmem.add({
      content: trimmed,
      type: (type as "personal" | "factual" | "preference" | "general") || "factual",
      source: "investigator:dashboard",
      provenance: {
        origin: "manual",
        learnedAt: Date.now(),
        label: "PaisaPilot Forecast Investigation Note",
      },
    });

    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to store memory record: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";

  if (!q.trim()) {
    return NextResponse.json({ memories: [], context: "" }, { status: 200 });
  }

  try {
    const hmem = await getAgentHMEM();
    const result = hmem.query(q, { topN: 5, threshold: 0.2 });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to query memory: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
