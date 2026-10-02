# AGENTS.md

Operational specification and instructions for AI coding agents working on HKBU GenAI Gateway.

## 1. Project Overview & Upstream Realities

HKBU GenAI Gateway is a lightweight, zero-configuration, OpenAI-compatible proxy and self-service developer portal for the Hong Kong Baptist University (HKBU) GenAI Platform (`https://genai.hkbu.edu.hk/api/v0/rest`).

- **Upstream URL**: `https://genai.hkbu.edu.hk/api/v0/rest`
- **Core Function**: Converts university platform keys into standard OpenAI `Bearer` credentials, provides dynamic model capability discovery, emulates tool calling for gated models, normalizes multi-tag reasoning content, compensates for upstream adapter quirks, and serves a built-in React playground.
- **Primary Runtime**: Python >= 3.9, FastAPI, Uvicorn, HTTPX, Cryptography (Fernet), SQLite.
- **Frontend Stack**: React 19, TypeScript, Tailwind CSS, Vite.

### Critical Upstream Constraints
Do not assume standard OpenAI server behavior from HKBU upstream. Always account for the following live-verified constraints:
1. **Shared NestJS DTO vs. Provider Gating**: Upstream Swagger schemas declare `tools?: ToolDto[]` across all providers, but Alibaba Cloud Qwen (`qwen3-max`, `qwen-plus`), Google Vertex AI Llama (`llama-4-maverick`), and DeepSeek gate native tool calls. They must be routed through the gateway's prompt-based emulation adapter (`tools.py`).
2. **Non-Azure History Dropping (Qwen, DeepSeek, Llama)**: The upstream HKBU adapter for non-Azure models (`qwen-plus`, `qwen3-max`, `deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash`, `llama-4-maverick`) silently drops multi-turn history and only forwards the final user turn. The gateway must inject historical dialogue as a structured JSON transcript inside the final user turn (`_prepare_history_transcript`).
3. **Role Restrictions**: Qwen upstream rejects `developer` roles with HTTP 400. Map `developer` to `system` on the Qwen path.
4. **Reasoning Parameter Rejection**: Azure OpenAI `o1`, `o3-mini`, `gpt-5`, and `gpt-5-mini` reject custom `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty`. Map `max_tokens` to `max_completion_tokens`.
5. **Content Type Validation**: Upstream NestJS DTO strictly validates message content shapes; empty strings (`""`) trigger HTTP 400 on certain roles. Use compliant fallbacks (`(success)` for tools, `None` for assistant tool calls, `" "` for user/text).

## 2. Essential Commands

