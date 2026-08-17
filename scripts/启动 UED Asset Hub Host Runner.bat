@echo off
setlocal
chcp 65001 >nul
title UED Asset Hub Host Runner

set "PROJECT_DIR=%~dp0.."
cd /d "%PROJECT_DIR%"

if not exist "package.json" (
  echo [错误] 找不到 package.json：%PROJECT_DIR%
  pause
  exit /b 1
)

echo.
echo UED Asset Hub Host Runner 正在启动...
echo 它会自动管理 DSH、Agent Proxy 与 Asset Hub。
echo 按 Ctrl+C 将统一停止三个服务。
echo.
call npm run start:host
