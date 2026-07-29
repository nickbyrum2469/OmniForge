from __future__ import annotations

from pathlib import Path


OLD_FUNCTION = r'''function Request-Capture([string]$CaptureDir,[string]$Id,[hashtable]$Camera,[int64]$MinimumRevision,[int]$WaitMs=700){
  $request=@{id=$Id;options=@{camera=$Camera;hideGuides=$true;hideEditorReferences=$true;waitMs=$WaitMs;minimumRevision=$MinimumRevision;revisionTimeoutMs=8000}}
  $temp=Join-Path $CaptureDir 'capture-request.tmp.json'
  $requestFile=Join-Path $CaptureDir 'capture-request.json'
  $responseFile=Join-Path $CaptureDir "$Id.json"
  $pngFile=Join-Path $CaptureDir "$Id.png"
  Remove-Item $responseFile,$pngFile,$requestFile,$temp -Force -ErrorAction SilentlyContinue
  $requestJson=$request|ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($temp,$requestJson,[Text.UTF8Encoding]::new($false))
  Move-Item $temp $requestFile -Force
  $deadline=(Get-Date).AddSeconds(25)
  while((Get-Date)-lt$deadline){
    Start-Sleep -Milliseconds 250
    if(Test-Path $responseFile){
      $response=Get-Content $responseFile -Raw|ConvertFrom-Json
      if(-not$response.ok){throw "Visual capture $Id failed: $($response.error)"}
      if(-not(Test-Path $pngFile -PathType Leaf)){throw "Visual capture $Id reported success without a PNG."}
      if($response.renderTelemetry){$script:captureTelemetry[$Id]=$response.renderTelemetry}
      return $response
    }
  }
  throw "Visual capture $Id timed out."
}'''

NEW_FUNCTION = r'''function Request-Capture([string]$CaptureDir,[string]$Id,[hashtable]$Camera,[int64]$MinimumRevision,[int]$WaitMs=700){
  $temp=Join-Path $CaptureDir 'capture-request.tmp.json'
  $requestFile=Join-Path $CaptureDir 'capture-request.json'
  $responseFile=Join-Path $CaptureDir "$Id.json"
  $pngFile=Join-Path $CaptureDir "$Id.png"
  $maximumAttempts=3
  for($attempt=1;$attempt-le$maximumAttempts;$attempt++){
    $request=@{id=$Id;options=@{camera=$Camera;hideGuides=$true;hideEditorReferences=$true;waitMs=$WaitMs;minimumRevision=$MinimumRevision;revisionTimeoutMs=15000;captureAttempt=$attempt}}
    Remove-Item $responseFile,$pngFile,$requestFile,$temp -Force -ErrorAction SilentlyContinue
    $requestJson=$request|ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText($temp,$requestJson,[Text.UTF8Encoding]::new($false))
    Move-Item $temp $requestFile -Force
    $deadline=(Get-Date).AddSeconds(45)
    while((Get-Date)-lt$deadline){
      Start-Sleep -Milliseconds 250
      if(Test-Path $responseFile){
        $response=Get-Content $responseFile -Raw|ConvertFrom-Json
        if(-not$response.ok){throw "Visual capture $Id failed: $($response.error)"}
        if(-not(Test-Path $pngFile -PathType Leaf)){throw "Visual capture $Id reported success without a PNG."}
        if($response.renderTelemetry){$script:captureTelemetry[$Id]=$response.renderTelemetry}
        return $response
      }
    }
    try{Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3|Out-Null}
    catch{throw "Visual capture $Id timed out and the packaged editor stopped responding on port $port."}
    if($attempt-lt$maximumAttempts){
      Write-Warning "Visual capture $Id timed out on attempt $attempt; retrying against the healthy packaged editor."
      Start-Sleep -Seconds 1
    }
  }
  throw "Visual capture $Id timed out after $maximumAttempts attempts."
}'''


def apply(root: Path, changed: list[str]) -> None:
    path = root / 'scripts/run-phase1c-visual-captures.ps1'
    text = path.read_text(encoding='utf-8')
    if NEW_FUNCTION in text:
        return
    if OLD_FUNCTION not in text:
        raise RuntimeError('Expected Phase 1C capture request function was not found.')
    path.write_text(text.replace(OLD_FUNCTION, NEW_FUNCTION, 1), encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())
