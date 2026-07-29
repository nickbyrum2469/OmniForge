import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork, nearestCompiledStation } from '../app/path-network/compiler.js';

const flatHeight = () => 0;
const flatNormal = () => [0, 1, 0];

function network(overrides = {}) {
  return normalizePathNetwork({
    id: 'test-road',
    revision: 4,
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 0, 12], heightMode: 'absolute' },
      { id: 'c', position: [45, 2, 0], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b', curveType: 'hermite' },
      { id: 'bc', fromNode: 'b', toNode: 'c', curveType: 'hermite' }
    ],
    ...overrides
  });
}

test('compiler preserves exact anchors and produces near-uniform arc-length stations', () => {
  const compiled = compilePathNetwork(network(), {
    terrainHeightAt: flatHeight,
    terrainNormalAt: flatNormal,
    spacing: 0.5
  });
  assert.deepEqual(compiled.segments[0].samples[0].position, [0, 0, 0]);
  assert.deepEqual(compiled.segments[0].samples.at(-1).position, [20, 0, 12]);
  assert.deepEqual(compiled.segments[1].samples[0].position, [20, 0, 12]);
  assert.deepEqual(compiled.segments[1].samples.at(-1).position, [45, 2, 0]);
  const distances = compiled.segments[0].samples.slice(1).map((sample, index) => {
    const previous = compiled.segments[0].samples[index];
    return Math.hypot(
      sample.position[0] - previous.position[0],
      sample.position[1] - previous.position[1],
      sample.position[2] - previous.position[2]
    );
  });
  const average = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  assert.ok(Math.max(...distances.map(value => Math.abs(value - average))) < 0.025);
  assert.equal(compiled.sourceRevision, 4);
});

test('parallel-transport side frames remain finite and never flip', () => {
  const compiled = compilePathNetwork(network(), {
    terrainHeightAt: flatHeight,
    terrainNormalAt: flatNormal,
    spacing: 0.35
  });
  for (const segment of compiled.segments) {
    for (let index = 0; index < segment.samples.length; index += 1) {
      const sample = segment.samples[index];
      assert.ok([...sample.tangent, ...sample.side, ...sample.normal].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...sample.side) - 1) < 1e-6);
      if (index > 0) {
        const previous = segment.samples[index - 1].side;
        const dot = sample.side[0] * previous[0] + sample.side[1] * previous[1] + sample.side[2] * previous[2];
        assert.ok(dot >= 0, `side frame flipped at sample ${index}`);
      }
    }
  }
});

test('ordinary two-arm nodes share one exact road cross-section frame', () => {
  const compiled = compilePathNetwork(network(), {
    terrainHeightAt: flatHeight,
    terrainNormalAt: flatNormal,
    spacing: 0.35
  });
  const incoming = compiled.segments[0].samples.at(-1);
  const outgoing = compiled.segments[1].samples[0];
  assert.deepEqual(incoming.position, outgoing.position);
  assert.deepEqual(incoming.side, outgoing.side);
  assert.deepEqual(incoming.normal, outgoing.normal);
  assert.equal(compiled.diagnostics.twoArmConnectionCount, 1);
  const halfWidth = compiled.segments[0].crossSectionProfile.width * 0.5;
  for (const sign of [-1, 1]) {
    const firstEdge = incoming.position.map((value, index) => value + incoming.side[index] * halfWidth * sign);
    const secondEdge = outgoing.position.map((value, index) => value + outgoing.side[index] * halfWidth * sign);
    assert.ok(Math.hypot(...firstEdge.map((value, index) => value - secondEdge[index])) < 0.01);
  }
});

test('Civil Assist does not turn sub-drainage profile correction into broad earthwork', () => {
  const input = normalizePathNetwork({
    id: 'minor-profile-correction',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [30, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'road',
      fromNode: 'a',
      toNode: 'b',
      crossSectionProfile: { shoulderDrop: 0.08, ditchDepth: 0.2 }
    }]
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: x => 0.2 * Math.sin(x / 5),
    terrainNormalAt: flatNormal,
    spacing: 0.35
  });
  assert.ok(Math.max(
    compiled.segments[0].metrics.maximumCut,
    compiled.segments[0].metrics.maximumFill
  ) > 0.15);
  assert.equal(compiled.segments[0].construction.mode, 'conform');
});

