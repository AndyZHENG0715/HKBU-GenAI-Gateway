import asyncio
import hmac
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

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
    app.state.credentials = CredentialStore(
        settings.database_path, settings.encryption_key
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

    # Try common models to validate student key against upstream HKBU platform
    models_to_test = ["gpt-4.1", "deepseek-v4-flash", "gpt-4.1-mini", "gemini-2.5-flash", "qwen-plus"]
    validated = False
    auth_failed = False
    last_error_detail = ""

    for test_model in models_to_test:
        try:
            await provider.chat(
                test_model,
                {
                    "model": test_model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5,
                },
                request.hkbu_api_key,
            )
            validated = True
            logger.info("HKBU key validation succeeded using model %s", test_model)
            break
        except UpstreamError as exc:
            last_error_detail = exc.detail
            logger.warning(
                "Upstream validation test with %s returned HTTP %s: %s",
                test_model,
                exc.status_code,
                exc.detail,
            )
            # If the upstream gateway specifically rejects the API key credentials, abort early
            if exc.status_code == 401 and ("API key validation failed" in exc.detail or "Unauthorized" in exc.detail):
                auth_failed = True
                break
            # Otherwise, the key was accepted by auth, but this specific model failed or has no quota; try next
            continue
        except httpx.HTTPError as exc:
            last_error_detail = str(exc)
            logger.warning("Upstream network error with %s: %s", test_model, exc)
            continue

    if auth_failed:
        raise HTTPException(
            status_code=401,
            detail="Invalid HKBU GenAI Platform key. Please check your key at genai.hkbu.edu.hk.",
        )

    if not validated:
        logger.error("All test models failed during key validation. Last error: %s", last_error_detail)
        raise HTTPException(
            status_code=502,
            detail=f"HKBU Platform error ({last_error_detail}). Please verify your key has active quota on genai.hkbu.edu.hk.",
        )

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
    if "messages" in payload and isinstance(payload["messages"], list):
        for msg in payload["messages"]:
            if "content" not in msg or msg["content"] is None:
                msg["content"] = ""
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
