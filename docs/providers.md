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
| `deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash` | DeepSeek | **Yes** (non-stream) | N/A (Native) | `true` | Native upstream with `<think>` blocks cleanly separated into `reasoning_content`. |
| `qwen3-max`, `qwen-plus` | Alibaba Cloud | **No** (Gated upstream) | **Yes** (stream + non-stream) | `true` | Gateway Prompt-Based Emulation Adapter (`tools.py`). Injects tool schema into system prompt, strips top-level tools, and parses structured output into OpenAI `tool_calls`. |
| `llama-4-maverick` | Vertex AI | **No** (Gated upstream) | **Yes** (stream + non-stream) | `true` | Gateway Prompt-Based Emulation Adapter (`tools.py`). Injects tool schema into system prompt, translates tool result turns, and converts model output into OpenAI `tool_calls`. |

### 3. Tool Calling Emulation Architecture (`tools.py`)
To unlock full tool calling capabilities for Qwen and Llama across agent harnesses (such as Tencent WorkBuddy, Cursor, Cline, OpenCode, and Dify):
1. **Request Translation**: When a client sends `tools: [...]` for a model where `native_tool_call` is false, the gateway:
   - Formats the tools JSON schemas into an authoritative system prompt instruction.
   - Converts any client-sent `role: "tool"` or `role: "function"` response turns into contextual user turns (`[Tool Result for {name}]: ...`).
   - Converts previous assistant messages containing `tool_calls` into assistant turns containing the JSON call block.
   - Pops `tools` and `tool_choice` from the payload sent to HKBU to avoid upstream errors or parameter dropping.
2. **Response Translation (Non-Streaming)**:
   - The gateway parses the model's text response for JSON function call blocks (`tool_calls`, `name`/`arguments`, `tool`/`parameters`, or `function`/`parameters`).
   - Normalizes valid calls into standard OpenAI `choices[0].message.tool_calls` with generated `call_...` IDs.
   - Sets `finish_reason: "tool_calls"` and clears `content`.
3. **Response Translation (Streaming SSE)**:
   - `EmulatedToolStreamFilter` buffers candidate JSON tool-calling tokens until completion, then emits the exact 3-chunk OpenAI tool calling event sequence (`delta.tool_calls` declaration, arguments chunk, and `finish_reason: "tool_calls"`).
   - If the initial tokens are natural conversational text, it immediately flushes the buffer as `delta.content` with zero latency overhead.


