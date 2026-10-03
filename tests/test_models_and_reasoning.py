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

        # Check Qwen capabilities (tool calling supported via emulation, reasoning supported)
        qwen = next(m for m in data["data"] if m["id"] == "qwen3-max")
        assert qwen["supportsToolCall"] is True
        assert qwen["supportsReasoning"] is True
        assert qwen["tool_call"] is True
        assert qwen["reasoning"] is True
        assert qwen["capabilities"]["function_calling"] is True
        assert qwen["capabilities"]["reasoning"] is True
        assert qwen["tool_call_emulated"] is True
        assert qwen["native_tool_call"] is False

        # Check Llama capabilities (tool calling supported via emulation)
        llama = next(m for m in data["data"] if m["id"] == "llama-4-maverick")
        assert llama["supportsToolCall"] is True
        assert llama["tool_call"] is True
        assert llama["capabilities"]["function_calling"] is True
        assert llama["tool_call_emulated"] is True
        assert llama["native_tool_call"] is False


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


def test_litellm_model_info(client):
    for ep in ["/v1/model/info", "/model/info"]:
        resp = client.get(ep)
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        ds = next(m for m in data["data"] if m["model_name"] == "deepseek-v4-flash")
        assert ds["model_info"]["supports_function_calling"] is True
        assert ds["model_info"]["supports_reasoning"] is True
        assert ds["model_info"]["max_input_tokens"] == 1_000_000
        qwen = next(m for m in data["data"] if m["model_name"] == "qwen3-max")
        assert qwen["model_info"]["supports_reasoning"] is True


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


def test_qwen_reasoning_prompt_injection():
    from hkbu_gateway.app import upstream_payload, QWEN_REASONING_SYSTEM_INSTRUCTION
    from hkbu_gateway.protocol import ChatCompletionRequest

    # Request with reasoning_effort
    req = ChatCompletionRequest(
        model="qwen3-max",
        messages=[{"role": "user", "content": "9.11和9.9谁大？"}],
        reasoning_effort="high",
    )
    payload = upstream_payload(req, "qwen3-max")
    assert "reasoning_effort" not in payload
    # Check that system instruction was injected
    assert any(QWEN_REASONING_SYSTEM_INSTRUCTION in str(m.get("content")) for m in payload["messages"])

    # Request without reasoning should NOT inject
    req_no_reasoning = ChatCompletionRequest(
        model="qwen3-max",
        messages=[{"role": "user", "content": "hello"}],
    )
    payload_no_reasoning = upstream_payload(req_no_reasoning, "qwen3-max")
    assert not any(QWEN_REASONING_SYSTEM_INSTRUCTION in str(m.get("content")) for m in payload_no_reasoning["messages"])

    # If <think> is already in messages, do not double inject
    req_already_has = ChatCompletionRequest(
        model="qwen3-max",
        messages=[
            {"role": "system", "content": "Please output in <think> tags."},
            {"role": "user", "content": "hello"},
        ],
        reasoning_effort="medium",
    )
    payload_already_has = upstream_payload(req_already_has, "qwen3-max")
    assert not any(QWEN_REASONING_SYSTEM_INSTRUCTION == m.get("content") for m in payload_already_has["messages"])


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


