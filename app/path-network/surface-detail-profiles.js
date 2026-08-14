export const PATH_SURFACE_DETAIL_SCHEMA_VERSION = 1;

const BASE_PROFILE = Object.freeze({
  enabled: true,
  seed: 2718,
  puddleCoverage: 0.04,
  puddleScale: 3.5,
  puddleDepth: 0.012,
  wheelRutStrength: 0.18,
  wheelTrackGauge: 1.45,
  wheelRutWidth: 0.16,
  hoofPrintDensity: 0,
  hoofPrintScale: 0.11,
  bootPrintDensity: 0.04,
  bootPrintScale: 0.12,
  erosionStrength: 0.12,
  detailNormalStrength: 0.35,
  weatherResponse: 1
});

const DEFINITIONS = {
  clean: {
    id: 'clean',
    label: 'Clean surface',
    description: 'A maintained surface with restrained weathering and no traffic impressions.',
    values: {
      ...BASE_PROFILE,
      puddleCoverage: 0.01,
      wheelRutStrength: 0,
      bootPrintDensity: 0,
      erosionStrength: 0.02,
      detailNormalStrength: 0.12
    }
  },
  'weathered-dirt-road': {
    id: 'weathered-dirt-road',
    label: 'Weathered dirt road',
    description: 'Subtle wagon ruts, drainage wear, occasional puddles, and mixed foot traffic.',
    values: { ...BASE_PROFILE }
  },
  'muddy-wagon-road': {
    id: 'muddy-wagon-road',
    label: 'Muddy wagon road',
    description: 'Pronounced paired wheel ruts with broader puddling and churned travel wear.',
    values: {
      ...BASE_PROFILE,
      puddleCoverage: 0.18,
      puddleScale: 4.8,
      puddleDepth: 0.025,
      wheelRutStrength: 0.52,
      wheelRutWidth: 0.22,
      bootPrintDensity: 0.08,
      erosionStrength: 0.3,
      detailNormalStrength: 0.7,
      weatherResponse: 1.35
    }
  },
  'hoof-trail': {
    id: 'hoof-trail',
    label: 'Hoof trail',
    description: 'A narrow natural trail carrying staggered hoof impressions and light erosion.',
    values: {
      ...BASE_PROFILE,
      puddleCoverage: 0.06,
      wheelRutStrength: 0,
      hoofPrintDensity: 0.34,
      hoofPrintScale: 0.13,
      bootPrintDensity: 0.02,
      erosionStrength: 0.2,
      detailNormalStrength: 0.48
    }
  },
  'walked-footpath': {
    id: 'walked-footpath',
    label: 'Walked footpath',
    description: 'Irregular left/right boot traffic with compacted soil and restrained puddling.',
    values: {
      ...BASE_PROFILE,
      puddleCoverage: 0.025,
      wheelRutStrength: 0,
      hoofPrintDensity: 0,
      bootPrintDensity: 0.32,
      bootPrintScale: 0.115,
      erosionStrength: 0.14,
      detailNormalStrength: 0.42
    }
  }
};

export const PATH_SURFACE_DETAIL_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(DEFINITIONS).map(([id, definition]) => [id, Object.freeze({
    ...definition,
    values: Object.freeze({ ...definition.values })
  })])
));

export const PATH_SURFACE_DETAIL_PROFILE_IDS = Object.freeze([
  ...Object.keys(PATH_SURFACE_DETAIL_PROFILES),
  'custom'
]);

const RENDER_PROFILE_CODES = Object.freeze({
  clean: 1,
  'weathered-dirt-road': 2,
  'muddy-wagon-road': 3,
  'hoof-trail': 4,
  'walked-footpath': 5
});

export const PATH_SURFACE_DETAIL_RENDER_VEC4_COUNT = 4;
export const PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT = PATH_SURFACE_DETAIL_RENDER_VEC4_COUNT * 4;

// The packed payload is intentionally a stable, flat Float32Array so geometry
// can copy the four contiguous vec4 values into four vertex streams without
// reinterpreting the authoring model. Keeping this layout here makes the
// surface-detail model the sole authority for GPU-facing parameter packing.
//
//   vec4 0: profileCode, patternSeed, puddleCoverage, puddleScale
//   vec4 1: puddleDepth, wheelRutStrength, wheelTrackGauge, wheelRutWidth
//   vec4 2: hoofPrintDensity, hoofPrintScale, bootPrintDensity, bootPrintScale
//   vec4 3: erosionStrength, detailNormalStrength, weatherResponse, roadWidth
export const PATH_SURFACE_DETAIL_RENDER_LAYOUT = Object.freeze({
  profileCode: 0,
  patternSeed: 1,
  puddleCoverage: 2,
  puddleScale: 3,
  puddleDepth: 4,
  wheelRutStrength: 5,
  wheelTrackGauge: 6,
  wheelRutWidth: 7,
  hoofPrintDensity: 8,
  hoofPrintScale: 9,
  bootPrintDensity: 10,
  bootPrintScale: 11,
  erosionStrength: 12,
  detailNormalStrength: 13,
  weatherResponse: 14,
  roadWidth: 15
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));

function normalizedId(value, fallback = 'weathered-dirt-road') {
  const requested = String(value || fallback);
  return PATH_SURFACE_DETAIL_PROFILE_IDS.includes(requested) ? requested : 'custom';
}

