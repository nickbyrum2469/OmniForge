import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_NETWORK_SCHEMA_VERSION,
  attachPathNetwork,
  migrateLegacyPathObject,
  normalizePathNetwork,
  validatePathNetwork
} from '../app/path-network/model.js';
import {
  applyPathNetworkTransaction,
  mergePathNetworksAtSegment,
  pathNetworkDegrees,
  suggestPathNodeHandles
} from '../app/path-network/transactions.js';
import { migrateSceneWorldFoundation } from '../app/worldgen.js';

function legacyPath(overrides = {}) {
  return {
    id: 'road-main',
    type: 'path',
    name: 'Road',
    transform: { position: [10, 3, -4], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      points: [[0, 0], [10, 0], [20, 8]],
      width: 6,
      materialId: 'material-dirt',
      spline: true,
      ...overrides
    }
  };
}

test('legacy path migration creates stable 3D nodes and connected segments', () => {
  const path = legacyPath();
  const result = migrateLegacyPathObject(path, { terrainHeightAt: (x, z) => x * 0.1 + z * 0.05 });
  assert.equal(result.migrated, true);
  assert.equal(result.network.schemaVersion, PATH_NETWORK_SCHEMA_VERSION);
  assert.deepEqual(result.network.nodes.map(node => node.id), [
    'road-main:node:0',
    'road-main:node:1',
    'road-main:node:2'
  ]);
  assert.deepEqual(result.network.nodes[0].position, [10, 0.8, -4]);
  assert.equal(result.network.nodes[0].heightMode, 'terrain');
  assert.equal(result.network.segments.length, 2);
  assert.equal(result.network.segments[0].fromNode, result.network.nodes[0].id);
  assert.equal(result.network.segments[0].toNode, result.network.nodes[1].id);
  assert.equal(result.network.defaults.crossSectionProfile.width, 6);
  assert.equal(result.validation.valid, true);
});

test('legacy carve flags do not bypass unlocked Civil Assist construction', () => {
  const migrated = migrateLegacyPathObject(legacyPath({ carveTerrain: false }), {
    terrainHeightAt: () => 0
  });
  assert.ok(migrated.network.segments.every(segment => segment.constructionMode === 'auto'));
  assert.ok(migrated.network.segments.every(segment => segment.constructionLocked === false));
});

test('authored legacy elevations become absolute height anchors', () => {
  const result = migrateLegacyPathObject(legacyPath({
    worldSpacePoints: true,
    nodeElevations: [12, null, -2]
  }), { terrainHeightAt: () => 7 });
  assert.deepEqual(result.network.nodes.map(node => node.position[1]), [12, 7, -2]);
  assert.deepEqual(result.network.nodes.map(node => node.heightMode), ['absolute', 'terrain', 'absolute']);
});

test('attaching an existing v2 network is idempotent', () => {
  const path = legacyPath();
  const first = attachPathNetwork(path, { terrainHeightAt: () => 4 });
  const serialized = JSON.stringify(path.properties.pathNetwork);
  const second = attachPathNetwork(path, { terrainHeightAt: () => 99 });
  assert.equal(first.migrated, true);
  assert.equal(second.migrated, false);
  assert.equal(JSON.stringify(path.properties.pathNetwork), serialized);
});

test('scene migration attaches one persistent network without changing legacy render inputs', () => {
  const path = legacyPath();
  const scene = {
    settings: {},
    objects: [
      {
        id: 'terrain-main',
        type: 'terrain',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: { preset: 'plains', height: 0, baseElevation: 2 }
      },
      path
    ]
  };
  migrateSceneWorldFoundation(scene);
  assert.equal(path.properties.pathNetwork.schemaVersion, PATH_NETWORK_SCHEMA_VERSION);
  assert.deepEqual(path.properties.points, [[10, -4], [20, -4], [30, 4]]);
  assert.equal(path.properties.pathNetwork.nodes[0].position[1], 2);
  const serialized = JSON.stringify(path.properties.pathNetwork);
  migrateSceneWorldFoundation(scene);
  assert.equal(JSON.stringify(path.properties.pathNetwork), serialized);
});

test('validation rejects missing endpoints and self loops', () => {
  const network = normalizePathNetwork({
    id: 'bad-road',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [1, 0, 0] }
    ],
    segments: [
      { id: 's1', fromNode: 'a', toNode: 'missing' },
      { id: 's2', fromNode: 'b', toNode: 'b' }
    ]
  });
  const result = validatePathNetwork(network);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /missing end node/);
  assert.match(result.errors.join(' '), /cannot connect a node to itself/);
});

test('path transactions move, split, classify, and undo without mutating the input', () => {
  const original = migrateLegacyPathObject(legacyPath({ worldSpacePoints: true }), { terrainHeightAt: () => 0 }).network;
  const firstNode = original.nodes[0];
  const firstSegment = original.segments[0];
  const result = applyPathNetworkTransaction(original, {
    id: 'edit-1',
    label: 'Raise and split road',
    operations: [
      { type: 'move-node', nodeId: firstNode.id, position: [0, 8, 0], heightMode: 'absolute' },
      {
        type: 'insert-node',
        segmentId: firstSegment.id,
        node: { position: [5, 4, 0], heightMode: 'absolute' }
      },
      {
        type: 'set-segment-construction',
        segmentId: firstSegment.id,
        constructionMode: 'bridge',
        locked: true
      }
    ]
  });
  assert.equal(original.nodes[0].position[1], 0);
  assert.equal(result.network.nodes.length, original.nodes.length + 1);
  assert.equal(result.network.segments.length, original.segments.length + 1);
  assert.equal(result.network.nodes[0].position[1], 8);
  assert.equal(result.network.segments[0].constructionMode, 'bridge');
  assert.equal(result.network.segments[0].constructionLocked, true);
  assert.deepEqual(result.inverse.replaceNetwork, original);
});

