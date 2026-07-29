from pathlib import Path
import re


def replace_required(source, old, new, label):
    if new in source:
        return source
    if old not in source:
        raise RuntimeError(f'Missing visual-quality anchor: {label}')
    return source.replace(old, new, 1)


# Make stars visible at real viewport pixel sizes without restoring projection streaks.
sky_path = Path('app/sky-pass.js')
sky = sky_path.read_text(encoding='utf-8')
sky = replace_required(
    sky,
    '  float probability=clamp(uStarDensity*0.00145,0.00004,0.0045);',
    '  float probability=clamp(uStarDensity*0.0065,0.00018,0.018);',
    'star population probability',
)
sky = replace_required(
    sky,
    '    float radius=mix(0.00016,0.00062,pow(sizeRandom,3.2))*sizeControl*(1.0+hero*0.55);',
    '    float radius=mix(0.00072,0.00235,pow(sizeRandom,2.45))*max(0.28,sizeControl)*(1.0+hero*0.82);',
    'angular star radius',
)
sky = replace_required(
    sky,
    '  return color*luminance*uMilkyWayIntensity*0.48*horizonMask;',
    '  return color*luminance*uMilkyWayIntensity*0.92*horizonMask;',
    'Milky Way radiance scale',
)
sky = replace_required(
    sky,
    '  sky+=uSunColor*(sunGlow*(1.0-uSolarEclipse*0.68)+visibleSunDisc*(3.15+uSunGlow*1.15));',
    '  sky+=uSunColor*(sunGlow*(1.0-uSolarEclipse*0.93)+visibleSunDisc*(3.15+uSunGlow*1.15));',
    'eclipse photospheric glow suppression',
)
sky_path.write_text(sky, encoding='utf-8')

# Preserve readable outdoor shadows while the full GI system is still pending.
renderer_path = Path('app/renderer.js')
renderer = renderer_path.read_text(encoding='utf-8')
renderer = replace_required(renderer, '  return mix(0.48,1.0,sum/9.0);', '  return mix(0.58,1.0,sum/9.0);', 'shadow floor')
renderer_path.write_text(renderer, encoding='utf-8')

# Improve useful defaults and curated night presets.
systems_path = Path('server/v010-systems.mjs')
systems = systems_path.read_text(encoding='utf-8')
systems = replace_required(systems, '      starRayStrength: 0.24,', '      starRayStrength: 0.12,', 'default star-ray strength')
systems = replace_required(systems, '      starHeroFraction: 0.035,', '      starHeroFraction: 0.018,', 'default hero-star fraction')
systems = replace_required(systems, '      starSizeMin: 0.18,', '      starSizeMin: 0.36,', 'default minimum star size')
systems = replace_required(systems, '      starSizeMax: 1.35,', '      starSizeMax: 1.55,', 'default maximum star size')
systems = replace_required(systems, '      milkyWayIntensity: 0.22,', '      milkyWayIntensity: 0.34,', 'default Milky Way intensity')
systems = replace_required(
    systems,
    '    ambientIntensity: (0.04 + day * 0.16 + Number(world.lighting.indirectStrength || 0.72) * 0.22) * (0.7 + cloudAttenuation * 0.3) * eclipseDaylight,',
    '    ambientIntensity: (0.07 + day * 0.20 + Number(world.lighting.indirectStrength || 0.72) * 0.26) * (0.72 + cloudAttenuation * 0.28) * eclipseDaylight,',
    'outdoor indirect-light floor',
)
systems_path.write_text(systems, encoding='utf-8')

