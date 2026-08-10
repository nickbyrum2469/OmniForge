import assert from 'node:assert/strict';
import test from 'node:test';

import { addTerrainSculptLayer, normalizeTerrainProperties } from '../app/worldgen.js';
import { compilePathObjectRuntime } from '../app/path-network/runtime.js';

const BRIDGE_FIXTURES = Object.freeze([
  Object.freeze({ style: 'steel-girder', radius: 18, depth: 12, width: 6, vehicleClass: 'mixed', minimumBridgeRunLength: 7, expectedSpan: 30.680272108843532 }),
  Object.freeze({ style: 'timber-trestle', radius: 7, depth: 7, width: 4.5, vehicleClass: 'mixed', minimumBridgeRunLength: 5, expectedSpan: 11.224489795918373 }),
  Object.freeze({ style: 'stone-arch', radius: 10, depth: 8, width: 7, vehicleClass: 'mixed', minimumBridgeRunLength: 5, expectedSpan: 15.714285714285708 }),
  Object.freeze({ style: 'masonry-causeway', radius: 8, depth: 6, width: 6, vehicleClass: 'mixed', minimumBridgeRunLength: 5, expectedSpan: 12.721088435374156 }),
  Object.freeze({ style: 'rope-footbridge', radius: 11, depth: 9, width: 2.1, vehicleClass: 'pedestrian', minimumBridgeRunLength: 5, expectedSpan: 17.328767123287676 })
]);

const SURFACE_FIXTURES = Object.freeze([
  Object.freeze({ profileId: 'weathered-dirt-road', code: 2, values: Object.freeze({ seed: 8128, puddleCoverage: 0.05, puddleScale: 3.5, puddleDepth: 0.012, wheelRutStrength: 0.22, wheelTrackGauge: 1.45, wheelRutWidth: 0.16, hoofPrintDensity: 0, hoofPrintScale: 0.18, bootPrintDensity: 0.08, bootPrintScale: 0.26, erosionStrength: 0.25, detailNormalStrength: 0.48, weatherResponse: 0.8 }) }),
  Object.freeze({ profileId: 'muddy-wagon-road', code: 3, values: Object.freeze({ seed: 8128, puddleCoverage: 0.32, puddleScale: 3.1, puddleDepth: 0.038, wheelRutStrength: 0.72, wheelTrackGauge: 1.45, wheelRutWidth: 0.2, hoofPrintDensity: 0.18, hoofPrintScale: 0.18, bootPrintDensity: 0.12, bootPrintScale: 0.26, erosionStrength: 0.32, detailNormalStrength: 0.72, weatherResponse: 1.15 }) }),
  Object.freeze({ profileId: 'hoof-trail', code: 4, values: Object.freeze({ seed: 8128, puddleCoverage: 0.08, puddleScale: 2.4, puddleDepth: 0.018, wheelRutStrength: 0.05, wheelTrackGauge: 1.2, wheelRutWidth: 0.1, hoofPrintDensity: 0.78, hoofPrintScale: 0.18, bootPrintDensity: 0.04, bootPrintScale: 0.25, erosionStrength: 0.18, detailNormalStrength: 0.62, weatherResponse: 0.9 }) }),
  Object.freeze({ profileId: 'walked-footpath', code: 5, values: Object.freeze({ seed: 8128, puddleCoverage: 0.03, puddleScale: 2.2, puddleDepth: 0.01, wheelRutStrength: 0, wheelTrackGauge: 1.1, wheelRutWidth: 0.08, hoofPrintDensity: 0.03, hoofPrintScale: 0.18, bootPrintDensity: 0.82, bootPrintScale: 0.27, erosionStrength: 0.22, detailNormalStrength: 0.58, weatherResponse: 0.72 }) })
]);

function evidenceTerrain({ radius, depth, suffix }) {
  const transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  const terrain = {
    id: `evidence-terrain-${suffix}`,
    type: 'terrain',
    visible: true,
    transform,
    properties: normalizeTerrainProperties({
      preset: 'plains',
      height: 0,
      baseElevation: 0,
      macroScale: 240,
      detailScale: 48,
      warpStrength: 0,
      ridgeStrength: 0,
      plateauStrength: 0,
      valleyStrength: 0,
      canyonDepth: 0,
      islandStrength: 0,
      resolution: 144,
      chunkSize: 32,
      seed: 8128
    }, transform)
  };
  addTerrainSculptLayer(terrain, {
    mode: 'lower',
    x: 0,
    z: 0,
    radius,
    strength: depth,
    falloff: 0.78
  });
  return terrain;
}

