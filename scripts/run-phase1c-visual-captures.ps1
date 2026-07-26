$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function Stop-OmniForgeProcesses {
  Get-Process OmniForge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Wait-Health([int]$Port,[int]$TimeoutSeconds=45){
  $deadline=(Get-Date).AddSeconds($TimeoutSeconds)
  while((Get-Date)-lt$deadline){
    Start-Sleep -Milliseconds 350
    try{Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2|Out-Null;return}
    catch{}
  }
  throw "Packaged editor did not become healthy on port $Port."
}

function Patch-World([int]$Port,[hashtable]$Body){
  $json=$Body|ConvertTo-Json -Depth 12
  Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v010/world" -Method Patch -ContentType 'application/json' -Body $json -TimeoutSec 10|Out-Null
  Start-Sleep -Milliseconds 1700
}

function Request-Capture([string]$CaptureDir,[string]$Id,[hashtable]$Camera,[int]$WaitMs=700){
  $request=@{id=$Id;options=@{camera=$Camera;hideGuides=$true;waitMs=$WaitMs}}
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
      return $pngFile
    }
  }
  throw "Visual capture $Id timed out."
}

function Get-ImageMetrics([string]$Path){
  Add-Type -AssemblyName System.Drawing
  $bitmap=[System.Drawing.Bitmap]::FromFile($Path)
  try{
    $step=2;$count=0;$sumR=0.0;$sumG=0.0;$sumB=0.0;$sumL=0.0;$sumL2=0.0;$minL=1.0;$maxL=0.0;$bright=0;$dark=0
    $rows=New-Object System.Collections.Generic.List[double]
    for($y=0;$y-lt$bitmap.Height;$y+=$step){
      $rowSum=0.0;$rowCount=0
      for($x=0;$x-lt$bitmap.Width;$x+=$step){
        $color=$bitmap.GetPixel($x,$y)
        $r=$color.R/255.0;$g=$color.G/255.0;$b=$color.B/255.0
        $luma=.2126*$r+.7152*$g+.0722*$b
        $sumR+=$r;$sumG+=$g;$sumB+=$b;$sumL+=$luma;$sumL2+=$luma*$luma;$minL=[Math]::Min($minL,$luma);$maxL=[Math]::Max($maxL,$luma);$count++;$rowSum+=$luma;$rowCount++
        if($luma-gt.92){$bright++};if($luma-lt.035){$dark++}
      }
      $rows.Add($rowSum/[Math]::Max(1,$rowCount))
    }
    $averageLuma=$sumL/[Math]::Max(1,$count)
    $lumaStdDev=[Math]::Sqrt([Math]::Max(0.0,$sumL2/[Math]::Max(1,$count)-$averageLuma*$averageLuma))
    $maxSpike=0.0
    for($i=3;$i-lt$rows.Count-3;$i++){
      $neighbor=($rows[$i-3]+$rows[$i-2]+$rows[$i-1]+$rows[$i+1]+$rows[$i+2]+$rows[$i+3])/6.0
      $spike=[Math]::Abs($rows[$i]-$neighbor)
      if($spike-gt$maxSpike){$maxSpike=$spike}
    }
    return [ordered]@{
      width=$bitmap.Width;height=$bitmap.Height
      averageRed=$sumR/$count;averageGreen=$sumG/$count;averageBlue=$sumB/$count
      averageLuma=$averageLuma;lumaStdDev=$lumaStdDev;minimumLuma=$minL;maximumLuma=$maxL
      brightFraction=$bright/$count;darkFraction=$dark/$count;maximumSingleRowSpike=$maxSpike
    }
  }finally{$bitmap.Dispose()}
}