function profileBase(id) {
  return id === 'custom'
    ? PATH_SURFACE_DETAIL_PROFILES['weathered-dirt-road'].values
    : PATH_SURFACE_DETAIL_PROFILES[id]?.values || PATH_SURFACE_DETAIL_PROFILES['weathered-dirt-road'].values;
}

export function normalizePathSurfaceDetail(input = {}, fallback = {}) {
  const sourceInput = input && typeof input === 'object' ? input : {};
  const sourceFallback = fallback && typeof fallback === 'object' ? fallback : {};
  const explicit = Object.prototype.hasOwnProperty.call(sourceInput, 'profileId')
    && sourceInput.profileId !== undefined;
  const profileId = normalizedId(sourceInput.profileId, normalizedId(sourceFallback.profileId));
  const source = {
    ...profileBase(profileId),
    ...(explicit ? {} : sourceFallback),
    ...sourceInput
  };
  return {
    schemaVersion: PATH_SURFACE_DETAIL_SCHEMA_VERSION,
    profileId,
    enabled: source.enabled !== false,
    seed: Math.floor(clamp(source.seed ?? 2718, -2147483648, 2147483647)),
    puddleCoverage: clamp(source.puddleCoverage ?? 0.04, 0, 0.75),
    puddleScale: clamp(source.puddleScale ?? 3.5, 0.25, 100),
    puddleDepth: clamp(source.puddleDepth ?? 0.012, 0, 0.15),
    wheelRutStrength: clamp(source.wheelRutStrength ?? 0.18, 0, 1),
    wheelTrackGauge: clamp(source.wheelTrackGauge ?? 1.45, 0.3, 4),
    wheelRutWidth: clamp(source.wheelRutWidth ?? 0.16, 0.03, 0.75),
    hoofPrintDensity: clamp(source.hoofPrintDensity ?? 0, 0, 1),
    hoofPrintScale: clamp(source.hoofPrintScale ?? 0.11, 0.03, 0.5),
    bootPrintDensity: clamp(source.bootPrintDensity ?? 0.04, 0, 1),
    bootPrintScale: clamp(source.bootPrintScale ?? 0.12, 0.03, 0.5),
    erosionStrength: clamp(source.erosionStrength ?? 0.12, 0, 1),
    detailNormalStrength: clamp(source.detailNormalStrength ?? 0.35, 0, 2),
    weatherResponse: clamp(source.weatherResponse ?? 1, 0, 3)
  };
}

export function pathSurfaceDetailProfile(id = 'weathered-dirt-road', overrides = {}) {
  const requested = String(id || 'weathered-dirt-road');
  if (!PATH_SURFACE_DETAIL_PROFILE_IDS.includes(requested)) {
    throw new Error(`Unknown path surface detail profile ${requested}.`);
  }
  return normalizePathSurfaceDetail({ ...overrides, profileId: requested });
}

export function pathSurfaceDetailProfiles() {
  return Object.values(PATH_SURFACE_DETAIL_PROFILES).map(definition => structuredClone(definition));
}

function closestRenderProfile(detail) {
  if (RENDER_PROFILE_CODES[detail.profileId]) return detail.profileId;
  if (detail.hoofPrintDensity >= 0.1) return 'hoof-trail';
  if (detail.wheelRutStrength >= 0.35 || detail.puddleCoverage >= 0.12) return 'muddy-wagon-road';
  if (detail.bootPrintDensity >= 0.1 && detail.wheelRutStrength < 0.1) return 'walked-footpath';
  if (
    detail.wheelRutStrength > 0.01
    || detail.bootPrintDensity > 0.01
    || detail.puddleCoverage > 0.015
    || detail.erosionStrength > 0.05
  ) return 'weathered-dirt-road';
  return 'clean';
}

function hashString32(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function avalanche32(value) {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function segmentPatternSeed(detail, options, profileCode) {
  const pathId = String(options.pathId ?? options.networkId ?? '');
  const segmentId = String(options.segmentId ?? '');
  const identityHash = hashString32(`${pathId}\u0000${segmentId}\u0000${detail.profileId}`);
  const seedBits = detail.seed >>> 0;
  const mixed = avalanche32(seedBits ^ identityHash ^ Math.imul(profileCode + 1, 0x9e3779b9));
  return mixed / 0x100000000;
}

export function pathSurfaceDetailRenderData(input = {}, options = {}) {
  const detail = normalizePathSurfaceDetail(input);
  const resolvedProfileCode = RENDER_PROFILE_CODES[closestRenderProfile(detail)];
  const profileCode = detail.enabled ? resolvedProfileCode : 0;
  const patternSeed = segmentPatternSeed(detail, options, resolvedProfileCode);
  const roadWidth = clamp(options.roadWidth ?? options.width ?? 3, 0.1, 200);
  return new Float32Array([
    profileCode,
    patternSeed,
    detail.puddleCoverage,
    detail.puddleScale,
    detail.puddleDepth,
    detail.wheelRutStrength,
    detail.wheelTrackGauge,
    detail.wheelRutWidth,
    detail.hoofPrintDensity,
    detail.hoofPrintScale,
    detail.bootPrintDensity,
    detail.bootPrintScale,
    detail.erosionStrength,
    detail.detailNormalStrength,
    detail.weatherResponse,
    roadWidth
  ]);
}
