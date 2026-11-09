@echo off
chcp 65001 >nul
title iBangKF 爱邦客客服系统服务端

echo =========================================================
echo       iBangKF 爱邦客在线客服服务端 (Node.js)
echo =========================================================
echo.

cd /d "%~dp0server"
if not exist node_modules (
    echo [提示] 正在安装服务端依赖...
    call npm install
)

echo [启动] 正在启动客服系统后端服务...
node index.js
pause
