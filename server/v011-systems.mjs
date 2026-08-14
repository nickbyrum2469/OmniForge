import {
  clamp,
  TERRAIN_PRESETS,
  normalizeTerrainProperties,
  normalizePathProperties,
  migrateSceneWorldFoundation,
  terrainBaseHeightAt,
  terrainHeightAt,
  terrainNormalAt,
  samplePathSpline,
  expandTerrain,
  insertPathPoint,
  splitPath,
  addTerrainSculptLayer,
  undoTerrainSculpt,
  clearTerrainSculpt
} from '../app/worldgen.js';
import { createScenePathRuntimeContext } from '../app/path-network/runtime.js';
import { sampleSceneGroundSurface } from '../app/path-network/consumers.js';
import {
  attachPathNetwork,
  clonePathNetwork
} from '../app/path-network/model.js';
import {
  applyPathNetworkTransaction,
  replacePathNetwork
} from '../app/path-network/transactions.js';
import {
  compilePathNetwork,
  nearestCompiledStation
} from '../app/path-network/compiler.js';

const now = () => new Date().toISOString();

export function ensureWorldFoundationState(state) {
  state.schemaVersion = Math.max(9, Number(state.schemaVersion || 0));
  state.engine = { ...(state.engine || {}), name: 'OmniForge', version: '0.11.0', status: 'ready', updatedAt: now() };
  state.project = { ...(state.project || {}), schemaVersion: Math.max(9, Number(state.project?.schemaVersion || 0)) };
  for (const scene of state.scenes || []) migrateSceneWorldFoundation(scene);
  state.worldFoundationV011 = {
    schemaVersion: 1,
    coordinateAuthority: 'world-space-meters',
    terrainSchemaVersion: 2,
    pathSchemaVersion: 2,
    expansionMode: 'continuous-bounds',
    waterIntegration: 'reserved-for-omnihydro',
    characterStudioRoadmap: 'planned-after-rigging-and-animation-foundation',
    ...(state.worldFoundationV011 || {}),
    updatedAt: now()
  };
  return state.worldFoundationV011;
}

function objectBounds(asset, object) {
  const source = asset?.bounds || { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5], size: [1, 1, 1], center: [0, 0, 0] };
  const scale = object.transform?.scale || [1, 1, 1];
  return {
    min: source.min.map((value, index) => Number(value || 0) * Number(scale[index] || 1)),
    max: source.max.map((value, index) => Number(value || 0) * Number(scale[index] || 1)),
    size: source.size.map((value, index) => Math.abs(Number(value || 1) * Number(scale[index] || 1)))
  };
}

function categoryMode(category) {
  if (category === 'foliage') return 'root-socket';
  if (category === 'vehicle') return 'wheel-contact';
  if (category === 'architecture') return 'foundation';
  if (category === 'character' || category === 'creature') return 'upright-contact';
  return 'support-plane';
}

