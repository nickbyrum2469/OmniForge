export const CONSTRUCTION_SITE_SCHEMA_VERSION = 1;

export const CONSTRUCTION_SITE_STATUSES = Object.freeze([
  'planned',
  'reserved',
  'approved',
  'occupied',
  'archived'
]);

export const CONSTRUCTION_SITE_KINDS = Object.freeze([
  'building-pad',
  'district',
  'plaza',
  'infrastructure'
]);

export const CONSTRUCTION_GRADING_MODES = Object.freeze([
  'preserve',
  'best-fit-plane',
  'level',
  'terrace',
  'foundation'
]);

export const CONSTRUCTION_SITE_ELEVATION_MODES = Object.freeze([
  'terrain',
  'best-fit-plane',
  'offset',
  'absolute'
]);

export const CONSTRUCTION_ACCESS_KINDS = Object.freeze([
  'entrance',
  'road',
  'path',
  'service',
  'utility'
]);

const AREA_EPSILON = 1e-6;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanText = (value, fallback, maximum = 160) => String(value ?? fallback).trim().slice(0, maximum);
const cleanId = (value, fallback) => cleanText(value, fallback)
  .replace(/[^a-zA-Z0-9:_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 160) || fallback;
const optionalId = value => value === null || value === undefined || value === ''
  ? null
  : cleanId(value, 'reference');

function normalizeVec2(value) {
  const source = Array.isArray(value) ? value : [value?.x, value?.z];
  return [finite(source[0]), finite(source[1])];
}

function normalizeVec3(value) {
  const source = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
  return [finite(source[0]), finite(source[1]), finite(source[2])];
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => cleanText(value, '', 80))
    .filter(Boolean))]
    .sort();
}

export function signedFootprintArea(footprint = []) {
  if (!Array.isArray(footprint) || footprint.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < footprint.length; index += 1) {
    const current = footprint[index];
    const next = footprint[(index + 1) % footprint.length];
    const ax = Number(Array.isArray(current) ? current[0] : current?.x);
    const az = Number(Array.isArray(current) ? current[1] : current?.z);
    const bx = Number(Array.isArray(next) ? next[0] : next?.x);
    const bz = Number(Array.isArray(next) ? next[1] : next?.z);
    if (![ax, az, bx, bz].every(Number.isFinite)) return Number.NaN;
    sum += ax * bz - bx * az;
  }
  return sum * 0.5;
}

function normalizeAccessAnchor(input = {}, siteId, index) {
  return {
    id: cleanId(input.id, `${siteId}:access:${index + 1}`),
    kind: CONSTRUCTION_ACCESS_KINDS.includes(input.kind) ? input.kind : 'entrance',
    position: normalizeVec3(input.position),
    pathObjectId: optionalId(input.pathObjectId),
    pathNetworkId: optionalId(input.pathNetworkId),
    nodeId: optionalId(input.nodeId),
    segmentId: optionalId(input.segmentId)
  };
}

/**
 * Normalize planning metadata only. This record does not grade terrain, place a
 * building, or become a render/query authority. Defaults are index-derived so
 * repeated migration is byte-stable and never depends on clocks or randomness.
 */
