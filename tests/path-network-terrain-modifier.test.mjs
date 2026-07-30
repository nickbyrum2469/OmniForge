import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import {
  compilePathTerrainModifier,
  pathTerrainHeightAt,
  pathTerrainNormalAt,
  samplePathTerrainModifier
} from '../app/path-network/terrain-modifier.js';

const terrain = (x, z) => x * 0.18 + Math.sin(z * 0.1) * 0.6;
const normal = () => [0, 1, 0];

function modifierFor(constructionMode = 'cut-fill', options = {}) {
  const network = normalizePathNetwork({
    id: `terrain-${constructionMode}`,
    engineering: { maxCutDepth: 4, maxFillDepth: 3 },
    nodes: [
      { id: 'a', position: [0, 3, 0], heightMode: 'absolute' },
      { id: 'b', position: [40, 3, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'road',
      fromNode: 'a',
      toNode: 'b',
      constructionMode,
      constructionLocked: constructionMode !== 'auto',
      crossSectionProfile: {
        width: 6,
        crownHeight: 0.1,
        shoulderWidth: 1,
        shoulderDrop: 0.1,
        ditchDepth: 0.3,
        blendDistance: 3
      }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: terrain,
    terrainNormalAt: normal,
    spacing: 1,
    ...options
  });
  return compilePathTerrainModifier(compiled, { baseHeightAt: terrain, chunkSize: 8 });
}

test('explicit local modifier preserves base terrain exactly outside dirty corridor chunks', () => {
  const modifier = modifierFor();
  const outside = samplePathTerrainModifier(modifier, 20, 30);
  assert.equal(outside.height, terrain(20, 30));
  assert.equal(outside.influence, 0);
  assert.equal(outside.zone, 'terrain');
  assert.equal(outside.materialWeights.terrain, 1);
  assert.ok(modifier.dirtyChunkKeys.length > 1);
  assert.ok(modifier.diagnostics.dirtyChunkCount < 100);
});

test('road, shoulder, ditch, and blend use one signed-distance field', () => {
  const modifier = modifierFor();
  const road = samplePathTerrainModifier(modifier, 20, 0);
  const shoulder = samplePathTerrainModifier(modifier, 20, 3.5);
  const ditch = samplePathTerrainModifier(modifier, 20, 4.5);
  const blend = samplePathTerrainModifier(modifier, 20, 6);
  assert.equal(road.zone, 'road');
  assert.equal(shoulder.zone, 'shoulder');
  assert.equal(ditch.zone, 'ditch');
  assert.equal(blend.zone, 'blend');
  assert.equal(road.materialWeights.road, 1);
  assert.equal(shoulder.materialWeights.shoulder, 1);
  assert.equal(ditch.materialWeights.earthwork, 1);
  assert.ok(blend.materialWeights.terrain > 0);
  assert.ok(blend.materialWeights.earthwork > 0);
  assert.equal(road.height, road.targetHeight);
  assert.notEqual(road.height, road.baseHeight);
});

test('terrain and material influence stop at the compiled segment end caps', () => {
  const modifier = modifierFor();
  const beforeStart = samplePathTerrainModifier(modifier, -12, 0);
  const afterEnd = samplePathTerrainModifier(modifier, 52, 0);
  for (const sample of [beforeStart, afterEnd]) {
    assert.equal(sample.terrainApplied, false);
    assert.equal(sample.influence, 0);
    assert.equal(sample.zone, 'terrain');
    assert.equal(sample.materialWeights.terrain, 1);
    assert.equal(sample.materialWeights.road, 0);
  }
});

test('terrain construction obeys the shared cut and fill limits', () => {
  const modifier = modifierFor();
  for (let x = 0; x <= 40; x += 1) {
    const sample = samplePathTerrainModifier(modifier, x, 0);
    assert.ok(sample.height >= sample.baseHeight - 4 - 1e-6);
    assert.ok(sample.height <= sample.baseHeight + 3 + 1e-6);
  }
});

for (const mode of ['bridge', 'tunnel']) {
  test(`${mode} keeps base terrain untouched while preserving construction classification`, () => {
    const modifier = modifierFor(mode);
    const sample = samplePathTerrainModifier(modifier, 20, 0);
    assert.equal(sample.constructionMode, mode);
    assert.equal(sample.terrainApplied, false);
    assert.equal(sample.influence, 0);
    assert.equal(sample.height, terrain(20, 0));
  });
}

test('outer construction boundary is shared and resolves to unchanged terrain height', () => {
  const modifier = modifierFor();
  assert.ok(modifier.boundaryVertices.size > 4);
  for (const vertex of modifier.boundaryVertices.values()) {
    assert.ok(Math.abs(vertex[1] - terrain(vertex[0], vertex[2])) <= 0.005);
    assert.ok(Math.abs(pathTerrainHeightAt(modifier, vertex[0], vertex[2]) - vertex[1]) <= 0.005);
  }
});

test('modified normal remains finite and normalized', () => {
  const modifier = modifierFor();
  const value = pathTerrainNormalAt(modifier, 20, 2.5);
  assert.ok(value.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...value) - 1) < 1e-6);
});
