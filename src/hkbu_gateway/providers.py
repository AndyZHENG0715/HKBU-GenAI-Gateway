import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .config import Settings
from .registry import find_model


class UpstreamError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


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
        response = await self.client.post(
            self._url(model, "chat/completions"),
            headers=self._headers(api_key),
            json=payload,
        )
        if response.is_error:
            raise UpstreamError(response.status_code, response.text[:2000])
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
                    yield f"{line}\n".encode()
        except Exception as exc:
            error_json = json.dumps({
                "error": {
                    "message": f"Network error connecting to HKBU Platform: {exc}",
                    "type": "upstream_error",
                }
            })
            yield f"data: {error_json}\n\n".encode()
            yield b"data: [DONE]\n\n"

