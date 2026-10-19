import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from hkbu_gateway.app import app
from hkbu_gateway.config import Settings
from hkbu_gateway.providers import HKBUProvider


@pytest.mark.parametrize("header", ["Authorization", "api-key", "x-api-key"])
def test_revoke_accepts_each_supported_auth_header(tmp_path, monkeypatch, header):
    monkeypatch.setenv("HKBU_DATABASE_PATH", str(tmp_path / "gateway.db"))
    with TestClient(app) as client:
        key = app.state.credentials.create("test-only-upstream").gateway_key
        value = f"Bearer {key}" if header == "Authorization" else key
        response = client.delete("/api/credentials/current", headers={header: value})
        assert response.status_code == 200
        assert response.json() == {"revoked": True}
        assert app.state.credentials.resolve(key) is None
        assert client.delete("/api/credentials/current", headers={header: value}).status_code == 401


@pytest.mark.parametrize("finish_reason", ["tool_calls", "stop", "length"])
def test_json_stream_fallback_preserves_native_tools_reasoning_and_finish(finish_reason):
    calls = [
        {"id": "call_1", "type": "function", "function": {"name": "read", "arguments": "{}"}},
        {"id": "call_2", "type": "function", "function": {"name": "calculate", "arguments": "{}"}},
    ]
    upstream = {
        "choices": [{"index": 0, "message": {
            "role": "assistant", "content": None,
            "reasoning_content": "Need two tools.", "tool_calls": calls,
        }, "finish_reason": finish_reason}],
    }

    async def run():
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json=upstream))
        async with httpx.AsyncClient(transport=transport) as client:
            provider = HKBUProvider(Settings(upstream_api_key="test-only"), client)
            return b"".join([event async for event in provider.chat_stream(
                "gpt-6-luna", {"messages": [], "stream": True},
            )]).decode()

    output = asyncio.run(run())
    chunks = [json.loads(line[6:]) for line in output.splitlines()
              if line.startswith("data: ") and line != "data: [DONE]"]
    delta = chunks[0]["choices"][0]["delta"]
    assert delta["role"] == "assistant"
    assert delta["content"] == ""
    assert delta["reasoning_content"] == "Need two tools."
    assert delta["tool_calls"] == [{**call, "index": i} for i, call in enumerate(calls)]
    expected_finish = "tool_calls" if finish_reason == "stop" else finish_reason
    assert chunks[-1]["choices"][0]["finish_reason"] == expected_finish
    assert output.endswith("data: [DONE]\n\n")
