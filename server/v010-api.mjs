import fs from 'node:fs';
import path from 'node:path';
import {
  readState,
  mutateState,
  addActivity,
  activeScene,
  findObject,
  createSceneObject,
  ASSET_ROOT
} from './state-store.mjs';
import {
  defaultWorldSettings,
  applyWorldToScene,
  fitGroundContact,
  generateFoliagePlacements
} from './v010-systems.mjs';
import { celestialAuthorityNeedsRepair, repairCelestialAuthority } from './celestial-authority.mjs';

const now = () => new Date().toISOString();

function json(res, status, payload) {
  const responseBody = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(responseBody),
    'cache-control': 'no-store'
  });
  res.end(responseBody);
}


function compactWorldRuntime(state) {
  const scene = activeScene(state);
  return {
    engineRevision: Number(state.engine?.revision || 0),
    sceneId: scene.id,
    sampledAt: Date.now(),
    visualDurationMs: 1100,
    settings: structuredClone(scene.settings || {}),
    celestialObjects: scene.objects
      .filter(object => Boolean(object.properties?.celestialRole))
      .map(object => ({
        id: object.id,
        type: object.type,
        visible: object.visible !== false,
        transform: structuredClone(object.transform),
        properties: structuredClone(object.properties || {})
      }))
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000_000) throw new Error('The v0.10 request body exceeds the 20 MB safety limit.');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function ensureWorld(state, reason = 'world-update') {
  return repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason }).world;
}

function findModelAsset(state, assetId) {
  const asset = (state.assets || []).find(item => item.id === assetId && item.type === 'model');
  if (!asset) throw new Error('Model asset not found.');
  return asset;
}

function assetUsages(state, assetId) {
  const sceneUsages = [];
  for (const scene of state.scenes || []) {
    for (const object of scene.objects || []) {
      if (object.properties?.assetId === assetId) {
        sceneUsages.push({ sceneId: scene.id, sceneName: scene.name, objectId: object.id, objectName: object.name });
      }
    }
  }
  const dependencies = (state.assets || [])
    .filter(item => item.id !== assetId && (
      item.sourceAssetId === assetId
      || item.canonicalAssetId === assetId
      || item.baseAssetId === assetId
      || item.sourceModelAssetId === assetId
      || item.sourceAssetIds?.includes?.(assetId)
    ))
    .map(item => ({ id: item.id, type: item.type, name: item.name }));
  return { sceneUsages, dependencies };
}

function moveManagedAssetToTrash(assetId) {
  const modelsRoot = path.resolve(ASSET_ROOT, 'models');
  const source = path.resolve(modelsRoot, assetId);
  if (!source.startsWith(`${modelsRoot}${path.sep}`)) throw new Error('Refusing to delete outside the managed model directory.');
  if (!fs.existsSync(source)) return null;
  const trashRoot = path.resolve(ASSET_ROOT, '.trash');
  fs.mkdirSync(trashRoot, { recursive: true });
  const target = path.join(trashRoot, `${assetId}-${Date.now().toString(36)}`);
  fs.renameSync(source, target);
  return target;
}

