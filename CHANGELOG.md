# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.2] - 2026-09-18

### Fixed

- Stream error handling: yield structured SSE error events instead of raising unhandled ASGI exceptions and dropping TCP streams (`network error`).
- Empty message content validation: guarantee `content` is always present for every message in `upstream_payload` to satisfy HKBU gateway schema requirements.
- Message action buttons: made `Edit` and `Retry` action buttons permanently visible beneath messages with distinct icons and text.
- Added in-bubble Error Card with direct `Retry Message` and `Try Gemini 2.5 Flash` quick-switch buttons when upstream models are unavailable.

## [0.3.1] - 2026-09-18

### Added

- DeepSeek reasoning thought process accordion (`ThinkingBox`) supporting both `reasoning_content` deltas and `<think>` tags.
- Full GitHub Flavored Markdown rendering with tables, blockquotes, and code syntax blocks with copy buttons.
- Chat message toolbar with Copy Message, Edit User Message, and Retry / Regenerate response actions.
- Persistent multi-turn conversation history sidebar with `localStorage` backing, "+ New Chat", and session switching.

## [0.3.0] - 2026-09-18

### Added

- Production frontend SPA built with React 19, TypeScript, Tailwind CSS, and Vite.
- Built-in interactive Chat Playground with real-time streaming SSE and model switching.
- Zero-config auto-generation and persistence of Fernet encryption keys for headless deployments (e.g., Railway).
- Pre-configured tool presets (Open WebUI, LibreChat, Dify, Cursor, Cline/Roo Code).
- Multi-model fallback validation for student HKBU Platform keys.

## [0.2.0] - 2026-09-13

### Added

- Self-service HKBU key validation and one-time OpenAI-compatible gateway keys.
- Encrypted SQLite credential persistence and key revocation.
- Static setup page at `/`.

### Changed

- Evaluated LiteLLM and Azure-focused proxy projects as alternatives to custom
  provider translation. See `docs/alternatives.md`.

## [0.1.0] - 2026-09-13

### Added

- Initial project baseline and contribution conventions.
- Provider inventory extracted from the downloaded HKBU Swagger pages.
- FastAPI-compatible gateway skeleton with `/healthz`, `/v1/models`,
  `/v1/chat/completions`, and `/v1/embeddings` routes.
- Configurable HKBU upstream URL and authentication header.
