import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPathNodeDragPreview,
  pathNodeFromDragPreview,
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
