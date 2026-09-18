# HKBU GenAI Gateway

An OpenAI-compatible self-service gateway and developer portal for the **HKBU GenAI Platform**. 

Students and researchers can convert their university platform key into standard OpenAI credentials in 1 click, test models directly in a built-in web playground, and connect to desktop clients, coding agents, and custom workflows.

---

## ✨ Features

- **🔑 1-Click Key Conversion**: Validate student HKBU Platform keys and generate standard `Bearer` tokens compatible with any OpenAI SDK or client application.
- **🛠️ Universal Tool Calling (Function Calling)**:
  - Full OpenAI `tools: [...]` and `tool_calls` support for **all models** in both streaming and non-streaming modes.
  - Native passthrough for Azure GPT, Google Gemini, and DeepSeek.
  - Automatic **Prompt-Based Tool Emulation Adapter** (`tools.py`) for Alibaba Cloud Qwen (`qwen3-max`, `qwen-plus`) and Google Vertex AI Llama (`llama-4-maverick`), seamlessly converting client tool schemas and unparsed upstream responses into standard OpenAI `tool_calls`.
- **🔍 Universal Model Discovery & Capabilities**:
  - Exposes `/v1/models`, `/models`, `/v1/model`, `/model`, OpenRouter-compatible `/api/v1/models`, and LiteLLM-compatible `/v1/model/info`.
  - Comprehensive model capabilities metadata following [models.dev](https://models.dev) and Tencent WorkBuddy schemas (`supportsToolCall`, `supportsReasoning`, `supportsVision`, `contextWindow`, `maxTokens`, `tool_call`, `reasoning`, `attachment`, `limit`, `capabilities`).
- **💬 Interactive Web Playground**:
  - Test any university model directly in the browser with real-time SSE streaming.
  - **🧠 DeepSeek & Multi-Tag Reasoning Accordion**: Collapsible thought process container supporting both `delta.reasoning_content` deltas and `<think>`, `<thought>`, `<thinking>`, `<reasoning>` tags.
  - **📝 Rich Markdown Rendering**: Full GitHub Flavored Markdown support with tables, blockquotes, and syntax-highlighted code blocks with 1-click copy.
  - **⚡ Message Actions**: Copy message text, edit user prompts with branch regeneration, and retry assistant responses.
  - **📂 Multi-Turn Chat History**: Persistent conversation sessions stored in `localStorage` with "+ New Conversation" and session switching.
- **🚀 Zero-Configuration Startup**: If `HKBU_GATEWAY_ENCRYPTION_KEY` is not set, a Fernet key (`hkbu_gateway.key`) is automatically generated and persisted next to the database. Compatible out-of-the-box with `railway up` and headless deployments.
- **🛠️ Client Tool Presets**: Ready-to-copy configurations for **Tencent WorkBuddy**, Cursor, VS Code / Cline, Dify, Open WebUI, LibreChat, Chatbox, NextChat, Cherry Studio, and Python.
- **🛡️ Secure at Rest**: Upstream university keys are encrypted with Fernet before SQLite persistence; the upstream key is never exposed to `/v1/*` clients.
- **🌐 Dynamic Base URL**: Automatically adapts to deployment origin (e.g. `https://byok.aitutor.ink/v1` or `/hkbuapi4agent.html`), never hardcoding `localhost`.

---

## 🚀 Quick Start

Requires Python 3.11+ and uv or pip.

### 1. Install & Run Locally

```bash
# Clone the repository
git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
cd HKBU-GenAI-Gateway

# Create virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"

# Start the gateway server (zero-config, key auto-generated)
uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port 8000 --reload
```

Open `http://localhost:8000/` (or `http://localhost:8000/hkbuapi4agent.html`) in your browser to access the developer portal and playground.

### 2. Cloud Deployment (Railway, Render, Docker)

The repository includes a root `Procfile` and `requirements.txt` for 1-click zero-config cloud deployments:

- **Railway**: Connect your GitHub repository or run `railway up`. No mandatory environment variables are needed; encryption keys and the SQLite database will be initialized automatically.
- **Docker / Custom Hosts**:
  ```bash
  pip install -r requirements.txt
  PYTHONPATH=src uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port ${PORT:-8000}
  ```

---

## 💻 Using with Python OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-generated-gateway-key>",
    base_url="http://localhost:8000/v1",  # Or https://byok.aitutor.ink/v1
)

response = client.chat.completions.create(
    model="gpt-4.1",  # Or deepseek-v4-flash, gemini-2.5-flash, etc.
    messages=[
        {"role": "user", "content": "Explain quantum computing in one sentence."}
    ],
)
print(response.choices[0].message.content)
```

---

## ⚙️ Configuration

| Environment Variable | Description | Default |
| :--- | :--- | :--- |
| `HKBU_DATABASE_PATH` | Path to SQLite database file | `hkbu_gateway.db` |
| `HKBU_GATEWAY_ENCRYPTION_KEY` | 32-byte Fernet key for key encryption | Auto-generated into `hkbu_gateway.key` |
| `HKBU_UPSTREAM_BASE_URL` | Upstream HKBU GenAI endpoint | `https://genai.hkbu.edu.hk/api/v0/rest` |
| `HKBU_UPSTREAM_AUTH_HEADER` / `HKBU_API_KEY_HEADER` | Header name expected by upstream HKBU | `api-key` |
| `HKBU_UPSTREAM_PATH_STYLE` | Upstream routing style (`direct` or `model_param`) | `direct` |

---

## 🎨 Frontend Development

The frontend is a modern SPA built with **React 19**, **TypeScript**, **Tailwind CSS**, and **Vite** located in [`frontend/`](frontend/).

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Build production bundle into static/
npm run build
```

The production build automatically outputs to `static/` with relative asset links (`base: './'`) and mirrors to `static/hkbuapi4agent.html`.

---

## 🧪 Testing

Run automated tests with pytest:

```bash
pytest
```

---

## 📄 Versioning & Commits

This project strictly follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(...)`: New features
- `fix(...)`: Bug fixes
- `docs(...)`: Documentation changes
- `refactor(...)`: Code refactoring without behavior change

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).
