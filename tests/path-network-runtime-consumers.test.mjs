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
import { normalizePathNetwork } from '../app/path-network/model.js';

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
  assert.strictEqual(consumers.navigation.surfaceMesh, runtime.geometry.navigationMeshes.surface);
  assert.notStrictEqual(consumers.render.road, consumers.navigation.surfaceMesh);
  assert.equal(Object.values(consumers.render).includes(consumers.navigation.surfaceMesh), false);
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
  assert.equal(pathFoliageExcluded(consumers, 0, 8), false);
  assert.equal(pathFoliageExcluded(consumers, 0, 8, 2), true);
  assert.equal(
    pathFoliageExcluded(consumers, 15.9, 8, 2),
    true,
    'padding must remain authoritative across neighboring path chunks'
  );
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

test('live terrain mesh consumes v2 heights while compiled surfaces own path material', () => {
  const scene = sceneFixture();
  const runtimes = compileScenePathRuntimes(scene);
  const mesh = terrainMesh(scene.objects[0], [scene.objects[1]], runtimes);
  let centerIndex = -1;
  let centerDistance = Infinity;
  const edgeHeights = new Map();
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    const distance = Math.hypot(x, z);
    if (distance < centerDistance) {
      centerDistance = distance;
      centerIndex = index;
    }
    const key = `${x.toFixed(5)}:${z.toFixed(5)}`;
    const values = edgeHeights.get(key) || [];
    values.push(y);
    edgeHeights.set(key, values);
  }
  assert.ok(centerDistance < 0.01);
  assert.ok(mesh.positions[centerIndex * 3 + 1] > 1.9);
  assert.equal(mesh.blends[centerIndex], 0);
  assert.equal(mesh.positions.every(Number.isFinite), true);
  assert.equal(terrainMesh.lastPathDetail.strategy, 'watertight-chunks');
  assert.ok(terrainMesh.lastPathDetail.highTileCount > 0);
  assert.ok(terrainMesh.lastPathDetail.transitionTileCount > 0);
  assert.ok(terrainMesh.lastPathDetail.targetSpacing <= 0.625);
  assert.ok(terrainMesh.lastPathDetail.transitionSpacing <= 2);
  assert.ok(mesh.positions.length > (64 + 1) * (64 + 1) * 3);
  for (const values of edgeHeights.values()) {
    if (values.length < 2) continue;
    assert.ok(Math.max(...values) - Math.min(...values) <= 0.005);
  }
  let modifiedVertexCount = 0;
  let ownedSurfaceVertexCount = 0;
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    const sample = sampleScenePathTerrain(runtimes, 0, x, z);
    assert.equal(mesh.blends[index], 0, 'terrain underlay must not paint a duplicate path surface');
    if (!sample.terrainApplied || Math.abs(y) <= 0.001) continue;
    modifiedVertexCount += 1;
    if (sample.zone === 'road' || sample.zone === 'shoulder') {
      ownedSurfaceVertexCount += 1;
      assert.ok(Math.abs(z) < 4.2);
    }
  }
  assert.ok(modifiedVertexCount > 25);
  assert.ok(ownedSurfaceVertexCount > 25);
});

test('city street consumers share gutter, curb, sidewalk, navigation, and foliage authority', () => {
  const scene = sceneFixture();
  scene.objects[1].properties.pathNetwork = normalizePathNetwork({
    id: 'city-street-consumers',
    nodes: [
      { id: 'a', position: [-20, 2, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 2, 0], heightMode: 'absolute' }
    ],
    defaults: { crossSectionProfile: { profileId: 'city-local-street' } },
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'cut-fill',
      constructionLocked: true
    }]
  });
  const [runtime] = compileScenePathRuntimes(scene);
  const consumers = connectPathRuntimeConsumers(runtime);

  assert.strictEqual(consumers.render.gutter, consumers.collision.gutterMesh);
  assert.strictEqual(consumers.render.curb, consumers.collision.curbMesh);
  assert.strictEqual(consumers.render.sidewalk, consumers.collision.sidewalkMesh);
  assert.strictEqual(consumers.render.sidewalkEdge, consumers.collision.sidewalkEdgeMesh);
  assert.strictEqual(consumers.render.sidewalk, consumers.navigation.sidewalkMesh);
  assert.equal(consumers.navigation.sidewalkEdgeMesh, undefined);
  assert.equal(consumers.navigation.sidewalkMesh.roles.some(role => role.includes('edge')), false);
  assert.ok(consumers.collision.sidewalkEdgeMesh.roles.some(role => role.includes('sidewalk-edge')));
  assert.equal(pathFoliageExcluded(consumers, 0, 4.5), true);
  assert.equal(pathFoliageExcluded(consumers, 0, 20), false);
  assert.equal(pathGroundingSample(consumers, 0, 4.5).zone, 'sidewalk');
  assert.equal(pathGroundingSample(consumers, 0, 4.5).source, 'path-surface');
});
