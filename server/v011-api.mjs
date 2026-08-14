import {
  readState,
  mutateState,
  addActivity,
  activeScene,
  findObject
} from './state-store.mjs';
import {
  ensureWorldFoundationState,
  fitGroundContactV011,
  terrainDiagnostics,
  pathDiagnostics,
  updateTerrainProperties,
  expandTerrain,
  addTerrainSculptLayer,
  undoTerrainSculpt,
  clearTerrainSculpt,
  applyLegacyPathCompatibilityMutation,
  migrateSceneWorldFoundation,
  terrainHeightAt,
  terrainNormalAt
} from './v011-systems.mjs';
import { TERRAIN_PRESETS } from '../app/worldgen.js';
import {
  attachPathNetwork,
  clonePathNetwork
} from '../app/path-network/model.js';
import {
  applyPathNetworkTransaction,
  duplicatePathNetwork,
  mergePathNetworksAtSegment,
  replacePathNetwork,
  splitPathNetworkAtNode
} from '../app/path-network/transactions.js';
import {
  compilePathNetwork,
  nearestCompiledStation
} from '../app/path-network/compiler.js';

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000_000) throw new Error('The v0.11 request body exceeds the 20 MB safety limit.');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function match(pathname, expression) {
  const result = expression.exec(pathname);
  return result ? result.slice(1).map(decodeURIComponent) : null;
}

function worldSnapshot(state) {
  ensureWorldFoundationState(state);
  const scene = activeScene(state);
  const terrain = scene.objects.find(object => object.type === 'terrain');
  const paths = scene.objects.filter(object => object.type === 'path');
  return {
    foundation: state.worldFoundationV011,
    terrain,
    paths,
    presets: Object.entries(TERRAIN_PRESETS).map(([id, value]) => ({ id, ...value })),
    terrainDiagnostics: terrain ? terrainDiagnostics(terrain, paths) : null,
    pathDiagnostics: terrain ? paths.map(path => ({ pathId: path.id, ...pathDiagnostics(path, terrain) })) : [],
    scene
  };
}

function requireTerrain(state, terrainId) {
  const terrain = activeScene(state).objects.find(object => object.id === terrainId && object.type === 'terrain');
  if (!terrain) throw new Error('Terrain not found.');
  if (terrain.locked) throw new Error('Terrain is locked.');
  return terrain;
}

function requirePath(state, pathId) {
  const path = activeScene(state).objects.find(object => object.id === pathId && object.type === 'path');
  if (!path) throw new Error('Path not found.');
  if (path.locked) throw new Error('Path is locked.');
  return path;
}

function authoredTerrainRevision(terrain) {
  return terrain
    ? Math.max(1, Math.floor(Number(terrain.properties?.generatedRevision) || 1))
    : null;
}

function uniquePathObjectId(scene, requested, fallback) {
  const base = String(requested || fallback || 'path')
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'path';
  const used = new Set((scene.objects || []).map(object => object.id));
  if (requested && used.has(base)) throw new Error(`Scene object ${base} already exists.`);
  let result = base;
  let suffix = 2;
  while (used.has(result)) result = `${base}-${suffix++}`;
  return result;
}

function clonedPathObject(source, objectId, name, network) {
  const clone = structuredClone(source);
  clone.id = objectId;
  clone.name = String(name || `${source.name} Copy`).slice(0, 120);
  clone.parentId = null;
  clone.transform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  clone.properties = {
    ...(clone.properties || {}),
    pathNetwork: clonePathNetwork(network),
    pathNetworkSchemaVersion: network.schemaVersion,
    pathNetworkUndo: [],
    pathNetworkRedo: []
  };
  return clone;
}

function authoritativePathNetwork(path) {
  return attachPathNetwork(path).network;
}

function requireExpectedRevision(network, value) {
  if (value === undefined || value === null) return;
  const expected = Number(value);
  if (!Number.isInteger(expected) || expected !== network.revision) {
    throw new Error(`Path Network revision conflict: expected ${value}, current ${network.revision}.`);
  }
}

