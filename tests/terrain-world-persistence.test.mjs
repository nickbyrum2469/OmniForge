import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrateSceneWorldFoundation } from '../app/worldgen.js';
import { validateTerrainWorld } from '../app/world/terrain-world-schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sceneWithLegacyWorld() {
  return {
    id: 'scene-main',
    name: 'Main',
    settings: {},
    objects: [
      {
        id: 'terrain-main',
        type: 'terrain',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: { preset: 'plains', height: 4, size: 100, resolution: 32 }
      },
      {
        id: 'road-main',
        type: 'path',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: { points: [[-20, 0], [0, 0], [20, 0]], width: 4 }
      }
    ]
  };
}

test('scene migration adds one deterministic terrain-world metadata authority', () => {
  const scene = sceneWithLegacyWorld();
  migrateSceneWorldFoundation(scene);
  assert.deepEqual(scene.terrainWorld, {
    schemaVersion: 1,
    coordinateAuthority: 'world-space-meters',
    terrainId: 'terrain-main',
    revision: 1,
    constructionSites: [],
    terrainRegions: []
  });
  const first = JSON.stringify(scene);
  migrateSceneWorldFoundation(scene);
  assert.equal(JSON.stringify(scene), first);
});

test('terrain-world metadata survives JSON save/reload and scene migration exactly', () => {
  const scene = sceneWithLegacyWorld();
  migrateSceneWorldFoundation(scene);
  const network = scene.objects.find(object => object.id === 'road-main').properties.pathNetwork;
  scene.terrainWorld = {
    schemaVersion: 1,
    coordinateAuthority: 'world-space-meters',
    terrainId: 'terrain-main',
    revision: 8,
    constructionSites: [{
      schemaVersion: 1,
      id: 'site-market',
      name: 'Market Site',
      kind: 'building-pad',
      purpose: 'market-building',
      revision: 2,
      status: 'reserved',
      footprint: [[-8, -8], [8, -8], [8, 8], [-8, 8]],
      orientationDegrees: 90,
      elevation: { mode: 'best-fit-plane', target: null, offset: 0 },
      grading: { mode: 'best-fit-plane', maxSlopeDegrees: 8 },
      accessAnchors: [{
        id: 'site-market:access:main',
        kind: 'road',
        position: [0, 0, -8],
        pathObjectId: 'road-main',
        pathNetworkId: network.id,
        nodeId: null,
        segmentId: network.segments[0].id
      }],
      terrainRegionIds: ['region-market'],
      tags: ['civic'],
      protected: true
    }],
    terrainRegions: [{
      schemaVersion: 1,
      id: 'region-market',
      name: 'Market Reservation',
      purpose: 'reserved terrain volume',
      kind: 'building-pad',
      revision: 1,
      footprint: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
      elevationRange: { min: -4, max: 20 },
      ownerSiteId: 'site-market',
      referencedObjectIds: [],
      tags: ['town'],
      protected: true
    }]
  };
  const expected = JSON.stringify(scene.terrainWorld);
  const reloaded = JSON.parse(JSON.stringify(scene));
  migrateSceneWorldFoundation(reloaded);
  assert.equal(JSON.stringify(reloaded.terrainWorld), expected);
  assert.equal(validateTerrainWorld(reloaded.terrainWorld, reloaded).valid, true);
});

