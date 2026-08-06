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

function cityIntersectionNetwork(armCount = 3) {
  const nodes = [
    { id: 'center', position: [0, 0, 0], heightMode: 'absolute' },
    { id: 'west', position: [-30, 0, 0], heightMode: 'absolute' },
    { id: 'east', position: [30, 0, 0], heightMode: 'absolute' },
    { id: 'north', position: [0, 0, 30], heightMode: 'absolute' }
  ];
  const segments = [
    { id: 'west-center', fromNode: 'west', toNode: 'center' },
    { id: 'center-east', fromNode: 'center', toNode: 'east' },
    { id: 'center-north', fromNode: 'center', toNode: 'north' }
  ];
  if (armCount === 4) {
    nodes.push({ id: 'south', position: [0, 0, -30], heightMode: 'absolute' });
    segments.push({ id: 'south-center', fromNode: 'south', toNode: 'center' });
  }
  return {
    id: `city-junction-${armCount}`,
    defaults: { crossSectionProfile: { profileId: 'city-local-street' } },
    nodes,
    segments
  };
}

function vertexNormalsForRole(mesh, role) {
  const result = [];
  for (let index = 0; index < mesh.roles.length; index += 1) {
    if (mesh.roles[index] !== role) continue;
    result.push(Array.from(mesh.normals.slice(index * 3, index * 3 + 3)));
  }
  return result;
}

function vertexPositionsForRole(mesh, role) {
  const result = [];
  for (let index = 0; index < mesh.roles.length; index += 1) {
    if (mesh.roles[index] !== role) continue;
    result.push(Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
  }
  return result;
}

function sortedPointKeys(points) {
  return points
    .map(point => point.map(value => Number(value).toFixed(5)).join(':'))
    .sort();
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
    assert.equal(
      geometry.junctions[0].navigationTriangleCount,
      geometry.junctions[0].triangleCount,
      'navigation must reuse the exact validated junction triangulation'
    );
    assert.equal(geometry.junctions[0].navigationError, null);
    assert.ok(geometry.navigationMeshes.surface.roles.includes('navigation-junction'));
    assert.deepEqual(
      sortedPointKeys(vertexPositionsForRole(
        geometry.navigationMeshes.surface,
        'navigation-junction'
      )),
      sortedPointKeys(geometry.junctionAuthority.junctions[0].ring),
      'navigation junction vertices must be the exact shared authority ring'
    );
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

test('city street geometry uses continuous authored gutter, curb, and sidewalk bands', () => {
  const compiled = compile({
    id: 'city-street',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [24, 1.2, 4], heightMode: 'absolute' },
      { id: 'c', position: [50, 1.8, 0], heightMode: 'absolute' }
    ],
    defaults: { crossSectionProfile: { profileId: 'city-local-street' } },
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'bc', fromNode: 'b', toNode: 'c' }
    ]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.ok(geometry.meshes.road.indices.length > 0);
  assert.equal(geometry.meshes.shoulder.indices.length, 0);
  assert.ok(geometry.meshes.gutter.indices.length > 0);
  assert.ok(geometry.meshes.curb.indices.length > 0);
  assert.ok(geometry.meshes.sidewalk.indices.length > 0);
  assert.ok(geometry.meshes.sidewalkEdge.indices.length > 0);
  assert.ok(geometry.meshes.gutter.roles.includes('left-gutter'));
  assert.ok(geometry.meshes.curb.roles.includes('right-curb-face'));
  assert.ok(geometry.meshes.sidewalk.roles.includes('left-sidewalk'));
  assert.equal(geometry.meshes.sidewalk.roles.some(role => role.includes('edge')), false);
  assert.ok(geometry.meshes.sidewalkEdge.roles.includes('left-sidewalk-edge'));
  assert.ok(vertexNormalsForRole(geometry.meshes.sidewalk, 'left-sidewalk').every(normal => normal[1] > 0.9));
  assert.ok(vertexNormalsForRole(geometry.meshes.sidewalkEdge, 'left-sidewalk-edge').every(normal => Math.abs(normal[1]) < 0.1));
});

for (const armCount of [3, 4]) {
  test(`city ${armCount === 3 ? 'T' : 'four-way'} junction stitches every urban surface without a radial patch`, () => {
    const compiled = compile(cityIntersectionNetwork(armCount));
    const geometry = buildPathNetworkGeometry(compiled, { junctionFilletSegments: 5 });
    assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
    assert.equal(geometry.junctions.length, 1);
    assert.equal(geometry.junctions[0].portalCount, armCount);
    assert.equal(geometry.junctions[0].error, null);
    assert.deepEqual(
      geometry.junctions[0].surfaceReports.map(report => report.role),
      [
        'junction-gutter',
        'junction-curb-face',
        'junction-curb-top',
        'junction-sidewalk',
        'junction-sidewalk-edge'
      ]
    );
    assert.ok(geometry.junctions[0].surfaceReports.every(report => !report.error && report.triangleCount > 0));
    assert.ok(geometry.meshes.road.roles.includes('junction'));
    assert.ok(geometry.meshes.gutter.roles.includes('junction-gutter'));
    assert.ok(geometry.meshes.curb.roles.includes('junction-curb-top'));
    assert.ok(geometry.meshes.sidewalk.roles.includes('junction-sidewalk'));
    assert.ok(geometry.meshes.sidewalkEdge.roles.includes('junction-sidewalk-edge'));
    assert.equal(geometry.meshes.shoulder.indices.length, 0);
  });
}

test('asymmetric city sidewalks preserve independent authored widths', () => {
  const compiled = compile({
    id: 'asymmetric-city-street',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [30, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      crossSectionProfile: {
        profileId: 'city-local-street',
        sidewalkLeftWidth: 0.9,
        sidewalkRightWidth: 2.6
      }
    }]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  const zValues = [];
  for (let index = 2; index < geometry.meshes.sidewalk.positions.length; index += 3) {
    zValues.push(geometry.meshes.sidewalk.positions[index]);
  }
  assert.ok(Math.abs(Math.max(...zValues) - 4.93) < 0.001);
  assert.ok(Math.abs(Math.min(...zValues) + 6.63) < 0.001);
});

test('graded cross-sections apply crown and sidewalk elevations in world Y only', () => {
  const compiled = compile({
    id: 'graded-city-street',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [24, 2, 0], heightMode: 'absolute' }
    ],
    defaults: { crossSectionProfile: { profileId: 'city-local-street' } },
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b' }]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  const sample = compiled.segments[0].samples[0];
  const crown = Array.from(geometry.meshes.road.positions.slice(3, 6));
  assert.ok(Math.abs(crown[0] - sample.position[0]) < 1e-6);
  assert.ok(Math.abs(crown[2] - sample.position[2]) < 1e-6);
  assert.ok(Math.abs(crown[1] - sample.position[1] - 0.08) < 1e-6);
});

test('city street dead ends remain capped and are not mistaken for junctions', () => {
  const compiled = compile({
    id: 'city-dead-ends',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 0, 0], heightMode: 'absolute' }
    ],
    defaults: { crossSectionProfile: { profileId: 'city-local-street' } },
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b' }]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.equal(geometry.junctions.length, 0);
  assert.equal(geometry.meshes.road.roles.filter(role => role === 'dead-end-cap').length, 6);
});
