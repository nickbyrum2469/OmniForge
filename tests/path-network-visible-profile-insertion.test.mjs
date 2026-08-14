import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { compilePathObjectRuntime } from '../app/path-network/runtime.js';
import { normalizePathNetwork } from '../app/path-network/model.js';
import {
  applyPathNetworkTransaction,
  duplicatePathNetwork,
  replacePathNetwork
} from '../app/path-network/transactions.js';

const lerp3 = (a, b, t) => a.map((value, axis) => value + (b[axis] - value) * t);
const distance3 = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));

function stationAtCurveT(segment, curveT) {
  const samples = segment.samples;
  if (curveT <= samples[0].t) return [...samples[0].position];
  if (curveT >= samples.at(-1).t) return [...samples.at(-1).position];
  const endIndex = samples.findIndex(sample => sample.t >= curveT);
  const start = samples[Math.max(0, endIndex - 1)];
  const end = samples[endIndex];
  const local = (curveT - start.t) / (end.t - start.t);
  return lerp3(start.position, end.position, local);
}

function splitAndCompile(network, {
  segmentId,
  splitT,
  terrainHeightAt,
  terrainRevision,
  spacing = 0.08,
  tolerance = 0.0005
}) {
  const compileOptions = { terrainHeightAt, terrainRevision, spacing, tolerance, maximumAngleDegrees: 1 };
  const before = compilePathNetwork(network, compileOptions);
  const beforeSegment = before.segments.find(segment => segment.id === segmentId);
  const visibleSplit = stationAtCurveT(beforeSegment, splitT);
  const edited = applyPathNetworkTransaction(network, {
    label: 'Insert exact visible-profile node',
    terrainRevision,
    operations: [{
      type: 'insert-node',
      segmentId,
      curveT: splitT,
      preserveCurve: true,
      curveAuthority: beforeSegment.curveAuthority,
      node: { id: 'inserted', position: visibleSplit }
    }]
  }, { terrainRevision }).network;
  const after = compilePathNetwork(edited, compileOptions);
  const first = after.segments.find(segment => segment.id === segmentId);
  const second = after.segments.find(segment => segment.fromNode === 'inserted');
  let maximumDeviation = 0;
  for (let index = 0; index <= 400; index += 1) {
    const t = index / 400;
    const expected = stationAtCurveT(beforeSegment, t);
    const actual = t <= splitT
      ? stationAtCurveT(first, t / splitT)
      : stationAtCurveT(second, (t - splitT) / (1 - splitT));
    maximumDeviation = Math.max(maximumDeviation, distance3(expected, actual));
  }
  return { before, beforeSegment, visibleSplit, edited, after, first, second, maximumDeviation };
}

test('terrain-following exact insertion preserves the final visible centerline and node height authority', () => {
  const terrainHeightAt = (x, z) => (
    Math.sin(x * 0.24) * 4.5
    + Math.cos(z * 0.31) * 2.8
    + Math.sin((x + z) * 0.11) * 1.7
  );
  const terrainRevision = 41;
  const network = normalizePathNetwork({
    id: 'terrain-visible-profile',
    revision: 7,
    // Saved/migrated projects commonly do not persist a terrain revision. The
    // runtime's verified authored-natural revision is the compile authority.
    sourceRevisions: {},
    engineering: { maxGradePercent: 10 },
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'terrain' },
      { id: 'b', position: [42, 0, 8], heightMode: 'terrain' }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      curveType: 'hermite',
      curveControl: { fromHandle: [12, 0, 18], toHandle: [-15, 0, 17] }
    }]
  });
  const result = splitAndCompile(network, {
    segmentId: 'ab',
    splitT: 0.43,
    terrainHeightAt,
    terrainRevision,
    spacing: 0.54,
    tolerance: 0.04
  });
  const authorityProfile = result.beforeSegment.curveAuthority.profile;
  assert.equal(authorityProfile.mode, 'terrain-relative');
  assert.equal(result.beforeSegment.curveAuthority.terrainRevision, terrainRevision);
  assert.ok(
    authorityProfile.samples.some(sample => Math.abs(sample.value) > 0.25),
    'fixture must exercise a terrain profile that the vertical solver visibly adjusted'
  );
  assert.ok(result.maximumDeviation <= 0.01, `terrain visible centerline deviated ${result.maximumDeviation} m`);
  const inserted = result.edited.nodes.find(node => node.id === 'inserted');
  const resolved = result.after.nodes.find(node => node.id === 'inserted').resolvedPosition;
  assert.ok(['terrain', 'offset'].includes(inserted.heightMode));
  assert.ok(distance3(resolved, result.visibleSplit) <= 0.01, 'inserted height authority jumped from the visible road');
  assert.equal(result.first.curveAuthority.profile.mode, 'terrain-relative');
  assert.equal(result.second.curveAuthority.profile.mode, 'terrain-relative');

  assert.throws(() => applyPathNetworkTransaction(network, {
    terrainRevision: terrainRevision + 1,
    operations: [{
      type: 'insert-node',
      segmentId: 'ab',
      curveT: 0.43,
      preserveCurve: true,
      curveAuthority: result.beforeSegment.curveAuthority,
      node: { id: 'stale', position: result.visibleSplit }
    }]
  }, { terrainRevision: terrainRevision + 1 }), /does not match current authored terrain revision/);
});

