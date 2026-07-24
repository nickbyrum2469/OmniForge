@echo off
setlocal
set "OMNIFORGE_DATA_ROOT=%APPDATA%\OmniForge"
node "%~dp0mcp-server.mjs"
