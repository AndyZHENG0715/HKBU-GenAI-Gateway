# HKBU provider inventory

Source: downloaded Swagger HTML documents under `HKBU GenAI Platform/`.
Snapshot date: 2026-09-13.

The pages consistently render the upstream server as
`https://genai.hkbu.edu.hk/api/v0/rest` and expose both
`/deployments/{modelDeploymentName}/...` and
`/openai/deployments/{modelDeploymentName}/...` variants.

## Live verification

On 2026-09-13, a temporary test credential was used in memory only and was
not written to the repository or logs. The following calls returned HTTP 200:

- `POST /openai/deployments/deepseek-v4-flash/chat/completions?api-version=2024-05-01-preview`
- `POST /openai/deployments/gpt-4.1/chat/completions?api-version=2024-12-01-preview`
- `POST /openai/deployments/text-embedding-3-small/embeddings?api-version=2024-05-01-preview`
- `POST /openai/deployments/deepSeek-V4-Pro-hkbu/chat/completions?api-version=2025-04-01-preview`
- `POST /openai/deployments/qwen-plus/chat/completions?api-version=v1`
- `POST /openai/deployments/qwen3-max/chat/completions?api-version=v1`
- `POST /openai/deployments/llama-4-maverick/chat/completions?api-version=20240723`

The confirmed authentication header is `api-key`. GPT returned an
OpenAI-shaped `chat.completion`, and the embedding endpoint returned an
OpenAI-shaped embedding list. DeepSeek Pro, Qwen, and Llama also returned
OpenAI-shaped chat completions. This confirms the common path and
authentication style for all tested providers.

Gemini behaves differently: supplying `api-version=2024-05-01-preview`
returns `400 Invalid api-version` and reports `v1`/`v1beta` as allowed values.
Omitting `api-version` succeeds for both `gemini-2.5-flash` and
`gemini-2.5-pro`, returning OpenAI-shaped chat completions. The registry
therefore omits the query parameter for Gemini.

| Provider | Models found | Operations |
| --- | --- | --- |
| Azure OpenAI / GPT | `gpt-5`, `gpt-5-mini`, `gpt-4.1`, `gpt-4.1-mini`, `o1`, `o3-mini` | Chat completions |
| DeepSeek | `deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash` | Chat completions |
| Gemini | `gemini-2.5-pro`, `gemini-2.5-flash` | Chat completions |
| Qwen | `qwen3-max`, `qwen-plus` | Chat completions |
| Llama | `llama-4-maverick` | Chat completions |
| Embeddings | `text-embedding-3-large`, `text-embedding-3-small` | Embeddings |

## Verified Runtime Behavior (v1.0.0 & v1.1.x)

As of v1.1.0, the following runtime behaviors have been confirmed and tested:

- **Authentication**: Upstream HKBU Platform requires the `api-key` header (`HKBU_UPSTREAM_AUTH_HEADER`), with `HKBU_API_KEY_HEADER` supported as an alias.
- **Routing**: `/openai/deployments/{modelDeploymentName}/...` path style is confirmed across all major deployments.
- **Streaming (SSE)**: Streaming responses return OpenAI-formatted `data: {...}` lines ending in `data: [DONE]`. Upstream SSE error states (e.g., transient DeepSeek 503 errors) are safely yielded as SSE error payloads without dropping the connection.
- **Reasoning Content**: DeepSeek returns reasoning thoughts either inside `delta.reasoning_content` or within `<think>...</think>` message blocks; both are supported seamlessly by the web playground and client tools.
- **Agent Extensions**: Extra fields such as `tools`, `tool_choice`, and `response_format` are passed directly through to upstream endpoints to ensure compatibility with agent tools (Cursor, Cline, Roo Code, Dify, WorkBuddy).
- **Gemini Deployments**: Gemini endpoints (`gemini-2.5-flash`, `gemini-2.5-pro`) require omitting the `api-version` query parameter; this is handled automatically by `registry.py`.

## Tool Calling (Function Calling) Analysis & Upstream Benchmarks

