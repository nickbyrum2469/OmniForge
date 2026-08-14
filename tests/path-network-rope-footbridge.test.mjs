import assert from 'node:assert/strict';
import test from 'node:test';

import { compilePathNetwork } from '../app/path-network/compiler.js';
import {
  buildPathNetworkGeometry,
  ropeFootbridgeAttachmentPlan
} from '../app/path-network/geometry.js';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';

const distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function straightSections() {
  return Array.from({ length: 41 }, (_, index) => ({
    distance: index * 0.5,
    center: [index * 0.5, 4, 0],
    roadLeft: [index * 0.5, 4, -0.9],
    roadRight: [index * 0.5, 4, 0.9],
    roadHalfWidth: 0.9
  }));
}

test('rope footbridge uses one exact attachment plan for planks, cables, hangers, and timber portals', () => {
  const plan = ropeFootbridgeAttachmentPlan(straightSections(), {
    clearWidth: 1.8,
    deckWidth: 2.1
  });
  assert.ok(plan.slatStations.length > 20);
  assert.ok(plan.hangerStations.length > 8);
  assert.equal(plan.portals.length, 2);

  const slatIndices = new Set(plan.slatStations.map(station => station.index));
  for (const hanger of plan.hangerStations) {
    assert.ok(slatIndices.has(hanger.index), 'every hanger must land on an authored plank station');
    for (const side of hanger.sides) {
      assert.ok(distance3(side.loadRopePoint, side.deckEdge) < 0.02);
      assert.ok(side.handRopePoint[1] > side.loadRopePoint[1] + 0.7);
    }
  }

  for (const portal of plan.portals) {
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const stationSide = portal.station.sides[sideIndex];
      const post = portal.posts[sideIndex];
      assert.deepEqual(post.loadTie, stationSide.loadRopePoint);
      assert.deepEqual(post.handTie, stationSide.handRopePoint);
      assert.ok(post.foot[1] < post.loadTie[1]);
      assert.ok(post.top[1] > post.handTie[1]);
    }
    assert.deepEqual(portal.sillLeft, portal.posts[0].foot);
    assert.deepEqual(portal.sillRight, portal.posts[1].foot);
    assert.ok(portal.sillLeft[1] < portal.posts[0].loadTie[1] - 0.3);
    assert.ok(portal.sillRight[1] < portal.posts[1].loadTie[1] - 0.3);
  }

  for (const station of plan.slatStations) {
    const cableSpan = distance3(
      station.sides[0].loadRopePoint,
      station.sides[1].loadRopePoint
    );
    assert.ok(
      station.plankWidth >= cableSpan + 0.19,
      'each plank must visibly overhang both load-rope centres'
    );
  }
});

test('rope footbridge production geometry includes connected load cables and anchored portal assemblies', () => {
  const terrainHeightAt = x => (x <= 2 || x >= 22 ? 5 : 0);
  const network = normalizePathNetwork({
    id: 'rope-attachment-geometry',
    nodes: [
      { id: 'west', position: [0, 5, 0], heightMode: 'absolute' },
      { id: 'east', position: [24, 5, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'rope-span',
      fromNode: 'west',
      toNode: 'east',
      constructionMode: 'bridge',
      constructionLocked: true,
      crossSectionProfile: { profileId: 'natural-trail', width: 2, shoulderWidth: 0.4 },
      structureProfile: { bridgeStyle: 'rope-footbridge' },
      gameplayRules: { vehicleClass: 'pedestrian' }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 0.5
  });
  const terrainModifier = compilePathTerrainModifier(compiled, {
    baseHeightAt: terrainHeightAt,
    chunkSize: 16
  });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  const roles = new Set(geometry.meshes.structure.roles);

  assert.equal(geometry.validation.valid, true, geometry.validation.errors.join(' '));
  for (const role of [
    'bridge-timber-deck-slat',
    'bridge-rope-deck-load-cable',
    'bridge-rope-hanger',
    'bridge-rope-handrail',
    'bridge-timber-anchor-sill',
    'bridge-timber-anchor-crosshead',
    'bridge-timber-anchor-post',
    'bridge-timber-anchor-deadman',
    'bridge-rope-anchor-backstay'
  ]) assert.ok(roles.has(role), `missing ${role}`);
  assert.ok(geometry.meshes.structure.indices.length > 0);
  assert.ok(Array.from(geometry.meshes.structure.positions).every(Number.isFinite));

  const positionsForRole = role => geometry.meshes.structure.roles
    .flatMap((candidate, index) => candidate === role
      ? [Array.from(geometry.meshes.structure.positions.slice(index * 3, index * 3 + 3))]
      : []);
  const sillVertices = positionsForRole('bridge-timber-anchor-sill');
  const deadmanVertices = positionsForRole('bridge-timber-anchor-deadman');
  const postVertices = positionsForRole('bridge-timber-anchor-post');
  assert.ok(sillVertices.length > 0);
  assert.ok(deadmanVertices.length > 0);
  assert.ok(postVertices.length > 0);
  assert.ok(
    sillVertices.every(point => point[1] <= terrainHeightAt(point[0], point[2]) + 1e-6),
    'the transverse anchor sill must remain below authored ground instead of crossing the path surface'
  );
  assert.ok(
    deadmanVertices.every(point => point[1] <= terrainHeightAt(point[0], point[2]) + 1e-6),
    'the deadman timber must remain buried instead of sitting on the approach'
  );
  assert.ok(
    postVertices.some(point => point[1] < terrainHeightAt(point[0], point[2]) - 0.1),
    'portal posts must extend below grade into the buried sill'
  );
});
