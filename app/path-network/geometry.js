import earcut, { deviation as earcutDeviation } from '../vendor/earcut.js';
import {
  bridgeCrossSectionState,
  bridgeMaterialForRole,
  resolveBridgeProfile
} from './bridge-profiles.js';
import { pathCrossSectionLayout } from './cross-section-profiles.js';
import {
  PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT,
  pathSurfaceDetailRenderData
} from './surface-detail-profiles.js';

const EPSILON = 1e-6;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const lerp = (a, b, t) => a + (b - a) * t;
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (value, amount) => [value[0] * amount, value[1] * amount, value[2] * amount];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length3 = value => Math.hypot(value[0], value[1], value[2]);
const normalize3 = (value, fallback = [0, 1, 0]) => {
  const length = length3(value);
  return length > EPSILON ? scale3(value, 1 / length) : [...fallback];
};
const distance3 = (a, b) => length3(sub3(a, b));
const mix3 = (a, b, amount) => [
  lerp(a[0], b[0], amount),
  lerp(a[1], b[1], amount),
  lerp(a[2], b[2], amount)
];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ZERO_SURFACE_DETAIL = Object.freeze(
  Array.from({ length: PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT }, () => 0)
);

function createMeshBuilder(kind) {
  return {
    kind,
    positions: [],
    normals: [],
    indices: [],
    uvs: [],
    blends: [],
    surfaceDetail0: [],
    surfaceDetail1: [],
    surfaceDetail2: [],
    surfaceDetail3: [],
    roles: [],
    triangleRoles: []
  };
}

function pushVertex(builder, position, uv, blend, role, surfaceDetail = ZERO_SURFACE_DETAIL) {
  const index = builder.positions.length / 3;
  const detail = surfaceDetail?.length === PATH_SURFACE_DETAIL_RENDER_COMPONENT_COUNT
    ? surfaceDetail
    : ZERO_SURFACE_DETAIL;
  builder.positions.push(...position);
  builder.normals.push(0, 0, 0);
  builder.uvs.push(...uv);
  builder.blends.push(blend);
  builder.surfaceDetail0.push(...detail.slice(0, 4));
  builder.surfaceDetail1.push(...detail.slice(4, 8));
  builder.surfaceDetail2.push(...detail.slice(8, 12));
  builder.surfaceDetail3.push(...detail.slice(12, 16));
  builder.roles.push(role);
  return index;
}

function pushTriangle(builder, a, b, c) {
  // Winding is part of the authored topology. Forcing every triangle to face
  // upward corrupts bridge undersides, box side walls, tunnel linings, and
  // shadow meshes. Callers must provide counter-clockwise outward winding.
  builder.indices.push(a, b, c);
  builder.triangleRoles.push(builder.roles[a] || builder.roles[b] || builder.roles[c] || builder.kind);
}

function finalizeNormals(builder) {
  for (let offset = 0; offset < builder.indices.length; offset += 3) {
    const a = builder.indices[offset];
    const b = builder.indices[offset + 1];
    const c = builder.indices[offset + 2];
    const pa = builder.positions.slice(a * 3, a * 3 + 3);
    const pb = builder.positions.slice(b * 3, b * 3 + 3);
    const pc = builder.positions.slice(c * 3, c * 3 + 3);
    const normal = cross3(sub3(pb, pa), sub3(pc, pa));
    for (const index of [a, b, c]) {
      builder.normals[index * 3] += normal[0];
      builder.normals[index * 3 + 1] += normal[1];
      builder.normals[index * 3 + 2] += normal[2];
    }
  }
  for (let offset = 0; offset < builder.normals.length; offset += 3) {
    const normal = normalize3(builder.normals.slice(offset, offset + 3));
    builder.normals[offset] = normal[0];
    builder.normals[offset + 1] = normal[1];
    builder.normals[offset + 2] = normal[2];
  }
}

function finalizeMesh(builder) {
  finalizeNormals(builder);
  const groups = [];
  for (let triangle = 0; triangle < builder.triangleRoles.length; triangle += 1) {
    const material = bridgeMaterialForRole(builder.triangleRoles[triangle]);
    const previous = groups.at(-1);
    if (previous?.material?.name === material.name) {
      previous.indexCount += 3;
    } else {
      groups.push({
        name: material.name,
        indexOffset: triangle * 3,
        indexCount: 3,
        material
      });
    }
  }
  return {
    kind: builder.kind,
    positions: new Float32Array(builder.positions),
    normals: new Float32Array(builder.normals),
    indices: new Uint32Array(builder.indices),
    uvs: new Float32Array(builder.uvs),
    blends: new Float32Array(builder.blends),
    surfaceDetail0: new Float32Array(builder.surfaceDetail0),
    surfaceDetail1: new Float32Array(builder.surfaceDetail1),
    surfaceDetail2: new Float32Array(builder.surfaceDetail2),
    surfaceDetail3: new Float32Array(builder.surfaceDetail3),
    roles: builder.roles,
    groups
  };
}

function appendStrip(
  builder,
  rows,
  role,
  blendValues = [1, 1],
  skipDegenerate = false,
  surfaceDetail = null
) {
  if (rows.length < 2) return;
  const rowIndices = rows.map(row => {
    const rowSurfaceDetail = row.surfaceDetail || surfaceDetail;
    const longitudinal = rowSurfaceDetail
      ? row.distance
      : row.distance / Math.max(0.1, row.textureRepeatLength);
    return row.positions.map((position, column) => pushVertex(
      builder,
      position,
      [
        longitudinal,
        rowSurfaceDetail && Array.isArray(row.lateralDistances)
          ? 0.5 + finite(row.lateralDistances[column]) / Math.max(0.1, finite(rowSurfaceDetail[15], 1))
          : column / Math.max(1, row.positions.length - 1)
      ],
      blendValues[Math.min(column, blendValues.length - 1)] ?? 1,
      role,
      rowSurfaceDetail || ZERO_SURFACE_DETAIL
    ));
  });
  for (let row = 0; row < rowIndices.length - 1; row += 1) {
    for (let column = 0; column < rowIndices[row].length - 1; column += 1) {
      const a = rowIndices[row][column];
      const b = rowIndices[row + 1][column];
      const c = rowIndices[row][column + 1];
      const d = rowIndices[row + 1][column + 1];
      const triangleArea = (first, second, third) => {
        const point = index => builder.positions.slice(index * 3, index * 3 + 3);
        return length3(cross3(
          sub3(point(second), point(first)),
          sub3(point(third), point(first))
        ));
      };
      if (!skipDegenerate || triangleArea(a, b, c) >= 1e-8) pushTriangle(builder, a, b, c);
      if (!skipDegenerate || triangleArea(b, d, c) >= 1e-8) pushTriangle(builder, b, d, c);
    }
  }
}

function rowsWithoutSurfaceDetail(rows) {
  return rows.map(row => ({
    ...row,
    surfaceDetail: null,
    lateralDistances: null
  }));
}

function degreeMap(compiled) {
  const degree = new Map((compiled.nodes || []).map(node => [node.id, 0]));
  for (const segment of compiled.segments || []) {
    degree.set(segment.fromNode, (degree.get(segment.fromNode) || 0) + 1);
    degree.set(segment.toNode, (degree.get(segment.toNode) || 0) + 1);
  }
  return degree;
}

function trimSamplesForJunctions(segment, degree) {
  const samples = segment.samples;
  if (samples.length < 3) return { samples, fromPortal: null, toPortal: null };
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const trimDistance = Math.max(
    segment.crossSectionProfile.width * 1.15,
    layout.maximumOuterEdge + 1
  );
  let first = 0;
  let last = samples.length - 1;
  if ((degree.get(segment.fromNode) || 0) > 2) {
    while (first < last - 1 && samples[first].distance < trimDistance) first += 1;
  }
  if ((degree.get(segment.toNode) || 0) > 2) {
    const total = samples.at(-1).distance;
    while (last > first + 1 && total - samples[last].distance < trimDistance) last -= 1;
  }
  const trimmed = samples.slice(first, last + 1);
  return {
    samples: trimmed,
    fromPortal: first > 0 ? portalForSample(segment, trimmed[0], 'from') : null,
    toPortal: last < samples.length - 1 ? portalForSample(segment, trimmed.at(-1), 'to') : null
  };
}

function portalBoundary(sample, sideSign, side) {
  const point = (distance, heightOffset = 0) => crossSectionPoint(
    sample,
    sideSign,
    distance,
    heightOffset
  );
  const edgeDrop = Math.max(0.06, side.layout.profile.terrainUnderlayClearance * 1.5);
  return {
    urban: side.urban,
    roadEdge: point(side.roadEdge, side.roadEdgeHeight),
    gutterOuter: point(side.gutterEdge, side.gutterOuterHeight),
    curbInnerTop: point(side.gutterEdge, side.curbTopHeight),
    curbOuterTop: point(side.curbEdge, side.curbTopHeight),
    sidewalkOuterTop: point(side.sidewalkEdge, side.sidewalkOuterHeight),
    sidewalkOuterBottom: point(side.sidewalkEdge, side.sidewalkOuterHeight - edgeDrop),
    heights: {
      roadEdge: side.roadEdgeHeight,
      gutterOuter: side.gutterOuterHeight,
      curbInnerTop: side.curbTopHeight,
      curbOuterTop: side.curbTopHeight,
      sidewalkOuterTop: side.sidewalkOuterHeight,
      sidewalkOuterBottom: side.sidewalkOuterHeight - edgeDrop
    }
  };
}

function portalForSample(segment, sample, endpoint) {
  if (!sample) return null;
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const leftSide = { ...layout.left, layout };
  const rightSide = { ...layout.right, layout };
  const travelLeft = portalBoundary(sample, -1, leftSide);
  const travelRight = portalBoundary(sample, 1, rightSide);
  // Junction left/right are relative to the direction travelling away from
  // the node. A `to` endpoint therefore reverses the segment's authored
  // travel direction and must swap its cross-section sides.
  const left = endpoint === 'from' ? travelLeft : travelRight;
  const right = endpoint === 'from' ? travelRight : travelLeft;
  return {
    segmentId: segment.id,
    endpoint,
    center: [...sample.position],
    left: left.roadEdge,
    right: right.roadEdge,
    direction: endpoint === 'from' ? scale3(sample.tangent, 1) : scale3(sample.tangent, -1),
    width: segment.crossSectionProfile.width,
    crownHeight: segment.crossSectionProfile.crownHeight,
    surfaceDetailProfile: segment.surfaceDetailProfile,
    crossSectionProfile: segment.crossSectionProfile,
    crossSection: { left, right }
  };
}

function roadRows(segment, samples, sectionStateAt = null, surfaceDetail = null) {
  const authoredHalfWidth = segment.crossSectionProfile.width * 0.5;
  const crown = segment.crossSectionProfile.crownHeight;
  const repeat = Math.max(0.25, segment.crossSectionProfile.textureRepeatLength || 5);
  return samples.map(sample => {
    const state = sectionStateAt?.(sample.distance) || {};
    const halfWidth = Math.max(0.05, finite(state.roadHalfWidth, authoredHalfWidth));
    const rowSurfaceDetail = surfaceDetail
      ? new Float32Array(surfaceDetail)
      : null;
    if (rowSurfaceDetail) {
      rowSurfaceDetail[15] = Math.max(
        0.1,
        finite(state.surfaceDetailRoadWidth, halfWidth * 2)
      );
    }
    return {
      distance: sample.distance,
      textureRepeatLength: repeat,
      lateralDistances: [-halfWidth, 0, halfWidth],
      surfaceDetail: rowSurfaceDetail,
      positions: [
        crossSectionPoint(sample, -1, halfWidth, 0),
        crossSectionPoint(sample, 0, 0, crown),
        crossSectionPoint(sample, 1, halfWidth, 0)
      ]
    };
  });
}

function interpolateRoadRow(rows, distance) {
  if (!rows.length) return null;
  if (distance <= rows[0].distance) return rows[0];
  if (distance >= rows.at(-1).distance) return rows.at(-1);
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (distance > current.distance) continue;
    const span = Math.max(EPSILON, current.distance - previous.distance);
    const amount = clamp((distance - previous.distance) / span, 0, 1);
    return {
      distance,
      positions: previous.positions.map((position, column) => mix3(position, current.positions[column], amount))
    };
  }
  return rows.at(-1);
}

function blockedCorridorGuide(segment) {
  const rows = roadRows(segment, segment.samples || []);
  const boundaries = [];
  const hatches = [];
  const endCaps = [];
  if (rows.length < 2) {
    return {
      segmentId: segment.id,
      reason: segment.construction?.reason || 'invalid-path',
      role: 'editor-blocked-corridor',
      boundaries,
      hatches,
      endCaps
    };
  }

  for (let index = 1; index < rows.length; index += 1) {
    boundaries.push(
      ...rows[index - 1].positions[0], ...rows[index].positions[0],
      ...rows[index - 1].positions[2], ...rows[index].positions[2]
    );
  }
  endCaps.push(
    ...rows[0].positions[0], ...rows[0].positions[2],
    ...rows.at(-1).positions[0], ...rows.at(-1).positions[2]
  );

  const width = Math.max(0.5, finite(segment.crossSectionProfile?.width, 3));
  const baseSpacing = clamp(width * 0.75, 1.5, 6);
  const startDistance = rows[0].distance;
  const endDistance = rows.at(-1).distance;
  const maximumHatches = 256;
  const spacing = Math.max(baseSpacing, (endDistance - startDistance) / maximumHatches);
  const diagonalReach = Math.min(spacing * 0.72, width);
  let hatchIndex = 0;
  for (
    let distance = startDistance;
    distance <= endDistance + EPSILON && hatchIndex < maximumHatches;
    distance += spacing, hatchIndex += 1
  ) {
    const start = interpolateRoadRow(rows, distance);
    const end = interpolateRoadRow(rows, Math.min(endDistance, distance + diagonalReach));
    if (!start || !end) continue;
    const reverse = hatchIndex % 2 === 1;
    hatches.push(
      ...(reverse ? start.positions[2] : start.positions[0]),
      ...(reverse ? end.positions[0] : end.positions[2])
    );
  }

  return {
    segmentId: segment.id,
    reason: segment.construction?.reason || 'invalid-path',
    role: 'editor-blocked-corridor',
    boundaries,
    hatches,
    endCaps
  };
}

