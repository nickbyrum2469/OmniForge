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

function New-ExpectedGraphFixture(
  [string]$PathId,
  [string]$NetworkId,
  [string[]]$NodeIds,
  [string[]]$SegmentIds,
  [int]$MinimumNetworkRevision=0
) {
  @{
    pathId=$PathId
    networkId=$NetworkId
    nodeIds=$NodeIds
    segmentIds=$SegmentIds
    minimumNetworkRevision=$MinimumNetworkRevision
    valid=$true
    minimumBridgeIntervalCount=0
  }
}

function Assert-ExactGraphTopology($Network,[string[]]$NodeIds,[hashtable[]]$Segments,[string]$Stage) {
  $actualNodes = @($Network.nodes | ForEach-Object { [string]$_.id })
  if (($actualNodes -join ',') -ne ($NodeIds -join ',')) {
    throw "$Stage changed stable node identities: $($actualNodes -join ', ')."
  }
  $actualSegments = @($Network.segments | ForEach-Object { [ordered]@{id=[string]$_.id;fromNode=[string]$_.fromNode;toNode=[string]$_.toNode} })
  if ($actualSegments.Count -ne $Segments.Count) { throw "$Stage changed the authored segment count." }
  for ($index=0; $index -lt $Segments.Count; $index++) {
    foreach ($property in @('id','fromNode','toNode')) {
      if ([string]$actualSegments[$index].$property -ne [string]$Segments[$index].$property) {
        throw "$Stage changed segment $index $property from $($Segments[$index].$property) to $($actualSegments[$index].$property)."
      }
    }
  }
  return $true
}

function Get-ExactPathNetworkSignature($Network) {
  if ($null -eq $Network) { throw 'Cannot sign a missing Path Network.' }
  # The isolated evidence fixture contains no secrets or user content. Keeping
  # the complete normalized network in the signature makes Save/restart prove
  # node coordinates, height/handle modes, spline handles, segment authority,
  # engineering settings, and editor flags rather than counts alone.
  $json = $Network | ConvertTo-Json -Depth 64 -Compress
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json)) | ForEach-Object { $_.ToString('x2') })
  } finally {
    $sha.Dispose()
  }
}

function Assert-NativeGraphCapture(
  $Record,
  [string]$ActionType,
  [string]$PathId,
  [int]$Port,
  [hashtable]$Expectation,
  [string[]]$NodeIds,
  [hashtable[]]$Segments
) {
  $native = @($Record.response.nativeInputTelemetry | Where-Object { [string]$_.type -eq $ActionType })
  if ($native.Count -ne 1) { throw "Capture $($Record.id) did not report exactly one $ActionType native action." }
  $authority = Invoke-Api $Port "/api/v012/path/$PathId/network"
  $state = Invoke-Api $Port '/api/state'
  Assert-ExactGraphTopology $authority.network $NodeIds $Segments "Capture $($Record.id)" | Out-Null
  $Expectation.minimumNetworkRevision = [int]$authority.network.revision
  Assert-ExactPathRenderRevision $Record $PathId ([int]$authority.network.revision) | Out-Null
  return [ordered]@{telemetry=$native[0];authority=$authority;state=$state}
}

function Set-EvidenceRavine(
  [int]$Port,
  [string]$TerrainId,
  [double]$CanyonWidth,
  [double]$CanyonDepth,
  [double]$CanyonFloorWidth
) {
  Invoke-Api $Port "/api/v011/terrain/$TerrainId/sculpt" 'DELETE' @{} | Out-Null
  return Invoke-Api $Port "/api/v011/terrain/$TerrainId" 'PATCH' @{
    properties = @{
      preset='plains';height=1;baseElevation=0;macroScale=5000;detailScale=1000
      octaves=1;lacunarity=2;gain=.15;warpStrength=0;ridgeStrength=0
      plateauStrength=0;valleyStrength=0;islandStrength=0
      canyonDepth=$CanyonDepth;canyonWidth=$CanyonWidth;canyonFloorWidth=$CanyonFloorWidth
      canyonMeander=0;canyonDirection=90
      resolution=144;chunkSize=32;seed=8128
    }
  }
}

