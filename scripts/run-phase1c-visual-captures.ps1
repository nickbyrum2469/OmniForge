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
  $response=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v010/world" -Method Patch -ContentType 'application/json' -Body $json -TimeoutSec 10
  return [int64]$response.state.engine.revision
}

function Request-Capture([string]$CaptureDir,[string]$Id,[hashtable]$Camera,[int64]$MinimumRevision,[int]$WaitMs=700){
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

function Get-StateHash([hashtable]$Body){
  $json=$Body|ConvertTo-Json -Depth 12 -Compress
  $bytes=[Text.Encoding]::UTF8.GetBytes($json)
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}
  finally{$sha.Dispose()}
}

$captureSkyDefaults=@{
  celestialMode='manual'
  sunAzimuth=-90;sunElevation=45;sunSize=1;sunGlow=.38
  moonAzimuth=90;moonElevation=32;moonSize=1.25;moonPhase=.72;moonPhaseMode='sun-relative'
  moonBrightness=.92;moonGlow=.22;moonDetail=1.45;moonColor='#c9d4e4';moonEarthshine=.08
  moonCraterStrength=.85;moonMariaStrength=.62;moonSurfaceContrast=1.18;moonPatternRotation=-12
  moonPatternSeed=2718;moonReliefStrength=.38;moonLimbDarkening=.28;moonStyle='earth-like'
  eclipseMode='auto';solarEclipseCoverage=1.08
  starIntensity=.9;starDensity=.55;starBrightness=.82;starTwinkleAmount=.32;starTwinkleSpeed=1
  starSizeMin=.36;starSizeMax=1.55;starColorVariation=.65;starSeed=1337;starDaylightExtinction=1.35
  starRayStrength=.12;starRayLength=1.15;starHeroFraction=.018
  milkyWayIntensity=.34;milkyWayWidth=.22;milkyWayDetail=1.15;milkyWayOrientation=22
  milkyWayDust=.7;milkyWayColor='#8fa7d8';milkyWayWarp=.48;milkyWayClumping=.72
  milkyWayCoreStrength=.65;milkyWayWidthVariation=.6
  planetEnabled=$false;planetAzimuth=215;planetElevation=28;planetSize=4.5
  planetColor='#d49a72';planetBrightness=.8;planetRings=.65
  auroraIntensity=0;shootingStarRate=.05
}

function Get-IsolatedSky([hashtable]$Overrides){
  $sky=@{}
  foreach($entry in $captureSkyDefaults.GetEnumerator()){$sky[$entry.Key]=$entry.Value}
  foreach($entry in $Overrides.GetEnumerator()){$sky[$entry.Key]=$entry.Value}
  return $sky
}

