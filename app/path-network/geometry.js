import earcut, { deviation as earcutDeviation } from '../vendor/earcut.js';
import { bridgeMaterialForRole, resolveBridgeProfile } from './bridge-profiles.js';

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

function createMeshBuilder(kind) {
  return {
    kind,
    positions: [],
    normals: [],
    indices: [],
    uvs: [],
    blends: [],
    roles: [],
    triangleRoles: []
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
    roles: builder.roles,
    groups
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
  return samples.map(sample => {
    const inner = add3(sample.position, scale3(sample.side, sideSign * halfWidth));
    const outer = add3(
      add3(sample.position, scale3(sample.side, sideSign * outerDistance)),
      [0, -profile.shoulderDrop, 0]
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

function convexHullXZ(points, y) {
  const unique = new Map();
  for (const point of points) {
    if (!point?.every(Number.isFinite)) continue;
    unique.set(`${point[0].toFixed(6)}:${point[2].toFixed(6)}`, [point[0], y, point[2]]);
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
  if (ringSelfIntersects(sanitized)) {
    // A bounded convex cleanup is safe for a real junction with distinct
    // approaches and mixed widths. It keeps every trimmed portal inside one
    // watertight polygon without resurrecting the old radial dirt patch.
    // Nearly collinear approaches remain invalid because their topology is
    // ambiguous and a convex patch would hide the authoring error.
    if (minimumHeadingSeparation(sorted) < Math.PI / 18) {
      return { ring: sanitized, portals: sorted, error: 'self-intersection', fallback: null };
    }
    const hull = convexHullXZ(sorted.flatMap(portal => [portal.left, portal.right]), averageY);
    if (hull.length >= 3 && !ringSelfIntersects(hull)) {
      return { ring: hull, portals: sorted, error: null, fallback: 'bounded-convex-hull' };
    }
    return { ring: sanitized, portals: sorted, error: 'self-intersection', fallback: null };
  }
  return { ring: sanitized, portals: sorted, error: null, fallback: null };
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

function appendBridgeDeck(builder, sections, thickness, role) {
  const top = sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: [
      [...section.roadLeft],
      [...(section.roadCenter || section.center)],
      [...section.roadRight]
    ]
  }));
  const bottom = sections.map(section => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: (section.roadCenter
      ? [section.roadLeft, section.roadCenter, section.roadRight]
      : [section.roadLeft, section.center, section.roadRight]
    ).map(point => [point[0], point[1] - thickness, point[2]])
  }));
  appendStrip(builder, top, `${role}-top`, [1, 1]);
  appendStrip(builder, bottom.map(row => ({
    ...row,
    positions: [row.positions[1], row.positions[0]]
  })), `${role}-underside`, [1, 1]);
  appendStrip(builder, sections.map((section, index) => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: [bottom[index].positions[0], top[index].positions[0]]
  })), `${role}-left-edge`, [1, 1]);
  appendStrip(builder, sections.map((section, index) => ({
    distance: section.distance,
    textureRepeatLength: 4,
    positions: [top[index].positions[1], bottom[index].positions[1]]
  })), `${role}-right-edge`, [1, 1]);
  appendQuad(
    builder,
    top[0].positions[1], top[0].positions[0],
    bottom[0].positions[1], bottom[0].positions[0],
    `${role}-start-face`
  );
  appendQuad(
    builder,
    top[0].positions[2], top[0].positions[1],
    bottom[0].positions[2], bottom[0].positions[1],
    `${role}-start-face`
  );
  appendQuad(
    builder,
    top.at(-1).positions[0], top.at(-1).positions[1],
    bottom.at(-1).positions[0], bottom.at(-1).positions[1],
    `${role}-end-face`
  );
  appendQuad(
    builder,
    top.at(-1).positions[1], top.at(-1).positions[2],
    bottom.at(-1).positions[1], bottom.at(-1).positions[2],
    `${role}-end-face`
  );
}

