# Troubleshooting Guide

This guide provides root-cause explanations and practical solutions for common operational issues, upstream platform quirks, and client integration challenges when using the HKBU GenAI Gateway.

---

## 1. Diagnostic Methodology & Probing Discipline

When troubleshooting connectivity or model behavior, always follow these diagnostic principles:

### 1.1. Health Check & Basic Probing
Always bypass any local proxy environment variables (`http_proxy`, `https_proxy`) when testing localhost:

```bash
# Verify gateway server is running and check version
curl --noproxy '*' -s http://127.0.0.1:8000/healthz
# Expected: {"status":"ok","version":"1.3.3"}

# Verify model registry discovery
curl --noproxy '*' -s http://127.0.0.1:8000/v1/models | jq .data[].id
```

### 1.2. University Quota & Token Budget Discipline
HKBU GenAI Platform accounts share rate limits and institutional token allowances. **Never run open-ended creative prompts or unconstrained loops during diagnostics.**
- **Always set a strict token cap**: Specify `max_tokens: 10` (or `16`) on all diagnostic requests.
- **Use short deterministic probes**: e.g., `"1+1=?"` or exact keyword recall probes (`"Respond with the word ALPHA and nothing else"`).
- **Beware of upstream non-enforcement**: Note that certain upstream deployments (such as Alibaba Cloud Qwen) may not strictly enforce `max_tokens` when answering; using fixed-marker prompts prevents uncontrolled output.

### 1.3. Running Local Test Suite
Verify your local gateway installation against all unit and integration tests:

```bash
PYTHONPATH=src .venv/bin/pytest
# All 71+ tests should pass without errors
```

---

## 2. Common Issues & Root-Cause Resolutions

### Issue 1: VS Code Copilot / Client crashes with `Response contained no choices` or closes immediately

#### Symptoms
- In VS Code Copilot Chat, submitting a prompt produces an empty message bubble or fails with an error notification: `Response contained no choices` or `Stream closed unexpectedly`.
- The completion terminates in less than 1 second without output.

