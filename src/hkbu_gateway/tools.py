import json
import re
import time
import uuid
from typing import Any

from .registry import Model, find_model


def is_tool_emulation_required(model_id: str, payload: dict[str, Any]) -> bool:
    """Determine if gateway tool emulation is required for this model and request."""
    tools = payload.get("tools")
    if not tools or not isinstance(tools, list) or len(tools) == 0:
        return False
    model = find_model(model_id)
    if not model:
        return False
    # If model supports tool calls natively on upstream HKBU (e.g. Azure GPT, Gemini, DeepSeek), don't emulate
    return not getattr(model, "native_tool_call", True)


def build_tool_instruction(tools: list[dict[str, Any]], tool_choice: Any = None) -> str:
    """Build a structured system instruction teaching the model available tools and JSON schema."""
    definitions = []
    for t in tools:
        if isinstance(t, dict):
            if "function" in t and isinstance(t["function"], dict):
                definitions.append(t["function"])
            elif "name" in t:
                definitions.append(t)

    tools_json = json.dumps(definitions, indent=2, ensure_ascii=False)
    instruction = f"""# Tools Available

You have access to the following tools:
```json
{tools_json}
```

## Tool Calling Instructions
- If you need to call one or more tools to answer the user request, respond ONLY with a JSON object in this exact format:
```json
{{
  "tool_calls": [
    {{
      "name": "<function-name>",
      "arguments": {{
        "<arg-name>": <arg-value>
      }}
    }}
  ]
}}
```
- Do not output any conversational text, explanations, or markdown before or after the JSON if calling a tool.
- If no tool is needed to answer the user request, or if you have already received the tool results, respond normally with natural text to answer the user.
"""
    if isinstance(tool_choice, dict) and tool_choice.get("function", {}).get("name"):
        forced_name = tool_choice["function"]["name"]
        instruction += f'\nYou MUST call the tool "{forced_name}".\n'
    elif tool_choice == "required":
        instruction += "\nYou MUST call at least one tool.\n"
    elif tool_choice == "none":
        instruction += "\nDo NOT call any tools. Answer the user request directly.\n"
    return instruction