$root=(Get-Location).Path
$output=Join-Path $root 'dist\OmniForge-win32-x64'
$captureDir=Join-Path $root 'PHASE1C_VISUAL_CAPTURES'
$metricsFile=Join-Path $captureDir 'visual-metrics.json'
$manifestFile=Join-Path $captureDir 'capture-manifest.json'
$runtime=Join-Path $env:TEMP "omniforge-phase1c-visual-$env:GITHUB_RUN_ID"
Remove-Item $captureDir,$runtime -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $captureDir,$runtime|Out-Null
$port=43148
$env:OMNIFORGE_DATA_ROOT=$runtime
$env:OMNIFORGE_PORT="$port"
$env:OMNIFORGE_CAPTURE_DIR=$captureDir
$process=$null
$captureRecords=@()
$captureTelemetry=@{}
try{
  $process=Start-Process -FilePath(Join-Path $output 'OmniForge.exe')-PassThru
  Wait-Health $port
  Start-Sleep -Seconds 3

  $clearDay=@{
    lookPreset='clear-day';time=@{hours=12};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    lighting=@{profile='quality'};
    atmosphere=@{haze=.004;mie=.025;humidity=.02;dayFogMultiplier=.08;nightFogMultiplier=.18;exposure=.86;saturation=1.04;contrast=1.03;vibrance=.06};
    sky=(Get-IsolatedSky @{sunAzimuth=18;sunElevation=42;moonAzimuth=205;moonElevation=-22;starIntensity=0;milkyWayIntensity=0})
  }
  $clearDayCamera=@{position=@(20,15,30);yaw=-.55;pitch=.18;fov=62}
  $revision=Patch-World $port $clearDay
  Request-Capture $captureDir '01-clear-midday-wide' $clearDayCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='01-clear-midday-wide';file='01-clear-midday-wide.png';preset='clear-day';camera=$clearDayCamera;time=12;seed=1337;worldStateHash=Get-StateHash $clearDay;revision=$revision}
  $clearPlayerCamera=@{position=@(0,6,20);yaw=0;pitch=.08;fov=68}
  Request-Capture $captureDir '02-clear-midday-player' $clearPlayerCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='02-clear-midday-player';file='02-clear-midday-player.png';preset='clear-day';camera=$clearPlayerCamera;time=12;seed=1337;worldStateHash=Get-StateHash $clearDay;revision=$revision}

  $nightSky=@{
    lookPreset='custom';time=@{hours=0};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    lighting=@{profile='quality'};
    atmosphere=@{haze=.002;mie=.018;humidity=.01;dayFogMultiplier=.05;nightFogMultiplier=.08;exposure=.82;saturation=1.05;contrast=1.05;vibrance=.08};
    sky=(Get-IsolatedSky @{sunAzimuth=180;sunElevation=-35;moonAzimuth=150;moonElevation=-18;starIntensity=1;starDensity=.62;starBrightness=.86;starTwinkleAmount=.42;starTwinkleSpeed=.9;starSizeMin=.38;starSizeMax=1.4;starRayStrength=.06;starRayLength=.7;starHeroFraction=.004;milkyWayIntensity=0;milkyWayWidth=.2;milkyWayDetail=1.05;milkyWayOrientation=32;milkyWayDust=.72;milkyWayWarp=.42;milkyWayClumping=.72;milkyWayCoreStrength=.72;milkyWayWidthVariation=.52})
  }
  $nightCamera=@{position=@(0,20,0);yaw=-.65;pitch=.92;fov=78}
  $revision=Patch-World $port $nightSky
  Request-Capture $captureDir '05-night-realistic-wide' $nightCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='05-night-realistic-wide';file='05-night-realistic-wide.png';preset='realistic-night';camera=$nightCamera;time=0;seed=1337;worldStateHash=Get-StateHash $nightSky;revision=$revision}

  $faintMilkyWay=@{sky=@{starIntensity=.34;starDensity=.62;starBrightness=.7;milkyWayIntensity=.18;milkyWayWidth=.2;milkyWayDetail=.82;milkyWayOrientation=32;milkyWayDust=.74;milkyWayWarp=.3;milkyWayClumping=.54;milkyWayCoreStrength=.42;milkyWayWidthVariation=.4;milkyWayColor='#91a4cf'}}
  $faintMilkyWayCamera=@{position=@(0,20,0);yaw=-.72;pitch=.92;fov=72}
  $revision=Patch-World $port $faintMilkyWay
  Request-Capture $captureDir '06-night-faint-milkyway' $faintMilkyWayCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='06-night-faint-milkyway';file='06-night-faint-milkyway.png';preset='faint-natural';camera=$faintMilkyWayCamera;time=0;seed=1337;worldStateHash=Get-StateHash $faintMilkyWay;revision=$revision}

  $milkyWay=@{sky=@{starIntensity=.24;starDensity=.72;starBrightness=.68;milkyWayIntensity=.72;milkyWayWidth=.18;milkyWayDetail=1.2;milkyWayOrientation=32;milkyWayDust=.86;milkyWayWarp=.5;milkyWayClumping=.88;milkyWayCoreStrength=1.08;milkyWayWidthVariation=.66}}
  $milkyWayCamera=@{position=@(0,20,0);yaw=-.75;pitch=1.02;fov=68}
  $revision=Patch-World $port $milkyWay
  Request-Capture $captureDir '07-night-core-close' $milkyWayCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='07-night-core-close';file='07-night-core-close.png';preset='dramatic-core';camera=$milkyWayCamera;time=0;seed=1337;worldStateHash=Get-StateHash $milkyWay;revision=$revision}

  $fantasySky=@{
    lookPreset='fantasy-sky';time=@{hours=22};weather=@{preset='clear';fog=0};clouds=@{quality='quality';coverage=.04;density=.14;shadowStrength=.08};
    lighting=@{profile='quality';moonIntensity=.22;indirectStrength=.58};
    atmosphere=@{haze=.012;mie=.04;humidity=.03;dayFogMultiplier=.03;nightFogMultiplier=.1;exposure=.82;saturation=1.22;contrast=1.07;vibrance=.28};
    sky=(Get-IsolatedSky @{sunAzimuth=180;sunElevation=-32;moonAzimuth=145;moonElevation=-15;starIntensity=1.2;starDensity=.82;starBrightness=.92;starTwinkleAmount=.45;starSizeMin=.38;starSizeMax=1.45;starRayStrength=.1;starHeroFraction=.012;milkyWayIntensity=.82;milkyWayWidth=.21;milkyWayDetail=1.25;milkyWayOrientation=32;milkyWayDust=.82;milkyWayWarp=.72;milkyWayClumping=.96;milkyWayCoreStrength=1.08;milkyWayWidthVariation=.72;milkyWayColor='#b984ff'})
  }
  $fantasyCamera=@{position=@(0,20,0);yaw=-.75;pitch=1.02;fov=68}
  $revision=Patch-World $port $fantasySky
  Request-Capture $captureDir '08-fantasy-violet-galaxy' $fantasyCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='08-fantasy-violet-galaxy';file='08-fantasy-violet-galaxy.png';preset='fantasy-violet';camera=$fantasyCamera;time=22;seed=1337;worldStateHash=Get-StateHash $fantasySky;revision=$revision}

  $moonClose=@{
    lookPreset='custom';time=@{hours=1};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    lighting=@{profile='quality'};
    sky=(Get-IsolatedSky @{sunAzimuth=155;sunElevation=-12;moonAzimuth=0;moonElevation=35;moonSize=38;moonColor='#d8d3c8';moonBrightness=1.02;moonGlow=.1;moonPhaseMode='manual';moonPhase=.88;moonCraterStrength=1.12;moonMariaStrength=.9;moonSurfaceContrast=1.16;moonReliefStrength=.42;moonLimbDarkening=.3;starIntensity=.22;milkyWayIntensity=0})
  }
  $moonCamera=@{position=@(0,20,0);yaw=0;pitch=.610865;fov=7}
  $moonWorld=@{sky=@{moonSize=4}}
  $revision=Patch-World $port $moonClose
  $revision=Patch-World $port $moonWorld
  $moonWorldCamera=@{position=@(0,20,0);yaw=0;pitch=.610865;fov=46}
  Request-Capture $captureDir '09-moon-world-scale' $moonWorldCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='09-moon-world-scale';file='09-moon-world-scale.png';preset='realistic-moon';camera=$moonWorldCamera;time=1;seed=2718;worldStateHash=Get-StateHash $moonWorld;revision=$revision}
  $revision=Patch-World $port @{sky=@{moonSize=38}}
  Request-Capture $captureDir '10-moon-close' $moonCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='10-moon-close';file='10-moon-close.png';preset='realistic-moon';camera=$moonCamera;time=1;seed=2718;worldStateHash=Get-StateHash $moonClose;revision=$revision}

  $solarEclipse=@{
    lookPreset='custom';time=@{hours=12};weather=@{preset='clear';fog=0};clouds=@{coverage=0;density=0};
    lighting=@{profile='quality'};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=30;sunSize=9;moonAzimuth=0;moonElevation=30;moonSize=9;solarEclipseCoverage=1.12;eclipseMode='force-solar';starIntensity=0;milkyWayIntensity=0})
  }
  $eclipseCamera=@{position=@(0,20,0);yaw=0;pitch=.523599;fov=10}
  $revision=Patch-World $port $solarEclipse
  Request-Capture $captureDir '14-total-eclipse' $eclipseCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='14-total-eclipse';file='14-total-eclipse.png';preset='total-eclipse';camera=$eclipseCamera;time=12;seed=1337;worldStateHash=Get-StateHash $solarEclipse;revision=$revision}

  $goldenHour=@{
    lookPreset='golden-hour';time=@{hours=18.15};weather=@{preset='partly-cloudy';fog=.008};clouds=@{quality='quality';coverage=.22;density=.38;shadowStrength=.24};
    lighting=@{profile='quality';sunIntensity=2.9;indirectStrength=.68};
    atmosphere=@{haze=.055;mie=.11;humidity=.18;dayFogMultiplier=.12;nightFogMultiplier=.2;exposure=.72;saturation=1.15;contrast=1.07;vibrance=.18};
    sky=(Get-IsolatedSky @{sunAzimuth=24;sunElevation=6;moonAzimuth=204;moonElevation=-12;sunGlow=.95;starIntensity=.15;milkyWayIntensity=0})
  }
  $landscapeCamera=@{position=@(20,15,30);yaw=-.55;pitch=.14;fov=62}
  $goldenCamera=@{position=@(20,15,30);yaw=.42;pitch=.12;fov=62}
  $revision=Patch-World $port $goldenHour
  Request-Capture $captureDir '03-golden-hour-coast' $goldenCamera $revision 1100|Out-Null
  $captureRecords+=[ordered]@{id='03-golden-hour-coast';file='03-golden-hour-coast.png';preset='golden-hour';camera=$goldenCamera;time=18.15;seed=1337;worldStateHash=Get-StateHash $goldenHour;revision=$revision}

  $twilight=@{
    lookPreset='clean-twilight';time=@{hours=19.45};weather=@{preset='clear';fog=.002};clouds=@{quality='quality';coverage=.1;density=.24;shadowStrength=.15};
    lighting=@{profile='quality';sunIntensity=2.2;moonIntensity=.18;indirectStrength=.68};
    atmosphere=@{haze=.018;mie=.05;humidity=.07;dayFogMultiplier=.05;nightFogMultiplier=.12;exposure=.82;saturation=1.03;contrast=1.03;vibrance=.08};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=-4;moonAzimuth=145;moonElevation=18;sunGlow=.54;starIntensity=.82;starDensity=.58;starBrightness=.72;milkyWayIntensity=.18;milkyWayWidth=.2;milkyWayOrientation=32;milkyWayDust=.72;milkyWayWarp=.45;milkyWayClumping=.74;milkyWayCoreStrength=.7})
  }
  $twilightCamera=@{position=@(0,20,0);yaw=0;pitch=.2;fov=72}
  $revision=Patch-World $port $twilight
  Request-Capture $captureDir '04-twilight-stars' $twilightCamera $revision 1100|Out-Null
  $captureRecords+=[ordered]@{id='04-twilight-stars';file='04-twilight-stars.png';preset='clean-twilight';camera=$twilightCamera;time=19.45;seed=1337;worldStateHash=Get-StateHash $twilight;revision=$revision}

  $partialEclipse=@{
    lookPreset='custom';time=@{hours=12};weather=@{preset='clear';fog=0};clouds=@{coverage=.08;density=.2;shadowStrength=.12};
    lighting=@{profile='quality'};
    atmosphere=@{haze=.02;mie=.055;humidity=.06;exposure=.78;saturation=1.04;contrast=1.04};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=30;sunSize=9;moonAzimuth=.72;moonElevation=30;moonSize=9;solarEclipseCoverage=1;eclipseMode='automatic';starIntensity=0;milkyWayIntensity=0})
  }
  $revision=Patch-World $port $partialEclipse
  Request-Capture $captureDir '11-partial-eclipse' $eclipseCamera $revision 900|Out-Null
  $captureRecords+=[ordered]@{id='11-partial-eclipse';file='11-partial-eclipse.png';preset='partial-eclipse';camera=$eclipseCamera;time=12;seed=1337;worldStateHash=Get-StateHash $partialEclipse;revision=$revision}

  $annularEclipse=@{
    lookPreset='custom';time=@{hours=17.4};weather=@{preset='partly-cloudy';fog=.006};clouds=@{coverage=.18;density=.32;shadowStrength=.2};
    lighting=@{profile='quality'};
    atmosphere=@{haze=.065;mie=.12;humidity=.2;exposure=.76;saturation=1.12;contrast=1.06};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=16;sunSize=9;moonAzimuth=0;moonElevation=16;moonSize=7.5;solarEclipseCoverage=1;eclipseMode='automatic';starIntensity=0;milkyWayIntensity=0})
  }
  $annularCamera=@{position=@(0,20,0);yaw=0;pitch=.279253;fov=10}
  $revision=Patch-World $port $annularEclipse
  Request-Capture $captureDir '12-annular-eclipse' $annularCamera $revision 1100|Out-Null
  $captureRecords+=[ordered]@{id='12-annular-eclipse';file='12-annular-eclipse.png';preset='annular-eclipse-warm';camera=$annularCamera;time=17.4;seed=1337;worldStateHash=Get-StateHash $annularEclipse;revision=$revision}

  $overcast=@{
    lookPreset='overcast-soft';time=@{hours=13};weather=@{preset='overcast';fog=.018};clouds=@{quality='quality';coverage=.88;density=.68;shadowStrength=.42};
    lighting=@{profile='quality';sunIntensity=1.15;indirectStrength=.92};
    atmosphere=@{haze=.06;mie=.1;humidity=.52;dayFogMultiplier=.12;nightFogMultiplier=.2;exposure=.82;saturation=1.04;contrast=.94;vibrance=.12};
    sky=(Get-IsolatedSky @{sunAzimuth=30;sunElevation=38;moonAzimuth=210;moonElevation=-20;sunGlow=.15;starIntensity=0;milkyWayIntensity=0})
  }
  $revision=Patch-World $port $overcast
  Request-Capture $captureDir '18-overcast' $landscapeCamera $revision 1300|Out-Null
  $captureRecords+=[ordered]@{id='18-overcast';file='18-overcast.png';preset='overcast-soft';camera=$landscapeCamera;time=13;seed=1337;worldStateHash=Get-StateHash $overcast;revision=$revision}

  $diamondRing=@{
    lookPreset='custom';time=@{hours=12};weather=@{preset='clear';fog=0};clouds=@{quality='quality';coverage=.03;density=.14;shadowStrength=.08};
    lighting=@{profile='quality'};
    atmosphere=@{haze=.012;mie=.04;humidity=.04;exposure=.78;saturation=1.04;contrast=1.05};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=30;sunSize=9;moonAzimuth=0;moonElevation=30;moonSize=9;solarEclipseCoverage=1;eclipseMode='force-solar';starIntensity=0;milkyWayIntensity=0})
  }
  $revision=Patch-World $port $diamondRing
  Request-Capture $captureDir '13-diamond-ring' $eclipseCamera $revision 1000|Out-Null
  $captureRecords+=[ordered]@{id='13-diamond-ring';file='13-diamond-ring.png';preset='diamond-ring';camera=$eclipseCamera;time=12;seed=1337;worldStateHash=Get-StateHash $diamondRing;revision=$revision}

  $eclipseLandscape=@{
    lookPreset='custom';time=@{hours=12};weather=@{preset='partly-cloudy';fog=.004};clouds=@{quality='quality';coverage=.16;density=.3;shadowStrength=.18};
    lighting=@{profile='quality'};
    atmosphere=@{haze=.035;mie=.075;humidity=.12;exposure=.82;saturation=1.05;contrast=1.06};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=8;sunSize=9;moonAzimuth=0;moonElevation=8;moonSize=9.5;solarEclipseCoverage=1;eclipseMode='force-solar';starIntensity=0;milkyWayIntensity=0})
  }
  $eclipseLandscapeCamera=@{position=@(0,11,24);yaw=0;pitch=.139626;fov=62}
  $revision=Patch-World $port $eclipseLandscape
  Request-Capture $captureDir '15-eclipse-landscape' $eclipseLandscapeCamera $revision 1200|Out-Null
  $captureRecords+=[ordered]@{id='15-eclipse-landscape';file='15-eclipse-landscape.png';preset='total-eclipse-landscape';camera=$eclipseLandscapeCamera;time=12;seed=1337;worldStateHash=Get-StateHash $eclipseLandscape;revision=$revision}

  $forestMorning=@{
    lookPreset='custom';time=@{hours=7};weather=@{preset='fog';fog=.18};clouds=@{quality='quality';coverage=.12;density=.28;shadowStrength=.14};
    lighting=@{profile='quality';sunIntensity=2.8;indirectStrength=.72};
    atmosphere=@{haze=.075;mie=.14;humidity=.72;dayFogMultiplier=.26;nightFogMultiplier=.3;exposure=.86;saturation=1.05;contrast=1.06;vibrance=.08};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=9;moonAzimuth=180;moonElevation=-20;sunGlow=.82;starIntensity=0;milkyWayIntensity=0})
  }
  $morningCamera=@{position=@(0,7,22);yaw=0;pitch=.12;fov=68}
  $revision=Patch-World $port $forestMorning
  Request-Capture $captureDir '16-forest-morning-shafts' $morningCamera $revision 1300|Out-Null
  $captureRecords+=[ordered]@{id='16-forest-morning-shafts';file='16-forest-morning-shafts.png';preset='forest-morning';camera=$morningCamera;time=7;seed=1337;worldStateHash=Get-StateHash $forestMorning;revision=$revision}

  $coastalBacklight=@{
    lookPreset='custom';time=@{hours=18};weather=@{preset='clear';fog=.006};clouds=@{quality='quality';coverage=.08;density=.22;shadowStrength=.1};
    lighting=@{profile='quality';sunIntensity=3;indirectStrength=.7};
    atmosphere=@{haze=.055;mie=.12;humidity=.68;dayFogMultiplier=.12;nightFogMultiplier=.2;exposure=.86;saturation=1.08;contrast=1.07;vibrance=.12};
    sky=(Get-IsolatedSky @{sunAzimuth=0;sunElevation=5;moonAzimuth=180;moonElevation=-18;sunGlow=1.05;starIntensity=0;milkyWayIntensity=0})
  }
  $revision=Patch-World $port $coastalBacklight
  Request-Capture $captureDir '17-coastal-backlight' $morningCamera $revision 1200|Out-Null
  $captureRecords+=[ordered]@{id='17-coastal-backlight';file='17-coastal-backlight.png';preset='coastal-backlight';camera=$morningCamera;time=18;seed=1337;worldStateHash=Get-StateHash $coastalBacklight;revision=$revision}

  $storm=@{
    lookPreset='storm-drama';time=@{hours=14};weather=@{preset='storm';fog=.12;precipitation=.82;wetness=.72;windStrength=.9};clouds=@{quality='quality';coverage=.96;density=.88;shadowStrength=.68};
    lighting=@{profile='quality';sunIntensity=1.5;indirectStrength=.58};
    atmosphere=@{haze=.14;mie=.19;humidity=.9;dayFogMultiplier=.34;nightFogMultiplier=.4;exposure=.8;saturation=1.04;contrast=1.08;vibrance=.1};
    sky=(Get-IsolatedSky @{sunAzimuth=24;sunElevation=24;moonAzimuth=205;moonElevation=-18;sunGlow=.18;starIntensity=0;milkyWayIntensity=0})
  }
  $revision=Patch-World $port $storm
  Request-Capture $captureDir '19-storm' $landscapeCamera $revision 1500|Out-Null
  $captureRecords+=[ordered]@{id='19-storm';file='19-storm.png';preset='storm-drama';camera=$landscapeCamera;time=14;seed=1337;worldStateHash=Get-StateHash $storm;revision=$revision}

  $revision=Patch-World $port $clearDay
  Request-Capture $captureDir '20-path-terrain-regression' $clearDayCamera $revision|Out-Null
  $captureRecords+=[ordered]@{id='20-path-terrain-regression';file='20-path-terrain-regression.png';preset='clear-day';camera=$clearDayCamera;time=12;seed=1337;worldStateHash=Get-StateHash $clearDay;revision=$revision}

  $metrics=[ordered]@{}
  $captureIds=@(
    '01-clear-midday-wide','02-clear-midday-player','03-golden-hour-coast','04-twilight-stars',
    '05-night-realistic-wide','06-night-faint-milkyway','07-night-core-close','08-fantasy-violet-galaxy',
    '09-moon-world-scale','10-moon-close','11-partial-eclipse','12-annular-eclipse','13-diamond-ring',
    '14-total-eclipse','15-eclipse-landscape','16-forest-morning-shafts','17-coastal-backlight',
    '18-overcast','19-storm','20-path-terrain-regression'
  )
  foreach($id in $captureIds){$metrics[$id]=Get-ImageMetrics(Join-Path $captureDir "$id.png")}
  $metrics|ConvertTo-Json -Depth 8|Set-Content $metricsFile -Encoding utf8

  $sourceCommit=(Get-Content -LiteralPath(Join-Path $output 'source-commit')-Raw).Trim()
  $gpuNames=@(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue|ForEach-Object{$_.Name}|Where-Object{$_})
  $manifest=[ordered]@{
    sourceCommit=$sourceCommit
    workflowRunId=if($env:GITHUB_RUN_ID){$env:GITHUB_RUN_ID}else{'local'}
    buildIdentity=$sourceCommit
    platform=[Environment]::OSVersion.VersionString
    gpu=if($gpuNames.Count){$gpuNames}else{@('Not reported by Win32_VideoController')}
    resolution="$($metrics['01-clear-midday-wide'].width)x$($metrics['01-clear-midday-wide'].height)"
    qualityTier='quality'
    generatedAt=(Get-Date).ToUniversalTime().ToString('o')
    files=$captureRecords
    renderTelemetry=$captureTelemetry
  }
  $manifest|ConvertTo-Json -Depth 12|Set-Content $manifestFile -Encoding utf8

  if($metrics['05-night-realistic-wide'].brightFraction-gt.1){throw "Night sky is overdrawn: bright fraction $($metrics['05-night-realistic-wide'].brightFraction)."}
  if($metrics['05-night-realistic-wide'].maximumLuma-lt.42 -or $metrics['05-night-realistic-wide'].lumaStdDev-lt.012){throw 'Night sky does not contain a readable varied star field.'}
  if($metrics['05-night-realistic-wide'].maximumSingleRowSpike-gt.18){throw "Night sky contains a severe horizontal seam: $($metrics['05-night-realistic-wide'].maximumSingleRowSpike)."}
  if($metrics['07-night-core-close'].maximumLuma-lt.34 -or $metrics['07-night-core-close'].lumaStdDev-lt.014){throw 'Milky Way is absent or lacks visible internal structure.'}
  if($metrics['07-night-core-close'].maximumSingleRowSpike-gt.18){throw "Milky Way contains a severe row seam: $($metrics['07-night-core-close'].maximumSingleRowSpike)."}
  if($metrics['10-moon-close'].maximumLuma-lt.42 -or $metrics['10-moon-close'].lumaStdDev-lt.018){throw 'Moon close-up is too small or lacks readable surface contrast.'}
  if($metrics['14-total-eclipse'].darkFraction-lt.001){throw 'Solar eclipse does not contain a clearly readable dark occluder.'}
  if($metrics['11-partial-eclipse'].darkFraction-lt.001){throw 'Partial eclipse does not contain a readable lunar occluder.'}
  if($metrics['12-annular-eclipse'].darkFraction-lt.001-or$metrics['12-annular-eclipse'].maximumLuma-lt.35){throw 'Annular eclipse does not contain both a dark occluder and a readable solar ring.'}
  if($metrics['13-diamond-ring'].darkFraction-lt.001-or$metrics['13-diamond-ring'].maximumLuma-lt.35){throw 'Diamond-ring capture lacks a dark occluder or bright edge event.'}
  if($metrics['03-golden-hour-coast'].averageLuma-lt.035){throw 'Golden-hour landscape is unreadably dark.'}
  if($metrics['04-twilight-stars'].maximumLuma-lt.3){throw 'Twilight capture lacks readable celestial or horizon highlights.'}
  if($metrics['18-overcast'].averageLuma-lt.035){throw 'Overcast landscape is unreadably dark.'}
  if($metrics['19-storm'].averageLuma-lt.02){throw 'Storm landscape is unreadably dark.'}
  if($metrics['01-clear-midday-wide'].averageBlue-lt$metrics['01-clear-midday-wide'].averageRed){throw 'Clear-day capture is not blue-dominant.'}
  if($metrics['01-clear-midday-wide'].brightFraction-gt.72){throw 'Clear-day capture is still excessively blown out.'}
  if($process.HasExited){throw 'Packaged editor exited during visual evidence capture.'}
}finally{
  if($process-and-not$process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}
  Stop-OmniForgeProcesses
  Remove-Item Env:OMNIFORGE_DATA_ROOT,Env:OMNIFORGE_PORT,Env:OMNIFORGE_CAPTURE_DIR -ErrorAction SilentlyContinue
  Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Rendered visual evidence written to $captureDir"
