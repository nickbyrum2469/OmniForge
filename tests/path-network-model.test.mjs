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
  duplicatePathNetwork,
  mergePathNetworksAtSegment,
  pathNetworkDegrees,
  splitPathNetworkAtNode,
  suggestPathNodeHandles
} from '../app/path-network/transactions.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
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

function cubicAuthorityPoint(authority, t) {
  const add = (a, b) => a.map((value, index) => value + b[index]);
  const lerp = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * amount);
  const p0 = authority.start;
  const p1 = add(p0, authority.fromHandle);
  const p3 = authority.end;
  const p2 = add(p3, authority.toHandle);
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  return lerp(lerp(q0, q1, t), lerp(q1, q2, t), t);
}

function maximumExactSplitDeviation(originalAuthority, firstAuthority, secondAuthority, splitT) {
  let maximum = 0;
  for (let index = 0; index <= 200; index += 1) {
    const t = index / 200;
    const expected = cubicAuthorityPoint(originalAuthority, t);
    const localT = t <= splitT ? t / splitT : (t - splitT) / (1 - splitT);
    const actual = cubicAuthorityPoint(t <= splitT ? firstAuthority : secondAuthority, localT);
    maximum = Math.max(maximum, Math.hypot(...actual.map((value, axis) => value - expected[axis])));
  }
  return maximum;
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

test('validation rejects duplicate edges and diagnoses isolated or disconnected graph components', () => {
  const duplicate = validatePathNetwork(normalizePathNetwork({
    id: 'duplicate-road',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [10, 0, 0] },
      { id: 'orphan', position: [30, 0, 0] }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'ba', fromNode: 'b', toNode: 'a' }
    ]
  }));
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors.join(' '), /duplicates an existing connection/);
  assert.match(duplicate.warnings.join(' '), /not connected|outside the primary graph/);

  const disconnected = validatePathNetwork(normalizePathNetwork({
    id: 'disconnected-road',
    nodes: ['a', 'b', 'c', 'd'].map((id, index) => ({ id, position: [index * 10, 0, 0] })),
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'cd', fromNode: 'c', toNode: 'd' }
    ]
  }));
  assert.equal(disconnected.valid, true);
  assert.match(disconnected.warnings.join(' '), /outside the primary graph/);
});

test('stored schema-v2 graphs fail closed on duplicate raw node and segment identity', () => {
  assert.throws(() => normalizePathNetwork({
    schemaVersion: 2,
    id: 'missing-node-id',
    nodes: [{ position: [0, 0, 0] }, { id: 'b', position: [10, 0, 0] }],
    segments: [{ id: 'route', fromNode: 'a', toNode: 'b' }]
  }), /node without an id.*cannot be assigned implicitly/);
  assert.throws(() => normalizePathNetwork({
    schemaVersion: 2,
    id: 'missing-segment-id',
    nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [10, 0, 0] }],
    segments: [{ fromNode: 'a', toNode: 'b' }]
  }), /segment without an id.*cannot be assigned implicitly/);
  assert.throws(() => normalizePathNetwork({
    schemaVersion: 2,
    id: 'corrupt-node-ids',
    nodes: [
      { id: 'same', position: [0, 0, 0] },
      { id: 'same', position: [10, 0, 0] }
    ],
    segments: [{ id: 'route', fromNode: 'same', toNode: 'same' }]
  }), /duplicate node id same.*cannot be repaired implicitly/);
  assert.throws(() => normalizePathNetwork({
    schemaVersion: 2,
    id: 'corrupt-segment-ids',
    nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [10, 0, 0] }, { id: 'c', position: [20, 0, 0] }],
    segments: [
      { id: 'same', fromNode: 'a', toNode: 'b' },
      { id: 'same', fromNode: 'b', toNode: 'c' }
    ]
  }), /duplicate segment id same.*cannot be repaired implicitly/);
  const diagnostic = validatePathNetwork({
    schemaVersion: 2,
    id: 'diagnostic-duplicate',
    nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'a', position: [10, 0, 0] }],
    segments: [{ id: 'route', fromNode: 'a', toNode: 'a' }]
  });
  assert.equal(diagnostic.valid, false);
  assert.match(diagnostic.errors.join(' '), /duplicate node id a/);
});

