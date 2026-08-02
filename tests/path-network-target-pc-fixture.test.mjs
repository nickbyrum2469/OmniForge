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
  assert.ok(terrainMesh.lastPathDetail.highTileCount >= 3);
  assert.ok(terrainMesh.lastPathDetail.transitionTileCount > 0);
  assert.ok(terrainMesh.lastPathDetail.targetSpacing <= 0.625);
  assert.ok(terrainMesh.lastPathDetail.transitionSpacing <= 2);
  assert.ok(terrainMesh.lastPathDetail.maximumBoundaryMismatch <= 0.005);
  assert.ok(terrainMesh.lastPathDetail.boundaryStitches.vertexCount > 0);
  assert.ok(terrainMesh.lastPathDetail.boundaryStitches.triangleCount > 0);
  assert.ok(terrainMesh.lastPathDetail.boundaryStitches.maximumWidth <= 0.9);
  assert.ok(mesh.positions.length / 3 > 50000);
  assert.equal([...mesh.positions].every(Number.isFinite), true);
  assert.equal([...mesh.normals].every(Number.isFinite), true);
  assert.equal([...mesh.indices].every(index => Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3), true);

  let blendedVertexCount = 0;
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    if (mesh.blends[index] <= 0.001) continue;
    blendedVertexCount += 1;
    const x = mesh.positions[index * 3];
    const z = mesh.positions[index * 3 + 2];
    assert.ok(x >= -35 && x <= 16, `path material escaped in X at ${x}`);
    assert.ok(z >= -38 && z <= 8, `path material escaped in Z at ${z}`);
  }
  assert.ok(blendedVertexCount > 25);

  const boundaryTolerance = 0.005;
  const boundaryCells = new Map();
  const cellKey = point => point.map(value => Math.floor(value / boundaryTolerance)).join(':');
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const point = [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]];
    const key = cellKey(point);
    if (!boundaryCells.has(key)) boundaryCells.set(key, []);
    boundaryCells.get(key).push(point);
  }
  const hasBoundaryVertex = target => {
    const cell = target.map(value => Math.floor(value / boundaryTolerance));
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          const candidates = boundaryCells.get(`${cell[0] + x}:${cell[1] + y}:${cell[2] + z}`) || [];
          if (candidates.some(point => Math.hypot(
            point[0] - target[0],
            point[1] - target[1],
            point[2] - target[2]
          ) <= boundaryTolerance)) return true;
        }
      }
    }
    return false;
  };
  const terrainOrigin = fixture.terrain.transform?.position || [0, 0, 0];
  for (const runtime of runtimes) {
    const activeSegments = new Set(runtime.compiled.segments
      .filter(segment => (
        segment.crossSectionProfile.terrainModificationEnabled !== false
        && !['bridge', 'tunnel', 'invalid'].includes(segment.construction.mode)
      ))
      .map(segment => segment.id));
    for (const section of runtime.terrainModifier.crossSections) {
      if (!activeSegments.has(section.segmentId)) continue;
      for (const vertex of [section.outerLeft, section.outerRight]) {
        const localVertex = vertex.map((value, axis) => Number(value) - Number(terrainOrigin[axis] || 0));
        assert.equal(
          hasBoundaryVertex(localVertex),
          true,
          `compiled construction boundary ${vertex.join(',')} was not stitched into the terrain mesh`
        );
      }
    }
  }
});
