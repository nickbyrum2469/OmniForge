import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePathObjectRuntime, sampleScenePathTerrain } from '../app/path-network/runtime.js';
import { migrateLegacyPathObject } from '../app/path-network/model.js';
import { mergePathNetworksAtSegment, pathNetworkDegrees } from '../app/path-network/transactions.js';
import { compilePathNetwork, nearestCompiledStation } from '../app/path-network/compiler.js';
import { createTerrainQueryService } from '../app/world/terrain-query-service.js';
import { terrainMesh } from '../app/renderer.js';
import {
  connectPathRuntimeConsumers,
  pathFoliageExcluded,
  pathGroundingSample
} from '../app/path-network/consumers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'tests', 'fixtures', 'v012-target-pc-pathway.json'),
  'utf8'
));

function compileFixturePath(pathObject) {
  return compilePathObjectRuntime(structuredClone(pathObject), structuredClone(fixture.terrain), {
    generationRevision: 1,
    quality: 'test'
  });
}

test('target-PC fixture records the exact preserved source-state identity', () => {
  assert.equal(
    fixture.sourceStateSha256,
    '3C3548710AEF8D732E493A2553ED50469182F3E158874A7309C24E101B07B134'
  );
  assert.equal(fixture.sourceProjectId, 'untitled-game');
  assert.equal(fixture.sourceSceneId, 'scene-main');
  assert.deepEqual(fixture.paths.map(item => item.id), [
    'path-main',
    'path-mrzucwx0-175c6e'
  ]);
});

test('legacy non-carving paths migrate into unlocked Civil Assist authority', () => {
  for (const pathObject of fixture.paths) {
    const terrainService = createTerrainQueryService({ terrain: fixture.terrain });
    const migration = migrateLegacyPathObject(pathObject, {
      terrainHeightAt: (x, z) => terrainService.elevationAt(x, z, { view: 'authored-natural' })
    });
    assert.equal(migration.migrated, true);
    assert.ok(migration.network.segments.length > 0);
    assert.ok(migration.network.segments.every(segment => segment.constructionMode === 'auto'));
    assert.ok(migration.network.segments.every(segment => segment.constructionLocked === false));
    assert.equal(migration.network.defaults.crossSectionProfile.width, pathObject.properties.width);
    assert.equal(
      migration.network.defaults.materialProfile.surfaceMaterialId,
      pathObject.properties.materialId
    );
  }
});

test('the exact feasible path compiles into finite validated Civil Assist construction', () => {
  const runtime = compileFixturePath(fixture.paths[0]);
  assert.equal(runtime.migratedFromLegacy, true);
  assert.equal(runtime.diagnostics.valid, true);
  assert.equal(runtime.compiled.diagnostics.invalidSegmentIds.length, 0);
  assert.deepEqual(
    runtime.compiled.segments.map(segment => segment.construction.mode),
    ['conform', 'cut-fill', 'cut-fill']
  );
  assert.deepEqual(
    runtime.compiled.segments.map(segment => segment.constructionIntervals.length),
    [1, 1, 3],
    'sub-metre conform/cut-fill chatter must be absorbed into stable terrain runs'
  );
  assert.ok(runtime.compiled.constructionIntervals.every(interval => (
    interval.endDistance - interval.startDistance >= 3.8
  )));
  assert.equal(
    runtime.compiled.constructionIntervals.some(interval => (
      interval.mode === 'bridge' || interval.mode === 'retaining-wall'
    )),
    false,
    'the terrain-following dirt route must not create bridge piers or retaining walls'
  );
  assert.equal(runtime.geometry.meshes.structure.indices.length, 0);
  assert.equal(runtime.geometry.validation.valid, true);
  for (const mesh of Object.values(runtime.geometry.meshes)) {
    assert.ok([...mesh.positions].every(Number.isFinite));
    assert.ok([...mesh.indices].every(Number.isInteger));
  }
});

