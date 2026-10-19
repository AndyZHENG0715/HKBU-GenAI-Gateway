from __future__ import annotations

import os
from dataclasses import dataclass

REST_V1_BASE_URL = "https://genai.hkbu.edu.hk/api/v1"
# Retired by the 2026-10 platform update. Deployments that still pin it in their
# environment are moved to REST v1, since the old routes no longer list models.
LEGACY_BASE_URLS = {
    "https://genai.hkbu.edu.hk/api/v0/rest",
    "https://genai.hkbu.edu.hk/api/v0",
}


@dataclass(frozen=True)
class Settings:
    upstream_base_url: str = REST_V1_BASE_URL
    upstream_api_key: str | None = None
    gateway_api_key: str | None = None
    upstream_auth_header: str = "Authorization"
    # Empty means REST v1 (model in the body); "openai/deployments" selects the legacy v0 routes.
    upstream_path_style: str = ""
    database_path: str = "hkbu_gateway.db"
    encryption_key: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        base_url = os.getenv("HKBU_UPSTREAM_BASE_URL", REST_V1_BASE_URL).rstrip("/")
        auth_header = (
            os.getenv("HKBU_UPSTREAM_AUTH_HEADER")
            or os.getenv("HKBU_API_KEY_HEADER")
            or "Authorization"
        )
        path_style = os.getenv("HKBU_UPSTREAM_PATH_STYLE", "").strip("/")
        if base_url in LEGACY_BASE_URLS:
            base_url, auth_header, path_style = REST_V1_BASE_URL, "Authorization", ""
        return cls(
            upstream_base_url=base_url,
            upstream_api_key=os.getenv("HKBU_UPSTREAM_API_KEY"),
            gateway_api_key=os.getenv("HKBU_GATEWAY_API_KEY"),
            upstream_auth_header=auth_header,
            upstream_path_style=path_style,
            database_path=os.getenv("HKBU_DATABASE_PATH", "hkbu_gateway.db"),
            encryption_key=os.getenv("HKBU_GATEWAY_ENCRYPTION_KEY"),
        )
