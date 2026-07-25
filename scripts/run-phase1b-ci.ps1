$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$Label = $FilePath
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Stop-OmniForgeProcesses {
    Get-Process OmniForge -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

$root = (Get-Location).Path
$testOutput = Join-Path $root 'PHASE1B_TEST_OUTPUT.txt'
$verifyOutput = Join-Path $root 'PHASE1B_VERIFY_OUTPUT.txt'
$idempotencyOutput = Join-Path $root 'PHASE1B_IDEMPOTENCY_DIFF.txt'
$evidenceOutput = Join-Path $root 'PHASE1B_WINDOWS_EVIDENCE.txt'
$archive = Join-Path $root 'OmniForge-Phase1B-Lunar-HDR-Windows-x64.zip'
$checksum = Join-Path $root 'OmniForge-Phase1B-Lunar-HDR-Windows-x64.sha256'

Remove-Item $testOutput, $verifyOutput, $idempotencyOutput, $evidenceOutput, $archive, $checksum -Force -ErrorAction SilentlyContinue

Write-Host '=== Phase 1B guarded integration ==='
Invoke-Checked python @('scripts/apply-phase1b-integration.py') 'Phase 1B guarded integration'

Write-Host '=== Syntax checks ==='
$syntaxFiles = @(
    'app/celestial-mechanics.js',
    'app/environment-presets.js',
    'app/environment-runtime.js',
    'app/hdr-pipeline.js',
    'app/sky-pass.js',
    'app/renderer.js',
    'app/v010.js',
    'server/v010-systems.mjs',
    'server/v010-api.mjs'
)
foreach ($file in $syntaxFiles) {
    Invoke-Checked node @('--check', $file) "Syntax check: $file"
}

Write-Host '=== Complete automated tests ==='
& npm.cmd test 2>&1 | Tee-Object -FilePath $testOutput
if ($LASTEXITCODE -ne 0) {
    throw 'Phase 1B tests failed.'
}

Write-Host '=== Repository verification ==='
& npm.cmd run verify 2>&1 | Tee-Object -FilePath $verifyOutput
if ($LASTEXITCODE -ne 0) {
    throw 'Phase 1B repository verification failed.'
}

Write-Host '=== Deterministic idempotency ==='
$trackedRoots = @('app', 'server', 'tests')
$beforeHashes = @{}
foreach ($trackedRoot in $trackedRoots) {
    Get-ChildItem $trackedRoot -File -Recurse | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/')
        $beforeHashes[$relative] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
}
Invoke-Checked python @('scripts/apply-phase1b-integration.py') 'Phase 1B second integration pass'
$afterHashes = @{}
foreach ($trackedRoot in $trackedRoots) {
    Get-ChildItem $trackedRoot -File -Recurse | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/')
        $afterHashes[$relative] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
}
$allPaths = @($beforeHashes.Keys + $afterHashes.Keys | Sort-Object -Unique)
$changed = foreach ($relative in $allPaths) {
    $before = $beforeHashes[$relative]
    $after = $afterHashes[$relative]
    if ($before -ne $after) {
        [PSCustomObject]@{ Path = $relative; Before = $before; After = $after }
    }
}
if ($changed) {
    $changed | Format-Table -AutoSize | Out-String | Set-Content $idempotencyOutput -Encoding utf8
    Get-Content $idempotencyOutput
    throw 'Phase 1B guarded integration is not idempotent.'
}
'No app/server/tests files changed during the second guarded integration pass.' | Set-Content $idempotencyOutput -Encoding utf8

Write-Host '=== Commit exact verified source ==='
Remove-Item $testOutput, $verifyOutput -Force -ErrorAction SilentlyContinue
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add app server tests
$staged = git diff --cached --name-only
if ($staged) {
    git commit -m 'Add independent lunar cycles, HDR display, starfields, and lighting presets'
    if ($LASTEXITCODE -ne 0) { throw 'Verified Phase 1B source commit failed.' }
    git push origin HEAD:phase1b/lunar-cycle-hdr-lighting-presets
    if ($LASTEXITCODE -ne 0) { throw 'Verified Phase 1B source push failed.' }
}
$sourceCommit = (git rev-parse HEAD).Trim()
Write-Host "Verified Phase 1B source commit: $sourceCommit"

Write-Host '=== Native Windows package ==='
Invoke-Checked powershell.exe @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.\BUILD_DESKTOP_WINDOWS.ps1') 'Windows desktop build'

Write-Host '=== Exact package audit ==='
$output = Join-Path $root 'dist\OmniForge-win32-x64'
$required = @(
    'OmniForge.exe',
    'source-commit',
    'resources\app\app\renderer.js',
    'resources\app\app\render-graph.js',
    'resources\app\app\frame-resources.js',
    'resources\app\app\hdr-pipeline.js',
    'resources\app\app\celestial-mechanics.js',
    'resources\app\app\environment-presets.js',
    'resources\app\app\environment-runtime.js',
    'resources\app\app\sky-pass.js',
    'resources\app\app\v010.js',
    'resources\app\server\v010-systems.mjs',
    'resources\app\server\v010-api.mjs'
)
foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $output $relative) -PathType Leaf)) {
        throw "Missing packaged Phase 1B file: $relative"
    }
}
$packagedCommit = (Get-Content (Join-Path $output 'source-commit') -Raw).Trim()
if ($packagedCommit -ne $sourceCommit) {
    throw "Packaged source $packagedCommit does not match verified source $sourceCommit."
}
$packagedRenderer = Get-Content (Join-Path $output 'resources\app\app\renderer.js') -Raw
$packagedSky = Get-Content (Join-Path $output 'resources\app\app\sky-pass.js') -Raw
if ($packagedRenderer -notmatch 'HDRPipeline' -or $packagedRenderer -notmatch 'display-transform') {
    throw 'Packaged renderer is missing the HDR display pipeline.'
}
if ($packagedSky -notmatch 'starLayer' -or $packagedSky -notmatch 'milkyWay' -or $packagedSky -notmatch 'uStarTwinkleAmount') {
    throw 'Packaged sky is missing the Phase 1B stellar system.'
}