function shoulderRows(segment, samples, sideSign, sectionStateAt = null) {
  const profile = segment.crossSectionProfile;
  const authoredHalfWidth = profile.width * 0.5;
  const repeat = Math.max(0.25, profile.textureRepeatLength || 5);
  return samples.map(sample => {
    const state = sectionStateAt?.(sample.distance) || {};
    const halfWidth = Math.max(0.05, finite(state.roadHalfWidth, authoredHalfWidth));
    const accessoryScale = clamp(state.accessoryScale ?? 1, 0, 1);
    const outerDistance = halfWidth + profile.shoulderWidth * accessoryScale;
    const inner = crossSectionPoint(sample, sideSign, halfWidth, 0);
    const outer = crossSectionPoint(
      sample,
      sideSign,
      outerDistance,
      -profile.shoulderDrop * accessoryScale
    );
    return {
    distance: sample.distance,
    textureRepeatLength: repeat,
      // Both shoulders keep counter-clockwise top-surface winding. The left
      // strip runs outer-to-inner while the right runs inner-to-outer.
      positions: sideSign < 0 ? [outer, inner] : [inner, outer]
    };
  });
}

function horizontalSide(sample) {
  const authored = sample?.side || [0, 0, 0];
  const projected = normalize3([authored[0], 0, authored[2]], [0, 0, 0]);
  if (length3(projected) > EPSILON) return projected;
  const tangent = sample?.tangent || [0, 0, 1];
  return normalize3([-tangent[2], 0, tangent[0]], [1, 0, 0]);
}

function crossSectionPoint(sample, sideSign, distance, heightOffset = 0) {
  // Cross-section elevations share the terrain modifier's world-Y authority.
  // Applying crown/curb/sidewalk offsets along the transported road normal
  // shifts X/Z on grades and makes render, collision, and terrain boundaries
  // disagree even though they came from the same compiled station.
  const side = horizontalSide(sample);
  return add3(
    add3(sample.position, scale3(side, sideSign * distance)),
    [0, heightOffset, 0]
  );
}

function scaledBandDistance(layout, authoredDistance, state = {}) {
  const roadHalfWidth = Math.max(0.05, finite(state.roadHalfWidth, layout.halfRoad));
  const accessoryScale = clamp(state.accessoryScale ?? 1, 0, 1);
  return roadHalfWidth + Math.max(0, authoredDistance - layout.halfRoad) * accessoryScale;
}

function lateralBandRows(
  segment,
  samples,
  sideSign,
  innerDistance,
  outerDistance,
  innerHeight,
  outerHeight,
  sectionStateAt = null
) {
  if (outerDistance - innerDistance <= EPSILON) return [];
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const repeat = Math.max(0.25, segment.crossSectionProfile.textureRepeatLength || 5);
  return samples.map(sample => {
    const state = sectionStateAt?.(sample.distance) || {};
    const accessoryScale = clamp(state.accessoryScale ?? 1, 0, 1);
    const inner = crossSectionPoint(
      sample,
      sideSign,
      scaledBandDistance(layout, innerDistance, state),
      innerHeight * accessoryScale
    );
    const outer = crossSectionPoint(
      sample,
      sideSign,
      scaledBandDistance(layout, outerDistance, state),
      outerHeight * accessoryScale
    );
    return {
      distance: sample.distance,
      textureRepeatLength: repeat,
      positions: sideSign < 0 ? [outer, inner] : [inner, outer]
    };
  });
}

function verticalBandRows(
  segment,
  samples,
  sideSign,
  distance,
  bottomHeight,
  topHeight,
  face = 'inner',
  sectionStateAt = null
) {
  if (topHeight - bottomHeight <= EPSILON) return [];
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const repeat = Math.max(0.25, segment.crossSectionProfile.textureRepeatLength || 5);
  return samples.map(sample => {
    const state = sectionStateAt?.(sample.distance) || {};
    const accessoryScale = clamp(state.accessoryScale ?? 1, 0, 1);
    const scaledDistance = scaledBandDistance(layout, distance, state);
    const bottom = crossSectionPoint(sample, sideSign, scaledDistance, bottomHeight * accessoryScale);
    const top = crossSectionPoint(sample, sideSign, scaledDistance, topHeight * accessoryScale);
    const roadFacing = sideSign < 0 ? [top, bottom] : [bottom, top];
    return {
      distance: sample.distance,
      textureRepeatLength: repeat,
      positions: face === 'inner' ? roadFacing : [...roadFacing].reverse()
    };
  });
}

function urbanRows(segment, samples, sideSign, sectionStateAt = null) {
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const side = sideSign < 0 ? layout.left : layout.right;
  if (!side.urban) return null;
  const gutter = lateralBandRows(
    segment,
    samples,
    sideSign,
    side.roadEdge,
    side.gutterEdge,
    side.roadEdgeHeight,
    side.gutterOuterHeight,
    sectionStateAt
  );
  const curbTop = lateralBandRows(
    segment,
    samples,
    sideSign,
    side.gutterEdge,
    side.curbEdge,
    side.curbTopHeight,
    side.curbTopHeight,
    sectionStateAt
  );
  const curbInnerFace = verticalBandRows(
    segment,
    samples,
    sideSign,
    side.gutterEdge,
    side.gutterOuterHeight,
    side.curbTopHeight,
    'inner',
    sectionStateAt
  );
  const sidewalk = lateralBandRows(
    segment,
    samples,
    sideSign,
    side.curbEdge,
    side.sidewalkEdge,
    side.sidewalkInnerHeight,
    side.sidewalkOuterHeight,
    sectionStateAt
  );
  const edgeDrop = Math.max(0.06, segment.crossSectionProfile.terrainUnderlayClearance * 1.5);
  const sidewalkOuterFace = verticalBandRows(
    segment,
    samples,
    sideSign,
    side.sidewalkEdge,
    side.sidewalkOuterHeight - edgeDrop,
    side.sidewalkOuterHeight,
    'outer',
    sectionStateAt
  );
  return { layout, side, gutter, curbTop, curbInnerFace, sidewalk, sidewalkOuterFace };
}

function appendUrbanCrossSection(
  gutterBuilder,
  curbBuilder,
  sidewalkBuilder,
  sidewalkEdgeBuilder,
  segment,
  samples,
  sectionStateAt = null
) {
  for (const sideSign of [-1, 1]) {
    const rows = urbanRows(segment, samples, sideSign, sectionStateAt);
    if (!rows) continue;
    const sideName = sideSign < 0 ? 'left' : 'right';
    const tapered = typeof sectionStateAt === 'function';
    appendStrip(gutterBuilder, rows.gutter, `${sideName}-gutter`, [1, 1], tapered);
    appendStrip(curbBuilder, rows.curbTop, `${sideName}-curb-top`, [1, 1], tapered);
    appendStrip(curbBuilder, rows.curbInnerFace, `${sideName}-curb-face`, [1, 1], tapered);
    appendStrip(sidewalkBuilder, rows.sidewalk, `${sideName}-sidewalk`, [1, 1], tapered);
    appendStrip(sidewalkEdgeBuilder, rows.sidewalkOuterFace, `${sideName}-sidewalk-edge`, [1, 1], tapered);
  }
}

function lineIntersection2(a, directionA, b, directionB) {
  const denominator = directionA[0] * directionB[1] - directionA[1] * directionB[0];
  if (Math.abs(denominator) < EPSILON) return null;
  const deltaX = b[0] - a[0];
  const deltaY = b[1] - a[1];
  const t = (deltaX * directionB[1] - deltaY * directionB[0]) / denominator;
  return [a[0] + directionA[0] * t, a[1] + directionA[1] * t];
}

function pointKey(point) {
  return `${point[0].toFixed(6)}:${point[2].toFixed(6)}`;
}

function sanitizeRing(ring) {
  const result = [];
  for (const point of ring) {
    if (!point.every(Number.isFinite)) continue;
    if (!result.length || distance3(point, result.at(-1)) > 0.001) result.push(point);
  }
  if (result.length > 2 && distance3(result[0], result.at(-1)) < 0.001) result.pop();
  const unique = new Set(result.map(pointKey));
  return unique.size >= 3 ? result : [];
}

function segmentsIntersect2(a, b, c, d) {
  const orientation = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

function segmentsProperlyIntersect2(a, b, c, d) {
  const orientation = (p, q, r) => (
    (q[0] - p[0]) * (r[1] - p[1])
    - (q[1] - p[1]) * (r[0] - p[0])
  );
  const first = orientation(a, b, c) * orientation(a, b, d);
  const second = orientation(c, d, a) * orientation(c, d, b);
  return first < -1e-10 && second < -1e-10;
}

function ringSelfIntersects(ring) {
  const points = ring.map(point => [point[0], point[2]]);
  for (let a = 0; a < points.length; a += 1) {
    const aNext = (a + 1) % points.length;
    for (let b = a + 2; b < points.length; b += 1) {
      const bNext = (b + 1) % points.length;
      if (a === bNext || aNext === b) continue;
      if (segmentsIntersect2(points[a], points[aNext], points[b], points[bNext])) return true;
    }
  }
  return false;
}

function minimumHeadingSeparation(portals) {
  const headings = portals
    .map(portal => Math.atan2(portal.direction[2], portal.direction[0]))
    .sort((a, b) => a - b);
  if (headings.length < 2) return Math.PI * 2;
  let minimum = Math.PI * 2;
  for (let index = 0; index < headings.length; index += 1) {
    const next = headings[(index + 1) % headings.length]
      + (index === headings.length - 1 ? Math.PI * 2 : 0);
    minimum = Math.min(minimum, next - headings[index]);
  }
  return minimum;
}

function convexHullXZ(points, fallbackY = null) {
  const unique = new Map();
  for (const point of points) {
    if (!point?.every(Number.isFinite)) continue;
    unique.set(
      `${point[0].toFixed(6)}:${point[2].toFixed(6)}`,
      [point[0], fallbackY === null ? point[1] : fallbackY, point[2]]
    );
  }
  const sorted = [...unique.values()].sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  if (sorted.length < 3) return [];
  const turn = (a, b, c) => (
    (b[0] - a[0]) * (c[2] - a[2])
    - (b[2] - a[2]) * (c[0] - a[0])
  );
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), point) <= EPSILON) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), point) <= EPSILON) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return sanitizeRing([...lower, ...upper]);
}

function quadratic3(start, control, end, t) {
  const inverse = 1 - t;
  return [
    inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
    inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    inverse * inverse * start[2] + 2 * inverse * t * control[2] + t * t * end[2]
  ];
}

function portalBoundaryPoint(portal, side, boundaryKey) {
  const fallback = side === 'left' ? portal.left : portal.right;
  return portal.crossSection?.[side]?.[boundaryKey] || fallback;
}

function junctionBoundaryRing(junction, portalsByNode, options, boundaryKey = 'roadEdge') {
  const portals = portalsByNode.get(junction.nodeId) || [];
  if (portals.length < 3) return { ring: [], portals, error: 'insufficient-portals' };
  const sorted = [...portals].sort((a, b) => (
    Math.atan2(a.direction[2], a.direction[0]) - Math.atan2(b.direction[2], b.direction[0])
  ));
  const filletSteps = Math.max(2, Math.min(10, Math.round(options.junctionFilletSegments || 4)));
  const maximumBoundaryRadius = Math.max(0.5, ...sorted.flatMap(portal => [
    portalBoundaryPoint(portal, 'left', boundaryKey),
    portalBoundaryPoint(portal, 'right', boundaryKey)
  ]).map(point => Math.hypot(point[0] - junction.position[0], point[2] - junction.position[2])));
  const maximumMiter = Math.max(...sorted.map(portal => portal.width), maximumBoundaryRadius) * 2.5;
  const ring = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[(index + 1) % sorted.length];
    const currentRight = [...portalBoundaryPoint(current, 'right', boundaryKey)];
    const currentLeft = [...portalBoundaryPoint(current, 'left', boundaryKey)];
    const nextRight = [...portalBoundaryPoint(next, 'right', boundaryKey)];
    ring.push(currentRight, currentLeft);
    const intersection = lineIntersection2(
      [currentLeft[0], currentLeft[2]],
      [current.direction[0], current.direction[2]],
      [nextRight[0], nextRight[2]],
      [next.direction[0], next.direction[2]]
    );
    const controlY = (currentLeft[1] + nextRight[1]) * 0.5;
    let control = intersection ? [intersection[0], controlY, intersection[1]] : [
      (currentLeft[0] + nextRight[0]) * 0.5,
      controlY,
      (currentLeft[2] + nextRight[2]) * 0.5
    ];
    const node = junction.position;
    const distanceFromNode = Math.hypot(control[0] - node[0], control[2] - node[2]);
    if (distanceFromNode > maximumMiter) {
      const direction = normalize3([control[0] - node[0], 0, control[2] - node[2]]);
      control = [node[0] + direction[0] * maximumMiter, controlY, node[2] + direction[2] * maximumMiter];
    }
    for (let step = 1; step < filletSteps; step += 1) {
      ring.push(quadratic3(currentLeft, control, nextRight, step / filletSteps));
    }
  }
  const sanitized = sanitizeRing(ring);
  if (sanitized.length < 3) return { ring: [], portals: sorted, error: 'degenerate-ring' };
  if (ringSelfIntersects(sanitized)) {
    // A bounded convex cleanup is safe for a real junction with distinct
    // approaches and mixed widths. It keeps every trimmed portal inside one
    // watertight polygon without resurrecting the old radial dirt patch.
    // Nearly collinear approaches remain invalid because their topology is
    // ambiguous and a convex patch would hide the authoring error.
    if (minimumHeadingSeparation(sorted) < Math.PI / 18) {
      return { ring: sanitized, portals: sorted, error: 'self-intersection', fallback: null };
    }
    const hull = convexHullXZ(sorted.flatMap(portal => [
      portalBoundaryPoint(portal, 'left', boundaryKey),
      portalBoundaryPoint(portal, 'right', boundaryKey)
    ]));
    if (hull.length >= 3 && !ringSelfIntersects(hull)) {
      return { ring: hull, portals: sorted, error: null, fallback: 'bounded-convex-hull' };
    }
    return { ring: sanitized, portals: sorted, error: 'self-intersection', fallback: null };
  }
  return { ring: sanitized, portals: sorted, error: null, fallback: null, boundaryKey };
}

