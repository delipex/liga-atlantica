@echo off
title Servidor Local

node -v >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js global encontrado!
    node server.js
    goto fim
)

if exist "C:\Program Files\nodejs\node.exe" (
    echo [OK] Node.js encontrado em Program Files!
    "C:\Program Files\nodejs\node.exe" server.js
    goto fim
)

if exist "C:\Program Files (x86)\nodejs\node.exe" (
    echo [OK] Node.js encontrado em Program Files (x86)!
    "C:\Program Files (x86)\nodejs\node.exe" server.js
    goto fim
)

if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    echo [OK] Node.js encontrado em AppData!
    "%LocalAppData%\Programs\nodejs\node.exe" server.js
    goto fim
)

echo.
echo [ERRO] O Node.js nao foi encontrado no seu computador!
echo Por favor, instale o Node.js em: https://nodejs.org/
echo.
pause
exit

:fim
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu um problema ao iniciar o servidor.
    echo Verifique se a porta 8000 ja esta sendo usada por outro aplicativo.
    echo.
    pause
)