export function fitGroundContactV011({ scene, object, asset, maxTilt = 35, runtimeContext = null }) {
  const terrain = scene.objects.find(item => item.type === 'terrain' && item.visible !== false);
  if (!terrain) throw new Error('No visible authoritative terrain exists in the active scene.');
  const context = runtimeContext || createScenePathRuntimeContext(scene);
  const position = object.transform?.position || [0, 0, 0];
  const bounds = objectBounds(asset, object);
  const category = asset?.category || object.type;
  const halfX = Math.max(0.05, bounds.size[0] / 2);
  const halfZ = Math.max(0.05, bounds.size[2] / 2);
  const yaw = Number(object.transform?.rotation?.[1] || 0) * Math.PI / 180;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const localSupports = category === 'vehicle'
    ? [[-halfX * 0.72, -halfZ * 0.68], [halfX * 0.72, -halfZ * 0.68], [-halfX * 0.72, halfZ * 0.68], [halfX * 0.72, halfZ * 0.68]]
    : [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
  const supports = localSupports.map(([x, z]) => [position[0] + x * c - z * s, position[2] + x * s + z * c]);
  const base = Number(bounds.min[1] ?? -0.5);
  const referenceY = position[1] + base;
  const groundSampleAt = (x, z, sampleReferenceY = referenceY) => {
    const constructionTerrainHeight = context.terrainService.elevationAt(x, z, { view: 'final-construction' });
    return sampleSceneGroundSurface(context.sceneConsumers, constructionTerrainHeight, x, z, {
      referenceY: sampleReferenceY,
      snapTolerance: Math.max(0.25, Math.abs(bounds.size[1]) * 0.1)
    });
  };
  const supportSamples = supports.map(([x, z]) => groundSampleAt(x, z));
  const heights = supportSamples.map(sample => sample.height);
  const centerSample = groundSampleAt(position[0], position[2]);
  const centerHeight = centerSample.height;
  const averageHeight = (heights.reduce((sum, value) => sum + value, 0) + centerHeight) / (heights.length + 1);
  let pitch = 0, roll = 0;
  if (!['foliage', 'character', 'creature', 'architecture', 'vehicle'].includes(category)) {
    pitch = Math.atan2((heights[2] + heights[3]) - (heights[0] + heights[1]), halfZ * 4) * 180 / Math.PI;
    roll = -Math.atan2((heights[1] + heights[2]) - (heights[0] + heights[3]), halfX * 4) * 180 / Math.PI;
    pitch = clamp(pitch, -maxTilt, maxTilt);
    roll = clamp(roll, -maxTilt, maxTilt);
  }
  const burial = category === 'foliage' ? Number(object.properties?.rootBurial ?? asset?.placement?.rootBurial ?? 0.08) : 0;
  object.transform.position = [position[0], averageHeight - base - burial, position[2]];
  object.transform.rotation = [pitch, Number(object.transform?.rotation?.[1] || 0), roll];
  const finalBase = object.transform.position[1] + base;
  const signedErrors = heights.map(height => finalBase - height);
  const normalStep = Math.max(0.2, Math.min(1, Math.min(halfX, halfZ) * 0.5));
  const left = groundSampleAt(position[0] - normalStep, position[2], centerHeight + normalStep).height;
  const right = groundSampleAt(position[0] + normalStep, position[2], centerHeight + normalStep).height;
  const down = groundSampleAt(position[0], position[2] - normalStep, centerHeight + normalStep).height;
  const up = groundSampleAt(position[0], position[2] + normalStep, centerHeight + normalStep).height;
  const rawNormal = [left - right, normalStep * 2, down - up];
  const normalLength = Math.hypot(...rawNormal) || 1;
  const normal = rawNormal.map(value => value / normalLength);
  const allSamples = [...supportSamples, centerSample];
  const pathSamples = allSamples.filter(sample => sample.source === 'path-surface');
  const diagnostics = {
    mode: categoryMode(category),
    supportPoints: supports.map((point, index) => [point[0], heights[index], point[1]]),
    terrainSlopeDegrees: Math.acos(clamp(normal[1], -1, 1)) * 180 / Math.PI,
    maxContactError: Math.max(...signedErrors.map(Math.abs)),
    floatingError: Math.max(0, ...signedErrors),
    penetrationError: Math.max(0, ...signedErrors.map(value => -value)),
    pathAware: pathSamples.length > 0,
    pathNetworkIds: [...new Set(pathSamples.map(sample => sample.sourceNetworkId).filter(Boolean))].sort(),
    pathGenerationRevisions: [...new Set(pathSamples.map(sample => sample.generationRevision).filter(Number.isFinite))].sort((a, b) => a - b),
    constructionModes: [...new Set(pathSamples.map(sample => sample.constructionMode).filter(Boolean))].sort(),
    updatedAt: now()
  };
  object.properties = { ...(object.properties || {}), grounding: diagnostics };
  return diagnostics;
}

export function terrainDiagnostics(terrain, paths = [], grid = 18) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const values = [];
  for (let z = 0; z < grid; z += 1) {
    for (let x = 0; x < grid; x += 1) {
      const wx = properties.bounds.minX + (x / Math.max(1, grid - 1)) * (properties.bounds.maxX - properties.bounds.minX);
      const wz = properties.bounds.minZ + (z / Math.max(1, grid - 1)) * (properties.bounds.maxZ - properties.bounds.minZ);
      values.push(terrainBaseHeightAt(terrain, wx, wz));
    }
  }
  const min = Math.min(...values), max = Math.max(...values), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const rowCorrelations = [];
  for (let row = 0; row < grid - 2; row += 1) {
    let difference = 0;
    for (let column = 0; column < grid; column += 1) difference += Math.abs(values[row * grid + column] - values[(row + 2) * grid + column]);
    rowCorrelations.push(difference / grid);
  }
  const averageBandDifference = rowCorrelations.reduce((sum, value) => sum + value, 0) / Math.max(1, rowCorrelations.length);
  return {
    schemaVersion: 2,
    sampleView: 'authored-natural',
    pathModificationAuthority: 'compiled-path-network-v2',
    pathNetworks: (paths || []).map(path => {
      const network = attachPathNetwork(path, {
        terrainHeightAt: (x, z) => terrainBaseHeightAt(terrain, x, z)
      }).network;
      return { pathId: path.id, networkId: network.id, revision: network.revision };
    }),
    minHeight: min,
    maxHeight: max,
    relief: max - min,
    meanHeight: mean,
    standardDeviation: Math.sqrt(variance),
    averageBandDifference,
    repetitiveBandRisk: averageBandDifference < Math.max(0.2, (max - min) * 0.015) ? 'warning' : 'low',
    sampleCount: values.length,
    preset: properties.preset,
    bounds: properties.bounds,
    hydrologyReady: properties.hydrologyReady,
    checkedAt: now()
  };
}