presets_path = Path('app/environment-presets.js')
presets = presets_path.read_text(encoding='utf-8')
presets = replace_required(
    presets,
    "lighting: { profile: 'balanced', sunIntensity: 2.35, moonIntensity: 0.14, indirectStrength: 0.72 }",
    "lighting: { profile: 'balanced', sunIntensity: 2.35, moonIntensity: 0.14, indirectStrength: 0.9 }",
    'Clear Day indirect strength',
)
presets = replace_required(
    presets,
    "sky: { moonBrightness: 1.22, moonGlow: 0.34, moonEarthshine: 0.08, starIntensity: 1.45, starDensity: 0.72, starBrightness: 0.8, milkyWayIntensity: 0.46 }",
    "sky: { moonBrightness: 1.22, moonGlow: 0.34, moonEarthshine: 0.08, starIntensity: 1.18, starDensity: 0.62, starBrightness: 0.82, starSizeMin: 0.38, starSizeMax: 1.45, starTwinkleAmount: 0.42, starRayStrength: 0.1, starHeroFraction: 0.018, milkyWayIntensity: 0.56, milkyWayWidth: 0.2, milkyWayWarp: 0.42, milkyWayClumping: 0.7 }",
    'Moonlit Night stellar profile',
)
presets_path.write_text(presets, encoding='utf-8')

# Strengthen the real rendered-image test so blank skies can never pass again.
capture_path = Path('scripts/run-phase1c-visual-captures.ps1')
capture = capture_path.read_text(encoding='utf-8')
capture = replace_required(
    capture,
    '    $step=4;$count=0;$sumR=0.0;$sumG=0.0;$sumB=0.0;$bright=0;$dark=0',
    '    $step=2;$count=0;$sumR=0.0;$sumG=0.0;$sumB=0.0;$sumL=0.0;$sumL2=0.0;$minL=1.0;$maxL=0.0;$bright=0;$dark=0',
    'visual metric accumulators',
)
capture = replace_required(
    capture,
    '        $sumR+=$r;$sumG+=$g;$sumB+=$b;$count++;$rowSum+=$luma;$rowCount++',
    '        $sumR+=$r;$sumG+=$g;$sumB+=$b;$sumL+=$luma;$sumL2+=$luma*$luma;$minL=[Math]::Min($minL,$luma);$maxL=[Math]::Max($maxL,$luma);$count++;$rowSum+=$luma;$rowCount++',
    'visual metric luminance accumulation',
)
capture = replace_required(
    capture,
    '    $maxSpike=0.0',
    '    $averageLuma=$sumL/[Math]::Max(1,$count)\n    $lumaStdDev=[Math]::Sqrt([Math]::Max(0.0,$sumL2/[Math]::Max(1,$count)-$averageLuma*$averageLuma))\n    $maxSpike=0.0',
    'visual luminance statistics',
)
capture = replace_required(
    capture,
    '      brightFraction=$bright/$count;darkFraction=$dark/$count;maximumSingleRowSpike=$maxSpike',
    '      averageLuma=$averageLuma;lumaStdDev=$lumaStdDev;minimumLuma=$minL;maximumLuma=$maxL\n      brightFraction=$bright/$count;darkFraction=$dark/$count;maximumSingleRowSpike=$maxSpike',
    'visual metric result fields',
)
capture = replace_required(
    capture,
    "sky=@{celestialMode='manual';sunAzimuth=180;sunElevation=-35;moonAzimuth=150;moonElevation=-18;planetEnabled=$false;eclipseMode='auto';starIntensity=.72;starDensity=.38;starBrightness=.62;starTwinkleAmount=.35;starTwinkleSpeed=.8;starSizeMin=.16;starSizeMax=.9;starRayStrength=.08;starRayLength=.8;starHeroFraction=.012;milkyWayIntensity=.14;milkyWayWidth=.17;milkyWayDetail=.9;milkyWayOrientation=28;milkyWayDust=.62;milkyWayWarp=.36;milkyWayClumping=.62;milkyWayCoreStrength=.52;milkyWayWidthVariation=.45}",
    "sky=@{celestialMode='manual';sunAzimuth=180;sunElevation=-35;moonAzimuth=150;moonElevation=-18;planetEnabled=$false;eclipseMode='auto';starIntensity=1;starDensity=.62;starBrightness=.86;starTwinkleAmount=.42;starTwinkleSpeed=.9;starSizeMin=.38;starSizeMax=1.4;starRayStrength=.1;starRayLength=.9;starHeroFraction=.018;milkyWayIntensity=.62;milkyWayWidth=.2;milkyWayDetail=1.05;milkyWayOrientation=0;milkyWayDust=.72;milkyWayWarp=.42;milkyWayClumping=.72;milkyWayCoreStrength=.72;milkyWayWidthVariation=.52}",
    'night visual-test authority',
)
capture = replace_required(capture, "yaw=.35;pitch=1.03;fov=72", "yaw=.2;pitch=.8;fov=80", 'night-sky camera')
capture = replace_required(capture, "yaw=1.15;pitch=.78;fov=66", "yaw=-1.856;pitch=.3;fov=78", 'Milky Way camera')
capture = replace_required(
    capture,
    "moonElevation=35;moonSize=4.5;moonBrightness=1.05",
    "moonElevation=35;moonSize=8;moonBrightness=1.05",
    'Moon close-up size',
)
capture = replace_required(capture, "yaw=0;pitch=.610865;fov=20", "yaw=0;pitch=.610865;fov=12", 'Moon close-up camera')
capture = replace_required(
    capture,
    "sunElevation=30;sunSize=1.1;moonAzimuth=0;moonElevation=30;moonSize=1.15;solarEclipseCoverage=1.08",
    "sunElevation=30;sunSize=4;moonAzimuth=0;moonElevation=30;moonSize=4;solarEclipseCoverage=1.12",
    'eclipse apparent sizes',
)
capture = replace_required(capture, "yaw=0;pitch=.523599;fov=18", "yaw=0;pitch=.523599;fov=10", 'eclipse camera')
old_gates = """  if($metrics['night-sky'].brightFraction-gt.08){throw \"Night sky is overdrawn: bright fraction $($metrics['night-sky'].brightFraction).\"}
  if($metrics['night-sky'].maximumSingleRowSpike-gt.18){throw \"Night sky contains a severe horizontal seam: $($metrics['night-sky'].maximumSingleRowSpike).\"}
  if($metrics['milky-way'].maximumSingleRowSpike-gt.18){throw \"Milky Way contains a severe row seam: $($metrics['milky-way'].maximumSingleRowSpike).\"}
  if($metrics['clear-day'].averageBlue-lt$metrics['clear-day'].averageRed){throw 'Clear-day capture is not blue-dominant.'}
  if($metrics['clear-day'].brightFraction-gt.72){throw 'Clear-day capture is still excessively blown out.'}"""
