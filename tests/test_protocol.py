from hkbu_gateway.registry import find_model
from hkbu_gateway.protocol import ChatCompletionRequest
import json
import pytest


@pytest.mark.parametrize("model", ["qwen-plus", "qwen3-max", "Qwen-3-max", "deepSeek-V4-Pro-hkbu", "deepseek-v4-flash", "llama-4-maverick"])
def test_history_is_visible_to_last_user_only_upstream(model):
    from hkbu_gateway.app import upstream_payload

    request = ChatCompletionRequest(model=model, messages=[
        {"role": "system", "content": "Follow workspace rules."},
        {"role": "user", "content": "Remember ORCHID."},
        {"role": "assistant", "content": "I will remember ORCHID."},
        {"role": "developer", "content": "Reply briefly."},
        {"role": "user", "content": "What was the marker?"},
    ])
    prepared = upstream_payload(request, model)
    messages = prepared["messages"]
    assert [m["role"] for m in messages] == ["system", "system", "user"]
    assert messages[0]["content"] == "Follow workspace rules."
    assert messages[1]["content"] == "Reply briefly."
    assert "ORCHID" in messages[-1]["content"]
    assert '"role":"assistant"' in messages[-1]["content"]
    assert messages[-1]["content"].endswith("What was the marker?")
    assert request.messages[3].role == "developer"


@pytest.mark.parametrize("model", ["qwen-plus", "deepSeek-V4-Pro-hkbu", "llama-4-maverick"])
def test_tool_results_survive_last_user_only_upstream(model):
    from hkbu_gateway.app import upstream_payload

    messages = [
        {"role": "user", "content": "Read x and edit it."},
        {"role": "assistant", "content": None, "tool_calls": [{
            "id": "call_read", "type": "function",
            "function": {"name": "read_file", "arguments": '{"path":"x"}'},
        }]},
        {"role": "tool", "tool_call_id": "call_read", "content": "ORCHID"},
    ]
    prepared = upstream_payload(ChatCompletionRequest(model=model, messages=messages), model)
    assert len(prepared["messages"]) == 1
    content = prepared["messages"][0]["content"]
    transcript = json.loads(content.split("\n", 1)[1].split("\n\nCurrent user request", 1)[0])
    assert transcript == messages
    assert content.endswith("Continue the latest user request using the tool results above.")


@pytest.mark.parametrize("model", ["gpt-4.1", "gpt-5", "gemini-2.5-flash", "gemini-2.5-pro"])
def test_history_workaround_does_not_change_native_models(model):
    from hkbu_gateway.app import upstream_payload

    messages = [{"role": "user", "content": "Remember ORCHID."}, {"role": "assistant", "content": "OK"}, {"role": "user", "content": "Recall it."}]
    assert upstream_payload(ChatCompletionRequest(model=model, messages=messages), model)["messages"] == messages


@pytest.mark.parametrize("model", ["qwen-plus", "deepSeek-V4-Pro-hkbu", "llama-4-maverick"])
def test_single_turn_does_not_add_transcript_tokens(model):
    from hkbu_gateway.app import upstream_payload

    messages = [{"role": "system", "content": "Follow instructions."}, {"role": "user", "content": "Hi"}]
    assert upstream_payload(ChatCompletionRequest(model=model, messages=messages), model)["messages"] == messages


def test_registry_contains_documented_models():
    assert find_model("gpt-4.1").provider == "gpt"
    assert find_model("text-embedding-3-small").kind == "embedding"
    assert find_model("Qwen-3-max").id == "qwen3-max"
    assert find_model("GPT 5 Mini").id == "gpt-5-mini"


def test_chat_request_keeps_openai_shape():
    request = ChatCompletionRequest(
        model="deepseek-v4-flash",
        messages=[{"role": "user", "content": "hello"}],
        stream=True,
    )
    assert request.model == "deepseek-v4-flash"
    assert request.messages[0].content == "hello"


def test_upstream_payload_sanitizes_content_and_reasoning_params():
    from hkbu_gateway.app import upstream_payload

    # VS Code / Copilot sends complex list of parts
    request = ChatCompletionRequest(
        model="o3-mini",
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

    payload = upstream_payload(request, "o3-mini")

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
        model="gpt-4.1",
        messages=[
            {"role": "user", "content": ""},
            {"role": "assistant", "content": "", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "f", "arguments": "{}"}}]},
            {"role": "tool", "content": "", "tool_call_id": "c1"},
            {"role": "tool", "content": None, "tool_call_id": "c2"},
            {"role": "tool", "content": [], "tool_call_id": "c3"},
            {"role": "assistant", "content": "   "},
        ],
    )

    payload = upstream_payload(request, "gpt-4.1")

    # Upstream HKBU requires non-empty strings and specific nulls
    assert payload["messages"][0]["content"] == " "
    assert payload["messages"][1]["content"] is None  # assistant with tool_calls -> None
    assert payload["messages"][2]["content"] == "(success)"  # tool empty str -> (success)
    assert payload["messages"][3]["content"] == "(success)"  # tool None -> (success)
    assert payload["messages"][4]["content"] == "(success)"  # tool empty list -> (success)
    assert payload["messages"][5]["content"] == " "  # assistant without tool_calls whitespace -> " "

