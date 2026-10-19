@echo off
setlocal
powershell.exe -NoLogo -NoProfile -STA -File "%~dp0tools\competition-launch.ps1" -Action Start
if errorlevel 1 (
  echo UED Asset Hub did not complete the requested operation.
  pause
  exit /b 1
)
endlocal
