# HANDOFF.md

Durable state summary and context handover for AI coding agents and developers.

## 1. Project State

- **Current Version**: `1.3.0`
- **Active Branch**: `main`
- **Test Status**: 17/17 passing (`PYTHONPATH=src pytest`)
- **Local Service**: Gateway daemon is active and listening on `http://0.0.0.0:8000` (PID managed, hot-reload active).

## 2. Completed Milestones

### Core Gateway Capabilities
- OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/models`, `/v1/embeddings`).
- Model capabilities discovery complying with LiteLLM (`/v1/model/info`), OpenRouter (`/api/v1/models`), and models.dev / Tencent WorkBuddy schemas.
- Prompt-based tool calling emulation adapter (`src/hkbu_gateway/tools.py`) for Alibaba Cloud Qwen (`qwen3-max`, `qwen-plus`) and Vertex AI Llama (`llama-4-maverick`).
- Universal reasoning extractor (`ThinkStreamFilter`) supporting `<think>`, `<thought>`, `<thinking>`, `<reasoning>`, and native `reasoning_content`.
- Built-in React 19 / Tailwind CSS playground in `frontend/` compiled to `static/`.

### Deployment & Distribution (v1.3.0)
- Cross-platform zero-config startup scripts:
  - `start.sh`: Unix/Linux/macOS launcher with automatic Python version check and `uv` fallback provisioning.
  - `start.command`: Double-clickable launcher for macOS Finder.
  - `start.bat`: Double-clickable launcher for Windows File Explorer.
- Containerization:
  - `Dockerfile` using `python:3.12-slim`.
  - `docker-compose.yml` with persistent volume mount (`./data`) for `hkbu_gateway.db` and auto-generated Fernet key.
- Python 3.9+ runtime compatibility:
  - Added `from __future__ import annotations` across all Python source modules to avoid PEP 604 runtime evaluation errors on default macOS Python 3.9.6.
  - Lowered `requires-python` in `pyproject.toml` to `>=3.9`.
- Multilingual documentation:
  - English: `README.md` (clean, emoji-free headers, language navigation).
  - Simplified Chinese: `README.zh-CN.md`.
  - Traditional Chinese: `README.zh-HK.md` (Hong Kong university vernacular).
- Agent standards:
  - `AGENTS.md`: Canonical operational guide for AI coding agents.
  - `HANDOFF.md`: This session handover record.

## 3. Key Decisions & Rationale

- **Self-Generating Encryption Key**: If `HKBU_GATEWAY_ENCRYPTION_KEY` is not provided in environment, `credentials.py` generates a 32-byte Fernet key and persists it to `hkbu_gateway.key` next to the database file. This ensures seamless local zero-config runs without manual `.env` file setup.
- **Prompt Emulation for Gated Tools**: Upstream HKBU endpoints for Qwen and Llama do not natively expose tool parameter schemas; the gateway injects standard tool schemas into system instructions and parses JSON output on the fly.
- **Frontend Build Mirroring**: `frontend/package.json` builds to `../static/index.html` and automatically copies to `../static/hkbuapi4agent.html` to support legacy paths and direct bookmarking.

## 4. Current Environment & Active Resources

- **Virtual Environment**: `.venv/` in repository root.
- **Database**: `hkbu_gateway.db` in repository root (WAL mode, SQLite).
- **Key**: `hkbu_gateway.key` in repository root (0600 permissions).
- **Daemon Process**: Uvicorn running on `http://0.0.0.0:8000`. Test endpoint: `curl -s http://127.0.0.1:8000/healthz`.

## 5. Next Steps for Incoming Agents

1. **Verify Baseline Health**:
   ```bash
   PYTHONPATH=src pytest
   curl -s http://127.0.0.1:8000/healthz
   ```
2. **Potential Areas for Enhancement**:
   - Add token usage estimation / metering for streamed responses if requested.
   - Add rate-limiting middleware if deployment exposed to public network.
   - Add health check probe in `docker-compose.yml` (`healthcheck` block).
3. **Rules to Preserve**:
   - Keep `from __future__ import annotations` on all new Python source files.
   - Maintain the 5-file version bump rule (`VERSION`, `pyproject.toml`, `__init__.py`, `frontend/package.json`, `CHANGELOG.md`).
