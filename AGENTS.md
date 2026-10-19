# AGENTS.md

Operational specification and instructions for AI coding agents working on HKBU GenAI Gateway.

## 1. Project Overview & Upstream Realities

HKBU GenAI Gateway is a lightweight, zero-configuration, OpenAI-compatible proxy and self-service developer portal for the Hong Kong Baptist University (HKBU) GenAI Platform (`https://genai.hkbu.edu.hk/api/v1`).

- **Upstream URL**: `https://genai.hkbu.edu.hk/api/v1` (REST v1, `Authorization: Bearer`, model in the request body). The legacy `/api/v0/rest/.../deployments/{model}/...` routes still exist but are not used by default.
- **Core Function**: Converts university platform keys into standard OpenAI `Bearer` credentials, publishes model capability metadata, fits client parameters to each model's capabilities, normalizes inline `<think>` reasoning, and serves a built-in React playground.
- **Primary Runtime**: Python >= 3.9, FastAPI, Uvicorn, HTTPX, Cryptography (Fernet), SQLite.
- **Frontend Stack**: React 19, TypeScript, Tailwind CSS, Vite.

### Critical Upstream Constraints
Since the October 2026 platform update, HKBU exposes a provider-neutral, OpenAI-compatible REST v1 API (`/chat/completions`, `/responses`, `/embeddings`, `/models`, `/health`). Its "Models & capabilities" table is the source of truth for `registry.py`. Live-verified on 2026-10-20:
1. **Canonical Model IDs Only**: Use the IDs from `GET /api/v1/models` (e.g. `gpt-6-luna`, `qwen3.7-plus`, `deepseek-v4-flash-0731`). Upstream silently answers retired IDs (`gpt-4.1`, `qwen-plus`, …) with `gpt-6-luna`, so the gateway maps them to their successors in `LEGACY_ALIASES` instead of passing them through.
2. **Native Tools and History**: Every chat model accepts native `tools` and receives the full multi-turn history (requests are stateless; resend everything). Tool emulation (`tools.py`) stays available only for models flagged `native_tool_call=False`; none are today. The old history transcript and `developer`→`system` rewrite were removed.
3. **Per-Model Parameters**: Models without "Temp." in the capability table (GPT family, `gemini-3.8-flash`, `kimi-k3`) reject `temperature` with HTTP 400; the gateway strips sampling parameters for them. `reasoning_effort` must be one of the model's listed values. `max_tokens` below 16 is rejected.
4. **Inline Reasoning**: `qwen3.7-plus`, `qwen3.8-max`, `kimi-k3` and `glm-5.2` can write `<think>…</think>` into `content`; keep `ThinkStreamFilter` and the non-streaming split.
5. **Content Type Validation**: Keep the compliant empty-content fallbacks (`(success)` for tools, `None` for assistant tool calls, `" "` for user/text) until they are re-verified against REST v1.

## 2. Git Discipline & Anti-"Vibe-Coding" Guardrails

To prevent AI agent desynchronizations, accidental code overwrites, or structural regressions during rapid collaborative development:

1. **Pre-Flight Upstream Check (Mandatory)**:
   Before modifying any files or planning a new feature, every agent MUST inspect git status and check for remote updates:
   ```bash
   git fetch origin
   git status
   ```
   If the branch is behind `origin/main`, sync (`git pull` / rebase) before writing any code. Never overwrite remote commits or force-push (`git push -f`).

2. **Dual-Gate Verification Before Commits**:
   - **Backend Gate**: Run `PYTHONPATH=src pytest`. All tests must pass with 0 failures before committing.
   - **Frontend Gate**: If modifying `frontend/`, run `cd frontend && npm run build` to ensure clean TypeScript compilation and bundle generation.
   - **Asset Parity**: Any changes in `frontend/src/` must be compiled and committed together with the regenerated `static/` bundle.

3. **Preserve Upstream Compensations (No Blind Refactoring)**:
   The gateway contains specialized compensations for upstream HKBU platform quirks (such as empty string replacements `(success)`, per-model parameter fitting in `_sanitize_parameters`, retired-ID aliases, and `<think>` normalization). AI agents must NEVER unilaterally "clean up" or remove these mechanisms without verifying against live upstream constraints.

