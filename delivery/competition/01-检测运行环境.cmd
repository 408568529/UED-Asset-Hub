@echo off
setlocal
powershell.exe -NoLogo -NoProfile -STA -File "%~dp0tools\competition-launch.ps1" -Action Check
set "UED_RESULT=%ERRORLEVEL%"
pause
exit /b %UED_RESULT%
