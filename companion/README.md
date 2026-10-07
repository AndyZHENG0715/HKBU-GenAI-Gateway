# Local companion pairing

Run `python companion/hkbu_genai_companion.py`, then open Playground → Local Node and paste the pairing token printed in the terminal. Click **Probe Connection**. The token is kept in browser session storage and changes whenever the companion restarts. Pairing grants that browser tab access to your local commands and files; stop the companion when finished.

The companion binds only to `127.0.0.1`. Every HTTP request, including health checks, requires `Authorization: Bearer <pairing-token>`. CORS preflight permits trusted origins without a token; it cannot execute commands. Browsers must also use an exact trusted origin. Defaults are `https://byok.aitutor.ink`, localhost and `127.0.0.1` on ports 8000 and 5173. Set `HKBU_COMPANION_ORIGINS` to a comma-separated list of exact origins to replace these defaults. Wildcards are not supported. Clients without an Origin header still require the token.

WebSocket clients must provide the same authorization header or use `new WebSocket('ws://127.0.0.1:9001/ws', ['hkbu-pair.' + token])`. Browser WebSocket origins undergo the same checks before the handshake. Tokens must never be put in URL query strings or shared with other people.

Pairing protects access to the companion. Shell commands still execute with your operating-system permissions, and authenticated file tools can access absolute paths. A gateway website login does not replace this local pairing boundary.
