import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RenderCrashGuard, sanitizeCameraState } from '../app/render-crash-guard.js';
import { applyCompactWorldRuntime, updateCelestialRuntimeInterpolation, clearCelestialRuntimeInterpolation } from '../app/world-runtime.js';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import { directionFromAzimuthElevation } from '../app/celestial-mechanics.js';
import { applyEnvironmentPreset, environmentPresetOptions } from '../app/environment-presets.js';

const closeTo = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);

test('camera sanitization contains invalid viewport values instead of propagating NaN into WebGL', () => {
  const safe = sanitizeCameraState({ position: [NaN, Infinity, 4], yaw: NaN, pitch: 99, fov: 999 }, { position: [2, 3, 4], yaw: 0.5, pitch: -0.2, fov: 70 });
  assert.deepEqual(safe.position, [2, 3, 4]);
  assert.equal(safe.yaw, 0.5);
  assert.ok(safe.pitch < Math.PI / 2);
  assert.equal(safe.fov, 110);
});

test('render crash guard keeps failures contained and trips bounded recovery', () => {
  const failures = [];
  const trips = [];
  const guard = new RenderCrashGuard({ failureWindowMs: 1000, tripThreshold: 2, cooldownMs: 400, onFailure: event => failures.push(event), onTrip: event => trips.push(event) });
  const first = guard.run(() => { throw new Error('first'); }, 100);
  const second = guard.run(() => { throw new Error('second'); }, 150);
  assert.equal(first.rendered, false);
  assert.equal(second.suspended, true);
  assert.equal(failures.length, 2);
  assert.equal(trips.length, 1);
  assert.equal(guard.run(() => 42, 200).suspended, true);
  assert.equal(guard.run(() => 42, 700).rendered, true);
});

test('celestial and environment interpolation remain linear through the update interval', () => {
  clearCelestialRuntimeInterpolation();
  const target = {
    state: { engine: { revision: 1 } },
    scene: {
      id: 'scene-linear',
      settings: { exposure: 0.5, fogNear: 100, skyTop: '#000000' },
      objects: [{ id: 'sun', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun', azimuth: 0, elevation: 0, intensity: 0 } }]
    }
  };
  applyCompactWorldRuntime(target, {
    sceneId: 'scene-linear', engineRevision: 2, visualDurationMs: 1000,
    settings: { exposure: 1.5, fogNear: 500, skyTop: '#ffffff' },
    celestialObjects: [{ id: 'sun', transform: { position: [0, 0, 0], rotation: [0, 100, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun', azimuth: 100, elevation: 40, intensity: 4 } }]
  }, { now: 1000 });
  updateCelestialRuntimeInterpolation(target, 1250);
  closeTo(target.scene.objects[0].properties.azimuth, 25);
  closeTo(target.scene.objects[0].properties.elevation, 10);
  closeTo(target.scene.objects[0].properties.intensity, 1);
  closeTo(target.scene.settings.exposure, 0.75);
  closeTo(target.scene.settings.fogNear, 200);
  assert.equal(target.scene.settings.skyTop, '#404040');
});

test('visible Sun authority overrides a mismatched legacy light vector', () => {
  const scene = {
    settings: { environmentV010: { sky: {}, atmosphere: {}, lighting: {}, clouds: {}, weather: {} } },
    objects: [{ id: 'sun', properties: { celestialRole: 'sun', azimuth: 90, elevation: 30 }, transform: { rotation: [0, 0, 0] } }]
  };
  const environment = normalizeEnvironmentState(scene, { dir: [0, -1, 0], color: [1, 1, 1], exposure: 1 }, 0);
  const expected = directionFromAzimuthElevation(90, 30);
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

test('source contracts cover crash recovery, proxy suppression, pole-safe stars, lunar detail, and authoring controls', () => {
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  const sky = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
  const worldUi = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const worldSystems = fs.readFileSync(new URL('../server/v010-systems.mjs', import.meta.url), 'utf8');
  assert.match(renderer, /if\(object\.properties\?\.celestialRole\)return null/);
  assert.match(renderer, /directionFromAzimuthElevation\(azimuth,elevation\)/);
  assert.match(renderer, /mix\(0\.48,1\.0,sum\/9\.0\)/);
  assert.match(app, /new RenderCrashGuard/);
  assert.match(app, /finally\{[\s\S]*requestAnimationFrame\(animationLoop\)/);
  assert.match(app, /sanitizeCameraState/);
  assert.match(desktop, /INCIDENT_DIR/);
  assert.match(desktop, /recoverRendererProcess/);
  assert.match(desktop, /gpu-process-gone/);
  assert.match(sky, /vec3 cubeProjection/);
  assert.match(sky, /float craterField/);
  assert.match(sky, /uMoonMariaStrength/);
  assert.match(sky, /uMilkyWayClumping/);
  assert.match(sky, /uStarRayStrength/);
  assert.doesNotMatch(sky, /vec2 starUv=vec2\(atan/);
  assert.match(worldUi, /v010MoonCraters/);
  assert.match(worldUi, /v010MilkyWayWarp/);
  assert.match(worldUi, /v010StarRays/);
  assert.match(worldUi, /lookPreset: options\.preservePreset/);
  assert.match(worldSystems, /dayFogMultiplier/);
  assert.match(worldSystems, /renderProxy: false/);
});
