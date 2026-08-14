import {
  PATH_CONSTRUCTION_MODES,
  PATH_BRIDGE_STYLES,
  PATH_HANDLE_MODES,
  PATH_HEIGHT_MODES,
  clonePathNetwork,
  normalizePathNetwork,
  pathNetworkNodeMap,
  validatePathNetwork
} from './model.js';
import {
  PATH_CROSS_SECTION_PROFILE_IDS,
  normalizePathCrossSection,
  pathCrossSectionProfile
} from './cross-section-profiles.js';
import {
  PATH_SURFACE_DETAIL_PROFILE_IDS,
  normalizePathSurfaceDetail,
  pathSurfaceDetailProfile
} from './surface-detail-profiles.js';

const HANDLE_EPSILON = 1e-4;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanId = value => String(value || '').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (value, amount) => [value[0] * amount, value[1] * amount, value[2] * amount];
const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
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

function ensureEditableNode(network, nodeId) {
  const node = ensureNode(network, nodeId);
  if (node.locked) throw new Error(`Path node ${node.id} is locked.`);
  return node;
}

function ensureAvailableNodeId(network, requestedId) {
  const nodeId = cleanId(requestedId) || nextId(network, 'node');
  if (network.nodes.some(node => node.id === nodeId)) throw new Error(`Path node ${nodeId} already exists.`);
  return nodeId;
}

function ensureAvailableSegmentId(network, requestedId) {
  const segmentId = cleanId(requestedId) || nextId(network, 'segment');
  if (network.segments.some(segment => segment.id === segmentId)) throw new Error(`Path segment ${segmentId} already exists.`);
  return segmentId;
}

function ensureConnectionAvailable(network, fromNode, toNode, ignoredSegmentId = null) {
  const duplicate = network.segments.find(segment => (
    segment.id !== ignoredSegmentId
    && (
      (segment.fromNode === fromNode && segment.toNode === toNode)
      || (segment.fromNode === toNode && segment.toNode === fromNode)
    )
  ));
  if (duplicate) {
    throw new Error(`Path nodes ${fromNode} and ${toNode} are already connected by segment ${duplicate.id}.`);
  }
}

function ensureTopologyEditable(network, nodeIds) {
  for (const nodeId of new Set(nodeIds)) ensureEditableNode(network, nodeId);
}

const RETAINED_SEGMENT_AUTHORITY_FIELDS = Object.freeze([
  'curveType',
  'curveControl',
  'constructionMode',
  'constructionLocked',
  'crossSectionProfile',
  'materialProfile',
  'surfaceDetailProfile',
  'structureProfile',
  'gameplayRules',
  'costBreakdown'
]);

function incompatibleRetainedSegmentFields(first, second) {
  return RETAINED_SEGMENT_AUTHORITY_FIELDS.filter(field => (
    JSON.stringify(first?.[field] ?? null) !== JSON.stringify(second?.[field] ?? null)
  ));
}

function normalizedTransactionNode(network, source = {}) {
  const nodeId = ensureAvailableNodeId(network, source.id);
  const position = vec3(source.position, [0, 0, 0]);
  const heightMode = PATH_HEIGHT_MODES.includes(source.heightMode) ? source.heightMode : 'terrain';
  const handleMode = PATH_HANDLE_MODES.includes(source.handleMode) ? source.handleMode : 'automatic';
  const incomingHandle = handleMode === 'automatic' ? null : vec3(source.incomingHandle, [-1, 0, 0]);
  const outgoingHandle = handleMode === 'automatic' ? null : vec3(source.outgoingHandle, [1, 0, 0]);
  if (handleMode !== 'automatic' && (length3(incomingHandle) <= HANDLE_EPSILON || length3(outgoingHandle) <= HANDLE_EPSILON)) {
    throw new Error('Manual spline handles must have a non-zero length.');
  }
  return {
    id: nodeId,
    position,
    heightMode,
    heightOffset: finite(source.heightOffset),
    handleMode,
    incomingHandle,
    outgoingHandle,
    locked: source.locked === true
  };
}

