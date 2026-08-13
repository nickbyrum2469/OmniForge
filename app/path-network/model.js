import { normalizeBridgeProfile, PATH_BRIDGE_STYLES } from './bridge-profiles.js';
import { normalizePathCrossSection } from './cross-section-profiles.js';
import { normalizePathSurfaceDetail } from './surface-detail-profiles.js';

const PATH_NETWORK_SCHEMA_VERSION = 2;

export const PATH_CONSTRUCTION_MODES = Object.freeze([
  'auto',
  'conform',
  'cut-fill',
  'retaining-wall',
  'bridge',
  'tunnel',
  'stairs'
]);

export const PATH_HEIGHT_MODES = Object.freeze(['terrain', 'offset', 'absolute']);
export const PATH_HANDLE_MODES = Object.freeze(['automatic', 'aligned', 'free']);
export { PATH_BRIDGE_STYLES };

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const cleanId = value => String(value || 'path').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);

function vec3(value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) ? value : fallback;
  return [
    finite(source[0], fallback[0]),
    finite(source[1], fallback[1]),
    finite(source[2], fallback[2])
  ];
}

function nullableVec3(value) {
  return Array.isArray(value) && value.length >= 3 ? vec3(value) : null;
}

function uniqueId(requested, used, fallback) {
  const base = cleanId(requested || fallback);
  let result = base;
  let suffix = 2;
  while (used.has(result)) result = `${base}-${suffix++}`;
  used.add(result);
  return result;
}

function assertRawV2IdentityIntegrity(input) {
  if (Number(input?.schemaVersion) !== PATH_NETWORK_SCHEMA_VERSION) return;
  for (const [label, collection] of [
    ['node', input.nodes],
    ['segment', input.segments]
  ]) {
    if (!Array.isArray(collection)) continue;
    const used = new Set();
    for (const item of collection) {
      const rawId = item?.id === undefined || item?.id === null ? '' : String(item.id).trim();
      if (!rawId) {
        throw new Error(`Stored Path Network v2 contains a ${label} without an id; stable identity cannot be assigned implicitly.`);
      }
      const id = cleanId(rawId);
      if (id !== rawId) {
        throw new Error(`Stored Path Network v2 ${label} id ${rawId} is not canonical; use ${id} before it becomes authoritative.`);
      }
      if (used.has(id)) {
        throw new Error(`Stored Path Network v2 contains duplicate ${label} id ${id}; identity cannot be repaired implicitly.`);
      }
      used.add(id);
      if (label === 'segment' && item?.curveControl !== undefined && item.curveControl !== null) {
        for (const handleName of ['fromHandle', 'toHandle']) {
          const handle = item.curveControl?.[handleName];
          if (!Array.isArray(handle) || handle.length < 3 || handle.slice(0, 3).some(value => !Number.isFinite(Number(value)))) {
            throw new Error(`Stored Path Network v2 segment ${id} contains an invalid ${handleName} curve control.`);
          }
        }
      }
    }
  }
}

function defaultCrossSection(source = {}, fallback = {}) {
  return normalizePathCrossSection(source, fallback);
}

function defaultMaterialProfile(source = {}, fallback = {}) {
  return {
    surfaceMaterialId: source?.surfaceMaterialId ?? fallback?.surfaceMaterialId ?? null,
    shoulderMaterialId: source?.shoulderMaterialId ?? fallback?.shoulderMaterialId ?? null,
    curbMaterialId: source?.curbMaterialId ?? fallback?.curbMaterialId ?? null,
    sidewalkMaterialId: source?.sidewalkMaterialId ?? fallback?.sidewalkMaterialId ?? null,
    structureMaterialId: source?.structureMaterialId ?? fallback?.structureMaterialId ?? null
  };
}

function defaultGameplayRules(source = {}) {
  return {
    traversable: source.traversable !== false,
    navigation: source.navigation !== false,
    collider: source.collider !== false,
    vehicleClass: String(source.vehicleClass || 'mixed').slice(0, 40),
    speedLimitKph: clamp(source.speedLimitKph ?? source.designSpeedKph ?? 30, 1, 300)
  };
}