test('stored schema-v2 segment-local curve controls reject malformed vectors', () => {
  const malformed = {
    schemaVersion: 2,
    id: 'malformed-curve-control',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [10, 0, 0] }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      curveControl: { fromHandle: [1, Number.NaN, 0], toHandle: [-1, 0, 0] }
    }]
  };
  assert.throws(() => normalizePathNetwork(malformed), /invalid fromHandle curve control/);
  assert.equal(validatePathNetwork(malformed).valid, false);
});

test('degree-2 deletion preserves explicit segment authority and rejects silent profile loss', () => {
  const original = normalizePathNetwork({
    id: 'profile-boundary',
    nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [10, 0, 0] }, { id: 'c', position: [20, 0, 0] }],
    segments: [
      { id: 'trail', fromNode: 'a', toNode: 'b', crossSectionProfile: { profileId: 'natural-trail', width: 1.2 } },
      { id: 'street', fromNode: 'b', toNode: 'c', crossSectionProfile: { profileId: 'city-local-street', width: 7 } }
    ]
  });
  assert.throws(() => applyPathNetworkTransaction(original, {
    operations: [{ type: 'delete-node', nodeId: 'b' }]
  }), /would discard incompatible segment authority.*retainedSegmentId trail or street/);
  const retained = applyPathNetworkTransaction(original, {
    operations: [{ type: 'delete-node', nodeId: 'b', retainedSegmentId: 'street' }]
  }).network;
  assert.equal(retained.segments.length, 1);
  assert.equal(retained.segments[0].crossSectionProfile.profileId, 'city-local-street');
  assert.equal(retained.segments[0].crossSectionProfile.width, 7);
  assert.throws(() => applyPathNetworkTransaction(original, {
    operations: [{ type: 'delete-node', nodeId: 'b', retainedSegmentId: 'missing' }]
  }), /not incident to path node b/);
});

