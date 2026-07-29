import earcut, { deviation as earcutDeviation } from '../vendor/earcut.js';

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
const normalize3 = value => {
  const length = length3(value);
  return length > EPSILON ? scale3(value, 1 / length) : [0, 1, 0];
};
const distance3 = (a, b) => length3(sub3(a, b));

function createMeshBuilder(kind) {
  return {
    kind,
    positions: [],
    normals: [],
    indices: [],
    uvs: [],
    blends: [],
    roles: []
  };
}

function pushVertex(builder, position, uv, blend, role) {
  const index = builder.positions.length / 3;
  builder.positions.push(...position);
  builder.normals.push(0, 0, 0);
  builder.uvs.push(...uv);
  builder.blends.push(blend);
  builder.roles.push(role);
  return index;
}

function pushTriangle(builder, a, b, c) {
  const pa = builder.positions.slice(a * 3, a * 3 + 3);
  const pb = builder.positions.slice(b * 3, b * 3 + 3);
  const pc = builder.positions.slice(c * 3, c * 3 + 3);
  const normal = cross3(sub3(pb, pa), sub3(pc, pa));
  if (normal[1] < 0) builder.indices.push(a, c, b);
  else builder.indices.push(a, b, c);
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
  return {
    kind: builder.kind,
    positions: new Float32Array(builder.positions),
    normals: new Float32Array(builder.normals),
    indices: new Uint32Array(builder.indices),
    uvs: new Float32Array(builder.uvs),
    blends: new Float32Array(builder.blends),
    roles: builder.roles
  };
}

function appendStrip(builder, rows, role, blendValues = [1, 1]) {
  if (rows.length < 2) return;
  const rowIndices = rows.map(row => row.positions.map((position, column) => pushVertex(
    builder,
    position,
    [row.distance / Math.max(0.1, row.textureRepeatLength), column / Math.max(1, row.positions.length - 1)],
    blendValues[Math.min(column, blendValues.length - 1)] ?? 1,
    role
  )));
  for (let row = 0; row < rowIndices.length - 1; row += 1) {
    for (let column = 0; column < rowIndices[row].length - 1; column += 1) {
      const a = rowIndices[row][column];
      const b = rowIndices[row + 1][column];
      const c = rowIndices[row][column + 1];
      const d = rowIndices[row + 1][column + 1];
      pushTriangle(builder, a, b, c);
      pushTriangle(builder, b, d, c);
    }
  }
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
  const halfWidth = segment.crossSectionProfile.width * 0.5;
  const trimDistance = Math.max(segment.crossSectionProfile.width * 1.15, halfWidth + 1);
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
  const portal = (sample, endpoint) => {
    if (!sample) return null;
    const left = add3(sample.position, scale3(sample.side, -halfWidth));
    const right = add3(sample.position, scale3(sample.side, halfWidth));
    return {
      segmentId: segment.id,
      endpoint,
      center: [...sample.position],
      left,
      right,
      direction: endpoint === 'from' ? scale3(sample.tangent, 1) : scale3(sample.tangent, -1),
      width: segment.crossSectionProfile.width,
      crownHeight: segment.crossSectionProfile.crownHeight
    };
  };
  return {
    samples: trimmed,
    fromPortal: first > 0 ? portal(trimmed[0], 'from') : null,
    toPortal: last < samples.length - 1 ? portal(trimmed.at(-1), 'to') : null
  };
}

function roadRows(segment, samples) {
  const halfWidth = segment.crossSectionProfile.width * 0.5;
  const crown = segment.crossSectionProfile.crownHeight;
  const repeat = Math.max(0.25, segment.crossSectionProfile.textureRepeatLength || 5);
  return samples.map(sample => ({
    distance: sample.distance,
    textureRepeatLength: repeat,
    positions: [
      add3(sample.position, scale3(sample.side, -halfWidth)),
      add3(sample.position, scale3(sample.normal, crown)),
      add3(sample.position, scale3(sample.side, halfWidth))
    ]
  }));
}

