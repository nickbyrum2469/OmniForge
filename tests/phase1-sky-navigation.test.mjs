import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cameraSkyBasis, skyRayFromNdc, normalizeEnvironmentState } from '../app/environment-runtime.js';
import { createLookInputState, beginLookInputSession, applyLookDelta, wrapYaw } from '../app/viewport-navigation.js';

const camera = { position: [10, 20, 30], yaw: 0.4, pitch: -0.2, fov: 62, lookSensitivity: 0.0023 };

test('sky rays rotate with the camera but ignore camera translation', () => {
  const translated = { ...camera, position: [9999, -450, 88] };
  assert.deepEqual(skyRayFromNdc(camera, 0.25, -0.1, 16 / 9), skyRayFromNdc(translated, 0.25, -0.1, 16 / 9));
  assert.notDeepEqual(skyRayFromNdc(camera, 0, 0, 1), skyRayFromNdc({ ...camera, yaw: camera.yaw + 0.5 }, 0, 0, 1));
  const basis = cameraSkyBasis(camera);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  assert.ok(Math.abs(dot(basis.forward, basis.right)) < 1e-10);
  assert.ok(Math.abs(dot(basis.forward, basis.up)) < 1e-10);
  assert.ok(Math.abs(dot(basis.right, basis.up)) < 1e-10);
});

test('environment state is bounded and shares the directional light authority', () => {
  const state = normalizeEnvironmentState({ settings: { skyTop: '#123456', skyBottom: '#789abc', cloudCoverage: 0.6, cloudDensity: 0.7, starIntensity: 1.2 } }, { dir: [0, -1, 0], color: [1, 0.9, 0.8], exposure: 1.1 }, 12);
  assert.ok(Math.abs(state.sunDirection[0]) < 1e-12);
  assert.equal(state.sunDirection[1], 1);
  assert.ok(Math.abs(state.sunDirection[2]) < 1e-12);
  for (const key of ['dayFactor', 'nightFactor', 'twilightFactor', 'starVisibility', 'cloudCoverage', 'cloudDensity']) assert.ok(state[key] >= 0 && state[key] <= 1, key);
  assert.equal(state.timeSeconds, 12);
});

test('nested World settings drive weather, cloud wind, quality, and twilight', () => {
  const state = normalizeEnvironmentState({
    settings: {
      environmentV010: {
        nightFactor: 0.8,
        twilightFactor: 0.65,
        clouds: { coverage: 0.72, density: 0.81, windSpeed: 27, quality: 'layered', seed: 904 },
        weather: { preset: 'storm', windDirection: [-2, 0, 1] },
        sky: { starIntensity: 1.4, starDensity: 0.88 },
        atmosphere: { exposure: 1.3, quality: 'balanced' }
      }
    }
  }, { dir: [0.3, -0.8, 0.1], color: [1, 0.9, 0.8] }, 40);
  assert.equal(state.weather, 'storm');
  assert.equal(state.weatherDarkening, 0.46);
  assert.equal(state.cloudWindSpeed, 27);
  assert.equal(state.cloudQuality, 'layered');
  assert.equal(state.cloudSeed, 904);
  assert.equal(state.cloudCoverage, 0.72);
  assert.equal(state.cloudDensity, 0.81);
  assert.equal(state.twilightFactor, 0.65);
  assert.ok(Math.abs(state.dayFactor - 0.2) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...state.cloudWindDirection) - 1) < 1e-12);
});

test('viewport look ignores acquisition noise and rejects implausible direction snaps', () => {
  const look = createLookInputState();
  const next = { ...camera };
  beginLookInputSession(look, 'pointer-lock', 1000);
  assert.equal(applyLookDelta(next, look, { dx: 18, dy: 4, source: 'pointer-lock', now: 1001 }).reason, 'session-warmup');
  const beforeSpike = { yaw: next.yaw, pitch: next.pitch };
  const spike = applyLookDelta(next, look, { dx: 4000, dy: -2600, source: 'pointer-lock', now: 1008 });
  assert.equal(spike.reason, 'delta-spike');
  assert.deepEqual({ yaw: next.yaw, pitch: next.pitch }, beforeSpike);
  const applied = applyLookDelta(next, look, { dx: 12, dy: -5, source: 'pointer-lock', now: 1016 });
  assert.equal(applied.changed, true);
  assert.notEqual(next.yaw, beforeSpike.yaw);
});

test('yaw remains normalized and pitch remains bounded', () => {
  assert.ok(wrapYaw(1000) >= -Math.PI && wrapYaw(1000) <= Math.PI);
  const look = createLookInputState();
  const next = { ...camera, pitch: 0 };
  beginLookInputSession(look, 'right-drag', 1000);
  applyLookDelta(next, look, { dx: 100, dy: -160, source: 'right-drag', now: 1010 });
  assert.ok(next.pitch < Math.PI / 2 && next.pitch > -Math.PI / 2);
});

test('viewport acquisition protects camera authority before pointer lock and releases cleanly', () => {
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const intentIndex = app.indexOf('viewportNavigationIntentUntil=Date.now()+1600');
  const selectionIndex = app.indexOf('selectObject(pick?.id||null,true)', intentIndex);
  const lockRequestIndex = app.indexOf('requestPointerLock?.()', selectionIndex);
  assert.ok(intentIndex >= 0, 'navigation intent guard is missing');
  assert.ok(selectionIndex > intentIndex, 'camera authority must be protected before click selection applies state');
  assert.ok(lockRequestIndex > selectionIndex, 'pointer lock must begin after guarded selection');
  assert.match(app, /beginLookInputSession\(lookInputState,'pointer-lock'\)/);
  assert.match(app, /viewport-look-delta-rejected/);
  assert.match(app, /window\.addEventListener\('blur',releaseViewportInput\)/);
  assert.match(app, /visibilitychange.*releaseViewportInput/);
  assert.match(app, /viewportNavigationActive\(\).*viewportNavigationIntentUntil/s);
  assert.match(app, /wasNavigating&&cameraDirty\)persistCameraSoon\(\)/);
});

test('normal rendering no longer depends on the legacy CSS atmosphere', () => {
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const world = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../app/v010.css', import.meta.url), 'utf8');
  assert.match(renderer, /new SkyPass\(gl\)/);
  assert.match(renderer, /alpha:false/);
  assert.match(renderer, /this\.skyPass=null;try\{this\.skyPass=new SkyPass\(gl\)/);
  assert.match(renderer, /if\(this\.skyPass\)\{try\{this\.skyPass\.render/);
  assert.match(renderer, /opaque environment fallback/);
  assert.doesNotMatch(renderer, /gl\.clearColor\(0,0,0,0\)/);
  assert.doesNotMatch(app, /viewportWrap\.style\.background\s*=\s*`linear-gradient/);
  assert.doesNotMatch(world, /--v010-clouds/);
  assert.doesNotMatch(css, /v010-cloud-drift/);
  assert.doesNotMatch(css, /radial-gradient\(ellipse at 12% 24%/);
});
