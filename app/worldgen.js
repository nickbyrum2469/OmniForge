const EPSILON = 1e-6;

export const TERRAIN_PRESETS = Object.freeze({
  plains: { label: 'Open plains', height: 5, macroScale: 240, detailScale: 48, warpStrength: 8, ridgeStrength: 0.05, plateauStrength: 0, valleyStrength: 0, canyonDepth: 0, islandStrength: 0 },
  rollingHills: { label: 'Rolling hills', height: 16, macroScale: 150, detailScale: 34, warpStrength: 20, ridgeStrength: 0.18, plateauStrength: 0, valleyStrength: 0, canyonDepth: 0, islandStrength: 0 },
  highlands: { label: 'Layered highlands', height: 34, macroScale: 185, detailScale: 31, warpStrength: 34, ridgeStrength: 0.65, plateauStrength: 0.08, valleyStrength: 0.08, canyonDepth: 0, islandStrength: 0 },
  plateau: { label: 'Plateau country', height: 27, macroScale: 210, detailScale: 42, warpStrength: 20, ridgeStrength: 0.24, plateauStrength: 0.72, valleyStrength: 0.08, canyonDepth: 0, islandStrength: 0 },
  mountainValley: { label: 'Mountain-surrounded valley', height: 48, macroScale: 220, detailScale: 36, warpStrength: 46, ridgeStrength: 0.86, plateauStrength: 0.06, valleyStrength: 0.9, canyonDepth: 0, islandStrength: 0 },
  canyon: { label: 'Canyon basin', height: 34, macroScale: 240, detailScale: 38, warpStrength: 25, ridgeStrength: 0.34, plateauStrength: 0.5, valleyStrength: 0.12, canyonDepth: 36, islandStrength: 0 },
  island: { label: 'Single island', height: 38, macroScale: 170, detailScale: 30, warpStrength: 32, ridgeStrength: 0.56, plateauStrength: 0.04, valleyStrength: 0.08, canyonDepth: 0, islandStrength: 1 },
  archipelago: { label: 'Archipelago', height: 31, macroScale: 145, detailScale: 26, warpStrength: 38, ridgeStrength: 0.46, plateauStrength: 0.02, valleyStrength: 0.05, canyonDepth: 0, islandStrength: 1 },
  coastalBasin: { label: 'Coastal basin', height: 29, macroScale: 205, detailScale: 38, warpStrength: 30, ridgeStrength: 0.42, plateauStrength: 0.08, valleyStrength: 0.45, canyonDepth: 10, islandStrength: 0.25 }
});

