import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePathNetwork } from '../app/path-network/model.js';
import {
  clearPathRuntimeCache,
  compilePathObjectRuntime,
  createScenePathRuntimeContext
} from '../app/path-network/runtime.js';
import * as consumerApi from '../app/path-network/consumers.js';
import { samplePathTerrainModifier } from '../app/path-network/terrain-modifier.js';
import { fitGroundContactV011 } from '../server/v011-systems.mjs';
import { generateFoliagePlacements } from '../server/v010-systems.mjs';

function terrainFixture({ id = 'terrain', baseHeight = 0 } = {}) {
  return {
    id,
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'plains',
      seed: 17,
      height: 0,
      baseHeight,
      bounds: { minX: -64, maxX: 64, minZ: -64, maxZ: 64 },
      resolutionX: 64,
      resolutionZ: 64,
      chunkSize: 16,
      generatedRevision: 3
    }
  };
}

function pathFixture({
  id,
  networkId = `${id}-network`,
  revision = 1,
  y = 0,
  z = 0,
  mode = 'cut-fill',
  maxGradePercent = 12,
  maxFillDepth = 2.5,
  maxCutDepth = 6
}) {
  const network = normalizePathNetwork({
    id: networkId,
    revision,
    nodes: [
      { id: `${id}-a`, position: [-20, y, z], heightMode: 'absolute' },
      { id: `${id}-b`, position: [20, y, z], heightMode: 'absolute' }
    ],
    segments: [{
      id: `${id}-segment`,
      fromNode: `${id}-a`,
      toNode: `${id}-b`,
      constructionMode: mode,
      constructionLocked: mode !== 'auto',
      crossSectionProfile: {
        width: 4,
        crownHeight: 0.1,
        shoulderWidth: 1,
        shoulderDrop: 0.08,
        drainageEnabled: false,
        blendDistance: 2,
        terrainUnderlayClearance: 0.04
      }
    }],
    engineering: {
      civilAssist: true,
      maxGradePercent,
      maxFillDepth,
      maxCutDepth
    }
  }, { pathId: id });
  return {
    id,
    type: 'path',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      pathNetwork: network,
      pathNetworkSchemaVersion: 2
    }
  };
}

function runtimeFor(path, terrain) {
  return compilePathObjectRuntime(path, terrain, { useStableCache: false });
}

function requireSceneConsumerContract() {
  assert.equal(
    typeof consumerApi.connectScenePathRuntimeConsumers,
    'function',
    'Gate 0 requires one aggregate scene-consumer bundle for every compiled path runtime.'
  );
  assert.equal(
    typeof consumerApi.sampleSceneGroundSurface,
    'function',
    'Gate 0 requires a reference-height-aware scene ground-surface query.'
  );
}

test.beforeEach(() => clearPathRuntimeCache());

test('construction samples keep visible surface height separate from bounded terrain underlay', () => {
  const terrain = terrainFixture();
  const path = pathFixture({
    id: 'raised-cut-fill',
    y: 4,
    mode: 'cut-fill',
    maxFillDepth: 1.5
  });
  const runtime = runtimeFor(path, terrain);
  const sample = samplePathTerrainModifier(runtime.terrainModifier, 0, 0);

  assert.equal(sample.zone, 'road');
  assert.equal(sample.constructionMode, 'cut-fill');
  assert.ok(sample.height < 1.51, 'terrain support remains bounded by the configured fill budget');
  assert.ok(sample.targetHeight <= 1.5, 'terrain target remains the bounded support target');
  assert.ok(
    Number.isFinite(sample.surfaceHeight),
    'the compiled visible road surface must be preserved independently from terrain support'
  );
  assert.ok(Math.abs(sample.surfaceHeight - 4.1) <= 0.01);
  assert.ok(sample.surfaceHeight > sample.targetHeight + 2.5);
});

