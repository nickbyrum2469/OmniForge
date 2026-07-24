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
} from '../server/state-store.mjs';
import {
  defaultWorldSettings,
  applyWorldToScene,
  fitGroundContact,
  generateFoliagePlacements
} from '../server/v010-systems.mjs';

const now = () => new Date().toISOString();

export const v010Tools = [
  {
    name: 'omniforge_get_world_systems',
    description: 'Read the authoritative v0.10 time, lighting, atmosphere, sky, clouds, weather, foliage recipes, transactions, and worker diagnostics.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'omniforge_update_world_systems',
    description: 'Update connected v0.10 time, lighting, atmosphere, sky, cloud, and weather settings. The same scene sun, fog, exposure, and renderer state are updated.',
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'object' },
        lighting: { type: 'object' },
        atmosphere: { type: 'object' },
        sky: { type: 'object' },
        clouds: { type: 'object' },
        weather: { type: 'object' }
      }
    }
  },
  {
    name: 'omniforge_create_foliage_species',
    description: 'Create a stable Foliage Species recipe from one canonical imported model.',
    inputSchema: {
      type: 'object',
      required: ['sourceAssetId'],
      properties: {
        sourceAssetId: { type: 'string' },
        name: { type: 'string' },
        scaleMin: { type: 'number' },
        scaleMax: { type: 'number' },
        spacing: { type: 'number' },
        maxSlope: { type: 'number' },
        rootBurial: { type: 'number' },
        pathExclusion: { type: 'number' },
        structureExclusion: { type: 'number' }
      }
    }
  },
  {
    name: 'omniforge_preview_foliage_region',
    description: 'Generate a deterministic terrain-aware foliage preview with path and structure exclusions. The result must be committed or cancelled.',
    inputSchema: {
      type: 'object',
      required: ['speciesId'],
      properties: {
        speciesId: { type: 'string' },
        center: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        radius: { type: 'number', minimum: 1, maximum: 1000 },
        density: { type: 'number', minimum: 0.0001, maximum: 2 },
        seed: { type: 'integer' },
        maxInstances: { type: 'integer', minimum: 1, maximum: 10000 }
      }
    }
  },
  {
    name: 'omniforge_commit_foliage_preview',
    description: 'Commit one inspected v0.10 foliage preview transaction.',
    inputSchema: { type: 'object', required: ['transactionId'], properties: { transactionId: { type: 'string' } } }
  },
  {
    name: 'omniforge_cancel_foliage_preview',
    description: 'Cancel one v0.10 foliage preview and remove every preview object it created.',
    inputSchema: { type: 'object', required: ['transactionId'], properties: { transactionId: { type: 'string' } } }
  },
  {
    name: 'omniforge_get_model_asset_usages',
    description: 'Inspect all scene and recipe references before archiving or deleting an imported model.',
    inputSchema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string' } } }
  },
  {
    name: 'omniforge_archive_model_import',
    description: 'Archive a canonical model import without deleting source or derivatives.',
    inputSchema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string' } } }
  },
  {
    name: 'omniforge_restore_model_import',
    description: 'Restore a previously archived canonical model import.',
    inputSchema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string' } } }
  },
  {
    name: 'omniforge_delete_model_import',
    description: 'Move an unreferenced canonical model import and managed derivatives to OmniForge trash. Requires confirm=true and refuses referenced imports.',
    inputSchema: {
      type: 'object',
      required: ['assetId', 'confirm'],
      properties: { assetId: { type: 'string' }, confirm: { type: 'boolean' } }
    }
  }
];

function modelAsset(state, assetId) {
  const asset = (state.assets || []).find(item => item.id === assetId && item.type === 'model');
  if (!asset) throw new Error('Model asset not found.');
  return asset;
}

