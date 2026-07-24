@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)
where codex >nul 2>nul
if errorlevel 1 (
  echo Codex CLI was not found on PATH.
  echo Install or open Codex, then run this file again.
  pause
  exit /b 1
)
codex mcp remove omniforge >nul 2>nul
codex mcp remove omniforge-engine >nul 2>nul
codex mcp add omniforge -- "%~dp0bridge\run-mcp.bat"
if errorlevel 1 (
  echo Codex MCP registration failed.
  pause
  exit /b 1
)
echo.
echo OmniForge MCP tools were registered as: omniforge
echo They use the same %%APPDATA%%\OmniForge project state as the desktop editor.
echo Restart Codex, open this source folder, and ask Codex to read AGENTS.md.
pause