function pushPathHistory(path, key, network, label, metadata = {}) {
  const history = Array.isArray(path.properties?.[key])
    ? path.properties[key].slice(-15)
    : [];
  history.push({
    label: String(label || 'Path edit').slice(0, 120),
    network: clonePathNetwork(network),
    restoreObjects: Array.isArray(metadata.restoreObjects) ? structuredClone(metadata.restoreObjects) : [],
    removeObjectIds: Array.isArray(metadata.removeObjectIds) ? metadata.removeObjectIds.map(String) : [],
    recordedAt: new Date().toISOString()
  });
  path.properties[key] = history;
}

function recordPathEdit(path, network, label) {
  pushPathHistory(path, 'pathNetworkUndo', network, label);
  path.properties.pathNetworkRedo = [];
}

function preflightPathHistoryObjects(scene, entry) {
  const removeObjectIds = Array.isArray(entry?.removeObjectIds) ? entry.removeObjectIds : [];
  const removeIds = new Set();
  for (const value of removeObjectIds) {
    const id = String(value || '');
    if (!id) throw new Error('Path history contains a removal target without a stable scene id.');
    if (removeIds.has(id)) throw new Error(`Path history contains duplicate removal target id ${id}.`);
    removeIds.add(id);
    const matches = scene.objects.filter(item => item.id === id);
    if (matches.length !== 1) {
      const reason = matches.length === 0 ? 'is missing' : `is ambiguous (${matches.length} scene objects use that id)`;
      throw new Error(`Cannot remove Path Network history object ${id} because it ${reason}. The history entry was not consumed.`);
    }
  }
  const restoreObjects = Array.isArray(entry?.restoreObjects) ? entry.restoreObjects : [];
  const restoreIds = new Set();
  for (const object of restoreObjects) {
    const id = String(object?.id || '');
    if (!id) throw new Error('Path history contains a restore object without a stable scene id.');
    if (restoreIds.has(id)) throw new Error(`Path history contains duplicate restore object id ${id}.`);
    restoreIds.add(id);
    if (scene.objects.some(item => item.id === id)) {
      throw new Error(`Cannot restore Path Network history object ${id} because that scene id is already occupied.`);
    }
  }
}

function applyPathHistoryObjects(scene, entry) {
  preflightPathHistoryObjects(scene, entry);
  const removeIds = new Set(entry?.removeObjectIds || []);
  const removedObjects = scene.objects.filter(object => removeIds.has(object.id)).map(object => structuredClone(object));
  if (removeIds.size) scene.objects = scene.objects.filter(object => !removeIds.has(object.id));
  const restoredObjects = [];
  for (const object of entry?.restoreObjects || []) {
    const restored = structuredClone(object);
    scene.objects.push(restored);
    restoredObjects.push(restored);
  }
  return {
    restoreObjects: removedObjects,
    removeObjectIds: restoredObjects.map(object => object.id)
  };
}

async function handleGround(req, res, url) {
  if (req.method !== 'POST' || url.pathname !== '/api/object/ground') return false;
  const input = await readJsonBody(req);
  const result = mutateState(state => {
    ensureWorldFoundationState(state);
    const scene = activeScene(state);
    const object = findObject(state, input.objectId);
    if (!object) throw new Error('Object not found.');
    if (object.locked) throw new Error('Object is locked.');
    if (['terrain', 'path', 'directionalLight', 'pointLight', 'empty'].includes(object.type)) throw new Error('This entity cannot be grounded to terrain.');
    const asset = object.properties?.assetId ? state.assets.find(item => item.id === object.properties.assetId && item.type === 'model') : null;
    const diagnostics = fitGroundContactV011({ scene, object, asset, maxTilt: Number(input.maxTilt || 35) });
    state.selection.objectId = object.id;
    addActivity(state, 'placement', `Grounded ${object.name} against v0.11 terrain and path grade.`, { objectId: object.id, diagnostics });
    return { object, diagnostics };
  });
  json(res, 200, { ...result.result, state: result.state });
  return true;
}