function usagesFor(state, assetId) {
  const sceneUsages = [];
  for (const scene of state.scenes || []) {
    for (const object of scene.objects || []) {
      if (object.properties?.assetId === assetId) sceneUsages.push({ sceneId: scene.id, sceneName: scene.name, objectId: object.id, objectName: object.name });
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

function moveToTrash(assetId) {
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

export async function callV010Tool(name, args = {}) {
  if (name === 'omniforge_get_world_systems') {
    const result = mutateState(state => {
      state.worldV010 = defaultWorldSettings(state.worldV010 || {});
      const derived = applyWorldToScene(activeScene(state), state.worldV010);
      return {
        world: state.worldV010,
        derived,
        foliageAssets: state.assets.filter(item => ['foliageSpecies', 'foliageFamily', 'biomeRecipe', 'windProfile'].includes(item.type)),
        foliageTransactions: state.foliageTransactions || [],
        runtimeDiagnostics: state.runtimeDiagnostics || {}
      };
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_update_world_systems') {
    const result = mutateState(state => {
      const current = defaultWorldSettings(state.worldV010 || {});
      state.worldV010 = defaultWorldSettings({
        ...current,
        time: { ...current.time, ...(args.time || {}) },
        lighting: { ...current.lighting, ...(args.lighting || {}) },
        atmosphere: { ...current.atmosphere, ...(args.atmosphere || {}) },
        sky: { ...current.sky, ...(args.sky || {}) },
        clouds: { ...current.clouds, ...(args.clouds || {}) },
        weather: { ...current.weather, ...(args.weather || {}) },
        updatedAt: now()
      });
      const derived = applyWorldToScene(activeScene(state), state.worldV010);
      addActivity(state, 'world', 'Codex updated connected v0.10 world systems.', { derived });
      return { world: state.worldV010, derived };
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_ground_object') {
    const result = mutateState(state => {
      const object = findObject(state, args.objectId);
      if (!object) throw new Error('Object not found.');
      if (object.locked) throw new Error('Object is locked.');
      const terrain = activeScene(state).objects.find(item => item.type === 'terrain' && item.visible !== false);
      if (!terrain) throw new Error('No visible authoritative terrain exists.');
      const asset = object.properties?.assetId ? state.assets.find(item => item.id === object.properties.assetId && item.type === 'model') : null;
      const diagnostics = fitGroundContact({ object, asset, terrain, maxTilt: Number(args.maxTilt || 35) });
      state.selection.objectId = object.id;
      state.editor.lastFocusObjectId = object.id;
      addActivity(state, 'spatial', `Codex grounded ${object.name} using ${diagnostics.mode}.`, { objectId: object.id, diagnostics });
      return { object, diagnostics };
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_create_foliage_species') {
    const result = mutateState(state => {
      const source = modelAsset(state, args.sourceAssetId);
      const species = {
        id: `foliage-species-${source.id.replace(/^asset-/, '')}-${Date.now().toString(36)}`,
        type: 'foliageSpecies',
        name: String(args.name || `${source.name} Species`).slice(0, 120),
        sourceAssetId: source.id,
        variants: [],
        scaleMin: Number(args.scaleMin ?? 0.85),
        scaleMax: Number(args.scaleMax ?? 1.2),
        spacing: Number(args.spacing ?? 2.5),
        maxSlope: Number(args.maxSlope ?? 42),
        rootBurial: Number(args.rootBurial ?? 0.08),
        pathExclusion: Number(args.pathExclusion ?? 2.5),
        structureExclusion: Number(args.structureExclusion ?? 2),
        wind: { strength: 0.35, frequency: 1 },
        lod: { near: 35, far: 100, impostor: 160 },
        seasonal: true,
        validation: { state: 'valid', warnings: [] },
        createdAt: now(),
        updatedAt: now()
      };
      state.assets.unshift(species);
      addActivity(state, 'foliage', `Codex created foliage species: ${species.name}.`, { speciesId: species.id, sourceAssetId: source.id });
      return species;
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_preview_foliage_region') {
    const result = mutateState(state => {
      const scene = activeScene(state);
      const species = state.assets.find(item => item.id === args.speciesId && item.type === 'foliageSpecies');
      if (!species) throw new Error('Foliage species not found.');
      const source = modelAsset(state, species.sourceAssetId);
      const transactionId = `foliage-preview-${Date.now().toString(36)}`;
      const placements = generateFoliagePlacements({
        scene,
        species,
        center: Array.isArray(args.center) ? args.center : [0, 0, 0],
        radius: Number(args.radius || 24),
        density: Number(args.density || 0.035),
        seed: Number(args.seed || 1),
        maxInstances: Number(args.maxInstances || 1500)
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
      const transaction = { id: transactionId, speciesId: species.id, objectIds: objects.map(item => item.id), state: 'preview', createdAt: now(), seed: Number(args.seed || 1) };
      state.foliageTransactions = [...(state.foliageTransactions || []), transaction].slice(-20);
      addActivity(state, 'foliage', `Codex generated a ${objects.length}-instance foliage preview.`, { transactionId, speciesId: species.id });
      return { transaction, count: objects.length, objects };
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_commit_foliage_preview' || name === 'omniforge_cancel_foliage_preview') {
    const committing = name === 'omniforge_commit_foliage_preview';
    const result = mutateState(state => {
      const transaction = (state.foliageTransactions || []).find(item => item.id === args.transactionId);
      if (!transaction || transaction.state !== 'preview') throw new Error('Active foliage preview transaction not found.');
      const scene = activeScene(state);
      let count = 0;
      if (committing) {
        for (const object of scene.objects) {
          if (object.properties?.previewTransactionId === transaction.id) {
            object.properties.previewOnly = false;
            object.properties.previewTransactionId = null;
            count += 1;
          }
        }
        transaction.state = 'committed';
        transaction.committedAt = now();
      } else {
        const before = scene.objects.length;
        scene.objects = scene.objects.filter(object => object.properties?.previewTransactionId !== transaction.id);
        count = before - scene.objects.length;
        transaction.state = 'cancelled';
        transaction.cancelledAt = now();
      }
      addActivity(state, 'foliage', `Codex ${committing ? 'committed' : 'cancelled'} ${count} foliage preview instances.`, { transactionId: transaction.id });
      return { transaction, count };
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_get_model_asset_usages') {
    const state = readState();
    modelAsset(state, args.assetId);
    return { handled: true, value: { assetId: args.assetId, ...usagesFor(state, args.assetId) } };
  }

  if (name === 'omniforge_archive_model_import' || name === 'omniforge_restore_model_import') {
    const archive = name === 'omniforge_archive_model_import';
    const result = mutateState(state => {
      const asset = modelAsset(state, args.assetId);
      asset.archived = archive;
      asset.status = archive ? 'archived' : (asset.validation?.state === 'failed' ? 'unvalidated' : 'validated');
      asset.archivedAt = archive ? now() : null;
      asset.updatedAt = now();
      addActivity(state, 'asset', `Codex ${archive ? 'archived' : 'restored'} import: ${asset.name}.`, { assetId: asset.id });
      return asset;
    });
    return { handled: true, value: result.result };
  }

  if (name === 'omniforge_delete_model_import') {
    if (args.confirm !== true) throw new Error('Deletion requires confirm=true after explicit user approval.');
    const before = readState();
    const asset = modelAsset(before, args.assetId);
    const usages = usagesFor(before, args.assetId);
    if (usages.sceneUsages.length || usages.dependencies.length) {
      throw new Error(`Deletion blocked: ${usages.sceneUsages.length} scene usages and ${usages.dependencies.length} dependencies remain.`);
    }
    const movedTo = moveToTrash(args.assetId);
    const result = mutateState(state => {
      const removed = state.assets
        .filter(item => item.id === args.assetId || item.canonicalAssetId === args.assetId || (item.sourceAssetId === args.assetId && item.type === 'assetRecipe'))
        .map(item => item.id);
      state.assets = state.assets.filter(item => !removed.includes(item.id));
      state.assetTrash = [...(state.assetTrash || []), { assetId: args.assetId, name: asset.name, movedTo, removedRecords: removed, deletedAt: now() }].slice(-100);
      addActivity(state, 'asset', `Codex moved import to managed trash: ${asset.name}.`, { assetId: args.assetId, movedTo, removed });
      return { assetId: args.assetId, movedTo, removed };
    });
    return { handled: true, value: result.result };
  }

  return { handled: false, value: null };
}
