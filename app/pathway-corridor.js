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

const PATHWAY_BAND_COUNT = 9;
const PATHWAY_BLENDS = Object.freeze([0, 0.12, 0.48, 1, 1, 1, 0.48, 0.12, 0]);

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

function terrainAtOffset(station, sideX, sideZ, offset, terrain) {
  const x = station.x + sideX * offset;
  const z = station.z + sideZ * offset;
  return { x, z, y: terrainBaseHeightAt(terrain, x, z) };
}

function findTerrainJoin(station, sideSign, sideX, sideZ, shoulderDistance, shoulderY, properties, terrain) {
  const start = terrainAtOffset(station, sideX, sideZ, sideSign * shoulderDistance, terrain);
  const gap = shoulderY - start.y;
  const mode = gap >= 0 ? 'fill' : 'cut';
  const ratio = mode === 'fill' ? properties.fillSlopeRatio : properties.cutSlopeRatio;
  const minimumDistance = Math.max(0.2, properties.sideSlopeWidth);
  const maximumDistance = Math.max(minimumDistance, properties.maxSideSlopeSearchWidth);
  const step = Math.max(0.2, Math.min(properties.meshSpacing, 1));
  const engineeredAt = distance => shoulderY + (mode === 'fill' ? -1 : 1) * distance / Math.max(0.25, ratio);
  let previousDistance = 0;
  let previousDifference = gap;
  for (let distance = step; distance <= maximumDistance + EPSILON; distance += step) {
    const clampedDistance = Math.min(distance, maximumDistance);
    const sample = terrainAtOffset(station, sideX, sideZ, sideSign * (shoulderDistance + clampedDistance), terrain);
    const difference = engineeredAt(clampedDistance) - sample.y;
    const crossed = mode === 'fill' ? difference <= 0 : difference >= 0;
    if (crossed && clampedDistance >= minimumDistance) {
      const denominator = difference - previousDifference;
      const fraction = Math.abs(denominator) > EPSILON
        ? clamp(-previousDifference / denominator, 0, 1)
        : 1;
      const joinedDistance = Math.max(minimumDistance, previousDistance + (clampedDistance - previousDistance) * fraction);
      const joined = terrainAtOffset(station, sideX, sideZ, sideSign * (shoulderDistance + joinedDistance), terrain);
      return { distance: joinedDistance, ...joined, mode, joined: true };
    }
    previousDistance = clampedDistance;
    previousDifference = difference;
    if (clampedDistance >= maximumDistance) break;
  }
  const terminal = terrainAtOffset(station, sideX, sideZ, sideSign * (shoulderDistance + maximumDistance), terrain);
  return { distance: maximumDistance, ...terminal, mode, joined: false };
}

