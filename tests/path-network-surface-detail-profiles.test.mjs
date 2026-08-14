import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT,
  PATH_SURFACE_DETAIL_RENDER_LAYOUT,
  PATH_SURFACE_DETAIL_RENDER_VEC4_COUNT,
  normalizePathSurfaceDetail,
  pathSurfaceDetailProfile,
  pathSurfaceDetailProfiles,
  pathSurfaceDetailRenderData
} from '../app/path-network/surface-detail-profiles.js';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { applyPathNetworkTransaction } from '../app/path-network/transactions.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { buildPathNetworkGeometry } from '../app/path-network/geometry.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';

function networkFixture() {
  return normalizePathNetwork({
    id: 'surface-detail-path',
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [12, 0, 0] },
      { id: 'c', position: [24, 0, 0] }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b' },
      { id: 'bc', fromNode: 'b', toNode: 'c', surfaceDetailProfile: { profileId: 'hoof-trail' } }
    ],
    defaults: {
      surfaceDetailProfile: { profileId: 'weathered-dirt-road', seed: 91 }
    }
  });
}

test('surface-detail presets cover clean, rutted, hoof, boot, puddle, and weather behavior deterministically', () => {
  const profiles = pathSurfaceDetailProfiles();
  assert.deepEqual(profiles.map(item => item.id), [
    'clean',
    'weathered-dirt-road',
    'muddy-wagon-road',
    'hoof-trail',
    'walked-footpath'
  ]);
  const wagon = pathSurfaceDetailProfile('muddy-wagon-road');
  assert.ok(wagon.puddleCoverage > 0.1);
  assert.ok(wagon.wheelRutStrength > 0.4);
  assert.equal(wagon.hoofPrintDensity, 0);
  const hoof = pathSurfaceDetailProfile('hoof-trail');
  assert.ok(hoof.hoofPrintDensity > 0.3);
  assert.equal(hoof.wheelRutStrength, 0);
  assert.deepEqual(pathSurfaceDetailProfile('hoof-trail'), hoof);
});

test('explicit surface-detail preset selection cannot leak values from a normalized fallback', () => {
  const fallback = pathSurfaceDetailProfile('muddy-wagon-road', { seed: 44 });
  const clean = normalizePathSurfaceDetail({ profileId: 'clean' }, fallback);
  assert.equal(clean.profileId, 'clean');
  assert.equal(clean.wheelRutStrength, 0);
  assert.equal(clean.puddleCoverage, 0.01);
  assert.equal(clean.seed, 2718);
});

test('network defaults, segment overrides, transactions, and JSON persistence share one surface-detail authority', () => {
  const network = networkFixture();
  assert.equal(network.segments[0].surfaceDetailProfile.profileId, 'weathered-dirt-road');
  assert.equal(network.segments[0].surfaceDetailProfile.seed, 91);
  assert.equal(network.segments[1].surfaceDetailProfile.profileId, 'hoof-trail');
  assert.equal(network.segments[1].surfaceDetailProfile.seed, 2718);

  const updated = applyPathNetworkTransaction(network, {
    label: 'Use muddy wagon wear',
    operations: [{
      type: 'set-segment-surface-detail',
      segmentId: 'ab',
      profileId: 'muddy-wagon-road',
      surfaceDetailProfile: { seed: 123, wheelTrackGauge: 1.6 }
    }]
  }).network;
  assert.equal(updated.segments[0].surfaceDetailProfile.profileId, 'muddy-wagon-road');
  assert.equal(updated.segments[0].surfaceDetailProfile.seed, 123);
  assert.equal(updated.segments[0].surfaceDetailProfile.wheelTrackGauge, 1.6);
  assert.deepEqual(
    normalizePathNetwork(JSON.parse(JSON.stringify(updated)), { pathId: updated.id }),
    updated
  );
});

test('whole-network surface character updates defaults used by future branches', () => {
  const network = networkFixture();
  const updated = applyPathNetworkTransaction(network, {
    label: 'Apply hoof detail everywhere',
    operations: [
      ...network.segments.map(segment => ({
        type: 'set-segment-surface-detail',
        segmentId: segment.id,
        profileId: 'hoof-trail'
      })),
      { type: 'set-default-surface-detail', profileId: 'hoof-trail' },
      { type: 'connect-nodes', segmentId: 'future-branch', fromNode: 'a', toNode: 'c' }
    ]
  }).network;
  assert.equal(updated.defaults.surfaceDetailProfile.profileId, 'hoof-trail');
  assert.ok(updated.segments.every(segment => segment.surfaceDetailProfile.profileId === 'hoof-trail'));
});

