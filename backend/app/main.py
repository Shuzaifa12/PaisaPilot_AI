import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Header

# Load .env file from root or backend directory if present
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from app.forecast import build_forecast
from app.models import ForecastRequest, ForecastResponse
from app.nemotron import explain_forecast_with_nemotron

app = FastAPI(
    title="PaisaPilot AI Cash-Flow Forecast",
    description=(
        "Deterministic cash-flow estimates from user-supplied balances and dated "
        "transactions. Projections are estimates, not guarantees. This service does "
        "not connect to banks or move money."
    ),
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/zetaris/status")
def zetaris_status() -> dict[str, str]:
    return {
        "status": "not_configured",
        "message": "Zetaris data fabric integration requires enterprise credentials and documentation.",
    }


@app.post("/forecast", response_model=ForecastResponse)
def create_forecast(payload: ForecastRequest) -> ForecastResponse:
    return build_forecast(payload)


@app.post("/agent/explain")
async def agent_explain(
    payload: ForecastResponse,
    memory_context: str = Header(default="", alias="X-PaisaPilot-Memory-Context"),
) -> dict:
    data = payload.model_dump(mode="json")

    # Bound the optional context and keep forecast validation unchanged.
    safe_memory_context = memory_context[:3000] if memory_context else ""

    result = await explain_forecast_with_nemotron(
        data,
        memory_context=safe_memory_context,
    )
    return result
