import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_CROSS_SECTION_PROFILE_IDS,
  normalizePathCrossSection,
  pathCrossSectionLayout,
  pathCrossSectionProfile,
  pathCrossSectionProfiles,
  samplePathCrossSection
} from '../app/path-network/cross-section-profiles.js';

test('legacy path cross-sections retain the existing dirt-road defaults', () => {
  const profile = normalizePathCrossSection({});
  assert.equal(profile.profileId, 'dirt-road');
  assert.equal(profile.width, 3);
  assert.equal(profile.crownHeight, 0.06);
  assert.equal(profile.shoulderWidth, 0.8);
  assert.equal(profile.shoulderDrop, 0.08);
  assert.equal(profile.ditchDepth, 0.2);
  assert.equal(profile.blendDistance, 2.5);
  assert.equal(profile.terrainUnderlayClearance, 0.04);
  assert.equal(profile.curbStyle, 'none');
  assert.equal(profile.curbWidth, 0);
  assert.equal(profile.curbHeight, 0);
  assert.equal(profile.sidewalkLeftWidth, 0);
  assert.equal(profile.sidewalkRightWidth, 0);
});

test('city local street is deterministic and defines explicit urban bands', () => {
  const first = pathCrossSectionProfile('city-local-street');
  const second = pathCrossSectionProfile('city-local-street');
  assert.deepEqual(first, second);
  assert.equal(first.profileId, 'city-local-street');
  assert.equal(first.laneCount, 2);
  assert.equal(first.shoulderWidth, 0);
  assert.equal(first.ditchDepth, 0);
  assert.equal(first.curbStyle, 'barrier');
  assert.ok(first.gutterWidth > 0);
  assert.ok(first.curbWidth > 0);
  assert.ok(first.curbHeight > 0);
  assert.ok(first.sidewalkLeftWidth > 0);
  assert.ok(first.sidewalkRightWidth > 0);
  assert.ok(first.sidewalkHeight >= first.curbHeight);
});

test('preset selection resets urban bands before applying explicit overrides', () => {
  const city = pathCrossSectionProfile('city-local-street', { sidewalkLeftWidth: 2.4 });
  const dirt = pathCrossSectionProfile('dirt-road', { width: 4.2 });
  assert.equal(city.sidewalkLeftWidth, 2.4);
  assert.equal(dirt.width, 4.2);
  assert.equal(dirt.curbStyle, 'none');
  assert.equal(dirt.gutterWidth, 0);
  assert.equal(dirt.sidewalkLeftWidth, 0);
  assert.equal(dirt.sidewalkRightWidth, 0);
});

test('explicit profile selection cannot be overwritten by normalized fallback values', () => {
  const normalizedCityFallback = normalizePathCrossSection({
    profileId: 'city-local-street',
    width: 9,
    gutterWidth: 0.6,
    curbHeight: 0.24,
    sidewalkLeftWidth: 2.8
  });
  const dirt = normalizePathCrossSection({
    profileId: 'dirt-road',
    width: 4.2
  }, normalizedCityFallback);
  assert.equal(dirt.profileId, 'dirt-road');
  assert.equal(dirt.width, 4.2);
  assert.equal(dirt.gutterWidth, 0);
  assert.equal(dirt.curbHeight, 0);
  assert.equal(dirt.sidewalkLeftWidth, 0);

  const normalizedDirtFallback = normalizePathCrossSection({
    profileId: 'dirt-road',
    shoulderWidth: 4,
    ditchDepth: 1.2
  });
  const city = normalizePathCrossSection({
    profileId: 'city-local-street'
  }, normalizedDirtFallback);
  assert.equal(city.profileId, 'city-local-street');
  assert.equal(city.width, 7);
  assert.equal(city.shoulderWidth, 0);
  assert.equal(city.ditchDepth, 0);
  assert.equal(city.curbStyle, 'barrier');
  assert.equal(city.sidewalkLeftWidth, 1.8);
});

test('profile catalog returns independent authoring records', () => {
  assert.ok(PATH_CROSS_SECTION_PROFILE_IDS.includes('natural-trail'));
  assert.ok(PATH_CROSS_SECTION_PROFILE_IDS.includes('dirt-road'));
  assert.ok(PATH_CROSS_SECTION_PROFILE_IDS.includes('city-local-street'));
  assert.ok(PATH_CROSS_SECTION_PROFILE_IDS.includes('custom'));
  const first = pathCrossSectionProfiles();
  const second = pathCrossSectionProfiles();
  first[0].crossSection.width = 99;
  assert.notEqual(first[0].crossSection.width, second[0].crossSection.width);
});

test('unknown profile identifiers are rejected by the authoring API', () => {
  assert.throws(
    () => pathCrossSectionProfile('placeholder-street'),
    /Unknown path cross-section profile/
  );
});

test('one shared layout owns city carriageway, gutter, curb, sidewalk, and blend boundaries', () => {
  const layout = pathCrossSectionLayout(pathCrossSectionProfile('city-local-street'));
  assert.equal(layout.halfRoad, 3.5);
  assert.equal(layout.left.roadEdge, 3.5);
  assert.ok(layout.left.gutterEdge > layout.left.roadEdge);
  assert.ok(layout.left.curbEdge > layout.left.gutterEdge);
  assert.ok(layout.left.sidewalkEdge > layout.left.curbEdge);
  assert.ok(layout.left.outerEdge > layout.left.sidewalkEdge);
  assert.deepEqual(
    { ...layout.left, side: null },
    { ...layout.right, side: null }
  );

  assert.equal(samplePathCrossSection(layout.profile, 3.6).zone, 'gutter');
  assert.equal(samplePathCrossSection(layout.profile, 3.9).zone, 'curb');
  assert.equal(samplePathCrossSection(layout.profile, 4.5).zone, 'sidewalk');
  assert.equal(samplePathCrossSection(layout.profile, 6).zone, 'blend');
  assert.equal(samplePathCrossSection(layout.profile, 8).zone, 'terrain');
});

test('curb height owns the curb top and curbed sidewalks connect without an elevation crack', () => {
  const profile = pathCrossSectionProfile('city-local-street', {
    curbHeight: 0.24,
    sidewalkHeight: 0.08,
    sidewalkLeftWidth: 2,
    sidewalkCrossSlopePercent: 2
  });
  const layout = pathCrossSectionLayout(profile);
  assert.equal(layout.left.curbTopHeight, 0.24);
  assert.equal(layout.left.sidewalkInnerHeight, 0.24);
  assert.ok(Math.abs(layout.left.sidewalkOuterHeight - 0.2) < 1e-9);
  assert.equal(
    samplePathCrossSection(profile, layout.left.gutterEdge + 0.01).heightOffset,
    0.24
  );
  assert.ok(Math.abs(
    samplePathCrossSection(profile, layout.left.curbEdge + 0.000001).heightOffset - 0.24
  ) < 1e-7);
});

test('an uncurbed sidewalk uses its authored sidewalk height as the connection elevation', () => {
  const profile = pathCrossSectionProfile('city-local-street', {
    curbStyle: 'none',
    curbWidth: 0,
    curbHeight: 0.4,
    sidewalkHeight: 0.12
  });
  const layout = pathCrossSectionLayout(profile);
  assert.equal(layout.left.curbTopHeight, 0.12);
  assert.equal(layout.left.sidewalkInnerHeight, 0.12);
});
