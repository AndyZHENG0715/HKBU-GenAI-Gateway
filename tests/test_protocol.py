from hkbu_gateway.registry import MODELS, find_model
from hkbu_gateway.protocol import ChatCompletionRequest
import json
import pytest


CHAT_MODELS = [m.id for m in MODELS if m.kind == "chat"]


@pytest.mark.parametrize("model", CHAT_MODELS)
def test_rest_v1_receives_native_history_and_roles(model):
    from hkbu_gateway.app import upstream_payload

    messages = [
        {"role": "system", "content": "Follow workspace rules."},
        {"role": "user", "content": "Read x."},
        {"role": "assistant", "content": None, "tool_calls": [{
            "id": "call_read", "type": "function",
            "function": {"name": "read_file", "arguments": '{"path":"x"}'},
        }]},
        {"role": "tool", "tool_call_id": "call_read", "content": "ORCHID"},
        {"role": "developer", "content": "Reply briefly."},
        {"role": "user", "content": "What was in x?"},
    ]
    prepared = upstream_payload(ChatCompletionRequest(model=model, messages=messages), model)
    # REST v1 is stateless and keeps every turn, so no transcript or role rewriting.
    assert prepared["messages"] == messages


def test_registry_matches_rest_v1_catalog():
    assert find_model("gpt-6-luna").provider == "gpt"
    assert find_model("text-embedding-3-small").kind == "embedding"
    assert find_model("Qwen3.7 Plus").id == "qwen3.7-plus"
    assert find_model("llama-4-maverick") is None


@pytest.mark.parametrize("legacy,current", [
    ("gpt-4.1", "gpt-6-luna"),
    ("qwen-plus", "qwen3.7-plus"),
    ("qwen3-max", "qwen3.8-max"),
    ("deepseek-v4-flash", "deepseek-v4-flash-0731"),
    ("gemini-2.5-flash", "gemini-3.8-flash"),
])
def test_retired_ids_map_to_successors(legacy, current):
    assert find_model(legacy).id == current


def test_parameters_fit_capability_table():
    from hkbu_gateway.app import upstream_payload

    def prepare(model, **extra):
        request = ChatCompletionRequest(model=model, messages=[{"role": "user", "content": "hi"}], **extra)
        return upstream_payload(request, model)

    gpt = prepare("gpt-6-luna", temperature=0.2, top_p=0.9, max_tokens=5, reasoning_effort="xhigh")
    assert "temperature" not in gpt and "top_p" not in gpt
    assert gpt["max_tokens"] == 16
    assert gpt["reasoning_effort"] == "xhigh"

    qwen = prepare("qwen3.7-plus", temperature=0.2, reasoning_effort="medium")
    assert qwen["temperature"] == 0.2
    assert qwen["reasoning_effort"] == "high"
    assert prepare("qwen3.7-plus", enable_thinking=True)["reasoning_effort"] == "high"
    assert prepare("qwen3.7-plus", reasoning_effort="none")["reasoning_effort"] == "none"
    assert prepare("deepseek-v4-flash-0731", reasoning_effort="low")["reasoning_effort"] == "high"
    assert prepare("deepseek-v4-flash-0731", reasoning_effort="none")["reasoning_effort"] == "high"
    assert "reasoning_effort" not in prepare("kimi-k3", reasoning_effort="high")
    assert "reasoning_effort" not in prepare("glm-5.2")


def test_chat_request_keeps_openai_shape():
    request = ChatCompletionRequest(
        model="deepseek-v4-flash-0731",
        messages=[{"role": "user", "content": "hello"}],
        stream=True,
    )
    assert request.model == "deepseek-v4-flash-0731"
    assert request.messages[0].content == "hello"


def test_upstream_payload_sanitizes_content_and_reasoning_params():
    from hkbu_gateway.app import upstream_payload

    # VS Code / Copilot sends complex list of parts
    request = ChatCompletionRequest(
        model="gpt-6-luna",
        messages=[
            {"role": "user", "content": [{"type": "text", "value": "check file"}]},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "read", "arguments": "{}"}}],
            },
            {"role": "tool", "content": [{"type": "tool_result", "content": "file data"}], "tool_call_id": "call_1"},
        ],
        temperature=0.7,
        top_p=0.9,
    )

    payload = upstream_payload(request, "gpt-6-luna")

    # Reasoning parameters stripped
    assert "temperature" not in payload
    assert "top_p" not in payload

    # Message content sanitized
    assert payload["messages"][0]["content"] == "check file"
    assert payload["messages"][1]["content"] is None  # assistant tool_calls
    assert payload["messages"][2]["content"] == "file data"


def test_upstream_payload_sanitizes_empty_and_whitespace_content():
    from hkbu_gateway.app import upstream_payload

    request = ChatCompletionRequest(
        model="gpt-6-luna",
        messages=[
            {"role": "user", "content": ""},
            {"role": "assistant", "content": "", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "f", "arguments": "{}"}}]},
            {"role": "tool", "content": "", "tool_call_id": "c1"},
            {"role": "tool", "content": None, "tool_call_id": "c2"},
            {"role": "tool", "content": [], "tool_call_id": "c3"},
            {"role": "assistant", "content": "   "},
        ],
    )

    payload = upstream_payload(request, "gpt-6-luna")

    # Upstream HKBU requires non-empty strings and specific nulls
    assert payload["messages"][0]["content"] == " "
    assert payload["messages"][1]["content"] is None  # assistant with tool_calls -> None
    assert payload["messages"][2]["content"] == "(success)"  # tool empty str -> (success)
    assert payload["messages"][3]["content"] == "(success)"  # tool None -> (success)
    assert payload["messages"][4]["content"] == "(success)"  # tool empty list -> (success)
    assert payload["messages"][5]["content"] == " "  # assistant without tool_calls whitespace -> " "


