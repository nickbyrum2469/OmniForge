import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRAIN_WORLD_COORDINATE_AUTHORITY,
  TERRAIN_WORLD_SCHEMA_VERSION,
  normalizeTerrainWorld,
  validateTerrainWorld
} from '../app/world/terrain-world-schema.js';

function scene() {
  return {
    id: 'scene-main',
    objects: [
      { id: 'terrain-main', type: 'terrain', properties: {}, transform: { position: [0, 0, 0], scale: [1, 1, 1] } },
      {
        id: 'road-main',
        type: 'path',
        properties: {
          pathNetwork: {
            id: 'road-network',
            nodes: [{ id: 'road-node-1' }, { id: 'road-node-2' }],
            segments: [{ id: 'road-segment-1' }]
          }
        }
      },
      { id: 'building-shell', type: 'model' }
    ]
  };
}

function validWorld(overrides = {}) {
  return {
    schemaVersion: 1,
    coordinateAuthority: TERRAIN_WORLD_COORDINATE_AUTHORITY,
    terrainId: 'terrain-main',
    revision: 3,
    constructionSites: [{
      id: 'site-civic',
      name: 'Civic Site',
      kind: 'building-pad',
      footprint: [[-10, -8], [10, -8], [10, 8], [-10, 8]],
      elevation: { mode: 'best-fit-plane', offset: 0 },
      grading: { mode: 'best-fit-plane', maxSlopeDegrees: 8 },
      accessAnchors: [{
        id: 'site-civic:access:main',
        position: [0, 1, -8],
        pathObjectId: 'road-main',
        pathNetworkId: 'road-network',
        segmentId: 'road-segment-1'
      }],
      terrainRegionIds: ['region-civic']
    }],
    terrainRegions: [{
      id: 'region-civic',
      kind: 'building-pad',
      footprint: [[-12, -10], [12, -10], [12, 10], [-12, 10]],
      elevationRange: { min: -4, max: 18 },
      ownerSiteId: 'site-civic',
      referencedObjectIds: ['building-shell']
    }],
    ...overrides
  };
}

test('terrain-world schema stores planning records without becoming surface authority', () => {
  const normalized = normalizeTerrainWorld(validWorld());
  assert.equal(normalized.schemaVersion, TERRAIN_WORLD_SCHEMA_VERSION);
  assert.equal(normalized.coordinateAuthority, 'world-space-meters');
  assert.equal(normalized.terrainId, 'terrain-main');
  assert.equal(normalized.terrainHeight, undefined);
  assert.equal(normalized.heightfield, undefined);
  assert.equal(normalized.renderMeshes, undefined);
  assert.equal(normalized.collisionMeshes, undefined);
  assert.equal(normalized.navigationSurfaces, undefined);
  assert.equal(normalized.cache, undefined);
  assert.deepEqual(normalized, normalizeTerrainWorld(normalized));
});

test('terrain-world validation accepts resolved sites, regions, objects, and path anchors', () => {
  const result = validateTerrainWorld(validWorld(), scene());
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.constructionSiteCount, 1);
  assert.equal(result.terrainRegionCount, 1);
});

test('terrain-world validation rejects duplicate planning ids and inverted regions', () => {
  const world = validWorld();
  world.constructionSites.push(structuredClone(world.constructionSites[0]));
  world.terrainRegions.push({
    ...structuredClone(world.terrainRegions[0]),
    id: 'site-civic',
    elevationRange: { min: 20, max: -3 }
  });
  const result = validateTerrainWorld(world, scene());
  assert.equal(result.valid, false);
  const errors = result.errors.join(' ');
  assert.match(errors, /Duplicate construction site id site-civic/);
  assert.match(errors, /shared by a construction site and terrain region/);
  assert.match(errors, /elevation range is inverted/);
});

test('terrain-world validation rejects dangling terrain, region, site, and object references', () => {
  const world = validWorld({ terrainId: 'terrain-missing' });
  world.constructionSites[0].terrainRegionIds = ['region-missing'];
  world.terrainRegions[0].ownerSiteId = 'site-missing';
  world.terrainRegions[0].referencedObjectIds = ['object-missing'];
  const result = validateTerrainWorld(world, scene());
  assert.equal(result.valid, false);
  const errors = result.errors.join(' ');
  assert.match(errors, /missing authoritative terrain terrain-missing/);
  assert.match(errors, /missing terrain region region-missing/);
  assert.match(errors, /missing owner construction site site-missing/);
  assert.match(errors, /missing scene object object-missing/);
});

test('terrain-world validation rejects non-finite and degenerate terrain regions', () => {
  const world = validWorld();
  world.terrainRegions[0].footprint = [[0, 0], [1, 1], [2, 2]];
  world.terrainRegions[0].elevationRange.max = Number.NaN;
  const result = validateTerrainWorld(world, scene());
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /footprint is degenerate/);
  assert.match(result.errors.join(' '), /non-finite value/);
});

test('subsurface cave, tomb, and catacomb reservations require vertical thickness', () => {
  for (const kind of ['cave-volume', 'tomb-volume', 'catacomb-volume']) {
    const world = validWorld();
    world.terrainRegions[0].kind = kind;
    world.terrainRegions[0].elevationRange = { min: -12, max: -12 };
    const result = validateTerrainWorld(world, scene());
    assert.equal(result.valid, false, kind);
    assert.match(result.errors.join(' '), /elevation range is degenerate/, kind);
  }
});
