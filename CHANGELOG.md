# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
