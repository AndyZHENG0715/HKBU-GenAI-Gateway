# HKBU GenAI Gateway

An OpenAI-compatible gateway for the HKBU GenAI Platform. Students submit an
HKBU key once and receive a gateway key usable in OpenAI-compatible agents.

## Current status

Version `0.2.0` includes the core self-service flow: a student submits an HKBU
key at `/`, the server validates it, stores it encrypted, and returns a
one-time gateway key.

See:

- [Architecture](docs/architecture.md)
- [Provider inventory and verification notes](docs/providers.md)
- [Changelog](CHANGELOG.md)

## Quick start

Requires Python 3.11 or newer.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
$env:HKBU_GATEWAY_ENCRYPTION_KEY = "generate-a-fernet-key"
python -m uvicorn hkbu_gateway.app:app --reload
```

Generate a Fernet key once with:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Open `http://127.0.0.1:8000/`, enter the student's HKBU key, and copy the
returned gateway key. The gateway key is shown only once.

```powershell
curl.exe http://127.0.0.1:8000/v1/models `
  -H "Authorization: Bearer <gateway-key>"
```

The student's HKBU key is never accepted on `/v1/*`; it is encrypted in
SQLite and used only for upstream requests. Set `HKBU_DATABASE_PATH` to change
the database location. If `HKBU_GATEWAY_ENCRYPTION_KEY` is not set, a persistent
encryption key is automatically generated and saved alongside the database
(e.g., `hkbu_gateway.key`).

For a client, use:

```python
from openai import OpenAI

client = OpenAI(
    api_key="<gateway-key>",
    base_url="http://127.0.0.1:8000/v1",
)
answer = client.chat.completions.create(
    model="gpt-4.1",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Development

```powershell
python -m pytest
```

Use Conventional Commits and update `VERSION` plus `CHANGELOG.md` for
release-worthy changes.
