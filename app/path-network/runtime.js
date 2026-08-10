import { compilePathNetwork } from './compiler.js';
import { buildPathNetworkGeometry } from './geometry.js';
import { migrateLegacyPathObject } from './model.js';
import {
  compilePathTerrainModifier,
  samplePathTerrainModifier
} from './terrain-modifier.js';
import { createTerrainQueryService } from '../world/terrain-query-service.js';
import { connectScenePathRuntimeConsumers } from './consumers.js';

let objectCache = new WeakMap();
const stableRuntimeCache = new Map();
const MAXIMUM_STABLE_RUNTIMES = 96;

function runtimeSignature(pathObject, terrain, options) {
  return JSON.stringify({
    pathId: pathObject?.id,
    transform: pathObject?.transform || null,
    visible: pathObject?.visible !== false,
    network: pathObject?.properties?.pathNetwork || null,
    legacy: pathObject?.properties?.pathNetwork
      ? null
      : {
          points: pathObject?.properties?.points,
          nodeElevations: pathObject?.properties?.nodeElevations,
          spline: pathObject?.properties?.spline,
          width: pathObject?.properties?.width
        },
    terrain: {
      properties: terrain?.properties,
      transform: terrain?.transform
    },
    generationRevision: options.generationRevision || 0,
    quality: options.quality || 'editor',
    compiler: {
      spacing: options.spacing,
      tolerance: options.tolerance,
      maximumAngleDegrees: options.maximumAngleDegrees
    },
    geometry: {
      chunkSize: options.chunkSize,
      junctionFilletSegments: options.junctionFilletSegments
    }
  });
}

function stableCachedRuntime(signature) {
  const runtime = stableRuntimeCache.get(signature);
  if (!runtime) return null;
  stableRuntimeCache.delete(signature);
  stableRuntimeCache.set(signature, runtime);
  return runtime;
}

function cacheRuntime(pathObject, signature, runtime, useStableCache) {
  objectCache.set(pathObject, { signature, runtime });
  if (useStableCache) {
    stableRuntimeCache.delete(signature);
    stableRuntimeCache.set(signature, runtime);
    while (stableRuntimeCache.size > MAXIMUM_STABLE_RUNTIMES) {
      stableRuntimeCache.delete(stableRuntimeCache.keys().next().value);
    }
  }
  return runtime;
}

export function compilePathObjectRuntime(pathObject, terrain, options = {}) {
  if (!pathObject || pathObject.type !== 'path') throw new Error('A path scene object is required.');
  if (!terrain || terrain.type !== 'terrain') throw new Error('A terrain scene object is required.');
  const signature = runtimeSignature(pathObject, terrain, options);
  const cached = objectCache.get(pathObject);
  if (cached?.signature === signature) return cached.runtime;
  const useStableCache = options.useStableCache === true || !options.terrainService;
  if (useStableCache) {
    const stable = stableCachedRuntime(signature);
    if (stable) {
      objectCache.set(pathObject, { signature, runtime: stable });
      return stable;
    }
  }

  const terrainService = options.terrainService || createTerrainQueryService({ terrain });
  const baseHeightAt = (x, z) => terrainService.elevationAt(x, z, { view: 'authored-natural' });
  const baseNormalAt = (x, z) => terrainService.normalAt(x, z, { view: 'authored-natural' });
  const migration = migrateLegacyPathObject(pathObject, { terrainHeightAt: baseHeightAt });
  const compiled = compilePathNetwork(migration.network, {
    terrainHeightAt: baseHeightAt,
    terrainNormalAt: baseNormalAt,
    generationRevision: options.generationRevision ?? migration.network.revision,
    spacing: options.spacing,
    tolerance: options.tolerance,
    maximumAngleDegrees: options.maximumAngleDegrees
  });
  const terrainModifier = compilePathTerrainModifier(compiled, {
    baseHeightAt,
    chunkSize: options.chunkSize ?? terrain.properties?.chunkSize ?? 64,
    junctionFilletSegments: options.junctionFilletSegments
  });
  const geometry = buildPathNetworkGeometry(compiled, {
    terrainModifier,
    junctionFilletSegments: options.junctionFilletSegments
  });
  const meshStats = Object.fromEntries(Object.entries(geometry.meshes).map(([name, mesh]) => [name, {
    vertexCount: Math.floor((mesh?.positions?.length || 0) / 3),
    indexCount: mesh?.indices?.length || 0,
    triangleCount: Math.floor((mesh?.indices?.length || 0) / 3)
  }]));
  const segmentEvidence = (migration.network.segments || []).map(segment => ({
    id: String(segment.id),
    fromNode: String(segment.fromNode),
    toNode: String(segment.toNode),
    width: Number(segment.crossSectionProfile?.width || 0),
    bridgeStyle: String(segment.structureProfile?.bridgeStyle || 'auto'),
    surfaceProfileId: String(segment.surfaceDetailProfile?.profileId || '')
  }));
  const runtime = {
    schemaVersion: 1,
    pathObjectId: pathObject.id,
    sourceNetworkId: compiled.sourceNetworkId,
    sourceRevision: compiled.sourceRevision,
    generationRevision: compiled.generationRevision,
    migratedFromLegacy: migration.migrated,
    network: migration.network,
    compiled,
    terrainModifier,
    terrainService,
    geometry,
    diagnostics: {
      valid: compiled.diagnostics.valid && geometry.validation.valid,
      sourceNetworkId: compiled.sourceNetworkId,
      sourceRevision: compiled.sourceRevision,
      generationRevision: compiled.generationRevision,
      nodeIds: (migration.network.nodes || []).map(node => String(node.id)),
      segmentIds: (migration.network.segments || []).map(segment => String(segment.id)),
      segments: segmentEvidence,
      compiler: compiled.diagnostics,
      terrain: terrainModifier.diagnostics,
      geometry: geometry.validation,
      meshStats,
      bridgeSelections: geometry.bridgeSelections.map(selection => ({
        segmentId: String(selection.segmentId),
        bridgeStyle: String(selection.bridgeStyle),
        span: Number(selection.span || 0),
        width: Number(selection.width || 0),
        deckWidth: Number(selection.deckWidth || 0),
        valid: Boolean(selection.valid)
      })),
      construction: compiled.constructionIntervals
    }
  };
  return cacheRuntime(pathObject, signature, runtime, useStableCache);
}