export function normalizeConstructionSite(input = {}, options = {}) {
  const index = Math.max(0, Math.floor(finite(options.index)));
  const id = cleanId(input.id, `construction-site-${index + 1}`);
  const elevation = input.elevation && typeof input.elevation === 'object' ? input.elevation : {};
  const target = elevation.target === null || elevation.target === undefined || elevation.target === ''
    ? null
    : finite(elevation.target);
  return {
    schemaVersion: CONSTRUCTION_SITE_SCHEMA_VERSION,
    id,
    name: cleanText(input.name, `Construction Site ${index + 1}`),
    kind: CONSTRUCTION_SITE_KINDS.includes(input.kind) ? input.kind : 'building-pad',
    purpose: cleanText(input.purpose, 'building-site', 120),
    revision: Math.max(1, Math.floor(finite(input.revision, 1))),
    status: CONSTRUCTION_SITE_STATUSES.includes(input.status) ? input.status : 'planned',
    footprint: (Array.isArray(input.footprint) ? input.footprint : []).map(normalizeVec2),
    orientationDegrees: finite(input.orientationDegrees),
    elevation: {
      mode: CONSTRUCTION_SITE_ELEVATION_MODES.includes(elevation.mode) ? elevation.mode : 'best-fit-plane',
      target,
      offset: finite(elevation.offset)
    },
    grading: {
      mode: CONSTRUCTION_GRADING_MODES.includes(input.grading?.mode) ? input.grading.mode : 'best-fit-plane',
      maxSlopeDegrees: Math.max(0, Math.min(89, finite(input.grading?.maxSlopeDegrees, 8)))
    },
    accessAnchors: (Array.isArray(input.accessAnchors) ? input.accessAnchors : [])
      .map((anchor, anchorIndex) => normalizeAccessAnchor(anchor, id, anchorIndex)),
    terrainRegionIds: (Array.isArray(input.terrainRegionIds) ? input.terrainRegionIds : [])
      .map((value, regionIndex) => cleanId(value, `${id}:region:${regionIndex + 1}`)),
    tags: uniqueStrings(input.tags),
    protected: input.protected === true
  };
}