test('graph transactions add branches, move groups atomically, remove edges, and enforce locks and identity', () => {
  const original = normalizePathNetwork({
    id: 'graph-edit',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [10, 0, 0] },
      { id: 'c', position: [20, 0, 0] }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'bc', fromNode: 'b', toNode: 'c' }
    ]
  });
  const edited = applyPathNetworkTransaction(original, {
    label: 'Move nodes and create branch',
    operations: [
      { type: 'move-nodes', moves: [{ nodeId: 'a', delta: [2, 0, 3] }, { nodeId: 'c', position: [24, 1, 5], heightMode: 'absolute' }] },
      { type: 'add-node', node: { id: 'branch', position: [10, 0, 10] } },
      { type: 'connect-nodes', segmentId: 'branch-edge', fromNode: 'b', toNode: 'branch' }
    ]
  });
  assert.deepEqual(edited.network.nodes.find(node => node.id === 'a').position, [2, 0, 3]);
  assert.deepEqual(edited.network.nodes.find(node => node.id === 'c').position, [24, 1, 5]);
  assert.equal(pathNetworkDegrees(edited.network).get('b'), 3);
  assert.deepEqual(edited.inverse.replaceNetwork, original);

  assert.throws(() => applyPathNetworkTransaction(edited.network, {
    operations: [{ type: 'connect-nodes', segmentId: 'duplicate', fromNode: 'branch', toNode: 'b' }]
  }), /already connected/);
  assert.throws(() => applyPathNetworkTransaction(edited.network, {
    operations: [{ type: 'add-node', node: { id: 'a', position: [0, 0, 0] } }]
  }), /already exists/);
  assert.throws(() => applyPathNetworkTransaction(edited.network, {
    operations: [{ type: 'connect-nodes', segmentId: 'ab', fromNode: 'a', toNode: 'branch' }]
  }), /segment ab already exists/);
  const detachedBranch = applyPathNetworkTransaction(edited.network, {
    operations: [{ type: 'remove-segment', segmentId: 'branch-edge' }]
  }).network;
  assert.equal(detachedBranch.segments.some(segment => segment.id === 'branch-edge'), false);
  assert.match(validatePathNetwork(detachedBranch).warnings.join(' '), /not connected|outside the primary graph/);

  const loop = normalizePathNetwork({
    id: 'removable-loop',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [10, 0, 0] },
      { id: 'c', position: [5, 0, 8] }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'bc', fromNode: 'b', toNode: 'c' },
      { id: 'ca', fromNode: 'c', toNode: 'a' }
    ]
  });
  const openedLoop = applyPathNetworkTransaction(loop, {
    operations: [{ type: 'remove-segment', segmentId: 'ca' }]
  }).network;
  assert.deepEqual(openedLoop.segments.map(segment => segment.id), ['ab', 'bc']);
  assert.equal(validatePathNetwork(openedLoop).valid, true);

  const locked = normalizePathNetwork({
    ...original,
    nodes: original.nodes.map(node => node.id === 'b' ? { ...node, locked: true } : node)
  });
  for (const operation of [
    { type: 'move-node', nodeId: 'b', delta: [1, 0, 0] },
    { type: 'move-nodes', moves: [{ nodeId: 'a', delta: [1, 0, 0] }, { nodeId: 'b', delta: [1, 0, 0] }] },
    { type: 'set-node-height', nodeId: 'b', heightMode: 'absolute', y: 5 },
    { type: 'delete-node', nodeId: 'b' },
    { type: 'insert-node', segmentId: 'ab', node: { id: 'x', position: [5, 0, 0] } },
    { type: 'remove-segment', segmentId: 'ab' },
    { type: 'connect-nodes', segmentId: 'ac', fromNode: 'a', toNode: 'b' },
    { type: 'reverse-segment', segmentId: 'ab' },
    { type: 'reverse-network' }
  ]) {
    assert.throws(() => applyPathNetworkTransaction(locked, { operations: [operation] }), /node b is locked/);
  }
  assert.deepEqual(locked, normalizePathNetwork({
    ...original,
    nodes: original.nodes.map(node => node.id === 'b' ? { ...node, locked: true } : node)
  }));
});

test('reverse-network preserves manual curve geometry authority by swapping handles', () => {
  const original = normalizePathNetwork({
    id: 'reversible',
    nodes: [
      { id: 'a', position: [0, 0, 0], handleMode: 'free', incomingHandle: [-1, 0, 0], outgoingHandle: [4, 2, 1] },
      { id: 'b', position: [10, 3, 5], handleMode: 'free', incomingHandle: [-3, -1, -2], outgoingHandle: [1, 0, 0] }
    ],
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b' }]
  });
  const reversed = applyPathNetworkTransaction(original, { operations: [{ type: 'reverse-network' }] }).network;
  assert.deepEqual([reversed.segments[0].fromNode, reversed.segments[0].toNode], ['b', 'a']);
  assert.deepEqual(reversed.nodes.find(node => node.id === 'a').incomingHandle, original.nodes.find(node => node.id === 'a').outgoingHandle);
  assert.deepEqual(reversed.nodes.find(node => node.id === 'a').outgoingHandle, original.nodes.find(node => node.id === 'a').incomingHandle);
  assert.deepEqual(reversed.nodes.find(node => node.id === 'b').incomingHandle, original.nodes.find(node => node.id === 'b').outgoingHandle);
  assert.deepEqual(reversed.nodes.find(node => node.id === 'b').outgoingHandle, original.nodes.find(node => node.id === 'b').incomingHandle);
  assert.throws(
    () => applyPathNetworkTransaction(original, { operations: [{ type: 'reverse-segment', segmentId: 'ab' }] }),
    /manual spline handles cannot be reversed independently/
  );
});

