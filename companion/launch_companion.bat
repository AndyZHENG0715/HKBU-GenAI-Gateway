@echo off
chcp 65001 >nul
title HKBU GenAI Gateway - Local Node Companion
echo ====================================================
echo   HKBU GenAI Gateway - Local Node Companion
echo ====================================================
echo.
echo Checking for Python environment...

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python detected. Starting companion daemon...
    python hkbu_genai_companion.py
    goto :end
)

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python Launcher detected. Starting companion daemon...
    py -3 hkbu_genai_companion.py
    goto :end
)

where python3 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python 3 detected. Starting companion daemon...
    python3 hkbu_genai_companion.py
    goto :end
)

echo.
echo [!] Python was not detected on your system.
echo.
echo Note: If you only need Python data analysis, charts, or file editing,
echo you DO NOT need this companion! The HKBU Playground has built-in
echo WebAssembly Python and local folder support in your browser.
echo.
echo For host command execution, please install Python from:
echo https://www.python.org/ or the Microsoft Store.
echo.
pause
:end
