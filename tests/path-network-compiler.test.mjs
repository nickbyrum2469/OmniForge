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

test('automatic dead-end tangents approach endpoints without overshoot or loopback', () => {
  const input = normalizePathNetwork({
    id: 'dead-end-tangent-direction',
    nodes: [
      { id: 'start', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'end', position: [20, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'road',
      fromNode: 'start',
      toNode: 'end',
      curveType: 'hermite',
      crossSectionProfile: { width: 4, blendDistance: 4 }
    }],
    engineering: { maxGradePercent: 100 }
  });
  const samples = compilePathNetwork(input, {
    terrainHeightAt: flatHeight,
    terrainNormalAt: flatNormal,
    spacing: 0.25
  }).segments[0].samples;

  assert.deepEqual(samples[0].position, [0, 0, 0]);
  assert.deepEqual(samples.at(-1).position, [20, 0, 0]);
  assert.ok(samples.every(sample => sample.position[0] >= 0 && sample.position[0] <= 20));
  assert.ok(samples.slice(1).every((sample, index) => (
    sample.position[0] > samples[index].position[0]
  )));
  assert.ok(Math.max(...samples.map(sample => Math.abs(sample.curvature))) < 1e-6);
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

test('terrain-mode dirt paths follow the natural profile instead of becoming artificial bridges', () => {
  const terrain = x => Math.sin(x / 9) * 2.4 + Math.sin(x / 3.5) * 0.35;
  const input = normalizePathNetwork({
    id: 'terrain-following-dirt-path',
    pathClass: 'dirt-road',
    nodes: [
      { id: 'a', position: [0, terrain(0), 0], heightMode: 'terrain' },
      { id: 'b', position: [48, terrain(48), 0], heightMode: 'terrain' }
    ],
    segments: [{
      id: 'trail',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      crossSectionProfile: { width: 2.2, shoulderWidth: 0.35, blendDistance: 2.5 }
    }],
    engineering: {
      maxGradePercent: 35,
      bridgeThreshold: 2,
      retainingWallThreshold: 3.5
    }
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: terrain,
    terrainNormalAt: flatNormal,
    spacing: 0.3
  });
  const segment = compiled.segments[0];
  assert.notEqual(segment.construction.mode, 'bridge');
  assert.ok(segment.metrics.maximumFill < input.engineering.bridgeThreshold);
  assert.ok(segment.metrics.maximumCut < input.engineering.retainingWallThreshold);
  assert.ok(Math.max(...segment.samples.map(sample => (
    Math.abs(sample.position[1] - sample.baseY)
  ))) < input.engineering.retainingWallThreshold);
});

test('absolute endpoints still create an intentional elevated crossing over deep terrain', () => {
  const input = normalizePathNetwork({
    id: 'intentional-raised-crossing',
    nodes: [
      { id: 'a', position: [0, 8, 0], heightMode: 'absolute' },
      { id: 'b', position: [40, 8, 0], heightMode: 'absolute' }
    ],
    segments: [{ id: 'bridge', fromNode: 'a', toNode: 'b' }],
    engineering: { bridgeThreshold: 5, maxGradePercent: 20 }
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: () => 0,
    terrainNormalAt: flatNormal,
    spacing: 0.4
  });
  assert.equal(compiled.segments[0].construction.mode, 'bridge');
});

test('Civil Assist limits an automatic bridge to the actual local gap', () => {
  const input = normalizePathNetwork({
    id: 'local-gap-crossing',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [60, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{ id: 'crossing', fromNode: 'a', toNode: 'b' }],
    engineering: {
      bridgeThreshold: 5,
      maximumBridgeSpan: 20,
      maxGradePercent: 20
    }
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: x => x >= 26 && x <= 34 ? -8 : 0,
    terrainNormalAt: flatNormal,
    spacing: 0.5
  });
  const intervals = compiled.segments[0].constructionIntervals;
  const bridges = intervals.filter(interval => interval.mode === 'bridge');
  assert.equal(bridges.length, 1);
  assert.ok(bridges[0].startDistance >= 25);
  assert.ok(bridges[0].endDistance <= 35);
  assert.ok(bridges[0].endDistance - bridges[0].startDistance < 12);
  assert.ok(intervals.some(interval => interval.mode === 'conform'));
  assert.ok(bridges[0].endDistance - bridges[0].startDistance < compiled.segments[0].metrics.length * 0.25);
});

test('Civil Assist rejects an automatic unsupported run longer than the configured bridge span', () => {
  const input = normalizePathNetwork({
    id: 'unsupported-long-crossing',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [80, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{ id: 'crossing', fromNode: 'a', toNode: 'b' }],
    engineering: {
      bridgeThreshold: 5,
      maximumBridgeSpan: 20,
      maxGradePercent: 20
    }
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: x => x >= 15 && x <= 65 ? -8 : 0,
    terrainNormalAt: flatNormal,
    spacing: 0.5
  });
  assert.equal(compiled.diagnostics.valid, false);
  assert.ok(compiled.segments[0].constructionIntervals.some(interval => (
    interval.mode === 'invalid' && interval.reason === 'bridge-run-exceeds-maximum-span'
  )));
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
  const compile = ({ endY = 0, terrain = () => 0, normal = flatNormal, vehicleClass = 'mixed', lockedMode = null, width = 3 }) => {
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
        crossSectionProfile: { width },
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
  assert.equal(compile({ normal: () => [0, 0.6, 0.8], width: 8 }), 'retaining-wall');
  assert.equal(compile({ endY: 12, vehicleClass: 'pedestrian' }), 'stairs');
  assert.equal(compile({ lockedMode: 'bridge' }), 'bridge');
});

test('Civil Assist uses actual path width and cross-slope relief instead of adding walls to every steep dirt trail', () => {
  const steepSideSlope = () => [0.8, 0.6, 0];
  const narrow = network({
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'terrain' },
      { id: 'b', position: [0, 0, 30], heightMode: 'terrain' }
    ],
    segments: [{
      id: 'trail',
      fromNode: 'a',
      toNode: 'b',
      crossSectionProfile: { width: 1.2, shoulderWidth: 0.2 }
    }]
  });
  const wide = network({
    nodes: narrow.nodes,
    segments: [{
      id: 'road',
      fromNode: 'a',
      toNode: 'b',
      crossSectionProfile: { width: 8, shoulderWidth: 1 }
    }]
  });
  const narrowCompiled = compilePathNetwork(narrow, {
    terrainHeightAt: flatHeight,
    terrainNormalAt: steepSideSlope
  });
  const wideCompiled = compilePathNetwork(wide, {
    terrainHeightAt: flatHeight,
    terrainNormalAt: steepSideSlope
  });

  assert.equal(narrowCompiled.segments[0].construction.mode, 'cut-fill');
  assert.equal(wideCompiled.segments[0].construction.mode, 'retaining-wall');
  assert.ok(
    narrowCompiled.segments[0].metrics.maximumCrossSectionRelief
    < narrow.engineering.retainingWallThreshold
  );
  assert.ok(
    wideCompiled.segments[0].metrics.maximumCrossSectionRelief
    > wide.engineering.retainingWallThreshold
  );
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
  const segment = compiled.segments[0];
  assert.equal(segment.construction.mode, 'invalid');
  assert.equal(compiled.diagnostics.valid, false);
  assert.ok(segment.metrics.unavoidableGradePercent > 190);
  assert.ok(Math.abs(segment.metrics.maximumGradePercent - segment.metrics.unavoidableGradePercent) < 1e-6);
  assert.ok(segment.samples.slice(1).every((sample, index) => {
    const previous = segment.samples[index];
    const horizontal = Math.hypot(
      sample.position[0] - previous.position[0],
      sample.position[2] - previous.position[2]
    );
    const grade = Math.abs(sample.position[1] - previous.position[1]) / horizontal * 100;
    return Math.abs(grade - segment.metrics.unavoidableGradePercent) < 1e-5;
  }));
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

test('nearest compiled station follows a handled hairpin instead of its control-point chord', () => {
  const input = normalizePathNetwork({
    id: 'handled-hairpin-insertion',
    nodes: [
      {
        id: 'curve-start',
        position: [0, 0, 0],
        heightMode: 'absolute',
        handleMode: 'free',
        outgoingHandle: [0, 0, 10]
      },
      {
        id: 'curve-end',
        position: [20, 0, 0],
        heightMode: 'absolute',
        handleMode: 'free',
        incomingHandle: [0, 0, 10]
      },
      { id: 'straight-start', position: [0, 0, 6], heightMode: 'absolute' },
      { id: 'straight-end', position: [20, 0, 6], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'curved', fromNode: 'curve-start', toNode: 'curve-end', curveType: 'hermite' },
      { id: 'straight', fromNode: 'straight-start', toNode: 'straight-end', curveType: 'linear' }
    ],
    engineering: { maxGradePercent: 100 }
  });
  const compiled = compilePathNetwork(input, {
    terrainHeightAt: flatHeight,
    terrainNormalAt: flatNormal,
    spacing: 0.15
  });
  const nearest = nearestCompiledStation(compiled, [10, 0, 7.4]);
  assert.equal(nearest.segmentId, 'curved');
  assert.ok(nearest.distance < 0.15);
  assert.ok(Math.abs(nearest.curveT - 0.5) < 0.03);
});