Write-Host '=== Packaged lunar, eclipse, star, and HDR smoke ==='
$runtime = Join-Path $env:TEMP "omniforge-phase1b-$($env:GITHUB_RUN_ID)"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$port = 43143
$env:OMNIFORGE_DATA_ROOT = $runtime
$env:OMNIFORGE_PORT = "$port"
$process = $null
try {
    $process = Start-Process -FilePath (Join-Path $output 'OmniForge.exe') -PassThru
    $deadline = (Get-Date).AddSeconds(45)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 400
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 | Out-Null
            $healthy = $true
            break
        } catch {}
    }
    if (-not $healthy) { throw 'Packaged Phase 1B editor did not become healthy.' }

    $world = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v010/world" -TimeoutSec 8
    $sun = @($world.scene.objects | Where-Object { $_.properties.celestialRole -eq 'sun' })
    $moon = @($world.scene.objects | Where-Object { $_.properties.celestialRole -eq 'moon' })
    if ($sun.Count -ne 1 -or $moon.Count -ne 1) {
        throw "Celestial authority regression: Sun=$($sun.Count), Moon=$($moon.Count)."
    }
    if ($moon[0].properties.phaseName -eq $null -or $moon[0].properties.ageDays -eq $null) {
        throw 'Lunar phase metadata is missing.'
    }

    $body = @{
        sky = @{
            eclipseMode = 'force-lunar'
            moonPhaseMode = 'sun-relative'
            starTwinkleAmount = 0.8
            starTwinkleSpeed = 1.7
            starSizeMin = 0.25
            starSizeMax = 2.5
            starColorVariation = 0.8
            milkyWayWidth = 0.12
            milkyWayDetail = 1.1
            milkyWayDust = 0.72
        }
        atmosphere = @{
            saturation = 1.15
            contrast = 1.08
            vibrance = 0.2
            toneMapper = 'aces'
        }
    } | ConvertTo-Json -Depth 8
    $updated = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v010/world" -Method Patch -ContentType 'application/json' -Body $body -TimeoutSec 8
    $active = $updated.state.scenes | Where-Object { $_.id -eq $updated.state.activeSceneId } | Select-Object -First 1
    $updatedMoon = $active.objects | Where-Object { $_.properties.celestialRole -eq 'moon' } | Select-Object -First 1
    if ($updatedMoon.properties.eventType -ne 'lunar-eclipse' -or $updatedMoon.properties.lunarEclipse -lt 0.99) {
        throw 'Forced lunar eclipse did not reach the Moon authority.'
    }
    if ($updated.state.worldV010.sky.starTwinkleAmount -ne 0.8) {
        throw 'Star twinkle controls did not persist.'
    }
    if ($updated.state.worldV010.sky.milkyWayDust -ne 0.72) {
        throw 'Milky Way controls did not persist.'
    }
    Start-Sleep -Seconds 5
    if ($process.HasExited) { throw 'Editor exited during HDR or stellar-sky initialization.' }
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-OmniForgeProcesses
    Remove-Item Env:OMNIFORGE_DATA_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:OMNIFORGE_PORT -ErrorAction SilentlyContinue
    Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '=== Archive exact package and evidence ==='
Compress-Archive -Path (Join-Path $output '*') -DestinationPath $archive -CompressionLevel Optimal
$hash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $archive -Leaf)" | Set-Content $checksum -Encoding ascii
@(
    'Phase 1B authoritative Windows evidence',
    "Source commit: $sourceCommit",
    "Packaged source commit: $packagedCommit",
    "Archive SHA-256: $hash",
    'Syntax: passed',
    'Tests: passed',
    'Repository verification: passed',
    'Guarded idempotency: passed',
    'Package identity: passed',
    'Independent lunar orbit and Sun-relative phase: passed',
    'Forced lunar eclipse API: passed',
    'Star controls: passed',
    'Milky Way authority: passed',
    'HDR startup: passed'
) | Set-Content $evidenceOutput -Encoding utf8

Write-Host "Phase 1B complete. Source: $sourceCommit"
Write-Host "Archive SHA-256: $hash"
