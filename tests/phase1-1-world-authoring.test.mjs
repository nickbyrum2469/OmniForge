import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultWorldSettings, applyWorldToScene } from '../server/v010-systems.mjs';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import { directionFromAzimuthElevation } from '../app/celestial-mechanics.js';
import { normalizeTerrainProperties, terrainBaseHeightAt, expandTerrain, addTerrainSculptLayer, undoTerrainSculpt } from '../app/worldgen.js';

function scene() {
  return { id: 'scene-test', settings: {}, objects: [] };
}

function assertDirectionClose(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, 3);
  for (let index = 0; index < 3; index += 1) assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance);
}

test('Celestial Studio settings normalize and create authoritative Sun and Moon entities', () => {
  const world = defaultWorldSettings({
    time: { hours: 18 },
    sky: { celestialMode: 'manual', sunAzimuth: 120, sunElevation: 32, moonAzimuth: 300, moonElevation: 41, sunSize: 1.8, moonSize: 2.4, moonPhase: 0.5, moonPhaseMode: 'manual', planetEnabled: true },
    lighting: { moonIntensity: 0.2 }
  });
  assert.equal(world.sky.sunSize, 1.8);
  assert.equal(world.sky.moonSize, 2.4);
  assert.equal(world.sky.planetEnabled, true);
  const target = scene();
  const derived = applyWorldToScene(target, world);
  const sun = target.objects.find(object => object.properties?.celestialRole === 'sun');
  const moon = target.objects.find(object => object.properties?.celestialRole === 'moon');
  assert.ok(sun);
  assert.ok(moon);
  assert.equal(derived.sunAzimuth, 120);
  assert.equal(derived.moonElevationDegrees, 41);
  assert.equal(moon.properties.phase, 0.5);
  assert.equal(moon.properties.azimuth, 300);
  assert.equal(moon.properties.elevation, 41);
  const environment = normalizeEnvironmentState(target, { dir: [0, -1, 0], color: [1, 0.95, 0.85], exposure: 1 }, 0);
  assertDirectionClose(environment.moonDirection, directionFromAzimuthElevation(300, 41));
});

test('renderer environment exposes adjustable discs, detailed moon, planet, moonlight, and volumetric cloud inputs', () => {
  const target = scene();
  const world = defaultWorldSettings({
    sky: { celestialMode: 'manual', sunSize: 2, moonSize: 3, moonPhase: 0.5, moonPhaseMode: 'manual', moonBrightness: 1.5, moonDetail: 2, planetEnabled: true, planetAzimuth: 210, planetElevation: 25 },
    clouds: { quality: 'balanced', altitude: 1800, thickness: 1200 },
    lighting: { moonIntensity: 0.2 }
  });
  applyWorldToScene(target, world);
  const state = normalizeEnvironmentState(target, { dir: [0, -1, 0], color: [1, 0.95, 0.85], exposure: 1 }, 20);
  assert.ok(state.sunAngularRadius > 0.5);
  assert.ok(state.moonAngularRadius > state.sunAngularRadius);
  assert.equal(state.moonPhase, 0.5);
  assert.equal(state.moonDetail, 2);
  assert.equal(state.planetEnabled, true);
  assert.equal(state.cloudQuality, 'balanced');
  assert.equal(state.cloudAltitude, 1800);
  assert.equal(state.cloudThickness, 1200);
  assert.ok(state.moonLightIntensity >= 0);
});

test('twilight keeps the shared anti-solar horizon cool while the renderer owns directional warmth', () => {
  const target = scene();
  const world = defaultWorldSettings({
    sky: { celestialMode: 'manual', sunAzimuth: 0, sunElevation: -4 }
  });
  applyWorldToScene(target, world);
  const [red, green, blue] = target.settings.skyBottom
    .slice(1)
    .match(/.{2}/g)
    .map(value => Number.parseInt(value, 16));
  assert.ok(blue > red, `expected a cool shared horizon, received ${target.settings.skyBottom}`);
  assert.ok(blue > green, `expected a cool shared horizon, received ${target.settings.skyBottom}`);
});

test('terrain expansion preserves physical vertex density until the single-mesh safety ceiling', () => {
  const terrain = {
    type: 'terrain', transform: { position: [0, 0, 0], scale: [1, 1, 1] },
    properties: normalizeTerrainProperties({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, resolutionX: 100, resolutionZ: 100, height: 10, seed: 17 })
  };
  expandTerrain(terrain, 'east', 100);
  assert.equal(terrain.properties.resolutionX, 200);
  assert.equal(terrain.properties.resolutionZ, 100);
  assert.equal(terrain.properties.densityLimited, false);
  expandTerrain(terrain, 'east', 500);
  assert.equal(terrain.properties.resolutionX, 256);
  assert.equal(terrain.properties.densityLimited, true);
});

test('local terrain sculpt stamps are reversible and do not alter distant samples', () => {
  const terrain = {
    type: 'terrain', transform: { position: [0, 0, 0], scale: [1, 1, 1] },
    properties: normalizeTerrainProperties({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, resolution: 128, height: 12, seed: 33 })
  };
  const beforeCenter = terrainBaseHeightAt(terrain, 0, 0);
  const beforeFar = terrainBaseHeightAt(terrain, 80, 80);
  addTerrainSculptLayer(terrain, { mode: 'raise', x: 0, z: 0, radius: 12, strength: 5 });
  assert.ok(terrainBaseHeightAt(terrain, 0, 0) > beforeCenter + 4);
  assert.equal(terrainBaseHeightAt(terrain, 80, 80), beforeFar);
  undoTerrainSculpt(terrain);
  assert.ok(Math.abs(terrainBaseHeightAt(terrain, 0, 0) - beforeCenter) < 1e-9);
});

test('World, path, terrain, renderer, and API source expose the corrective authoring contracts', () => {
  const worldUi = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const pathUi = fs.readFileSync(new URL('../app/v011.js', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
  const sky = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
  const environment = fs.readFileSync(new URL('../app/environment-runtime.js', import.meta.url), 'utf8');
  const api010 = fs.readFileSync(new URL('../server/v010-api.mjs', import.meta.url), 'utf8');
  const api011 = fs.readFileSync(new URL('../server/v011-api.mjs', import.meta.url), 'utf8');
  assert.match(worldUi, /Array\.isArray\(snapshot\.assets\)/);
  assert.match(worldUi, /v010CelestialMode/);
  assert.match(worldUi, /v010CloudQuality/);
  assert.match(pathUi, /v011ToggleSculpt/);
  assert.match(pathUi, /v011DeleteNode/);
  assert.match(pathUi, /selectedSplineNodeIndex/);
  assert.match(renderer, /uMoonIntensity/);
  assert.match(renderer, /v011-spline-editing/);
  assert.match(sky, /volumetricCloud/);
  assert.match(sky, /uMoonPhase/);
  assert.match(sky, /uPlanetEnabled/);
  assert.match(environment, /object\.properties\?\.azimuth/);
  assert.match(environment, /object\.properties\?\.elevation/);
  assert.match(api010, /\(state\.assets \|\| \[\]\)\.filter/);
  assert.match(api011, /sculpt\\\/undo/);
  assert.match(api011, /Number\.isInteger\(Number\(input\.index\)\)/);
});
