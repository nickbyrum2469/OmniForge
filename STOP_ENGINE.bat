@echo off
setlocal
REM Stop the packaged desktop application and all child runtime processes.
taskkill /IM OmniForge.exe /T /F >nul 2>nul
REM Also stop the separate browser-development server if it is running on 4177.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4177" ^| findstr "LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
echo OmniForge processes have been stopped.
timeout /t 1 /nobreak >nul
