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

### 2. Empirical Verification Across All Models
Live tests against the upstream HKBU platform (`https://genai.hkbu.edu.hk/api/v0/rest`) with function tools provided the following empirical results:

| Model | Provider | Native `tool_calls` | `finish_reason` | Runtime Behavior | Gateway `supportsToolCall` |
| --- | --- | --- | --- | --- | --- |
| `gpt-5`, `gpt-4.1`, `gpt-4.1-mini`, `o1`, `o3-mini` | Azure OpenAI | **Yes** (stream + non-stream) | `tool_calls` | Fully conforms to standard OpenAI tool calling specification. | `true` |
| `gemini-2.5-pro`, `gemini-2.5-flash` | Vertex AI | **Yes** (non-stream) | `STOP` (normalized to `tool_calls`) | Returns structured `tool_calls`; gateway normalizes uppercase `finish_reason` for client compatibility. | `true` |
| `deepSeek-V4-Pro-hkbu`, `deepseek-v4-flash` | DeepSeek | **Yes** (non-stream) | `tool_calls` | Returns structured `tool_calls` while also outputting `<think>` reasoning blocks. | `true` |
| `qwen3-max`, `qwen-plus` | Alibaba Cloud | **No** (Gated / ignored) | `stop` | Upstream gateway strips or ignores `tools`. The model responds in conversational text explaining it cannot execute functions. `tool_calls` is `null`. | `false` |
| `llama-4-maverick` | Vertex AI | **No** (Unparsed raw text) | `stop` | Upstream does not extract tool calls into `message.tool_calls`. Model generates raw string text like `function_call: get_current_weather(...)` into `content`. `tool_calls` is `null`. | `false` |

### 3. Gateway Design Decision
By correctly reporting `supportsToolCall: false` / `tool_call: false` for `qwen` and `llama` in `/models` and `/v1/model/info`:
1. Agent harnesses (such as Tencent WorkBuddy, OpenCode, Claude Code, Cursor, Dify) know not to rely on native OpenAI `tool_calls` for Qwen and Llama.
2. The harness can automatically apply prompt-based tool formatting or prompt the user to choose GPT-4.1, Gemini, or DeepSeek for agentic execution.
3. This prevents unhandled null errors, schema parsing exceptions, or endless tool-calling retry loops in downstream client applications.