function pushUpwardTriangle(builder, a, b, c) {
  const points = [a, b, c].map(index => builder.positions.slice(index * 3, index * 3 + 3));
  const normal = cross3(sub3(points[1], points[0]), sub3(points[2], points[0]));
  if (normal[1] < 0) pushTriangle(builder, a, c, b);
  else pushTriangle(builder, a, b, c);
}

function appendTriangulatedPolygon(
  builder,
  junction,
  generated,
  role = 'junction',
  surfaceDetailContext = null
) {
  if (generated.error) return { ...generated, triangleCount: 0, deviation: Infinity };
  const flattened = generated.ring.flatMap(point => [point[0], point[2]]);
  const triangles = generated.triangles?.length
    ? generated.triangles
    : earcut(flattened, null, 2);
  const deviation = Number.isFinite(generated.deviation)
    ? generated.deviation
    : earcutDeviation(flattened, null, 2, triangles);
  if (!Number.isFinite(deviation) || deviation > 1e-6) {
    return { ...generated, error: 'triangulation-deviation', triangleCount: 0, deviation };
  }
  const base = builder.positions.length / 3;
  const origin = junction.position;
  generated.ring.forEach(point => {
    const delta = sub3(point, origin);
    const uv = surfaceDetailContext
      ? [
        dot3(delta, surfaceDetailContext.direction),
        0.5 + dot3(delta, surfaceDetailContext.side) / surfaceDetailContext.roadWidth
      ]
      : [(point[0] - origin[0]) * 0.1, (point[2] - origin[2]) * 0.1];
    pushVertex(
      builder,
      point,
      uv,
      1,
      role,
      surfaceDetailContext?.data || ZERO_SURFACE_DETAIL
    );
  });
  for (let index = 0; index < triangles.length; index += 3) {
    pushUpwardTriangle(
      builder,
      base + triangles[index],
      base + triangles[index + 1],
      base + triangles[index + 2]
    );
  }
  return { ...generated, triangleCount: triangles.length / 3, deviation };
}

/**
 * Compile the exact validated road-junction rings before either terrain or
 * render geometry consumes them. The returned portal and ring objects are the
 * shared authority for fillets, triangulation, terrain support, material
 * ownership, and foliage exclusion.
 */
export function compilePathJunctionAuthority(compiled, options = {}) {
  if (!compiled?.diagnostics) throw new Error('A compiled path network is required.');
  const surfaceSegments = (compiled.segments || []).filter(segment => segment.construction.mode !== 'invalid');
  const surfaceCompiled = { ...compiled, segments: surfaceSegments };
  const degree = degreeMap(surfaceCompiled);
  const portalsByNode = new Map((compiled.nodes || []).map(node => [node.id, []]));
  const preparedSegments = surfaceSegments.map(segment => {
    const prepared = trimSamplesForJunctions(segment, degree);
    if (prepared.fromPortal) portalsByNode.get(segment.fromNode)?.push(prepared.fromPortal);
    if (prepared.toPortal) portalsByNode.get(segment.toNode)?.push(prepared.toPortal);
    return { segment, ...prepared };
  });
  const junctions = [];
  for (const junction of (compiled.junctions || []).filter(item => (degree.get(item.nodeId) || 0) >= 3)) {
    const generated = junctionBoundaryRing(junction, portalsByNode, options, 'roadEdge');
    const flattened = generated.ring.flatMap(point => [point[0], point[2]]);
    const triangles = generated.error ? [] : earcut(flattened, null, 2);
    const deviation = generated.error || !triangles.length
      ? Infinity
      : earcutDeviation(flattened, null, 2, triangles);
    const error = generated.error
      || (!Number.isFinite(deviation) || deviation > 1e-6 ? 'triangulation-deviation' : null);
    junctions.push({
      ...junction,
      ...generated,
      triangles: error ? [] : triangles,
      triangleCount: error ? 0 : triangles.length / 3,
      deviation,
      error
    });
  }
  return {
    schemaVersion: 1,
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: compiled.generationRevision,
    degree,
    preparedSegments,
    portalsByNode,
    junctions,
    junctionsByNode: new Map(junctions.map(junction => [junction.nodeId, junction])),
    diagnostics: {
      junctionCount: junctions.length,
      validJunctionCount: junctions.filter(junction => !junction.error).length,
      invalidJunctionCount: junctions.filter(junction => junction.error).length
    }
  };
}

function junctionSurfaceDetailContext(junction, portals = []) {
  const primary = [...portals].sort((a, b) => (
    finite(b.width) - finite(a.width)
    || String(a.segmentId).localeCompare(String(b.segmentId))
  ))[0];
  if (!primary?.surfaceDetail) return null;
  const direction = normalize3([primary.direction[0], 0, primary.direction[2]], [0, 0, 1]);
  const side = normalize3([-direction[2], 0, direction[0]], [1, 0, 0]);
  return {
    data: primary.surfaceDetail,
    direction,
    side,
    roadWidth: Math.max(0.1, finite(primary.surfaceDetail[15], primary.width))
  };
}

function appendJunction(builder, junction, portalsByNode, options, sharedAuthority = null) {
  const generated = sharedAuthority || junctionBoundaryRing(junction, portalsByNode, options, 'roadEdge');
  return appendTriangulatedPolygon(
    builder,
    junction,
    generated,
    'junction',
    junctionSurfaceDetailContext(junction, generated.portals)
  );
}

function ringAreaXZ(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[2] - next[0] * current[2];
  }
  return area * 0.5;
}

function appendJunctionBand(builder, junction, inner, outer, role) {
  if (inner.error || outer.error) {
    return {
      role,
      error: inner.error || outer.error,
      triangleCount: 0,
      deviation: Infinity
    };
  }
  if (inner.ring.length !== outer.ring.length) {
    return { role, error: 'boundary-topology-mismatch', triangleCount: 0, deviation: Infinity };
  }
  const innerArea = Math.abs(ringAreaXZ(inner.ring));
  const outerArea = Math.abs(ringAreaXZ(outer.ring));
  if (outerArea <= innerArea + 1e-5) {
    return { role, error: 'invalid-band-area', triangleCount: 0, deviation: Infinity };
  }
  let triangleCount = 0;
  for (let index = 0; index < inner.ring.length; index += 1) {
    const next = (index + 1) % inner.ring.length;
    const points = [inner.ring[index], outer.ring[index], outer.ring[next], inner.ring[next]];
    const planar = points.map(point => [point[0], point[2]]);
    if (
      segmentsProperlyIntersect2(planar[0], planar[1], planar[2], planar[3])
      || segmentsProperlyIntersect2(planar[1], planar[2], planar[3], planar[0])
    ) return { role, error: 'self-intersecting-band', triangleCount: 0, deviation: Infinity };
    const firstArea = length3(cross3(sub3(points[1], points[0]), sub3(points[3], points[0])));
    const secondArea = length3(cross3(sub3(points[2], points[1]), sub3(points[3], points[1])));
    if (firstArea < 1e-8 && secondArea < 1e-8) continue;
    const base = builder.positions.length / 3;
    points.forEach(point => pushVertex(
      builder,
      point,
      [(point[0] - junction.position[0]) * 0.1, (point[2] - junction.position[2]) * 0.1],
      1,
      role
    ));
    if (firstArea >= 1e-8) {
      pushUpwardTriangle(builder, base, base + 1, base + 3);
      triangleCount += 1;
    }
    if (secondArea >= 1e-8) {
      pushUpwardTriangle(builder, base + 1, base + 2, base + 3);
      triangleCount += 1;
    }
  }
  return triangleCount
    ? { role, error: null, triangleCount, deviation: 0 }
    : { role, error: 'empty-band', triangleCount: 0, deviation: Infinity };
}

function appendJunctionWall(builder, junction, lower, upper, role, facing = 'outward') {
  if (lower.error || upper.error || lower.ring.length !== upper.ring.length) {
    return {
      role,
      error: lower.error || upper.error || 'boundary-topology-mismatch',
      triangleCount: 0
    };
  }
  let triangleCount = 0;
  for (let index = 0; index < lower.ring.length; index += 1) {
    const next = (index + 1) % lower.ring.length;
    const points = [lower.ring[index], lower.ring[next], upper.ring[index], upper.ring[next]];
    const base = builder.positions.length / 3;
    points.forEach((point, column) => pushVertex(builder, point, [column % 2, column > 1 ? 1 : 0], 1, role));
    const normal = cross3(sub3(points[1], points[0]), sub3(points[2], points[0]));
    const midpoint = scale3(add3(points[0], points[1]), 0.5);
    const radial = [midpoint[0] - junction.position[0], 0, midpoint[2] - junction.position[2]];
    const pointsOutward = dot3(normal, radial) >= 0;
    const wantOutward = facing === 'outward';
    if (pointsOutward === wantOutward) {
      pushTriangle(builder, base, base + 1, base + 2);
      pushTriangle(builder, base + 1, base + 3, base + 2);
    } else {
      pushTriangle(builder, base, base + 2, base + 1);
      pushTriangle(builder, base + 1, base + 2, base + 3);
    }
    triangleCount += 2;
  }
  return { role, error: null, triangleCount };
}

function boundaryHasSpan(portals, innerKey, outerKey) {
  return portals.every(portal => ['left', 'right'].every(side => {
    const inner = portalBoundaryPoint(portal, side, innerKey);
    const outer = portalBoundaryPoint(portal, side, outerKey);
    return Math.hypot(outer[0] - inner[0], outer[2] - inner[2]) > EPSILON;
  }));
}

function appendUrbanJunctionSurfaces(builders, junction, portalsByNode, options, roadReport) {
  const portals = roadReport.portals || [];
  if (!portals.length || !portals.every(portal => (
    portal.crossSection?.left?.urban && portal.crossSection?.right?.urban
  ))) return [];

  const reports = [];
  const ring = boundaryKey => junctionBoundaryRing(junction, portalsByNode, options, boundaryKey);
  const road = { ...roadReport, boundaryKey: 'roadEdge' };
  let gutter = null;
  if (boundaryHasSpan(portals, 'roadEdge', 'gutterOuter')) {
    gutter = ring('gutterOuter');
    reports.push(appendJunctionBand(builders.gutter, junction, road, gutter, 'junction-gutter'));
  }
  if (gutter && boundaryHasSpan(portals, 'gutterOuter', 'curbOuterTop')) {
    const curbInner = ring('curbInnerTop');
    const curbOuter = ring('curbOuterTop');
    reports.push(appendJunctionWall(builders.curb, junction, gutter, curbInner, 'junction-curb-face', 'inward'));
    reports.push(appendJunctionBand(builders.curb, junction, curbInner, curbOuter, 'junction-curb-top'));

    if (boundaryHasSpan(portals, 'curbOuterTop', 'sidewalkOuterTop')) {
      const sidewalkTop = ring('sidewalkOuterTop');
      const sidewalkBottom = ring('sidewalkOuterBottom');
      reports.push(appendJunctionBand(
        builders.sidewalk,
        junction,
        curbOuter,
        sidewalkTop,
        'junction-sidewalk'
      ));
      reports.push(appendJunctionWall(
        builders.sidewalkEdge,
        junction,
        sidewalkBottom,
        sidewalkTop,
        'junction-sidewalk-edge',
        'outward'
      ));
    }
  }
  return reports;
}

function junctionRing(junction, portalsByNode, options) {
  return junctionBoundaryRing(junction, portalsByNode, options, 'roadEdge');
}

function appendEndCap(builder, row, role, surfaceDetail = null) {
  if (!row?.positions?.length) return;
  const indices = row.positions.map((position, column) => pushVertex(
    builder,
    position,
    [
      surfaceDetail ? finite(row.distance) : column / Math.max(1, row.positions.length - 1),
      surfaceDetail ? column / Math.max(1, row.positions.length - 1) : 0
    ],
    1,
    role,
    surfaceDetail || ZERO_SURFACE_DETAIL
  ));
  for (let index = 1; index < indices.length - 1; index += 1) {
    pushTriangle(builder, indices[0], indices[index + 1], indices[index]);
  }
}

function appendQuad(
  builder,
  a,
  b,
  c,
  d,
  role,
  uvScale = Math.max(0.25, distance3(a, b) / 2),
  uvScaleV = Math.max(0.25, distance3(a, c) / 2)
) {
  const base = builder.positions.length / 3;
  pushVertex(builder, a, [0, 0], 1, role);
  pushVertex(builder, b, [uvScale, 0], 1, role);
  pushVertex(builder, c, [0, uvScaleV], 1, role);
  pushVertex(builder, d, [uvScale, uvScaleV], 1, role);
  pushTriangle(builder, base, base + 1, base + 2);
  pushTriangle(builder, base + 1, base + 3, base + 2);
}

