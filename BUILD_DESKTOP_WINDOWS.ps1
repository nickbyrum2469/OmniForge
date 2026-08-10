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

$GitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $GitCommand) { $GitCommand = Get-Command git -ErrorAction SilentlyContinue }
if (-not $GitCommand) { throw 'Git is required to create a traceable OmniForge desktop build.' }

$RepositoryRootResult = @(& $GitCommand.Source -C $PSScriptRoot rev-parse --show-toplevel 2>$null)
$RepositoryRootExitCode = $LASTEXITCODE
if ($RepositoryRootExitCode -ne 0 -or $RepositoryRootResult.Count -eq 0) { throw 'OmniForge must be built from its authoritative Git checkout.' }
$RepositoryRoot = [IO.Path]::GetFullPath(([string]$RepositoryRootResult[0]).Trim())
if ($RepositoryRoot.TrimEnd('\','/') -ne [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\','/')) {
  throw "BUILD_DESKTOP_WINDOWS.ps1 must run from the authoritative repository root. Git reported $RepositoryRoot."
}

$SourceCommitResult = @(& $GitCommand.Source -C $PSScriptRoot rev-parse HEAD 2>$null)
$SourceCommitExitCode = $LASTEXITCODE
$SourceCommit = if ($SourceCommitResult.Count -gt 0) { ([string]$SourceCommitResult[0]).Trim() } else { '' }
if ($SourceCommitExitCode -ne 0 -or $SourceCommit -notmatch '^[0-9a-fA-F]{40}$') {
  throw 'The current Git commit could not be determined. Refusing to create an untraceable desktop build.'
}
$SourceTreeResult = @(& $GitCommand.Source -C $PSScriptRoot rev-parse "$SourceCommit`^{tree}" 2>$null)
$SourceTreeExitCode = $LASTEXITCODE
$SourceTree = if ($SourceTreeResult.Count -gt 0) { ([string]$SourceTreeResult[0]).Trim() } else { '' }
if ($SourceTreeExitCode -ne 0 -or $SourceTree -notmatch '^[0-9a-fA-F]{40}$') {
  throw 'The committed source tree could not be determined. Refusing to create an untraceable desktop build.'
}

# These files are the user's live runtime state. They may remain dirty while a
# committed source build is produced, but they are never copied from the working
# tree. Every other dirty or untracked path must be committed or removed first.
$ProtectedRuntimePaths = @(
  'data/engine-state.json',
  'data/engine-state.backup.json',
  'data/project-catalog.json'
)
$StatusArguments = @('-C',$PSScriptRoot,'status','--porcelain=v1','--untracked-files=all','--','.')
foreach ($ProtectedPath in $ProtectedRuntimePaths) { $StatusArguments += ":(exclude)$ProtectedPath" }
$DirtySource = @(& $GitCommand.Source @StatusArguments 2>$null | Where-Object { $_ })
if ($LASTEXITCODE -ne 0) { throw 'Git could not verify the OmniForge working tree before packaging.' }
if ($DirtySource.Count -gt 0) {
  throw "Refusing to stamp a dirty source tree as commit $SourceCommit. Commit or remove these package inputs first:`n$($DirtySource -join "`n")"
}

New-Item -ItemType Directory -Force -Path $CacheDir, $DistRoot | Out-Null
$BuildStagingRoot = Join-Path $CacheDir "committed-source-$PID-$([guid]::NewGuid().ToString('N'))"
$CommittedSourceArchive = Join-Path $BuildStagingRoot 'source.zip'
$BuildSourceRoot = Join-Path $BuildStagingRoot 'source'

try {
  New-Item -ItemType Directory -Force -Path $BuildSourceRoot | Out-Null
  & $GitCommand.Source -C $PSScriptRoot archive --format=zip --output=$CommittedSourceArchive $SourceCommit
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $CommittedSourceArchive -PathType Leaf)) {
    throw "Git could not export committed source $SourceCommit."
  }
  Expand-Archive -Path $CommittedSourceArchive -DestinationPath $BuildSourceRoot -Force

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

  $Folders = @('app','server','bridge','desktop','workers','assets','data','workspace','docs','scripts','tests','resources')
  foreach ($Folder in $Folders) {
    $Source = Join-Path $BuildSourceRoot $Folder
    if (Test-Path $Source) { Copy-Item $Source (Join-Path $AppDir $Folder) -Recurse -Force }
  }
  $Files = @('package.json','omniforge.project.json','README.md','AGENTS.md','CONNECT_CODEX.bat','RUN_TESTS.bat')
  foreach ($File in $Files) {
    $Source = Join-Path $BuildSourceRoot $File
    if (Test-Path $Source) { Copy-Item $Source (Join-Path $AppDir $File) -Force }
  }

  @{
    name = 'omniforge'
    productName = 'OmniForge'
    version = '0.11.0'
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
    --set-file-version '0.11.0.0' `
    --set-product-version '0.11.0.0'
  if ($LASTEXITCODE -ne 0) { throw "Failed to stamp OmniForge executable resources." }

  $VersionFile = Join-Path $Output 'version'
  $SourceCommitFile = Join-Path $Output 'source-commit'
  $SourceTreeFile = Join-Path $Output 'source-tree'
  "OmniForge 0.11.0`nElectron $ElectronVersion`nSource commit $SourceCommit`nSource tree $SourceTree`nBuilt $(Get-Date -Format o)" | Set-Content $VersionFile -Encoding UTF8
  $SourceCommit | Set-Content $SourceCommitFile -Encoding ascii
  $SourceTree | Set-Content $SourceTreeFile -Encoding ascii
  Write-Host ""
  Write-Host "Desktop build created:" -ForegroundColor Green
  Write-Host (Join-Path $Output 'OmniForge.exe') -ForegroundColor Cyan
  Write-Host "Source commit: $SourceCommit" -ForegroundColor DarkCyan
  Write-Host "Source tree: $SourceTree" -ForegroundColor DarkCyan
}
finally {
  Remove-Item -LiteralPath $BuildStagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