function shoulderRows(segment, samples, sideSign) {
  const profile = segment.crossSectionProfile;
  const halfWidth = profile.width * 0.5;
  const outerDistance = halfWidth + profile.shoulderWidth;
  const repeat = Math.max(0.25, profile.textureRepeatLength || 5);
  return samples.map(sample => ({
    distance: sample.distance,
    textureRepeatLength: repeat,
    positions: [
      add3(sample.position, scale3(sample.side, sideSign * halfWidth)),
      add3(
        add3(sample.position, scale3(sample.side, sideSign * outerDistance)),
        [0, -profile.shoulderDrop, 0]
      )
    ]
  }));
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

function quadratic3(start, control, end, t) {
  const inverse = 1 - t;
  return [
    inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
    inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    inverse * inverse * start[2] + 2 * inverse * t * control[2] + t * t * end[2]
  ];
}

function junctionRing(junction, portalsByNode, options) {
  const portals = portalsByNode.get(junction.nodeId) || [];
  if (portals.length < 3) return { ring: [], portals, error: 'insufficient-portals' };
  const sorted = [...portals].sort((a, b) => (
    Math.atan2(a.direction[2], a.direction[0]) - Math.atan2(b.direction[2], b.direction[0])
  ));
  const averageY = sorted.reduce((sum, portal) => sum + portal.center[1] + portal.crownHeight, 0) / sorted.length;
  const filletSteps = Math.max(2, Math.min(10, Math.round(options.junctionFilletSegments || 4)));
  const maximumMiter = Math.max(...sorted.map(portal => portal.width)) * 2.5;
  const ring = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[(index + 1) % sorted.length];
    const currentRight = [current.right[0], averageY, current.right[2]];
    const currentLeft = [current.left[0], averageY, current.left[2]];
    const nextRight = [next.right[0], averageY, next.right[2]];
    ring.push(currentRight, currentLeft);
    const intersection = lineIntersection2(
      [currentLeft[0], currentLeft[2]],
      [current.direction[0], current.direction[2]],
      [nextRight[0], nextRight[2]],
      [next.direction[0], next.direction[2]]
    );
    let control = intersection ? [intersection[0], averageY, intersection[1]] : [
      (currentLeft[0] + nextRight[0]) * 0.5,
      averageY,
      (currentLeft[2] + nextRight[2]) * 0.5
    ];
    const node = junction.position;
    const distanceFromNode = Math.hypot(control[0] - node[0], control[2] - node[2]);
    if (distanceFromNode > maximumMiter) {
      const direction = normalize3([control[0] - node[0], 0, control[2] - node[2]]);
      control = [node[0] + direction[0] * maximumMiter, averageY, node[2] + direction[2] * maximumMiter];
    }
    for (let step = 1; step < filletSteps; step += 1) {
      ring.push(quadratic3(currentLeft, control, nextRight, step / filletSteps));
    }
  }
  const sanitized = sanitizeRing(ring);
  if (sanitized.length < 3) return { ring: [], portals: sorted, error: 'degenerate-ring' };
  if (ringSelfIntersects(sanitized)) return { ring: sanitized, portals: sorted, error: 'self-intersection' };
  return { ring: sanitized, portals: sorted, error: null };
}

function appendJunction(builder, junction, portalsByNode, options) {
  const generated = junctionRing(junction, portalsByNode, options);
  if (generated.error) return { ...generated, triangleCount: 0, deviation: Infinity };
  const flattened = generated.ring.flatMap(point => [point[0], point[2]]);
  const triangles = earcut(flattened, null, 2);
  const deviation = earcutDeviation(flattened, null, 2, triangles);
  if (!Number.isFinite(deviation) || deviation > 1e-6) {
    return { ...generated, error: 'triangulation-deviation', triangleCount: 0, deviation };
  }
  const base = builder.positions.length / 3;
  const origin = junction.position;
  generated.ring.forEach(point => pushVertex(
    builder,
    point,
    [(point[0] - origin[0]) * 0.1, (point[2] - origin[2]) * 0.1],
    1,
    'junction'
  ));
  for (let index = 0; index < triangles.length; index += 3) {
    pushTriangle(builder, base + triangles[index], base + triangles[index + 1], base + triangles[index + 2]);
  }
  return { ...generated, triangleCount: triangles.length / 3, deviation };
}

