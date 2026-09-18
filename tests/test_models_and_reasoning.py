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
    endpoints = ["/v1/models", "/models", "/v1/model", "/model"]
    for ep in endpoints:
        resp = client.get(ep)
        assert resp.status_code == 200
        data = resp.json()
        assert data["object"] == "list"
        assert len(data["data"]) >= 15

        # Check deepseek-v4-flash capabilities
        ds = next(m for m in data["data"] if m["id"] == "deepseek-v4-flash")
        assert ds["supportsToolCall"] is True
        assert ds["supportsReasoning"] is True
        assert ds["supportsVision"] is False
        assert ds["contextWindow"] == 1_000_000
        assert ds["maxTokens"] == 384_000
        assert ds["tool_call"] is True
        assert ds["reasoning"] is True
        assert ds["limit"]["context"] == 1_000_000
        assert ds["capabilities"]["function_calling"] is True

        # Check gpt-4.1 capabilities
        gpt = next(m for m in data["data"] if m["id"] == "gpt-4.1")
        assert gpt["supportsToolCall"] is True
        assert gpt["supportsReasoning"] is False
        assert gpt["supportsVision"] is True
        assert gpt["contextWindow"] == 1_047_576


def test_single_model_endpoint(client):
    endpoints = [
        "/v1/models/deepseek-v4-flash",
        "/models/deepseek-v4-flash",
        "/v1/model/deepseek-v4-flash",
        "/model/deepseek-v4-flash",
    ]
    for ep in endpoints:
        resp = client.get(ep)
        assert resp.status_code == 200
        model = resp.json()
        assert model["id"] == "deepseek-v4-flash"
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