function rawVec(value, dimensions) {
  const source = Array.isArray(value)
    ? value
    : dimensions === 2 ? [value?.x, value?.z] : [value?.x, value?.y, value?.z];
  return source.slice(0, dimensions).map(Number);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

export function validateConstructionSite(input = {}, context = {}) {
  const errors = [];
  const warnings = [];
  const id = cleanId(input.id, 'construction-site');
  if (!Number.isFinite(Number(input.revision ?? 1))) errors.push(`Construction site ${id} revision is non-finite.`);
  const footprint = Array.isArray(input.footprint) ? input.footprint : [];
  if (footprint.length < 3) errors.push(`Construction site ${id} requires at least three footprint vertices.`);
  const rawFootprint = footprint.map(value => rawVec(value, 2));
  if (rawFootprint.some(point => point.length < 2 || !point.every(Number.isFinite))) {
    errors.push(`Construction site ${id} footprint contains a non-finite coordinate.`);
  } else if (footprint.length >= 3 && Math.abs(signedFootprintArea(rawFootprint)) <= AREA_EPSILON) {
    errors.push(`Construction site ${id} footprint is degenerate.`);
  }

  if (!Number.isFinite(Number(input.orientationDegrees ?? 0))) {
    errors.push(`Construction site ${id} orientation is non-finite.`);
  }
  if (input.kind !== undefined && !CONSTRUCTION_SITE_KINDS.includes(input.kind)) {
    errors.push(`Construction site ${id} has unsupported kind ${input.kind}.`);
  }
  if (input.status !== undefined && !CONSTRUCTION_SITE_STATUSES.includes(input.status)) {
    errors.push(`Construction site ${id} has unsupported status ${input.status}.`);
  }
  const elevation = input.elevation && typeof input.elevation === 'object' ? input.elevation : {};
  if (elevation.mode !== undefined && !CONSTRUCTION_SITE_ELEVATION_MODES.includes(elevation.mode)) {
    errors.push(`Construction site ${id} has unsupported elevation mode ${elevation.mode}.`);
  }
  if (!Number.isFinite(Number(elevation.offset ?? 0))) errors.push(`Construction site ${id} elevation offset is non-finite.`);
  if (elevation.target !== null && elevation.target !== undefined && elevation.target !== '' && !Number.isFinite(Number(elevation.target))) {
    errors.push(`Construction site ${id} elevation target is non-finite.`);
  }
  if (elevation.mode === 'absolute' && !Number.isFinite(Number(elevation.target))) {
    errors.push(`Construction site ${id} absolute elevation requires a finite target.`);
  }
  const grading = input.grading && typeof input.grading === 'object' ? input.grading : {};
  if (grading.mode !== undefined && !CONSTRUCTION_GRADING_MODES.includes(grading.mode)) {
    errors.push(`Construction site ${id} has unsupported grading mode ${grading.mode}.`);
  }
  const maximumSlope = Number(grading.maxSlopeDegrees ?? 8);
  if (!Number.isFinite(maximumSlope) || maximumSlope < 0 || maximumSlope >= 90) {
    errors.push(`Construction site ${id} grading maxSlopeDegrees must be finite and in [0, 90).`);
  }

  const anchors = Array.isArray(input.accessAnchors) ? input.accessAnchors : [];
  const anchorIds = anchors.map((anchor, index) => cleanId(anchor?.id, `${id}:access:${index + 1}`));
  for (const duplicate of duplicates(anchorIds)) errors.push(`Construction site ${id} has duplicate access anchor id ${duplicate}.`);
  const pathObjectIds = context.pathObjectIds instanceof Set ? context.pathObjectIds : null;
  const pathNetworks = context.pathNetworks instanceof Map ? context.pathNetworks : null;
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index] || {};
    const anchorId = anchorIds[index];
    if (anchor.kind !== undefined && !CONSTRUCTION_ACCESS_KINDS.includes(anchor.kind)) {
      errors.push(`Construction site ${id} access anchor ${anchorId} has unsupported kind ${anchor.kind}.`);
    }
    const position = rawVec(anchor.position, 3);
    if (position.length < 3 || !position.every(Number.isFinite)) {
      errors.push(`Construction site ${id} access anchor ${anchorId} contains a non-finite position.`);
    }
    const pathObjectId = optionalId(anchor.pathObjectId);
    if (pathObjectId && pathObjectIds && !pathObjectIds.has(pathObjectId)) {
      errors.push(`Construction site ${id} access anchor ${anchorId} references missing path object ${pathObjectId}.`);
    }
    if (pathObjectId && pathNetworks?.has(pathObjectId)) {
      const network = pathNetworks.get(pathObjectId);
      const networkId = optionalId(anchor.pathNetworkId);
      if (networkId && networkId !== network?.id) {
        errors.push(`Construction site ${id} access anchor ${anchorId} references missing path network ${networkId}.`);
      }
      const nodeId = optionalId(anchor.nodeId);
      if (nodeId && !(network?.nodes || []).some(node => node.id === nodeId)) {
        errors.push(`Construction site ${id} access anchor ${anchorId} references missing path node ${nodeId}.`);
      }
      const segmentId = optionalId(anchor.segmentId);
      if (segmentId && !(network?.segments || []).some(segment => segment.id === segmentId)) {
        errors.push(`Construction site ${id} access anchor ${anchorId} references missing path segment ${segmentId}.`);
      }
    } else if ((anchor.nodeId || anchor.segmentId || anchor.pathNetworkId) && !pathObjectId) {
      errors.push(`Construction site ${id} access anchor ${anchorId} has a dangling path-network reference without pathObjectId.`);
    }
  }

  const regionIds = (Array.isArray(input.terrainRegionIds) ? input.terrainRegionIds : [])
    .map((value, index) => cleanId(value, `${id}:region:${index + 1}`));
  for (const duplicate of duplicates(regionIds)) errors.push(`Construction site ${id} repeats terrain region ${duplicate}.`);
  if (context.terrainRegionIds instanceof Set) {
    for (const regionId of regionIds) {
      if (!context.terrainRegionIds.has(regionId)) errors.push(`Construction site ${id} references missing terrain region ${regionId}.`);
    }
  }
  if (anchors.length === 0) warnings.push(`Construction site ${id} has no access anchor.`);
  return { valid: errors.length === 0, errors, warnings };
}