export function compileScenePathRuntimes(scene, options = {}) {
  const terrain = scene?.objects?.find(object => object.type === 'terrain' && object.visible !== false);
  if (!terrain) return [];
  const externalTerrainService = Boolean(options.terrainService);
  const terrainService = options.terrainService || createTerrainQueryService({ terrain });
  return (scene.objects || [])
    .filter(object => object.type === 'path' && object.visible !== false)
    .map(pathObject => compilePathObjectRuntime(pathObject, terrain, {
      ...options,
      terrainService,
      useStableCache: options.useStableCache ?? !externalTerrainService,
      chunkSize: options.chunkSize ?? scene.settings?.worldChunkSize ?? terrain.properties?.chunkSize
    }));
}

export function createScenePathRuntimeContext(scene, options = {}) {
  const terrain = scene?.objects?.find(object => object.type === 'terrain' && object.visible !== false) || null;
  if (!terrain) {
    return {
      schemaVersion: 1,
      terrain: null,
      runtimes: [],
      sceneConsumers: connectScenePathRuntimeConsumers([]),
      authoredTerrainService: null,
      terrainService: null,
      generationRevision: 0
    };
  }
  const {
    authoredTerrainService: providedAuthoredTerrainService,
    terrainService: providedConstructionTerrainService,
    ...compileOptions
  } = options;
  const authoredTerrainService = providedAuthoredTerrainService || createTerrainQueryService({ terrain });
  const runtimes = compileScenePathRuntimes(scene, {
    ...compileOptions,
    terrainService: authoredTerrainService,
    useStableCache: compileOptions.useStableCache ?? true
  });
  const terrainService = providedConstructionTerrainService || createTerrainQueryService({
    terrain,
    pathRuntimes: runtimes,
    tileSize: scene?.settings?.worldChunkSize ?? terrain.properties?.chunkSize
  });
  const sceneConsumers = connectScenePathRuntimeConsumers(runtimes);
  return {
    schemaVersion: 1,
    terrain,
    runtimes,
    sceneConsumers,
    authoredTerrainService,
    terrainService,
    generationRevision: sceneConsumers.generationRevision
  };
}

export function sampleScenePathTerrain(runtimes, baseHeight, x, z) {
  let selected = null;
  for (const runtime of runtimes || []) {
    const sample = samplePathTerrainModifier(runtime.terrainModifier, x, z);
    if (
      !selected
      || sample.influence > selected.influence
      || (
        sample.influence === selected.influence
        && sample.lateralDistance < selected.lateralDistance
      )
    ) selected = sample;
  }
  if (!selected || !Number.isFinite(selected.lateralDistance)) {
    return {
      height: baseHeight,
      influence: 0,
      signedDistance: Infinity,
      zone: 'terrain',
      materialWeights: { terrain: 1, road: 0, shoulder: 0, earthwork: 0 }
    };
  }
  return selected;
}

export function clearPathRuntimeCache(pathObject = null) {
  if (pathObject) {
    objectCache.delete(pathObject);
    for (const [signature, runtime] of stableRuntimeCache) {
      if (runtime.pathObjectId === pathObject.id) stableRuntimeCache.delete(signature);
    }
    return;
  }
  objectCache = new WeakMap();
  stableRuntimeCache.clear();
}
