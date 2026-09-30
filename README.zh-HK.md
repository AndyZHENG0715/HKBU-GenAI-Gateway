# HKBU GenAI Gateway

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-HK.md)

專為香港浸會大學（**HKBU GenAI Platform**）打造的 OpenAI 相容自服務網關與開發者平台。

同學與研究人員可一鍵將大學平台 API Key 轉換為標準的 OpenAI `Bearer` 憑證，直接在內置的 Web Playground 測試模型，並無縫接入各類桌面客戶端、程式碼助手及自訂工作流。

---

## ✨ 核心特色

- **🔑 1 鍵金鑰轉換**：驗證浸會大學平台 Key，生成與任何 OpenAI SDK 或第三方客戶端相容的標準 `Bearer` Token。
- **🛠️ 全模型通用工具調用 (Function Calling)**：
  - 串流（SSE）與非串流全模式支援標準 OpenAI `tools: [...]` 與 `tool_calls`。
  - Azure GPT、Google Gemini 與 DeepSeek 原生直通。
  - 針對阿里通義千問（`qwen3-max`、`qwen-plus`）與 Google Vertex AI Llama（`llama-4-maverick`）內建**基於提示詞的工具模擬適配器**（`tools.py`），無縫將客戶端工具 Schema 與未解析的上游回覆轉換為標準 OpenAI `tool_calls`。