function subdivideManualHermiteSegment(network, segment, node, curveT) {
  const fromNode = ensureEditableNode(network, segment.fromNode);
  const toNode = ensureEditableNode(network, segment.toNode);
  const t = finite(curveT, Number.NaN);
  if (!Number.isFinite(t) || t <= HANDLE_EPSILON || t >= 1 - HANDLE_EPSILON) {
    throw new Error('Exact curve insertion requires curveT strictly inside the segment.');
  }
  const manual = segment.curveType === 'hermite'
    && fromNode.heightMode === 'absolute'
    && toNode.heightMode === 'absolute'
    && fromNode.handleMode !== 'automatic'
    && toNode.handleMode !== 'automatic'
    && Array.isArray(fromNode.outgoingHandle)
    && Array.isArray(toNode.incomingHandle);
  const outgoingUseCount = network.segments.filter(item => item.fromNode === fromNode.id).length;
  const incomingUseCount = network.segments.filter(item => item.toNode === toNode.id).length;
  if (!manual || outgoingUseCount !== 1 || incomingUseCount !== 1) {
    throw new Error('Exact curve insertion requires one unshared manual absolute Hermite approach on each side.');
  }

  // Handles are cubic Bezier control-point deltas. Subdivide with De
  // Casteljau so adding an editor node cannot reshape the authored road.
  const p0 = [...fromNode.position];
  const p1 = add3(p0, fromNode.outgoingHandle);
  const p3 = [...toNode.position];
  const p2 = add3(p3, toNode.incomingHandle);
  const q0 = lerp3(p0, p1, t);
  const q1 = lerp3(p1, p2, t);
  const q2 = lerp3(p2, p3, t);
  const r0 = lerp3(q0, q1, t);
  const r1 = lerp3(q1, q2, t);
  const split = lerp3(r0, r1, t);

  fromNode.outgoingHandle = sub3(q0, p0);
  toNode.incomingHandle = sub3(q2, p3);
  node.position = split;
  node.heightMode = 'absolute';
  node.heightOffset = 0;
  node.handleMode = 'free';
  node.incomingHandle = sub3(r0, split);
  node.outgoingHandle = sub3(r1, split);
}

function normalizedCurveAuthority(value) {
  if (!value || !Array.isArray(value.start) || !Array.isArray(value.end)
    || !Array.isArray(value.fromHandle) || !Array.isArray(value.toHandle)) return null;
  for (const [label, vector] of [
    ['start', value.start],
    ['end', value.end],
    ['fromHandle', value.fromHandle],
    ['toHandle', value.toHandle]
  ]) {
    if (vector.length < 3 || vector.slice(0, 3).some(component => !Number.isFinite(Number(component)))) {
      throw new Error(`Compiled curve authority contains a non-finite ${label} vector.`);
    }
  }
  const authority = {
    segmentId: cleanId(value.segmentId),
    sourceRevision: finite(value.sourceRevision, Number.NaN),
    start: vec3(value.start, [0, 0, 0]),
    end: vec3(value.end, [0, 0, 0]),
    fromHandle: vec3(value.fromHandle, [0, 0, 0]),
    toHandle: vec3(value.toHandle, [0, 0, 0]),
    terrainRevision: value.terrainRevision === undefined || value.terrainRevision === null
      ? null
      : finite(value.terrainRevision, Number.NaN),
    profile: null
  };
  if (value.profile !== undefined && value.profile !== null) {
    const mode = String(value.profile.mode || '');
    if (!['absolute', 'terrain-relative'].includes(mode)) {
      throw new Error(`Compiled curve authority contains unknown vertical profile mode ${mode || '<missing>'}.`);
    }
    if (!Array.isArray(value.profile.samples) || value.profile.samples.length < 2 || value.profile.samples.length > 16384) {
      throw new Error('Compiled curve authority vertical profile requires between 2 and 16384 samples.');
    }
    const samples = value.profile.samples.map((sample, index) => {
      const sampleT = Number(sample?.t);
      const sampleValue = Number(sample?.value);
      if (!Number.isFinite(sampleT) || !Number.isFinite(sampleValue) || sampleT < 0 || sampleT > 1) {
        throw new Error(`Compiled curve authority vertical profile sample ${index} is invalid.`);
      }
      return { t: sampleT, value: sampleValue };
    });
    if (Math.abs(samples[0].t) > 1e-8 || Math.abs(samples.at(-1).t - 1) > 1e-8) {
      throw new Error('Compiled curve authority vertical profile must include exact t=0 and t=1 endpoints.');
    }
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].t - samples[index - 1].t <= 1e-8) {
        throw new Error('Compiled curve authority vertical profile samples must have strictly increasing t values.');
      }
    }
    authority.profile = {
      mode,
      samples,
      ...(mode === 'terrain-relative' ? { terrainRevision: authority.terrainRevision } : {})
    };
  }
  return authority;
}

function verticalProfileValue(profile, t) {
  const samples = profile.samples;
  if (t <= samples[0].t) return samples[0].value;
  if (t >= samples.at(-1).t) return samples.at(-1).value;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const midpoint = Math.floor((low + high) / 2);
    if (samples[midpoint].t <= t) low = midpoint;
    else high = midpoint;
  }
  const start = samples[low];
  const end = samples[high];
  const local = (t - start.t) / (end.t - start.t);
  return start.value + (end.value - start.value) * local;
}