export function pathDiagnostics(pathObject, terrain) {
  const baseHeightAt = (x, z) => terrainBaseHeightAt(terrain, x, z);
  const terrainRevision = Math.max(1, Math.floor(Number(terrain?.properties?.generatedRevision) || 1));
  const network = attachPathNetwork(pathObject, { terrainHeightAt: baseHeightAt }).network;
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: baseHeightAt,
    terrainNormalAt: (x, z) => terrainNormalAt(terrain, x, z, []),
    terrainRevision,
    spacing: Math.max(0.25, Number(network.defaults?.crossSectionProfile?.width || 3) * 0.2),
    generationRevision: network.revision
  });
  const constructionModes = {};
  for (const segment of compiled.segments) {
    const mode = String(segment.construction?.mode || 'invalid');
    constructionModes[mode] = (constructionModes[mode] || 0) + 1;
  }
  const gameplayReady = compiled.diagnostics.valid === true;
  return {
    schemaVersion: 2,
    authority: 'compiled-path-network-v2',
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: compiled.generationRevision,
    nodeCount: compiled.nodes.length,
    segmentCount: compiled.segments.length,
    junctionCount: compiled.junctions.length,
    sampleCount: compiled.stations.length,
    totalLength: compiled.diagnostics.totalLength,
    compiledMaxGradePercent: compiled.diagnostics.maximumGradePercent,
    configuredMaxGradePercent: network.engineering.maxGradePercent,
    estimatedCut: compiled.diagnostics.maximumCut,
    estimatedFill: compiled.diagnostics.maximumFill,
    configuredMaxCut: network.engineering.maxCutDepth,
    configuredMaxFill: network.engineering.maxFillDepth,
    constructionModes,
    constraintStatus: gameplayReady ? 'passed' : 'blocked-invalid-construction',
    invalidSegmentIds: [...compiled.diagnostics.invalidSegmentIds],
    gameplayReady,
    validation: gameplayReady ? 'passed' : 'failed',
    checkedAt: now()
  };
}