function Request-Capture([string]$CaptureDir,[string]$Id,[hashtable]$Options,[int]$TimeoutSeconds=60) {
  $requestFile = Join-Path $CaptureDir 'capture-request.json'
  $temporaryFile = Join-Path $CaptureDir 'capture-request.tmp.json'
  $responseFile = Join-Path $CaptureDir "$Id.json"
  $pngFile = Join-Path $CaptureDir "$Id.png"
  $mutatedPngFile = Join-Path $CaptureDir "$Id-mutated.png"
  $mutatedWindowFile = Join-Path $CaptureDir "$Id-mutated-window.png"
  Remove-Item $requestFile,$temporaryFile,$responseFile,$pngFile,$mutatedPngFile,$mutatedWindowFile -Force -ErrorAction SilentlyContinue
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
    $fullWindowFile = $null
    if ($Options.ContainsKey('fullWindowCapture') -and [bool]$Options['fullWindowCapture']) {
      $expectedFullWindowFile = "$Id-window.png"
      $fullWindowFile = [string]$response.fullWindowFile
      if ($fullWindowFile -ne $expectedFullWindowFile) {
        throw "Packaged capture $Id did not report deterministic full-window proof $expectedFullWindowFile."
      }
      if (-not (Test-Path -LiteralPath (Join-Path $CaptureDir $fullWindowFile) -PathType Leaf)) {
        throw "Packaged capture $Id reported missing full-window proof $fullWindowFile."
      }
    }
    $mutationCapture = $null
    if ($Options.ContainsKey('captureMutatedState') -and [bool]$Options['captureMutatedState']) {
      $mutationCaptures = @($response.mutationCaptures)
      if ($mutationCaptures.Count -ne 1) { throw "Packaged capture $Id did not report exactly one pre-Undo mutated-state capture." }
      $mutationCapture = $mutationCaptures[0]
      if ([string]$mutationCapture.canvasFile -ne "$Id-mutated.png" -or [string]$mutationCapture.fullWindowFile -ne "$Id-mutated-window.png") {
        throw "Packaged capture $Id did not report deterministic mutated-state artifact names."
      }
      if (-not (Test-Path -LiteralPath $mutatedPngFile -PathType Leaf) -or -not (Test-Path -LiteralPath $mutatedWindowFile -PathType Leaf)) {
        throw "Packaged capture $Id is missing its paired pre-Undo mutated canvas/full-window proof."
      }
      if ([int]$mutationCapture.renderState.sourceRevision -ne [int]$mutationCapture.renderState.networkRevision -or
          ((@($mutationCapture.renderState.nodeIds) -join ',') -ne (@($mutationCapture.renderState.compiledNodeIds) -join ',')) -or
          ((@($mutationCapture.renderState.segmentIds) -join ',') -ne (@($mutationCapture.renderState.compiledSegmentIds) -join ','))) {
        throw "Packaged capture $Id mutated-state proof was not compiled from its exact authoritative graph revision."
      }
    }
    $watch.Stop()
    return [ordered]@{
      id=$Id;elapsedMs=$watch.Elapsed.TotalMilliseconds;file=(Split-Path $pngFile -Leaf)
      fullWindowFile=$fullWindowFile;mutationCapture=$mutationCapture;response=$response
    }
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

function Get-ElectronProcessRole($ProcessRecord,[int]$DesktopProcessId,[int]$RuntimeProcessId) {
  $processId = [int]$ProcessRecord.ProcessId
  if ($processId -eq $DesktopProcessId) { return 'desktop-main' }
  if ($processId -eq $RuntimeProcessId) { return 'runtime-server' }
  $commandLine = [string]$ProcessRecord.CommandLine
  $match = [regex]::Match($commandLine,'(?:^|\s)--type=(?:"?)([A-Za-z0-9_-]+)')
  if ($match.Success) {
    switch ($match.Groups[1].Value) {
      'renderer' { return 'renderer' }
      'gpu-process' { return 'gpu' }
      'utility' { return 'utility' }
      'crashpad-handler' { return 'crashpad' }
      default { return "chromium-$($match.Groups[1].Value)" }
    }
  }
  return 'electron-child'
}

function Get-BoundedProcessTree([int]$RootProcessId,[int]$RuntimeProcessId,[int]$MaximumDepth=8,[int]$MaximumProcesses=64) {
  try {
    $snapshot = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine -ErrorAction Stop)
  } catch {
    throw "Could not enumerate the Windows process tree for desktop PID $RootProcessId`: $($_.Exception.Message)"
  }
  $recordsById = @{}
  foreach ($record in $snapshot) { $recordsById[[int]$record.ProcessId] = $record }
  if (-not $recordsById.ContainsKey($RootProcessId)) {
    throw "The launched Electron desktop PID $RootProcessId was absent from the Windows process snapshot."
  }
  $frontier = @([ordered]@{processId=$RootProcessId;depth=0})
  $visited = @{}
  $tree = New-Object System.Collections.Generic.List[object]
  while ($frontier.Count -gt 0) {
    $next = New-Object System.Collections.Generic.List[object]
    foreach ($cursor in $frontier) {
      $processId = [int]$cursor.processId
      if ($visited.ContainsKey($processId)) { continue }
      $visited[$processId] = $true
      if ($tree.Count -ge $MaximumProcesses) {
        throw "Electron process-tree sampling exceeded the bounded limit of $MaximumProcesses processes for desktop PID $RootProcessId."
      }
      $record = $recordsById[$processId]
      if ($null -eq $record) { continue }
      $tree.Add([ordered]@{
        processId=$processId
        parentProcessId=[int]$record.ParentProcessId
        depth=[int]$cursor.depth
        role=(Get-ElectronProcessRole $record $RootProcessId $RuntimeProcessId)
        snapshotName=[string]$record.Name
      })
      if ([int]$cursor.depth -ge $MaximumDepth) { continue }
      foreach ($child in @($snapshot | Where-Object { [int]$_.ParentProcessId -eq $processId } | Sort-Object ProcessId)) {
        $next.Add([ordered]@{processId=[int]$child.ProcessId;depth=([int]$cursor.depth+1)})
      }
    }
    # Windows PowerShell 5.1 can throw "Argument types do not match" when its
    # array subexpression binder wraps a generic List[object]. Materialize the
    # next breadth-first frontier explicitly for consistent packaged evidence.
    $frontier = $next.ToArray()
  }
  return $tree.ToArray()
}

