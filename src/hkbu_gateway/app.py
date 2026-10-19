from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .config import Settings
from .credentials import Credential, CredentialStore
from .accounts import AccountStore, require_account, router as account_router
from .protocol import ChatCompletionRequest, EmbeddingRequest, openai_error
from .providers import HKBUProvider, UpstreamError, REASONING_TAG_PAIRS
from .registry import MODELS, Model, find_model
from .webfetch import FetchPolicyError, fetch_public_url


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(120.0))
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.provider = HKBUProvider(settings, app.state.client)
    app.state.credentials = CredentialStore(
        settings.database_path, settings.encryption_key
    )
    app.state.accounts = AccountStore(app.state.credentials)
    yield
    await app.state.client.aclose()


app = FastAPI(title="HKBU GenAI Gateway", version=__version__, lifespan=lifespan)

app.include_router(account_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    name: str = Field(default="", max_length=80)


@app.post("/api/credentials")
async def create_credential(
    request: CredentialRequest, http_request: Request
) -> dict[str, Any]:
    owner = require_account(http_request)
    store: CredentialStore | None = http_request.app.state.credentials
    if not store:
        raise HTTPException(status_code=503, detail="Credential management is not configured")
    provider: HKBUProvider = http_request.app.state.provider

    # Listing models is free and checks the key without spending quota.
    try:
        await provider.list_models(request.hkbu_api_key)
    except UpstreamError as exc:
        if exc.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Invalid HKBU GenAI Platform key. Please check your key at genai.hkbu.edu.hk.",
            ) from exc
        logger.warning("Upstream key validation returned HTTP %s", exc.status_code)
        raise HTTPException(
            status_code=502,
            detail=f"HKBU Platform error (HTTP {exc.status_code}). Please try again later.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("Upstream network error during key validation: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach the HKBU GenAI Platform.") from exc

    credential = store.create(request.hkbu_api_key, owner["id"], request.name)
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
    raw_token = (request.headers.get("authorization") or request.headers.get("api-key")
                 or request.headers.get("x-api-key"))
    revoked = store.revoke(_token(raw_token))
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
@app.get("/api/v1/models")
async def list_models(
    credential: Credential | None = Depends(optional_gateway_key),
) -> dict[str, Any]:
    now = int(time.time())
    return {
        "object": "list",
        "data": [model.to_dict(created=now) for model in MODELS],
    }


@app.get("/v1/model/info")
@app.get("/model/info")
async def model_info(
    credential: Credential | None = Depends(optional_gateway_key),
) -> dict[str, Any]:
    return {
        "data": [
            {
                "model_name": model.id,
                "litellm_params": {
                    "model": model.id,
                },
                "model_info": {
                    "id": model.id,
                    "mode": model.kind,
                    "max_tokens": model.max_output,
                    "max_input_tokens": model.context_window,
                    "supports_function_calling": model.supports_tool_call,
                    "supports_parallel_function_calling": model.supports_parallel_tools,
                    "supports_vision": model.supports_vision,
                    "supports_reasoning": model.supports_reasoning,
                    "supports_response_schema": model.supports_structured_output,
                    "supports_system_messages": True,
                },
            }
            for model in MODELS
        ]
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


def _default_empty_content(role: str, has_tool_calls: bool) -> str | None:
    """Return upstream-acceptable content when message content is empty or whitespace.
    Upstream HKBU platform validator rejects empty string ("") across all roles.
    - assistant with tool_calls: null (None) is required.
    - tool / function: null and "" are rejected; non-empty string like '(success)' is required.
    - user / system / others: single whitespace ' ' is required.
    """
    if role == "assistant" and has_tool_calls:
        return None
    if role in ("tool", "function"):
        return "(success)"
    return " "


def _sanitize_message_content(msg: dict[str, Any]) -> None:
    """Ensure message content conforms to upstream HKBU requirements.
    Must be either a non-empty string, null (for assistant tool_calls), or an array of
    content objects strictly with type 'text' or 'image_url'.
    Upstream HKBU hard-rejects empty string ("") with 400 Bad Request.
    """
    content = msg.get("content")
    role = msg.get("role", "")
    has_tool_calls = bool(msg.get("tool_calls"))

    # 1. Null / None content
    if content is None:
        msg["content"] = _default_empty_content(role, has_tool_calls)
        return

    # 2. Already string
    if isinstance(content, str):
        if not content.strip():
            msg["content"] = _default_empty_content(role, has_tool_calls)
        return

    # 3. List of content objects (VS Code / Copilot / multimodal)
    if isinstance(content, list):
        if len(content) == 0:
            msg["content"] = _default_empty_content(role, has_tool_calls)
            return

        has_image = any(
            isinstance(item, dict) and item.get("type") == "image_url"
            for item in content
        )

        if has_image:
            sanitized_parts = []
            for item in content:
                if isinstance(item, str):
                    sanitized_parts.append({"type": "text", "text": item if item.strip() else " "})
                elif isinstance(item, dict):
                    itype = item.get("type")
                    if itype == "image_url":
                        sanitized_parts.append(item)
                    elif itype == "text":
                        text_val = item.get("text") or item.get("value") or ""
                        sanitized_parts.append({"type": "text", "text": str(text_val) if str(text_val).strip() else " "})
                    else:
                        text_val = (
                            item.get("text")
                            or item.get("value")
                            or item.get("content")
                            or json.dumps(item, ensure_ascii=False)
                        )
                        sanitized_parts.append({"type": "text", "text": str(text_val) if str(text_val).strip() else " "})
                else:
                    sanitized_parts.append({"type": "text", "text": str(item) if str(item).strip() else " "})
            msg["content"] = sanitized_parts
        else:
            # No images: flatten parts into a single string for maximum upstream compatibility
            text_pieces = []
            for item in content:
                if isinstance(item, str):
                    text_pieces.append(item)
                elif isinstance(item, dict):
                    text_val = (
                        item.get("text")
                        or item.get("value")
                        or item.get("content")
                        or ""
                    )
                    if not text_val and item.get("type") not in ("text", "image_url"):
                        text_val = json.dumps(item, ensure_ascii=False)
                    text_pieces.append(str(text_val))
                else:
                    text_pieces.append(str(item))
            joined = "".join(text_pieces)
            if not joined.strip():
                msg["content"] = _default_empty_content(role, has_tool_calls)
            else:
                msg["content"] = joined
        return

    # 4. Dict content
    if isinstance(content, dict):
        if content.get("type") == "image_url":
            msg["content"] = [content]
        else:
            text_val = (
                content.get("text")
                or content.get("value")
                or content.get("content")
                or json.dumps(content, ensure_ascii=False)
            )
            val_str = str(text_val)
            if not val_str.strip():
                msg["content"] = _default_empty_content(role, has_tool_calls)
            else:
                msg["content"] = val_str
        return

    # 5. Fallback for primitives
    primitive_str = str(content)
    if not primitive_str.strip():
        msg["content"] = _default_empty_content(role, has_tool_calls)
    else:
        msg["content"] = primitive_str






def is_reasoning_requested(payload: dict[str, Any]) -> bool:
    """Detect if client explicitly requested reasoning/thinking mode."""
    re_effort = payload.get("reasoning_effort")
    if isinstance(re_effort, str) and re_effort.lower() not in ("none", "off", "disabled", "false", "0"):
        return True
    if payload.get("enable_thinking") is True:
        return True
    if payload.get("reasoning") is True:
        return True
    thinking = payload.get("thinking")
    if isinstance(thinking, dict) and thinking.get("type") not in ("disabled", "off", "none", False):
        return True
    if thinking is True:
        return True
    extra_body = payload.get("extra_body")
    if isinstance(extra_body, dict):
        return is_reasoning_requested(extra_body)
    return False


MESSAGE_FIELDS = ("role", "content", "name", "tool_calls", "tool_call_id", "function_call")
TOOL_CALL_FIELDS = ("id", "type", "function")


def _strip_response_only_fields(msg: dict[str, Any]) -> None:
    """Drop fields clients echo back from responses (reasoning_content, tool_calls[].index).

    REST v1 validates messages strictly and returns HTTP 400 "property ... should not exist".
    """
    for key in [k for k in msg if k not in MESSAGE_FIELDS]:
        msg.pop(key)
    tool_calls = msg.get("tool_calls")
    if isinstance(tool_calls, list):
        for call in tool_calls:
            if isinstance(call, dict):
                for key in [k for k in call if k not in TOOL_CALL_FIELDS]:
                    call.pop(key)


# REST v1 rejects max_tokens / max_output_tokens below 16.
MIN_OUTPUT_TOKENS = 16
SAMPLING_PARAMETERS = ("temperature", "top_p", "presence_penalty", "frequency_penalty")


def _requested_effort(payload: dict[str, Any]) -> str | None:
    effort = payload.get("reasoning_effort")
    if isinstance(effort, str):
        return effort.lower()
    if is_reasoning_requested(payload):
        return "high"
    return None


def _sanitize_parameters(payload: dict[str, Any], model: Model) -> None:
    """Fit client parameters to what the REST v1 capability table allows for this model."""
    if not model.supports_temperature:
        for key in SAMPLING_PARAMETERS:
            payload.pop(key, None)
    for key in ("max_tokens", "max_completion_tokens"):
        value = payload.get(key)
        if isinstance(value, int) and value < MIN_OUTPUT_TOKENS:
            payload[key] = MIN_OUTPUT_TOKENS

    effort = _requested_effort(payload)
    for key in ("enable_thinking", "reasoning", "thinking"):
        payload.pop(key, None)
    if isinstance(payload.get("extra_body"), dict):
        for key in ("reasoning_effort", "enable_thinking", "reasoning", "thinking"):
            payload["extra_body"].pop(key, None)
        if not payload["extra_body"]:
            payload.pop("extra_body")
    payload.pop("reasoning_effort", None)
    if effort is None or not model.reasoning_efforts:
        return
    allowed = model.reasoning_efforts
    if effort in allowed:
        payload["reasoning_effort"] = effort
    elif effort in ("none", "off", "disabled", "false", "0", "minimal"):
        payload["reasoning_effort"] = allowed[0]
    else:
        payload["reasoning_effort"] = "high" if "high" in allowed else allowed[-1]


def upstream_payload(request: BaseModel, model_id: str | None = None) -> dict[str, Any]:
    payload = request.model_dump(exclude_none=True)
    payload.pop("model", None)

    if "messages" in payload and isinstance(payload["messages"], list):
        for msg in payload["messages"]:
            if isinstance(msg, dict):
                _sanitize_message_content(msg)
                _strip_response_only_fields(msg)

    model = find_model(model_id) if model_id else None
    if model:
        _sanitize_parameters(payload, model)

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
    payload = upstream_payload(request, model.id)
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
        if isinstance(data, dict):
            if "choices" not in data or not data["choices"]:
                data["choices"] = [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "",
                    },
                    "finish_reason": "stop",
                }]
            else:
                for choice in data.get("choices", []):
                    msg = choice.get("message", {})
                    content = msg.get("content") or ""
                    if msg.get("tool_calls"):
                        if choice.get("finish_reason") in ("STOP", "stop", None):
                            choice["finish_reason"] = "tool_calls"
                    for open_tag, close_tag in REASONING_TAG_PAIRS:
                        if open_tag in content and close_tag in content:
                            pre, rest = content.split(open_tag, 1)
                            think_body, post = rest.split(close_tag, 1)
                            msg["reasoning_content"] = think_body.strip()
                            clean_content = (pre + post.lstrip("\n")).strip()
                            msg["content"] = clean_content if clean_content else " "
                            break
                        elif open_tag in content:
                            pre, rest = content.split(open_tag, 1)
                            msg["reasoning_content"] = rest.strip()
                            clean_content = pre.strip()
                            msg["content"] = clean_content if clean_content else " "
                            break
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


