@echo off
setlocal
cd /d "%~dp0"
set "APP=%~dp0dist\OmniForge-win32-x64\OmniForge.exe"
set "VERSION_FILE=%~dp0dist\OmniForge-win32-x64\version"
set "EXPECTED_VERSION=OmniForge 0.11.0"
set "NEEDS_BUILD=0"

if not exist "%APP%" set "NEEDS_BUILD=1"
if not exist "%VERSION_FILE%" set "NEEDS_BUILD=1"
if "%NEEDS_BUILD%"=="0" (
  findstr /b /l /c:"%EXPECTED_VERSION%" "%VERSION_FILE%" >nul 2>nul
  if errorlevel 1 set "NEEDS_BUILD=1"
)

if "%NEEDS_BUILD%"=="1" (
  echo OmniForge's desktop runtime is missing or belongs to an older source release.
  echo Rebuilding the native application now. The pinned Electron runtime is cached after its first download.
  call "%~dp0BUILD_DESKTOP_WINDOWS.bat"
  if errorlevel 1 exit /b 1
)

start "OmniForge" "%APP%"
exit /b 0
