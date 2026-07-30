import {
  PATH_CONSTRUCTION_MODES,
  PATH_HANDLE_MODES,
  PATH_HEIGHT_MODES,
  clonePathNetwork,
  normalizePathNetwork,
  pathNetworkNodeMap,
  validatePathNetwork
} from './model.js';

const HANDLE_EPSILON = 1e-4;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanId = value => String(value || '').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (value, amount) => [value[0] * amount, value[1] * amount, value[2] * amount];
const length3 = value => Math.hypot(value[0], value[1], value[2]);

function vec3(value, fallback) {
  const source = Array.isArray(value) && value.length >= 3 ? value : fallback;
  return [
    finite(source?.[0], fallback?.[0] || 0),
    finite(source?.[1], fallback?.[1] || 0),
    finite(source?.[2], fallback?.[2] || 0)
  ];
}

function normalized(value) {
  const length = length3(value);
  return length > HANDLE_EPSILON ? scale3(value, 1 / length) : null;
}

function nextId(network, kind) {
  const collection = kind === 'node' ? network.nodes : network.segments;
  const prefix = `${network.id}:${kind}:`;
  let index = collection.length;
  const used = new Set(collection.map(item => item.id));
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function ensureNode(network, nodeId) {
  const node = network.nodes.find(item => item.id === nodeId);
  if (!node) throw new Error(`Path node ${nodeId} was not found.`);
  return node;
}

function ensureSegment(network, segmentId) {
  const segment = network.segments.find(item => item.id === segmentId);
  if (!segment) throw new Error(`Path segment ${segmentId} was not found.`);
  return segment;
}

export function suggestPathNodeHandles(network, nodeId) {
  const node = ensureNode(network, cleanId(nodeId));
  const incomingSegment = network.segments.find(segment => segment.toNode === node.id);
  const outgoingSegment = network.segments.find(segment => segment.fromNode === node.id);
  const connected = network.segments.filter(segment => segment.fromNode === node.id || segment.toNode === node.id);
  const neighborVector = segment => {
    if (!segment) return null;
    const neighborId = segment.fromNode === node.id ? segment.toNode : segment.fromNode;
    const neighbor = ensureNode(network, neighborId);
    return scale3(sub3(neighbor.position, node.position), 1 / 3);
  };
  let incomingHandle = neighborVector(incomingSegment);
  let outgoingHandle = neighborVector(outgoingSegment);
  const unused = connected.find(segment => segment !== incomingSegment && segment !== outgoingSegment);
  if (!incomingHandle) incomingHandle = neighborVector(unused || outgoingSegment);
  if (!outgoingHandle) outgoingHandle = neighborVector(unused || incomingSegment);
  if (incomingHandle && !outgoingSegment) outgoingHandle = scale3(incomingHandle, -1);
  if (outgoingHandle && !incomingSegment) incomingHandle = scale3(outgoingHandle, -1);
  return {
    incomingHandle: incomingHandle || [-1, 0, 0],
    outgoingHandle: outgoingHandle || [1, 0, 0],
    degree: connected.length
  };
}

function applyOperation(network, operation) {
  switch (operation?.type) {
    case 'move-node': {
      const node = ensureNode(network, cleanId(operation.nodeId));
      const position = Array.isArray(operation.position) ? operation.position : node.position;
      node.position = [
        finite(position[0], node.position[0]),
        finite(position[1], node.position[1]),
        finite(position[2], node.position[2])
      ];
      if (PATH_HEIGHT_MODES.includes(operation.heightMode)) node.heightMode = operation.heightMode;
      if (operation.heightOffset !== undefined) node.heightOffset = finite(operation.heightOffset, node.heightOffset);
      break;
    }
    case 'set-node-height': {
      const node = ensureNode(network, cleanId(operation.nodeId));
      if (!PATH_HEIGHT_MODES.includes(operation.heightMode)) throw new Error(`Unknown node height mode ${operation.heightMode}.`);
      node.heightMode = operation.heightMode;
      if (operation.y !== undefined) node.position[1] = finite(operation.y, node.position[1]);
      if (operation.heightOffset !== undefined) node.heightOffset = finite(operation.heightOffset, node.heightOffset);
      break;
    }
    case 'set-node-handles': {
      const node = ensureNode(network, cleanId(operation.nodeId));
      const handleMode = String(operation.handleMode || '');
      if (!PATH_HANDLE_MODES.includes(handleMode)) throw new Error(`Unknown node handle mode ${operation.handleMode}.`);
      if (handleMode === 'automatic') {
        node.handleMode = 'automatic';
        node.incomingHandle = null;
        node.outgoingHandle = null;
        break;
      }
      const suggested = suggestPathNodeHandles(network, node.id);
      if (suggested.degree > 2) {
        throw new Error('Manual spline handles are unavailable on junction nodes. Keep the junction automatic or edit its connected approach nodes.');
      }
      let incomingHandle = vec3(operation.incomingHandle, node.incomingHandle || suggested.incomingHandle);
      let outgoingHandle = vec3(operation.outgoingHandle, node.outgoingHandle || suggested.outgoingHandle);
      const incomingLength = length3(incomingHandle);
      const outgoingLength = length3(outgoingHandle);
      if (incomingLength <= HANDLE_EPSILON || outgoingLength <= HANDLE_EPSILON) {
        throw new Error('Manual spline handles must have a non-zero length.');
      }
      if (handleMode === 'aligned') {
        if (operation.primaryHandle === 'incoming') {
          outgoingHandle = scale3(normalized(incomingHandle), -outgoingLength);
        } else {
          incomingHandle = scale3(normalized(outgoingHandle), -incomingLength);
        }
      }
      node.handleMode = handleMode;
      node.incomingHandle = incomingHandle;
      node.outgoingHandle = outgoingHandle;
      break;
    }
    case 'insert-node': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      const nodeId = cleanId(operation.node?.id) || nextId(network, 'node');
      if (network.nodes.some(node => node.id === nodeId)) throw new Error(`Path node ${nodeId} already exists.`);
      const position = Array.isArray(operation.node?.position) ? operation.node.position : [0, 0, 0];
      const node = {
        id: nodeId,
        position: [finite(position[0]), finite(position[1]), finite(position[2])],
        heightMode: PATH_HEIGHT_MODES.includes(operation.node?.heightMode) ? operation.node.heightMode : 'terrain',
        heightOffset: finite(operation.node?.heightOffset),
        handleMode: 'automatic',
        incomingHandle: null,
        outgoingHandle: null,
        locked: false
      };
      network.nodes.push(node);
      const oldTo = segment.toNode;
      segment.toNode = node.id;
      const newSegment = structuredClone(segment);
      newSegment.id = cleanId(operation.newSegmentId) || nextId(network, 'segment');
      newSegment.fromNode = node.id;
      newSegment.toNode = oldTo;
      network.segments.push(newSegment);
      break;
    }
    case 'delete-node': {
      const nodeId = cleanId(operation.nodeId);
      ensureNode(network, nodeId);
      const connected = network.segments.filter(segment => segment.fromNode === nodeId || segment.toNode === nodeId);
      if (connected.length > 2) throw new Error('Delete or reconnect branches before removing a junction node.');
      if (network.nodes.length <= 2) throw new Error('A path network requires at least two nodes.');
      network.nodes = network.nodes.filter(node => node.id !== nodeId);
      network.segments = network.segments.filter(segment => segment.fromNode !== nodeId && segment.toNode !== nodeId);
      if (connected.length === 2) {
        const neighbors = connected.map(segment => segment.fromNode === nodeId ? segment.toNode : segment.fromNode);
        const replacement = structuredClone(connected[0]);
        replacement.id = nextId(network, 'segment');
        replacement.fromNode = neighbors[0];
        replacement.toNode = neighbors[1];
        network.segments.push(replacement);
      }
      break;
    }
    case 'set-segment-construction': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      if (!PATH_CONSTRUCTION_MODES.includes(operation.constructionMode)) {
        throw new Error(`Unknown construction mode ${operation.constructionMode}.`);
      }
      segment.constructionMode = operation.constructionMode;
      segment.constructionLocked = operation.locked === true;
      break;
    }
    case 'reverse-segment': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      [segment.fromNode, segment.toNode] = [segment.toNode, segment.fromNode];
      break;
    }
    case 'connect-nodes': {
      const fromNode = cleanId(operation.fromNode);
      const toNode = cleanId(operation.toNode);
      ensureNode(network, fromNode);
      ensureNode(network, toNode);
      if (fromNode === toNode) throw new Error('A segment cannot connect a node to itself.');
      network.segments.push({
        id: cleanId(operation.segmentId) || nextId(network, 'segment'),
        fromNode,
        toNode,
        curveType: operation.curveType === 'linear' ? 'linear' : 'hermite',
        constructionMode: 'auto',
        constructionLocked: false,
        crossSectionProfile: structuredClone(network.defaults.crossSectionProfile),
        materialProfile: structuredClone(network.defaults.materialProfile),
        gameplayRules: structuredClone(network.defaults.gameplayRules)
      });
      break;
    }
    default:
      throw new Error(`Unsupported path transaction operation ${operation?.type || '<missing>'}.`);
  }
}