function appendEndCap(builder, row, role) {
  if (!row?.positions?.length) return;
  const indices = row.positions.map((position, column) => pushVertex(
    builder,
    position,
    [column / Math.max(1, row.positions.length - 1), 0],
    1,
    role
  ));
  for (let index = 1; index < indices.length - 1; index += 1) {
    pushTriangle(builder, indices[0], indices[index + 1], indices[index]);
  }
}

function appendQuad(builder, a, b, c, d, role, uvScale = 1) {
  const base = builder.positions.length / 3;
  pushVertex(builder, a, [0, 0], 1, role);
  pushVertex(builder, b, [uvScale, 0], 1, role);
  pushVertex(builder, c, [0, 1], 1, role);
  pushVertex(builder, d, [uvScale, 1], 1, role);
  pushTriangle(builder, base, base + 1, base + 2);
  pushTriangle(builder, base + 1, base + 3, base + 2);
}

function appendBox(builder, center, size, role) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map(value => Math.max(0.02, value * 0.5));
  const points = [
    [cx - sx, cy - sy, cz - sz], [cx + sx, cy - sy, cz - sz],
    [cx - sx, cy + sy, cz - sz], [cx + sx, cy + sy, cz - sz],
    [cx - sx, cy - sy, cz + sz], [cx + sx, cy - sy, cz + sz],
    [cx - sx, cy + sy, cz + sz], [cx + sx, cy + sy, cz + sz]
  ];
  for (const [a, b, c, d] of [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 6, 2],
    [1, 5, 3, 7], [2, 3, 6, 7], [4, 5, 0, 1]
  ]) appendQuad(builder, points[a], points[b], points[c], points[d], role);
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
    || !['cut-fill', 'retaining-wall', 'stairs'].includes(segment.construction.mode)
  ) return;
  const repeat = Math.max(0.25, segment.crossSectionProfile.textureRepeatLength || 5);
  appendStrip(builder, sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: repeat,
    positions: [section.outerLeft, section.shoulderLeft]
  })), 'left-earthwork', [0, 0.45]);
  appendStrip(builder, sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: repeat,
    positions: [section.shoulderRight, section.outerRight]
  })), 'right-earthwork', [0.45, 0]);
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

