import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RenderCrashGuard, sanitizeCameraState } from '../app/render-crash-guard.js';
import { applyCompactWorldRuntime, updateCelestialRuntimeInterpolation } from '../app/world-runtime.js';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import { applyEnvironmentPreset, environmentPresetOptions } from '../app/environment-presets.js';

function closeTo(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test('camera sanitization contains invalid viewport values instead of propagating NaN into WebGL', () => {
  const fallback = { position: [4, 5, 6], yaw: 0.4, pitch: -0.3, fov: 62 };
  const camera = sanitizeCameraState({ position: [NaN, Infinity, -Infinity], yaw: NaN, pitch: 99, fov: 0 }, fallback);
  assert.deepEqual(camera.position, fallback.position);
  closeTo(camera.yaw, fallback.yaw);
  closeTo(camera.pitch, Math.PI * 0.495);
  assert.equal(camera.fov, 30);
});

test('render crash guard keeps failures contained and trips bounded recovery', () => {
  let failures = 0;
  let trips = 0;
  let recoveries = 0;
  const guard = new RenderCrashGuard({ failureWindowMs: 1000, tripThreshold: 2, cooldownMs: 100, onFailure: () => failures++, onTrip: () => trips++, onRecover: () => recoveries++ });
  const first = guard.run(() => { throw new Error('first'); }, 1000);
  const second = guard.run(() => { throw new Error('second'); }, 1001);
  assert.equal(first.rendered, false);
  assert.equal(first.suspended, false);
  assert.match(first.error.message, /first/);
  assert.equal(second.rendered, false);
  assert.equal(second.suspended, true);
  assert.match(second.error.message, /second/);
  assert.equal(failures, 2);
  assert.equal(trips, 1);
  const recovered = guard.run(() => 'recovered', 1200);
  assert.equal(recovered.rendered, true);
  assert.equal(recovered.value, 'recovered');
  assert.equal(recoveries, 1);
  assert.equal(guard.totalFailures, 2);
});

test('celestial direction stays coherent while environment values remain linear through the update interval', () => {
  const target = {
    state: { engine: { revision: 0 } },
    scene: {
      id: 'scene-linear',
      settings: { exposure: 0.7, fogNear: 90, fogFar: 280 },
      objects: [{
        id: 'sun-linear',
        visible: true,
        transform: { position: [0, 0, 0], rotation: [-10, 530, 0], scale: [1, 1, 1] },
        properties: { celestialRole: 'sun', intensity: 1, azimuth: 350, elevation: 10 }
      }]
    }
  };
  const applied = applyCompactWorldRuntime(target, {
    sceneId: 'scene-linear',
    engineRevision: 2,
    visualDurationMs: 1000,
    settings: { exposure: 1.1, fogNear: 130, fogFar: 360 },
    celestialObjects: [{
      id: 'sun-linear',
      visible: true,
      transform: { position: [0, 0, 0], rotation: [-30, 190, 0], scale: [1, 1, 1] },
      properties: { celestialRole: 'sun', intensity: 3, azimuth: 10, elevation: 30 }
    }]
  }, { now: 1000, durationMs: 1000 });
  assert.equal(applied, true);
  updateCelestialRuntimeInterpolation(target, 1500);
  closeTo(target.scene.objects[0].transform.rotation[1], target.scene.objects[0].properties.azimuth + 180);
  closeTo(target.scene.objects[0].transform.rotation[0], -target.scene.objects[0].properties.elevation);
  closeTo(target.scene.objects[0].properties.intensity, 2);
  closeTo(target.scene.settings.exposure, 0.9);
  closeTo(target.scene.settings.fogNear, 110);
});

test('visible Sun authority overrides a mismatched legacy light vector', () => {
  const scene = {
    settings: { environmentV010: { atmosphere: {}, sky: {}, clouds: {}, weather: {}, lighting: {} } },
    objects: [{ properties: { celestialRole: 'sun', azimuth: 90, elevation: 0 } }]
  };
  const environment = normalizeEnvironmentState(scene, { dir: [0, -1, 0], color: [1, 1, 1], exposure: 1 }, 0);
  const expected = [1, 0, 0];
  for (let index = 0; index < 3; index += 1) closeTo(environment.sunDirection[index], expected[index]);
});

test('manual environment edits resolve to Custom and presets preserve their authority id', () => {
  const custom = applyEnvironmentPreset({ lookPreset: 'clear-day' }, 'custom');
  const alpine = applyEnvironmentPreset({}, 'clear-alpine');
  assert.equal(custom.lookPreset, 'custom');
  assert.equal(alpine.lookPreset, 'clear-alpine');
  assert.ok(alpine.atmosphere.visibilityKm >= 400);
  assert.equal(environmentPresetOptions()[0].id, 'custom');
  const twilight = applyEnvironmentPreset({}, 'clean-twilight');
  assert.ok(twilight.atmosphere.saturation <= 1.05);
  assert.ok(twilight.sky.milkyWayIntensity <= 0.2);
});

test('source contracts cover crash recovery, proxy suppression, readable stars, smooth galactic dust, lunar detail, and isolated evidence', () => {
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  const sky = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
  const celestial = fs.readFileSync(new URL('../app/celestial-mechanics.js', import.meta.url), 'utf8');
  const worldUi = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const worldSystems = fs.readFileSync(new URL('../server/v010-systems.mjs', import.meta.url), 'utf8');
  const visualCapture = fs.readFileSync(new URL('../scripts/run-phase1c-visual-captures.ps1', import.meta.url), 'utf8');
  assert.match(renderer, /if\(object\.properties\?\.celestialRole\)return null/);
  assert.match(renderer, /directionFromAzimuthElevation\(azimuth,elevation\)/);
  assert.match(renderer, /return sum\/9\.0;/);
  assert.doesNotMatch(renderer, /mix\(0\.66,1\.0,sum\/9\.0\)/);
  assert.match(app, /new RenderCrashGuard/);
  assert.match(app, /finally\{[\s\S]*requestAnimationFrame\(animationLoop\)/);
  assert.match(app, /sanitizeCameraState/);
  assert.match(app, /selectedId=null/);
  assert.match(app, /selectedId=originalSelectedId/);
  assert.match(desktop, /INCIDENT_DIR/);
  assert.match(desktop, /recoverRendererProcess/);
  assert.match(desktop, /gpu-process-gone/);
  assert.match(sky, /vec2 hemisphereOctEncode/);
  assert.match(sky, /vec3 hemisphereOctDecode/);
  assert.match(sky, /uStarDensity\*0\.13/);
  assert.doesNotMatch(sky, /microStarLayer/);
  assert.match(sky, /vec2 ndcPixel=max\(fwidth\(vNdc\),vec2\(0\.000001\)\)/);
  assert.match(sky, /vec2 pixelDelta=\(vNdc-starNdc\)\/ndcPixel/);
  assert.match(sky, /float microRadius=mix\(clamp\(authoredMin\*0\.36,0\.12,0\.32\)/);
  assert.match(sky, /float heroRadius=clamp\(microRadius\*\(1\.45\+sizeRandom\*0\.65\),0\.72,2\.05\)/);
  assert.match(sky, /rayLength=radiusPixels\*mix\(2\.0,4\.2/);
  assert.match(sky, /float psf=exp\(-0\.5\*pow\(pixelDistance\/sigmaPixels,2\.0\)\)/);
  assert.match(sky, /float core=psf\*mix\(0\.76,0\.94,hero\)/);
  assert.match(sky, /float halo=exp\(-0\.5\*pow\(pixelDistance\/haloSigma,2\.0\)\)\*hero\*0\.16/);
  assert.match(sky, /hero\*uStarRayStrength\*0\.045/);
  assert.doesNotMatch(sky, /float disc=max\(core,psf/);
  assert.doesNotMatch(sky, /vec3 cubeProjection/);
  assert.match(sky, /vec2 craterField/);
  assert.match(sky, /craterField\(vec2 uv,float scale,float seed,float density\)/);
  assert.match(sky, /if\(identity<1\.0-clamp\(density,0\.0,1\.0\)\)continue/);
  assert.match(sky, /float lunarEllipse/);
  assert.match(sky, /marePotential\+=lunarEllipse/);
  assert.doesNotMatch(sky, /mareRegions=max/);
  assert.match(sky, /float coronaEnvelope=exp\(-coronaDistance\/max\(0\.035,coronaReach\)\)/);
  assert.match(sky, /float middleStreamers=noise3/);
  assert.doesNotMatch(sky, /directionalWisps/);
  assert.match(sky, /float forwardScatter=pow\(max\(dot\(ray,uSunDirection\),0\.0\),8\.0\)/);
  assert.match(sky, /vec3 twilightScatter=mix\(vec3\(0\.045,0\.07,0\.24\),vec3\(0\.72,0\.28,0\.065\),twilightSunward\)/);
  assert.match(sky, /vec3 solarOpticalDepth=/);
  assert.match(sky, /float lowSunAzimuth=/);
  assert.match(sky, /float aerialAureole=pow\(sunDot,8\.0\)\*horizon\*solarHorizonWindow/);
  assert.match(sky, /vec2 eclipseUv=celestialUv\(ray,uMoonDirection,eclipseRadius\)/);
  assert.match(sky, /float eclipseAngularRatio=eclipseRadius\/max\(0\.0001,uSunAngularRadius\)/);
  assert.match(sky, /float eclipseCentered=1\.0-smoothstep\(0\.08,0\.32,eclipseSeparationRatio\)/);
  assert.match(sky, /vec2 sunCoronaUv=celestialUv\(ray,uSunDirection,uSunAngularRadius\)/);
  assert.match(sky, /float eclipseActive=step\(0\.001,uSolarEclipse\)/);
  assert.match(sky, /float eclipsePresentationVisibility=uSunVisibility\*celestialHorizonMask/);
  assert.match(sky, /eclipseSilhouette=eclipseDisc\*eclipseActive\*eclipsePresentationVisibility/);
  assert.match(sky, /independentMoonVisibility=uMoonVisibility\*\(1\.0-eclipseActive\)/);
  assert.match(sky, /float diamondRing=/);
  assert.match(sky, /float diamondCore=/);
  assert.match(sky, /eclipseStarVisibility/);
  assert.match(sky, /return vec2\(clamp\(albedo,-0\.28,0\.16\),clamp\(height,-0\.48,0\.24\)\)/);
  assert.match(sky, /uMoonMariaStrength/);
  assert.match(sky, /vec3 galacticNormal=normalize\(vec3\(cos\(orientation\)\*0\.78,0\.32,sin\(orientation\)\*0\.78\)\)/);
  assert.match(sky, /float dustTransmission=/);
  assert.match(sky, /float darkPockets=/);
  assert.match(sky, /float centralPresence=/);
  assert.match(sky, /float coreBulge=/);
  assert.doesNotMatch(sky, /microStructure=/);
  assert.match(sky, /sky=mix\(sky,vec3\(0\.00001\),eclipseSilhouette\)/);
  assert.match(worldSystems, /const eclipseDaylight = 1 - solarEclipse \* 0\.94/);
  assert.match(worldSystems, /const eclipseAmbient = mix\(ambientTwilight, \[14, 22, 40\], solarEclipse \* 0\.82\)/);
  assert.match(sky, /uStarRayStrength/);
  assert.doesNotMatch(sky, /vec2 starUv=vec2\(atan/);
  assert.match(worldUi, /v010MoonCraters/);
  assert.match(worldUi, /id="v010MoonSize" type="range" min="0\.1" max="32"/);
  assert.match(worldUi, /v010MilkyWayWarp/);
  assert.match(worldUi, /v010MilkyWayColor/);
  assert.match(worldUi, /v010MieAnisotropy/);
  assert.match(worldUi, /v010Ozone/);
  assert.match(worldUi, /v010AerialPerspective/);
  assert.match(worldUi, /v010ToneMapper/);
  assert.match(worldUi, /v010StarRays/);
  assert.match(worldUi, /lookPreset: options\.preservePreset/);
  assert.match(worldSystems, /dayFogMultiplier/);
  assert.match(worldSystems, /ambientIntensity: \(0\.12 \+ day \* 0\.57/);
  assert.match(worldSystems, /const ambientDay = mix\(\[12, 20, 48\], \[154, 178, 210\], day\)/);
  assert.match(visualCapture, /nightFogMultiplier=\.18;exposure=\.86/);
  assert.match(worldSystems, /renderProxy: false/);
  assert.match(celestial, /export function solarDiscCoverage/);
  assert.match(celestial, /geometricSolarCoverage \* nodeAlignment/);
  assert.match(visualCapture, /starIntensity=\.24;starDensity=\.72;starBrightness=\.68;milkyWayIntensity=\.72/);
  assert.match(visualCapture, /starHeroFraction=\.004/);
  assert.match(visualCapture, /capture-manifest\.json/);
  assert.match(visualCapture, /11-partial-eclipse/);
  assert.match(visualCapture, /12-annular-eclipse/);
  assert.match(visualCapture, /20-path-terrain-regression/);
  assert.match(visualCapture, /\$moonWorld=@\{sky=@\{moonSize=4\}\}/);
  assert.match(visualCapture, /moonColor='#d8d3c8'/);
});
