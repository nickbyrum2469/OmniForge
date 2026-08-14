export const PATH_CROSS_SECTION_PROFILE_SCHEMA_VERSION = 1;

export const PATH_CURB_STYLES = Object.freeze([
  'none',
  'mountable',
  'barrier'
]);

const DIRT_ROAD_CROSS_SECTION = Object.freeze({
  width: 3,
  laneCount: 1,
  laneWidth: 2.4,
  crownHeight: 0.06,
  shoulderWidth: 0.8,
  shoulderDrop: 0.08,
  gutterWidth: 0,
  gutterDepth: 0,
  curbStyle: 'none',
  curbWidth: 0,
  curbHeight: 0,
  sidewalkLeftWidth: 0,
  sidewalkRightWidth: 0,
  sidewalkHeight: 0,
  sidewalkCrossSlopePercent: 0,
  ditchDepth: 0.2,
  drainageEnabled: true,
  cutSlopeRatio: 1.5,
  fillSlopeRatio: 2,
  blendDistance: 2.5,
  textureRepeatLength: 5,
  terrainUnderlayClearance: 0.04,
  terrainModificationEnabled: true
});

const PROFILE_DEFINITIONS = {
  'natural-trail': {
    id: 'natural-trail',
    label: 'Natural trail',
    description: 'A narrow terrain-following pedestrian trail with soft shoulders and no urban construction.',
    pathClass: 'footpath',
    crossSection: {
      ...DIRT_ROAD_CROSS_SECTION,
      width: 1.2,
      laneWidth: 1.2,
      crownHeight: 0.025,
      shoulderWidth: 0.25,
      shoulderDrop: 0.03,
      ditchDepth: 0.08,
      blendDistance: 1.4,
      textureRepeatLength: 3.5
    }
  },
  'dirt-road': {
    id: 'dirt-road',
    label: 'Dirt road',
    description: 'The existing OmniForge dirt-road section with crowned travel surface, shoulders, drainage, and blended earthwork.',
    pathClass: 'dirt-road',
    crossSection: { ...DIRT_ROAD_CROSS_SECTION }
  },
  'city-local-street': {
    id: 'city-local-street',
    label: 'City local street',
    description: 'A two-lane paved local street with gutters, barrier curbs, and grounded sidewalks on both sides.',
    pathClass: 'city-street',
    crossSection: {
      ...DIRT_ROAD_CROSS_SECTION,
      width: 7,
      laneCount: 2,
      laneWidth: 3.25,
      crownHeight: 0.08,
      shoulderWidth: 0,
      shoulderDrop: 0,
      gutterWidth: 0.35,
      gutterDepth: 0.035,
      curbStyle: 'barrier',
      curbWidth: 0.18,
      curbHeight: 0.15,
      sidewalkLeftWidth: 1.8,
      sidewalkRightWidth: 1.8,
      sidewalkHeight: 0.15,
      sidewalkCrossSlopePercent: 2,
      ditchDepth: 0,
      drainageEnabled: true,
      blendDistance: 2,
      textureRepeatLength: 6
    }
  }
};

export const PATH_CROSS_SECTION_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(PROFILE_DEFINITIONS).map(([id, definition]) => [id, Object.freeze({
    ...definition,
    crossSection: Object.freeze({ ...definition.crossSection })
  })])
));

export const PATH_CROSS_SECTION_PROFILE_IDS = Object.freeze([
  ...Object.keys(PATH_CROSS_SECTION_PROFILES),
  'custom'
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));

function profileId(value, fallback = 'dirt-road') {
  const requested = String(value || fallback);
  return PATH_CROSS_SECTION_PROFILE_IDS.includes(requested) ? requested : 'custom';
}

function profileBase(id) {
  return id === 'custom'
    ? PATH_CROSS_SECTION_PROFILES['dirt-road'].crossSection
    : PATH_CROSS_SECTION_PROFILES[id]?.crossSection || PATH_CROSS_SECTION_PROFILES['dirt-road'].crossSection;
}

/**
 * Normalize one segment cross-section without compiling geometry. Missing
 * fields inherit the network default profile; an explicitly selected preset
 * starts from that preset so city-only bands cannot leak back into a dirt road.
 */
