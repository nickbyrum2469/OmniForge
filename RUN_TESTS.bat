@echo off
setlocal
cd /d "%~dp0"
node scripts\verify.mjs
if errorlevel 1 (
  echo Verification failed.
  pause
  exit /b 1
)
echo Verification passed.
pause