function splitVerticalProfile(profile, splitT) {
  if (!profile) return [null, null];
  const splitValue = verticalProfileValue(profile, splitT);
  const firstSamples = [{ t: 0, value: profile.samples[0].value }];
  const secondSamples = [{ t: 0, value: splitValue }];
  for (const sample of profile.samples.slice(1, -1)) {
    if (sample.t < splitT - 1e-8) {
      firstSamples.push({ t: sample.t / splitT, value: sample.value });
    } else if (sample.t > splitT + 1e-8) {
      secondSamples.push({ t: (sample.t - splitT) / (1 - splitT), value: sample.value });
    }
  }
  firstSamples.push({ t: 1, value: splitValue });
  secondSamples.push({ t: 1, value: profile.samples.at(-1).value });
  const common = profile.mode === 'terrain-relative' && profile.terrainRevision !== undefined
    ? { mode: profile.mode, terrainRevision: profile.terrainRevision }
    : { mode: profile.mode };
  return [
    { ...common, samples: firstSamples },
    { ...common, samples: secondSamples }
  ];
}

function reverseVerticalProfile(profile) {
  if (!profile) return;
  profile.samples = profile.samples
    .map(sample => ({ t: 1 - sample.t, value: sample.value }))
    .reverse();
  profile.samples[0].t = 0;
  profile.samples.at(-1).t = 1;
}

function invalidateIncidentVerticalProfiles(network, nodeId) {
  for (const segment of network.segments) {
    if (segment.fromNode !== nodeId && segment.toNode !== nodeId) continue;
    if (segment.curveControl?.profile) delete segment.curveControl.profile;
  }
}

function subdivideCompiledHermiteSegment(network, segment, node, curveT, authorityInput, context = {}) {
  if (segment.curveType !== 'hermite') return null;
  const authority = normalizedCurveAuthority(authorityInput);
  if (!authority) {
    throw new Error('Exact automatic Hermite insertion requires the current compiled curve authority. Wait for path generation to finish and try again.');
  }
  if (authority.segmentId !== segment.id) {
    throw new Error(`Compiled curve authority belongs to segment ${authority.segmentId || '<missing>'}, not ${segment.id}.`);
  }
  if (authority.profile?.mode === 'terrain-relative') {
    const currentTerrainRevision = Number(context.terrainRevision ?? network?.sourceRevisions?.terrain);
    if (!Number.isFinite(currentTerrainRevision) || currentTerrainRevision <= 0) {
      throw new Error('Terrain-relative exact curve insertion requires a current authored-terrain revision.');
    }
    if (!Number.isFinite(authority.terrainRevision) || authority.terrainRevision !== currentTerrainRevision) {
      throw new Error(
        `Compiled curve authority terrain revision ${authority.terrainRevision ?? '<missing>'} does not match current authored terrain revision ${currentTerrainRevision}.`
      );
    }
  }
  const t = finite(curveT, Number.NaN);
  if (!Number.isFinite(t) || t <= HANDLE_EPSILON || t >= 1 - HANDLE_EPSILON) {
    throw new Error('Exact curve insertion requires curveT strictly inside the segment.');
  }
  const p0 = authority.start;
  const p1 = add3(p0, authority.fromHandle);
  const p3 = authority.end;
  const p2 = add3(p3, authority.toHandle);
  const q0 = lerp3(p0, p1, t);
  const q1 = lerp3(p1, p2, t);
  const q2 = lerp3(p2, p3, t);
  const r0 = lerp3(q0, q1, t);
  const r1 = lerp3(q1, q2, t);
  const split = lerp3(r0, r1, t);
  const visibleY = node.position[1];
  node.position = split;
  const [firstProfile, secondProfile] = splitVerticalProfile(authority.profile, t);
  if (authority.profile?.mode === 'absolute') {
    node.position[1] = verticalProfileValue(authority.profile, t);
    node.heightMode = 'absolute';
    node.heightOffset = 0;
  } else if (authority.profile?.mode === 'terrain-relative') {
    const offset = verticalProfileValue(authority.profile, t);
    node.position[1] = visibleY;
    node.heightMode = Math.abs(offset) <= 1e-6 ? 'terrain' : 'offset';
    node.heightOffset = node.heightMode === 'terrain' ? 0 : offset;
  } else {
    node.heightMode = 'absolute';
    node.heightOffset = 0;
  }
  node.handleMode = 'automatic';
  node.incomingHandle = null;
  node.outgoingHandle = null;
  const first = {
    fromHandle: sub3(q0, p0),
    toHandle: sub3(r0, node.position),
    ...(firstProfile ? { profile: firstProfile } : {})
  };
  const second = {
    fromHandle: sub3(r1, node.position),
    toHandle: sub3(q2, p3),
    ...(secondProfile ? { profile: secondProfile } : {})
  };
  segment.curveControl = first;
  return second;
}

