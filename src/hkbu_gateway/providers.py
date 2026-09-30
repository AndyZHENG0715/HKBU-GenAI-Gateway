from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .config import Settings
from .registry import find_model
from .tools import (
    EmulatedToolStreamFilter,
    extract_tool_calls,
    is_tool_emulation_required,
    prepare_emulated_payload,
)


class UpstreamError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


REASONING_TAG_PAIRS = [
    ("<think>", "</think>"),
    ("<thought>", "</thought>"),
    ("<thinking>", "</thinking>"),
    ("<reasoning>", "</reasoning>"),
]


class ThinkStreamFilter:
    def __init__(self):
        self.in_think = False
        self.closing_tag = ""
        self.buffer = ""

    def process(self, content: str) -> list[tuple[str, str]]:
        text = self.buffer + content
        self.buffer = ""
        results: list[tuple[str, str]] = []

        if not self.in_think:
            matched_pair = None
            earliest_idx = -1
            for open_tag, close_tag in REASONING_TAG_PAIRS:
                idx = text.find(open_tag)
                if idx != -1 and (earliest_idx == -1 or idx < earliest_idx):
                    earliest_idx = idx
                    matched_pair = (open_tag, close_tag)

            if matched_pair:
                open_tag, close_tag = matched_pair
                pre, post = text.split(open_tag, 1)
                if pre:
                    results.append(("content", pre))
                self.in_think = True
                self.closing_tag = close_tag
                text = post
            else:
                longest_partial = 0
                for open_tag, _ in REASONING_TAG_PAIRS:
                    for i in range(len(open_tag) - 1, 0, -1):
                        if text.endswith(open_tag[:i]) and i > longest_partial:
                            longest_partial = i
                if longest_partial > 0:
                    self.buffer = text[-longest_partial:]
                    text = text[:-longest_partial]
                if text:
                    results.append(("content", text))
                return results

        if self.in_think:
            close_tag = self.closing_tag or "</think>"
            if close_tag in text:
                think_body, post = text.split(close_tag, 1)
                if think_body:
                    results.append(("reasoning_content", think_body))
                self.in_think = False
                self.closing_tag = ""
                post = post.lstrip("\n")
                if post:
                    results.append(("content", post))
            else:
                for i in range(len(close_tag) - 1, 0, -1):
                    if text.endswith(close_tag[:i]):
                        self.buffer = text[-i:]
                        text = text[:-i]
                        break
                if text:
                    results.append(("reasoning_content", text))
        return results

    def flush(self) -> list[tuple[str, str]]:
        if self.buffer:
            kind = "reasoning_content" if self.in_think else "content"
            res = [(kind, self.buffer)]
            self.buffer = ""
            return res
        return []


