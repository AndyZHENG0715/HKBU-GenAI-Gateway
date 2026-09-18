import json
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


def test_is_tool_emulation_required():
    # Emulation required for Qwen and Llama when tools present
    assert is_tool_emulation_required("qwen3-max", {"tools": SAMPLE_TOOLS}) is True
    assert is_tool_emulation_required("qwen-plus", {"tools": SAMPLE_TOOLS}) is True
    assert is_tool_emulation_required("llama-4-maverick", {"tools": SAMPLE_TOOLS}) is True

    # Not required when tools list is empty or missing
    assert is_tool_emulation_required("qwen3-max", {"tools": []}) is False
    assert is_tool_emulation_required("qwen3-max", {}) is False

    # Not required for native tool calling models
    assert is_tool_emulation_required("gpt-4.1", {"tools": SAMPLE_TOOLS}) is False
    assert is_tool_emulation_required("deepseek-v4-flash", {"tools": SAMPLE_TOOLS}) is False
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
