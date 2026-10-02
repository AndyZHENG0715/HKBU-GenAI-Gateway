# HANDOFF.md

Durable state summary and context handover for AI coding agents and developers.

Last updated: **2026-10-02**. Read [the latest incident handoff](#7-latest-incident-handoff-2026-10-02) before changing request preprocessing, tool emulation, or web fetch proxying.

## 1. Project State

- **Current Version**: `2.0.0`
- **Active Branch**: `feat/agentic-playground`
- **Test Status**: 91 passing in the latest full run (`PYTHONPATH=src pytest`); 0 failures.
- **Frontend Status**: Built cleanly with Vite (`npm run build` targeting `static/index.html` and `static/hkbuapi4agent.html`).
- **Local Services**:
  - Gateway runs on `http://127.0.0.1:8000` (FastAPI).
  - Optional Local Companion Node runs on `http://127.0.0.1:9001` (`companion/hkbu_genai_companion.py`).

## 2. Completed Milestones

### Agentic Playground & Compute Offloading (v2.0.0)
- **Zero Cloud Overhead & Railway Anti-RCE**: Architecture offloads all code and tool execution to the client, ensuring 0 bytes RAM, 0 CPU load, and zero RCE vulnerability on Railway container deployments.
- **Tier 1 (Browser-Native Sandboxed Toolsuite - Zero Install)**:
  - Pyodide WebAssembly (CPython 3.12) with stdout/stderr capture and automatic inline Matplotlib figure extraction (`base64` PNG).
  - Browser File System Access API (`showDirectoryPicker`) for local workspace file reading and writing.
  - Web page content extractor (`web_fetch`) and safe mathematical evaluator (`calculator`).
- **Tier 2 (Opt-In Local Companion Bridge - Power Users)**:
  - `companion/hkbu_genai_companion.py`: Zero-external-dependency standard library Python daemon running strictly on loopback `127.0.0.1:9001` with CORS preflight and RFC 6455 WebSocket.
  - Host execution bridge: `companion_bash_execute`, `companion_read_file`, `companion_write_file`.
  - Comprehensive unit test suite in `tests/test_companion.py` (9 passing tests).
- **Autonomous Agent Loop**:
  - Pi-inspired state machine (`runAgentLoop` in `frontend/src/lib/agent/loop.ts`) supporting multi-step iterative tool execution.
  - Streaming protocol integration with real-time tool call delta accumulation.
  - Loop safety guards: 10-iteration cycle cap, `AbortController` cancellation, and output truncation.
  - Interactive Playground UI: Agent Mode toggle, active tools capability badges, local directory connection pill, and collapsible `ToolCallCard` with plot rendering.

### Core Gateway Capabilities
- OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/models`, `/v1/embeddings`).
- Model capabilities discovery complying with LiteLLM (`/v1/model/info`), OpenRouter (`/api/v1/models`), and models.dev / Tencent WorkBuddy schemas.
- Prompt-based tool calling emulation adapter (`src/hkbu_gateway/tools.py`) supporting both JSON blocks and XML tags (`<tool_name>...</tool_name>`) for DeepSeek, Alibaba Cloud Qwen (`qwen3-max`, `qwen-plus`), and Vertex AI Llama (`llama-4-maverick`).
- Universal reasoning extractor (`ThinkStreamFilter`) supporting `<think>`, `<thought>`, `<thinking>`, `<reasoning>`, and native `reasoning_content`, coordinated with streaming tool call parsing.
- Edge Protocol Stabilization & Agent Normalization (`src/hkbu_gateway/app.py`, `src/hkbu_gateway/providers.py`):
  - Message content sanitization (`_sanitize_message_content`): flattens agent multi-turn `tool_result` arrays into strings or strict `text`/`image_url` objects; replaces empty strings (`""`) with compliant fallbacks (`(success)` for tools, `None` for assistant tool calls, `" "` for user/text) to satisfy upstream NestJS DTO validation rules.
  - Streaming error resilience: embeds a fallback `choices` array in SSE error events so agent clients (e.g. VS Code Copilot) don't crash with `Response contained no choices`.
  - Reasoning parameter stripping: automatically removes `temperature`, `top_p`, and penalty parameters for Azure OpenAI `o1` and `o3-mini`, mapping `max_tokens` to `max_completion_tokens`.
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
- **Edge Protocol Normalization for Agents**: Coding agents like VS Code Copilot and Cline send Anthropic-style nested arrays (`[{"type": "tool_result", ...}]`) and strict-unsupported params (`temperature` on `o3-mini`). Rather than requiring agents to modify their internal schemas, the gateway acts as an edge protocol stabilizer that transparently normalizes requests before proxying to HKBU.
- **Prompt & XML Emulation for Gated Tools**: Upstream HKBU endpoints for DeepSeek, Qwen, and Llama do not natively expose tool parameter schemas; the gateway injects standard tool schemas into system instructions and parses both JSON blocks and XML tags (`<read_file>`, `<Explore>`, etc.) on the fly.
- **Frontend Build Mirroring**: `frontend/package.json` builds to `../static/index.html` and automatically copies to `../static/hkbuapi4agent.html` to support legacy paths and direct bookmarking.

## 4. Current Environment & Active Resources

- **Virtual Environment**: `.venv/` in repository root.
- **Database**: `hkbu_gateway.db` in repository root (WAL mode, SQLite).
- **Key**: `hkbu_gateway.key` in repository root (0600 permissions).
- **Local Process**: Started with `PYTHONPATH=src .venv/bin/python -m uvicorn hkbu_gateway.app:app --host 127.0.0.1 --port 8000 --no-access-log`. This process has no hot reload; restart it after code changes. Check the port before starting a second instance.

## 5. Next Steps for Incoming Agents

1. **Verify Baseline Health**:
   ```bash
   source .venv/bin/activate
   PYTHONPATH=src pytest
   curl --noproxy '*' -sS --connect-timeout 3 http://127.0.0.1:8000/healthz
   ```
2. **Potential Areas for Enhancement**:
   - Prioritize the outstanding validation and logging work in the latest incident handoff below.
   - Add token usage estimation / metering for streamed responses if requested.
   - Add rate-limiting middleware if deployment exposed to public network.
   - Add health check probe in `docker-compose.yml` (`healthcheck` block).
3. **Rules to Preserve**:
   - Keep `from __future__ import annotations` on all new Python source files.
   - Maintain the 5-file version bump rule (`VERSION`, `pyproject.toml`, `__init__.py`, `frontend/package.json`, `CHANGELOG.md`).

## 6. Latest Incident Handoff: 2026-09-30

### Goal and symptoms

Students should be able to use their university credentials through an OpenAI-compatible endpoint in their own coding tools. Preserve gateway tool emulation for providers whose native tool support is gated by HKBU.

In VS Code Copilot Chat, switching from Gemini to Qwen after a decimal-comparison answer caused short follow-up questions to return only `GitHub Copilot`. HTTP 200, SSE finish events, and `[DONE]` were present; the reported upstream text itself was the name. Later, Copilot reported a separate connection timeout to `localhost:8000`.

### Verified facts and decisions

| Evidence | Decision |
| --- | --- |
| Saved school documentation enables native tools for Azure GPT (streaming and non-streaming) and Gemini (non-streaming); other providers are gated. Shared Swagger tool schemas do not establish provider support. | Keep prompt-based tool emulation. |
| Both Qwen deployments accepted two system messages and followed both marker instructions. | Withdraw the initially attempted system-message merge; preserve independent system messages. |
| Both rejected developer with HTTP 400 and the allowlist `system, user, assistant, tool, function`. | Map developer to system only in the verified Qwen request path. This loses the native distinction between these roles. |
| Full ORCHID recall history and the final user question alone each reported 23 input tokens and failed recall. The same result held without an assistant turn. | Treat the tested HKBU Qwen interfaces as behaving as if only the latest user turn is retained. Do not claim knowledge of the school's internal implementation. |
| Embedding history in the final user content restored ORCHID recall on both models (47 input tokens). The actual repaired gateway encoding also passed on both (83 input tokens). | Apply a history transcript workaround to `qwen-plus` and `qwen3-max`, including canonicalized aliases. Do not extend it to other models without evidence. |
| Separate and merged synthetic Copilot prompts both produced generic confirmations rather than correcting the historical decimal answer. | Prompt consolidation did not solve history loss. The precise original name-only trigger remains unisolated. |
| Port 8000 had no listener; localhost health connections timed out. Starting Uvicorn restored curl and Node `fetch` health checks. | Diagnose local connection failures separately from upstream/model behavior. No school tokens are needed for health checks. |

Sources: [live verification report](docs/qwen-live-verification.md), [exact synthetic request/response evidence](docs/qwen-live-probes.json), and [provider documentation](docs/providers.md). No credentials are included in these artifacts.

### Final implementation and ownership

| File | Current behavior |
| --- | --- |
| `src/hkbu_gateway/app.py` | `_prepare_qwen_messages`, called by `upstream_payload` after content sanitization, maps Qwen developer roles and encodes earlier dialogue in compact JSON inside the final user message. If the final turn is a tool result, includes the result and requests continuation of the original task. Ordinary single-turn requests add no transcript overhead. Adds the missing `json` import used by preprocessing. |
| `src/hkbu_gateway/tools.py` | Keeps client instructions separate and inserts a separate gateway system protocol. Uses compact tool definitions. Preserves historical call IDs and resolves tool result names, removes synthetic instructions to immediately answer, handles legacy function calls, and removes `parallel_tool_calls`. `tool_choice: "none"` omits schemas and disables response conversion. |
| `src/hkbu_gateway/providers.py` | Does not create a tool stream filter when no active tools remain. Routes JSON responses received for streaming requests through tool conversion; adds missing `time`/`uuid` imports for that path. |
| `tests/test_protocol.py`, `tests/test_tools.py` | Cover Qwen history and tool-result preservation, aliases, no single-turn overhead, unchanged other-model requests, 24-tool Copilot-like requests, streaming/non-streaming conversion, disabled tools, and literal-name text passthrough. Large catalogs are tested locally, not against the school quota. |

Important boundary: calling `HKBUProvider.chat`/`chat_stream` directly bypasses `app.upstream_payload` and therefore bypasses Qwen history normalization. Live probes for the fix explicitly used `upstream_payload`. Keep that preprocessing when writing new routes or diagnostic scripts.

Historical roles and tool IDs are represented as transcript data, not native message roles. System messages are moved ahead of that transcript in multi-turn Qwen requests; interleaved instruction timing and developer priority cannot be represented exactly. The workaround fixes measured context loss, not model arithmetic quality: both models also answered the single-turn decimal question incorrectly.

### Validation and token budget

- Latest full local run: **71 passed, 2 dependency warnings**. TestClient hung at event-loop startup in this environment's restricted sandbox; the same suite completed outside the sandbox. This was not a test assertion failure.
- Live role/history probes are already recorded. Do not rerun the whole matrix unless an upstream change or regression warrants it.
- The user explicitly requests low school-token consumption. Use tiny deterministic marker questions, few calls, and synthetic prompts. Test large tool catalogs and ordinary protocol behavior with mocks first.
- **820 tokens** were reported by responses containing usage. Five streaming responses omitted usage, so this is a partial total, not the complete billed amount. No long cache-prefix experiment was performed; cache activation/hit rate remains unknown.
- `max_tokens: 32` returned 113 completion tokens in one Qwen Plus response. Do not assume this field reliably caps school usage. Avoid open-ended probes; validate any proposed replacement limit before relying on it.
- Live probe script was temporary (`/tmp/hkbu-role-probe/probe.py`); it is not a maintained repository tool. The durable evidence is in `docs/`. Do not assume the temporary script survives future sessions.

### Outstanding work, in priority order

1. Verify a real coding-tool cycle: request a small file read, return the tool result, continue with another tool or a final answer. Current mocks and live recall probes do not establish real multi-step tool success. Use only a few short calls if live validation is needed.
2. Remove or gate the existing content-printing debug wrapper in `app.chat_completions` before distributing a release. It prints message prefixes and the first SSE events even when Uvicorn access logging is disabled. These diagnostics predated the history fix and were retained during debugging; prompts/tool results may contain sensitive student data.
3. Review history growth and truncation strategy. Transcript encoding retains all history; no new summarization or pruning policy was added. Preserve required tool-call/result pairs if a future limit is introduced.
4. Investigate cache behavior or other providers' history/role support only when needed. Existing Qwen results cannot establish another deployment's capabilities.
5. Review and commit the working-tree changes with a Conventional Commit. No commit or release was created in this session. Before release, perform the required five-file version cascade and update the changelog; frontend rebuilding is required only if frontend sources change.

Keep SQLite databases, Fernet keys, `.env`, and SQLite `-wal`/`-shm` sidecars out of commits. `.gitignore` currently ignores `*.db`/`*.key`, but does not explicitly ignore the sidecar names; check `git status` before staging.

### Quick resume commands

Run from the repository root:

```bash
source .venv/bin/activate
git status --short
PYTHONPATH=src pytest
ss -ltnp 'sport = :8000'
curl --noproxy '*' -sS --connect-timeout 3 http://127.0.0.1:8000/healthz
```

If no gateway is listening, start it in a dedicated terminal:

```bash
PYTHONPATH=src .venv/bin/python -m uvicorn hkbu_gateway.app:app --host 127.0.0.1 --port 8000 --no-access-log
```

The local instance uses the existing repository database/key by default. Do not delete, regenerate, or print them during troubleshooting. VS Code's remote Copilot extension must reach port 8000 in the same remote environment; localhost health checks should run there as well.

---

## 7. Latest Incident Handoff (2026-10-02)

### Incident 1: DeepSeek Multi-Turn Amnesia & Universal History Transcript
- **Problem**: When interacting with `deepSeek-V4-Pro-hkbu` in Agent Mode, the model suffered from complete amnesia across dialogue turns. The model's chain-of-thought explicitly revealed: *"The conversation history only shows the current turn; there is no previous assistant answer or context."*
- **Root Cause**: Live probing directly against `https://genai.hkbu.edu.hk` confirmed that HKBU's upstream adapter drops multi-turn message arrays for all non-Azure models (`deepseek`, `qwen`, `llama`), forwarding only `messages[messages.length - 1]`. The gateway's transcript injection was previously restricted exclusively to `qwen-plus` and `qwen3-max`.
- **Solution**:
  - Generalized `_prepare_qwen_messages` to `_prepare_history_transcript` in `src/hkbu_gateway/app.py` for all models where `model.provider in ("qwen", "deepseek", "llama")`.
  - Hardened `historyCandidates` filtering in `frontend/src/components/Playground.tsx` so assistant turns with executed tool calls are preserved even if interim text content was empty.
  - Retained `_prepare_qwen_messages` alias for backward-compatibility.
  - Empirically verified against live upstream: DeepSeek accurately recalled previous secrets (`BANANA 99`) and retained complete conversation context.

### Incident 2: Web Fetch Tool Failures & Browser CORS
- **Problem**: In the Playground's Agent Mode, the `web_fetch` tool consistently failed on almost all public websites with `TypeError: Failed to fetch`.
- **Root Cause**: Web fetch was executed directly in the browser JavaScript runtime via `fetch()`. The browser's Same-Origin Policy and CORS restrictions block client-side fetch requests to arbitrary third-party domains lacking `Access-Control-Allow-Origin: *`.
- **Solution (3-Tier Fetch Architecture)**:
  - **Tier 1 (Gateway Backend Proxy)**: Added `POST /api/tools/web_fetch` to `src/hkbu_gateway/app.py` using `httpx.AsyncClient` with standard User-Agent headers, redirect following, 15-second timeout, SSRF protection against cloud metadata endpoints, and HTML text stripping (`_clean_html_text`). Enabled FastAPI `CORSMiddleware`.
  - **Tier 2 (Companion Node)**: Added `POST /api/web_fetch` to `companion/hkbu_genai_companion.py` using standard library `urllib.request`.
  - **Tier 3 (Browser Direct Fetch)**: Maintained as final fallback.
  - Live verified: Successfully fetched and cleaned pages from `https://example.com` and `https://www.hkbu.edu.hk`.

### Incident 3: UI Centering & Model Dropdown Polish
- **Problem**: Switching between Chat and Agent displaced the header switcher button; tool call outputs disappeared after completion; dark/light theme had un-styled elements; Chinese and English were mixed.
- **Solution**:
  - Centered switcher pill using `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`.
  - Separated hero prompt suggestion cards between Chat and Agent modes.
  - Standardized theme with `slate-850` and 100% natural English i18n.
  - Created custom `ModelDropdown.tsx` with search filtering and provider badges.
  - Preserved accumulated tool calls on assistant message records with step index badges (`Step 1`, `Step 2`).