test('surface-detail fields are bounded and unknown presets are rejected', () => {
  const normalized = normalizePathSurfaceDetail({
    profileId: 'custom',
    puddleCoverage: 4,
    puddleDepth: -1,
    wheelRutStrength: 5,
    hoofPrintDensity: -2,
    weatherResponse: 9
  });
  assert.equal(normalized.puddleCoverage, 0.75);
  assert.equal(normalized.puddleDepth, 0);
  assert.equal(normalized.wheelRutStrength, 1);
  assert.equal(normalized.hoofPrintDensity, 0);
  assert.equal(normalized.weatherResponse, 3);
  assert.throws(() => pathSurfaceDetailProfile('unknown'), /Unknown path surface detail profile/);
});

test('packed render data defines four vec4 attributes containing every visual authority value', () => {
  const detail = {
    profileId: 'weathered-dirt-road',
    enabled: true,
    seed: 12345,
    puddleCoverage: 0.21,
    puddleScale: 6.25,
    puddleDepth: 0.037,
    wheelRutStrength: 0.63,
    wheelTrackGauge: 1.72,
    wheelRutWidth: 0.24,
    hoofPrintDensity: 0.27,
    hoofPrintScale: 0.16,
    bootPrintDensity: 0.31,
    bootPrintScale: 0.14,
    erosionStrength: 0.44,
    detailNormalStrength: 0.81,
    weatherResponse: 1.6
  };
  const packed = pathSurfaceDetailRenderData(detail, {
    pathId: 'village-roads',
    segmentId: 'market-to-gate',
    roadWidth: 5.75
  });
  const at = name => packed[PATH_SURFACE_DETAIL_RENDER_LAYOUT[name]];

  assert.ok(packed instanceof Float32Array);
  assert.equal(PATH_SURFACE_DETAIL_RENDER_VEC4_COUNT, 4);
  assert.equal(PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT, 16);
  assert.equal(packed.length, PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT);
  assert.deepEqual(
    [...new Set(Object.values(PATH_SURFACE_DETAIL_RENDER_LAYOUT))].sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, index) => index)
  );
  assert.equal(at('profileCode'), 2);
  for (const name of [
    'puddleCoverage',
    'puddleScale',
    'puddleDepth',
    'wheelRutStrength',
    'wheelTrackGauge',
    'wheelRutWidth',
    'hoofPrintDensity',
    'hoofPrintScale',
    'bootPrintDensity',
    'bootPrintScale',
    'erosionStrength',
    'detailNormalStrength',
    'weatherResponse'
  ]) {
    assert.ok(Math.abs(at(name) - detail[name]) < 1e-6, `${name} must survive Float32 packing`);
  }
  assert.ok(at('patternSeed') >= 0 && at('patternSeed') < 1);
  assert.equal(at('roadWidth'), 5.75);
  assert.equal(packed.every(Number.isFinite), true);
});

test('every visual source field measurably changes its authoritative packed component', () => {
  const baseline = {
    profileId: 'weathered-dirt-road',
    enabled: true,
    seed: 17,
    puddleCoverage: 0.12,
    puddleScale: 3.1,
    puddleDepth: 0.02,
    wheelRutStrength: 0.25,
    wheelTrackGauge: 1.4,
    wheelRutWidth: 0.14,
    hoofPrintDensity: 0.1,
    hoofPrintScale: 0.1,
    bootPrintDensity: 0.16,
    bootPrintScale: 0.12,
    erosionStrength: 0.2,
    detailNormalStrength: 0.4,
    weatherResponse: 0.9
  };
  const options = { pathId: 'world-road', segmentId: 'segment-a', roadWidth: 4 };
  const original = pathSurfaceDetailRenderData(baseline, options);
  const changes = {
    puddleCoverage: 0.22,
    puddleScale: 4.1,
    puddleDepth: 0.03,
    wheelRutStrength: 0.35,
    wheelTrackGauge: 1.6,
    wheelRutWidth: 0.2,
    hoofPrintDensity: 0.2,
    hoofPrintScale: 0.15,
    bootPrintDensity: 0.26,
    bootPrintScale: 0.17,
    erosionStrength: 0.3,
    detailNormalStrength: 0.8,
    weatherResponse: 1.4
  };

  for (const [field, value] of Object.entries(changes)) {
    const changed = pathSurfaceDetailRenderData({ ...baseline, [field]: value }, options);
    const component = PATH_SURFACE_DETAIL_RENDER_LAYOUT[field];
    assert.notEqual(changed[component], original[component], `${field} must change packed data`);
  }

  const disabled = pathSurfaceDetailRenderData({ ...baseline, enabled: false }, options);
  assert.equal(disabled[PATH_SURFACE_DETAIL_RENDER_LAYOUT.profileCode], 0);
  const differentProfile = pathSurfaceDetailRenderData({ ...baseline, profileId: 'hoof-trail' }, options);
  assert.equal(differentProfile[PATH_SURFACE_DETAIL_RENDER_LAYOUT.profileCode], 4);
  const differentSeed = pathSurfaceDetailRenderData({ ...baseline, seed: 18 }, options);
  assert.notEqual(
    differentSeed[PATH_SURFACE_DETAIL_RENDER_LAYOUT.patternSeed],
    original[PATH_SURFACE_DETAIL_RENDER_LAYOUT.patternSeed]
  );
  const differentWidth = pathSurfaceDetailRenderData(baseline, { ...options, roadWidth: 7 });
  assert.equal(differentWidth[PATH_SURFACE_DETAIL_RENDER_LAYOUT.roadWidth], 7);
});

