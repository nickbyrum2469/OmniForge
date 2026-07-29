$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$FilePath,[string[]]$Arguments,[string]$Label=$FilePath)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

function Get-RepositoryRelativePath {
    param([string]$BasePath,[string]$FullPath)
    $base=[IO.Path]::GetFullPath($BasePath).TrimEnd([char[]]@('\','/'))+[IO.Path]::DirectorySeparatorChar
    $full=[IO.Path]::GetFullPath($FullPath)
    if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){
        throw "Path '$full' is outside repository root '$base'."
    }
    return $full.Substring($base.Length).Replace('\','/')
}

function Stop-OmniForgeProcesses {
    Get-Process OmniForge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

$root=(Get-Location).Path
$testOutput=Join-Path $root 'PHASE1C_TEST_OUTPUT.txt'
$verifyOutput=Join-Path $root 'PHASE1C_VERIFY_OUTPUT.txt'
$idempotencyOutput=Join-Path $root 'PHASE1C_IDEMPOTENCY_DIFF.txt'
$evidenceOutput=Join-Path $root 'PHASE1C_WINDOWS_EVIDENCE.txt'
$archive=Join-Path $root 'OmniForge-Phase1C-Crash-Sky-Windows-x64.zip'
$checksum=Join-Path $root 'OmniForge-Phase1C-Crash-Sky-Windows-x64.sha256'
Remove-Item $testOutput,$verifyOutput,$idempotencyOutput,$evidenceOutput,$archive,$checksum -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root 'PHASE1C_VISUAL_CAPTURES') -Recurse -Force -ErrorAction SilentlyContinue

Write-Host '=== Apply bounded celestial optics repair ==='
Invoke-Checked python @('scripts/apply-celestial-optics-gate.py') 'Celestial optics repair'
Invoke-Checked python @('scripts/apply-celestial-optics-test-contracts.py') 'Celestial optics test contracts'

Write-Host '=== Phase 1C current-source contracts ==='
Invoke-Checked python @('scripts/apply-phase1c-integration.py') 'Phase 1C source validation'

Write-Host '=== Syntax checks ==='
$syntaxFiles=@(
  'app/render-crash-guard.js','app/world-runtime.js','app/environment-runtime.js','app/environment-presets.js','app/sky-pass.js','app/renderer.js','app/app.js','app/v010.js',
  'server/v010-systems.mjs','server/v010-api.mjs','desktop/main.cjs'
)
foreach($file in $syntaxFiles){Invoke-Checked node @('--check',$file) "Syntax check: $file"}

Write-Host '=== Complete tests ==='
& npm.cmd test 2>&1 | Tee-Object -FilePath $testOutput
if($LASTEXITCODE -ne 0){throw 'Phase 1C tests failed.'}

Write-Host '=== Repository verification ==='
& npm.cmd run verify 2>&1 | Tee-Object -FilePath $verifyOutput
if($LASTEXITCODE -ne 0){throw 'Phase 1C repository verification failed.'}

Write-Host '=== Byte-level idempotency ==='
$trackedRoots=@('app','server','desktop','tests')
$before=@{}
foreach($trackedRoot in $trackedRoots){Get-ChildItem $trackedRoot -File -Recurse|ForEach-Object{$relative=Get-RepositoryRelativePath $root $_.FullName;$before[$relative]=(Get-FileHash $_.FullName -Algorithm SHA256).Hash}}
Invoke-Checked python @('scripts/apply-celestial-optics-gate.py') 'Celestial optics second pass'
Invoke-Checked python @('scripts/apply-celestial-optics-test-contracts.py') 'Celestial optics test-contract second pass'
Invoke-Checked python @('scripts/apply-phase1c-integration.py') 'Phase 1C second source validation'
$after=@{}
foreach($trackedRoot in $trackedRoots){Get-ChildItem $trackedRoot -File -Recurse|ForEach-Object{$relative=Get-RepositoryRelativePath $root $_.FullName;$after[$relative]=(Get-FileHash $_.FullName -Algorithm SHA256).Hash}}
$changed=foreach($relative in @($before.Keys+$after.Keys|Sort-Object -Unique)){if($before[$relative]-ne$after[$relative]){[PSCustomObject]@{Path=$relative;Before=$before[$relative];After=$after[$relative]}}}
if($changed){$changed|Format-Table -AutoSize|Out-String|Set-Content $idempotencyOutput -Encoding utf8;throw 'Phase 1C integration is not idempotent.'}
'No app/server/desktop/tests files changed during the second bounded repair and validation pass.'|Set-Content $idempotencyOutput -Encoding utf8

Write-Host '=== Commit exact verified source ==='
Remove-Item $testOutput,$verifyOutput -Force -ErrorAction SilentlyContinue
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add app server desktop tests progress.md
git add scripts/apply-celestial-optics-gate.py scripts/apply-celestial-optics-test-contracts.py scripts/apply-phase1c-integration.py scripts/apply-phase1c-visual-qa.py scripts/run-phase1c-visual-captures.ps1 scripts/run-phase1c-ci.ps1
$staged=git diff --cached --name-only
if($staged-and$env:GITHUB_ACTIONS-eq'true'){git commit -m 'Separate celestial visibility and refine star optics';if($LASTEXITCODE-ne 0){throw 'Verified source commit failed.'};git push origin HEAD:phase1c/crash-celestial-atmosphere-stabilization;if($LASTEXITCODE-ne 0){throw 'Verified source push failed.'}}
elseif($staged){git reset;Write-Host 'Local verification left source changes uncommitted; only GitHub Actions may publish the verified integration result.'}
$sourceCommit=(git rev-parse HEAD).Trim()

Write-Host '=== Native Windows package ==='
Invoke-Checked powershell.exe @('-NoProfile','-ExecutionPolicy','Bypass','-File','.\BUILD_DESKTOP_WINDOWS.ps1') 'Windows package'

Write-Host '=== Package identity audit ==='
$output=Join-Path $root 'dist\OmniForge-win32-x64'
$required=@(
 'OmniForge.exe','source-commit','resources\app\app\render-crash-guard.js','resources\app\app\renderer.js','resources\app\app\sky-pass.js','resources\app\app\environment-runtime.js','resources\app\app\environment-presets.js','resources\app\app\world-runtime.js','resources\app\app\v010.js','resources\app\desktop\main.cjs','resources\app\server\v010-systems.mjs','resources\app\server\v010-api.mjs'
)
foreach($relative in $required){if(-not(Test-Path(Join-Path $output $relative)-PathType Leaf)){throw "Missing packaged Phase 1C file: $relative"}}
$packagedCommit=(Get-Content(Join-Path $output 'source-commit')-Raw).Trim();if($packagedCommit-ne$sourceCommit){throw "Package identity mismatch: $packagedCommit != $sourceCommit"}
$rendererSource=Get-Content(Join-Path $output 'resources\app\app\renderer.js')-Raw
$skySource=Get-Content(Join-Path $output 'resources\app\app\sky-pass.js')-Raw
$appSource=Get-Content(Join-Path $output 'resources\app\app\app.js')-Raw
$desktopSource=Get-Content(Join-Path $output 'resources\app\desktop\main.cjs')-Raw
if($rendererSource-notmatch 'celestialRole\)return null' -or $rendererSource-notmatch 'sunAuthorityId'){throw 'Packaged celestial proxy/light repair is missing.'}
if($skySource-notmatch 'hemisphereOctEncode' -or $skySource-notmatch 'uSunVisibility' -or $skySource-notmatch 'moonSurfaceEnergy' -or $skySource-match 'vec3 cubeProjection'){throw 'Packaged celestial visibility/star optics repair is missing.'}
if($appSource-notmatch '__omniforgeVisualTestCapture' -or $desktopSource-notmatch 'installVisualCaptureWatcher'){throw 'Packaged rendered-evidence capture path is missing.'}
if($appSource-notmatch 'RenderCrashGuard' -or $desktopSource-notmatch 'recoverRendererProcess'){throw 'Packaged crash containment is missing.'}

Write-Host '=== Packaged runtime smoke ==='
$runtime=Join-Path $env:TEMP "omniforge-phase1c-$env:GITHUB_RUN_ID";New-Item -ItemType Directory -Force -Path $runtime|Out-Null
$port=43147;$env:OMNIFORGE_DATA_ROOT=$runtime;$env:OMNIFORGE_PORT="$port";$process=$null
try{
  $process=Start-Process -FilePath(Join-Path $output 'OmniForge.exe')-PassThru
  $deadline=(Get-Date).AddSeconds(45);$healthy=$false
  while((Get-Date)-lt$deadline){Start-Sleep -Milliseconds 400;try{Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2|Out-Null;$healthy=$true;break}catch{}}
  if(-not$healthy){throw 'Packaged Phase 1C editor did not become healthy.'}
  $world=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v010/world" -TimeoutSec 8
  if($world.world.lookPreset-ne'clear-day'){throw "Expected clear-day default, found $($world.world.lookPreset)."}
  if($world.world.atmosphere.haze-ge 0.02 -or $world.world.weather.fog-gt 0.001){throw 'Clear-day default is still foggy.'}
  $sun=@($world.scene.objects|Where-Object{$_.properties.PSObject.Properties['celestialRole'] -and $_.properties.celestialRole-eq'sun'})
  $moon=@($world.scene.objects|Where-Object{$_.properties.PSObject.Properties['celestialRole'] -and $_.properties.celestialRole-eq'moon'})
  if($sun.Count-ne1 -or $moon.Count-ne1){throw "Celestial authority regression: Sun=$($sun.Count) Moon=$($moon.Count)."}
  if($sun[0].properties.renderProxy-ne$false -or $moon[0].properties.renderProxy-ne$false){throw 'Celestial proxies are not protected from world-space rendering.'}
  $body=@{lookPreset='custom';atmosphere=@{haze=0.01;dayFogMultiplier=0.2;nightFogMultiplier=0.7};sky=@{moonCraterStrength=1.1;moonMariaStrength=0.8;starRayStrength=0.4;milkyWayWarp=0.9;milkyWayClumping=1.1;solarEclipseCoverage=1.15}}|ConvertTo-Json -Depth 8
  $updated=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v010/world" -Method Patch -ContentType 'application/json' -Body $body -TimeoutSec 8
  if($updated.world.lookPreset-ne'custom' -or $updated.world.sky.milkyWayClumping-ne1.1 -or $updated.world.sky.moonCraterStrength-ne1.1){throw 'Custom sky controls did not persist.'}
  1..8|ForEach-Object{Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v010/world/step" -Method Post -ContentType 'application/json' -Body '{"seconds":1}' -TimeoutSec 8|Out-Null;Start-Sleep -Milliseconds 150}
  Start-Sleep -Seconds 5;if($process.HasExited){throw 'Editor exited during time-stepped viewport runtime.'}
}finally{
  if($process-and-not$process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue};Stop-OmniForgeProcesses
  Remove-Item Env:OMNIFORGE_DATA_ROOT,Env:OMNIFORGE_PORT -ErrorAction SilentlyContinue;Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '=== Packaged rendered visual evidence ==='
Invoke-Checked powershell.exe @('-NoProfile','-ExecutionPolicy','Bypass','-File','.\scripts\run-phase1c-visual-captures.ps1') 'Rendered visual capture gate'

Write-Host '=== Archive and evidence ==='
Compress-Archive -Path(Join-Path $output '*')-DestinationPath $archive -CompressionLevel Optimal
$hash=(Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant();"$hash  $(Split-Path $archive -Leaf)"|Set-Content $checksum -Encoding ascii
@('Phase 1C authoritative Windows evidence',"Source commit: $sourceCommit", "Packaged source commit: $packagedCommit", "Archive SHA-256: $hash",'Syntax/tests/verification/idempotency: passed','Crash containment source/package audit: passed','One Sun and Moon without world proxy meshes: passed','Geometric Sun/Moon horizon visibility: passed','Bounded star optical profile: passed','Clear-day atmosphere baseline: passed','Custom Moon/star/Milky Way controls persistence: passed','Time-step runtime survival: passed','Packaged twenty-state visual capture: passed','Automated metrics: passed','Manual image inspection required before user handoff')|Set-Content $evidenceOutput -Encoding utf8
Write-Host "Phase 1C complete: $sourceCommit"