function defaultEngineering(source = {}) {
  const minimumBridgeRunLength = source.minimumBridgeRunLength === null
    || source.minimumBridgeRunLength === undefined
    || source.minimumBridgeRunLength === ''
    ? null
    : clamp(source.minimumBridgeRunLength, 0, 1000);
  return {
    civilAssist: source.civilAssist !== false,
    maxGradePercent: clamp(source.maxGradePercent ?? 12, 0.1, 100),
    minimumCurveRadius: clamp(source.minimumCurveRadius ?? 10, 0.5, 10000),
    maxCutDepth: clamp(source.maxCutDepth ?? 6, 0, 1000),
    maxFillDepth: clamp(source.maxFillDepth ?? 2.5, 0, 1000),
    retainingWallThreshold: clamp(source.retainingWallThreshold ?? 3.5, 0, 1000),
    bridgeThreshold: clamp(source.bridgeThreshold ?? 5, 0, 1000),
    minimumBridgeRunLength,
    bridgeIntervalPadding: clamp(source.bridgeIntervalPadding ?? 0, 0, 1000),
    tunnelThreshold: clamp(source.tunnelThreshold ?? 8, 0, 1000),
    maximumBridgeSpan: clamp(source.maximumBridgeSpan ?? 45, 2, 1000),
    tunnelClearance: clamp(source.tunnelClearance ?? 4.5, 1, 50),
    stairMaximumRise: clamp(source.stairMaximumRise ?? 0.19, 0.05, 0.3),
    stairMinimumRun: clamp(source.stairMinimumRun ?? 0.28, 0.15, 1)
  };
}

export function normalizePathNetwork(input = {}, options = {}) {
  // Legacy migration deliberately assigns missing/colliding identifiers once.
  // A persisted schema-v2 graph is already authoritative: silently renaming a
  // duplicate here would detach segment references and hide data corruption.
  assertRawV2IdentityIntegrity(input);
  const pathId = cleanId(options.pathId || input.id || 'path');
  const sourceNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const usedNodeIds = new Set();
  const nodes = sourceNodes.map((source, index) => {
    const id = uniqueId(source?.id, usedNodeIds, `${pathId}:node:${index}`);
    const heightMode = PATH_HEIGHT_MODES.includes(source?.heightMode) ? source.heightMode : 'terrain';
    const handleMode = PATH_HANDLE_MODES.includes(source?.handleMode) ? source.handleMode : 'automatic';
    return {
      id,
      position: vec3(source?.position),
      heightMode,
      heightOffset: finite(source?.heightOffset, 0),
      handleMode,
      incomingHandle: nullableVec3(source?.incomingHandle),
      outgoingHandle: nullableVec3(source?.outgoingHandle),
      locked: source?.locked === true
    };
  });

  const usedSegmentIds = new Set();
  const sourceSegments = Array.isArray(input.segments) ? input.segments : [];
  const segments = sourceSegments.map((source, index) => ({
    id: uniqueId(source?.id, usedSegmentIds, `${pathId}:segment:${index}`),
    fromNode: cleanId(source?.fromNode),
    toNode: cleanId(source?.toNode),
    curveType: source?.curveType === 'linear' ? 'linear' : 'hermite',
    curveControl: source?.curveControl
      && Array.isArray(source.curveControl.fromHandle)
      && Array.isArray(source.curveControl.toHandle)
      ? {
          fromHandle: vec3(source.curveControl.fromHandle),
          toHandle: vec3(source.curveControl.toHandle)
        }
      : null,
    constructionMode: PATH_CONSTRUCTION_MODES.includes(source?.constructionMode) ? source.constructionMode : 'auto',
    constructionLocked: source?.constructionLocked === true,
    crossSectionProfile: defaultCrossSection(
      source?.crossSectionProfile,
      input.defaults?.crossSectionProfile
    ),
    materialProfile: defaultMaterialProfile(source?.materialProfile, input.defaults?.materialProfile),
    surfaceDetailProfile: normalizePathSurfaceDetail(
      source?.surfaceDetailProfile,
      input.defaults?.surfaceDetailProfile
    ),
    structureProfile: normalizeBridgeProfile(source?.structureProfile || input.defaults?.structureProfile),
    gameplayRules: defaultGameplayRules(source?.gameplayRules || input.defaults?.gameplayRules),
    costBreakdown: source?.costBreakdown ? structuredClone(source.costBreakdown) : null
  }));

  return {
    schemaVersion: PATH_NETWORK_SCHEMA_VERSION,
    id: pathId,
    revision: Math.max(1, Math.floor(finite(input.revision, 1))),
    purpose: String(input.purpose || 'authored corridor').slice(0, 240),
    pathClass: String(input.pathClass || 'dirt-road').slice(0, 80),
    designRules: input.designRules ? structuredClone(input.designRules) : {},
    sourceRevisions: input.sourceRevisions ? structuredClone(input.sourceRevisions) : {},
    generation: input.generation ? structuredClone(input.generation) : null,
    nodes,
    segments,
    defaults: {
      crossSectionProfile: defaultCrossSection(input.defaults?.crossSectionProfile),
      materialProfile: defaultMaterialProfile(input.defaults?.materialProfile),
      surfaceDetailProfile: normalizePathSurfaceDetail(input.defaults?.surfaceDetailProfile),
      structureProfile: normalizeBridgeProfile(input.defaults?.structureProfile),
      gameplayRules: defaultGameplayRules(input.defaults?.gameplayRules)
    },
    engineering: defaultEngineering(input.engineering),
    editor: {
      showSpline: input.editor?.showSpline !== false,
      showGrade: input.editor?.showGrade === true,
      showCurvature: input.editor?.showCurvature === true,
      showCutFill: input.editor?.showCutFill === true,
      showConstructionBounds: input.editor?.showConstructionBounds === true
    },
    migration: input.migration ? {
      source: String(input.migration.source || 'legacy-v011').slice(0, 80),
      sourceSchemaVersion: finite(input.migration.sourceSchemaVersion, 1),
      sourcePathId: cleanId(input.migration.sourcePathId || pathId)
    } : null
  };
}

