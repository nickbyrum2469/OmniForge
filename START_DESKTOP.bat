@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "APP=%~dp0dist\OmniForge-win32-x64\OmniForge.exe"
set "VERSION_FILE=%~dp0dist\OmniForge-win32-x64\version"
set "SOURCE_COMMIT_FILE=%~dp0dist\OmniForge-win32-x64\source-commit"
set "EXPECTED_VERSION=OmniForge 0.11.0"
set "NEEDS_BUILD=0"
set "CURRENT_COMMIT="
set "BUILT_COMMIT="
set "SOURCE_DIRTY="

for /f "usebackq delims=" %%I in (`git -C "%~dp0" rev-parse HEAD 2^>nul`) do set "CURRENT_COMMIT=%%I"
for /f "usebackq delims=" %%I in (`git -C "%~dp0" status --porcelain --untracked-files=normal 2^>nul`) do set "SOURCE_DIRTY=1"

if not exist "%APP%" set "NEEDS_BUILD=1"
if not exist "%VERSION_FILE%" set "NEEDS_BUILD=1"
if "!NEEDS_BUILD!"=="0" (
  findstr /b /l /c:"%EXPECTED_VERSION%" "%VERSION_FILE%" >nul 2>nul
  if errorlevel 1 set "NEEDS_BUILD=1"
)

if defined CURRENT_COMMIT (
  if not exist "%SOURCE_COMMIT_FILE%" set "NEEDS_BUILD=1"
  if exist "%SOURCE_COMMIT_FILE%" set /p BUILT_COMMIT=<"%SOURCE_COMMIT_FILE%"
  if defined BUILT_COMMIT if /I not "!BUILT_COMMIT!"=="!CURRENT_COMMIT!" set "NEEDS_BUILD=1"
)
if defined SOURCE_DIRTY set "NEEDS_BUILD=1"

if "!NEEDS_BUILD!"=="1" (
  echo OmniForge's desktop runtime is missing, outdated, or built from a different Git source commit.
  echo Rebuilding the native application now. The pinned Electron runtime is cached after its first download.
  call "%~dp0BUILD_DESKTOP_WINDOWS.bat"
  if errorlevel 1 exit /b 1
)

start "OmniForge" "%APP%"
exit /b 0
