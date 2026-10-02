#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "===================================================="
echo "  HKBU GenAI Gateway - Local Node Companion"
echo "===================================================="
echo ""
echo "Checking for Python environment..."

if command -v python3 &>/dev/null; then
    echo "[OK] Python 3 detected. Starting companion daemon..."
    python3 hkbu_genai_companion.py
elif command -v python &>/dev/null; then
    echo "[OK] Python detected. Starting companion daemon..."
    python hkbu_genai_companion.py
else
    echo ""
    echo "[!] Python was not detected on your system."
    echo ""
    echo "Note: If you only need Python data analysis, charts, or file editing,"
    echo "you DO NOT need this companion! The HKBU Playground has built-in"
    echo "WebAssembly Python and local folder support in your browser."
    echo ""
    echo "For host command execution, please install Python from https://www.python.org/"
    echo ""
    read -p "Press Enter to exit..."
fi
