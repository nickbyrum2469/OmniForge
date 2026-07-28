import {
  clamp,
  compilePathProfile,
  normalizePathProperties,
  normalizeTerrainProperties,
  terrainBaseHeightAt
} from './worldgen.js';

const EPSILON = 1e-6;

function normalize2(x, z) {
  const magnitude = Math.hypot(x, z);
  return magnitude > EPSILON ? [x / magnitude, z / magnitude] : [1, 0];
}

function clampNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
}

function stationTangent(profile, index) {
  const previous = profile[Math.max(0, index - 1)];
  const next = profile[Math.min(profile.length - 1, index + 1)];
  return normalize2(next.x - previous.x, next.z - previous.z);
}

function stationCurvature(profile, index) {
  if (index <= 0 || index >= profile.length - 1) return { signed: 0, radius: Infinity };
  const previous = profile[index - 1];
  const current = profile[index];
  const next = profile[index + 1];
  const [aX, aZ] = normalize2(current.x - previous.x, current.z - previous.z);
  const [bX, bZ] = normalize2(next.x - current.x, next.z - current.z);
  const cross = aX * bZ - aZ * bX;
  const dot = Math.max(-1, Math.min(1, aX * bX + aZ * bZ));
  const angle = Math.atan2(cross, dot);
  const distance = Math.max(EPSILON, (
    Math.hypot(current.x - previous.x, current.z - previous.z)
    + Math.hypot(next.x - current.x, next.z - current.z)
  ) * 0.5);
  return {
    signed: angle / distance,
    radius: Math.abs(angle) > 1e-5 ? distance / Math.abs(angle) : Infinity
  };
}

function terrainSpacing(terrain) {
  const properties = normalizeTerrainProperties(terrain?.properties || {}, terrain?.transform || {});
  return Math.max(
    properties.sizeX / Math.max(1, properties.resolutionX),
    properties.sizeZ / Math.max(1, properties.resolutionZ)
  );
}

export function computePathwayRenderLift(pathObject, terrain) {
  const properties = normalizePathProperties(pathObject?.properties || {}, pathObject?.transform || {});
  const authored = clampNumber(properties.renderLift, 0.028, 0.006, 0.25);
  if (properties.renderLiftMode === 'manual') return authored;
  const spacing = terrainSpacing(terrain);
  return Math.max(authored, Math.min(0.14, 0.012 + spacing * 0.0075 + properties.width * 0.0015));
}

function pathBands(properties) {
  const roadHalf = properties.width * 0.5;
  const shoulder = Math.max(0, properties.shoulderWidth);
  const slopeWidth = Math.max(0.2, properties.sideSlopeWidth);
  const outer = roadHalf + shoulder + slopeWidth;
  return [
    { role: 'terrain-seam', offset: -outer, blend: 0 },
    { role: properties.drainageEnabled ? 'ditch' : 'side-slope', offset: -(roadHalf + shoulder + slopeWidth * 0.48), blend: 0.12 },
    { role: 'shoulder-outer', offset: -(roadHalf + shoulder), blend: 0.48 },
    { role: 'road-edge', offset: -roadHalf, blend: 1 },
    { role: 'road-center', offset: 0, blend: 1 },
    { role: 'road-edge', offset: roadHalf, blend: 1 },
    { role: 'shoulder-outer', offset: roadHalf + shoulder, blend: 0.48 },
    { role: properties.drainageEnabled ? 'ditch' : 'side-slope', offset: roadHalf + shoulder + slopeWidth * 0.48, blend: 0.12 },
    { role: 'terrain-seam', offset: outer, blend: 0 }
  ];
}

function bankRadiansForStation(profile, index, properties) {
  if (properties.bankMode === 'none') return 0;
  if (properties.bankMode === 'manual') {
    return clampNumber(properties.manualBankDegrees, 0, -properties.maxBankDegrees, properties.maxBankDegrees) * Math.PI / 180;
  }
  const curvature = stationCurvature(profile, index).signed;
  const designedSpeed = Math.max(1, Number(properties.designSpeedKph || 35)) / 3.6;
  const gravity = 9.80665;
  const ideal = Math.atan((designedSpeed * designedSpeed * curvature) / gravity);
  const strength = clampNumber(properties.bankStrength, 0.65, 0, 1.5);
  const maximum = Math.max(0, Number(properties.maxBankDegrees || 8)) * Math.PI / 180;
  return Math.max(-maximum, Math.min(maximum, ideal * strength));
}

function stationGrade(profile, index) {
  if (profile.length < 2) return 0;
  const previous = profile[Math.max(0, index - 1)];
  const next = profile[Math.min(profile.length - 1, index + 1)];
  const horizontal = Math.max(EPSILON, Math.hypot(next.x - previous.x, next.z - previous.z));
  return (next.y - previous.y) / horizontal;
}

