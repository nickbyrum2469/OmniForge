import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import {
  applyCompactWorldRuntime,
  runtimeInterpolationDiagnostics,
  updateCelestialRuntimeInterpolation
} from '../app/world-runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sceneAtSunElevation(elevation, sky = {}) {
  return {
    settings: {
      skyTop: '#1f65b7', skyBottom: '#69a9d8', skyGround: '#17242d',
      environmentV010: {
        nightFactor: 1,
        twilightFactor: 1,
        sky: { celestialMode: 'astronomical', sunSize: 1, moonSize: 1.25, ...sky },
        clouds: {}, weather: {}, atmosphere: {}, lighting: {}
      }
    },
    objects: [
      { properties: { celestialRole: 'sun', azimuth: 270, elevation } },
      { properties: { celestialRole: 'moon', azimuth: 90, elevation: 25, skyVisibility: 1, illumination: 0.75 } }
    ]
  };
}

test('solar, night, and twilight factors are continuous functions of interpolated solar elevation', () => {
  const lights = { dir: [0, -1, 0], color: [1, 0.94, 0.78], exposure: 1 };
  const below = normalizeEnvironmentState(sceneAtSunElevation(-20), lights, 0);
  const dawn = normalizeEnvironmentState(sceneAtSunElevation(-5), lights, 0);
  const horizon = normalizeEnvironmentState(sceneAtSunElevation(0), lights, 0);
  const day = normalizeEnvironmentState(sceneAtSunElevation(20), lights, 0);
  assert.equal(below.dayFactor, 0);
  assert.equal(day.dayFactor, 1);
  assert.ok(dawn.dayFactor > 0 && dawn.dayFactor < horizon.dayFactor);
  assert.ok(horizon.dayFactor > 0 && horizon.dayFactor < 1);
  assert.ok(dawn.twilightFactor > 0);
  assert.ok(below.nightFactor > dawn.nightFactor);
  const partialDisc = normalizeEnvironmentState(sceneAtSunElevation(-0.1), lights, 0);
  assert.ok(partialDisc.sunVisibility > 0 && partialDisc.sunVisibility < 1);
});

test('astronomical mode constrains destructive presentation without mutating manual Custom ranges', () => {
  const lights = { dir: [0, -1, 0], color: [1, 1, 1], exposure: 1 };
  const physical = normalizeEnvironmentState(sceneAtSunElevation(20, {
    sunSize: 8, moonSize: 24, starSizeMin: 4, starSizeMax: 8, starHeroFraction: 0.8
  }), lights, 0);
  assert.equal(physical.celestialMode, 'astronomical');
  assert.equal(physical.physicalCelestial, true);
  assert.ok(physical.sunAngularRadius <= 0.2666 * 1.15 + 1e-9);
  assert.ok(physical.moonAngularRadius <= 0.259 * 1.35 + 1e-9);
  assert.ok(physical.starSizeMax <= 1.1);
  assert.ok(physical.starHeroFraction <= 0.008);

  const artistic = normalizeEnvironmentState(sceneAtSunElevation(20, {
    celestialMode: 'manual', sunSize: 8, moonSize: 24, starSizeMax: 8, starHeroFraction: 0.8
  }), lights, 0);
  assert.equal(artistic.physicalCelestial, false);
  assert.ok(artistic.sunAngularRadius > physical.sunAngularRadius);
  assert.ok(artistic.moonAngularRadius > physical.moonAngularRadius);
  assert.equal(artistic.starSizeMax, 8);
});