function appendQuadFacing(builder, a, b, c, d, role, desiredNormal) {
  const firstNormal = cross3(sub3(b, a), sub3(c, a));
  const secondNormal = cross3(sub3(d, b), sub3(c, b));
  // Contact geometry is assembled from independently sampled terrain points.
  // A collapsed face is omitted rather than leaving a zero-area triangle that
  // later poisons normals, collision, or the shadow pass.
  if (length3(firstNormal) < 1e-8 || length3(secondNormal) < 1e-8) return false;
  if (dot3(add3(firstNormal, secondNormal), desiredNormal) < 0) {
    appendQuad(builder, b, a, d, c, role);
  } else {
    appendQuad(builder, a, b, c, d, role);
  }
  return true;
}

function appendContactCell(builder, cell, role, forward, side) {
  const {
    nearLeftTop,
    nearRightTop,
    farLeftTop,
    farRightTop,
    nearLeftBottom,
    nearRightBottom,
    farLeftBottom,
    farRightBottom
  } = cell;
  appendQuadFacing(
    builder,
    nearLeftTop,
    nearRightTop,
    farLeftTop,
    farRightTop,
    role,
    [0, 1, 0]
  );
  appendQuadFacing(
    builder,
    nearLeftBottom,
    farLeftBottom,
    nearRightBottom,
    farRightBottom,
    role,
    [0, -1, 0]
  );
  appendQuadFacing(
    builder,
    nearRightTop,
    nearLeftTop,
    nearRightBottom,
    nearLeftBottom,
    role,
    scale3(forward, -1)
  );
  appendQuadFacing(
    builder,
    farLeftTop,
    farRightTop,
    farLeftBottom,
    farRightBottom,
    role,
    forward
  );
  appendQuadFacing(
    builder,
    nearLeftTop,
    farLeftTop,
    nearLeftBottom,
    farLeftBottom,
    role,
    scale3(side, -1)
  );
  appendQuadFacing(
    builder,
    farRightTop,
    nearRightTop,
    farRightBottom,
    nearRightBottom,
    role,
    side
  );
}

function appendOrientedBox(builder, center, tangentInput, sideInput, upInput, size, role) {
  const tangent = normalize3(tangentInput);
  let side = normalize3(sideInput);
  let up = normalize3(upInput);
  if (Math.abs(tangent[0] * side[0] + tangent[1] * side[1] + tangent[2] * side[2]) > 0.98) {
    side = normalize3(cross3([0, 1, 0], tangent), [1, 0, 0]);
  }
  up = normalize3(cross3(tangent, side), up);
  if (up[1] < 0) {
    side = scale3(side, -1);
    up = scale3(up, -1);
  }
  const halfLength = Math.max(0.01, finite(size[0], 0.1) * 0.5);
  const halfWidth = Math.max(0.01, finite(size[1], 0.1) * 0.5);
  const halfHeight = Math.max(0.01, finite(size[2], 0.1) * 0.5);
  const point = (along, across, vertical) => add3(
    add3(
      add3(center, scale3(tangent, along * halfLength)),
      scale3(side, across * halfWidth)
    ),
    scale3(up, vertical * halfHeight)
  );
  const points = {
    nnn: point(-1, -1, -1),
    pnn: point(1, -1, -1),
    nnp: point(-1, -1, 1),
    pnp: point(1, -1, 1),
    npn: point(-1, 1, -1),
    ppn: point(1, 1, -1),
    npp: point(-1, 1, 1),
    ppp: point(1, 1, 1)
  };
  // Local axes are right-handed: tangent x side = up. Each face is emitted
  // counter-clockwise when viewed from outside, including the underside.
  for (const face of [
    [points.nnp, points.pnp, points.npp, points.ppp], // +up
    [points.npn, points.ppn, points.nnn, points.pnn], // -up
    [points.nnn, points.pnn, points.nnp, points.pnp], // -side
    [points.npp, points.ppp, points.npn, points.ppn], // +side
    [points.npn, points.nnn, points.npp, points.nnp], // -tangent
    [points.pnn, points.ppn, points.pnp, points.ppp]  // +tangent
  ]) appendQuad(builder, ...face, role);
}

function appendBeamBetween(builder, start, end, width, height, role) {
  const vector = sub3(end, start);
  const beamLength = length3(vector);
  if (beamLength < 0.02) return;
  const tangent = scale3(vector, 1 / beamLength);
  const reference = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const side = normalize3(cross3(reference, tangent), [1, 0, 0]);
  const up = normalize3(cross3(tangent, side), [0, 1, 0]);
  appendOrientedBox(
    builder,
    scale3(add3(start, end), 0.5),
    tangent,
    side,
    up,
    [beamLength, width, height],
    role
  );
}

function sectionFrame(sections, index) {
  const previous = sections[Math.max(0, index - 1)];
  const current = sections[index];
  const next = sections[Math.min(sections.length - 1, index + 1)];
  const tangent = normalize3(sub3(next.center, previous.center), [0, 0, 1]);
  const side = normalize3(sub3(current.roadRight, current.roadLeft), [1, 0, 0]);
  let up = normalize3(cross3(tangent, side), [0, 1, 0]);
  if (up[1] < 0) up = scale3(up, -1);
  return { tangent, side, up };
}

function nearestSectionIndex(sections, targetDistance) {
  let selected = 0;
  for (let index = 1; index < sections.length; index += 1) {
    if (
      Math.abs(sections[index].distance - targetDistance)
      < Math.abs(sections[selected].distance - targetDistance)
    ) selected = index;
  }
  return selected;
}

function sectionIndicesAtSpacing(sections, spacing, includeEnds = false) {
  const firstDistance = sections[0].distance;
  const lastDistance = sections.at(-1).distance;
  const result = includeEnds ? [0] : [];
  for (let distance = firstDistance + spacing; distance < lastDistance - spacing * 0.35; distance += spacing) {
    const index = nearestSectionIndex(sections, distance);
    if (!result.includes(index)) result.push(index);
  }
  if (includeEnds && !result.includes(sections.length - 1)) result.push(sections.length - 1);
  return result;
}

function sectionHorizontalSide(section) {
  const vector = sub3(section.roadRight, section.roadLeft);
  return normalize3([vector[0], 0, vector[2]], [1, 0, 0]);
}

function sectionLateralPoint(section, signedDistance, heightOffset = 0) {
  const side = sectionHorizontalSide(section);
  return [
    section.center[0] + side[0] * signedDistance,
    section.center[1] + heightOffset,
    section.center[2] + side[2] * signedDistance
  ];
}

function bridgeUrbanSidePoints(section, layoutSide, sideSign, roadHalfWidth) {
  const points = [sectionLateralPoint(section, sideSign * roadHalfWidth, 0)];
  let distance = roadHalfWidth;
  if (layoutSide.gutterWidth > EPSILON) {
    distance += layoutSide.gutterWidth;
    points.push(sectionLateralPoint(section, sideSign * distance, layoutSide.gutterOuterHeight));
  }
  if (layoutSide.curbWidth > EPSILON) {
    points.push(sectionLateralPoint(section, sideSign * distance, layoutSide.curbTopHeight));
    distance += layoutSide.curbWidth;
    points.push(sectionLateralPoint(section, sideSign * distance, layoutSide.curbTopHeight));
  }
  if (layoutSide.sidewalkWidth > EPSILON) {
    distance += layoutSide.sidewalkWidth;
    points.push(sectionLateralPoint(section, sideSign * distance, layoutSide.sidewalkOuterHeight));
  }
  return { points, outerDistance: distance };
}

function bridgeSectionsForProfile(segment, sections, profile, sectionStateAt = null) {
  if (sections.length < 2) return [];
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const startDistance = sections[0].distance;
  const endDistance = sections.at(-1).distance;
  return sections.map(section => {
    const sectionState = sectionStateAt?.(section.distance) || {};
    const roadHalfWidth = Math.max(
      0.05,
      finite(sectionState.roadHalfWidth, profile.clearWidth * 0.5)
    );
    const edgeDistance = Math.min(
      Math.max(0, section.distance - startDistance),
      Math.max(0, endDistance - section.distance)
    );
    const overhangAmount = smoothstep01(
      (edgeDistance - profile.abutmentSeatLength)
      / Math.max(0.25, profile.approachTaperLength)
    );
    const roadLeft = sectionLateralPoint(section, -roadHalfWidth, 0);
    const roadRight = sectionLateralPoint(section, roadHalfWidth, 0);
    const roadCenter = [
      section.center[0],
      section.roadCenter?.[1] ?? section.center[1] + segment.crossSectionProfile.crownHeight,
      section.center[2]
    ];
    const carriesUrban = profile.carrySidewalks && (layout.left.urban || layout.right.urban);
    const left = carriesUrban
      ? bridgeUrbanSidePoints(section, layout.left, -1, roadHalfWidth)
      : { points: [roadLeft], outerDistance: roadHalfWidth };
    const right = carriesUrban
      ? bridgeUrbanSidePoints(section, layout.right, 1, roadHalfWidth)
      : { points: [roadRight], outerDistance: roadHalfWidth };
    const deckLeft = sectionLateralPoint(
      section,
      -(left.outerDistance + profile.deckEdgeOverhang * overhangAmount),
      left.points.at(-1)[1] - section.center[1]
    );
    const deckRight = sectionLateralPoint(
      section,
      right.outerDistance + profile.deckEdgeOverhang * overhangAmount,
      right.points.at(-1)[1] - section.center[1]
    );
    // The structural deck edge replaces (rather than duplicates) the outermost
    // carried surface point. At the exact abutment boundary these points are
    // coincident, so replacement keeps a single watertight seam and avoids
    // unreferenced zero-area vertices with misleading fallback normals.
    const leftTop = [deckLeft, ...left.points.slice(0, -1).reverse()];
    const rightTop = [...right.points.slice(0, -1), deckRight];
    return {
      ...section,
      roadLeft,
      roadCenter,
      roadRight,
      deckLeft,
      deckRight,
      roadHalfWidth,
      deckLeftWidth: left.outerDistance + profile.deckEdgeOverhang * overhangAmount,
      deckRightWidth: right.outerDistance + profile.deckEdgeOverhang * overhangAmount,
      approachAmount: overhangAmount,
      deckTopPositions: [...leftTop, roadCenter, ...rightTop]
    };
  });
}

function bridgeNavigationRows(sections) {
  return sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: [section.roadLeft, section.roadCenter, section.roadRight]
  }));
}

function bridgeSidewalkNavigationRows(segment, sections, sideSign) {
  const layout = pathCrossSectionLayout(segment.crossSectionProfile);
  const side = sideSign < 0 ? layout.left : layout.right;
  if (!side.urban || side.sidewalkWidth <= EPSILON) return [];
  return sections.map(section => {
    const innerDistance = section.roadHalfWidth + side.gutterWidth + side.curbWidth;
    const outerDistance = innerDistance + side.sidewalkWidth;
    return {
      distance: section.distance,
      textureRepeatLength: 4,
      positions: [
        sectionLateralPoint(section, sideSign * innerDistance, side.curbTopHeight),
        sectionLateralPoint(section, sideSign * outerDistance, side.sidewalkOuterHeight)
      ]
    };
  });
}

function appendStripWithCellRoles(
  builder,
  rows,
  roleForCell,
  blendValues = [1, 1],
  skipDegenerate = false,
  surfaceDetail = null,
  boundaryVertexRole = null
) {
  if (rows.length < 2) return;
  const appendGroup = (start, end, role) => {
    const groupRows = rows.slice(start, end + 1);
    const vertexStart = builder.positions.length / 3;
    appendStrip(
      builder,
      groupRows,
      role,
      blendValues,
      skipDegenerate,
      surfaceDetail
    );
    if (!boundaryVertexRole) return;
    const columnCount = groupRows[0]?.positions?.length || 0;
    if (start === 0) {
      for (let column = 0; column < columnCount; column += 1) {
        builder.roles[vertexStart + column] = boundaryVertexRole;
      }
    }
    if (end === rows.length - 1) {
      const lastRowStart = vertexStart + (groupRows.length - 1) * columnCount;
      for (let column = 0; column < columnCount; column += 1) {
        builder.roles[lastRowStart + column] = boundaryVertexRole;
      }
    }
  };
  let groupStart = 0;
  let groupRole = roleForCell(rows[0], rows[1], 0);
  for (let cell = 1; cell < rows.length - 1; cell += 1) {
    const role = roleForCell(rows[cell], rows[cell + 1], cell);
    if (role === groupRole) continue;
    appendGroup(groupStart, cell, groupRole);
    // Adjacent material regions intentionally duplicate the exact boundary
    // row. They occupy identical positions but never overlap in area, which
    // gives the renderer a clean material threshold without a crack.
    groupStart = cell;
    groupRole = role;
  }
  appendGroup(groupStart, rows.length - 1, groupRole);
}

function bridgeThresholdRole(profile, deckRole) {
  if (profile?.bridgeStyle === 'steel-girder') return 'bridge-steel-expansion-joint-deck-top';
  if (profile?.bridgeStyle === 'timber-trestle') return 'bridge-timber-threshold-sill-deck-top';
  if (profile?.bridgeStyle === 'stone-arch') return 'bridge-stone-coping-deck-top';
  if (profile?.bridgeStyle === 'masonry-causeway') return 'bridge-masonry-coping-deck-top';
  if (profile?.bridgeStyle === 'rope-footbridge') return 'bridge-timber-anchor-landing-deck-top';
  return `${deckRole}-portal-threshold-deck-top`;
}

