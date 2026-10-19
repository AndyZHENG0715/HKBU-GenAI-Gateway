import json
import pytest
from fastapi.testclient import TestClient
from hkbu_gateway.app import app
from hkbu_gateway.providers import ThinkStreamFilter


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("HKBU_DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("HKBU_GATEWAY_ENCRYPTION_KEY", "u0qW-xQ2O1hP7r_7t3K0X5qL7eR2m_1w8A9j0K1L2M3=")
    with TestClient(app) as test_client:
        yield test_client


def test_models_endpoints_without_auth(client):
    endpoints = ["/v1/models", "/models", "/v1/model", "/model", "/api/v1/models"]
    for ep in endpoints:
        resp = client.get(ep)
        assert resp.status_code == 200
        data = resp.json()
        assert data["object"] == "list"
        assert len(data["data"]) >= 15

        ds = next(m for m in data["data"] if m["id"] == "deepseek-v4-flash-0731")
        assert ds["supportsToolCall"] is True
        assert ds["supportsReasoning"] is True
        assert ds["supportsVision"] is False
        assert ds["capabilities"]["function_calling"] is True
        assert ds["native_tool_call"] is True
        assert ds["tool_call_emulated"] is False
        assert ds["reasoning_efforts"] == ["high", "max"]

        gpt = next(m for m in data["data"] if m["id"] == "gpt-6-luna")
        assert gpt["supportsVision"] is True
        assert gpt["supports_temperature"] is False

        kimi = next(m for m in data["data"] if m["id"] == "kimi-k3")
        assert kimi["supportsReasoning"] is False
        assert kimi["structured_output"] is False

        # Retired IDs are accepted on requests but not advertised.
        assert not any(m["id"] in ("gpt-4.1", "qwen-plus", "llama-4-maverick") for m in data["data"])


def test_single_model_endpoint(client):
    endpoints = [
        "/v1/models/deepseek-v4-flash-0731",
        "/models/deepseek-v4-flash-0731",
        "/v1/model/deepseek-v4-flash-0731",
        "/model/deepseek-v4-flash",
    ]
    for ep in endpoints:
        resp = client.get(ep)
        assert resp.status_code == 200
        model = resp.json()
        assert model["id"] == "deepseek-v4-flash-0731"
        assert model["supportsToolCall"] is True
        assert model["supportsReasoning"] is True

    # Unknown model returns 404
    resp = client.get("/v1/models/non-existent-model")
    assert resp.status_code == 404


def test_think_stream_filter():
    tsf = ThinkStreamFilter()
    chunks = [
        "<think>\nLet me solve this",
        " step by step.",
        "\n</th",
        "ink>\n\nHere is the answer: 42.",
    ]
    events = []
    for c in chunks:
        events.extend(tsf.process(c))
    events.extend(tsf.flush())

    reasoning = "".join(text for kind, text in events if kind == "reasoning_content")
    content = "".join(text for kind, text in events if kind == "content")

    assert reasoning == "\nLet me solve this step by step.\n"
    assert content == "Here is the answer: 42."


def test_litellm_model_info(client):
    for ep in ["/v1/model/info", "/model/info"]:
        resp = client.get(ep)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        ds = next(m for m in data["data"] if m["model_name"] == "deepseek-v4-flash-0731")
        assert ds["model_info"]["supports_function_calling"] is True
        assert ds["model_info"]["supports_reasoning"] is True
        glm = next(m for m in data["data"] if m["model_name"] == "glm-5.2")
        assert glm["model_info"]["supports_parallel_function_calling"] is False


def test_is_reasoning_requested_detection():
    from hkbu_gateway.app import is_reasoning_requested

    assert is_reasoning_requested({"reasoning_effort": "medium"}) is True
    assert is_reasoning_requested({"reasoning_effort": "high"}) is True
    assert is_reasoning_requested({"reasoning_effort": "none"}) is False
    assert is_reasoning_requested({"enable_thinking": True}) is True
    assert is_reasoning_requested({"enable_thinking": False}) is False
    assert is_reasoning_requested({"reasoning": True}) is True
    assert is_reasoning_requested({"thinking": {"type": "enabled"}}) is True
    assert is_reasoning_requested({"thinking": {"type": "disabled"}}) is False
    assert is_reasoning_requested({"extra_body": {"enable_thinking": True}}) is True
    assert is_reasoning_requested({"extra_body": {"reasoning_effort": "low"}}) is True
    assert is_reasoning_requested({}) is False


def test_think_stream_filter_case_and_unclosed():
    tsf = ThinkStreamFilter()
    events = []
    events.extend(tsf.process("<Think>Capitalized think</Think>Actual content"))
    events.extend(tsf.flush())

    reasoning = "".join(text for kind, text in events if kind == "reasoning_content")
    content = "".join(text for kind, text in events if kind == "content")
    assert reasoning == "Capitalized think"
    assert content == "Actual content"

    # Unclosed tag at stream end flushes as reasoning_content
    tsf2 = ThinkStreamFilter()
    events2 = []
    events2.extend(tsf2.process("<think>Unclosed thought without closing tag"))
    events2.extend(tsf2.flush())
    reasoning2 = "".join(text for kind, text in events2 if kind == "reasoning_content")
    assert reasoning2 == "Unclosed thought without closing tag"


