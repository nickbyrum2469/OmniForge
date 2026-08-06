import {
  pathCrossSectionLayout,
  samplePathCrossSection
} from './cross-section-profiles.js';
import {
  bridgeCrossSectionState,
  resolveBridgeProfile
} from './bridge-profiles.js';
import { compilePathJunctionAuthority } from './geometry.js';

const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (minimum, maximum, value) => {
  const amount = clamp((value - minimum) / Math.max(EPSILON, maximum - minimum), 0, 1);
  return amount * amount * (3 - 2 * amount);
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

function addBoundsToChunks(chunks, entry, bounds, chunkSize) {
  const minimumX = chunkCoordinate(bounds.minX, chunkSize);
  const maximumX = chunkCoordinate(bounds.maxX, chunkSize);
  const minimumZ = chunkCoordinate(bounds.minZ, chunkSize);
  const maximumZ = chunkCoordinate(bounds.maxZ, chunkSize);
  for (let x = minimumX; x <= maximumX; x += 1) {
    for (let z = minimumZ; z <= maximumZ; z += 1) {
      const key = chunkKey(x, z);
      if (!chunks.has(key)) chunks.set(key, []);
      const entries = chunks.get(key);
      if (!entries.includes(entry)) entries.push(entry);
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

function triangleBarycentricXZ(x, z, a, b, c) {
  const denominator = (b[2] - c[2]) * (a[0] - c[0])
    + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(denominator) <= EPSILON) return null;
  const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
  const wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
  const wc = 1 - wa - wb;
  if (wa < -EPSILON || wb < -EPSILON || wc < -EPSILON) return null;
  return [wa, wb, wc];
}

function pointInRingXZ(ring, x, z) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const intersects = ((a[2] > z) !== (b[2] > z))
      && x < (b[0] - a[0]) * (z - a[2]) / (b[2] - a[2]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function ringBoundaryDistance(ring, x, z) {
  let distance = Infinity;
  let nearest = null;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const sample = pointSegment2(x, z, a, b);
    if (sample.distance < distance) {
      distance = sample.distance;
      nearest = [sample.x, sample.z];
    }
  }
  return { distance, nearest };
}

function junctionSurfaceHeight(entry, x, z) {
  for (let offset = 0; offset < entry.triangles.length; offset += 3) {
    const a = entry.ring[entry.triangles[offset]];
    const b = entry.ring[entry.triangles[offset + 1]];
    const c = entry.ring[entry.triangles[offset + 2]];
    const weights = triangleBarycentricXZ(x, z, a, b, c);
    if (weights) return a[1] * weights[0] + b[1] * weights[1] + c[1] * weights[2];
  }
  // Boundary precision may place a sample a few ulps outside every triangle.
  // A deterministic inverse-distance interpolation keeps the underlay finite
  // while the signed ring test remains the ownership gate.
  let weighted = 0;
  let total = 0;
  for (const point of entry.ring) {
    const weight = 1 / Math.max(0.0001, Math.hypot(x - point[0], z - point[2]));
    weighted += point[1] * weight;
    total += weight;
  }
  return total > EPSILON ? weighted / total : finite(entry.position?.[1]);
}

function profileExtents(profile) {
  const layout = pathCrossSectionLayout(profile);
  return {
    layout,
    halfRoad: layout.halfRoad,
    shoulder: Math.max(layout.left.shoulderWidth, layout.right.shoulderWidth),
    ditch: Math.max(layout.left.ditchWidth, layout.right.ditchWidth),
    blend: Math.max(layout.left.blendWidth, layout.right.blendWidth),
    shoulderEdge: Math.max(layout.left.shoulderEdge, layout.right.shoulderEdge),
    ditchEdge: Math.max(layout.left.ditchEdge, layout.right.ditchEdge),
    outerEdge: layout.maximumOuterEdge,
    leftOuterEdge: layout.left.outerEdge,
    rightOuterEdge: layout.right.outerEdge
  };
}

function terrainModeApplies(mode, profile) {
  if (profile?.terrainModificationEnabled === false) return false;
  return !['bridge', 'tunnel', 'invalid'].includes(mode);
}

function constructionEntry(segment, sample, next, pairIndex, bridgeProfiles) {
  const profile = segment.crossSectionProfile;
  const bridgeAuthorities = [...bridgeProfiles.values()];
  const startBridgeState = bridgeCrossSectionState(profile, sample.distance, bridgeAuthorities);
  const endBridgeState = bridgeCrossSectionState(profile, next.distance, bridgeAuthorities);
  const extents = profileExtents(profile);
  const maximumOuterEdge = Math.max(
    extents.outerEdge,
    startBridgeState.maximumOuterEdge,
    endBridgeState.maximumOuterEdge,
    startBridgeState.exclusionHalfWidth,
    endBridgeState.exclusionHalfWidth
  );
  const effectiveExtents = {
    ...extents,
    leftOuterEdge: Math.max(extents.leftOuterEdge, startBridgeState.leftOuterEdge, endBridgeState.leftOuterEdge),
    rightOuterEdge: Math.max(extents.rightOuterEdge, startBridgeState.rightOuterEdge, endBridgeState.rightOuterEdge),
    outerEdge: maximumOuterEdge
  };
  const padding = maximumOuterEdge + 0.05;
  const construction = (segment.constructionIntervals || []).find(interval => (
    pairIndex >= interval.startSampleIndex && pairIndex < interval.endSampleIndex
  )) || segment.construction;
  const bridgeAuthority = construction.mode === 'bridge'
    ? bridgeProfiles.get(construction) || null
    : null;
  const bridgeProfile = bridgeAuthority?.profile || null;
  const bridgeSeatLength = finite(bridgeProfile?.terrainAbutmentSeatLength, 0);
  const bridgeExclusionHalfWidth = bridgeProfile
    ? finite(bridgeProfile.deckWidth, profile.width) * 0.5
      + Math.max(0.25, finite(bridgeProfile.deckEdgeOverhang, 0.25))
    : 0;
  return {
    id: `${segment.id}:${pairIndex}`,
    segmentId: segment.id,
    pairIndex,
    start: sample,
    end: next,
    profile,
    extents,
    effectiveExtents,
    construction,
    intervalStartDistance: finite(construction.startDistance, sample.distance),
    intervalEndDistance: finite(construction.endDistance, next.distance),
    bridgeProfile,
    bridgeAuthority,
    bridgeAuthorities,
    startBridgeState,
    endBridgeState,
    bridgeSeatLength,
    bridgeExclusionHalfWidth,
    bounds: {
      minX: Math.min(sample.position[0], next.position[0]) - padding,
      maxX: Math.max(sample.position[0], next.position[0]) + padding,
      minZ: Math.min(sample.position[2], next.position[2]) - padding,
      maxZ: Math.max(sample.position[2], next.position[2]) + padding
    }
  };
}

function crossSectionsForInterval(sections, interval) {
  const startDistance = finite(interval?.startDistance, sections[0]?.distance);
  const endDistance = finite(interval?.endDistance, sections.at(-1)?.distance);
  return sections.filter(section => (
    section.distance >= startDistance - EPSILON
    && section.distance <= endDistance + EPSILON
  ));
}

function resolveBridgeIntervals(segment, sections, baseHeightAt) {
  const profiles = new Map();
  for (const interval of segment.constructionIntervals || []) {
    if (interval.mode !== 'bridge') continue;
    const intervalSections = crossSectionsForInterval(sections, interval);
    const profile = resolveBridgeProfile(
      { ...segment, construction: interval },
      intervalSections,
      baseHeightAt
    );
    const span = Math.max(0, finite(interval.endDistance) - finite(interval.startDistance));
    const width = Math.max(0.1, finite(segment.crossSectionProfile?.width, 3));
    // A portal seat may support the abutment, but it may never turn a short
    // bridge back into a terrain causeway. Keep a deliberate open interval in
    // the middle even when a family authors unusually long seats.
    const minimumOpenSpan = Math.min(span, Math.max(
      0.5,
      Math.min(width * 0.5, span * 0.2)
    ));
    const maximumSeatLength = Math.max(0, (span - minimumOpenSpan) * 0.5);
    profiles.set(interval, {
      interval,
      startDistance: finite(interval.startDistance),
      endDistance: finite(interval.endDistance),
      profile: {
        ...profile,
        terrainAbutmentSeatLength: clamp(
          finite(profile.abutmentSeatLength, 0),
          0,
          maximumSeatLength
        ),
        minimumOpenTerrainSpan: minimumOpenSpan
      }
    });
  }
  return profiles;
}

function entryRangeBounds(entry, startDistance, endDistance) {
  const entryStart = finite(entry.start.distance);
  const entryEnd = finite(entry.end.distance, entryStart);
  const length = Math.max(EPSILON, entryEnd - entryStart);
  const rangeStart = clamp(startDistance, entryStart, entryEnd);
  const rangeEnd = clamp(endDistance, entryStart, entryEnd);
  if (rangeEnd < rangeStart + EPSILON) return null;
  const startT = clamp((rangeStart - entryStart) / length, 0, 1);
  const endT = clamp((rangeEnd - entryStart) / length, 0, 1);
  const start = [
    lerp(entry.start.position[0], entry.end.position[0], startT),
    0,
    lerp(entry.start.position[2], entry.end.position[2], startT)
  ];
  const end = [
    lerp(entry.start.position[0], entry.end.position[0], endT),
    0,
    lerp(entry.start.position[2], entry.end.position[2], endT)
  ];
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const directionLength = Math.hypot(dx, dz)
    || Math.hypot(
      entry.end.position[0] - entry.start.position[0],
      entry.end.position[2] - entry.start.position[2]
    )
    || 1;
  const sideX = -(Math.abs(dx) + Math.abs(dz) > EPSILON
    ? dz
    : entry.end.position[2] - entry.start.position[2]) / directionLength;
  const sideZ = (Math.abs(dx) + Math.abs(dz) > EPSILON
    ? dx
    : entry.end.position[0] - entry.start.position[0]) / directionLength;
  const padding = 0.05;
  const points = [start, end].flatMap(point => ([
    [
      point[0] - sideX * entry.effectiveExtents.leftOuterEdge,
      point[2] - sideZ * entry.effectiveExtents.leftOuterEdge
    ],
    [
      point[0] + sideX * entry.effectiveExtents.rightOuterEdge,
      point[2] + sideZ * entry.effectiveExtents.rightOuterEdge
    ]
  ]));
  return {
    minX: Math.min(...points.map(point => point[0])) - padding,
    maxX: Math.max(...points.map(point => point[0])) + padding,
    minZ: Math.min(...points.map(point => point[1])) - padding,
    maxZ: Math.max(...points.map(point => point[1])) + padding
  };
}

function terrainRangesForEntry(entry) {
  const mode = entry.construction.mode;
  if (terrainModeApplies(mode, entry.profile)) {
    return [[entry.start.distance, entry.end.distance]];
  }
  if (mode !== 'bridge' || entry.bridgeSeatLength <= EPSILON) return [];
  const ranges = [];
  const candidates = [
    [entry.intervalStartDistance, entry.intervalStartDistance + entry.bridgeSeatLength],
    [entry.intervalEndDistance - entry.bridgeSeatLength, entry.intervalEndDistance]
  ];
  for (const [candidateStart, candidateEnd] of candidates) {
    const start = Math.max(entry.start.distance, candidateStart);
    const end = Math.min(entry.end.distance, candidateEnd);
    if (end > start + EPSILON) ranges.push([start, end]);
  }
  return ranges;
}

function materialWeights(zone, influence) {
  const weights = {
    terrain: 1,
    road: 0,
    shoulder: 0,
    gutter: 0,
    curb: 0,
    sidewalk: 0,
    earthwork: 0
  };
  if (zone === 'road') {
    weights.terrain = 0;
    weights.road = 1;
  } else if (zone === 'shoulder') {
    weights.terrain = 0;
    weights.shoulder = 1;
  } else if (zone === 'gutter') {
    weights.terrain = 0;
    weights.gutter = 1;
  } else if (zone === 'curb') {
    weights.terrain = 0;
    weights.curb = 1;
  } else if (zone === 'sidewalk') {
    weights.terrain = 0;
    weights.sidewalk = 1;
  } else if (zone === 'ditch') {
    weights.terrain = 0;
    weights.earthwork = 1;
  } else if (zone === 'blend') {
    weights.terrain = 1 - influence;
    weights.earthwork = influence;
  }
  return weights;
}

function profileAtBridgeState(profile, state) {
  const scale = clamp(state?.accessoryScale ?? 1, 0, 1);
  if (Math.abs(scale - 1) <= EPSILON && Math.abs(finite(state?.roadWidth, profile.width) - profile.width) <= EPSILON) {
    return profile;
  }
  return {
    ...profile,
    width: Math.max(0.1, finite(state?.roadWidth, profile.width)),
    shoulderWidth: finite(profile.shoulderWidth) * scale,
    shoulderDrop: finite(profile.shoulderDrop) * scale,
    gutterWidth: finite(profile.gutterWidth) * scale,
    gutterDepth: finite(profile.gutterDepth) * scale,
    curbWidth: finite(profile.curbWidth) * scale,
    curbHeight: finite(profile.curbHeight) * scale,
    sidewalkLeftWidth: finite(profile.sidewalkLeftWidth) * scale,
    sidewalkRightWidth: finite(profile.sidewalkRightWidth) * scale,
    sidewalkHeight: finite(profile.sidewalkHeight) * scale,
    ditchDepth: finite(profile.ditchDepth) * scale,
    blendDistance: Math.max(0.05, finite(profile.blendDistance, 2.5) * Math.max(0.02, scale))
  };
}

function sampleBridgeAwareCrossSection(profile, bridgeState, signedLateral) {
  const effectiveProfile = profileAtBridgeState(profile, bridgeState);
  const effectiveLayout = pathCrossSectionLayout(effectiveProfile);
  const lateral = Math.abs(finite(signedLateral));
  const sideSign = signedLateral < 0 ? -1 : 1;
  const canonicalRoadEdge = Math.max(0.05, finite(
    bridgeState?.roadHalfWidth,
    effectiveLayout.halfRoad
  ));
  const canonicalOuterEdge = Math.max(
    canonicalRoadEdge,
    finite(
      sideSign < 0 ? bridgeState?.leftOuterEdge : bridgeState?.rightOuterEdge,
      sideSign < 0 ? effectiveLayout.left.outerEdge : effectiveLayout.right.outerEdge
    )
  );
  if (lateral > canonicalOuterEdge + EPSILON) return null;

  // The cross-section sampler owns the authored shoulder/gutter/ditch shape,
  // while bridgeCrossSectionState owns the exact physical width. Map only the
  // accessory band between those two authorities. This preserves the road
  // edge exactly and guarantees that the last terrain-support sample lands on
  // the same tapered outer boundary used by rendering and foliage exclusion.
  let effectiveLateral = lateral;
  if (lateral > canonicalRoadEdge + EPSILON) {
    const effectiveSide = sideSign < 0 ? effectiveLayout.left : effectiveLayout.right;
    const canonicalAccessory = canonicalOuterEdge - canonicalRoadEdge;
    const effectiveAccessory = effectiveSide.outerEdge - effectiveLayout.halfRoad;
    const amount = canonicalAccessory > EPSILON
      ? clamp((lateral - canonicalRoadEdge) / canonicalAccessory, 0, 1)
      : 1;
    effectiveLateral = effectiveLayout.halfRoad + effectiveAccessory * amount;
  }
  return samplePathCrossSection(effectiveProfile, effectiveLateral * sideSign);
}

function sampleEntry(entry, x, z, baseHeight, engineering) {
  const nearest = pointSegment2(x, z, entry.start.position, entry.end.position);
  // Perpendicular distance is valid only while the closest point lies inside
  // the segment. At a clamped endpoint it becomes zero for the entire tangent
  // extension, which previously projected road material and terrain work far
  // beyond dead ends. The true closest-point distance produces the intended
  // bounded capsule and is identical to |lateral| within the segment.
  const lateral = nearest.distance;
  const signedLateral = (nearest.lateral < 0 ? -1 : 1) * lateral;
  const stationDistance = lerp(entry.start.distance, entry.end.distance, nearest.t);
  const bridgeState = bridgeCrossSectionState(
    entry.profile,
    stationDistance,
    entry.bridgeAuthorities
  );
  const crossSection = sampleBridgeAwareCrossSection(entry.profile, bridgeState, signedLateral);
  if (!crossSection) return null;

  const centerY = lerp(entry.start.position[1], entry.end.position[1], nearest.t);
  const extents = entry.extents;
  const profile = entry.profile;
  const zone = crossSection.zone;
  const targetHeight = centerY + crossSection.heightOffset;
  const influence = crossSection.influence;

  const mode = entry.construction.mode;
  const distanceFromIntervalStart = Math.max(0, stationDistance - entry.intervalStartDistance);
  const distanceFromIntervalEnd = Math.max(0, entry.intervalEndDistance - stationDistance);
  const bridgeSeatWeight = mode === 'bridge' && entry.bridgeSeatLength > EPSILON
    ? Math.max(
      1 - smoothstep(0, entry.bridgeSeatLength, distanceFromIntervalStart),
      1 - smoothstep(0, entry.bridgeSeatLength, distanceFromIntervalEnd)
    )
    : 0;
  const longitudinalSupportWeight = mode === 'bridge' ? bridgeSeatWeight : 1;
  const applies = terrainModeApplies(mode, profile) || bridgeSeatWeight > EPSILON;
  const maxCut = Math.max(0, finite(engineering.maxCutDepth, 6));
  const maxFill = Math.max(0, finite(engineering.maxFillDepth, 2.5));
  // The compiled road, shoulder, and earthwork meshes are the authoritative
  // visible/collision/navigation surface. The terrain modifier is their
  // support underlay. Separating those surfaces prevents coplanar z-fighting
  // without changing the authored construction elevation or the untouched
  // terrain at the feathered outer boundary.
  const terrainUnderlayClearance = clamp(profile.terrainUnderlayClearance ?? 0.04, 0.005, 0.25);
  const effectiveInfluence = influence * longitudinalSupportWeight;
  const underlayWeight = (zone === 'blend' ? influence : 1) * longitudinalSupportWeight;
  // Reserve the underlay separation inside the configured cut budget. The
  // support terrain therefore never exceeds maxCutDepth merely to make room
  // for the visible road surface.
  const boundedTarget = clamp(
    targetHeight,
    baseHeight - maxCut + terrainUnderlayClearance * underlayWeight,
    baseHeight + maxFill
  );
  const supportHeight = boundedTarget - terrainUnderlayClearance * underlayWeight;
  const height = applies ? lerp(baseHeight, supportHeight, effectiveInfluence) : baseHeight;
  return {
    entryId: entry.id,
    segmentId: entry.segmentId,
    constructionMode: mode,
    constructionReason: entry.construction.reason,
    terrainApplied: applies,
    signedDistance: crossSection.signedDistance,
    lateralDistance: lateral,
    normalizedLateral: nearest.lateral / Math.max(EPSILON, crossSection.side.outerEdge),
    center: [nearest.x, centerY, nearest.z],
    baseHeight,
    // The authored cross-section is the surface that objects, characters,
    // collision, and navigation stand on. targetHeight remains the bounded
    // terrain-support target so a bridge deck or tunnel floor is never
    // mistaken for the terrain beneath/above it.
    surfaceHeight: targetHeight,
    targetHeight: boundedTarget,
    supportHeight,
    terrainUnderlayClearance: applies ? terrainUnderlayClearance * underlayWeight : 0,
    roadWidth: bridgeState.roadWidth,
    surfaceDetailRoadWidth: bridgeState.surfaceDetailRoadWidth,
    accessoryScale: bridgeState.accessoryScale,
    exclusionHalfWidth: bridgeState.exclusionHalfWidth,
    bridgeTaperAmount: bridgeState.amount,
    height,
    longitudinalSupportWeight,
    influence: applies ? effectiveInfluence : 0,
    zone,
    materialWeights: applies
      ? materialWeights(zone, effectiveInfluence)
      : {
          terrain: 1,
          road: 0,
          shoulder: 0,
          gutter: 0,
          curb: 0,
          sidewalk: 0,
          earthwork: 0
        }
  };
}

function entriesForPoint(modifier, x, z) {
  return modifier.chunks.get(chunkKey(
    chunkCoordinate(x, modifier.chunkSize),
    chunkCoordinate(z, modifier.chunkSize)
  )) || [];
}

function sampleJunctionEntry(entry, x, z, baseHeight, engineering) {
  if (!pointInRingXZ(entry.ring, x, z)) return null;
  const boundary = ringBoundaryDistance(entry.ring, x, z);
  const surfaceHeight = junctionSurfaceHeight(entry, x, z);
  const maxCut = Math.max(0, finite(engineering.maxCutDepth, 6));
  const maxFill = Math.max(0, finite(engineering.maxFillDepth, 2.5));
  const clearance = clamp(entry.terrainUnderlayClearance, 0.005, 0.25);
  const targetHeight = clamp(
    surfaceHeight,
    baseHeight - maxCut + clearance,
    baseHeight + maxFill
  );
  const supportHeight = targetHeight - clearance;
  return {
    entryId: entry.id,
    segmentId: null,
    junctionNodeId: entry.nodeId,
    constructionMode: 'junction',
    constructionReason: entry.construction.reason,
    terrainApplied: true,
    signedDistance: -boundary.distance,
    lateralDistance: 0,
    normalizedLateral: 0,
    center: [x, surfaceHeight, z],
    baseHeight,
    surfaceHeight,
    targetHeight,
    supportHeight,
    terrainUnderlayClearance: clearance,
    height: supportHeight,
    longitudinalSupportWeight: 1,
    influence: 1,
    zone: 'road',
    roadWidth: null,
    surfaceDetailRoadWidth: null,
    accessoryScale: 1,
    exclusionHalfWidth: 0,
    bridgeTaperAmount: 0,
    materialWeights: materialWeights('road', 1)
  };
}

function nearestEntrySample(modifier, x, z, baseHeight) {
  let nearest = null;
  for (const entry of entriesForPoint(modifier, x, z)) {
    const sample = entry.kind === 'junction'
      ? sampleJunctionEntry(entry, x, z, baseHeight, modifier.engineering)
      : sampleEntry(entry, x, z, baseHeight, modifier.engineering);
    if (!sample) continue;
    const samplePriority = sample.constructionMode === 'junction' ? 0 : 1;
    const nearestPriority = nearest?.constructionMode === 'junction' ? 0 : 1;
    if (
      !nearest
      || samplePriority < nearestPriority
      || (
        samplePriority === nearestPriority
        && sample.lateralDistance < nearest.lateralDistance - EPSILON
      )
      || (
        samplePriority === nearestPriority
        &&
        Math.abs(sample.lateralDistance - nearest.lateralDistance) <= EPSILON
        && String(sample.entryId).localeCompare(String(nearest.entryId)) < 0
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

function horizontalSide(sample) {
  const authored = Array.isArray(sample?.side) ? sample.side : [0, 0, 0];
  let x = finite(authored[0]);
  let z = finite(authored[2]);
  let length = Math.hypot(x, z);
  if (length <= EPSILON) {
    const tangent = Array.isArray(sample?.tangent) ? sample.tangent : [0, 0, 1];
    x = -finite(tangent[2], 1);
    z = finite(tangent[0]);
    length = Math.hypot(x, z);
  }
  return length > EPSILON ? [x / length, 0, z / length] : [1, 0, 0];
}

function stationPoint(sample, signedDistance, heightOffset = 0) {
  const side = horizontalSide(sample);
  return [
    sample.position[0] + side[0] * signedDistance,
    sample.position[1] + finite(heightOffset),
    sample.position[2] + side[2] * signedDistance
  ];
}

function crossSectionForSample(segment, sample, baseHeightAt, bridgeAuthorities = []) {
  const authoredProfile = segment.crossSectionProfile;
  const bridgeState = bridgeCrossSectionState(authoredProfile, sample.distance, bridgeAuthorities);
  const profile = profileAtBridgeState(authoredProfile, bridgeState);
  const extents = profileExtents(profile);
  const layout = extents.layout;
  // Geometry, terrain support, collision, navigation, and bridge portals all
  // use a horizontal cross-road axis with profile elevations in world Y.
  // Applying crown/curb offsets along a transported surface normal shifts X/Z
  // on grades and creates the visible road-to-bridge and terrain seams.
  const point = (distance, heightOffset = 0) => stationPoint(sample, distance, heightOffset);
  const roadLeft = point(-extents.halfRoad);
  const roadRight = point(extents.halfRoad);
  const roadCenter = point(0, finite(profile.crownHeight, 0.08));
  const shoulderLeft = point(-layout.left.shoulderEdge, layout.left.shoulderOuterHeight);
  const shoulderRight = point(layout.right.shoulderEdge, layout.right.shoulderOuterHeight);
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
  const outerLeft = point(-bridgeState.leftOuterEdge);
  const outerRight = point(bridgeState.rightOuterEdge);
  outerLeft[1] = finite(baseHeightAt(outerLeft[0], outerLeft[2]), outerLeft[1]);
  outerRight[1] = finite(baseHeightAt(outerRight[0], outerRight[2]), outerRight[1]);
  return {
    segmentId: segment.id,
    distance: sample.distance,
    center: [...sample.position],
    construction: constructionAtDistance(segment, sample.distance),
    bridgeState,
    roadWidth: bridgeState.roadWidth,
    surfaceDetailRoadWidth: bridgeState.surfaceDetailRoadWidth,
    accessoryScale: bridgeState.accessoryScale,
    roadLeft,
    roadCenter,
    roadRight,
    layout,
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

function terrainJunctionEntry(junction, compiled) {
  if (junction.error || junction.ring.length < 3 || junction.triangles.length < 3) return null;
  const clearance = Math.max(
    0.005,
    ...junction.portals.map(portal => finite(portal.crossSectionProfile?.terrainUnderlayClearance, 0.04))
  );
  const boundsPadding = 0.05;
  return {
    id: `junction:${junction.nodeId}`,
    kind: 'junction',
    nodeId: junction.nodeId,
    position: [...junction.position],
    ring: junction.ring.map(point => [...point]),
    triangles: [...junction.triangles],
    portals: junction.portals,
    construction: {
      mode: 'junction',
      reason: 'validated-shared-junction-polygon',
      automatic: true
    },
    terrainUnderlayClearance: clearance,
    bounds: {
      minX: Math.min(...junction.ring.map(point => point[0])) - boundsPadding,
      maxX: Math.max(...junction.ring.map(point => point[0])) + boundsPadding,
      minZ: Math.min(...junction.ring.map(point => point[2])) - boundsPadding,
      maxZ: Math.max(...junction.ring.map(point => point[2])) + boundsPadding
    },
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: compiled.generationRevision
  };
}

export function compilePathTerrainModifier(compiled, options = {}) {
  if (!compiled?.diagnostics) throw new Error('A compiled path network is required.');
  const baseHeightAt = typeof options.baseHeightAt === 'function' ? options.baseHeightAt : () => 0;
  const chunkSize = clamp(options.chunkSize ?? 64, 4, 4096);
  const chunks = new Map();
  const terrainChunks = new Map();
  const entries = [];
  const terrainEntries = [];
  const crossSections = [];
  const boundaryVertices = new Map();
  let bridgeIntervalCount = 0;
  let bridgeSeatEntryCount = 0;
  const junctionAuthority = compilePathJunctionAuthority(compiled, {
    junctionFilletSegments: options.junctionFilletSegments
  });
  const junctionEntries = junctionAuthority.junctions
    .map(junction => terrainJunctionEntry(junction, compiled))
    .filter(Boolean);

  for (const segment of compiled.segments || []) {
    const rawSections = segment.samples.map(sample => crossSectionForSample(segment, sample, baseHeightAt));
    const bridgeProfiles = resolveBridgeIntervals(segment, rawSections, baseHeightAt);
    const bridgeAuthorities = [...bridgeProfiles.values()];
    const segmentSections = [];
    for (const sample of segment.samples) {
      const crossSection = crossSectionForSample(segment, sample, baseHeightAt, bridgeAuthorities);
      crossSections.push(crossSection);
      segmentSections.push(crossSection);
      boundaryVertices.set(crossSection.outerBoundaryKeys[0], crossSection.outerLeft);
      boundaryVertices.set(crossSection.outerBoundaryKeys[1], crossSection.outerRight);
    }
    bridgeIntervalCount += bridgeProfiles.size;
    for (let index = 0; index < segment.samples.length - 1; index += 1) {
      const entry = constructionEntry(
        segment,
        segment.samples[index],
        segment.samples[index + 1],
        index,
        bridgeProfiles
      );
      entries.push(entry);
      addEntryToChunks(chunks, entry, chunkSize);
      entry.terrainBounds = terrainRangesForEntry(entry)
        .map(range => entryRangeBounds(entry, range[0], range[1]))
        .filter(Boolean);
      if (!entry.terrainBounds.length) continue;
      terrainEntries.push(entry);
      if (entry.construction.mode === 'bridge') bridgeSeatEntryCount += 1;
      for (const bounds of entry.terrainBounds) {
        addBoundsToChunks(terrainChunks, entry, bounds, chunkSize);
      }
    }
  }

  for (const junctionEntry of junctionEntries) {
    entries.push(junctionEntry);
    terrainEntries.push(junctionEntry);
    addEntryToChunks(chunks, junctionEntry, chunkSize);
    addEntryToChunks(terrainChunks, junctionEntry, chunkSize);
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
    terrainEntries,
    terrainChunks,
    terrainDirtyChunkKeys: [...terrainChunks.keys()].sort(),
    crossSections,
    boundaryVertices,
    junctionAuthority,
    junctionEntries,
    baseHeightAt,
    diagnostics: {
      entryCount: entries.length,
      dirtyChunkCount: chunks.size,
      terrainEntryCount: terrainEntries.length,
      terrainDirtyChunkCount: terrainChunks.size,
      bridgeIntervalCount,
      bridgeSeatEntryCount,
      junctionEntryCount: junctionEntries.length,
      invalidJunctionCount: junctionAuthority.diagnostics.invalidJunctionCount,
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
    junctionNodeId: null,
    constructionMode: null,
    constructionReason: null,
    terrainApplied: false,
    signedDistance: Infinity,
    lateralDistance: Infinity,
    normalizedLateral: Infinity,
    center: null,
    baseHeight,
    surfaceHeight: baseHeight,
    targetHeight: baseHeight,
    supportHeight: baseHeight,
    terrainUnderlayClearance: 0,
    height: baseHeight,
    longitudinalSupportWeight: 0,
    influence: 0,
    zone: 'terrain',
    materialWeights: {
      terrain: 1,
      road: 0,
      shoulder: 0,
      gutter: 0,
      curb: 0,
      sidewalk: 0,
      earthwork: 0
    }
  };
}

function exclusionEntriesForPoint(modifier, x, z, padding) {
  const centerX = chunkCoordinate(x, modifier.chunkSize);
  const centerZ = chunkCoordinate(z, modifier.chunkSize);
  const radius = Math.ceil(padding / modifier.chunkSize) + 1;
  const entries = new Map();
  for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
    for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
      for (const entry of modifier.chunks.get(chunkKey(centerX + offsetX, centerZ + offsetZ)) || []) {
        entries.set(entry.id, entry);
      }
    }
  }
  return [...entries.values()];
}

function entryExclusionHalfWidth(entry, nearest) {
  const mode = entry.construction.mode;
  if (mode === 'invalid' || mode === 'tunnel') return null;
  const stationDistance = lerp(entry.start.distance, entry.end.distance, nearest.t);
  const bridgeState = bridgeCrossSectionState(entry.profile, stationDistance, entry.bridgeAuthorities);
  if (mode === 'bridge') return Math.max(0, finite(bridgeState.exclusionHalfWidth, entry.bridgeExclusionHalfWidth));
  return nearest.lateral < 0
    ? Math.max(0, finite(bridgeState.leftOuterEdge, entry.extents.leftOuterEdge))
    : Math.max(0, finite(bridgeState.rightOuterEdge, entry.extents.rightOuterEdge));
}

export function samplePathExclusionField(modifier, x, z, padding = 0) {
  if (!modifier?.chunks || !Number.isFinite(Number(modifier.chunkSize))) {
    throw new Error('A compiled path terrain modifier is required.');
  }
  const worldX = finite(x);
  const worldZ = finite(z);
  const safePadding = Math.max(0, finite(padding));
  let selected = null;
  for (const entry of exclusionEntriesForPoint(modifier, worldX, worldZ, safePadding)) {
    if (entry.kind === 'junction') {
      const boundary = ringBoundaryDistance(entry.ring, worldX, worldZ);
      const inside = pointInRingXZ(entry.ring, worldX, worldZ);
      const clearance = inside ? -boundary.distance : boundary.distance;
      const paddedClearance = clearance - safePadding;
      if (
        !selected
        || paddedClearance < selected.paddedClearance - EPSILON
        || (
          Math.abs(paddedClearance - selected.paddedClearance) <= EPSILON
          && entry.id.localeCompare(selected.entryId) < 0
        )
      ) {
        selected = {
          entryId: entry.id,
          segmentId: null,
          junctionNodeId: entry.nodeId,
          constructionMode: 'junction',
          bridgeStyle: null,
          nearest: boundary.nearest,
          lateralDistance: inside ? 0 : boundary.distance,
          exclusionHalfWidth: 0,
          padding: safePadding,
          clearance,
          paddedClearance,
          excluded: paddedClearance <= EPSILON
        };
      }
      continue;
    }
    const nearest = pointSegment2(worldX, worldZ, entry.start.position, entry.end.position);
    const exclusionHalfWidth = entryExclusionHalfWidth(entry, nearest);
    if (exclusionHalfWidth === null) continue;
    const clearance = nearest.distance - exclusionHalfWidth;
    const paddedClearance = clearance - safePadding;
    if (
      !selected
      || paddedClearance < selected.paddedClearance - EPSILON
      || (
        Math.abs(paddedClearance - selected.paddedClearance) <= EPSILON
        && entry.id.localeCompare(selected.entryId) < 0
      )
    ) {
      selected = {
        entryId: entry.id,
        segmentId: entry.segmentId,
        constructionMode: entry.construction.mode,
        bridgeStyle: entry.bridgeProfile?.bridgeStyle || null,
        nearest: [nearest.x, nearest.z],
        lateralDistance: nearest.distance,
        exclusionHalfWidth,
        padding: safePadding,
        clearance,
        paddedClearance,
        excluded: paddedClearance <= EPSILON
      };
    }
  }
  return selected || {
    entryId: null,
    segmentId: null,
    junctionNodeId: null,
    constructionMode: null,
    bridgeStyle: null,
    nearest: null,
    lateralDistance: Infinity,
    exclusionHalfWidth: 0,
    padding: safePadding,
    clearance: Infinity,
    paddedClearance: Infinity,
    excluded: false
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