const LEGACY_ENGINEERING_KEYS = new Set([
  'civilAssist',
  'maxGradePercent',
  'minimumCurveRadius',
  'maxCutDepth',
  'maxFillDepth',
  'retainingWallThreshold',
  'bridgeThreshold',
  'minimumBridgeRunLength',
  'bridgeIntervalPadding',
  'tunnelThreshold',
  'maximumBridgeSpan',
  'tunnelClearance',
  'stairMaximumRise',
  'stairMinimumRun'
]);

const LEGACY_PATH_COMPATIBILITY_HELP = 'Use the schema-v2 Path Network endpoint /api/v012/path/{pathId}/transaction with stable node and segment IDs.';

function legacyCompatibilityError(message) {
  return new Error(`${message} ${LEGACY_PATH_COMPATIBILITY_HELP}`);
}

function simplePathOrder(network) {
  if (network.segments.length !== network.nodes.length - 1) return null;
  const adjacency = new Map(network.nodes.map(node => [node.id, []]));
  for (const segment of network.segments) {
    adjacency.get(segment.fromNode)?.push({ segment, nodeId: segment.toNode });
    adjacency.get(segment.toNode)?.push({ segment, nodeId: segment.fromNode });
  }
  if ([...adjacency.values()].some(items => items.length > 2)) return null;
  const endpoints = network.nodes.filter(node => adjacency.get(node.id)?.length === 1);
  if (endpoints.length !== 2) return null;
  const directedStart = endpoints.find(node => {
    const outgoing = network.segments.some(segment => segment.fromNode === node.id);
    const incoming = network.segments.some(segment => segment.toNode === node.id);
    return outgoing && !incoming;
  });
  const start = directedStart || endpoints[0];
  const nodes = [];
  const segments = [];
  const visited = new Set();
  let previousId = null;
  let current = start;
  while (current) {
    nodes.push(current);
    const next = (adjacency.get(current.id) || []).find(item => item.nodeId !== previousId && !visited.has(item.segment.id));
    if (!next) break;
    visited.add(next.segment.id);
    segments.push(next.segment);
    previousId = current.id;
    current = network.nodes.find(node => node.id === next.nodeId) || null;
  }
  return nodes.length === network.nodes.length && segments.length === network.segments.length
    ? { nodes, segments }
    : null;
}

function pushCompatibilityHistory(pathObject, network, label) {
  const history = Array.isArray(pathObject.properties?.pathNetworkUndo)
    ? pathObject.properties.pathNetworkUndo.slice(-15)
    : [];
  history.push({
    label: String(label || 'Legacy Path Network compatibility edit').slice(0, 120),
    network: clonePathNetwork(network),
    restoreObjects: [],
    removeObjectIds: [],
    recordedAt: now()
  });
  pathObject.properties.pathNetworkUndo = history;
  pathObject.properties.pathNetworkRedo = [];
}

function syncLegacyPathProjection(pathObject, network) {
  const order = simplePathOrder(network);
  if (!order) return;
  pathObject.properties.points = order.nodes.map(node => [node.position[0], node.position[2]]);
  pathObject.properties.nodeElevations = order.nodes.map(node => (
    node.heightMode === 'absolute' ? node.position[1] : null
  ));
  pathObject.properties.legacyPathProjectionRevision = network.revision;
}

