# PaisaPilot AI — Revised H-MEM Investigation Memory Integration Plan

This plan outlines the precise, secure integration of H-MEM memory storage and retrieval for non-sensitive project and forecast investigation notes within PaisaPilot AI.

---

## 1. Verified H-MEM APIs & Integration Boundary
- **Verified H-MEM Signatures (`vendor/hmem/src/index.ts`)**:
  - `HMEM`: Initialized with `new HMEM({ persistDir, actor, clock })`.
  - `add(input: AddInput): MemoryRecord`: Adds a memory record directly. Requires `content`, `type` (`"personal" | "factual" | "preference" | "general"`), `source`, and provenance.
  - `query(query: string, opts?: { topN?: number; threshold?: number; chatId?: string }): QueryResult`: Returns `{ memories: RetrievedMemory[], context: string, trace: ... }`.
- **Integration Boundary (Next.js API Route)**:
  - H-MEM is implemented in TypeScript (`vendor/hmem/`). Because Next.js API routes run in Node/TypeScript, H-MEM is integrated directly via Next.js API routes (`frontend/src/app/api/agent/memory/route.ts`), keeping it cleanly decoupled from the Python FastAPI forecast backend.
- **Persistent Storage**:
  - Uses a dedicated directory (`.notebook-agent/`) isolated from the user's CLI research notebook (`.notebook/`), avoiding state corruption or file locking conflicts. Note: On serverless/ephemeral hosting environments, local disk persistence is temporary; local development persists to `.notebook-agent/`.

---

## 2. Privacy & Financial Data Protections
- **Strict Data Redaction (Allowlist Approach)**:
  - Raw bank balances, precise cash amounts, transaction IDs, client names, personal identifiers, API keys, and secrets **must never** be stored in H-MEM.
  - Allowed metadata is restricted to aggregate risk categories, forecast dates, breach status flags, and high-level investigation rationale (e.g., `"Review rent expense due date adjustment"`).
- **User Confirmation**:
  - Saving an investigation note derived from a forecast requires explicit user confirmation via UI action.

---

## 3. Architecture & Forecast Determinism
- **Deterministic Separation**:
  - FastAPI `/forecast` remains the 100% deterministic source of truth for all cash flow calculations, daily balances, reserve gaps, and event projections.
  - H-MEM is queried solely for contextual historical investigation notes and provenance audit history. Retrieved memories are clearly labeled as historical context and never alter current forecast numbers.

---

## 4. API Security & Validation
- **Input Validation**:
  - `POST /api/agent/memory`: Validates input payload structure, restricts note length (`max_length: 500`), rejects blank content, and sanitizes strings to prevent injection or leaking filesystem paths.
  - `GET /api/agent/memory`: Validates query parameters (`q`).
- **Error Handling**:
  - Gracefully handles missing files, malformed JSON, or uninitialized H-MEM stores by returning safe fallback responses (`{ memories: [], context: "" }`).

---

## 5. Testing Strategy
- **Unit & Integration Tests**:
  - Test memory addition (`add`) and retrieval (`query`) with valid payloads.
  - Test input validation and schema rejections (e.g., oversized notes, blank content).
  - Test persistence across reinitialization.
  - Test fallback behavior when H-MEM is unavailable or encounters errors.
- **Regression Compliance**:
  - Verify existing backend forecasting tests remain 100% untouched and passing.
  - Verify Next.js production build (`npm run build`) and lint (`npm run lint`).
