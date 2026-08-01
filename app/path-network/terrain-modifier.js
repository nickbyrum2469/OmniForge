const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (minimum, maximum, value) => {
  const t = clamp((value - minimum) / Math.max(EPSILON, maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
};

function chunkCoordinate(value, chunkSize) {
  return Math.floor(value / chunkSize);
}

function chunkKey(x, z) {
  return `${x}:${z}`;
}

function addEntryToChunks(chunks, entry, chunkSize) {
  const minimumX = chunkCoordinate(entry.bounds.minX, chunkSize);
  const maximumX = chunkCoordinate(entry.bounds.maxX, chunkSize);
  const minimumZ = chunkCoordinate(entry.bounds.minZ, chunkSize);
  const maximumZ = chunkCoordinate(entry.bounds.maxZ, chunkSize);
  for (let x = minimumX; x <= maximumX; x += 1) {
    for (let z = minimumZ; z <= maximumZ; z += 1) {
      const key = chunkKey(x, z);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(entry);
    }
  }
}

function pointSegment2(x, z, start, end) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const denominator = dx * dx + dz * dz;
  const t = denominator > EPSILON
    ? clamp(((x - start[0]) * dx + (z - start[2]) * dz) / denominator, 0, 1)
    : 0;
  const nearestX = lerp(start[0], end[0], t);
  const nearestZ = lerp(start[2], end[2], t);
  const signedLateral = denominator > EPSILON
    ? ((x - nearestX) * -dz + (z - nearestZ) * dx) / Math.sqrt(denominator)
    : 0;
  return {
    t,
    x: nearestX,
    z: nearestZ,
    lateral: signedLateral,
    distance: Math.hypot(x - nearestX, z - nearestZ)
  };
}

function profileExtents(profile) {
  const halfRoad = Math.max(0.05, finite(profile.width, 3) * 0.5);
  const shoulder = Math.max(0, finite(profile.shoulderWidth, 0.8));
  const ditch = profile.drainageEnabled === false
    ? 0
    : Math.max(0.35, finite(profile.ditchDepth, 0.2) * 1.75);
  const blend = Math.max(0.05, finite(profile.blendDistance, 2.5));
  return {
    halfRoad,
    shoulder,
    ditch,
    blend,
    shoulderEdge: halfRoad + shoulder,
    ditchEdge: halfRoad + shoulder + ditch,
    outerEdge: halfRoad + shoulder + ditch + blend
  };
}

function terrainModeApplies(mode, profile) {
  if (profile?.terrainModificationEnabled === false) return false;
  return !['bridge', 'tunnel', 'invalid'].includes(mode);
}

function constructionEntry(segment, sample, next, pairIndex) {
  const profile = segment.crossSectionProfile;
  const extents = profileExtents(profile);
  const padding = extents.outerEdge + 0.05;
  const construction = (segment.constructionIntervals || []).find(interval => (
    pairIndex >= interval.startSampleIndex && pairIndex < interval.endSampleIndex
  )) || segment.construction;
  return {
    id: `${segment.id}:${pairIndex}`,
    segmentId: segment.id,
    pairIndex,
    start: sample,
    end: next,
    profile,
    extents,
    construction,
    bounds: {
      minX: Math.min(sample.position[0], next.position[0]) - padding,
      maxX: Math.max(sample.position[0], next.position[0]) + padding,
      minZ: Math.min(sample.position[2], next.position[2]) - padding,
      maxZ: Math.max(sample.position[2], next.position[2]) + padding
    }
  };
}

function materialWeights(zone, influence) {
  const weights = { terrain: 1, road: 0, shoulder: 0, earthwork: 0 };
  if (zone === 'road') {
    weights.terrain = 0;
    weights.road = 1;
  } else if (zone === 'shoulder') {
    weights.terrain = 0;
    weights.shoulder = 1;
  } else if (zone === 'ditch') {
    weights.terrain = 0;
    weights.earthwork = 1;
  } else if (zone === 'blend') {
    weights.terrain = 1 - influence;
    weights.earthwork = influence;
  }
  return weights;
}

function sampleEntry(entry, x, z, baseHeight, engineering) {
  const nearest = pointSegment2(x, z, entry.start.position, entry.end.position);
  // Perpendicular distance is valid only while the closest point lies inside
  // the segment. At a clamped endpoint it becomes zero for the entire tangent
  // extension, which previously projected road material and terrain work far
  // beyond dead ends. The true closest-point distance produces the intended
  // bounded capsule and is identical to |lateral| within the segment.
  const lateral = nearest.distance;
  if (lateral > entry.extents.outerEdge + EPSILON) return null;

  const centerY = lerp(entry.start.position[1], entry.end.position[1], nearest.t);
  const extents = entry.extents;
  const profile = entry.profile;
  const crown = finite(profile.crownHeight, 0.06);
  const shoulderDrop = finite(profile.shoulderDrop, 0.08);
  const ditchDepth = profile.drainageEnabled === false ? 0 : finite(profile.ditchDepth, 0.2);
  let zone = 'road';
  let targetHeight = centerY;
  let influence = 1;

  if (lateral <= extents.halfRoad) {
    const crownWeight = 1 - lateral / Math.max(EPSILON, extents.halfRoad);
    targetHeight = centerY + crown * crownWeight;
  } else if (lateral <= extents.shoulderEdge) {
    zone = 'shoulder';
    const shoulderT = (lateral - extents.halfRoad) / Math.max(EPSILON, extents.shoulder);
    targetHeight = centerY - shoulderDrop * shoulderT;
  } else if (lateral <= extents.ditchEdge) {
    zone = 'ditch';
    const ditchT = (lateral - extents.shoulderEdge) / Math.max(EPSILON, extents.ditch);
    targetHeight = centerY - shoulderDrop - Math.sin(Math.PI * ditchT) * ditchDepth;
  } else {
    zone = 'blend';
    const blendT = (lateral - extents.ditchEdge) / Math.max(EPSILON, extents.blend);
    influence = 1 - smoothstep(0, 1, blendT);
    targetHeight = centerY - shoulderDrop;
  }

  const mode = entry.construction.mode;
  const applies = terrainModeApplies(mode, profile);
  const maxCut = Math.max(0, finite(engineering.maxCutDepth, 6));
  const maxFill = Math.max(0, finite(engineering.maxFillDepth, 2.5));
  // The compiled road, shoulder, and earthwork meshes are the authoritative
  // visible/collision/navigation surface. The terrain modifier is their
  // support underlay. Separating those surfaces prevents coplanar z-fighting
  // without changing the authored construction elevation or the untouched
  // terrain at the feathered outer boundary.
  const terrainUnderlayClearance = clamp(profile.terrainUnderlayClearance ?? 0.04, 0.005, 0.25);
  const underlayWeight = zone === 'blend' ? influence : 1;
  // Reserve the underlay separation inside the configured cut budget. The
  // support terrain therefore never exceeds maxCutDepth merely to make room
  // for the visible road surface.
  const boundedTarget = clamp(
    targetHeight,
    baseHeight - maxCut + terrainUnderlayClearance * underlayWeight,
    baseHeight + maxFill
  );
  const supportHeight = boundedTarget - terrainUnderlayClearance * underlayWeight;
  const height = applies ? lerp(baseHeight, supportHeight, influence) : baseHeight;
  return {
    entryId: entry.id,
    segmentId: entry.segmentId,
    constructionMode: mode,
    constructionReason: entry.construction.reason,
    terrainApplied: applies,
    signedDistance: lateral - extents.halfRoad,
    lateralDistance: lateral,
    normalizedLateral: nearest.lateral / Math.max(EPSILON, extents.outerEdge),
    center: [nearest.x, centerY, nearest.z],
    baseHeight,
    targetHeight: boundedTarget,
    supportHeight,
    terrainUnderlayClearance: applies ? terrainUnderlayClearance * underlayWeight : 0,
    height,
    influence: applies ? influence : 0,
    zone,
    materialWeights: applies
      ? materialWeights(zone, influence)
      : { terrain: 1, road: 0, shoulder: 0, earthwork: 0 }
  };
}

function entriesForPoint(modifier, x, z) {
  return modifier.chunks.get(chunkKey(
    chunkCoordinate(x, modifier.chunkSize),
    chunkCoordinate(z, modifier.chunkSize)
  )) || [];
}

function nearestEntrySample(modifier, x, z, baseHeight) {
  let nearest = null;
  for (const entry of entriesForPoint(modifier, x, z)) {
    const sample = sampleEntry(entry, x, z, baseHeight, modifier.engineering);
    if (!sample) continue;
    if (
      !nearest
      || sample.lateralDistance < nearest.lateralDistance - EPSILON
      || (
        Math.abs(sample.lateralDistance - nearest.lateralDistance) <= EPSILON
        && sample.segmentId.localeCompare(nearest.segmentId) < 0
      )
    ) nearest = sample;
  }
  return nearest;
}

function constructionAtDistance(segment, distance) {
  const intervals = segment.constructionIntervals || [];
  return intervals.find(interval => (
    distance >= interval.startDistance - EPSILON
    && distance <= interval.endDistance + EPSILON
  )) || segment.construction;
}

function crossSectionForSample(segment, sample, baseHeightAt) {
  const profile = segment.crossSectionProfile;
  const extents = profileExtents(profile);
  const side = sample.side;
  const point = distance => [
    sample.position[0] + side[0] * distance,
    sample.position[1] + side[1] * distance,
    sample.position[2] + side[2] * distance
  ];
  const roadLeft = point(-extents.halfRoad);
  const roadRight = point(extents.halfRoad);
  const roadCenter = [
    sample.position[0] + sample.normal[0] * finite(profile.crownHeight, 0.08),
    sample.position[1] + sample.normal[1] * finite(profile.crownHeight, 0.08),
    sample.position[2] + sample.normal[2] * finite(profile.crownHeight, 0.08)
  ];
  const shoulderLeft = point(-extents.shoulderEdge);
  const shoulderRight = point(extents.shoulderEdge);
  shoulderLeft[1] -= finite(profile.shoulderDrop, 0.08);
  shoulderRight[1] -= finite(profile.shoulderDrop, 0.08);
  const terrainShoulderLeft = [
    shoulderLeft[0],
    finite(baseHeightAt(shoulderLeft[0], shoulderLeft[2]), shoulderLeft[1]),
    shoulderLeft[2]
  ];
  const terrainShoulderRight = [
    shoulderRight[0],
    finite(baseHeightAt(shoulderRight[0], shoulderRight[2]), shoulderRight[1]),
    shoulderRight[2]
  ];
  const outerLeft = point(-extents.outerEdge);
  const outerRight = point(extents.outerEdge);
  outerLeft[1] = finite(baseHeightAt(outerLeft[0], outerLeft[2]), outerLeft[1]);
  outerRight[1] = finite(baseHeightAt(outerRight[0], outerRight[2]), outerRight[1]);
  return {
    segmentId: segment.id,
    distance: sample.distance,
    center: [...sample.position],
    construction: constructionAtDistance(segment, sample.distance),
    roadLeft,
    roadCenter,
    roadRight,
    shoulderLeft,
    shoulderRight,
    terrainShoulderLeft,
    terrainShoulderRight,
    outerLeft,
    outerRight,
    outerBoundaryKeys: [
      `${segment.id}:${sample.distance.toFixed(5)}:left`,
      `${segment.id}:${sample.distance.toFixed(5)}:right`
    ]
  };
}

export function compilePathTerrainModifier(compiled, options = {}) {
  if (!compiled?.diagnostics) throw new Error('A compiled path network is required.');
  const baseHeightAt = typeof options.baseHeightAt === 'function' ? options.baseHeightAt : () => 0;
  const chunkSize = clamp(options.chunkSize ?? 64, 4, 4096);
  const chunks = new Map();
  const entries = [];
  const crossSections = [];
  const boundaryVertices = new Map();

  for (const segment of compiled.segments || []) {
    for (let index = 0; index < segment.samples.length - 1; index += 1) {
      const entry = constructionEntry(segment, segment.samples[index], segment.samples[index + 1], index);
      entries.push(entry);
      addEntryToChunks(chunks, entry, chunkSize);
    }
    for (const sample of segment.samples) {
      const crossSection = crossSectionForSample(segment, sample, baseHeightAt);
      crossSections.push(crossSection);
      boundaryVertices.set(crossSection.outerBoundaryKeys[0], crossSection.outerLeft);
      boundaryVertices.set(crossSection.outerBoundaryKeys[1], crossSection.outerRight);
    }
  }

  return {
    schemaVersion: 1,
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: compiled.generationRevision,
    chunkSize,
    engineering: {
      maxCutDepth: finite(compiled.engineering?.maxCutDepth, 6),
      maxFillDepth: finite(compiled.engineering?.maxFillDepth, 2.5)
    },
    entries,
    chunks,
    dirtyChunkKeys: [...chunks.keys()].sort(),
    crossSections,
    boundaryVertices,
    baseHeightAt,
    diagnostics: {
      entryCount: entries.length,
      dirtyChunkCount: chunks.size,
      crossSectionCount: crossSections.length,
      boundaryVertexCount: boundaryVertices.size
    }
  };
}

export function samplePathTerrainModifier(modifier, x, z) {
  if (!modifier?.chunks || typeof modifier.baseHeightAt !== 'function') {
    throw new Error('A compiled path terrain modifier is required.');
  }
  const baseHeight = finite(modifier.baseHeightAt(x, z), 0);
  const nearest = nearestEntrySample(modifier, x, z, baseHeight);
  if (nearest) return nearest;
  return {
    entryId: null,
    segmentId: null,
    constructionMode: null,
    constructionReason: null,
    terrainApplied: false,
    signedDistance: Infinity,
    lateralDistance: Infinity,
    normalizedLateral: Infinity,
    center: null,
    baseHeight,
    targetHeight: baseHeight,
    height: baseHeight,
    influence: 0,
    zone: 'terrain',
    materialWeights: { terrain: 1, road: 0, shoulder: 0, earthwork: 0 }
  };
}

export function pathTerrainHeightAt(modifier, x, z) {
  return samplePathTerrainModifier(modifier, x, z).height;
}

export function pathTerrainNormalAt(modifier, x, z, step = 0.35) {
  const distance = Math.max(0.01, finite(step, 0.35));
  const left = pathTerrainHeightAt(modifier, x - distance, z);
  const right = pathTerrainHeightAt(modifier, x + distance, z);
  const down = pathTerrainHeightAt(modifier, x, z - distance);
  const up = pathTerrainHeightAt(modifier, x, z + distance);
  const normal = [left - right, distance * 2, down - up];
  const length = Math.hypot(...normal) || 1;
  return normal.map(value => value / length);
}

export function pathTerrainDistanceAt(modifier, x, z) {
  return samplePathTerrainModifier(modifier, x, z).signedDistance;
}
