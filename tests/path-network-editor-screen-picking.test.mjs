import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestCompiledScreenStation } from '../app/path-network/editor-screen-picking.js';

const compiled = {
  segments: [{
    id: 'bridge-span',
    samples: [
      { t: 0, position: [0, 8, 0] },
      { t: 0.5, position: [5, 10, 0] },
      { t: 1, position: [10, 8, 0] }
    ]
  }]
};
const project = position => ({ visible: true, x: position[0] * 10, y: 100 - position[1] });

test('screen picker resolves the exact visible compiled station without terrain authority', () => {
  const nearest = nearestCompiledScreenStation(compiled, {
    clientX: 52,
    clientY: 91,
    worldToScreen: project,
    maximumDistancePixels: 12
  });
  assert.equal(nearest.segmentId, 'bridge-span');
  assert.ok(nearest.curveT > 0.5 && nearest.curveT < 1);
  assert.ok(nearest.distancePixels < 3);
  assert.equal(nearest.position.length, 3);
});

test('screen picker rejects clicks outside the deliberate spline hit radius', () => {
  assert.equal(nearestCompiledScreenStation(compiled, {
    clientX: 52,
    clientY: 150,
    worldToScreen: project,
    maximumDistancePixels: 12
  }), null);
});

test('screen picker ignores clipped samples and malformed projection state', () => {
  assert.equal(nearestCompiledScreenStation(compiled, {
    clientX: 52,
    clientY: 91,
    worldToScreen: () => ({ visible: false, x: 0, y: 0 })
  }), null);
  assert.equal(nearestCompiledScreenStation(compiled, { clientX: 0, clientY: 0 }), null);
});