function bridgePortalBandLengths(profile, span) {
  const thresholdLength = Math.min(
    span * 0.25,
    clamp(finite(profile?.abutmentSeatLength, 1.2) * 0.22, 0.18, 0.48)
  );
  const apronLength = Math.min(
    span * 0.5,
    Math.max(
      thresholdLength,
      finite(profile?.abutmentSeatLength, 1.2)
        + Math.min(2.5, finite(profile?.approachTaperLength, 5) * 0.35)
    )
  );
  return { thresholdLength, apronLength };
}

function bridgeTopRoleForCell(start, end, profile, deckRole, firstDistance, lastDistance) {
  const midpoint = (start.distance + end.distance) * 0.5;
  const portalDistance = Math.min(midpoint - firstDistance, lastDistance - midpoint);
  const span = Math.max(0, lastDistance - firstDistance);
  const { thresholdLength, apronLength } = bridgePortalBandLengths(profile, span);
  if (portalDistance <= thresholdLength + EPSILON) return bridgeThresholdRole(profile, deckRole);
  if (portalDistance <= apronLength + EPSILON) return `${deckRole}-portal-apron-deck-top`;
  return `${deckRole}-top`;
}

function structuralBridgeSurfaceDetail(surfaceDetail, profile) {
  if (!surfaceDetail) return null;
  const detail = new Float32Array(surfaceDetail);
  const family = String(profile?.bridgeStyle || '');
  // Structural decks may carry restrained wetness and transferred grime, but
  // they do not inherit dirt excavation, wheel-rut displacement, or hoof/boot
  // stamping from the adjoining trail. Portal aprons retain the authored road
  // payload; the inner deck uses this family-safe payload.
  detail[2] = Math.min(detail[2], family === 'stone-arch' || family === 'masonry-causeway' ? 0.025 : 0.012);
  detail[4] = Math.min(detail[4], family === 'stone-arch' || family === 'masonry-causeway' ? 0.006 : 0.003);
  detail[5] = 0;
  detail[8] = 0;
  detail[10] = 0;
  detail[12] = Math.min(detail[12], family === 'stone-arch' || family === 'masonry-causeway' ? 0.045 : 0.012);
  detail[13] = Math.min(detail[13], family === 'timber-trestle' ? 0.28 : 0.42);
  return detail;
}

function appendBridgeDeck(builder, sections, thickness, role, surfaceDetail = null, profile = null) {
  const firstDistance = sections[0].distance;
  const lastDistance = sections.at(-1).distance;
  const span = Math.max(0, lastDistance - firstDistance);
  const { apronLength } = bridgePortalBandLengths(profile, span);
  const deckSurfaceDetail = structuralBridgeSurfaceDetail(surfaceDetail, profile);
  const top = sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: 4,
    surfaceDetail: Math.min(
      section.distance - firstDistance,
      lastDistance - section.distance
    ) <= apronLength + EPSILON
      ? surfaceDetail
      : deckSurfaceDetail,
    lateralDistances: (section.deckTopPositions || [
      section.roadLeft,
      section.roadCenter || section.center,
      section.roadRight
    ]).map(point => dot3(sub3(point, section.center), sectionHorizontalSide(section))),
    positions: (section.deckTopPositions || [
      section.roadLeft,
      section.roadCenter || section.center,
      section.roadRight
    ]).map(point => [...point])
  }));
  const bottom = sections.map((section, index) => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: top[index].positions.map(point => [point[0], point[1] - thickness, point[2]])
  }));
  appendStripWithCellRoles(
    builder,
    top,
    (start, end) => bridgeTopRoleForCell(
      start,
      end,
      profile,
      role,
      firstDistance,
      lastDistance
    ),
    [1, 1],
    true,
    surfaceDetail,
    `${role}-top`
  );
  appendStrip(builder, bottom.map(row => ({
    ...row,
    // Reverse the complete authored cross-section so every deck family keeps
    // both underside halves and outward winding on grades and urban sections.
    positions: [...row.positions].reverse()
  })), `${role}-underside`, [1, 1], true);
  appendStrip(builder, sections.map((section, index) => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: [bottom[index].positions[0], top[index].positions[0]]
  })), `${role}-left-edge`, [1, 1]);
  appendStrip(builder, sections.map((section, index) => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: [top[index].positions.at(-1), bottom[index].positions.at(-1)]
  })), `${role}-right-edge`, [1, 1]);
  const capQuadHasArea = (a, b, c, d) => (
    length3(cross3(sub3(b, a), sub3(c, a))) >= 1e-8
    || length3(cross3(sub3(d, b), sub3(c, b))) >= 1e-8
  );
  for (let column = 1; column < top[0].positions.length; column += 1) {
    const startCap = [
      top[0].positions[column], top[0].positions[column - 1],
      bottom[0].positions[column], bottom[0].positions[column - 1]
    ];
    if (capQuadHasArea(...startCap)) {
      appendQuad(
        builder,
        ...startCap,
        `${role}-start-face`
      );
    }
    const endCap = [
      top.at(-1).positions[column - 1], top.at(-1).positions[column],
      bottom.at(-1).positions[column - 1], bottom.at(-1).positions[column]
    ];
    if (capQuadHasArea(...endCap)) {
      appendQuad(
        builder,
        ...endCap,
        `${role}-end-face`
      );
    }
  }
}

function appendBridgeRailings(builder, sections, role) {
  const indices = sectionIndicesAtSpacing(sections, 2.5, true);
  for (const sideKey of ['deckLeft', 'deckRight']) {
    const railPoints = [];
    for (const index of indices) {
      const section = sections[index];
      const frame = sectionFrame(sections, index);
      const foot = add3(section[sideKey], scale3(frame.up, 0.08));
      const top = add3(foot, scale3(frame.up, 1.05));
      appendBeamBetween(builder, foot, top, 0.09, 0.09, `${role}-post`);
      railPoints.push(top);
    }
    for (let index = 1; index < railPoints.length; index += 1) {
      appendBeamBetween(builder, railPoints[index - 1], railPoints[index], 0.11, 0.11, `${role}-handrail`);
    }
  }
}

function abutmentColumns(section, side, deckThickness, lateralMargin) {
  const source = [...(section.deckTopPositions || [
    section.deckLeft,
    section.roadLeft,
    section.roadCenter || section.center,
    section.roadRight,
    section.deckRight
  ])]
    .filter(point => Array.isArray(point) && point.every(Number.isFinite))
    .sort((a, b) => dot3(sub3(a, section.center), side) - dot3(sub3(b, section.center), side));
  if (source.length < 2) return [];
  const left = add3(source[0], scale3(side, -lateralMargin));
  const right = add3(source.at(-1), scale3(side, lateralMargin));
  left[1] = source[0][1];
  right[1] = source.at(-1)[1];
  return [left, ...source, right].map(point => ({
    position: point,
    bearingY: point[1] - deckThickness
  }));
}

function sampledContact(baseHeightAt, point, topY, embed = 0.2) {
  const terrainY = finite(baseHeightAt(point[0], point[2]), topY - 1);
  return {
    terrainY,
    bottomY: Math.min(terrainY - embed, topY - Math.max(0.18, embed))
  };
}

function appendAbutmentWingwall(
  builder,
  section,
  columns,
  baseHeightAt,
  profile,
  materialRole,
  outward,
  side,
  sideSign,
  deckThickness
) {
  const edge = sideSign < 0 ? columns[0] : columns.at(-1);
  const structuralWidth = Math.max(profile.deckWidth, profile.clearWidth, profile.width);
  const seatLength = Math.max(0.4, finite(profile.abutmentSeatLength, 1.2));
  const length = clamp(seatLength + structuralWidth * 0.08, 1.6, 3.2);
  const flare = clamp(structuralWidth * 0.09, 0.35, 1.05);
  const thickness = clamp(structuralWidth * 0.045, 0.28, 0.52);
  const stationCount = 5;
  const startTopY = edge.bearingY - 0.06;
  const stations = [];
  for (let index = 0; index < stationCount; index += 1) {
    const amount = index / (stationCount - 1);
    const center = add3(
      add3(
        edge.position,
        scale3(outward, seatLength * 0.35 + length * amount)
      ),
      scale3(side, sideSign * (0.12 + flare * smoothstep01(amount)))
    );
    const left = add3(center, scale3(side, -thickness * 0.5));
    const right = add3(center, scale3(side, thickness * 0.5));
    const leftTerrain = finite(baseHeightAt(left[0], left[2]), startTopY - 1);
    const rightTerrain = finite(baseHeightAt(right[0], right[2]), startTopY - 1);
    const terrainCrest = Math.max(leftTerrain, rightTerrain);
    const desiredTop = lerp(startTopY, terrainCrest + 0.62, smoothstep01(amount));
    const topY = Math.min(startTopY, Math.max(terrainCrest + 0.42, desiredTop));
    stations.push({
      leftTop: [left[0], topY, left[2]],
      rightTop: [right[0], topY, right[2]],
      leftBottom: [left[0], Math.min(leftTerrain - 0.2, topY - 0.24), left[2]],
      rightBottom: [right[0], Math.min(rightTerrain - 0.2, topY - 0.24), right[2]]
    });
  }
  for (let index = 1; index < stations.length; index += 1) {
    const near = stations[index - 1];
    const far = stations[index];
    const cellForward = normalize3(
      sub3(
        scale3(add3(far.leftTop, far.rightTop), 0.5),
        scale3(add3(near.leftTop, near.rightTop), 0.5)
      ),
      outward
    );
    appendContactCell(builder, {
      nearLeftTop: near.leftTop,
      nearRightTop: near.rightTop,
      farLeftTop: far.leftTop,
      farRightTop: far.rightTop,
      nearLeftBottom: near.leftBottom,
      nearRightBottom: near.rightBottom,
      farLeftBottom: far.leftBottom,
      farRightBottom: far.rightBottom
    }, `${materialRole}-abutment-wingwall`, cellForward, side);
  }
}

function appendBridgeAbutments(
  builder,
  sections,
  baseHeightAt,
  profile,
  materialRole = 'bridge-concrete',
  deckThickness = profile.deckThickness
) {
  const structuralWidth = Math.max(profile.deckWidth, profile.clearWidth, profile.width);
  const lateralMargin = clamp(structuralWidth * 0.075, 0.4, 0.85);
  const seatLength = Math.max(0.4, finite(profile.abutmentSeatLength, 1.2));
  for (const index of [0, sections.length - 1]) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    const direction = index === 0 ? -1 : 1;
    const horizontalTangent = normalize3([frame.tangent[0], 0, frame.tangent[2]], [0, 0, 1]);
    const outward = scale3(horizontalTangent, direction);
    const side = sectionHorizontalSide(section);
    const columns = abutmentColumns(section, side, deckThickness, lateralMargin);
    if (columns.length < 2) continue;
    for (let column = 1; column < columns.length; column += 1) {
      const left = columns[column - 1];
      const right = columns[column];
      const nearLeftTop = [left.position[0], left.bearingY, left.position[2]];
      const nearRightTop = [right.position[0], right.bearingY, right.position[2]];
      const farLeftTop = add3(nearLeftTop, scale3(outward, seatLength));
      const farRightTop = add3(nearRightTop, scale3(outward, seatLength));
      farLeftTop[1] -= Math.min(0.14, seatLength * 0.05);
      farRightTop[1] -= Math.min(0.14, seatLength * 0.05);
      const nearLeftContact = sampledContact(baseHeightAt, nearLeftTop, nearLeftTop[1]);
      const nearRightContact = sampledContact(baseHeightAt, nearRightTop, nearRightTop[1]);
      const farLeftContact = sampledContact(baseHeightAt, farLeftTop, farLeftTop[1]);
      const farRightContact = sampledContact(baseHeightAt, farRightTop, farRightTop[1]);
      appendContactCell(builder, {
        nearLeftTop,
        nearRightTop,
        farLeftTop,
        farRightTop,
        nearLeftBottom: [nearLeftTop[0], nearLeftContact.bottomY, nearLeftTop[2]],
        nearRightBottom: [nearRightTop[0], nearRightContact.bottomY, nearRightTop[2]],
        farLeftBottom: [farLeftTop[0], farLeftContact.bottomY, farLeftTop[2]],
        farRightBottom: [farRightTop[0], farRightContact.bottomY, farRightTop[2]]
      }, `${materialRole}-abutment-backwall`, outward, side);

      const footingNearLeftTopY = Math.min(nearLeftContact.terrainY + 0.04, nearLeftTop[1] - 0.12);
      const footingNearRightTopY = Math.min(nearRightContact.terrainY + 0.04, nearRightTop[1] - 0.12);
      const footingFarLeftTopY = Math.min(farLeftContact.terrainY + 0.04, farLeftTop[1] - 0.12);
      const footingFarRightTopY = Math.min(farRightContact.terrainY + 0.04, farRightTop[1] - 0.12);
      appendContactCell(builder, {
        nearLeftTop: [nearLeftTop[0], footingNearLeftTopY, nearLeftTop[2]],
        nearRightTop: [nearRightTop[0], footingNearRightTopY, nearRightTop[2]],
        farLeftTop: [farLeftTop[0], footingFarLeftTopY, farLeftTop[2]],
        farRightTop: [farRightTop[0], footingFarRightTopY, farRightTop[2]],
        nearLeftBottom: [nearLeftTop[0], footingNearLeftTopY - 0.48, nearLeftTop[2]],
        nearRightBottom: [nearRightTop[0], footingNearRightTopY - 0.48, nearRightTop[2]],
        farLeftBottom: [farLeftTop[0], footingFarLeftTopY - 0.48, farLeftTop[2]],
        farRightBottom: [farRightTop[0], footingFarRightTopY - 0.48, farRightTop[2]]
      }, `${materialRole}-abutment-footing`, outward, side);
    }
    for (const sideSign of [-1, 1]) {
      appendAbutmentWingwall(
        builder,
        section,
        columns,
        baseHeightAt,
        profile,
        materialRole,
        outward,
        side,
        sideSign,
        deckThickness
      );
    }
  }
}

