const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function networkNodes(network) {
  return Array.isArray(network?.nodes) ? network.nodes : [];
}

function selectionIds(selection) {
  const source = selection?.nodeIds ?? selection;
  if (typeof source === 'string') return [source];
  if (!source || typeof source[Symbol.iterator] !== 'function') return [];
  return [...source];
}

function uniqueIds(values) {
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = String(value || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Remove stale node ids without coupling transient viewport selection to saved
 * Path Network state. Selection order is preserved so the editor can keep a
 * predictable primary node across inspector rerenders and graph revisions.
 */
export function prunePathNodeSelection(network, selection = {}) {
  const validIds = new Set(networkNodes(network).map(node => String(node.id)));
  const nodeIds = uniqueIds(selectionIds(selection)).filter(id => validIds.has(id));
  const requestedPrimary = String(selection?.primaryNodeId || '');
  const primaryNodeId = nodeIds.includes(requestedPrimary)
    ? requestedPrimary
    : nodeIds.at(-1) || null;
  return { nodeIds, primaryNodeId };
}

/**
 * Normal selection replaces the set. Additive selection toggles one stable id
 * and promotes newly selected nodes to primary. This deliberately leaves Shift
 * free for the viewport's vertical-drag gesture.
 */
export function togglePathNodeSelection(network, selection, nodeId, { additive = false } = {}) {
  const validIds = new Set(networkNodes(network).map(node => String(node.id)));
  const id = String(nodeId || '');
  if (!validIds.has(id)) return prunePathNodeSelection(network, selection);
  if (!additive) return { nodeIds: [id], primaryNodeId: id };

  const current = prunePathNodeSelection(network, selection);
  const nodeIds = [...current.nodeIds];
  const index = nodeIds.indexOf(id);
  if (index >= 0) {
    nodeIds.splice(index, 1);
    return {
      nodeIds,
      primaryNodeId: current.primaryNodeId === id
        ? nodeIds.at(-1) || null
        : current.primaryNodeId
    };
  }
  nodeIds.push(id);
  return { nodeIds, primaryNodeId: id };
}

function pathNetwork(pathObject) {
  return pathObject?.properties?.pathNetwork || null;
}

function nodePosition(value, fallback = [0, 0, 0]) {
  return [
    finite(value?.[0], fallback[0]),
    finite(value?.[1], fallback[1]),
    finite(value?.[2], fallback[2])
  ];
}

/**
 * Clone one path and capture immutable starting states for a group gesture.
 * resolveEffectivePosition supplies terrain-resolved Y for terrain/offset nodes.
 */
export function createPathNodeGroupPreview(
  pathObject,
  selection,
  { resolveEffectivePosition } = {}
) {
  const network = pathNetwork(pathObject);
  if (pathObject?.type !== 'path' || !network) {
    throw new Error('A Path Network scene object is required for group preview.');
  }
  const pruned = prunePathNodeSelection(network, selection);
  if (!pruned.nodeIds.length) throw new Error('Group preview requires at least one valid path node.');

  const previewPath = structuredClone(pathObject);
  previewPath.properties.previewOnly = true;
  previewPath.properties.previewRevision = Number(pathObject.properties?.previewRevision || 0) + 1;
  const nodes = new Map(network.nodes.map(node => [String(node.id), node]));
  const startStates = pruned.nodeIds.map(id => {
    const node = nodes.get(id);
    const resolved = typeof resolveEffectivePosition === 'function'
      ? resolveEffectivePosition(node, pathObject)
      : node.position;
    return {
      nodeId: id,
      position: nodePosition(node.position),
      effectivePosition: nodePosition(resolved, node.position),
      heightMode: node.heightMode,
      heightOffset: finite(node.heightOffset)
    };
  });
  return {
    previewPath,
    nodeIds: [...pruned.nodeIds],
    primaryNodeId: pruned.primaryNodeId,
    startStates
  };
}

function previewNode(preview, nodeId) {
  return pathNetwork(preview?.previewPath)?.nodes?.find(node => node.id === nodeId) || null;
}

/**
 * Re-evaluate from immutable gesture starts, avoiding accumulated pointer error.
 * Horizontal movement preserves each node's height authority. Vertical movement
 * starts from resolved world Y and makes each edited node an absolute anchor.
 */
export function updatePathNodeGroupPreview(preview, {
  deltaX = 0,
  deltaY = 0,
  deltaZ = 0,
  vertical = false
} = {}) {
  if (!preview?.previewPath || !Array.isArray(preview.startStates)) {
    throw new Error('A path-node group preview is required.');
  }
  const dx = finite(deltaX);
  const dy = finite(deltaY);
  const dz = finite(deltaZ);
  const updated = [];
  for (const start of preview.startStates) {
    const node = previewNode(preview, start.nodeId);
    if (!node) throw new Error(`Path node ${start.nodeId} does not exist in the group preview.`);
    if (vertical) {
      node.position = [start.position[0], start.effectivePosition[1] + dy, start.position[2]];
      node.heightMode = 'absolute';
      node.heightOffset = 0;
    } else {
      node.position = [start.position[0] + dx, start.position[1], start.position[2] + dz];
      node.heightMode = start.heightMode;
      node.heightOffset = start.heightOffset;
    }
    updated.push(node);
  }
  preview.previewPath.properties.previewRevision = Number(
    preview.previewPath.properties.previewRevision || 0
  ) + 1;
  return updated;
}

/** Return one batch suitable for a single revisioned/undoable v2 transaction. */
export function pathNodeGroupMoveOperations(preview) {
  if (!preview?.previewPath || !Array.isArray(preview.nodeIds)) {
    throw new Error('A path-node group preview is required.');
  }
  return preview.nodeIds.map(nodeId => {
    const node = previewNode(preview, nodeId);
    if (!node) throw new Error(`Path node ${nodeId} does not exist in the group preview.`);
    return {
      type: 'move-node',
      nodeId,
      position: nodePosition(node.position),
      heightMode: node.heightMode,
      heightOffset: finite(node.heightOffset)
    };
  });
}
