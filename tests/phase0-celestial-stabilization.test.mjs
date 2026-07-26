import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import { applyCompactWorldRuntime, resolveViewportLighting, updateCelestialRuntimeInterpolation } from '../app/world-runtime.js';
import { repairCelestialAuthority } from '../server/celestial-authority.mjs';
import { defaultWorldSettings, applyWorldToScene } from '../server/v010-systems.mjs';

function baseState(objects = []) {
  return {
    engine: { revision: 1 },
    activeSceneId: 'scene-a',
    worldV010: defaultWorldSettings(),
    scenes: [{ id: 'scene-a', name: 'Main', settings: {}, objects, editorCamera: { position: [0, 4, 10], yaw: 0, pitch: 0, fov: 62 } }],
    selection: { objectId: null },
    editor: {},
    activity: []
  };
}

const activeScene = state => state.scenes.find(scene => scene.id === state.activeSceneId);
const addActivity = () => {};

test('Phase 0A collapses legacy celestial duplicates into one protected Sun and one protected Moon', () => {
  const state = baseState([
    { id: 'old-sun-a', type: 'directionalLight', name: 'Sun', visible: true, locked: false, transform: { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, properties: {}, components: [] },
    { id: 'old-sun-b', type: 'directionalLight', name: 'Sun', visible: true, locked: false, transform: { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun' }, components: [] },
    { id: 'fill-light', type: 'directionalLight', name: 'Fill Light', visible: true, locked: false, transform: { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, properties: {}, components: [] },
    { id: 'old-moon-a', type: 'empty', name: 'Moon', visible: true, locked: false, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, properties: {}, components: [] },
    { id: 'old-moon-b', type: 'empty', name: 'Moon', visible: true, locked: false, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'moon' }, components: [] }
  ]);
  state.selection.objectId = 'old-moon-a';
  const result = repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'test' });
  const scene = activeScene(state);
  const suns = scene.objects.filter(object => object.properties?.celestialRole === 'sun');
  const moons = scene.objects.filter(object => object.properties?.celestialRole === 'moon');
  assert.equal(suns.length, 1);
  assert.equal(moons.length, 1);
  assert.ok(scene.objects.some(object => object.id === 'fill-light'));
  assert.equal(suns[0].locked, true);
  assert.equal(moons[0].locked, true);
  assert.equal(state.selection.objectId, moons[0].id);
  assert.ok(result.diagnostics.removedIds.length >= 2);
});

test('Phase 0A preserves a selectable persistent Moon identity across repeated repairs', () => {
  const state = baseState();
  repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'first' });
  const firstMoon = activeScene(state).objects.find(object => object.properties?.celestialRole === 'moon');
  state.selection.objectId = firstMoon.id;
  repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'second' });
  const secondMoon = activeScene(state).objects.find(object => object.properties?.celestialRole === 'moon');
  assert.equal(secondMoon.id, firstMoon.id);
  assert.equal(state.selection.objectId, firstMoon.id);
});

test('Phase 0B interpolates celestial rotations through the shortest angular path', () => {
  const state = { engine: { revision: 1 } };
  const scene = { id: 'scene-a', settings: {}, objects: [{ id: 'sun-a', type: 'directionalLight', visible: true, transform: { position: [0, 0, 0], rotation: [0, 350, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun', intensity: 1 } }] };
  applyCompactWorldRuntime({ state, scene }, { sceneId: 'scene-a', visualDurationMs: 1000, celestialObjects: [{ id: 'sun-a', visible: true, transform: { position: [0, 0, 0], rotation: [0, 10, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun', intensity: 0.5 } }] }, { now: 0, durationMs: 1000 });
  updateCelestialRuntimeInterpolation({ state, scene }, 500);
  const yaw = scene.objects[0].transform.rotation[1];
  assert.ok(yaw > 350 && yaw < 370);
  updateCelestialRuntimeInterpolation({ state, scene }, 1000);
  assert.equal(scene.objects[0].transform.rotation[1], 10);
});

test('celestial interpolation crosses the nightly nadir without an azimuth slingshot', () => {
  const state = { engine: { revision: 1 } };
  const scene = {
    id: 'scene-nadir',
    settings: {},
    objects: [{
      id: 'sun-nadir',
      type: 'directionalLight',
      visible: true,
      transform: { position: [0, 0, 0], rotation: [89, 180, 0], scale: [1, 1, 1] },
      properties: { celestialRole: 'sun', azimuth: 0, elevation: -89, intensity: 0 }
    }]
  };
  applyCompactWorldRuntime({ state, scene }, {
    sceneId: 'scene-nadir',
    celestialObjects: [{
      id: 'sun-nadir',
      visible: true,
      transform: { position: [0, 0, 0], rotation: [89, 360, 0], scale: [1, 1, 1] },
      properties: { celestialRole: 'sun', azimuth: 180, elevation: -89, intensity: 0 }
    }]
  }, { now: 0, durationMs: 1000 });
  updateCelestialRuntimeInterpolation({ state, scene }, 500);
  assert.ok(scene.objects[0].properties.elevation < -89.9);
  assert.ok(Math.abs(scene.objects[0].transform.rotation[0] - 90) < 0.1);
});

test('Phase 0C editor readability no longer invents a white directional Sun or forces high exposure', () => {
  const settings = { ambientIntensity: 0.05, exposure: 0.6, environmentV010: { nightFactor: 1 } };
  const edit = resolveViewportLighting(settings, 'edit', 0);
  const play = resolveViewportLighting(settings, 'play', 0);
  assert.equal(edit.sunIntensity, 0);
  assert.ok(edit.editorFill > 0 && edit.editorFill < 0.2);
  assert.ok(edit.exposure < 1);
  assert.equal(edit.authoringAssist, true);
  assert.deepEqual(play, { ambientIntensity: 0.05, exposure: 0.6, sunIntensity: 0, editorFill: 0, authoringAssist: false });
});

test('Phase 0 source contracts persist proxies, protect selection, continuously smooth motion, and expose diagnostics', () => {
  const api010 = fs.readFileSync(new URL('../server/v010-api.mjs', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const worldUi = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  assert.match(api010, /world-read-migration/);
  assert.match(api010, /visualDurationMs: 1100/);
  assert.match(server, /initial-state-read/);
  assert.match(server, /selection-repair/);
  assert.match(server, /Celestial proxies cannot be duplicated/);
  assert.match(server, /authoritative Sun and Moon cannot be deleted/);
  assert.match(app, /Celestial Authority Proxy/);
  assert.match(app, /openCelestialStudioButton/);
  assert.match(worldUi, /updateCelestialRuntimeInterpolation/);
  assert.match(worldUi, /Authority: 1 Sun \+ 1 Moon/);
});

test('environment state uses persistent celestial proxies instead of transient GET-only bodies', () => {
  const state = baseState();
  repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'environment-test' });
  const scene = activeScene(state);
  const environment = normalizeEnvironmentState(scene, { dir: [0, -1, 0], color: [1, 1, 1] }, 0);
  assert.equal(environment.sunDirection.length, 3);
  assert.equal(environment.moonDirection.length, 3);
  assert.ok(scene.objects.some(object => object.properties?.celestialRole === 'sun'));
  assert.ok(scene.objects.some(object => object.properties?.celestialRole === 'moon'));
});
