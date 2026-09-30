# HKBU Qwen live verification — 2026-09-30

Endpoint: `https://genai.hkbu.edu.hk/api/v0/rest/openai/deployments/{model}/chat/completions?api-version=v1`.
Models: `qwen-plus`, `qwen3-max`. Authentication: `api-key`.
Credentials were decrypted from the local credential store in memory, never printed or included in evidence. The database was opened read-only. All test messages were synthetic, with one small tool definition in the tool-prompt comparisons; no original Copilot request was available.

Exact synthetic messages, returned content, status, and available usage are in [qwen-live-probes.json](qwen-live-probes.json). Successful role tests used `temperature: 0` and requested at most 8 output tokens. Other recall tests requested 8 or 16, decimal tests 32, and short streaming history tests 64. These requested limits are not reliable upstream bounds (see below).

| Probe | Qwen Plus | Qwen3-Max | Observed implication |
| --- | --- | --- | --- |
| Single system, marker ALPHA | 200; ALPHA; 24 prompt tokens | Same | Baseline instruction accepted |
| Two system messages, separate ALPHA and BETA instructions | 200; ALPHA BETA; 31 prompt tokens | Same | Multiple system messages accepted and both instructions used in this probe |
| Developer alone | 400 | 400 | School validator rejects developer |
| System plus developer | 400 | 400 | Adding system does not make developer acceptable |
| User remembers ORCHID, assistant acknowledges, final user asks recall | 200; None; 23 prompt tokens | 200; says no marker was supplied; 23 prompt tokens | Prior dialogue did not reach/usefully inform the response |
| Two user messages with the same recall setup, no assistant | 200; None; 23 prompt tokens | 200; says no marker was supplied; 23 prompt tokens | Removing assistant does not fix history loss |
| Only the last recall question | 200; None; 23 prompt tokens | 200; says no marker was supplied; 23 prompt tokens | Identical input count to both full-history probes |
| History embedded in final user content | 200; ORCHID; 47 prompt tokens | Same | Supplying history inside the retained user message restores recall |
| Actual repaired gateway `upstream_payload` encoding | 200; ORCHID; 83 prompt tokens | Same | Implemented workaround restores recall on both deployments |
| Single-turn decimal comparison | 200; incorrectly answers 9.11 | Same | Model arithmetic quality is a separate issue |
| Decimal history followed by “你确定？” without tools | 200; generic confirmation asks for context; 11 prompt tokens | Same pattern; 11 prompt tokens | Latest short question lacks its historical context |
| Synthetic Copilot history with separate versus merged systems and one tool schema, streaming | Both 200; generic confirmation | Both 200; generic confirmation | Merging did not restore the history; original name-only failure was not reproduced |

The developer rejection explicitly listed allowed roles: `system, user, assistant, tool, function`.
The history results strongly support a school-side request adaptation problem behaving as if only the final user turn is retained. They do not reveal the university's implementation. A full original Copilot request would still be needed to isolate the exact name-only response trigger.

## Resulting implementation

Multiple system messages remain separate. Only the two verified Qwen deployments map developer to system and encode historical conversation in the final user content. Historical user/assistant/tool roles and IDs remain explicit in JSON. Tool definitions still use the gateway emulation layer; other deployments do not receive the history workaround. Single-turn Qwen requests add no transcript overhead.

This is a workaround rather than exact native conversation semantics: the model reads historical roles as text, and moving system instructions ahead of the encoded dialogue cannot preserve their original interleaved timing. The upstream cannot represent developer priority because it rejects that role.

## Usage and cache limits

28 requests reached the school API: one connectivity probe, 26 unique probe cases across the two models, and one additional streaming request repeated after the test parser failed to recognize SSE without a Content-Type header. Four requests returned validation errors. No long cache-prefix experiments or repeated large tool catalogs were used.

Responses containing usage reported **820 total tokens**, including 12 from the connectivity probe. This is a partial total: five streaming responses returned no usage, and validation errors returned no token accounting. The probe JSON sum is 808 because the initial connectivity probe is recorded here instead. These are API-reported figures, not a verified billing statement.

Non-streaming usage returned only `prompt_tokens`, `completion_tokens`, and `total_tokens`; no cache-hit fields were available. No claim about cache activation, hit rate, or cache correctness can be made from these responses.

One non-streaming Qwen Plus request asked for `max_tokens: 32` but returned 113 completion tokens with `finish_reason: stop`. Therefore this parameter must not be treated as a reliable quota cap for the tested school interface. After observing this, further live requests were limited to fixed-marker answers; no additional open-ended tests were run.