export function normalizePathCrossSection(input = {}, fallback = {}) {
  const inputObject = input && typeof input === 'object' ? input : {};
  const fallbackObject = fallback && typeof fallback === 'object' ? fallback : {};
  const hasExplicitProfile = Object.prototype.hasOwnProperty.call(inputObject, 'profileId')
    && inputObject.profileId !== undefined;
  const selectedProfileId = profileId(
    inputObject.profileId,
    profileId(fallbackObject.profileId, 'dirt-road')
  );
  const source = {
    ...profileBase(selectedProfileId),
    ...(hasExplicitProfile ? {} : fallbackObject),
    ...inputObject
  };
  return {
    schemaVersion: PATH_CROSS_SECTION_PROFILE_SCHEMA_VERSION,
    profileId: selectedProfileId,
    width: clamp(source.width ?? 3, 0.1, 200),
    laneCount: Math.round(clamp(source.laneCount ?? 1, 1, 12)),
    laneWidth: clamp(source.laneWidth ?? 2.4, 0.5, 8),
    crownHeight: clamp(source.crownHeight ?? 0.06, -1, 2),
    shoulderWidth: clamp(source.shoulderWidth ?? 0.8, 0, 20),
    shoulderDrop: clamp(source.shoulderDrop ?? 0.08, 0, 2),
    gutterWidth: clamp(source.gutterWidth ?? 0, 0, 5),
    gutterDepth: clamp(source.gutterDepth ?? 0, 0, 1),
    curbStyle: PATH_CURB_STYLES.includes(source.curbStyle) ? source.curbStyle : 'none',
    curbWidth: clamp(source.curbWidth ?? 0, 0, 2),
    curbHeight: clamp(source.curbHeight ?? 0, 0, 1),
    sidewalkLeftWidth: clamp(source.sidewalkLeftWidth ?? 0, 0, 20),
    sidewalkRightWidth: clamp(source.sidewalkRightWidth ?? 0, 0, 20),
    sidewalkHeight: clamp(source.sidewalkHeight ?? 0, 0, 2),
    sidewalkCrossSlopePercent: clamp(source.sidewalkCrossSlopePercent ?? 0, -12, 12),
    ditchDepth: clamp(source.ditchDepth ?? 0.2, 0, 5),
    drainageEnabled: source.drainageEnabled !== false,
    cutSlopeRatio: clamp(source.cutSlopeRatio ?? 1.5, 0.25, 10),
    fillSlopeRatio: clamp(source.fillSlopeRatio ?? 2, 0.25, 10),
    blendDistance: clamp(source.blendDistance ?? 2.5, 0.05, 200),
    textureRepeatLength: clamp(source.textureRepeatLength ?? 5, 0.25, 200),
    terrainUnderlayClearance: clamp(source.terrainUnderlayClearance ?? 0.04, 0.005, 0.25),
    terrainModificationEnabled: source.terrainModificationEnabled !== false
  };
}

export function pathCrossSectionProfile(id = 'dirt-road', overrides = {}) {
  const requested = String(id || 'dirt-road');
  if (!PATH_CROSS_SECTION_PROFILE_IDS.includes(requested)) {
    throw new Error(`Unknown path cross-section profile ${requested}.`);
  }
  if (requested === 'custom') {
    return normalizePathCrossSection({ ...overrides, profileId: 'custom' });
  }
  return normalizePathCrossSection({
    ...PATH_CROSS_SECTION_PROFILES[requested].crossSection,
    ...overrides,
    profileId: requested
  });
}

export function pathCrossSectionProfiles() {
  return Object.values(PATH_CROSS_SECTION_PROFILES).map(definition => structuredClone(definition));
}

function sideLayout(profile, side) {
  const halfRoad = profile.width * 0.5;
  const urban = profile.curbStyle !== 'none'
    || profile.gutterWidth > 0
    || profile.curbWidth > 0
    || (side === 'left' ? profile.sidewalkLeftWidth : profile.sidewalkRightWidth) > 0;
  const gutterWidth = urban ? profile.gutterWidth : 0;
  const curbWidth = urban && profile.curbStyle !== 'none' ? profile.curbWidth : 0;
  const sidewalkWidth = urban
    ? (side === 'left' ? profile.sidewalkLeftWidth : profile.sidewalkRightWidth)
    : 0;
  const shoulderWidth = urban ? 0 : profile.shoulderWidth;
  const ditchWidth = !urban && profile.drainageEnabled !== false
    ? Math.max(0.35, profile.ditchDepth * 1.75)
    : 0;
  const roadEdge = halfRoad;
  const shoulderEdge = roadEdge + shoulderWidth;
  const gutterEdge = shoulderEdge + gutterWidth;
  const curbEdge = gutterEdge + curbWidth;
  const sidewalkEdge = curbEdge + sidewalkWidth;
  const ditchEdge = sidewalkEdge + ditchWidth;
  const outerEdge = ditchEdge + profile.blendDistance;
  const sidewalkOuterDrop = sidewalkWidth * profile.sidewalkCrossSlopePercent / 100;
  const hasCurb = urban && profile.curbStyle !== 'none';
  const hasSidewalk = sidewalkWidth > 0;
  // A curbed sidewalk shares the curb-top elevation so its inner boundary is
  // watertight. An uncurbed sidewalk retains its independently authored
  // sidewalk height. This keeps curbHeight authoritative without introducing
  // a vertical crack between the curb and sidewalk bands.
  const sidewalkConnectionHeight = hasCurb
    ? profile.curbHeight
    : (hasSidewalk ? profile.sidewalkHeight : 0);
  return Object.freeze({
    side,
    urban,
    roadEdge,
    shoulderEdge,
    gutterEdge,
    curbEdge,
    sidewalkEdge,
    ditchEdge,
    outerEdge,
    shoulderWidth,
    gutterWidth,
    curbWidth,
    sidewalkWidth,
    ditchWidth,
    blendWidth: profile.blendDistance,
    roadEdgeHeight: 0,
    shoulderOuterHeight: -profile.shoulderDrop,
    gutterOuterHeight: -profile.gutterDepth,
    curbTopHeight: sidewalkConnectionHeight,
    sidewalkInnerHeight: sidewalkConnectionHeight,
    sidewalkOuterHeight: sidewalkConnectionHeight - sidewalkOuterDrop
  });
}