test('packed pattern seed is deterministic and decorrelated by stable path and segment identity', () => {
  const detail = pathSurfaceDetailProfile('muddy-wagon-road', { seed: 8821 });
  const first = pathSurfaceDetailRenderData(detail, { pathId: 'north-road', segmentId: 'segment-a', roadWidth: 4 });
  const repeat = pathSurfaceDetailRenderData(detail, { pathId: 'north-road', segmentId: 'segment-a', roadWidth: 4 });
  const nextSegment = pathSurfaceDetailRenderData(detail, { pathId: 'north-road', segmentId: 'segment-b', roadWidth: 4 });
  const otherPath = pathSurfaceDetailRenderData(detail, { pathId: 'south-road', segmentId: 'segment-a', roadWidth: 4 });
  const seedIndex = PATH_SURFACE_DETAIL_RENDER_LAYOUT.patternSeed;

  assert.deepEqual(Array.from(repeat), Array.from(first));
  assert.notEqual(nextSegment[seedIndex], first[seedIndex]);
  assert.notEqual(otherPath[seedIndex], first[seedIndex]);
  assert.deepEqual(
    Array.from(nextSegment).filter((_, index) => index !== seedIndex),
    Array.from(first).filter((_, index) => index !== seedIndex)
  );
});

function packedVertex(mesh, vertexIndex) {
  return [
    ...mesh.surfaceDetail0.slice(vertexIndex * 4, vertexIndex * 4 + 4),
    ...mesh.surfaceDetail1.slice(vertexIndex * 4, vertexIndex * 4 + 4),
    ...mesh.surfaceDetail2.slice(vertexIndex * 4, vertexIndex * 4 + 4),
    ...mesh.surfaceDetail3.slice(vertexIndex * 4, vertexIndex * 4 + 4)
  ];
}

function packedKey(values) {
  return Array.from(values, value => Number(value).toFixed(6)).join(':');
}

function assertAlignedDetailStreams(mesh) {
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < 4; index += 1) {
    const stream = mesh[`surfaceDetail${index}`];
    assert.ok(stream instanceof Float32Array);
    assert.equal(stream.length, vertexCount * 4);
    assert.equal(stream.every(Number.isFinite), true);
  }
}

test('compiled road vertices carry complete per-segment detail data without overloading material blend', () => {
  const network = networkFixture();
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0, 1, 0]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  const road = geometry.meshes.road;
  const expected = new Set(compiled.segments.map(segment => packedKey(pathSurfaceDetailRenderData(
    segment.surfaceDetailProfile,
    {
      pathId: compiled.sourceNetworkId,
      segmentId: segment.id,
      roadWidth: segment.crossSectionProfile.width
    }
  ))));
  const actual = new Set(Array.from(
    { length: road.positions.length / 3 },
    (_, vertexIndex) => packedKey(packedVertex(road, vertexIndex))
  ));

  assert.deepEqual(actual, expected);
  assert.deepEqual(new Set(road.blends), new Set([1]), 'road blend remains a true material blend');
  assert.equal(geometry.meshes.road.blends.every(Number.isFinite), true);
  assert.ok(Math.max(...road.uvs.filter((_, index) => index % 2 === 0)) > 5, 'road U is authored in metres');
  for (const mesh of Object.values(geometry.meshes)) assertAlignedDetailStreams(mesh);
  for (const [name, mesh] of Object.entries(geometry.meshes)) {
    if (name === 'road') continue;
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
      assert.deepEqual(packedVertex(mesh, vertex), Array(16).fill(0), `${name} must not inherit road detail`);
    }
  }

  const navigation = geometry.navigationMeshes.surface;
  assertAlignedDetailStreams(navigation);
  for (let vertex = 0; vertex < navigation.positions.length / 3; vertex += 1) {
    assert.deepEqual(packedVertex(navigation, vertex), Array(16).fill(0));
  }
});

