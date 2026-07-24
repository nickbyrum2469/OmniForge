[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [Alias("ArchivePath")]
    [string]$SourcePath,

    [string]$Repository = "nickbyrum2469/OmniForge",

    [switch]$KeepWorkingDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Ensure-Command {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$WingetId
    )

    if (Get-Command $Name -ErrorAction SilentlyContinue) {
        return
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "$Name is required, and Windows Package Manager (winget) is unavailable. Install $Name and run this script again."
    }

    Write-Step "Installing $Name"
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & winget install --id $WingetId --exact --accept-package-agreements --accept-source-agreements
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
        throw "winget could not install $Name (exit code $exitCode)."
    }

    Refresh-Path
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was installed but is not visible in PATH yet. Restart PowerShell and run this script again."
    }
}

function Select-Source {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select the OmniForge source ZIP"
    $dialog.Filter = "ZIP archives (*.zip)|*.zip"
    $dialog.Multiselect = $false
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "No source was selected. Pass -SourcePath with an extracted folder to bypass ZIP extraction."
    }
    return $dialog.FileName
}

function Find-SourceRoot {
    param([Parameter(Mandatory)] [string]$SearchRoot)

    $searchRootFull = [IO.Path]::GetFullPath($SearchRoot)
    if ((Test-Path (Join-Path $searchRootFull "package.json") -PathType Leaf) -and
        (Test-Path (Join-Path $searchRootFull "app") -PathType Container) -and
        (Test-Path (Join-Path $searchRootFull "desktop") -PathType Container)) {
        return $searchRootFull
    }

    $candidates = Get-ChildItem -LiteralPath $searchRootFull -Filter package.json -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $parent = $_.Directory.FullName
            (Test-Path (Join-Path $parent "app") -PathType Container) -and
            (Test-Path (Join-Path $parent "desktop") -PathType Container)
        } |
        Sort-Object { $_.Directory.FullName.Length }

    if (-not $candidates) {
        throw "Could not find an OmniForge source root containing package.json, app/, and desktop/ under: $searchRootFull"
    }

    return $candidates[0].Directory.FullName
}

function Expand-ZipSafely {
    param(
        [Parameter(Mandatory)] [string]$ZipPath,
        [Parameter(Mandatory)] [string]$DestinationPath
    )

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $destinationFull = [IO.Path]::GetFullPath($DestinationPath)
    New-Item -ItemType Directory -Force -Path $destinationFull | Out-Null
    $destinationPrefix = $destinationFull.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $entryName = ($entry.FullName -replace '\\', '/').TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($entryName)) {
                continue
            }

            $targetPath = [IO.Path]::GetFullPath((Join-Path $destinationFull $entryName))
            if (-not $targetPath.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "Unsafe ZIP entry attempted to escape the extraction directory: $($entry.FullName)"
            }

            $isDirectory = $entryName.EndsWith('/') -or [string]::IsNullOrEmpty($entry.Name)
            if ($isDirectory) {
                New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
                continue
            }

            $parent = Split-Path -Parent $targetPath
            if ($parent) {
                New-Item -ItemType Directory -Force -Path $parent | Out-Null
            }

            $inputStream = $entry.Open()
            try {
                $outputStream = [IO.File]::Open($targetPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
                try {
                    $inputStream.CopyTo($outputStream)
                }
                finally {
                    $outputStream.Dispose()
                }
            }
            finally {
                $inputStream.Dispose()
            }
        }
    }
    finally {
        $archive.Dispose()
    }
}

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory)] [string]$FilePath,
        [string[]]$CommandArgs = @()
    )

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @CommandArgs
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
        $renderedArgs = $CommandArgs -join " "
        throw "$FilePath $renderedArgs failed with exit code $exitCode."
    }
}

