import { TerrainQueryService } from '../world/terrain-query-service.js';
import { solveTerrainAwareTrails } from './trail-solver.js';

self.onmessage = event => {
  const message = event.data || {};
  const startedAt = performance.now();
  try {
    if (message.type !== 'solve-trails') throw new Error(`Unsupported path worker task ${message.type}.`);
    const terrain = new TerrainQueryService({
      terrain: message.payload.terrain,
      tileSize: message.payload.tileSize,
      halo: message.payload.halo
    });
    const result = solveTerrainAwareTrails({
      ...message.payload.options,
      terrain
    });
    self.postMessage({
      id: message.id,
      key: message.key,
      revision: message.revision,
      ok: true,
      result,
      durationMs: performance.now() - startedAt
    });
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
