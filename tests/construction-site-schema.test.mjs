import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTRUCTION_SITE_SCHEMA_VERSION,
  normalizeConstructionSite,
  signedFootprintArea,
  validateConstructionSite
} from '../app/world/construction-site-schema.js';

function validSite(overrides = {}) {
  return {
    id: 'site-town-hall',
    name: 'Town Hall Site',
    kind: 'building-pad',
    purpose: 'civic-building',
    footprint: [[-8, -6], [8, -6], [8, 6], [-8, 6]],
    elevation: { mode: 'best-fit-plane', offset: 0 },
    grading: { mode: 'best-fit-plane', maxSlopeDegrees: 8 },
    accessAnchors: [{
      id: 'site-town-hall:access:main',
      kind: 'road',
      position: [0, 2, -6],
      pathObjectId: 'road-main',
      pathNetworkId: 'road-main-network',
      nodeId: 'road-node-1',
      segmentId: 'road-segment-1'
    }],
    terrainRegionIds: ['region-town-hall'],
    ...overrides
  };
}

function context() {
  return {
    pathObjectIds: new Set(['road-main']),
    pathNetworks: new Map([['road-main', {
      id: 'road-main-network',
      nodes: [{ id: 'road-node-1' }],
      segments: [{ id: 'road-segment-1' }]
    }]]),
    terrainRegionIds: new Set(['region-town-hall'])
  };
}

test('construction-site normalization is deterministic, idempotent, and metadata-only', () => {
  const source = validSite({ id: '', tags: ['civic', 'civic', 'town'] });
  const first = normalizeConstructionSite(source, { index: 2 });
  const second = normalizeConstructionSite(first, { index: 2 });
  assert.equal(first.schemaVersion, CONSTRUCTION_SITE_SCHEMA_VERSION);
  assert.equal(first.id, 'construction-site-3');
  assert.deepEqual(first, second);
  assert.deepEqual(first.tags, ['civic', 'town']);
  assert.equal(first.createdAt, undefined);
  assert.equal(first.updatedAt, undefined);
  assert.equal(first.mesh, undefined);
  assert.equal(first.heightfield, undefined);
  assert.equal(first.collision, undefined);
  assert.equal(first.navigation, undefined);
});

test('construction-site validation accepts a finite footprint and resolved path access', () => {
  const site = validSite();
  const result = validateConstructionSite(site, context());
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(signedFootprintArea(site.footprint), 192);
});

test('construction-site validation rejects non-finite and degenerate footprints', () => {
  const nonFinite = validateConstructionSite(validSite({
    footprint: [[0, 0], [Number.NaN, 2], [2, 0]]
  }), context());
  assert.equal(nonFinite.valid, false);
  assert.match(nonFinite.errors.join(' '), /non-finite coordinate/);

  const degenerate = validateConstructionSite(validSite({
    footprint: [[0, 0], [1, 1], [2, 2]]
  }), context());
  assert.equal(degenerate.valid, false);
  assert.match(degenerate.errors.join(' '), /degenerate/);
});

test('construction-site validation rejects duplicate and dangling access references', () => {
  const site = validSite({
    accessAnchors: [
      { id: 'access-a', position: [0, 0, 0], pathObjectId: 'missing-road' },
      { id: 'access-a', position: [1, Number.POSITIVE_INFINITY, 1], nodeId: 'missing-node' }
    ],
    terrainRegionIds: ['region-town-hall', 'region-town-hall', 'missing-region']
  });
  const result = validateConstructionSite(site, context());
  assert.equal(result.valid, false);
  const errors = result.errors.join(' ');
  assert.match(errors, /duplicate access anchor id access-a/);
  assert.match(errors, /non-finite position/);
  assert.match(errors, /missing path object missing-road/);
  assert.match(errors, /without pathObjectId/);
  assert.match(errors, /repeats terrain region region-town-hall/);
  assert.match(errors, /missing terrain region missing-region/);
});

test('absolute construction-site elevation requires a finite target', () => {
  const result = validateConstructionSite(validSite({
    elevation: { mode: 'absolute', target: 'not-a-height', offset: 0 }
  }), context());
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /requires a finite target/);
});

test('construction-site kind and grading semantics are constrained', () => {
  const normalized = normalizeConstructionSite(validSite({
    kind: 'not-a-site-kind',
    grading: { mode: 'magic', maxSlopeDegrees: 400 }
  }));
  assert.equal(normalized.kind, 'building-pad');
  assert.deepEqual(normalized.grading, { mode: 'best-fit-plane', maxSlopeDegrees: 89 });
  const validation = validateConstructionSite(validSite({
    kind: 'not-a-site-kind',
    grading: { mode: 'magic', maxSlopeDegrees: 90 }
  }), context());
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /unsupported kind/);
  assert.match(validation.errors.join(' '), /unsupported grading mode/);
  assert.match(validation.errors.join(' '), /maxSlopeDegrees/);
});