### 1. Swagger Documentation Findings
In the official Swagger documentation files saved under `HKBU GenAI Platform/`:
- **Shared Schema Component**: All documentation pages (`ChatGPT`, `Gemini`, `DeepSeek`, `Llama`, `Qwen`) include the OpenAPI 3.0 schemas for `ToolFunctionDto`, `ToolDto`, `ToolChoiceFunctionDto`, `ToolCall`, and `CreateChatCompletionDto`. This is because HKBU's backend uses a shared NestJS DTO where `tools?: ToolDto[]` is declared globally.
- **Explicit Gating Warning**: Only the `ChatGPT` and `Gemini` documentation pages include the explicit **Function Calling (Tools) Support** advisory:
  > *"Tools are OpenAI-compatible function definitions passed via `tools` and `tool_choice` in the request body.*
  > ***Supported for: Azure OpenAI GPT (streaming + non‑streaming), Gemini (non‑streaming). Other providers are currently gated.***"
  This notice is omitted on the Qwen, Llama, and DeepSeek documentation pages.

### 2. Empirical Verification & Gateway Emulation (v1.2.0)
Live tests against the upstream HKBU platform (`https://genai.hkbu.edu.hk/api/v0/rest`) with function tools provided the following empirical results:

| Model | Provider | Native Upstream `tool_calls` | Gateway Emulated `tool_calls` | Client `supportsToolCall` | Emulation Strategy |
| --- | --- | --- | --- | --- | --- |
| `gpt-5`, `gpt-4.1`, `gpt-4.1-mini`, `o1`, `o3-mini` | Azure OpenAI | **Yes** (stream + non-stream) | N/A (Native) | `true` | Native upstream OpenAI tool calling. |
| `gemini-2.5-pro`, `gemini-2.5-flash` | Vertex AI | **Yes** (non-stream) | N/A (Native) | `true` | Native upstream with uppercase `STOP` normalized to `tool_calls`. |
| `deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash` | DeepSeek | **No** (Gated upstream) | **Yes** (stream + non-stream) | `true` | Gateway Prompt-Based Emulation Adapter (`tools.py`) with JSON & XML tag extraction (`<tool_name>...</tool_name>`). Combined with `ThinkStreamFilter` for concurrent reasoning extraction. |
| `qwen3-max`, `qwen-plus` | Alibaba Cloud | **No** (Gated upstream) | **Yes** (stream + non-stream) | `true` | Gateway Prompt-Based Emulation Adapter (`tools.py`). Injects tool schema into system prompt, strips top-level tools, and parses structured output into OpenAI `tool_calls`. |
| `llama-4-maverick` | Vertex AI | **No** (Gated upstream) | **Yes** (stream + non-stream) | `true` | Gateway Prompt-Based Emulation Adapter (`tools.py`). Injects tool schema into system prompt, translates tool result turns, and converts model output into OpenAI `tool_calls`. |

### 3. Tool Calling Emulation Architecture (`tools.py`)
To unlock full tool calling capabilities for DeepSeek, Qwen, and Llama across agent harnesses (such as Tencent WorkBuddy, Cursor, VS Code Copilot, Cline, and Dify):
1. **Request Translation**: For a model where `native_tool_call` is false, the gateway adapts tools, system/developer messages, and tool history (including history retained after switching from a native model):
   - Preserves separate client system messages. Live Qwen probes accepted two system messages and followed both; lack of native tools does not establish a need to merge system messages.
   - Adds a separate gateway tool protocol after the client instructions, with compact JSON schemas, a consistent tool output format, and guidance to answer the current user request using history.
   - Converts any client-sent `role: "tool"` or `role: "function"` response turns into contextual user turns (`[Tool Result for {name}]: ...`).
   - Converts previous assistant messages containing `tool_calls` into assistant turns containing the JSON call block.
   - Pops `tools`, `tool_choice`, and `parallel_tool_calls` from the payload sent to HKBU to avoid upstream errors or parameter dropping.
   - Preserves historical tool call IDs and resolves result names from the matching calls. Tool results remain data; they do not include a synthetic instruction to immediately answer, allowing multi-step tool use.
   - With `tool_choice: "none"`, omits tool schemas, instructs the model to answer directly, and disables both streaming and non-streaming response conversion.
