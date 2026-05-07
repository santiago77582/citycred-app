@echo off
chcp 65001 >nul
title CityCred Pro - Inicio Automatico
echo.
echo  ============================================
echo   CityCred Pro - Cerebro Vendedor con OpenAI
echo  ============================================
echo.

cd /d "%~dp0"

REM Verificar Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo  [1/4] Python no encontrado. Instalando...
    curl -s -o python-installer.exe https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
    python-installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
    del python-installer.exe
    echo  Python instalado.
) else (
    echo  [1/4] Python OK.
)

REM Crear venv si no existe
if not exist "venv\Scripts\python.exe" (
    echo  [2/4] Creando entorno virtual...
    python -m venv venv
) else (
    echo  [2/4] Entorno virtual OK.
)

REM Instalar dependencias
echo  [3/4] Instalando dependencias...
venv\Scripts\pip.exe install flask flask-cors openai python-docx openpyxl --quiet 2>nul

REM Crear carpetas data si no existen
if not exist "data" mkdir data
if not exist "data\uploads" mkdir data\uploads

REM Iniciar backend
echo  [4/4] Iniciando CityCred...
echo.
echo  ============================================
echo   LISTO! Tu simulador se va a abrir solo.
echo.
echo   PASOS para activar OpenAI:
echo   1) En el simulador busca "Cerebro vendedor"
echo   2) Pega tu API key de OpenAI
echo   3) Clic "Conectar OpenAI"
echo   4) Marca "Usar OpenAI"
echo.
echo   Para cerrar: cerrá esta ventana.
echo  ============================================
echo.

start "" "http://127.0.0.1:8000"
venv\Scripts\python.exe backend\app.py
pause
