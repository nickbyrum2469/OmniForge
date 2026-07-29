import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_NETWORK_SCHEMA_VERSION,
  attachPathNetwork,
  migrateLegacyPathObject,
  normalizePathNetwork,
  validatePathNetwork
} from '../app/path-network/model.js';
import { applyPathNetworkTransaction } from '../app/path-network/transactions.js';
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
