const EPSILON = 1e-6;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (value, amount) => [value[0] * amount, value[1] * amount, value[2] * amount];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length3 = value => Math.hypot(value[0], value[1], value[2]);

function vec3(value, fallback = [0, 0, 0]) {
  const safeFallback = Array.isArray(fallback) ? fallback : [0, 0, 0];
  return [
    finite(value?.[0], safeFallback[0]),
    finite(value?.[1], safeFallback[1]),
    finite(value?.[2], safeFallback[2])
  ];
}

function clean3(value) {
  return value.map(component => Math.abs(component) <= EPSILON ? 0 : component);
}

function normalized(value) {
  const length = length3(value);
  return length > EPSILON ? scale3(value, 1 / length) : null;
}

export function resolvePathNodePosition(node, { terrainHeightAt } = {}) {
  const position = vec3(node?.position);
  if (node?.heightMode === 'absolute') return position;
  const terrainY = typeof terrainHeightAt === 'function'
    ? finite(terrainHeightAt(position[0], position[2]), position[1])
    : position[1];
  return [
    position[0],
    terrainY + (node?.heightMode === 'offset' ? finite(node.heightOffset) : 0),
    position[2]
  ];
}

/** Stored handle vectors are control-point deltas, not Hermite derivatives. */
export function effectivePathHandleVectors(node, suggestedHandles = {}) {
  const incomingHandle = vec3(node?.incomingHandle, suggestedHandles.incomingHandle || [-1, 0, 0]);
  const outgoingHandle = vec3(node?.outgoingHandle, suggestedHandles.outgoingHandle || [1, 0, 0]);
  return { incomingHandle, outgoingHandle };
}

export function pathHandleEndpoints(node, {
  terrainHeightAt,
  suggestedHandles
} = {}) {
  const position = resolvePathNodePosition(node, { terrainHeightAt });
  const handles = effectivePathHandleVectors(node, suggestedHandles);
  return {
    position,
    incoming: add3(position, handles.incomingHandle),
    outgoing: add3(position, handles.outgoingHandle)
  };
}

/** General ray/plane intersection used by camera-facing and horizontal gizmos. */
export function intersectPathHandleRayPlane(ray, planePoint, planeNormal, {
  allowBehind = false,
  epsilon = EPSILON
} = {}) {
  const origin = vec3(ray?.origin);
  const direction = vec3(ray?.dir);
  const normal = normalized(vec3(planeNormal));
  const threshold = Math.max(EPSILON, Math.abs(finite(epsilon, EPSILON)));
  if (!normal || length3(direction) <= threshold) return null;
  const denominator = dot3(direction, normal);
  if (Math.abs(denominator) <= threshold) return null;
  const distance = dot3(sub3(vec3(planePoint), origin), normal) / denominator;
  if (!allowBehind && distance < 0) return null;
  return add3(origin, scale3(direction, distance));
}

export function intersectPathHandleRayHorizontalPlane(ray, height, options) {
  return intersectPathHandleRayPlane(ray, [0, finite(height), 0], [0, 1, 0], options);
}

export function intersectPathHandleRayCameraPlane(ray, planePoint, cameraForward, options) {
  return intersectPathHandleRayPlane(ray, planePoint, cameraForward, options);
}

/**
 * Preview one manual handle. Free mode changes only the dragged vector. Aligned
 * mode mirrors the other direction while preserving its authored length, which
 * matches the permanent set-node-handles transaction.
 */
export function previewPathHandleDrag({
  node,
  nodePosition,
  side,
  worldPoint,
  handleMode = node?.handleMode,
  suggestedHandles = {},
  minimumLength = EPSILON
} = {}) {
  if (!['incoming', 'outgoing'].includes(side)) {
    throw new Error('A path handle drag requires incoming or outgoing side.');
  }
  if (!['free', 'aligned'].includes(handleMode)) {
    throw new Error('Viewport handle dragging requires free or aligned handle mode.');
  }
  const position = vec3(nodePosition, node?.position);
  const dragged = sub3(vec3(worldPoint), position);
  const threshold = Math.max(EPSILON, Math.abs(finite(minimumLength, EPSILON)));
  const direction = normalized(dragged);
  if (!direction || length3(dragged) <= threshold) {
    throw new Error('Manual spline handles must have a non-zero length.');
  }

  const handles = effectivePathHandleVectors(node, suggestedHandles);
  if (side === 'incoming') handles.incomingHandle = dragged;
  else handles.outgoingHandle = dragged;

  if (handleMode === 'aligned') {
    const oppositeSide = side === 'incoming' ? 'outgoingHandle' : 'incomingHandle';
    const oppositeLength = length3(handles[oppositeSide]);
    if (oppositeLength <= threshold) {
      throw new Error('The aligned opposite spline handle must have a non-zero length.');
    }
    handles[oppositeSide] = clean3(scale3(direction, -oppositeLength));
  }

  return {
    handleMode,
    primaryHandle: side,
    incomingHandle: [...handles.incomingHandle],
    outgoingHandle: [...handles.outgoingHandle],
    endpoints: {
      incoming: add3(position, handles.incomingHandle),
      outgoing: add3(position, handles.outgoingHandle)
    }
  };
}
