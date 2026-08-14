import { TerrainQueryService } from '../world/terrain-query-service.js';
import { solveTerrainAwareTrails } from './trail-solver.js';
import {
  collectPathRenderTransferables,
  compilePathRenderRuntimeTask
} from './render-generation-worker-task.js';

self.onmessage = event => {
  const message = event.data || {};
  const startedAt = performance.now();
  try {
    let result;
    if (message.type === 'solve-trails') {
      const terrain = new TerrainQueryService({
        terrain: message.payload.terrain,
        tileSize: message.payload.tileSize,
        halo: message.payload.halo
      });
      result = solveTerrainAwareTrails({
        ...message.payload.options,
        terrain
      });
    } else if (message.type === 'compile-render-runtime') {
      result = compilePathRenderRuntimeTask(message.payload);
    } else {
      throw new Error(`Unsupported path worker task ${message.type}.`);
    }
    const response = {
      id: message.id,
      key: message.key,
      revision: message.revision,
      ok: true,
      result,
      durationMs: performance.now() - startedAt
    };
    const transferables = message.type === 'compile-render-runtime'
      ? [...collectPathRenderTransferables(result)]
      : [];
    self.postMessage(response, transferables);
  } catch (error) {
    self.postMessage({
      id: message.id,
      key: message.key,
      revision: message.revision,
      ok: false,
      error: error?.message || String(error),
      durationMs: performance.now() - startedAt
    });
  }
};