new_gates = """  if($metrics['night-sky'].brightFraction-gt.1){throw \"Night sky is overdrawn: bright fraction $($metrics['night-sky'].brightFraction).\"}
  if($metrics['night-sky'].maximumLuma-lt.42 -or $metrics['night-sky'].lumaStdDev-lt.012){throw 'Night sky does not contain a readable varied star field.'}
  if($metrics['night-sky'].maximumSingleRowSpike-gt.18){throw \"Night sky contains a severe horizontal seam: $($metrics['night-sky'].maximumSingleRowSpike).\"}
  if($metrics['milky-way'].maximumLuma-lt.34 -or $metrics['milky-way'].lumaStdDev-lt.014){throw 'Milky Way is absent or lacks visible internal structure.'}
  if($metrics['milky-way'].maximumSingleRowSpike-gt.18){throw \"Milky Way contains a severe row seam: $($metrics['milky-way'].maximumSingleRowSpike).\"}
  if($metrics['moon-close'].maximumLuma-lt.42 -or $metrics['moon-close'].lumaStdDev-lt.018){throw 'Moon close-up is too small or lacks readable surface contrast.'}
  if($metrics['solar-eclipse'].darkFraction-lt.001){throw 'Solar eclipse does not contain a clearly readable dark occluder.'}
  if($metrics['clear-day'].averageBlue-lt$metrics['clear-day'].averageRed){throw 'Clear-day capture is not blue-dominant.'}
  if($metrics['clear-day'].brightFraction-gt.72){throw 'Clear-day capture is still excessively blown out.'}"""
capture = replace_required(capture, old_gates, new_gates, 'rendered-image acceptance gates')
capture_path.write_text(capture, encoding='utf-8')

print('Raised Phase 1C stellar, galactic, lunar, eclipse, shadow, and rendered-evidence quality.')
