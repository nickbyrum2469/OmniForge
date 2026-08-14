import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCompiledCurveAuthority,
  nearestCompiledScreenStation
} from '../app/path-network/editor-screen-picking.js';

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

test('screen picker evaluates exact curve authority instead of treating resampled chords as the spline', () => {
  const curved = {
    segments: [{
      id: 'curve',
      curveAuthority: {
        start: [0, 0, 0], end: [10, 0, 0],
        fromHandle: [0, 8, 0], toHandle: [0, 8, 0]
      },
      samples: [
        { t: 0, position: [0, 0, 0], baseY: 0 },
        { t: 1, position: [10, 0, 0], baseY: 0 }
      ]
    }]
  };
  const nearest = nearestCompiledScreenStation(curved, {
    clientX: 50,
    clientY: 100,
    worldToScreen: position => ({ visible: true, x: position[0] * 10, y: 100 - position[1], depth: 0 })
  });
  assert.deepEqual(nearest.curvePosition, evaluateCompiledCurveAuthority(curved.segments[0].curveAuthority, 0.5));
  assert.ok(Math.abs(nearest.curvePosition[1] - nearest.position[1]) > 1);
  assert.equal(nearest.baseY, 0);
});

test('screen picker resolves an overlapping front segment instead of hidden iteration order', () => {
  const overlapping = {
    segments: [
      { id: 'far', samples: [{ t: 0, position: [0, 0, 0] }, { t: 1, position: [10, 0, 0] }] },
      { id: 'near', samples: [{ t: 0, position: [0, 0, 1] }, { t: 1, position: [10, 0, 1] }] }
    ]
  };
  const nearest = nearestCompiledScreenStation(overlapping, {
    clientX: 50,
    clientY: 100,
    rayFromScreen: () => ({ origin: [5, 0, 10], dir: [0, 0, -1] }),
    worldToScreen: position => ({ visible: true, x: position[0] * 10, y: 100, depth: position[2] ? -0.25 : 0.5 })
  });
  assert.equal(nearest.segmentId, 'near');
  assert.equal(nearest.depth, 9);
});

test('screen picker uses the camera ray for perspective-correct world interpolation', () => {
  const perspective = {
    segments: [{
      id: 'foreshortened',
      samples: [
        { t: 0.2, position: [0, 0, 2], baseY: 0 },
        { t: 0.8, position: [10, 0, 10], baseY: 4 }
      ]
    }]
  };
  const nearest = nearestCompiledScreenStation(perspective, {
    clientX: 50,
    clientY: 100,
    rayFromScreen: (x, y) => ({ origin: [0, 0, 0], dir: [x / 100, (100 - y) / 100, 1] }),
    worldToScreen: position => ({
      visible: true,
      x: position[0] / position[2] * 100,
      y: 100 - position[1] / position[2] * 100,
      depth: position[2]
    })
  });
  assert.ok(Math.abs(nearest.localT - (1 / 6)) < 1e-8);
  assert.ok(Math.abs(nearest.localT - 0.5) > 0.3);
  assert.ok(nearest.depth > 0);
  assert.equal(nearest.position[0], nearest.localT * 10);
});