function Get-ProcessResourceSample($DesktopProcess,[string]$RuntimeRoot,[string]$Stage) {
  if ($null -eq $DesktopProcess -or $DesktopProcess.HasExited) {
    throw "The desktop process was unavailable while sampling resources during $Stage."
  }
  $marker = Read-JsonFile (Join-Path $RuntimeRoot 'sessions\runtime.json')
  $runtimeProcessId = [int]$marker.pid
  $processTree = @(Get-BoundedProcessTree ([int]$DesktopProcess.Id) $runtimeProcessId)
  $roles = [ordered]@{
    desktop = [int]$DesktopProcess.Id
    runtime = $runtimeProcessId
  }
  $processes = [ordered]@{}
  foreach ($entry in $roles.GetEnumerator()) {
    $process = Get-Process -Id ([int]$entry.Value) -ErrorAction SilentlyContinue
    if ($null -eq $process) { throw "The $($entry.Key) process $($entry.Value) was unavailable during $Stage resource sampling." }
    $process.Refresh()
    $processes[$entry.Key] = [ordered]@{
      pid=[int]$process.Id
      processName=[string]$process.ProcessName
      cpuSeconds=[double]$process.TotalProcessorTime.TotalSeconds
      workingSetBytes=[int64]$process.WorkingSet64
      privateMemoryBytes=[int64]$process.PrivateMemorySize64
      threadCount=[int]$process.Threads.Count
    }
  }
  $treeSamples = New-Object System.Collections.Generic.List[object]
  foreach ($entry in $processTree) {
    $process = Get-Process -Id ([int]$entry.processId) -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      $treeSamples.Add([ordered]@{
        pid=[int]$entry.processId
        parentPid=[int]$entry.parentProcessId
        role=[string]$entry.role
        processName=[string]$entry.snapshotName
        exited=$true
        cpuSeconds=$null
        workingSetBytes=$null
        privateMemoryBytes=$null
        threadCount=$null
      })
      continue
    }
    try {
      $process.Refresh()
    } catch {
      $treeSamples.Add([ordered]@{
        pid=[int]$entry.processId
        parentPid=[int]$entry.parentProcessId
        role=[string]$entry.role
        processName=[string]$entry.snapshotName
        exited=$true
        cpuSeconds=$null
        workingSetBytes=$null
        privateMemoryBytes=$null
        threadCount=$null
      })
      continue
    }
    $treeSamples.Add([ordered]@{
      pid=[int]$process.Id
      parentPid=[int]$entry.parentProcessId
      role=[string]$entry.role
      processName=[string]$process.ProcessName
      exited=$false
      cpuSeconds=[double]$process.TotalProcessorTime.TotalSeconds
      workingSetBytes=[int64]$process.WorkingSet64
      privateMemoryBytes=[int64]$process.PrivateMemorySize64
      threadCount=[int]$process.Threads.Count
    })
  }
  $liveRendererProcesses = @($treeSamples | Where-Object { $_.role -eq 'renderer' -and $_.exited -ne $true })
  $liveGpuProcesses = @($treeSamples | Where-Object { $_.role -eq 'gpu' -and $_.exited -ne $true })
  $discoveredRoles = (@($treeSamples | ForEach-Object {
    $state = if ($_.exited -eq $true) { 'exited' } else { 'live' }
    "$($_.pid):$($_.role):$state"
  }) -join ', ')
  if ($liveRendererProcesses.Count -lt 1) {
    throw "No live Electron renderer process was found beneath desktop PID $($DesktopProcess.Id) during $Stage. Discovered process roles: $discoveredRoles"
  }
  if ($liveGpuProcesses.Count -lt 1) {
    throw "No live Electron GPU process was found beneath desktop PID $($DesktopProcess.Id) during $Stage. Discovered process roles: $discoveredRoles"
  }
  return [ordered]@{
    stage=$Stage
    timestamp=(Get-Date).ToUniversalTime().ToString('o')
    processes=$processes
    electronProcessTree=$treeSamples
  }
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