2. **Response Translation (Non-Streaming)**:
   - The gateway parses the model's text response for both JSON function call blocks (`tool_calls`, `name`/`arguments`, `tool`/`parameters`, `function`/`parameters`) and XML tag calls (`<tool_name>...</tool_name>` or `<tool_call>`).
   - Normalizes valid calls into standard OpenAI `choices[0].message.tool_calls` with generated `call_...` IDs.
   - Sets `finish_reason: "tool_calls"` and clears `content`.
3. **Response Translation (Streaming SSE)**:
   - `EmulatedToolStreamFilter` buffers candidate tool-calling tokens (JSON blocks and XML tags) until completion, then emits the exact 3-chunk OpenAI tool calling event sequence (`delta.tool_calls` declaration, arguments chunk, and `finish_reason: "tool_calls"`).
   - Coordinates with `ThinkStreamFilter` so that thinking tokens (`<think>`) stream in real time as `delta.reasoning_content` while tool calls are intercepted into `tool_calls`.
   - If the initial tokens are natural conversational text, it immediately flushes the buffer as `delta.content` with zero latency overhead.
   - If upstream returns JSON despite a streaming request, emulated calls still pass through the same tool conversion before SSE is emitted.

### Qwen history loss and Copilot follow-up replies

The saved HKBU ChatGPT/Gemini HTML documentation states that native tools are enabled for Azure GPT (streaming and non-streaming) and Gemini (non-streaming); other providers are gated. Shared Swagger tool schemas do not establish provider support. Qwen, DeepSeek, and Llama therefore still need the gateway adapter.

Live probes on 2026-09-30 found that both HKBU Qwen deployments behaved as if only the last user turn was forwarded: a full dialogue remembering `ORCHID` and a request containing just the final recall question each reported 23 prompt tokens and failed recall. Embedding the history in the final user message raised the prompt count to 47 and both models recalled `ORCHID`. The gateway's implemented transcript encoding reported 83 prompt tokens and also passed recall on both deployments. This isolates a history-loss problem independently of tools and Copilot identity instructions. It does not establish the internals of the university adapter or reproduce the exact original Copilot request.

Both deployments accepted multiple system messages (HTTP 200, `ALPHA BETA`) and rejected developer messages (HTTP 400 with an explicit role allowlist). System merging was therefore withdrawn. Developer-to-system conversion is scoped to these two Qwen deployments, together with the history workaround. See [the live verification report](qwen-live-verification.md) and its synthetic request/response evidence. No prompt-cache conclusion is supported by these probes: non-streaming usage omitted cached-token details, and streaming responses omitted usage altogether.

### 4. Client Agent Protocol Normalization (`app.py`)
- **Message Content Normalization**: Complex multi-turn content arrays sent by agents (such as VS Code Copilot's `[{"type": "tool_result", ...}]` or `[{"type": "text", "value": "..."}]`) are automatically sanitized into plain strings or strictly valid `text`/`image_url` objects to satisfy upstream DTO validation rules.
- **HKBU Qwen History Workaround**: Only for `qwen-plus`/`qwen3-max`, maps the rejected developer role to system, retaining separate system messages. For multi-turn dialogue, encodes earlier turns as a compact JSON transcript in the final user message; the current user content remains separate beneath that transcript. If the conversation ends with tool results, includes those results and continues the original user task. Preserves historical roles, call IDs, and results as data, but cannot recreate native role priority or exact interleaved system/developer timing. Other models are unchanged, and ordinary single-turn Qwen requests add no transcript overhead.
- **Reasoning Model Parameter Stripping**: Requests to Azure OpenAI `o1` and `o3-mini` automatically strip `temperature`, `top_p`, and penalty parameters, and map `max_tokens` to `max_completion_tokens`.