test('absolute strongly curved insertion preserves final visible Y instead of restoring raw Hermite Y', () => {
  const network = normalizePathNetwork({
    id: 'absolute-visible-profile',
    revision: 12,
    engineering: { maxGradePercent: 18 },
    nodes: [
      { id: 'a', position: [-12, 3, -4], heightMode: 'absolute' },
      { id: 'b', position: [36, 8, 21], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      curveType: 'hermite',
      curveControl: { fromHandle: [17, 24, 22], toHandle: [-19, -21, 18] }
    }]
  });
  const result = splitAndCompile(network, {
    segmentId: 'ab',
    splitT: 0.61,
    terrainHeightAt: () => -20,
    terrainRevision: 88,
    spacing: 0.54,
    tolerance: 0.04
  });
  assert.equal(result.beforeSegment.curveAuthority.profile.mode, 'absolute');
  assert.equal(result.beforeSegment.curveAuthority.terrainRevision, null);
  assert.ok(result.maximumDeviation <= 0.01, `absolute visible centerline deviated ${result.maximumDeviation} m`);
  const inserted = result.edited.nodes.find(node => node.id === 'inserted');
  assert.equal(inserted.heightMode, 'absolute');
  assert.ok(Math.abs(inserted.position[1] - result.visibleSplit[1]) <= 0.01);
  const rawSplitY = (() => {
    const authority = result.beforeSegment.curveAuthority;
    const p0 = authority.start;
    const p1 = p0.map((value, axis) => value + authority.fromHandle[axis]);
    const p3 = authority.end;
    const p2 = p3.map((value, axis) => value + authority.toHandle[axis]);
    const q0 = lerp3(p0, p1, 0.61);
    const q1 = lerp3(p1, p2, 0.61);
    const q2 = lerp3(p2, p3, 0.61);
    return lerp3(lerp3(q0, q1, 0.61), lerp3(q1, q2, 0.61), 0.61)[1];
  })();
  assert.ok(Math.abs(rawSplitY - inserted.position[1]) > 1, 'fixture must expose the former raw-Y insertion jump');
});

