@echo off
title Servidor Local - Liga Atlantica
cd /d "%~dp0"

echo Verificando dependencias locais...

node -v >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js global encontrado!
    node server.js
    goto fim
)

python --version >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js nao encontrado, mas Python encontrado!
    echo Iniciando servidor nativo do Python na porta 8000...
    python -m http.server 8000 -d ../site-teste
    goto fim
)

py --version >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js nao encontrado, mas executavel 'py' do Python encontrado!
    echo Iniciando servidor nativo do Python na porta 8000...
    py -m http.server 8000 -d ../site-teste
    goto fim
)

echo [Aviso] Node.js e Python nao instalados.
echo Iniciando servidor nativo via PowerShell (sem dependencias)...
powershell -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
goto fim

:fim
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu um problema ao iniciar o servidor.
    echo Verifique se a porta 8000 ja esta sendo usada por outro aplicativo.
    echo.
    pause
)
