# Reuse versus custom implementation

Research snapshot: 2026-09-13.

## Candidates

### LiteLLM

LiteLLM is the strongest fit for the provider translation layer. It offers a
self-hosted OpenAI-compatible proxy and SDK, Azure OpenAI support, generic
OpenAI-compatible endpoints, streaming, model routing, and usage handling.

References:

- <https://github.com/BerriAI/litellm>
- <https://docs.litellm.ai/docs/providers/azure>
- <https://docs.litellm.ai/docs/providers/openai_compatible>

The important limitation for this project is per-student upstream credentials.
Static LiteLLM proxy configuration is designed around configured model keys;
students need a credential selected dynamically from the gateway API key. The
recommended integration is therefore to use LiteLLM as an SDK/provider engine
behind our own thin account and credential layer, rather than exposing a
shared static proxy configuration.

### Azure OAI Proxy

`Gyarbij/azure-oai-proxy` is a Go proxy focused on translating Azure OpenAI to a
standard OpenAI API. It is useful reference code for Azure path and response
handling, but it is narrower than this project because the HKBU catalog also
contains DeepSeek, Gemini, Qwen, Llama, and embeddings.

Reference: <https://github.com/Gyarbij/azure-oai-proxy>

### Microsoft Azure OpenAI Service Proxy

Search results identify Microsoft's `azure-openai-service-proxy` as an event
and playground-oriented proxy. The repository reference was not available at
the checked branch during this review, so it is not selected as a dependency.
Its event-management assumptions also do not match the student self-service
credential flow closely enough to use as the application foundation.

## Decision

Keep the small FastAPI control-plane and API contract introduced in `0.1.0`,
but evaluate replacing `providers.py` with LiteLLM's SDK in the next
milestone. This preserves our dynamic credential lookup and frontend while
avoiding reimplementing provider-specific request/response normalization.

Before integrating LiteLLM:

1. Validate the HKBU upstream auth header and schemas with an authorized
   request.
2. Confirm LiteLLM can pass a per-request HKBU key and custom base URL without
   leaking credentials into logs or shared state.
3. Add contract tests against recorded, redacted upstream fixtures.
