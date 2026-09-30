# AGENTS.md

Operational specification and instructions for AI coding agents working on HKBU GenAI Gateway.

## 1. Project Overview

HKBU GenAI Gateway is a lightweight, zero-configuration, OpenAI-compatible proxy and self-service developer portal for the Hong Kong Baptist University (HKBU) GenAI Platform (`https://genai.hkbu.edu.hk/api/v0/rest`).

- Upstream URL: `https://genai.hkbu.edu.hk/api/v0/rest`
- Core Function: Converts university platform keys into standard OpenAI `Bearer` credentials, provides dynamic model capability discovery, emulates tool calling for gated models, normalizes multi-tag reasoning content, and serves a built-in React playground.
- Primary Runtime: Python >= 3.9, FastAPI, Uvicorn, HTTPX, Cryptography (Fernet), SQLite.
- Frontend Stack: React 19, TypeScript, Tailwind CSS, Vite.

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
PYTHONPATH=src uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Build
When editing files in `frontend/`, rebuild static assets before committing:
```bash
cd frontend
npm install
npm run build   # Compiles to static/ and copies to static/hkbuapi4agent.html
```

### Health Verification
```bash
curl -s http://127.0.0.1:8000/healthz
# Expected: {"status":"ok","version":"<CURRENT_VERSION>"}
```

## 3. Architecture & File Ownership

Do not violate module boundaries. Each module has a strict single responsibility:

| Path | Responsibility | Boundary Rules |
| :--- | :--- | :--- |
| `src/hkbu_gateway/app.py` | FastAPI application, route handlers, error handlers, static asset mounting. | Do not execute raw SQL here. Interacts with `CredentialStore` via app state. |
| `src/hkbu_gateway/credentials.py` | Encrypted SQLite credential storage (`CredentialStore`). Fernet key generation and persistence. | Hash gateway keys with SHA-256 before storage. Never store plaintext keys. |
| `src/hkbu_gateway/registry.py` | Model catalog, capabilities flags, context windows, models.dev / WorkBuddy metadata formatting. | All model additions must declare `supports_tool_call`, `supports_reasoning`, and `supports_vision`. |
| `src/hkbu_gateway/providers.py` | Upstream HTTP client, upstream path resolution, streaming response processing, `ThinkStreamFilter`. | Handles upstream SSE parsing and error mapping. |
| `src/hkbu_gateway/tools.py` | Tool calling emulation adapter for unparsed models (Qwen, Llama). `EmulatedToolStreamFilter`. | Converts tool definitions into system instructions and parses assistant JSON tool output. |
| `src/hkbu_gateway/protocol.py` | Pydantic schemas for OpenAI completion, embedding, and model responses. | Maintain strict OpenAI compatibility. |
| `src/hkbu_gateway/config.py` | Environment variable resolution and default configuration dataclasses. | Do not hardcode runtime secrets. |
| `frontend/src/` | Single-page developer portal and interactive chat playground. | Production output must go to `static/` with relative asset links (`base: './'`). |

## 4. Non-Negotiable Coding Invariants

1. **Python 3.9+ Compatibility**:
   - `from __future__ import annotations` MUST be the first statement in every Python file under `src/hkbu_gateway/`.
   - Never use runtime `|` union expressions inside `isinstance()` or runtime evaluations without stringification or typing guards.
2. **Security & Zero-Leakage**:
   - Never log raw upstream university API keys or plaintext gateway keys.
   - Upstream keys must always be encrypted at rest using Fernet before SQLite persistence.
   - Key lookup must use constant-time comparison (`hmac.compare_digest`) on SHA-256 hashes.
3. **No Database Leaks**:
   - Route handlers must never invoke raw SQL queries. All operations must go through `CredentialStore` methods.
   - Use parameterized queries with SQLite placeholders (`?`) exclusively.
4. **Error Handling**:
   - OpenAI endpoints (`/v1/*`) must return RFC-compliant OpenAI JSON error objects: `{"error": {"message": "...", "type": "...", "code": "..."}}`.
   - Upstream errors must be forwarded with appropriate HTTP status codes without leaking internal tracebacks.
5. **Version Bump Cascade**:
   Whenever a version bump is required, all 5 files must be updated together:
   - `VERSION`
   - `pyproject.toml` (`version = "..."`)
   - `src/hkbu_gateway/__init__.py` (`__version__ = "..."`)
   - `frontend/package.json` (`"version": "..."`)
   - `CHANGELOG.md` (Add new release section)
6. **Commit Format**:
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