function roleHeight(role, station, terrainY, edgeY, bankY, properties) {
  if (role === 'road-center') return station.y + properties.crownHeight + bankY;
  if (role === 'road-edge') return station.y + bankY;
  if (role === 'shoulder-outer') return station.y - properties.shoulderDrop + bankY * 0.92;
  if (role === 'ditch') {
    const shoulderY = station.y - properties.shoulderDrop + bankY * 0.78;
    return Math.min(terrainY, shoulderY - properties.ditchDepth);
  }
  if (role === 'side-slope') return edgeY * 0.55 + terrainY * 0.45;
  return terrainY;
}

function accumulateTriangleNormal(positions, normals, ia, ib, ic) {
  const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
  const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
  const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  for (const index of [ia, ib, ic]) {
    normals[index * 3] += nx;
    normals[index * 3 + 1] += ny;
    normals[index * 3 + 2] += nz;
  }
}

function normalizeNormals(normals) {
  for (let offset = 0; offset < normals.length; offset += 3) {
    const magnitude = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
    normals[offset] /= magnitude;
    normals[offset + 1] /= magnitude;
    normals[offset + 2] /= magnitude;
  }
}

function profileLength(profile) {
  let total = 0;
  for (let index = 1; index < profile.length; index += 1) {
    total += Math.hypot(profile[index].x - profile[index - 1].x, profile[index].z - profile[index - 1].z);
  }
  return total;
}

export function analyzePathwayCorridor(pathObject, terrain, allPaths = [], generated = null) {
  const properties = normalizePathProperties(pathObject?.properties || {}, pathObject?.transform || {});
  const profile = compilePathProfile(pathObject, terrain);
  if (!terrain || profile.length < 2) {
    return {
      valid: false,
      length: 0,
      stationCount: profile.length,
      warnings: ['A visible terrain and at least two valid path points are required.']
    };
  }
  let maximumGradePercent = 0;
  let minimumCurveRadius = Infinity;
  let maximumCut = 0;
  let maximumFill = 0;
  let sharpSegmentCount = 0;
  let steepSegmentCount = 0;
  for (let index = 0; index < profile.length; index += 1) {
    const gradePercent = Math.abs(stationGrade(profile, index)) * 100;
    maximumGradePercent = Math.max(maximumGradePercent, gradePercent);
    if (gradePercent > properties.maxGradePercent + 0.05) steepSegmentCount += 1;
    const curve = stationCurvature(profile, index);
    minimumCurveRadius = Math.min(minimumCurveRadius, curve.radius);
    if (curve.radius < properties.minimumCurveRadius) sharpSegmentCount += 1;
    const base = terrainBaseHeightAt(terrain, profile[index].x, profile[index].z);
    maximumCut = Math.max(maximumCut, base - profile[index].y);
    maximumFill = Math.max(maximumFill, profile[index].y - base);
  }
  const spacing = terrainSpacing(terrain);
  const warnings = [];
  if (spacing > properties.width * 0.35) warnings.push('Underlying terrain grid is too coarse for road shaping; the dedicated corridor is required.');
  if (steepSegmentCount) warnings.push(`${steepSegmentCount} profile station${steepSegmentCount === 1 ? '' : 's'} reach the configured grade limit.`);
  if (sharpSegmentCount) warnings.push(`${sharpSegmentCount} curve station${sharpSegmentCount === 1 ? '' : 's'} fall below the preferred radius.`);
  if (maximumFill > properties.bridgeThreshold) warnings.push('Deep fill detected: bridge or viaduct review recommended.');
  if (maximumCut > properties.tunnelThreshold) warnings.push('Deep cut detected: tunnel or reroute review recommended.');
  if (Math.max(maximumCut, maximumFill) > properties.retainingWallThreshold) warnings.push('Retaining-wall review recommended along the most severe corridor sections.');
  return {
    valid: true,
    preset: properties.pathPreset,
    roadClass: properties.roadClass,
    length: profileLength(profile),
    stationCount: profile.length,
    crossSectionBands: pathBands(properties).length,
    vertexCount: generated?.positions?.length ? generated.positions.length / 3 : profile.length * pathBands(properties).length,
    triangleCount: generated?.indices?.length ? generated.indices.length / 3 : Math.max(0, profile.length - 1) * (pathBands(properties).length - 1) * 2,
    maximumGradePercent,
    configuredMaximumGradePercent: properties.maxGradePercent,
    minimumCurveRadius: Number.isFinite(minimumCurveRadius) ? minimumCurveRadius : null,
    configuredMinimumCurveRadius: properties.minimumCurveRadius,
    maximumCut,
    maximumFill,
    bridgeRecommended: maximumFill > properties.bridgeThreshold,
    tunnelRecommended: maximumCut > properties.tunnelThreshold,
    retainingWallRecommended: Math.max(maximumCut, maximumFill) > properties.retainingWallThreshold,
    terrainSpacing: spacing,
    renderLift: computePathwayRenderLift(pathObject, terrain),
    steepSegmentCount,
    sharpSegmentCount,
    warnings
  };
}