test('the exact impossible branch is blocked and cannot alter terrain or become traversable', () => {
  const pathObject = fixture.paths[1];
  const runtime = compileFixturePath(pathObject);
  assert.equal(runtime.migratedFromLegacy, true);
  assert.equal(runtime.diagnostics.valid, false);
  assert.deepEqual(runtime.compiled.diagnostics.invalidSegmentIds, [
    `${pathObject.id}:segment:0`,
    `${pathObject.id}:segment:1`
  ]);
  assert.ok(runtime.compiled.segments.every(segment => segment.construction.mode === 'invalid'));
  assert.ok(runtime.compiled.segments.every(segment => (
    segment.construction.reason === 'unavoidable-grade-exceeds-limit'
  )));
  assert.equal(runtime.geometry.guides.blockedCorridors.length, 2);
  assert.ok(runtime.geometry.guides.blockedCorridors.every(corridor => (
    corridor.boundaries.length > 0
    && corridor.hatches.length > 0
    && corridor.endCaps.length === 12
    && [...corridor.boundaries, ...corridor.hatches, ...corridor.endCaps].every(Number.isFinite)
  )));

  const consumers = connectPathRuntimeConsumers(runtime);
  assert.deepEqual(consumers.collision.segmentIds, []);
  assert.deepEqual(consumers.navigation.segmentIds, []);
  assert.equal(Object.hasOwn(consumers.render, 'blockedCorridors'), false);
  const [pathX, pathZ] = pathObject.properties.points[0];
  assert.equal(pathFoliageExcluded(consumers, pathX, pathZ), false);
  assert.equal(pathGroundingSample(consumers, pathX, pathZ).source, 'terrain');

  const terrainService = createTerrainQueryService({ terrain: fixture.terrain });
  for (const [x, z] of pathObject.properties.points) {
    const baseHeight = terrainService.elevationAt(x, z, { view: 'authored-natural' });
    const sample = sampleScenePathTerrain([runtime], baseHeight, x, z);
    assert.equal(sample.height, baseHeight);
  }
});

test('the exact orphaned branch welds into one bounded junction without self-intersection', () => {
  const terrainService = createTerrainQueryService({ terrain: fixture.terrain });
  const heightAt = (x, z) => terrainService.elevationAt(x, z, { view: 'authored-natural' });
  const normalAt = (x, z) => terrainService.normalAt(x, z, { view: 'authored-natural' });
  const target = migrateLegacyPathObject(structuredClone(fixture.paths[0]), {
    terrainHeightAt: heightAt
  }).network;
  const source = migrateLegacyPathObject(structuredClone(fixture.paths[1]), {
    terrainHeightAt: heightAt
  }).network;
  const compiledTarget = compilePathNetwork(target, {
    terrainHeightAt: heightAt,
    terrainNormalAt: normalAt,
    spacing: 0.35
  });
  const sourceDegrees = pathNetworkDegrees(source);
  const nearest = source.nodes
    .filter(node => sourceDegrees.get(node.id) === 1)
    .map(node => ({ node, station: nearestCompiledStation(compiledTarget, node.position) }))
    .sort((a, b) => a.station.distance - b.station.distance)[0];
  const naturalHeight = heightAt(nearest.station.position[0], nearest.station.position[2]);
  const heightOffset = nearest.station.position[1] - naturalHeight;
  const merged = mergePathNetworksAtSegment(target, source, {
    targetSegmentId: nearest.station.segmentId,
    junctionPosition: nearest.station.position,
    sourceNodeId: nearest.node.id,
    heightMode: Math.abs(heightOffset) <= 0.02 ? 'terrain' : 'offset',
    heightOffset
  });
  const mergedObject = structuredClone(fixture.paths[0]);
  mergedObject.properties.pathNetwork = merged.network;
  mergedObject.properties.pathNetworkSchemaVersion = 2;
  const runtime = compilePathObjectRuntime(mergedObject, structuredClone(fixture.terrain), {
    generationRevision: 2,
    quality: 'test'
  });

  assert.equal(merged.junctionCreated, false);
  assert.equal(pathNetworkDegrees(merged.network).get(merged.junctionNodeId), 2);
  assert.equal(merged.network.nodes.length, target.nodes.length + source.nodes.length - 1);
  assert.equal(merged.network.segments.length, target.segments.length + source.segments.length);
  assert.equal(runtime.geometry.validation.valid, true, runtime.geometry.validation.errors.join(' '));
  assert.equal(runtime.geometry.junctions.length, 0);
});

