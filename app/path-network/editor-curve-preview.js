const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (value, amount) => [value[0] * amount, value[1] * amount, value[2] * amount];
const length3 = value => Math.hypot(value[0], value[1], value[2]);
const normalize3 = (value, fallback = [0, 0, 1]) => {
  const length = length3(value);
  return length > EPSILON ? scale3(value, 1 / length) : [...fallback];
};
const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

function hermitePoint(start, end, startTangent, endTangent, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [
    h00 * start[0] + h10 * startTangent[0] + h01 * end[0] + h11 * endTangent[0],
    h00 * start[1] + h10 * startTangent[1] + h01 * end[1] + h11 * endTangent[1],
    h00 * start[2] + h10 * startTangent[2] + h01 * end[2] + h11 * endTangent[2]
  ];
}

function adjacencyFor(network) {
  const adjacency = new Map((network.nodes || []).map(node => [node.id, []]));
  for (const segment of network.segments || []) {
    adjacency.get(segment.fromNode)?.push(segment.toNode);
    adjacency.get(segment.toNode)?.push(segment.fromNode);
  }
  return adjacency;
}

function automaticTangent(nodeId, otherId, isStart, positions, adjacency, tension) {
  const node = positions.get(nodeId);
  const other = positions.get(otherId);
  const distance = Math.max(EPSILON, length3(sub3(other, node)));
  const connected = (adjacency.get(nodeId) || []).filter(id => id !== otherId);
  let vector = isStart ? sub3(other, node) : sub3(node, other);
  if (connected.length === 1) {
    const neighbor = positions.get(connected[0]);
    vector = isStart ? sub3(other, neighbor) : sub3(neighbor, other);
  }
  const chord = isStart ? sub3(other, node) : sub3(node, other);
  const amount = Math.max(0.12, Math.min(1, 1 - finite(tension, 0.5) * 0.72));
  return scale3(normalize3(vector, normalize3(chord)), distance * amount);
}

/**
 * Build a deliberately light, non-authoritative curve preview for one editor
 * gesture. It never compiles terrain, construction, collision, or structures.
 * The authoritative worker rebuild still happens once, after pointer release.
 */
export function samplePathEditorCurvePreview(pathObject, {
  resolveNodePosition,
  samplesPerSegment = 20
} = {}) {
  const network = pathObject?.properties?.pathNetwork;
  if (pathObject?.type !== 'path' || !network) return [];
  const nodeMap = new Map((network.nodes || []).map(node => [node.id, node]));
  const positions = new Map((network.nodes || []).map(node => [
    node.id,
    typeof resolveNodePosition === 'function'
      ? resolveNodePosition(node, pathObject)
      : [...node.position]
  ]));
  const adjacency = adjacencyFor(network);
  const tension = finite(network.editor?.splineTension, 0.5);
  const count = Math.max(4, Math.min(64, Math.round(finite(samplesPerSegment, 20))));

  return (network.segments || []).flatMap(segment => {
    const fromNode = nodeMap.get(segment.fromNode);
    const toNode = nodeMap.get(segment.toNode);
    const start = positions.get(segment.fromNode);
    const end = positions.get(segment.toNode);
    if (!fromNode || !toNode || !start || !end) return [];
    const startTangent = segment.curveControl?.fromHandle
      ? scale3(segment.curveControl.fromHandle, 3)
      : fromNode.handleMode !== 'automatic' && fromNode.outgoingHandle
      ? scale3(fromNode.outgoingHandle, 3)
      : automaticTangent(fromNode.id, toNode.id, true, positions, adjacency, tension);
    const endTangent = segment.curveControl?.toHandle
      ? scale3(segment.curveControl.toHandle, -3)
      : toNode.handleMode !== 'automatic' && toNode.incomingHandle
      ? scale3(toNode.incomingHandle, -3)
      : automaticTangent(toNode.id, fromNode.id, false, positions, adjacency, tension);
    const center = [];
    const left = [];
    const right = [];
    const width = Math.max(0.1, finite(segment.crossSectionProfile?.width, 2));
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      const point = segment.curveType === 'linear'
        ? lerp3(start, end, t)
        : hermitePoint(start, end, startTangent, endTangent, t);
      const beforeT = Math.max(0, t - 1 / count);
      const afterT = Math.min(1, t + 1 / count);
      const before = segment.curveType === 'linear'
        ? lerp3(start, end, beforeT)
        : hermitePoint(start, end, startTangent, endTangent, beforeT);
      const after = segment.curveType === 'linear'
        ? lerp3(start, end, afterT)
        : hermitePoint(start, end, startTangent, endTangent, afterT);
      const tangent = normalize3(sub3(after, before));
      const side = normalize3([-tangent[2], 0, tangent[0]], [1, 0, 0]);
      center.push(point);
      left.push(add3(point, scale3(side, width * 0.5)));
      right.push(add3(point, scale3(side, -width * 0.5)));
    }
    return [{ segmentId: segment.id, center, left, right }];
  });
}