test('sky compositor removes ray-level slicing and occludes background astronomy before the Moon', () => {
  const sky = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');
  assert.match(sky, /uniform float uSunVisibility/);
  assert.match(sky, /sunDisc=.*uSunVisibility/);
  assert.doesNotMatch(sky, /celestialHorizonMask/);
  assert.doesNotMatch(sky, /sunDisc=.*uDayFactor/);
  assert.match(sky, /float moonOcclusionDisc=1\.0-smoothstep\(0\.94,1\.045,moonRadius\)/);
  assert.match(sky, /stellarCelestialMask=\(1\.0-eclipseSilhouette\)\*\(1\.0-moonOcclusionDisc\)/);
  assert.match(sky, /sky\+=milkyWay\(ray,starHorizon\*stellarTransmission\)\*stellarCelestialMask/);
  assert.match(sky, /sky=mix\(sky,moonComposite,clamp\(moonDisc,0\.0,1\.0\)\)/);
  assert.ok(sky.indexOf('stellarCelestialMask=') < sky.indexOf('sky=mix(sky,moonComposite'));
});

test('star optics use capped micro, medium, and rare hero classes without size breathing', () => {
  const sky = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');
  assert.match(sky, /float heroProbability=clamp\(uStarHeroFraction,0\.001,0\.008\)/);
  assert.match(sky, /float mediumProbability=/);
  assert.match(sky, /microRadius=.*0\.07,0\.16/);
  assert.match(sky, /heroRadius=clamp\([^\n]+0\.68,1\.45\)/);
  assert.match(sky, /medium\*0\.025\+hero\*0\.1/);
  assert.match(sky, /hero\*uStarRayStrength\*0\.028/);
  assert.doesNotMatch(sky, /radiusPixels.*pulse/);
  assert.doesNotMatch(sky, /radiusPixels.*shimmer/);
});

test('celestial interpolation predicts continuously across snapshot boundaries', () => {
  const target = {
    state: { engine: { revision: 0 } },
    scene: {
      id: 'predictive-scene', settings: {},
      objects: [{
        id: 'sun', visible: true,
        transform: { position: [0, 20, 0], rotation: [12, 170, 0], scale: [1, 1, 1] },
        properties: { celestialRole: 'sun', azimuth: 170, elevation: -12, intensity: 0.2 }
      }]
    }
  };
  applyCompactWorldRuntime(target, {
    sceneId: 'predictive-scene', engineRevision: 1, visualDurationMs: 1000,
    celestialObjects: [{
      id: 'sun', visible: true,
      transform: { position: [0, 20, 0], rotation: [10, 180, 0], scale: [1, 1, 1] },
      properties: { celestialRole: 'sun', azimuth: 180, elevation: -10, intensity: 0.3 }
    }]
  }, { now: 0 });
  updateCelestialRuntimeInterpolation(target, 500);
  const halfway = target.scene.objects[0].properties.azimuth;
  updateCelestialRuntimeInterpolation(target, 1500);
  const predicted = target.scene.objects[0].properties.azimuth;
  assert.ok(halfway > 170 && halfway < 180);
  assert.ok(predicted > 180 && predicted < 198);
  assert.equal(runtimeInterpolationDiagnostics('predictive-scene').mode, 'continuous-predictive');
});

test('civil twilight reveals bright stars continuously before full night', () => {
  const lights = { dir: [0, -1, 0], color: [1, 0.94, 0.78], exposure: 1 };
  const early = normalizeEnvironmentState(sceneAtSunElevation(-1), lights, 0);
  const civil = normalizeEnvironmentState(sceneAtSunElevation(-4), lights, 0);
  const nautical = normalizeEnvironmentState(sceneAtSunElevation(-9), lights, 0);
  assert.equal(early.starVisibility, 0);
  assert.ok(civil.starVisibility > 0 && civil.starVisibility < nautical.starVisibility);
  assert.ok(civil.milkyWayIntensity <= 1e-9);
  assert.ok(nautical.milkyWayIntensity > civil.milkyWayIntensity);

  const sky = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');
  assert.match(sky, /float civilTwilightLift=uTwilightFactor\*\(1\.0-uDayFactor\)\*\(1\.0-uNightFactor\)/);
  assert.match(sky, /sky\+=civilTwilightColor\*civilTwilightLift\*\(0\.14\+0\.36\*horizon\)/);
});