test('path transactions author free, aligned, and automatic spline handles', () => {
  const original = migrateLegacyPathObject(legacyPath({ worldSpacePoints: true }), { terrainHeightAt: () => 0 }).network;
  const node = original.nodes[1];
  const suggested = suggestPathNodeHandles(original, node.id);
  assert.ok(Math.abs(suggested.incomingHandle[0] + 10 / 3) < 1e-9);
  assert.deepEqual(suggested.incomingHandle.slice(1), [0, 0]);
  assert.ok(Math.abs(suggested.outgoingHandle[0] - 10 / 3) < 1e-9);
  assert.ok(Math.abs(suggested.outgoingHandle[2] - 8 / 3) < 1e-9);
  assert.equal(suggested.degree, 2);

  const free = applyPathNetworkTransaction(original, {
    label: 'Free handles',
    operations: [{
      type: 'set-node-handles',
      nodeId: node.id,
      handleMode: 'free',
      incomingHandle: [-4, 1, 0],
      outgoingHandle: [2, 3, 5]
    }]
  }).network;
  assert.equal(free.nodes[1].handleMode, 'free');
  assert.deepEqual(free.nodes[1].incomingHandle, [-4, 1, 0]);
  assert.deepEqual(free.nodes[1].outgoingHandle, [2, 3, 5]);

  const aligned = applyPathNetworkTransaction(free, {
    label: 'Align handles from outgoing',
    operations: [{
      type: 'set-node-handles',
      nodeId: node.id,
      handleMode: 'aligned',
      primaryHandle: 'outgoing',
      incomingHandle: [-6, 0, 0],
      outgoingHandle: [0, 0, 3]
    }]
  }).network;
  assert.ok(Math.abs(aligned.nodes[1].incomingHandle[0]) < 1e-9);
  assert.ok(Math.abs(aligned.nodes[1].incomingHandle[1]) < 1e-9);
  assert.equal(aligned.nodes[1].incomingHandle[2], -6);
  assert.deepEqual(aligned.nodes[1].outgoingHandle, [0, 0, 3]);

  const automatic = applyPathNetworkTransaction(aligned, {
    label: 'Restore automatic handles',
    operations: [{
      type: 'set-node-handles',
      nodeId: node.id,
      handleMode: 'automatic'
    }]
  }).network;
  assert.equal(automatic.nodes[1].handleMode, 'automatic');
  assert.equal(automatic.nodes[1].incomingHandle, null);
  assert.equal(automatic.nodes[1].outgoingHandle, null);
});

test('separate paths merge into one validated branch junction without mutating either input', () => {
  const target = normalizePathNetwork({
    id: 'main-road',
    revision: 7,
    nodes: [
      { id: 'west', position: [-20, 0, 0], heightMode: 'terrain' },
      { id: 'east', position: [20, 0, 0], heightMode: 'terrain' }
    ],
    segments: [{ id: 'main', fromNode: 'west', toNode: 'east' }]
  });
  const source = normalizePathNetwork({
    id: 'branch-road',
    revision: 4,
    nodes: [
      { id: 'south', position: [0, 0, 18], heightMode: 'terrain' },
      { id: 'branch-end', position: [0, 0, 5], heightMode: 'terrain' }
    ],
    segments: [{ id: 'branch', fromNode: 'south', toNode: 'branch-end' }]
  });
  const targetBefore = structuredClone(target);
  const sourceBefore = structuredClone(source);
  const result = mergePathNetworksAtSegment(target, source, {
    targetSegmentId: 'main',
    junctionPosition: [0, 1.5, 0],
    sourceNodeId: 'branch-end',
    heightMode: 'offset',
    heightOffset: 1.5
  });
  const degrees = pathNetworkDegrees(result.network);
  const junction = result.network.nodes.find(node => node.id === result.junctionNodeId);

  assert.equal(result.validation.valid, true);
  assert.equal(result.network.revision, 8);
  assert.equal(result.network.nodes.length, 5);
  assert.equal(result.network.segments.length, 4);
  assert.equal(degrees.get(result.junctionNodeId), 3);
  assert.deepEqual(junction.position, [0, 1.5, 0]);
  assert.equal(junction.heightMode, 'offset');
  assert.equal(junction.heightOffset, 1.5);
  assert.deepEqual(target, targetBefore);
  assert.deepEqual(source, sourceBefore);
});

test('manual handles reject junction ambiguity and zero-length vectors', () => {
  const original = migrateLegacyPathObject(legacyPath({ worldSpacePoints: true }), { terrainHeightAt: () => 0 }).network;
  const middle = original.nodes[1];
  const junction = applyPathNetworkTransaction(original, {
    label: 'Create branch',
    operations: [
      {
        type: 'insert-node',
        segmentId: original.segments[1].id,
        node: { id: 'branch-end', position: [10, 0, 20] }
      },
      {
        type: 'connect-nodes',
        fromNode: middle.id,
        toNode: 'branch-end',
        segmentId: 'branch'
      }
    ]
  }).network;
  assert.throws(() => applyPathNetworkTransaction(junction, {
    operations: [{
      type: 'set-node-handles',
      nodeId: middle.id,
      handleMode: 'free',
      incomingHandle: [-1, 0, 0],
      outgoingHandle: [1, 0, 0]
    }]
  }), /junction nodes/);
  assert.throws(() => applyPathNetworkTransaction(original, {
    operations: [{
      type: 'set-node-handles',
      nodeId: middle.id,
      handleMode: 'free',
      incomingHandle: [0, 0, 0],
      outgoingHandle: [1, 0, 0]
    }]
  }), /non-zero length/);
});
