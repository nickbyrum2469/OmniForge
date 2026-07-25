import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultWorldSettings, applyWorldToScene } from '../server/v010-systems.mjs';
import { celestialAuthorityNeedsRepair, isCelestialProxy, repairCelestialAuthority } from '../server/celestial-authority.mjs';
import { applyCompactWorldRuntime, resolveViewportLighting, updateCelestialRuntimeInterpolation } from '../app/world-runtime.js';

const activeScene = state => state.scenes.find(scene => scene.id === state.activeSceneId);
const addActivity = (state, type, message, data) => (state.activity ||= []).push({ type, message, data });

function legacyState() {
  return {
    engine: { revision: 1 },
    worldV010: defaultWorldSettings({ time: { hours: 18 } }),
    activeSceneId: 'scene-main',
    selection: { objectId: 'sun-main' },
    editor: { lastFocusObjectId: 'sun-main' },
    activity: [],
    scenes: [{
      id: 'scene-main',
      name: 'Main',
      settings: {},
      objects: [
        { id: 'sun-main', type: 'directionalLight', name: 'Sun', visible: true, locked: false, parentId: null, transform: { position: [0, 15, 0], rotation: [-45, 35, 0], scale: [1, 1, 1] }, properties: {}, components: [] },
        { id: 'old-sun-copy', type: 'directionalLight', name: 'Sun', visible: true, locked: false, parentId: null, transform: { position: [0, 10, 0], rotation: [-30, 90, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun' }, components: [] }
      ]
    }]
  };
}

test('Phase 0A collapses legacy celestial duplicates into one protected Sun and one protected Moon', () => {
  const state = legacyState();
  assert.equal(celestialAuthorityNeedsRepair(state, activeScene), true);
  const result = repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'test' });
  const scene = activeScene(state);
  const suns = scene.objects.filter(object => object.properties?.celestialRole === 'sun');
  const moons = scene.objects.filter(object => object.properties?.celestialRole === 'moon');
  assert.equal(suns.length, 1);
  assert.equal(moons.length, 1);
  assert.equal(isCelestialProxy(suns[0]), true);
  assert.equal(isCelestialProxy(moons[0]), true);
  assert.equal(suns[0].locked, true);
  assert.equal(moons[0].locked, true);
  assert.ok(result.diagnostics.removedIds.length >= 1);
  assert.equal(celestialAuthorityNeedsRepair(state, activeScene), false);
});

test('Phase 0A preserves a selectable persistent Moon identity across repeated repairs', () => {
  const state = legacyState();
  const first = repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'first' });
  state.selection.objectId = first.moon.id;
  const saved = structuredClone(state);
  const second = repairCelestialAuthority(saved, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'reload' });
  assert.equal(second.moon.id, first.moon.id);
  assert.equal(saved.selection.objectId, first.moon.id);
  assert.ok(activeScene(saved).objects.some(object => object.id === saved.selection.objectId));
});

test('Phase 0B interpolates celestial rotations through the shortest angular path', () => {
  const target = {
    state: { engine: { revision: 1 } },
    scene: {
      id: 'scene-main', settings: {}, objects: [{
        id: 'sun-main', type: 'directionalLight', visible: true,
        transform: { position: [0, 0, 0], rotation: [0, 350, 0], scale: [1, 1, 1] },
        properties: { celestialRole: 'sun', intensity: 1 }
      }]
    }
  };
  applyCompactWorldRuntime(target, {
    sceneId: 'scene-main', engineRevision: 2, visualDurationMs: 1000, settings: {},
    celestialObjects: [{ id: 'sun-main', type: 'directionalLight', visible: true, transform: { position: [0, 0, 0], rotation: [0, 10, 0], scale: [1, 1, 1] }, properties: { celestialRole: 'sun', intensity: 2 } }]
  }, { now: 0 });
  updateCelestialRuntimeInterpolation(target, 500);
  const yaw = target.scene.objects[0].transform.rotation[1];
  assert.ok(yaw > 350 && yaw < 370, `Expected shortest-path interpolation near 360°, received ${yaw}`);
  assert.ok(target.scene.objects[0].properties.intensity > 1 && target.scene.objects[0].properties.intensity < 2);
  updateCelestialRuntimeInterpolation(target, 1000);
  assert.equal(target.scene.objects[0].transform.rotation[1], 10);
  assert.equal(target.state.engine.revision, 2);
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

test('Phase 0 source contracts persist proxies, protect selection, smooth motion, and expose diagnostics', () => {
  const api010 = fs.readFileSync(new URL('../server/v010-api.mjs', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const worldUi = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  assert.match(api010, /world-read-migration/);
  assert.match(api010, /visualDurationMs: 2050/);
  assert.match(server, /initial-state-read/);
  assert.match(server, /selection-repair/);
  assert.match(server, /Celestial proxies cannot be duplicated/);
  assert.match(server, /authoritative Sun and Moon cannot be deleted/);
  assert.match(app, /Celestial Authority Proxy/);
  assert.match(app, /openCelestialStudioButton/);
  assert.match(worldUi, /updateCelestialRuntimeInterpolation/);
  assert.match(worldUi, /Authority: 1 Sun \+ 1 Moon/);
});
