# TASKLIST: Agentic Playground (Hybrid Architecture)

Tracking document for the Agentic Playground feature on branch `feat/agentic-playground`.
Target Version: **`2.0.0`** (SemVer major bump: Agentic Playground evolution).

---

## 1. Architectural Invariants Checklist
- [x] **Zero Server Overhead on Railway**: All Python execution, local file I/O, and shell tasks run on the user's browser or local machine. Railway container executes 0 user code.
- [x] **Gateway Compatibility**: Works transparently with both native models (`gpt-4.1`, `gpt-5`, `gemini-2.5-flash`) and emulated models (`qwen-plus`, `qwen3-max`, `deepseek-v4-flash`).
- [x] **Safety & Permission**: Destructive actions (local file write, shell execution) require explicit user approval.
- [x] **Loop Guard**: Maximum iteration cap (default 10 steps) to prevent runaway token consumption.
- [x] **Atomic Commits**: Conventional commits (`feat`, `fix`, `docs`, `test`) per milestone.
- [x] **5-File Version Cascade**: Update `VERSION`, `pyproject.toml`, `src/hkbu_gateway/__init__.py`, `frontend/package.json`, `CHANGELOG.md` upon release.

---

## 2. Milestone Tasks

### Milestone 1: Protocols & API Streaming Layer
- [x] **Task 1.1**: Define TypeScript interfaces in `frontend/src/lib/agent/types.ts` (`AgentTool`, `ToolExecutionResult`, `ToolCallExecution`, `AgentStep`, `AgentState`).
- [x] **Task 1.2**: Extend `frontend/src/lib/api.ts` to support `tools`, `tool_choice`, streaming `tool_calls` delta accumulation, and `finish_reason`.
- [x] **Commit 1**: `feat(agent): define agent types and enable streaming tool call protocol`

### Milestone 2: Tier 1 - In-Browser Sandboxed Toolsuite (Zero-Install)
- [x] **Task 2.1**: Implement `frontend/src/lib/agent/tools/python.ts` (Pyodide Wasm CPython 3.12 with numpy, pandas, stdout/stderr interception, and Matplotlib chart extraction).
- [x] **Task 2.2**: Implement `frontend/src/lib/agent/tools/browserFs.ts` (Browser File System Access API: directory picker, list files, read file, write file).
- [x] **Task 2.3**: Implement `frontend/src/lib/agent/tools/webFetch.ts` and `calculator.ts` (safe web page text extractor and mathematical evaluator).
- [x] **Task 2.4**: Implement `frontend/src/lib/agent/tools/registry.ts` (tool collection, schema formatting for OpenAI `tools` DTO, execution dispatcher).
- [x] **Commit 2**: `feat(agent): implement browser-native tools with Pyodide and File System Access API`

### Milestone 3: Agent Core Loop Engine
- [x] **Task 3.1**: Implement `frontend/src/lib/agent/loop.ts` (Pi-inspired state machine: context preparation, LLM invocation, tool call detection, local dispatch, result injection, turn counter, cancellation token).
- [x] **Task 3.2**: Add loop safety protections (max 10 iterations, error boundary, output truncation).
- [x] **Commit 3**: `feat(agent): implement autonomous agent execution loop with cycle guard`

### Milestone 4: UI / UX Playground Integration
- [x] **Task 4.1**: Build `frontend/src/components/ToolCallCard.tsx` (collapsible arguments, status indicators, console output viewer, Matplotlib plot image preview, copy button).
- [x] **Task 4.2**: Update `frontend/src/components/Playground.tsx` with Agent Mode toggle, active tools panel, local directory selector badge, and step progress pill.
- [x] **Task 4.3**: Integrate live abort controller for the agent loop ("Stop Agent" button).
- [x] **Commit 4**: `feat(playground): add agent mode UI, tool cards, and progress visualization`

### Milestone 5: Tier 2 - Local Companion Bridge (Power Users)
- [x] **Task 5.1**: Implement standalone zero-dependency Python script `companion/hkbu_genai_companion.py` (WebSocket server on `127.0.0.1:9001`, handshake, bash execution, filesystem access).
- [x] **Task 5.2**: Implement `frontend/src/lib/agent/tools/localCompanion.ts` (WebSocket client, auto-discovery of local node, approval modal trigger).
- [x] **Task 5.3**: Add "Connect Local Terminal" guide and connection indicator to Playground UI.
- [x] **Commit 5**: `feat(companion): add local companion node and terminal execution bridge`

### Milestone 6: Verification, Documentation & Version Cascade
- [x] **Task 6.1**: Rebuild frontend (`npm run build` with static asset mirroring to `static/` and `static/hkbuapi4agent.html`).
- [x] **Task 6.2**: Run full Python test suite (`PYTHONPATH=src pytest`).
- [x] **Task 6.3**: Update `HANDOFF.md`, `README.md`, `README.zh-CN.md`, `README.zh-HK.md`, and `docs/architecture.md`.
- [x] **Task 6.4**: Execute 5-file SemVer bump to `2.0.0` with `CHANGELOG.md` release notes.
- [x] **Commit 6**: `chore(release): bump version to 2.0.0 and document agentic playground`

