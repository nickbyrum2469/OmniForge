import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skyRayFromNdc, normalizeEnvironmentState } from '../app/environment-runtime.js';
import { createLookInputState, beginLookInputSession, endLookInputSession, applyLookDelta } from '../app/viewport-navigation.js';

const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

test('sky rays rotate with the camera but ignore camera translation', () => {
  const camera = { position: [0, 0, 0], yaw: 0.2, pitch: -0.1, fov: 62 };
  const origin = skyRayFromNdc(camera, 0.35, -0.2, 16 / 9);
  const translated = skyRayFromNdc({ ...camera, position: [400, -80, 900] }, 0.35, -0.2, 16 / 9);
  assert.ok(distance(origin, translated) < 1e-12);
  const rotated = skyRayFromNdc({ ...camera, yaw: camera.yaw + 0.7 }, 0.35, -0.2, 16 / 9);
  assert.ok(distance(origin, rotated) > 0.3);
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
  assert.equal(state.weatherDarkening, 0.44);
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
  const camera = { yaw: 0, pitch: 0, lookSensitivity: 0.0023, invertHorizontal: false, invertVertical: false };
  beginLookInputSession(look, 'pointer-lock');
  const acquisition = applyLookDelta(camera, look, { dx: 180, dy: -130, source: 'pointer-lock', now: 100 });
  assert.equal(acquisition.reason, 'session-warmup');
  assert.equal(camera.yaw, 0);
  const normal = applyLookDelta(camera, look, { dx: 12, dy: -8, source: 'pointer-lock', now: 116 });
  assert.equal(normal.changed, true);
  assert.ok(camera.yaw > 0);
  const yawAfterNormal = camera.yaw;
  const spike = applyLookDelta(camera, look, { dx: 1200, dy: -900, source: 'pointer-lock', now: 132 });
  assert.equal(spike.reason, 'delta-spike');
  assert.equal(camera.yaw, yawAfterNormal);
  const resumed = applyLookDelta(camera, look, { dx: 8, dy: 4, source: 'pointer-lock', now: 520 });
  assert.equal(resumed.reason, 'resume-guard');
  assert.equal(camera.yaw, yawAfterNormal);
  const resumeWarmup = applyLookDelta(camera, look, { dx: 8, dy: 4, source: 'pointer-lock', now: 536 });
  assert.equal(resumeWarmup.reason, 'session-warmup');
  const next = applyLookDelta(camera, look, { dx: 8, dy: 4, source: 'pointer-lock', now: 552 });
  assert.equal(next.changed, true);
  endLookInputSession(look);
});

test('yaw remains normalized and pitch remains bounded', () => {
  const look = createLookInputState();
  const camera = { yaw: Math.PI - 0.01, pitch: 1.5, lookSensitivity: 0.008, invertHorizontal: false, invertVertical: false };
  beginLookInputSession(look, 'right-drag');
  applyLookDelta(camera, look, { dx: 0, dy: 0, source: 'right-drag', now: 0 });
  for (let index = 0; index < 20; index += 1) applyLookDelta(camera, look, { dx: 150, dy: -150, source: 'right-drag', now: 16 + index * 16 });
  assert.ok(camera.yaw >= -Math.PI && camera.yaw <= Math.PI);
  assert.ok(camera.pitch <= Math.PI * 0.495);
  assert.ok(camera.pitch >= -Math.PI * 0.495);
});

test('viewport acquisition protects camera authority before pointer lock and releases cleanly', () => {
  const source = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const enterIndex = source.indexOf('async function enterViewportNavigation');
  const intentIndex = source.indexOf('viewportNavigationIntentUntil=Date.now()+1600', enterIndex);
  const pickIndex = source.indexOf('renderer.pick', enterIndex);
  const lockIndex = source.indexOf('requestPointerLock', enterIndex);
  assert.ok(intentIndex > enterIndex && intentIndex < pickIndex && pickIndex < lockIndex);
  assert.match(source, /pointerlockchange/);
  assert.match(source, /pointerlockerror/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /persistCameraSoon\(\)/);
});

test('normal rendering no longer depends on the legacy CSS atmosphere', () => {
  const css = fs.readFileSync(new URL('../app/v010.css', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const v010 = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  assert.match(css, /#viewportWrap::before[\s\S]*content:\s*none/);
  assert.match(css, /#viewportWrap::after[\s\S]*content:\s*none/);
  assert.doesNotMatch(v010, /--cloud-coverage/);
  assert.doesNotMatch(v010, /--star-opacity/);
  assert.doesNotMatch(app, /viewportWrap\.style\.background\s*=\s*[^;]*linear-gradient/);
  assert.match(renderer, /alpha:false/);
  assert.match(renderer, /new SkyPass\(gl\)/);
});