function replaceLegacyEngineering(network, patch) {
  const requested = Object.keys(patch || {});
  const supported = requested.filter(key => LEGACY_ENGINEERING_KEYS.has(key));
  const passthrough = new Set(['showSpline', 'width', 'spline', 'collider', 'navigation']);
  const unsupported = requested.filter(key => !LEGACY_ENGINEERING_KEYS.has(key) && !passthrough.has(key));
  if (unsupported.length) {
    throw legacyCompatibilityError(`Legacy path engineering fields are not schema-v2 authorities: ${unsupported.join(', ')}.`);
  }
  if (!requested.length) throw legacyCompatibilityError('The legacy path engineering patch is empty.');
  const replacement = clonePathNetwork(network);
  for (const key of supported) replacement.engineering[key] = patch[key];
  if (Object.prototype.hasOwnProperty.call(patch, 'showSpline')) replacement.editor.showSpline = patch.showSpline !== false;
  if (Object.prototype.hasOwnProperty.call(patch, 'width')) {
    const width = Number(patch.width);
    if (!Number.isFinite(width) || width <= 0) throw legacyCompatibilityError('Legacy path width must be a positive finite number.');
    replacement.defaults.crossSectionProfile.width = width;
    for (const segment of replacement.segments) segment.crossSectionProfile.width = width;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'spline')) {
    for (const segment of replacement.segments) segment.curveType = patch.spline === false ? 'linear' : 'hermite';
  }
  for (const key of ['collider', 'navigation']) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    replacement.defaults.gameplayRules[key] = patch[key] !== false;
    for (const segment of replacement.segments) segment.gameplayRules[key] = patch[key] !== false;
  }
  replacement.revision = network.revision + 1;
  return replacePathNetwork(network, replacement);
}

/**
 * Compatibility adapter for v0.11 route and MCP names. It never treats
 * properties.points or nodeElevations as writable runtime authority.
 */
export function applyLegacyPathCompatibilityMutation(pathObject, terrain, command, input = {}) {
  if (!terrain) throw new Error('A terrain is required to edit a schema-v2 Path Network.');
  const baseHeightAt = (x, z) => terrainBaseHeightAt(terrain, x, z);
  const terrainRevision = Math.max(1, Math.floor(Number(terrain?.properties?.generatedRevision) || 1));
  const current = attachPathNetwork(pathObject, { terrainHeightAt: baseHeightAt }).network;
  const expectedRevision = input.expectedRevision;
  if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
    throw new Error(`Path Network revision conflict: expected ${expectedRevision}, current ${current.revision}.`);
  }
  let result;
  let metadata = {};
  if (command === 'update-engineering') {
    result = replaceLegacyEngineering(current, input.properties || input);
  } else if (command === 'insert-node') {
    const x = Number(input.x), z = Number(input.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw legacyCompatibilityError('Legacy node insertion requires finite x and z coordinates.');
    const compiled = compilePathNetwork(current, {
      terrainHeightAt: baseHeightAt,
      terrainNormalAt: (sampleX, sampleZ) => terrainNormalAt(terrain, sampleX, sampleZ, []),
      terrainRevision,
      spacing: 0.35
    });
    let segmentId;
    if (Number.isInteger(Number(input.index))) {
      const order = simplePathOrder(current);
      const index = Number(input.index);
      if (!order || index <= 0 || index >= order.nodes.length) {
        throw legacyCompatibilityError('Index-based node insertion is only safe between nodes of a simple, unbranched Path Network.');
      }
      segmentId = order.segments[index - 1].id;
      metadata.index = index;
    } else {
      const nearest = nearestCompiledStation(compiled, [x, baseHeightAt(x, z), z]);
      if (!nearest) throw legacyCompatibilityError('No compiled Path Network segment is available for insertion.');
      segmentId = nearest.segmentId;
    }
    const authoredY = Number(input.y);
    const hasAuthoredY = input.y !== undefined && Number.isFinite(authoredY);
    result = applyPathNetworkTransaction(current, {
      id: 'legacy-v011-insert-node',
      label: 'Insert Path Network node',
      operations: [{
        type: 'insert-node',
        segmentId,
        node: {
          position: [x, hasAuthoredY ? authoredY : baseHeightAt(x, z), z],
          heightMode: hasAuthoredY ? 'absolute' : 'terrain',
          heightOffset: Number(input.heightOffset || 0)
        }
      }]
    }, { terrainRevision });
    metadata.nodeId = result.network.nodes.at(-1)?.id || null;
  } else if (command === 'move-node' || command === 'delete-node') {
    const order = simplePathOrder(current);
    const index = Number(input.index);
    if (!order || !Number.isInteger(index) || !order.nodes[index]) {
      throw legacyCompatibilityError('Index-based node editing is only safe on a simple, unbranched Path Network.');
    }
    const node = order.nodes[index];
    if (command === 'move-node') {
      const x = Number(input.x), z = Number(input.z), authoredY = Number(input.y);
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw legacyCompatibilityError('Legacy node movement requires finite x and z coordinates.');
      const hasAuthoredY = input.y !== undefined && Number.isFinite(authoredY);
      result = applyPathNetworkTransaction(current, {
        id: 'legacy-v011-move-node',
        label: 'Move Path Network node',
        operations: [{
          type: 'move-node',
          nodeId: node.id,
          position: [x, hasAuthoredY ? authoredY : node.position[1], z],
          heightMode: hasAuthoredY ? 'absolute' : node.heightMode,
          heightOffset: node.heightOffset
        }]
      }, { terrainRevision });
    } else {
      result = applyPathNetworkTransaction(current, {
        id: 'legacy-v011-delete-node',
        label: 'Delete Path Network node',
        operations: [{ type: 'delete-node', nodeId: node.id }]
      }, { terrainRevision });
    }
    metadata = { index, nodeId: node.id };
  } else if (command === 'reverse') {
    result = applyPathNetworkTransaction(current, {
      id: 'legacy-v011-reverse-path',
      label: 'Reverse Path Network direction',
      // A whole-network reversal must also swap each authored node's incoming
      // and outgoing tangent authority. Reversing endpoints independently
      // reshaped manual Hermite curves even though the user only requested a
      // direction change.
      operations: [{ type: 'reverse-network' }]
    }, { terrainRevision });
  } else if (command === 'split') {
    throw legacyCompatibilityError('Legacy split creates a second points-based path object and is disabled. Insert/connect stable nodes or use the v2 merge route instead.');
  } else {
    throw legacyCompatibilityError(`Unknown legacy path mutation ${command}.`);
  }
  pushCompatibilityHistory(pathObject, current, `Legacy compatibility: ${command}`);
  pathObject.properties.pathNetwork = result.network;
  pathObject.properties.pathNetworkSchemaVersion = result.network.schemaVersion;
  syncLegacyPathProjection(pathObject, result.network);
  if (metadata.nodeId && metadata.index === undefined) {
    const order = simplePathOrder(result.network);
    metadata.index = order ? order.nodes.findIndex(node => node.id === metadata.nodeId) : -1;
  }
  return {
    path: pathObject,
    network: result.network,
    validation: result.validation,
    compatibility: {
      delegatedFrom: `v011:${command}`,
      authority: 'path-network-v2',
      previousRevision: current.revision,
      revision: result.network.revision
    },
    ...metadata
  };
}

