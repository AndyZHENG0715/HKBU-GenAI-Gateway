@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
title HKBU GenAI Gateway

echo ====================================================
echo         HKBU GenAI Gateway - Starting Server
echo ====================================================

REM 1. Check or prepare virtual environment
if not exist ".venv" (
    echo [INFO] Creating Python virtual environment (.venv)...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Python not found. Please install Python 3.9+ from https://www.python.org/
        pause
        exit /b 1
    )
    call .venv\Scripts\activate.bat
    echo [INFO] Installing dependencies...
    python -m pip install --upgrade pip -q
    pip install -r requirements.txt -q
) else (
    call .venv\Scripts\activate.bat
)

REM 2. Open browser automatically
start http://localhost:8000

REM 3. Run server
echo [INFO] Gateway running at http://localhost:8000
set PYTHONPATH=src
python -m uvicorn hkbu_gateway.app:app --host 0.0.0.0 --port 8000 --reload

pause