@app.get("/api/companion/download")
async def download_companion():
    companion_path = Path(__file__).resolve().parents[2] / "companion" / "hkbu_genai_companion.py"
    if not companion_path.is_file():
        companion_path = Path("companion/hkbu_genai_companion.py").resolve()
    if not companion_path.is_file():
        raise HTTPException(status_code=404, detail="Companion script not found")
    return FileResponse(
        path=str(companion_path),
        filename="hkbu_genai_companion.py",
        media_type="text/x-python",
    )


class WebFetchRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


def _clean_html_text(html_content: str) -> str:
    """Strip script, style, navigation and format clean readable text from HTML."""
    import html as html_lib
    import re

    # Remove script, style, iframe, svg, noscript tags and their contents
    text = re.sub(
        r"<(script|style|iframe|svg|noscript)[^>]*>.*?</\1>",
        " ",
        html_content,
        flags=re.DOTALL | re.IGNORECASE,
    )
    # Replace block tags with newlines
    text = re.sub(
        r"<(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer|nav)[^>]*>",
        "\n",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    # Strip remaining HTML tags without introducing artificial spaces
    text = re.sub(r"<[^>]+>", "", text)
    # Decode basic HTML entities
    text = html_lib.unescape(text)
    # Normalize whitespaces and clean up lines
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    clean_lines = [l for l in lines if l]
    return "\n".join(clean_lines)


@app.post("/api/tools/web_fetch")
async def web_fetch(
    request: WebFetchRequest,
    credential: Credential = Depends(require_gateway_key),
):
    try:
        result = await asyncio.to_thread(fetch_public_url, request.url)
        if result.status >= 400:
            return JSONResponse(content={"error": f"HTTP {result.status} {result.reason}",
                                         "status": result.status, "url": result.url})
        cleaned = result.text
        if "text/html" in result.content_type or "<html" in cleaned[:500].lower():
            cleaned = _clean_html_text(cleaned)
        return {"content": cleaned[:20000], "status": result.status, "url": result.url}
    except FetchPolicyError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except (TimeoutError, OSError, ValueError, httpx.HTTPError) as exc:
        return JSONResponse(content={"error": "The URL could not be fetched.", "url": request.url})


@app.get("/api/credentials")
def list_credentials(request: Request):
    user = require_account(request)
    return request.app.state.credentials.list_owned(user["id"])


class ClaimRequest(BaseModel):
    api_key: str = Field(min_length=1, max_length=512)


@app.post("/api/credentials/claim")
def claim_credential(body: ClaimRequest, request: Request):
    user = require_account(request)
    if not request.app.state.credentials.claim(user["id"], body.api_key):
        raise HTTPException(400, "Invalid key or already claimed")
    return {"claimed": True}


@app.delete("/api/credentials/{key_id}")
def revoke_owned_credential(key_id: int, request: Request):
    user = require_account(request)
    if not request.app.state.credentials.revoke_owned(user["id"], key_id):
        raise HTTPException(404, "Active key not found")
    return {"revoked": True}

static_dir = Path(__file__).resolve().parents[2] / "static"
if not static_dir.is_dir():
    static_dir = Path("static").resolve()
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