#### Root Causes
1. **Missing Initial Content Frame (Chunk 0)**: Many client parsers (including VS Code Copilot's stream processor) require the very first SSE chunk to contain both `"role": "assistant"` and `"content": ""` (`{"choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": null}]}`). If a gateway emits only `role: "assistant"` without `content`, the client text buffer fails to initialize and aborts.
2. **Empty Choices Array on Usage / Notice Frames**: Upstream HKBU servers occasionally yield intermediate SSE events containing usage data or system notices with `choices: []` or missing `choices`. Brittle clients throw an unhandled exception when accessing `choices[0]`.
3. **Missing Terminal Finish Reason**: Upstream SSE streams that terminate with `data: [DONE]` without an explicit preceding chunk containing `"finish_reason": "stop"` cause clients to hang or classify the stream as aborted.

#### Gateway Mitigation
The gateway's streaming pipeline (`src/hkbu_gateway/providers.py` and `src/hkbu_gateway/tools.py`) strictly enforces:
- Standardized Chunk 0 emission with explicit `content: ""` on all streams.
- Choices array fallback enrichment on every outgoing SSE chunk.
- Guaranteed emission of a final chunk containing `finish_reason: "stop"` (or `"tool_calls"`) before yielding `data: [DONE]`.

---

### Issue 2: Qwen models (`qwen-plus`, `qwen3-max`) forget prior conversation, echo `"GitHub Copilot"`, or answer with generic confusion

#### Symptoms
- Multi-turn conversation with `qwen-plus` or `qwen3-max` loses all earlier dialogue. For example:
  - Turn 1: *"9.8大还是9.11大？"* -> Assistant: *"9.11 大于 9.8。"*
  - Turn 2: *"你确定？"* -> Assistant: *"请提供具体的文本或内容，我将为您检查。"* or simply echoes *"GitHub Copilot"*.
- The model acts as if only the most recent user prompt was provided.

#### Root Causes
1. **Upstream Adapter History Dropping**: Live probe verification on 2026-09-30 confirmed that HKBU's upstream adapter for Alibaba Cloud Qwen silently discards all prior dialog history and forwards **only the final user turn** to DashScope. When VS Code Copilot appends client identity metadata or short confirmation queries (`"你确定？"`), Qwen only sees that snippet with zero historical context.
2. **Developer Role Rejection**: HKBU's Qwen endpoint strictly rejects requests containing `role: "developer"` with HTTP 400 (`Allowed roles: system, user, assistant, tool, function`).

#### Gateway Mitigation
In `src/hkbu_gateway/app.py`:
- `_prepare_qwen_messages()` detects multi-turn conversations for `qwen-plus` and `qwen3-max` and serializes preceding dialogue into a structured JSON transcript (`Conversation history (oldest to newest): [...]`) prefixed directly into the retained final user turn.
- Automatically remaps `role: "developer"` to `role: "system"`.
- Preserves separate system messages (probes confirmed multiple system messages are received and honored upstream).

---

### Issue 3: Upstream HTTP 400 Bad Request: `Content must be either a string or an array of content parts` / NestJS Class-Validator failure

#### Symptoms
- Requests from AI coding agents (Cursor, Cline, Roo Code, Dify) fail with HTTP 400 Bad Request:
  ```json
  {"error": {"message": "Content must be either a string or an array of content parts", "type": "upstream_error", "code": 400}}
  ```

#### Root Causes
The HKBU backend is built on NestJS with strict `class-validator` DTOs:
1. **Empty String Rejection**: Empty strings (`""`) in `messages[].content` trigger HTTP 400 across all roles.
2. **Anthropic / Claude Content Structure**: Modern coding agents frequently pass Anthropic-style structured content part arrays (e.g., `[{"type": "tool_result", "content": ...}]`), which fail NestJS validation on endpoints expecting plain strings.
3. **Role-Specific Null Rules**:
   - Assistant turns containing `tool_calls` require `content: null` (None); `content: ""` triggers HTTP 400.
   - Tool/function response turns reject `null` and `""`.

#### Gateway Mitigation
`_sanitize_message_content()` in `src/hkbu_gateway/app.py` normalizes all incoming message payloads before upstream dispatch:
- Assistant turns with `tool_calls` coerce empty content to `None`.
- Tool/function turns coerce empty content to compliant `"(success)"`.
- Non-image content arrays are flattened into unified strings.
- User and system turns with empty content are defaulted to a single whitespace `" "`.

---

### Issue 4: Upstream HTTP 400 Bad Request: `Unsupported value: 'temperature'` on Azure OpenAI Reasoning Models (`o1`, `o3-mini`, `gpt-5`)

#### Symptoms
- Sending requests to `o1`, `o1-mini`, `o3-mini`, `gpt-5`, or `gpt-5-mini` fails with HTTP 400:
  ```json
  {"error": {"message": "Unsupported value: 'temperature' does not support custom values for this model", "code": 400}}
  ```

#### Root Causes
Azure OpenAI reasoning deployments do not support sampling hyperparameters:
- Rejects `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty`.
- Rejects standard `max_tokens` in favor of `max_completion_tokens`.

#### Gateway Mitigation
In `src/hkbu_gateway/app.py` (`upstream_payload`):
- Automatically strips `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty` for models starting with `o1`, `o3`, or `gpt-5`.
- Automatically renames `max_tokens` to `max_completion_tokens`.

---

### Issue 5: Local `curl` or client throws HTTP 403 `Direct IP access is not allowed` or `not allowed by policy`

#### Symptoms
- Attempting to connect to `http://127.0.0.1:8000/` or `http://localhost:8000/` from the command line returns an immediate HTTP 403 error page from a corporate or local proxy (e.g. Zscaler, Charles, or VPN proxy).

#### Root Causes
Environment variables `http_proxy`, `https_proxy`, `ALL_PROXY`, or `all_proxy` intercept connections intended for the loopback address (`127.0.0.1`) and route them through an external proxy server that denies direct IP routing.

#### Solution
1. **Use `--noproxy '*'` with curl**:
   ```bash
   curl --noproxy '*' -s http://127.0.0.1:8000/healthz
   ```
2. **Export `no_proxy` in your shell**:
   ```bash
   export no_proxy="localhost,127.0.0.1"
   export NO_PROXY="localhost,127.0.0.1"
   ```

---

### Issue 6: Model outputs raw JSON or XML instead of calling tools (`tool_calls`)

#### Symptoms
- When using tools with `deepseek-v4-flash`, `deepSeek-V4-Pro-hkbu`, `qwen-plus`, `qwen3-max`, or `llama-4-maverick`, the assistant outputs raw markdown JSON blocks ```` ```json {"name": "..."} ``` ```` or XML tags `<tool_call>...</tool_call>` in chat text instead of triggering tool execution in the client IDE.

#### Root Causes
The HKBU platform gates native function calling for DeepSeek, Qwen, and Llama. These models lack native provider-side tool parsers.

#### Gateway Mitigation & Verification
The gateway provides automated tool emulation (`src/hkbu_gateway/tools.py`):
1. Ensure the client sends standard OpenAI `tools: [...]` in the request payload.
2. In the gateway, `registry.py` declares `native_tool_call: False` for these models.
3. The gateway intercepts the payload, injects JSON schemas as system instructions, and activates `EmulatedToolStreamFilter`.
4. If the model outputs fenced JSON or XML tags, the filter intercepts them mid-stream and yields standard OpenAI `tool_calls` chunks with `finish_reason: "tool_calls"`.

---

### Issue 7: Authentication Failure (HTTP 401 / 403)

#### Symptoms
- Calling `/api/credentials` returns: `401 Invalid HKBU GenAI Platform key`.
- Calling `/v1/chat/completions` returns: `401 Unauthorized: Invalid or missing API key`.

#### Root Causes & Resolution
1. **During Key Generation (`/api/credentials`)**:
   - The submitted HKBU key is invalid, revoked, or has expired.
   - The platform account lacks access to the test deployments (`gpt-4.1`, `deepseek-v4-flash`, etc.).
   - Log into [genai.hkbu.edu.hk](https://genai.hkbu.edu.hk/) to verify that your university platform key is active.
2. **During API Consumption (`/v1/*`)**:
   - The client did not provide the `Authorization: Bearer hkbu-...` header.
   - The gateway key was regenerated or the database (`hkbu_gateway.db`) was deleted. Check your gateway key in the web portal or regenerate a new one.

---

### Issue 8: Fernet Decryption Error (`InvalidToken`) after Migration or Restart

#### Symptoms
- Gateway startup succeeds, but all incoming requests fail with 500 Internal Server Error, and logs show `cryptography.fernet.InvalidToken`.

#### Root Causes
The SQLite database `hkbu_gateway.db` contains credentials encrypted with a specific Fernet key. If the container or machine is restarted and `hkbu_gateway.key` was not persisted, a new random Fernet key is generated, making existing stored credentials undecryptable.

#### Solution
- **Persistent Volume**: When running in Docker, ensure `./data` is bound to `/app/data` so that both `hkbu_gateway.db` and `hkbu_gateway.key` are preserved together:
  ```yaml
  volumes:
    - ./data:/app/data
  ```
- **Static Encryption Key**: Set `HKBU_GATEWAY_ENCRYPTION_KEY` as a static environment variable across container redeployments.

---

### Issue 9: Google Gemini Deployments return HTTP 400 `Invalid api-version`

#### Symptoms
- Calling `gemini-2.5-flash` or `gemini-2.5-pro` fails with:
  ```json
  {"error": {"message": "Invalid api-version", "code": 400}}
  ```

#### Root Causes
Unlike Azure OpenAI deployments which require `?api-version=2024-05-01-preview`, HKBU's Gemini deployments reject `api-version` query strings.

#### Gateway Mitigation
`src/hkbu_gateway/registry.py` declares `api_version: None` for Gemini models. `HKBUProvider._url()` automatically omits the query parameter for Gemini models.

---

## 3. Quick Diagnostic Playbook

Run these commands in your terminal to verify end-to-end operation:

### 1. Test Gateway Health
```bash
curl --noproxy '*' -i http://127.0.0.1:8000/healthz
```

### 2. Test Non-Streaming Chat Completion (Strict Token Cap)
```bash
curl --noproxy '*' -s http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_GATEWAY_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "1+1=?"}],
    "max_tokens": 10
  }' | jq .
```

### 3. Test Streaming SSE Completion (Strict Token Cap)
```bash
curl --noproxy '*' -N http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_GATEWAY_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "1+1=?"}],
    "max_tokens": 10,
    "stream": true
  }'
```
*Verify that the first chunk has `"content": ""` and the stream concludes with `finish_reason: "stop"` followed by `data: [DONE]`.*
