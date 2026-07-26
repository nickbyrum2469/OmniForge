import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RenderCrashGuard, sanitizeCameraState } from '../app/render-crash-guard.js';
import { createEnvironmentInterpolator } from '../app/world-runtime.js';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import { applyEnvironmentPreset, environmentPresetOptions } from '../app/environment-presets.js';

function closeTo(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test('camera sanitization contains invalid viewport values instead of propagating NaN into WebGL', () => {
  const fallback = { position: [4, 5, 6], yaw: 0.4, pitch: -0.3, fov: 62 };
  const camera = sanitizeCameraState({ position: [NaN, Infinity, -Infinity], yaw: NaN, pitch: 99, fov: 0 }, fallback);
  assert.deepEqual(camera.position, fallback.position);
  assert.equal(camera.yaw, fallback.yaw);
  closeTo(camera.pitch, Math.PI / 2 - 0.001);
  assert.equal(camera.fov, 20);
});

test('render crash guard keeps failures contained and trips bounded recovery', () => {
  let failures = 0;
  let trips = 0;
  const guard = new RenderCrashGuard({ failureWindowMs: 1000, tripThreshold: 2, cooldownMs: 0, onFailure: () => failures++, onTrip: () => trips++ });
  assert.equal(guard.run(() => { throw new Error('first'); }), null);
  assert.equal(guard.run(() => { throw new Error('second'); }), null);
  assert.equal(failures, 2);
  assert.equal(trips, 1);
  assert.equal(guard.run(() => 'recovered'), 'recovered');
  assert.equal(guard.totalFailures, 2);
});

test('celestial and environment interpolation remain linear through the update interval', () => {
  const interpolate = createEnvironmentInterpolator();
  const start = {
    sky: { sunAzimuth: 350, sunElevation: 10, moonAzimuth: 20, moonElevation: 30 },
    lighting: { sunIntensity: 1, moonIntensity: 0.1 },
    atmosphere: { exposure: 0.7 },
    weather: { fog: 0 }
  };
  const end = {
    sky: { sunAzimuth: 10, sunElevation: 30, moonAzimuth: 80, moonElevation: 50 },
    lighting: { sunIntensity: 3, moonIntensity: 0.3 },
    atmosphere: { exposure: 1.1 },
    weather: { fog: 0.4 }
  };
  interpolate.push(start, 0, 1000);
  interpolate.push(end, 1000, 1000);
  const middle = interpolate.sample(1500);
  closeTo(middle.sky.sunAzimuth, 0);
  closeTo(middle.sky.sunElevation, 20);
  closeTo(middle.lighting.sunIntensity, 2);
  closeTo(middle.atmosphere.exposure, 0.9);
  closeTo(middle.weather.fog, 0.2);
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
  assert.match(sky, /vec2 hemisphereOctEncode/);
  assert.match(sky, /vec3 hemisphereOctDecode/);
  assert.doesNotMatch(sky, /vec3 cubeProjection/);
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
