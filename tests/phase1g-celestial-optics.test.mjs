import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sceneAtSunElevation(elevation) {
  return {
    settings: {
      skyTop: '#1f65b7',
      skyBottom: '#69a9d8',
      skyGround: '#17242d',
      environmentV010: {
        nightFactor: 1,
        twilightFactor: 1,
        sky: { sunSize: 1, moonSize: 1.25 },
        clouds: {}, weather: {}, atmosphere: {}, lighting: {}
      }
    },
    objects: [
      { properties: { celestialRole: 'sun', azimuth: 270, elevation } },
      { properties: { celestialRole: 'moon', azimuth: 90, elevation: 25, skyVisibility: 1, illumination: 0.75 } }
    ]
  };
}

test('solar-disc visibility is geometric and independent from the broad day factor', () => {
  const lights = { dir: [0, -1, 0], color: [1, 0.94, 0.78], exposure: 1 };
  const partial = normalizeEnvironmentState(sceneAtSunElevation(-0.1), lights, 0);
  assert.equal(partial.dayFactor, 0);
  assert.ok(partial.sunVisibility > 0 && partial.sunVisibility < 1);

  const hidden = normalizeEnvironmentState(sceneAtSunElevation(-1), lights, 0);
  assert.equal(hidden.sunVisibility, 0);

  const visible = normalizeEnvironmentState(sceneAtSunElevation(1), lights, 0);
  assert.equal(visible.sunVisibility, 1);
});

test('sky shader keeps compact stars and separates celestial visibility from lighting state', () => {
  const sky = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');
  assert.match(sky, /uniform float uSunVisibility/);
  assert.match(sky, /sunDisc=.*uSunVisibility\*celestialHorizonMask/);
  assert.doesNotMatch(sky, /sunDisc=.*uDayFactor/);
  assert.match(sky, /microRadius=.*0\.12,0\.32/);
  assert.match(sky, /heroRadius=clamp\([^\n]+0\.72,2\.05\)/);
  assert.match(sky, /float halo=.*hero\*0\.16/);
  assert.match(sky, /rays=.*hero\*uStarRayStrength\*0\.045/);
  assert.match(sky, /moonDisc\*=moonCenterVisibility\*celestialHorizonMask/);
  assert.match(sky, /moonSurfaceEnergy=pow\(max\(phaseLighting,uMoonEarthshine\*0\.35\),0\.72\)/);
});
