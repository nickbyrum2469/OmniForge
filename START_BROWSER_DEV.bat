@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist logs mkdir logs
start "OmniForge Engine Server" /min cmd /c "node server\server.mjs 1>logs\engine.log 2>&1"
timeout /t 2 /nobreak >nul
start "OmniForge 3D Engine" http://127.0.0.1:4177
echo OmniForge is opening in your browser.
echo Server log: %~dp0logs\engine.log
exit /b 0
