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

## Verified Runtime Behavior (v1.0.0)

As of v1.0.0, the following runtime behaviors have been confirmed and tested:

- **Authentication**: Upstream HKBU Platform requires the `api-key` header (`HKBU_UPSTREAM_AUTH_HEADER`), with `HKBU_API_KEY_HEADER` supported as an alias.
- **Routing**: `/openai/deployments/{modelDeploymentName}/...` path style is confirmed across all major deployments.
- **Streaming (SSE)**: Streaming responses return OpenAI-formatted `data: {...}` lines ending in `data: [DONE]`. Upstream SSE error states (e.g., transient DeepSeek 503 errors) are safely yielded as SSE error payloads without dropping the connection.
- **Reasoning Content**: DeepSeek returns reasoning thoughts either inside `delta.reasoning_content` or within `<think>...</think>` message blocks; both are supported seamlessly by the web playground and client tools.
- **Agent Extensions**: Extra fields such as `tools`, `tool_choice`, and `response_format` are passed directly through to upstream endpoints to ensure compatibility with agent tools (Cursor, Cline, Roo Code, Dify).
- **Gemini Deployments**: Gemini endpoints (`gemini-2.5-flash`, `gemini-2.5-pro`) require omitting the `api-version` query parameter; this is handled automatically by `registry.py`.
