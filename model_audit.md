# HKBU GenAI Gateway - Model Audit Matrix

Audit completed: 2026-09-30 19:34:49

**Overall Result:** 15 / 15 Models Fully Operational

| Model ID | Kind | Status | Basic Streaming (temp=0.1) | Agent Multi-Turn & Tools |
| :--- | :--- | :--- | :--- | :--- |
| `gpt-5` | Chat | **PASS** | OK (2.2s, 13 chunks) | OK (7.3s, natural text, 59 chunks) |
| `gpt-5-mini` | Chat | **PASS** | OK (2.85s, 36 chunks) | OK (5.6s, natural text, 84 chunks) |
| `gpt-4.1` | Chat | **PASS** | OK (1.93s, 13 chunks) | OK (1.76s, with tool_calls, 17 chunks) |
| `gpt-4.1-mini` | Chat | **PASS** | OK (1.36s, 13 chunks) | OK (1.46s, with tool_calls, 17 chunks) |
| `o1` | Chat | **PASS** | OK (2.57s, 14 chunks) | OK (6.07s, with tool_calls, 17 chunks) |
| `o3-mini` | Chat | **PASS** | OK (3.17s, 13 chunks) | OK (5.44s, with tool_calls, 25 chunks) |
| `deepSeek-V4-Pro-hkbu` | Chat | **PASS** | OK (3.72s, 34 chunks) | OK (6.1s, with tool_calls, 131 chunks) |
| `deepseek-v4-flash` | Chat | **PASS** | OK (2.33s, 86 chunks) | OK (2.99s, natural text, 78 chunks) |
| `gemini-2.5-pro` | Chat | **PASS** | OK (14.97s, 4 chunks) | OK (9.73s, natural text, 2 chunks) |
| `gemini-2.5-flash` | Chat | **PASS** | OK (1.93s, 3 chunks) | OK (2.38s, natural text, 3 chunks) |
| `qwen3-max` | Chat | **PASS** | OK (1.13s, 6 chunks) | OK (1.89s, with tool_calls, 4 chunks) |
| `qwen-plus` | Chat | **PASS** | OK (0.96s, 6 chunks) | OK (1.54s, with tool_calls, 4 chunks) |
| `llama-4-maverick` | Chat | **PASS** | OK (1.87s, 4 chunks) | OK (2.11s, with tool_calls, 4 chunks) |
| `text-embedding-3-large` | Embedding | **PASS** | OK (1.62s, dim=3072) | N/A |
| `text-embedding-3-small` | Embedding | **PASS** | OK (1.37s, dim=1536) | N/A |
