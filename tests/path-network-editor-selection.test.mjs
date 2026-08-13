import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPathNodeGroupPreview,
  pathNodeGroupMoveOperations,
  prunePathNodeSelection,
  togglePathNodeSelection,
  updatePathNodeGroupPreview
} from '../app/path-network/editor-selection.js';
import { applyPathNetworkTransaction } from '../app/path-network/transactions.js';
import { normalizePathNetwork } from '../app/path-network/model.js';

function network() {
  return normalizePathNetwork({
    id: 'editor-road',
    nodes: [
      { id: 'a', position: [0, 2, 0], heightMode: 'terrain', heightOffset: 0 },
      { id: 'b', position: [10, 4, 5], heightMode: 'offset', heightOffset: 1.5 },
      { id: 'c', position: [20, 8, 9], heightMode: 'absolute', heightOffset: 0 }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'bc', fromNode: 'b', toNode: 'c' }
    ]
  });
}

function pathObject() {
  return {
    id: 'editor-road',
    type: 'path',
    properties: { previewRevision: 4, pathNetwork: network() }
  };
}

test('stable-id selection prunes removed ids and preserves a valid primary across graph order changes', () => {
  const source = network();
  const selection = prunePathNodeSelection(source, {
    nodeIds: ['c', 'missing', 'a', 'c'],
    primaryNodeId: 'a'
  });
  assert.deepEqual(selection, { nodeIds: ['c', 'a'], primaryNodeId: 'a' });

  source.nodes.reverse();
  assert.deepEqual(
    prunePathNodeSelection(source, selection),
    { nodeIds: ['c', 'a'], primaryNodeId: 'a' }
  );
  source.nodes = source.nodes.filter(node => node.id !== 'a');
  assert.deepEqual(
    prunePathNodeSelection(source, selection),
    { nodeIds: ['c'], primaryNodeId: 'c' }
  );
});

test('normal selection replaces while Ctrl/Cmd-style additive selection toggles stable ids', () => {
  const source = network();
  let selection = togglePathNodeSelection(source, {}, 'a');
  assert.deepEqual(selection, { nodeIds: ['a'], primaryNodeId: 'a' });
  selection = togglePathNodeSelection(source, selection, 'c', { additive: true });
  assert.deepEqual(selection, { nodeIds: ['a', 'c'], primaryNodeId: 'c' });
  selection = togglePathNodeSelection(source, selection, 'c', { additive: true });
  assert.deepEqual(selection, { nodeIds: ['a'], primaryNodeId: 'a' });
  assert.deepEqual(togglePathNodeSelection(source, selection, 'missing', { additive: true }), selection);
});

test('horizontal group preview preserves height authority, spacing, and authoritative input', () => {
  const source = pathObject();
  const before = structuredClone(source);
  const preview = createPathNodeGroupPreview(source, {
    nodeIds: ['a', 'b', 'c'],
    primaryNodeId: 'b'
  }, { resolveEffectivePosition: node => [node.position[0], 100 + node.position[0], node.position[2]] });
  const updated = updatePathNodeGroupPreview(preview, { deltaX: 7, deltaZ: -3 });
  assert.deepEqual(source, before);
  assert.deepEqual(updated.map(node => node.position), [[7, 2, -3], [17, 4, 2], [27, 8, 6]]);
  assert.deepEqual(updated.map(node => node.heightMode), ['terrain', 'offset', 'absolute']);
  assert.deepEqual(updated.map(node => node.heightOffset), [0, 1.5, 0]);
  assert.equal(preview.previewPath.properties.previewRevision, 6);
});

test('vertical group preview starts at resolved world heights and emits one atomic transaction batch', () => {
  const source = pathObject();
  const preview = createPathNodeGroupPreview(source, ['a', 'b', 'c'], {
    resolveEffectivePosition: node => {
      if (node.id === 'a') return [0, 20, 0];
      if (node.id === 'b') return [10, 31.5, 5];
      return [...node.position];
    }
  });
  updatePathNodeGroupPreview(preview, { deltaY: 2.25, vertical: true });
  const operations = pathNodeGroupMoveOperations(preview);
  assert.equal(operations.length, 3);
  assert.deepEqual(operations.map(operation => operation.position[1]), [22.25, 33.75, 10.25]);
  assert.ok(operations.every(operation => operation.heightMode === 'absolute'));
  assert.ok(operations.every(operation => operation.heightOffset === 0));

  const result = applyPathNetworkTransaction(source.properties.pathNetwork, {
    id: 'group-move',
    label: 'Raise selected nodes',
    operations
  });
  assert.equal(result.network.revision, source.properties.pathNetwork.revision + 1);
  assert.deepEqual(result.network.nodes.map(node => node.position[1]), [22.25, 33.75, 10.25]);
  assert.deepEqual(result.inverse.replaceNetwork, source.properties.pathNetwork);
});

test('group preview rejects empty or stale-only selection', () => {
  assert.throws(
    () => createPathNodeGroupPreview(pathObject(), ['missing']),
    /at least one valid path node/
  );
});