function stationCrossSection(station, stationIndex, profile, sideX, sideZ, properties, terrain, renderLift) {
  const roadHalf = properties.width * 0.5;
  const shoulderDistance = roadHalf + properties.shoulderWidth;
  const bankRadians = bankRadiansForStation(profile, stationIndex, properties);
  const bankAt = offset => Math.tan(bankRadians) * offset;
  const leftEdgeY = station.y + bankAt(-roadHalf);
  const rightEdgeY = station.y + bankAt(roadHalf);
  const leftShoulderY = station.y - properties.shoulderDrop + bankAt(-shoulderDistance) * 0.92;
  const rightShoulderY = station.y - properties.shoulderDrop + bankAt(shoulderDistance) * 0.92;
  const leftJoin = findTerrainJoin(station, -1, sideX, sideZ, shoulderDistance, leftShoulderY, properties, terrain);
  const rightJoin = findTerrainJoin(station, 1, sideX, sideZ, shoulderDistance, rightShoulderY, properties, terrain);
  const slopePoint = (sideSign, shoulderY, join) => {
    const distance = Math.max(0.1, join.distance * 0.52);
    const sample = terrainAtOffset(station, sideX, sideZ, sideSign * (shoulderDistance + distance), terrain);
    let y = shoulderY + (join.y - shoulderY) * 0.52;
    if (properties.drainageEnabled) y = Math.min(y, shoulderY - properties.ditchDepth);
    return { offset: sideSign * (shoulderDistance + distance), y, x: sample.x, z: sample.z };
  };
  const leftSlope = slopePoint(-1, leftShoulderY, leftJoin);
  const rightSlope = slopePoint(1, rightShoulderY, rightJoin);
  return [
    { offset: -(shoulderDistance + leftJoin.distance), y: leftJoin.y, blend: PATHWAY_BLENDS[0], role: 'terrain-seam' },
    { offset: leftSlope.offset, y: leftSlope.y, blend: PATHWAY_BLENDS[1], role: properties.drainageEnabled ? 'ditch' : 'side-slope' },
    { offset: -shoulderDistance, y: leftShoulderY + renderLift * PATHWAY_BLENDS[2], blend: PATHWAY_BLENDS[2], role: 'shoulder-outer' },
    { offset: -roadHalf, y: leftEdgeY + renderLift, blend: PATHWAY_BLENDS[3], role: 'road-edge' },
    { offset: 0, y: station.y + properties.crownHeight + renderLift, blend: PATHWAY_BLENDS[4], role: 'road-center' },
    { offset: roadHalf, y: rightEdgeY + renderLift, blend: PATHWAY_BLENDS[5], role: 'road-edge' },
    { offset: shoulderDistance, y: rightShoulderY + renderLift * PATHWAY_BLENDS[6], blend: PATHWAY_BLENDS[6], role: 'shoulder-outer' },
    { offset: rightSlope.offset, y: rightSlope.y, blend: PATHWAY_BLENDS[7], role: properties.drainageEnabled ? 'ditch' : 'side-slope' },
    { offset: shoulderDistance + rightJoin.distance, y: rightJoin.y, blend: PATHWAY_BLENDS[8], role: 'terrain-seam' }
  ];
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
  if (profile.diagnostics?.feasible === false) warnings.push(`The requested grade and cut/fill limits conflict at ${profile.diagnostics.infeasibleStationCount} station${profile.diagnostics.infeasibleStationCount === 1 ? '' : 's'}; adjust the route or engineering limits.`);
  else if (steepSegmentCount) warnings.push(`${steepSegmentCount} profile station${steepSegmentCount === 1 ? '' : 's'} reach the configured grade limit.`);
  if (sharpSegmentCount) warnings.push(`${sharpSegmentCount} curve station${sharpSegmentCount === 1 ? '' : 's'} fall below the preferred radius.`);
  if (maximumFill > properties.bridgeThreshold) warnings.push('Deep fill detected: bridge or viaduct review recommended.');
  if (maximumCut > properties.tunnelThreshold) warnings.push('Deep cut detected: tunnel or reroute review recommended.');
  if (Math.max(maximumCut, maximumFill) > properties.retainingWallThreshold) warnings.push('Retaining-wall review recommended along the most severe corridor sections.');
  if (generated?.validation?.verticalEdgeLimitExceeded) warnings.push('Corridor mesh blocked because a terrain join would create an unsafe vertical wall.');
  if (generated?.validation?.meshValid === false && !generated?.validation?.verticalEdgeLimitExceeded) warnings.push('Corridor mesh failed geometry validation and was blocked from rendering.');
  return {
    valid: generated?.validation?.meshValid !== false,
    meshValid: generated?.validation?.meshValid !== false,
    gameplayReady: profile.diagnostics?.gameplayReady === true && generated?.validation?.meshValid !== false,
    constraintStatus: profile.diagnostics?.feasible === false ? 'blocked-infeasible-profile' : 'passed',
    infeasibleStationCount: profile.diagnostics?.infeasibleStationCount || 0,
    surfaceAuthority: properties.surfaceAuthority,
    terrainModificationAuthority: properties.terrainModificationAuthority,
    legacyTerrainSurfaceActive: properties.surfaceAuthority === 'legacy-terrain',
    legacyTerrainDeformationActive: properties.carveTerrain && properties.terrainModificationAuthority === 'legacy-terrain',
    preset: properties.pathPreset,
    roadClass: properties.roadClass,
    length: profileLength(profile),
    stationCount: profile.length,
    crossSectionBands: PATHWAY_BAND_COUNT,
    vertexCount: generated?.positions?.length ? generated.positions.length / 3 : profile.length * PATHWAY_BAND_COUNT,
    triangleCount: generated?.indices?.length ? generated.indices.length / 3 : Math.max(0, profile.length - 1) * (PATHWAY_BAND_COUNT - 1) * 2,
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
    maximumTriangleEdge: generated?.validation?.maximumTriangleEdge || 0,
    maximumVerticalEdge: generated?.validation?.maximumVerticalEdge || 0,
    maximumAllowedVerticalEdge: generated?.validation?.maximumAllowedVerticalEdge ?? null,
    verticalEdgeLimitExceeded: generated?.validation?.verticalEdgeLimitExceeded === true,
    minimumTriangleArea: generated?.validation?.minimumTriangleArea ?? 0,
    degenerateTriangleCount: generated?.validation?.degenerateTriangleCount || 0,
    crossSectionFlipCount: generated?.validation?.crossSectionFlipCount || 0,
    frameCorrectionCount: generated?.validation?.frameCorrectionCount || 0,
    warnings
  };
}

