import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPathRuntimeCache,
  compilePathObjectRuntime,
  compileScenePathRuntimes,
  sampleScenePathTerrain
} from '../app/path-network/runtime.js';
import {
  connectPathRuntimeConsumers,
  pathFoliageExcluded,
  pathGroundingSample
} from '../app/path-network/consumers.js';
import { terrainMesh } from '../app/renderer.js';

function sceneFixture() {
  return {
    settings: { worldChunkSize: 16 },
    objects: [
      {
        id: 'terrain',
        type: 'terrain',
        visible: true,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: {
          preset: 'plains',
          seed: 7,
          height: 0,
          baseHeight: 0,
          bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
          resolutionX: 64,
          resolutionZ: 64,
          chunkSize: 16
        }
      },
      {
        id: 'path',
        type: 'path',
        visible: true,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: {
          points: [[-20, 0], [0, 0], [20, 0]],
          nodeElevations: [2, 2, 2],
          spline: true,
          width: 5,
          shoulderWidth: 1,
          carveTerrain: true
        }
      }
    ]
  };
}

test('one cached runtime bundle owns compile, terrain, geometry, and diagnostics', () => {
  clearPathRuntimeCache();
  const scene = sceneFixture();
  const first = compilePathObjectRuntime(scene.objects[1], scene.objects[0]);
  const second = compilePathObjectRuntime(scene.objects[1], scene.objects[0]);
  assert.strictEqual(first, second);
  assert.strictEqual(first.geometry.sourceNetworkId, first.compiled.sourceNetworkId);
  assert.strictEqual(first.terrainModifier.sourceNetworkId, first.compiled.sourceNetworkId);
  assert.equal(first.diagnostics.valid, true);
  assert.equal(first.migratedFromLegacy, true);
});

test('state replacement reuses unchanged path runtimes and recompiles only the edited network', () => {
  clearPathRuntimeCache();
  const scene = sceneFixture();
  const secondPath = structuredClone(scene.objects[1]);
  secondPath.id = 'path-secondary';
  secondPath.properties.points = [[-20, 12], [0, 12], [20, 12]];
  scene.objects.push(secondPath);
  const first = compileScenePathRuntimes(scene);

  const replacedScene = structuredClone(scene);
  replacedScene.objects.find(object => object.id === 'path').properties.points[1] = [0, 5];
  const second = compileScenePathRuntimes(replacedScene);

  assert.notStrictEqual(second.find(runtime => runtime.pathObjectId === 'path'), first.find(runtime => runtime.pathObjectId === 'path'));
  assert.strictEqual(
    second.find(runtime => runtime.pathObjectId === 'path-secondary'),
    first.find(runtime => runtime.pathObjectId === 'path-secondary')
  );
});

test('custom terrain query services remain isolated unless stable caching is explicitly enabled', () => {
  clearPathRuntimeCache();
  const firstScene = sceneFixture();
  const secondScene = structuredClone(firstScene);
  delete firstScene.objects[1].properties.nodeElevations;
  delete secondScene.objects[1].properties.nodeElevations;
  const first = compilePathObjectRuntime(firstScene.objects[1], firstScene.objects[0], {
    terrainService: {
      elevationAt: () => 2,
      normalAt: () => [0, 1, 0]
    }
  });
  const second = compilePathObjectRuntime(secondScene.objects[1], secondScene.objects[0], {
    terrainService: {
      elevationAt: () => 8,
      normalAt: () => [0, 1, 0]
    }
  });
  assert.notStrictEqual(first, second);
  assert.notEqual(first.compiled.nodes[0].resolvedPosition[1], second.compiled.nodes[0].resolvedPosition[1]);
});

test('renderer, collision, navigation, foliage, grounding, and streaming share one generation', () => {
  const [runtime] = compileScenePathRuntimes(sceneFixture());
  const consumers = connectPathRuntimeConsumers(runtime);
  assert.equal(consumers.generationRevision, runtime.generationRevision);
  assert.strictEqual(consumers.render.road, consumers.collision.roadMesh);
  assert.strictEqual(consumers.render.road, consumers.navigation.surfaceMesh);
  assert.strictEqual(consumers.foliage.dirtyChunkKeys, consumers.streaming.dirtyChunkKeys);
  assert.strictEqual(consumers.foliage.terrainModifier, consumers.grounding.terrainModifier);
  assert.ok(consumers.collision.segmentIds.length > 0);
  assert.ok(consumers.navigation.segmentIds.length > 0);
});

test('foliage exclusion and grounding query the same signed-distance construction field', () => {
  const [runtime] = compileScenePathRuntimes(sceneFixture());
  const consumers = connectPathRuntimeConsumers(runtime);
  assert.equal(pathFoliageExcluded(consumers, 0, 0), true);
  assert.equal(pathFoliageExcluded(consumers, 0, 30), false);
  const path = pathGroundingSample(consumers, 0, 0);
  const terrain = pathGroundingSample(consumers, 0, 30);
  assert.equal(path.source, 'path-surface');
  assert.equal(terrain.source, 'terrain');
  assert.ok(path.height > terrain.height);
});

test('scene terrain sampling resolves overlap from runtime influence without legacy resampling', () => {
  const scene = sceneFixture();
  const runtimes = compileScenePathRuntimes(scene);
  const inside = sampleScenePathTerrain(runtimes, 0, 0, 0);
  const outside = sampleScenePathTerrain(runtimes, 0, 0, 30);
  assert.ok(inside.influence > 0);
  assert.equal(outside.influence, 0);
  assert.equal(outside.height, 0);
});

test('live terrain mesh consumes the v2 modifier bundle and its material field', () => {
  const scene = sceneFixture();
  const runtimes = compileScenePathRuntimes(scene);
  const mesh = terrainMesh(scene.objects[0], [scene.objects[1]], runtimes);
  const rowSize = Number(scene.objects[0].properties.resolutionX) + 1;
  const centerIndex = 32 * rowSize + 32;
  assert.ok(mesh.positions[centerIndex * 3 + 1] > 1.9);
  assert.ok(mesh.blends[centerIndex] > 0.99);
  assert.equal(mesh.positions.every(Number.isFinite), true);
});