export async function handleV011Request(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (await handleGround(req, res, url)) return true;
    if (!url.pathname.startsWith('/api/v011/') && !url.pathname.startsWith('/api/v012/')) return false;

    let ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/network$/);
    if (ids && req.method === 'GET') {
      const state = readState();
      ensureWorldFoundationState(state);
      const path = requirePath(state, ids[0]);
      const network = authoritativePathNetwork(path);
      json(res, 200, {
        pathId: path.id,
        network,
        undoDepth: path.properties.pathNetworkUndo?.length || 0,
        redoDepth: path.properties.pathNetworkRedo?.length || 0
      });
      return true;
    }

    if (ids && req.method === 'PUT') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(path);
        requireExpectedRevision(current, input.expectedRevision);
        const replacement = replacePathNetwork(current, {
          ...(input.network || {}),
          id: current.id,
          revision: current.revision + 1
        });
        recordPathEdit(path, current, input.label || 'Replace generated route');
        path.properties.pathNetwork = replacement.network;
        path.properties.pathNetworkSchemaVersion = replacement.network.schemaVersion;
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Replaced ${path.name} with Path Network revision ${replacement.network.revision}.`, {
          pathId: path.id,
          revision: replacement.network.revision,
          generation: replacement.network.generation
        });
        return {
          path,
          network: replacement.network,
          validation: replacement.validation,
          undoDepth: path.properties.pathNetworkUndo.length,
          redoDepth: 0
        };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/transaction$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(path);
        requireExpectedRevision(current, input.expectedRevision);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const transaction = applyPathNetworkTransaction(current, input, {
          terrainRevision: authoredTerrainRevision(terrain)
        });
        recordPathEdit(path, current, input.label || 'Edit path network');
        path.properties.pathNetwork = transaction.network;
        path.properties.pathNetworkSchemaVersion = transaction.network.schemaVersion;
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `${input.label || 'Edited path network'} on ${path.name}.`, {
          pathId: path.id,
          revision: transaction.network.revision,
          operationCount: Array.isArray(input.operations) ? input.operations.length : 0
        });
        return {
          path,
          network: transaction.network,
          validation: transaction.validation,
          undoDepth: path.properties.pathNetworkUndo.length,
          redoDepth: 0
        };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/duplicate$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const scene = activeScene(state);
        const source = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(source);
        requireExpectedRevision(current, input.expectedRevision);
        const objectId = uniquePathObjectId(scene, input.newPathId, `${source.id}-copy`);
        const duplicate = duplicatePathNetwork(current, {
          newNetworkId: objectId,
          offset: input.offset
        });
        const clone = clonedPathObject(source, objectId, input.name || `${source.name} Copy`, duplicate.network);
        pushPathHistory(source, 'pathNetworkUndo', current, input.label || 'Duplicate path network', {
          removeObjectIds: [clone.id]
        });
        source.properties.pathNetworkRedo = [];
        scene.objects.push(clone);
        // The source owns the creation-history entry. Keeping it selected
        // makes the next Undo remove the duplicate in one obvious action.
        state.selection.objectId = source.id;
        addActivity(state, 'path-network', `Duplicated ${source.name} as an independent Path Network.`, {
          sourcePathId: source.id,
          pathId: clone.id,
          revision: clone.properties.pathNetwork.revision
        });
        return {
          path: clone,
          network: duplicate.network,
          validation: duplicate.validation,
          sourcePathId: source.id,
          undoPathId: source.id,
          undoDepth: source.properties.pathNetworkUndo.length,
          redoDepth: 0
        };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/split$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const scene = activeScene(state);
        const path = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(path);
        requireExpectedRevision(current, input.expectedRevision);
        const objectId = uniquePathObjectId(scene, input.newPathId, `${path.id}-split`);
        const split = splitPathNetworkAtNode(current, input.nodeId, {
          newNetworkId: objectId,
          extractedSegmentId: input.extractedSegmentId
        });
        const extracted = clonedPathObject(path, objectId, input.name || `${path.name} Split`, split.extractedNetwork);
        pushPathHistory(path, 'pathNetworkUndo', current, input.label || 'Split path network', {
          removeObjectIds: [extracted.id]
        });
        path.properties.pathNetworkRedo = [];
        path.properties.pathNetwork = split.retainedNetwork;
        path.properties.pathNetworkSchemaVersion = split.retainedNetwork.schemaVersion;
        scene.objects.push(extracted);
        // Split history is stored on the retained path, so keep that object
        // selected for immediate Undo/Redo rather than selecting a fresh path
        // with an intentionally empty history stack.
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Split ${path.name} into two independent Path Networks.`, {
          pathId: path.id,
          extractedPathId: extracted.id,
          splitNodeId: split.splitNodeId,
          revision: split.retainedNetwork.revision
        });
        return {
          path,
          network: split.retainedNetwork,
          extractedPath: extracted,
          extractedNetwork: split.extractedNetwork,
          splitNodeId: split.splitNodeId,
          validation: split.retainedValidation,
          extractedValidation: split.extractedValidation,
          undoDepth: path.properties.pathNetworkUndo.length,
          redoDepth: 0
        };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/merge\/([^/]+)$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const scene = activeScene(state);
        const target = requirePath(state, ids[0]);
        const source = requirePath(state, ids[1]);
        if (target.id === source.id) throw new Error('A path cannot be merged into itself.');
        const current = authoritativePathNetwork(target);
        const sourceNetwork = authoritativePathNetwork(source);
        requireExpectedRevision(current, input.expectedRevision);
        requireExpectedRevision(sourceNetwork, input.expectedSourceRevision);
        const terrain = scene.objects.find(object => object.type === 'terrain');
        if (!terrain) throw new Error('A terrain is required to join path networks.');
        const baseHeightAt = (x, z) => terrainHeightAt(terrain, x, z, []);
        const baseNormalAt = (x, z) => terrainNormalAt(terrain, x, z, []);
        const compiledTarget = compilePathNetwork(current, {
          terrainHeightAt: baseHeightAt,
          terrainNormalAt: baseNormalAt,
          terrainRevision: authoredTerrainRevision(terrain),
          spacing: 0.35
        });
        const degree = new Map(sourceNetwork.nodes.map(node => [node.id, 0]));
        for (const segment of sourceNetwork.segments) {
          degree.set(segment.fromNode, (degree.get(segment.fromNode) || 0) + 1);
          degree.set(segment.toNode, (degree.get(segment.toNode) || 0) + 1);
        }
        const endpoints = sourceNetwork.nodes.filter(node => degree.get(node.id) === 1);
        const nearest = endpoints
          .map(node => ({ node, nearest: nearestCompiledStation(compiledTarget, node.position) }))
          .filter(item => item.nearest)
          .sort((a, b) => a.nearest.distance - b.nearest.distance)[0];
        if (!nearest) throw new Error('No open branch endpoint can be joined to the target path.');
        const selectedSegment = current.segments.find(segment => segment.id === nearest.nearest.segmentId);
        const authoredWidth = Number(selectedSegment?.crossSectionProfile?.width || current.defaults?.crossSectionProfile?.width || 3);
        const requestedMaximum = Number(input.maxJoinDistance);
        const maxJoinDistance = Number.isFinite(requestedMaximum)
          ? Math.max(0.1, Math.min(requestedMaximum, 10000))
          : Math.max(25, authoredWidth * 8);
        if (nearest.nearest.distance > maxJoinDistance) {
          throw new Error(
            `Nearest branch join is ${nearest.nearest.distance.toFixed(2)} m away from target segment ${nearest.nearest.segmentId}, `
            + `exceeding the ${maxJoinDistance.toFixed(2)} m safety limit. Move the branch closer or provide an intentional maxJoinDistance.`
          );
        }
        const naturalHeight = baseHeightAt(nearest.nearest.position[0], nearest.nearest.position[2]);
        const heightOffset = nearest.nearest.position[1] - naturalHeight;
        const merged = mergePathNetworksAtSegment(current, sourceNetwork, {
          targetSegmentId: nearest.nearest.segmentId,
          junctionPosition: nearest.nearest.position,
          curveT: nearest.nearest.curveT,
          curveAuthority: compiledTarget.segments.find(segment => segment.id === nearest.nearest.segmentId)?.curveAuthority,
          sourceNodeId: nearest.node.id,
          heightMode: Math.abs(heightOffset) <= 0.02 ? 'terrain' : 'offset',
          heightOffset,
          terrainRevision: authoredTerrainRevision(terrain)
        });
        pushPathHistory(target, 'pathNetworkUndo', current, input.label || 'Join path branch', {
          restoreObjects: [source]
        });
        target.properties.pathNetworkRedo = [];
        target.properties.pathNetwork = merged.network;
        target.properties.pathNetworkSchemaVersion = merged.network.schemaVersion;
        scene.objects = scene.objects.filter(object => object.id !== source.id);
        state.selection.objectId = target.id;
        addActivity(state, 'path-network', `Joined ${source.name} into ${target.name} as a real branch junction.`, {
          targetPathId: target.id,
          sourcePathId: source.id,
          junctionNodeId: merged.junctionNodeId,
          revision: merged.network.revision
        });
        return {
          path: target,
          network: merged.network,
          validation: merged.validation,
          removedPathId: source.id,
          junctionNodeId: merged.junctionNodeId,
          sourceEndpointId: nearest.node.id,
          targetSegmentId: nearest.nearest.segmentId,
          curveT: nearest.nearest.curveT,
          distance: nearest.nearest.distance,
          maxJoinDistance,
          importedNodeCount: merged.importedNodeCount,
          importedSegmentCount: merged.importedSegmentCount,
          undoDepth: target.properties.pathNetworkUndo.length,
          redoDepth: 0
        };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/undo$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(path);
        requireExpectedRevision(current, input.expectedRevision);
        const history = Array.isArray(path.properties.pathNetworkUndo) ? path.properties.pathNetworkUndo : [];
        const entry = history.at(-1);
        if (!entry?.network) throw new Error('No Path Network edit is available to undo.');
        const scene = activeScene(state);
        preflightPathHistoryObjects(scene, entry);
        history.pop();
        const inverseObjects = applyPathHistoryObjects(scene, entry);
        pushPathHistory(path, 'pathNetworkRedo', current, entry.label, inverseObjects);
        const restored = replacePathNetwork(current, {
          ...entry.network,
          id: current.id,
          revision: current.revision + 1
        });
        path.properties.pathNetwork = restored.network;
        path.properties.pathNetworkSchemaVersion = restored.network.schemaVersion;
        path.properties.pathNetworkUndo = history;
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Undid ${entry.label} on ${path.name}.`, {
          pathId: path.id,
          revision: restored.network.revision
        });
        return {
          path,
          network: restored.network,
          validation: restored.validation,
          undoDepth: history.length,
          redoDepth: path.properties.pathNetworkRedo.length
        };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/redo$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(path);
        requireExpectedRevision(current, input.expectedRevision);
        const history = Array.isArray(path.properties.pathNetworkRedo) ? path.properties.pathNetworkRedo : [];
        const entry = history.at(-1);
        if (!entry?.network) throw new Error('No Path Network edit is available to redo.');
        const scene = activeScene(state);
        preflightPathHistoryObjects(scene, entry);
        history.pop();
        const inverseObjects = applyPathHistoryObjects(scene, entry);
        pushPathHistory(path, 'pathNetworkUndo', current, entry.label, inverseObjects);
        const restored = replacePathNetwork(current, {
          ...entry.network,
          id: current.id,
          revision: current.revision + 1
        });
        path.properties.pathNetwork = restored.network;
        path.properties.pathNetworkSchemaVersion = restored.network.schemaVersion;
        path.properties.pathNetworkRedo = history;
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Redid ${entry.label} on ${path.name}.`, {
          pathId: path.id,
          revision: restored.network.revision
        });
        return {
          path,
          network: restored.network,
          validation: restored.validation,
          undoDepth: path.properties.pathNetworkUndo.length,
          redoDepth: history.length
        };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/v011/worldgen') {
      const state = readState();
      json(res, 200, worldSnapshot(state));
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v011/migrate') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        for (const scene of state.scenes || []) migrateSceneWorldFoundation(scene);
        addActivity(state, 'worldgen', 'Migrated terrain bounds and path nodes to stable world-space authority.', {});
        return worldSnapshot(state);
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    if (req.method === 'PATCH' && url.pathname === '/api/v011/scene-settings') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const scene = activeScene(state);
        if (Object.prototype.hasOwnProperty.call(input, 'splinesVisible')) scene.settings.splinesVisible = Boolean(input.splinesVisible);
        if (Object.prototype.hasOwnProperty.call(input, 'worldChunkSize')) scene.settings.worldChunkSize = Math.max(8, Math.min(1024, Number(input.worldChunkSize || 64)));
        addActivity(state, 'editor', `Spline overlays ${scene.settings.splinesVisible ? 'enabled' : 'hidden'}.`, {});
        return { settings: scene.settings };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/terrain\/([^/]+)$/);
    if (ids && req.method === 'PATCH') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        const properties = updateTerrainProperties(terrain, input.properties || input);
        const scene = activeScene(state);
        const diagnostics = terrainDiagnostics(terrain, scene.objects.filter(object => object.type === 'path'));
        addActivity(state, 'worldgen', `Updated terrain preset and landform controls for ${terrain.name}.`, { terrainId: terrain.id, preset: properties.preset, diagnostics });
        return { terrain, diagnostics };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/terrain\/([^/]+)\/expand$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        const scene = activeScene(state);
        const samplePoints = Array.isArray(input.preserveSamples) ? input.preserveSamples.slice(0, 64) : [];
        const before = samplePoints.map(point => ({ point, height: Number(point?.length >= 2 ? point[2] : NaN) }));
        const bounds = expandTerrain(terrain, String(input.direction || 'all'), Number(input.amount || terrain.properties.expandStep || 100));
        const diagnostics = terrainDiagnostics(terrain, scene.objects.filter(object => object.type === 'path'));
        addActivity(state, 'worldgen', `Expanded ${terrain.name} ${input.direction || 'all'} by ${Number(input.amount || terrain.properties.expandStep || 100)} world units without scaling existing coordinates.`, { terrainId: terrain.id, bounds, preservedSampleCount: before.length });
        return { terrain, bounds, diagnostics };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/terrain\/([^/]+)\/sculpt$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        const layer = addTerrainSculptLayer(terrain, input);
        addActivity(state, 'worldgen', 'Applied ' + layer.mode + ' sculpt stamp to ' + terrain.name + '.', { terrainId: terrain.id, layer });
        return { terrain, layer };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/terrain\/([^/]+)\/sculpt\/undo$/);
    if (ids && req.method === 'POST') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        return { terrain, removed: undoTerrainSculpt(terrain) };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/terrain\/([^/]+)\/sculpt$/);
    if (ids && req.method === 'DELETE') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        return { terrain, removedCount: clearTerrainSculpt(terrain) };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)$/);
    if (ids && req.method === 'PATCH') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const { expectedRevision, ...legacyPatch } = input;
        const compatibility = applyLegacyPathCompatibilityMutation(path, terrain, 'update-engineering', {
          properties: input.properties || legacyPatch,
          expectedRevision
        });
        const diagnostics = terrain ? pathDiagnostics(path, terrain) : null;
        addActivity(state, 'path-network', `Delegated legacy engineering update to ${path.name} Path Network revision ${compatibility.network.revision}.`, {
          pathId: path.id,
          revision: compatibility.network.revision,
          diagnostics
        });
        return { ...compatibility, properties: path.properties, diagnostics };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)\/node$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const compatibility = applyLegacyPathCompatibilityMutation(path, terrain, 'insert-node', input);
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Delegated legacy insertion to node ${compatibility.nodeId} on ${path.name}.`, {
          pathId: path.id,
          nodeId: compatibility.nodeId,
          revision: compatibility.network.revision
        });
        return compatibility;
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)\/node\/(\d+)$/);
    if (ids && req.method === 'PATCH') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const index = Number(ids[1]);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const compatibility = applyLegacyPathCompatibilityMutation(path, terrain, 'move-node', { ...input, index });
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Delegated legacy node move to ${compatibility.nodeId} on ${path.name}.`, {
          pathId: path.id,
          nodeId: compatibility.nodeId,
          revision: compatibility.network.revision
        });
        return compatibility;
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    if (ids && req.method === 'DELETE') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const index = Number(ids[1]);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const compatibility = applyLegacyPathCompatibilityMutation(path, terrain, 'delete-node', { index });
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Delegated legacy deletion of ${compatibility.nodeId} on ${path.name}.`, {
          pathId: path.id,
          nodeId: compatibility.nodeId,
          revision: compatibility.network.revision
        });
        return { ...compatibility, removedIndex: index };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)\/split$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const state = readState();
      ensureWorldFoundationState(state);
      const path = requirePath(state, ids[0]);
      const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
      applyLegacyPathCompatibilityMutation(path, terrain, 'split', input);
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)\/reverse$/);
    if (ids && req.method === 'POST') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const compatibility = applyLegacyPathCompatibilityMutation(path, terrain, 'reverse');
        state.selection.objectId = path.id;
        addActivity(state, 'path-network', `Delegated legacy reverse to ${path.name} Path Network revision ${compatibility.network.revision}.`, {
          pathId: path.id,
          revision: compatibility.network.revision
        });
        return compatibility;
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    json(res, 404, { error: 'Unknown OmniForge world-foundation or Path Network route.' });
    return true;
  } catch (error) {
    json(res, 400, { error: error.message, stack: error.stack });
    return true;
  }
}
