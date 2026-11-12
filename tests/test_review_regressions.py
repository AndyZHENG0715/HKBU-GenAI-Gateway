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


def test_clean_upstream_error_detail_normalizes_html_waf_error():
    from hkbu_gateway.providers import clean_upstream_error_detail

    html_error = b"""<!DOCTYPE html>
<html lang="en">
<head><title>Access Denied</title></head>
<body><div class="content"><img src="data:image/png;base64,abc"><h1>Access Denied</h1></div></body>
</html>"""
    msg = clean_upstream_error_detail(403, html_error)
    assert "HKBU Campus Firewall / WAF blocked the request (HTTP 403 Access Denied)" in msg
    assert "<html" not in msg
    assert "<img" not in msg

    # Plain JSON / text passes through
    assert clean_upstream_error_detail(400, '{"error":"bad request"}') == '{"error":"bad request"}'


def test_sanitize_message_content_strips_null_bytes():
    from hkbu_gateway.app import _sanitize_message_content

    msg = {"role": "user", "content": "Hello\x00World\x00!"}
    _sanitize_message_content(msg)
    assert msg["content"] == "HelloWorld!"
    assert "\x00" not in msg["content"]


def test_sanitize_message_content_strips_null_bytes_multimodal():
    from hkbu_gateway.app import _sanitize_message_content

    msg = {
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe\x00 this\x00 image"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,123"}},
            "extra\x00text",
        ],
    }
    _sanitize_message_content(msg)
    assert isinstance(msg["content"], list)
    assert msg["content"][0] == {"type": "text", "text": "Describe this image"}
    assert msg["content"][1] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,123"}}
    assert msg["content"][2] == {"type": "text", "text": "extratext"}
    for part in msg["content"]:
        if part.get("type") == "text":
            assert "\x00" not in part["text"]


def test_upstream_403_html_in_stream_yields_cleaned_message():
    from hkbu_gateway.providers import HKBUProvider
    from hkbu_gateway.config import Settings

    html_body = b"<!DOCTYPE html><html><title>Access Denied</title><body>Blocked</body></html>"

    async def run():
        transport = httpx.MockTransport(lambda r: httpx.Response(403, content=html_body))
        async with httpx.AsyncClient(transport=transport) as client:
            provider = HKBUProvider(Settings(), client)
            return b"".join([c async for c in provider.chat_stream("gpt-6-luna", {"messages": []}, "key")]).decode()

    raw = asyncio.run(run())
    events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: {")]
    assert len(events) == 1
    err_msg = events[0]["error"]["message"]
    assert "HKBU Campus Firewall / WAF blocked the request (HTTP 403 Access Denied)" in err_msg
    assert "<!DOCTYPE html>" not in err_msg
