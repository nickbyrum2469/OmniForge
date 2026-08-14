@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "APP=%~dp0dist\OmniForge-win32-x64\OmniForge.exe"
set "VERSION_FILE=%~dp0dist\OmniForge-win32-x64\version"
set "SOURCE_COMMIT_FILE=%~dp0dist\OmniForge-win32-x64\source-commit"
set "SOURCE_TREE_FILE=%~dp0dist\OmniForge-win32-x64\source-tree"
set "EXPECTED_VERSION=OmniForge 0.11.0"
set "NEEDS_BUILD=0"
set "CURRENT_COMMIT="
set "CURRENT_TREE="
set "BUILT_COMMIT="
set "BUILT_TREE="
set "SOURCE_DIRTY="
set "REPOSITORY_ROOT="
set "EXPECTED_ROOT="

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo OmniForge must be launched from its authoritative Git checkout.
  exit /b 1
)
for /f "delims=" %%I in ('git rev-parse --show-toplevel 2^>nul') do set "REPOSITORY_ROOT=%%I"
if not defined REPOSITORY_ROOT (
  echo OmniForge could not resolve the authoritative repository root.
  exit /b 1
)
for %%I in ("!REPOSITORY_ROOT!") do set "REPOSITORY_ROOT=%%~fI"
for %%I in ("%~dp0.") do set "EXPECTED_ROOT=%%~fI"
if /I not "!REPOSITORY_ROOT!"=="!EXPECTED_ROOT!" (
  echo OmniForge must be launched from the authoritative repository root.
  exit /b 1
)
for /f "delims=" %%I in ('git rev-parse HEAD 2^>nul') do set "CURRENT_COMMIT=%%I"
if not defined CURRENT_COMMIT (
  echo OmniForge could not resolve the authoritative Git HEAD.
  exit /b 1
)
if "!CURRENT_COMMIT:~39,1!"=="" (
  echo OmniForge received an invalid Git HEAD identity.
  exit /b 1
)
if not "!CURRENT_COMMIT:~40,1!"=="" (
  echo OmniForge received an invalid Git HEAD identity.
  exit /b 1
)
for /f "delims=" %%I in ('git rev-parse "HEAD^^{tree}" 2^>nul') do set "CURRENT_TREE=%%I"
if not defined CURRENT_TREE (
  echo OmniForge could not resolve the authoritative Git source tree.
  exit /b 1
)
if "!CURRENT_TREE:~39,1!"=="" (
  echo OmniForge received an invalid Git source-tree identity.
  exit /b 1
)
if not "!CURRENT_TREE:~40,1!"=="" (
  echo OmniForge received an invalid Git source-tree identity.
  exit /b 1
)
git status --porcelain -uall >nul 2>nul
if errorlevel 1 (
  echo OmniForge could not verify the authoritative working tree.
  exit /b 1
)
for /f "delims=" %%I in ('git status --porcelain -uall 2^>nul') do (
  set "DIRTY_LINE=%%I"
  set "DIRTY_PATH=!DIRTY_LINE:~3!"
  if /I not "!DIRTY_PATH!"=="data/engine-state.json" if /I not "!DIRTY_PATH!"=="data/engine-state.backup.json" if /I not "!DIRTY_PATH!"=="data/project-catalog.json" set "SOURCE_DIRTY=1"
)

if defined SOURCE_DIRTY (
  echo OmniForge source has uncommitted changes outside the protected runtime-state files.
  echo Commit or remove those changes before creating or launching a traceable desktop build.
  exit /b 1
)

if not exist "%APP%" set "NEEDS_BUILD=1"
if not exist "%VERSION_FILE%" set "NEEDS_BUILD=1"
if "!NEEDS_BUILD!"=="0" (
  findstr /b /l /c:"%EXPECTED_VERSION%" "%VERSION_FILE%" >nul 2>nul
  if errorlevel 1 set "NEEDS_BUILD=1"
)

if not exist "%SOURCE_COMMIT_FILE%" set "NEEDS_BUILD=1"
if exist "%SOURCE_COMMIT_FILE%" set /p BUILT_COMMIT=<"%SOURCE_COMMIT_FILE%"
if not defined BUILT_COMMIT set "NEEDS_BUILD=1"
if defined BUILT_COMMIT if /I not "!BUILT_COMMIT!"=="!CURRENT_COMMIT!" set "NEEDS_BUILD=1"
if not exist "%SOURCE_TREE_FILE%" set "NEEDS_BUILD=1"
if exist "%SOURCE_TREE_FILE%" set /p BUILT_TREE=<"%SOURCE_TREE_FILE%"
if not defined BUILT_TREE set "NEEDS_BUILD=1"
if defined BUILT_TREE if /I not "!BUILT_TREE!"=="!CURRENT_TREE!" set "NEEDS_BUILD=1"
if "!NEEDS_BUILD!"=="1" (
  echo OmniForge's desktop runtime is missing, outdated, or built from a different committed Git source tree.
  echo Rebuilding the native application now. The pinned Electron runtime is cached after its first download.
  call "%~dp0BUILD_DESKTOP_WINDOWS.bat"
  if errorlevel 1 exit /b 1
)

set "BUILT_COMMIT="
set "BUILT_TREE="
if not exist "%SOURCE_COMMIT_FILE%" (
  echo OmniForge build identity is missing source-commit.
  exit /b 1
)
if not exist "%SOURCE_TREE_FILE%" (
  echo OmniForge build identity is missing source-tree.
  exit /b 1
)
set /p BUILT_COMMIT=<"%SOURCE_COMMIT_FILE%"
set /p BUILT_TREE=<"%SOURCE_TREE_FILE%"
if /I not "!BUILT_COMMIT!"=="!CURRENT_COMMIT!" (
  echo OmniForge build source-commit does not match the authoritative Git HEAD.
  exit /b 1
)
if /I not "!BUILT_TREE!"=="!CURRENT_TREE!" (
  echo OmniForge build source-tree does not match the authoritative Git tree.
  exit /b 1
)

start "OmniForge" "%APP%"
exit /b 0
