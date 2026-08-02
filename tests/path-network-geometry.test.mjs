import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import {
  buildPathNetworkGeometry,
  junctionRing,
  validatePathNetworkGeometry
} from '../app/path-network/geometry.js';

const flat = () => 0;
const up = () => [0, 1, 0];

function compile(input, options = {}) {
  return compilePathNetwork(normalizePathNetwork(input), {
    terrainHeightAt: flat,
    terrainNormalAt: up,
    spacing: 0.4,
    ...options
  });
}

function intersectionNetwork(armCount = 3) {
  const nodes = [{ id: 'center', position: [0, 0, 0], heightMode: 'absolute' }];
  const segments = [];
  for (let index = 0; index < armCount; index += 1) {
    const angle = index / armCount * Math.PI * 2;
    const id = `arm-${index}`;
    nodes.push({ id, position: [Math.cos(angle) * 30, 0, Math.sin(angle) * 30], heightMode: 'absolute' });
    segments.push({
      id: `segment-${index}`,
      fromNode: 'center',
      toNode: id,
      crossSectionProfile: { width: 6, shoulderWidth: 1 }
    });
  }
  return { id: `junction-${armCount}`, nodes, segments };
}

test('road core and shoulders follow the same compiled stations without degenerate geometry', () => {
  const compiled = compile({
    id: 'curved-road',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 0, 14], heightMode: 'absolute' },
      { id: 'c', position: [45, 2, 0], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b', crossSectionProfile: { width: 5, shoulderWidth: 1 } },
      { id: 'bc', fromNode: 'b', toNode: 'c', crossSectionProfile: { width: 5, shoulderWidth: 1 } }
    ]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.road.indices.length > 0);
  assert.ok(geometry.meshes.shoulder.indices.length > 0);
  assert.equal(geometry.guides.center.length / 6, compiled.stations.length - compiled.segments.length);
  assert.ok(geometry.meshes.road.roles.includes('dead-end-cap'));
  assert.equal(geometry.meshes.earthwork.indices.length, 0);
});

for (const armCount of [3, 4, 5]) {
  test(`${armCount}-arm junction uses a validated filleted polygon instead of a radial patch`, () => {
    const compiled = compile(intersectionNetwork(armCount));
    const geometry = buildPathNetworkGeometry(compiled, { junctionFilletSegments: 5 });
    assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
    assert.equal(geometry.junctions.length, 1);
    assert.equal(geometry.junctions[0].portalCount, armCount);
    assert.ok(geometry.junctions[0].ringVertexCount >= armCount * 3);
    assert.ok(geometry.junctions[0].triangleCount >= armCount);
    assert.ok(geometry.junctions[0].deviation <= 1e-6);
    assert.equal(geometry.junctions[0].error, null);
  });
}

test('junction sanitation rejects self-intersecting portal arrangements', () => {
  const report = junctionRing(
    { nodeId: 'bad', position: [0, 0, 0] },
    new Map([['bad', [
      { segmentId: 'a', direction: [1, 0, 0], center: [3, 0, 0], left: [3, 0, 5], right: [3, 0, -5], width: 10, crownHeight: 0 },
      { segmentId: 'b', direction: [0.99, 0, 0.01], center: [2, 0, 0], left: [2, 0, -5], right: [2, 0, 5], width: 10, crownHeight: 0 },
      { segmentId: 'c', direction: [-1, 0, 0], center: [-3, 0, 0], left: [-3, 0, -5], right: [-3, 0, 5], width: 10, crownHeight: 0 }
    ]]]),
    { junctionFilletSegments: 3 }
  );
  assert.ok(report.error);
});

test('mesh validation rejects non-finite and degenerate triangles', () => {
  const report = validatePathNetworkGeometry({
    bad: {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, Number.NaN, 0, 0]),
      indices: new Uint32Array([0, 1, 1])
    }
  });
  assert.equal(report.valid, false);
  assert.ok(report.meshes.bad.nonFiniteValues > 0);
  assert.ok(report.meshes.bad.degenerateTriangles > 0);
});
