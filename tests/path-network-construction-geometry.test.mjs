import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { buildPathNetworkGeometry } from '../app/path-network/geometry.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';

const baseHeight = (x, z) => Math.sin(x * 0.13) * 1.5 + Math.cos(z * 0.09) * 0.5;

function build(mode, { startY = 4, endY = 4, vehicleClass = 'mixed' } = {}) {
  const network = normalizePathNetwork({
    id: `construction-${mode}`,
    nodes: [
      { id: 'a', position: [0, startY, 0], heightMode: 'absolute' },
      { id: 'b', position: [40, endY, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'route',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: mode,
      constructionLocked: true,
      crossSectionProfile: { width: 5, shoulderWidth: 0.8, blendDistance: 2 },
      gameplayRules: { vehicleClass }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: baseHeight,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const terrainModifier = compilePathTerrainModifier(compiled, { baseHeightAt: baseHeight, chunkSize: 16 });
  return {
    compiled,
    terrainModifier,
    geometry: buildPathNetworkGeometry(compiled, { terrainModifier })
  };
}

test('cut/fill builds explicit earthwork joined to the shared construction boundaries', () => {
  const { terrainModifier, geometry } = build('cut-fill');
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.earthwork.indices.length > 0);
  assert.ok(geometry.meshes.earthwork.roles.includes('left-earthwork'));
  assert.ok(geometry.meshes.earthwork.roles.includes('right-earthwork'));
  for (const vertex of terrainModifier.boundaryVertices.values()) {
    assert.ok(Math.abs(vertex[1] - baseHeight(vertex[0], vertex[2])) <= 0.005);
  }
});

test('retaining-wall mode creates load-bearing side faces instead of unstable fill slopes alone', () => {
  const { geometry } = build('retaining-wall', { startY: 5, endY: 7 });
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.structure.roles.includes('retaining-wall-left'));
  assert.ok(geometry.meshes.structure.roles.includes('retaining-wall-right'));
});

test('bridge mode creates girders and terrain-supported piers while leaving terrain unmodified', () => {
  const { geometry, terrainModifier } = build('bridge', { startY: 8, endY: 8 });
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-left-girder'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-right-girder'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-pier'));
  assert.ok(terrainModifier.entries.every(entry => entry.construction.mode === 'bridge'));
});

test('tunnel mode creates a continuous swept lining from the compiled frames', () => {
  const { geometry } = build('tunnel');
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.structure.roles.includes('tunnel-lining'));
  assert.ok(geometry.meshes.structure.indices.length > 100);
});

test('pedestrian stair mode creates bounded treads and risers instead of a smooth impossible ramp', () => {
  const { geometry } = build('stairs', { startY: 0, endY: 6, vehicleClass: 'pedestrian' });
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.road.roles.includes('stair-tread'));
  assert.ok(geometry.meshes.road.roles.includes('stair-riser'));
  assert.equal(geometry.meshes.road.roles.includes('road-core'), false);
});
