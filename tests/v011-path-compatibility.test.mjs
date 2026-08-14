import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTerrainProperties,
  normalizePathProperties,
  terrainBaseHeightAt
} from '../app/worldgen.js';
import { attachPathNetwork } from '../app/path-network/model.js';
import { compilePathNetwork } from '../app/path-network/compiler.js';
import {
  applyLegacyPathCompatibilityMutation,
  pathDiagnostics,
  terrainDiagnostics
} from '../server/v011-systems.mjs';

function terrainObject() {
  return {
    id: 'compat-terrain',
    type: 'terrain',
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: normalizeTerrainProperties({
      preset: 'plains',
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      height: 2,
      ridgeStrength: 0,
      warpStrength: 0,
      seed: 29
    }, { position: [0, 0, 0], scale: [1, 1, 1] })
  };
}

function pathObject() {
  return {
    id: 'compat-path',
    type: 'path',
    name: 'Compatibility Path',
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: normalizePathProperties({
      points: [[-30, -8], [0, 0], [30, 8]],
      worldSpacePoints: true,
      width: 3,
      maxGradePercent: 12
    }, { position: [0, 0, 0], scale: [1, 1, 1] })
  };
}

function compile(path, terrain) {
  const network = path.properties.pathNetwork;
  return compilePathNetwork(network, {
    terrainHeightAt: (x, z) => terrainBaseHeightAt(terrain, x, z),
    spacing: 0.25
  });
}

test('legacy node mutation delegates to schema-v2 revision and changes the compiled centerline', () => {
  const terrain = terrainObject();
  const path = pathObject();
  attachPathNetwork(path, { terrainHeightAt: (x, z) => terrainBaseHeightAt(terrain, x, z) });
  const beforeRevision = path.properties.pathNetwork.revision;
  const before = compile(path, terrain);
  const middleBefore = before.nodes.find(node => node.id.endsWith(':node:1')).resolvedPosition;

  // A deliberately stale legacy projection must never become mutation authority.
  path.properties.points = [[-900, -900], [0, 0], [900, 900]];
  const result = applyLegacyPathCompatibilityMutation(path, terrain, 'move-node', {
    index: 1,
    x: 8,
    y: middleBefore[1] + 2.5,
    z: -6,
    expectedRevision: beforeRevision
  });
  const after = compile(path, terrain);
  const moved = after.nodes.find(node => node.id === result.nodeId).resolvedPosition;

  assert.equal(result.compatibility.authority, 'path-network-v2');
  assert.equal(result.network.revision, beforeRevision + 1);
  assert.deepEqual(moved, [8, middleBefore[1] + 2.5, -6]);
  assert.notDeepEqual(after.stations.map(station => station.position), before.stations.map(station => station.position));
  assert.equal(path.properties.legacyPathProjectionRevision, result.network.revision);
  assert.deepEqual(path.properties.points[1], [8, -6], 'legacy points are a derived compatibility projection only');
  assert.equal(path.properties.pathNetworkUndo.at(-1).network.revision, beforeRevision);
});

test('legacy insertion and engineering names update v2 authority while unsafe legacy fields fail closed', () => {
  const terrain = terrainObject();
  const path = pathObject();
  attachPathNetwork(path, { terrainHeightAt: (x, z) => terrainBaseHeightAt(terrain, x, z) });
  const initialRevision = path.properties.pathNetwork.revision;
  const inserted = applyLegacyPathCompatibilityMutation(path, terrain, 'insert-node', {
    x: 12,
    z: 4,
    expectedRevision: initialRevision
  });
  assert.equal(inserted.network.revision, initialRevision + 1);
  assert.equal(inserted.network.nodes.length, 4);
  assert.ok(inserted.network.segments.some(segment => segment.fromNode === inserted.nodeId || segment.toNode === inserted.nodeId));

  const engineering = applyLegacyPathCompatibilityMutation(path, terrain, 'update-engineering', {
    expectedRevision: inserted.network.revision,
    properties: { maxGradePercent: 7, maxCutDepth: 4, width: 2.25, showSpline: false }
  });
  assert.equal(engineering.network.revision, initialRevision + 2);
  assert.equal(engineering.network.engineering.maxGradePercent, 7);
  assert.equal(engineering.network.engineering.maxCutDepth, 4);
  assert.equal(engineering.network.editor.showSpline, false);
  assert.ok(engineering.network.segments.every(segment => segment.crossSectionProfile.width === 2.25));

  const beforeRejected = structuredClone(path.properties.pathNetwork);
  assert.throws(
    () => applyLegacyPathCompatibilityMutation(path, terrain, 'update-engineering', {
      properties: { splineTension: 0.9 }
    }),
    /not schema-v2 authorities: splineTension.*\/api\/v012\/path\/\{pathId\}\/transaction/
  );
  assert.deepEqual(path.properties.pathNetwork, beforeRejected, 'fail-closed compatibility must not mutate v2 authority');
  assert.throws(
    () => applyLegacyPathCompatibilityMutation(path, terrain, 'split', { index: 1 }),
    /Legacy split creates a second points-based path object and is disabled.*schema-v2/
  );
});

test('world and path diagnostics report compiled schema-v2 authority rather than stale legacy points', () => {
  const terrain = terrainObject();
  const path = pathObject();
  attachPathNetwork(path, { terrainHeightAt: (x, z) => terrainBaseHeightAt(terrain, x, z) });
  const network = path.properties.pathNetwork;
  path.properties.points = [[-999, -999], [999, 999]];
  path.properties.maxGradePercent = 99;

  const diagnostics = pathDiagnostics(path, terrain);
  assert.equal(diagnostics.schemaVersion, 2);
  assert.equal(diagnostics.authority, 'compiled-path-network-v2');
  assert.equal(diagnostics.sourceNetworkId, network.id);
  assert.equal(diagnostics.sourceRevision, network.revision);
  assert.equal(diagnostics.nodeCount, network.nodes.length);
  assert.equal(diagnostics.segmentCount, network.segments.length);
  assert.equal(diagnostics.configuredMaxGradePercent, network.engineering.maxGradePercent);
  assert.ok(diagnostics.sampleCount > network.nodes.length);

  const world = terrainDiagnostics(terrain, [path], 6);
  assert.equal(world.schemaVersion, 2);
  assert.equal(world.sampleView, 'authored-natural');
  assert.equal(world.pathModificationAuthority, 'compiled-path-network-v2');
  assert.deepEqual(world.pathNetworks, [{ pathId: path.id, networkId: network.id, revision: network.revision }]);
});