function moveNode(network, input) {
  const node = ensureEditableNode(network, cleanId(input.nodeId));
  const hasPosition = Array.isArray(input.position);
  const hasDelta = Array.isArray(input.delta);
  if (!hasPosition && !hasDelta && input.heightMode === undefined && input.heightOffset === undefined) {
    throw new Error(`Move for path node ${node.id} does not change its position or height authority.`);
  }
  if (hasPosition && hasDelta) throw new Error(`Move for path node ${node.id} cannot specify both position and delta.`);
  if (hasPosition) node.position = vec3(input.position, node.position);
  if (hasDelta) {
    const delta = vec3(input.delta, [0, 0, 0]);
    node.position = node.position.map((value, index) => value + delta[index]);
  }
  if (input.heightMode !== undefined) {
    if (!PATH_HEIGHT_MODES.includes(input.heightMode)) throw new Error(`Unknown node height mode ${input.heightMode}.`);
    node.heightMode = input.heightMode;
  }
  if (input.heightOffset !== undefined) node.heightOffset = finite(input.heightOffset, node.heightOffset);
  invalidateIncidentVerticalProfiles(network, node.id);
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

function applyOperation(network, operation, context = {}) {
  switch (operation?.type) {
    case 'move-node': {
      moveNode(network, operation);
      break;
    }
    case 'move-nodes': {
      const moves = Array.isArray(operation.moves) ? operation.moves : [];
      if (!moves.length) throw new Error('A group node move requires at least one node.');
      const nodeIds = moves.map(move => cleanId(move?.nodeId));
      if (new Set(nodeIds).size !== nodeIds.length) throw new Error('A group node move cannot contain the same node more than once.');
      for (const move of moves) moveNode(network, move);
      break;
    }
    case 'set-node-height': {
      const node = ensureEditableNode(network, cleanId(operation.nodeId));
      if (!PATH_HEIGHT_MODES.includes(operation.heightMode)) throw new Error(`Unknown node height mode ${operation.heightMode}.`);
      node.heightMode = operation.heightMode;
      if (operation.y !== undefined) node.position[1] = finite(operation.y, node.position[1]);
      if (operation.heightOffset !== undefined) node.heightOffset = finite(operation.heightOffset, node.heightOffset);
      invalidateIncidentVerticalProfiles(network, node.id);
      break;
    }
    case 'set-node-handles': {
      const node = ensureEditableNode(network, cleanId(operation.nodeId));
      const handleMode = String(operation.handleMode || '');
      if (!PATH_HANDLE_MODES.includes(handleMode)) throw new Error(`Unknown node handle mode ${operation.handleMode}.`);
      if (handleMode === 'automatic') {
        node.handleMode = 'automatic';
        node.incomingHandle = null;
        node.outgoingHandle = null;
        for (const segment of network.segments) {
          if (segment.fromNode === node.id || segment.toNode === node.id) segment.curveControl = null;
        }
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
      // A direct handle edit becomes the new visible curve authority. Any
      // segment-local controls created by an exact subdivision are stale now.
      for (const segment of network.segments) {
        if (segment.fromNode === node.id || segment.toNode === node.id) segment.curveControl = null;
      }
      break;
    }
    case 'insert-node': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      ensureTopologyEditable(network, [segment.fromNode, segment.toNode]);
      const node = normalizedTransactionNode(network, operation.node);
      let secondCurveControl = null;
      if (operation.preserveCurve === true) {
        if (segment.curveType !== 'hermite') {
          throw new Error('Exact curve insertion is only available for Hermite segments.');
        }
        if (operation.curveAuthority && Number(operation.curveAuthority.sourceRevision) !== Number(network.revision)) {
          throw new Error(
            `Compiled curve authority revision ${operation.curveAuthority.sourceRevision} does not match current Path Network revision ${network.revision}.`
          );
        }
        const fromNode = ensureNode(network, segment.fromNode);
        const toNode = ensureNode(network, segment.toNode);
        const canUseNodeHandles = segment.curveType === 'hermite'
          && fromNode.heightMode === 'absolute'
          && toNode.heightMode === 'absolute'
          && fromNode.handleMode !== 'automatic'
          && toNode.handleMode !== 'automatic'
          && Array.isArray(fromNode.outgoingHandle)
          && Array.isArray(toNode.incomingHandle)
          && !segment.curveControl
          && network.segments.filter(item => item.fromNode === fromNode.id).length === 1
          && network.segments.filter(item => item.toNode === toNode.id).length === 1;
        if (canUseNodeHandles) {
          subdivideManualHermiteSegment(network, segment, node, operation.curveT);
        } else {
          secondCurveControl = subdivideCompiledHermiteSegment(
            network,
            segment,
            node,
            operation.curveT,
            operation.curveAuthority,
            context
          );
        }
      }
      network.nodes.push(node);
      const oldTo = segment.toNode;
      segment.toNode = node.id;
      const newSegment = structuredClone(segment);
      newSegment.id = ensureAvailableSegmentId(network, operation.newSegmentId);
      newSegment.fromNode = node.id;
      newSegment.toNode = oldTo;
      if (secondCurveControl) newSegment.curveControl = secondCurveControl;
      network.segments.push(newSegment);
      break;
    }
    case 'delete-node': {
      const nodeId = cleanId(operation.nodeId);
      ensureEditableNode(network, nodeId);
      const connected = network.segments.filter(segment => segment.fromNode === nodeId || segment.toNode === nodeId);
      if (connected.length > 2) throw new Error('Delete or reconnect branches before removing a junction node.');
      if (network.nodes.length <= 2) throw new Error('A path network requires at least two nodes.');
      if (connected.length === 2) {
        const neighbors = connected.map(segment => segment.fromNode === nodeId ? segment.toNode : segment.fromNode);
        ensureTopologyEditable(network, neighbors);
        ensureConnectionAvailable(network, neighbors[0], neighbors[1]);
        if (connected.some(segment => segment.curveControl)) {
          throw new Error(
            `Deleting degree-2 path node ${nodeId} would invalidate exact segment-local curve authority. `
            + 'Rebuild or return both incident segments to node-derived handles before deleting it.'
          );
        }
        const requestedRetainedSegmentId = cleanId(operation.retainedSegmentId);
        const retained = requestedRetainedSegmentId
          ? connected.find(segment => segment.id === requestedRetainedSegmentId)
          : null;
        if (requestedRetainedSegmentId && !retained) {
          throw new Error(`Retained segment ${requestedRetainedSegmentId} is not incident to path node ${nodeId}.`);
        }
        const incompatibleFields = incompatibleRetainedSegmentFields(connected[0], connected[1]);
        if (incompatibleFields.length && !retained) {
          throw new Error(
            `Deleting degree-2 path node ${nodeId} would discard incompatible segment authority (${incompatibleFields.join(', ')}). `
            + `Choose retainedSegmentId ${connected[0].id} or ${connected[1].id} explicitly.`
          );
        }
        const replacement = structuredClone(retained || connected[0]);
        replacement.id = nextId(network, 'segment');
        replacement.fromNode = neighbors[0];
        replacement.toNode = neighbors[1];
        network.nodes = network.nodes.filter(node => node.id !== nodeId);
        network.segments = network.segments.filter(segment => segment.fromNode !== nodeId && segment.toNode !== nodeId);
        network.segments.push(replacement);
      } else {
        network.nodes = network.nodes.filter(node => node.id !== nodeId);
        network.segments = network.segments.filter(segment => segment.fromNode !== nodeId && segment.toNode !== nodeId);
      }
      break;
    }
    case 'add-node': {
      network.nodes.push(normalizedTransactionNode(network, operation.node));
      break;
    }
    case 'remove-segment': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      ensureTopologyEditable(network, [segment.fromNode, segment.toNode]);
      network.segments = network.segments.filter(item => item.id !== segment.id);
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
    case 'set-segment-cross-section': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      const requestedProfileId = operation.profileId === undefined
        ? segment.crossSectionProfile?.profileId || 'dirt-road'
        : String(operation.profileId || '');
      if (!PATH_CROSS_SECTION_PROFILE_IDS.includes(requestedProfileId)) {
        throw new Error(`Unknown path cross-section profile ${requestedProfileId}.`);
      }
      const overrides = operation.crossSectionProfile && typeof operation.crossSectionProfile === 'object'
        ? operation.crossSectionProfile
        : {};
      segment.crossSectionProfile = operation.profileId === undefined
        ? normalizePathCrossSection({
            ...segment.crossSectionProfile,
            ...overrides,
            profileId: requestedProfileId
          })
        : pathCrossSectionProfile(requestedProfileId, overrides);
      break;
    }
    case 'set-segment-structure': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      const bridgeStyle = String(operation.bridgeStyle || 'auto');
      if (!PATH_BRIDGE_STYLES.includes(bridgeStyle)) {
        throw new Error(`Unknown bridge style ${bridgeStyle}.`);
      }
      segment.structureProfile = {
        ...segment.structureProfile,
        bridgeStyle,
        railings: operation.railings !== false
      };
      break;
    }
    case 'set-segment-surface-detail': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      const requestedProfileId = operation.profileId === undefined
        ? segment.surfaceDetailProfile?.profileId || 'weathered-dirt-road'
        : String(operation.profileId || '');
      if (!PATH_SURFACE_DETAIL_PROFILE_IDS.includes(requestedProfileId)) {
        throw new Error(`Unknown path surface detail profile ${requestedProfileId}.`);
      }
      const overrides = operation.surfaceDetailProfile && typeof operation.surfaceDetailProfile === 'object'
        ? operation.surfaceDetailProfile
        : {};
      segment.surfaceDetailProfile = operation.profileId === undefined
        ? normalizePathSurfaceDetail({
            ...segment.surfaceDetailProfile,
            ...overrides,
            profileId: requestedProfileId
          })
        : pathSurfaceDetailProfile(requestedProfileId, overrides);
      break;
    }
    case 'set-default-cross-section': {
      const requestedProfileId = String(operation.profileId || '');
      if (!PATH_CROSS_SECTION_PROFILE_IDS.includes(requestedProfileId)) {
        throw new Error(`Unknown path cross-section profile ${requestedProfileId}.`);
      }
      const overrides = operation.crossSectionProfile && typeof operation.crossSectionProfile === 'object'
        ? operation.crossSectionProfile
        : {};
      network.defaults.crossSectionProfile = pathCrossSectionProfile(requestedProfileId, overrides);
      break;
    }
    case 'set-default-surface-detail': {
      const requestedProfileId = String(operation.profileId || '');
      if (!PATH_SURFACE_DETAIL_PROFILE_IDS.includes(requestedProfileId)) {
        throw new Error(`Unknown path surface detail profile ${requestedProfileId}.`);
      }
      const overrides = operation.surfaceDetailProfile && typeof operation.surfaceDetailProfile === 'object'
        ? operation.surfaceDetailProfile
        : {};
      network.defaults.surfaceDetailProfile = pathSurfaceDetailProfile(requestedProfileId, overrides);
      break;
    }
    case 'reverse-segment': {
      const segment = ensureSegment(network, cleanId(operation.segmentId));
      ensureTopologyEditable(network, [segment.fromNode, segment.toNode]);
      const fromNode = ensureNode(network, segment.fromNode);
      const toNode = ensureNode(network, segment.toNode);
      if (!segment.curveControl && (fromNode.handleMode !== 'automatic' || toNode.handleMode !== 'automatic')) {
        throw new Error('A segment with manual spline handles cannot be reversed independently. Reverse the whole network or return its endpoint handles to automatic mode.');
      }
      [segment.fromNode, segment.toNode] = [segment.toNode, segment.fromNode];
      if (segment.curveControl) {
        [segment.curveControl.fromHandle, segment.curveControl.toHandle] = [
          [...segment.curveControl.toHandle],
          [...segment.curveControl.fromHandle]
        ];
        reverseVerticalProfile(segment.curveControl.profile);
      }
      break;
    }
    case 'reverse-network': {
      ensureTopologyEditable(network, network.nodes.map(node => node.id));
      for (const segment of network.segments) {
        [segment.fromNode, segment.toNode] = [segment.toNode, segment.fromNode];
        if (segment.curveControl) {
          [segment.curveControl.fromHandle, segment.curveControl.toHandle] = [
            [...segment.curveControl.toHandle],
            [...segment.curveControl.fromHandle]
          ];
          reverseVerticalProfile(segment.curveControl.profile);
        }
      }
      for (const node of network.nodes) {
        if (node.handleMode === 'automatic') continue;
        [node.incomingHandle, node.outgoingHandle] = [
          node.outgoingHandle ? [...node.outgoingHandle] : null,
          node.incomingHandle ? [...node.incomingHandle] : null
        ];
      }
      break;
    }
    case 'connect-nodes': {
      const fromNode = cleanId(operation.fromNode);
      const toNode = cleanId(operation.toNode);
      ensureTopologyEditable(network, [fromNode, toNode]);
      if (fromNode === toNode) throw new Error('A segment cannot connect a node to itself.');
      ensureConnectionAvailable(network, fromNode, toNode);
      network.segments.push({
        id: ensureAvailableSegmentId(network, operation.segmentId),
        fromNode,
        toNode,
        curveType: operation.curveType === 'linear' ? 'linear' : 'hermite',
        constructionMode: 'auto',
        constructionLocked: false,
        crossSectionProfile: structuredClone(network.defaults.crossSectionProfile),
        materialProfile: structuredClone(network.defaults.materialProfile),
        surfaceDetailProfile: structuredClone(network.defaults.surfaceDetailProfile),
        structureProfile: structuredClone(network.defaults.structureProfile),
        gameplayRules: structuredClone(network.defaults.gameplayRules)
      });
      break;
    }
    default:
      throw new Error(`Unsupported path transaction operation ${operation?.type || '<missing>'}.`);
  }
}