test('path duplication remaps graph identity and world-space nodes without copying generated authority', () => {
  const original = normalizePathNetwork({
    id: 'original-road',
    revision: 9,
    sourceRevisions: { terrain: 7 },
    generation: { status: 'ready' },
    nodes: [{ id: 'a', position: [0, 1, 0] }, { id: 'b', position: [10, 2, 5] }],
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b', constructionMode: 'bridge', constructionLocked: true }]
  });
  const result = duplicatePathNetwork(original, { newNetworkId: 'copied-road', offset: [3, 4, -2] });
  assert.equal(result.network.id, 'copied-road');
  assert.equal(result.network.revision, 1);
  assert.equal(result.network.generation, null);
  assert.deepEqual(result.network.sourceRevisions, {});
  assert.deepEqual(result.network.nodes.map(node => node.position), [[3, 5, -2], [13, 6, 3]]);
  assert.ok(result.network.nodes.every(node => node.id.startsWith('copied-road:node:')));
  assert.ok(result.network.segments.every(segment => segment.id.startsWith('copied-road:segment:')));
  assert.equal(result.network.segments[0].constructionMode, 'bridge');
  assert.equal(result.network.segments[0].constructionLocked, true);
  assert.deepEqual(original.nodes.map(node => node.position), [[0, 1, 0], [10, 2, 5]]);
  assert.throws(() => duplicatePathNetwork(original, { newNetworkId: 'original-road' }), /different network id/);
});

test('graph-aware split creates two connected networks at one degree-2 articulation and rejects ambiguous nodes', () => {
  const original = normalizePathNetwork({
    id: 'split-road',
    revision: 5,
    nodes: ['a', 'b', 'c', 'd'].map((id, index) => ({ id, position: [index * 10, index, 0], heightMode: index === 2 ? 'absolute' : 'terrain' })),
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'bc', fromNode: 'b', toNode: 'c', constructionMode: 'bridge', constructionLocked: true },
      { id: 'cd', fromNode: 'c', toNode: 'd' }
    ]
  });
  const result = splitPathNetworkAtNode(original, 'b', { newNetworkId: 'split-road-east', extractedSegmentId: 'bc' });
  assert.equal(result.retainedNetwork.id, 'split-road');
  assert.equal(result.retainedNetwork.revision, 6);
  assert.equal(result.extractedNetwork.id, 'split-road-east');
  assert.deepEqual(result.retainedNetwork.nodes.map(node => node.id).sort(), ['a', 'b']);
  assert.equal(result.extractedNetwork.nodes.length, 3);
  assert.equal(result.extractedNetwork.segments.length, 2);
  assert.ok(result.extractedNetwork.segments.some(segment => segment.constructionMode === 'bridge' && segment.constructionLocked));
  assert.deepEqual(original.nodes.map(node => node.id), ['a', 'b', 'c', 'd']);
  assert.throws(() => splitPathNetworkAtNode(original, 'a', { newNetworkId: 'bad' }), /degree-2 node/);

  const loop = normalizePathNetwork({
    id: 'loop',
    nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [10, 0, 0] }, { id: 'c', position: [5, 0, 8] }],
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b' }, { id: 'bc', fromNode: 'b', toNode: 'c' }, { id: 'ca', fromNode: 'c', toNode: 'a' }]
  });
  assert.throws(() => splitPathNetworkAtNode(loop, 'b', { newNetworkId: 'bad-loop' }), /not an articulation point/);

  const locked = structuredClone(original);
  locked.nodes.find(node => node.id === 'd').locked = true;
  assert.throws(
    () => splitPathNetworkAtNode(locked, 'b', { newNetworkId: 'locked-extraction' }),
    /affected node\(s\) d are locked/
  );
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
      },
      {
        type: 'set-segment-structure',
        segmentId: firstSegment.id,
        bridgeStyle: 'stone-arch',
        railings: true
      }
    ]
  });
  assert.equal(original.nodes[0].position[1], 0);
  assert.equal(result.network.nodes.length, original.nodes.length + 1);
  assert.equal(result.network.segments.length, original.segments.length + 1);
  assert.equal(result.network.nodes[0].position[1], 8);
  assert.equal(result.network.segments[0].constructionMode, 'bridge');
  assert.equal(result.network.segments[0].constructionLocked, true);
  assert.equal(result.network.segments[0].structureProfile.bridgeStyle, 'stone-arch');
  assert.equal(result.network.segments[0].structureProfile.railings, true);
  assert.deepEqual(result.inverse.replaceNetwork, original);
});

