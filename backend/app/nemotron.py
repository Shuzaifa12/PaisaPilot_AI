import os
import httpx

NEMOTRON_API_BASE = os.getenv("NEMOTRON_API_BASE", "https://integrate.api.nvidia.com/v1")
NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "nvidia/nemotron-4-34b-instruct")
NEMOTRON_API_KEY = os.getenv("NEMOTRON_API_KEY", "")


async def explain_forecast_with_nemotron(forecast_data: dict) -> dict:
    """
    Calls NVIDIA Nemotron via OpenAI-compatible NIM endpoint to explain forecast evidence.
    Strictly constrained to explaining computed numbers without inventing or modifying data.
    """
    if not NEMOTRON_API_KEY:
        return {
            "mode": "fallback",
            "explanation": (
                "NEMOTRON_API_KEY is not configured. "
                "Fallback deterministic summary: "
                f"Starting balance is {forecast_data.get('evidence', {}).get('starting_cash_balance', '—')}. "
                f"Note: {forecast_data.get('evidence', {}).get('note', '')}"
            ),
        }

    prompt = (
        "You are an expert financial risk investigator. Analyze the following deterministic cash-flow forecast JSON "
        "and provide a concise executive summary of upcoming risks, reserve gaps, and inclusion rules. "
        "CRITICAL RULE: Do NOT invent, calculate, or modify any financial amounts, dates, or balances. "
        "Rely strictly on the provided JSON data.\n\n"
        f"Forecast Data:\n{forecast_data}"
    )

    headers = {
        "Authorization": f"Bearer {NEMOTRON_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": NEMOTRON_MODEL,
        "messages": [
            {"role": "system", "content": "You are a precise financial risk analyst. Never invent financial figures."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 400,
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{NEMOTRON_API_BASE.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
            if response.status_code == 200:
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                return {"mode": "nemotron", "explanation": content}
            else:
                return {
                    "mode": "fallback",
                    "explanation": f"NVIDIA Nemotron API returned status {response.status_code}. Using deterministic fallback evidence.",
                }
    except Exception as exc:
        return {
            "mode": "fallback",
            "explanation": f"Could not reach NVIDIA Nemotron API ({str(exc)}). Using deterministic fallback evidence.",
        }
