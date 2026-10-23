@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)
echo 启动映词后，在浏览器打开终端显示的地址。
echo 默认地址：http://127.0.0.1:4328
call npm.cmd start
pause
