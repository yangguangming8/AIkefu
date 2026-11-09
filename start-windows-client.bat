@echo off
chcp 65001 >nul
title iBangKF 爱邦客客服桌面客户端

echo =========================================================
echo    iBangKF 爱邦客客服坐席端 (Windows 原生独立桌面窗口)
echo =========================================================
echo.

set EDGE_PATH=
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
)

if "%EDGE_PATH%"=="" (
    echo [提示] 未找到 Edge 浏览器路径，正在使用默认浏览器打开客服工作台...
    start http://127.0.0.1:8080/agent/index.html
) else (
    echo [启动] 正在以原生桌面应用模式启动客服坐席工作台...
    start "" "%EDGE_PATH%" --app="http://127.0.0.1:8080/agent/index.html" --window-size=1240,820 --user-data-dir="%LOCALAPPDATA%\iBangKF_Client"
)

echo.
echo 客服工作台已就绪！
