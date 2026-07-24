$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$ElectronVersion = '43.2.0'
$Architecture = 'x64'
$DownloadUrl = "https://github.com/electron/electron/releases/download/v$ElectronVersion/electron-v$ElectronVersion-win32-$Architecture.zip"
$CacheDir = Join-Path $PSScriptRoot '.desktop-cache'
$Archive = Join-Path $CacheDir "electron-v$ElectronVersion-win32-$Architecture.zip"
$RceditVersion = '2.0.0'
$Rcedit = Join-Path $CacheDir "rcedit-v$RceditVersion-x64.exe"
$RceditUrl = "https://github.com/electron/rcedit/releases/download/v$RceditVersion/rcedit-x64.exe"
$RceditSha256 = '3E7801DB1A5EDBEC91B49A24A094AAD776CB4515488EA5A4CA2289C400EADE2A'
$DistRoot = Join-Path $PSScriptRoot 'dist'
$Output = Join-Path $DistRoot 'OmniForge-win32-x64'

New-Item -ItemType Directory -Force -Path $CacheDir, $DistRoot | Out-Null
if (-not (Test-Path $Archive)) {
  Write-Host "Downloading the official Electron $ElectronVersion Windows runtime..."
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $Archive -UseBasicParsing
}
if (-not (Test-Path $Rcedit)) {
  Write-Host "Downloading the pinned rcedit $RceditVersion resource editor..."
  Invoke-WebRequest -Uri $RceditUrl -OutFile $Rcedit -UseBasicParsing
}
$ActualRceditHash = (Get-FileHash -Algorithm SHA256 $Rcedit).Hash.ToUpperInvariant()
if ($ActualRceditHash -ne $RceditSha256) { throw "rcedit checksum mismatch. Expected $RceditSha256, received $ActualRceditHash." }

if (Test-Path $Output) { Remove-Item $Output -Recurse -Force }
Expand-Archive -Path $Archive -DestinationPath $Output -Force
Rename-Item (Join-Path $Output 'electron.exe') 'OmniForge.exe'

$Resources = Join-Path $Output 'resources'
Remove-Item (Join-Path $Resources 'default_app.asar') -Force -ErrorAction SilentlyContinue
$AppDir = Join-Path $Resources 'app'
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

$Folders = @('app','server','bridge','desktop','assets','data','workspace','captures','logs','docs','scripts','tests','resources')
foreach ($Folder in $Folders) {
  $Source = Join-Path $PSScriptRoot $Folder
  if (Test-Path $Source) { Copy-Item $Source (Join-Path $AppDir $Folder) -Recurse -Force }
}
$Files = @('package.json','omniforge.project.json','README.md','AGENTS.md','CONNECT_CODEX.bat','RUN_TESTS.bat')
foreach ($File in $Files) {
  $Source = Join-Path $PSScriptRoot $File
  if (Test-Path $Source) { Copy-Item $Source (Join-Path $AppDir $File) -Force }
}

@{
  name = 'omniforge'
  productName = 'OmniForge'
  version = '0.9.0'
  private = $true
  main = 'desktop/main.cjs'
} | ConvertTo-Json | Set-Content (Join-Path $AppDir 'package.json') -Encoding UTF8


$IconSource = Join-Path $AppDir 'resources\omniforge-icon.ico'
$Executable = Join-Path $Output 'OmniForge.exe'
& $Rcedit $Executable `
  --set-icon $IconSource `
  --set-version-string ProductName 'OmniForge' `
  --set-version-string FileDescription 'OmniForge AI-Native 3D Game Engine' `
  --set-version-string CompanyName 'OmniForge' `
  --set-version-string InternalName 'OmniForge' `
  --set-version-string OriginalFilename 'OmniForge.exe' `
  --set-version-string LegalCopyright 'Copyright (c) 2026 OmniForge' `
  --set-file-version '0.9.0.0' `
  --set-product-version '0.9.0.0'
if ($LASTEXITCODE -ne 0) { throw "Failed to stamp OmniForge executable resources." }

$VersionFile = Join-Path $Output 'version'
"OmniForge 0.9.0`nElectron $ElectronVersion`nBuilt $(Get-Date -Format o)" | Set-Content $VersionFile -Encoding UTF8
Write-Host ""
Write-Host "Desktop build created:" -ForegroundColor Green
Write-Host (Join-Path $Output 'OmniForge.exe') -ForegroundColor Cyan
