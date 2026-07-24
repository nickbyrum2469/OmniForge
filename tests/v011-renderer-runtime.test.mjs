import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainMesh } from '../app/renderer.js';
import { normalizeTerrainProperties } from '../app/worldgen.js';

function finiteArray(values, label) {
  assert.ok(values.length > 0, `${label} should not be empty`);
  for (const value of values) assert.ok(Number.isFinite(value), `${label} contained a non-finite value`);
}

test('v0.11 renderer constructs a finite terrain mesh without missing runtime helpers', () => {
  const terrain = {
    id: 'terrain-runtime-test',
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: normalizeTerrainProperties({
      preset: 'mountainValley',
      bounds: { minX: -48, maxX: 80, minZ: -32, maxZ: 64 },
      resolutionX: 24,
      resolutionZ: 18,
      height: 22,
      macroScale: 90,
      detailScale: 18,
      seed: 27
    }, { position: [0, 0, 0], scale: [1, 1, 1] })
  };

  const mesh = terrainMesh(terrain, []);
  const expectedVertices = (24 + 1) * (18 + 1);
  assert.equal(mesh.positions.length, expectedVertices * 3);
  assert.equal(mesh.normals.length, expectedVertices * 3);
  assert.equal(mesh.uvs.length, expectedVertices * 2);
  assert.equal(mesh.blends.length, expectedVertices);
  assert.equal(mesh.indices.length, 24 * 18 * 6);
  finiteArray(mesh.positions, 'positions');
  finiteArray(mesh.normals, 'normals');
  finiteArray(mesh.uvs, 'uvs');
  finiteArray(mesh.blends, 'blends');
  finiteArray(mesh.indices, 'indices');
});
