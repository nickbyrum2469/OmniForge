import { normalizePathProperties, normalizeTerrainProperties, samplePathSpline, terrainHeightAt } from './worldgen.js';

function normalize2(x, z) {
  const magnitude = Math.hypot(x, z);
  return magnitude > 1e-6 ? [x / magnitude, z / magnitude] : [1, 0];
}

export function buildPathGuideSegments(samples, width, heightAt, surfaceOffset = 0.09) {
  const dense = Array.isArray(samples) ? samples : [];
  const halfWidth = Math.max(0.05, Number(width) || 0) * 0.5;
  const center = [];
  const edges = [];
  if (dense.length < 2 || typeof heightAt !== 'function') return { center, edges };

  const joined = dense.map((point, index) => {
    const previous = dense[Math.max(0, index - 1)];
    const next = dense[Math.min(dense.length - 1, index + 1)];
    const [tx, tz] = normalize2(next.x - previous.x, next.z - previous.z);
    const sideX = -tz;
    const sideZ = tx;
    const leftX = point.x + sideX * halfWidth;
    const leftZ = point.z + sideZ * halfWidth;
    const rightX = point.x - sideX * halfWidth;
    const rightZ = point.z - sideZ * halfWidth;
    return {
      center: [point.x, heightAt(point.x, point.z) + surfaceOffset, point.z],
      left: [leftX, heightAt(leftX, leftZ) + surfaceOffset, leftZ],
      right: [rightX, heightAt(rightX, rightZ) + surfaceOffset, rightZ]
    };
  });

  for (let index = 0; index < joined.length - 1; index += 1) {
    const a = joined[index];
    const b = joined[index + 1];
    center.push(...a.center, ...b.center);
    edges.push(...a.left, ...b.left, ...a.right, ...b.right);
  }
  return { center, edges };
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
    dedicatedPathSurface: true
  };
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

export function buildTerrainConformingPathSurface(pathObject, terrain, allPaths = [], options = {}) {
  const empty = {
    positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(),
    uvs: new Float32Array(), blends: new Float32Array()
  };
  if (!pathObject || !terrain || pathObject.visible === false) return empty;
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const width = Math.max(0.1, Number(properties.width || 3));
  const spacing = Math.max(0.3, Math.min(1.5, Number(options.spacing || width * 0.2)));
  const renderLift = Math.max(0.012, Math.min(0.08, Number(options.renderLift ?? 0.025)));
  const samples = samplePathSpline(pathObject, { spacing });
  if (samples.length < 2) return empty;
  const paths = (allPaths || []).filter(path => path && path.visible !== false);
  const halfWidth = width * 0.5;
  const positions = [], indices = [], uvs = [], blends = [];
  let accumulatedDistance = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const point = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    if (index > 0) accumulatedDistance += Math.hypot(point.x - previous.x, point.z - previous.z);
    const [tx, tz] = normalize2(next.x - previous.x, next.z - previous.z);
    const sideX = -tz, sideZ = tx;
    for (const side of [-1, 1]) {
      const x = point.x + sideX * halfWidth * side;
      const z = point.z + sideZ * halfWidth * side;
      const y = terrainHeightAt(terrain, x, z, paths) + renderLift;
      positions.push(x, y, z);
      uvs.push(side < 0 ? 0 : 1, accumulatedDistance / Math.max(0.25, width));
      blends.push(1);
    }
    if (index > 0) {
      const previousLeft = (index - 1) * 2;
      const previousRight = previousLeft + 1;
      const left = index * 2;
      const right = left + 1;
      indices.push(previousLeft, previousRight, left, previousRight, right, left);
    }
  }

  const normals = new Array(positions.length).fill(0);
  for (let offset = 0; offset < indices.length; offset += 3) {
    accumulateTriangleNormal(positions, normals, indices[offset], indices[offset + 1], indices[offset + 2]);
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const magnitude = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
    normals[offset] /= magnitude;
    normals[offset + 1] /= magnitude;
    normals[offset + 2] /= magnitude;
  }

  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices),
    uvs: new Float32Array(uvs), blends: new Float32Array(blends)
  };
}