test('bridge profiles normalize and reject unknown structure families', () => {
  const network = normalizePathNetwork({
    id: 'bridge-profile',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [10, 0, 0] }
    ],
    segments: [{
      id: 'bridge',
      fromNode: 'a',
      toNode: 'b',
      structureProfile: {
        bridgeStyle: 'timber-trestle',
        deckThickness: 100,
        supportSpacing: 0,
        railings: false
      }
    }]
  });
  assert.deepEqual(network.segments[0].structureProfile, {
    bridgeStyle: 'timber-trestle',
    railings: false,
    deckThickness: 2,
    supportSpacing: 2
  });
  assert.throws(() => applyPathNetworkTransaction(network, {
    operations: [{
      type: 'set-segment-structure',
      segmentId: 'bridge',
      bridgeStyle: 'gray-placeholder-bridge'
    }]
  }), /Unknown bridge style/);
});

test('bridge landing settings survive normalization without being replaced by width defaults', () => {
  const network = normalizePathNetwork({
    id: 'bridge-landing-settings',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [40, 0, 0] }
    ],
    segments: [{ id: 'route', fromNode: 'a', toNode: 'b' }],
    engineering: {
      minimumBridgeRunLength: 7.25,
      bridgeIntervalPadding: 2.75
    }
  });
  assert.equal(network.engineering.minimumBridgeRunLength, 7.25);
  assert.equal(network.engineering.bridgeIntervalPadding, 2.75);

  const automatic = normalizePathNetwork({
    id: 'automatic-bridge-landing-settings',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [40, 0, 0] }
    ],
    segments: [{ id: 'route', fromNode: 'a', toNode: 'b' }]
  });
  assert.equal(automatic.engineering.minimumBridgeRunLength, null);
  assert.equal(automatic.engineering.bridgeIntervalPadding, 0);
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

test('manual absolute Hermite insertion preserves the exact authored curve', () => {
  const original = normalizePathNetwork({
    id: 'exact-manual-split',
    engineering: { maxGradePercent: 100 },
    nodes: [
      {
        id: 'a',
        position: [0, 4, 0],
        heightMode: 'absolute',
        handleMode: 'free',
        incomingHandle: [-2, 0, 0],
        outgoingHandle: [8, 6, -3]
      },
      {
        id: 'b',
        position: [24, 7, 15],
        heightMode: 'absolute',
        handleMode: 'free',
        incomingHandle: [-7, -4, -5],
        outgoingHandle: [2, 0, 0]
      }
    ],
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b', curveType: 'hermite' }]
  });
  const t = 0.37;
  const p0 = original.nodes[0].position;
  const p1 = p0.map((value, index) => value + original.nodes[0].outgoingHandle[index]);
  const p3 = original.nodes[1].position;
  const p2 = p3.map((value, index) => value + original.nodes[1].incomingHandle[index]);
  const lerp = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * amount);
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const expected = lerp(r0, r1, t);
  const result = applyPathNetworkTransaction(original, {
    label: 'Insert without reshaping',
    operations: [{
      type: 'insert-node',
      segmentId: 'ab',
      curveT: t,
      preserveCurve: true,
      node: { id: 'middle', position: [999, 999, 999], heightMode: 'absolute' }
    }]
  }).network;
  const inserted = result.nodes.find(node => node.id === 'middle');
  assert.deepEqual(inserted.position, expected);
  assert.equal(inserted.handleMode, 'free');
  assert.deepEqual(inserted.incomingHandle, r0.map((value, index) => value - expected[index]));
  assert.deepEqual(inserted.outgoingHandle, r1.map((value, index) => value - expected[index]));
  assert.deepEqual(result.nodes.find(node => node.id === 'a').outgoingHandle, q0.map((value, index) => value - p0[index]));
  assert.deepEqual(result.nodes.find(node => node.id === 'b').incomingHandle, q2.map((value, index) => value - p3[index]));
  assert.throws(() => applyPathNetworkTransaction(original, {
    operations: [{
      type: 'insert-node',
      segmentId: 'ab',
      curveT: 0,
      preserveCurve: true,
      node: { id: 'bad', position: [0, 0, 0] }
    }]
  }), /strictly inside/);
});