export function updateTerrainProperties(terrain, patch = {}) {
  const current = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const protectedKeys = new Set(['bounds', 'sizeX', 'sizeZ']);
  const selectedPreset = patch.preset && TERRAIN_PRESETS[patch.preset] ? TERRAIN_PRESETS[patch.preset] : null;
  const next = selectedPreset ? { ...current, ...selectedPreset, preset: patch.preset } : { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    if (protectedKeys.has(key)) continue;
    next[key] = value;
  }
  next.generatedRevision = Number(current.generatedRevision || 0) + 1;
  terrain.properties = normalizeTerrainProperties(next, { ...terrain.transform, scale: [1, 1, 1] });
  terrain.transform.scale = [1, 1, 1];
  return terrain.properties;
}

export function updatePathProperties(pathObject, patch = {}) {
  const current = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  pathObject.properties = normalizePathProperties({ ...current, ...patch, profileRevision: Number(current.profileRevision || 0) + 1 }, { position: [0, 0, 0], scale: [1, 1, 1] });
  pathObject.transform.position = [0, 0, 0];
  pathObject.transform.scale = [1, 1, 1];
  return pathObject.properties;
}

export { expandTerrain, insertPathPoint, splitPath, addTerrainSculptLayer, undoTerrainSculpt, clearTerrainSculpt, normalizeTerrainProperties, normalizePathProperties, migrateSceneWorldFoundation, terrainHeightAt, terrainNormalAt, samplePathSpline };