test('the exact kilometre terrain uses watertight tiered path chunks', () => {
  const runtimes = fixture.paths.map(compileFixturePath);
  const mesh = terrainMesh(structuredClone(fixture.terrain), structuredClone(fixture.paths), runtimes);
  assert.equal(terrainMesh.lastPathDetail.strategy, 'watertight-chunks');
  const expectedTerrainChunks = new Set(runtimes.flatMap(runtime => (
    runtime.terrainModifier.terrainDirtyChunkKeys
  )));
  assert.equal(
    terrainMesh.lastPathDetail.highTileCount,
    expectedTerrainChunks.size,
    'renderer must refine only chunks with compiled terrain authority'
  );
  assert.ok(terrainMesh.lastPathDetail.highTileCount >= 2);
  assert.ok(terrainMesh.lastPathDetail.transitionTileCount > 0);
  assert.ok(terrainMesh.lastPathDetail.targetSpacing <= 0.625);
  assert.ok(terrainMesh.lastPathDetail.transitionSpacing <= 2);
  assert.ok(terrainMesh.lastPathDetail.maximumBoundaryMismatch <= 0.005);
  assert.deepEqual(
    terrainMesh.lastPathDetail.boundaryStitches,
    { vertexCount: 0, triangleCount: 0, maximumWidth: 0 },
    'the renderer must not append a second nearly-coplanar terrain stitch surface'
  );
  assert.ok(terrainMesh.lastPathDetail.surfaceClipping.maskTriangleCount > 0);
  assert.ok(terrainMesh.lastPathDetail.surfaceClipping.clippedTriangleCount > 0);
  assert.ok(
    terrainMesh.lastPathDetail.surfaceClipping.terrainTriangleFastRejectCount
      >= terrainMesh.lastPathDetail.surfaceClipping.inputTriangleCount * 0.95,
    'terrain clipping must reject the untouched kilometre terrain before polygon work'
  );
  assert.ok(
    terrainMesh.lastPathDetail.surfaceClipping.surfaceTriangleBoundsTestCount
      <= terrainMesh.lastPathDetail.surfaceClipping.inputTriangleCount * 3,
    'terrain clipping regressed toward an all-terrain/all-road triangle search'
  );
  assert.ok(
    terrainMesh.lastPathDetail.surfaceClipping.surfaceTriangleIntersectionTestCount
      <= terrainMesh.lastPathDetail.surfaceClipping.inputTriangleCount * 0.2,
    'terrain clipping exceeded the target-PC polygon-intersection operation budget'
  );
  assert.equal(
    terrainMesh.lastPathDetail.surfaceClipping.constructionClassifierQueryCount,
    0,
    'uniform visible construction should not perform per-surface construction searches'
  );
  assert.ok(
    terrainMesh.lastPathDetail.terrainSampling.fastRejectCount
      >= terrainMesh.lastPathDetail.terrainSampling.queryCount * 0.9,
    'fine renderer terrain sampling index did not reject unrelated path entries'
  );
  assert.ok(
    terrainMesh.lastPathDetail.terrainSampling.indexedCellReferenceCount < 1000,
    'target-PC terrain sampling index exceeded its bounded entry-cell budget'
  );
  assert.ok(
    terrainMesh.lastPathDetail.surfaceClipping.outputTriangleCount
      <= terrainMesh.lastPathDetail.surfaceClipping.inputTriangleCount * 1.25,
    'surface ownership clipping exceeded the bounded terrain triangle budget'
  );
  assert.ok(mesh.positions.length / 3 > 50000);
  assert.equal([...mesh.positions].every(Number.isFinite), true);
  assert.equal([...mesh.normals].every(Number.isFinite), true);
  assert.equal([...mesh.indices].every(index => Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3), true);

  const terrainService = createTerrainQueryService({ terrain: fixture.terrain });
  const terrainOrigin = fixture.terrain.transform?.position || [0, 0, 0];
  let modifiedVertexCount = 0;
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3] + Number(terrainOrigin[0] || 0);
    const z = mesh.positions[index * 3 + 2] + Number(terrainOrigin[2] || 0);
    const baseHeight = terrainService.elevationAt(x, z, { view: 'authored-natural' });
    const sample = sampleScenePathTerrain(runtimes, baseHeight, x, z);
    assert.equal(mesh.blends[index], 0, 'compiled road meshes must exclusively own path material');
    if (!sample.terrainApplied || sample.influence <= 0.001) continue;
    modifiedVertexCount += 1;
    assert.ok(x >= -35 && x <= 16, `path material escaped in X at ${x}`);
    assert.ok(z >= -38 && z <= 8, `path material escaped in Z at ${z}`);
  }
  assert.ok(modifiedVertexCount > 25);

  // Dense and transition terrain chunks intentionally duplicate their shared
  // edge vertices. They must describe one surface and one lighting response;
  // the removed overlay-stitch pass is no longer an expected boundary owner.
  const sharedVertices = new Map();
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    const key = `${x.toFixed(5)}:${z.toFixed(5)}`;
    if (!sharedVertices.has(key)) sharedVertices.set(key, []);
    sharedVertices.get(key).push({
      y,
      normal: [mesh.normals[index * 3], mesh.normals[index * 3 + 1], mesh.normals[index * 3 + 2]]
    });
  }
  let sharedBoundaryCount = 0;
  for (const values of sharedVertices.values()) {
    if (values.length < 2) continue;
    sharedBoundaryCount += 1;
    const reference = values[0];
    for (const value of values.slice(1)) {
      assert.ok(Math.abs(value.y - reference.y) <= 0.005, 'shared terrain boundary opened vertically');
      assert.ok(Math.hypot(
        value.normal[0] - reference.normal[0],
        value.normal[1] - reference.normal[1],
        value.normal[2] - reference.normal[2]
      ) <= 1e-6, 'shared terrain boundary retained a lighting seam');
    }
  }
  assert.ok(sharedBoundaryCount > 100, 'fixture must exercise a meaningful number of shared terrain boundaries');
});
