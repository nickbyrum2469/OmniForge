import {
  clamp,
  TERRAIN_PRESETS,
  normalizeTerrainProperties,
  normalizePathProperties,
  migrateSceneWorldFoundation,
  terrainBaseHeightAt,
  terrainHeightAt,
  terrainNormalAt,
  compilePathProfile,
  samplePathSpline,
  expandTerrain,
  insertPathPoint,
  splitPath
} from '../app/worldgen.js';

const now = () => new Date().toISOString();

export function ensureWorldFoundationState(state) {
  state.schemaVersion = Math.max(9, Number(state.schemaVersion || 0));
  state.engine = { ...(state.engine || {}), name: 'OmniForge', version: '0.11.0', status: 'ready', updatedAt: now() };
  state.project = { ...(state.project || {}), schemaVersion: Math.max(9, Number(state.project?.schemaVersion || 0)) };
  for (const scene of state.scenes || []) migrateSceneWorldFoundation(scene);
  state.worldFoundationV011 = {
    schemaVersion: 1,
    coordinateAuthority: 'world-space-meters',
    terrainSchemaVersion: 2,
    pathSchemaVersion: 2,
    expansionMode: 'continuous-bounds',
    waterIntegration: 'reserved-for-omnihydro',
    characterStudioRoadmap: 'planned-after-rigging-and-animation-foundation',
    ...(state.worldFoundationV011 || {}),
    updatedAt: now()
  };
  return state.worldFoundationV011;
}

function objectBounds(asset, object) {
  const source = asset?.bounds || { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5], size: [1, 1, 1], center: [0, 0, 0] };
  const scale = object.transform?.scale || [1, 1, 1];
  return {
    min: source.min.map((value, index) => Number(value || 0) * Number(scale[index] || 1)),
    max: source.max.map((value, index) => Number(value || 0) * Number(scale[index] || 1)),
    size: source.size.map((value, index) => Math.abs(Number(value || 1) * Number(scale[index] || 1)))
  };
}

function categoryMode(category) {
  if (category === 'foliage') return 'root-socket';
  if (category === 'vehicle') return 'wheel-contact';
  if (category === 'architecture') return 'foundation';
  if (category === 'character' || category === 'creature') return 'upright-contact';
  return 'support-plane';
}

export function fitGroundContactV011({ scene, object, asset, maxTilt = 35 }) {
  const terrain = scene.objects.find(item => item.type === 'terrain' && item.visible !== false);
  if (!terrain) throw new Error('No visible authoritative terrain exists in the active scene.');
  const paths = scene.objects.filter(item => item.type === 'path' && item.visible !== false);
  const position = object.transform?.position || [0, 0, 0];
  const bounds = objectBounds(asset, object);
  const category = asset?.category || object.type;
  const halfX = Math.max(0.05, bounds.size[0] / 2);
  const halfZ = Math.max(0.05, bounds.size[2] / 2);
  const yaw = Number(object.transform?.rotation?.[1] || 0) * Math.PI / 180;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const localSupports = category === 'vehicle'
    ? [[-halfX * 0.72, -halfZ * 0.68], [halfX * 0.72, -halfZ * 0.68], [-halfX * 0.72, halfZ * 0.68], [halfX * 0.72, halfZ * 0.68]]
    : [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
  const supports = localSupports.map(([x, z]) => [position[0] + x * c - z * s, position[2] + x * s + z * c]);
  const heights = supports.map(([x, z]) => terrainHeightAt(terrain, x, z, paths));
  const centerHeight = terrainHeightAt(terrain, position[0], position[2], paths);
  const averageHeight = (heights.reduce((sum, value) => sum + value, 0) + centerHeight) / (heights.length + 1);
  let pitch = 0, roll = 0;
  if (!['foliage', 'character', 'creature', 'architecture', 'vehicle'].includes(category)) {
    pitch = Math.atan2((heights[2] + heights[3]) - (heights[0] + heights[1]), halfZ * 4) * 180 / Math.PI;
    roll = -Math.atan2((heights[1] + heights[2]) - (heights[0] + heights[3]), halfX * 4) * 180 / Math.PI;
    pitch = clamp(pitch, -maxTilt, maxTilt);
    roll = clamp(roll, -maxTilt, maxTilt);
  }
  const burial = category === 'foliage' ? Number(object.properties?.rootBurial ?? asset?.placement?.rootBurial ?? 0.08) : 0;
  const base = Number(bounds.min[1] ?? -0.5);
  object.transform.position = [position[0], averageHeight - base - burial, position[2]];
  object.transform.rotation = [pitch, Number(object.transform?.rotation?.[1] || 0), roll];
  const finalBase = object.transform.position[1] + base;
  const signedErrors = heights.map(height => finalBase - height);
  const normal = terrainNormalAt(terrain, position[0], position[2], paths);
  const diagnostics = {
    mode: categoryMode(category),
    supportPoints: supports.map((point, index) => [point[0], heights[index], point[1]]),
    terrainSlopeDegrees: Math.acos(clamp(normal[1], -1, 1)) * 180 / Math.PI,
    maxContactError: Math.max(...signedErrors.map(Math.abs)),
    floatingError: Math.max(0, ...signedErrors),
    penetrationError: Math.max(0, ...signedErrors.map(value => -value)),
    pathAware: paths.some(path => path.properties?.carveTerrain),
    updatedAt: now()
  };
  object.properties = { ...(object.properties || {}), grounding: diagnostics };
  return diagnostics;
}

export function terrainDiagnostics(terrain, paths = [], grid = 18) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const values = [];
  for (let z = 0; z < grid; z += 1) {
    for (let x = 0; x < grid; x += 1) {
      const wx = properties.bounds.minX + (x / Math.max(1, grid - 1)) * (properties.bounds.maxX - properties.bounds.minX);
      const wz = properties.bounds.minZ + (z / Math.max(1, grid - 1)) * (properties.bounds.maxZ - properties.bounds.minZ);
      values.push(terrainHeightAt(terrain, wx, wz, paths));
    }
  }
  const min = Math.min(...values), max = Math.max(...values), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const rowCorrelations = [];
  for (let row = 0; row < grid - 2; row += 1) {
    let difference = 0;
    for (let column = 0; column < grid; column += 1) difference += Math.abs(values[row * grid + column] - values[(row + 2) * grid + column]);
    rowCorrelations.push(difference / grid);
  }
  const averageBandDifference = rowCorrelations.reduce((sum, value) => sum + value, 0) / Math.max(1, rowCorrelations.length);
  return {
    schemaVersion: 1,
    minHeight: min,
    maxHeight: max,
    relief: max - min,
    meanHeight: mean,
    standardDeviation: Math.sqrt(variance),
    averageBandDifference,
    repetitiveBandRisk: averageBandDifference < Math.max(0.2, (max - min) * 0.015) ? 'warning' : 'low',
    sampleCount: values.length,
    preset: properties.preset,
    bounds: properties.bounds,
    hydrologyReady: properties.hydrologyReady,
    checkedAt: now()
  };
}

