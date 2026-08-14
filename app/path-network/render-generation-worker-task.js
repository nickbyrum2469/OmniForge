import { compileScenePathRuntimes } from './runtime.js';
import { terrainMesh } from '../renderer.js';
import { createTerrainQueryService } from '../world/terrain-query-service.js';

function transferableRuntime(runtime) {
  return {
    ...runtime,
    terrainService: null,
    terrainModifier: runtime?.terrainModifier ? {
      ...runtime.terrainModifier,
      baseHeightAt: null
    } : runtime?.terrainModifier
  };
}

export function compilePathRenderRuntimeTask(payload = {}) {
  const scene = payload.scene;
  if (!scene?.objects) throw new Error('Interactive path rendering requires a scene snapshot.');
  const terrain = scene.objects.find(object => object.type === 'terrain' && object.visible !== false) || null;
  const paths = scene.objects.filter(object => object.type === 'path' && object.visible !== false);
  // Supplying the service explicitly disables the stable runtime cache. The
  // result buffers are transferred to the renderer and therefore must never
  // remain cached in the worker after their ArrayBuffers are detached.
  const terrainService = terrain ? createTerrainQueryService({ terrain }) : null;
  const runtimes = terrain ? compileScenePathRuntimes(scene, {
    terrainService,
    useStableCache: false
  }) : [];
  const mesh = terrain ? terrainMesh(terrain, paths, runtimes) : null;
  return {
    schemaVersion: 1,
    signature: String(payload.signature || ''),
    sceneId: String(scene.id || ''),
    terrainId: terrain?.id || null,
    pathIds: paths.filter(path => path.visible !== false).map(path => String(path.id)),
    runtimes: runtimes.map(transferableRuntime),
    terrainMesh: mesh,
    terrainPathDetail: terrainMesh.lastPathDetail ? structuredClone(terrainMesh.lastPathDetail) : null
  };
}

export function collectPathRenderTransferables(value, result = new Set(), visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return result;
  visited.add(value);
  if (value instanceof ArrayBuffer) {
    result.add(value);
    return result;
  }
  if (ArrayBuffer.isView(value)) {
    result.add(value.buffer);
    return result;
  }
  if (value instanceof Map) {
    for (const [key, entry] of value) {
      collectPathRenderTransferables(key, result, visited);
      collectPathRenderTransferables(entry, result, visited);
    }
    return result;
  }
  if (value instanceof Set) {
    for (const entry of value) collectPathRenderTransferables(entry, result, visited);
    return result;
  }
  for (const entry of Object.values(value)) collectPathRenderTransferables(entry, result, visited);
  return result;
}
