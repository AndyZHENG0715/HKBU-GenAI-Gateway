# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Server-Side Web Fetch Proxy (`src/hkbu_gateway/app.py`, `companion/hkbu_genai_companion.py`)**:
  - Implemented `POST /api/tools/web_fetch` to bypass browser CORS restrictions when agents fetch public web pages. Includes automated User-Agent headers, redirect following, 15s timeout, HTML text extraction (`_clean_html_text`), and cloud metadata SSRF protection.
  - Added `POST /api/web_fetch` endpoint to the companion daemon.
  - Implemented 3-tier fallback in frontend (`webFetch.ts`): Gateway backend proxy -> Companion daemon -> Browser direct.
- **Custom Styled Model Dropdown (`frontend/src/components/ModelDropdown.tsx`)**:
  - Replaced standard native HTML select with a custom styled dropdown matching the application palette, featuring real-time search filtering, provider badges, category pills, dark/light theme support, and click-outside/Escape dismiss.

### Fixed
- **Multi-Turn History Preservation for Non-Azure Models (`src/hkbu_gateway/app.py`, `frontend/src/components/Playground.tsx`)**:
  - Generalized `_prepare_qwen_messages` to `_prepare_history_transcript`, resolving upstream history dropping across DeepSeek (`deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash`), Qwen (`qwen3-max`, `qwen-plus`), and Llama (`llama-4-maverick`).
  - Refined `historyCandidates` filtering in `Playground.tsx` so assistant turns with executed tools are preserved in history even if interim text content was empty.
- **Playground Tool Call Permanent Retention (`frontend/src/components/Playground.tsx`, `ToolCallCard.tsx`)**:
  - Preserved accumulated tool calls and thinking outputs on assistant messages upon stream completion, preventing cards from disappearing after execution.
  - Added `stepIndex` tracking to `ToolCallExecution` and rendered `Step X` badges on cards.
- **Playground Layout & Theme Polish**:
  - Mathematically centered the `[ 💬 Chat | ⚡ Agent ]` switcher in the top bar (`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`), preventing displacement when local companion buttons appear.
  - Separated hero inspiration suggestion cards between Chat Mode and Agent Mode.
  - Standardized theme consistency with `slate-850` and eliminated Chinese/English language mixing with 100% natural English UI.

## [2.0.0] - 2026-09-30

### Added

- **Agentic Playground Engine (`frontend/src/lib/agent/`, `frontend/src/components/Playground.tsx`)**:
  - Evolved the interactive playground into an autonomous **Agentic Playground** referencing the minimalist harness architecture of Pi agent (`pi-agent-core`) and OpenClaw ("小龙虾").
  - Implemented an event-driven agent loop (`loop.ts`) supporting autonomous multi-step reasoning, streaming tool call detection, local execution dispatch, observation feedback, and iteration cycle guard (max 10 iterations) with instant cancellation.
- **Client-Side Compute Offloading (Tier 1: Zero-Install Browser Sandboxes)**:
  - **In-Browser Python via WebAssembly (Pyodide)**: Runs full CPython 3.12 with NumPy, Pandas, and Matplotlib directly in the user's browser CPU/memory. Intercepts `plt.show()` and exports figures as inline Canvas/PNG charts into the conversation with **zero server load on Railway**.
  - **Local Workspace Access (Browser File System Access API)**: Enables users to select a local folder on their computer via native browser prompt; the agent can inspect file trees, read code, and edit files directly on the local disk without installing any software.
  - **Web Fetch & Calculator Tools**: Safe client-side HTML/JSON extraction and mathematical expression evaluation.
- **Tier 2 Local Companion Bridge (`companion/hkbu_genai_companion.py`, `localCompanion.ts`)**:
  - Zero-dependency standalone Python companion daemon running on `127.0.0.1:9001` with strict loopback binding and permissive CORS.
  - Unlocks native host shell execution (`bash`), local git operations, and full workspace filesystem manipulation for power users.
  - Added companion unit test suite (`tests/test_companion.py`, 9 tests passing).
- **Playground UI & UX Enhancements (`ToolCallCard.tsx`)**:
  - Added Mode Switcher toggle: **💬 Chat Mode** vs **⚡ Agent Mode**.
  - Built interactive `ToolCallCard` with collapsible arguments, live execution spinner, duration timer, console logs, and Matplotlib plot rendering.
  - Added active tools capabilities bar with local directory selector and real-time step progress indicator.

## [1.3.3] - 2026-09-30

### Fixed

