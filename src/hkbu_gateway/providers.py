import json
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
            tool_stream_filter = EmulatedToolStreamFilter(original_tools, model)

        think_filter = ThinkStreamFilter()
        last_chunk_template: dict[str, Any] | None = None

        try:
            async with self.client.stream(
                "POST",
                self._url(model, "chat/completions"),
                headers=self._headers(api_key),
                json=payload,
            ) as response:
                if response.is_error:
                    raw_bytes = await response.aread()
                    error_detail = raw_bytes[:2000].decode("utf-8", errors="replace")
                    error_json = json.dumps({
                        "error": {
                            "message": f"HKBU Platform error ({response.status_code}): {error_detail}",
                            "type": "upstream_error",
                            "code": response.status_code,
                        }
                    })
                    yield f"data: {error_json}\n\n".encode()
                    yield b"data: [DONE]\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        yield b"\n"
                        continue

                    if emulate and tool_stream_filter:
                        for chunk_bytes in tool_stream_filter.process_chunk(line):
                            yield chunk_bytes
                        if line.strip() == "data: [DONE]":
                            return
                        continue

                    if not line.startswith("data: "):
                        yield f"{line}\n".encode()
                        continue

                    raw_data = line[6:].strip()
                    if raw_data == "[DONE]":
                        # Flush any remaining buffer before closing
                        for kind, piece in think_filter.flush():
                            if last_chunk_template and piece:
                                c = dict(last_chunk_template)
                                c["choices"] = [{
                                    "index": 0,
                                    "delta": {kind: piece},
                                    "finish_reason": None,
                                }]
                                yield f"data: {json.dumps(c)}\n\n".encode()
                        yield b"data: [DONE]\n\n"
                        return

                    try:
                        chunk_obj = json.loads(raw_data)
                        last_chunk_template = chunk_obj
                        choices = chunk_obj.get("choices")
                        if choices and isinstance(choices, list) and len(choices) > 0:
                            delta = choices[0].get("delta", {})
                            content = delta.get("content")
                            # If chunk has content and no explicit reasoning_content, filter through ThinkStreamFilter
                            if isinstance(content, str) and "reasoning_content" not in delta:
                                events = think_filter.process(content)
                                if not events:
                                    # Text buffered waiting for tag boundary
                                    continue
                                for kind, piece in events:
                                    c = dict(chunk_obj)
                                    new_delta = dict(delta)
                                    new_delta.pop("content", None)
                                    new_delta[kind] = piece
                                    c["choices"] = [{
                                        **choices[0],
                                        "delta": new_delta,
                                    }]
                                    yield f"data: {json.dumps(c)}\n\n".encode()
                                continue
                        # If not content chunk, pass through
                        yield f"{line}\n".encode()
                    except Exception:
                        yield f"{line}\n".encode()

                if emulate and tool_stream_filter and tool_stream_filter.buffer:
                    for chunk_bytes in tool_stream_filter.flush_done():
                        yield chunk_bytes

        except Exception as exc:
            error_json = json.dumps({
                "error": {
                    "message": f"Network error connecting to HKBU Platform: {exc}",
                    "type": "upstream_error",
                }
            })
            yield f"data: {error_json}\n\n".encode()
            yield b"data: [DONE]\n\n"

