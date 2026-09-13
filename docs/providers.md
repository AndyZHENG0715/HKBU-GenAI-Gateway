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

## Verification gaps

The saved HTML is a rendered Swagger UI, not the canonical OpenAPI JSON. The
static snapshot does not reliably preserve the security scheme, request
examples, response examples, or runtime streaming behavior. The following
must be confirmed with an authorized, redacted live request before release:

- upstream authentication behavior for providers not covered by the live
  verification above;
- API version query parameters and deployment naming;
- exact request/response schemas for each provider;
- SSE framing and usage events;
- embeddings input and vector response shape.

The adapter uses `HKBU_UPSTREAM_AUTH_HEADER` (default `api-key`) and the
confirmed `/openai/deployments` path style. Both remain configurable while
additional providers are verified.
