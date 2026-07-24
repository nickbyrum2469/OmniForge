@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Import-OmniForgeSource.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo OmniForge source import failed with exit code %EXITCODE%.
) else (
  echo OmniForge source import finished successfully.
)
pause
exit /b %EXITCODE%