/**
 * One lateral authority shared by terrain support, render geometry, collision,
 * navigation, foliage exclusion, and editor guides. Distances are positive
 * magnitudes from the compiled centerline; the side record supplies direction.
 */
export function pathCrossSectionLayout(input = {}) {
  const profile = normalizePathCrossSection(input);
  const left = sideLayout(profile, 'left');
  const right = sideLayout(profile, 'right');
  return Object.freeze({
    schemaVersion: PATH_CROSS_SECTION_PROFILE_SCHEMA_VERSION,
    profile,
    halfRoad: profile.width * 0.5,
    left,
    right,
    maximumOuterEdge: Math.max(left.outerEdge, right.outerEdge)
  });
}

/**
 * Sample the authored cross-section in local lateral space. The returned
 * height is relative to the compiled centerline station and is therefore safe
 * to apply through either a parallel-transport frame (geometry) or world Y
 * (terrain support queries).
 */
export function samplePathCrossSection(input = {}, signedLateral = 0) {
  const layout = pathCrossSectionLayout(input);
  const side = signedLateral < 0 ? layout.left : layout.right;
  const lateral = Math.abs(finite(signedLateral));
  const profile = layout.profile;
  let zone = 'road';
  let heightOffset = profile.crownHeight * (1 - clamp(lateral / Math.max(1e-7, layout.halfRoad), 0, 1));
  let influence = 1;

  if (lateral > side.roadEdge && lateral <= side.shoulderEdge) {
    zone = 'shoulder';
    const amount = (lateral - side.roadEdge) / Math.max(1e-7, side.shoulderWidth);
    heightOffset = -profile.shoulderDrop * amount;
  } else if (lateral > side.shoulderEdge && lateral <= side.gutterEdge) {
    zone = 'gutter';
    const amount = (lateral - side.shoulderEdge) / Math.max(1e-7, side.gutterWidth);
    heightOffset = -profile.gutterDepth * amount;
  } else if (lateral > side.gutterEdge && lateral <= side.curbEdge) {
    zone = 'curb';
    heightOffset = side.curbTopHeight;
  } else if (lateral > side.curbEdge && lateral <= side.sidewalkEdge) {
    zone = 'sidewalk';
    const amount = (lateral - side.curbEdge) / Math.max(1e-7, side.sidewalkWidth);
    heightOffset = side.sidewalkInnerHeight
      + (side.sidewalkOuterHeight - side.sidewalkInnerHeight) * amount;
  } else if (lateral > side.sidewalkEdge && lateral <= side.ditchEdge) {
    zone = 'ditch';
    const amount = (lateral - side.sidewalkEdge) / Math.max(1e-7, side.ditchWidth);
    heightOffset = -profile.shoulderDrop - Math.sin(Math.PI * amount) * profile.ditchDepth;
  } else if (lateral > side.ditchEdge && lateral <= side.outerEdge) {
    zone = 'blend';
    const amount = (lateral - side.ditchEdge) / Math.max(1e-7, side.blendWidth);
    influence = 1 - (amount * amount * (3 - 2 * amount));
    heightOffset = side.urban ? side.sidewalkOuterHeight : -profile.shoulderDrop;
  } else if (lateral > side.outerEdge) {
    zone = 'terrain';
    heightOffset = 0;
    influence = 0;
  }

  return {
    layout,
    side,
    lateral,
    signedLateral: finite(signedLateral),
    zone,
    heightOffset,
    influence,
    signedDistance: lateral - layout.halfRoad
  };
}
