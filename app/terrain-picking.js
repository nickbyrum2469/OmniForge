const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function slabInterval(origin, direction, minimum, maximum, margin) {
  const low = finite(minimum) - margin;
  const high = finite(maximum) + margin;
  if (Math.abs(direction) < 1e-9) {
    return origin >= low && origin <= high ? [-Infinity, Infinity] : null;
  }
  const first = (low - origin) / direction;
  const second = (high - origin) / direction;
  return first <= second ? [first, second] : [second, first];
}

export function terrainRayDistanceRange(ray, bounds, {
  margin = 10,
  maximumDistance = 12000
} = {}) {
  if (!ray?.origin || !ray?.dir || !bounds) return null;
  const x = slabInterval(ray.origin[0], ray.dir[0], bounds.minX, bounds.maxX, margin);
  const z = slabInterval(ray.origin[2], ray.dir[2], bounds.minZ, bounds.maxZ, margin);
  if (!x || !z) return null;
  const start = Math.max(0, x[0], z[0]);
  const end = Math.min(Math.max(0, finite(maximumDistance, 12000)), x[1], z[1]);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? [start, end] : null;
}

export function pickTerrainPoint({
  ray,
  bounds,
  heightAt,
  step = 4,
  maximumDistance = 12000,
  margin = 10,
  refinementSteps = 12
}) {
  if (typeof heightAt !== 'function') return null;
  const range = terrainRayDistanceRange(ray, bounds, { margin, maximumDistance });
  if (!range) return null;
  const [startDistance, endDistance] = range;
  const sampleStep = Math.max(0.5, finite(step, 4));
  const pointAt = distance => [
    ray.origin[0] + ray.dir[0] * distance,
    ray.origin[1] + ray.dir[1] * distance,
    ray.origin[2] + ray.dir[2] * distance
  ];
  const deltaAt = distance => {
    const point = pointAt(distance);
    return {
      point,
      delta: point[1] - finite(heightAt(point[0], point[2]))
    };
  };

  let previous = deltaAt(startDistance);
  if (previous.delta <= 0) {
    return [previous.point[0], finite(heightAt(previous.point[0], previous.point[2])), previous.point[2]];
  }
  for (
    let distance = Math.min(endDistance, startDistance + sampleStep);
    distance <= endDistance + 1e-7;
    distance = Math.min(endDistance, distance + sampleStep)
  ) {
    const current = deltaAt(distance);
    if (previous.delta >= 0 && current.delta <= 0) {
      let low = Math.max(startDistance, distance - sampleStep);
      let high = distance;
      for (let index = 0; index < Math.max(4, Math.min(20, Math.floor(refinementSteps))); index += 1) {
        const middle = (low + high) * 0.5;
        if (deltaAt(middle).delta > 0) low = middle;
        else high = middle;
      }
      const hit = pointAt((low + high) * 0.5);
      return [hit[0], finite(heightAt(hit[0], hit[2])), hit[2]];
    }
    if (distance >= endDistance) break;
    previous = current;
  }
  return null;
}
