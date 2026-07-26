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
  assert.match(sky, /float eclipseRadius=uMoonAngularRadius\*uSolarEclipseCoverage/);
  assert.match(sky, /float eclipseAngularRatio=eclipseRadius\/max\(0\.0001,uSunAngularRadius\)/);
  assert.match(sky, /float eclipseSeparationDegrees=degrees\(acos\(clamp\(dot\(uSunDirection,uMoonDirection\),-1\.0,1\.0\)\)\)/);
  assert.match(sky, /vec2 eclipseUv=celestialUv\(ray,uMoonDirection,eclipseRadius\)/);
  assert.match(sky, /vec2 sunCoronaUv=celestialUv\(ray,uSunDirection,uSunAngularRadius\)/);
  assert.match(sky, /float annularRing=innerRim\*annularity/);
  assert.match(sky, /float diamondCore=/);
  assert.match(sky, /float diamondFlare=/);
  assert.match(sky, /eclipseStarVisibility=smoothstep\(0\.975,1\.0,uSolarEclipse\)\*uDayFactor\*0\.09/);
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
  assert.match(sky, /vec3 dark=bright\*vec3\(0\.34,0\.37,0\.43\)/);
});

test('cloud and twilight lighting remain Sun-directed rather than full-screen color washes', () => {
  assert.match(sky, /float edgeLight=1\.0-smoothstep\(threshold,threshold\+0\.38,cloudField\)/);
  assert.match(sky, /vec3 sunTint=srgbToLinear\(uSunColor\)/);
  assert.match(sky, /float twilightSunward=pow\(max\(dot\(horizonDirection,sunHorizonDirection\),0\.0\),2\.4\)/);
  assert.match(sky, /physicalScatter\+=twilightScatter\*\(uOzone\*uTwilightFactor\*horizon\)\*0\.13/);
  assert.match(sky, /sunLinear\*horizon\*uTwilightFactor\*\(0\.025\+twilightSunward\*0\.34\)/);
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
  assert.match(app, /ui\.viewport\.toDataURL\('image\/png'\)/);
  assert.match(app, /minimumRevision/);
  assert.match(app, /Visual capture timed out waiting for authoritative revision/);
  assert.match(desktop, /OMNIFORGE_CAPTURE_DIR/);
  assert.match(desktop, /installVisualCaptureWatcher/);
  assert.match(desktop, /capture-request\.json/);
  assert.match(captureScript, /minimumRevision=\$MinimumRevision/);
  assert.match(captureScript, /\$response\.state\.engine\.revision/);
  assert.match(captureScript, /starIntensity=\.24;starDensity=\.72/);
  assert.match(captureScript, /yaw=-\.75;pitch=1\.02;fov=68/);
  assert.match(captureScript, /\$moonWorld=@\{sky=@\{moonSize=4\}\}/);
  assert.match(captureScript, /Patch-World \$port @\{sky=@\{moonSize=22\}\}/);
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
});

test('the authoritative Windows evidence gate supports Windows PowerShell 5.1', () => {
  assert.match(ci, /function Get-RepositoryRelativePath/);
  assert.doesNotMatch(ci, /\[IO\.Path\]::GetRelativePath/);
});
