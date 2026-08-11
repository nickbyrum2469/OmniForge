import test from 'node:test';
import assert from 'node:assert/strict';

import { pathNetworkTerrainSamplingDiagnostics } from '../app/renderer.js';

function runtime({ pathObjectId, networkId, sourceRevision, generationRevision, widths }) {
  return {
    pathObjectId,
    sourceNetworkId: networkId,
    sourceRevision,
    generationRevision,
    compiled: {
      sourceNetworkId: networkId,
      sourceRevision,
      generationRevision,
      segments: widths.map((width, index) => ({
        id: `${pathObjectId}-segment-${index + 1}`,
        crossSectionProfile: { width }
      }))
    }
  };
}

test('terrain telemetry derives exact widths, revisions, mesh strategy, and query counts from the current v2 worker result', () => {
  const diagnostics = pathNetworkTerrainSamplingDiagnostics({
    terrainAvailable: true,
    expectedPathCount: 2,
    exactWorkerResult: true,
    runtimes: [
      runtime({ pathObjectId: 'road-a', networkId: 'network-a', sourceRevision: 17, generationRevision: 41, widths: [6.5, 2.25] }),
      runtime({ pathObjectId: 'road-b', networkId: 'network-b', sourceRevision: 9, generationRevision: 26, widths: [4.75] })
    ],
    terrainPathDetail: {
      strategy: 'watertight-chunks',
      tileCount: 24,
      highTileCount: 5,
      terrainSampling: {
        fineChunkSize: 4,
        indexedEntryCount: 3,
        indexedCellReferenceCount: 87,
        queryCount: 1221,
        fastRejectCount: 544
      }
    }
  });

  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.compiler, 'path-network-v2');
  assert.equal(diagnostics.corridorCompiler, 'path-network-v2');
  assert.equal(diagnostics.authority, 'path-network-v2-worker-result');
  assert.equal(diagnostics.pathCount, 2);
  assert.equal(diagnostics.minimumPathWidth, 2.25);
  assert.deepEqual(diagnostics.sourceRevisions, [
    { pathObjectId: 'road-a', sourceNetworkId: 'network-a', sourceRevision: 17 },
    { pathObjectId: 'road-b', sourceNetworkId: 'network-b', sourceRevision: 9 }
  ]);
  assert.deepEqual(diagnostics.generationRevisions, [
    { pathObjectId: 'road-a', sourceNetworkId: 'network-a', generationRevision: 41 },
    { pathObjectId: 'road-b', sourceNetworkId: 'network-b', generationRevision: 26 }
  ]);
  assert.equal(diagnostics.meshStrategy, 'watertight-chunks');
  assert.deepEqual(diagnostics.queryStats, {
    fineChunkSize: 4,
    indexedEntryCount: 3,
    indexedCellReferenceCount: 87,
    queryCount: 1221,
    fastRejectCount: 544
  });
  assert.equal(diagnostics.terrainMesh.tileCount, 24);
});

test('pending or stale worker state never publishes old widths, revisions, mesh strategy, or query counts', () => {
  const diagnostics = pathNetworkTerrainSamplingDiagnostics({
    terrainAvailable: true,
    expectedPathCount: 1,
    exactWorkerResult: false,
    runtimes: [runtime({ pathObjectId: 'stale', networkId: 'legacy-looking', sourceRevision: 2, generationRevision: 3, widths: [3.2] })],
    terrainPathDetail: {
      strategy: 'stale-mesh',
      terrainSampling: { queryCount: 999 }
    }
  });

  assert.equal(diagnostics.available, true);
  assert.equal(diagnostics.ready, false);
  assert.equal(diagnostics.workerResultCurrent, false);
  assert.equal(diagnostics.expectedPathCount, 1);
  assert.equal(diagnostics.pathCount, 0);
  assert.equal(diagnostics.minimumPathWidth, null);
  assert.deepEqual(diagnostics.sourceRevisions, []);
  assert.deepEqual(diagnostics.generationRevisions, []);
  assert.equal(diagnostics.meshStrategy, null);
  assert.equal(diagnostics.queryStats, null);
  assert.equal(diagnostics.terrainMesh, null);
});