function Test-GitHubAuthentication {
    $ghCommand = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghCommand) {
        return $false
    }

    $stdoutPath = [IO.Path]::GetTempFileName()
    $stderrPath = [IO.Path]::GetTempFileName()

    try {
        $process = Start-Process `
            -FilePath $ghCommand.Source `
            -ArgumentList @("api", "user", "--jq", ".login") `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath

        if ($process.ExitCode -ne 0) {
            return $false
        }

        $login = (Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue).Trim()
        if ([string]::IsNullOrWhiteSpace($login)) {
            return $false
        }

        Write-Host "Authenticated to GitHub as $login" -ForegroundColor Green
        return $true
    }
    catch {
        return $false
    }
    finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

if (-not $SourcePath) {
    $SourcePath = Select-Source
}

$SourcePath = [IO.Path]::GetFullPath($SourcePath)
if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Source path not found: $SourcePath"
}

$sourceIsDirectory = Test-Path -LiteralPath $SourcePath -PathType Container
$sourceIsZip = (Test-Path -LiteralPath $SourcePath -PathType Leaf) -and ([IO.Path]::GetExtension($SourcePath).Equals(".zip", [StringComparison]::OrdinalIgnoreCase))
if (-not $sourceIsDirectory -and -not $sourceIsZip) {
    throw "SourcePath must point to an extracted OmniForge directory or a ZIP archive."
}

Ensure-Command -Name git -WingetId Git.Git
Ensure-Command -Name gh -WingetId GitHub.cli

Write-Step "Checking GitHub authentication"
if (-not (Test-GitHubAuthentication)) {
    Write-Host "A GitHub browser login will open. Sign in to the account that owns $Repository." -ForegroundColor Yellow
    Invoke-NativeChecked -FilePath "gh" -CommandArgs @("auth", "login", "--web", "--git-protocol", "https")
    Start-Sleep -Seconds 2

    if (-not (Test-GitHubAuthentication)) {
        Write-Warning "GitHub login completed, but API verification was inconclusive. Continuing; clone or push will report any real authentication problem."
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$workRoot = Join-Path $env:TEMP "omniforge-source-import-$stamp"
$expandedRoot = Join-Path $workRoot "expanded"
$repoRoot = Join-Path $workRoot "repo"
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

try {
    if ($sourceIsDirectory) {
        Write-Step "Using extracted OmniForge source directory"
        $sourceRoot = Find-SourceRoot -SearchRoot $SourcePath
        $sourceKind = "directory"
        $sourceDisplayName = Split-Path -Leaf $sourceRoot
        $fingerprintFile = Join-Path $sourceRoot "package.json"
        $sourceFingerprint = (Get-FileHash -LiteralPath $fingerprintFile -Algorithm SHA256).Hash.ToLowerInvariant()
        $fingerprintBasis = "package.json"
    }
    else {
        Write-Step "Extracting source archive with duplicate-entry-safe extractor"
        Expand-ZipSafely -ZipPath $SourcePath -DestinationPath $expandedRoot
        $sourceRoot = Find-SourceRoot -SearchRoot $expandedRoot
        $sourceKind = "zip"
        $sourceDisplayName = [IO.Path]::GetFileName($SourcePath)
        $sourceFingerprint = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $fingerprintBasis = "archive"
    }

    Write-Host "Source root: $sourceRoot" -ForegroundColor Green

    $packageJsonPath = Join-Path $sourceRoot "package.json"
    $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    if (-not $packageJson.name) {
        throw "package.json is invalid or missing a package name."
    }

    Write-Step "Cloning authoritative repository"
    Invoke-NativeChecked -FilePath "gh" -CommandArgs @("repo", "clone", $Repository, $repoRoot)

    $excludedDirectories = @(
        ".git", "node_modules", "dist", "out", "coverage", ".cache", ".vite",
        ".parcel-cache", "runtime", "logs", "tmp", "temp"
    )
    $excludedFiles = @("*.zip", "*.7z", "*.rar", "*.exe", "*.dll", "*.pdb", "*.log")

    Write-Step "Copying authoritative source while excluding generated build/runtime files"
    $robocopyArgs = @(
        $sourceRoot,
        $repoRoot,
        "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:1", "/XJ", "/NFL", "/NDL", "/NP",
        "/XD"
    ) + $excludedDirectories + @("/XF") + $excludedFiles

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & robocopy @robocopyArgs | Out-Host
        $robocopyExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($robocopyExitCode -gt 7) {
        throw "robocopy failed with exit code $robocopyExitCode."
    }

    $largeFiles = Get-ChildItem -LiteralPath $repoRoot -File -Recurse |
        Where-Object { $_.FullName -notmatch "[\\/]\.git[\\/]" -and $_.Length -ge 95MB }
    if ($largeFiles) {
        $details = ($largeFiles | ForEach-Object { "- $($_.FullName) ($([math]::Round($_.Length / 1MB, 1)) MB)" }) -join "`n"
        throw "Files at or above 95 MB cannot be pushed normally. Remove generated files or configure Git LFS:`n$details"
    }

    $manifest = [ordered]@{
        schemaVersion = 3
        importedAt = (Get-Date).ToUniversalTime().ToString("o")
        sourceKind = $sourceKind
        sourceName = $sourceDisplayName
        sourceFingerprintSha256 = $sourceFingerprint
        fingerprintBasis = $fingerprintBasis
        packageName = [string]$packageJson.name
        packageVersion = [string]$packageJson.version
        repository = $Repository
        excludedGeneratedDirectories = $excludedDirectories
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $repoRoot "SOURCE_IMPORT.json") -Encoding UTF8

    Push-Location $repoRoot
    try {
        Invoke-NativeChecked -FilePath "git" -CommandArgs @("config", "user.name", "OmniForge Source Import")
        Invoke-NativeChecked -FilePath "git" -CommandArgs @("config", "user.email", "omniforge-source-import@users.noreply.github.com")
        Invoke-NativeChecked -FilePath "git" -CommandArgs @("add", "--all")

        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $status = (& git status --porcelain 2>$null) -join "`n"
        }
        finally {
            $ErrorActionPreference = $previousPreference
        }

        if ([string]::IsNullOrWhiteSpace($status)) {
            Write-Host "The repository already contains this source. No commit was needed." -ForegroundColor Green
        }
        else {
            Write-Step "Committing authoritative OmniForge source"
            Invoke-NativeChecked -FilePath "git" -CommandArgs @("commit", "-m", "Import OmniForge $($packageJson.version) authoritative source")
            Write-Step "Pushing source to GitHub"
            Invoke-NativeChecked -FilePath "git" -CommandArgs @("push", "origin", "main")
        }
    }
    finally {
        Pop-Location
    }

    Write-Host "`nOmniForge source is now in https://github.com/$Repository" -ForegroundColor Green
    Write-Host "Source fingerprint: $sourceFingerprint" -ForegroundColor DarkGray
    Start-Process "https://github.com/$Repository"
}
finally {
    if ($KeepWorkingDirectory) {
        Write-Host "Working directory retained at: $workRoot" -ForegroundColor Yellow
    }
    elseif (Test-Path -LiteralPath $workRoot) {
        Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
