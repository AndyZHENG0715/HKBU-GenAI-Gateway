# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
