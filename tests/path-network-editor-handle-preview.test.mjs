import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePathHandleVectors,
  intersectPathHandleRayCameraPlane,
  intersectPathHandleRayHorizontalPlane,
  intersectPathHandleRayPlane,
  pathHandleEndpoints,
  previewPathHandleDrag,
  resolvePathNodePosition
} from '../app/path-network/editor-handle-preview.js';

test('effective node and endpoint positions respect terrain, offset, absolute, and suggested handles', () => {
  const terrain = { position: [3, 99, 5], heightMode: 'terrain', heightOffset: 7 };
  const offset = { position: [3, 99, 5], heightMode: 'offset', heightOffset: 2 };
  const absolute = { position: [3, 9, 5], heightMode: 'absolute', heightOffset: 20 };
  assert.deepEqual(resolvePathNodePosition(terrain, { terrainHeightAt: () => 11 }), [3, 11, 5]);
  assert.deepEqual(resolvePathNodePosition(offset, { terrainHeightAt: () => 11 }), [3, 13, 5]);
  assert.deepEqual(resolvePathNodePosition(absolute, { terrainHeightAt: () => 11 }), [3, 9, 5]);

  const endpoints = pathHandleEndpoints(offset, {
    terrainHeightAt: () => 11,
    suggestedHandles: { incomingHandle: [-2, 1, 0], outgoingHandle: [4, 0, 3] }
  });
  assert.deepEqual(endpoints.position, [3, 13, 5]);
  assert.deepEqual(endpoints.incoming, [1, 14, 5]);
  assert.deepEqual(endpoints.outgoing, [7, 13, 8]);
  assert.deepEqual(effectivePathHandleVectors(offset, {
    incomingHandle: [-2, 1, 0], outgoingHandle: [4, 0, 3]
  }), { incomingHandle: [-2, 1, 0], outgoingHandle: [4, 0, 3] });
});

test('ray intersection supports camera-facing and horizontal drag planes and rejects unusable rays', () => {
  assert.deepEqual(
    intersectPathHandleRayPlane(
      { origin: [0, 0, 10], dir: [0.5, 0, -1] },
      [0, 0, 0],
      [0, 0, 1]
    ),
    [5, 0, 0]
  );
  assert.deepEqual(
    intersectPathHandleRayCameraPlane(
      { origin: [0, 0, 10], dir: [0.5, 0, -1] },
      [0, 0, 0],
      [0, 0, 1]
    ),
    [5, 0, 0]
  );
  assert.deepEqual(
    intersectPathHandleRayHorizontalPlane(
      { origin: [2, 10, 4], dir: [1, -2, 0.5] },
      4
    ),
    [5, 4, 5.5]
  );
  assert.equal(
    intersectPathHandleRayHorizontalPlane({ origin: [0, 1, 0], dir: [1, 0, 0] }, 4),
    null
  );
  assert.equal(
    intersectPathHandleRayHorizontalPlane({ origin: [0, 1, 0], dir: [0, 1, 0] }, -2),
    null
  );
});

test('free handle preview moves one endpoint without disturbing the opposite vector', () => {
  const node = {
    position: [10, 5, 20],
    handleMode: 'free',
    incomingHandle: [-4, 0, 0],
    outgoingHandle: [3, 1, 0]
  };
  const preview = previewPathHandleDrag({
    node,
    nodePosition: node.position,
    side: 'outgoing',
    worldPoint: [12, 8, 24]
  });
  assert.deepEqual(preview.incomingHandle, [-4, 0, 0]);
  assert.deepEqual(preview.outgoingHandle, [2, 3, 4]);
  assert.deepEqual(preview.endpoints.outgoing, [12, 8, 24]);
  assert.deepEqual(node.outgoingHandle, [3, 1, 0]);
});

test('aligned preview mirrors direction while preserving the opposite handle length', () => {
  const node = {
    position: [0, 0, 0],
    handleMode: 'aligned',
    incomingHandle: [-6, 0, 0],
    outgoingHandle: [3, 0, 0]
  };
  const fromOutgoing = previewPathHandleDrag({
    node,
    nodePosition: [0, 0, 0],
    side: 'outgoing',
    worldPoint: [0, 0, 4]
  });
  assert.deepEqual(fromOutgoing.outgoingHandle, [0, 0, 4]);
  assert.deepEqual(fromOutgoing.incomingHandle, [0, 0, -6]);

  const fromIncoming = previewPathHandleDrag({
    node,
    nodePosition: [0, 0, 0],
    side: 'incoming',
    worldPoint: [-3, 4, 0]
  });
  assert.deepEqual(fromIncoming.incomingHandle, [-3, 4, 0]);
  assert.ok(Math.abs(fromIncoming.outgoingHandle[0] - 1.8) < 1e-12);
  assert.ok(Math.abs(fromIncoming.outgoingHandle[1] + 2.4) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...fromIncoming.outgoingHandle) - 3) < 1e-12);
});

test('viewport handle preview rejects automatic modes and collapsed endpoints', () => {
  const node = { position: [0, 0, 0], handleMode: 'automatic' };
  assert.throws(
    () => previewPathHandleDrag({ node, side: 'outgoing', worldPoint: [1, 0, 0] }),
    /requires free or aligned/
  );
  assert.throws(
    () => previewPathHandleDrag({
      node: { ...node, handleMode: 'free' },
      side: 'outgoing',
      worldPoint: [0, 0, 0]
    }),
    /non-zero length/
  );
});
