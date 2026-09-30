import asyncio
import copy
import json

import httpx
import pytest

from hkbu_gateway.app import upstream_payload
from hkbu_gateway.config import Settings
from hkbu_gateway.protocol import ChatCompletionRequest
from hkbu_gateway.providers import HKBUProvider
from hkbu_gateway.tools import (
    EmulatedToolStreamFilter,
    build_tool_instruction,
    extract_tool_calls,
    is_tool_emulation_required,
    prepare_emulated_payload,
)

SAMPLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get current weather in a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["location"],
            },
        },
    }
]


def copilot_payload(model="qwen-plus"):
    return upstream_payload(ChatCompletionRequest(
        model=model,
        messages=[
            {"role": "system", "content": "Your name is GitHub Copilot."},
            {"role": "system", "content": [{"type": "text", "text": "Follow workspace instructions."}]},
            {"role": "user", "content": "9.8大还是9.11大？"},
            {"role": "assistant", "content": "9.11 大于 9.8。"},
            {"role": "developer", "content": "Use tools when needed."},
            {"role": "user", "content": "你确定？"},
        ],
        tools=[
            {"type": "function", "function": {
                "name": f"coding_tool_{i}", "parameters": {"type": "object"},
            }} for i in range(24)
        ],
        parallel_tool_calls=True,
    ), model)


def test_copilot_system_messages_and_history_survive_model_switch():
    payload = copilot_payload()
    snapshot = copy.deepcopy(payload)
    prepared, tools = prepare_emulated_payload(payload)
    assert payload == snapshot
    assert tools == payload["tools"]
    assert "parallel_tool_calls" not in prepared
    messages = prepared["messages"]
    assert [m["role"] for m in messages] == ["system", "system", "system", "system", "user"]
    assert messages[:3] == payload["messages"][:3]
    system = messages[3]["content"]
    assert "# Gateway" in system
    assert messages[-1] == payload["messages"][-1]
    assert "9.8大还是9.11大？" in messages[-1]["content"]
    assert '"role":"assistant"' in messages[-1]["content"]
    assert messages[-1]["content"].endswith("你确定？")
    for tool in tools:
        assert tool["function"]["name"] in system


def test_native_tool_history_is_adapted_even_without_current_tools():
    payload = {
        "messages": [
            {"role": "assistant", "content": None, "tool_calls": [{
                "id": "call_1", "function": {"name": "read_file", "arguments": '{"path":"x"}'},
            }]},
            {"role": "tool", "tool_call_id": "call_1", "content": [{"type": "text", "text": "file data"}]},
            {"role": "user", "content": "Continue editing."},
        ],
    }
    assert is_tool_emulation_required("qwen-plus", payload)
    prepared, tools = prepare_emulated_payload(payload)
    assert tools == []
    assert "call_1" in prepared["messages"][0]["content"]
    assert "[Tool Result for read_file]: file data" in prepared["messages"][1]["content"]
    assert "Please answer" not in prepared["messages"][1]["content"]
    assert prepared["messages"][-1] == payload["messages"][-1]


def test_assistant_multimodal_content_and_legacy_calls_are_preserved():
    image = {"type": "image_url", "image_url": {"url": "https://example.org/image.png"}}
    payload = {"messages": [{
        "role": "assistant", "content": [image],
        "function_call": {"name": "inspect", "arguments": "{}"},
    }]}
    prepared, _ = prepare_emulated_payload(payload)
    content = prepared["messages"][0]["content"]
    assert content[0] == image
    assert '"name": "inspect"' in content[1]["text"]
    assert "function_call" not in prepared["messages"][0]


