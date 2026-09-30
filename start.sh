#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "🚀 Starting HKBU GenAI Gateway..."

# 1. Check or prepare Python environment
if [ ! -d ".venv" ]; then
  echo "📦 Initializing virtual environment..."
  if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; exit(0 if sys.version_info >= (3, 9) else 1)" 2>/dev/null; then
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip -q
    pip install -r requirements.txt -q
  else
    echo "⚡ System python3 not found or <3.9, using uv for standalone Python..."
    if ! command -v uv >/dev/null 2>&1; then
      curl -LsSf https://astral.sh/uv/install.sh | sh
      source "$HOME/.local/bin/env" 2>/dev/null || export PATH="$HOME/.local/bin:$PATH"
    fi
    uv venv --python 3.12 .venv
    source .venv/bin/activate
    uv pip install -r requirements.txt
  fi
else
  source .venv/bin/activate
fi

# 2. Open browser automatically in background
(
  sleep 1.5
  if command -v open >/dev/null 2>&1; then
    open http://localhost:8000
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:8000 >/dev/null 2>&1 || true
  fi
) &

# 3. Launch gateway server
echo "✨ Gateway running at http://localhost:8000 (Press Ctrl+C to stop)"
PYTHONPATH=src uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port 8000 --reload