function appendTimberTrestle(builder, segment, sections, baseHeightAt, profile, surfaceDetail = null) {
  appendBridgeDeck(builder, sections, profile.deckThickness, 'bridge-timber-deck', surfaceDetail, profile);
  for (let index = 1; index < sections.length; index += 1) {
    for (const key of ['deckLeft', 'deckRight']) {
      const start = [...sections[index - 1][key]];
      const end = [...sections[index][key]];
      start[1] -= profile.deckThickness + 0.18;
      end[1] -= profile.deckThickness + 0.18;
      appendBeamBetween(builder, start, end, 0.22, 0.32, 'bridge-timber-longitudinal-beam');
    }
  }
  for (const index of sectionIndicesAtSpacing(sections, 2.4, true)) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    const left = add3(section.roadLeft, scale3(frame.up, -profile.deckThickness - 0.14));
    const right = add3(section.roadRight, scale3(frame.up, -profile.deckThickness - 0.14));
    appendBeamBetween(builder, left, right, 0.2, 0.25, 'bridge-timber-crossbeam');
  }
  const supportSpacing = Math.max(4, profile.supportSpacing || 6);
  for (const index of sectionIndicesAtSpacing(sections, supportSpacing)) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    const posts = [];
    for (const sign of [-1, 1]) {
      const top = add3(
        add3(section.center, scale3(frame.side, sign * profile.deckWidth * 0.34)),
        scale3(frame.up, -profile.deckThickness)
      );
      const groundY = finite(baseHeightAt(top[0], top[2]), top[1] - 1);
      const bottom = [top[0], groundY, top[2]];
      appendBeamBetween(builder, bottom, top, 0.28, 0.28, 'bridge-timber-trestle-post');
      posts.push({ top, bottom });
    }
    appendBeamBetween(builder, posts[0].bottom, posts[1].top, 0.16, 0.16, 'bridge-timber-cross-brace');
    appendBeamBetween(builder, posts[1].bottom, posts[0].top, 0.16, 0.16, 'bridge-timber-cross-brace');
  }
  appendBridgeAbutments(builder, sections, baseHeightAt, profile, 'bridge-timber');
  if (profile.railings) appendBridgeRailings(builder, sections, 'bridge-timber-railing');
}

function appendStoneArch(builder, segment, sections, baseHeightAt, profile, surfaceDetail = null) {
  appendBridgeDeck(
    builder,
    sections,
    profile.deckThickness + 0.18,
    'bridge-stone-deck',
    surfaceDetail,
    profile
  );
  const firstDistance = sections[0].distance;
  const span = Math.max(EPSILON, sections.at(-1).distance - firstDistance);
  for (const key of ['deckLeft', 'deckRight']) {
    const arch = sections.map(section => {
      const fraction = clamp((section.distance - firstDistance) / span, 0, 1);
      const edge = section[key];
      const ground = finite(baseHeightAt(edge[0], edge[2]), edge[1] - 1);
      const archFactor = Math.sqrt(Math.max(0, 1 - ((fraction - 0.5) / 0.5) ** 2));
      return [
        edge[0],
        Math.min(
          edge[1] - 0.18,
          ground + Math.max(0.3, edge[1] - ground - profile.deckThickness - 0.25) * archFactor
        ),
        edge[2]
      ];
    });
    appendStrip(builder, sections.map((section, index) => ({
      distance: section.distance,
      textureRepeatLength: 3,
      positions: [section[key], arch[index]]
    })), 'bridge-stone-spandrel', [1, 1]);
    for (let index = 1; index < arch.length; index += 1) {
      appendBeamBetween(builder, arch[index - 1], arch[index], 0.34, 0.42, 'bridge-stone-arch-ring');
    }
  }
  appendBridgeAbutments(
    builder,
    sections,
    baseHeightAt,
    profile,
    'bridge-stone',
    profile.deckThickness + 0.18
  );
  if (profile.railings) appendBridgeRailings(builder, sections, 'bridge-stone-parapet');
}

function appendSteelGirder(builder, segment, sections, baseHeightAt, profile, surfaceDetail = null) {
  appendBridgeDeck(builder, sections, profile.deckThickness, 'bridge-concrete-deck', surfaceDetail, profile);
  const girderCount = clamp(Math.round(profile.deckWidth / 2) + 2, 3, 8);
  for (let index = 1; index < sections.length; index += 1) {
    for (let girder = 0; girder < girderCount; girder += 1) {
      const amount = girderCount === 1 ? 0.5 : girder / (girderCount - 1);
      const start = mix3(sections[index - 1].deckLeft, sections[index - 1].deckRight, amount);
      const end = mix3(sections[index].deckLeft, sections[index].deckRight, amount);
      start[1] -= profile.deckThickness + 0.45;
      end[1] -= profile.deckThickness + 0.45;
      appendBeamBetween(builder, start, end, 0.24, 0.72, 'bridge-steel-main-girder');
    }
  }
  for (const index of sectionIndicesAtSpacing(sections, 4, true)) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    const left = add3(section.roadLeft, scale3(frame.up, -profile.deckThickness - 0.34));
    const right = add3(section.roadRight, scale3(frame.up, -profile.deckThickness - 0.34));
    appendBeamBetween(builder, left, right, 0.24, 0.4, 'bridge-steel-cross-girder');
  }
  const pierSpacing = Math.max(18, profile.supportSpacing || 24);
  for (const index of sectionIndicesAtSpacing(sections, pierSpacing)) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    const groundY = finite(baseHeightAt(section.center[0], section.center[2]), section.center[1] - 1);
    const capY = section.center[1] - profile.deckThickness - 0.48;
    const height = Math.max(0.4, capY - groundY);
    appendOrientedBox(
      builder,
      [section.center[0], groundY + 0.24, section.center[2]],
      frame.tangent,
      frame.side,
      frame.up,
      [2.4, Math.max(2.6, profile.deckWidth + 1.8), 0.48],
      'bridge-concrete-pier-footing'
    );
    const lowerSpread = Math.max(0.9, profile.deckWidth * 0.28);
    const upperSpread = Math.max(1.15, profile.deckWidth * 0.4);
    const columnWidth = clamp(0.7 + height * 0.035, 0.9, 1.7);
    const columnDepth = clamp(0.85 + height * 0.025, 1.05, 1.55);
    const columnEnds = [];
    for (const sign of [-1, 1]) {
      const bottom = add3(
        [section.center[0], groundY + 0.42, section.center[2]],
        scale3(frame.side, sign * lowerSpread)
      );
      const top = add3(
        [section.center[0], capY - 0.18, section.center[2]],
        scale3(frame.side, sign * upperSpread)
      );
      appendBeamBetween(
        builder,
        bottom,
        top,
        columnWidth,
        columnDepth,
        'bridge-concrete-pier-column'
      );
      columnEnds.push({ bottom, top });
    }
    if (height > 5) {
      appendBeamBetween(
        builder,
        mix3(columnEnds[0].bottom, columnEnds[0].top, 0.22),
        mix3(columnEnds[1].bottom, columnEnds[1].top, 0.78),
        clamp(columnWidth * 0.34, 0.34, 0.58),
        clamp(columnDepth * 0.42, 0.42, 0.7),
        'bridge-concrete-pier-brace'
      );
      appendBeamBetween(
        builder,
        mix3(columnEnds[1].bottom, columnEnds[1].top, 0.22),
        mix3(columnEnds[0].bottom, columnEnds[0].top, 0.78),
        clamp(columnWidth * 0.34, 0.34, 0.58),
        clamp(columnDepth * 0.42, 0.42, 0.7),
        'bridge-concrete-pier-brace'
      );
    }
    const capLeft = add3(
      [section.center[0], capY, section.center[2]],
      scale3(frame.side, -(profile.deckWidth * 0.5 + 0.7))
    );
    const capRight = add3(
      [section.center[0], capY, section.center[2]],
      scale3(frame.side, profile.deckWidth * 0.5 + 0.7)
    );
    appendBeamBetween(
      builder,
      capLeft,
      capRight,
      1.05,
      0.94,
      'bridge-concrete-pier-cap'
    );
  }
  appendBridgeAbutments(builder, sections, baseHeightAt, profile, 'bridge-concrete');
  if (profile.railings) appendBridgeRailings(builder, sections, 'bridge-steel-railing');
}

function appendMasonryCauseway(builder, segment, sections, baseHeightAt, profile, surfaceDetail = null) {
  appendBridgeDeck(
    builder,
    sections,
    profile.deckThickness + 0.2,
    'bridge-masonry-deck',
    surfaceDetail,
    profile
  );
  for (const key of ['deckLeft', 'deckRight']) {
    appendStrip(builder, sections.map(section => {
      const top = section[key];
      return {
        distance: section.distance,
        textureRepeatLength: 2.5,
        positions: [top, [top[0], finite(baseHeightAt(top[0], top[2]), top[1] - 0.5), top[2]]]
      };
    }), 'bridge-masonry-sidewall', [1, 1]);
  }
  appendBridgeAbutments(
    builder,
    sections,
    baseHeightAt,
    profile,
    'bridge-masonry',
    profile.deckThickness + 0.2
  );
  if (profile.railings) appendBridgeRailings(builder, sections, 'bridge-masonry-parapet');
}

function appendRopeFootbridge(builder, segment, sections, baseHeightAt, profile) {
  for (const index of sectionIndicesAtSpacing(sections, 0.55, true)) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    appendOrientedBox(
      builder,
      add3(section.center, scale3(frame.up, 0.04)),
      frame.tangent,
      frame.side,
      frame.up,
      [0.46, profile.clearWidth, 0.14],
      'bridge-timber-deck-slat'
    );
  }
  const railIndices = sectionIndicesAtSpacing(sections, 1.8, true);
  const firstDistance = sections[0].distance;
  const span = Math.max(EPSILON, sections.at(-1).distance - firstDistance);
  for (const key of ['roadLeft', 'roadRight']) {
    const handrail = [];
    for (const index of railIndices) {
      const section = sections[index];
      const frame = sectionFrame(sections, index);
      const fraction = clamp((section.distance - firstDistance) / span, 0, 1);
      const sag = Math.sin(Math.PI * fraction) * 0.22;
      const deckPoint = add3(section[key], scale3(frame.up, 0.08));
      const railPoint = add3(deckPoint, scale3(frame.up, 1.15 - sag));
      appendBeamBetween(builder, deckPoint, railPoint, 0.065, 0.065, 'bridge-rope-hanger');
      handrail.push(railPoint);
    }
    for (let index = 1; index < handrail.length; index += 1) {
      appendBeamBetween(builder, handrail[index - 1], handrail[index], 0.09, 0.09, 'bridge-rope-handrail');
    }
  }
  for (const section of [sections[0], sections.at(-1)]) {
    const frame = sectionFrame(sections, sections.indexOf(section));
    for (const sign of [-1, 1]) {
      const foot = add3(section.center, scale3(frame.side, sign * profile.deckWidth * 0.6));
      const top = add3(foot, scale3(frame.up, 1.5));
      appendBeamBetween(builder, foot, top, 0.24, 0.24, 'bridge-timber-anchor-post');
    }
  }
  appendBridgeAbutments(builder, sections, baseHeightAt, profile, 'bridge-timber');
}

function crossSectionsBySegment(terrainModifier) {
  const result = new Map();
  for (const section of terrainModifier?.crossSections || []) {
    if (!result.has(section.segmentId)) result.set(section.segmentId, []);
    result.get(section.segmentId).push(section);
  }
  return result;
}

function appendEarthwork(builder, segment, sections) {
  if (
    !sections.length
    || !['conform', 'cut-fill', 'retaining-wall', 'stairs'].includes(segment.construction.mode)
  ) return;
  const repeat = Math.max(0.25, segment.crossSectionProfile.textureRepeatLength || 5);
  appendStrip(builder, sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: repeat,
    positions: [section.outerLeft, section.shoulderLeft]
  })), 'left-earthwork', [0, 0.45], true);
  appendStrip(builder, sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: repeat,
    positions: [section.shoulderRight, section.outerRight]
  })), 'right-earthwork', [0.45, 0], true);
}

function appendRetainingWalls(builder, segment, sections) {
  if (segment.construction.mode !== 'retaining-wall' || sections.length < 2) return;
  for (const side of ['Left', 'Right']) {
    const topKey = `shoulder${side}`;
    const terrainKey = `terrainShoulder${side}`;
    const rows = sections.map(section => ({
      distance: section.distance,
      textureRepeatLength: 3,
      positions: [
        section[topKey],
        [
          section[terrainKey][0],
          Math.min(section[terrainKey][1], section[topKey][1] - 0.05),
          section[terrainKey][2]
        ]
      ]
    }));
    appendStrip(builder, rows, `retaining-wall-${side.toLowerCase()}`, [1, 1]);
  }
}

