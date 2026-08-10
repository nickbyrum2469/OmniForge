param(
  [int]$DurationSeconds = 120,
  [switch]$Diagnostics
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Api([int]$Port,[string]$Path,[string]$Method='GET',$Body=$null,[int]$TimeoutSec=20) {
  $arguments = @{
    Uri = "http://127.0.0.1:$Port$Path"
    Method = $Method
    TimeoutSec = $TimeoutSec
  }
  if ($null -ne $Body) {
    $arguments.ContentType = 'application/json'
    $arguments.Body = $Body | ConvertTo-Json -Depth 32 -Compress
  }
  Invoke-RestMethod @arguments
}

function Get-FreePort {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return [int](($listener.LocalEndpoint).Port) }
  finally { $listener.Stop() }
}

function Read-JsonFile([string]$Path,[switch]$AllowMissing) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    if ($AllowMissing) { return $null }
    throw "Required JSON file is missing: $Path"
  }
  try { return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json) }
  catch { throw "Could not read JSON from $Path`: $($_.Exception.Message)" }
}

function Test-PortBindable([int]$Port) {
  $listener = $null
  try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch { return $false }
  finally { if ($null -ne $listener) { try { $listener.Stop() } catch {} } }
}

function Assert-RuntimeIdentity($Health,$Marker,[int]$Port,[string]$Stage) {
  if ($null -eq $Marker) { throw "Runtime identity marker is unavailable during $Stage." }
  if ([int]$Marker.port -ne $Port -or [int]$Health.port -ne $Port) {
    throw "Runtime port identity mismatch during $Stage (expected $Port, marker $($Marker.port), health $($Health.port))."
  }
  if (-not [string]$Marker.sessionToken -or [string]$Marker.sessionToken -ne [string]$Health.sessionToken) {
    throw "Runtime session-token identity mismatch during $Stage."
  }
  if ([int]$Marker.pid -le 0 -or [int]$Marker.pid -ne [int]$Health.pid) {
    throw "Runtime PID identity mismatch during $Stage (marker $($Marker.pid), health $($Health.pid))."
  }
}

function Wait-PackagedHealth($Process,[int]$Port,[string]$RuntimeRoot,[int]$TimeoutSeconds=60) {
  $runtimeFile = Join-Path $RuntimeRoot 'sessions\runtime.json'
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastFailure = 'runtime marker and health endpoint were not ready'
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    if ($null -ne $Process -and $Process.HasExited) {
      throw "Packaged OmniForge exited before becoming healthy with code $($Process.ExitCode)."
    }
    try {
      $marker = Read-JsonFile $runtimeFile -AllowMissing
      if ($null -eq $marker) { $lastFailure = 'runtime marker was not written'; continue }
      $health = Invoke-Api $Port '/api/health' 'GET' $null 2
      Assert-RuntimeIdentity $health $marker $Port 'packaged startup'
      return [ordered]@{ health=$health;runtime=$marker;desktopProcessId=$Process.Id }
    } catch { $lastFailure = $_.Exception.Message }
  }
  throw "Packaged OmniForge did not become healthy with a matching isolated runtime identity on port $Port`: $lastFailure"
}

