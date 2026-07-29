import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePathObjectRuntime, sampleScenePathTerrain } from '../app/path-network/runtime.js';
import { migrateLegacyPathObject } from '../app/path-network/model.js';
import { createTerrainQueryService } from '../app/world/terrain-query-service.js';

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
    ['conform', 'retaining-wall', 'cut-fill']
  );
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
