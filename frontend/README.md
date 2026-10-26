# PaisaPilot AI — Frontend (Next.js 15)

The web dashboard for PaisaPilot AI, built with Next.js 15 App Router, React 19, Tailwind CSS v4, Lucide icons, and Recharts.

## Getting Started

From this `frontend/` directory (or use `bun run dev` from the repository root):

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Environment Variables

See `.env.example`:
- `BACKEND_URL`: URL of the FastAPI backend service (default: `http://127.0.0.1:8000`).

## Architecture & Integration

- `/api/forecast`: Proxies deterministic cash-flow calculation requests to the FastAPI backend.
- `/api/agent/explain`: Proxies forecast explanation requests to the backend Nemotron NIM service.
- `/api/agent/memory`: Integrates directly with the H-MEM reference engine and persists audit notes to `.notebook-agent/`.
- `/api/health`: Health status proxy checking FastAPI connectivity.
