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
