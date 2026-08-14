import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import {
  compilePathTerrainModifier,
  pathTerrainHeightAt,
  pathTerrainNormalAt,
  samplePathExclusionField,
  samplePathTerrainModifier
} from '../app/path-network/terrain-modifier.js';

const terrain = (x, z) => x * 0.18 + Math.sin(z * 0.1) * 0.6;
const normal = () => [0, 1, 0];

function modifierFor(constructionMode = 'cut-fill', options = {}) {
  const network = normalizePathNetwork({
    id: `terrain-${constructionMode}`,
    engineering: { maxCutDepth: 4, maxFillDepth: 3 },
    nodes: [
      { id: 'a', position: [0, 3, 0], heightMode: 'absolute' },
      { id: 'b', position: [40, 3, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'road',
      fromNode: 'a',
      toNode: 'b',
      constructionMode,
      constructionLocked: constructionMode !== 'auto',
      crossSectionProfile: {
        width: 6,
        crownHeight: 0.1,
        shoulderWidth: 1,
        shoulderDrop: 0.1,
        ditchDepth: 0.3,
        blendDistance: 3
      }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: terrain,
    terrainNormalAt: normal,
    spacing: 1,
    ...options
  });
  return compilePathTerrainModifier(compiled, { baseHeightAt: terrain, chunkSize: 8 });
}

function cityModifier() {
  const network = normalizePathNetwork({
    id: 'city-terrain',
    engineering: { maxCutDepth: 4, maxFillDepth: 3 },
    nodes: [
      { id: 'a', position: [0, 3, 0], heightMode: 'absolute' },
      { id: 'b', position: [40, 3, 0], heightMode: 'absolute' }
    ],
    defaults: { crossSectionProfile: { profileId: 'city-local-street' } },
    segments: [{
      id: 'street',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'cut-fill',
      constructionLocked: true
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: terrain,
    terrainNormalAt: normal,
    spacing: 1
  });
  return compilePathTerrainModifier(compiled, { baseHeightAt: terrain, chunkSize: 8 });
}

function automaticBridgeModifier() {
  const baseHeightAt = x => x >= 20 && x <= 40 ? -8 : 0;
  const network = normalizePathNetwork({
    id: 'automatic-bridge-terrain',
    engineering: {
      civilAssist: true,
      maxCutDepth: 6,
      maxFillDepth: 2,
      bridgeClearanceThreshold: 3,
      minimumBridgeLength: 8,
      maximumBridgeSpan: 40
    },
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [60, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'road',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      constructionLocked: false,
      crossSectionProfile: { width: 4 },
      structureProfile: { bridgeStyle: 'auto' }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: baseHeightAt,
    terrainNormalAt: normal,
    spacing: 1
  });
  return {
    compiled,
    modifier: compilePathTerrainModifier(compiled, { baseHeightAt, chunkSize: 8 }),
    baseHeightAt
  };
}

function structuralBridgeSeatModifier() {
  const baseHeightAt = () => -12;
  const network = normalizePathNetwork({
    id: 'structural-bridge-seats',
    engineering: {
      maxCutDepth: 1,
      maxFillDepth: 0.2
    },
    nodes: [
      { id: 'west', position: [0, 4, 0], heightMode: 'absolute' },
      { id: 'east', position: [20, 4, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'bridge',
      fromNode: 'west',
      toNode: 'east',
      constructionMode: 'bridge',
      constructionLocked: true,
      crossSectionProfile: {
        width: 4,
        shoulderWidth: 1,
        ditchDepth: 0.3,
        blendDistance: 3
      },
      structureProfile: { bridgeStyle: 'steel-girder' }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: baseHeightAt,
    terrainNormalAt: normal,
    spacing: 0.5
  });
  return {
    compiled,
    modifier: compilePathTerrainModifier(compiled, { baseHeightAt, chunkSize: 4 }),
    baseHeightAt
  };
}

test('explicit local modifier preserves base terrain exactly outside dirty corridor chunks', () => {
  const modifier = modifierFor();
  const outside = samplePathTerrainModifier(modifier, 20, 30);
  assert.equal(outside.height, terrain(20, 30));
  assert.equal(outside.influence, 0);
  assert.equal(outside.zone, 'terrain');
  assert.equal(outside.materialWeights.terrain, 1);
  assert.ok(modifier.dirtyChunkKeys.length > 1);
  assert.ok(modifier.diagnostics.dirtyChunkCount < 100);
});

test('road, shoulder, ditch, and blend use one signed-distance field', () => {
  const modifier = modifierFor();
  const road = samplePathTerrainModifier(modifier, 20, 0);
  const shoulder = samplePathTerrainModifier(modifier, 20, 3.5);
  const ditch = samplePathTerrainModifier(modifier, 20, 4.5);
  const blend = samplePathTerrainModifier(modifier, 20, 6);
  assert.equal(road.zone, 'road');
  assert.equal(shoulder.zone, 'shoulder');
  assert.equal(ditch.zone, 'ditch');
  assert.equal(blend.zone, 'blend');
  assert.equal(road.materialWeights.road, 1);
  assert.equal(shoulder.materialWeights.shoulder, 1);
  assert.equal(ditch.materialWeights.earthwork, 1);
  assert.ok(blend.materialWeights.terrain > 0);
  assert.ok(blend.materialWeights.earthwork > 0);
  assert.equal(road.terrainUnderlayClearance, 0.04);
  assert.ok(Math.abs((road.targetHeight - road.height) - 0.04) < 1e-9);
  assert.equal(road.supportHeight, road.height);
  assert.notEqual(road.height, road.baseHeight);
});

test('visible construction surface remains above its terrain support underlay', () => {
  const modifier = modifierFor('cut-fill');
  const road = samplePathTerrainModifier(modifier, 20, 0);
  const shoulder = samplePathTerrainModifier(modifier, 20, 3.5);
  const outer = samplePathTerrainModifier(modifier, 20, 8);

  assert.ok(road.targetHeight - road.height >= 0.039);
  assert.ok(shoulder.targetHeight - shoulder.height >= 0.039);
  assert.ok(Math.abs(outer.height - outer.baseHeight) < 1e-9);
});

test('terrain and material influence stop at the compiled segment end caps', () => {
  const modifier = modifierFor();
  const beforeStart = samplePathTerrainModifier(modifier, -12, 0);
  const afterEnd = samplePathTerrainModifier(modifier, 52, 0);
  for (const sample of [beforeStart, afterEnd]) {
    assert.equal(sample.terrainApplied, false);
    assert.equal(sample.influence, 0);
    assert.equal(sample.zone, 'terrain');
    assert.equal(sample.materialWeights.terrain, 1);
    assert.equal(sample.materialWeights.road, 0);
  }
});

test('terrain construction obeys the shared cut and fill limits', () => {
  const modifier = modifierFor();
  for (let x = 0; x <= 40; x += 1) {
    const sample = samplePathTerrainModifier(modifier, x, 0);
    assert.ok(sample.height >= sample.baseHeight - 4 - 1e-6);
    assert.ok(sample.height <= sample.baseHeight + 3 + 1e-6);
  }
});

for (const mode of ['bridge', 'tunnel']) {
  test(`${mode} keeps base terrain untouched while preserving construction classification`, () => {
    const modifier = modifierFor(mode);
    const sample = samplePathTerrainModifier(modifier, 20, 0);
    assert.equal(sample.constructionMode, mode);
    assert.equal(sample.terrainApplied, false);
    assert.equal(sample.influence, 0);
    assert.equal(sample.height, terrain(20, 0));
  });
}

test('outer construction boundary is shared and resolves to unchanged terrain height', () => {
  const modifier = modifierFor();
  assert.ok(modifier.boundaryVertices.size > 4);
  for (const vertex of modifier.boundaryVertices.values()) {
    assert.ok(Math.abs(vertex[1] - terrain(vertex[0], vertex[2])) <= 0.005);
    assert.ok(Math.abs(pathTerrainHeightAt(modifier, vertex[0], vertex[2]) - vertex[1]) <= 0.005);
  }
});

test('modified normal remains finite and normalized', () => {
  const modifier = modifierFor();
  const value = pathTerrainNormalAt(modifier, 20, 2.5);
  assert.ok(value.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...value) - 1) < 1e-6);
});

test('city street terrain support uses the same gutter, curb, sidewalk, and feather field as geometry', () => {
  const modifier = cityModifier();
  const road = samplePathTerrainModifier(modifier, 20, 0);
  const gutter = samplePathTerrainModifier(modifier, 20, 3.6);
  const curb = samplePathTerrainModifier(modifier, 20, 3.9);
  const sidewalk = samplePathTerrainModifier(modifier, 20, 4.5);
  const blend = samplePathTerrainModifier(modifier, 20, 6);
  const terrainOnly = samplePathTerrainModifier(modifier, 20, 8);

  assert.equal(road.zone, 'road');
  assert.equal(gutter.zone, 'gutter');
  assert.equal(curb.zone, 'curb');
  assert.equal(sidewalk.zone, 'sidewalk');
  assert.equal(blend.zone, 'blend');
  assert.equal(terrainOnly.zone, 'terrain');
  assert.equal(gutter.materialWeights.gutter, 1);
  assert.equal(curb.materialWeights.curb, 1);
  assert.equal(sidewalk.materialWeights.sidewalk, 1);
  assert.ok(curb.surfaceHeight > gutter.surfaceHeight);
  assert.ok(sidewalk.surfaceHeight > gutter.surfaceHeight);
  assert.equal(terrainOnly.height, terrainOnly.baseHeight);
});

test('sloped terrain normals never shift cross-section profile elevations sideways', () => {
  const network = normalizePathNetwork({
    id: 'world-y-cross-section',
    nodes: [
      { id: 'a', position: [0, 2, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 5, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'grade',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'cut-fill',
      constructionLocked: true,
      crossSectionProfile: { profileId: 'city-local-street' }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0.32, 0.91, 0.26],
    spacing: 1
  });
  const modifier = compilePathTerrainModifier(compiled, { baseHeightAt: () => 0, chunkSize: 8 });
  const section = modifier.crossSections[Math.floor(modifier.crossSections.length / 2)];
  assert.ok(section);
  assert.equal(section.roadCenter[0], section.center[0]);
  assert.equal(section.roadCenter[2], section.center[2]);
  assert.ok(Math.abs(section.roadCenter[1] - section.center[1] - 0.08) < 1e-8);
  assert.ok(Math.abs(section.roadLeft[1] - section.center[1]) < 1e-8);
  assert.ok(Math.abs(section.roadRight[1] - section.center[1]) < 1e-8);
});

test('automatic bridge portals use the resolved bridge family while retaining an open terrain span', () => {
  const { compiled, modifier, baseHeightAt } = automaticBridgeModifier();
  const interval = compiled.segments[0].constructionIntervals.find(entry => entry.mode === 'bridge');
  const bridgeEntries = modifier.entries.filter(entry => entry.construction.mode === 'bridge');
  assert.deepEqual([interval.startDistance, interval.endDistance], [19, 41]);
  assert.ok(bridgeEntries.length > 2);
  assert.equal(bridgeEntries.every(entry => entry.bridgeProfile.bridgeStyle === 'stone-arch'), true);
  assert.equal(bridgeEntries.every(entry => entry.bridgeSeatLength === 1.8), true);

  const beforePortal = samplePathTerrainModifier(modifier, interval.startDistance - 1e-6, 0);
  const afterPortal = samplePathTerrainModifier(modifier, interval.startDistance + 1e-6, 0);
  assert.ok(Math.abs(beforePortal.height - afterPortal.height) < 1e-4, 'portal support opened a height seam');
  assert.ok(afterPortal.longitudinalSupportWeight > 0.999);

  const centerDistance = (interval.startDistance + interval.endDistance) * 0.5;
  const center = samplePathTerrainModifier(modifier, centerDistance, 0);
  assert.equal(center.constructionMode, 'bridge');
  assert.equal(center.longitudinalSupportWeight, 0);
  assert.equal(center.influence, 0);
  assert.equal(center.height, baseHeightAt(centerDistance, 0));
  assert.equal(modifier.terrainDirtyChunkKeys.some(key => key.startsWith('3:')), false);
  assert.ok(modifier.diagnostics.bridgeSeatEntryCount > 0);
});

test('bridge portal seats are clamped so even a short authored span retains open terrain', () => {
  const network = normalizePathNetwork({
    id: 'short-bridge-seat',
    nodes: [
      { id: 'a', position: [0, 3, 0], heightMode: 'absolute' },
      { id: 'b', position: [4, 3, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'short',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'bridge',
      constructionLocked: true,
      crossSectionProfile: { width: 4 },
      structureProfile: { bridgeStyle: 'steel-girder' }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: normal,
    spacing: 0.5
  });
  const modifier = compilePathTerrainModifier(compiled, { baseHeightAt: () => 0, chunkSize: 4 });
  const entry = modifier.entries.find(candidate => candidate.construction.mode === 'bridge');
  assert.ok(entry.bridgeSeatLength < entry.bridgeProfile.abutmentSeatLength);
  assert.ok(entry.bridgeSeatLength * 2 + entry.bridgeProfile.minimumOpenTerrainSpan <= 4 + 1e-8);
  const center = samplePathTerrainModifier(modifier, 2, 0);
  assert.equal(center.longitudinalSupportWeight, 0);
  assert.equal(center.height, 0);
});

test('bridge portal terrain feather remains authored when physical accessories retire', () => {
  const { modifier } = structuralBridgeSeatModifier();
  const portalSection = modifier.crossSections.find(section => section.distance <= 1e-8);
  assert.ok(portalSection);
  assert.equal(portalSection.accessoryScale, 0);
  assert.equal(portalSection.layout.left.blendWidth, 3);
  assert.equal(portalSection.layout.right.blendWidth, 3);
  assert.ok(Math.abs(
    portalSection.layout.left.outerEdge - portalSection.layout.left.ditchEdge - 3
  ) <= 1e-8);
  assert.ok(Math.abs(
    portalSection.layout.right.outerEdge - portalSection.layout.right.ditchEdge - 3
  ) <= 1e-8);

  const insidePortal = 0.01;
  const featherMidpoint = (
    portalSection.layout.right.ditchEdge + portalSection.layout.right.outerEdge
  ) * 0.5;
  const feather = samplePathTerrainModifier(modifier, insidePortal, featherMidpoint);
  const outside = samplePathTerrainModifier(
    modifier,
    insidePortal,
    portalSection.layout.right.outerEdge + 0.05
  );
  assert.equal(feather.zone, 'blend');
  assert.equal(feather.bridgeSeatSide, 'start');
  assert.ok(feather.influence > 0.45 && feather.influence < 0.55);
  assert.equal(outside.terrainApplied, false);
  assert.equal(outside.height, outside.baseHeight);
});

test('both bridge portal seats support the deck beyond maxFill without closing the open span', () => {
  const { modifier, baseHeightAt } = structuralBridgeSeatModifier();
  const bridgeEntry = modifier.entries.find(entry => entry.construction.mode === 'bridge');
  assert.ok(bridgeEntry);
  assert.deepEqual(bridgeEntry.bridgeSeats.map(seat => seat.side), ['start', 'end']);

  const roadHalfWidth = modifier.crossSections[0].roadWidth * 0.5;
  const portalSamples = [
    [0, roadHalfWidth * 0.9, 'start'],
    [0, -roadHalfWidth * 0.9, 'start'],
    [20, roadHalfWidth * 0.9, 'end'],
    [20, -roadHalfWidth * 0.9, 'end']
  ];
  for (const [x, z, side] of portalSamples) {
    const sample = samplePathTerrainModifier(modifier, x, z);
    assert.equal(sample.bridgeSeatSide, side);
    assert.ok(sample.bridgeSeatWeight > 0.99);
    assert.ok(sample.height > sample.baseHeight + modifier.engineering.maxFillDepth + 10);
    assert.ok(Math.abs(sample.surfaceHeight - sample.height - sample.terrainUnderlayClearance) < 1e-6);
  }

  const openSpan = samplePathTerrainModifier(modifier, 10, 0);
  assert.equal(openSpan.constructionMode, 'bridge');
  assert.equal(openSpan.bridgeSeatSide, null);
  assert.equal(openSpan.longitudinalSupportWeight, 0);
  assert.equal(openSpan.height, baseHeightAt(10, 0));
});

test('bridge portal seats use bounded longitudinal footprints instead of radial end patches', () => {
  const { modifier } = structuralBridgeSeatModifier();
  for (const [x, z] of [
    [-0.2, 0],
    [20.2, 0],
    [-0.2, 2],
    [20.2, -2]
  ]) {
    const sample = samplePathTerrainModifier(modifier, x, z);
    assert.equal(sample.bridgeSeatSide, null);
    assert.equal(sample.terrainApplied, false);
    assert.equal(sample.influence, 0);
    assert.equal(sample.height, sample.baseHeight);
  }
});

test('padded exclusion uses a neighboring-chunk capsule without widening terrain modification', () => {
  const modifier = modifierFor('cut-fill');
  const entry = modifier.entries.find(candidate => candidate.pairIndex === 8);
  const outsideZ = entry.extents.rightOuterEdge + 0.4;
  for (const x of [7.9, 8.1]) {
    const strictTerrain = samplePathTerrainModifier(modifier, x, outsideZ);
    const unpadded = samplePathExclusionField(modifier, x, outsideZ, 0);
    const padded = samplePathExclusionField(modifier, x, outsideZ, 1);
    assert.equal(strictTerrain.terrainApplied, false);
    assert.equal(unpadded.excluded, false);
    assert.equal(padded.excluded, true);
    assert.ok(Math.abs(padded.clearance - 0.4) < 1e-6);
  }

  const endpointOutside = samplePathExclusionField(
    modifier,
    40 + entry.extents.outerEdge + 0.4,
    0,
    1
  );
  assert.equal(endpointOutside.excluded, true, 'endpoint exclusion must be a capsule rather than an infinite strip');
});

test('bridge exclusion follows its resolved deck safety width while tunnel and invalid spans remain clear', () => {
  const { modifier } = automaticBridgeModifier();
  const bridgeEntry = modifier.entries.find(entry => entry.construction.mode === 'bridge');
  const centerX = (bridgeEntry.intervalStartDistance + bridgeEntry.intervalEndDistance) * 0.5;
  const inside = samplePathExclusionField(
    modifier,
    centerX,
    bridgeEntry.bridgeExclusionHalfWidth - 0.05,
    0
  );
  const outside = samplePathExclusionField(
    modifier,
    centerX,
    bridgeEntry.bridgeExclusionHalfWidth + 0.4,
    0
  );
  assert.equal(inside.excluded, true);
  assert.equal(inside.bridgeStyle, 'stone-arch');
  assert.equal(outside.excluded, false);
  assert.equal(samplePathExclusionField(modifierFor('tunnel'), 20, 0, 5).excluded, false);
  const invalidNetwork = normalizePathNetwork({
    id: 'invalid-exclusion',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [20, 0, 0], heightMode: 'absolute' }
    ],
    segments: [{ id: 'blocked', fromNode: 'a', toNode: 'b' }]
  });
  const invalidCompiled = compilePathNetwork(invalidNetwork, {
    terrainHeightAt: () => 0,
    terrainNormalAt: normal,
    spacing: 1
  });
  const invalidSegment = invalidCompiled.segments[0];
  invalidSegment.construction = { mode: 'invalid', reason: 'test-blocked' };
  invalidSegment.constructionIntervals = [{
    segmentId: invalidSegment.id,
    startDistance: 0,
    endDistance: invalidSegment.samples.at(-1).distance,
    startSampleIndex: 0,
    endSampleIndex: invalidSegment.samples.length - 1,
    mode: 'invalid',
    reason: 'test-blocked'
  }];
  const invalidModifier = compilePathTerrainModifier(invalidCompiled, {
    baseHeightAt: () => 0,
    chunkSize: 8
  });
  assert.equal(samplePathExclusionField(invalidModifier, 10, 0, 5).excluded, false);
});