test('automatic Hermite insertion preserves compiled centerline within one centimetre beside a junction', () => {
  const original = normalizePathNetwork({
    id: 'automatic-junction-split',
    engineering: { maxGradePercent: 100, maxVerticalCurvePercent: 100 },
    nodes: [
      { id: 'west', position: [-20, 2, -4], heightMode: 'absolute' },
      { id: 'junction', position: [0, 5, 0], heightMode: 'absolute' },
      { id: 'east', position: [28, 9, 18], heightMode: 'absolute' },
      { id: 'branch', position: [7, 6, -18], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'west-junction', fromNode: 'west', toNode: 'junction', curveType: 'hermite' },
      { id: 'junction-east', fromNode: 'junction', toNode: 'east', curveType: 'hermite' },
      { id: 'junction-branch', fromNode: 'junction', toNode: 'branch', curveType: 'hermite' }
    ]
  });
  const compiledBefore = compilePathNetwork(original, { spacing: 0.15, tolerance: 0.001 });
  const beforeSegment = compiledBefore.segments.find(segment => segment.id === 'junction-east');
  const splitT = 0.37;
  const inserted = applyPathNetworkTransaction(original, {
    operations: [{
      type: 'insert-node',
      segmentId: beforeSegment.id,
      curveT: splitT,
      preserveCurve: true,
      curveAuthority: beforeSegment.curveAuthority,
      node: { id: 'inserted', position: [999, 999, 999] }
    }]
  }).network;
  const compiledAfter = compilePathNetwork(inserted, { spacing: 0.15, tolerance: 0.001 });
  const first = compiledAfter.segments.find(segment => segment.id === beforeSegment.id);
  const second = compiledAfter.segments.find(segment => segment.fromNode === 'inserted');
  const maximumDeviation = maximumExactSplitDeviation(
    beforeSegment.curveAuthority,
    first.curveAuthority,
    second.curveAuthority,
    splitT
  );
  assert.ok(maximumDeviation <= 0.01, `automatic junction-adjacent insertion deviated ${maximumDeviation} m`);
  assert.equal(first.curveAuthority.source, 'segment-local');
  assert.equal(second.curveAuthority.source, 'segment-local');
  assert.equal(inserted.nodes.find(node => node.id === 'inserted').heightMode, 'absolute');

  assert.throws(() => applyPathNetworkTransaction(original, {
    operations: [{
      type: 'insert-node',
      segmentId: beforeSegment.id,
      curveT: splitT,
      preserveCurve: true,
      curveAuthority: { ...beforeSegment.curveAuthority, sourceRevision: original.revision + 1 },
      node: { id: 'stale', position: [0, 0, 0] }
    }]
  }), /does not match current Path Network revision/);
});

test('segment-local curve authority reverses exactly and direct handle edits invalidate it', () => {
  const original = normalizePathNetwork({
    id: 'local-authority-lifecycle',
    engineering: { maxGradePercent: 100 },
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 3, 9], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      curveControl: { fromHandle: [7, 4, -2], toHandle: [-6, -2, -3] }
    }]
  });
  const authority = compilePathNetwork(original).segments[0].curveAuthority;
  const reversed = applyPathNetworkTransaction(original, {
    operations: [{ type: 'reverse-network' }]
  }).network;
  const reversedAuthority = compilePathNetwork(reversed).segments[0].curveAuthority;
  let maximumReverseDeviation = 0;
  for (let index = 0; index <= 100; index += 1) {
    const t = index / 100;
    const expected = cubicAuthorityPoint(authority, 1 - t);
    const actual = cubicAuthorityPoint(reversedAuthority, t);
    maximumReverseDeviation = Math.max(
      maximumReverseDeviation,
      Math.hypot(...actual.map((value, axis) => value - expected[axis]))
    );
  }
  assert.ok(maximumReverseDeviation <= 1e-9, `reversal deviated ${maximumReverseDeviation} m`);

  const edited = applyPathNetworkTransaction(original, {
    operations: [{
      type: 'set-node-handles',
      nodeId: 'a',
      handleMode: 'free',
      incomingHandle: [-2, 0, 0],
      outgoingHandle: [4, 1, 0]
    }]
  }).network;
  assert.equal(edited.segments[0].curveControl, null);
});

