@echo off
chcp 65001 > nul
title Wells-Riley Influenza Local Server Launcher

echo ======================================================================
echo   KHOI DONG HE THONG DU BAO NGUY CO CUM (WELLS-RILEY MODEL)
echo ======================================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay Python. Vui long cai dat Python 3.10+ truoc khi chay!
    pause
    exit /b 1
)

echo [1/3] Kiem tra cac thu vien Backend...
cd /d "%~dp0backend"
pip install -r requirements.txt --quiet

echo [2/3] Khoi dong Backend (FastAPI :8000) va Frontend (:5500)...
cd /d "%~dp0"
python start_all.py

pause
