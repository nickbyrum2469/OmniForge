const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function evaluateCompiledCurveAuthority(authority, t) {
  if (!authority || !Array.isArray(authority.start) || !Array.isArray(authority.end)
    || !Array.isArray(authority.fromHandle) || !Array.isArray(authority.toHandle)) return null;
  const amount = clamp(t, 0, 1);
  const p0 = authority.start.map(Number);
  const p1 = p0.map((value, axis) => value + Number(authority.fromHandle[axis]));
  const p3 = authority.end.map(Number);
  const p2 = p3.map((value, axis) => value + Number(authority.toHandle[axis]));
  if ([p0, p1, p2, p3].some(point => point.length < 3 || point.slice(0, 3).some(value => !Number.isFinite(value)))) return null;
  const lerp = (a, b) => a.map((value, axis) => value + (b[axis] - value) * amount);
  const q0 = lerp(p0, p1);
  const q1 = lerp(p1, p2);
  const q2 = lerp(p2, p3);
  return lerp(lerp(q0, q1), lerp(q1, q2));
}

function closestPointOnScreenSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const localT = lengthSquared > 1e-8
    ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
    : 0;
  const x = start.x + dx * localT;
  const y = start.y + dy * localT;
  return { localT, x, y, distancePixels: Math.hypot(point.x - x, point.y - y) };
}

function dot(a, b) {
  return Number(a?.[0] || 0) * Number(b?.[0] || 0)
    + Number(a?.[1] || 0) * Number(b?.[1] || 0)
    + Number(a?.[2] || 0) * Number(b?.[2] || 0);
}

function closestPointOnRaySegment(ray, start, end) {
  const origin = ray?.origin?.slice?.(0, 3)?.map(Number);
  const direction = ray?.dir?.slice?.(0, 3)?.map(Number);
  const a = start?.slice?.(0, 3)?.map(Number);
  const b = end?.slice?.(0, 3)?.map(Number);
  if ([origin, direction, a, b].some(point => point?.length !== 3 || point.some(value => !Number.isFinite(value)))) return null;
  const segment = b.map((value, axis) => value - a[axis]);
  const fromStart = origin.map((value, axis) => value - a[axis]);
  const rayLengthSquared = dot(direction, direction);
  const segmentLengthSquared = dot(segment, segment);
  if (rayLengthSquared < 1e-10 || segmentLengthSquared < 1e-10) return null;
  const raySegment = dot(direction, segment);
  const rayOrigin = dot(direction, fromStart);
  const segmentOrigin = dot(segment, fromStart);
  const denominator = rayLengthSquared * segmentLengthSquared - raySegment * raySegment;
  let localT = Math.abs(denominator) > 1e-10
    ? (rayLengthSquared * segmentOrigin - raySegment * rayOrigin) / denominator
    : segmentOrigin / segmentLengthSquared;
  localT = clamp(localT, 0, 1);
  const position = a.map((value, axis) => value + segment[axis] * localT);
  let rayParameter = dot(position.map((value, axis) => value - origin[axis]), direction) / rayLengthSquared;
  if (rayParameter < 0) {
    rayParameter = 0;
    localT = clamp(segmentOrigin / segmentLengthSquared, 0, 1);
  }
  return {
    localT,
    rayDepth: rayParameter * Math.sqrt(rayLengthSquared)
  };
}

/**
 * Picks the exact compiled centerline in screen space. This deliberately does
 * not depend on a terrain hit, so authored paths remain editable across cuts,
 * bridges, tunnels, stairs, and open gaps. It never mutates compiler authority.
 */
export function nearestCompiledScreenStation(compiled, {
  clientX,
  clientY,
  worldToScreen,
  rayFromScreen = null,
  maximumDistancePixels = 28
} = {}) {
  if (typeof worldToScreen !== 'function') return null;
  const point = { x: Number(clientX), y: Number(clientY) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  let nearest = null;
  for (const segment of compiled?.segments || []) {
    const samples = Array.isArray(segment.samples) ? segment.samples : [];
    for (let index = 0; index < samples.length - 1; index += 1) {
      const start = samples[index];
      const end = samples[index + 1];
      const projectedStart = worldToScreen(start.position);
      const projectedEnd = worldToScreen(end.position);
      if (!projectedStart?.visible || !projectedEnd?.visible) continue;
      const closest = closestPointOnScreenSegment(point, projectedStart, projectedEnd);
      const projectedRay = typeof rayFromScreen === 'function'
        ? rayFromScreen(closest.x, closest.y)
        : null;
      const rayClosest = closestPointOnRaySegment(projectedRay, start.position, end.position);
      const startDepth = finite(projectedStart.depth, Number.POSITIVE_INFINITY);
      const endDepth = finite(projectedEnd.depth, Number.POSITIVE_INFINITY);
      const localT = rayClosest?.localT ?? closest.localT;
      const projectedDepth = Number.isFinite(startDepth) && Number.isFinite(endDepth)
        ? startDepth + (endDepth - startDepth) * localT
        : Number.POSITIVE_INFINITY;
      const depth = Number.isFinite(rayClosest?.rayDepth) ? rayClosest.rayDepth : projectedDepth;
      const closerOnScreen = !nearest || closest.distancePixels < nearest.distancePixels - 0.75;
      const sameScreenHit = nearest && Math.abs(closest.distancePixels - nearest.distancePixels) <= 0.75;
      if (closerOnScreen || (sameScreenHit && depth < nearest.depth)) {
        const curveT = Number(start.t) + (Number(end.t) - Number(start.t)) * localT;
        const baseY = Number.isFinite(Number(start.baseY)) && Number.isFinite(Number(end.baseY))
          ? Number(start.baseY) + (Number(end.baseY) - Number(start.baseY)) * localT
          : null;
        nearest = {
          segmentId: segment.id,
          sampleIndex: index,
          localT,
          curveT,
          position: start.position.map((value, axis) => Number(value) + (Number(end.position[axis]) - Number(value)) * localT),
          curvePosition: evaluateCompiledCurveAuthority(segment.curveAuthority, curveT),
          baseY,
          depth,
          distancePixels: closest.distancePixels,
          screenPosition: [closest.x, closest.y]
        };
      }
    }
  }
  return nearest && nearest.distancePixels <= Math.max(1, Number(maximumDistancePixels) || 28) ? nearest : null;
}
