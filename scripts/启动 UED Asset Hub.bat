@echo off
setlocal
chcp 65001 >nul
title UED Asset Hub

set "PROJECT_DIR=D:\UED-Asset-Hub-Host\UED-Asset-Hub"
set "PORT=3027"

if not exist "%PROJECT_DIR%\package.json" (
  echo [错误] 找不到项目目录：%PROJECT_DIR%
  echo 请确认项目已部署在该目录，或编辑此脚本中的 PROJECT_DIR。
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

if not exist "node_modules" (
  echo [错误] 未找到 node_modules，请先在项目目录执行 npm install。
  pause
  exit /b 1
)

if not exist ".next\BUILD_ID" (
  echo [提示] 未找到生产构建，正在执行 npm run build...
  call npm run build
  if errorlevel 1 (
    echo [错误] 构建失败，服务未启动。
    pause
    exit /b 1
  )
)

echo.
echo UED Asset Hub 正在启动...
echo 局域网访问地址：http://主机IP:%PORT%
echo 按 Ctrl+C 可停止服务。
echo.
call npm run start -- -H 0.0.0.0 -p %PORT%

echo.
echo 服务已停止。
pause