export function validatePathwayMesh(positions, indices, rowSize = PATHWAY_BAND_COUNT, limits = {}) {
  let maximumTriangleEdge = 0;
  let maximumVerticalEdge = 0;
  let minimumTriangleArea = Infinity;
  let degenerateTriangleCount = 0;
  let invalidIndexCount = 0;
  let nonFinitePositionCount = 0;
  for (const value of positions) if (!Number.isFinite(value)) nonFinitePositionCount += 1;
  const edgeLength = (a, b) => {
    const dx = positions[a * 3] - positions[b * 3];
    const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
    const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
    maximumVerticalEdge = Math.max(maximumVerticalEdge, Math.abs(dy));
    return Math.hypot(dx, dy, dz);
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2];
    if (![a, b, c].every(index => Number.isInteger(index) && index >= 0 && index * 3 + 2 < positions.length)) {
      invalidIndexCount += 1;
      continue;
    }
    maximumTriangleEdge = Math.max(maximumTriangleEdge, edgeLength(a, b), edgeLength(b, c), edgeLength(c, a));
    const ab = [positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]];
    const ac = [positions[c * 3] - positions[a * 3], positions[c * 3 + 1] - positions[a * 3 + 1], positions[c * 3 + 2] - positions[a * 3 + 2]];
    const crossX = ab[1] * ac[2] - ab[2] * ac[1];
    const crossY = ab[2] * ac[0] - ab[0] * ac[2];
    const crossZ = ab[0] * ac[1] - ab[1] * ac[0];
    const area = Math.hypot(crossX, crossY, crossZ) * 0.5;
    minimumTriangleArea = Math.min(minimumTriangleArea, area);
    if (area <= 1e-8) degenerateTriangleCount += 1;
  }
  let crossSectionFlipCount = 0;
  const rowCount = Math.floor(positions.length / 3 / rowSize);
  for (let row = 0; row < rowCount; row += 1) {
    const left = (row * rowSize) * 3;
    const right = (row * rowSize + rowSize - 1) * 3;
    const width = Math.hypot(positions[right] - positions[left], positions[right + 2] - positions[left + 2]);
    if (!Number.isFinite(width) || width <= EPSILON) crossSectionFlipCount += 1;
  }
  const maximumAllowedVerticalEdge = Number.isFinite(Number(limits.maximumVerticalEdge))
    ? Number(limits.maximumVerticalEdge)
    : Infinity;
  const verticalEdgeLimitExceeded = maximumVerticalEdge > maximumAllowedVerticalEdge + 1e-5;
  const meshValid = nonFinitePositionCount === 0
    && invalidIndexCount === 0
    && degenerateTriangleCount === 0
    && crossSectionFlipCount === 0
    && !verticalEdgeLimitExceeded;
  return {
    meshValid,
    nonFinitePositionCount,
    invalidIndexCount,
    degenerateTriangleCount,
    minimumTriangleArea: Number.isFinite(minimumTriangleArea) ? minimumTriangleArea : 0,
    maximumTriangleEdge,
    maximumVerticalEdge,
    maximumAllowedVerticalEdge,
    verticalEdgeLimitExceeded,
    crossSectionFlipCount
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
  const renderLift = computePathwayRenderLift(pathObject, terrain);
  const positions = [];
  const indices = [];
  const uvs = [];
  const blends = [];
  let accumulatedDistance = 0;
  let previousSide = null;
  let frameCorrectionCount = 0;

  for (let stationIndex = 0; stationIndex < profile.length; stationIndex += 1) {
    const station = profile[stationIndex];
    const previous = profile[Math.max(0, stationIndex - 1)];
    if (stationIndex > 0) {
      accumulatedDistance += Math.hypot(station.x - previous.x, station.z - previous.z);
    }
    const [tangentX, tangentZ] = stationTangent(profile, stationIndex);
    let sideX = -tangentZ;
    let sideZ = tangentX;
    if (previousSide && sideX * previousSide[0] + sideZ * previousSide[1] < 0) {
      sideX *= -1;
      sideZ *= -1;
      frameCorrectionCount += 1;
    }
    previousSide = [sideX, sideZ];
    const bands = stationCrossSection(station, stationIndex, profile, sideX, sideZ, properties, terrain, renderLift);

    for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
      const band = bands[bandIndex];
      const x = station.x + sideX * band.offset;
      const z = station.z + sideZ * band.offset;
      positions.push(x, band.y, z);
      uvs.push(bandIndex / Math.max(1, PATHWAY_BAND_COUNT - 1), accumulatedDistance / Math.max(0.25, properties.textureRepeatLength));
      blends.push(band.blend);
    }

    if (stationIndex > 0) {
      const previousRow = (stationIndex - 1) * PATHWAY_BAND_COUNT;
      const currentRow = stationIndex * PATHWAY_BAND_COUNT;
      for (let bandIndex = 0; bandIndex < PATHWAY_BAND_COUNT - 1; bandIndex += 1) {
        const a = previousRow + bandIndex;
        const b = previousRow + bandIndex + 1;
        const c = currentRow + bandIndex;
        const d = currentRow + bandIndex + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const validation = validatePathwayMesh(positions, indices, PATHWAY_BAND_COUNT, {
    maximumVerticalEdge: Math.max(
      2,
      (properties.maxCutDepth + properties.maxFillDepth) * 1.2,
      properties.width * 1.5
    )
  });
  validation.frameCorrectionCount = frameCorrectionCount;
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
    blends: new Float32Array(blends),
    rowSize: PATHWAY_BAND_COUNT,
    validation
  };
  generated.diagnostics = analyzePathwayCorridor(pathObject, terrain, allPaths, generated);
  return generated;
}

export const buildTerrainConformingPathSurface = buildPathwayCorridor;
