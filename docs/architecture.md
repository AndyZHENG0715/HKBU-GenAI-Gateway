# Architecture

## Goals

The gateway exposes the small, stable subset of the OpenAI HTTP protocol that
most student tools already understand:

```text
GET  /v1/models
POST /v1/chat/completions
POST /v1/embeddings
```

The client sends a gateway API key. The gateway authenticates that key, selects
an adapter from the requested `model`, adds the configured upstream
credentials, and normalizes the response.

```text
OpenAI client -> gateway auth -> model registry -> provider adapter -> HKBU
                                      |                  |
                                      +-- OpenAI shape <-+
```

## Boundaries

- `registry.py` owns model metadata and provider lookup.
- `protocol.py` owns request validation and OpenAI-shaped response helpers.
- `providers.py` owns upstream URL and header construction.
- `app.py` owns HTTP concerns and error mapping.
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