def test_clean_html_text():
    from hkbu_gateway.app import _clean_html_text

    sample_html = """
    <html>
      <head><title>Test Page</title><style>.hidden { display: none; }</style></head>
      <body>
        <script>console.log("secret");</script>
        <h1>Main Heading</h1>
        <p>This is a paragraph with <a href="#">a link</a>.</p>
        <div>Content block</div>
      </body>
    </html>
    """
    cleaned = _clean_html_text(sample_html)
    assert "console.log" not in cleaned
    assert ".hidden" not in cleaned
    assert "Main Heading" in cleaned
    assert "This is a paragraph with a link." in cleaned
    assert "Content block" in cleaned



def test_provider_uses_rest_v1_routes_and_bearer_auth():
    from hkbu_gateway.config import Settings
    from hkbu_gateway.providers import HKBUProvider

    provider = HKBUProvider(Settings(), client=None)
    assert provider._url("qwen3.7-plus", "chat/completions") == "https://genai.hkbu.edu.hk/api/v1/chat/completions"
    assert provider._headers("k")["Authorization"] == "Bearer k"

    legacy = HKBUProvider(Settings(
        upstream_base_url="https://genai.hkbu.edu.hk/api/v0/rest",
        upstream_auth_header="api-key",
        upstream_path_style="openai/deployments",
    ), client=None)
    assert legacy._url("qwen3.7-plus", "chat/completions").endswith("/openai/deployments/qwen3.7-plus/chat/completions")
    assert legacy._headers("k")["api-key"] == "k"


def test_echoed_response_fields_are_stripped():
    from hkbu_gateway.app import upstream_payload

    request = ChatCompletionRequest(model="kimi-k3", messages=[
        {"role": "user", "content": "Count lines."},
        {"role": "assistant", "content": "", "reasoning_content": "use wc", "tool_calls": [{
            "id": "call_1", "index": 0, "type": "function",
            "function": {"name": "Bash", "arguments": '{"command":"wc -l x"}'},
        }]},
        {"role": "tool", "tool_call_id": "call_1", "content": "42 x"},
    ])
    messages = upstream_payload(request, "kimi-k3")["messages"]
    # REST v1 rejects these with "property ... should not exist".
    assert "reasoning_content" not in messages[1]
    assert messages[1]["tool_calls"] == [{
        "id": "call_1", "type": "function",
        "function": {"name": "Bash", "arguments": '{"command":"wc -l x"}'},
    }]


def test_stream_forwards_tool_calls_sent_with_empty_content():
    import asyncio
    import httpx
    from hkbu_gateway.config import Settings
    from hkbu_gateway.providers import HKBUProvider

    # Qwen/GLM on REST v1 put tool_calls next to content: "" in the same delta.
    chunks = [
        {"choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": None}]},
        {"choices": [{"index": 0, "delta": {"content": "", "tool_calls": [{"index": 0, "id": "call_1", "type": "function", "function": {"name": "Bash", "arguments": ""}}]}, "finish_reason": None}]},
        {"choices": [{"index": 0, "delta": {"content": "", "tool_calls": [{"index": 0, "function": {"arguments": '{"command":"ls"}'}}]}, "finish_reason": None}]},
        {"choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]},
    ]
    body = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"

    async def run():
        transport = httpx.MockTransport(lambda r: httpx.Response(200, text=body, headers={"content-type": "text/event-stream"}))
        async with httpx.AsyncClient(transport=transport) as client:
            provider = HKBUProvider(Settings(), client)
            return b"".join([c async for c in provider.chat_stream("qwen3.7-plus", {"messages": [], "stream": True}, "k")]).decode()

    events = [json.loads(line[6:]) for line in asyncio.run(run()).splitlines() if line.startswith("data: {")]
    calls = [tc for e in events for tc in e["choices"][0]["delta"].get("tool_calls") or []]
    assert calls[0]["function"]["name"] == "Bash"
    assert "".join(tc["function"].get("arguments", "") for tc in calls) == '{"command":"ls"}'
    assert events[-1]["choices"][0]["finish_reason"] == "tool_calls"


def test_pinned_v0_environment_is_moved_to_rest_v1(monkeypatch):
    from hkbu_gateway.config import Settings

    # Older deployments pinned the v0 defaults in their environment.
    monkeypatch.setenv("HKBU_UPSTREAM_BASE_URL", "https://genai.hkbu.edu.hk/api/v0/rest/")
    monkeypatch.setenv("HKBU_UPSTREAM_AUTH_HEADER", "api-key")
    monkeypatch.setenv("HKBU_UPSTREAM_PATH_STYLE", "openai/deployments")
    settings = Settings.from_env()
    assert settings.upstream_base_url == "https://genai.hkbu.edu.hk/api/v1"
    assert settings.upstream_auth_header == "Authorization"
    assert settings.upstream_path_style == ""