test('junctions and dead-end caps preserve one aligned connected-profile payload per triangle', () => {
  const network = normalizePathNetwork({
    id: 'surface-detail-junction',
    nodes: [
      { id: 'center', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'west', position: [-20, 0, 0], heightMode: 'absolute' },
      { id: 'east', position: [20, 0, 0], heightMode: 'absolute' },
      { id: 'north', position: [0, 0, -20], heightMode: 'absolute' }
    ],
    defaults: {
      surfaceDetailProfile: { profileId: 'muddy-wagon-road', seed: 54 }
    },
    segments: [
      { id: 'west-arm', fromNode: 'center', toNode: 'west' },
      { id: 'east-arm', fromNode: 'center', toNode: 'east' },
      { id: 'north-arm', fromNode: 'center', toNode: 'north' }
    ]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0, 1, 0]
  });
  const geometry = buildPathNetworkGeometry(compiled);
  const road = geometry.meshes.road;
  assertAlignedDetailStreams(road);
  const junctionVertices = road.roles
    .map((role, index) => role === 'junction' ? index : -1)
    .filter(index => index >= 0);
  const capVertices = road.roles
    .map((role, index) => role === 'dead-end-cap' ? index : -1)
    .filter(index => index >= 0);
  assert.ok(junctionVertices.length >= 3);
  assert.ok(capVertices.length >= 9);
  for (const vertexIndex of [...junctionVertices, ...capVertices]) {
    assert.equal(packedVertex(road, vertexIndex)[PATH_SURFACE_DETAIL_RENDER_LAYOUT.profileCode], 3);
  }
});

test('visible bridge deck tops inherit physical path detail while structure sides and navigation stay clean', () => {
  const network = normalizePathNetwork({
    id: 'surface-detail-bridge',
    nodes: [
      { id: 'a', position: [0, 0, 0], heightMode: 'absolute' },
      { id: 'b', position: [60, 0, 0], heightMode: 'absolute' }
    ],
    defaults: {
      surfaceDetailProfile: { profileId: 'muddy-wagon-road', seed: 88 }
    },
    segments: [{
      id: 'bridge-route',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: 'auto',
      crossSectionProfile: { profileId: 'dirt-road', width: 5 },
      structureProfile: { bridgeStyle: 'timber-trestle' }
    }],
    engineering: {
      bridgeThreshold: 3,
      minimumBridgeRunLength: 6,
      bridgeIntervalPadding: 0,
      maximumBridgeSpan: 50,
      maximumFill: 2,
      maxGradePercent: 20
    }
  });
  const baseHeightAt = x => x >= 24 && x <= 36 ? -8 : 0;
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: baseHeightAt,
    terrainNormalAt: () => [0, 1, 0],
    spacing: 1
  });
  const terrainModifier = compilePathTerrainModifier(compiled, { baseHeightAt, chunkSize: 16 });
  const geometry = buildPathNetworkGeometry(compiled, { terrainModifier });
  const structure = geometry.meshes.structure;
  const navigation = geometry.navigationMeshes.surface;
  assertAlignedDetailStreams(structure);
  assertAlignedDetailStreams(navigation);
  const deckTop = structure.roles
    .map((role, index) => role.endsWith('-deck-top') ? index : -1)
    .filter(index => index >= 0);
  const otherStructure = structure.roles
    .map((role, index) => !role.endsWith('-deck-top') ? index : -1)
    .filter(index => index >= 0);
  assert.ok(deckTop.length > 0);
  assert.ok(otherStructure.length > 0);
  for (const vertexIndex of deckTop) {
    const packed = packedVertex(structure, vertexIndex);
    assert.equal(packed[PATH_SURFACE_DETAIL_RENDER_LAYOUT.profileCode], 3);
    assert.ok(Math.abs(
      packed[PATH_SURFACE_DETAIL_RENDER_LAYOUT.roadWidth]
      - geometry.bridgeSelections[0].clearWidth
    ) < 1e-5);
  }
  for (const vertexIndex of otherStructure) {
    assert.deepEqual(packedVertex(structure, vertexIndex), Array(16).fill(0));
  }
  for (let vertex = 0; vertex < navigation.positions.length / 3; vertex += 1) {
    assert.deepEqual(packedVertex(navigation, vertex), Array(16).fill(0));
  }
});
