import {
  readState,
  mutateState,
  addActivity,
  activeScene,
  findObject,
  createSceneObject
} from './state-store.mjs';
import {
  ensureWorldFoundationState,
  fitGroundContactV011,
  terrainDiagnostics,
  pathDiagnostics,
  updateTerrainProperties,
  updatePathProperties,
  expandTerrain,
  insertPathPoint,
  splitPath,
  addTerrainSculptLayer,
  undoTerrainSculpt,
  clearTerrainSculpt,
  normalizePathProperties,
  migrateSceneWorldFoundation
} from './v011-systems.mjs';
import { TERRAIN_PRESETS } from '../app/worldgen.js';
import {
  attachPathNetwork,
  clonePathNetwork
} from '../app/path-network/model.js';
import {
  applyPathNetworkTransaction,
  replacePathNetwork
} from '../app/path-network/transactions.js';

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

function pushPathHistory(path, key, network, label) {
  const history = Array.isArray(path.properties?.[key])
    ? path.properties[key].slice(-15)
    : [];
  history.push({
    label: String(label || 'Path edit').slice(0, 120),
    network: clonePathNetwork(network),
    recordedAt: new Date().toISOString()
  });
  path.properties[key] = history;
}

function recordPathEdit(path, network, label) {
  pushPathHistory(path, 'pathNetworkUndo', network, label);
  path.properties.pathNetworkRedo = [];
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
        const transaction = applyPathNetworkTransaction(current, input);
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

    ids = match(url.pathname, /^\/api\/v012\/path\/([^/]+)\/undo$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const current = authoritativePathNetwork(path);
        requireExpectedRevision(current, input.expectedRevision);
        const history = Array.isArray(path.properties.pathNetworkUndo) ? path.properties.pathNetworkUndo : [];
        const entry = history.pop();
        if (!entry?.network) throw new Error('No Path Network edit is available to undo.');
        pushPathHistory(path, 'pathNetworkRedo', current, entry.label);
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
        const entry = history.pop();
        if (!entry?.network) throw new Error('No Path Network edit is available to redo.');
        pushPathHistory(path, 'pathNetworkUndo', current, entry.label);
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
        const properties = updatePathProperties(path, input.properties || input);
        const terrain = activeScene(state).objects.find(object => object.type === 'terrain');
        const diagnostics = terrain ? pathDiagnostics(path, terrain) : null;
        addActivity(state, 'path', `Updated spline and terrain-grade settings for ${path.name}.`, { pathId: path.id, diagnostics });
        return { path, properties, diagnostics };
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
        let inserted;
        if (Number.isInteger(Number(input.index))) {
          const properties = normalizePathProperties(path.properties || {}, path.transform || {});
          const points = properties.points.map(point => [...point]);
          const index = Math.max(0, Math.min(points.length, Number(input.index)));
          points.splice(index, 0, [Number(input.x), Number(input.z)]);
          inserted = { points, index };
        } else inserted = insertPathPoint(path, Number(input.x), Number(input.z));
        updatePathProperties(path, { points: inserted.points });
        state.selection.objectId = path.id;
        addActivity(state, 'path', `Inserted spline node ${inserted.index + 1} on ${path.name}.`, { pathId: path.id, index: inserted.index, point: inserted.points[inserted.index] });
        return { path, index: inserted.index };
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
        const properties = normalizePathProperties(path.properties || {}, path.transform || {});
        const index = Number(ids[1]);
        if (!properties.points[index]) throw new Error('Spline node not found.');
        const points = properties.points.map(point => [...point]);
        points[index] = [Number(input.x), Number(input.z)];
        updatePathProperties(path, { points });
        return { path, index };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    if (ids && req.method === 'DELETE') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const properties = normalizePathProperties(path.properties || {}, path.transform || {});
        const index = Number(ids[1]);
        if (properties.points.length <= 2) throw new Error('A path requires at least two spline nodes.');
        if (!properties.points[index]) throw new Error('Spline node not found.');
        const points = properties.points.map(point => [...point]);
        points.splice(index, 1);
        updatePathProperties(path, { points });
        return { path, removedIndex: index };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)\/split$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const scene = activeScene(state);
        const path = requirePath(state, ids[0]);
        const properties = normalizePathProperties(path.properties || {}, path.transform || {});
        if (properties.points.length < 3) throw new Error('A path requires at least three nodes before it can be split.');
        const [first, second] = splitPath(path, Number(input.index ?? Math.floor(properties.points.length / 2)));
        updatePathProperties(path, { points: first });
        const created = createSceneObject('path', {
          name: String(input.name || `${path.name} Branch`).slice(0, 120),
          position: [0, 0, 0],
          properties: { ...properties, points: second, worldSpacePoints: true, profileRevision: 1 }
        });
        scene.objects.push(created);
        state.selection.objectId = created.id;
        addActivity(state, 'path', `Split ${path.name} into two connected spline paths.`, { sourcePathId: path.id, createdPathId: created.id });
        return { source: path, created };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\/api\/v011\/path\/([^/]+)\/reverse$/);
    if (ids && req.method === 'POST') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const path = requirePath(state, ids[0]);
        const properties = normalizePathProperties(path.properties || {}, path.transform || {});
        updatePathProperties(path, { points: [...properties.points].reverse() });
        return { path };
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
