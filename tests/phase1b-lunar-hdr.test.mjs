import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateCelestialSystem } from '../app/celestial-mechanics.js';
import { applyEnvironmentPreset, ENVIRONMENT_PRESETS } from '../app/environment-presets.js';

function worldAt({ absoluteDay = 200, hours = 12, moonAgeDays = 0, latitude = 37.3, eclipseMode = 'automatic' } = {}) {
  return {
    time: { absoluteDay, dayOfYear: absoluteDay % 365, hours, latitude },
    sky: {
      celestialMode: 'astronomical',
      moonPhaseMode: 'sun-relative',
      moonOrbitPeriodDays: 29.530588,
      moonNodePeriodDays: 27.212221,
      lunarEpochDay: absoluteDay + hours / 24 - moonAgeDays,
      moonNodeEpochDay: 151.1,
      moonOrbitInclination: 5.145,
      moonAscendingNode: 0,
      moonEarthshine: 0.08,
      eclipseMode
    }
  };
}

test('Moon illumination is derived from Sun–Moon geometry', () => {
  const newMoon = evaluateCelestialSystem(worldAt({ moonAgeDays: 0 }));
  const quarterMoon = evaluateCelestialSystem(worldAt({ moonAgeDays: 29.530588 * 0.25 }));
  const fullMoon = evaluateCelestialSystem(worldAt({ moonAgeDays: 29.530588 * 0.5 }));
  assert.ok(newMoon.moon.illumination < 0.08, `new Moon illumination was ${newMoon.moon.illumination}`);
  assert.ok(Math.abs(quarterMoon.moon.illumination - 0.5) < 0.18, `quarter Moon illumination was ${quarterMoon.moon.illumination}`);
  assert.ok(fullMoon.moon.illumination > 0.92, `full Moon illumination was ${fullMoon.moon.illumination}`);
  assert.equal(newMoon.moon.phaseName, 'New Moon');
  assert.equal(fullMoon.moon.phaseName, 'Full Moon');
});

test('Moon follows an independent orbit and can be above the horizon by day or absent at night', () => {
  const samples = [];
  for (const hours of [0, 2, 6, 10, 14, 18, 22]) {
    samples.push(evaluateCelestialSystem(worldAt({ hours, moonAgeDays: 29.530588 * 0.27 })).moon);
  }
  const azimuths = new Set(samples.map(item => Math.round(item.azimuth)));
  assert.ok(azimuths.size >= 5);
  assert.ok(samples.some(item => item.elevation > 5));
  assert.ok(samples.some(item => item.elevation < -5));
  const daytimeVisible = samples.some((item, index) => [10, 14].includes([0, 2, 6, 10, 14, 18, 22][index]) && item.elevation > 0 && item.visibility > 0.05);
  assert.equal(daytimeVisible, true);
});

test('Forced eclipse modes are deterministic authoring tools', () => {
  const solar = evaluateCelestialSystem(worldAt({ moonAgeDays: 3, eclipseMode: 'force-solar' }));
  const lunar = evaluateCelestialSystem(worldAt({ moonAgeDays: 3, eclipseMode: 'force-lunar' }));
  assert.equal(solar.event.type, 'solar-eclipse');
  assert.equal(solar.moon.solarEclipse, 1);
  assert.equal(lunar.event.type, 'lunar-eclipse');
  assert.equal(lunar.moon.lunarEclipse, 1);
});

test('manual celestial coordinates produce partial eclipse strength without orbital-node vetoes', () => {
  const world = worldAt({ moonAgeDays: 3, eclipseMode: 'automatic' });
  world.sky = {
    ...world.sky,
    celestialMode: 'manual',
    sunAzimuth: 0,
    sunElevation: 30,
    moonAzimuth: 0.58,
    moonElevation: 30,
    moonOrbitInclination: 45
  };
  const partial = evaluateCelestialSystem(world);
  assert.ok(partial.moon.solarEclipse > 0.05 && partial.moon.solarEclipse < 1);
  assert.ok(partial.moon.separationDegrees > 0.1);
});

test('Environment presets edit the same authoritative world sections', () => {
  assert.ok(Object.keys(ENVIRONMENT_PRESETS).length >= 6);
  const source = {
    time: { hours: 12 }, lighting: { profile: 'compatibility' }, atmosphere: { exposure: 1 },
    sky: { moonSize: 2 }, clouds: { coverage: 0 }, weather: { preset: 'clear' }
  };
  const result = applyEnvironmentPreset(source, 'cinematic-vivid');
  assert.equal(result.lookPreset, 'cinematic-vivid');
  assert.equal(result.sky.moonSize, 2);
  assert.ok(result.atmosphere.saturation > 1);
  assert.ok(result.atmosphere.contrast > 1);
  assert.notEqual(result, source);
});

test('Phase 1B renderer source has one HDR display transform and controllable non-aurora star systems', () => {
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  const sky = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const systems = fs.readFileSync(new URL('../server/v010-systems.mjs', import.meta.url), 'utf8');
  assert.match(renderer, /HDRPipeline/);
  assert.match(renderer, /display-transform/);
  assert.match(renderer, /hdr-scene-color/);
  assert.doesNotMatch(renderer, /color=\(color\*\(2\.51\*color/);
  assert.match(sky, /vec3 starLayer/);
  assert.match(sky, /vec3 milkyWay/);
  assert.match(sky, /uStarTwinkleAmount/);
  assert.match(sky, /uStarSizeMin/);
  assert.match(sky, /uMilkyWayDust/);
  assert.match(sky, /moonSurfaceNormal/);
  assert.match(sky, /uSolarEclipse/);
  assert.match(ui, /v010MoonAge/);
  assert.match(ui, /v010EclipseMode/);
  assert.match(ui, /v010StarTwinkle/);
  assert.match(ui, /v010MilkyWayWidth/);
  assert.match(systems, /evaluateCelestialSystem/);
  assert.match(systems, /moonIllumination/);
});
