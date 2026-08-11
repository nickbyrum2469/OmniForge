import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { buildPathNetworkGeometry } from '../app/path-network/geometry.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';
import { connectPathRuntimeConsumers } from '../app/path-network/consumers.js';
import {
  pathCrossSectionLayout,
  pathCrossSectionProfile
} from '../app/path-network/cross-section-profiles.js';
import { bridgeCrossSectionState } from '../app/path-network/bridge-profiles.js';
import { PATH_SURFACE_DETAIL_RENDER_LAYOUT } from '../app/path-network/surface-detail-profiles.js';

const EPSILON = 0.001;

function buildAutomaticGap({
  id = 'bridge-transition',
  length = 60,
  gapStart = 24,
  gapEnd = 36,
  gapDepth = 8,
  startY = 0,
  endY = 0,
  crossSectionProfile = { profileId: 'dirt-road', width: 5 },
  bridgeStyle = 'timber-trestle',
  vehicleClass = 'mixed'
} = {}) {
  const network = normalizePathNetwork({
    id,
    nodes: [
      { id: 'a', position: [0, startY, 0], heightMode: 'absolute' },
      { id: 'b', position: [length, endY, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'route',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      crossSectionProfile,
      gameplayRules: { vehicleClass },
      structureProfile: { bridgeStyle }
    }],
    engineering: {
      bridgeThreshold: 3,
      minimumBridgeRunLength: 6,
      bridgeIntervalPadding: 0,
      maximumBridgeSpan: 50,
      maximumFill: 2,
      maxGradePercent: 20
    }
  });
  const gradeHeightAt = x => startY + (endY - startY) * Math.max(0, Math.min(1, x / length));
  const terrainHeightAt = x => gradeHeightAt(x) - (
    x >= gapStart && x <= gapEnd ? gapDepth : 0
  );
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
  assert.ok(bridge, 'fixture must compile a bridge interval over the sustained gap');
  assert.equal(geometry.bridgeSelections.length, 1, 'fixture must resolve one bridge family');
  return { compiled, terrainModifier, geometry, bridge };
}

function pointsForRole(mesh, predicate) {
  const points = [];
  for (let index = 0; index < mesh.roles.length; index += 1) {
    if (!predicate(mesh.roles[index])) continue;
    points.push(Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
  }
  return points;
}

function pointSetAtX(mesh, predicate, x) {
  return new Set(pointsForRole(mesh, predicate)
    .filter(point => Math.abs(point[0] - x) <= EPSILON)
    .map(point => point.map(value => value.toFixed(5)).join(':')));
}

function widthsByX(mesh, role) {
  const rows = new Map();
  for (const point of pointsForRole(mesh, candidate => candidate === role)) {
    const key = point[0].toFixed(5);
    const values = rows.get(key) || [];
    values.push(point[2]);
    rows.set(key, values);
  }
  return [...rows.entries()]
    .map(([x, values]) => ({
      x: Number(x),
      width: Math.max(...values) - Math.min(...values)
    }))
    .sort((a, b) => a.x - b.x);
}

function detailRoadWidthsAtX(mesh, role, x) {
  const result = [];
  for (let index = 0; index < mesh.roles.length; index += 1) {
    if (mesh.roles[index] !== role) continue;
    if (Math.abs(mesh.positions[index * 3] - x) > EPSILON) continue;
    const packedIndex = PATH_SURFACE_DETAIL_RENDER_LAYOUT.roadWidth;
    const streamIndex = Math.floor(packedIndex / 4);
    const component = packedIndex % 4;
    result.push(mesh[`surfaceDetail${streamIndex}`][index * 4 + component]);
  }
  return result;
}

function degenerateTriangleRoles(mesh) {
  const counts = new Map();
  const point = index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3));
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const [a, b, c] = Array.from(mesh.indices.slice(offset, offset + 3));
    const pa = point(a);
    const pb = point(b);
    const pc = point(c);
    const ab = pb.map((value, index) => value - pa[index]);
    const ac = pc.map((value, index) => value - pa[index]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    if (Math.hypot(...cross) >= 1e-8) continue;
    const role = mesh.roles[a] || 'unknown';
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return Object.fromEntries(counts);
}

test('graded bridge intervals share exact crowned boundary sections with both road approaches', () => {
  const { geometry } = buildAutomaticGap({
    id: 'graded-bridge-seams',
    length: 70,
    gapStart: 27,
    gapEnd: 41,
    startY: 2,
    endY: 9,
    bridgeStyle: 'timber-trestle'
  });
  const deckPoints = pointsForRole(
    geometry.meshes.structure,
    role => role.endsWith('-deck-top')
  );
  const deckXs = deckPoints.map(point => point[0]);
  const boundaries = [Math.min(...deckXs), Math.max(...deckXs)];
  for (const boundary of boundaries) {
    const road = pointSetAtX(geometry.meshes.road, role => role === 'road-core', boundary);
    const deck = pointSetAtX(geometry.meshes.structure, role => role.endsWith('-deck-top'), boundary);
    assert.equal(road.size, 3, 'graded road seam must contain left, crown, and right vertices');
    assert.deepEqual(deck, road, 'deck and road must use identical XYZ vertices at the graded seam');
  }
  assert.equal(
    geometry.validation.valid,
    true,
    `${geometry.validation.errors.join(' ')} ${JSON.stringify(degenerateTriangleRoles(geometry.meshes.structure))}`
  );
});

test('dirt-road approaches narrow monotonically to a safe deck and retire shoulders at the abutment', () => {
  const { geometry } = buildAutomaticGap({ id: 'monotonic-timber-taper' });
  const selection = geometry.bridgeSelections[0];
  const deckXs = pointsForRole(
    geometry.meshes.structure,
    role => role.endsWith('-deck-top')
  ).map(point => point[0]);
  const bridgeStart = Math.min(...deckXs);
  const road = widthsByX(geometry.meshes.road, 'road-core').filter(row => (
    row.x >= bridgeStart - selection.approachTaperLength - EPSILON
    && row.x <= bridgeStart + EPSILON
  ));
  assert.ok(road.length >= 4, 'approach must expose multiple taper stations');
  for (let index = 1; index < road.length; index += 1) {
    assert.ok(
      road[index].width <= road[index - 1].width + EPSILON,
      `road width must not increase toward bridge (${road[index - 1].width} -> ${road[index].width})`
    );
  }
  assert.ok(road.every(row => row.width >= selection.clearWidth - EPSILON));
  assert.ok(Math.abs(road.at(-1).width - selection.clearWidth) <= EPSILON);

  for (const role of ['left-shoulder', 'right-shoulder']) {
    const shoulder = widthsByX(geometry.meshes.shoulder, role).filter(row => (
      row.x >= bridgeStart - selection.approachTaperLength - EPSILON
      && row.x <= bridgeStart + EPSILON
    ));
    assert.ok(shoulder.length >= 4);
    for (let index = 1; index < shoulder.length; index += 1) {
      assert.ok(shoulder[index].width <= shoulder[index - 1].width + EPSILON);
    }
    assert.ok(shoulder.at(-1).width <= EPSILON, `${role} must reach zero at the abutment`);
  }
});

test('bridge approach stations share road width while terrain retains its authored feather', () => {
  const { compiled, terrainModifier, geometry } = buildAutomaticGap({
    id: 'shared-bridge-taper-authority'
  });
  const segment = compiled.segments[0];
  const bridgeAuthority = terrainModifier.entries
    .flatMap(entry => entry.bridgeAuthorities || [])
    .find(Boolean);
  assert.ok(bridgeAuthority);
  const consumers = connectPathRuntimeConsumers({
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: compiled.generationRevision,
    compiled,
    terrainModifier,
    geometry,
    diagnostics: geometry.validation
  });
  assert.strictEqual(consumers.collision.roadMesh, geometry.meshes.road);
  assert.strictEqual(consumers.navigation.surfaceMesh, geometry.navigationMeshes.surface);

  const approachSections = terrainModifier.crossSections.filter(section => {
    const state = bridgeCrossSectionState(
      segment.crossSectionProfile,
      section.distance,
      [bridgeAuthority]
    );
    return state.amount > EPSILON && state.amount < 1 - EPSILON;
  });
  assert.ok(approachSections.length >= 4);
  const authoredLayout = pathCrossSectionLayout(segment.crossSectionProfile);

  const roadWidths = new Map(widthsByX(geometry.meshes.road, 'road-core')
    .map(row => [row.x.toFixed(5), row.width]));
  const navigationWidths = new Map(widthsByX(
    geometry.navigationMeshes.surface,
    'navigation-road'
  ).map(row => [row.x.toFixed(5), row.width]));

  for (const section of approachSections) {
    const state = bridgeCrossSectionState(
      segment.crossSectionProfile,
      section.distance,
      [bridgeAuthority]
    );
    const xKey = section.center[0].toFixed(5);
    assert.ok(Math.abs(section.roadWidth - state.roadWidth) <= EPSILON);
    assert.ok(Math.abs(section.surfaceDetailRoadWidth - state.surfaceDetailRoadWidth) <= EPSILON);
    assert.ok(Math.abs(roadWidths.get(xKey) - state.roadWidth) <= EPSILON);
    assert.ok(Math.abs(navigationWidths.get(xKey) - state.roadWidth) <= EPSILON);
    const leftTerrainOuter = Math.hypot(
      section.outerLeft[0] - section.center[0],
      section.outerLeft[2] - section.center[2]
    );
    const rightTerrainOuter = Math.hypot(
      section.outerRight[0] - section.center[0],
      section.outerRight[2] - section.center[2]
    );
    assert.ok(Math.abs(leftTerrainOuter - section.layout.left.outerEdge) <= EPSILON);
    assert.ok(Math.abs(rightTerrainOuter - section.layout.right.outerEdge) <= EPSILON);
    assert.ok(Math.abs(section.layout.left.blendWidth - authoredLayout.left.blendWidth) <= EPSILON);
    assert.ok(Math.abs(section.layout.right.blendWidth - authoredLayout.right.blendWidth) <= EPSILON);
    assert.ok(leftTerrainOuter >= state.leftOuterEdge - EPSILON);
    assert.ok(rightTerrainOuter >= state.rightOuterEdge - EPSILON);
    const detailWidths = detailRoadWidthsAtX(geometry.meshes.road, 'road-core', section.center[0]);
    assert.ok(detailWidths.length >= 3);
    assert.ok(detailWidths.every(width => Math.abs(width - state.surfaceDetailRoadWidth) <= EPSILON));
  }
});

test('urban bridge families carry sidewalks through one structural and navigation deck authority', () => {
  const city = pathCrossSectionProfile('city-local-street');
  const { geometry } = buildAutomaticGap({
    id: 'urban-stone-bridge',
    length: 72,
    gapStart: 27,
    gapEnd: 45,
    crossSectionProfile: city,
    bridgeStyle: 'stone-arch'
  });
  const selection = geometry.bridgeSelections[0];
  assert.equal(selection.carrySidewalks, true);
  assert.ok(geometry.navigationMeshes.surface.roles.includes('navigation-bridge-deck'));
  assert.ok(geometry.navigationMeshes.surface.roles.includes('navigation-bridge-sidewalk'));
  assert.equal(geometry.meshes.structure.roles.includes('navigation-bridge-deck'), false);
  assert.equal(geometry.meshes.structure.roles.includes('navigation-bridge-sidewalk'), false);
  assert.equal(
    geometry.validation.valid,
    true,
    `${geometry.validation.errors.join(' ')} ${JSON.stringify(degenerateTriangleRoles(geometry.meshes.structure))}`
  );
});

test('a bridge directly incident to a junction shares the exact portal width and boundary vertices', () => {
  const network = normalizePathNetwork({
    id: 'junction-incident-bridge',
    nodes: [
      { id: 'center', position: [0, 5, 0], heightMode: 'absolute' },
      { id: 'east', position: [16, 5, 0], heightMode: 'absolute' },
      { id: 'west', position: [-24, 5, 0], heightMode: 'absolute' },
      { id: 'north', position: [0, 5, 24], heightMode: 'absolute' }
    ],
    defaults: { crossSectionProfile: { profileId: 'dirt-road', width: 6 } },
    segments: [
      {
        id: 'bridge-arm',
        fromNode: 'center',
        toNode: 'east',
        constructionMode: 'bridge',
        constructionLocked: true,
        structureProfile: { bridgeStyle: 'timber-trestle' }
      },
      {
        id: 'west-arm',
        fromNode: 'west',
        toNode: 'center',
        constructionMode: 'conform',
        constructionLocked: true
      },
      {
        id: 'north-arm',
        fromNode: 'center',
        toNode: 'north',
        constructionMode: 'conform',
        constructionLocked: true
      }
    ],
    engineering: { maxGradePercent: 20, maximumBridgeSpan: 50 }
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const terrainModifier = compilePathTerrainModifier(compiled, {
    baseHeightAt: () => 0,
    chunkSize: 16
  });
  const geometry = buildPathNetworkGeometry(compiled, {
    terrainModifier,
    junctionFilletSegments: 5
  });

  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  const junction = geometry.junctionAuthority.junctionsByNode.get('center');
  const portal = junction.portals.find(candidate => candidate.segmentId === 'bridge-arm');
  assert.ok(portal, 'the bridge arm must own one shared junction portal');
  const selection = geometry.bridgeSelections.find(candidate => candidate.segmentId === 'bridge-arm');
  assert.ok(selection);
  assert.equal(selection.junctionSeams.length, 1);
  assert.equal(selection.junctionSeams[0].nodeId, 'center');
  assert.equal(selection.junctionSeams[0].compatible, true);
  assert.ok(Math.abs(selection.junctionSeams[0].widthDelta) <= 1e-5);
  assert.ok(Math.abs(selection.junctionSeams[0].surfaceWidth - portal.width) <= EPSILON);

  const portalX = portal.center[0];
  const atPortal = (mesh, role) => pointsForRole(mesh, candidate => candidate === role)
    .filter(point => Math.abs(point[0] - portalX) <= EPSILON);
  const deckSeam = atPortal(geometry.meshes.structure, 'bridge-timber-deck-top');
  const navigationSeam = atPortal(
    geometry.navigationMeshes.surface,
    'navigation-bridge-deck'
  );
  assert.equal(deckSeam.length, 3, 'bridge deck seam must contain left, crown, and right');
  assert.equal(navigationSeam.length, 3, 'navigation deck seam must share the same three vertices');

  const seamBoundary = new Set(deckSeam
    .filter(point => Math.abs(point[2] - portal.center[2]) > EPSILON)
    .map(point => point.map(value => value.toFixed(5)).join(':')));
  const portalBoundary = new Set([portal.left, portal.right]
    .map(point => point.map(value => value.toFixed(5)).join(':')));
  assert.deepEqual(seamBoundary, portalBoundary, 'deck edges must be the exact shared portal vertices');
  assert.deepEqual(
    new Set(navigationSeam.map(point => point.map(value => value.toFixed(5)).join(':'))),
    new Set(deckSeam.map(point => point.map(value => value.toFixed(5)).join(':'))),
    'bridge collision/navigation must use the exact structural travel seam'
  );
});

test('bridge construction is a closed solid and collision/navigation cover the same compiled interval', () => {
  const { compiled, terrainModifier, geometry } = buildAutomaticGap({
    id: 'solid-and-consumers',
    length: 80,
    gapStart: 25,
    gapEnd: 47,
    startY: 5,
    endY: 8,
    crossSectionProfile: { profileId: 'dirt-road', width: 7 },
    bridgeStyle: 'steel-girder'
  });
  for (const suffix of ['-top', '-underside', '-left-edge', '-right-edge', '-start-face', '-end-face']) {
    assert.ok(
      geometry.meshes.structure.roles.some(role => role.endsWith(`-deck${suffix}`)),
      `bridge deck must include ${suffix}`
    );
  }
  const runtime = {
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: 17,
    compiled,
    terrainModifier,
    geometry,
    diagnostics: geometry.validation
  };
  const consumers = connectPathRuntimeConsumers(runtime);
  assert.strictEqual(consumers.collision.structureMesh, geometry.meshes.structure);
  assert.ok(consumers.collision.structureMesh.roles.some(role => role.endsWith('-deck-top')));
  assert.strictEqual(consumers.navigation.surfaceMesh, geometry.navigationMeshes.surface);
  assert.ok(consumers.navigation.surfaceMesh.roles.includes('navigation-bridge-deck'));
  assert.equal(Object.values(consumers.render).includes(consumers.navigation.surfaceMesh), false);
  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
});

test('an explicitly incompatible family remains diagnosable and cannot pass geometry validation', () => {
  const network = normalizePathNetwork({
    id: 'invalid-timber-family',
    nodes: [
      { id: 'a', position: [0, 8, 0], heightMode: 'absolute' },
      { id: 'b', position: [44, 8, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'route',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'bridge',
      constructionLocked: true,
      crossSectionProfile: { profileId: 'dirt-road', width: 9 },
      structureProfile: { bridgeStyle: 'timber-trestle' },
      gameplayRules: { vehicleClass: 'heavy' }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 1
  });
  const terrainModifier = compilePathTerrainModifier(compiled, {
    baseHeightAt: () => 0,
    chunkSize: 16
  });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  const selection = geometry.bridgeSelections[0];
  assert.equal(selection.valid, false);
  assert.ok(selection.compatibilityDiagnostics.some(item => item.code === 'span-exceeds-maximum'));
  assert.ok(selection.compatibilityDiagnostics.some(item => item.code === 'clear-width-exceeds-maximum'));
  assert.equal(geometry.validation.valid, false);
  assert.ok(geometry.validation.errors.some(message => message.includes('timber-trestle is incompatible')));
});