- **🔍 通用模型探索與規格元數據**：
  - 提供 `/v1/models`、`/models`、`/v1/model`、`/model`、相容 OpenRouter 的 `/api/v1/models` 以及相容 LiteLLM 的 `/v1/model/info`。
  - 遵循 [models.dev](https://models.dev) 與騰訊工蜂（WorkBuddy）規格的模型能力完整元數據（`supportsToolCall`、`supportsReasoning`、`supportsVision`、`contextWindow`、`maxTokens`、`tool_call`、`reasoning`、`attachment`、`limit`、`capabilities`）。
- **💬 互動式 Web Playground**：
  - 在瀏覽器中透過即時 SSE 串流測試大學支援的任何模型。
  - **🧠 DeepSeek 與多標籤思維鏈手風琴**：支援摺疊展開思考過程，相容 `delta.reasoning_content` 及 `<think>`、`<thought>`、`<thinking>`、`<reasoning>` 等標籤。
  - **📝 豐富 Markdown 渲染**：支援 GitHub 風格 Markdown，包含表格、引文及具一鍵複製按鈕的語法高亮程式碼區塊。
  - **⚡ 訊息操作**：複製訊息、編輯使用者提問並分支重新生成、重試助手回覆。
  - **📂 多對話聊天記錄**：儲存於 `localStorage` 的本地多對話管理，支援新建與快速切換對話。
- **🚀 零配置啟動**：若未設定 `HKBU_GATEWAY_ENCRYPTION_KEY`，系統將自動生成 Fernet 金鑰檔案（`hkbu_gateway.key`）並持久化儲存於資料庫同級目錄。完美開箱即用，支援 `railway up` 與無前端伺服器部署。
- **🛠️ 客戶端工具預設範本**：提供一鍵複製配置，即刻接入 **騰訊工蜂 (WorkBuddy)**、Cursor、VS Code / Cline、Dify、Open WebUI、LibreChat、Chatbox、NextChat、Cherry Studio 及 Python。
- **🛡️ 靜態儲存加密**：上游大學 API Key 在寫入 SQLite 前經 Fernet 加密儲存；上游原始 Key 絕不對外暴露給 `/v1/*` 客戶端。
- **🌐 動態 Base URL**：自動適配部署域名（例如 `https://byok.aitutor.ink/v1` 或 `/hkbuapi4agent.html`），不強制鎖定 `localhost`。

---

## 🚀 快速開始

### ⚡ 1. 零門檻一鍵啟動

倉庫內置了跨平台全自動腳本，會自動建立虛擬環境、安裝依賴套件、啟動服務並自動開啟瀏覽器：

- **🍎 macOS / 🐧 Linux**：
  ```bash
  git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
  cd HKBU-GenAI-Gateway
  ./start.sh
  ```
  *(Mac 使用者亦可在「訪達 Finder」中直接按兩下 `start.command` 啟動)*

- **🪟 Windows**：
  ```cmd
  git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
  cd HKBU-GenAI-Gateway
  start.bat
  ```
  *(或在檔案總管中直接按兩下 `start.bat`)*

- **🐳 Docker**：
  ```bash
  git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
  cd HKBU-GenAI-Gateway
  docker compose up -d
  ```

啟動成功後，瀏覽器前往 `http://localhost:8000/`（或 `http://localhost:8000/hkbuapi4agent.html`）即可進入開發者平台與 Playground。

---

### 🛠️ 2. 開發者本地除錯模式

需要 Python 3.9+ 及 pip 或 uv：

```bash
# 複製倉庫
git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
cd HKBU-GenAI-Gateway

# 建立虛擬環境並安裝依賴套件
python3 -m venv .venv
source .venv/bin/activate   # Windows 使用者: .venv\Scripts\activate

# 可編輯模式安裝
pip install -e ".[dev]"

# 啟動網關服務（支援熱重載）
uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port 8000 --reload
```

---

### ☁️ 3. 雲端與伺服器部署 (Railway, Render, VPS)

倉庫包含根目錄 `Procfile`、`Dockerfile`、`docker-compose.yml` 及 `requirements.txt`：

- **Railway**：連結 GitHub 倉庫或直接執行 `railway up`，無需額外環境變數即可自動完成資料庫與金鑰初始化。
- **Docker Compose**：執行 `docker compose up -d`，資料庫與金鑰檔案自動持久化儲存於掛載的 `./data` 目錄。
- **常規 Linux VPS**：
  ```bash
  pip install -r requirements.txt
  PYTHONPATH=src uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port ${PORT:-8000}
  ```

---

## 💻 使用 Python OpenAI SDK 呼叫

```python
from openai import OpenAI

client = OpenAI(
    api_key="<你的網關生成的密鑰>",
    base_url="http://localhost:8000/v1",  # 或線上地址如 https://byok.aitutor.ink/v1
)

response = client.chat.completions.create(
    model="gpt-4.1",  # 或 deepseek-v4-flash, gemini-2.5-flash 等
    messages=[
        {"role": "user", "content": "用一句話解釋何謂量子運算。"}
    ],
)
print(response.choices[0].message.content)
```

---

## ⚙️ 配置選項 (環境變數)

| 環境變數 | 說明 | 預設值 |
| :--- | :--- | :--- |
| `HKBU_DATABASE_PATH` | SQLite 資料庫檔案存放路徑 | `hkbu_gateway.db` |
| `HKBU_GATEWAY_ENCRYPTION_KEY` | 用於憑證加密的 32 位元組 Fernet 金鑰 | 自動生成至 `hkbu_gateway.key` |
| `HKBU_UPSTREAM_BASE_URL` | 香港浸會大學 GenAI 端點上游網址 | `https://genai.hkbu.edu.hk/api/v0/rest` |
| `HKBU_UPSTREAM_AUTH_HEADER` / `HKBU_API_KEY_HEADER` | 上游端點預期的 Header 驗證欄位名 | `api-key` |
| `HKBU_UPSTREAM_PATH_STYLE` | 上游路由分發策略 (`direct` 或 `model_param`) | `direct` |

---

## 🎨 前端開發

前端為基於 **React 19**、**TypeScript**、**Tailwind CSS** 與 **Vite** 構建的現代單頁應用（SPA），原始碼位於 [`frontend/`](frontend/)。

```bash
cd frontend

# 安裝依賴套件
npm install

# 啟動本地開發熱更新伺服器
npm run dev

# 編譯生產資源至 static/
npm run build
```

生產環境構建產物會自動輸出至 `static/` 目錄並採用相對路徑引用（`base: './'`），同時鏡像輸出至 `static/hkbuapi4agent.html`。

---

## 🧪 自動化測試

使用 pytest 執行自動化單元測試：

```bash
pytest
```

---

## 📄 版本與提交規範

本專案遵循 [語意化版本規範 (SemVer)](https://semver.org/lang/zh-TW/) 及 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/):

- `feat(...)`: 新功能
- `fix(...)`: 缺陷修復
- `docs(...)`: 文件更新
- `refactor(...)`: 重構（不改變對外行為）

詳見 [CONTRIBUTING.md](CONTRIBUTING.md) 及 [CHANGELOG.md](CHANGELOG.md)。
