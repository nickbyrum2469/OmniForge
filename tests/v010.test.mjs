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

test('v0.10 embedded glTF texture is extracted and linked to authored UV material', () => {
  const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniforge-textured-gltf-'));
  try {
    const geometry = Buffer.alloc(66);
    const positions = new Float32Array(geometry.buffer, geometry.byteOffset, 9);
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uvs = new Float32Array(geometry.buffer, geometry.byteOffset + 36, 6);
    uvs.set([0, 0, 1, 0, 0, 1]);
    const indices = new Uint16Array(geometry.buffer, geometry.byteOffset + 60, 3);
    indices.set([0, 1, 2]);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=';
    const gltf = {
      asset: { version: '2.0', generator: 'OmniForge embedded texture fixture' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      buffers: [{ byteLength: geometry.length, uri: 'data:application/octet-stream;base64,' + geometry.toString('base64') }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 24 },
        { buffer: 0, byteOffset: 60, byteLength: 6 }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
        { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' }
      ],
      images: [{ name: 'Pixel', uri: 'data:image/png;base64,' + png }],
      textures: [{ source: 0 }],
      materials: [{ name: 'Textured material', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.7 } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }]
    };
    const dataUrl = 'data:model/gltf+json;base64,' + Buffer.from(JSON.stringify(gltf)).toString('base64');
    const asset = importModelAsset({ assetRoot, name: 'Textured triangle', fileName: 'textured.gltf', dataUrl, category: 'static-prop' });
    assert.notEqual(asset.health.state, 'failed');
    assert.equal(asset.canonicalImporterVersion, 3);
    assert.equal(asset.textures.length, 1);
    assert.match(asset.textures[0].url, /canonical\/textures\/image-000\.png$/);
    assert.ok(fs.existsSync(path.join(assetRoot, 'models', asset.id, 'canonical', 'textures', 'image-000.png')));
    const mesh = JSON.parse(fs.readFileSync(path.join(assetRoot, 'models', asset.id, 'canonical', 'mesh.json'), 'utf8'));
    assert.match(mesh.groups[0].material.textureUrls.baseColor, /image-000\.png$/);
    assert.equal(mesh.groups[0].material.authoredUvSet, 0);
    const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
    assert.match(renderer, /uIsTerrain>.5\?vWorld\.xz\/max\(uBaseTextureScale,0\.05\):vUV/);
    assert.match(renderer, /textureFromUrl\(material\.textureUrls\?\.baseColor,false\)/);
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

test('v0.10 atmosphere controls affect lighting weather surfaces and optimized foliage rendering', () => {
  const scene = { settings: {}, objects: [] };
  const world = defaultWorldSettings({
    time: { hours: 23 },
    clouds: { coverage: 0.85, density: 0.9, shadowStrength: 0.6 },
    weather: { preset: 'storm', fog: 0.35, windStrength: 0.8 },
    sky: { starIntensity: 1.4, milkyWayIntensity: 0.8, auroraIntensity: 0.5 }
  });
  const result = applyWorldToScene(scene, world);
  const sun = scene.objects.find(object => object.properties?.celestialRole === 'sun');
  assert.ok(result.night > 0.5);
  assert.ok(scene.settings.cloudAttenuation < 1);
  assert.ok(scene.settings.weatherWetness > 0.5);
  assert.ok(scene.settings.windStrength >= 0.8);
  assert.ok(scene.settings.starIntensity >= 0);
  assert.ok(sun.properties.intensity < world.lighting.sunIntensity);
  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  const worldCss = fs.readFileSync(path.join(ROOT, 'app', 'v010.css'), 'utf8');
  assert.match(renderer, /drawElementsInstanced/);
  assert.match(renderer, /vertexAttribDivisor/);
  assert.match(renderer, /uFoliageWindStrength/);
  assert.match(renderer, /foliageGroups\(scene,camera\)/);
  assert.match(worldUi, /applyViewportEnvironment/);
  assert.match(worldCss, /v010-cloud-drift/);
  assert.match(worldCss, /--v010-stars/);
});

test('v0.10 existing Ground button and World tab synchronize through authoritative state', () => {
  const editor = fs.readFileSync(path.join(ROOT, 'app', 'app.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  assert.match(editor, /api\('\/api\/object\/ground',\{method:'POST'/);
  assert.match(editor, /applyState\(payload\.state,\{forceSelection:true\}\)/);
  assert.match(editor, /omniforge:apply-state/);
  assert.doesNotMatch(editor, /bottomOffset=asset\?\.bounds\?\.min/);
  assert.match(worldUi, /synchronizeAuthoritativeEditor/);
  assert.match(worldUi, /CustomEvent\('omniforge:apply-state'/);
});

test('v0.10 bootstrap serves world systems and upgrades the existing Ground command', async () => {
  const port = await freePort();
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'omniforge-v010-runtime-'));
  const child = spawn(process.execPath, ['server/v011-bootstrap.mjs'], {
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
    assert.equal(health.version, '0.11.0');

    const stateBeforeReadOnlyQueries = await requestJson(port, '/api/state');
    const initial = await requestJson(port, '/api/v010/world');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.world.schemaVersion, 1);
    assert.ok(initial.body.scene.settings.environmentV010);
    const worldgen = await requestJson(port, '/api/v011/worldgen');
    assert.equal(worldgen.status, 200);
    assert.ok(worldgen.body.foundation);
    assert.equal(Object.prototype.hasOwnProperty.call(worldgen.body, 'state'), false);
    const stateAfterReadOnlyQueries = await requestJson(port, '/api/state');
    assert.equal(stateAfterReadOnlyQueries.body.engine.revision, stateBeforeReadOnlyQueries.body.engine.revision);

    const compactStep = await requestJson(port, '/api/v010/world/step', {
      method: 'POST',
      body: JSON.stringify({ seconds: 2 })
    });
    assert.equal(compactStep.status, 200);
    assert.ok(compactStep.body.runtime.sceneId);
    assert.ok(compactStep.body.runtime.settings);
    assert.equal(Object.prototype.hasOwnProperty.call(compactStep.body, 'state'), false);

    const compatibleFullStep = await requestJson(port, '/api/v010/world/step?full=1', {
      method: 'POST',
      body: JSON.stringify({ seconds: 2 })
    });
    assert.equal(compatibleFullStep.status, 200);
    assert.ok(compatibleFullStep.body.state?.engine);

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
