function previewNode(pathObject, nodeId) {
  return pathObject?.properties?.pathNetwork?.nodes?.find(node => node.id === nodeId) || null;
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