export function applyPathNetworkTransaction(input, transaction = {}) {
  const before = normalizePathNetwork(input, { pathId: input?.id });
  const network = clonePathNetwork(before);
  const operations = Array.isArray(transaction.operations) ? transaction.operations : [];
  if (!operations.length) throw new Error('A path transaction requires at least one operation.');
  for (const operation of operations) applyOperation(network, operation);
  network.revision = before.revision + 1;
  const normalized = normalizePathNetwork(network, { pathId: network.id });
  const validation = validatePathNetwork(normalized);
  if (!validation.valid) throw new Error(`Path transaction rejected: ${validation.errors.join(' ')}`);
  return {
    network: clonePathNetwork(normalized),
    inverse: {
      id: `${transaction.id || 'path-transaction'}:undo`,
      label: `Undo ${transaction.label || 'path edit'}`,
      replaceNetwork: clonePathNetwork(before)
    },
    validation
  };
}

export function replacePathNetwork(input, replacement) {
  const network = normalizePathNetwork(replacement, { pathId: input?.id || replacement?.id });
  const validation = validatePathNetwork(network);
  if (!validation.valid) throw new Error(`Replacement path network is invalid: ${validation.errors.join(' ')}`);
  return { network: clonePathNetwork(network), validation };
}

export function mergePathNetworksAtSegment(targetInput, sourceInput, options = {}) {
  const target = clonePathNetwork(normalizePathNetwork(targetInput, { pathId: targetInput?.id }));
  const source = normalizePathNetwork(sourceInput, { pathId: sourceInput?.id });
  const targetSegmentId = cleanId(options.targetSegmentId);
  ensureSegment(target, targetSegmentId);
  const junctionPosition = vec3(options.junctionPosition, [0, 0, 0]);
  const junctionId = nextId(target, 'node');
  applyOperation(target, {
    type: 'insert-node',
    segmentId: targetSegmentId,
    node: {
      id: junctionId,
      position: junctionPosition,
      heightMode: PATH_HEIGHT_MODES.includes(options.heightMode) ? options.heightMode : 'terrain',
      heightOffset: finite(options.heightOffset)
    }
  });

  const sourceDegrees = pathNetworkDegrees(source);
  const endpoints = source.nodes.filter(node => sourceDegrees.get(node.id) === 1);
  if (!endpoints.length) throw new Error('The source path has no open endpoint that can join the target network.');
  const requestedSourceNodeId = cleanId(options.sourceNodeId);
  const sourceEndpoint = requestedSourceNodeId
    ? endpoints.find(node => node.id === requestedSourceNodeId)
    : endpoints.reduce((nearest, node) => (
        !nearest
        || length3(sub3(node.position, junctionPosition)) < length3(sub3(nearest.position, junctionPosition))
          ? node
          : nearest
      ), null);
  if (!sourceEndpoint) throw new Error('The requested source endpoint is not an open path endpoint.');

  const nodeIds = new Map();
  for (const node of source.nodes) {
    const id = nextId(target, 'node');
    nodeIds.set(node.id, id);
    target.nodes.push({ ...structuredClone(node), id });
  }
  for (const segment of source.segments) {
    target.segments.push({
      ...structuredClone(segment),
      id: nextId(target, 'segment'),
      fromNode: nodeIds.get(segment.fromNode),
      toNode: nodeIds.get(segment.toNode)
    });
  }
  target.segments.push({
    id: nextId(target, 'segment'),
    fromNode: junctionId,
    toNode: nodeIds.get(sourceEndpoint.id),
    curveType: 'hermite',
    constructionMode: 'auto',
    constructionLocked: false,
    crossSectionProfile: structuredClone(source.defaults.crossSectionProfile),
    materialProfile: structuredClone(source.defaults.materialProfile),
    gameplayRules: structuredClone(source.defaults.gameplayRules)
  });
  target.revision = Math.max(
    finite(targetInput?.revision, 0),
    finite(sourceInput?.revision, 0)
  ) + 1;
  const normalized = normalizePathNetwork(target, { pathId: target.id });
  const validation = validatePathNetwork(normalized);
  if (!validation.valid) throw new Error(`Merged Path Network is invalid: ${validation.errors.join(' ')}`);
  return {
    network: clonePathNetwork(normalized),
    validation,
    junctionNodeId: junctionId,
    sourceEndpointId: sourceEndpoint.id,
    importedNodeCount: source.nodes.length,
    importedSegmentCount: source.segments.length
  };
}

export function pathNetworkDegrees(network) {
  const nodes = pathNetworkNodeMap(network);
  const degree = new Map([...nodes.keys()].map(id => [id, 0]));
  for (const segment of network?.segments || []) {
    if (degree.has(segment.fromNode)) degree.set(segment.fromNode, degree.get(segment.fromNode) + 1);
    if (degree.has(segment.toNode)) degree.set(segment.toNode, degree.get(segment.toNode) + 1);
  }
  return degree;
}
