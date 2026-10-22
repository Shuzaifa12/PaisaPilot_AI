from fastapi import FastAPI

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
async def agent_explain(payload: ForecastResponse) -> dict:
    data = payload.model_dump(mode="json")
    result = await explain_forecast_with_nemotron(data)
    return result

