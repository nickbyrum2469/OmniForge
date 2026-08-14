import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTerrainProperties, terrainBaseHeightAt } from '../app/worldgen.js';
import { PATH_BRIDGE_PROFILES } from '../app/path-network/bridge-profiles.js';
import { compilePathObjectRuntime } from '../app/path-network/runtime.js';

const BRIDGE_FIXTURES = Object.freeze([
  Object.freeze({ style: 'steel-girder', canyonWidth: 16, canyonDepth: 12, canyonFloorWidth: 4, width: 6, vehicleClass: 'mixed', minimumBridgeRunLength: 7 }),
  Object.freeze({ style: 'timber-trestle', canyonWidth: 7, canyonDepth: 7, canyonFloorWidth: 2, width: 4.5, vehicleClass: 'mixed', minimumBridgeRunLength: 5 }),
  Object.freeze({ style: 'stone-arch', canyonWidth: 10, canyonDepth: 8, canyonFloorWidth: 3, width: 7, vehicleClass: 'mixed', minimumBridgeRunLength: 5 }),
  Object.freeze({ style: 'masonry-causeway', canyonWidth: 5.5, canyonDepth: 6, canyonFloorWidth: 1.5, width: 6, vehicleClass: 'mixed', minimumBridgeRunLength: 5 }),
  Object.freeze({ style: 'rope-footbridge', canyonWidth: 11, canyonDepth: 9, canyonFloorWidth: 3, width: 2.1, vehicleClass: 'pedestrian', minimumBridgeRunLength: 5 })
]);

const SURFACE_FIXTURES = Object.freeze([
  Object.freeze({ profileId: 'weathered-dirt-road', code: 2, values: Object.freeze({ seed: 8128, puddleCoverage: 0.05, puddleScale: 3.5, puddleDepth: 0.012, wheelRutStrength: 0.22, wheelTrackGauge: 1.45, wheelRutWidth: 0.16, hoofPrintDensity: 0, hoofPrintScale: 0.18, bootPrintDensity: 0.08, bootPrintScale: 0.26, erosionStrength: 0.25, detailNormalStrength: 0.48, weatherResponse: 0.8 }) }),
  Object.freeze({ profileId: 'muddy-wagon-road', code: 3, values: Object.freeze({ seed: 8128, puddleCoverage: 0.32, puddleScale: 3.1, puddleDepth: 0.038, wheelRutStrength: 0.72, wheelTrackGauge: 1.45, wheelRutWidth: 0.2, hoofPrintDensity: 0.18, hoofPrintScale: 0.18, bootPrintDensity: 0.12, bootPrintScale: 0.26, erosionStrength: 0.32, detailNormalStrength: 0.72, weatherResponse: 1.15 }) }),
  Object.freeze({ profileId: 'hoof-trail', code: 4, values: Object.freeze({ seed: 8128, puddleCoverage: 0.08, puddleScale: 2.4, puddleDepth: 0.018, wheelRutStrength: 0.05, wheelTrackGauge: 1.2, wheelRutWidth: 0.1, hoofPrintDensity: 0.78, hoofPrintScale: 0.18, bootPrintDensity: 0.04, bootPrintScale: 0.25, erosionStrength: 0.18, detailNormalStrength: 0.62, weatherResponse: 0.9 }) }),
  Object.freeze({ profileId: 'walked-footpath', code: 5, values: Object.freeze({ seed: 8128, puddleCoverage: 0.03, puddleScale: 2.2, puddleDepth: 0.01, wheelRutStrength: 0, wheelTrackGauge: 1.1, wheelRutWidth: 0.08, hoofPrintDensity: 0.03, hoofPrintScale: 0.18, bootPrintDensity: 0.82, bootPrintScale: 0.27, erosionStrength: 0.22, detailNormalStrength: 0.58, weatherResponse: 0.72 }) })
]);

function evidenceTerrain({ canyonWidth, canyonDepth, canyonFloorWidth, suffix }) {
  const transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  const terrain = {
    id: `evidence-terrain-${suffix}`,
    type: 'terrain',
    visible: true,
    transform,
    properties: normalizeTerrainProperties({
      preset: 'plains',
      height: 1,
      baseElevation: 0,
      macroScale: 5000,
      detailScale: 1000,
      octaves: 1,
      lacunarity: 2,
      gain: 0.15,
      warpStrength: 0,
      ridgeStrength: 0,
      plateauStrength: 0,
      valleyStrength: 0,
      canyonDepth,
      canyonWidth,
      canyonFloorWidth,
      canyonMeander: 0,
      canyonDirection: 90,
      islandStrength: 0,
      resolution: 144,
      chunkSize: 32,
      seed: 8128
    }, transform)
  };
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
  canyonWidth = 16,
  canyonDepth = 12,
  canyonFloorWidth = 4,
  width = 6,
  vehicleClass = 'mixed',
  minimumBridgeRunLength = 7,
  surfaceDetailProfile = { profileId: 'weathered-dirt-road' },
  suffix = style
} = {}) {
  return compilePathObjectRuntime(
    evidencePath({ suffix, bridgeStyle: style, width, vehicleClass, minimumBridgeRunLength, surfaceDetailProfile }),
    evidenceTerrain({ canyonWidth, canyonDepth, canyonFloorWidth, suffix }),
    { useStableCache: false }
  );
}