### Milestone 7: Codex & Z-Code Harness Polish (UX, Context Anchoring, Binary Files)
- [x] **Task 7.1**: Redesign `ToolCallCard.tsx` with Codex/Z-Code collapsible aesthetics (compact 1-line pill, collapsed by default upon completion, tabbed inspector for parameters, output, and plot preview).
- [x] **Task 7.2**: Fix tool result user turn masking amnesia in `src/hkbu_gateway/app.py` (`_prepare_qwen_messages`) by explicitly anchoring `Active user goal`.
- [x] **Task 7.3**: Inject Codex Autonomous Delivery Principle into `src/hkbu_gateway/tools.py` and `loop.ts` (ban "what is your desired file path" questions; autonomously save deliverables).
- [x] **Task 7.4**: Support Base64 binary decoding in `browserFs.ts` (`write_local_file`) and `hkbu_genai_companion.py` (`write_file`) for direct PDF and image saving.
- [x] **Task 7.5**: Rebuild frontend bundle and expand pytest suite with binary writing tests (81 passing).
- [x] **Commit 7**: `feat(agent): enhance tool UX with collapsible cards, context anchoring, and binary file writing`

### Milestone 8: Cherry Studio / OpenWebUI Shell, Hero View & One-Click Companion
- [x] **Task 8.1**: Retain Gateway Landing Identity: Keep `setup` (Key generation, Cursor/API presets) as the default first-view landing page, preserving standard gateway branding, navbar, and documentation layout.
- [x] **Task 8.2**: Full-Bleed Fluid App Shell: When switching to `playground`, eliminate outer webpage scrollbars, remove fixed pixel heights (`h-[780px]`), hide the outer footer, and use pure Flexbox (`h-screen overflow-hidden`, `flex-1 min-h-0`) to adapt smoothly to any screen size.
- [x] **Task 8.3**: Segmented Pill Mode Switcher: Implement ChatGPT/Cherry Studio style `[ 💬 Chat | ⚡ Agent ]` segmented pill control with clean active highlight.
- [x] **Task 8.4**: OpenWebUI-Style Centered Hero View: When a session has 0 user messages, display an inspiring centered greeting ("今天有什么想做的？"), centered capsule input box, and 4 quick suggestion cards (`分析本地数据`, `Python 科学计算`, `文献与信息检索`, `论文研究构想`). Transition smoothly to timeline on first user message.
- [x] **Task 8.5**: Zero-Friction Local Companion Support: Add zero-dependency double-clickable launchers `launch_companion.bat` (Windows) and `launch_companion.command` (macOS), plus a `/api/companion/download` endpoint on Railway and an in-app Helper Modal clarifying that 90% of students need 0 installation (Wasm Python + Browser File Access).
- [x] **Task 8.6**: Verification & Build: All 82 pytest tests passing, Vite assets compiled cleanly.
- [x] **Commit 8**: `feat(playground): responsive chat-agent workspace, hero view, and one-click companion`

### Milestone 9: UI Details, Centered Switcher, Dark Mode / i18n, Permanent Tool Retention, and Custom Model Dropdown
- [x] **Task 9.1**: Mathematically Centered Switcher: Center the `[ 💬 Chat | ⚡ Agent ]` pill switcher in the top bar using `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`, preventing local node button from displacing the switcher.
- [x] **Task 9.2**: Inspiration Prompts & Mode Separation: Distinct hero suggestion cards for Chat mode vs. Agent mode (no Python/data analysis cards in pure chat mode).
- [x] **Task 9.3**: Theme Consistency & Full English i18n: Register `slate-850` in Tailwind configuration, fix dark/light mode toggle for headers and toolbars, and eliminate language mixing with 100% natural English UI.
- [x] **Task 9.4**: Custom Styled Model Dropdown (`ModelDropdown.tsx`): Built native-feeling custom dropdown with search filtering, provider badges, category pills, dark/light theme, and click-outside/Escape dismiss.
- [x] **Task 9.5**: Permanent Tool Retention & Step Tracking: Added `stepIndex` to `ToolCallExecution` and `ToolCallCard.tsx`; preserved accumulated tool calls and reasoning on assistant messages upon stream completion.
- [x] **Commits**: `db9ad4f`, `0192600`

### Milestone 10: Multi-Turn Memory Restoration & 3-Tier Web Fetch Proxy
- [x] **Task 10.1**: Upstream History Dropping Fix for Non-Azure Models: Replaced Qwen-only check with generalized `_prepare_history_transcript` in `src/hkbu_gateway/app.py`, ensuring `deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash`, `qwen3-max`, `qwen-plus`, and `llama-4-maverick` retain 100% conversation context.
- [x] **Task 10.2**: Frontend History Filtering Hardening: Refined `historyCandidates` in `Playground.tsx` so assistant turns with executed tools are preserved even if interim text was empty.
- [x] **Task 10.3**: Server-Side Web Fetch Proxy (`/api/tools/web_fetch`): Built gateway backend proxy using `httpx` to completely bypass browser CORS restrictions; added HTML text extraction (`_clean_html_text`), timeout safety, and cloud metadata SSRF guard.
- [x] **Task 10.4**: Companion & Frontend Web Fetch Integration: Added `web_fetch` to companion daemon (`/api/web_fetch`) and implemented 3-tier fallback in `webFetch.ts` (Gateway proxy -> Companion node -> Browser direct).
- [x] **Task 10.5**: Test Suite Expansion: Expanded unit tests in `tests/test_protocol.py` and `tests/test_companion.py` to 91 passing tests. Rebuilt static frontend assets (`index-D3ihzJPm.js`).
- [x] **Commits**: `4ebb551`, `a8bff73`

