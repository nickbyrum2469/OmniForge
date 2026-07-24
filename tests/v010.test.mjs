import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { importModelAsset } from '../server/asset-pipeline.mjs';
import {
  seededRandom,
  defaultWorldSettings,
  applyWorldToScene,
  fitGroundContact,
  generateFoliagePlacements,
  distanceToPaths
} from '../server/v010-systems.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const terrain = {
  id: 'terrain-test',
  type: 'terrain',
  visible: true,
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  properties: { seed: 3, frequency: 0.05, amplitude: 2, size: 80 }
};

function foliageScene() {
  return {
    settings: {},
    objects: [
      structuredClone(terrain),
      {
        id: 'path-test',
        type: 'path',
        visible: true,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: { width: 4, points: [[-20, 0], [20, 0]] }
      },
      {
        id: 'structure-test',
        type: 'box',
        visible: true,
        transform: { position: [8, 0, 8], rotation: [0, 0, 0], scale: [4, 4, 4] },
        properties: {}
      }
    ]
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function requestJson(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function waitForHealth(port, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(port, '/api/health');
      if (result.status === 200) return result.body;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw lastError || new Error('Timed out waiting for the v0.10 server health endpoint.');
}

test('v0.10 seeded random and foliage placement are deterministic', () => {
  const scene = foliageScene();
  const species = {
    spacing: 2,
    pathExclusion: 2,
    structureExclusion: 2,
    maxSlope: 55,
    scaleMin: 0.8,
    scaleMax: 1.2,
    rootBurial: 0.1
  };
  const a = generateFoliagePlacements({ scene, species, seed: 42, radius: 18, density: 0.03 });
  const b = generateFoliagePlacements({ scene, species, seed: 42, radius: 18, density: 0.03 });
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  assert.ok(a.every(item => distanceToPaths(scene.objects.filter(object => object.type === 'path'), item.position[0], item.position[2]) >= species.pathExclusion));
  const r1 = seededRandom(4);
  const r2 = seededRandom(4);
  assert.equal(r1(), r2());
  assert.equal(r1(), r2());
});

test('v0.10 world system drives the authoritative scene sun and renderer settings', () => {
  const scene = { settings: {}, objects: [] };
  const world = defaultWorldSettings({ time: { hours: 18.5 } });
  const derived = applyWorldToScene(scene, world);
  assert.ok(scene.objects.some(object => object.properties?.celestialRole === 'sun'));
  assert.ok(scene.settings.environmentV010);
  assert.equal(derived.hour, 18.5);
  assert.match(scene.settings.skyTop, /^#[0-9a-f]{6}$/i);
  assert.match(scene.settings.skyBottom, /^#[0-9a-f]{6}$/i);
  assert.ok(scene.settings.fogFar > scene.settings.fogNear);
  assert.ok(scene.settings.exposure > 0);
});

test('v0.10 support-plane grounding conforms a box to terrain at four corners', () => {
  const object = {
    id: 'box-test',
    type: 'box',
    transform: { position: [4, 10, 3], rotation: [0, 0, 0], scale: [2, 1, 3] },
    properties: {}
  };
  const diagnostics = fitGroundContact({ object, terrain, maxTilt: 30 });
  assert.equal(diagnostics.mode, 'support-plane');
  assert.equal(diagnostics.supportPoints.length, 4);
  assert.ok(Number.isFinite(object.transform.position[1]));
  assert.ok(Math.abs(object.transform.rotation[0]) <= 30);
  assert.ok(Math.abs(object.transform.rotation[2]) <= 30);
  assert.ok(Number.isFinite(diagnostics.terrainSlopeDegrees));
});

test('v0.10 foliage uses root-socket grounding and vehicles remain upright', () => {
  const tree = {
    id: 'tree-test',
    type: 'model',
    transform: { position: [2, 8, 2], rotation: [0, 15, 0], scale: [1, 1, 1] },
    properties: { rootBurial: 0.15 }
  };
  const treeAsset = { category: 'foliage', bounds: { min: [-1, 0, -1], max: [1, 6, 1], size: [2, 6, 2], center: [0, 3, 0] } };
  assert.equal(fitGroundContact({ object: tree, asset: treeAsset, terrain }).mode, 'root-socket');
  assert.equal(tree.transform.rotation[0], 0);
  assert.equal(tree.transform.rotation[2], 0);

  const vehicle = {
    id: 'vehicle-test',
    type: 'model',
    transform: { position: [-3, 8, -2], rotation: [0, 20, 0], scale: [1, 1, 1] },
    properties: {}
  };
  const vehicleAsset = { category: 'vehicle', bounds: { min: [-2, -0.5, -4], max: [2, 2, 4], size: [4, 2.5, 8], center: [0, 0.75, 0] } };
  assert.equal(fitGroundContact({ object: vehicle, asset: vehicleAsset, terrain }).mode, 'wheel-contact');
  assert.equal(vehicle.transform.rotation[0], 0);
  assert.equal(vehicle.transform.rotation[2], 0);
});

test('v0.10 cyclic glTF hierarchy fails safely without recursive stack overflow', () => {
  const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniforge-cyclic-gltf-'));
  try {
    const gltf = {
      asset: { version: '2.0', generator: 'OmniForge cycle-safety fixture' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'Cycle A', children: [1] }, { name: 'Cycle B', children: [0] }],
      meshes: []
    };
    const dataUrl = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`;
    const asset = importModelAsset({
      assetRoot,
      name: 'Cyclic hierarchy fixture',
      fileName: 'cyclic.gltf',
      dataUrl,
      category: 'static-prop'
    });
    assert.equal(asset.health.state, 'failed');
    const errorText = asset.health.blocking.join(' ');
    assert.match(errorText, /cycle|safety budget|hierarchy/i);
    assert.doesNotMatch(errorText, /Maximum call stack size exceeded/i);
    assert.ok(fs.existsSync(path.join(assetRoot, 'models', asset.id, 'source', 'original.gltf')));
  } finally {
    fs.rmSync(assetRoot, { recursive: true, force: true });
  }
});

test('v0.10 desktop package, UI, and MCP share the connected authorities', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'BUILD_DESKTOP_WINDOWS.ps1'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
  const mcp = fs.readFileSync(path.join(ROOT, 'bridge', 'mcp-server.mjs'), 'utf8');
  const mcpTools = fs.readFileSync(path.join(ROOT, 'bridge', 'v010-tools.mjs'), 'utf8');
  assert.match(builder, /'desktop','workers','assets'/);
  assert.match(html, /v010\.css/);
  assert.match(html, /v010\.js/);
  assert.match(mcp, /v010Tools, callV010Tool/);
  assert.match(mcp, /callV010Tool\(name,args\)/);
  for (const name of [
    'omniforge_get_world_systems',
    'omniforge_update_world_systems',
    'omniforge_create_foliage_species',
    'omniforge_preview_foliage_region',
    'omniforge_commit_foliage_preview',
    'omniforge_cancel_foliage_preview',
    'omniforge_get_model_asset_usages',
    'omniforge_archive_model_import',
    'omniforge_restore_model_import',
    'omniforge_delete_model_import'
  ]) assert.match(mcpTools, new RegExp(name));
});

test('v0.10 bootstrap serves world systems and upgrades the existing Ground command', async () => {
  const port = await freePort();
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'omniforge-v010-runtime-'));
  const child = spawn(process.execPath, ['server/v010-bootstrap.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      OMNIFORGE_DATA_ROOT: runtime,
      OMNIFORGE_PORT: String(port),
      OMNIFORGE_SESSION_TOKEN: 'v010-integration-test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    const health = await waitForHealth(port);
    assert.equal(health.version, '0.10.0');

    const initial = await requestJson(port, '/api/v010/world');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.world.schemaVersion, 1);
    assert.ok(initial.body.scene.settings.environmentV010);

    const updated = await requestJson(port, '/api/v010/world', {
      method: 'PATCH',
      body: JSON.stringify({
        time: { hours: 19.25, timeScale: 120 },
        atmosphere: { visibilityKm: 70, rayleigh: 1.3, mie: 0.2 },
        weather: { preset: 'fog', fog: 0.4 }
      })
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.world.time.hours, 19.25);
    assert.equal(updated.body.world.weather.preset, 'fog');
    assert.ok(updated.body.derived.night > 0);

    const state = await requestJson(port, '/api/state');
    const groundable = state.body.scenes
      .find(scene => scene.id === state.body.activeSceneId)
      .objects.find(object => ['box', 'sphere', 'cylinder'].includes(object.type));
    assert.ok(groundable);
    const grounded = await requestJson(port, '/api/object/ground', {
      method: 'POST',
      body: JSON.stringify({ objectId: groundable.id, maxTilt: 30 })
    });
    assert.equal(grounded.status, 200);
    assert.equal(grounded.body.diagnostics.supportPoints.length, 4);
    assert.ok(['support-plane', 'foundation', 'wheel-contact', 'root-socket'].includes(grounded.body.diagnostics.mode));

    const persisted = JSON.parse(fs.readFileSync(path.join(runtime, 'data', 'engine-state.json'), 'utf8'));
    assert.equal(persisted.worldV010.time.hours, 19.25);
    assert.equal(persisted.worldV010.atmosphere.visibilityKm, 70);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
    fs.rmSync(runtime, { recursive: true, force: true });
  }
  assert.equal(stderr, '', stderr);
});
