const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

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

/**
 * Picks the exact compiled centerline in screen space. This deliberately does
 * not depend on a terrain hit, so authored paths remain editable across cuts,
 * bridges, tunnels, stairs, and open gaps. It never mutates compiler authority.
 */
export function nearestCompiledScreenStation(compiled, {
  clientX,
  clientY,
  worldToScreen,
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
      if (!nearest || closest.distancePixels < nearest.distancePixels) {
        const localT = closest.localT;
        nearest = {
          segmentId: segment.id,
          sampleIndex: index,
          localT,
          curveT: Number(start.t) + (Number(end.t) - Number(start.t)) * localT,
          position: start.position.map((value, axis) => Number(value) + (Number(end.position[axis]) - Number(value)) * localT),
          distancePixels: closest.distancePixels,
          screenPosition: [closest.x, closest.y]
        };
      }
    }
  }
  return nearest && nearest.distancePixels <= Math.max(1, Number(maximumDistancePixels) || 28) ? nearest : null;
}
