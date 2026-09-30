# HKBU GenAI Gateway

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-HK.md)

香港浸会大学（**HKBU GenAI Platform**）的 OpenAI 兼容自服务网关与开发者门户。

学生与科研人员可一键将大学平台 API Key 转换为标准的 OpenAI `Bearer` 凭据，直接在内置的 Web Playground 测试模型，并无缝接入各类桌面客户端、代码助手与自定义工作流。

---

## ✨ 核心特性

- **🔑 1 键密钥转换**：校验浸会大学平台 Key，生成与任何 OpenAI SDK 或第三方客户端兼容的标准 `Bearer` Token。
- **🛠️ 全模型通用工具调用 (Function Calling)**：
  - 流式（SSE）与非流式全模式支持标准 OpenAI `tools: [...]` 与 `tool_calls`。
  - Azure GPT、Google Gemini 与 DeepSeek 原生直通。
  - 针对阿里通义千问（`qwen3-max`、`qwen-plus`）与谷歌 Vertex AI Llama（`llama-4-maverick`）内置**基于提示词的工具模拟适配器**（`tools.py`），无缝将客户端工具 Schema 与未解析的上游回复转换为标准 OpenAI `tool_calls`。
- **🔍 通用模型发现与规格元数据**：
  - 提供 `/v1/models`、`/models`、`/v1/model`、`/model`、兼容 OpenRouter 的 `/api/v1/models` 以及兼容 LiteLLM 的 `/v1/model/info`。
  - 遵循 [models.dev](https://models.dev) 与腾讯工蜂（WorkBuddy）规格的模型能力完整元数据（`supportsToolCall`、`supportsReasoning`、`supportsVision`、`contextWindow`、`maxTokens`、`tool_call`、`reasoning`、`attachment`、`limit`、`capabilities`）。
- **💬 交互式 Web Playground**：
  - 在浏览器中通过实时 SSE 流式测试大学支持的任何模型。
  - **🧠 DeepSeek 与多标签思维链手风琴**：支持折叠展开思考过程，兼容 `delta.reasoning_content` 及 `<think>`、`<thought>`、`<thinking>`、`<reasoning>` 等标签。
  - **📝 富文本 Markdown 渲染**：支持 GitHub 风格 Markdown，包含表格、引用及带一键复制代码块的高亮代码。
  - **⚡ 消息操作**：复制消息、编辑用户提问并分支重新生成、重试助手回复。
  - **📂 多会话聊天历史**：保存在 `localStorage` 中的本地多会话管理，支持新建与快速切换会话。
- **🚀 零配置启动**：若未配置 `HKBU_GATEWAY_ENCRYPTION_KEY`，系统将自动生成 Fernet 密钥文件（`hkbu_gateway.key`）并持久化到数据库同级目录。完美开箱即用，支持 `railway up` 与无头部署。
- **🛠️ 客户端工具预设**：提供一键复制配置，即刻接入 **腾讯工蜂 (WorkBuddy)**、Cursor、VS Code / Cline、Dify、Open WebUI、LibreChat、Chatbox、NextChat、Cherry Studio 及 Python。
- **🛡️ 静态存储加密**：上游大学 API Key 在写入 SQLite 前经 Fernet 加密存储；上游原始 Key 永不向 `/v1/*` 客户端暴露。
- **🌐 动态 Base URL**：自动适配部署域名（例如 `https://byok.aitutor.ink/v1` 或 `/hkbuapi4agent.html`），不硬编码 `localhost`。

---

## 🚀 快速开始

### ⚡ 1. 零门槛一键启动

仓库内置了跨平台全自动脚本，会自动创建虚拟环境、安装依赖、启动服务并自动弹开浏览器：

- **🍎 macOS / 🐧 Linux**：
  ```bash
  git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
  cd HKBU-GenAI-Gateway
  ./start.sh
  ```
  *(Mac 用户亦可在访达 Finder 中直接双击 `start.command` 启动)*

- **🪟 Windows**：
  ```cmd
  git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
  cd HKBU-GenAI-Gateway
  start.bat
  ```
  *(或在文件资源管理器中直接双击 `start.bat`)*

- **🐳 Docker**：
  ```bash
  git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
  cd HKBU-GenAI-Gateway
  docker compose up -d
  ```

启动成功后，浏览器访问 `http://localhost:8000/`（或 `http://localhost:8000/hkbuapi4agent.html`）即可进入开发者门户与 Playground。

---

### 🛠️ 2. 开发者本地调试模式

需要 Python 3.9+ 及 pip 或 uv：

```bash
# 克隆仓库
git clone https://github.com/AndyZHENG0715/HKBU-GenAI-Gateway.git
cd HKBU-GenAI-Gateway

# 创建虚拟环境并安装依赖
python3 -m venv .venv
source .venv/bin/activate   # Windows 用户: .venv\Scripts\activate

# 可编辑模式安装
pip install -e ".[dev]"

# 启动网关服务（带热重载）
uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port 8000 --reload
```

---

### ☁️ 3. 云端与服务器部署 (Railway, Render, VPS)

仓库包含根目录 `Procfile`、`Dockerfile`、`docker-compose.yml` 及 `requirements.txt`：

- **Railway**：连接 GitHub 仓库或直接运行 `railway up`，无需额外环境变量配置即可自动完成数据库与密钥初始化。
- **Docker Compose**：执行 `docker compose up -d`，数据库与密钥文件自动持久化于挂载的 `./data` 目录。
- **常规 Linux VPS**：
  ```bash
  pip install -r requirements.txt
  PYTHONPATH=src uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port ${PORT:-8000}
  ```

---

## 💻 使用 Python OpenAI SDK 调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="<你的网关生成的密钥>",
    base_url="http://localhost:8000/v1",  # 或线上地址如 https://byok.aitutor.ink/v1
)