- **Qwen Multi-Turn Conversation History Workaround (`app.py`)**:
  - Resolved an issue where upstream HKBU Qwen deployments (`qwen-plus`, `qwen3-max`) silently dropped multi-turn conversation history and only retained the final user turn, causing short follow-ups to echo client identity names (such as "GitHub Copilot").
  - Implemented `_prepare_qwen_messages` to encode prior dialogue into a structured, compact JSON transcript within the final user turn while retaining separate system messages.
  - Automatically mapped unsupported `developer` roles to `system` on the Qwen path.
- **Stream Initial Chunk Standard Alignment (`providers.py`, `tools.py`)**:
  - Ensured initial stream chunks with `role: "assistant"` always include `"content": ""` per OpenAI specification, allowing clients like VS Code Copilot to properly initialize the text accumulator.
- **Tool Protocol Architecture Hardening (`tools.py`)**:
  - Injected gateway tool calling instructions as a distinct system message, keeping client instructions unmutated.
  - Preserved historical tool call IDs and mapped tool results back to function names.
  - Cleaned up unparsed `parallel_tool_calls` parameter and supported `tool_choice: "none"`.

## [1.3.2] - 2026-09-30

### Fixed

- **Streaming Protocol Lifecycle & Finish Reason Guarantee (`providers.py`, `tools.py`)**:
  - Fixed an issue where models emitting empty-string content (`content: ""`) alongside terminal metadata (such as Qwen and Gemini final chunks) had their finish chunks silently swallowed by `ThinkStreamFilter`, causing streams to close without `finish_reason: "stop"`.
  - Guaranteed `role: "assistant"` on the first content-bearing SSE chunk and `finish_reason: "stop"` on the final chunk before `data: [DONE]`, eliminating VS Code Copilot's `Response contained no choices` error.
  - Hardened `EmulatedToolStreamFilter` to properly process chunks without spaces after `data:` (per W3C SSE standard) and prevent empty `choices: []` chunks from reaching downstream consumers.
  - Added non-streaming `choices` guarantees in `app.py` for `/v1/chat/completions` and standard fallback formatting.

## [1.3.1] - 2026-09-30

### Added

- **XML Tool Call Extraction (`tools.py`)**:
  - Implemented `_extract_xml_tool_calls` to parse XML tag tool invocations (such as `<read_file>...</read_file>`, `<Explore>...</Explore>`, and `<tool_call>`) emitted by DeepSeek and other models when prompted with tool calling schemas.
  - Automatically converts extracted XML attributes and children into standard OpenAI `tool_calls` payloads with generated `call_...` IDs.
- **Pipelined Streaming Reasoning & Tool Emulation (`providers.py`)**:
  - Chained `ThinkStreamFilter` with `EmulatedToolStreamFilter` so that reasoning content streams concurrently via `delta.reasoning_content` while emulated tool calls are cleanly buffered and emitted as `delta.tool_calls`.

### Fixed

- **Message Content Normalization & Empty Fallbacks (`app.py`)**:
  - Added `_sanitize_message_content()` and `_default_empty_content()` to sanitize complex multi-turn message structures sent by coding agents (VS Code Copilot, Cline, Cursor).
  - Normalizes empty strings (`""`) and empty results into upstream-acceptable values (`None` for assistant with tool_calls, `"(success)"` for tool/function messages, `" "` for user/text messages), preventing upstream HKBU 400 Bad Request errors (`messages.<index>.Content must be either a string, null, or an array of content objects with type "text" or "image_url"`).
  - Flattens Anthropic-style `tool_result` arrays and nested dictionary content into strings or strict `text`/`image_url` arrays.
- **Streaming Error Resilience (`providers.py`)**:
  - Added synthetic `choices` array alongside the OpenAI `error` object in streaming error SSE events, preventing agent clients (such as VS Code Copilot) from throwing `Response contained no choices` when upstream returns an error status code.
- **Reasoning Model Parameter Stripping (`app.py`)**:
  - Automatically strips unsupported hyperparameters (`temperature`, `top_p`, `presence_penalty`, `frequency_penalty`) and maps `max_tokens` to `max_completion_tokens` when invoking Azure OpenAI reasoning models (`o1`, `o3-mini`), resolving upstream 400 `unsupported_parameter` errors.
- **DeepSeek Model Tool Configuration (`registry.py`)**:
  - Configured DeepSeek models (`deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash`) with `native_tool_call=False` to route tool calling through the gateway emulation adapter rather than relying on upstream native function calling.

## [1.3.0] - 2026-09-30

### Added