$root=(Get-Location).Path
$output=Join-Path $root 'dist\OmniForge-win32-x64'
$captureDir=Join-Path $root 'PHASE1C_VISUAL_CAPTURES'
$metricsFile=Join-Path $captureDir 'visual-metrics.json'
$runtime=Join-Path $env:TEMP "omniforge-phase1c-visual-$env:GITHUB_RUN_ID"
Remove-Item $captureDir,$runtime -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $captureDir,$runtime|Out-Null
$port=43148
$env:OMNIFORGE_DATA_ROOT=$runtime
$env:OMNIFORGE_PORT="$port"
$env:OMNIFORGE_CAPTURE_DIR=$captureDir
$process=$null
try{
  $process=Start-Process -FilePath(Join-Path $output 'OmniForge.exe')-PassThru
  Wait-Health $port
  Start-Sleep -Seconds 3

  Patch-World $port @{
    lookPreset='clear-day';time=@{hours=12};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    atmosphere=@{haze=.004;mie=.025;humidity=.02;dayFogMultiplier=.08;nightFogMultiplier=.18;exposure=.72;saturation=1.04;contrast=1.03;vibrance=.06};
    sky=@{celestialMode='manual';sunAzimuth=18;sunElevation=42;moonAzimuth=205;moonElevation=-22;planetEnabled=$false;eclipseMode='auto';starIntensity=0;milkyWayIntensity=0}
  }
  Request-Capture $captureDir 'clear-day' @{position=@(20,15,30);yaw=-.55;pitch=.18;fov=62}|Out-Null

  Patch-World $port @{
    lookPreset='custom';time=@{hours=0};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    atmosphere=@{haze=.002;mie=.018;humidity=.01;dayFogMultiplier=.05;nightFogMultiplier=.08;exposure=.82;saturation=1.05;contrast=1.05;vibrance=.08};
    sky=@{celestialMode='manual';sunAzimuth=180;sunElevation=-35;moonAzimuth=150;moonElevation=-18;planetEnabled=$false;eclipseMode='auto';starIntensity=1;starDensity=.62;starBrightness=.86;starTwinkleAmount=.42;starTwinkleSpeed=.9;starSizeMin=.38;starSizeMax=1.4;starRayStrength=.1;starRayLength=.9;starHeroFraction=.018;milkyWayIntensity=.62;milkyWayWidth=.2;milkyWayDetail=1.05;milkyWayOrientation=0;milkyWayDust=.72;milkyWayWarp=.42;milkyWayClumping=.72;milkyWayCoreStrength=.72;milkyWayWidthVariation=.52}
  }
  Request-Capture $captureDir 'night-sky' @{position=@(0,20,0);yaw=.2;pitch=.8;fov=80}|Out-Null
  Request-Capture $captureDir 'milky-way' @{position=@(0,20,0);yaw=-1.856;pitch=.3;fov=78}|Out-Null

  Patch-World $port @{
    lookPreset='custom';time=@{hours=1};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    sky=@{celestialMode='manual';sunAzimuth=155;sunElevation=-12;moonAzimuth=0;moonElevation=35;moonSize=8;moonBrightness=1.05;moonGlow=.12;moonPhaseMode='manual';moonPhase=.88;moonCraterStrength=1.15;moonMariaStrength=.9;moonSurfaceContrast=1.22;moonReliefStrength=.48;moonLimbDarkening=.34;planetEnabled=$false;eclipseMode='auto';starIntensity=.22;milkyWayIntensity=0}
  }
  Request-Capture $captureDir 'moon-close' @{position=@(0,20,0);yaw=0;pitch=.610865;fov=12}|Out-Null

  Patch-World $port @{
    lookPreset='custom';time=@{hours=12};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    sky=@{celestialMode='manual';sunAzimuth=0;sunElevation=30;sunSize=4;moonAzimuth=0;moonElevation=30;moonSize=4;solarEclipseCoverage=1.12;eclipseMode='force-solar';planetEnabled=$false;starIntensity=0;milkyWayIntensity=0}
  }
  Request-Capture $captureDir 'solar-eclipse' @{position=@(0,20,0);yaw=0;pitch=.523599;fov=10}|Out-Null

  $metrics=[ordered]@{}
  foreach($id in @('clear-day','night-sky','milky-way','moon-close','solar-eclipse')){$metrics[$id]=Get-ImageMetrics(Join-Path $captureDir "$id.png")}
  $metrics|ConvertTo-Json -Depth 8|Set-Content $metricsFile -Encoding utf8

  if($metrics['night-sky'].brightFraction-gt.1){throw "Night sky is overdrawn: bright fraction $($metrics['night-sky'].brightFraction)."}
  if($metrics['night-sky'].maximumLuma-lt.42 -or $metrics['night-sky'].lumaStdDev-lt.012){throw 'Night sky does not contain a readable varied star field.'}
  if($metrics['night-sky'].maximumSingleRowSpike-gt.18){throw "Night sky contains a severe horizontal seam: $($metrics['night-sky'].maximumSingleRowSpike)."}
  if($metrics['milky-way'].maximumLuma-lt.34 -or $metrics['milky-way'].lumaStdDev-lt.014){throw 'Milky Way is absent or lacks visible internal structure.'}
  if($metrics['milky-way'].maximumSingleRowSpike-gt.18){throw "Milky Way contains a severe row seam: $($metrics['milky-way'].maximumSingleRowSpike)."}
  if($metrics['moon-close'].maximumLuma-lt.42 -or $metrics['moon-close'].lumaStdDev-lt.018){throw 'Moon close-up is too small or lacks readable surface contrast.'}
  if($metrics['solar-eclipse'].darkFraction-lt.001){throw 'Solar eclipse does not contain a clearly readable dark occluder.'}
  if($metrics['clear-day'].averageBlue-lt$metrics['clear-day'].averageRed){throw 'Clear-day capture is not blue-dominant.'}
  if($metrics['clear-day'].brightFraction-gt.72){throw 'Clear-day capture is still excessively blown out.'}
  if($process.HasExited){throw 'Packaged editor exited during visual evidence capture.'}
}finally{
  if($process-and-not$process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}
  Stop-OmniForgeProcesses
  Remove-Item Env:OMNIFORGE_DATA_ROOT,Env:OMNIFORGE_PORT,Env:OMNIFORGE_CAPTURE_DIR -ErrorAction SilentlyContinue
  Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Rendered visual evidence written to $captureDir"