class HKBUProvider:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client

    def _headers(self, api_key: str | None = None) -> dict[str, str]:
        api_key = api_key or self.settings.upstream_api_key
        if not api_key:
            raise UpstreamError(503, "HKBU upstream credentials are not configured")
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            self.settings.upstream_auth_header: api_key,
        }

    def _url(self, model: str, operation: str) -> str:
        model_metadata = find_model(model)
        api_version = model_metadata.api_version if model_metadata else None
        query = f"?api-version={api_version}" if api_version else ""
        return (
            f"{self.settings.upstream_base_url}/"
            f"{self.settings.upstream_path_style}/{model}/{operation}{query}"
        )

    async def chat(
        self, model: str, payload: dict[str, Any], api_key: str | None = None
    ) -> httpx.Response:
        emulate = is_tool_emulation_required(model, payload)
        original_tools: list[dict[str, Any]] = []
        if emulate:
            payload, original_tools = prepare_emulated_payload(payload)

        response = await self.client.post(
            self._url(model, "chat/completions"),
            headers=self._headers(api_key),
            json=payload,
        )
        if response.is_error:
            raise UpstreamError(response.status_code, response.text[:2000])

        if emulate and original_tools:
            try:
                data = response.json()
                choices = data.get("choices", [])
                if choices and isinstance(choices, list):
                    msg = choices[0].get("message", {})
                    content = msg.get("content") or ""
                    tool_calls = extract_tool_calls(content, original_tools)
                    if tool_calls:
                        msg["tool_calls"] = tool_calls
                        msg["content"] = None
                        choices[0]["finish_reason"] = "tool_calls"
                return httpx.Response(
                    status_code=response.status_code,
                    headers=response.headers,
                    content=json.dumps(data).encode("utf-8"),
                    request=response.request,
                )
            except Exception:
                return response
        return response

    async def embeddings(
        self, model: str, payload: dict[str, Any], api_key: str | None = None
    ) -> httpx.Response:
        response = await self.client.post(
            self._url(model, "embeddings"),
            headers=self._headers(api_key),
            json=payload,
        )
        if response.is_error:
            raise UpstreamError(response.status_code, response.text[:2000])
        return response

    async def chat_stream(
        self, model: str, payload: dict[str, Any], api_key: str | None = None
    ) -> AsyncIterator[bytes]:
        emulate = is_tool_emulation_required(model, payload)
        original_tools: list[dict[str, Any]] = []
        tool_stream_filter: EmulatedToolStreamFilter | None = None
        if emulate:
            payload, original_tools = prepare_emulated_payload(payload)
            if original_tools:
                tool_stream_filter = EmulatedToolStreamFilter(original_tools, model)

        think_filter = ThinkStreamFilter()
        last_chunk_template: dict[str, Any] | None = None
        has_emitted_role = False
        has_emitted_finish = False
        has_emitted_choices = False

        try:
            async with self.client.stream(
                "POST",
                self._url(model, "chat/completions"),
                headers=self._headers(api_key),
                json=payload,
                timeout=120.0,
            ) as response:
                if response.is_error:
                    raw_bytes = await response.aread()
                    error_detail = raw_bytes[:2000].decode("utf-8", errors="replace")
                    error_json = json.dumps({
                        "error": {
                            "message": f"HKBU Platform error ({response.status_code}): {error_detail}",
                            "type": "upstream_error",
                            "code": response.status_code,
                        },
                        "choices": [{
                            "index": 0,
                            "delta": {
                                "role": "assistant",
                                "content": f"\n\n[Error from HKBU Platform ({response.status_code}): {error_detail}]\n\n",
                            },
                            "finish_reason": "stop",
                        }],
                    })
                    yield f"data: {error_json}\n\n".encode()
                    yield b"data: [DONE]\n\n"
                    return

                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type:
                    # Upstream returned a single JSON response instead of SSE stream
                    raw_bytes = await response.aread()
                    text = raw_bytes.decode("utf-8", errors="replace")
                    try:
                        data = json.loads(text)
                        if "error" in data:
                            err_msg = data["error"].get("message") if isinstance(data["error"], dict) else str(data["error"])
                            error_json = json.dumps({
                                "error": data["error"],
                                "choices": [{
                                    "index": 0,
                                    "delta": {
                                        "role": "assistant",
                                        "content": f"\n\n[Error from HKBU Platform: {err_msg}]\n\n",
                                    },
                                    "finish_reason": "stop",
                                }],
                            })
                            yield f"data: {error_json}\n\n".encode()
                            yield b"data: [DONE]\n\n"
                            return
                        if "choices" in data and isinstance(data["choices"], list) and len(data["choices"]) > 0:
                            c_text = data["choices"][0].get("message", {}).get("content") or ""
                            stream_id = data.get("id", f"chatcmpl-{uuid.uuid4().hex[:24]}")
                            chunk1 = {
                                "id": stream_id,
                                "object": "chat.completion.chunk",
                                "created": data.get("created", int(time.time())),
                                "model": model,
                                "choices": [{"index": 0, "delta": {"role": "assistant", "content": c_text}, "finish_reason": None}],
                            }
                            chunk2 = {
                                "id": stream_id,
                                "object": "chat.completion.chunk",
                                "created": data.get("created", int(time.time())),
                                "model": model,
                                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                            }
                            if tool_stream_filter:
                                for chunk in (chunk1, chunk2):
                                    for event in tool_stream_filter.process_chunk(f"data: {json.dumps(chunk)}"):
                                        yield event
                                for event in tool_stream_filter.flush_done():
                                    yield event
                            else:
                                yield f"data: {json.dumps(chunk1)}\n\n".encode()
                                yield f"data: {json.dumps(chunk2)}\n\n".encode()
                                yield b"data: [DONE]\n\n"
                            return
                    except Exception:
                        pass

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue

                    raw_data = line[5:].strip()
                    if raw_data == "[DONE]":
                        # Flush any remaining buffer before closing
                        for kind, piece in think_filter.flush():
                            if last_chunk_template and piece:
                                c = dict(last_chunk_template)
                                if kind == "reasoning_content":
                                    c["choices"] = [{
                                        "index": 0,
                                        "delta": {"reasoning_content": piece},
                                        "finish_reason": None,
                                    }]
                                    yield f"data: {json.dumps(c)}\n\n".encode()
                                    has_emitted_choices = True
                                else:
                                    c["choices"] = [{
                                        "index": 0,
                                        "delta": {"content": piece},
                                        "finish_reason": None,
                                    }]
                                    if emulate and tool_stream_filter:
                                        synthetic_line = f"data: {json.dumps(c)}"
                                        for chunk_bytes in tool_stream_filter.process_chunk(synthetic_line):
                                            yield chunk_bytes
                                            has_emitted_choices = True
                                    else:
                                        yield f"data: {json.dumps(c)}\n\n".encode()
                                        has_emitted_choices = True

                        if emulate and tool_stream_filter:
                            for chunk_bytes in tool_stream_filter.flush_done():
                                yield chunk_bytes
                                has_emitted_choices = True
                                has_emitted_finish = True
                        else:
                            if not has_emitted_finish:
                                fallback_template = last_chunk_template or {
                                    "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
                                    "object": "chat.completion.chunk",
                                    "created": int(time.time()),
                                    "model": model,
                                }
                                c = dict(fallback_template)
                                c["choices"] = [{
                                    "index": 0,
                                    "delta": {} if has_emitted_choices else {"role": "assistant", "content": ""},
                                    "finish_reason": "stop",
                                }]
                                yield f"data: {json.dumps(c)}\n\n".encode()
                                has_emitted_choices = True
                                has_emitted_finish = True
                            yield b"data: [DONE]\n\n"
                        return

                    try:
                        chunk_obj = json.loads(raw_data)
                        last_chunk_template = chunk_obj

                        # Check for mid-stream error payload
                        if "error" in chunk_obj:
                            err_msg = chunk_obj["error"].get("message") if isinstance(chunk_obj["error"], dict) else str(chunk_obj["error"])
                            c = {
                                "id": chunk_obj.get("id", f"chatcmpl-{uuid.uuid4().hex[:24]}"),
                                "object": "chat.completion.chunk",
                                "created": chunk_obj.get("created", int(time.time())),
                                "model": model,
                                "error": chunk_obj["error"],
                                "choices": [{
                                    "index": 0,
                                    "delta": {"content": f"\n\n[Error from HKBU Platform: {err_msg}]\n\n"},
                                    "finish_reason": "stop",
                                }],
                            }
                            yield f"data: {json.dumps(c)}\n\n".encode()
                            has_emitted_choices = True
                            has_emitted_finish = True
                            yield b"data: [DONE]\n\n"
                            return

                        choices = chunk_obj.get("choices")
                        if choices and isinstance(choices, list) and len(choices) > 0:
                            choice = choices[0]
                            delta = choice.get("delta", {})
                            finish_reason = choice.get("finish_reason")
                            content = delta.get("content")

                            if finish_reason:
                                has_emitted_finish = True
                            if delta.get("role"):
                                has_emitted_role = True

                            # If chunk has content and no explicit reasoning_content, filter through ThinkStreamFilter
                            if isinstance(content, str) and "reasoning_content" not in delta:
                                events = think_filter.process(content)
                                if not events:
                                    # Text buffered or empty; if chunk carries finish_reason or role, forward it!
                                    if finish_reason or delta.get("role"):
                                        c = dict(chunk_obj)
                                        synthetic_line = f"data: {json.dumps(c)}"
                                        if emulate and tool_stream_filter:
                                            for chunk_bytes in tool_stream_filter.process_chunk(synthetic_line):
                                                yield chunk_bytes
                                                has_emitted_choices = True
                                        else:
                                            yield f"{synthetic_line}\n\n".encode()
                                            has_emitted_choices = True
                                    continue

                                for kind, piece in events:
                                    c = dict(chunk_obj)
                                    new_delta = dict(delta)
                                    if kind == "reasoning_content":
                                        new_delta.pop("content", None)
                                        new_delta["reasoning_content"] = piece
                                        c["choices"] = [{
                                            **choice,
                                            "delta": new_delta,
                                        }]
                                        yield f"data: {json.dumps(c)}\n\n".encode()
                                        has_emitted_choices = True
                                    else:
                                        if not has_emitted_role:
                                            new_delta["role"] = "assistant"
                                            has_emitted_role = True
                                        new_delta["content"] = piece
                                        c["choices"] = [{
                                            **choice,
                                            "delta": new_delta,
                                        }]
                                        synthetic_line = f"data: {json.dumps(c)}"
                                        if emulate and tool_stream_filter:
                                            for chunk_bytes in tool_stream_filter.process_chunk(synthetic_line):
                                                yield chunk_bytes
                                                has_emitted_choices = True
                                        else:
                                            yield f"{synthetic_line}\n\n".encode()
                                            has_emitted_choices = True
                                continue

                            # Other non-text chunk with choices (role, finish_reason, tool_calls, native reasoning)
                            if not has_emitted_role and not delta.get("role") and not finish_reason:
                                delta["role"] = "assistant"
                                has_emitted_role = True
                            if delta.get("role") and "content" not in delta:
                                delta["content"] = ""
                            synthetic_line = f"data: {json.dumps(chunk_obj)}"
                            if emulate and tool_stream_filter:
                                for chunk_bytes in tool_stream_filter.process_chunk(synthetic_line):
                                    yield chunk_bytes
                                    has_emitted_choices = True
                            else:
                                yield f"{synthetic_line}\n\n".encode()
                                has_emitted_choices = True
                            continue

                        # Chunk has empty choices or no choices (e.g. usage chunk)
                        if chunk_obj.get("usage"):
                            c = dict(chunk_obj)
                            # Guarantee non-empty choices so Copilot / clients never fail
                            c["choices"] = [{
                                "index": 0,
                                "delta": {},
                                "finish_reason": None,
                            }]
                            yield f"data: {json.dumps(c)}\n\n".encode()
                            has_emitted_choices = True

                    except Exception:
                        pass

                # If loop completed without seeing [DONE]
                for kind, piece in think_filter.flush():
                    if last_chunk_template and piece:
                        c = dict(last_chunk_template)
                        c["choices"] = [{
                            "index": 0,
                            "delta": {"content": piece},
                            "finish_reason": None,
                        }]
                        if emulate and tool_stream_filter:
                            for chunk_bytes in tool_stream_filter.process_chunk(f"data: {json.dumps(c)}"):
                                yield chunk_bytes
                                has_emitted_choices = True
                        else:
                            yield f"data: {json.dumps(c)}\n\n".encode()
                            has_emitted_choices = True

                if emulate and tool_stream_filter:
                    for chunk_bytes in tool_stream_filter.flush_done():
                        yield chunk_bytes
                        has_emitted_choices = True
                        has_emitted_finish = True
                else:
                    if not has_emitted_finish:
                        fallback_template = last_chunk_template or {
                            "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model,
                        }
                        c = dict(fallback_template)
                        c["choices"] = [{
                            "index": 0,
                            "delta": {} if has_emitted_choices else {"role": "assistant", "content": ""},
                            "finish_reason": "stop",
                        }]
                        yield f"data: {json.dumps(c)}\n\n".encode()
                        has_emitted_choices = True
                        has_emitted_finish = True
                    yield b"data: [DONE]\n\n"

        except Exception as exc:
            error_json = json.dumps({
                "error": {
                    "message": f"Network error connecting to HKBU Platform: {exc}",
                    "type": "upstream_error",
                },
                "choices": [{
                    "index": 0,
                    "delta": {
                        "role": "assistant",
                        "content": f"\n\n[Gateway Network Error: {exc}]\n\n",
                    },
                    "finish_reason": "stop",
                }],
            })
            yield f"data: {error_json}\n\n".encode()
            yield b"data: [DONE]\n\n"