@pytest.mark.parametrize("model", ["qwen-plus", "qwen3-max"])
@pytest.mark.parametrize("response_mode", ["json", "sse", "json_in_stream"])
@pytest.mark.parametrize("tool_choice", ["auto", "none"])
@pytest.mark.parametrize("reply", ["tool", "GitHub Copilot", "9.8 = 9.80，所以 9.8 大于 9.11。"])
def test_provider_adapts_copilot_request_and_respects_disabled_tools(model, response_mode, tool_choice, reply):
    payload = copilot_payload(model)
    payload["stream"] = response_mode != "json"
    payload["tool_choice"] = tool_choice
    call_text = '{"tool_calls":[{"name":"coding_tool_0","arguments":{}}]}' if reply == "tool" else reply
    expect_tool = reply == "tool" and tool_choice != "none"
    captured = []

    def respond(request):
        captured.append(json.loads(request.content))
        if response_mode == "sse":
            chunks = [
                {"id": "test", "choices": [{"index": 0, "delta": {"role": "assistant", "content": call_text}, "finish_reason": None}]},
                {"id": "test", "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
            ]
            data = "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"
            return httpx.Response(200, text=data, headers={"content-type": "text/event-stream"})
        return httpx.Response(200, json={"choices": [{
            "index": 0, "message": {"role": "assistant", "content": call_text}, "finish_reason": "stop",
        }]})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            provider = HKBUProvider(Settings(), client)
            if response_mode == "json":
                response = await provider.chat(model, payload, "test-key")
                choice = response.json()["choices"][0]
                if not expect_tool:
                    assert choice["message"]["content"] == call_text
                    assert "tool_calls" not in choice["message"]
                    assert choice["finish_reason"] == "stop"
                else:
                    assert choice["message"]["tool_calls"][0]["function"]["name"] == "coding_tool_0"
                    assert choice["finish_reason"] == "tool_calls"
                return
            data = b"".join([chunk async for chunk in provider.chat_stream(model, payload, "test-key")]).decode()
            assert data.count("data: [DONE]") == 1
            choices = [json.loads(line[5:])["choices"][0] for line in data.splitlines() if line.startswith("data:") and line != "data: [DONE]"]
            if not expect_tool:
                assert "".join(c["delta"].get("content", "") for c in choices) == call_text
                assert not any(c["delta"].get("tool_calls") for c in choices)
                assert choices[-1]["finish_reason"] == "stop"
            else:
                assert any(c["delta"].get("tool_calls") for c in choices)
                assert choices[-1]["finish_reason"] == "tool_calls"

    asyncio.run(run())
    sent = captured[0]
    assert all(key not in sent for key in ("tools", "tool_choice", "parallel_tool_calls"))
    assert [m["role"] for m in sent["messages"]] == (["system"] * 4 + ["user"])
    assert sent["messages"][-1]["content"].endswith("你确定？")
    assert "9.8大还是9.11大？" in sent["messages"][-1]["content"]


@pytest.mark.parametrize("model", ["gpt-4.1", "gemini-2.5-flash"])
def test_native_provider_retains_client_messages_and_tools(model):
    payload = copilot_payload(model)
    captured = []

    def respond(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": []})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            await HKBUProvider(Settings(), client).chat(model, payload, "test-key")

    asyncio.run(run())
    assert captured == [payload]


def test_is_tool_emulation_required():
    # Emulation required for Qwen, Llama, and DeepSeek when tools present
    assert is_tool_emulation_required("qwen3-max", {"tools": SAMPLE_TOOLS}) is True
    assert is_tool_emulation_required("qwen-plus", {"tools": SAMPLE_TOOLS}) is True
    assert is_tool_emulation_required("llama-4-maverick", {"tools": SAMPLE_TOOLS}) is True
    assert is_tool_emulation_required("deepseek-v4-flash", {"tools": SAMPLE_TOOLS}) is True
    assert is_tool_emulation_required("deepSeek-V4-Pro-hkbu", {"tools": SAMPLE_TOOLS}) is True

    # Not required when tools list is empty or missing
    assert is_tool_emulation_required("qwen3-max", {"tools": []}) is False
    assert is_tool_emulation_required("qwen3-max", {}) is False

    # Not required for native tool calling models (Azure OpenAI, Gemini)
    assert is_tool_emulation_required("gpt-4.1", {"tools": SAMPLE_TOOLS}) is False
    assert is_tool_emulation_required("gemini-2.5-flash", {"tools": SAMPLE_TOOLS}) is False


def test_prepare_emulated_payload():
    payload = {
        "model": "qwen3-max",
        "messages": [
            {"role": "user", "content": "What is the weather in Tokyo?"},
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_123",
                        "type": "function",
                        "function": {
                            "name": "get_current_weather",
                            "arguments": '{"location": "Tokyo"}',
                        },
                    }
                ],
            },
            {
                "role": "tool",
                "tool_call_id": "call_123",
                "name": "get_current_weather",
                "content": '{"temp": 20}',
            },
        ],
        "tools": SAMPLE_TOOLS,
        "tool_choice": "auto",
    }

    prepared, original_tools = prepare_emulated_payload(payload)

    # tools and tool_choice must be popped
    assert "tools" not in prepared
    assert "tool_choice" not in prepared
    assert original_tools == SAMPLE_TOOLS

    # System message must be prepended with tools instruction
    messages = prepared["messages"]
    assert messages[0]["role"] == "system"
    assert "get_current_weather" in messages[0]["content"]

    # Assistant message tool_calls converted to JSON text
    assert messages[2]["role"] == "assistant"
    assert "tool_calls" in messages[2]["content"]

    # Tool message converted to user turn
    assert messages[3]["role"] == "user"
    assert "[Tool Result for get_current_weather]" in messages[3]["content"]


