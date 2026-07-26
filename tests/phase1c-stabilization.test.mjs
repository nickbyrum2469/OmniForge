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

test('celestial and environment interpolation remain linear through the update interval', () => {
  const target = {
    state: { engine: { revision: 0 } },
    scene: {
      id: 'scene-linear',
      settings: { exposure: 0.7, fogNear: 90, fogFar: 280 },
      objects: [{
        id: 'sun-linear',
        visible: true,
        transform: { position: [0, 0, 0], rotation: [10, 350, 0], scale: [1, 1, 1] },
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
      transform: { position: [0, 0, 0], rotation: [30, 10, 0], scale: [1, 1, 1] },
      properties: { celestialRole: 'sun', intensity: 3, azimuth: 10, elevation: 30 }
    }]
  }, { now: 1000, durationMs: 1000 });
  assert.equal(applied, true);
  updateCelestialRuntimeInterpolation(target, 1500);
  closeTo(target.scene.objects[0].transform.rotation[1], 360);
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
});

test('source contracts cover crash recovery, proxy suppression, visible stars, lunar detail, and authoring controls', () => {
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  const sky = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
  const worldUi = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const worldSystems = fs.readFileSync(new URL('../server/v010-systems.mjs', import.meta.url), 'utf8');
  assert.match(renderer, /if\(object\.properties\?\.celestialRole\)return null/);
  assert.match(renderer, /directionFromAzimuthElevation\(azimuth,elevation\)/);
  assert.match(renderer, /mix\(0\.58,1\.0,sum\/9\.0\)/);
  assert.match(app, /new RenderCrashGuard/);
  assert.match(app, /finally\{[\s\S]*requestAnimationFrame\(animationLoop\)/);
  assert.match(app, /sanitizeCameraState/);
  assert.match(desktop, /INCIDENT_DIR/);
  assert.match(desktop, /recoverRendererProcess/);
  assert.match(desktop, /gpu-process-gone/);
  assert.match(sky, /vec2 hemisphereOctEncode/);
  assert.match(sky, /vec3 hemisphereOctDecode/);
  assert.match(sky, /uStarDensity\*0\.0065/);
  assert.match(sky, /mix\(0\.00072,0\.00235/);
  assert.doesNotMatch(sky, /vec3 cubeProjection/);
  assert.match(sky, /float craterField/);
  assert.match(sky, /uMoonMariaStrength/);
  assert.match(sky, /uMilkyWayClumping/);
  assert.match(sky, /uMilkyWayIntensity\*0\.92/);
  assert.match(sky, /uStarRayStrength/);
  assert.doesNotMatch(sky, /vec2 starUv=vec2\(atan/);
  assert.match(worldUi, /v010MoonCraters/);
  assert.match(worldUi, /v010MilkyWayWarp/);
  assert.match(worldUi, /v010StarRays/);
  assert.match(worldUi, /lookPreset: options\.preservePreset/);
  assert.match(worldSystems, /dayFogMultiplier/);
  assert.match(worldSystems, /renderProxy: false/);
});
