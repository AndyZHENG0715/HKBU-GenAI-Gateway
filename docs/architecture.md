# Architecture

## Goals

The gateway exposes standard OpenAI and agent-compatible HTTP protocols that
developer tools, coding assistants, and desktop harnesses understand:

```text
GET  /v1/models, /models, /v1/model, /model, /api/v1/models, /v1/model/info
POST /v1/chat/completions, /chat/completions
POST /v1/embeddings, /embeddings
```

The client sends a gateway API key (or connects unauthenticated for model discovery).
The gateway authenticates requests, matches the requested `model`, applies tool
emulation or reasoning extraction adapters as needed, adds upstream credentials,
and normalizes responses into standard OpenAI formats.

```text
OpenAI / Agent client -> gateway auth -> model registry -> tools adapter / think filter -> HKBU upstream
                                                |                      |
                                                +-- OpenAI shape <-----+
```

## Boundaries

- `registry.py` owns model metadata, context window specs, and provider ability flags.
- `tools.py` owns prompt-based tool calling emulation, JSON schema serialization, multi-turn tool result translation, and `EmulatedToolStreamFilter` for streaming SSE tool calls.
- `providers.py` owns upstream URL routing, authentication headers, `ThinkStreamFilter` for multi-tag reasoning extraction, and upstream streaming lifecycles.
- `protocol.py` owns request validation and OpenAI-shaped response helpers.
- `app.py` owns HTTP routing, static assets, and exception mapping.
- `credentials.py` owns the encrypted SQLite credential store (`CredentialStore`).
- Route handlers interact with `CredentialStore` via structured methods and never execute raw SQL directly.

The provider layer is deliberately isolated so it can be replaced or augmented
as provider APIs evolve. See [alternatives](alternatives.md).

## Credential flow

`POST /api/credentials` validates the submitted HKBU key with a multi-model
fallback upstream request, encrypts it with an application Fernet key, and returns
a random gateway key (`hkbu-...`). Only a SHA-256 hash of the gateway key is
stored. The plaintext gateway key is returned once and the plaintext HKBU key
is never returned to clients.

`DELETE /api/credentials/current` revokes the current managed gateway key.
The current MVP intentionally has no account/login layer; keys are self-managed
by the student or researcher who generated them.

## Security decisions

- Gateway API keys are compared using a constant-time comparison on SHA-256 hashes.
- Upstream keys submitted through the credential flow are encrypted at rest using
  Fernet (AES-128-CBC + HMAC-SHA256). If `HKBU_GATEWAY_ENCRYPTION_KEY` is not provided,
  a key is automatically generated and persisted in `hkbu_gateway.key` for zero-config operation.
- Requests and upstream keys must never be logged in plaintext.
- Student credential ownership is intentionally self-service per key.

## Compatibility policy

Unsupported provider features must produce a structured `400` response. The
gateway must not silently drop fields such as `tools`, `response_format`, or
`stream`.