def test_extract_tool_calls():
    # Case 1: Fenced JSON tool_calls format
    fenced_text = """Here is the call:
```json
{
  "tool_calls": [
    {
      "name": "get_current_weather",
      "arguments": {"location": "Tokyo", "unit": "celsius"}
    }
  ]
}
```"""
    res1 = extract_tool_calls(fenced_text, SAMPLE_TOOLS)
    assert res1 is not None
    assert len(res1) == 1
    assert res1[0]["function"]["name"] == "get_current_weather"
    args1 = json.loads(res1[0]["function"]["arguments"])
    assert args1["location"] == "Tokyo"

    # Case 2: Raw Qwen style {"tool": ..., "parameters": ...}
    qwen_text = '{"tool": "get_current_weather", "parameters": {"location": "Paris"}}'
    res2 = extract_tool_calls(qwen_text, SAMPLE_TOOLS)
    assert res2 is not None
    assert res2[0]["function"]["name"] == "get_current_weather"
    args2 = json.loads(res2[0]["function"]["arguments"])
    assert args2["location"] == "Paris"

    # Case 3: Raw Llama style [{"type": "function", "name": ..., "parameters": ...}]
    llama_text = '[{"type": "function", "name": "get_current_weather", "parameters": {"location": "London"}}]'
    res3 = extract_tool_calls(llama_text, SAMPLE_TOOLS)
    assert res3 is not None
    assert res3[0]["function"]["name"] == "get_current_weather"
    args3 = json.loads(res3[0]["function"]["arguments"])
    assert args3["location"] == "London"

    # Case 4: Non-tool normal text
    normal_text = "The capital of Japan is Tokyo."
    assert extract_tool_calls(normal_text, SAMPLE_TOOLS) is None

    # Case 5: Unknown tool name
    unknown_tool = '{"tool_calls": [{"name": "unknown_function", "arguments": {}}]}'
    assert extract_tool_calls(unknown_tool, SAMPLE_TOOLS) is None


def test_emulated_stream_filter_tool_call():
    handler = EmulatedToolStreamFilter(SAMPLE_TOOLS, "qwen3-max")

    chunks = [
        'data: {"id": "1", "choices": [{"delta": {"content": "```json\\n"}}]}\n',
        'data: {"id": "1", "choices": [{"delta": {"content": "{\\"tool_calls\\": [{\\"name\\": \\"get_current_weather\\", \\"arguments\\": {\\"location\\": \\"Tokyo\\"}}]}"}}]}\n',
        'data: {"id": "1", "choices": [{"delta": {"content": "\\n```"}}]}\n',
        "data: [DONE]\n",
    ]

    out_bytes = []
    for c in chunks:
        out_bytes.extend(handler.process_chunk(c.strip()))

    lines = [b.decode("utf-8").strip() for b in out_bytes if b.decode("utf-8").strip()]

    # First chunks should introduce tool call and arguments
    tc_chunks = [json.loads(line[6:]) for line in lines if line.startswith("data: ") and line != "data: [DONE]"]
    assert len(tc_chunks) == 3
    assert tc_chunks[0]["choices"][0]["delta"]["tool_calls"][0]["function"]["name"] == "get_current_weather"
    assert "Tokyo" in tc_chunks[1]["choices"][0]["delta"]["tool_calls"][0]["function"]["arguments"]
    assert tc_chunks[2]["choices"][0]["finish_reason"] == "tool_calls"


