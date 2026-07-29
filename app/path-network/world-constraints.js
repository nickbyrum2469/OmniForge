const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const degreesToRadians = value => finite(value) * Math.PI / 180;

const NON_PHYSICAL_TYPES = new Set([
  'terrain',
  'path',
  'directionalLight',
  'pointLight',
  'empty',
  'decal'
]);

function modelBounds(object, assets) {
  if (object.type !== 'model') return null;
  const asset = (assets || []).find(item => (
    item.type === 'model'
    && item.id === object.properties?.assetId
  ));
  return asset?.bounds || null;
}

function localFootprint(object, assets) {
  const scale = object.transform?.scale || [1, 1, 1];
  const assetBounds = modelBounds(object, assets);
  if (assetBounds?.size) {
    return {
      centerX: finite(assetBounds.center?.[0]) * finite(scale[0], 1),
      centerZ: finite(assetBounds.center?.[2]) * finite(scale[2], 1),
      halfX: Math.max(0.05, Math.abs(finite(assetBounds.size[0], 1) * finite(scale[0], 1)) * 0.5),
      halfZ: Math.max(0.05, Math.abs(finite(assetBounds.size[2], 1) * finite(scale[2], 1)) * 0.5)
    };
  }
  return {
    centerX: 0,
    centerZ: 0,
    halfX: Math.max(0.05, Math.abs(finite(scale[0], 1)) * 0.5),
    halfZ: Math.max(0.05, Math.abs(finite(scale[2], 1)) * 0.5)
  };
}

export function isRouteConstraintObject(object, excludeObjectIds = []) {
  if (!object || object.visible === false) return false;
  if (excludeObjectIds.includes(object.id)) return false;
  if (NON_PHYSICAL_TYPES.has(object.type)) return false;
  if (object.properties?.routeConstraint === false) return false;
  if (object.properties?.previewOnly === true) return false;
  if (object.properties?.celestialRole) return false;
  if (object.properties?.editorReference === true) return false;
  if (object.properties?.renderClass === 'editor-only') return false;
  return true;
}

export function routeRestrictionForObject(object, assets = [], options = {}) {
  if (!isRouteConstraintObject(object, options.excludeObjectIds || [])) return null;
  const position = object.transform?.position || [0, 0, 0];
  const yaw = degreesToRadians(object.transform?.rotation?.[1]);
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const footprint = localFootprint(object, assets);
  const centerX = finite(position[0]) + footprint.centerX * cosine + footprint.centerZ * sine;
  const centerZ = finite(position[2]) - footprint.centerX * sine + footprint.centerZ * cosine;
  const extentX = Math.abs(cosine) * footprint.halfX + Math.abs(sine) * footprint.halfZ;
  const extentZ = Math.abs(sine) * footprint.halfX + Math.abs(cosine) * footprint.halfZ;
  const clearance = Math.max(
    0,
    finite(options.clearance),
    finite(object.properties?.routeClearance)
  );
  return {
    type: 'rectangle',
    source: 'scene-object',
    sourceObjectId: object.id,
    sourceObjectName: object.name || object.id,
    reason: 'authored-structure-clearance',
    minX: centerX - extentX - clearance,
    maxX: centerX + extentX + clearance,
    minZ: centerZ - extentZ - clearance,
    maxZ: centerZ + extentZ + clearance
  };
}

export function routeRestrictionsFromScene({
  scene,
  assets = [],
  excludeObjectIds = [],
  clearance = 0
} = {}) {
  return (scene?.objects || [])
    .map(object => routeRestrictionForObject(object, assets, {
      excludeObjectIds,
      clearance
    }))
    .filter(Boolean)
    .sort((left, right) => left.sourceObjectId.localeCompare(right.sourceObjectId));
}