test('visible profiles reverse exactly, invalidate on node edits, and reject malformed persisted authority', () => {
  const network = normalizePathNetwork({
    id: 'profile-lifecycle',
    revision: 3,
    nodes: [
      { id: 'a', position: [0, 2, 0], heightMode: 'absolute' },
      { id: 'b', position: [12, 7, 4], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      curveControl: {
        fromHandle: [4, 1, 3],
        toHandle: [-3, -2, 2],
        profile: {
          mode: 'absolute',
          samples: [{ t: 0, value: 2 }, { t: 0.3, value: 4 }, { t: 1, value: 7 }]
        }
      }
    }]
  });
  const reversed = applyPathNetworkTransaction(network, {
    operations: [{ type: 'reverse-network' }]
  }).network;
  assert.deepEqual(reversed.segments[0].curveControl.profile.samples, [
    { t: 0, value: 7 },
    { t: 0.7, value: 4 },
    { t: 1, value: 2 }
  ]);
  const moved = applyPathNetworkTransaction(network, {
    operations: [{ type: 'move-node', nodeId: 'a', delta: [1, 0, 0] }]
  }).network;
  assert.equal(moved.segments[0].curveControl.profile, undefined);
  const duplicated = duplicatePathNetwork(network, {
    newNetworkId: 'profile-lifecycle-copy',
    offset: [20, 9, -4]
  }).network;
  assert.deepEqual(
    duplicated.segments[0].curveControl.profile.samples.map(sample => sample.value),
    [11, 13, 16],
    'an absolute visible profile must move vertically with its duplicated absolute nodes'
  );
  const engineeringEdit = replacePathNetwork(network, {
    ...structuredClone(network),
    engineering: { ...network.engineering, maxGradePercent: network.engineering.maxGradePercent + 2 }
  }).network;
  assert.equal(engineeringEdit.segments[0].curveControl.profile, undefined);
  const styleEdit = replacePathNetwork(network, {
    ...structuredClone(network),
    segments: network.segments.map(segment => ({
      ...structuredClone(segment),
      materialProfile: { ...segment.materialProfile, roughness: 0.73 }
    }))
  }).network;
  assert.ok(styleEdit.segments[0].curveControl.profile);

  assert.throws(() => normalizePathNetwork({
    ...structuredClone(network),
    schemaVersion: 2,
    segments: [{
      ...structuredClone(network.segments[0]),
      curveControl: {
        ...structuredClone(network.segments[0].curveControl),
        profile: { mode: 'absolute', samples: [{ t: 0, value: 2 }, { t: 0.3, value: 4 }, { t: 0.2, value: 5 }, { t: 1, value: 7 }] }
      }
    }]
  }), /strictly increasing/);
});

test('runtime supplies the current authored-natural terrain revision and terrain edits invalidate old profiles', () => {
  const terrain = {
    id: 'terrain', type: 'terrain', visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'rollingHills', seed: 4, height: 12, generatedRevision: 73,
      bounds: { minX: -64, maxX: 64, minZ: -64, maxZ: 64 },
      resolutionX: 64, resolutionZ: 64, chunkSize: 16
    }
  };
  const network = normalizePathNetwork({
    id: 'runtime-terrain-revision', revision: 2, sourceRevisions: {},
    nodes: [
      { id: 'a', position: [-20, 0, 0], heightMode: 'terrain' },
      { id: 'b', position: [20, 0, 0], heightMode: 'terrain' }
    ],
    segments: [{ id: 'ab', fromNode: 'a', toNode: 'b', curveType: 'hermite' }]
  });
  const path = {
    id: 'path', type: 'path', visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: { pathNetwork: network }
  };
  const runtime = compilePathObjectRuntime(path, terrain, { useStableCache: false });
  const authority = runtime.compiled.segments[0].curveAuthority;
  assert.equal(authority.profile.mode, 'terrain-relative');
  assert.equal(authority.terrainRevision, 73);

  const split = applyPathNetworkTransaction(network, {
    terrainRevision: 73,
    operations: [{
      type: 'insert-node', segmentId: 'ab', curveT: 0.5, preserveCurve: true,
      curveAuthority: authority,
      node: { id: 'inserted', position: stationAtCurveT(runtime.compiled.segments[0], 0.5) }
    }]
  }, { terrainRevision: 73 }).network;
  const changedTerrain = structuredClone(terrain);
  changedTerrain.properties.generatedRevision = 74;
  changedTerrain.properties.seed = 9;
  const rebuilt = compilePathObjectRuntime({ ...path, properties: { pathNetwork: split } }, changedTerrain, { useStableCache: false });
  assert.equal(rebuilt.compiled.segments[0].curveAuthority.terrainRevision, 74);
  assert.equal(rebuilt.compiled.segments[0].curveAuthority.profile.terrainRevision, 74);
});
