@echo off
cd /d "%~dp0"
title AIkefu AIkefu 客服系统启动器
echo ========================================================
echo    AIkefu AIkefu 在线客服系统 - 正在启动
echo ========================================================
echo.
echo [1/3] 正在启动后台服务端 (端口: 8080)...
start "AIkefu_Server" /D "%~dp0server" cmd /k "node index.js"
echo.
echo [2/3] 等待服务就绪...
ping 127.0.0.1 -n 3 >nul
echo.
echo [3/3] 正在启动 Windows 客服坐席桌面端与访客端...
call "%~dp0start-windows-client.bat"
start "" "http://127.0.0.1:8080/demo.html"
echo.
echo ========================================================
echo 启动完成！
echo 服务端地址: http://127.0.0.1:8080
echo 客服账号: 1001 (密码: 123456)
echo 管理员账号: admin (密码: admin888)
echo ========================================================
timeout /t 3 >nul