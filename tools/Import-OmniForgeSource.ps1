[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ArchivePath,

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
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & winget install --id $WingetId --exact --accept-package-agreements --accept-source-agreements
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        throw "winget could not install $Name (exit code $exitCode)."
    }

    Refresh-Path
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was installed but is not visible in PATH yet. Restart PowerShell and run this script again."
    }
}

function Select-Archive {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select the OmniForge source ZIP"
    $dialog.Filter = "ZIP archives (*.zip)|*.zip"
    $dialog.Multiselect = $false
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "No archive was selected."
    }
    return $dialog.FileName
}

function Find-SourceRoot {
    param([Parameter(Mandatory)] [string]$ExpandedRoot)

    $candidates = Get-ChildItem -LiteralPath $ExpandedRoot -Filter package.json -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $parent = $_.Directory.FullName
            (Test-Path (Join-Path $parent "app")) -and
            (Test-Path (Join-Path $parent "desktop"))
        } |
        Sort-Object { $_.Directory.FullName.Length }

    if (-not $candidates) {
        throw "Could not find an OmniForge source root containing package.json, app/, and desktop/."
    }

    return $candidates[0].Directory.FullName
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)] [string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)] [string[]]$Arguments
    )

    # Windows PowerShell 5.1 can turn native stderr into PowerShell ErrorRecord
    # objects. Run native tools with non-terminating stderr handling, then trust
    # their real process exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        throw "$FilePath failed with exit code $exitCode."
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
        # `gh api user` proves that an authenticated API call actually works.
        # Start-Process keeps PowerShell 5.1 from converting native stderr into a
        # terminating RemoteException.
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

if (-not $ArchivePath) {
    $ArchivePath = Select-Archive
}

$ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    throw "Archive not found: $ArchivePath"
}

if ([IO.Path]::GetExtension($ArchivePath) -ne ".zip") {
    throw "The selected file must be a ZIP archive."
}

Ensure-Command -Name git -WingetId Git.Git
Ensure-Command -Name gh -WingetId GitHub.cli

Write-Step "Checking GitHub authentication"
if (-not (Test-GitHubAuthentication)) {
    Write-Host "A GitHub browser login will open. Sign in to the account that owns $Repository." -ForegroundColor Yellow
    Invoke-Checked gh auth login --web --git-protocol https
    Start-Sleep -Seconds 2

    if (-not (Test-GitHubAuthentication)) {
        # `gh auth login` already returned success. Continue to the clone/push
        # operations, which provide the final authoritative authentication test.
        Write-Warning "GitHub login completed, but the API verification was inconclusive. Continuing; clone or push will report any real authentication problem."
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$workRoot = Join-Path $env:TEMP "omniforge-source-import-$stamp"
$expandedRoot = Join-Path $workRoot "expanded"
$repoRoot = Join-Path $workRoot "repo"
New-Item -ItemType Directory -Force -Path $expandedRoot | Out-Null

try {
    Write-Step "Extracting source archive"
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $expandedRoot -Force
    $sourceRoot = Find-SourceRoot -ExpandedRoot $expandedRoot
    Write-Host "Source root: $sourceRoot" -ForegroundColor Green

    $packageJson = Get-Content -LiteralPath (Join-Path $sourceRoot "package.json") -Raw | ConvertFrom-Json
    if (-not $packageJson.name) {
        throw "package.json is invalid or missing a package name."
    }

    Write-Step "Cloning authoritative repository"
    Invoke-Checked gh repo clone $Repository $repoRoot

    $excludedDirectories = @(
        ".git", "node_modules", "dist", "out", "coverage", ".cache", ".vite",
        ".parcel-cache", "runtime", "logs", "tmp", "temp"
    )
    $excludedFiles = @("*.zip", "*.7z", "*.rar", "*.exe", "*.dll", "*.pdb", "*.log")

    Write-Step "Copying source while excluding generated runtime and build files"
    $robocopyArgs = @(
        $sourceRoot,
        $repoRoot,
        "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:1", "/XJ", "/NFL", "/NDL", "/NP",
        "/XD"
    ) + $excludedDirectories + @("/XF") + $excludedFiles

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & robocopy @robocopyArgs | Out-Host
        $robocopyExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
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

    $archiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest = [ordered]@{
        schemaVersion = 1
        importedAt = (Get-Date).ToUniversalTime().ToString("o")
        sourceArchive = [IO.Path]::GetFileName($ArchivePath)
        sourceArchiveSha256 = $archiveHash
        packageName = [string]$packageJson.name
        packageVersion = [string]$packageJson.version
        repository = $Repository
        excludedGeneratedDirectories = $excludedDirectories
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $repoRoot "SOURCE_IMPORT.json") -Encoding UTF8

    Push-Location $repoRoot
    try {
        Invoke-Checked git config user.name "OmniForge Source Import"
        Invoke-Checked git config user.email "omniforge-source-import@users.noreply.github.com"
        Invoke-Checked git add -A

        $status = (& git status --porcelain) -join "`n"
        if (-not $status.Trim()) {
            Write-Host "The repository already contains this source. No commit was needed." -ForegroundColor Green
        }
        else {
            Write-Step "Committing authoritative OmniForge source"
            Invoke-Checked git commit -m "Import OmniForge $($packageJson.version) authoritative source"
            Write-Step "Pushing source to GitHub"
            Invoke-Checked git push origin main
        }
    }
    finally {
        Pop-Location
    }

    Write-Host "`nOmniForge source is now in https://github.com/$Repository" -ForegroundColor Green
    Write-Host "Archive SHA-256: $archiveHash" -ForegroundColor DarkGray
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
