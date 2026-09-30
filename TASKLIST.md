# TASKLIST: Agentic Playground (Hybrid Architecture)

Tracking document for the Agentic Playground feature on branch `feat/agentic-playground`.
Target Version: **`2.0.0`** (SemVer major bump: Agentic Playground evolution).

---

## 1. Architectural Invariants Checklist
- [ ] **Zero Server Overhead on Railway**: All Python execution, local file I/O, and shell tasks run on the user's browser or local machine. Railway container executes 0 user code.
- [ ] **Gateway Compatibility**: Works transparently with both native models (`gpt-4.1`, `gpt-5`, `gemini-2.5-flash`) and emulated models (`qwen-plus`, `qwen3-max`, `deepseek-v4-flash`).
- [ ] **Safety & Permission**: Destructive actions (local file write, shell execution) require explicit user approval.
- [ ] **Loop Guard**: Maximum iteration cap (default 10 steps) to prevent runaway token consumption.
- [ ] **Atomic Commits**: Conventional commits (`feat`, `fix`, `docs`, `test`) per milestone.
- [ ] **5-File Version Cascade**: Update `VERSION`, `pyproject.toml`, `src/hkbu_gateway/__init__.py`, `frontend/package.json`, `CHANGELOG.md` upon release.

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
- [ ] **Task 5.1**: Implement standalone zero-dependency Python script `companion/hkbu_genai_companion.py` (WebSocket server on `127.0.0.1:9001`, handshake, bash execution, filesystem access).
- [ ] **Task 5.2**: Implement `frontend/src/lib/agent/tools/localCompanion.ts` (WebSocket client, auto-discovery of local node, approval modal trigger).
- [ ] **Task 5.3**: Add "Connect Local Terminal" guide and connection indicator to Playground UI.
- [ ] **Commit 5**: `feat(companion): add local companion node and terminal execution bridge`

### Milestone 6: Verification, Documentation & Version Cascade
- [ ] **Task 6.1**: Rebuild frontend (`npm run build` with static asset mirroring to `static/` and `static/hkbuapi4agent.html`).
- [ ] **Task 6.2**: Run full Python test suite (`PYTHONPATH=src pytest`).
- [ ] **Task 6.3**: Update `HANDOFF.md`, `README.md`, `README.zh-CN.md`, `README.zh-HK.md`, and `docs/architecture.md`.
- [ ] **Task 6.4**: Execute 5-file SemVer bump to `2.0.0` with `CHANGELOG.md` release notes.
- [ ] **Commit 6**: `chore(release): bump version to 2.0.0 and document agentic playground`