export function pathDiagnostics(pathObject, terrain) {
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const samples = samplePathSpline(pathObject, { spacing: Math.max(0.5, properties.width * 0.3) });
  const profile = compilePathProfile(pathObject, terrain);
  let rawMaxGrade = 0, compiledMaxGrade = 0, estimatedCut = 0, estimatedFill = 0;
  for (let index = 1; index < profile.length; index += 1) {
    const a = profile[index - 1], b = profile[index];
    const distance = Math.max(0.001, Math.hypot(b.x - a.x, b.z - a.z));
    const rawA = terrainBaseHeightAt(terrain, a.x, a.z), rawB = terrainBaseHeightAt(terrain, b.x, b.z);
    rawMaxGrade = Math.max(rawMaxGrade, Math.abs(rawB - rawA) / distance * 100);
    compiledMaxGrade = Math.max(compiledMaxGrade, Math.abs(b.y - a.y) / distance * 100);
    if (b.y < rawB) estimatedCut += rawB - b.y; else estimatedFill += b.y - rawB;
  }
  return {
    schemaVersion: 1, nodeCount: properties.points.length, sampleCount: samples.length, profileSampleCount: profile.length, spline: properties.spline,
    rawMaxGradePercent: rawMaxGrade, compiledMaxGradePercent: compiledMaxGrade, configuredMaxGradePercent: properties.maxGradePercent,
    estimatedCut, estimatedFill, carveTerrain: properties.carveTerrain,
    validation: compiledMaxGrade <= properties.maxGradePercent + 0.15 ? 'passed' : 'failed', checkedAt: now()
  };
}

export function updateTerrainProperties(terrain, patch = {}) {
  const current = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const protectedKeys = new Set(['bounds', 'sizeX', 'sizeZ']);
  const selectedPreset = patch.preset && TERRAIN_PRESETS[patch.preset] ? TERRAIN_PRESETS[patch.preset] : null;
  const next = selectedPreset ? { ...current, ...selectedPreset, preset: patch.preset } : { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    if (protectedKeys.has(key)) continue;
    next[key] = value;
  }
  next.generatedRevision = Number(current.generatedRevision || 0) + 1;
  terrain.properties = normalizeTerrainProperties(next, { ...terrain.transform, scale: [1, 1, 1] });
  terrain.transform.scale = [1, 1, 1];
  return terrain.properties;
}

export function updatePathProperties(pathObject, patch = {}) {
  const current = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  pathObject.properties = normalizePathProperties({ ...current, ...patch, profileRevision: Number(current.profileRevision || 0) + 1 }, { position: [0, 0, 0], scale: [1, 1, 1] });
  pathObject.transform.position = [0, 0, 0];
  pathObject.transform.scale = [1, 1, 1];
  return pathObject.properties;
}

export { expandTerrain, insertPathPoint, splitPath, normalizeTerrainProperties, normalizePathProperties, migrateSceneWorldFoundation, terrainHeightAt, terrainNormalAt, samplePathSpline };
