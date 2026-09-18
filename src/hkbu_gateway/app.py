import asyncio
import hmac
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
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


app = FastAPI(title="HKBU GenAI Gateway", version=__version__, lifespan=lifespan)


def _token(authorization: str | None) -> str:
    if not authorization:
        return ""
    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


def require_gateway_key(
    request: Request, authorization: str | None = Header(default=None)
) -> Credential:
    raw_token = authorization or request.headers.get("api-key") or request.headers.get("x-api-key")
    supplied = _token(raw_token)
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
    err_type = "invalid_request_error"
    if exc.status_code in (401, 403):
        err_type = "authentication_error"
    elif exc.status_code == 429:
        err_type = "insufficient_quota"
    elif exc.status_code >= 500:
        err_type = "api_error"
    return JSONResponse(
        status_code=exc.status_code,
        content=openai_error(str(exc.detail), err_type),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    messages = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in exc.errors()]
    return JSONResponse(
        status_code=400,
        content=openai_error("; ".join(messages), "invalid_request_error"),
    )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


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
            if exc.status_code in (401, 403):
                auth_failed = True
                last_error_detail = exc.detail
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


def optional_gateway_key(
    request: Request, authorization: str | None = Header(default=None)
) -> Credential | None:
    raw_token = authorization or request.headers.get("api-key") or request.headers.get("x-api-key")
    supplied = _token(raw_token)
    if not supplied:
        return None
    store: CredentialStore | None = getattr(request.app.state, "credentials", None)
    if store:
        credential = store.resolve(supplied)
        if credential:
            return credential
    settings = getattr(request.app.state, "settings", Settings.from_env())
    expected = settings.gateway_api_key
    if expected and hmac.compare_digest(supplied, expected):
        return Credential(0, "", settings.upstream_api_key or "")
    return None


@app.get("/v1/models")
@app.get("/models")
@app.get("/v1/model")
@app.get("/model")
async def list_models(
    credential: Credential | None = Depends(optional_gateway_key),
) -> dict[str, Any]:
    now = int(time.time())
    return {
        "object": "list",
        "data": [model.to_dict(created=now) for model in MODELS],
    }


@app.get("/v1/models/{model_id:path}")
@app.get("/models/{model_id:path}")
@app.get("/v1/model/{model_id:path}")
@app.get("/model/{model_id:path}")
async def get_model(
    model_id: str,
    credential: Credential | None = Depends(optional_gateway_key),
) -> dict[str, Any]:
    model = find_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")
    return model.to_dict()


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
@app.post("/chat/completions")
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
        data = response.json()
        if isinstance(data, dict) and "choices" in data:
            for choice in data.get("choices", []):
                msg = choice.get("message", {})
                content = msg.get("content") or ""
                if "<think>" in content and "</think>" in content:
                    pre, rest = content.split("<think>", 1)
                    think_body, post = rest.split("</think>", 1)
                    msg["reasoning_content"] = think_body.strip()
                    msg["content"] = (pre + post.lstrip("\n")).strip()
        return JSONResponse(content=data)
    except (UpstreamError, httpx.HTTPError) as exc:
        status = exc.status_code if isinstance(exc, UpstreamError) else 502
        detail = exc.detail if isinstance(exc, UpstreamError) else str(exc)
        return JSONResponse(status_code=status, content=openai_error(detail, "upstream_error"))


@app.post("/v1/embeddings")
@app.post("/embeddings")
async def embeddings(
    request: EmbeddingRequest,
    http_request: Request,
    credential: Credential = Depends(require_gateway_key),
):
    model = validate_model(request.model, "embedding")
    provider: HKBUProvider = http_request.app.state.provider
    payload = upstream_payload(request)
    payload["model"] = model.id
    try:
        response = await provider.embeddings(
            model.id, payload, credential.hkbu_api_key
        )
        return JSONResponse(content=response.json())
    except (UpstreamError, httpx.HTTPError) as exc:
        status = exc.status_code if isinstance(exc, UpstreamError) else 502
        detail = exc.detail if isinstance(exc, UpstreamError) else str(exc)
        return JSONResponse(status_code=status, content=openai_error(detail, "upstream_error"))


static_dir = Path(__file__).resolve().parents[2] / "static"
if not static_dir.is_dir():
    static_dir = Path("static").resolve()
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
