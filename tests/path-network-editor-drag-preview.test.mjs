import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePathNodeDragGesture,
  createPathNodeDragGesture,
  createPathNodeDragPreview,
  pathNodeFromDragPreview,
  shouldCommitPathNodeDragGesture,
  updatePathNodeDragPreview
} from '../app/path-network/editor-drag-preview.js';

function pathObject() {
  return {
    id: 'path-main',
    type: 'path',
    visible: true,
    properties: {
      previewRevision: 3,
      pathNetwork: {
        revision: 7,
        nodes: [
          { id: 'a', position: [0, 2, 0], heightMode: 'terrain', heightOffset: 0 },
          { id: 'b', position: [10, 4, 5], heightMode: 'absolute', heightOffset: 0 }
        ],
        segments: [{ id: 'ab', fromNode: 'a', toNode: 'b' }]
      }
    }
  };
}

test('node drag preview never mutates the authoritative path object', () => {
  const source = pathObject();
  const before = structuredClone(source);
  const preview = createPathNodeDragPreview(source, 'a');
  const node = updatePathNodeDragPreview(preview, 'a', {
    position: [6, 12, -3],
    heightMode: 'absolute',
    heightOffset: 0
  });
  assert.deepEqual(source, before);
  assert.deepEqual(node.position, [6, 12, -3]);
  assert.equal(node.heightMode, 'absolute');
  assert.equal(preview.properties.pathNetwork.revision, 7);
  assert.equal(preview.properties.previewOnly, true);
  assert.equal(preview.properties.previewRevision, 5);
});

test('node drag preview exposes the final candidate for one release transaction', () => {
  const preview = createPathNodeDragPreview(pathObject(), 'b');
  updatePathNodeDragPreview(preview, 'b', { position: [12, 9, 8] });
  updatePathNodeDragPreview(preview, 'b', { position: [14, 11, 9] });
  const candidate = pathNodeFromDragPreview(preview, 'b');
  assert.deepEqual(candidate.position, [14, 11, 9]);
  assert.equal(candidate.heightMode, 'absolute');
  assert.throws(() => updatePathNodeDragPreview(preview, 'missing', { position: [0, 0, 0] }), /does not exist/);
});

test('a node click never becomes a path transaction without an intentional drag', () => {
  const gesture = createPathNodeDragGesture({ pointerId: 7, clientX: 500, clientY: 320 });
  assert.equal(
    shouldCommitPathNodeDragGesture(gesture, { pointerId: 7 }),
    false
  );
  assert.equal(
    advancePathNodeDragGesture(gesture, {
      pointerId: 7,
      clientX: 502,
      clientY: 321,
      buttons: 1
    }).accepted,
    false
  );
  assert.equal(
    shouldCommitPathNodeDragGesture(gesture, { pointerId: 7 }),
    false
  );
});

test('viewport mouse movement without the primary button cancels an armed node drag', () => {
  const gesture = createPathNodeDragGesture({ pointerId: 3, clientX: 400, clientY: 250 });
  const result = advancePathNodeDragGesture(gesture, {
    pointerId: 3,
    clientX: 520,
    clientY: 300,
    buttons: 0
  });
  assert.deepEqual(result, { accepted: false, active: false, cancel: true });
  assert.equal(shouldCommitPathNodeDragGesture(gesture, { pointerId: 3 }), false);
});

test('only the active primary pointer can commit a deliberate node drag', () => {
  const gesture = createPathNodeDragGesture({
    pointerId: 11,
    clientX: 100,
    clientY: 100,
    vertical: true
  });
  const result = advancePathNodeDragGesture(gesture, {
    pointerId: 11,
    clientX: 100,
    clientY: 112,
    buttons: 1
  });
  assert.equal(result.accepted, true);
  assert.equal(gesture.vertical, true);
  assert.equal(shouldCommitPathNodeDragGesture(gesture, { pointerId: 12 }), false);
  assert.equal(shouldCommitPathNodeDragGesture(gesture, { pointerId: 11 }), true);
});
