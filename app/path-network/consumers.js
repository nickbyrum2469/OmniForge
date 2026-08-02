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

function connectedPathEntries(sceneConsumers) {
  return Array.isArray(sceneConsumers?.paths) ? sceneConsumers.paths : [];
}

function compareSurfaceCandidates(a, b) {
  if (Math.abs(a.height - b.height) > 1e-7) return b.height - a.height;
  const networkOrder = String(a.sourceNetworkId || '').localeCompare(String(b.sourceNetworkId || ''));
  if (networkOrder) return networkOrder;
  return String(a.segmentId || '').localeCompare(String(b.segmentId || ''));
}

export function connectScenePathRuntimeConsumers(runtimes = []) {
  const paths = (runtimes || [])
    .filter(runtime => runtime?.compiled && runtime?.terrainModifier)
    .map(runtime => ({
      runtime,
      consumers: connectPathRuntimeConsumers(runtime),
      sourceNetworkId: runtime.sourceNetworkId,
      sourceRevision: runtime.sourceRevision,
      generationRevision: runtime.generationRevision
    }))
    .sort((a, b) => (
      String(a.sourceNetworkId || '').localeCompare(String(b.sourceNetworkId || ''))
      || Number(a.sourceRevision || 0) - Number(b.sourceRevision || 0)
    ));
  return {
    schemaVersion: 1,
    paths,
    sourceNetworkIds: paths.map(entry => entry.sourceNetworkId),
    generationRevision: Math.max(0, ...paths.map(entry => Number(entry.generationRevision || 0)))
  };
}

export function pathFoliageExcluded(consumers, x, z, padding = 0) {
  const sample = samplePathTerrainModifier(consumers.foliage.terrainModifier, x, z);
  return sample.constructionMode !== 'invalid'
    && sample.signedDistance <= Math.max(0, Number(padding) || 0);
}

export function scenePathFoliageExcluded(sceneConsumers, x, z, padding = 0) {
  return connectedPathEntries(sceneConsumers).some(entry => (
    pathFoliageExcluded(entry.consumers, x, z, padding)
  ));
}

export function pathGroundingSample(consumers, x, z, options = {}) {
  const sample = samplePathTerrainModifier(consumers.grounding.terrainModifier, x, z);
  const constructionSurface = options.includeConstructionSurface !== false
    && ['road', 'shoulder'].includes(sample.zone)
    && sample.constructionMode !== 'invalid';
  return {
    ...sample,
    height: constructionSurface ? sample.surfaceHeight : sample.height,
    source: constructionSurface ? 'path-surface' : 'terrain'
  };
}

export function sampleSceneGroundSurface(sceneConsumers, terrainHeight, x, z, options = {}) {
  const fallbackHeight = Number.isFinite(Number(terrainHeight)) ? Number(terrainHeight) : 0;
  const referenceY = Number(options.referenceY);
  const hasReference = options.referenceY !== null
    && options.referenceY !== undefined
    && Number.isFinite(referenceY);
  const snapTolerance = Math.max(0, Number(options.snapTolerance) || 0);
  const surfaceCandidates = [];

  for (const entry of connectedPathEntries(sceneConsumers)) {
    const sample = samplePathTerrainModifier(entry.runtime.terrainModifier, x, z);
    if (
      sample.constructionMode === 'invalid'
      || !['road', 'shoulder'].includes(sample.zone)
      || !Number.isFinite(Number(sample.surfaceHeight))
    ) continue;
    const height = Number(sample.surfaceHeight);
    if (hasReference && height > referenceY + snapTolerance) continue;
    surfaceCandidates.push({
      ...sample,
      height,
      source: 'path-surface',
      sourceNetworkId: entry.sourceNetworkId,
      sourceRevision: entry.sourceRevision,
      generationRevision: entry.generationRevision
    });
  }

  const terrainCandidate = {
    height: fallbackHeight,
    baseHeight: fallbackHeight,
    surfaceHeight: fallbackHeight,
    targetHeight: fallbackHeight,
    supportHeight: fallbackHeight,
    influence: 0,
    signedDistance: Infinity,
    lateralDistance: Infinity,
    zone: 'terrain',
    constructionMode: null,
    segmentId: null,
    source: 'terrain',
    sourceNetworkId: null,
    sourceRevision: null,
    generationRevision: Number(sceneConsumers?.generationRevision || 0),
    materialWeights: { terrain: 1, road: 0, shoulder: 0, earthwork: 0 }
  };
  const terrainEligible = !hasReference || fallbackHeight <= referenceY + snapTolerance;
  const eligible = [...surfaceCandidates, ...(terrainEligible ? [terrainCandidate] : [])];
  if (!eligible.length) return terrainCandidate;
  eligible.sort(compareSurfaceCandidates);
  return eligible[0];
}