test('separate paths merge into one validated branch junction without mutating either input', () => {
  const target = normalizePathNetwork({
    id: 'main-road',
    revision: 7,
    nodes: [
      { id: 'west', position: [-20, 0, 0], heightMode: 'terrain' },
      { id: 'east', position: [20, 0, 0], heightMode: 'terrain' }
    ],
    segments: [{ id: 'main', fromNode: 'west', toNode: 'east', curveType: 'linear' }]
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
  assert.equal(result.network.nodes.length, 4);
  assert.equal(result.network.segments.length, 3);
  assert.equal(degrees.get(result.junctionNodeId), 3);
  assert.equal(result.importedNodeCount, 1);
  assert.equal(result.importedSegmentCount, 1);
  assert.deepEqual(junction.position, [0, 1.5, 0]);
  assert.equal(junction.heightMode, 'offset');
  assert.equal(junction.heightOffset, 1.5);
  assert.deepEqual(target, targetBefore);
  assert.deepEqual(source, sourceBefore);
  assert.throws(() => mergePathNetworksAtSegment(target, {
    ...source,
    nodes: source.nodes.map(node => ({ ...node, position: node.position.map((value, index) => value + (index === 0 ? 500 : 0)) }))
  }, {
    targetSegmentId: 'main',
    junctionPosition: [0, 0, 0],
    sourceNodeId: 'branch-end'
  }), /exceeding the .* join safety limit/);
});

test('merging cannot change locked target or source topology', () => {
  const target = normalizePathNetwork({
    id: 'locked-merge-target',
    nodes: [
      { id: 'west', position: [-10, 0, 0], locked: true },
      { id: 'east', position: [10, 0, 0] }
    ],
    segments: [{ id: 'main', fromNode: 'west', toNode: 'east' }]
  });
  const source = normalizePathNetwork({
    id: 'locked-merge-source',
    nodes: [
      { id: 'branch-end', position: [-10, 0, 0] },
      { id: 'branch-start', position: [-10, 0, 8] }
    ],
    segments: [{ id: 'branch', fromNode: 'branch-start', toNode: 'branch-end' }]
  });
  assert.throws(() => mergePathNetworksAtSegment(target, source, {
    targetSegmentId: 'main',
    junctionPosition: [-10, 0, 0],
    sourceNodeId: 'branch-end'
  }), /node west is locked/);

  const unlockedTarget = normalizePathNetwork({
    ...structuredClone(target),
    nodes: target.nodes.map(node => ({ ...node, locked: false }))
  });
  const lockedSource = normalizePathNetwork({
    ...structuredClone(source),
    nodes: source.nodes.map(node => node.id === 'branch-start' ? { ...node, locked: true } : node)
  });
  assert.throws(() => mergePathNetworksAtSegment(unlockedTarget, lockedSource, {
    targetSegmentId: 'main',
    junctionPosition: [-10, 0, 0],
    sourceNodeId: 'branch-end'
  }), /node branch-start is locked/);
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
        node: { id: 'approach', position: [10, 0, 8] }
      },
      {
        type: 'add-node',
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

test('path transactions apply city cross-sections atomically and undo to dirt defaults', () => {
  const original = normalizePathNetwork({
    id: 'street-profile',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [20, 0, 0] }
    ],
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b' }]
  });
  const result = applyPathNetworkTransaction(original, {
    label: 'Apply city local street',
    operations: [{
      type: 'set-segment-cross-section',
      segmentId: 'ab',
      profileId: 'city-local-street',
      crossSectionProfile: { sidewalkLeftWidth: 2.2 }
    }]
  });
  assert.equal(original.segments[0].crossSectionProfile.profileId, 'dirt-road');
  assert.equal(original.segments[0].crossSectionProfile.sidewalkLeftWidth, 0);
  assert.equal(result.network.segments[0].crossSectionProfile.profileId, 'city-local-street');
  assert.equal(result.network.segments[0].crossSectionProfile.sidewalkLeftWidth, 2.2);
  assert.ok(result.network.segments[0].crossSectionProfile.sidewalkRightWidth > 0);
  assert.deepEqual(result.inverse.replaceNetwork, original);
});

test('manual cross-section edits preserve the selected profile and reject unknown profiles', () => {
  const network = normalizePathNetwork({
    id: 'street-profile',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [20, 0, 0] }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      crossSectionProfile: { profileId: 'city-local-street' }
    }]
  });
  const edited = applyPathNetworkTransaction(network, {
    operations: [{
      type: 'set-segment-cross-section',
      segmentId: 'ab',
      crossSectionProfile: { sidewalkRightWidth: 2.6 }
    }]
  });
  assert.equal(edited.network.segments[0].crossSectionProfile.profileId, 'city-local-street');
  assert.equal(edited.network.segments[0].crossSectionProfile.sidewalkRightWidth, 2.6);
  assert.throws(() => applyPathNetworkTransaction(network, {
    operations: [{
      type: 'set-segment-cross-section',
      segmentId: 'ab',
      profileId: 'placeholder-street'
    }]
  }), /Unknown path cross-section profile/);
});

