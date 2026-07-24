import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRandom,
  defaultWorldSettings,
  applyWorldToScene,
  fitGroundContact,
  generateFoliagePlacements,
  distanceToPaths
} from '../server/v010-systems.mjs';

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