test('bridge selection uses authored deck height above the object and terrain below it', () => {
  requireSceneConsumerContract();
  const terrain = terrainFixture();
  const runtime = runtimeFor(pathFixture({
    id: 'bridge',
    networkId: 'bridge-network',
    revision: 9,
    y: 10,
    mode: 'bridge',
    maxFillDepth: 2.5
  }), terrain);
  const sceneConsumers = consumerApi.connectScenePathRuntimeConsumers([runtime]);

  const belowDeck = consumerApi.sampleSceneGroundSurface(
    sceneConsumers,
    0,
    0,
    0,
    { referenceY: 1, snapTolerance: 0.25 }
  );
  const aboveDeck = consumerApi.sampleSceneGroundSurface(
    sceneConsumers,
    0,
    0,
    0,
    { referenceY: 12, snapTolerance: 0.25 }
  );

  assert.equal(belowDeck.source, 'terrain');
  assert.equal(belowDeck.height, 0);
  assert.equal(aboveDeck.source, 'path-surface');
  assert.equal(aboveDeck.constructionMode, 'bridge');
  assert.ok(Math.abs(aboveDeck.height - 10.1) <= 0.01);
  assert.equal(aboveDeck.sourceNetworkId, 'bridge');
  assert.equal(aboveDeck.sourceRevision, 9);
  assert.equal(aboveDeck.generationRevision, 9);
});

test('tunnel selection uses the tunnel floor inside and terrain surface above', () => {
  requireSceneConsumerContract();
  const terrain = terrainFixture({ baseHeight: 12 });
  const runtime = runtimeFor(pathFixture({
    id: 'tunnel',
    networkId: 'tunnel-network',
    revision: 4,
    y: 2,
    mode: 'tunnel'
  }), terrain);
  const sceneConsumers = consumerApi.connectScenePathRuntimeConsumers([runtime]);

  const insideTunnel = consumerApi.sampleSceneGroundSurface(
    sceneConsumers,
    12,
    0,
    0,
    { referenceY: 3, snapTolerance: 0.25 }
  );
  const aboveTunnel = consumerApi.sampleSceneGroundSurface(
    sceneConsumers,
    12,
    0,
    0,
    { referenceY: 14, snapTolerance: 0.25 }
  );

  assert.equal(insideTunnel.source, 'path-surface');
  assert.equal(insideTunnel.constructionMode, 'tunnel');
  assert.ok(Math.abs(insideTunnel.height - 2.1) <= 0.01);
  assert.equal(aboveTunnel.source, 'terrain');
  assert.equal(aboveTunnel.height, 12);
});

test('invalid paths cannot become ground surfaces or exclusions', () => {
  requireSceneConsumerContract();
  assert.equal(
    typeof consumerApi.scenePathFoliageExcluded,
    'function',
    'Gate 0 requires aggregate foliage exclusion from the same scene-consumer bundle.'
  );
  const terrain = terrainFixture();
  const invalidPath = pathFixture({
    id: 'invalid-grade',
    networkId: 'invalid-network',
    revision: 12,
    y: 0,
    mode: 'auto',
    maxGradePercent: 2
  });
  invalidPath.properties.pathNetwork.nodes[1].position[1] = 100;
  const runtime = runtimeFor(invalidPath, terrain);
  assert.equal(runtime.compiled.segments[0].construction.mode, 'invalid');
  const sceneConsumers = consumerApi.connectScenePathRuntimeConsumers([runtime]);
  const sample = consumerApi.sampleSceneGroundSurface(
    sceneConsumers,
    0,
    0,
    0,
    { referenceY: 120, snapTolerance: 0.25 }
  );

  assert.equal(sample.source, 'terrain');
  assert.equal(sample.height, 0);
  assert.equal(consumerApi.scenePathFoliageExcluded(sceneConsumers, 0, 0, 4), false);
});

