import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRouteConstraintObject,
  routeRestrictionForObject,
  routeRestrictionsFromScene
} from '../app/path-network/world-constraints.js';
import { solveTerrainAwareTrails } from '../app/path-network/trail-solver.js';

const object = (overrides = {}) => ({
  id: 'building-a',
  name: 'Workshop',
  type: 'box',
  visible: true,
  transform: {
    position: [10, 0, 20],
    rotation: [0, 0, 0],
    scale: [8, 4, 6]
  },
  properties: { collider: true },
  ...overrides
});

test('scene structures compile into deterministic padded route restrictions', () => {
  const restriction = routeRestrictionForObject(object(), [], { clearance: 2 });
  assert.deepEqual(restriction, {
    type: 'rectangle',
    source: 'scene-object',
    sourceObjectId: 'building-a',
    sourceObjectName: 'Workshop',
    reason: 'authored-structure-clearance',
    minX: 4,
    maxX: 16,
    minZ: 15,
    maxZ: 25
  });
});

test('rotated model bounds produce a conservative world-space footprint', () => {
  const model = object({
    id: 'hall',
    type: 'model',
    transform: {
      position: [5, 0, -3],
      rotation: [0, 90, 0],
      scale: [2, 1, 1]
    },
    properties: { assetId: 'hall-model' }
  });
  const assets = [{
    id: 'hall-model',
    type: 'model',
    bounds: { center: [1, 2, 0], size: [4, 4, 10] }
  }];
  const restriction = routeRestrictionForObject(model, assets, { clearance: 1 });
  assert.ok(Math.abs(restriction.minX - -1) < 1e-6);
  assert.ok(Math.abs(restriction.maxX - 11) < 1e-6);
  assert.ok(Math.abs(restriction.minZ - -10) < 1e-6);
  assert.ok(Math.abs(restriction.maxZ - 0) < 1e-6);
});

test('editor references, paths, terrain, celestial objects, and explicit opt-outs never block routes', () => {
  const editorReference = object({ properties: { editorReference: true, renderClass: 'editor-only' } });
  const path = object({ type: 'path' });
  const terrain = object({ type: 'terrain' });
  const moon = object({ type: 'sphere', properties: { celestialRole: 'moon' } });
  const optedOut = object({ properties: { routeConstraint: false } });
  for (const candidate of [editorReference, path, terrain, moon, optedOut]) {
    assert.equal(isRouteConstraintObject(candidate), false);
  }
});

test('scene restrictions are stable and exclude the path currently being edited', () => {
  const scene = {
    objects: [
      object({ id: 'z-building' }),
      object({ id: 'active-path', type: 'path' }),
      object({ id: 'a-building', transform: { position: [-8, 0, 2], rotation: [0, 0, 0], scale: [2, 2, 2] } })
    ]
  };
  const restrictions = routeRestrictionsFromScene({
    scene,
    excludeObjectIds: ['active-path'],
    clearance: 1
  });
  assert.deepEqual(restrictions.map(item => item.sourceObjectId), ['a-building', 'z-building']);
});

test('the terrain-aware solver samples around compiled scene footprints instead of crossing them', () => {
  const scene = {
    objects: [
      object({
        id: 'facility',
        transform: { position: [0, 0, 0], rotation: [0, 25, 0], scale: [12, 4, 12] }
      })
    ]
  };
  const restrictions = routeRestrictionsFromScene({ scene, clearance: 1.5 });
  const terrain = {
    elevationAt: () => 0,
    analysisAt: () => ({
      elevation: 0,
      slope: 0,
      roughness: 0,
      constructionSuitability: 1,
      localRelief: 0
    }),
    describe: () => ({ revisions: { authoredNatural: 1 } })
  };
  const solved = solveTerrainAwareTrails({
    terrain,
    start: [-30, 0],
    end: [30, 0],
    restrictions,
    candidatePolicies: ['balanced'],
    routeStep: 4,
    sampleSpacing: 1,
    seed: 12
  });
  assert.equal(solved.candidates.length, 1);
  assert.equal(solved.candidates[0].constraintSources[0].sourceObjectId, 'facility');
  assert.equal(solved.diagnostics.constraintCount, 1);
  const restriction = restrictions[0];
  for (const [start, end] of solved.candidates[0].points.slice(0, -1).map((point, index) => [
    point,
    solved.candidates[0].points[index + 1]
  ])) {
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    for (let sample = 0; sample <= Math.ceil(distance); sample += 1) {
      const t = sample / Math.max(1, Math.ceil(distance));
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[1] + (end[1] - start[1]) * t;
      assert.equal(
        x >= restriction.minX && x <= restriction.maxX
          && z >= restriction.minZ && z <= restriction.maxZ,
        false
      );
    }
  }
});