test('terrain, offset, and absolute nodes resolve through one compiler', () => {
  const input = normalizePathNetwork({
    id: 'height-modes',
    nodes: [
      { id: 'terrain', position: [0, 99, 0], heightMode: 'terrain' },
      { id: 'offset', position: [10, 99, 0], heightMode: 'offset', heightOffset: 3 },
      { id: 'absolute', position: [20, 12, 0], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'one', fromNode: 'terrain', toNode: 'offset' },
      { id: 'two', fromNode: 'offset', toNode: 'absolute' }
    ],
    engineering: { maxGradePercent: 100 }
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: x => x * 0.2 + 2,
    terrainNormalAt: flatNormal
  });
  assert.deepEqual(compiled.nodes.map(node => node.resolvedPosition[1]), [2, 7, 12]);
});

test('Civil Assist selects conform, bridge, tunnel, retaining wall, stairs, and locked modes deterministically', () => {
  const compile = ({ endY = 0, terrain = () => 0, normal = flatNormal, vehicleClass = 'mixed', lockedMode = null }) => {
    const input = normalizePathNetwork({
      id: `civil-${endY}-${lockedMode || 'auto'}`,
      nodes: [
        { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
        { id: 'b', position: [30, endY, 0], heightMode: 'absolute' }
      ],
      segments: [{
        id: 'road',
        fromNode: 'a',
        toNode: 'b',
        constructionMode: lockedMode || 'auto',
        constructionLocked: Boolean(lockedMode),
        gameplayRules: { vehicleClass }
      }],
      engineering: {
        maxGradePercent: 15,
        bridgeThreshold: 5,
        tunnelThreshold: 8,
        retainingWallThreshold: 3.5
      }
    });
    return compilePathNetwork(input, { terrainHeightAt: terrain, terrainNormalAt: normal }).segments[0].construction.mode;
  };
  assert.equal(compile({}), 'conform');
  assert.equal(compile({ terrain: () => -7 }), 'bridge');
  assert.equal(compile({ terrain: () => 10 }), 'tunnel');
  assert.equal(compile({ normal: () => [0.8, 0.6, 0] }), 'retaining-wall');
  assert.equal(compile({ endY: 12, vehicleClass: 'pedestrian' }), 'stairs');
  assert.equal(compile({ lockedMode: 'bridge' }), 'bridge');
});

test('unavoidable vehicle grade is reported invalid instead of silently violating limits', () => {
  const input = normalizePathNetwork({
    id: 'cliff-road',
    nodes: [
      { id: 'low', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'high', position: [10, 20, 0], heightMode: 'absolute' }
    ],
    segments: [{ id: 'cliff', fromNode: 'low', toNode: 'high' }],
    engineering: { maxGradePercent: 10 }
  });
  const compiled = compilePathNetwork(input, { terrainHeightAt: flatHeight, terrainNormalAt: flatNormal });
  assert.equal(compiled.segments[0].construction.mode, 'invalid');
  assert.equal(compiled.diagnostics.valid, false);
  assert.ok(compiled.diagnostics.maximumGradePercent > 10);
});

test('branch nodes become deterministic junctions and nearest queries use compiled geometry', () => {
  const input = normalizePathNetwork({
    id: 'junction',
    nodes: [
      { id: 'center', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'west', position: [-20, 0, 0], heightMode: 'absolute' },
      { id: 'east', position: [20, 0, 0], heightMode: 'absolute' },
      { id: 'north', position: [0, 0, -20], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'w', fromNode: 'west', toNode: 'center' },
      { id: 'e', fromNode: 'center', toNode: 'east' },
      { id: 'n', fromNode: 'center', toNode: 'north' }
    ]
  });
  const compiled = compilePathNetwork(input, { terrainHeightAt: flatHeight, terrainNormalAt: flatNormal });
  assert.equal(compiled.junctions.length, 1);
  assert.equal(compiled.junctions[0].nodeId, 'center');
  assert.deepEqual(compiled.junctions[0].arms.map(arm => arm.segmentId).sort(), ['e', 'n', 'w']);
  const nearest = nearestCompiledStation(compiled, [9, 0, 1]);
  assert.equal(nearest.segmentId, 'e');
  assert.ok(nearest.distance < 1.1);
});