function routeId(pathname, pattern) {
  const match = pattern.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleLegacyGround(req, res, url) {
  if (req.method !== 'POST' || url.pathname !== '/api/object/ground') return false;
  const input = await readJsonBody(req);
  const result = mutateState(state => {
    const object = findObject(state, input.objectId);
    if (!object) throw new Error('Object not found.');
    if (object.locked) throw new Error('Object is locked.');
    const terrain = activeScene(state).objects.find(item => item.type === 'terrain');
    if (!terrain) throw new Error('No authoritative terrain exists in the active scene.');
    const asset = object.properties?.assetId
      ? state.assets.find(item => item.id === object.properties.assetId && item.type === 'model')
      : null;
    const diagnostics = fitGroundContact({ object, asset, terrain, maxTilt: Number(input.maxTilt || 35) });
    addActivity(state, 'placement', `Grounded ${object.name} using ${diagnostics.mode}.`, { objectId: object.id, diagnostics });
    return { object, diagnostics };
  });
  json(res, 200, { ...result.result, state: result.state });
  return true;
}

export async function handleV010Request(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (await handleLegacyGround(req, res, url)) return true;
    if (!url.pathname.startsWith('/api/v010/')) return false;

    if (req.method === 'GET' && url.pathname === '/api/v010/world') {
      let state = readState();
      if (celestialAuthorityNeedsRepair(state, activeScene)) {
        state = mutateState(current => repairCelestialAuthority(current, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'world-read-migration' })).state;
      }
      const world = defaultWorldSettings(state.worldV010 || {});
      json(res, 200, {
        world,
        scene: activeScene(state),
        assets: (state.assets || []).filter(item => ['model', 'foliageSpecies', 'foliageFamily', 'biomeRecipe', 'windProfile'].includes(item.type)),
        transactions: state.foliageTransactions || [],
        runtimeDiagnostics: state.runtimeDiagnostics || {},
        state
      });
      return true;
    }

    if (req.method === 'PATCH' && url.pathname === '/api/v010/world') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const current = defaultWorldSettings(state.worldV010 || {});
        state.worldV010 = defaultWorldSettings({
          ...current,
          ...input,
          time: { ...current.time, ...(input.time || {}) },
          lighting: { ...current.lighting, ...(input.lighting || {}) },
          atmosphere: { ...current.atmosphere, ...(input.atmosphere || {}) },
          sky: { ...current.sky, ...(input.sky || {}) },
          clouds: { ...current.clouds, ...(input.clouds || {}) },
          weather: { ...current.weather, ...(input.weather || {}) },
          updatedAt: now()
        });
        const repaired = repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'world-patch' });
        const derived = repaired.derived;
        addActivity(state, 'world', 'Updated connected time, lighting, atmosphere, sky, clouds, or weather.', { derived, celestial: repaired.diagnostics });
        return { world: state.worldV010, derived };
      });
      json(res, 200, { ...result.result, state: result.state, runtime: compactWorldRuntime(result.state) });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/world/step') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const world = ensureWorld(state);
        const seconds = Math.max(0, Math.min(60, Number(input.seconds || 1)));
        if (world.time.enabled !== false) {
          const currentHours = Number(world.time.hours || 0);
          const totalHours = currentHours + seconds * Number(world.time.timeScale || 0) / 3600;
          const dayDelta = Math.floor(totalHours / 24);
          world.time.hours = ((totalHours % 24) + 24) % 24;
          world.time.absoluteDay = Number(world.time.absoluteDay ?? world.time.dayOfYear ?? 172) + dayDelta;
          world.time.dayOfYear = ((Math.floor(world.time.absoluteDay) % 365) + 365) % 365;
        }
        world.updatedAt = now();
        const derived = applyWorldToScene(activeScene(state), world);
        return { world, derived };
      });
      const includeFullState = url.searchParams.get('full') === '1';
      json(res, 200, {
        ...result.result,
        runtime: compactWorldRuntime(result.state),
        ...(includeFullState ? { state: result.state } : {})
      });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/foliage/species') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const source = findModelAsset(state, input.sourceAssetId);
        const id = input.id || `foliage-species-${source.id.replace(/^asset-/, '')}-${Date.now().toString(36)}`;
        const existing = state.assets.find(item => item.id === id && item.type === 'foliageSpecies');
        const species = {
          ...(existing || {}),
          id,
          type: 'foliageSpecies',
          name: String(input.name || `${source.name} Species`).slice(0, 120),
          sourceAssetId: source.id,
          variants: Array.isArray(input.variants) ? input.variants : [],
          scaleMin: Number(input.scaleMin ?? 0.85),
          scaleMax: Number(input.scaleMax ?? 1.2),
          spacing: Number(input.spacing ?? 2.5),
          maxSlope: Number(input.maxSlope ?? 42),
          rootBurial: Number(input.rootBurial ?? 0.08),
          pathExclusion: Number(input.pathExclusion ?? 2.5),
          structureExclusion: Number(input.structureExclusion ?? 2),
          wind: { strength: Number(input.windStrength ?? 0.35), frequency: Number(input.windFrequency ?? 1) },
          lod: {
            near: Number(input.lodNear ?? 35),
            far: Number(input.lodFar ?? 100),
            impostor: Number(input.impostorDistance ?? 160)
          },
          collision: Boolean(input.collision),
          navigationBlocker: Boolean(input.navigationBlocker),
          seasonal: true,
          validation: { state: 'valid', warnings: [] },
          createdAt: existing?.createdAt || now(),
          updatedAt: now()
        };
        if (existing) Object.assign(existing, species); else state.assets.unshift(species);
        addActivity(state, 'foliage', `Created foliage species: ${species.name}`, { speciesId: id, sourceAssetId: source.id });
        return species;
      });
      json(res, 201, { species: result.result, state: result.state });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/foliage/family') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const speciesIds = (input.speciesIds || []).filter(id => state.assets.some(item => item.id === id && item.type === 'foliageSpecies'));
        if (!speciesIds.length) throw new Error('A foliage family requires at least one registered species.');
        const family = {
          id: input.id || `foliage-family-${Date.now().toString(36)}`,
          type: 'foliageFamily',
          name: String(input.name || 'Foliage Family').slice(0, 120),
          speciesIds,
          weights: input.weights || {},
          tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 30) : [],
          createdAt: now(),
          updatedAt: now()
        };
        state.assets.unshift(family);
        addActivity(state, 'foliage', `Created foliage family: ${family.name}`, { familyId: family.id, speciesIds });
        return family;
      });
      json(res, 201, { family: result.result, state: result.state });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/biomes') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const speciesIds = (input.speciesIds || []).filter(id => state.assets.some(item => item.id === id && item.type === 'foliageSpecies'));
        const biome = {
          id: input.id || `biome-${Date.now().toString(36)}`,
          type: 'biomeRecipe',
          name: String(input.name || 'Biome').slice(0, 120),
          terrainMaterialIds: Array.isArray(input.terrainMaterialIds) ? input.terrainMaterialIds : [],
          speciesIds,
          moisture: Number(input.moisture ?? 0.5),
          temperature: Number(input.temperature ?? 0.5),
          altitudeRange: Array.isArray(input.altitudeRange) ? input.altitudeRange.slice(0, 2) : [-1000, 10000],
          density: Number(input.density ?? 0.035),
          seed: Number(input.seed ?? 1),
          exclusions: input.exclusions || { paths: true, structures: true, navigation: true, spawn: true },
          createdAt: now(),
          updatedAt: now()
        };
        state.assets.unshift(biome);
        addActivity(state, 'biome', `Created biome recipe: ${biome.name}`, { biomeId: biome.id, speciesIds });
        return biome;
      });
      json(res, 201, { biome: result.result, state: result.state });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/foliage/generate') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const scene = activeScene(state);
        const species = state.assets.find(item => item.id === input.speciesId && item.type === 'foliageSpecies');
        if (!species) throw new Error('Foliage species not found.');
        const source = findModelAsset(state, species.sourceAssetId);
        const transactionId = `foliage-preview-${Date.now().toString(36)}`;
        const placements = generateFoliagePlacements({
          scene,
          species,
          center: Array.isArray(input.center) ? input.center : [0, 0, 0],
          radius: Number(input.radius || 24),
          density: Number(input.density || 0.035),
          seed: Number(input.seed || 1),
          maxInstances: Number(input.maxInstances || 1500)
        });
        const objects = placements.map((placement, index) => createSceneObject('model', {
          name: `${species.name} ${index + 1}`,
          position: placement.position,
          rotation: placement.rotation,
          scale: placement.scale,
          properties: {
            assetId: source.id,
            foliageSpeciesId: species.id,
            foliageInstance: true,
            previewOnly: true,
            previewTransactionId: transactionId,
            wind: species.wind,
            lod: species.lod,
            chunk: placement.chunk,
            castsShadows: true,
            receivesShadows: true,
            rootBurial: species.rootBurial
          }
        }));
        scene.objects.push(...objects);
        state.foliageTransactions = [
          ...(state.foliageTransactions || []),
          { id: transactionId, speciesId: species.id, objectIds: objects.map(item => item.id), state: 'preview', createdAt: now(), seed: Number(input.seed || 1) }
        ].slice(-20);
        addActivity(state, 'foliage', `Generated foliage preview with ${objects.length} instances.`, { transactionId, speciesId: species.id });
        return { transactionId, count: objects.length, objects };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/foliage/commit') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const transaction = (state.foliageTransactions || []).find(item => item.id === input.transactionId);
        if (!transaction || transaction.state !== 'preview') throw new Error('Foliage preview transaction not found.');
        let count = 0;
        for (const object of activeScene(state).objects) {
          if (object.properties?.previewTransactionId === transaction.id) {
            object.properties.previewOnly = false;
            object.properties.previewTransactionId = null;
            count += 1;
          }
        }
        transaction.state = 'committed';
        transaction.committedAt = now();
        addActivity(state, 'foliage', `Committed ${count} foliage instances.`, { transactionId: transaction.id });
        return { transaction, count };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/foliage/cancel') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const scene = activeScene(state);
        const before = scene.objects.length;
        scene.objects = scene.objects.filter(object => object.properties?.previewTransactionId !== input.transactionId);
        const transaction = (state.foliageTransactions || []).find(item => item.id === input.transactionId);
        if (transaction) {
          transaction.state = 'cancelled';
          transaction.cancelledAt = now();
        }
        return { removed: before - scene.objects.length };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    const objectId = routeId(url.pathname, /^\/api\/v010\/objects\/([^/]+)\/ground$/);
    if (req.method === 'POST' && objectId) {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        const object = findObject(state, objectId);
        if (!object) throw new Error('Object not found.');
        const terrain = activeScene(state).objects.find(item => item.type === 'terrain');
        if (!terrain) throw new Error('No authoritative terrain exists in the active scene.');
        const asset = object.properties?.assetId
          ? state.assets.find(item => item.id === object.properties.assetId && item.type === 'model')
          : null;
        const diagnostics = fitGroundContact({ object, asset, terrain, maxTilt: Number(input.maxTilt || 35) });
        addActivity(state, 'placement', `Grounded ${object.name} using ${diagnostics.mode}.`, { objectId, diagnostics });
        return { object, diagnostics };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    const usageAssetId = routeId(url.pathname, /^\/api\/v010\/assets\/([^/]+)\/usages$/);
    if (req.method === 'GET' && usageAssetId) {
      const state = readState();
      findModelAsset(state, usageAssetId);
      json(res, 200, { assetId: usageAssetId, ...assetUsages(state, usageAssetId) });
      return true;
    }

    const lifecycleMatch = /^\/api\/v010\/assets\/([^/]+)\/(archive|restore)$/.exec(url.pathname);
    if (req.method === 'POST' && lifecycleMatch) {
      const assetId = decodeURIComponent(lifecycleMatch[1]);
      const action = lifecycleMatch[2];
      const result = mutateState(state => {
        const asset = findModelAsset(state, assetId);
        asset.archived = action === 'archive';
        asset.status = asset.archived ? 'archived' : (asset.validation?.state === 'failed' ? 'unvalidated' : 'validated');
        asset.archivedAt = asset.archived ? now() : null;
        asset.updatedAt = now();
        addActivity(state, 'asset', `${action === 'archive' ? 'Archived' : 'Restored'} import: ${asset.name}`, { assetId });
        return asset;
      });
      json(res, 200, { asset: result.result, state: result.state });
      return true;
    }

    const deleteAssetId = routeId(url.pathname, /^\/api\/v010\/assets\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteAssetId) {
      const input = await readJsonBody(req);
      const before = readState();
      const asset = findModelAsset(before, deleteAssetId);
      const usages = assetUsages(before, deleteAssetId);
      if ((usages.sceneUsages.length || usages.dependencies.length) && !input.removeUsages) {
        json(res, 409, { error: 'Asset is still referenced. Remove or replace usages before deletion.', ...usages });
        return true;
      }
      const movedTo = moveManagedAssetToTrash(deleteAssetId);
      const result = mutateState(state => {
        if (input.removeUsages) {
          for (const scene of state.scenes || []) {
            scene.objects = (scene.objects || []).filter(object => object.properties?.assetId !== deleteAssetId);
          }
        }
        const removed = state.assets
          .filter(item => item.id === deleteAssetId || item.canonicalAssetId === deleteAssetId || (item.sourceAssetId === deleteAssetId && item.type === 'assetRecipe'))
          .map(item => item.id);
        state.assets = state.assets.filter(item => !removed.includes(item.id));
        state.assetTrash = [
          ...(state.assetTrash || []),
          { assetId: deleteAssetId, name: asset.name, movedTo, removedRecords: removed, deletedAt: now() }
        ].slice(-100);
        addActivity(state, 'asset', `Moved import to managed trash: ${asset.name}`, { assetId: deleteAssetId, movedTo, removed });
        return { assetId: deleteAssetId, movedTo, removed };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    json(res, 404, { error: 'Unknown v0.10 API route.' });
    return true;
  } catch (error) {
    json(res, 500, { error: error.message, details: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    return true;
  }
}
