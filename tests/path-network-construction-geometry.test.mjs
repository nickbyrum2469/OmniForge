import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { buildPathNetworkGeometry } from '../app/path-network/geometry.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';

const baseHeight = (x, z) => Math.sin(x * 0.13) * 1.5 + Math.cos(z * 0.09) * 0.5;

function build(mode, {
  startY = 4,
  endY = 4,
  span = 40,
  width = 5,
  vehicleClass = 'mixed',
  bridgeStyle = 'auto'
} = {}) {
  const network = normalizePathNetwork({
    id: `construction-${mode}`,
    nodes: [
      { id: 'a', position: [0, startY, 0], heightMode: 'absolute' },
      { id: 'b', position: [span, endY, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'route',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: mode,
      constructionLocked: true,
      crossSectionProfile: { width, shoulderWidth: 0.8, blendDistance: 2 },
      gameplayRules: { vehicleClass },
      structureProfile: { bridgeStyle }
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

test('bridge mode resolves a span-appropriate structural family and leaves terrain unmodified', () => {
  const { geometry, terrainModifier } = build('bridge', { startY: 8, endY: 8 });
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.equal(geometry.bridgeSelections[0].bridgeStyle, 'steel-girder');
  assert.equal(geometry.bridgeSelections[0].supportSpacing, 24);
  assert.ok(geometry.meshes.structure.roles.includes('bridge-steel-main-girder'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-pier-footing'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-pier-column'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-pier-brace'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-pier-cap'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-abutment-backwall'));
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-abutment-wingwall'));
  assert.equal(geometry.meshes.structure.roles.includes('bridge-pier'), false);
  assert.ok(geometry.meshes.structure.groups.some(group => group.material.name === 'bridge-steel'));
  assert.ok(geometry.meshes.structure.groups.some(group => group.material.name === 'bridge-concrete'));
  assert.ok(terrainModifier.entries.every(entry => entry.construction.mode === 'bridge'));
  assert.equal(geometry.meshes.road.roles.includes('road-core'), false);
  assert.equal(geometry.meshes.shoulder.indices.length, 0);
  assert.ok(geometry.meshes.structure.roles.includes('bridge-concrete-deck-top'));
});

test('bridge solids retain outward top, side, and underside winding', () => {
  const { geometry } = build('bridge', {
    startY: 8,
    endY: 8,
    span: 44,
    width: 9,
    bridgeStyle: 'steel-girder'
  });
  const mesh = geometry.meshes.structure;
  const normalsForRole = role => {
    const result = [];
    for (let index = 0; index < mesh.roles.length; index += 1) {
      if (mesh.roles[index] !== role) continue;
      result.push(Array.from(mesh.normals.slice(index * 3, index * 3 + 3)));
    }
    return result;
  };
  const deckTop = normalsForRole('bridge-concrete-deck-top');
  const deckUnderside = normalsForRole('bridge-concrete-deck-underside');
  const girder = normalsForRole('bridge-steel-main-girder');
  assert.ok(deckTop.length > 0);
  assert.ok(deckUnderside.length > 0);
  assert.ok(deckTop.every(normal => normal[1] > 0.9), 'deck top must face upward');
  assert.ok(deckUnderside.every(normal => normal[1] < -0.9), 'deck underside must face downward');
  assert.ok(girder.some(normal => normal[1] > 0.9), 'girder must have a top face');
  assert.ok(girder.some(normal => normal[1] < -0.9), 'girder must have an underside face');
  assert.ok(girder.some(normal => Math.abs(normal[1]) < 0.1), 'girder must have side faces');
});

test('bridge abutments stay bounded around their approach portals', () => {
  const { geometry } = build('bridge', {
    startY: 8,
    endY: 8,
    span: 44,
    width: 9,
    bridgeStyle: 'steel-girder'
  });
  const mesh = geometry.meshes.structure;
  const abutmentVertices = [];
  for (let index = 0; index < mesh.roles.length; index += 1) {
    if (!mesh.roles[index].includes('abutment')) continue;
    abutmentVertices.push(Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
  }
  assert.ok(abutmentVertices.length > 0);
  assert.ok(abutmentVertices.every(point => point.every(Number.isFinite)));
  assert.ok(
    abutmentVertices.every(point => point[0] >= -5 && point[0] <= 49),
    'abutments must remain local to the two bridge portals'
  );
  assert.ok(
    abutmentVertices.every(point => Math.abs(point[2]) <= 12),
    'abutments must not be projected sideways by a sloped road frame'
  );
});

test('mixed bridge intervals give the deck exclusive ownership of the span surface', () => {
  const network = normalizePathNetwork({
    id: 'mixed-bridge-surface-ownership',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [60, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'route',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      crossSectionProfile: { width: 4, shoulderWidth: 0.8, blendDistance: 2 }
    }],
    engineering: {
      bridgeThreshold: 3,
      minimumBridgeRunLength: 8,
      bridgeIntervalPadding: 0,
      maximumBridgeSpan: 40,
      maximumFill: 2,
      maxGradePercent: 20
    }
  });
  const terrainHeightAt = x => x >= 20 && x <= 40 ? -8 : 0;
  const compiled = compilePathNetwork(network, {
    terrainHeightAt,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 1
  });
  const terrainModifier = compilePathTerrainModifier(compiled, {
    baseHeightAt: terrainHeightAt,
    chunkSize: 16
  });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  const bridge = compiled.segments[0].constructionIntervals.find(interval => interval.mode === 'bridge');
  assert.ok(bridge, 'expected an automatic bridge interval over the sustained gap');
  const roadPositions = [];
  for (let index = 0; index < geometry.meshes.road.positions.length; index += 3) {
    if (geometry.meshes.road.roles[index / 3] !== 'road-core') continue;
    roadPositions.push(geometry.meshes.road.positions[index]);
  }
  assert.ok(roadPositions.some(x => x < bridge.startDistance + 0.001));
  assert.ok(roadPositions.some(x => x > bridge.endDistance - 0.001));
  assert.equal(
    roadPositions.some(x => x > bridge.startDistance + 0.001 && x < bridge.endDistance - 0.001),
    false,
    'ordinary road triangles must not remain underneath the bridge deck'
  );
  assert.ok(geometry.meshes.structure.roles.some(role => role.endsWith('-deck-top')));
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
});

test('five bridge families generate distinct production topology and material groups', () => {
  const cases = [
    ['timber-trestle', { span: 14, width: 4 }, 'bridge-timber-trestle-post', 'bridge-timber'],
    ['stone-arch', { span: 22, width: 7 }, 'bridge-stone-arch-ring', 'bridge-masonry'],
    ['steel-girder', { span: 44, width: 9 }, 'bridge-steel-main-girder', 'bridge-steel'],
    ['masonry-causeway', { span: 10, width: 6, startY: 1, endY: 1 }, 'bridge-masonry-sidewall', 'bridge-masonry'],
    ['rope-footbridge', { span: 24, width: 2, vehicleClass: 'pedestrian' }, 'bridge-rope-hanger', 'bridge-rope']
  ];
  for (const [bridgeStyle, options, expectedRole, expectedMaterial] of cases) {
    const { geometry } = build('bridge', { ...options, bridgeStyle });
    assert.equal(geometry.validation.valid, true, `${bridgeStyle}: ${geometry.validation.errors.join(' ')}`);
    assert.equal(geometry.bridgeSelections[0].bridgeStyle, bridgeStyle);
    assert.ok(geometry.meshes.structure.roles.includes(expectedRole), bridgeStyle);
    assert.ok(geometry.meshes.structure.groups.some(group => group.material.name === expectedMaterial), bridgeStyle);
  }
});

test('terrain-following dirt roads never emit bridge supports', () => {
  const rollingHeight = (x, z) => Math.sin(x * 0.08) * 1.25 + Math.cos(z * 0.04) * 0.2;
  const network = normalizePathNetwork({
    id: 'terrain-dirt-road',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'terrain' },
      { id: 'b', position: [60, 0, 0], heightMode: 'terrain' }
    ],
    segments: [{
      id: 'dirt',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      crossSectionProfile: { width: 3, shoulderWidth: 0.6, blendDistance: 2 }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: rollingHeight,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const terrainModifier = compilePathTerrainModifier(compiled, { baseHeightAt: rollingHeight, chunkSize: 16 });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  assert.notEqual(compiled.segments[0].construction.mode, 'bridge');
  assert.equal(geometry.bridgeSelections.length, 0);
  assert.equal(geometry.meshes.structure.roles.some(role => role.startsWith('bridge-')), false);
});

test('an isolated sub-width terrain depression remains earthwork instead of spawning bridge supports', () => {
  const network = normalizePathNetwork({
    id: 'short-depression',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [40, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'dirt',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      crossSectionProfile: { width: 3, shoulderWidth: 0.6, blendDistance: 2 }
    }],
    engineering: {
      bridgeThreshold: 5,
      maximumBridgeSpan: 30,
      maxGradePercent: 20
    }
  });
  const terrainHeightAt = x => x >= 19 && x <= 21 ? -5.1 : 0;
  const compiled = compilePathNetwork(network, {
    terrainHeightAt,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const terrainModifier = compilePathTerrainModifier(compiled, { baseHeightAt: terrainHeightAt, chunkSize: 16 });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  assert.equal(compiled.segments[0].constructionIntervals.some(interval => interval.mode === 'bridge'), false);
  assert.equal(geometry.bridgeSelections.length, 0);
  assert.equal(geometry.meshes.structure.roles.some(role => role.startsWith('bridge-')), false);
});

test('an invalid branch stays in guides without hiding valid connected road geometry', () => {
  const network = normalizePathNetwork({
    id: 'partially-blocked-network',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 0, 0], heightMode: 'absolute' },
      { id: 'c', position: [40, 0, 0], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'valid', fromNode: 'a', toNode: 'b', constructionMode: 'conform', constructionLocked: true },
      { id: 'blocked', fromNode: 'b', toNode: 'c', constructionMode: 'conform', constructionLocked: true }
    ]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const blocked = compiled.segments.find(segment => segment.id === 'blocked');
  blocked.construction = { mode: 'invalid', reason: 'test-blocked-branch' };
  blocked.constructionIntervals = [{
    mode: 'invalid',
    reason: 'test-blocked-branch',
    startDistance: blocked.samples[0].distance,
    endDistance: blocked.samples.at(-1).distance
  }];
  const terrainModifier = compilePathTerrainModifier(compiled, { baseHeightAt: () => 0, chunkSize: 16 });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  const roadX = Array.from(geometry.meshes.road.positions).filter((value, index) => index % 3 === 0);
  const guideX = geometry.guides.center.filter((value, index) => index % 3 === 0);
  assert.ok(geometry.meshes.road.indices.length > 0);
  assert.ok(Math.max(...roadX) <= 20.001);
  assert.ok(Math.max(...guideX) >= 39.999);
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