def prepare_emulated_payload(
    payload: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """
    Transform payload for models requiring emulation:
    1. Extracts and pops 'tools' and 'tool_choice' so upstream does not error or drop them.
    2. Injects tools instruction into the system message.
    3. Translates client-sent role: "tool" messages and prior assistant tool_calls into conversation text.
    """
    cloned = dict(payload)
    original_tools = cloned.pop("tools", [])
    tool_choice = cloned.pop("tool_choice", None)

    tool_instruction = build_tool_instruction(original_tools, tool_choice)

    raw_messages = cloned.get("messages", [])
    transformed_messages: list[dict[str, Any]] = []
    has_system = False

    for msg in raw_messages:
        if not isinstance(msg, dict):
            transformed_messages.append(msg)
            continue
        role = msg.get("role")
        content = msg.get("content") or ""

        # Handle tool/function response messages from client
        if role in ("tool", "function"):
            tool_name = msg.get("name") or msg.get("tool_call_id") or "function"
            transformed_messages.append({
                "role": "user",
                "content": f"[Tool Result for {tool_name}]: {content}\nPlease answer the user question using this result.",
            })
            continue

        # Handle previous assistant messages with tool_calls
        if role == "assistant" and msg.get("tool_calls"):
            calls_summary = []
            for tc in msg["tool_calls"]:
                fn = tc.get("function", {})
                name = fn.get("name")
                args = fn.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        pass
                calls_summary.append({"name": name, "arguments": args})
            json_text = json.dumps({"tool_calls": calls_summary}, indent=2, ensure_ascii=False)
            assistant_content = f"```json\n{json_text}\n```"
            if content:
                assistant_content = f"{content}\n\n{assistant_content}"
            transformed_messages.append({
                "role": "assistant",
                "content": assistant_content,
            })
            continue

        # System message injection
        if role == "system" and not has_system:
            transformed_messages.append({
                "role": "system",
                "content": f"{content}\n\n{tool_instruction}".strip(),
            })
            has_system = True
            continue

        transformed_messages.append(dict(msg))

    if not has_system:
        transformed_messages.insert(0, {
            "role": "system",
            "content": tool_instruction,
        })

    cloned["messages"] = transformed_messages
    return cloned, original_tools


def extract_tool_calls(
    text: str, known_tools: list[dict[str, Any]]
) -> list[dict[str, Any]] | None:
    """
    Inspect model text output and extract any structured tool calls.
    Supports standard tool_calls, Qwen style, and Llama function format.
    """
    if not text or not isinstance(text, str):
        return None

    known_names = set()
    for t in known_tools:
        if isinstance(t, dict):
            if "function" in t and isinstance(t["function"], dict):
                known_names.add(t["function"].get("name"))
            elif "name" in t:
                known_names.add(t.get("name"))

    candidates: list[str] = []

    # 1. Fenced markdown blocks
    fenced_blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    candidates.extend(fenced_blocks)

    # 2. Outermost balanced JSON objects
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        candidates.append(text[brace_start : brace_end + 1])

    # 3. Outermost balanced JSON arrays
    bracket_start = text.find("[")
    bracket_end = text.rfind("]")
    if bracket_start != -1 and bracket_end > bracket_start:
        candidates.append(text[bracket_start : bracket_end + 1])

    for raw in candidates:
        trimmed = raw.strip()
        if not trimmed:
            continue
        try:
            parsed = json.loads(trimmed)
            extracted = _normalize_tool_calls_object(parsed, known_names)
            if extracted:
                return extracted
        except Exception:
            continue

    return None


def _normalize_tool_calls_object(
    data: Any, known_names: set[str | None]
) -> list[dict[str, Any]] | None:
    results: list[dict[str, Any]] = []

    if isinstance(data, dict):
        # Shape A: {"tool_calls": [{"name": ..., "arguments": ...}]}
        if "tool_calls" in data and isinstance(data["tool_calls"], list):
            for item in data["tool_calls"]:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("function", {}).get("name")
                    args = item.get("arguments", item.get("parameters", {}))
                    if name in known_names:
                        results.append(_format_tool_call(name, args))
        # Shape B: {"name": ..., "arguments": ...}
        elif "name" in data and data["name"] in known_names:
            args = data.get("arguments", data.get("parameters", {}))
            results.append(_format_tool_call(data["name"], args))
        # Shape C: {"tool": ..., "parameters": ...} (Qwen default)
        elif "tool" in data and data["tool"] in known_names:
            args = data.get("parameters", data.get("arguments", {}))
            results.append(_format_tool_call(data["tool"], args))
        # Shape D: {"function": ..., "arguments": ...}
        elif (
            "function" in data
            and isinstance(data["function"], str)
            and data["function"] in known_names
        ):
            args = data.get("arguments", data.get("parameters", {}))
            results.append(_format_tool_call(data["function"], args))

    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                name = (
                    item.get("name")
                    or item.get("function", {}).get("name")
                    or item.get("tool")
                )
                args = item.get("arguments", item.get("parameters", {}))
                if name in known_names:
                    results.append(_format_tool_call(name, args))

    return results if results else None


def _format_tool_call(name: str, args: Any) -> dict[str, Any]:
    args_str = json.dumps(args) if isinstance(args, (dict, list)) else str(args)
    return {
        "id": f"call_{uuid.uuid4().hex[:24]}",
        "type": "function",
        "function": {
            "name": name,
            "arguments": args_str,
        },
    }


class EmulatedToolStreamFilter:
    """Buffers streaming tokens for emulated tool calls and emits OpenAI tool_call SSE chunks."""

    def __init__(self, original_tools: list[dict[str, Any]], model_id: str):
        self.original_tools = original_tools
        self.model_id = model_id
        self.buffer = ""
        self.is_determined = False
        self.is_tool_call_candidate = False
        self.last_chunk_template: dict[str, Any] | None = None
        self.stream_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        self.created = int(time.time())

    def process_chunk(self, chunk_line: str) -> list[bytes]:
        if not chunk_line.startswith("data: "):
            return [f"{chunk_line}\n".encode()]

        raw = chunk_line[6:].strip()
        if raw == "[DONE]":
            return self.flush_done()

        try:
            chunk_obj = json.loads(raw)
            self.last_chunk_template = chunk_obj
            self.stream_id = chunk_obj.get("id", self.stream_id)
            self.created = chunk_obj.get("created", self.created)
            choices = chunk_obj.get("choices", [])
            if not choices or not isinstance(choices, list):
                return [f"{chunk_line}\n".encode()]

            delta = choices[0].get("delta", {})
            content = delta.get("content")
            if not content or not isinstance(content, str):
                if self.is_determined and not self.is_tool_call_candidate:
                    return [f"{chunk_line}\n".encode()]
                return []

            self.buffer += content

            # Determine mode if not determined yet
            if not self.is_determined:
                stripped = self.buffer.strip()
                if not stripped:
                    return []
                if (
                    stripped.startswith("```")
                    or stripped.startswith("{")
                    or stripped.startswith("[")
                ):
                    self.is_determined = True
                    self.is_tool_call_candidate = True
                    return []
                else:
                    self.is_determined = True
                    self.is_tool_call_candidate = False
                    flushed = self.buffer
                    self.buffer = ""
                    c = dict(chunk_obj)
                    c["choices"] = [{
                        **choices[0],
                        "delta": {"content": flushed},
                    }]
                    return [f"data: {json.dumps(c)}\n\n".encode()]

            if not self.is_tool_call_candidate:
                flushed = self.buffer
                self.buffer = ""
                c = dict(chunk_obj)
                c["choices"] = [{
                    **choices[0],
                    "delta": {"content": flushed},
                }]
                return [f"data: {json.dumps(c)}\n\n".encode()]

            return []

        except Exception:
            return [f"{chunk_line}\n".encode()]

    def flush_done(self) -> list[bytes]:
        results = []
        if self.is_tool_call_candidate and self.buffer:
            tool_calls = extract_tool_calls(self.buffer, self.original_tools)
            if tool_calls:
                for idx, tc in enumerate(tool_calls):
                    chunk1 = {
                        "id": self.stream_id,
                        "object": "chat.completion.chunk",
                        "created": self.created,
                        "model": self.model_id,
                        "choices": [{
                            "index": 0,
                            "delta": {
                                "role": "assistant",
                                "tool_calls": [{
                                    "index": idx,
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {
                                        "name": tc["function"]["name"],
                                        "arguments": "",
                                    },
                                }],
                            },
                            "finish_reason": None,
                        }],
                    }
                    results.append(f"data: {json.dumps(chunk1)}\n\n".encode())

                    chunk2 = {
                        "id": self.stream_id,
                        "object": "chat.completion.chunk",
                        "created": self.created,
                        "model": self.model_id,
                        "choices": [{
                            "index": 0,
                            "delta": {
                                "tool_calls": [{
                                    "index": idx,
                                    "function": {
                                        "arguments": tc["function"]["arguments"]
                                    },
                                }],
                            },
                            "finish_reason": None,
                        }],
                    }
                    results.append(f"data: {json.dumps(chunk2)}\n\n".encode())

                chunk3 = {
                    "id": self.stream_id,
                    "object": "chat.completion.chunk",
                    "created": self.created,
                    "model": self.model_id,
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": "tool_calls",
                    }],
                }
                results.append(f"data: {json.dumps(chunk3)}\n\n".encode())
                results.append(b"data: [DONE]\n\n")
                return results

            chunk_fallback = {
                "id": self.stream_id,
                "object": "chat.completion.chunk",
                "created": self.created,
                "model": self.model_id,
                "choices": [{
                    "index": 0,
                    "delta": {"content": self.buffer},
                    "finish_reason": "stop",
                }],
            }
            results.append(f"data: {json.dumps(chunk_fallback)}\n\n".encode())

        results.append(b"data: [DONE]\n\n")
        return results
