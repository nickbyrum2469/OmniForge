import {
  normalizeConstructionSite,
  signedFootprintArea,
  validateConstructionSite
} from './construction-site-schema.js';

export const TERRAIN_WORLD_SCHEMA_VERSION = 1;
export const TERRAIN_WORLD_COORDINATE_AUTHORITY = 'world-space-meters';

export const TERRAIN_REGION_KINDS = Object.freeze([
  'surface-reservation',
  'building-pad',
  'path-corridor',
  'protected-landform',
  'subsurface-reservation',
  'cave-volume',
  'tomb-volume',
  'catacomb-volume',
  'utility-volume'
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

function uniqueStrings(values = [], maximum = 80) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => cleanText(value, '', maximum))
    .filter(Boolean))]
    .sort();
}

function rawVec2(value) {
  const source = Array.isArray(value) ? value : [value?.x, value?.z];
  return source.slice(0, 2).map(Number);
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

export function normalizeTerrainRegion(input = {}, options = {}) {
  const index = Math.max(0, Math.floor(finite(options.index)));
  const id = cleanId(input.id, `terrain-region-${index + 1}`);
  const range = input.elevationRange && typeof input.elevationRange === 'object'
    ? input.elevationRange
    : {};
  return {
    schemaVersion: TERRAIN_WORLD_SCHEMA_VERSION,
    id,
    name: cleanText(input.name, `Terrain Region ${index + 1}`),
    purpose: cleanText(input.purpose, 'reserved terrain volume', 160),
    kind: TERRAIN_REGION_KINDS.includes(input.kind) ? input.kind : 'surface-reservation',
    revision: Math.max(1, Math.floor(finite(input.revision, 1))),
    footprint: (Array.isArray(input.footprint) ? input.footprint : []).map(normalizeVec2),
    elevationRange: {
      min: finite(range.min),
      max: finite(range.max)
    },
    ownerSiteId: optionalId(input.ownerSiteId),
    referencedObjectIds: (Array.isArray(input.referencedObjectIds) ? input.referencedObjectIds : [])
      .map((value, objectIndex) => cleanId(value, `${id}:object:${objectIndex + 1}`)),
    tags: uniqueStrings(input.tags),
    protected: input.protected === true
  };
}

export function validateTerrainRegion(input = {}, context = {}) {
  const errors = [];
  const warnings = [];
  const id = cleanId(input.id, 'terrain-region');
  if (!Number.isFinite(Number(input.revision ?? 1))) errors.push(`Terrain region ${id} revision is non-finite.`);
  if (input.kind !== undefined && !TERRAIN_REGION_KINDS.includes(input.kind)) {
    errors.push(`Terrain region ${id} has unsupported kind ${input.kind}.`);
  }
  const footprint = Array.isArray(input.footprint) ? input.footprint : [];
  if (footprint.length < 3) errors.push(`Terrain region ${id} requires at least three footprint vertices.`);
  const rawFootprint = footprint.map(rawVec2);
  if (rawFootprint.some(point => point.length < 2 || !point.every(Number.isFinite))) {
    errors.push(`Terrain region ${id} footprint contains a non-finite coordinate.`);
  } else if (footprint.length >= 3 && Math.abs(signedFootprintArea(rawFootprint)) <= AREA_EPSILON) {
    errors.push(`Terrain region ${id} footprint is degenerate.`);
  }

  const range = input.elevationRange && typeof input.elevationRange === 'object'
    ? input.elevationRange
    : {};
  const minimum = Number(range.min ?? 0);
  const maximum = Number(range.max ?? 0);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    errors.push(`Terrain region ${id} elevation range contains a non-finite value.`);
  } else if (minimum > maximum) {
    errors.push(`Terrain region ${id} elevation range is inverted.`);
  } else if (['cave-volume', 'tomb-volume', 'catacomb-volume'].includes(input.kind) && minimum === maximum) {
    errors.push(`Terrain region ${id} ${input.kind} elevation range is degenerate.`);
  }

  const ownerSiteId = optionalId(input.ownerSiteId);
  if (ownerSiteId && context.siteIds instanceof Set && !context.siteIds.has(ownerSiteId)) {
    errors.push(`Terrain region ${id} references missing owner construction site ${ownerSiteId}.`);
  }
  const objectIds = (Array.isArray(input.referencedObjectIds) ? input.referencedObjectIds : [])
    .map((value, index) => cleanId(value, `${id}:object:${index + 1}`));
  for (const duplicate of duplicates(objectIds)) errors.push(`Terrain region ${id} repeats referenced object ${duplicate}.`);
  if (context.sceneObjectIds instanceof Set) {
    for (const objectId of objectIds) {
      if (!context.sceneObjectIds.has(objectId)) errors.push(`Terrain region ${id} references missing scene object ${objectId}.`);
    }
  }
  if (!ownerSiteId && objectIds.length === 0) warnings.push(`Terrain region ${id} has no owning site or referenced scene object.`);
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Planning metadata only. The terrain object, TerrainQueryService, and compiled
 * Path Network remain the sole world-surface authorities.
 */
export function normalizeTerrainWorld(input = {}, options = {}) {
  return {
    schemaVersion: TERRAIN_WORLD_SCHEMA_VERSION,
    coordinateAuthority: TERRAIN_WORLD_COORDINATE_AUTHORITY,
    terrainId: optionalId(input.terrainId) ?? optionalId(options.terrainId),
    revision: Math.max(1, Math.floor(finite(input.revision, 1))),
    constructionSites: (Array.isArray(input.constructionSites) ? input.constructionSites : [])
      .map((site, index) => normalizeConstructionSite(site, { index })),
    terrainRegions: (Array.isArray(input.terrainRegions) ? input.terrainRegions : [])
      .map((region, index) => normalizeTerrainRegion(region, { index }))
  };
}

function validationContext(scene, siteIds, regionIds) {
  const objects = Array.isArray(scene?.objects) ? scene.objects : [];
  const sceneObjectIds = new Set(objects.map(object => String(object.id)));
  const pathObjects = objects.filter(object => object.type === 'path');
  const pathObjectIds = new Set(pathObjects.map(object => String(object.id)));
  const pathNetworks = new Map(pathObjects.map(object => [
    String(object.id),
    object.properties?.pathNetwork || null
  ]));
  return { sceneObjectIds, pathObjectIds, pathNetworks, siteIds, terrainRegionIds: regionIds };
}

export function validateTerrainWorld(input = {}, scene = null) {
  const errors = [];
  const warnings = [];
  if (!Number.isFinite(Number(input.revision ?? 1))) errors.push('Terrain world revision is non-finite.');
  if (input.coordinateAuthority !== undefined && input.coordinateAuthority !== TERRAIN_WORLD_COORDINATE_AUTHORITY) {
    errors.push(`Terrain world coordinate authority must be ${TERRAIN_WORLD_COORDINATE_AUTHORITY}.`);
  }

  const sites = Array.isArray(input.constructionSites) ? input.constructionSites : [];
  const regions = Array.isArray(input.terrainRegions) ? input.terrainRegions : [];
  const siteIds = sites.map((site, index) => cleanId(site?.id, `construction-site-${index + 1}`));
  const regionIds = regions.map((region, index) => cleanId(region?.id, `terrain-region-${index + 1}`));
  for (const duplicate of duplicates(siteIds)) errors.push(`Duplicate construction site id ${duplicate}.`);
  for (const duplicate of duplicates(regionIds)) errors.push(`Duplicate terrain region id ${duplicate}.`);
  const sharedIds = [...new Set(siteIds.filter(id => regionIds.includes(id)))].sort();
  for (const shared of sharedIds) errors.push(`World planning id ${shared} is shared by a construction site and terrain region.`);

  const siteIdSet = new Set(siteIds);
  const regionIdSet = new Set(regionIds);
  const context = validationContext(scene, siteIdSet, regionIdSet);
  for (const site of sites) {
    const result = validateConstructionSite(site, context);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  for (const region of regions) {
    const result = validateTerrainRegion(region, context);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const terrainId = optionalId(input.terrainId);
  const terrainObjects = (Array.isArray(scene?.objects) ? scene.objects : []).filter(object => object.type === 'terrain');
  if (terrainId && scene && !terrainObjects.some(object => object.id === terrainId)) {
    errors.push(`Terrain world references missing authoritative terrain ${terrainId}.`);
  }
  if (!terrainId && terrainObjects.length > 0) warnings.push('Terrain world has no authoritative terrain reference.');

  for (const region of regions) {
    const ownerSiteId = optionalId(region?.ownerSiteId);
    if (!ownerSiteId) continue;
    const ownerIndex = siteIds.indexOf(ownerSiteId);
    if (ownerIndex >= 0) {
      const ownerRegions = Array.isArray(sites[ownerIndex]?.terrainRegionIds) ? sites[ownerIndex].terrainRegionIds : [];
      if (!ownerRegions.includes(region.id)) warnings.push(`Terrain region ${region.id} is owned by ${ownerSiteId} but is not listed by that site.`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    constructionSiteCount: sites.length,
    terrainRegionCount: regions.length
  };
}

export function migrateTerrainWorldMetadata(scene) {
  if (!scene || !Array.isArray(scene.objects)) return null;
  const terrainId = scene.objects.find(object => object.type === 'terrain')?.id ?? null;
  const source = scene.terrainWorld && typeof scene.terrainWorld === 'object'
    ? scene.terrainWorld
    : {};
  const candidate = {
    ...source,
    terrainId: source.terrainId ?? terrainId,
    coordinateAuthority: source.coordinateAuthority ?? TERRAIN_WORLD_COORDINATE_AUTHORITY
  };
  const sourceValidation = validateTerrainWorld(candidate, scene);
  if (!sourceValidation.valid) {
    // Optional planning metadata must never prevent the authoritative project,
    // terrain, or Path Network from loading. Preserve the invalid source so the
    // validator can report its exact dangling or malformed values to repair UI.
    scene.terrainWorld = structuredClone(source);
    return scene.terrainWorld;
  }
  const normalized = normalizeTerrainWorld(candidate, { terrainId });
  const normalizedValidation = validateTerrainWorld(normalized, scene);
  if (!normalizedValidation.valid) {
    scene.terrainWorld = structuredClone(source);
    return scene.terrainWorld;
  }
  scene.terrainWorld = normalized;
  return normalized;
}
