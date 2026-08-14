import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePathNetwork } from '../app/path-network/model.js';
import {
  collectPathRenderTransferables,
  compilePathRenderRuntimeTask
} from '../app/path-network/render-generation-worker-task.js';

function sceneFixture() {
  const terrain = {
    id: 'worker-terrain', type: 'terrain', visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'rollingHills', seed: 17, height: 4, macroScale: 48, detailScale: 12,
      bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
      resolutionX: 20, resolutionZ: 20, chunkSize: 16
    }
  };
  const pathNetwork = normalizePathNetwork({
    id: 'worker-network',
    nodes: [
      { id: 'a', position: [-18, 2, -4], heightMode: 'absolute' },
      { id: 'b', position: [0, 3, 4], heightMode: 'absolute' },
      { id: 'c', position: [18, 2, -2], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b', constructionMode: 'cut-fill', constructionLocked: true },
      { id: 'bc', fromNode: 'b', toNode: 'c', constructionMode: 'cut-fill', constructionLocked: true }
    ]
  });
  return {
    id: 'worker-scene', settings: { worldChunkSize: 16 },
    objects: [terrain, {
      id: 'worker-path', type: 'path', visible: true,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      properties: { pathNetwork, pathNetworkSchemaVersion: 2 }
    }]
  };
}

test('interactive worker task returns transferable finite path and terrain geometry without cached services', () => {
  const result = compilePathRenderRuntimeTask({ signature: 'fixture-revision-1', scene: sceneFixture() });
  assert.equal(result.signature, 'fixture-revision-1');
  assert.equal(result.runtimes.length, 1);
  assert.equal(result.runtimes[0].terrainService, null);
  assert.equal(result.runtimes[0].terrainModifier.baseHeightAt, null);
  assert.ok(result.terrainMesh.positions.length > 0);
  assert.ok(result.runtimes[0].geometry.meshes.road.positions.length > 0);
  for (const value of result.terrainMesh.positions) assert.ok(Number.isFinite(value));
  const transferables = [...collectPathRenderTransferables(result)];
  assert.ok(transferables.includes(result.terrainMesh.positions.buffer));
  assert.equal(new Set(transferables).size, transferables.length);
  assert.doesNotThrow(() => structuredClone(result));
});

test('recompiling the same worker signature never returns detached stable-cache buffers', () => {
  const payload = { signature: 'repeatable-revision', scene: sceneFixture() };
  const first = compilePathRenderRuntimeTask(payload);
  structuredClone(first, { transfer: [...collectPathRenderTransferables(first)] });
  assert.equal(first.terrainMesh.positions.byteLength, 0);
  // postMessage creates a new object graph for every worker request; use the
  // same signature on a fresh graph to detect accidental stable-cache reuse.
  const second = compilePathRenderRuntimeTask(structuredClone(payload));
  assert.ok(second.terrainMesh.positions.byteLength > 0);
  assert.ok(second.runtimes[0].geometry.meshes.road.positions.byteLength > 0);
});
