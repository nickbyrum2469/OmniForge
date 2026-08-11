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
  bridgeStyle = 'auto',
  terrainHeightAt = baseHeight,
  surfaceDetailProfile = undefined
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
      structureProfile: { bridgeStyle },
      ...(surfaceDetailProfile ? { surfaceDetailProfile } : {})
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const terrainModifier = compilePathTerrainModifier(compiled, { baseHeightAt: terrainHeightAt, chunkSize: 16 });
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

  const positionsForRole = role => {
    const result = [];
    for (let index = 0; index < mesh.roles.length; index += 1) {
      if (mesh.roles[index] !== role) continue;
      result.push(Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
    }
    return result;
  };
  const undersidePositions = positionsForRole('bridge-concrete-deck-underside');
  const leftEdgePositions = positionsForRole('bridge-concrete-deck-left-edge');
  const rightEdgePositions = positionsForRole('bridge-concrete-deck-right-edge');
  const undersideLateral = undersidePositions.map(point => point[2]);
  assert.ok(Math.min(...undersideLateral) < -4.4, 'underside must reach one outer deck edge');
  assert.ok(Math.max(...undersideLateral) > 4.4, 'underside must reach the other outer deck edge');
  assert.ok(leftEdgePositions.length > 0 && rightEdgePositions.length > 0);
  const leftMean = leftEdgePositions.reduce((sum, point) => sum + point[2], 0) / leftEdgePositions.length;
  const rightMean = rightEdgePositions.reduce((sum, point) => sum + point[2], 0) / rightEdgePositions.length;
  assert.ok(Math.abs(leftMean - rightMean) > 8.8, 'outer walls must remain on opposite deck edges');
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

test('both bridge portals contain exact threshold and apron topology', () => {
  const span = 44;
  const { geometry } = build('bridge', {
    startY: 8,
    endY: 8,
    span,
    width: 9,
    bridgeStyle: 'steel-girder'
  });
  const mesh = geometry.meshes.structure;
  const positionsForRole = predicate => {
    const positions = [];
    for (let index = 0; index < mesh.roles.length; index += 1) {
      if (!predicate(mesh.roles[index])) continue;
      positions.push(Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
    }
    return positions;
  };
  const thresholds = positionsForRole(role => role === 'bridge-steel-expansion-joint-deck-top');
  const aprons = positionsForRole(role => role === 'bridge-concrete-deck-portal-apron-deck-top');
  const deckSeams = positionsForRole(role => role === 'bridge-concrete-deck-top');
  assert.ok(thresholds.length > 0, 'a deliberate steel threshold must replace an abrupt dirt/deck material cut');
  assert.ok(aprons.length > 0, 'the structural deck must contain a bounded portal apron');
  assert.ok(deckSeams.some(point => Math.abs(point[0]) <= 0.001), 'start portal must preserve the exact shared deck boundary');
  assert.ok(deckSeams.some(point => Math.abs(point[0] - span) <= 0.001), 'end portal must preserve the exact shared deck boundary');
  assert.ok(
    thresholds.some(point => point[0] > 0.001 && point[0] < 1.1),
    'start portal threshold band is missing immediately inside the shared boundary'
  );
  assert.ok(
    thresholds.some(point => point[0] < span - 0.001 && point[0] > span - 1.1),
    'end portal threshold band is missing immediately inside the shared boundary'
  );
  assert.ok(aprons.some(point => point[0] < 5), 'start portal apron is missing');
  assert.ok(aprons.some(point => point[0] > span - 5), 'end portal apron is missing');
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
});

test('abutment foundations conform independently across an asymmetric slope', () => {
  const crossSlope = (x, z) => (
    (z < 0 ? -4.5 : 2.25)
    + Math.sin(x * 0.05) * 0.18
    + z * 0.025
  );
  const span = 44;
  const { geometry } = build('bridge', {
    startY: 9,
    endY: 9,
    span,
    width: 9,
    bridgeStyle: 'steel-girder',
    terrainHeightAt: crossSlope
  });
  const mesh = geometry.meshes.structure;
  const footing = [];
  const backwall = [];
  const wingwall = [];
  for (let index = 0; index < mesh.roles.length; index += 1) {
    const point = Array.from(mesh.positions.slice(index * 3, index * 3 + 3));
    if (mesh.roles[index] === 'bridge-concrete-abutment-footing') footing.push(point);
    if (mesh.roles[index] === 'bridge-concrete-abutment-backwall') backwall.push(point);
    if (mesh.roles[index] === 'bridge-concrete-abutment-wingwall') wingwall.push(point);
  }
  assert.ok(footing.length > 0 && backwall.length > 0 && wingwall.length > 0);
  const portalGroups = [
    footing.filter(point => point[0] < 5),
    footing.filter(point => point[0] > span - 5)
  ];
  for (const portal of portalGroups) {
    const lowSide = portal.filter(point => point[2] < -0.5);
    const highSide = portal.filter(point => point[2] > 0.5);
    assert.ok(lowSide.length > 0 && highSide.length > 0, 'both cross-slope sides need independent footing cells');
    const highest = points => Math.max(...points.map(point => point[1]));
    assert.ok(
      highest(highSide) - highest(lowSide) > 5,
      'footing tops must follow each side of the terrain instead of one shared minimum elevation'
    );
  }
  const contactVertices = [...footing, ...backwall, ...wingwall];
  assert.ok(contactVertices.every(point => point.every(Number.isFinite)));
  assert.ok(contactVertices.every(point => point[0] >= -5 && point[0] <= span + 5));
  assert.ok(contactVertices.every(point => Math.abs(point[2]) <= 10));
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  assert.equal(geometry.validation.meshes.structure.degenerateTriangles, 0);
});

test('bridge core filters dirt displacement while portal aprons retain authored road detail', () => {
  const { geometry } = build('bridge', {
    startY: 8,
    endY: 8,
    span: 44,
    width: 9,
    bridgeStyle: 'steel-girder',
    surfaceDetailProfile: {
      profileId: 'custom',
      puddleCoverage: 0.4,
      puddleDepth: 0.08,
      wheelRutStrength: 0.9,
      hoofPrintDensity: 0.7,
      bootPrintDensity: 0.65,
      erosionStrength: 0.8,
      detailNormalStrength: 1.2
    }
  });
  const mesh = geometry.meshes.structure;
  const detailAt = (index, component) => {
    const stream = [mesh.surfaceDetail0, mesh.surfaceDetail1, mesh.surfaceDetail2, mesh.surfaceDetail3][Math.floor(component / 4)];
    return stream[index * 4 + component % 4];
  };
  const apronIndex = mesh.roles.findIndex(role => role === 'bridge-concrete-deck-portal-apron-deck-top');
  const coreIndex = mesh.roles.findIndex((role, index) => (
    role === 'bridge-concrete-deck-top'
    && mesh.positions[index * 3] > 18
    && mesh.positions[index * 3] < 26
  ));
  assert.ok(apronIndex >= 0 && coreIndex >= 0);
  assert.ok(detailAt(apronIndex, 5) > 0.8, 'portal apron should preserve the approaching road rut payload');
  assert.equal(detailAt(coreIndex, 5), 0, 'structural deck must not deform into dirt wheel ruts');
  assert.equal(detailAt(coreIndex, 8), 0, 'structural deck must not stamp hoof depressions');
  assert.equal(detailAt(coreIndex, 10), 0, 'structural deck must not stamp boot depressions');
  assert.ok(detailAt(coreIndex, 2) <= 0.012 + 1e-6, 'deck puddling must stay structurally bounded');
  assert.ok(detailAt(coreIndex, 12) <= 0.012 + 1e-6, 'deck erosion must stay structurally bounded');
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
  const positionsForRoleAtX = (mesh, roleMatches, x) => {
    const result = new Set();
    for (let index = 0; index < mesh.roles.length; index += 1) {
      if (!roleMatches(mesh.roles[index])) continue;
      const point = Array.from(mesh.positions.slice(index * 3, index * 3 + 3));
      if (Math.abs(point[0] - x) > 0.001) continue;
      result.add(point.map(value => value.toFixed(5)).join(':'));
    }
    return result;
  };
  for (const boundary of [bridge.startDistance, bridge.endDistance]) {
    const roadBoundary = positionsForRoleAtX(geometry.meshes.road, role => role === 'road-core', boundary);
    const deckBoundary = positionsForRoleAtX(geometry.meshes.structure, role => role.endsWith('-deck-top'), boundary);
    assert.ok(roadBoundary.size >= 3, 'road boundary must include left, crown, and right vertices');
    assert.deepEqual(deckBoundary, roadBoundary, 'bridge deck must share the exact crowned road boundary');
  }
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
  assert.equal(geometry.guides.blockedCorridors.length, 1);
  const blockedGuide = geometry.guides.blockedCorridors[0];
  assert.equal(blockedGuide.segmentId, 'blocked');
  assert.equal(blockedGuide.reason, 'test-blocked-branch');
  assert.equal(blockedGuide.role, 'editor-blocked-corridor');
  assert.ok(blockedGuide.boundaries.length > 0);
  assert.ok(blockedGuide.hatches.length > 0);
  assert.equal(blockedGuide.endCaps.length, 12);
  assert.ok([
    ...blockedGuide.boundaries,
    ...blockedGuide.hatches,
    ...blockedGuide.endCaps
  ].every(Number.isFinite));
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