response = client.chat.completions.create(
    model="gpt-4.1",  # 或 deepseek-v4-flash, gemini-2.5-flash 等
    messages=[
        {"role": "user", "content": "用一句话解释什么是量子计算。"}
    ],
)
print(response.choices[0].message.content)
```

---

## ⚙️ 配置项 (环境变量)

| 环境变量 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `HKBU_DATABASE_PATH` | SQLite 数据库文件存放路径 | `hkbu_gateway.db` |
| `HKBU_GATEWAY_ENCRYPTION_KEY` | 用于凭据加密的 32 字节 Fernet 密钥 | 自动生成至 `hkbu_gateway.key` |
| `HKBU_UPSTREAM_BASE_URL` | 香港浸会大学 GenAI 接口上游地址 | `https://genai.hkbu.edu.hk/api/v0/rest` |
| `HKBU_UPSTREAM_AUTH_HEADER` / `HKBU_API_KEY_HEADER` | 上游接口预期的 Header 鉴权字段名 | `api-key` |
| `HKBU_UPSTREAM_PATH_STYLE` | 上游路由分发策略 (`direct` 或 `model_param`) | `direct` |

---

## 🎨 前端开发

前端为基于 **React 19**、**TypeScript**、**Tailwind CSS** 与 **Vite** 构建的现代单页应用（SPA），源码位于 [`frontend/`](frontend/)。

```bash
cd frontend

# 安装依赖
npm install

# 启动本地开发热更新服务器
npm run dev

# 编译生产资源至 static/
npm run build
```

生产环境构建产物会自动输出至 `static/` 目录并采用相对路径引用（`base: './'`），同时镜像输出至 `static/hkbuapi4agent.html`。

---

## 🧪 自动化测试

使用 pytest 运行自动化单元测试：

```bash
pytest
```

---

## 📄 版本与提交规范

本项目遵循 [语义化版本规范 (SemVer)](https://semver.org/lang/zh-CN/) 及 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/):

- `feat(...)`: 新功能
- `fix(...)`: 缺陷修复
- `docs(...)`: 文档更新
- `refactor(...)`: 重构（不改变外部行为）

详见 [CONTRIBUTING.md](CONTRIBUTING.md) 及 [CHANGELOG.md](CHANGELOG.md)。
