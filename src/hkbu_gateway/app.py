import asyncio
import hmac
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import Settings
from .credentials import Credential, CredentialStore
from .protocol import ChatCompletionRequest, EmbeddingRequest, openai_error
from .providers import HKBUProvider, UpstreamError
from .registry import MODELS, find_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(120.0))
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.provider = HKBUProvider(settings, app.state.client)
    app.state.credentials = (
        CredentialStore(settings.database_path, settings.encryption_key)
        if settings.encryption_key
        else None
    )
    yield
    await app.state.client.aclose()


app = FastAPI(title="HKBU GenAI Gateway", version="0.2.0", lifespan=lifespan)


def _token(authorization: str | None) -> str:
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    return supplied


def require_gateway_key(
    request: Request, authorization: str | None = Header(default=None)
) -> Credential:
    supplied = _token(authorization)
    store: CredentialStore | None = getattr(request.app.state, "credentials", None)
    if store:
        credential = store.resolve(supplied)
        if credential:
            return credential
    settings = getattr(request.app.state, "settings", Settings.from_env())
    expected = settings.gateway_api_key
    if expected and hmac.compare_digest(supplied, expected):
        return Credential(0, "", settings.upstream_api_key or "")
    if not expected and not store:
        raise HTTPException(status_code=503, detail="Gateway authentication is not configured")
    if not supplied or (not expected and not store):
        raise HTTPException(status_code=401, detail="Invalid gateway API key")
    if not hmac.compare_digest(supplied, expected or ""):
        raise HTTPException(status_code=401, detail="Invalid gateway API key")


@app.exception_handler(HTTPException)
async def http_error_handler(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=openai_error(str(exc.detail), "authentication_error"),
    )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "version": "0.2.0"}


class CredentialRequest(BaseModel):
    hkbu_api_key: str = Field(min_length=1, max_length=512)


@app.post("/api/credentials")
async def create_credential(
    request: CredentialRequest, http_request: Request
) -> dict[str, Any]:
    store: CredentialStore | None = http_request.app.state.credentials
    if not store:
        raise HTTPException(status_code=503, detail="Credential management is not configured")
    provider: HKBUProvider = http_request.app.state.provider
    try:
        await provider.chat(
            "gpt-4.1",
            {
                "messages": [{"role": "user", "content": "Reply with exactly: credential-test-ok"}],
                "max_tokens": 16,
                "temperature": 0,
            },
            request.hkbu_api_key,
        )
    except (UpstreamError, httpx.HTTPError) as exc:
        detail = exc.detail if isinstance(exc, UpstreamError) else "HKBU key validation failed"
        raise HTTPException(status_code=401, detail=detail) from exc
    credential = store.create(request.hkbu_api_key)
    return {
        "id": credential.key_id,
        "api_key": credential.gateway_key,
        "base_url": "/v1",
        "message": "Save this API key now; it cannot be shown again.",
    }


@app.delete("/api/credentials/current")
async def revoke_credential(
    request: Request, credential: Credential = Depends(require_gateway_key)
) -> dict[str, bool]:
    store: CredentialStore | None = request.app.state.credentials
    if not store or credential.key_id == 0:
        raise HTTPException(status_code=400, detail="Only managed credentials can be revoked")
    revoked = store.revoke(_token(request.headers.get("authorization")))
    return {"revoked": revoked}


@app.get("/v1/models")
async def list_models(credential: Credential = Depends(require_gateway_key)) -> dict[str, Any]:
    now = int(time.time())
    return {
        "object": "list",
        "data": [
            {
                "id": model.id,
                "object": "model",
                "created": now,
                "owned_by": model.provider,
            }
            for model in MODELS
        ],
    }


def validate_model(model_id: str, kind: str):
    model = find_model(model_id)
    if not model or model.kind != kind:
        raise HTTPException(status_code=400, detail=f"Unsupported {kind} model: {model_id}")
    return model


def upstream_payload(request: BaseModel) -> dict[str, Any]:
    payload = request.model_dump(exclude_none=True)
    payload.pop("model", None)
    return payload


@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    http_request: Request,
    credential: Credential = Depends(require_gateway_key),
):
    model = validate_model(request.model, "chat")
    provider: HKBUProvider = http_request.app.state.provider
    payload = upstream_payload(request)
    payload["model"] = model.id
    try:
        if request.stream:
            return StreamingResponse(
                provider.chat_stream(model.id, payload, credential.hkbu_api_key),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        response = await provider.chat(model.id, payload, credential.hkbu_api_key)
        return JSONResponse(content=response.json())
    except (UpstreamError, httpx.HTTPError) as exc:
        status = exc.status_code if isinstance(exc, UpstreamError) else 502
        detail = exc.detail if isinstance(exc, UpstreamError) else str(exc)
        return JSONResponse(status_code=status, content=openai_error(detail, "upstream_error"))


@app.post("/v1/embeddings")
async def embeddings(
    request: EmbeddingRequest,
    http_request: Request,
    credential: Credential = Depends(require_gateway_key),
):
    model = validate_model(request.model, "embedding")
    provider: HKBUProvider = http_request.app.state.provider
    try:
        response = await provider.embeddings(
            model.id, upstream_payload(request), credential.hkbu_api_key
        )
        return JSONResponse(content=response.json())
    except (UpstreamError, httpx.HTTPError) as exc:
        status = exc.status_code if isinstance(exc, UpstreamError) else 502
        detail = exc.detail if isinstance(exc, UpstreamError) else str(exc)
        return JSONResponse(status_code=status, content=openai_error(detail, "upstream_error"))


app.mount("/", StaticFiles(directory="static", html=True), name="frontend")