export function validatePathNetwork(input = {}) {
  let network;
  try {
    network = normalizePathNetwork(input, { pathId: input.id });
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
      warnings: [],
      nodeCount: Array.isArray(input?.nodes) ? input.nodes.length : 0,
      segmentCount: Array.isArray(input?.segments) ? input.segments.length : 0,
      junctionCount: 0
    };
  }
  const errors = [];
  const warnings = [];
  if (network.nodes.length < 2) errors.push('A path network requires at least two nodes.');
  if (network.segments.length < 1) errors.push('A path network requires at least one segment.');

  const nodeIds = new Set(network.nodes.map(node => node.id));
  const segmentIds = new Set();
  const connectedPairs = new Set();
  const degree = new Map(network.nodes.map(node => [node.id, 0]));
  for (const node of network.nodes) {
    if (!node.position.every(Number.isFinite)) errors.push(`Node ${node.id} contains a non-finite position.`);
  }
  for (const segment of network.segments) {
    if (segmentIds.has(segment.id)) errors.push(`Duplicate segment id ${segment.id}.`);
    segmentIds.add(segment.id);
    if (!nodeIds.has(segment.fromNode)) errors.push(`Segment ${segment.id} references missing start node ${segment.fromNode}.`);
    if (!nodeIds.has(segment.toNode)) errors.push(`Segment ${segment.id} references missing end node ${segment.toNode}.`);
    if (segment.fromNode === segment.toNode) errors.push(`Segment ${segment.id} cannot connect a node to itself.`);
    const pair = [segment.fromNode, segment.toNode].sort().join('\u0000');
    if (connectedPairs.has(pair)) {
      errors.push(`Segment ${segment.id} duplicates an existing connection between ${segment.fromNode} and ${segment.toNode}.`);
    }
    connectedPairs.add(pair);
    if (nodeIds.has(segment.fromNode)) degree.set(segment.fromNode, degree.get(segment.fromNode) + 1);
    if (nodeIds.has(segment.toNode)) degree.set(segment.toNode, degree.get(segment.toNode) + 1);
  }
  for (const [nodeId, count] of degree) {
    if (count === 0) warnings.push(`Node ${nodeId} is not connected to a segment.`);
  }
  if (network.nodes.length) {
    const adjacency = new Map(network.nodes.map(node => [node.id, []]));
    for (const segment of network.segments) {
      adjacency.get(segment.fromNode)?.push(segment.toNode);
      adjacency.get(segment.toNode)?.push(segment.fromNode);
    }
    const visited = new Set();
    const pending = [network.nodes[0].id];
    while (pending.length) {
      const nodeId = pending.pop();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      for (const neighbor of adjacency.get(nodeId) || []) {
        if (!visited.has(neighbor)) pending.push(neighbor);
      }
    }
    if (visited.size !== network.nodes.length) {
      warnings.push(`A Path Network contains ${network.nodes.length - visited.size} node(s) outside the primary graph.`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeCount: network.nodes.length,
    segmentCount: network.segments.length,
    junctionCount: [...degree.values()].filter(count => count > 2).length
  };
}

export function migrateLegacyPathObject(pathObject, options = {}) {
  if (!pathObject || pathObject.type !== 'path') throw new Error('A path scene object is required.');
  const properties = pathObject.properties || {};
  if (properties.pathNetwork?.schemaVersion === PATH_NETWORK_SCHEMA_VERSION) {
    const existing = normalizePathNetwork(properties.pathNetwork, { pathId: pathObject.id });
    const validation = validatePathNetwork(existing);
    if (!validation.valid) throw new Error(`Stored path network is invalid: ${validation.errors.join(' ')}`);
    return { network: existing, migrated: false, validation };
  }

  const offsetX = finite(pathObject.transform?.position?.[0], 0);
  const offsetY = finite(pathObject.transform?.position?.[1], 0);
  const offsetZ = finite(pathObject.transform?.position?.[2], 0);
  const worldSpace = properties.worldSpacePoints === true;
  const points = Array.isArray(properties.points) && properties.points.length >= 2
    ? properties.points
    : [[-10, 0], [0, 0], [10, 0]];
  const elevations = Array.isArray(properties.nodeElevations) ? properties.nodeElevations : [];
  const pathId = cleanId(pathObject.id || 'path');
  const nodes = points.map((point, index) => {
    const x = finite(Array.isArray(point) ? point[0] : point?.x, 0) + (worldSpace ? 0 : offsetX);
    const z = finite(Array.isArray(point) ? point[1] : point?.z, 0) + (worldSpace ? 0 : offsetZ);
    const authoredY = Number(elevations[index]);
    const hasAuthoredY = elevations[index] !== null
      && elevations[index] !== undefined
      && elevations[index] !== ''
      && Number.isFinite(authoredY);
    const terrainY = typeof options.terrainHeightAt === 'function' ? finite(options.terrainHeightAt(x, z), offsetY) : offsetY;
    return {
      id: `${pathId}:node:${index}`,
      position: [x, hasAuthoredY ? authoredY : terrainY, z],
      heightMode: hasAuthoredY ? 'absolute' : 'terrain',
      heightOffset: 0,
      handleMode: 'automatic',
      incomingHandle: null,
      outgoingHandle: null,
      locked: false
    };
  });
  const segments = nodes.slice(0, -1).map((node, index) => ({
    id: `${pathId}:segment:${index}`,
    fromNode: node.id,
    toNode: nodes[index + 1].id,
    curveType: properties.spline === false ? 'linear' : 'hermite',
    constructionMode: 'auto',
    constructionLocked: false,
    crossSectionProfile: defaultCrossSection({ ...properties, profileId: 'dirt-road' }),
    materialProfile: {
      surfaceMaterialId: properties.materialId ?? null,
      shoulderMaterialId: null,
      curbMaterialId: null,
      sidewalkMaterialId: null,
      structureMaterialId: null
    },
    surfaceDetailProfile: normalizePathSurfaceDetail({
      profileId: properties.width <= 1.8 ? 'walked-footpath' : 'weathered-dirt-road'
    }),
    gameplayRules: defaultGameplayRules(properties)
  }));
  const network = normalizePathNetwork({
    id: pathId,
    nodes,
    segments,
    defaults: {
      crossSectionProfile: defaultCrossSection({ ...properties, profileId: 'dirt-road' }),
      materialProfile: { surfaceMaterialId: properties.materialId ?? null },
      surfaceDetailProfile: normalizePathSurfaceDetail({
        profileId: properties.width <= 1.8 ? 'walked-footpath' : 'weathered-dirt-road'
      }),
      gameplayRules: defaultGameplayRules(properties)
    },
    engineering: defaultEngineering(properties),
    editor: { showSpline: properties.showSpline !== false },
    migration: {
      source: 'legacy-v011',
      sourceSchemaVersion: finite(properties.schemaVersion, 1),
      sourcePathId: pathId
    }
  }, { pathId });
  const validation = validatePathNetwork(network);
  if (!validation.valid) throw new Error(`Legacy path migration failed: ${validation.errors.join(' ')}`);
  return { network, migrated: true, validation };
}

export function attachPathNetwork(pathObject, options = {}) {
  const result = migrateLegacyPathObject(pathObject, options);
  pathObject.properties = {
    ...(pathObject.properties || {}),
    pathNetwork: result.network,
    pathNetworkSchemaVersion: PATH_NETWORK_SCHEMA_VERSION
  };
  return result;
}

export function clonePathNetwork(network) {
  return structuredClone(network);
}

export function pathNetworkNodeMap(network) {
  return new Map((network?.nodes || []).map(node => [node.id, node]));
}

export { PATH_NETWORK_SCHEMA_VERSION };
