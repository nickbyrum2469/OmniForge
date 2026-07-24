@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUILD_DESKTOP_WINDOWS.ps1"
if errorlevel 1 (
  echo.
  echo Desktop build failed. See the error above.
  pause
  exit /b 1
)
echo.
echo OmniForge desktop build is ready.
pause