function appendBridgeRailings(builder, sections, role) {
  const indices = sectionIndicesAtSpacing(sections, 2.5, true);
  for (const sideKey of ['roadLeft', 'roadRight']) {
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

function appendBridgeAbutments(builder, sections, baseHeightAt, profile, materialRole = 'bridge-concrete') {
  for (const index of [0, sections.length - 1]) {
    const section = sections[index];
    const frame = sectionFrame(sections, index);
    const direction = index === 0 ? -1 : 1;
    const horizontalTangent = normalize3([frame.tangent[0], 0, frame.tangent[2]], [0, 0, 1]);
    const horizontalSide = normalize3([-horizontalTangent[2], 0, horizontalTangent[0]], [1, 0, 0]);
    const up = [0, 1, 0];
    const terrainSamples = [
      section.center,
      add3(section.center, scale3(horizontalSide, profile.width * 0.5 + 0.65)),
      add3(section.center, scale3(horizontalSide, -(profile.width * 0.5 + 0.65)))
    ].map(point => finite(
      baseHeightAt(point[0], point[2]),
      section.center[1] - profile.deckThickness - 0.5
    ));
    const terrainY = Math.min(...terrainSamples);
    const seatY = section.center[1] - profile.deckThickness;
    const wallHeight = clamp(seatY - terrainY, 1.1, 14);
    const wallBottomY = seatY - wallHeight;
    const backCenter = add3(section.center, scale3(horizontalTangent, direction * 0.62));
    const footingCenter = [
      backCenter[0],
      Math.min(terrainY - 0.22, wallBottomY - 0.22),
      backCenter[2]
    ];
    appendOrientedBox(
      builder,
      footingCenter,
      horizontalTangent,
      horizontalSide,
      up,
      [2.8, profile.width + 3.2, 0.52],
      `${materialRole}-abutment-footing`
    );
    appendOrientedBox(
      builder,
      [
        backCenter[0],
        seatY - wallHeight * 0.5,
        backCenter[2]
      ],
      horizontalTangent,
      horizontalSide,
      up,
      [1.05, profile.width + 2.2, wallHeight],
      `${materialRole}-abutment-backwall`
    );
    for (const sign of [-1, 1]) {
      const wingHeight = Math.max(0.9, Math.min(4, wallHeight * 0.72));
      const wingCenter = add3(
        add3(backCenter, scale3(horizontalTangent, direction * 1.45)),
        scale3(horizontalSide, sign * (profile.width * 0.5 + 0.82))
      );
      wingCenter[1] = seatY - wingHeight * 0.5 - 0.08;
      appendOrientedBox(
        builder,
        wingCenter,
        horizontalTangent,
        horizontalSide,
        up,
        [3.1, 0.5, wingHeight],
        `${materialRole}-abutment-wingwall`
      );
    }
  }
}

function appendTimberTrestle(builder, segment, sections, baseHeightAt, profile) {
  appendBridgeDeck(builder, sections, profile.deckThickness, 'bridge-timber-deck');
  for (let index = 1; index < sections.length; index += 1) {
    for (const key of ['roadLeft', 'roadRight']) {
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
        add3(section.center, scale3(frame.side, sign * profile.width * 0.34)),
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

function appendStoneArch(builder, segment, sections, baseHeightAt, profile) {
  appendBridgeDeck(builder, sections, profile.deckThickness + 0.18, 'bridge-stone-deck');
  const firstDistance = sections[0].distance;
  const span = Math.max(EPSILON, sections.at(-1).distance - firstDistance);
  for (const key of ['roadLeft', 'roadRight']) {
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
  appendBridgeAbutments(builder, sections, baseHeightAt, profile, 'bridge-stone');
  if (profile.railings) appendBridgeRailings(builder, sections, 'bridge-stone-parapet');
}

function appendSteelGirder(builder, segment, sections, baseHeightAt, profile) {
  appendBridgeDeck(builder, sections, profile.deckThickness, 'bridge-concrete-deck');
  const girderCount = clamp(Math.round(profile.width / 2) + 2, 3, 8);
  for (let index = 1; index < sections.length; index += 1) {
    for (let girder = 0; girder < girderCount; girder += 1) {
      const amount = girderCount === 1 ? 0.5 : girder / (girderCount - 1);
      const start = mix3(sections[index - 1].roadLeft, sections[index - 1].roadRight, amount);
      const end = mix3(sections[index].roadLeft, sections[index].roadRight, amount);
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
      [2.4, Math.max(2.6, profile.width + 1.8), 0.48],
      'bridge-concrete-pier-footing'
    );
    const lowerSpread = Math.max(0.9, profile.width * 0.28);
    const upperSpread = Math.max(1.15, profile.width * 0.4);
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
      scale3(frame.side, -(profile.width * 0.5 + 0.7))
    );
    const capRight = add3(
      [section.center[0], capY, section.center[2]],
      scale3(frame.side, profile.width * 0.5 + 0.7)
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

function appendMasonryCauseway(builder, segment, sections, baseHeightAt, profile) {
  appendBridgeDeck(builder, sections, profile.deckThickness + 0.2, 'bridge-masonry-deck');
  for (const key of ['roadLeft', 'roadRight']) {
    appendStrip(builder, sections.map(section => {
      const top = section[key];
      return {
        distance: section.distance,
        textureRepeatLength: 2.5,
        positions: [top, [top[0], finite(baseHeightAt(top[0], top[2]), top[1] - 0.5), top[2]]]
      };
    }), 'bridge-masonry-sidewall', [1, 1]);
  }
  appendBridgeAbutments(builder, sections, baseHeightAt, profile, 'bridge-masonry');
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
      [0.46, profile.width, 0.14],
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
      const foot = add3(section.center, scale3(frame.side, sign * profile.width * 0.6));
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
  if (segment.construction.mode !== 'bridge' || sections.length < 2) return null;
  const profile = resolveBridgeProfile(segment, sections, baseHeightAt);
  if (profile.bridgeStyle === 'timber-trestle') {
    appendTimberTrestle(builder, segment, sections, baseHeightAt, profile);
  } else if (profile.bridgeStyle === 'stone-arch') {
    appendStoneArch(builder, segment, sections, baseHeightAt, profile);
  } else if (profile.bridgeStyle === 'steel-girder') {
    appendSteelGirder(builder, segment, sections, baseHeightAt, profile);
  } else if (profile.bridgeStyle === 'masonry-causeway') {
    appendMasonryCauseway(builder, segment, sections, baseHeightAt, profile);
  } else if (profile.bridgeStyle === 'rope-footbridge') {
    appendRopeFootbridge(builder, segment, sections, baseHeightAt, profile);
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

function intervalSegment(segment, interval, availableSamples = segment.samples) {
  const samples = availableSamples.filter(sample => (
    sample.distance >= interval.startDistance - EPSILON
    && sample.distance <= interval.endDistance + EPSILON
  ));
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
  return sections.filter(section => (
    section.distance >= interval.startDistance - EPSILON
    && section.distance <= interval.endDistance + EPSILON
  ));
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
  const earthwork = createMeshBuilder('earthwork');
  const structure = createMeshBuilder('structure');
  const guides = { center: [], edges: [], construction: [] };
  // Invalid construction stays visible through the guide overlay but must not
  // create traversable render/collision/navigation surfaces. Valid segments in
  // the same connected graph remain usable instead of disappearing with the
  // invalid branch.
  const surfaceSegments = compiled.segments.filter(segment => segment.construction.mode !== 'invalid');
  const surfaceCompiled = { ...compiled, segments: surfaceSegments };
  const degree = degreeMap(surfaceCompiled);
  const sectionsBySegment = crossSectionsBySegment(options.terrainModifier);
  const baseHeightAt = options.terrainModifier?.baseHeightAt || (() => 0);
  const portalsByNode = new Map((compiled.nodes || []).map(node => [node.id, []]));
  const preparedSegments = [];
  const bridgeSelections = [];

  for (const segment of surfaceSegments) {
    const prepared = trimSamplesForJunctions(segment, degree);
    preparedSegments.push({ segment, ...prepared });
    if (prepared.fromPortal) portalsByNode.get(segment.fromNode)?.push(prepared.fromPortal);
    if (prepared.toPortal) portalsByNode.get(segment.toNode)?.push(prepared.toPortal);
  }

  for (const prepared of preparedSegments) {
    const { segment, samples } = prepared;
    const constructionSections = sectionsBySegment.get(segment.id) || [];
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
        appendStrip(road, roadRows(localSegment, localSegment.samples), 'road-core', [1, 1, 1]);
        appendStrip(
          shoulder,
          shoulderRows(localSegment, localSegment.samples, -1),
          'left-shoulder',
          [0.45, 1]
        );
        appendStrip(
          shoulder,
          shoulderRows(localSegment, localSegment.samples, 1),
          'right-shoulder',
          [1, 0.45]
        );
      } else if (interval.mode === 'stairs') {
        appendStairs(road, localSegment, compiled.engineering);
      }
      appendEarthwork(earthwork, localSegment, localSections);
      appendRetainingWalls(structure, localSegment, localSections);
      const bridgeProfile = appendBridge(structure, localSegment, localSections, baseHeightAt);
      if (bridgeProfile) {
        bridgeSelections.push({
          segmentId: segment.id,
          startDistance: interval.startDistance,
          endDistance: interval.endDistance,
          bridgeStyle: bridgeProfile.bridgeStyle,
          label: bridgeProfile.label,
          span: bridgeProfile.span,
          width: bridgeProfile.width,
          maximumClearance: bridgeProfile.maximumClearance,
          supportSpacing: bridgeProfile.supportSpacing
        });
      }
      appendTunnel(structure, localSegment);
      intervalSurfaces.push({
        mode: interval.mode,
        rows: roadRows(localSegment, localSegment.samples)
      });
    }
    const isFromDeadEnd = (degree.get(segment.fromNode) || 0) === 1;
    const isToDeadEnd = (degree.get(segment.toNode) || 0) === 1;
    const firstSurface = intervalSurfaces[0];
    const lastSurface = intervalSurfaces.at(-1);
    if (isFromDeadEnd && intervalOwnsRoadSurface(firstSurface?.mode)) {
      appendEndCap(road, firstSurface.rows[0], 'dead-end-cap');
    }
    if (isToDeadEnd && intervalOwnsRoadSurface(lastSurface?.mode)) {
      appendEndCap(road, lastSurface.rows.at(-1), 'dead-end-cap');
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
  }

  const junctionReports = [];
  for (const junction of (compiled.junctions || []).filter(item => (degree.get(item.nodeId) || 0) >= 3)) {
    const report = appendJunction(road, junction, portalsByNode, options);
    junctionReports.push({
      nodeId: junction.nodeId,
      portalCount: report.portals.length,
      ringVertexCount: report.ring.length,
      triangleCount: report.triangleCount,
      deviation: report.deviation,
      fallback: report.fallback || null,
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
    bridgeSelections,
    validation
  };
}

export { junctionRing };