test('mixed network defaults and explicit segment profiles normalize without preset leakage', () => {
  const network = normalizePathNetwork({
    id: 'mixed-street-profiles',
    defaults: {
      crossSectionProfile: {
        profileId: 'city-local-street',
        width: 8.4,
        sidewalkLeftWidth: 2.5
      }
    },
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [20, 0, 0] },
      { id: 'c', position: [40, 0, 0] }
    ],
    segments: [
      { id: 'inherits-city', fromNode: 'a', toNode: 'b' },
      {
        id: 'explicit-dirt',
        fromNode: 'b',
        toNode: 'c',
        crossSectionProfile: { profileId: 'dirt-road', width: 4.5 }
      }
    ]
  });
  const inherited = network.segments.find(segment => segment.id === 'inherits-city').crossSectionProfile;
  const dirt = network.segments.find(segment => segment.id === 'explicit-dirt').crossSectionProfile;
  assert.equal(inherited.profileId, 'city-local-street');
  assert.equal(inherited.width, 8.4);
  assert.equal(inherited.sidewalkLeftWidth, 2.5);
  assert.equal(dirt.profileId, 'dirt-road');
  assert.equal(dirt.width, 4.5);
  assert.equal(dirt.curbStyle, 'none');
  assert.equal(dirt.gutterWidth, 0);
  assert.equal(dirt.sidewalkLeftWidth, 0);
});

test('mixed cross-section profiles remain stable through a save-like JSON roundtrip', () => {
  const first = normalizePathNetwork({
    id: 'saved-street-profiles',
    defaults: {
      crossSectionProfile: { profileId: 'dirt-road', width: 3.8 }
    },
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [20, 0, 0] },
      { id: 'c', position: [40, 0, 0] }
    ],
    segments: [
      { id: 'inherits-dirt', fromNode: 'a', toNode: 'b' },
      {
        id: 'explicit-city',
        fromNode: 'b',
        toNode: 'c',
        crossSectionProfile: {
          profileId: 'city-local-street',
          sidewalkRightWidth: 2.3,
          curbHeight: 0.21
        }
      }
    ]
  });
  const saved = JSON.parse(JSON.stringify(first));
  const reloaded = normalizePathNetwork(saved);
  assert.deepEqual(reloaded, first);
  const city = reloaded.segments.find(segment => segment.id === 'explicit-city').crossSectionProfile;
  assert.equal(city.width, 7);
  assert.equal(city.shoulderWidth, 0);
  assert.equal(city.sidewalkRightWidth, 2.3);
  assert.equal(city.curbHeight, 0.21);
});
