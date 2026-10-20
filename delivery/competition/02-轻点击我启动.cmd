@echo off
setlocal
set "NODE_OPTIONS="
set "NODE_PATH="
set "NODE_COMPILE_CACHE="
"%~dp0tools\node\node.exe" "%~dp0tools\competition-center.mjs" Open "%~dp0"
set "UED_RESULT=%ERRORLEVEL%"
if not "%UED_RESULT%"=="0" pause
exit /b %UED_RESULT%