test('overlapping paths resolve deterministically and preserve selected revision identity', () => {
  requireSceneConsumerContract();
  const terrain = terrainFixture();
  const low = runtimeFor(pathFixture({
    id: 'low',
    networkId: 'network-low',
    revision: 3,
    y: 4,
    mode: 'bridge'
  }), terrain);
  const high = runtimeFor(pathFixture({
    id: 'high',
    networkId: 'network-high',
    revision: 17,
    y: 7,
    mode: 'bridge'
  }), terrain);

  const forward = consumerApi.sampleSceneGroundSurface(
    consumerApi.connectScenePathRuntimeConsumers([low, high]),
    0,
    0,
    0,
    { referenceY: 10, snapTolerance: 0.25 }
  );
  const reversed = consumerApi.sampleSceneGroundSurface(
    consumerApi.connectScenePathRuntimeConsumers([high, low]),
    0,
    0,
    0,
    { referenceY: 10, snapTolerance: 0.25 }
  );

  for (const sample of [forward, reversed]) {
    assert.equal(sample.source, 'path-surface');
    assert.equal(sample.sourceNetworkId, 'high');
    assert.equal(sample.sourceRevision, 17);
    assert.equal(sample.generationRevision, 17);
    assert.ok(Math.abs(sample.height - 7.1) <= 0.01);
  }
  assert.deepEqual(
    {
      sourceNetworkId: forward.sourceNetworkId,
      sourceRevision: forward.sourceRevision,
      generationRevision: forward.generationRevision,
      height: forward.height
    },
    {
      sourceNetworkId: reversed.sourceNetworkId,
      sourceRevision: reversed.sourceRevision,
      generationRevision: reversed.generationRevision,
      height: reversed.height
    }
  );
});

test('server grounding stands on the same compiled bridge deck and records its revision', () => {
  const terrain = terrainFixture();
  const bridge = pathFixture({ id: 'bridge-grounding', revision: 21, y: 10, mode: 'bridge' });
  const scene = { settings: {}, objects: [terrain, bridge] };
  const object = {
    id: 'bridge-crate',
    type: 'model',
    transform: { position: [0, 12, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {}
  };
  const asset = {
    category: 'prop',
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5], size: [1, 1, 1], center: [0, 0, 0] }
  };
  const diagnostics = fitGroundContactV011({ scene, object, asset });

  assert.equal(diagnostics.pathAware, true);
  assert.deepEqual(diagnostics.pathNetworkIds, ['bridge-grounding']);
  assert.deepEqual(diagnostics.pathGenerationRevisions, [21]);
  assert.deepEqual(diagnostics.constructionModes, ['bridge']);
  assert.ok(Math.abs((object.transform.position[1] - 0.5) - 10.08) <= 0.03);
});

test('foliage placement uses final construction terrain and the shared compiled exclusion', () => {
  const terrain = terrainFixture();
  const road = pathFixture({ id: 'foliage-road', revision: 6, y: 0, mode: 'cut-fill' });
  const scene = { settings: {}, objects: [terrain, road] };
  const species = {
    spacing: 1.2,
    pathExclusion: 2,
    structureExclusion: 0,
    maxSlope: 80,
    scaleMin: 1,
    scaleMax: 1,
    rootBurial: 0.1
  };
  const placements = generateFoliagePlacements({
    scene,
    species,
    center: [0, 0, 0],
    radius: 10,
    density: 0.08,
    seed: 44,
    maxInstances: 30
  });
  const context = createScenePathRuntimeContext(scene);

  assert.ok(placements.length > 0);
  for (const placement of placements) {
    const [x, y, z] = placement.position;
    assert.equal(consumerApi.scenePathFoliageExcluded(context.sceneConsumers, x, z, species.pathExclusion), false);
    const expectedY = context.terrainService.elevationAt(x, z, { view: 'final-construction' }) - species.rootBurial;
    assert.ok(Math.abs(y - expectedY) <= 1e-7);
  }
});