function evidencePath({
  suffix,
  bridgeStyle,
  width,
  vehicleClass,
  minimumBridgeRunLength,
  surfaceDetailProfile
}) {
  return {
    id: `evidence-path-${suffix}`,
    type: 'path',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      pathNetwork: {
        schemaVersion: 2,
        id: `evidence-path-${suffix}:network`,
        revision: 1,
        nodes: [
          { id: 'approach-west', position: [-55, 0, 0], heightMode: 'absolute', heightOffset: 0, handleMode: 'automatic' },
          { id: 'approach-east', position: [55, 0, 0], heightMode: 'absolute', heightOffset: 0, handleMode: 'automatic' }
        ],
        segments: [{
          id: 'bridge-showcase',
          fromNode: 'approach-west',
          toNode: 'approach-east',
          curveType: 'cubic-hermite',
          constructionMode: 'auto',
          constructionLocked: false,
          crossSectionProfile: {
            profileId: width <= 2.1 ? 'natural-trail' : 'dirt-road',
            width,
            shoulderWidth: 0.75,
            blendDistance: 3.2,
            depth: 0.22
          },
          structureProfile: { bridgeStyle },
          surfaceDetailProfile,
          gameplayRules: { vehicleClass, navigation: true, collision: true }
        }],
        engineering: {
          civilAssist: true,
          maxGradePercent: 12,
          maximumCut: 5,
          maximumFill: 2,
          bridgeThreshold: 3,
          minimumBridgeRunLength,
          bridgeIntervalPadding: 0,
          maximumBridgeSpan: 48
        },
        editor: { showSpline: true, showGrade: true, showConstruction: true }
      }
    }
  };
}

function compileEvidenceFixture({
  style = 'steel-girder',
  radius = 18,
  depth = 12,
  width = 6,
  vehicleClass = 'mixed',
  minimumBridgeRunLength = 7,
  surfaceDetailProfile = { profileId: 'weathered-dirt-road' },
  suffix = style
} = {}) {
  return compilePathObjectRuntime(
    evidencePath({ suffix, bridgeStyle: style, width, vehicleClass, minimumBridgeRunLength, surfaceDetailProfile }),
    evidenceTerrain({ radius, depth, suffix }),
    { useStableCache: false }
  );
}

test('every packaged-evidence bridge family fixture compiles a real compatible structural interval', () => {
  for (const fixture of BRIDGE_FIXTURES) {
    const runtime = compileEvidenceFixture({ ...fixture, suffix: `bridge-${fixture.style}` });
    const selection = runtime.diagnostics.bridgeSelections[0];
    const structure = runtime.diagnostics.meshStats.structure;

    assert.equal(runtime.diagnostics.valid, true, `${fixture.style}: ${runtime.diagnostics.geometry.errors.join(' ')}`);
    assert.equal(runtime.diagnostics.terrain.bridgeIntervalCount, 1, `${fixture.style} did not compile a bridge interval`);
    assert.equal(runtime.diagnostics.bridgeSelections.length, 1, `${fixture.style} did not resolve one bridge selection`);
    assert.equal(selection.bridgeStyle, fixture.style);
    assert.equal(selection.valid, true);
    assert.ok(Math.abs(selection.span - fixture.expectedSpan) <= 0.001, `${fixture.style} span changed from the evidence target`);
    assert.ok(structure.vertexCount > 0, `${fixture.style} produced no structural vertices`);
    assert.ok(structure.indexCount > 0, `${fixture.style} produced no indexed structural geometry`);
  }
});

test('every packaged-evidence surface profile reaches both road and bridge GPU-facing vertex streams', () => {
  const packedPayloads = new Set();
  for (const fixture of SURFACE_FIXTURES) {
    const runtime = compileEvidenceFixture({
      suffix: `surface-${fixture.profileId}`,
      surfaceDetailProfile: { profileId: fixture.profileId, ...fixture.values }
    });
    const road = runtime.geometry.meshes.road;
    const structure = runtime.geometry.meshes.structure;
    const roadPayload = [
      ...road.surfaceDetail0.slice(0, 4),
      ...road.surfaceDetail1.slice(0, 4),
      ...road.surfaceDetail2.slice(0, 4),
      ...road.surfaceDetail3.slice(0, 4)
    ];
    const structurePayload = [
      ...structure.surfaceDetail0.slice(0, 4),
      ...structure.surfaceDetail1.slice(0, 4),
      ...structure.surfaceDetail2.slice(0, 4),
      ...structure.surfaceDetail3.slice(0, 4)
    ];

    assert.equal(runtime.diagnostics.valid, true);
    assert.equal(runtime.diagnostics.segments[0].surfaceProfileId, fixture.profileId);
    assert.equal(roadPayload[0], fixture.code, `${fixture.profileId} did not reach the road profile-code stream`);
    assert.equal(structurePayload[0], fixture.code, `${fixture.profileId} did not reach the bridge profile-code stream`);
    assert.ok(Math.abs(roadPayload[2] - fixture.values.puddleCoverage) <= 1e-6);
    assert.ok(Math.abs(roadPayload[5] - fixture.values.wheelRutStrength) <= 1e-6);
    assert.ok(Math.abs(roadPayload[8] - fixture.values.hoofPrintDensity) <= 1e-6);
    assert.ok(Math.abs(roadPayload[10] - fixture.values.bootPrintDensity) <= 1e-6);
    assert.deepEqual(structurePayload, roadPayload, `${fixture.profileId} changed at the bridge transition`);
    packedPayloads.add(roadPayload.join(','));
  }
  assert.equal(packedPayloads.size, SURFACE_FIXTURES.length, 'surface evidence profiles collapsed to identical GPU payloads');
});
