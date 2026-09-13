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
- Credential storage will be introduced behind a repository interface; route
  handlers must not access a database directly.

The provider layer is deliberately isolated so it can be replaced by the
LiteLLM SDK after the compatibility and per-student credential behavior are
verified. See [alternatives](alternatives.md).

## Credential flow

`POST /api/credentials` validates the submitted HKBU key with a minimal
upstream request, encrypts it with an application Fernet key, and returns a
random gateway key. Only a SHA-256 hash of the gateway key is stored. The
plaintext gateway key is returned once and the plaintext HKBU key is never
returned.

`DELETE /api/credentials/current` revokes the current managed gateway key.
The current MVP intentionally has no account/login layer; deployment behind
institutional authentication or a later account layer is required before
opening self-service registration to the public Internet.

## Security decisions

- Gateway API keys are compared using a constant-time comparison.
- Upstream keys submitted through the credential flow are encrypted at rest;
  a server-side encryption key is required.
- Requests and upstream keys must not be logged.
- Student credential ownership is intentionally deferred to the account layer.

## Compatibility policy

Unsupported provider features must produce a structured `400` response. The
gateway must not silently drop fields such as `tools`, `response_format`, or
`stream`.