test('every packaged-evidence bridge family fixture compiles a real compatible structural interval', () => {
  for (const fixture of BRIDGE_FIXTURES) {
    const runtime = compileEvidenceFixture({ ...fixture, suffix: `bridge-${fixture.style}` });
    const selection = runtime.diagnostics.bridgeSelections[0];
    const bridgeInterval = runtime.diagnostics.construction.find(interval => interval.mode === 'bridge');
    const structure = runtime.diagnostics.meshStats.structure;
    const structureRoles = runtime.geometry.meshes.structure.roles || [];

    assert.equal(runtime.diagnostics.valid, true, `${fixture.style}: ${runtime.diagnostics.geometry.errors.join(' ')}`);
    assert.equal(runtime.geometry.validation.valid, true, `${fixture.style} portal/landing geometry did not validate`);
    assert.deepEqual(runtime.geometry.validation.errors, [], `${fixture.style} portal/landing geometry reported errors`);
    assert.equal(runtime.diagnostics.terrain.bridgeIntervalCount, 1, `${fixture.style} did not compile a bridge interval`);
    assert.equal(runtime.diagnostics.bridgeSelections.length, 1, `${fixture.style} did not resolve one bridge selection`);
    assert.equal(selection.bridgeStyle, fixture.style);
    assert.equal(selection.valid, true);
    assert.ok(selection.span >= fixture.minimumBridgeRunLength, `${fixture.style} span ${selection.span} did not meet the evidence minimum run`);
    assert.ok(selection.span >= fixture.canyonFloorWidth * 2, `${fixture.style} span ${selection.span} did not cross the ravine floor`);
    assert.ok(selection.span <= PATH_BRIDGE_PROFILES[fixture.style].maximumSpan, `${fixture.style} span ${selection.span} exceeded its production family limit`);
    assert.ok(bridgeInterval.startDistance < 55 && bridgeInterval.endDistance > 55, `${fixture.style} did not cross the ravine centre`);
    assert.ok(structureRoles.some(role => (
      role.includes('portal-apron')
      || role.includes('anchor-landing')
      || role.includes('anchor-post')
    )), `${fixture.style} produced no compiled portal/landing structure`);
    assert.ok(structure.vertexCount > 0, `${fixture.style} produced no structural vertices`);
    assert.ok(structure.indexCount > 0, `${fixture.style} produced no indexed structural geometry`);
  }
});

test('packaged evidence terrain is an elongated cross-route ravine, not a radial bowl', () => {
  const terrain = evidenceTerrain({
    canyonWidth: 16,
    canyonDepth: 12,
    canyonFloorWidth: 4,
    suffix: 'ravine-shape'
  });
  const centre = terrainBaseHeightAt(terrain, 0, 0);
  const alongNorth = terrainBaseHeightAt(terrain, 0, 38);
  const alongSouth = terrainBaseHeightAt(terrain, 0, -38);
  const westBank = terrainBaseHeightAt(terrain, -38, 0);
  const eastBank = terrainBaseHeightAt(terrain, 38, 0);

  assert.ok(centre < -10, 'ravine centre is not deeply excavated');
  assert.ok(alongNorth < -10 && alongSouth < -10, 'ravine does not remain elongated along Z');
  assert.ok(westBank > -2 && eastBank > -2, 'ravine banks do not recover across the X-aligned route');
});

test('the exact packaged native horizontal plus 2.4 metre vertical edit remains Civil-Assist-valid', () => {
  const terrain = evidenceTerrain({ canyonWidth: 16, canyonDepth: 12, canyonFloorWidth: 4, suffix: 'native-edit' });
  const path = evidencePath({
    suffix: 'native-edit',
    bridgeStyle: 'steel-girder',
    width: 6,
    vehicleClass: 'mixed',
    minimumBridgeRunLength: 7,
    surfaceDetailProfile: {
      profileId: 'muddy-wagon-road',
      seed: 8128,
      puddleCoverage: 0.28,
      wheelRutStrength: 0.62,
      hoofPrintDensity: 0.18,
      bootPrintDensity: 0.12,
      weatherResponse: 0.78
    }
  });
  const network = path.properties.pathNetwork;
  network.nodes[0].position = [-50.272233051681035, 2.4, 0.6663010475217277];
  Object.assign(network.segments[0].crossSectionProfile, {
    shoulderWidth: 0.9,
    blendDistance: 3.4,
    depth: 0.24
  });

  const runtime = compilePathObjectRuntime(path, terrain, { useStableCache: false });
  assert.equal(runtime.diagnostics.valid, true, 'the native evidence edit must not disappear as an invalid route');
  assert.equal(runtime.diagnostics.terrain.bridgeIntervalCount, 1);
  assert.equal(runtime.diagnostics.bridgeSelections.length, 1);
  assert.equal(runtime.diagnostics.bridgeSelections[0].bridgeStyle, 'steel-girder');
  assert.ok(runtime.diagnostics.meshStats.structure.indexCount > 0);
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
