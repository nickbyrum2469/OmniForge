import {
  PATH_CONSTRUCTION_MODES,
  PATH_HEIGHT_MODES,
  clonePathNetwork,
  normalizePathNetwork,
  pathNetworkNodeMap,
  validatePathNetwork
} from './model.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanId = value => String(value || '').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);

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

export function pathNetworkDegrees(network) {
  const nodes = pathNetworkNodeMap(network);
  const degree = new Map([...nodes.keys()].map(id => [id, 0]));
  for (const segment of network?.segments || []) {
    if (degree.has(segment.fromNode)) degree.set(segment.fromNode, degree.get(segment.fromNode) + 1);
    if (degree.has(segment.toNode)) degree.set(segment.toNode, degree.get(segment.toNode) + 1);
  }
  return degree;
}
