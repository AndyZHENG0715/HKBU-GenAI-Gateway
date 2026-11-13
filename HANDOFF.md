# HANDOFF.md

Durable state summary and context handover for AI coding agents and developers.

Last updated: **2026-11-13**. Read [the latest handoff](#7-latest-handoff-2026-11-13-v211-stabilization--cache-optimization-context) before changing upstream routing, the model catalog, or request preprocessing.

## 1. Project State

- **Current Version**: `2.1.1` (HKBU WAF error normalization, bounded file inspection, and resilient agent self-healing), deployed to `https://byok.aitutor.ink`.
- **Active Branch**: `claude/project-thread-vcaexs` (PR #4). Merges to `main` auto-deploy to the production server (Alibaba Cloud ECS); there is no CI.
- **Test Status**: 128 passing in the latest full run (`PYTHONPATH=src pytest`); 0 failures.
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
- Upstream: HKBU REST v1 (`https://genai.hkbu.edu.hk/api/v1`, Bearer auth). All 13 chat models use native tools and native multi-turn history.
- Model catalog (`registry.py`) mirrors the HKBU "Models & capabilities" table; retired IDs map to successors via `LEGACY_ALIASES`.
- Dormant prompt-based tool emulation adapter (`src/hkbu_gateway/tools.py`) for models flagged `native_tool_call=False` (none today).
- Universal reasoning extractor (`ThinkStreamFilter`) supporting `<think>`, `<thought>`, `<thinking>`, `<reasoning>`, and native `reasoning_content`, coordinated with streaming tool call parsing.
- Edge Protocol Stabilization & Agent Normalization (`src/hkbu_gateway/app.py`, `src/hkbu_gateway/providers.py`):
  - Message content sanitization (`_sanitize_message_content`): flattens agent multi-turn `tool_result` arrays into strings or strict `text`/`image_url` objects; replaces empty strings (`""`) with compliant fallbacks (`(success)` for tools, `None` for assistant tool calls, `" "` for user/text) to satisfy upstream NestJS DTO validation rules.
  - Streaming error resilience: embeds a fallback `choices` array in SSE error events so agent clients (e.g. VS Code Copilot) don't crash with `Response contained no choices`.
  - Per-model parameter fitting (`_sanitize_parameters`): strips sampling parameters for models without temperature support, clamps `reasoning_effort` to each model's allowed values, raises `max_tokens` to 16.
  - Response-only field stripping (`_strip_response_only_fields`): drops `reasoning_content`, `tool_calls[].index` and other fields clients echo back, which REST v1 rejects with HTTP 400.
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
- **Edge Protocol Normalization for Agents**: Coding agents like VS Code Copilot, Cline and WorkBuddy send Anthropic-style nested arrays (`[{"type": "tool_result", ...}]`), parameters a model rejects (`temperature` on the GPT family), and response fields echoed back into history. Rather than requiring agents to change their schemas, the gateway normalizes requests to the REST v1 capability table before proxying to HKBU.
- **Thin Layer over REST v1**: HKBU now handles provider differences itself, so the gateway passes native tools and history through and keeps only compatibility fixes, model metadata and the portal. Tool emulation stays in `tools.py`, dormant, in case a future model gates native tools again.
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
2. **Candidate Work** (not started; confirm with the owner first):
   - Anthropic Messages endpoint (`/v1/messages`) translating to REST v1 Chat Completions, so Claude Code-style clients can use HKBU quota. HKBU has no Messages endpoint.
   - Verify whether WorkBuddy echoes `reasoning_content` / `tool_calls[].index` when connected directly to HKBU (decides whether agent users must go through the gateway).
   - Re-verify the empty-content fallbacks (`(success)`, `" "`) against REST v1; they may no longer be needed.
   - Context and output limits in `registry.py` are conservative placeholders (128k / 16k); HKBU does not publish them.
3. **Rules to Preserve**:
   - Keep `from __future__ import annotations` on all new Python source files.
   - Maintain the 5-file version bump rule (`VERSION`, `pyproject.toml`, `__init__.py`, `frontend/package.json`, `CHANGELOG.md`).

## 6. Latest Handoff (2026-10-20): HKBU REST v1 Migration

### What changed upstream
Around 2026-10-09, HKBU replaced the per-provider v0 deployment routes with a provider-neutral, OpenAI-compatible REST v1 API: `POST /chat/completions`, `/responses`, `/embeddings`, `GET /models`, `/models/{model}`, `/health`, all with `Authorization: Bearer`. The model line-up changed almost entirely (`gpt-6-luna`, `qwen3.7-plus`, `kimi-k3`, `glm-5.2`, `grok-4.6`, …). The OpenAPI document lives at `/api/v0/general/rest/docs/openapi.json` and only accepts a website SSO session token, not an API key.

### Why the gateway broke
- Retired IDs (`gpt-4.1`, `qwen-plus`) are silently answered by `gpt-6-luna` upstream.
- The v0 key-validation probe (`max_tokens: 5`) is rejected; REST v1 requires at least 16.
- The October 5 WorkBuddy reports (raw `{"tool_calls": …}` JSON or empty `<tool_calls></tool_calls>` shown as text) predate the upstream change: the streaming emulation filter missed tool calls preceded by prose. Native tools in REST v1 removed that path.

### Live-verified behaviour (2026-10-20)
| Area | Result |
| --- | --- |
| Native tools | Two-step tool loops (call → tool result → answer) pass on all 9 model families, streaming and non-streaming, through the gateway. |
| History and roles | Full history reaches the model; `developer` is accepted. Transcript encoding and role rewriting were removed. |
| Strict validation | Echoed `reasoning_content` and `tool_calls[].index` cause HTTP 400 `property ... should not exist`; the gateway strips them. |
| Streaming quirk | Qwen and GLM send `tool_calls` in the same delta as `content: ""`; the gateway forwards these deltas. |
| Parameters | GPT family, `gemini-3.8-flash` and `kimi-k3` reject `temperature`; `reasoning_effort` must match the model's list. |
| Inline reasoning | Qwen, Kimi and GLM can put `<think>` in `content`; `reasoning_effort: "none"` suppresses it on Qwen. |
| Occasional upstream errors | Sporadic 500/502 and an HTML 403 (likely a WAF reacting to shell text in a request) were seen; they are upstream, not gateway, failures. |

### Deployment notes
- The production environment pins `HKBU_UPSTREAM_BASE_URL` to the old v0 address. `config.py` maps the retired v0 URLs to REST v1, so no server change is needed.
- Gateway keys bound to pre-upgrade HKBU keys may fail with upstream "Invalid API key"; users re-bind by creating a new gateway key with a current HKBU key. Validation calls the free `GET /models`.

### History
Earlier incident handoffs (2026-09-30 Qwen history loss, 2026-10-02 DeepSeek amnesia and web fetch CORS) described v0 workarounds that no longer apply; see the git history of this file and `docs/qwen-live-verification.md`.

---

## 7. Latest Handoff (2026-11-13): v2.1.1 Stabilization & Cache Optimization Context

### What was completed in v2.1.1
1. **Upstream WAF / HTML 403 Error Normalization**:
   - `clean_upstream_error_detail` in `src/hkbu_gateway/providers.py` intercepts raw HTML 403 Access Denied / campus firewall pages and converts them into structured diagnostics.
   - Recursive null byte (`\x00`) sanitization via `_deep_strip_null` in `src/hkbu_gateway/app.py` across text, dict, and multimodal fields (e.g. `image_url.url`, `detail`).
2. **Safe Bounded Local File Reading**:
   - `read_local_file` in `frontend/src/lib/agent/tools/browserFs.ts` enforces a 25 KB UTF-8 boundary limit (using `TextEncoder`), line-based pagination (`offset`, `max_lines` default 300, clamped to 1000), complete line preservation, and binary extension guards.
3. **Resilient Agent Loop Self-Healing & Soft Landing**:
   - `runAgentLoop` in `frontend/src/lib/agent/loop.ts` classifies errors into allow-listed categories (`payload_size_or_context_limit`, `security_policy_or_waf_rejection`, `transient_service_unavailable`).
   - Automatically redacts only the implicated oversized tool output, injects actionable pagination recovery guidance, retries initial turns on transient errors, and soft-lands gracefully on failure without UI crashes.
4. **Test & Documentation Verification**:
   - 128 backend tests passing (`tests/test_review_regressions.py`).
   - All 5 version cascade files and documentation (`CHANGELOG.md`, `README.*`, `troubleshooting.md`, `architecture.md`) updated.
5. **Prompt Cache Optimization & Observability (Completed)**:
   - **Deterministic Tool Schema Sorting**: `formatToOpenAITools` and `upstream_payload` deterministically sort tools by name, ensuring invariant prompt prefix across tool-use turns.
   - **Streaming Usage & Cache Metrics Passthrough**: `stream_options: {"include_usage": true}` automatically injected and forwarded.
   - **Observability**: `log_token_usage` reports prompt, cached, completion tokens, and cache hit percentage on both streaming and non-streaming responses.
   - **UI Telemetry**: Playground renders a real-time `⚡ Cache` badge next to message actions showing cache hit rate and token counts.

### Context & Goals for Next Mission: Cache Hit Rate Optimization (缓存命中率优化)
When optimizing cache hit rates (Prompt Caching / KV-Cache Reuse) in HKBU GenAI Gateway, the incoming agent should focus on the following dimensions:

1. **Upstream Prompt Caching Architecture**:
   - Modern upstream providers (Azure OpenAI, DeepSeek, Alibaba Qwen, Moonshot/Kimi) utilize automatic prefix-based KV caching (typically requiring prefix >= 1024 tokens).
   - **Prefix Invariance Rule**: Upstream KV caches match strictly from the first token forward. Any non-deterministic variation in early messages (such as fluctuating system prompts, volatile timestamps, or dynamic tool ordering) invalidates the entire cache for all subsequent messages.
2. **Gateway-Level Prefix Stabilization**:
   - **Static Message Ordering**: Keep system messages strictly static and identical at index 0. Ensure no dynamic context (e.g., live timestamps, variable diagnostic text) is prepended to the system message unless deliberately intended to invalidate.
   - **Deterministic Tool Schema Serialization**: Ensure `tools` array ordering and schema serialization (JSON key ordering) remain identical across turns.
   - **History Normalization Stability**: Verify that `_sanitize_message_content` and `_strip_response_only_fields` do not introduce jitter or mutate history between turn $N$ and turn $N+1$.
3. **Token Usage & Cache Metrics Passthrough**:
   - Inspect whether HKBU REST v1 upstream forwards cache metrics in `usage` (e.g., `prompt_tokens_details.cached_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`).
   - Ensure the gateway preserves and reports `cached_tokens` in both non-streaming completions and streaming chunk payloads so clients (and the web playground) can measure cache hit rate in real time.
4. **Optional Gateway Response Cache (Exact / Semantic)**:
   - Investigate lightweight local SQLite / in-memory exact-match caching for deterministic queries (`temperature: 0`, identical model + tools + message hash) to deliver 0ms responses without consuming university token quotas.
