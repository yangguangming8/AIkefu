@echo off
chcp 65001 >nul
title iBangKF 爱邦客客服系统 - 一键启动

echo =========================================================
echo    iBangKF 爱邦客全套客服系统 (服务端 + Windows客户端 + 访客端)
echo =========================================================
echo.

echo 1. 正在后台启动服务端 (端口: 8080)...
start "iBangKF Server" cmd /k "cd /d "%~dp0server" && node index.js"

echo 2. 等待服务端启动就绪...
timeout /t 2 /nobreak >nul

echo 3. 正在启动 Windows 客服坐席独立桌面客户端...
call "%~dp0start-windows-client.bat"

echo 4. 正在打开访客端测试页面 (模拟真实客户进入网站)...
start http://127.0.0.1:8080/demo.html

echo.
echo =========================================================
echo 启动完毕！
echo - 服务端地址: http://127.0.0.1:8080
echo - Windows客服端: 已自动弹出独立桌面窗口
echo - 访客端模拟页面: http://127.0.0.1:8080/demo.html
echo - 默认客服测试工号: 1001 (密码 123456)
echo =========================================================
