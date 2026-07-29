import { samplePathTerrainModifier } from './terrain-modifier.js';

function enabledSegmentIds(runtime, key) {
  return runtime.compiled.segments
    .filter(segment => segment.gameplayRules?.[key] !== false && segment.construction.mode !== 'invalid')
    .map(segment => segment.id);
}

export function connectPathRuntimeConsumers(runtime) {
  if (!runtime?.compiled || !runtime?.geometry || !runtime?.terrainModifier) {
    throw new Error('A complete path runtime bundle is required.');
  }
  const colliderSegmentIds = enabledSegmentIds(runtime, 'collider');
  const navigationSegmentIds = enabledSegmentIds(runtime, 'navigation');
  return {
    schemaVersion: 1,
    sourceNetworkId: runtime.sourceNetworkId,
    sourceRevision: runtime.sourceRevision,
    generationRevision: runtime.generationRevision,
    render: runtime.geometry.meshes,
    collision: {
      segmentIds: colliderSegmentIds,
      roadMesh: runtime.geometry.meshes.road,
      structureMesh: runtime.geometry.meshes.structure
    },
    navigation: {
      segmentIds: navigationSegmentIds,
      surfaceMesh: runtime.geometry.meshes.road
    },
    foliage: {
      terrainModifier: runtime.terrainModifier,
      dirtyChunkKeys: runtime.terrainModifier.dirtyChunkKeys
    },
    streaming: {
      dirtyChunkKeys: runtime.terrainModifier.dirtyChunkKeys,
      chunkSize: runtime.terrainModifier.chunkSize
    },
    grounding: {
      terrainModifier: runtime.terrainModifier
    },
    diagnostics: runtime.diagnostics
  };
}

export function pathFoliageExcluded(consumers, x, z, padding = 0) {
  const sample = samplePathTerrainModifier(consumers.foliage.terrainModifier, x, z);
  return sample.signedDistance <= Math.max(0, Number(padding) || 0);
}

export function pathGroundingSample(consumers, x, z, options = {}) {
  const sample = samplePathTerrainModifier(consumers.grounding.terrainModifier, x, z);
  const constructionSurface = options.includeConstructionSurface !== false
    && ['road', 'shoulder'].includes(sample.zone)
    && sample.constructionMode !== 'invalid';
  return {
    ...sample,
    height: constructionSurface ? sample.targetHeight : sample.height,
    source: constructionSurface ? 'path-surface' : 'terrain'
  };
}