- **Cross-Platform 1-Click Startup Scripts**:
  - `start.sh` & `start.command`: Zero-configuration startup scripts for macOS and Linux. Automatically validates Python runtime, auto-provisions lightweight isolated Python 3.12 via `uv` when system Python is missing or `<3.9`, initializes `.venv`, installs requirements, starts the gateway server, and opens `http://localhost:8000` in the default browser. Double-clickable in macOS Finder.
  - `start.bat`: Native Windows batch launcher with automatic virtual environment initialization, dependency installation, browser launch, and server execution. Double-clickable in File Explorer.
- **Docker & Container Deployment**:
  - Added multi-platform `Dockerfile` based on `python:3.12-slim`.
  - Added `docker-compose.yml` with host volume mounting (`./data`) for zero-config persistence of the encrypted SQLite database (`hkbu_gateway.db`) and Fernet key (`hkbu_gateway.key`).
- **Multilingual Documentation**:
  - Added comprehensive Simplified Chinese documentation (`README.zh-CN.md`).
  - Added Traditional Chinese documentation (`README.zh-HK.md`) formatted with Hong Kong vernacular and university conventions.
  - Added language selector navigation header to English, Simplified Chinese, and Traditional Chinese READMEs.

### Changed

- **Python Runtime Compatibility**:
  - Added `from __future__ import annotations` across all gateway modules (`app.py`, `config.py`, `credentials.py`, `protocol.py`, `providers.py`, `registry.py`, `tools.py`), enabling native operation on macOS default Python 3.9 runtimes without union typing (`|`) evaluation exceptions.
  - Broadened `requires-python` constraint in `pyproject.toml` from `>=3.11` to `>=3.9`.
- **Documentation**:
  - Updated `README.md` to highlight 1-click startup across macOS, Windows, Linux, and Docker.
  - Updated `docs/architecture.md` to detail deployment lifecycle and container architecture.

## [1.2.0] - 2026-09-18

### Added

- **Gateway Tool Calling Emulation Adapter (`tools.py`)**:
  - Automatically emulates OpenAI-compatible function calling for upstream providers where tools are gated or unparsed (specifically Alibaba Cloud Qwen `qwen3-max`, `qwen-plus` and Google Vertex AI Llama `llama-4-maverick`).
  - System prompt schema serialization: transparently translates `tools: [...]` into authoritative system instructions with JSON schema guidelines.
  - Multi-turn conversation mapping: maps client-sent `role: "tool"` or `role: "function"` turns into user context turns, and converts prior assistant `tool_calls` into JSON context.
  - Non-streaming parsing: extracts and validates JSON tool calls (`tool_calls`, `tool`/`parameters`, `function`/`parameters`) and transforms them into standard OpenAI `message.tool_calls` with generated IDs and `finish_reason: "tool_calls"`.
  - Streaming SSE filtering (`EmulatedToolStreamFilter`): buffers candidate JSON tokens until completion and emits standard 3-event OpenAI tool calling sequences (`delta.tool_calls`, argument chunks, finish reason); immediately flushes non-tool natural conversation with zero latency.
- Enabled `supports_tool_call=True` for all chat models across discovery endpoints (`/models`, `/v1/model/info`, WorkBuddy, OpenCode, models.dev schemas), allowing downstream agents to select Qwen and Llama for agentic execution.
- Added comprehensive unit tests in `tests/test_tools.py` covering instruction generation, payload transformation, JSON block extraction, and streaming filters.

## [1.1.1] - 2026-09-18

### Documentation & Verification

- Documented upstream Swagger schemas vs. runtime provider gating: explained why OpenAPI components define `ToolDto` across all models while the ChatGPT and Gemini docs explicitly clarify that other providers (Qwen, Llama) are currently gated.
- Added comprehensive tool calling benchmark table across all HKBU platform models (Azure GPT, Gemini, DeepSeek, Qwen, Llama) in `docs/providers.md`.
- Added explicit unit tests verifying Qwen and Llama capability flags (`supportsToolCall: false`, `tool_call: false`) to safeguard agent harnesses from unparsed natural language responses.

## [1.1.0] - 2026-09-18

### Added

