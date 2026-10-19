from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    upstream_base_url: str = "https://genai.hkbu.edu.hk/api/v1"
    upstream_api_key: str | None = None
    gateway_api_key: str | None = None
    upstream_auth_header: str = "Authorization"
    # Empty means REST v1 (model in the body); "openai/deployments" selects the legacy v0 routes.
    upstream_path_style: str = ""
    database_path: str = "hkbu_gateway.db"
    encryption_key: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            upstream_base_url=os.getenv(
                "HKBU_UPSTREAM_BASE_URL",
                "https://genai.hkbu.edu.hk/api/v1",
            ).rstrip("/"),
            upstream_api_key=os.getenv("HKBU_UPSTREAM_API_KEY"),
            gateway_api_key=os.getenv("HKBU_GATEWAY_API_KEY"),
            upstream_auth_header=(
                os.getenv("HKBU_UPSTREAM_AUTH_HEADER")
                or os.getenv("HKBU_API_KEY_HEADER")
                or "Authorization"
            ),
            upstream_path_style=os.getenv(
                "HKBU_UPSTREAM_PATH_STYLE", ""
            ).strip("/"),
            database_path=os.getenv("HKBU_DATABASE_PATH", "hkbu_gateway.db"),
            encryption_key=os.getenv("HKBU_GATEWAY_ENCRYPTION_KEY"),
        )