export function applyPathNetworkTransaction(input, transaction = {}, options = {}) {
  const before = normalizePathNetwork(input, { pathId: input?.id });
  const network = clonePathNetwork(before);
  const operations = Array.isArray(transaction.operations) ? transaction.operations : [];
  if (!operations.length) throw new Error('A path transaction requires at least one operation.');
  const context = {
    terrainRevision: options.terrainRevision ?? transaction.terrainRevision ?? null
  };
  for (const operation of operations) applyOperation(network, operation, context);
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
  const before = normalizePathNetwork(input, { pathId: input?.id || replacement?.id });
  const network = normalizePathNetwork(replacement, { pathId: input?.id || replacement?.id });
  if (JSON.stringify(before.engineering) !== JSON.stringify(network.engineering)) {
    for (const segment of network.segments) {
      if (segment.curveControl?.profile) delete segment.curveControl.profile;
    }
  }
  const validation = validatePathNetwork(network);
  if (!validation.valid) throw new Error(`Replacement path network is invalid: ${validation.errors.join(' ')}`);
  return { network: clonePathNetwork(network), validation };
}

export function duplicatePathNetwork(input, options = {}) {
  const source = normalizePathNetwork(input, { pathId: input?.id });
  const newNetworkId = cleanId(options.newNetworkId);
  if (!newNetworkId) throw new Error('Duplicating a Path Network requires a new network id.');
  if (newNetworkId === source.id) throw new Error('A duplicated Path Network must use a different network id.');
  const offset = vec3(options.offset, [1.5, 0, 0]);
  const nodeIds = new Map(source.nodes.map((node, index) => [node.id, `${newNetworkId}:node:${index}`]));
  const segmentIds = new Map(source.segments.map((segment, index) => [segment.id, `${newNetworkId}:segment:${index}`]));
  const network = normalizePathNetwork({
    ...structuredClone(source),
    id: newNetworkId,
    revision: 1,
    sourceRevisions: {},
    generation: null,
    migration: null,
    nodes: source.nodes.map(node => ({
      ...structuredClone(node),
      id: nodeIds.get(node.id),
      position: node.position.map((value, index) => value + offset[index])
    })),
    segments: source.segments.map(segment => {
      const duplicate = {
        ...structuredClone(segment),
        id: segmentIds.get(segment.id),
        fromNode: nodeIds.get(segment.fromNode),
        toNode: nodeIds.get(segment.toNode)
      };
      if (duplicate.curveControl?.profile?.mode === 'absolute' && Math.abs(offset[1]) > HANDLE_EPSILON) {
        duplicate.curveControl.profile.samples = duplicate.curveControl.profile.samples.map(sample => ({
          ...sample,
          value: sample.value + offset[1]
        }));
      }
      return duplicate;
    })
  }, { pathId: newNetworkId });
  const validation = validatePathNetwork(network);
  if (!validation.valid) throw new Error(`Duplicated Path Network is invalid: ${validation.errors.join(' ')}`);
  return {
    network: clonePathNetwork(network),
    validation,
    nodeIdMap: Object.fromEntries(nodeIds),
    segmentIdMap: Object.fromEntries(segmentIds)
  };
}