- Model discovery endpoints: `@app.get("/models")`, `@app.get("/model")`, `@app.get("/v1/model")`, `@app.get("/api/v1/models")` (OpenRouter standard), `@app.get("/v1/model/info")` & `@app.get("/model/info")` (LiteLLM standard), and single-model lookup `@app.get("/models/{id}")`.
- Rich model ability metadata aligned with [models.dev](https://models.dev) and Tencent WorkBuddy schemas (`supportsToolCall`, `supportsReasoning`, `supportsVision`, `contextWindow`, `maxTokens`, `tool_call`, `reasoning`, `limit`, `capabilities`).
- Universal multi-tag reasoning extraction supporting `<think>`, `<thought>`, `<thinking>`, and `<reasoning>` in both streaming (`ThinkStreamFilter`) and non-streaming responses, converting raw upstream thought blocks into standard `reasoning_content` to trigger native collapsible thought UIs across all agent harnesses.
- Tencent WorkBuddy client preset with 1-click GUI setup guide and pre-filled `~/.workbuddy/models.json` configuration snippet.
- Route aliases for `POST /chat/completions` and `POST /embeddings` without `/v1` prefix.

### Fixed

- Public model discovery: allowed unauthenticated discovery on `/models` and `/v1/models` so tools can probe available models during initial provider setup without 401 errors.
- Tool calling finish reason normalization: automatically normalized upstream `finish_reason` to `"tool_calls"` when tools are invoked (resolving Gemini's uppercase `"STOP"`).
- Accurate model capabilities: verified tool-calling support across all upstream models and set `supports_tool_call=False` for Qwen and Llama models where upstream HKBU adapters ignore tools.

## [1.0.0] - 2026-09-18

### Added

- Official v1.0.0 Production Release of the HKBU GenAI Gateway.
- Zero-config cloud deployment support (`Procfile`, `requirements.txt`) fully compatible with Railway, Render, Docker, and Nixpacks.
- Safe dynamic URL resolution supporting arbitrary custom domains and reverse proxies (`https://byok.aitutor.ink`).
- Robust agent compatibility supporting Cursor, Cline, Roo Code, and Dify with full pass-through for custom parameters, function/tool calling schemas, and response formats.
- Safe UTF-8 error decoding (`errors="replace"`) for upstream streaming chunks to prevent character boundary exceptions.
- Comprehensive SQLite connection lifecycle management with guaranteed connection cleanup and WAL mode.
- Built-in multi-session Chat Playground with streaming markdown, DeepSeek thought accordions, code copy, message editing, and model switching.

### Changed

- Case-insensitive model registry lookup (`gpt-4.1` vs `GPT-4.1`).
- Upstream authentication header flexibility supporting both `HKBU_UPSTREAM_AUTH_HEADER` and `HKBU_API_KEY_HEADER`.
- Gateway Authorization parsing supporting case-insensitive `Bearer` prefix as well as `api-key` and `x-api-key` headers.
- Enhanced HTTP error handling mapping upstream status codes directly to standard OpenAI error formats.

## [0.3.2] - 2026-09-18

### Fixed

- Stream error handling: yield structured SSE error events instead of raising unhandled ASGI exceptions and dropping TCP streams (`network error`).
- Empty message content validation: guarantee `content` is always present for every message in `upstream_payload` to satisfy HKBU gateway schema requirements.
- Message action buttons: made `Edit` and `Retry` action buttons permanently visible beneath messages with distinct icons and text.
- Added in-bubble Error Card with direct `Retry Message` and `Try Gemini 2.5 Flash` quick-switch buttons when upstream models are unavailable.

## [0.3.1] - 2026-09-18

### Added

- DeepSeek reasoning thought process accordion (`ThinkingBox`) supporting both `reasoning_content` deltas and `<think>` tags.
- Full GitHub Flavored Markdown rendering with tables, blockquotes, and code syntax blocks with copy buttons.
- Chat message toolbar with Copy Message, Edit User Message, and Retry / Regenerate response actions.
- Persistent multi-turn conversation history sidebar with `localStorage` backing, "+ New Chat", and session switching.

## [0.3.0] - 2026-09-18

### Added

- Production frontend SPA built with React 19, TypeScript, Tailwind CSS, and Vite.
- Built-in interactive Chat Playground with real-time streaming SSE and model switching.
- Zero-config auto-generation and persistence of Fernet encryption keys for headless deployments (e.g., Railway).
- Pre-configured tool presets (Open WebUI, LibreChat, Dify, Cursor, Cline/Roo Code).
- Multi-model fallback validation for student HKBU Platform keys.

## [0.2.0] - 2026-09-13

### Added

- Self-service HKBU key validation and one-time OpenAI-compatible gateway keys.
- Encrypted SQLite credential persistence and key revocation.
- Static setup page at `/`.

### Changed

- Evaluated LiteLLM and Azure-focused proxy projects as alternatives to custom
  provider translation. See `docs/alternatives.md`.

## [0.1.0] - 2026-09-13

### Added

- Initial project baseline and contribution conventions.
- Provider inventory extracted from the downloaded HKBU Swagger pages.
- FastAPI-compatible gateway skeleton with `/healthz`, `/v1/models`,
  `/v1/chat/completions`, and `/v1/embeddings` routes.
- Configurable HKBU upstream URL and authentication header.