def test_emulated_stream_filter_regular_text():
    handler = EmulatedToolStreamFilter(SAMPLE_TOOLS, "qwen3-max")

    chunks = [
        'data: {"id": "1", "choices": [{"delta": {"content": "The "}}]}\n',
        'data: {"id": "1", "choices": [{"delta": {"content": "weather is nice."}}]}\n',
        "data: [DONE]\n",
    ]

    out_bytes = []
    for c in chunks:
        out_bytes.extend(handler.process_chunk(c.strip()))

    lines = [b.decode("utf-8").strip() for b in out_bytes if b.decode("utf-8").strip()]
    content_chunks = [json.loads(line[6:]) for line in lines if line.startswith("data: ") and line != "data: [DONE]"]
    assert len(content_chunks) >= 2
    assert content_chunks[0]["choices"][0]["delta"]["content"] == "The "
    assert content_chunks[1]["choices"][0]["delta"]["content"] == "weather is nice."
    # Guarantee stop finish_reason
    assert any(c["choices"][0].get("finish_reason") == "stop" for c in content_chunks)


def test_emulated_stream_filter_role_and_empty_choices():
    handler = EmulatedToolStreamFilter(SAMPLE_TOOLS, "qwen3-max")

    chunks = [
        # Chunk 0 has role and empty content
        'data: {"id": "1", "choices": [{"delta": {"role": "assistant", "content": ""}, "finish_reason": null}]}\n',
        # Chunk with empty choices (e.g. usage) should be dropped by handler
        'data: {"id": "1", "choices": [], "usage": {"total_tokens": 10}}\n',
        # Content chunk
        'data: {"id": "1", "choices": [{"delta": {"content": "Hello!"}, "finish_reason": null}]}\n',
        # Final chunk with stop and empty content
        'data: {"id": "1", "choices": [{"delta": {"content": ""}, "finish_reason": "stop"}]}\n',
        "data: [DONE]\n",
    ]

    out_bytes = []
    for c in chunks:
        out_bytes.extend(handler.process_chunk(c.strip()))

    lines = [b.decode("utf-8").strip() for b in out_bytes if b.decode("utf-8").strip()]
    parsed = [json.loads(l[5:].strip()) for l in lines if l != "data: [DONE]"]

    # Verify role was emitted
    assert parsed[0]["choices"][0]["delta"]["role"] == "assistant"
    # Verify content was emitted
    assert any("Hello!" in c["choices"][0]["delta"].get("content", "") for c in parsed)
    # Verify stop was emitted
    assert any(c["choices"][0].get("finish_reason") == "stop" for c in parsed)
    # Verify NO chunk ever had empty choices
    assert all(len(c.get("choices", [])) > 0 for c in parsed)
    # Verify [DONE] is the last line
    assert lines[-1] == "data: [DONE]"


def test_extract_xml_tool_calls():
    # Test DeepSeek / Anthropic tag-based XML tool call
    xml_text = "<read_file><file>/home/andy/project/AGENTS.md</file></read_file>"
    tools = [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "parameters": {"properties": {"file": {"type": "string"}}},
            },
        }
    ]
    res = extract_tool_calls(xml_text, tools)
    assert res is not None
    assert len(res) == 1
    assert res[0]["function"]["name"] == "read_file"
    args = json.loads(res[0]["function"]["arguments"])
    assert args["file"] == "/home/andy/project/AGENTS.md"

    # Test Markdown bold key-values
    xml_text2 = "<Explore> **What:** Explore folder thoroughly **Thoroughness:** thorough </Explore>"
    tools2 = [
        {
            "type": "function",
            "function": {
                "name": "Explore",
                "parameters": {"properties": {"what": {"type": "string"}, "thoroughness": {"type": "string"}}},
            },
        }
    ]
    res2 = extract_tool_calls(xml_text2, tools2)
    assert res2 is not None
    assert len(res2) == 1
    assert res2[0]["function"]["name"] == "Explore"
    args2 = json.loads(res2[0]["function"]["arguments"])
    assert args2["what"] == "Explore folder thoroughly"
    assert args2["thoroughness"] == "thorough"
