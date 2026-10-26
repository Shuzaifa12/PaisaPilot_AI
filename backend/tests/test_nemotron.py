import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_zetaris_status_endpoint() -> None:
    response = client.get("/zetaris/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_configured"
    assert "credentials" in body["message"].lower()


def test_agent_explain_fallback_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_BASE", raising=False)
    monkeypatch.delenv("NEMOTRON_API_KEY", raising=False)
    response = client.post(
        "/agent/explain",
        json={
            "projection_kind": "estimate",
            "disclaimer": "Disclaimer",
            "evidence": {
                "as_of_date": "2026-10-21",
                "starting_cash_balance": "1000.00",
                "reserve_target": "400.00",
                "include_uncertain_income": False,
                "conservative_income_ids": [],
                "uncertain_income_ids": [],
                "expense_ids": [],
                "excluded_transaction_ids": [],
                "same_day_order": "expenses first",
                "note": "Test note",
            },
            "events": [],
            "horizons": {},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "fallback"
    assert "1000.00" in body["explanation"]


@pytest.mark.anyio
async def test_agent_explain_openrouter_provider_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    monkeypatch.delenv("NEMOTRON_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)

    captured_url = []
    captured_payload = []
    captured_auth = []

    async def mock_post(self, url, headers=None, json=None, **kwargs):
        captured_url.append(str(url))
        captured_auth.append(headers.get("Authorization", ""))
        captured_payload.append(json)
        return httpx.Response(
            status_code=200,
            json={
                "choices": [
                    {"message": {"content": "OpenRouter Nemotron analysis: Cash reserve buffer is healthy."}}
                ]
            },
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = await explain_forecast_with_nemotron({
        "evidence": {"starting_cash_balance": "5000.00", "reserve_target": "1000.00", "note": "All good"}
    })

    assert result["mode"] == "openrouter"
    assert "OpenRouter Nemotron analysis" in result["explanation"]
    assert len(captured_url) == 1
    assert "openrouter.ai/api/v1/chat/completions" in captured_url[0]
    assert captured_payload[0].get("model") == "nvidia/nemotron-4-34b-instruct"
    assert captured_payload[0].get("reasoning") == {"enabled": False}
    assert "Bearer sk-or-v1-mock-test-key" in captured_auth[0]


@pytest.mark.anyio
async def test_agent_explain_nvidia_provider_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_BASE", raising=False)
    monkeypatch.setenv("NEMOTRON_API_KEY", "nvapi-mock-test-key")

    captured_url = []
    captured_model = []

    async def mock_post(self, url, headers=None, json=None, **kwargs):
        captured_url.append(str(url))
        captured_model.append(json.get("model", ""))
        return httpx.Response(
            status_code=200,
            json={
                "choices": [
                    {"message": {"content": "NVIDIA direct NIM analysis: Risk alert confirmed."}}
                ]
            },
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = await explain_forecast_with_nemotron({
        "evidence": {"starting_cash_balance": "3000.00", "reserve_target": "500.00", "note": "Test note"}
    })

    assert result["mode"] == "nemotron"
    assert "NVIDIA direct NIM analysis" in result["explanation"]
    assert "api.nvidia.com/v1/chat/completions" in captured_url[0]
    assert captured_model[0] == "nvidia/nemotron-4-34b-instruct"


@pytest.mark.anyio
async def test_agent_explain_api_failure_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")

    async def mock_post_err(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(
            status_code=502,
            content=b"Bad Gateway",
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_err)

    result = await explain_forecast_with_nemotron({
        "evidence": {"starting_cash_balance": "1200.00", "reserve_target": "300.00", "note": "Baseline"}
    })

    assert result["mode"] == "fallback"
    assert "status 502" in result["explanation"] or "fallback" in result["explanation"].lower()


def test_normalize_openrouter_base_variants() -> None:
    from app.nemotron import normalize_openrouter_base

    assert normalize_openrouter_base("https://openrouter.ai") == "https://openrouter.ai/api/v1"
    assert normalize_openrouter_base("https://openrouter.ai/") == "https://openrouter.ai/api/v1"
    assert normalize_openrouter_base("https://openrouter.ai/api/v1") == "https://openrouter.ai/api/v1"
    assert normalize_openrouter_base("https://openrouter.ai/api/v1/chat/completions") == "https://openrouter.ai/api/v1"
    assert normalize_openrouter_base("invalid-url-str") == "https://openrouter.ai/api/v1"


def test_key_recovery_from_openrouter_api_base(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.nemotron import get_active_provider_config

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_BASE", "sk-or-v1-recovery-test-key")

    provider, key, base, model = get_active_provider_config()
    assert provider == "openrouter"
    assert key == "sk-or-v1-recovery-test-key"
    assert base == "https://openrouter.ai/api/v1"


@pytest.mark.anyio
async def test_agent_explain_http_404_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")

    async def mock_post_404(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(
            status_code=404,
            json={"error": {"message": "Model or endpoint not found"}},
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_404)

    result = await explain_forecast_with_nemotron({
        "evidence": {"starting_cash_balance": "1200.00", "reserve_target": "300.00", "note": "404 test"}
    })

    assert result["mode"] == "fallback"
    assert "status 404" in result["explanation"]


def test_is_unusable_model_response_validation() -> None:
    from app.nemotron import is_unusable_model_response

    # Rejection of empty/too short content
    assert is_unusable_model_response("") is True
    assert is_unusable_model_response("Hi") is True # 2 chars < 5
    
    # Valid concise explanation
    assert is_unusable_model_response("Valid explanation.") is False # > 5 chars, no patterns
    assert is_unusable_model_response("Short text") is False # 10 chars > 5 chars, no patterns

    # Rejection of prompt regurgitation/meta-reasoning
    assert is_unusable_model_response("The user wants me to analyze a deterministic cash-flow forecast JSON...") is True
    assert is_unusable_model_response("Critical rule: Do not invent figures. Let me examine the JSON data.") is True
    assert is_unusable_model_response("As an AI, I suggest...") is True


@pytest.mark.anyio
async def test_explain_forecast_unusable_output_triggers_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")

    async def mock_post_instructions(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(
            status_code=200,
            json={
                "choices": [
                    {"message": {"content": "The user wants me to analyze a deterministic cash-flow forecast JSON and provide a summary. Critical rule: Do NOT invent amounts."}}
                ]
            },
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_instructions)

    result = await explain_forecast_with_nemotron({
        "evidence": {
            "starting_cash_balance": "1000.00",
            "reserve_target": "400.00",
            "note": "Rent $800 on 2026-10-23"
        },
        "horizons": {
            "7": {
                "horizon_days": 7,
                "first_date_below_reserve": "2026-10-23",
                "minimum_projected_balance": "200.00",
                "reserve_gap": "200.00"
            }
        }
    })

    assert result["mode"] == "fallback"
    assert "Starting balance is 1000.00" in result["explanation"]
    assert "Reserve breach detected on 2026-10-23" in result["explanation"]



@pytest.mark.anyio
async def test_explain_forecast_empty_choices(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    async def mock_post_no_choices(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(status_code=200, json={"choices": []}, request=httpx.Request("POST", str(url)))
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_no_choices)
    result = await explain_forecast_with_nemotron({"evidence": {}})
    assert result["mode"] == "fallback"

@pytest.mark.anyio
async def test_explain_forecast_missing_content(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    async def mock_post_no_content(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(status_code=200, json={"choices": [{"message": {}}]}, request=httpx.Request("POST", str(url)))
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_no_content)
    result = await explain_forecast_with_nemotron({"evidence": {}})
    assert result["mode"] == "fallback"

@pytest.mark.anyio
async def test_explain_forecast_valid_response(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    async def mock_post_valid(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(status_code=200, json={"choices": [{"message": {"content": "Valid explanation."}}]}, request=httpx.Request("POST", str(url)))
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_valid)
    result = await explain_forecast_with_nemotron({"evidence": {}})
    assert result["mode"] == "openrouter"
    assert result["explanation"] == "Valid explanation."

@pytest.mark.anyio
async def test_explain_forecast_truncated_response(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    async def mock_post_length(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(
            status_code=200,
            json={"choices": [{"finish_reason": "length", "message": {"content": "Truncated explanation..."}}]},
            request=httpx.Request("POST", str(url))
        )
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_length)
    result = await explain_forecast_with_nemotron({"evidence": {}})
    assert result["mode"] == "fallback"

@pytest.mark.anyio
async def test_explain_forecast_api_400_error_diagnosis(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    async def mock_post_400(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(
            status_code=400,
            json={"error": {"message": "Invalid model", "code": 400}},
            request=httpx.Request("POST", str(url)),
        )
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_400)
    result = await explain_forecast_with_nemotron({"evidence": {}})
    assert result["mode"] == "fallback"

@pytest.mark.anyio
async def test_explain_forecast_api_502_error_diagnosis(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.nemotron import explain_forecast_with_nemotron
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    async def mock_post_502(self, url, headers=None, json=None, **kwargs):
        return httpx.Response(
            status_code=502,
            json={"error": {"message": "Bad Gateway", "code": 502, "metadata": {"upstream": "nvidia"}}},
            request=httpx.Request("POST", str(url)),
        )
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_502)
    result = await explain_forecast_with_nemotron({"evidence": {}})
    assert result["mode"] == "fallback"
    assert "status 502" in result["explanation"]