function appendBridge(builder, segment, sections, baseHeightAt) {
  if (segment.construction.mode !== 'bridge' || sections.length < 2) return;
  const girderDepth = Math.max(0.35, segment.crossSectionProfile.width * 0.08);
  for (const side of ['Left', 'Right']) {
    const key = `road${side}`;
    const rows = sections.map(section => {
      const top = section[key];
      return {
        distance: section.distance,
        textureRepeatLength: 5,
        positions: [top, [top[0], top[1] - girderDepth, top[2]]]
      };
    });
    appendStrip(builder, rows, `bridge-${side.toLowerCase()}-girder`, [1, 1]);
  }
  const length = sections.at(-1).distance - sections[0].distance;
  const pierSpacing = Math.max(8, Math.min(24, segment.crossSectionProfile.width * 2.5));
  const pierCount = Math.max(0, Math.floor(length / pierSpacing) - 1);
  for (let index = 1; index <= pierCount; index += 1) {
    const target = sections[0].distance + length * index / (pierCount + 1);
    const section = sections.reduce((best, candidate) => (
      Math.abs(candidate.distance - target) < Math.abs(best.distance - target) ? candidate : best
    ), sections[0]);
    const baseY = finite(baseHeightAt(section.center[0], section.center[2]), section.center[1] - 1);
    const topY = section.center[1] - girderDepth;
    const height = Math.max(0.25, topY - baseY);
    appendBox(
      builder,
      [section.center[0], baseY + height * 0.5, section.center[2]],
      [Math.max(0.65, segment.crossSectionProfile.width * 0.16), height, Math.max(0.65, segment.crossSectionProfile.width * 0.16)],
      'bridge-pier'
    );
  }
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
  let index = 1;
  while (index < samples.length - 1 && samples[index].distance < target) index += 1;
  const start = samples[index - 1];
  const end = samples[index];
  const t = clamp((target - start.distance) / Math.max(EPSILON, end.distance - start.distance), 0, 1);
  return {
    position: add3(start.position, scale3(sub3(end.position, start.position), t)),
    side: normalize3(add3(start.side, scale3(sub3(end.side, start.side), t))),
    distance: target
  };
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
  const earthwork = createMeshBuilder('earthwork');
  const structure = createMeshBuilder('structure');
  const guides = { center: [], edges: [], construction: [] };
  const degree = degreeMap(compiled);
  const sectionsBySegment = crossSectionsBySegment(options.terrainModifier);
  const baseHeightAt = options.terrainModifier?.baseHeightAt || (() => 0);
  const portalsByNode = new Map((compiled.nodes || []).map(node => [node.id, []]));
  const preparedSegments = [];

  for (const segment of compiled.segments) {
    const prepared = trimSamplesForJunctions(segment, degree);
    preparedSegments.push({ segment, ...prepared });
    if (prepared.fromPortal) portalsByNode.get(segment.fromNode)?.push(prepared.fromPortal);
    if (prepared.toPortal) portalsByNode.get(segment.toNode)?.push(prepared.toPortal);
  }

  for (const prepared of preparedSegments) {
    const { segment, samples } = prepared;
    const rows = roadRows(segment, samples);
    const generatedStairs = appendStairs(road, segment, compiled.engineering);
    if (!generatedStairs) appendStrip(road, rows, 'road-core', [1, 1, 1]);
    appendStrip(shoulder, shoulderRows(segment, samples, -1), 'left-shoulder', [1, 0.45]);
    appendStrip(shoulder, shoulderRows(segment, samples, 1), 'right-shoulder', [1, 0.45]);
    const constructionSections = sectionsBySegment.get(segment.id) || [];
    appendEarthwork(earthwork, segment, constructionSections);
    appendRetainingWalls(structure, segment, constructionSections);
    appendBridge(structure, segment, constructionSections, baseHeightAt);
    appendTunnel(structure, segment);
    const isFromDeadEnd = (degree.get(segment.fromNode) || 0) === 1;
    const isToDeadEnd = (degree.get(segment.toNode) || 0) === 1;
    if (isFromDeadEnd) appendEndCap(road, rows[0], 'dead-end-cap');
    if (isToDeadEnd) appendEndCap(road, rows.at(-1), 'dead-end-cap');
    for (let index = 0; index < rows.length - 1; index += 1) {
      guides.center.push(...rows[index].positions[1], ...rows[index + 1].positions[1]);
      guides.edges.push(
        ...rows[index].positions[0], ...rows[index + 1].positions[0],
        ...rows[index].positions[2], ...rows[index + 1].positions[2]
      );
    }
  }

  const junctionReports = [];
  for (const junction of compiled.junctions || []) {
    const report = appendJunction(road, junction, portalsByNode, options);
    junctionReports.push({
      nodeId: junction.nodeId,
      portalCount: report.portals.length,
      ringVertexCount: report.ring.length,
      triangleCount: report.triangleCount,
      deviation: report.deviation,
      error: report.error
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
    earthwork: finalizeMesh(earthwork),
    structure: finalizeMesh(structure)
  };
  const validation = validatePathNetworkGeometry(meshes);
  const junctionErrors = junctionReports.filter(report => report.error);
  if (junctionErrors.length) {
    validation.valid = false;
    validation.errors.push(...junctionErrors.map(report => `Junction ${report.nodeId} failed: ${report.error}.`));
  }
  return {
    schemaVersion: 1,
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    meshes,
    guides,
    portalsByNode,
    junctions: junctionReports,
    validation
  };
}

export { junctionRing };