function appendBridge(
  builder,
  navigationBuilder,
  segment,
  sections,
  baseHeightAt,
  resolvedProfile = null,
  surfaceDetail = null,
  sectionStateAt = null
) {
  if (segment.construction.mode !== 'bridge' || sections.length < 2) return null;
  const profile = resolvedProfile || resolveBridgeProfile(segment, sections, baseHeightAt);
  const bridgeSections = bridgeSectionsForProfile(segment, sections, profile, sectionStateAt);
  const bridgeSurfaceDetail = surfaceDetail
    ? new Float32Array(surfaceDetail)
    : null;
  if (bridgeSurfaceDetail) bridgeSurfaceDetail[15] = profile.clearWidth;
  appendStrip(
    navigationBuilder,
    bridgeNavigationRows(bridgeSections),
    'navigation-bridge-deck',
    [1, 1, 1]
  );
  if (profile.carrySidewalks) {
    for (const sideSign of [-1, 1]) {
      const rows = bridgeSidewalkNavigationRows(segment, bridgeSections, sideSign);
      if (rows.length) {
        appendStrip(
          navigationBuilder,
          rows,
          'navigation-bridge-sidewalk',
          [1, 1],
          true
        );
      }
    }
  }
  if (profile.bridgeStyle === 'timber-trestle') {
    appendTimberTrestle(builder, segment, bridgeSections, baseHeightAt, profile, bridgeSurfaceDetail);
  } else if (profile.bridgeStyle === 'stone-arch') {
    appendStoneArch(builder, segment, bridgeSections, baseHeightAt, profile, bridgeSurfaceDetail);
  } else if (profile.bridgeStyle === 'steel-girder') {
    appendSteelGirder(builder, segment, bridgeSections, baseHeightAt, profile, bridgeSurfaceDetail);
  } else if (profile.bridgeStyle === 'masonry-causeway') {
    appendMasonryCauseway(builder, segment, bridgeSections, baseHeightAt, profile, bridgeSurfaceDetail);
  } else if (profile.bridgeStyle === 'rope-footbridge') {
    appendRopeFootbridge(builder, segment, bridgeSections, baseHeightAt, profile);
  } else {
    throw new Error(`Unsupported bridge profile ${profile.bridgeStyle}.`);
  }
  return profile;
}

function appendTunnel(builder, segment) {
  if (segment.construction.mode !== 'tunnel' || segment.samples.length < 2) return;
  const halfWidth = segment.crossSectionProfile.width * 0.5 + Math.max(0.5, segment.crossSectionProfile.shoulderWidth);
  const clearance = Math.max(3, segment.crossSectionProfile.width * 0.65);
  const archSegments = 10;
  const rows = segment.samples.map(sample => ({
    distance: sample.distance,
    textureRepeatLength: 4,
    positions: Array.from({ length: archSegments + 1 }, (_, index) => {
      const angle = Math.PI - Math.PI * index / archSegments;
      const lateral = Math.cos(angle) * halfWidth;
      const vertical = Math.sin(angle) * clearance;
      return add3(
        add3(sample.position, scale3(sample.side, lateral)),
        scale3(sample.normal, vertical)
      );
    })
  }));
  appendStrip(builder, rows, 'tunnel-lining', [1, 1]);
}

function sampleAtDistance(samples, target) {
  if (!samples.length) return null;
  if (target <= samples[0].distance + EPSILON) return samples[0];
  if (target >= samples.at(-1).distance - EPSILON) return samples.at(-1);
  let index = 1;
  while (index < samples.length - 1 && samples[index].distance < target) index += 1;
  const start = samples[index - 1];
  const end = samples[index];
  if (Math.abs(start.distance - target) <= EPSILON) return start;
  if (Math.abs(end.distance - target) <= EPSILON) return end;
  const t = clamp((target - start.distance) / Math.max(EPSILON, end.distance - start.distance), 0, 1);
  return {
    ...start,
    t: lerp(finite(start.t), finite(end.t, start.t), t),
    position: add3(start.position, scale3(sub3(end.position, start.position), t)),
    baseY: lerp(finite(start.baseY, start.position[1]), finite(end.baseY, end.position[1]), t),
    terrainNormal: normalize3(mix3(start.terrainNormal, end.terrainNormal, t), [0, 1, 0]),
    tangent: normalize3(mix3(start.tangent, end.tangent, t), start.tangent),
    side: normalize3(mix3(start.side, end.side, t), start.side),
    normal: normalize3(mix3(start.normal, end.normal, t), start.normal),
    curveTangent: normalize3(mix3(start.curveTangent, end.curveTangent, t), start.curveTangent),
    curvature: lerp(finite(start.curvature), finite(end.curvature), t),
    distance: target
  };
}

function samplesForInterval(samples, interval) {
  if (!samples?.length) return [];
  const startDistance = clamp(
    finite(interval?.startDistance, samples[0].distance),
    samples[0].distance,
    samples.at(-1).distance
  );
  const endDistance = clamp(
    finite(interval?.endDistance, samples.at(-1).distance),
    startDistance,
    samples.at(-1).distance
  );
  if (endDistance - startDistance <= EPSILON) return [];
  const result = [sampleAtDistance(samples, startDistance)];
  result.push(...samples.filter(sample => (
    sample.distance > startDistance + EPSILON
    && sample.distance < endDistance - EPSILON
  )));
  const end = sampleAtDistance(samples, endDistance);
  if (Math.abs(end.distance - result.at(-1).distance) > EPSILON) result.push(end);
  return result;
}

const CROSS_SECTION_VECTOR_KEYS = Object.freeze([
  'center',
  'roadLeft',
  'roadCenter',
  'roadRight',
  'shoulderLeft',
  'shoulderRight',
  'terrainShoulderLeft',
  'terrainShoulderRight',
  'outerLeft',
  'outerRight'
]);

function crossSectionAtDistance(sections, target) {
  if (!sections.length) return null;
  if (target <= sections[0].distance + EPSILON) return sections[0];
  if (target >= sections.at(-1).distance - EPSILON) return sections.at(-1);
  let index = 1;
  while (index < sections.length - 1 && sections[index].distance < target) index += 1;
  const start = sections[index - 1];
  const end = sections[index];
  if (Math.abs(start.distance - target) <= EPSILON) return start;
  if (Math.abs(end.distance - target) <= EPSILON) return end;
  const amount = clamp(
    (target - start.distance) / Math.max(EPSILON, end.distance - start.distance),
    0,
    1
  );
  const result = { ...start, distance: target };
  for (const key of CROSS_SECTION_VECTOR_KEYS) {
    if (Array.isArray(start[key]) && Array.isArray(end[key])) {
      result[key] = mix3(start[key], end[key], amount);
    }
  }
  result.outerBoundaryKeys = [
    `${start.segmentId}:${target.toFixed(5)}:left`,
    `${start.segmentId}:${target.toFixed(5)}:right`
  ];
  return result;
}