function Get-SourceTreeDigest([string]$RepositoryRoot,[string]$PackageAppRoot) {
  $sourceFolders = @('app','server','bridge','desktop','workers','assets','docs','scripts','tests','resources')
  $packagePrefix = [IO.Path]::GetFullPath($PackageAppRoot).TrimEnd('\') + '\'
  $trackedFiles = @(& git -C $RepositoryRoot ls-tree -r --name-only HEAD -- @sourceFolders)
  if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate the authoritative Git source tree.' }
  $sourceFiles = @{}
  $records = New-Object System.Collections.Generic.List[string]
  foreach ($trackedFile in $trackedFiles) {
    $relative = ([string]$trackedFile).Trim().Replace('\','/')
    if (-not $relative) { continue }
    $packagedFile = Join-Path $PackageAppRoot $relative.Replace('/','\')
    if (-not (Test-Path -LiteralPath $packagedFile -PathType Leaf)) { throw "Packaged source file is missing: $relative" }
    $expectedBlob = ([string](& git -C $RepositoryRoot rev-parse "HEAD`:$relative")).Trim()
    if ($LASTEXITCODE -ne 0 -or $expectedBlob -notmatch '^[0-9a-f]{40,64}$') { throw "Could not resolve authoritative Git blob for $relative." }
    $packagedBlob = ([string](& git hash-object -- $packagedFile)).Trim()
    if ($LASTEXITCODE -ne 0 -or $packagedBlob -ne $expectedBlob) { throw "Packaged source hash mismatch for $relative." }
    $sourceFiles[$relative] = $expectedBlob
    $records.Add("$relative`t$expectedBlob")
  }
  foreach ($folder in $sourceFolders) {
    $packagedFolder = Join-Path $PackageAppRoot $folder
    if (-not (Test-Path -LiteralPath $packagedFolder -PathType Container)) { continue }
    foreach ($file in Get-ChildItem -LiteralPath $packagedFolder -File -Recurse) {
      $relative = $file.FullName.Substring($packagePrefix.Length).Replace('\','/')
      if (-not $sourceFiles.ContainsKey($relative)) { throw "Packaged source contains a stale extra file: $relative" }
    }
  }
  $digestInput = [Text.Encoding]::UTF8.GetBytes((($records | Sort-Object) -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $digest = -join ($sha.ComputeHash($digestInput) | ForEach-Object { $_.ToString('x2') }) }
  finally { $sha.Dispose() }
  return [ordered]@{ algorithm='SHA256-over-Git-blob-inventory';digest=$digest;fileCount=$records.Count;folders=$sourceFolders }
}

function Get-LookCamera([double[]]$Position,[double[]]$Target,[double]$Fov=62) {
  $dx = $Target[0] - $Position[0]
  $dy = $Target[1] - $Position[1]
  $dz = $Target[2] - $Position[2]
  $length = [Math]::Max(0.000001, [Math]::Sqrt($dx*$dx + $dy*$dy + $dz*$dz))
  @{
    position = @($Position[0],$Position[1],$Position[2])
    yaw = [Math]::Atan2($dx, -$dz)
    pitch = [Math]::Asin($dy / $length)
    fov = $Fov
  }
}

function New-ExpectedPathFixture(
  [string]$PathId,
  [string]$NetworkId,
  [string]$BridgeStyle,
  [int]$MinimumNetworkRevision=0,
  [string]$SurfaceProfileId='muddy-wagon-road',
  [double]$Width=6
) {
  @{
    pathId=$PathId
    networkId=$NetworkId
    nodeIds=@('approach-west','approach-east')
    segmentIds=@('bridge-showcase')
    minimumNetworkRevision=$MinimumNetworkRevision
    valid=$true
    minimumBridgeIntervalCount=1
    bridgeStyle=$BridgeStyle
    surfaceProfileId=$SurfaceProfileId
    width=$Width
  }
}

function Request-Capture([string]$CaptureDir,[string]$Id,[hashtable]$Options,[int]$TimeoutSeconds=60) {
  $requestFile = Join-Path $CaptureDir 'capture-request.json'
  $temporaryFile = Join-Path $CaptureDir 'capture-request.tmp.json'
  $responseFile = Join-Path $CaptureDir "$Id.json"
  $pngFile = Join-Path $CaptureDir "$Id.png"
  Remove-Item $requestFile,$temporaryFile,$responseFile,$pngFile -Force -ErrorAction SilentlyContinue
  $payload = @{ id = $Id; options = $Options } | ConvertTo-Json -Depth 32
  [IO.File]::WriteAllText($temporaryFile,$payload,[Text.UTF8Encoding]::new($false))
  Move-Item $temporaryFile $requestFile -Force
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 150
    if (-not (Test-Path -LiteralPath $responseFile -PathType Leaf)) { continue }
    $response = Get-Content -LiteralPath $responseFile -Raw | ConvertFrom-Json
    if (-not $response.ok) { throw "Packaged capture $Id failed: $($response.error)" }
    if (-not (Test-Path -LiteralPath $pngFile -PathType Leaf)) { throw "Packaged capture $Id returned no PNG." }
    $watch.Stop()
    return [ordered]@{ id=$Id; elapsedMs=$watch.Elapsed.TotalMilliseconds; file=(Split-Path $pngFile -Leaf); response=$response }
  }
  throw "Packaged capture $Id timed out after $TimeoutSeconds seconds."
}

function Assert-ExactPathRenderRevision($Record,[string]$PathId,[int]$ExpectedRevision) {
  $fixture = $Record.response.fixtureTelemetry
  if ($null -eq $fixture -or [int]$fixture.networkRevision -ne $ExpectedRevision -or [int]$fixture.sourceRevision -ne $ExpectedRevision) {
    throw "Capture $($Record.id) did not prove exact authoritative/compiled Path Network revision $ExpectedRevision."
  }
  $corridor = @($Record.response.renderTelemetry.pathwayCorridors | Where-Object { [string]$_.id -eq $PathId })[0]
  if ($null -eq $corridor -or [int]$corridor.sourceRevision -ne $ExpectedRevision -or [int]$corridor.renderer.sourceRevision -ne $ExpectedRevision) {
    throw "Capture $($Record.id) did not upload exact Path Network revision $ExpectedRevision to the packaged renderer."
  }
  return $true
}

function Assert-ProcessResponsive($Process,[int]$Port,[string]$RuntimeRoot,[string]$Stage) {
  if ($Process.HasExited) { throw "Packaged OmniForge exited during $Stage with code $($Process.ExitCode)." }
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $health = Invoke-Api $Port '/api/health' 'GET' $null 4
  $marker = Read-JsonFile (Join-Path $RuntimeRoot 'sessions\runtime.json')
  Assert-RuntimeIdentity $health $marker $Port $Stage
  $watch.Stop()
  if ($watch.Elapsed.TotalMilliseconds -gt 4000) { throw "Health request exceeded four seconds during $Stage." }
  return $watch.Elapsed.TotalMilliseconds
}

function Wait-HealthOffline([int]$Port,[int]$TimeoutSeconds=20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $consecutiveOfflineProbes = 0
  while ((Get-Date) -lt $deadline) {
    $portBindable = Test-PortBindable $Port
    $healthOnline = $false
    if (-not $portBindable) {
      try { Invoke-Api $Port '/api/health' 'GET' $null 1 | Out-Null; $healthOnline = $true } catch {}
    }
    if (-not $healthOnline -and $portBindable) { $consecutiveOfflineProbes++ }
    else { $consecutiveOfflineProbes = 0 }
    if ($consecutiveOfflineProbes -ge 4) {
      return [ordered]@{port=$Port;consecutiveOfflineProbes=$consecutiveOfflineProbes;portBindable=$true}
    }
    Start-Sleep -Milliseconds 150
  }
  throw "Packaged OmniForge server did not remain offline with a bindable port after its editor window closed on port $Port."
}

function Close-PackagedGracefully($Process,[int]$Port,[string]$RuntimeRoot,[string]$Stage) {
  if ($null -eq $Process) { throw "No packaged process was available during $Stage." }
  if ($Process.HasExited) { throw "Packaged OmniForge had already exited before $Stage with code $($Process.ExitCode)." }
  $processId = $Process.Id
  $requestedAt = (Get-Date).ToUniversalTime()
  if (-not $Process.CloseMainWindow()) { throw "Packaged OmniForge did not accept a graceful window close during $Stage." }
  if (-not $Process.WaitForExit(20000)) { throw "Packaged OmniForge did not exit within 20 seconds during $Stage." }
  $offline = Wait-HealthOffline $Port 20
  if ([int]$Process.ExitCode -ne 0) { throw "Packaged OmniForge exited non-cleanly during $Stage with code $($Process.ExitCode)." }
  $lifecycleFile = Join-Path $RuntimeRoot 'sessions\lifecycle.json'
  $lifecycle = Read-JsonFile $lifecycleFile
  if ([int]$lifecycle.pid -ne $processId -or $lifecycle.cleanShutdown -ne $true -or -not [string]$lifecycle.endedAt) {
    throw "Packaged OmniForge did not record a clean lifecycle marker for desktop PID $processId during $Stage."
  }
  [ordered]@{
    stage=$Stage;processId=$processId;requestedAt=$requestedAt.ToString('o')
    exitedAt=(Get-Date).ToUniversalTime().ToString('o');exitCode=$Process.ExitCode
    lifecycle=$lifecycle;offline=$offline
  }
}

function Stop-PackagedProcessTree($Process,[int]$Port,[string]$RuntimeRoot) {
  $runtimeMarker = Read-JsonFile (Join-Path $RuntimeRoot 'sessions\runtime.json') -AllowMissing
  $processIds = New-Object 'System.Collections.Generic.HashSet[int]'
  if ($null -ne $Process) { [void]$processIds.Add([int]$Process.Id) }
  if ($null -ne $runtimeMarker -and [int]$runtimeMarker.pid -gt 0) { [void]$processIds.Add([int]$runtimeMarker.pid) }
  $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
  foreach ($processId in $processIds) {
    if ($processId -le 0 -or $processId -eq $PID) { continue }
    $target = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $target) { continue }
    $killer = Start-Process -FilePath $taskkill -ArgumentList @('/PID',"$processId",'/T','/F') -WindowStyle Hidden -Wait -PassThru
    if ($killer.ExitCode -notin @(0,128)) { Write-Warning "taskkill returned $($killer.ExitCode) for packaged process tree $processId." }
  }
  if ($null -ne $Process -and -not $Process.HasExited) { [void]$Process.WaitForExit(10000) }
  return Wait-HealthOffline $Port 20
}

function Assert-PersistedPathFixture($State,[string]$PathId,[int]$MinimumNetworkRevision=0) {
  $activeScene = @($State.scenes | Where-Object { $_.id -eq $State.activeSceneId })[0]
  $pathObject = @($activeScene.objects | Where-Object { $_.id -eq $PathId -and $_.type -eq 'path' })[0]
  if ($null -eq $pathObject) { throw "Persisted Path Network fixture $PathId is missing." }
  $network = $pathObject.properties.pathNetwork
  $nodeIds = @($network.nodes | ForEach-Object { [string]$_.id })
  $segmentIds = @($network.segments | ForEach-Object { [string]$_.id })
  if (($nodeIds -join ',') -ne 'approach-west,approach-east') { throw "Persisted Path Network nodes changed: $($nodeIds -join ', ')." }
  if (($segmentIds -join ',') -ne 'bridge-showcase') { throw "Persisted Path Network segment changed: $($segmentIds -join ', ')." }
  if ([int]$network.revision -lt $MinimumNetworkRevision) { throw "Persisted Path Network revision $($network.revision) is older than $MinimumNetworkRevision." }
  $expectedPositions = @{ 'approach-west'=@(-55.0,0.0,0.0); 'approach-east'=@(55.0,0.0,0.0) }
  foreach ($node in @($network.nodes)) {
    $expected = $expectedPositions[[string]$node.id]
    for ($axis=0; $axis -lt 3; $axis++) {
      if ([Math]::Abs([double]$node.position[$axis] - [double]$expected[$axis]) -gt 0.005) {
        throw "Persisted node $($node.id) did not retain its restored authored position."
      }
    }
  }
  $segment = @($network.segments)[0]
  if ([string]$segment.structureProfile.bridgeStyle -ne 'steel-girder') { throw 'Persisted bridge family is not steel-girder.' }
  if ([string]$segment.surfaceDetailProfile.profileId -ne 'muddy-wagon-road') { throw 'Persisted path surface profile is not muddy-wagon-road.' }
  return $pathObject
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$repositoryRoot = (& git rev-parse --show-toplevel).Trim().Replace('/','\')
if ([IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\') -ne [IO.Path]::GetFullPath($root).TrimEnd('\')) {
  throw "Run this gate from the authoritative repository. Git reported $repositoryRoot."
}
$branch = (& git branch --show-current).Trim()
$head = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve the authoritative Git HEAD.' }

$packageRoot = Join-Path $root 'dist\OmniForge-win32-x64'
$executable = Join-Path $packageRoot 'OmniForge.exe'
$sourceCommitFile = Join-Path $packageRoot 'source-commit'
$sourceTreeFile = Join-Path $packageRoot 'source-tree'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Packaged executable is missing: $executable" }
if (-not (Test-Path -LiteralPath $sourceCommitFile -PathType Leaf)) { throw "Packaged source-commit is missing: $sourceCommitFile" }
if (-not (Test-Path -LiteralPath $sourceTreeFile -PathType Leaf)) { throw "Packaged source-tree is missing: $sourceTreeFile" }
$packagedCommit = (Get-Content -LiteralPath $sourceCommitFile -Raw).Trim()
$packagedSourceTree = (Get-Content -LiteralPath $sourceTreeFile -Raw).Trim()
$headSourceTree = ([string](& git rev-parse 'HEAD^{tree}')).Trim()
if ($LASTEXITCODE -ne 0 -or $headSourceTree -notmatch '^[0-9a-f]{40,64}$') { throw 'Could not resolve the authoritative Git source tree.' }
if ($packagedCommit -eq 'source-archive') { throw 'The package was built from source-archive instead of a real Git commit.' }
if ($packagedCommit -ne $head) { throw "Package identity mismatch: packaged $packagedCommit, repository $head." }
if ($packagedSourceTree -ne $headSourceTree) { throw "Package source-tree mismatch: packaged $packagedSourceTree, repository $headSourceTree." }
$packagedSourceAudit = Get-SourceTreeDigest $root (Join-Path $packageRoot 'resources\app')

$shortHead = $head.Substring(0,12)
$evidenceRoot = Join-Path $root "output\path-network-packaged-evidence\$shortHead"
$captureDir = Join-Path $evidenceRoot 'captures'
$runtimeRoot = Join-Path $env:TEMP "omniforge-path-evidence-$shortHead-$PID"
Remove-Item -LiteralPath $evidenceRoot,$runtimeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $captureDir,$runtimeRoot | Out-Null

$port = Get-FreePort
$process = $null
$records = New-Object System.Collections.Generic.List[object]
$interactionRecords = New-Object System.Collections.Generic.List[object]
$bridgeFamilyRecords = New-Object System.Collections.Generic.List[object]
$surfaceProfileRecords = New-Object System.Collections.Generic.List[object]
$restartRecord = $null
$cleanupFailure = $null
$startedAt = (Get-Date).ToUniversalTime()
$oldDataRoot = $env:OMNIFORGE_DATA_ROOT
$oldPort = $env:OMNIFORGE_PORT
$oldCaptureDir = $env:OMNIFORGE_CAPTURE_DIR
$oldDiagnostics = $env:OMNIFORGE_DIAGNOSTICS

try {
  $env:OMNIFORGE_DATA_ROOT = $runtimeRoot
  $env:OMNIFORGE_PORT = "$port"
  $env:OMNIFORGE_CAPTURE_DIR = $captureDir
  if ($Diagnostics) { $env:OMNIFORGE_DIAGNOSTICS = '1' } else { Remove-Item Env:OMNIFORGE_DIAGNOSTICS -ErrorAction SilentlyContinue }
  $process = Start-Process -FilePath $executable -WorkingDirectory $packageRoot -PassThru
  $health = Wait-PackagedHealth $process $port $runtimeRoot
  Start-Sleep -Seconds 3

  $state = Invoke-Api $port '/api/state'
  $scene = @($state.scenes | Where-Object { $_.id -eq $state.activeSceneId })[0]
  $terrain = @($scene.objects | Where-Object { $_.type -eq 'terrain' })[0]
  $path = @($scene.objects | Where-Object { $_.type -eq 'path' })[0]
  if ($null -eq $terrain -or $null -eq $path) { throw 'Starter terrain or Path Network is missing from the isolated packaged project.' }

  Invoke-Api $port "/api/v011/terrain/$($terrain.id)/sculpt" 'DELETE' @{} | Out-Null
  $terrainResult = Invoke-Api $port "/api/v011/terrain/$($terrain.id)" 'PATCH' @{
    properties = @{
      preset='plains';height=0;baseElevation=0;macroScale=240;detailScale=48;warpStrength=0
      ridgeStrength=0;plateauStrength=0;valleyStrength=0;canyonDepth=0;islandStrength=0
      resolution=144;chunkSize=32;seed=8128
    }
  }
  $gapResult = Invoke-Api $port "/api/v011/terrain/$($terrain.id)/sculpt" 'POST' @{
    mode='lower';x=0;z=0;radius=18;strength=12;falloff=0.78
  }
  $revision = [int64]$gapResult.state.engine.revision

  $networkResult = Invoke-Api $port "/api/v012/path/$($path.id)/network" 'PUT' @{
    expectedRevision = [int]$path.properties.pathNetwork.revision
    label = 'Install isolated packaged bridge evidence fixture'
    network = @{
      schemaVersion=2;id="$($path.id):network";revision=1
      nodes=@(
        @{id='approach-west';position=@(-55,0,0);heightMode='absolute';heightOffset=0;handleMode='automatic'},
        @{id='approach-east';position=@(55,0,0);heightMode='absolute';heightOffset=0;handleMode='automatic'}
      )
      segments=@(@{
        id='bridge-showcase';fromNode='approach-west';toNode='approach-east';curveType='cubic-hermite'
        constructionMode='auto';constructionLocked=$false
        crossSectionProfile=@{profileId='dirt-road';width=6;shoulderWidth=0.9;blendDistance=3.4;depth=0.24}
        structureProfile=@{bridgeStyle='steel-girder'}
        surfaceDetailProfile=@{profileId='muddy-wagon-road';seed=8128;puddleCoverage=0.28;wheelRutStrength=0.62;hoofPrintDensity=0.18;bootPrintDensity=0.12;weatherResponse=0.78}
        gameplayRules=@{vehicleClass='mixed';navigation=$true;collision=$true}
      })
      engineering=@{
        civilAssist=$true;maxGradePercent=12;maximumCut=5;maximumFill=2
        bridgeThreshold=3;minimumBridgeRunLength=7;bridgeIntervalPadding=0;maximumBridgeSpan=48
      }
      editor=@{showSpline=$true;showGrade=$true;showConstruction=$true}
    }
  }
  $revision = [int64]$networkResult.state.engine.revision
  $fixtureExpectation = New-ExpectedPathFixture $path.id ([string]$networkResult.network.id) 'steel-girder' ([int]$networkResult.network.revision)
  Invoke-Api $port '/api/selection' 'POST' @{objectId=$path.id} | Out-Null
  $worldResult = Invoke-Api $port '/api/v010/world' 'PATCH' @{
    lookPreset='clear-day';time=@{hours=12};weather=@{preset='clear';fog=0;wetness=.32}
    clouds=@{coverage=.08;density=.18};lighting=@{profile='quality'}
    atmosphere=@{haze=.004;mie=.025;humidity=.04;exposure=.9;saturation=1.03;contrast=1.03}
    sky=@{sunAzimuth=24;sunElevation=42;starIntensity=0;milkyWayIntensity=0}
  }
  $revision = [int64]$worldResult.state.engine.revision

  $target = [double[]]@(0,0,0)
  $views = @(
    @{id='01-approach';camera=(Get-LookCamera ([double[]]@(-62,3.2,5)) $target 66);guides=$false},
    @{id='02-side';camera=(Get-LookCamera ([double[]]@(0,9,34)) $target 62);guides=$false},
    @{id='03-rear';camera=(Get-LookCamera ([double[]]@(62,4,-5)) $target 66);guides=$false},
    @{id='04-elevated';camera=(Get-LookCamera ([double[]]@(0,48,28)) $target 58);guides=$false},
    @{id='05-underside';camera=(Get-LookCamera ([double[]]@(0,-5,20)) ([double[]]@(0,-1,0)) 70);guides=$false},
    @{id='06-player-level';camera=(Get-LookCamera ([double[]]@(-46,2.1,4)) ([double[]]@(4,0,0)) 72);guides=$false}
  )
  foreach ($view in $views) {
    $captureOptions = @{
      camera=$view.camera;hideGuides=(-not $view.guides);hideEditorReferences=$true;waitMs=1400
      minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    }
    if ($view.id -eq '01-approach') {
      # The isolated data root represents a genuine first launch. Dismiss the
      # tutorial through its real native Skip button before any native spline
      # input so the proof run exercises the editor rather than its backdrop.
      $captureOptions.nativeInputActions = @(@{type='dismiss-first-use-tutorial'})
    }
    $record = Request-Capture $captureDir $view.id $captureOptions
    $records.Add($record)
    if ($view.id -in @('01-approach','02-side','05-underside')) {
      $bridgeFamilyRecords.Add([ordered]@{
        style='steel-girder';spanRadius=18;width=6;vehicleClass='mixed'
        view=$view.id;capture=$record.file
      })
    }
    Assert-ProcessResponsive $process $port $runtimeRoot $view.id | Out-Null
  }

  $guideRecord = Request-Capture $captureDir '07-editor-guides-elevated' @{
    camera=(Get-LookCamera ([double[]]@(0,42,22)) $target 58);hideGuides=$false;hideEditorReferences=$true;waitMs=900
    minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    actions=@(
      @{type='select';objectId=$path.id;waitMs=180},
      @{type='click';target='pathEdit';waitMs=350}
    )
  }
  $records.Add($guideRecord)

  $nativeHorizontalRecord = Request-Capture $captureDir '08a-native-horizontal-moved' @{
    camera=(Get-LookCamera ([double[]]@(-55,22,30)) ([double[]]@(-55,0,0)) 68)
    hideGuides=$false;hideEditorReferences=$false;waitMs=900;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    nativeInputActions=@(@{type='path-node-drag';pathId=$path.id;nodeIndex=0;dx=54;dy=10;vertical=$false;undo=$false})
  }
  $records.Add($nativeHorizontalRecord)
  if (@($nativeHorizontalRecord.response.nativeInputTelemetry).Count -ne 1) { throw 'The packaged native-input gate did not report the horizontal spline-node drag.' }
  $horizontalTelemetry = @($nativeHorizontalRecord.response.nativeInputTelemetry)[0]
  if ([double]$horizontalTelemetry.horizontalDelta -lt 0.01) { throw 'The packaged horizontal spline-node drag did not move its authored node.' }
  $horizontalPosition = @($horizontalTelemetry.after.position | ForEach-Object { [double]$_ })
  if ($horizontalPosition.Count -ne 3) { throw 'The packaged horizontal spline-node drag did not report one finite 3D node position.' }
  $fixtureExpectation.minimumNetworkRevision = [int]$nativeHorizontalRecord.response.fixtureTelemetry.networkRevision
  Assert-ExactPathRenderRevision $nativeHorizontalRecord $path.id ([int]$fixtureExpectation.minimumNetworkRevision) | Out-Null
  $interactionRecords.Add([ordered]@{
    id='08a-native-horizontal-moved';elapsedMs=$nativeHorizontalRecord.elapsedMs
    healthMs=(Assert-ProcessResponsive $process $port $runtimeRoot 'native horizontal node drag')
    telemetry=$nativeHorizontalRecord.response.nativeInputTelemetry
  })

  $nativeVerticalRecord = Request-Capture $captureDir '08b-native-vertical-moved' @{
    camera=(Get-LookCamera ([double[]]@($horizontalPosition[0],$horizontalPosition[1]+22,$horizontalPosition[2]+30)) ([double[]]$horizontalPosition) 68)
    hideGuides=$false;hideEditorReferences=$false;waitMs=900;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    # Sixteen native pixels maps to +2.4 m in the viewport's vertical gizmo.
    # The exact evidence fixture remains Civil-Assist-valid at this height while
    # still producing an unmistakable authored elevation change in the capture.
    nativeInputActions=@(@{type='path-node-drag';pathId=$path.id;nodeIndex=0;dx=0;dy=-16;vertical=$true;undo=$false})
  }
  $records.Add($nativeVerticalRecord)
  if (@($nativeVerticalRecord.response.nativeInputTelemetry).Count -ne 1) { throw 'The packaged native-input gate did not report the vertical spline-node drag.' }
  $verticalTelemetry = @($nativeVerticalRecord.response.nativeInputTelemetry)[0]
  if ([double]$verticalTelemetry.verticalDelta -lt 0.01) { throw 'The packaged vertical spline-node drag did not raise or lower its authored node.' }
  $fixtureExpectation.minimumNetworkRevision = [int]$nativeVerticalRecord.response.fixtureTelemetry.networkRevision
  Assert-ExactPathRenderRevision $nativeVerticalRecord $path.id ([int]$fixtureExpectation.minimumNetworkRevision) | Out-Null
  $interactionRecords.Add([ordered]@{
    id='08b-native-vertical-moved';elapsedMs=$nativeVerticalRecord.elapsedMs
    healthMs=(Assert-ProcessResponsive $process $port $runtimeRoot 'native vertical node drag')
    telemetry=$nativeVerticalRecord.response.nativeInputTelemetry
  })

  $nativeRestoreRecord = Request-Capture $captureDir '08c-native-drag-restored' @{
    camera=(Get-LookCamera ([double[]]@(0,62,55)) $target 82)
    hideGuides=$false;hideEditorReferences=$false;waitMs=900;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    nativeInputActions=@(
      @{type='path-undo';pathId=$path.id;nodeIndex=0;expectedPosition=$horizontalPosition},
      @{type='path-undo';pathId=$path.id;nodeIndex=0;expectedPosition=@(-55,0,0)}
    )
  }
  $records.Add($nativeRestoreRecord)
  if (@($nativeRestoreRecord.response.nativeInputTelemetry).Count -ne 2) { throw 'The packaged native-input gate did not report both real Undo controls.' }
  foreach ($nativeResult in @($nativeRestoreRecord.response.nativeInputTelemetry)) {
    if (-not $nativeResult.undoVerified) { throw 'The packaged native-input gate did not prove Undo restored a dragged spline node.' }
  }
  $fixtureExpectation.minimumNetworkRevision = [int]$nativeRestoreRecord.response.fixtureTelemetry.networkRevision
  Assert-ExactPathRenderRevision $nativeRestoreRecord $path.id ([int]$fixtureExpectation.minimumNetworkRevision) | Out-Null
  $interactionRecords.Add([ordered]@{
    id='08c-native-drag-restored';elapsedMs=$nativeRestoreRecord.elapsedMs
    healthMs=(Assert-ProcessResponsive $process $port $runtimeRoot 'native path Undo restoration')
    telemetry=$nativeRestoreRecord.response.nativeInputTelemetry
  })

  # Each production bridge family gets its own span/width-appropriate scene in
  # the same exact packaged executable. This is visual evidence, not a mock
  # mesh: every fixture passes through Civil Assist, the authoritative terrain
  # modifier, the shared road/deck taper, shadows, and the runtime renderer.
  $familyFixtures = @(
    @{slug='timber-trestle';style='timber-trestle';radius=7.0;depth=7.0;width=4.5;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='stone-arch';style='stone-arch';radius=10.0;depth=8.0;width=7.0;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='masonry-causeway';style='masonry-causeway';radius=8.0;depth=6.0;width=6.0;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='rope-footbridge';style='rope-footbridge';radius=11.0;depth=9.0;width=2.1;vehicleClass='pedestrian';profileId='natural-trail'}
  )
  foreach ($fixture in $familyFixtures) {
    Invoke-Api $port "/api/v011/terrain/$($terrain.id)/sculpt" 'DELETE' @{} | Out-Null
    $familyGap = Invoke-Api $port "/api/v011/terrain/$($terrain.id)/sculpt" 'POST' @{
      mode='lower';x=0;z=0;radius=$fixture.radius;strength=$fixture.depth;falloff=0.78
    }
    $currentNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
    $familyNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network" 'PUT' @{
      expectedRevision=[int]$currentNetwork.network.revision
      label="Install packaged $($fixture.style) evidence fixture"
      network=@{
        schemaVersion=2;id="$($path.id):network";revision=[int]$currentNetwork.network.revision
        nodes=@(
          @{id='approach-west';position=@(-55,0,0);heightMode='absolute';heightOffset=0;handleMode='automatic'},
          @{id='approach-east';position=@(55,0,0);heightMode='absolute';heightOffset=0;handleMode='automatic'}
        )
        segments=@(@{
          id='bridge-showcase';fromNode='approach-west';toNode='approach-east';curveType='cubic-hermite'
          constructionMode='auto';constructionLocked=$false
          crossSectionProfile=@{profileId=$fixture.profileId;width=$fixture.width;shoulderWidth=0.75;blendDistance=3.2;depth=0.22}
          structureProfile=@{bridgeStyle=$fixture.style}
          surfaceDetailProfile=@{profileId='weathered-dirt-road';seed=8128;puddleCoverage=0.16;wheelRutStrength=0.34;hoofPrintDensity=0.12;bootPrintDensity=0.1;weatherResponse=0.8}
          gameplayRules=@{vehicleClass=$fixture.vehicleClass;navigation=$true;collision=$true}
        })
        engineering=@{
          civilAssist=$true;maxGradePercent=12;maximumCut=5;maximumFill=2
          bridgeThreshold=3;minimumBridgeRunLength=5;bridgeIntervalPadding=0;maximumBridgeSpan=48
        }
        editor=@{showSpline=$true;showGrade=$true;showConstruction=$true}
      }
    }
    $revision = [int64]$familyNetwork.state.engine.revision
    $fixtureExpectation = New-ExpectedPathFixture $path.id ([string]$familyNetwork.network.id) $fixture.style ([int]$familyNetwork.network.revision) 'weathered-dirt-road' ([double]$fixture.width)
    foreach ($familyView in @(
      @{suffix='approach';camera=(Get-LookCamera ([double[]]@(-36,3.4,10)) $target 65)},
      @{suffix='side';camera=(Get-LookCamera ([double[]]@(0,10,29)) $target 62)},
      @{suffix='underside';camera=(Get-LookCamera ([double[]]@(0,-3,18)) ([double[]]@(0,-1,0)) 68)}
    )) {
      $familyId = "family-$($fixture.slug)-$($familyView.suffix)"
      $familyCapture = Request-Capture $captureDir $familyId @{
        camera=$familyView.camera;hideGuides=$true;hideEditorReferences=$true;waitMs=1100
        minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
      }
      $records.Add($familyCapture)
      $bridgeFamilyRecords.Add([ordered]@{
        style=$fixture.style;spanRadius=$fixture.radius;width=$fixture.width;vehicleClass=$fixture.vehicleClass
        view=$familyView.suffix;capture=$familyCapture.file
      })
      Assert-ProcessResponsive $process $port $runtimeRoot $familyId | Out-Null
    }
  }

  # Restore the primary steel fixture before the sustained interaction and
  # persistence gate so the final saved state is deterministic.
  Invoke-Api $port "/api/v011/terrain/$($terrain.id)/sculpt" 'DELETE' @{} | Out-Null
  $restoredGap = Invoke-Api $port "/api/v011/terrain/$($terrain.id)/sculpt" 'POST' @{
    mode='lower';x=0;z=0;radius=18;strength=12;falloff=0.78
  }
  $currentNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
  $restoredSteel = Invoke-Api $port "/api/v012/path/$($path.id)/network" 'PUT' @{
    expectedRevision=[int]$currentNetwork.network.revision
    label='Restore primary packaged steel bridge fixture'
    network=@{
      schemaVersion=2;id="$($path.id):network";revision=[int]$currentNetwork.network.revision
      nodes=@(
        @{id='approach-west';position=@(-55,0,0);heightMode='absolute';heightOffset=0;handleMode='automatic'},
        @{id='approach-east';position=@(55,0,0);heightMode='absolute';heightOffset=0;handleMode='automatic'}
      )
      segments=@(@{
        id='bridge-showcase';fromNode='approach-west';toNode='approach-east';curveType='cubic-hermite'
        constructionMode='auto';constructionLocked=$false
        crossSectionProfile=@{profileId='dirt-road';width=6;shoulderWidth=0.9;blendDistance=3.4;depth=0.24}
        structureProfile=@{bridgeStyle='steel-girder'}
        surfaceDetailProfile=@{profileId='muddy-wagon-road';seed=8128;puddleCoverage=0.28;wheelRutStrength=0.62;hoofPrintDensity=0.18;bootPrintDensity=0.12;weatherResponse=0.78}
        gameplayRules=@{vehicleClass='mixed';navigation=$true;collision=$true}
      })
      engineering=@{
        civilAssist=$true;maxGradePercent=12;maximumCut=5;maximumFill=2
        bridgeThreshold=3;minimumBridgeRunLength=7;bridgeIntervalPadding=0;maximumBridgeSpan=48
      }
      editor=@{showSpline=$true;showGrade=$true;showConstruction=$true}
    }
  }
  $revision = [int64]$restoredSteel.state.engine.revision
  $fixtureExpectation = New-ExpectedPathFixture $path.id ([string]$restoredSteel.network.id) 'steel-girder' ([int]$restoredSteel.network.revision)
  $surfaceCapture = Request-Capture $captureDir '10-surface-details-close' @{
    camera=(Get-LookCamera ([double[]]@(-42,2.6,5.5)) ([double[]]@(-25,0,0)) 66)
    hideGuides=$true;hideEditorReferences=$true;waitMs=1400;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
  }
  $records.Add($surfaceCapture)
  Assert-ProcessResponsive $process $port $runtimeRoot 'surface detail close-up' | Out-Null

  # Surface character is inspected on the real compiled approach rather than
  # in an isolated material sphere. Each profile uses deterministic authored
  # metre-scale data and the same road, terrain, lighting, and weather state.
  $surfaceFixtures = @(
    @{slug='weathered';profileId='weathered-dirt-road';values=@{seed=8128;puddleCoverage=.05;puddleScale=3.5;puddleDepth=.012;wheelRutStrength=.22;wheelTrackGauge=1.45;wheelRutWidth=.16;hoofPrintDensity=0;hoofPrintScale=.18;bootPrintDensity=.08;bootPrintScale=.26;erosionStrength=.25;detailNormalStrength=.48;weatherResponse=.8}},
    @{slug='muddy-wagon';profileId='muddy-wagon-road';values=@{seed=8128;puddleCoverage=.32;puddleScale=3.1;puddleDepth=.038;wheelRutStrength=.72;wheelTrackGauge=1.45;wheelRutWidth=.2;hoofPrintDensity=.18;hoofPrintScale=.18;bootPrintDensity=.12;bootPrintScale=.26;erosionStrength=.32;detailNormalStrength=.72;weatherResponse=1.15}},
    @{slug='hoof-trail';profileId='hoof-trail';values=@{seed=8128;puddleCoverage=.08;puddleScale=2.4;puddleDepth=.018;wheelRutStrength=.05;wheelTrackGauge=1.2;wheelRutWidth=.1;hoofPrintDensity=.78;hoofPrintScale=.18;bootPrintDensity=.04;bootPrintScale=.25;erosionStrength=.18;detailNormalStrength=.62;weatherResponse=.9}},
    @{slug='walked-footpath';profileId='walked-footpath';values=@{seed=8128;puddleCoverage=.03;puddleScale=2.2;puddleDepth=.01;wheelRutStrength=0;wheelTrackGauge=1.1;wheelRutWidth=.08;hoofPrintDensity=.03;hoofPrintScale=.18;bootPrintDensity=.82;bootPrintScale=.27;erosionStrength=.22;detailNormalStrength=.58;weatherResponse=.72}}
  )
  foreach ($surfaceFixture in $surfaceFixtures) {
    $currentNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
    $profileValues = @{profileId=$surfaceFixture.profileId}
    foreach ($entry in $surfaceFixture.values.GetEnumerator()) { $profileValues[$entry.Key] = $entry.Value }
    $surfaceResult = Invoke-Api $port "/api/v012/path/$($path.id)/transaction" 'POST' @{
      expectedRevision=[int]$currentNetwork.network.revision
      label="Inspect packaged $($surfaceFixture.profileId) surface character"
      operations=@(@{
        type='set-segment-surface-detail';segmentId='bridge-showcase'
        profileId=$surfaceFixture.profileId;surfaceDetailProfile=$profileValues
      })
    }
    $revision = [int64]$surfaceResult.state.engine.revision
    $fixtureExpectation = New-ExpectedPathFixture $path.id ([string]$surfaceResult.network.id) 'steel-girder' ([int]$surfaceResult.network.revision) $surfaceFixture.profileId 6
    $surfaceId = "surface-$($surfaceFixture.slug)"
    $surfaceRecord = Request-Capture $captureDir $surfaceId @{
      camera=(Get-LookCamera ([double[]]@(-36,8.5,9.5)) ([double[]]@(-25,0,0)) 54)
      hideGuides=$true;hideEditorReferences=$true;waitMs=1100;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    }
    $records.Add($surfaceRecord)
    $surfaceProfileRecords.Add([ordered]@{
      profileId=$surfaceFixture.profileId;capture=$surfaceRecord.file;parameters=$profileValues
    })
    Assert-ProcessResponsive $process $port $runtimeRoot $surfaceId | Out-Null
  }

  # Leave the sustained-edit and persistence gate on the deliberately rich
  # muddy-wagon profile used by the primary fixture.
  $currentNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
  $restoredSurface = Invoke-Api $port "/api/v012/path/$($path.id)/transaction" 'POST' @{
    expectedRevision=[int]$currentNetwork.network.revision
    label='Restore primary packaged muddy-wagon surface character'
    operations=@(@{
      type='set-segment-surface-detail';segmentId='bridge-showcase';profileId='muddy-wagon-road'
      surfaceDetailProfile=@{profileId='muddy-wagon-road';seed=8128;puddleCoverage=.28;wheelRutStrength=.62;hoofPrintDensity=.18;bootPrintDensity=.12;weatherResponse=.78}
    })
  }
  $revision = [int64]$restoredSurface.state.engine.revision
  $fixtureExpectation = New-ExpectedPathFixture $path.id ([string]$restoredSurface.network.id) 'steel-girder' ([int]$restoredSurface.network.revision)

  $interactionWatch = [Diagnostics.Stopwatch]::StartNew()
  $cycle = 0
  $pathIsMoved = $false
  $targets = @('hierarchy','create','assets','integrations','world','ai','console','jobs','worldSettings')
  while ($interactionWatch.Elapsed.TotalSeconds -lt [Math]::Max(0,$DurationSeconds)) {
    $cycle++
    $state = Invoke-Api $port '/api/state'
    $revision = [int64]$state.engine.revision
    $targetName = $targets[($cycle-1) % $targets.Count]
    $actions = New-Object System.Collections.Generic.List[object]
    $actions.Add(@{type='click';target=$targetName;waitMs=100})
    $actions.Add(@{type='viewport-navigate';keys=@($(if($cycle%2){'KeyW'}else{'KeyD'}),'ShiftLeft');durationMs=260;lookX=$(if($cycle%2){18}else{-18});lookY=$(if($cycle%3){-5}else{7})})
    if ($pathIsMoved) {
      $actions.Add(@{type='path-undo';pathId=$path.id})
      $pathIsMoved = $false
    } else {
      $offset = if ($cycle % 4 -lt 2) { 3 } else { -3 }
      $actions.Add(@{
        type='path-transaction';pathId=$path.id;label="Packaged responsiveness move $cycle"
        operations=@(@{type='move-node';nodeId='approach-east';position=@(55,0,$offset);heightMode='absolute';heightOffset=0})
      })
      $pathIsMoved = $true
    }
    $id = 'interaction-{0:d2}' -f $cycle
    $record = Request-Capture $captureDir $id @{
      hideGuides=$false;hideEditorReferences=$true;waitMs=260;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation;actions=$actions.ToArray()
    }
    $records.Add($record)
    $pathActionTelemetry = @($record.response.interactionTelemetry | Where-Object { $_.type -in @('path-transaction','path-undo') })
    if ($pathActionTelemetry.Count -ne 1) { throw "Interaction cycle $cycle did not report exactly one Path Network mutation." }
    $postActionNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
    $postActionRevision = [int]$postActionNetwork.network.revision
    if ([int]$pathActionTelemetry[0].result.afterRevision -ne $postActionRevision) {
      throw "Interaction cycle $cycle reported revision $($pathActionTelemetry[0].result.afterRevision), but authority is revision $postActionRevision."
    }
    $postActionState = Invoke-Api $port '/api/state'
    $revision = [int64]$postActionState.engine.revision
    $fixtureExpectation.minimumNetworkRevision = $postActionRevision
    Assert-ExactPathRenderRevision $record $path.id $postActionRevision | Out-Null
    $interactionRecords.Add([ordered]@{
      id=$id;elapsedMs=$record.elapsedMs;healthMs=(Assert-ProcessResponsive $process $port $runtimeRoot $id)
      telemetry=$record.response.interactionTelemetry;renderProof=$record.file;exactNetworkRevision=$postActionRevision
    })
    if ($record.elapsedMs -gt 20000) { throw "Interaction cycle $cycle exceeded the 20-second responsiveness ceiling." }
    if ($interactionWatch.Elapsed.TotalSeconds -lt $DurationSeconds) { Start-Sleep -Seconds 4 }
  }
  $interactionWatch.Stop()

  $state = Invoke-Api $port '/api/state'
  $revision = [int64]$state.engine.revision
  if ($pathIsMoved) {
    $currentNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
    $restoredInteraction = Invoke-Api $port "/api/v012/path/$($path.id)/undo" 'POST' @{
      expectedRevision=[int]$currentNetwork.network.revision
    }
    $revision = [int64]$restoredInteraction.state.engine.revision
    $fixtureExpectation.minimumNetworkRevision = [int]$restoredInteraction.network.revision
    $pathIsMoved = $false
  }
  $finalRecord = Request-Capture $captureDir '09-restored-and-saved' @{
    camera=(Get-LookCamera ([double[]]@(0,18,36)) $target 62);hideGuides=$true;hideEditorReferences=$true;waitMs=1000
    minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    nativeInputActions=@(@{type='click-control';selector='#saveButton';label='Save';waitMs=1400})
  }
  $records.Add($finalRecord)
  $saveTelemetry = @($finalRecord.response.nativeInputTelemetry | Where-Object { $_.type -eq 'click-control' -and $_.selector -eq '#saveButton' })
  if ($saveTelemetry.Count -ne 1 -or $saveTelemetry[0].saveVerified -ne $true) {
    throw 'The final packaged Save gate did not prove exactly one native Save click.'
  }
  if ([int64]$saveTelemetry[0].saveAfter.revision -le [int64]$saveTelemetry[0].saveBefore.revision -or
      -not [string]$saveTelemetry[0].saveAfter.activityId -or
      [string]$saveTelemetry[0].saveAfter.badgeText -ne 'Saved') {
    throw 'The final packaged Save gate did not prove /api/scene/save revision, activity, and Saved badge evidence.'
  }
  Assert-ProcessResponsive $process $port $runtimeRoot 'final save' | Out-Null

  $finalState = Invoke-Api $port '/api/state'
  $finalPath = Assert-PersistedPathFixture $finalState $path.id ([int]$fixtureExpectation.minimumNetworkRevision)
  $east = @($finalPath.properties.pathNetwork.nodes | Where-Object { $_.id -eq 'approach-east' })[0]
  if ([Math]::Abs([double]$east.position[2]) -gt 0.001) { throw 'The interaction loop did not restore the authored bridge endpoint before Save.' }

  $savedNetworkRevision = [int]$finalPath.properties.pathNetwork.revision
  $initialCloseRecord = Close-PackagedGracefully $process $port $runtimeRoot 'saved editor restart gate'
  $process = $null
  $process = Start-Process -FilePath $executable -WorkingDirectory $packageRoot -PassThru
  $restartHealth = Wait-PackagedHealth $process $port $runtimeRoot
  Start-Sleep -Seconds 3
  $restartState = Invoke-Api $port '/api/state'
  $restartPath = Assert-PersistedPathFixture $restartState $path.id $savedNetworkRevision
  $fixtureExpectation.minimumNetworkRevision = [int]$restartPath.properties.pathNetwork.revision
  $restartRecord = Request-Capture $captureDir '11-restarted-persisted' @{
    camera=(Get-LookCamera ([double[]]@(0,18,36)) $target 62);hideGuides=$true;hideEditorReferences=$true;waitMs=1400
    minimumRevision=[int64]$restartState.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
  }
  $records.Add($restartRecord)
  Assert-ProcessResponsive $process $port $runtimeRoot 'restarted persisted fixture' | Out-Null
  $restartCloseRecord = Close-PackagedGracefully $process $port $runtimeRoot 'completed restarted evidence'
  $process = $null

  $manifest = [ordered]@{
    repositoryRoot=$root;branch=$branch;sourceCommit=$head;sourceTree=$headSourceTree
    packagedSourceCommit=$packagedCommit;packagedSourceTree=$packagedSourceTree;packagedSourceAudit=$packagedSourceAudit
    executable=$executable;port=$port;startedAt=$startedAt.ToString('o');finishedAt=(Get-Date).ToUniversalTime().ToString('o')
    diagnosticMode=[bool]$Diagnostics;durationSeconds=$interactionWatch.Elapsed.TotalSeconds
    fixture=@{terrainId=$terrain.id;pathId=$path.id;gap=@{center=@(0,0);radius=18;depth=12};bridgeStyle='steel-girder'}
    captures=$records;interactions=$interactionRecords;bridgeFamilies=$bridgeFamilyRecords;surfaceProfiles=$surfaceProfileRecords
    finalNetworkRevision=[int]$finalPath.properties.pathNetwork.revision;finalEndpoint=@($east.position);saveEvidence=$saveTelemetry[0]
    health=$health;restartHealth=$restartHealth;restartCapture=$restartRecord
    gracefulShutdowns=@($initialCloseRecord,$restartCloseRecord)
  }
  $manifest | ConvertTo-Json -Depth 64 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'manifest.json') -Encoding UTF8
} finally {
  try { Stop-PackagedProcessTree $process $port $runtimeRoot | Out-Null }
  catch { $cleanupFailure = $_.Exception.Message; Write-Warning "Packaged process-tree cleanup failed: $cleanupFailure" }
  $runtimeEvidence = Join-Path $evidenceRoot 'runtime-evidence'
  New-Item -ItemType Directory -Force -Path $runtimeEvidence | Out-Null
  foreach ($name in @('logs','incidents','crashes','sessions')) {
    $source = Join-Path $runtimeRoot $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $runtimeEvidence -Recurse -Force }
  }
  if ($null -eq $oldDataRoot) { Remove-Item Env:OMNIFORGE_DATA_ROOT -ErrorAction SilentlyContinue } else { $env:OMNIFORGE_DATA_ROOT=$oldDataRoot }
  if ($null -eq $oldPort) { Remove-Item Env:OMNIFORGE_PORT -ErrorAction SilentlyContinue } else { $env:OMNIFORGE_PORT=$oldPort }
  if ($null -eq $oldCaptureDir) { Remove-Item Env:OMNIFORGE_CAPTURE_DIR -ErrorAction SilentlyContinue } else { $env:OMNIFORGE_CAPTURE_DIR=$oldCaptureDir }
  if ($null -eq $oldDiagnostics) { Remove-Item Env:OMNIFORGE_DIAGNOSTICS -ErrorAction SilentlyContinue } else { $env:OMNIFORGE_DIAGNOSTICS=$oldDiagnostics }
  Remove-Item -LiteralPath $runtimeRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if ($cleanupFailure) { throw "Packaged evidence cleanup did not complete: $cleanupFailure" }

Write-Host "Packaged Path Network evidence written to $evidenceRoot"
