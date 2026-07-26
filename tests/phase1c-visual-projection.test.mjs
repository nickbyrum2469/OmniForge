import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sky = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
const ci = fs.readFileSync(new URL('../scripts/run-phase1c-ci.ps1', import.meta.url), 'utf8');
const captureScript = fs.readFileSync(new URL('../scripts/run-phase1c-visual-captures.ps1', import.meta.url), 'utf8');

test('stellar projection is upper-hemisphere angular space rather than cube-face UV space', () => {
  assert.match(sky, /vec2 hemisphereOctEncode/);
  assert.match(sky, /vec3 hemisphereOctDecode/);
  assert.match(sky, /vec2 ndcPixel=max\(fwidth\(vNdc\),vec2\(0\.000001\)\)/);
  assert.match(sky, /vec2 starNdc=vec2\(/);
  assert.match(sky, /vec2 pixelDelta=\(vNdc-starNdc\)\/ndcPixel/);
  assert.match(sky, /float radiusPixels=mix\(max\(0\.4,uStarSizeMin\*0\.52\)/);
  assert.match(sky, /float psf=exp\(-0\.5\*pow\(pixelDistance\/sigmaPixels,2\.0\)\)/);
  assert.match(sky, /float disc=psf\*0\.94/);
  assert.doesNotMatch(sky, /float disc=max\(core,psf/);
  assert.doesNotMatch(sky, /angularDistance=sqrt/);
  assert.match(sky, /uStarDensity\*0\.13/);
  assert.doesNotMatch(sky, /microStarLayer/);
  assert.match(sky, /vec2 coronaDirection=vec2\(cos\(eclipseAngle\),sin\(eclipseAngle\)\)/);
  assert.match(sky, /float broadStreamers=noise3\(vec3\(coronaDirection\*1\.8/);
  assert.match(sky, /float middleStreamers=noise3\(vec3\(coronaDirection\*4\.6/);
  assert.match(sky, /float magneticFacing=dot\(coronaDirection,magneticAxis\)/);
  assert.match(sky, /float polarStructure=pow\(max\(magneticFacing,0\.0\),4\.2\)\+pow\(max\(-magneticFacing,0\.0\),6\.0\)\*0\.62/);
  assert.match(sky, /float coronaReach=mix\(0\.18,1\.24,pow\(streamerStrength,1\.35\)\)/);
  assert.doesNotMatch(sky, /cos\(eclipseAngle\*5\.0/);
  assert.match(sky, /float eclipseRadius=uMoonAngularRadius\*uSolarEclipseCoverage/);
  assert.match(sky, /float eclipseAngularRatio=eclipseRadius\/max\(0\.0001,uSunAngularRadius\)/);
  assert.match(sky, /float eclipseSeparationDegrees=degrees\(acos\(clamp\(dot\(uSunDirection,uMoonDirection\),-1\.0,1\.0\)\)\)/);
  assert.match(sky, /vec2 eclipseUv=celestialUv\(ray,uMoonDirection,eclipseRadius\)/);
  assert.match(sky, /vec2 sunCoronaUv=celestialUv\(ray,uSunDirection,uSunAngularRadius\)/);
  assert.match(sky, /float annularRing=innerRim\*annularity/);
  assert.match(sky, /float diamondCore=/);
  assert.match(sky, /float diamondFlare=/);
  assert.match(sky, /float diamondTangentialFlare=/);
  assert.match(sky, /float diamondRadialFlare=/);
  assert.doesNotMatch(sky, /float diamondHorizontal=/);
  assert.doesNotMatch(sky, /float diamondVertical=/);
  assert.match(sky, /eclipseStarVisibility=smoothstep\(0\.975,1\.0,uSolarEclipse\)\*uDayFactor\*0\.09/);
  assert.match(sky, /float stellarAirMass=1\.0\/max\(0\.12,ray\.y\+0\.09\)/);
  assert.match(sky, /float stellarTransmission=exp\(-stellarOpticalDepth\)/);
  assert.match(sky, /milkyWay\(ray,starHorizon\*stellarTransmission\)/);
  assert.match(sky, /horizonTwinkle/);
  assert.doesNotMatch(sky, /vec3 cubeProjection/);
  assert.doesNotMatch(sky, /projected\.xy\*scale/);
});

test('Milky Way uses periodic smooth direction-space dust without longitude seams or threshold blobs', () => {
  assert.match(sky, /vec3 periodic=vec3\(cos\(longitude\),sin\(longitude\),latitude\)/);
  assert.match(sky, /float coreBulge=/);
  assert.match(sky, /float cloudMasses=/);
  assert.match(sky, /float branchingDust=/);
  assert.match(sky, /float dustTransmission=/);
  assert.match(sky, /float darkPockets=/);
  assert.match(sky, /float centralPresence=/);
  assert.match(sky, /centralDust/);
  assert.match(sky, /float micro=/);
  assert.doesNotMatch(sky, /ray\*5\.3\+tangent\*longitude/);
});

test('procedural Moon uses sparse hierarchical craters and irregular authored maria', () => {
  assert.match(sky, /craterField\(vec2 uv,float scale,float seed,float density\)/);
  assert.match(sky, /if\(identity<1\.0-clamp\(density,0\.0,1\.0\)\)continue/);
  assert.match(sky, /float irregularity=1\.0\+sin\(/);
  assert.match(sky, /craterField\(rotated,5\.5,uMoonPatternSeed,0\.18\)/);
  assert.match(sky, /craterField\(rotated,31\.0,uMoonPatternSeed\+211\.0,0\.09\)/);
  assert.match(sky, /float boundaryNoise=\(noise2\(uv\*7\.4\+center\*13\.7\)-0\.5\)\*0\.2/);
  assert.match(sky, /marePotential\+=lunarEllipse/);
  assert.doesNotMatch(sky, /mareRegions=max/);
  assert.match(sky, /vec3 dark=bright\*vec3\(0\.48,0\.5,0\.55\)/);
});

test('Moon uses the attributed LRO mosaic with a deterministic procedural fallback', () => {
  assert.match(sky, /uniform sampler2D uMoonAlbedoMap/);
  assert.match(sky, /moonLocalNormal=normalize\(vec3\(moonUv,-localSphere\)\)/);
  assert.match(sky, /atan\(rotatedNormal\.x,-rotatedNormal\.z\)\/TAU\+0\.5/);
  assert.match(sky, /mappedAlbedo=srgbToLinear\(texture\(uMoonAlbedoMap,lunarMapUv\)\.rgb\)/);
  assert.match(sky, /new URL\('\.\/sky-assets\/lroc_color_2k\.jpg', import\.meta\.url\)\.href/);
  assert.match(sky, /moon-albedo-ready/);
  assert.match(sky, /moon-albedo-load-failed/);
  assert.ok(fs.existsSync(new URL('../app/sky-assets/lroc_color_2k.jpg', import.meta.url)));
  const provenance = fs.readFileSync(new URL('../docs/ASSET_PROVENANCE_SKY.md', import.meta.url), 'utf8');
  assert.match(provenance, /NASA Scientific Visualization Studio/);
  assert.match(provenance, /f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170/i);
});

test('cloud and twilight lighting remain Sun-directed rather than full-screen color washes', () => {
  assert.match(sky, /float edgeLight=1\.0-smoothstep\(threshold,threshold\+0\.38,cloudField\)/);
  assert.match(sky, /vec3 sunTint=srgbToLinear\(uSunColor\)/);
  assert.match(sky, /float twilightSunward=pow\(max\(dot\(horizonDirection,sunHorizonDirection\),0\.0\),3\.1\)/);
  assert.match(sky, /vec3 solarOpticalDepth=/);
  assert.match(sky, /vec3 transmittedSun=/);
  assert.match(sky, /float lowSunAzimuth=/);
  assert.match(sky, /float lowSunElevation=/);
  assert.match(sky, /physicalScatter\+=lowSunScatter\*lowSunAzimuth\*lowSunElevation\*lowSunEnergy/);
  assert.match(sky, /float solarHorizonWindow=1\.0-smoothstep\(0\.12,0\.5,abs\(uSunDirection\.y\)\)/);
  assert.match(sky, /float aerialAureole=pow\(sunDot,8\.0\)\*horizon\*solarHorizonWindow/);
  assert.match(sky, /transmittedSun\*\(aerialAureole\+horizon\*uTwilightFactor/);
  assert.match(sky, /uCloudQuality>=0\.5&&uCloudCoverage>=0\.35&&ray\.y>=0\.09/);
  assert.match(sky, /mix\(layered,volume,smoothstep\(0\.09,0\.16,ray\.y\)\)/);
});

test('solar-eclipse silhouette is constrained to daylight and no longer blacks out a free-floating sky disc', () => {
  assert.match(sky, /float eclipseActive=step\(0\.001,uSolarEclipse\)/);
  assert.match(sky, /eclipseOcclusion=eclipseDisc\*eclipseActive/);
  assert.match(sky, /eclipseSilhouette=eclipseDisc\*eclipseActive\*uDayFactor/);
  assert.match(sky, /independentMoonVisibility=uMoonVisibility\*\(1\.0-eclipseActive\)/);
  assert.match(sky, /sky=mix\(sky,vec3\(0\.00001\),eclipseSilhouette\)/);
  assert.doesNotMatch(sky, /sky\*=1\.0-eclipseOcclusion/);
});

test('packaged visual QA can request actual canvas PNG evidence', () => {
  assert.match(app, /window\.__omniforgeVisualTestCapture=captureVisualTestFrame/);
  assert.match(app, /renderTelemetry:renderer\?\.getRenderDiagnostics\?\.\(\)\|\|null/);
  assert.match(app, /ui\.viewport\.toDataURL\('image\/png'\)/);
  assert.match(app, /minimumRevision/);
  assert.match(app, /Visual capture timed out waiting for authoritative revision/);
  assert.match(desktop, /OMNIFORGE_CAPTURE_DIR/);
  assert.match(desktop, /installVisualCaptureWatcher/);
  assert.match(desktop, /capture-request\.json/);
  assert.match(desktop, /renderTelemetry:captureResult\?\.renderTelemetry\|\|null/);
  assert.match(captureScript, /minimumRevision=\$MinimumRevision/);
  assert.match(captureScript, /\$response\.state\.engine\.revision/);
  assert.match(captureScript, /starIntensity=\.24;starDensity=\.72/);
  assert.match(captureScript, /yaw=-\.75;pitch=1\.02;fov=68/);
  assert.match(captureScript, /\$moonWorld=@\{sky=@\{moonSize=4\}\}/);
  assert.match(captureScript, /Patch-World \$port @\{sky=@\{moonSize=38\}\}/);
  assert.match(captureScript, /\$moonCamera=@\{position=@\(0,20,0\);yaw=0;pitch=\.610865;fov=7\}/);
  assert.match(captureScript, /\$captureSkyDefaults=@\{/);
  assert.match(captureScript, /sunSize=1;sunGlow=\.38/);
  assert.match(captureScript, /moonSize=1\.25;moonPhase=\.72/);
  assert.match(captureScript, /eclipseMode='auto';solarEclipseCoverage=1\.08/);
  assert.match(captureScript, /function Get-IsolatedSky/);
  assert.equal(
    captureScript.match(/sky=\(Get-IsolatedSky @\{/g)?.length,
    15,
    'every complete visual state must reset inherited sky and eclipse properties'
  );
  for (const id of [
    '01-clear-midday-wide', '02-clear-midday-player', '03-golden-hour-coast', '04-twilight-stars',
    '05-night-realistic-wide', '06-night-faint-milkyway', '07-night-core-close', '08-fantasy-violet-galaxy',
    '09-moon-world-scale', '10-moon-close', '11-partial-eclipse', '12-annular-eclipse', '13-diamond-ring',
    '14-total-eclipse', '15-eclipse-landscape', '16-forest-morning-shafts', '17-coastal-backlight',
    '18-overcast', '19-storm', '20-path-terrain-regression'
  ]) {
    assert.match(captureScript, new RegExp(`'${id}'`), id);
  }
  assert.match(captureScript, /capture-manifest\.json/);
  assert.match(captureScript, /worldStateHash=Get-StateHash/);
  assert.match(captureScript, /renderTelemetry=\$captureTelemetry/);
  assert.match(captureScript, /foreach\(\$name in @\('logs','incidents','crashes','sessions'\)\)/);
  assert.match(captureScript, /Join-Path \$captureDir 'runtime-evidence'/);
});

test('the authoritative Windows evidence gate supports Windows PowerShell 5.1', () => {
  assert.match(ci, /function Get-RepositoryRelativePath/);
  assert.doesNotMatch(ci, /\[IO\.Path\]::GetRelativePath/);
});