function connectedComponentsWithoutNode(network, removedNodeId) {
  const remaining = network.nodes.map(node => node.id).filter(nodeId => nodeId !== removedNodeId);
  const adjacency = new Map(remaining.map(nodeId => [nodeId, []]));
  for (const segment of network.segments) {
    if (segment.fromNode === removedNodeId || segment.toNode === removedNodeId) continue;
    adjacency.get(segment.fromNode)?.push(segment.toNode);
    adjacency.get(segment.toNode)?.push(segment.fromNode);
  }
  const unseen = new Set(remaining);
  const components = [];
  while (unseen.size) {
    const seed = unseen.values().next().value;
    const component = new Set([seed]);
    const pending = [seed];
    unseen.delete(seed);
    while (pending.length) {
      const current = pending.pop();
      for (const neighbor of adjacency.get(current) || []) {
        if (!unseen.has(neighbor)) continue;
        unseen.delete(neighbor);
        component.add(neighbor);
        pending.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

export function splitPathNetworkAtNode(input, nodeId, options = {}) {
  const source = normalizePathNetwork(input, { pathId: input?.id });
  const boundary = ensureEditableNode(source, cleanId(nodeId));
  const lockedNodes = source.nodes.filter(node => node.locked);
  if (lockedNodes.length) {
    throw new Error(
      `Cannot split Path Network ${source.id} while affected node(s) ${lockedNodes.map(node => node.id).join(', ')} are locked; unlock them explicitly first.`
    );
  }
  const connected = source.segments.filter(segment => segment.fromNode === boundary.id || segment.toNode === boundary.id);
  if (connected.length !== 2) throw new Error('A first-pass graph split requires an existing unlocked degree-2 node.');
  const components = connectedComponentsWithoutNode(source, boundary.id);
  if (components.length !== 2 || components.some(component => component.size === 0)) {
    throw new Error('The selected degree-2 node is not an articulation point and cannot split this Path Network into two connected paths.');
  }
  const requestedExtractedSegmentId = cleanId(options.extractedSegmentId);
  const extractedIncident = requestedExtractedSegmentId
    ? connected.find(segment => segment.id === requestedExtractedSegmentId)
    : connected[1];
  if (!extractedIncident) throw new Error('The requested extracted segment is not connected to the split node.');
  const extractedNeighborId = extractedIncident.fromNode === boundary.id ? extractedIncident.toNode : extractedIncident.fromNode;
  const extractedComponent = components.find(component => component.has(extractedNeighborId));
  const retainedComponent = components.find(component => component !== extractedComponent);
  if (!extractedComponent || !retainedComponent) throw new Error('The selected split could not resolve two connected components.');
  const retainedNodeIds = new Set([...retainedComponent, boundary.id]);
  const extractedNodeIds = new Set([...extractedComponent, boundary.id]);
  const retained = normalizePathNetwork({
    ...structuredClone(source),
    revision: source.revision + 1,
    generation: null,
    nodes: source.nodes.filter(node => retainedNodeIds.has(node.id)),
    segments: source.segments.filter(segment => retainedNodeIds.has(segment.fromNode) && retainedNodeIds.has(segment.toNode))
  }, { pathId: source.id });
  const newNetworkId = cleanId(options.newNetworkId);
  if (!newNetworkId || newNetworkId === source.id) throw new Error('Splitting a Path Network requires a distinct new network id.');
  const extractedSource = normalizePathNetwork({
    ...structuredClone(source),
    nodes: source.nodes.filter(node => extractedNodeIds.has(node.id)),
    segments: source.segments.filter(segment => extractedNodeIds.has(segment.fromNode) && extractedNodeIds.has(segment.toNode))
  }, { pathId: source.id });
  const extracted = duplicatePathNetwork(extractedSource, { newNetworkId, offset: [0, 0, 0] }).network;
  const retainedValidation = validatePathNetwork(retained);
  const extractedValidation = validatePathNetwork(extracted);
  if (!retainedValidation.valid || !extractedValidation.valid) {
    throw new Error(`Split Path Network is invalid: ${[...retainedValidation.errors, ...extractedValidation.errors].join(' ')}`);
  }
  return {
    retainedNetwork: clonePathNetwork(retained),
    extractedNetwork: clonePathNetwork(extracted),
    retainedValidation,
    extractedValidation,
    splitNodeId: boundary.id,
    extractedSegmentId: extractedIncident.id
  };
}

export function mergePathNetworksAtSegment(targetInput, sourceInput, options = {}) {
  const target = clonePathNetwork(normalizePathNetwork(targetInput, { pathId: targetInput?.id }));
  const source = normalizePathNetwork(sourceInput, { pathId: sourceInput?.id });
  const targetSegmentId = cleanId(options.targetSegmentId);
  const targetSegment = ensureSegment(target, targetSegmentId);
  const junctionPosition = vec3(options.junctionPosition, [0, 0, 0]);
  const endpointSnapTolerance = Math.max(0.001, finite(options.endpointSnapTolerance, 0.05));
  const endpointNode = [targetSegment.fromNode, targetSegment.toNode]
    .map(nodeId => ensureNode(target, nodeId))
    .find(node => length3(sub3(node.position, junctionPosition)) <= endpointSnapTolerance);
  const junctionId = endpointNode?.id || nextId(target, 'node');
  if (endpointNode) {
    // Welding another network onto an existing endpoint changes that node's
    // degree and therefore its topology just as surely as inserting a new
    // junction would. Endpoint snapping must not bypass node locks.
    ensureEditableNode(target, endpointNode.id);
  } else {
    applyOperation(target, {
      type: 'insert-node',
      segmentId: targetSegmentId,
      preserveCurve: targetSegment.curveType === 'hermite',
      curveT: options.curveT,
      curveAuthority: options.curveAuthority,
      node: {
        id: junctionId,
        position: junctionPosition,
        heightMode: PATH_HEIGHT_MODES.includes(options.heightMode) ? options.heightMode : 'terrain',
        heightOffset: finite(options.heightOffset)
      }
    }, { terrainRevision: options.terrainRevision ?? null });
  }

  const sourceDegrees = pathNetworkDegrees(source);
  const endpoints = source.nodes.filter(node => sourceDegrees.get(node.id) === 1);
  if (!endpoints.length) throw new Error('The source path has no open endpoint that can join the target network.');
  // Merge consumes the source network as a scene object, remaps every retained
  // node id, and welds one endpoint into the target. A locked source node is
  // therefore always affected; do not silently discard its identity/ownership.
  ensureTopologyEditable(source, source.nodes.map(node => node.id));
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
  const requestedMaximum = Number(options.maxJoinDistance);
  const targetWidth = finite(targetSegment.crossSectionProfile?.width, target.defaults?.crossSectionProfile?.width || 3);
  const maxJoinDistance = Number.isFinite(requestedMaximum)
    ? Math.max(0.1, Math.min(requestedMaximum, 10000))
    : Math.max(25, targetWidth * 8);
  const joinDistance = length3(sub3(sourceEndpoint.position, junctionPosition));
  if (joinDistance > maxJoinDistance) {
    throw new Error(
      `Source endpoint ${sourceEndpoint.id} is ${joinDistance.toFixed(2)} m from target segment ${targetSegment.id}, `
      + `exceeding the ${maxJoinDistance.toFixed(2)} m join safety limit.`
    );
  }

  // A branch join is a topological weld, not a short connector segment. Importing
  // the source endpoint beside the new junction creates two nearly coincident
  // nodes and a tiny third approach. That produces unstable tangents and
  // self-intersecting junction polygons in the exact recovered user project.
  const nodeIds = new Map([[sourceEndpoint.id, junctionId]]);
  for (const node of source.nodes) {
    if (node.id === sourceEndpoint.id) continue;
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
    junctionCreated: !endpointNode,
    sourceEndpointId: sourceEndpoint.id,
    targetSegmentId: targetSegment.id,
    curveT: Number.isFinite(Number(options.curveT)) ? Number(options.curveT) : null,
    distance: joinDistance,
    maxJoinDistance,
    importedNodeCount: Math.max(0, source.nodes.length - 1),
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
