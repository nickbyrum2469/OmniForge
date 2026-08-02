import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainQueryService, TERRAIN_VIEWS } from '../app/world/terrain-query-service.js';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';

function terrainFixture() {
  return {
    id: 'terrain-query-fixture',
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'rollingHills',
      seed: 871,
      height: 12,
      bounds: { minX: -128, maxX: 128, minZ: -128, maxZ: 128 },
      resolutionX: 64,
      resolutionZ: 64,
      chunkSize: 32,
      generatedRevision: 7,
      sculptLayers: [{
        id: 'authored-hill',
        mode: 'raise',
        x: 4,
        z: -2,
        radius: 12,
        strength: 3,
        falloff: 0.7
      }]
    }
  };
}

test('terrain views explicitly separate natural, authored, and proposed construction', () => {
  const terrain = terrainFixture();
  const service = createTerrainQueryService({ terrain, tileSize: 32 });
  assert.deepEqual(service.describe().views, TERRAIN_VIEWS);
  const natural = service.elevationAt(4, -2, { view: 'natural' });
  const authored = service.elevationAt(4, -2, { view: 'authored-natural' });
  assert.ok(authored > natural + 2.5);

  const network = normalizePathNetwork({
    id: 'terrain-query-road',
    nodes: [
      { id: 'a', position: [-20, authored + 2, -2], heightMode: 'absolute' },
      { id: 'b', position: [20, authored + 2, -2], heightMode: 'absolute' }
    ],
    segments: [{ id: 'road', fromNode: 'a', toNode: 'b', constructionMode: 'cut-fill', constructionLocked: true }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: (x, z) => service.elevationAt(x, z, { view: 'authored-natural' }),
    terrainNormalAt: (x, z) => service.normalAt(x, z, { view: 'authored-natural' })
  });
  const terrainModifier = compilePathTerrainModifier(compiled, {
    baseHeightAt: (x, z) => service.elevationAt(x, z, { view: 'authored-natural' }),
    chunkSize: 32
  });
  service.setPathRuntimes([{ generationRevision: 9, terrainModifier }]);
  assert.equal(service.elevationAt(4, -2, { view: 'authored-natural' }), authored);
  assert.notEqual(service.elevationAt(4, -2, { view: 'proposed-construction' }), authored);
});

test('neighboring terrain tiles share exact border samples and carry halo data', () => {
  const service = createTerrainQueryService({ terrain: terrainFixture(), tileSize: 32, halo: 2 });
  const west = service.tile(0, 0, { view: 'authored-natural', level: 'local' });
  const east = service.tile(1, 0, { view: 'authored-natural', level: 'local' });
  const resolution = west.rowSize - 1 - west.halo * 2;
  for (let z = 0; z <= resolution; z += 1) {
    const westIndex = (z + west.halo) * west.rowSize + resolution + west.halo;
    const eastIndex = (z + east.halo) * east.rowSize + east.halo;
    assert.equal(west.heights[westIndex], east.heights[eastIndex]);
  }
  assert.equal(west.halo, 2);
  assert.equal(west.rowSize, resolution + 5);
});

test('dirty bounds invalidate only affected tiles and record dirty channels', () => {
  const service = createTerrainQueryService({ terrain: terrainFixture(), tileSize: 32 });
  service.tile(0, 0);
  service.tile(3, 3);
  const affected = service.invalidate(
    { minX: 2, maxX: 12, minZ: 1, maxZ: 14 },
    ['elevation', 'analysis']
  );
  assert.deepEqual(affected, ['0:0']);
  const description = service.describe();
  assert.equal(description.dirtyTiles.length, 1);
  assert.deepEqual(description.dirtyTiles[0].channels, ['analysis', 'elevation']);
});

test('analysis fields are cached, finite, aligned, and view-specific', () => {
  const service = createTerrainQueryService({ terrain: terrainFixture(), tileSize: 32 });
  const first = service.analysisTile(0, 0, { view: 'authored-natural', level: 'medium' });
  const second = service.analysisTile(0, 0, { view: 'authored-natural', level: 'medium' });
  assert.equal(first, second);
  for (const field of Object.values(first.fields)) {
    assert.equal(field.length, first.rowSize ** 2);
    assert.equal(field.every(Number.isFinite), true);
  }
  const sample = service.analysisAt(4, -2, { view: 'authored-natural', level: 'local' });
  assert.ok(sample.slope >= 0 && sample.slope <= 90);
  assert.ok(sample.aspect >= 0 && sample.aspect < 360);
  assert.ok(sample.constructionSuitability >= 0 && sample.constructionSuitability <= 1);
  assert.ok(sample.traversability >= 0 && sample.traversability <= 1);
});