export const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(EPSILON, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hashInt2(x, z, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hashInt2(ix, iz, seed) * 2 - 1;
  const b = hashInt2(ix + 1, iz, seed) * 2 - 1;
  const c = hashInt2(ix, iz + 1, seed) * 2 - 1;
  const d = hashInt2(ix + 1, iz + 1, seed) * 2 - 1;
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function rotate2(x, z, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c - z * s, x * s + z * c];
}

export function fractalNoise(x, z, options = {}) {
  const octaves = Math.round(clamp(options.octaves ?? 6, 1, 10));
  const lacunarity = clamp(options.lacunarity ?? 2.03, 1.2, 4);
  const gain = clamp(options.gain ?? 0.5, 0.15, 0.85);
  const seed = Number(options.seed || 0);
  let frequency = 1, amplitude = 1, sum = 0, weight = 0;
  let px = x, pz = z;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(px * frequency, pz * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
    [px, pz] = rotate2(px + 17.17, pz - 11.31, 0.61 + octave * 0.071);
  }
  return weight ? sum / weight : 0;
}

export function ridgedNoise(x, z, options = {}) {
  const n = fractalNoise(x, z, options);
  const ridge = 1 - Math.abs(n);
  return ridge * ridge * 2 - 1;
}

function normalizeSculptLayer(layer = {}) {
  return {
    id: String(layer.id || `sculpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    mode: ['raise', 'lower', 'flatten'].includes(layer.mode) ? layer.mode : 'raise',
    x: Number(layer.x || 0), z: Number(layer.z || 0), radius: clamp(layer.radius ?? 8, 0.25, 5000),
    strength: clamp(layer.strength ?? 2, 0.001, 1000), targetHeight: Number(layer.targetHeight || 0),
    falloff: clamp(layer.falloff ?? 0.72, 0.05, 1), createdAt: layer.createdAt || new Date().toISOString()
  };
}

function applySculptLayers(height, x, z, layers = []) {
  let result = height;
  for (const layer of layers) {
    const distance = Math.hypot(x - layer.x, z - layer.z);
    if (distance >= layer.radius) continue;
    const normalized = distance / Math.max(EPSILON, layer.radius);
    const influence = 1 - smoothstep(Math.max(0, layer.falloff - 0.35), 1, normalized);
    if (layer.mode === 'lower') result -= layer.strength * influence;
    else if (layer.mode === 'flatten') result = lerp(result, layer.targetHeight, clamp(layer.strength, 0, 1) * influence);
    else result += layer.strength * influence;
  }
  return result;
}

function presetKey(value) {
  return Object.prototype.hasOwnProperty.call(TERRAIN_PRESETS, value) ? value : 'rollingHills';
}

export function normalizeTerrainProperties(properties = {}, transform = {}) {
  const scale = Array.isArray(transform.scale) ? transform.scale : [1, 1, 1];
  const position = Array.isArray(transform.position) ? transform.position : [0, 0, 0];
  const legacySize = Math.max(10, Number(properties.size || 100));
  const sizeX = Math.max(10, Number(properties.sizeX || legacySize * Math.abs(Number(scale[0] || 1))));
  const sizeZ = Math.max(10, Number(properties.sizeZ || legacySize * Math.abs(Number(scale[2] || 1))));
  const preset = presetKey(properties.preset || 'rollingHills');
  const defaults = TERRAIN_PRESETS[preset];
  const bounds = properties.bounds && Number.isFinite(Number(properties.bounds.minX))
    ? {
        minX: Number(properties.bounds.minX), maxX: Number(properties.bounds.maxX),
        minZ: Number(properties.bounds.minZ), maxZ: Number(properties.bounds.maxZ)
      }
    : {
        minX: Number(position[0] || 0) - sizeX / 2,
        maxX: Number(position[0] || 0) + sizeX / 2,
        minZ: Number(position[2] || 0) - sizeZ / 2,
        maxZ: Number(position[2] || 0) + sizeZ / 2
      };
  const legacyFrequency = Math.max(0.0001, Number(properties.frequency || 0.055));
  const migratedMacroScale = clamp(2 * Math.PI / legacyFrequency, 12, 2000);
  const height = Math.max(0, Number(properties.height ?? properties.amplitude ?? defaults.height) * Math.abs(Number(scale[1] || 1)));
  const shapeOrigin = Array.isArray(properties.shapeOrigin)
    ? [Number(properties.shapeOrigin[0] || 0), Number(properties.shapeOrigin[1] || 0)]
    : [Number(position[0] || 0), Number(position[2] || 0)];
  const minDimension = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return {
    ...properties,
    schemaVersion: 2,
    preset,
    sizeX: bounds.maxX - bounds.minX,
    sizeZ: bounds.maxZ - bounds.minZ,
    size: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ),
    bounds,
    resolution: Math.round(clamp(properties.resolution ?? 128, 8, 256)),
    resolutionX: Math.round(clamp(properties.resolutionX ?? properties.resolution ?? 128, 8, 256)),
    resolutionZ: Math.round(clamp(properties.resolutionZ ?? properties.resolution ?? 128, 8, 256)),
    height,
    amplitude: height,
    baseElevation: Number(properties.baseElevation ?? position[1] ?? 0),
    seed: Math.round(Number(properties.seed || 17)),
    macroScale: clamp(properties.macroScale ?? migratedMacroScale ?? defaults.macroScale, 8, 5000),
    detailScale: clamp(properties.detailScale ?? defaults.detailScale, 2, 1000),
    octaves: Math.round(clamp(properties.octaves ?? 6, 1, 10)),
    lacunarity: clamp(properties.lacunarity ?? 2.03, 1.2, 4),
    gain: clamp(properties.gain ?? 0.5, 0.15, 0.85),
    warpStrength: clamp(properties.warpStrength ?? defaults.warpStrength, 0, 500),
    ridgeStrength: clamp(properties.ridgeStrength ?? defaults.ridgeStrength, 0, 1.5),
    plateauStrength: clamp(properties.plateauStrength ?? defaults.plateauStrength, 0, 1),
    plateauSteps: Math.round(clamp(properties.plateauSteps ?? 7, 2, 32)),
    valleyStrength: clamp(properties.valleyStrength ?? defaults.valleyStrength, 0, 1.5),
    valleyRadius: clamp(properties.valleyRadius ?? minDimension * 0.3, 4, 5000),
    canyonDepth: clamp(properties.canyonDepth ?? defaults.canyonDepth, 0, 1000),
    canyonWidth: clamp(properties.canyonWidth ?? minDimension * 0.12, 1, 2000),
    canyonFloorWidth: clamp(properties.canyonFloorWidth ?? minDimension * 0.025, 0.2, 500),
    canyonMeander: clamp(properties.canyonMeander ?? minDimension * 0.08, 0, 1000),
    canyonDirection: Number(properties.canyonDirection ?? 18),
    islandStrength: clamp(properties.islandStrength ?? defaults.islandStrength, 0, 2),
    islandRadius: clamp(properties.islandRadius ?? minDimension * 0.42, 4, 10000),
    coastDirection: Number(properties.coastDirection ?? 0),
    seaLevel: Number(properties.seaLevel ?? 0),
    shapeOrigin,
    expandStep: clamp(properties.expandStep ?? 100, 1, 10000),
    chunkSize: clamp(properties.chunkSize ?? 64, 8, 1024),
    sculptLayers: (Array.isArray(properties.sculptLayers) ? properties.sculptLayers : []).slice(-512).map(normalizeSculptLayer),
    densityLimited: Boolean(properties.densityLimited),
    hydrologyReady: properties.hydrologyReady !== false,
    generatedRevision: Number(properties.generatedRevision || 1)
  };
}

function plateau(value, steps, strength) {
  if (strength <= 0) return value;
  const scaled = (value * 0.5 + 0.5) * steps;
  const terraced = Math.round(scaled) / steps * 2 - 1;
  return lerp(value, terraced, strength);
}

function archipelagoMask(x, z, properties) {
  const [ox, oz] = properties.shapeOrigin;
  const radius = properties.islandRadius;
  let mask = 0;
  for (let index = 0; index < 7; index += 1) {
    const angle = hashInt2(index, 19, properties.seed) * Math.PI * 2;
    const distance = radius * (0.18 + hashInt2(index, 43, properties.seed) * 0.58);
    const cx = ox + Math.cos(angle) * distance;
    const cz = oz + Math.sin(angle) * distance;
    const r = radius * (0.22 + hashInt2(index, 71, properties.seed) * 0.28);
    mask = Math.max(mask, 1 - smoothstep(r * 0.55, r, Math.hypot(x - cx, z - cz)));
  }
  return mask;
}

export function terrainBaseHeightAt(terrain, x, z) {
  if (!terrain) return 0;
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const scale = Math.max(8, properties.macroScale);
  const warpScale = scale * 0.72;
  const warpX = fractalNoise(x / warpScale, z / warpScale, { seed: properties.seed + 311, octaves: 3, lacunarity: 2.1, gain: 0.52 }) * properties.warpStrength;
  const warpZ = fractalNoise((x + 91.7) / warpScale, (z - 53.2) / warpScale, { seed: properties.seed + 733, octaves: 3, lacunarity: 2.07, gain: 0.5 }) * properties.warpStrength;
  const nx = (x + warpX) / scale;
  const nz = (z + warpZ) / scale;
  const broad = fractalNoise(nx, nz, properties);
  const detail = fractalNoise((x - 37.1) / Math.max(2, properties.detailScale), (z + 14.7) / Math.max(2, properties.detailScale), {
    seed: properties.seed + 1709,
    octaves: Math.max(2, properties.octaves - 2),
    lacunarity: properties.lacunarity,
    gain: properties.gain * 0.92
  });
  const ridge = ridgedNoise(nx * 0.82 - 13.7, nz * 0.82 + 8.3, { ...properties, seed: properties.seed + 997 });
  let shape = broad * 0.68 + detail * 0.18 + ridge * properties.ridgeStrength * 0.42;
  shape = plateau(shape, properties.plateauSteps, properties.plateauStrength);

  const [originX, originZ] = properties.shapeOrigin;
  const localX = x - originX, localZ = z - originZ;
  const radial = Math.hypot(localX, localZ);

  if (properties.valleyStrength > 0) {
    const normalizedRadius = radial / Math.max(1, properties.valleyRadius);
    const basin = 1 - smoothstep(0.08, 0.72, normalizedRadius);
    const mountainRing = Math.exp(-Math.pow((normalizedRadius - 0.82) / 0.24, 2));
    shape += mountainRing * properties.valleyStrength * 0.92;
    shape -= basin * properties.valleyStrength * 0.48;
  }

  if (properties.canyonDepth > 0) {
    const angle = properties.canyonDirection * Math.PI / 180;
    const [cx, cz] = rotate2(localX, localZ, angle);
    const meander = Math.sin(cx / Math.max(8, properties.macroScale * 0.62) + properties.seed * 0.17) * properties.canyonMeander;
    const distance = Math.abs(cz - meander);
    const trench = 1 - smoothstep(properties.canyonFloorWidth, properties.canyonWidth, distance);
    const rim = smoothstep(properties.canyonFloorWidth, properties.canyonWidth * 1.35, distance) - smoothstep(properties.canyonWidth * 1.35, properties.canyonWidth * 2.15, distance);
    shape -= trench * properties.canyonDepth / Math.max(1, properties.height);
    shape += rim * properties.canyonDepth / Math.max(1, properties.height) * 0.16;
  }

  if (properties.islandStrength > 0) {
    const islandMask = properties.preset === 'archipelago'
      ? archipelagoMask(x, z, properties)
      : 1 - smoothstep(properties.islandRadius * 0.58, properties.islandRadius, radial);
    shape = shape * (0.35 + islandMask * 0.65) - (1 - islandMask) * properties.islandStrength * 1.18;
  }

  if (properties.preset === 'coastalBasin') {
    const angle = properties.coastDirection * Math.PI / 180;
    const [coastX] = rotate2(localX, localZ, angle);
    const coast = smoothstep(-properties.islandRadius * 0.3, properties.islandRadius * 0.8, coastX);
    shape -= coast * 0.82;
  }

  const proceduralHeight = properties.baseElevation + shape * properties.height;
  return applySculptLayers(proceduralHeight, x, z, properties.sculptLayers);
}

function normalizePoint(point) {
  if (Array.isArray(point)) return [Number(point[0] || 0), Number(point[1] || 0)];
  return [Number(point?.x || 0), Number(point?.z || 0)];
}

export function normalizePathProperties(properties = {}, transform = {}) {
  const offsetX = Number(transform.position?.[0] || 0), offsetZ = Number(transform.position?.[2] || 0);
  const alreadyWorld = properties.worldSpacePoints === true;
  const source = Array.isArray(properties.points) && properties.points.length >= 2 ? properties.points : [[-10, 0], [0, 0], [10, 0]];
  const points = source.map(point => {
    const [x, z] = normalizePoint(point);
    return alreadyWorld ? [x, z] : [x + offsetX, z + offsetZ];
  });
  return {
    ...properties,
    schemaVersion: 2,
    points,
    worldSpacePoints: true,
    spline: properties.spline !== false,
    splineTension: clamp(properties.splineTension ?? 0.5, 0, 1),
    samplesPerSegment: Math.round(clamp(properties.samplesPerSegment ?? 14, 2, 64)),
    showSpline: properties.showSpline !== false,
    width: clamp(properties.width ?? 3, 0.1, 200),
    blendDistance: clamp(properties.blendDistance ?? 2.5, 0.05, 200),
    edgeNoise: clamp(properties.edgeNoise ?? 0.45, 0, 5),
    carveTerrain: properties.carveTerrain !== false,
    surfaceAuthority: properties.surfaceAuthority === 'legacy-terrain' ? 'legacy-terrain' : 'corridor',
    terrainModificationAuthority: properties.terrainModificationAuthority === 'legacy-terrain' ? 'legacy-terrain' : 'corridor',
    conformToTerrain: properties.conformToTerrain !== false,
    collider: properties.collider !== false,
    navigation: properties.navigation !== false,
    pathPreset: String(properties.pathPreset || 'dirtRoad'),
    roadClass: String(properties.roadClass || 'rural'),
    laneCount: Math.round(clamp(properties.laneCount ?? 2, 1, 12)),
    laneWidth: clamp(properties.laneWidth ?? 2.4, 0.5, 8),
    shoulderWidth: clamp(properties.shoulderWidth ?? 0.9, 0, 20),
    shoulderDrop: clamp(properties.shoulderDrop ?? 0.08, 0, 2),
    crownHeight: clamp(properties.crownHeight ?? 0.08, -1, 2),
    maxGradePercent: clamp(properties.maxGradePercent ?? 12, 0.1, 100),
    profileSmoothingPasses: Math.round(clamp(properties.profileSmoothingPasses ?? 4, 0, 16)),
    verticalCurveStrength: clamp(properties.verticalCurveStrength ?? 0.62, 0, 1),
    minimumCurveRadius: clamp(properties.minimumCurveRadius ?? 10, 0.5, 10000),
    designSpeedKph: clamp(properties.designSpeedKph ?? 30, 1, 250),
    bankMode: ['auto', 'manual', 'none'].includes(properties.bankMode) ? properties.bankMode : 'auto',
    bankStrength: clamp(properties.bankStrength ?? 0.55, 0, 1.5),
    maxBankDegrees: clamp(properties.maxBankDegrees ?? 7, 0, 30),
    manualBankDegrees: clamp(properties.manualBankDegrees ?? 0, -30, 30),
    maxCutDepth: clamp(properties.maxCutDepth ?? 6, 0, 1000),
    maxFillDepth: clamp(properties.maxFillDepth ?? 2.5, 0, 1000),
    cutShoulder: clamp(properties.cutShoulder ?? properties.blendDistance ?? 3, 0.1, 200),
    sideSlopeWidth: clamp(properties.sideSlopeWidth ?? properties.cutShoulder ?? 3.4, 0.2, 200),
    cutSlopeRatio: clamp(properties.cutSlopeRatio ?? 1.5, 0.25, 10),
    fillSlopeRatio: clamp(properties.fillSlopeRatio ?? 2, 0.25, 10),
    maxSideSlopeSearchWidth: clamp(properties.maxSideSlopeSearchWidth ?? Math.max(24, Number(properties.sideSlopeWidth ?? properties.cutShoulder ?? 3.4) * 5), 1, 500),
    drainageEnabled: properties.drainageEnabled !== false,
    ditchDepth: clamp(properties.ditchDepth ?? 0.22, 0, 5),
    bridgeThreshold: clamp(properties.bridgeThreshold ?? 5, 0, 1000),
    tunnelThreshold: clamp(properties.tunnelThreshold ?? 8, 0, 1000),
    retainingWallThreshold: clamp(properties.retainingWallThreshold ?? 3.5, 0, 1000),
    meshSpacing: clamp(properties.meshSpacing ?? 0.55, 0.15, 5),
    textureRepeatLength: clamp(properties.textureRepeatLength ?? 5, 0.25, 100),
    renderLiftMode: properties.renderLiftMode === 'manual' ? 'manual' : 'auto',
    renderLift: clamp(properties.renderLift ?? 0.028, 0.006, 0.25),
    surfaceOffset: Number(properties.surfaceOffset ?? 0.03),
    profileRevision: Number(properties.profileRevision || 1)
  };
}

function catmullRomPoint(p0, p1, p2, p3, t, tension) {
  const s = (1 - tension) * 0.5;
  const t2 = t * t, t3 = t2 * t;
  const m1x = (p2[0] - p0[0]) * s, m1z = (p2[1] - p0[1]) * s;
  const m2x = (p3[0] - p1[0]) * s, m2z = (p3[1] - p1[1]) * s;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return [h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1z + h01 * p2[1] + h11 * m2z];
}

export function samplePathSpline(pathObject, options = {}) {
  const properties = normalizePathProperties(pathObject?.properties || {}, pathObject?.transform || {});
  const points = properties.points;
  if (points.length === 2 || properties.spline === false) {
    const result = [];
    const distance = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
    const steps = Math.max(2, Math.ceil(distance / Math.max(0.25, Number(options.spacing || 1.25))));
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      result.push({ x: lerp(points[0][0], points[1][0], t), z: lerp(points[0][1], points[1][1], t), segment: 0, t });
    }
    return result;
  }
  const result = [];
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const p0 = points[Math.max(0, segment - 1)], p1 = points[segment], p2 = points[segment + 1], p3 = points[Math.min(points.length - 1, segment + 2)];
    const distance = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(properties.samplesPerSegment, Math.ceil(distance / Math.max(0.25, Number(options.spacing || 1.25))));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const [x, z] = catmullRomPoint(p0, p1, p2, p3, t, properties.splineTension);
      result.push({ x, z, segment, t });
    }
  }
  const last = points.at(-1);
  result.push({ x: last[0], z: last[1], segment: points.length - 2, t: 1 });
  return result;
}

function pointSegmentInfo(x, z, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, wx = x - a.x, wz = z - a.z;
  const den = vx * vx + vz * vz || 1;
  const t = clamp((wx * vx + wz * vz) / den, 0, 1);
  const px = a.x + vx * t, pz = a.z + vz * t;
  return { distance: Math.hypot(x - px, z - pz), t, x: px, z: pz };
}

export function nearestPathPoint(pathObject, x, z) {
  const samples = samplePathSpline(pathObject);
  let nearest = { distance: Infinity, segment: 0, sampleIndex: 0, t: 0, x: 0, z: 0 };
  for (let index = 0; index < samples.length - 1; index += 1) {
    const info = pointSegmentInfo(x, z, samples[index], samples[index + 1]);
    if (info.distance < nearest.distance) nearest = { ...info, segment: samples[index].segment, sampleIndex: index };
  }
  return nearest;
}

const profileCache = new WeakMap();

function profileSignature(pathObject, terrain) {
  const p = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const t = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  return JSON.stringify([
    p.points, p.spline, p.splineTension, p.samplesPerSegment, p.meshSpacing,
    p.maxGradePercent, p.profileSmoothingPasses, p.verticalCurveStrength,
    p.maxCutDepth, p.maxFillDepth, p.surfaceOffset, p.profileRevision,
    t.seed, t.height, t.macroScale, t.detailScale, t.bounds, t.generatedRevision
  ]);
}

function solveBoundedProfile(profile, properties) {
  const maximumGrade = properties.maxGradePercent / 100;
  const minimum = profile.map(point => point.baseY - properties.maxCutDepth);
  const maximum = profile.map(point => point.baseY + properties.maxFillDepth);
  const preferred = profile.map(point => clamp(point.y, point.baseY - properties.maxCutDepth, point.baseY + properties.maxFillDepth));
  const distance = index => Math.max(EPSILON, Math.hypot(
    profile[index].x - profile[index - 1].x,
    profile[index].z - profile[index - 1].z
  ));

  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 1; index < profile.length; index += 1) {
      const limit = distance(index) * maximumGrade;
      minimum[index] = Math.max(minimum[index], minimum[index - 1] - limit);
      maximum[index] = Math.min(maximum[index], maximum[index - 1] + limit);
    }
    for (let index = profile.length - 2; index >= 0; index -= 1) {
      const limit = distance(index + 1) * maximumGrade;
      minimum[index] = Math.max(minimum[index], minimum[index + 1] - limit);
      maximum[index] = Math.min(maximum[index], maximum[index + 1] + limit);
    }
  }

  const infeasibleStations = [];
  for (let index = 0; index < profile.length; index += 1) {
    if (minimum[index] > maximum[index] + 1e-5) infeasibleStations.push(index);
  }
  if (infeasibleStations.length) {
    for (let index = 0; index < profile.length; index += 1) profile[index].y = preferred[index];
    return { feasible: false, infeasibleStations };
  }

  const anchor = Math.floor(profile.length * 0.5);
  profile[anchor].y = clamp(preferred[anchor], minimum[anchor], maximum[anchor]);
  for (let index = anchor + 1; index < profile.length; index += 1) {
    const limit = distance(index) * maximumGrade;
    profile[index].y = clamp(preferred[index], Math.max(minimum[index], profile[index - 1].y - limit), Math.min(maximum[index], profile[index - 1].y + limit));
  }
  for (let index = anchor - 1; index >= 0; index -= 1) {
    const limit = distance(index + 1) * maximumGrade;
    profile[index].y = clamp(preferred[index], Math.max(minimum[index], profile[index + 1].y - limit), Math.min(maximum[index], profile[index + 1].y + limit));
  }
  return { feasible: true, infeasibleStations: [] };
}

export function compilePathProfile(pathObject, terrain) {
  if (!pathObject || !terrain) return [];
  const signature = profileSignature(pathObject, terrain);
  const cached = profileCache.get(pathObject);
  if (cached?.signature === signature) return cached.profile;
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const samples = samplePathSpline(pathObject, { spacing: properties.meshSpacing });
  let accumulatedDistance = 0;
  const profile = samples.map((sample, index) => {
    if (index > 0) accumulatedDistance += Math.hypot(sample.x - samples[index - 1].x, sample.z - samples[index - 1].z);
    const baseY = terrainBaseHeightAt(terrain, sample.x, sample.z);
    return { ...sample, distance: accumulatedDistance, baseY, y: baseY + properties.surfaceOffset };
  });
  for (let pass = 0; pass < properties.profileSmoothingPasses; pass += 1) {
    const source = profile.map(point => point.y);
    for (let index = 1; index < profile.length - 1; index += 1) {
      const target = (source[index - 1] + source[index] * 2 + source[index + 1]) * 0.25;
      const smoothed = lerp(source[index], target, properties.verticalCurveStrength);
      profile[index].y = clamp(smoothed, profile[index].baseY - properties.maxCutDepth, profile[index].baseY + properties.maxFillDepth);
    }
  }
  const constraintResult = solveBoundedProfile(profile, properties);
  let maximumGradePercent = 0;
  let maximumCut = 0;
  let maximumFill = 0;
  for (let index = 0; index < profile.length; index += 1) {
    const previous = profile[Math.max(0, index - 1)], next = profile[Math.min(profile.length - 1, index + 1)];
    const horizontal = Math.max(EPSILON, Math.hypot(next.x - previous.x, next.z - previous.z));
    profile[index].gradePercent = ((next.y - previous.y) / horizontal) * 100;
    maximumCut = Math.max(maximumCut, profile[index].baseY - profile[index].y);
    maximumFill = Math.max(maximumFill, profile[index].y - profile[index].baseY);
  }
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1], current = profile[index];
    const horizontal = Math.max(EPSILON, Math.hypot(current.x - previous.x, current.z - previous.z));
    maximumGradePercent = Math.max(maximumGradePercent, Math.abs(current.y - previous.y) / horizontal * 100);
  }
  profile.diagnostics = {
    feasible: constraintResult.feasible,
    infeasibleStationCount: constraintResult.infeasibleStations.length,
    infeasibleStations: constraintResult.infeasibleStations,
    maximumGradePercent,
    maximumCut,
    maximumFill,
    gameplayReady: constraintResult.feasible
      && maximumGradePercent <= properties.maxGradePercent + 0.05
      && maximumCut <= properties.maxCutDepth + 1e-4
      && maximumFill <= properties.maxFillDepth + 1e-4
  };
  profileCache.set(pathObject, { signature, profile });
  return profile;
}

function nearestProfilePoint(profile, x, z) {
  let nearest = { distance: Infinity, y: 0, x: 0, z: 0 };
  for (let index = 0; index < profile.length - 1; index += 1) {
    const a = profile[index], b = profile[index + 1], info = pointSegmentInfo(x, z, a, b);
    if (info.distance < nearest.distance) nearest = { ...info, y: lerp(a.y, b.y, info.t) };
  }
  return nearest;
}

export function pathBlendAt(paths, x, z) {
  let result = 0;
  for (const pathObject of paths || []) {
    if (pathObject.visible === false) continue;
    const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
    if (properties.surfaceAuthority !== 'legacy-terrain') continue;
    const nearest = nearestPathPoint(pathObject, x, z);
    const width = Math.max(0.1, Number(properties.width || 3));
    const roadAndShoulder = width * 0.5 + Math.max(0, Number(properties.shoulderWidth || 0));
    const shoulder = Math.max(0.05, Number(properties.blendDistance ?? 2.5));
    const irregularity = Number(properties.edgeNoise ?? 0.45);
    const noise = valueNoise(x * 0.19, z * 0.19, Number(properties.seed || 17)) * irregularity * 0.34;
    const blend = 1 - smoothstep(roadAndShoulder + noise, roadAndShoulder + shoulder + noise, nearest.distance);
    result = Math.max(result, blend);
  }
  return clamp(result, 0, 1);
}

export function distanceToPaths(paths, x, z) {
  let nearest = Infinity;
  for (const pathObject of paths || []) {
    if (pathObject.visible === false) continue;
    const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
    nearest = Math.min(nearest, nearestPathPoint(pathObject, x, z).distance - Number(properties.width || 3) / 2);
  }
  return nearest;
}

export function terrainHeightAt(terrain, x, z, paths = []) {
  let height = terrainBaseHeightAt(terrain, x, z);
  for (const pathObject of paths || []) {
    if (pathObject.visible === false) continue;
    const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
    if (!properties.carveTerrain || properties.terrainModificationAuthority !== 'legacy-terrain') continue;
    const profile = compilePathProfile(pathObject, terrain);
    const nearest = nearestProfilePoint(profile, x, z);
    const width = Math.max(0.1, Number(properties.width || 3));
    const shoulder = Math.max(
      0.1,
      Number(properties.cutShoulder || properties.blendDistance || 3),
      Number(properties.shoulderWidth || 0) + Number(properties.sideSlopeWidth || 0)
    );
    const influence = 1 - smoothstep(width * 0.5, width * 0.5 + shoulder, nearest.distance);
    if (influence <= 0) continue;
    const target = clamp(nearest.y, height - properties.maxCutDepth, height + properties.maxFillDepth);
    height = lerp(height, target, influence);
  }
  return height;
}

export function terrainNormalAt(terrain, x, z, paths = [], step = 0.5) {
  const hL = terrainHeightAt(terrain, x - step, z, paths), hR = terrainHeightAt(terrain, x + step, z, paths);
  const hD = terrainHeightAt(terrain, x, z - step, paths), hU = terrainHeightAt(terrain, x, z + step, paths);
  const nx = hL - hR, ny = step * 2, nz = hD - hU, length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

export function terrainBounds(terrain) {
  return normalizeTerrainProperties(terrain?.properties || {}, terrain?.transform || {}).bounds;
}

export function expandTerrain(terrain, direction, amount) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const oldSizeX = properties.bounds.maxX - properties.bounds.minX;
  const oldSizeZ = properties.bounds.maxZ - properties.bounds.minZ;
  const spacingX = oldSizeX / Math.max(1, properties.resolutionX);
  const spacingZ = oldSizeZ / Math.max(1, properties.resolutionZ);
  const delta = Math.max(1, Number(amount || properties.expandStep || 100));
  const bounds = { ...properties.bounds };
  if (direction === 'north') bounds.minZ -= delta;
  else if (direction === 'south') bounds.maxZ += delta;
  else if (direction === 'west') bounds.minX -= delta;
  else if (direction === 'east') bounds.maxX += delta;
  else if (direction === 'all') { bounds.minX -= delta; bounds.maxX += delta; bounds.minZ -= delta; bounds.maxZ += delta; }
  else throw new Error('Terrain expansion direction must be north, south, east, west, or all.');
  const requiredResolutionX = Math.ceil((bounds.maxX - bounds.minX) / Math.max(EPSILON, spacingX));
  const requiredResolutionZ = Math.ceil((bounds.maxZ - bounds.minZ) / Math.max(EPSILON, spacingZ));
  terrain.properties = normalizeTerrainProperties({
    ...properties,
    bounds,
    resolutionX: Math.min(256, Math.max(properties.resolutionX, requiredResolutionX)),
    resolutionZ: Math.min(256, Math.max(properties.resolutionZ, requiredResolutionZ)),
    densityLimited: requiredResolutionX > 256 || requiredResolutionZ > 256,
    generatedRevision: properties.generatedRevision + 1
  }, { ...terrain.transform, scale: [1, 1, 1] });
  terrain.transform.scale = [1, 1, 1];
  return terrain.properties.bounds;
}

export function addTerrainSculptLayer(terrain, layer = {}) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const nextLayer = normalizeSculptLayer(layer);
  terrain.properties = normalizeTerrainProperties({ ...properties, sculptLayers: [...properties.sculptLayers, nextLayer], generatedRevision: properties.generatedRevision + 1 }, terrain.transform || {});
  return nextLayer;
}

export function undoTerrainSculpt(terrain) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const removed = properties.sculptLayers.at(-1) || null;
  terrain.properties = normalizeTerrainProperties({ ...properties, sculptLayers: properties.sculptLayers.slice(0, -1), generatedRevision: properties.generatedRevision + 1 }, terrain.transform || {});
  return removed;
}

export function clearTerrainSculpt(terrain) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const removedCount = properties.sculptLayers.length;
  terrain.properties = normalizeTerrainProperties({ ...properties, sculptLayers: [], generatedRevision: properties.generatedRevision + 1 }, terrain.transform || {});
  return removedCount;
}

export function migrateSceneWorldFoundation(scene) {
  if (!scene || !Array.isArray(scene.objects)) return scene;
  scene.settings = { ...(scene.settings || {}), splinesVisible: scene.settings?.splinesVisible !== false, worldChunkSize: Number(scene.settings?.worldChunkSize || 64) };
  for (const object of scene.objects) {
    if (object.type === 'terrain') {
      object.properties = normalizeTerrainProperties(object.properties || {}, object.transform || {});
      object.transform.position = [0, 0, 0];
      object.transform.scale = [1, 1, 1];
    }
    if (object.type === 'path') {
      object.properties = normalizePathProperties(object.properties || {}, object.transform || {});
      object.transform.position = [0, 0, 0];
      object.transform.scale = [1, 1, 1];
    }
  }
  return scene;
}

export function splitPath(pathObject, controlIndex) {
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const index = Math.round(clamp(controlIndex, 1, properties.points.length - 2));
  return [properties.points.slice(0, index + 1), properties.points.slice(index)];
}

export function insertPathPoint(pathObject, x, z) {
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const nearest = nearestPathPoint(pathObject, x, z);
  const index = Math.min(properties.points.length - 1, nearest.segment + 1);
  const points = properties.points.map(point => [...point]);
  points.splice(index, 0, [Number(x), Number(z)]);
  return { points, index };
}

export function worldgenSignature(terrain, paths = []) {
  const properties = normalizeTerrainProperties(terrain?.properties || {}, terrain?.transform || {});
  return JSON.stringify([properties, (paths || []).map(path => normalizePathProperties(path.properties || {}, path.transform || {}))]);
}