### Environment Setup
```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### Running Tests
Always run the test suite before submitting or committing code changes:
```bash
PYTHONPATH=src pytest
```

### Starting the Gateway Server
```bash
# In background / daemon mode on host network:
PYTHONPATH=src .venv/bin/python -m uvicorn hkbu_gateway.app:app --host 127.0.0.1 --port 8000 --no-access-log
```

### Frontend Build
When editing files in `frontend/`, rebuild static assets before committing:
```bash
cd frontend
npm install
npm run build   # Compiles to static/ and copies to static/hkbuapi4agent.html
```

### Health Verification
Always bypass proxy environment variables when probing localhost:
```bash
curl --noproxy '*' -s http://127.0.0.1:8000/healthz
# Expected: {"status":"ok","version":"<CURRENT_VERSION>"}
```

## 3. Architecture & File Ownership

Do not violate module boundaries. Each module has a strict single responsibility:

| Path | Responsibility | Boundary Rules |
| :--- | :--- | :--- |
| `src/hkbu_gateway/app.py` | FastAPI application, route handlers, error handlers, message content normalization (`_sanitize_message_content`), dialogue history transcript encoding (`_prepare_history_transcript`), web fetch proxy (`/api/tools/web_fetch`), reasoning parameter sanitization (`o1`/`o3`/`gpt-5`), static asset mounting. | Do not execute raw SQL here. Interacts with `CredentialStore` via app state. Never log user prompt or message content to stdout/console. |
| `src/hkbu_gateway/credentials.py` | Encrypted SQLite credential storage (`CredentialStore`). Fernet key generation and persistence (`hkbu_gateway.key`). | Hash gateway keys with SHA-256 before storage. Never store plaintext keys. |
| `src/hkbu_gateway/registry.py` | Model catalog, capabilities flags, context windows, models.dev / WorkBuddy / OpenCode metadata formatting. | All model additions must declare `supports_tool_call`, `supports_reasoning`, `supports_vision`, and `native_tool_call`. |
| `src/hkbu_gateway/providers.py` | Upstream HTTP client, upstream path resolution, streaming response processing, coordinated `ThinkStreamFilter` and `tool_stream_filter`. | Handles upstream SSE parsing, error mapping, and guarantees initial chunk and final `finish_reason: "stop"` frames. |
| `src/hkbu_gateway/tools.py` | Tool calling emulation adapter for unparsed models (DeepSeek, Qwen, Llama). Supports JSON blocks and XML tags (`<tool_name>...</tool_name>`). `EmulatedToolStreamFilter`. | Injects tool definitions as a distinct system protocol, preserves historical tool call IDs, handles `tool_choice: "none"`, and converts model output into OpenAI `tool_calls`. |
| `src/hkbu_gateway/protocol.py` | Pydantic schemas for OpenAI completion, embedding, and model responses. | Maintain strict OpenAI compatibility. |
| `src/hkbu_gateway/config.py` | Environment variable resolution and default configuration dataclasses. | Do not hardcode runtime secrets. |
| `frontend/src/` | Single-page developer portal and interactive chat playground. | Production output must go to `static/` with relative asset links (`base: './'`). |

## 4. Non-Negotiable Coding Invariants

1. **Python 3.9+ Compatibility**:
   - `from __future__ import annotations` MUST be the first statement in every Python file under `src/hkbu_gateway/`.
   - Never use runtime `|` union expressions inside `isinstance()` or runtime evaluations without stringification or typing guards.
2. **Security & Zero-Leakage**:
   - Never log raw upstream university API keys or plaintext gateway keys.
   - Never print or log user prompts, dialogue histories, or tool result bodies to stdout or production server logs.
   - Upstream keys must always be encrypted at rest using Fernet before SQLite persistence.
   - Key lookup must use constant-time comparison (`hmac.compare_digest`) on SHA-256 hashes.
3. **No Database Leaks**:
   - Route handlers must never invoke raw SQL queries. All operations must go through `CredentialStore` methods.
   - Use parameterized queries with SQLite placeholders (`?`) exclusively.
4. **Streaming Protocol Completeness**:
   - **Chunk 0 Specification**: The initial assistant chunk must always include both `"role": "assistant"` and `"content": ""` (`{"choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": null}]}`). Without `content: ""`, clients like VS Code Copilot fail to initialize their text accumulator.
   - **Terminal Reason Guarantee**: Streams must always emit a chunk containing `finish_reason: "stop"` (or `"tool_calls"`) before `data: [DONE]`. Never close a stream with `[DONE]` alone.
   - **Choices Array Guarantee**: Never emit `choices: []` or omit `choices`. Upstream usage-only or error events must be enriched with a fallback choice object to prevent client crashes (`Response contained no choices`).
5. **Error Handling**:
   - OpenAI endpoints (`/v1/*`) must return RFC-compliant OpenAI JSON error objects: `{"error": {"message": "...", "type": "...", "code": "..."}}`.
   - Upstream errors must be forwarded with appropriate HTTP status codes without leaking internal tracebacks.
6. **Version Bump Cascade**:
   Whenever a version bump is required, all 5 files must be updated together:
   - `VERSION`
   - `pyproject.toml` (`version = "..."`)
   - `src/hkbu_gateway/__init__.py` (`__version__ = "..."`)
   - `frontend/package.json` (`"version": "..."`)
   - `CHANGELOG.md` (Add new release section)
7. **Commit Format**:
   - Follow Conventional Commits: `<type>[optional scope]: <description>`.
   - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.

## 5. Deployment Artifacts

The repository maintains zero-configuration deployment artifacts:
- `start.sh`: Unix entrypoint with automated environment provisioning via `uv` if system Python is `<3.9`.
- `start.command`: macOS Finder double-clickable launcher.
- `start.bat`: Windows Explorer double-clickable launcher.
- `Dockerfile`: Multi-stage image running `python:3.12-slim`.
- `docker-compose.yml`: Binds `./data` to `/app/data` for persistent SQLite credentials and Fernet keys.
- `Procfile`: PaaS entrypoint for Railway and Render.

## 6. Token Budget & Probing Discipline for Agents

When verifying models or writing diagnostic tests:
- **Conserve University Quotas**: HKBU platform accounts have shared rate and token limits. Never execute unconstrained generation probes. Always set `max_tokens: 10` or `16` for connectivity checks.
- **Deterministic Probes**: Use short deterministic prompts (e.g. `"1+1=?"` or exact keyword recall probes) rather than complex creative prompts.
- **Local Mocks First**: Test protocol shapes, serialization, and stream transformation using local unit tests (`pytest`) before issuing live upstream HTTP calls.