function smoothstep01(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function directJunctionBridgeSeams(prepared, range, profile) {
  const startDistance = finite(range?.startDistance);
  const endDistance = Math.max(startDistance, finite(range?.endDistance, startDistance));
  const availableLength = Math.max(0, endDistance - startDistance);
  if (availableLength <= EPSILON) return [];
  const candidates = [];
  const add = (endpoint, portal, station, nodeId) => {
    if (!portal) return;
    const portalWidth = distance3(portal.left, portal.right);
    candidates.push({
      endpoint,
      nodeId,
      station,
      portal,
      portalWidth,
      portalHalfWidth: portalWidth * 0.5
    });
  };
  if (
    prepared.fromPortal
    && Math.abs(startDistance - finite(prepared.samples?.[0]?.distance)) <= EPSILON
  ) {
    add('from', prepared.fromPortal, startDistance, prepared.segment.fromNode);
  }
  if (
    prepared.toPortal
    && Math.abs(endDistance - finite(prepared.samples?.at(-1)?.distance)) <= EPSILON
  ) {
    add('to', prepared.toPortal, endDistance, prepared.segment.toNode);
  }
  const maximumPerSeam = availableLength / Math.max(1, candidates.length);
  const transitionLength = Math.max(
    0.05,
    Math.min(finite(profile?.approachTaperLength, 5), maximumPerSeam)
  );
  return candidates.map(seam => Object.freeze({ ...seam, transitionLength }));
}

function bridgeCrossSectionStateWithJunctionSeams(
  crossSectionProfile,
  distance,
  bridgeAuthorities
) {
  const base = bridgeCrossSectionState(crossSectionProfile, distance, bridgeAuthorities);
  let selected = null;
  let amount = 0;
  for (const authority of bridgeAuthorities || []) {
    for (const seam of authority.junctionSeams || []) {
      const inwardDistance = seam.endpoint === 'from'
        ? distance - seam.station
        : seam.station - distance;
      if (inwardDistance < -EPSILON || inwardDistance > seam.transitionLength + EPSILON) continue;
      const candidate = 1 - smoothstep01(inwardDistance / Math.max(EPSILON, seam.transitionLength));
      if (
        candidate > amount
        || (
          Math.abs(candidate - amount) <= 1e-9
          && String(seam.nodeId).localeCompare(String(selected?.nodeId || '')) < 0
        )
      ) {
        selected = seam;
        amount = candidate;
      }
    }
  }
  if (!selected || amount <= EPSILON) return base;
  const roadHalfWidth = lerp(base.roadHalfWidth, selected.portalHalfWidth, amount);
  const widthDelta = roadHalfWidth - base.roadHalfWidth;
  return Object.freeze({
    ...base,
    roadHalfWidth,
    roadWidth: roadHalfWidth * 2,
    surfaceDetailRoadWidth: roadHalfWidth * 2,
    leftOuterEdge: Math.max(roadHalfWidth, base.leftOuterEdge + widthDelta),
    rightOuterEdge: Math.max(roadHalfWidth, base.rightOuterEdge + widthDelta),
    maximumOuterEdge: Math.max(roadHalfWidth, base.maximumOuterEdge + widthDelta),
    exclusionHalfWidth: Math.max(roadHalfWidth, base.exclusionHalfWidth + widthDelta),
    junctionSeamAmount: amount,
    junctionSeam: selected
  });
}

function appendStairs(builder, segment, engineering) {
  if (segment.construction.mode !== 'stairs' || segment.samples.length < 2) return false;
  const samples = segment.samples;
  const totalLength = samples.at(-1).distance;
  const rise = samples.at(-1).position[1] - samples[0].position[1];
  const maximumRise = Math.max(0.05, finite(engineering?.stairMaximumRise, 0.19));
  const minimumRun = Math.max(0.15, finite(engineering?.stairMinimumRun, 0.28));
  const neededForRise = Math.max(1, Math.ceil(Math.abs(rise) / maximumRise));
  const possibleByRun = Math.max(1, Math.floor(totalLength / minimumRun));
  const stepCount = Math.min(4096, Math.max(1, Math.min(neededForRise, possibleByRun)));
  const halfWidth = segment.crossSectionProfile.width * 0.5;
  let previousEnd = null;
  for (let index = 0; index < stepCount; index += 1) {
    const start = sampleAtDistance(samples, totalLength * index / stepCount);
    const end = sampleAtDistance(samples, totalLength * (index + 1) / stepCount);
    const y = lerp(samples[0].position[1], samples.at(-1).position[1], index / stepCount);
    const nextY = lerp(samples[0].position[1], samples.at(-1).position[1], (index + 1) / stepCount);
    const leftStart = add3([start.position[0], y, start.position[2]], scale3(start.side, -halfWidth));
    const rightStart = add3([start.position[0], y, start.position[2]], scale3(start.side, halfWidth));
    const leftEnd = add3([end.position[0], y, end.position[2]], scale3(end.side, -halfWidth));
    const rightEnd = add3([end.position[0], y, end.position[2]], scale3(end.side, halfWidth));
    appendQuad(builder, leftStart, rightStart, leftEnd, rightEnd, 'stair-tread');
    if (index < stepCount - 1 && Math.abs(nextY - y) > EPSILON) {
      appendQuad(
        builder,
        leftEnd,
        rightEnd,
        [leftEnd[0], nextY, leftEnd[2]],
        [rightEnd[0], nextY, rightEnd[2]],
        'stair-riser'
      );
    }
    previousEnd = [leftEnd, rightEnd];
  }
  return Boolean(previousEnd);
}

function intervalSegment(segment, interval, availableSamples = segment.samples) {
  const samples = samplesForInterval(availableSamples, interval);
  return {
    ...segment,
    samples,
    construction: {
      mode: interval.mode,
      reason: interval.reason,
      automatic: interval.automatic
    }
  };
}

function sectionsForInterval(sections, interval) {
  if (!sections?.length) return [];
  const startDistance = clamp(
    finite(interval?.startDistance, sections[0].distance),
    sections[0].distance,
    sections.at(-1).distance
  );
  const endDistance = clamp(
    finite(interval?.endDistance, sections.at(-1).distance),
    startDistance,
    sections.at(-1).distance
  );
  if (endDistance - startDistance <= EPSILON) return [];
  const result = [crossSectionAtDistance(sections, startDistance)];
  result.push(...sections.filter(section => (
    section.distance > startDistance + EPSILON
    && section.distance < endDistance - EPSILON
  )));
  const end = crossSectionAtDistance(sections, endDistance);
  if (Math.abs(end.distance - result.at(-1).distance) > EPSILON) result.push(end);
  return result;
}

function constructionIntervalsForSurface(segment) {
  if (segment.constructionIntervals?.length) return segment.constructionIntervals;
  return [{
    segmentId: segment.id,
    startDistance: segment.samples[0]?.distance || 0,
    endDistance: segment.samples.at(-1)?.distance || 0,
    ...segment.construction
  }];
}

function intervalOwnsRoadSurface(mode) {
  return !['bridge', 'stairs', 'invalid'].includes(mode);
}

export function validatePathNetworkGeometry(meshes) {
  const errors = [];
  const meshReports = {};
  for (const [name, mesh] of Object.entries(meshes || {})) {
    let degenerateTriangles = 0;
    let nonFiniteValues = 0;
    let invalidIndices = 0;
    for (const value of mesh.positions || []) if (!Number.isFinite(value)) nonFiniteValues += 1;
    const vertexCount = (mesh.positions?.length || 0) / 3;
    for (let offset = 0; offset < (mesh.indices?.length || 0); offset += 3) {
      const indices = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
      if (!indices.every(index => Number.isInteger(index) && index >= 0 && index < vertexCount)) {
        invalidIndices += 1;
        continue;
      }
      const points = indices.map(index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
      if (length3(cross3(sub3(points[1], points[0]), sub3(points[2], points[0]))) < 1e-8) {
        degenerateTriangles += 1;
      }
    }
    if (nonFiniteValues) errors.push(`${name} contains ${nonFiniteValues} non-finite values.`);
    if (invalidIndices) errors.push(`${name} contains ${invalidIndices} invalid triangles.`);
    if (degenerateTriangles) errors.push(`${name} contains ${degenerateTriangles} degenerate triangles.`);
    meshReports[name] = {
      vertexCount,
      triangleCount: (mesh.indices?.length || 0) / 3,
      nonFiniteValues,
      invalidIndices,
      degenerateTriangles
    };
  }
  return { valid: errors.length === 0, errors, meshes: meshReports };
}

export function buildPathNetworkGeometry(compiled, options = {}) {
  if (!compiled?.diagnostics) throw new Error('A compiled path network is required.');
  const road = createMeshBuilder('road');
  const shoulder = createMeshBuilder('shoulder');
  const gutter = createMeshBuilder('gutter');
  const curb = createMeshBuilder('curb');
  const sidewalk = createMeshBuilder('sidewalk');
  const sidewalkEdge = createMeshBuilder('sidewalk-edge');
  const earthwork = createMeshBuilder('earthwork');
  const structure = createMeshBuilder('structure');
  const navigationSurface = createMeshBuilder('navigation-surface');
  const guides = { center: [], edges: [], construction: [], blockedCorridors: [] };
  // Invalid construction stays visible through the guide overlay but must not
  // create traversable render/collision/navigation surfaces. Valid segments in
  // the same connected graph remain usable instead of disappearing with the
  // invalid branch.
  const junctionAuthority = options.terrainModifier?.junctionAuthority
    || compilePathJunctionAuthority(compiled, options);
  const degree = junctionAuthority.degree;
  const sectionsBySegment = crossSectionsBySegment(options.terrainModifier);
  const baseHeightAt = options.terrainModifier?.baseHeightAt || (() => 0);
  const portalsByNode = junctionAuthority.portalsByNode;
  const preparedSegments = [];
  const bridgeSelections = [];

  for (const authoritySegment of junctionAuthority.preparedSegments) {
    const { segment } = authoritySegment;
    const prepared = authoritySegment;
    const surfaceDetail = pathSurfaceDetailRenderData(segment.surfaceDetailProfile, {
      pathId: compiled.sourceNetworkId,
      segmentId: segment.id,
      roadWidth: segment.crossSectionProfile.width
    });
    preparedSegments.push({ segment, surfaceDetail, ...prepared });
    if (prepared.fromPortal) prepared.fromPortal.surfaceDetail = surfaceDetail;
    if (prepared.toPortal) prepared.toPortal.surfaceDetail = surfaceDetail;
  }

  for (const prepared of preparedSegments) {
    const { segment, samples, surfaceDetail } = prepared;
    const constructionSections = sectionsBySegment.get(segment.id) || [];
    const bridgeAuthorities = [];
    for (const interval of constructionIntervalsForSurface(segment).filter(item => item.mode === 'bridge')) {
      const localSegment = intervalSegment(segment, interval, samples);
      if (localSegment.samples.length < 2) continue;
      const range = {
        ...interval,
        startDistance: localSegment.samples[0].distance,
        endDistance: localSegment.samples.at(-1).distance
      };
      const localSections = sectionsForInterval(constructionSections, range);
      if (localSections.length < 2) continue;
      const profile = resolveBridgeProfile(localSegment, localSections, baseHeightAt);
      const authority = {
        interval,
        startDistance: range.startDistance,
        endDistance: range.endDistance,
        profile
      };
      authority.junctionSeams = directJunctionBridgeSeams(prepared, range, profile);
      bridgeAuthorities.push(authority);
    }
    const sectionStateAt = distance => bridgeCrossSectionStateWithJunctionSeams(
      segment.crossSectionProfile,
      distance,
      bridgeAuthorities
    );
    const intervalSurfaces = [];
    for (const interval of constructionIntervalsForSurface(segment)) {
      const localSegment = intervalSegment(segment, interval, samples);
      if (localSegment.samples.length < 2) continue;
      const localRange = {
        ...interval,
        startDistance: localSegment.samples[0].distance,
        endDistance: localSegment.samples.at(-1).distance
      };
      const localSections = sectionsForInterval(constructionSections, localRange);
      if (intervalOwnsRoadSurface(interval.mode)) {
        const surfaceRows = roadRows(localSegment, localSegment.samples, sectionStateAt, surfaceDetail);
        appendStrip(road, surfaceRows, 'road-core', [1, 1, 1], false, surfaceDetail);
        appendStrip(
          navigationSurface,
          rowsWithoutSurfaceDetail(surfaceRows),
          'navigation-road',
          [1, 1, 1]
        );
        const layout = pathCrossSectionLayout(localSegment.crossSectionProfile);
        if (!layout.left.urban && layout.left.shoulderWidth > EPSILON) {
          appendStrip(
            shoulder,
            shoulderRows(localSegment, localSegment.samples, -1, sectionStateAt),
            'left-shoulder',
            [0.45, 1],
            true
          );
        }
        if (!layout.right.urban && layout.right.shoulderWidth > EPSILON) {
          appendStrip(
            shoulder,
            shoulderRows(localSegment, localSegment.samples, 1, sectionStateAt),
            'right-shoulder',
            [1, 0.45],
            true
          );
        }
        appendUrbanCrossSection(
          gutter,
          curb,
          sidewalk,
          sidewalkEdge,
          localSegment,
          localSegment.samples,
          sectionStateAt
        );
        for (const sideSign of [-1, 1]) {
          const rows = urbanRows(localSegment, localSegment.samples, sideSign, sectionStateAt);
          if (rows?.sidewalk?.length) {
            appendStrip(
              navigationSurface,
              rows.sidewalk,
              'navigation-sidewalk',
              [1, 1],
              true
            );
          }
        }
      } else if (interval.mode === 'stairs') {
        appendStairs(road, localSegment, compiled.engineering);
        appendStairs(navigationSurface, localSegment, compiled.engineering);
      }
      appendEarthwork(earthwork, localSegment, localSections);
      appendRetainingWalls(structure, localSegment, localSections);
      const bridgeAuthority = bridgeAuthorities.find(authority => (
        Math.abs(authority.startDistance - localRange.startDistance) <= EPSILON
        && Math.abs(authority.endDistance - localRange.endDistance) <= EPSILON
      ));
      const bridgeProfile = appendBridge(
        structure,
        navigationSurface,
        localSegment,
        localSections,
        baseHeightAt,
        bridgeAuthority?.profile,
        surfaceDetail,
        sectionStateAt
      );
      if (bridgeProfile) {
        const junctionSeams = (bridgeAuthority?.junctionSeams || []).map(seam => {
          const state = sectionStateAt(seam.station);
          const surfaceWidth = state.roadWidth;
          const widthDelta = surfaceWidth - seam.portalWidth;
          return {
            endpoint: seam.endpoint,
            nodeId: seam.nodeId,
            station: seam.station,
            transitionLength: seam.transitionLength,
            portalWidth: seam.portalWidth,
            surfaceWidth,
            widthDelta,
            compatible: Math.abs(widthDelta) <= 1e-5
          };
        });
        bridgeSelections.push({
          segmentId: segment.id,
          startDistance: interval.startDistance,
          endDistance: interval.endDistance,
          bridgeStyle: bridgeProfile.bridgeStyle,
          label: bridgeProfile.label,
          span: bridgeProfile.span,
          width: bridgeProfile.width,
          clearWidth: bridgeProfile.clearWidth,
          deckWidth: bridgeProfile.deckWidth,
          deckThickness: bridgeProfile.deckThickness,
          approachTaperLength: bridgeProfile.approachTaperLength,
          abutmentSeatLength: bridgeProfile.abutmentSeatLength,
          carrySidewalks: bridgeProfile.carrySidewalks,
          maximumClearance: bridgeProfile.maximumClearance,
          supportSpacing: bridgeProfile.supportSpacing,
          junctionSeams,
          valid: bridgeProfile.valid,
          compatibilityDiagnostics: bridgeProfile.compatibilityDiagnostics
        });
      }
      appendTunnel(structure, localSegment);
      intervalSurfaces.push({
        mode: interval.mode,
        rows: roadRows(localSegment, localSegment.samples, sectionStateAt, surfaceDetail),
        surfaceDetail
      });
    }
    const isFromDeadEnd = (degree.get(segment.fromNode) || 0) === 1;
    const isToDeadEnd = (degree.get(segment.toNode) || 0) === 1;
    const firstSurface = intervalSurfaces[0];
    const lastSurface = intervalSurfaces.at(-1);
    if (isFromDeadEnd && intervalOwnsRoadSurface(firstSurface?.mode)) {
      appendEndCap(road, firstSurface.rows[0], 'dead-end-cap', firstSurface.surfaceDetail);
    }
    if (isToDeadEnd && intervalOwnsRoadSurface(lastSurface?.mode)) {
      appendEndCap(road, lastSurface.rows.at(-1), 'dead-end-cap', lastSurface.surfaceDetail);
    }
  }

  // Guides come from the exact compiled samples for every authored segment,
  // including blocked intervals, so invalid work never vanishes.
  for (const segment of compiled.segments) {
    const rows = roadRows(segment, segment.samples);
    for (let index = 0; index < rows.length - 1; index += 1) {
      guides.center.push(...rows[index].positions[1], ...rows[index + 1].positions[1]);
      guides.edges.push(
        ...rows[index].positions[0], ...rows[index + 1].positions[0],
        ...rows[index].positions[2], ...rows[index + 1].positions[2]
      );
    }
    if (segment.construction.mode === 'invalid') {
      guides.blockedCorridors.push(blockedCorridorGuide(segment));
    }
  }

  const junctionReports = [];
  for (const sharedJunction of junctionAuthority.junctions) {
    const junction = sharedJunction;
    const report = appendJunction(road, junction, portalsByNode, options, sharedJunction);
    const navigationReport = report.error
      ? { ...report, triangleCount: 0 }
      : appendTriangulatedPolygon(
        navigationSurface,
        junction,
        sharedJunction,
        'navigation-junction'
      );
    const surfaceReports = report.error
      ? []
      : appendUrbanJunctionSurfaces(
        { gutter, curb, sidewalk, sidewalkEdge },
        junction,
        portalsByNode,
        options,
        report
      );
    junctionReports.push({
      nodeId: junction.nodeId,
      portalCount: report.portals.length,
      ringVertexCount: report.ring.length,
      triangleCount: report.triangleCount,
      deviation: report.deviation,
      fallback: report.fallback || null,
      error: report.error,
      navigationTriangleCount: navigationReport.triangleCount,
      navigationError: navigationReport.error || null,
      surfaceReports
    });
    if (!report.error) {
      for (let index = 0; index < report.ring.length; index += 1) {
        const next = report.ring[(index + 1) % report.ring.length];
        guides.construction.push(...report.ring[index], ...next);
      }
    }
  }

  const meshes = {
    road: finalizeMesh(road),
    shoulder: finalizeMesh(shoulder),
    gutter: finalizeMesh(gutter),
    curb: finalizeMesh(curb),
    sidewalk: finalizeMesh(sidewalk),
    sidewalkEdge: finalizeMesh(sidewalkEdge),
    earthwork: finalizeMesh(earthwork),
    structure: finalizeMesh(structure)
  };
  const navigationMeshes = {
    surface: finalizeMesh(navigationSurface)
  };
  const validation = validatePathNetworkGeometry({
    ...meshes,
    'navigation-surface': navigationMeshes.surface
  });
  const junctionErrors = junctionReports.filter(report => report.error);
  const junctionSurfaceErrors = junctionReports.flatMap(report => (
    report.surfaceReports || []
  ).filter(surface => surface.error).map(surface => ({ ...surface, nodeId: report.nodeId })));
  if (junctionErrors.length) {
    validation.valid = false;
    validation.errors.push(...junctionErrors.map(report => `Junction ${report.nodeId} failed: ${report.error}.`));
  }
  if (junctionSurfaceErrors.length) {
    validation.valid = false;
    validation.errors.push(...junctionSurfaceErrors.map(report => (
      `Junction ${report.nodeId} ${report.role} failed: ${report.error}.`
    )));
  }
  const junctionNavigationErrors = junctionReports.filter(report => report.navigationError);
  if (junctionNavigationErrors.length) {
    validation.valid = false;
    validation.errors.push(...junctionNavigationErrors.map(report => (
      `Junction ${report.nodeId} navigation failed: ${report.navigationError}.`
    )));
  }
  const incompatibleBridges = bridgeSelections.filter(selection => !selection.valid);
  if (incompatibleBridges.length) {
    validation.valid = false;
    validation.errors.push(...incompatibleBridges.map(selection => (
      `Bridge ${selection.segmentId} ${selection.bridgeStyle} is incompatible: ${selection.compatibilityDiagnostics
        .map(diagnostic => diagnostic.message)
        .join(' ')}`
    )));
  }
  const incompatibleBridgeJunctionSeams = bridgeSelections.flatMap(selection => (
    (selection.junctionSeams || [])
      .filter(seam => !seam.compatible)
      .map(seam => ({ segmentId: selection.segmentId, ...seam }))
  ));
  if (incompatibleBridgeJunctionSeams.length) {
    validation.valid = false;
    validation.errors.push(...incompatibleBridgeJunctionSeams.map(seam => (
      `Bridge ${seam.segmentId} does not share junction ${seam.nodeId} portal width `
      + `(${seam.surfaceWidth} m surface versus ${seam.portalWidth} m portal).`
    )));
  }
  return {
    schemaVersion: 1,
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    meshes,
    navigationMeshes,
    guides,
    portalsByNode,
    junctionAuthority,
    junctions: junctionReports,
    bridgeSelections,
    validation
  };
}

export { junctionRing };