export function terrainPathSamplingDiagnostics(terrain, paths = []) {
  if (!terrain) return { available: false, undersampled: false, pathCount: 0 };
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const visiblePaths = (paths || []).filter(path => path && path.visible !== false);
  const spacingX = properties.sizeX / Math.max(1, properties.resolutionX);
  const spacingZ = properties.sizeZ / Math.max(1, properties.resolutionZ);
  const maximumSpacing = Math.max(spacingX, spacingZ);
  const widths = visiblePaths.map(path => normalizePathProperties(path.properties || {}, path.transform || {}).width);
  const minimumPathWidth = widths.length ? Math.min(...widths) : Infinity;
  const recommendedSpacing = Number.isFinite(minimumPathWidth) ? Math.max(0.25, minimumPathWidth * 0.35) : maximumSpacing;
  return {
    available: true,
    undersampled: visiblePaths.length > 0 && maximumSpacing > recommendedSpacing,
    pathCount: visiblePaths.length,
    spacingX,
    spacingZ,
    maximumSpacing,
    minimumPathWidth: Number.isFinite(minimumPathWidth) ? minimumPathWidth : null,
    recommendedSpacing,
    resolutionX: properties.resolutionX,
    resolutionZ: properties.resolutionZ,
    sizeX: properties.sizeX,
    sizeZ: properties.sizeZ,
    dedicatedPathSurface: true,
    corridorCompiler: 'pathway-studio-v1'
  };
}

export function buildPathwayCorridor(pathObject, terrain, allPaths = [], options = {}) {
  const empty = {
    positions: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
    uvs: new Float32Array(),
    blends: new Float32Array(),
    diagnostics: { valid: false, warnings: ['No path corridor could be generated.'] }
  };
  if (!pathObject || !terrain || pathObject.visible === false) return empty;
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const profile = compilePathProfile(pathObject, terrain);
  if (profile.length < 2) return empty;
  const bands = pathBands(properties);
  const renderLift = computePathwayRenderLift(pathObject, terrain);
  const positions = [];
  const indices = [];
  const uvs = [];
  const blends = [];
  let accumulatedDistance = 0;

  for (let stationIndex = 0; stationIndex < profile.length; stationIndex += 1) {
    const station = profile[stationIndex];
    const previous = profile[Math.max(0, stationIndex - 1)];
    if (stationIndex > 0) {
      accumulatedDistance += Math.hypot(station.x - previous.x, station.z - previous.z);
    }
    const [tangentX, tangentZ] = stationTangent(profile, stationIndex);
    const sideX = -tangentZ;
    const sideZ = tangentX;
    const bankRadians = bankRadiansForStation(profile, stationIndex, properties);
    const edgeBank = Math.tan(bankRadians) * properties.width * 0.5;
    const leftEdgeY = station.y - edgeBank;
    const rightEdgeY = station.y + edgeBank;

    for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
      const band = bands[bandIndex];
      const x = station.x + sideX * band.offset;
      const z = station.z + sideZ * band.offset;
      const terrainY = terrainBaseHeightAt(terrain, x, z);
      const bankY = Math.tan(bankRadians) * band.offset;
      const edgeY = band.offset < 0 ? leftEdgeY : rightEdgeY;
      let y = roleHeight(band.role, station, terrainY, edgeY, bankY, properties);
      y += renderLift * band.blend;
      positions.push(x, y, z);
      uvs.push(bandIndex / Math.max(1, bands.length - 1), accumulatedDistance / Math.max(0.25, properties.textureRepeatLength));
      blends.push(band.blend);
    }

    if (stationIndex > 0) {
      const previousRow = (stationIndex - 1) * bands.length;
      const currentRow = stationIndex * bands.length;
      for (let bandIndex = 0; bandIndex < bands.length - 1; bandIndex += 1) {
        const a = previousRow + bandIndex;
        const b = previousRow + bandIndex + 1;
        const c = currentRow + bandIndex;
        const d = currentRow + bandIndex + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const normals = new Array(positions.length).fill(0);
  for (let offset = 0; offset < indices.length; offset += 3) {
    accumulateTriangleNormal(positions, normals, indices[offset], indices[offset + 1], indices[offset + 2]);
  }
  normalizeNormals(normals);
  const generated = {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    uvs: new Float32Array(uvs),
    blends: new Float32Array(blends)
  };
  generated.diagnostics = analyzePathwayCorridor(pathObject, terrain, allPaths, generated);
  return generated;
}

export const buildTerrainConformingPathSurface = buildPathwayCorridor;
