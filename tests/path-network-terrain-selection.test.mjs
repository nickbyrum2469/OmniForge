import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import { compilePathTerrainModifier } from '../app/path-network/terrain-modifier.js';
import { sampleScenePathTerrain } from '../app/path-network/runtime.js';
import { createTerrainQueryService } from '../app/world/terrain-query-service.js';

function terrainFixture() {
  return {
    id: 'terrain-selection-fixture',
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'plains',
      seed: 17,
      height: 0,
      baseHeight: 0,
      bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
      resolutionX: 32,
      resolutionZ: 32,
      chunkSize: 16
    }
  };
}

function runtimeFixture(networkId, elevation) {
  const network = normalizePathNetwork({
    id: networkId,
    revision: 1,
    nodes: [
      { id: `${networkId}:west`, position: [-20, elevation, 0], heightMode: 'absolute' },
      { id: `${networkId}:east`, position: [20, elevation, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: `${networkId}:road`,
      fromNode: `${networkId}:west`,
      toNode: `${networkId}:east`,
      constructionMode: 'cut-fill',
      constructionLocked: true,
      crossSectionProfile: { width: 5, shoulderWidth: 1 }
    }]
  });
  const compiled = compilePathNetwork(network, {
    terrainHeightAt: () => 0,
    terrainNormalAt: () => [0, 1, 0]
  });
  return {
    pathObjectId: `path:${networkId}`,
    sourceNetworkId: networkId,
    terrainModifier: compilePathTerrainModifier(compiled, { baseHeightAt: () => 0, chunkSize: 16 })
  };
}

test('overlapping path networks choose one deterministic terrain authority regardless of scene order', () => {
  const alpha = runtimeFixture('alpha-network', 2);
  const beta = runtimeFixture('beta-network', 6);
  const forward = sampleScenePathTerrain([alpha, beta], 0, 0, 0);
  const reverse = sampleScenePathTerrain([beta, alpha], 0, 0, 0);
  assert.equal(forward.segmentId, 'alpha-network:road');
  assert.equal(reverse.segmentId, 'alpha-network:road');
  assert.equal(reverse.height, forward.height);

  const service = createTerrainQueryService({ terrain: terrainFixture(), pathRuntimes: [alpha, beta] });
  const firstHeight = service.elevationAt(0, 0, { view: 'proposed-construction' });
  service.setPathRuntimes([beta, alpha]);
  const secondHeight = service.elevationAt(0, 0, { view: 'proposed-construction' });
  assert.equal(secondHeight, firstHeight);
});