test('authoritative state store persists and reloads terrain-world planning metadata in isolation', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniforge-terrain-world-'));
  const storeUrl = pathToFileURL(path.join(ROOT, 'server', 'state-store.mjs')).href;
  const environment = {
    ...process.env,
    OMNIFORGE_DATA_ROOT: runtimeRoot,
    OMNIFORGE_SESSION_TOKEN: 'terrain-world-persistence-test'
  };
  const writeScript = `
    const store = await import(${JSON.stringify(storeUrl)});
    const state = store.createDefaultState({ name: 'Terrain World Persistence', id: 'terrain-world-persistence' });
    const scene = state.scenes[0];
    scene.terrainWorld = {
      schemaVersion: 1,
      coordinateAuthority: 'world-space-meters',
      terrainId: 'terrain-main',
      revision: 11,
      constructionSites: [{
        id: 'site-persisted', name: 'Persisted Site', kind: 'building-pad', purpose: 'building-site',
        revision: 4, status: 'approved', footprint: [[-4,-3],[4,-3],[4,3],[-4,3]],
        orientationDegrees: 30, elevation: { mode: 'best-fit-plane', target: null, offset: 0.25 },
        grading: { mode: 'foundation', maxSlopeDegrees: 6 }, accessAnchors: [],
        terrainRegionIds: ['region-persisted'], tags: ['persistence'], protected: true
      }],
      terrainRegions: [{
        id: 'region-persisted', name: 'Persisted Region', kind: 'building-pad', purpose: 'reserved terrain volume',
        revision: 2, footprint: [[-5,-4],[5,-4],[5,4],[-5,4]], elevationRange: { min: -2, max: 12 },
        ownerSiteId: 'site-persisted', referencedObjectIds: [], tags: ['persistence'], protected: true
      }]
    };
    store.writeState(state, false);
  `;
  const writer = spawnSync(process.execPath, ['--input-type=module', '-e', writeScript], {
    cwd: ROOT,
    env: environment,
    encoding: 'utf8'
  });
  assert.equal(writer.status, 0, writer.stderr || writer.stdout);

  const readScript = `
    const store = await import(${JSON.stringify(storeUrl)});
    const state = store.readState();
    const scene = state.scenes.find(item => item.id === state.activeSceneId);
    process.stdout.write(JSON.stringify({ stateSchemaVersion: state.schemaVersion, terrainWorld: scene.terrainWorld }));
  `;
  const reader = spawnSync(process.execPath, ['--input-type=module', '-e', readScript], {
    cwd: ROOT,
    env: environment,
    encoding: 'utf8'
  });
  assert.equal(reader.status, 0, reader.stderr || reader.stdout);
  const reloaded = JSON.parse(reader.stdout);
  assert.equal(reloaded.stateSchemaVersion, 9);
  assert.equal(reloaded.terrainWorld.revision, 11);
  assert.equal(reloaded.terrainWorld.constructionSites[0].id, 'site-persisted');
  assert.deepEqual(reloaded.terrainWorld.constructionSites[0].grading, { mode: 'foundation', maxSlopeDegrees: 6 });
  assert.equal(reloaded.terrainWorld.terrainRegions[0].ownerSiteId, 'site-persisted');
  const engineStateFile = path.join(runtimeRoot, 'data', 'engine-state.json');
  const projectStateFile = path.join(runtimeRoot, 'workspace', 'projects', 'terrain-world-persistence', '.omniforge', 'project-state.json');
  assert.ok(fs.existsSync(engineStateFile));
  assert.ok(fs.existsSync(projectStateFile));
  const engineState = JSON.parse(fs.readFileSync(engineStateFile, 'utf8'));
  const projectState = JSON.parse(fs.readFileSync(projectStateFile, 'utf8'));
  const engineWorld = engineState.scenes.find(item => item.id === engineState.activeSceneId).terrainWorld;
  const projectWorld = projectState.scenes.find(item => item.id === projectState.activeSceneId).terrainWorld;
  assert.equal(engineWorld.revision, 11);
  assert.equal(projectWorld.revision, 11);
  assert.deepEqual(projectWorld, engineWorld);
  assert.deepEqual(reloaded.terrainWorld, engineWorld);
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

test('scene migration does not change top-level project schema or path and terrain schema versions', () => {
  const state = { schemaVersion: 9, project: { schemaVersion: 9 }, scenes: [sceneWithLegacyWorld()] };
  migrateSceneWorldFoundation(state.scenes[0]);
  assert.equal(state.schemaVersion, 9);
  assert.equal(state.project.schemaVersion, 9);
  assert.equal(state.scenes[0].objects.find(object => object.type === 'terrain').properties.schemaVersion, 2);
  assert.equal(state.scenes[0].objects.find(object => object.type === 'path').properties.pathNetwork.schemaVersion, 2);
  assert.equal(state.scenes[0].terrainWorld.schemaVersion, 1);
});

test('invalid optional terrain-world metadata remains inspectable without blocking project migration', () => {
  const scene = sceneWithLegacyWorld();
  scene.terrainWorld = {
    schemaVersion: 1,
    coordinateAuthority: 'world-space-meters',
    terrainId: 'terrain-main',
    constructionSites: [],
    terrainRegions: [{
      id: 'bad-region',
      footprint: [[0, 0], [1, 1], [2, 2]],
      elevationRange: { min: 10, max: -10 }
    }]
  };
  const before = structuredClone(scene.terrainWorld);
  assert.doesNotThrow(() => migrateSceneWorldFoundation(scene));
  assert.deepEqual(scene.terrainWorld, before);
});

test('explicit dangling terrain authority is preserved for actionable validation', () => {
  const scene = sceneWithLegacyWorld();
  scene.terrainWorld = {
    schemaVersion: 1,
    coordinateAuthority: 'world-space-meters',
    terrainId: 'terrain-that-was-removed',
    revision: 1,
    constructionSites: [],
    terrainRegions: []
  };
  migrateSceneWorldFoundation(scene);
  assert.equal(scene.terrainWorld.terrainId, 'terrain-that-was-removed');
  const validation = validateTerrainWorld(scene.terrainWorld, scene);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /missing authoritative terrain terrain-that-was-removed/);
});
