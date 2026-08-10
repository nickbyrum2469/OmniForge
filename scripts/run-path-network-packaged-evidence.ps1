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

function Wait-Health([int]$Port,[int]$TimeoutSeconds=60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    try { return Invoke-Api $Port '/api/health' 'GET' $null 2 }
    catch {}
  }
  throw "Packaged OmniForge did not become healthy on port $Port."
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

function Assert-ProcessResponsive($Process,[int]$Port,[string]$Stage) {
  if ($Process.HasExited) { throw "Packaged OmniForge exited during $Stage with code $($Process.ExitCode)." }
  $watch = [Diagnostics.Stopwatch]::StartNew()
  Invoke-Api $Port '/api/health' 'GET' $null 4 | Out-Null
  $watch.Stop()
  if ($watch.Elapsed.TotalMilliseconds -gt 4000) { throw "Health request exceeded four seconds during $Stage." }
  return $watch.Elapsed.TotalMilliseconds
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
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Packaged executable is missing: $executable" }
if (-not (Test-Path -LiteralPath $sourceCommitFile -PathType Leaf)) { throw "Packaged source-commit is missing: $sourceCommitFile" }
$packagedCommit = (Get-Content -LiteralPath $sourceCommitFile -Raw).Trim()
if ($packagedCommit -eq 'source-archive') { throw 'The package was built from source-archive instead of a real Git commit.' }
if ($packagedCommit -ne $head) { throw "Package identity mismatch: packaged $packagedCommit, repository $head." }

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
  $health = Wait-Health $port
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
      minimumRevision=$revision;revisionTimeoutMs=20000
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
    Assert-ProcessResponsive $process $port $view.id | Out-Null
  }

  $guideRecord = Request-Capture $captureDir '07-editor-guides-elevated' @{
    camera=(Get-LookCamera ([double[]]@(0,42,22)) $target 58);hideGuides=$false;hideEditorReferences=$true;waitMs=900
    minimumRevision=$revision;revisionTimeoutMs=20000
    actions=@(
      @{type='select';objectId=$path.id;waitMs=180},
      @{type='click';target='pathEdit';waitMs=350}
    )
  }
  $records.Add($guideRecord)

  $nativeDragRecord = Request-Capture $captureDir '08-native-node-drag-undo' @{
    hideGuides=$false;hideEditorReferences=$false;waitMs=700;minimumRevision=$revision;revisionTimeoutMs=20000
    nativeInputActions=@(
      @{type='path-node-drag';pathId=$path.id;nodeIndex=0;dx=54;dy=10;vertical=$false;undo=$true},
      @{type='path-node-drag';pathId=$path.id;nodeIndex=1;dx=0;dy=-48;vertical=$true;undo=$true}
    )
  }
  $records.Add($nativeDragRecord)
  $interactionRecords.Add([ordered]@{
    id='08-native-node-drag-undo';elapsedMs=$nativeDragRecord.elapsedMs
    healthMs=(Assert-ProcessResponsive $process $port 'native node drag and Undo')
    telemetry=$nativeDragRecord.response.nativeInputTelemetry
  })
  if (@($nativeDragRecord.response.nativeInputTelemetry).Count -ne 2) { throw 'The packaged native-input gate did not report both horizontal and vertical spline-node drags.' }
  foreach ($nativeResult in @($nativeDragRecord.response.nativeInputTelemetry)) {
    if (-not $nativeResult.undoVerified) { throw 'The packaged native-input gate did not prove Undo restored a dragged spline node.' }
  }

  # Each production bridge family gets its own span/width-appropriate scene in
  # the same exact packaged executable. This is visual evidence, not a mock
  # mesh: every fixture passes through Civil Assist, the authoritative terrain
  # modifier, the shared road/deck taper, shadows, and the runtime renderer.
  $familyFixtures = @(
    @{slug='timber-trestle';style='timber-trestle';radius=7.0;depth=7.0;width=4.5;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='stone-arch';style='stone-arch';radius=10.0;depth=8.0;width=7.0;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='masonry-causeway';style='masonry-causeway';radius=5.0;depth=4.5;width=6.0;vehicleClass='mixed';profileId='dirt-road'},
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
    foreach ($familyView in @(
      @{suffix='approach';camera=(Get-LookCamera ([double[]]@(-36,3.4,10)) $target 65)},
      @{suffix='side';camera=(Get-LookCamera ([double[]]@(0,10,29)) $target 62)},
      @{suffix='underside';camera=(Get-LookCamera ([double[]]@(0,-3,18)) ([double[]]@(0,-1,0)) 68)}
    )) {
      $familyId = "family-$($fixture.slug)-$($familyView.suffix)"
      $familyCapture = Request-Capture $captureDir $familyId @{
        camera=$familyView.camera;hideGuides=$true;hideEditorReferences=$true;waitMs=1100
        minimumRevision=$revision;revisionTimeoutMs=20000
      }
      $records.Add($familyCapture)
      $bridgeFamilyRecords.Add([ordered]@{
        style=$fixture.style;spanRadius=$fixture.radius;width=$fixture.width;vehicleClass=$fixture.vehicleClass
        view=$familyView.suffix;capture=$familyCapture.file
      })
      Assert-ProcessResponsive $process $port $familyId | Out-Null
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
  $surfaceCapture = Request-Capture $captureDir '10-surface-details-close' @{
    camera=(Get-LookCamera ([double[]]@(-42,2.6,5.5)) ([double[]]@(-25,0,0)) 66)
    hideGuides=$true;hideEditorReferences=$true;waitMs=1400;minimumRevision=$revision;revisionTimeoutMs=20000
  }
  $records.Add($surfaceCapture)
  Assert-ProcessResponsive $process $port 'surface detail close-up' | Out-Null

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
    $surfaceId = "surface-$($surfaceFixture.slug)"
    $surfaceRecord = Request-Capture $captureDir $surfaceId @{
      camera=(Get-LookCamera ([double[]]@(-36,8.5,9.5)) ([double[]]@(-25,0,0)) 54)
      hideGuides=$true;hideEditorReferences=$true;waitMs=1100;minimumRevision=$revision;revisionTimeoutMs=20000
    }
    $records.Add($surfaceRecord)
    $surfaceProfileRecords.Add([ordered]@{
      profileId=$surfaceFixture.profileId;capture=$surfaceRecord.file;parameters=$profileValues
    })
    Assert-ProcessResponsive $process $port $surfaceId | Out-Null
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
      hideGuides=$false;hideEditorReferences=$true;waitMs=260;minimumRevision=$revision;revisionTimeoutMs=20000;actions=$actions.ToArray()
    }
    $records.Add($record)
    $interactionRecords.Add([ordered]@{
      id=$id;elapsedMs=$record.elapsedMs;healthMs=(Assert-ProcessResponsive $process $port $id)
      telemetry=$record.response.interactionTelemetry
    })
    if ($record.elapsedMs -gt 20000) { throw "Interaction cycle $cycle exceeded the 20-second responsiveness ceiling." }
    if ($interactionWatch.Elapsed.TotalSeconds -lt $DurationSeconds) { Start-Sleep -Seconds 4 }
  }
  $interactionWatch.Stop()

  $state = Invoke-Api $port '/api/state'
  $revision = [int64]$state.engine.revision
  $finalActions = New-Object System.Collections.Generic.List[object]
  if ($pathIsMoved) { $finalActions.Add(@{type='path-undo';pathId=$path.id}) }
  $finalActions.Add(@{type='click';target='save';waitMs=250})
  $finalActions.Add(@{type='save';message='Packaged path evidence saved'})
  $finalRecord = Request-Capture $captureDir '09-restored-and-saved' @{
    camera=(Get-LookCamera ([double[]]@(0,18,36)) $target 62);hideGuides=$true;hideEditorReferences=$true;waitMs=1000
    minimumRevision=$revision;revisionTimeoutMs=20000;actions=$finalActions.ToArray()
  }
  $records.Add($finalRecord)
  Assert-ProcessResponsive $process $port 'final save' | Out-Null

  $finalState = Invoke-Api $port '/api/state'
  $finalPath = @((@($finalState.scenes | Where-Object { $_.id -eq $finalState.activeSceneId })[0]).objects | Where-Object { $_.id -eq $path.id })[0]
  $east = @($finalPath.properties.pathNetwork.nodes | Where-Object { $_.id -eq 'approach-east' })[0]
  if ([Math]::Abs([double]$east.position[2]) -gt 0.001) { throw 'The interaction loop did not restore the authored bridge endpoint before Save.' }

  $manifest = [ordered]@{
    repositoryRoot=$root;branch=$branch;sourceCommit=$head;packagedSourceCommit=$packagedCommit
    executable=$executable;port=$port;startedAt=$startedAt.ToString('o');finishedAt=(Get-Date).ToUniversalTime().ToString('o')
    diagnosticMode=[bool]$Diagnostics;durationSeconds=$interactionWatch.Elapsed.TotalSeconds
    fixture=@{terrainId=$terrain.id;pathId=$path.id;gap=@{center=@(0,0);radius=18;depth=12};bridgeStyle='steel-girder'}
    captures=$records;interactions=$interactionRecords;bridgeFamilies=$bridgeFamilyRecords;surfaceProfiles=$surfaceProfileRecords
    finalNetworkRevision=[int]$finalPath.properties.pathNetwork.revision;finalEndpoint=@($east.position)
    health=$health
  }
  $manifest | ConvertTo-Json -Depth 64 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'manifest.json') -Encoding UTF8
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
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

Write-Host "Packaged Path Network evidence written to $evidenceRoot"
