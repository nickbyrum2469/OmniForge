function previewNode(pathObject, nodeId) {
  return pathObject?.properties?.pathNetwork?.nodes?.find(node => node.id === nodeId) || null;
}

export const PATH_NODE_DRAG_ACTIVATION_PX = 4;

export function createPathNodeDragGesture({
  pointerId,
  clientX,
  clientY,
  vertical = false
} = {}) {
  return {
    pointerId,
    startClientX: Number(clientX) || 0,
    startClientY: Number(clientY) || 0,
    lastClientX: Number(clientX) || 0,
    lastClientY: Number(clientY) || 0,
    active: false,
    moved: false,
    cancelled: false,
    vertical: vertical === true
  };
}

export function advancePathNodeDragGesture(gesture, {
  pointerId,
  clientX,
  clientY,
  buttons,
  shiftKey = false
} = {}) {
  if (!gesture || gesture.cancelled || pointerId !== gesture.pointerId) {
    return { accepted: false, active: false, cancel: false };
  }
  if ((Number(buttons) & 1) !== 1) {
    gesture.cancelled = true;
    return { accepted: false, active: false, cancel: true };
  }
  const x = Number(clientX) || 0;
  const y = Number(clientY) || 0;
  gesture.lastClientX = x;
  gesture.lastClientY = y;
  gesture.vertical ||= shiftKey === true;
  const distance = Math.hypot(x - gesture.startClientX, y - gesture.startClientY);
  if (!gesture.active && distance >= PATH_NODE_DRAG_ACTIVATION_PX) gesture.active = true;
  if (gesture.active) gesture.moved = true;
  return { accepted: gesture.active, active: gesture.active, cancel: false };
}

export function shouldCommitPathNodeDragGesture(gesture, { pointerId } = {}) {
  return Boolean(
    gesture
    && !gesture.cancelled
    && gesture.active
    && gesture.moved
    && pointerId === gesture.pointerId
  );
}

export function createPathNodeDragPreview(pathObject, nodeId) {
  if (!pathObject || pathObject.type !== 'path') {
    throw new Error('A path scene object is required for node-drag preview.');
  }
  const previewPath = structuredClone(pathObject);
  const node = previewNode(previewPath, nodeId);
  if (!node) throw new Error(`Path node ${nodeId} does not exist.`);
  previewPath.properties.previewOnly = true;
  previewPath.properties.previewRevision = Number(pathObject.properties?.previewRevision || 0) + 1;
  return previewPath;
}

export function updatePathNodeDragPreview(previewPath, nodeId, {
  position,
  heightMode,
  heightOffset
} = {}) {
  const node = previewNode(previewPath, nodeId);
  if (!node) throw new Error(`Path node ${nodeId} does not exist.`);
  if (Array.isArray(position) && position.length >= 3) {
    node.position = position.slice(0, 3).map(Number);
  }
  if (heightMode) node.heightMode = heightMode;
  if (heightOffset !== undefined) node.heightOffset = Number(heightOffset) || 0;
  previewPath.properties.previewRevision = Number(previewPath.properties.previewRevision || 0) + 1;
  return node;
}

export function pathNodeFromDragPreview(previewPath, nodeId) {
  return previewNode(previewPath, nodeId);
}
