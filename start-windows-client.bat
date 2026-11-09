@echo off
cd /d "%~dp0"
title AIkefu AIkefu 客服桌面客户端
echo [正在启动 Windows 客服桌面客户端]...
set "EDGE_PATH="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if "%EDGE_PATH%"=="" if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if "%EDGE_PATH%"=="" if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if "%EDGE_PATH%"=="" (
    start http://127.0.0.1:8080/agent/index.html
) else (
    start "" "%EDGE_PATH%" --app="http://127.0.0.1:8080/agent/index.html" --window-size=1240,820 --user-data-dir="%LOCALAPPDATA%\AIkefu_Client"
)