function Close-PackagedGracefully($Process,[int]$Port,[string]$RuntimeRoot,[string]$CaptureDir,[string]$Stage) {
  if ($null -eq $Process) { throw "No packaged process was available during $Stage." }
  if ($Process.HasExited) { throw "Packaged OmniForge had already exited before $Stage with code $($Process.ExitCode)." }
  $processId = $Process.Id
  $requestedAt = (Get-Date).ToUniversalTime()
  $closeRequestFile = Join-Path $CaptureDir 'close-request.json'
  $closeRequestTemporaryFile = Join-Path $CaptureDir 'close-request.tmp.json'
  Remove-Item -LiteralPath $closeRequestFile,$closeRequestTemporaryFile -Force -ErrorAction SilentlyContinue
  $closeRequest = @{processId=$processId;stage=$Stage;requestedAt=$requestedAt.ToString('o')} | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($closeRequestTemporaryFile,$closeRequest,[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $closeRequestTemporaryFile -Destination $closeRequestFile -Force
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
$graphEditRecords = New-Object System.Collections.Generic.List[object]
$resourceSamples = New-Object System.Collections.Generic.List[object]
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
  $resourceSamples.Add((Get-ProcessResourceSample $process $runtimeRoot 'after-startup'))

  $state = Invoke-Api $port '/api/state'
  $scene = @($state.scenes | Where-Object { $_.id -eq $state.activeSceneId })[0]
  $terrain = @($scene.objects | Where-Object { $_.type -eq 'terrain' })[0]
  $path = @($scene.objects | Where-Object { $_.type -eq 'path' })[0]
  if ($null -eq $terrain -or $null -eq $path) { throw 'Starter terrain or Path Network is missing from the isolated packaged project.' }

  $terrainResult = Set-EvidenceRavine $port $terrain.id 16 12 4
  $revision = [int64]$terrainResult.state.engine.revision

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
    @{id='01-west-landing-close';camera=(Get-LookCamera ([double[]]@(-29,4.5,10)) ([double[]]@(-17,0,0)) 55);guides=$false},
    @{id='02-side-profile';camera=(Get-LookCamera ([double[]]@(0,7.5,24)) ([double[]]@(0,-2,0)) 60);guides=$false},
    @{id='03-east-landing-close';camera=(Get-LookCamera ([double[]]@(29,4.5,-10)) ([double[]]@(17,0,0)) 55);guides=$false},
    @{id='04-wide-elevated';camera=(Get-LookCamera ([double[]]@(0,36,38)) ([double[]]@(0,-2,0)) 58);guides=$false},
    @{id='05-underside';camera=(Get-LookCamera ([double[]]@(0,-7,17)) ([double[]]@(0,-4,0)) 64);guides=$false},
    @{id='06-player-level';camera=(Get-LookCamera ([double[]]@(-38,1.75,1.2)) ([double[]]@(1,0,0)) 70);guides=$false}
  )
  foreach ($view in $views) {
    $captureOptions = @{
      camera=$view.camera;hideGuides=(-not $view.guides);hideEditorReferences=$true;waitMs=1400
      minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    }
    if ($view.id -eq '01-west-landing-close') {
      # The isolated data root represents a genuine first launch. Dismiss the
      # tutorial through its real native Skip button before any native spline
      # input so the proof run exercises the editor rather than its backdrop.
      $captureOptions.nativeInputActions = @(@{type='dismiss-first-use-tutorial'})
      $captureOptions.fullWindowCapture = $true
    }
    $record = Request-Capture $captureDir $view.id $captureOptions
    $records.Add($record)
    if ($view.id -in @('01-west-landing-close','02-side-profile','05-underside')) {
      $bridgeFamilyRecords.Add([ordered]@{
        style='steel-girder';ravine=@{width=16;depth=12;floorWidth=4};width=6;vehicleClass='mixed'
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
    inputCamera=(Get-LookCamera ([double[]]@(-55,22,30)) ([double[]]@(-55,0,0)) 68)
    camera=(Get-LookCamera ([double[]]@(-62,11,20)) ([double[]]@(-32,0,0)) 60)
    hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    nativeInputActions=@(@{type='path-node-drag';pathId=$path.id;nodeId='approach-west';dx=54;dy=10;vertical=$false;undo=$false})
  }
  $records.Add($nativeHorizontalRecord)
  if (@($nativeHorizontalRecord.response.nativeInputTelemetry).Count -ne 1) { throw 'The packaged native-input gate did not report the horizontal spline-node drag.' }
  $horizontalTelemetry = @($nativeHorizontalRecord.response.nativeInputTelemetry)[0]
  if ([double]$horizontalTelemetry.horizontalDelta -lt 0.01) { throw 'The packaged horizontal spline-node drag did not move its authored node.' }
  $horizontalPosition = @($horizontalTelemetry.after.position | ForEach-Object { [double]$_ })
  if ($horizontalPosition.Count -ne 3) { throw 'The packaged horizontal spline-node drag did not report one finite 3D node position.' }
  $horizontalX = [double]$horizontalPosition[0]
  $horizontalY = [double]$horizontalPosition[1]
  $horizontalZ = [double]$horizontalPosition[2]
  $fixtureExpectation.minimumNetworkRevision = [int]$nativeHorizontalRecord.response.fixtureTelemetry.networkRevision
  Assert-ExactPathRenderRevision $nativeHorizontalRecord $path.id ([int]$fixtureExpectation.minimumNetworkRevision) | Out-Null
  $interactionRecords.Add([ordered]@{
    id='08a-native-horizontal-moved';elapsedMs=$nativeHorizontalRecord.elapsedMs
    healthMs=(Assert-ProcessResponsive $process $port $runtimeRoot 'native horizontal node drag')
    telemetry=$nativeHorizontalRecord.response.nativeInputTelemetry
  })

  $nativeVerticalRecord = Request-Capture $captureDir '08b-native-vertical-moved' @{
    inputCamera=(Get-LookCamera ([double[]]@($horizontalX,($horizontalY+22),($horizontalZ+30))) ([double[]]$horizontalPosition) 68)
    camera=(Get-LookCamera ([double[]]@(($horizontalX-10),($horizontalY+8),($horizontalZ+18))) ([double[]]@(($horizontalX+14),1.2,0)) 58)
    hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    # Sixteen native pixels maps to +2.4 m in the viewport's vertical gizmo.
    # The exact evidence fixture remains Civil-Assist-valid at this height while
    # still producing an unmistakable authored elevation change in the capture.
    nativeInputActions=@(@{type='path-node-drag';pathId=$path.id;nodeId='approach-west';dx=0;dy=-16;vertical=$true;undo=$false})
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
    camera=(Get-LookCamera ([double[]]@(-40,22,30)) ([double[]]@(-20,0,0)) 64)
    hideGuides=$false;hideEditorReferences=$false;waitMs=900;minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    nativeInputActions=@(
      @{type='path-undo';pathId=$path.id;nodeId='approach-west';expectedPosition=$horizontalPosition},
      @{type='path-undo';pathId=$path.id;nodeId='approach-west';expectedPosition=@(-55,0,0)}
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

  $worldTabRecord = Request-Capture $captureDir '08d-world-tab-ui' @{
    camera=(Get-LookCamera ([double[]]@(0,24,34)) ([double[]]@(0,-1,0)) 62)
    hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
    minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
    actions=@(@{type='click';target='world';waitMs=450})
  }
  $records.Add($worldTabRecord)
  Assert-ProcessResponsive $process $port $runtimeRoot 'World tab full-window proof' | Out-Null

  # Gate 1 graph editing runs on one small deterministic path, isolated from
  # the bridge-family showcase. Every mutation below is generated by native
  # mouse/keyboard input in the packaged editor and ends on the exact fixture
  # topology after a real Undo/Redo/Undo sequence where applicable.
  $graphPathResult = Invoke-Api $port '/api/object' 'POST' @{
    type='path';id='path-graph-evidence';name='Packaged Graph Evidence';position=@(0,0,0)
  }
  $graphPath = $graphPathResult.object
  # Newly created path objects begin with the legacy-compatible authored
  # properties returned by /api/object. Resolve their authoritative schema-v2
  # network through the v0.12 API before attempting an optimistic replacement;
  # do not assume the create response already contains migration authority.
  $graphAuthority = Invoke-Api $port "/api/v012/path/$($graphPath.id)/network"
  $graphRevision = [int]$graphAuthority.network.revision
  $graphInstall = Invoke-Api $port "/api/v012/path/$($graphPath.id)/network" 'PUT' @{
    expectedRevision=$graphRevision
    label='Install isolated packaged graph editing fixture'
    network=@{
      schemaVersion=2;id="$($graphPath.id):network";revision=$graphRevision
      nodes=@(
        @{id='graph-west';position=@(-24,2,-240);heightMode='absolute';heightOffset=0;handleMode='free';incomingHandle=@(-5,0,0);outgoingHandle=@(10,0,0)},
        @{id='graph-middle';position=@(0,2,-240);heightMode='absolute';heightOffset=0;handleMode='free';incomingHandle=@(-8,0,0);outgoingHandle=@(8,0,0)},
        @{id='graph-east';position=@(24,2,-240);heightMode='absolute';heightOffset=0;handleMode='free';incomingHandle=@(-10,0,0);outgoingHandle=@(5,0,0)}
      )
      segments=@(
        @{id='graph-west-middle';fromNode='graph-west';toNode='graph-middle';curveType='hermite';constructionMode='conform';constructionLocked=$true},
        @{id='graph-middle-east';fromNode='graph-middle';toNode='graph-east';curveType='hermite';constructionMode='conform';constructionLocked=$true}
      )
      engineering=@{civilAssist=$false;maxGradePercent=40;minimumCurveRadius=1;maxCutDepth=2;maxFillDepth=2;bridgeThreshold=20;maximumBridgeSpan=40}
      editor=@{showSpline=$true;showGrade=$true;showConstruction=$true}
    }
  }
  $graphNodeIds = [string[]]@('graph-west','graph-middle','graph-east')
  $graphSegments = [hashtable[]]@(
    @{id='graph-west-middle';fromNode='graph-west';toNode='graph-middle'},
    @{id='graph-middle-east';fromNode='graph-middle';toNode='graph-east'}
  )
  $graphExpectation = New-ExpectedGraphFixture $graphPath.id ([string]$graphInstall.network.id) $graphNodeIds ([string[]]@('graph-west-middle','graph-middle-east')) ([int]$graphInstall.network.revision)
  Invoke-Api $port '/api/selection' 'POST' @{objectId=$graphPath.id} | Out-Null
  $revision = [int64]$graphInstall.state.engine.revision
  # Keep Gate 1's saved graph far outside the bridge showcase so it can remain
  # in the same real scene through Save/restart without polluting later bridge
  # captures.
  $graphInputCamera = Get-LookCamera ([double[]]@(0,36,-198)) ([double[]]@(0,2,-240)) 62
  $graphCaptureCamera = Get-LookCamera ([double[]]@(0,20,-204)) ([double[]]@(0,2,-240)) 58
  $graphReady = Request-Capture $captureDir '08e-graph-fixture-ready' @{
    camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
    minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
    actions=@(@{type='select';objectId=$graphPath.id;waitMs=180},@{type='click';target='pathEdit';waitMs=350})
  }
  $records.Add($graphReady)
  Assert-ExactPathRenderRevision $graphReady $graphPath.id ([int]$graphReady.response.fixtureTelemetry.networkRevision) | Out-Null

  $insertRecord = Request-Capture $captureDir '08f-native-right-click-insert-undo' @{
    inputCamera=$graphInputCamera;camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
    captureMutatedState=$true
    minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
    nativeInputActions=@(@{type='path-node-insert';pathId=$graphPath.id;segmentId='graph-west-middle';stationFraction=.5;undo=$true})
  }
  $records.Add($insertRecord)
  $insertEvidence = Assert-NativeGraphCapture $insertRecord 'path-node-insert' $graphPath.id $port $graphExpectation $graphNodeIds $graphSegments
  $insertionDeviation = [double]$insertEvidence.telemetry.centerlineDeviation
  if ($insertEvidence.telemetry.resolvedBy -ne 'compiledSegmentId' -or -not $insertEvidence.telemetry.undoVerified -or
      @($insertEvidence.telemetry.after.nodeIds).Count -ne 4 -or @($insertEvidence.telemetry.after.segments).Count -ne 3 -or
      [double]::IsNaN($insertionDeviation) -or [double]::IsInfinity($insertionDeviation) -or $insertionDeviation -gt 0.01) {
    throw 'Native right-click insertion did not prove one exact compiled-segment split followed by Undo.'
  }
  $graphEditRecords.Add([ordered]@{id=$insertRecord.id;kind='right-click-insert';capture=$insertRecord.file;fullWindow=$insertRecord.fullWindowFile;mutatedCapture=$insertRecord.mutationCapture;telemetry=$insertEvidence.telemetry})

  $groupRecord = Request-Capture $captureDir '08g-native-ctrl-group-drag-undo' @{
    inputCamera=$graphInputCamera;camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
    captureMutatedState=$true
    minimumRevision=[int64]$insertEvidence.state.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
    nativeInputActions=@(
      @{type='path-node-toggle-selection';pathId=$graphPath.id;nodeId='graph-west';expectedSelected=$true},
      @{type='path-node-group-drag';pathId=$graphPath.id;nodeId='graph-middle';nodeIds=@('graph-west','graph-middle');dx=24;dy=8;vertical=$false;undo=$true}
    )
  }
  $records.Add($groupRecord)
  $groupEvidence = Assert-NativeGraphCapture $groupRecord 'path-node-group-drag' $graphPath.id $port $graphExpectation $graphNodeIds $graphSegments
  $toggles = @($groupRecord.response.nativeInputTelemetry | Where-Object { $_.type -eq 'path-node-toggle-selection' })
  if ($toggles.Count -ne 1 -or @($toggles | Where-Object { $_.resolvedBy -ne 'nodeId' -or -not $_.selected }).Count -ne 0 -or
      $groupEvidence.telemetry.resolvedBy -ne 'nodeId' -or -not $groupEvidence.telemetry.undoVerified -or @($groupEvidence.telemetry.groupAfter).Count -ne 2) {
    throw 'Native Ctrl multi-selection and coherent group drag did not prove stable-ID input plus Undo.'
  }
  $graphEditRecords.Add([ordered]@{id=$groupRecord.id;kind='ctrl-group-drag';capture=$groupRecord.file;fullWindow=$groupRecord.fullWindowFile;mutatedCapture=$groupRecord.mutationCapture;telemetry=$groupRecord.response.nativeInputTelemetry})

  $handleRecord = Request-Capture $captureDir '08h-native-manual-handle-drag-undo' @{
    inputCamera=$graphInputCamera;camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
    captureMutatedState=$true
    minimumRevision=[int64]$groupEvidence.state.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
    nativeInputActions=@(@{type='path-handle-drag';pathId=$graphPath.id;nodeId='graph-middle';side='outgoing';dx=34;dy=-18;undo=$true})
  }
  $records.Add($handleRecord)
  $handleEvidence = Assert-NativeGraphCapture $handleRecord 'path-handle-drag' $graphPath.id $port $graphExpectation $graphNodeIds $graphSegments
  if ($handleEvidence.telemetry.resolvedBy -ne 'nodeId' -or -not $handleEvidence.telemetry.undoVerified -or [double]$handleEvidence.telemetry.vectorDelta -le .001) {
    throw 'Native manual tangent-handle drag did not prove a stable-ID vector edit followed by Undo.'
  }
  $graphEditRecords.Add([ordered]@{id=$handleRecord.id;kind='manual-handle-drag';capture=$handleRecord.file;fullWindow=$handleRecord.fullWindowFile;mutatedCapture=$handleRecord.mutationCapture;telemetry=$handleEvidence.telemetry})

  foreach ($nativeGraphAction in @(
    @{id='08i-native-duplicate-undo-redo';kind='duplicate';action=@{type='path-network-duplicate';pathId=$graphPath.id}},
    @{id='08j-native-split-undo-redo';kind='split';action=@{type='path-network-split';pathId=$graphPath.id;nodeId='graph-middle'}}
  )) {
    $authority = Invoke-Api $port "/api/v012/path/$($graphPath.id)/network"
    $graphState = Invoke-Api $port '/api/state'
    $graphExpectation.minimumNetworkRevision = [int]$authority.network.revision
    $record = Request-Capture $captureDir $nativeGraphAction.id @{
      inputCamera=$graphInputCamera;camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
      captureMutatedState=$true
      minimumRevision=[int64]$graphState.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
      nativeInputActions=@($nativeGraphAction.action)
    }
    $records.Add($record)
    $evidence = Assert-NativeGraphCapture $record ([string]$nativeGraphAction.action.type) $graphPath.id $port $graphExpectation $graphNodeIds $graphSegments
    if (-not $evidence.telemetry.undoVerified -or -not $evidence.telemetry.redoVerified) {
      throw "Native $($nativeGraphAction.kind) did not prove real Undo and Redo."
    }
    $graphEditRecords.Add([ordered]@{id=$record.id;kind=$nativeGraphAction.kind;capture=$record.file;fullWindow=$record.fullWindowFile;mutatedCapture=$record.mutationCapture;telemetry=$evidence.telemetry})
  }

  $branchResult = Invoke-Api $port '/api/object' 'POST' @{
    type='path';id='path-graph-branch';name='Packaged Graph Branch';position=@(0,0,0)
  }
  $branch = $branchResult.object
  $branchAuthority = Invoke-Api $port "/api/v012/path/$($branch.id)/network"
  $branchRevision = [int]$branchAuthority.network.revision
  $branchInstall = Invoke-Api $port "/api/v012/path/$($branch.id)/network" 'PUT' @{
    expectedRevision=$branchRevision
    label='Install isolated packaged Join source fixture'
    network=@{
      schemaVersion=2;id="$($branch.id):network";revision=$branchRevision
      nodes=@(
        @{id='branch-near';position=@(0,2,-228);heightMode='absolute';heightOffset=0;handleMode='automatic'},
        @{id='branch-far';position=@(0,2,-250);heightMode='absolute';heightOffset=0;handleMode='automatic'}
      )
      segments=@(@{id='branch-route';fromNode='branch-near';toNode='branch-far';curveType='hermite';constructionMode='conform';constructionLocked=$true})
      engineering=@{civilAssist=$false;maxGradePercent=40;minimumCurveRadius=1;maxCutDepth=2;maxFillDepth=2;bridgeThreshold=20;maximumBridgeSpan=40}
      editor=@{showSpline=$true;showGrade=$true;showConstruction=$true}
    }
  }
  Invoke-Api $port '/api/selection' 'POST' @{objectId=$graphPath.id} | Out-Null
  $joinRecord = Request-Capture $captureDir '08k-native-join-undo-redo' @{
    camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=900
    captureMutatedState=$true
    minimumRevision=[int64]$branchInstall.state.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
    actions=@(@{type='select';objectId=$graphPath.id;waitMs=250})
    nativeInputActions=@(@{type='path-network-join';pathId=$graphPath.id;sourcePathId=$branch.id})
  }
  $records.Add($joinRecord)
  $joinEvidence = Assert-NativeGraphCapture $joinRecord 'path-network-join' $graphPath.id $port $graphExpectation $graphNodeIds $graphSegments
  if (-not $joinEvidence.telemetry.undoVerified -or -not $joinEvidence.telemetry.redoVerified -or
      [string]$joinEvidence.telemetry.selectedSource.selected -ne [string]$branch.id) {
    throw 'Native Join did not prove the stable branch choice with real Undo and Redo.'
  }
  $joinRestoredState = Invoke-Api $port '/api/state'
  $joinRestoredScene = @($joinRestoredState.scenes | Where-Object { $_.id -eq $joinRestoredState.activeSceneId })[0]
  if (@($joinRestoredScene.objects | Where-Object { $_.id -eq $branch.id -and $_.type -eq 'path' }).Count -ne 1) {
    throw 'Native Join final Undo did not restore the exact source Path Network object.'
  }
  $graphEditRecords.Add([ordered]@{id=$joinRecord.id;kind='join';capture=$joinRecord.file;fullWindow=$joinRecord.fullWindowFile;mutatedCapture=$joinRecord.mutationCapture;telemetry=$joinEvidence.telemetry})

  # Preserve the exact Gate 1 graph and its restored Join source through the
  # real Save/restart gate. They live outside every bridge-showcase camera and
  # therefore prove persistence without contaminating the visual review scene.
  $graphBeforeSave = (Invoke-Api $port "/api/v012/path/$($graphPath.id)/network").network
  $branchBeforeSave = (Invoke-Api $port "/api/v012/path/$($branch.id)/network").network
  Assert-ExactGraphTopology $graphBeforeSave $graphNodeIds $graphSegments 'Graph fixture before Save' | Out-Null
  Assert-ExactGraphTopology $branchBeforeSave ([string[]]@('branch-near','branch-far')) ([hashtable[]]@(@{id='branch-route';fromNode='branch-near';toNode='branch-far'})) 'Join source before Save' | Out-Null
  $graphPersistenceSignature = Get-ExactPathNetworkSignature $graphBeforeSave
  $branchPersistenceSignature = Get-ExactPathNetworkSignature $branchBeforeSave
  Invoke-Api $port '/api/selection' 'POST' @{objectId=$path.id} | Out-Null
  $primaryNetwork = Invoke-Api $port "/api/v012/path/$($path.id)/network"
  $primaryState = Invoke-Api $port '/api/state'
  $fixtureExpectation.minimumNetworkRevision = [int]$primaryNetwork.network.revision
  $revision = [int64]$primaryState.engine.revision

  # Each production bridge family gets its own span/width-appropriate scene in
  # the same exact packaged executable. This is visual evidence, not a mock
  # mesh: every fixture passes through Civil Assist, the authoritative terrain
  # modifier, the shared road/deck taper, shadows, and the runtime renderer.
  $familyFixtures = @(
    @{slug='timber-trestle';style='timber-trestle';canyonWidth=7.0;canyonDepth=7.0;canyonFloorWidth=2.0;width=4.5;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='stone-arch';style='stone-arch';canyonWidth=10.0;canyonDepth=8.0;canyonFloorWidth=3.0;width=7.0;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='masonry-causeway';style='masonry-causeway';canyonWidth=5.5;canyonDepth=6.0;canyonFloorWidth=1.5;width=6.0;vehicleClass='mixed';profileId='dirt-road'},
    @{slug='rope-footbridge';style='rope-footbridge';canyonWidth=11.0;canyonDepth=9.0;canyonFloorWidth=3.0;width=2.1;vehicleClass='pedestrian';profileId='natural-trail'}
  )
  foreach ($fixture in $familyFixtures) {
    $familyRavine = Set-EvidenceRavine $port $terrain.id $fixture.canyonWidth $fixture.canyonDepth $fixture.canyonFloorWidth
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
    $landingX = -([double]$fixture.canyonWidth + 1.5)
    $sideHeight = [Math]::Max(6,[double]$fixture.canyonDepth * .45)
    $wideHeight = [Math]::Max(22,[double]$fixture.canyonDepth * 2.2)
    $wideDistance = [Math]::Max(26,[double]$fixture.canyonWidth * 1.8)
    foreach ($familyView in @(
      @{suffix='landing-close';camera=(Get-LookCamera ([double[]]@(($landingX-9),3.6,8)) ([double[]]@($landingX,0,0)) 54)},
      @{suffix='side';camera=(Get-LookCamera ([double[]]@(0,$sideHeight,([double]$fixture.canyonWidth+11))) ([double[]]@(0,-2,0)) 60)},
      @{suffix='underside';camera=(Get-LookCamera ([double[]]@(0,-([double]$fixture.canyonDepth*.52),([double]$fixture.canyonWidth+6))) ([double[]]@(0,-([double]$fixture.canyonDepth*.36),0)) 64)},
      @{suffix='player-level';camera=(Get-LookCamera ([double[]]@(-([double]$fixture.canyonWidth+18),1.75,1)) ([double[]]@(0,0,0)) 69)},
      @{suffix='wide-elevated';camera=(Get-LookCamera ([double[]]@(0,$wideHeight,$wideDistance)) ([double[]]@(0,-1.5,0)) 58)}
    )) {
      $familyId = "family-$($fixture.slug)-$($familyView.suffix)"
      $familyCapture = Request-Capture $captureDir $familyId @{
        camera=$familyView.camera;hideGuides=$true;hideEditorReferences=$true;waitMs=1100
        minimumRevision=$revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
      }
      $records.Add($familyCapture)
      $bridgeFamilyRecords.Add([ordered]@{
        style=$fixture.style
        ravine=@{width=$fixture.canyonWidth;depth=$fixture.canyonDepth;floorWidth=$fixture.canyonFloorWidth;direction=90;meander=0}
        width=$fixture.width;vehicleClass=$fixture.vehicleClass
        view=$familyView.suffix;capture=$familyCapture.file
      })
      Assert-ProcessResponsive $process $port $runtimeRoot $familyId | Out-Null
    }
  }

  # Restore the primary steel fixture before the sustained interaction and
  # persistence gate so the final saved state is deterministic.
  $restoredRavine = Set-EvidenceRavine $port $terrain.id 16 12 4
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

  $resourceSamples.Add((Get-ProcessResourceSample $process $runtimeRoot 'before-sustained-interaction'))
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
    $resourceSamples.Add((Get-ProcessResourceSample $process $runtimeRoot $id))
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
    camera=(Get-LookCamera ([double[]]@(0,18,36)) $target 62);hideGuides=$true;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=1000
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
  $resourceSamples.Add((Get-ProcessResourceSample $process $runtimeRoot 'before-saved-editor-close'))
  $initialCloseRecord = Close-PackagedGracefully $process $port $runtimeRoot $captureDir 'saved editor restart gate'
  $process = $null
  $process = Start-Process -FilePath $executable -WorkingDirectory $packageRoot -PassThru
  $restartHealth = Wait-PackagedHealth $process $port $runtimeRoot
  Start-Sleep -Seconds 3
  $restartState = Invoke-Api $port '/api/state'
  $restartPath = Assert-PersistedPathFixture $restartState $path.id $savedNetworkRevision
  $fixtureExpectation.minimumNetworkRevision = [int]$restartPath.properties.pathNetwork.revision
  $restartGraphAuthority = Invoke-Api $port "/api/v012/path/$($graphPath.id)/network"
  $restartBranchAuthority = Invoke-Api $port "/api/v012/path/$($branch.id)/network"
  Assert-ExactGraphTopology $restartGraphAuthority.network $graphNodeIds $graphSegments 'Graph fixture after restart' | Out-Null
  Assert-ExactGraphTopology $restartBranchAuthority.network ([string[]]@('branch-near','branch-far')) ([hashtable[]]@(@{id='branch-route';fromNode='branch-near';toNode='branch-far'})) 'Join source after restart' | Out-Null
  $restartGraphSignature = Get-ExactPathNetworkSignature $restartGraphAuthority.network
  $restartBranchSignature = Get-ExactPathNetworkSignature $restartBranchAuthority.network
  if ($restartGraphSignature -ne $graphPersistenceSignature -or $restartBranchSignature -ne $branchPersistenceSignature) {
    throw 'Packaged Save/restart changed the exact Gate 1 graph, node modes, handles, or restored Join source.'
  }
  $restartRecord = Request-Capture $captureDir '11-restarted-persisted' @{
    camera=(Get-LookCamera ([double[]]@(0,18,36)) $target 62);hideGuides=$true;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=1400
    minimumRevision=[int64]$restartState.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$fixtureExpectation
  }
  $records.Add($restartRecord)
  Assert-ProcessResponsive $process $port $runtimeRoot 'restarted persisted fixture' | Out-Null
  $graphExpectation.minimumNetworkRevision = [int]$restartGraphAuthority.network.revision
  $restartGraphRecord = Request-Capture $captureDir '11b-restarted-graph-persisted' @{
    camera=$graphCaptureCamera;hideGuides=$false;hideEditorReferences=$false;fullWindowCapture=$true;waitMs=1100
    minimumRevision=[int64]$restartState.engine.revision;revisionTimeoutMs=20000;expectedPathNetwork=$graphExpectation
    actions=@(@{type='select';objectId=$graphPath.id;waitMs=180},@{type='click';target='pathEdit';waitMs=350})
  }
  $records.Add($restartGraphRecord)
  Assert-ExactPathRenderRevision $restartGraphRecord $graphPath.id ([int]$restartGraphAuthority.network.revision) | Out-Null
  Assert-ProcessResponsive $process $port $runtimeRoot 'restarted persisted Gate 1 graph' | Out-Null
  $resourceSamples.Add((Get-ProcessResourceSample $process $runtimeRoot 'after-restart'))
  $resourceSamples.Add((Get-ProcessResourceSample $process $runtimeRoot 'before-restarted-editor-close'))
  $restartCloseRecord = Close-PackagedGracefully $process $port $runtimeRoot $captureDir 'completed restarted evidence'
  $process = $null

  $manifest = [ordered]@{
    repositoryRoot=$root;branch=$branch;sourceCommit=$head;sourceTree=$headSourceTree
    packagedSourceCommit=$packagedCommit;packagedSourceTree=$packagedSourceTree;packagedSourceAudit=$packagedSourceAudit
    executable=$executable;port=$port;startedAt=$startedAt.ToString('o');finishedAt=(Get-Date).ToUniversalTime().ToString('o')
    diagnosticMode=[bool]$Diagnostics;durationSeconds=$interactionWatch.Elapsed.TotalSeconds
    fixture=@{
      terrainId=$terrain.id;pathId=$path.id;bridgeStyle='steel-girder'
      ravine=@{canyonWidth=16;canyonDepth=12;canyonFloorWidth=4;canyonDirection=90;canyonMeander=0}
    }
    captures=$records;interactions=$interactionRecords;graphEdits=$graphEditRecords;bridgeFamilies=$bridgeFamilyRecords;surfaceProfiles=$surfaceProfileRecords
    resourceSamples=$resourceSamples
    finalNetworkRevision=[int]$finalPath.properties.pathNetwork.revision;finalEndpoint=@($east.position);saveEvidence=$saveTelemetry[0]
    health=$health;restartHealth=$restartHealth;restartCapture=$restartRecord;restartGraphCapture=$restartGraphRecord
    graphPersistence=@{
      pathId=$graphPath.id;sourcePathId=$branch.id
      graphSignature=$restartGraphSignature;sourceSignature=$restartBranchSignature
      graphRevision=[int]$restartGraphAuthority.network.revision;sourceRevision=[int]$restartBranchAuthority.network.revision
    }
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