4. **UI Invariants (Zero Native Dialogs)**:
   Never introduce native browser dialogs (`window.alert`, `window.confirm`, `window.prompt`, or raw unstyled `<select>`). Always use themed in-app modals, inline buttons, or reactive badges matching the design system.

5. **No Destructive Operations**:
   Never run destructive shell commands (`rm -rf`, `git reset --hard`) on tracked workspace assets without explicit user confirmation.

## 3. Essential Commands

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

## 4. Architecture & File Ownership

Do not violate module boundaries. Each module has a strict single responsibility:

| Path | Responsibility | Boundary Rules |
| :--- | :--- | :--- |
| `src/hkbu_gateway/app.py` | FastAPI application, route handlers, error handlers, message content normalization (`_sanitize_message_content`), per-model parameter fitting (`_sanitize_parameters`), web fetch proxy (`/api/tools/web_fetch`), static asset mounting. | Do not execute raw SQL here. Interacts with `CredentialStore` via app state. Never log user prompt or message content to stdout/console. |
| `src/hkbu_gateway/credentials.py` | Encrypted SQLite credential storage (`CredentialStore`). Fernet key generation and persistence (`hkbu_gateway.key`). | Hash gateway keys with SHA-256 before storage. Never store plaintext keys. |
| `src/hkbu_gateway/registry.py` | Model catalog, capabilities flags, context windows, models.dev / WorkBuddy / OpenCode metadata formatting. | All model additions must mirror the REST v1 capability table: `supports_vision`, `supports_temperature`, `supports_parallel_tools`, `supports_structured_output`, `reasoning_efforts`, and `native_tool_call`. |
| `src/hkbu_gateway/providers.py` | Upstream HTTP client, upstream path resolution, streaming response processing, coordinated `ThinkStreamFilter` and `tool_stream_filter`. | Handles upstream SSE parsing, error mapping, and guarantees initial chunk and final `finish_reason: "stop"` frames. |
| `src/hkbu_gateway/tools.py` | Dormant tool calling emulation adapter for models flagged `native_tool_call=False` (none in REST v1 today). Supports JSON blocks and XML tags (`<tool_name>...</tool_name>`). `EmulatedToolStreamFilter`. | Injects tool definitions as a distinct system protocol, preserves historical tool call IDs, handles `tool_choice: "none"`, and converts model output into OpenAI `tool_calls`. |
| `src/hkbu_gateway/protocol.py` | Pydantic schemas for OpenAI completion, embedding, and model responses. | Maintain strict OpenAI compatibility. |
| `src/hkbu_gateway/config.py` | Environment variable resolution and default configuration dataclasses. | Do not hardcode runtime secrets. |
| `frontend/src/` | Single-page developer portal and interactive chat playground. | Production output must go to `static/` with relative asset links (`base: './'`). |

## 5. Non-Negotiable Coding Invariants

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

## 6. Deployment Artifacts

The repository maintains zero-configuration deployment artifacts:
- `start.sh`: Unix entrypoint with automated environment provisioning via `uv` if system Python is `<3.9`.
- `start.command`: macOS Finder double-clickable launcher.
- `start.bat`: Windows Explorer double-clickable launcher.
- `Dockerfile`: Multi-stage image running `python:3.12-slim`.
- `docker-compose.yml`: Binds `./data` to `/app/data` for persistent SQLite credentials and Fernet keys.
- `Procfile`: PaaS entrypoint for Railway and Render.

## 7. Token Budget & Probing Discipline for Agents

When verifying models or writing diagnostic tests:
- **Conserve University Quotas**: HKBU platform accounts have shared rate and token limits. Never execute unconstrained generation probes. Always set `max_tokens: 10` or `16` for connectivity checks.
- **Deterministic Probes**: Use short deterministic prompts (e.g. `"1+1=?"` or exact keyword recall probes) rather than complex creative prompts.
- **Local Mocks First**: Test protocol shapes, serialization, and stream transformation using local unit tests (`pytest`) before issuing live upstream HTTP calls.
