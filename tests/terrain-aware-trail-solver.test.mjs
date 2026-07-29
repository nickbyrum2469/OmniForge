import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainQueryService } from '../app/world/terrain-query-service.js';
import {
  solveTerrainAwareTrails,
  trailCandidateToPathNetwork
} from '../app/path-network/trail-solver.js';
import { applyPathNetworkTransaction, replacePathNetwork } from '../app/path-network/transactions.js';

function terrainFixture() {
  return {
    id: 'route-terrain',
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'rollingHills',
      seed: 1907,
      height: 9,
      macroScale: 95,
      detailScale: 28,
      bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 },
      resolutionX: 96,
      resolutionZ: 96,
      chunkSize: 32,
      generatedRevision: 4
    }
  };
}

test('trail solver is deterministic, samples full edges, and exposes nonlinear grade costs', () => {
  const terrain = new TerrainQueryService({ terrain: terrainFixture() });
  const options = {
    terrain,
    start: [-70, -45],
    end: [70, 52],
    archetype: 'mountain-hiking-trail',
    candidatePolicies: ['balanced'],
    routeStep: 7,
    sampleSpacing: 1.25,
    seed: 44
  };
  const first = solveTerrainAwareTrails(options);
  const second = solveTerrainAwareTrails(options);
  assert.deepEqual(first, second);
  assert.equal(first.candidates.length, 1);
  const candidate = first.candidates[0];
  assert.ok(candidate.segmentCosts.every(segment => segment.sampleCount > 2));
  assert.ok(candidate.segmentCosts.every(segment => segment.breakdown.grade >= 0));
  assert.ok(candidate.diagnostics.maximumGradePercent <= first.archetype.maximumGradePercent);
});

test('trail solver rejects forbidden regions and returns meaningfully different alternatives', () => {
  const terrain = new TerrainQueryService({ terrain: terrainFixture() });
  const restriction = { minX: -12, maxX: 16, minZ: -28, maxZ: 26 };
  const result = solveTerrainAwareTrails({
    terrain,
    start: [-80, 0],
    end: [80, 0],
    archetype: 'human-footpath',
    restrictions: [restriction],
    candidatePolicies: ['balanced', 'shortest', 'lowest-grade', 'scenic'],
    routeStep: 6,
    sampleSpacing: 1.5,
    diversityWeight: 8,
    seed: 12
  });
  assert.ok(result.candidates.length >= 2, JSON.stringify(result.failures));
  for (const candidate of result.candidates) {
    for (const point of candidate.points) {
      assert.equal(
        point[0] >= restriction.minX && point[0] <= restriction.maxX
        && point[1] >= restriction.minZ && point[1] <= restriction.maxZ,
        false
      );
    }
  }
  const averageSeparation = result.candidates[1].points.reduce((sum, point) => {
    const nearest = Math.min(...result.candidates[0].points.map(other => Math.hypot(point[0] - other[0], point[1] - other[1])));
    return sum + nearest;
  }, 0) / result.candidates[1].points.length;
  assert.ok(averageSeparation > 2);
});

test('solved trail stays authoritative through serialization and transactional undo', () => {
  const terrain = new TerrainQueryService({ terrain: terrainFixture() });
  const solved = solveTerrainAwareTrails({
    terrain,
    start: [-45, -40],
    end: [55, 48],
    candidatePolicies: ['balanced'],
    routeStep: 7,
    seed: 9
  });
  const network = trailCandidateToPathNetwork(solved.candidates[0], {
    id: 'generated-hiking-trail',
    purpose: 'player hub to mountain dungeon',
    terrainRevision: solved.terrainRevision
  });
  const serialized = JSON.parse(JSON.stringify(network));
  assert.deepEqual(serialized, network);
  assert.equal(network.pathClass, 'human-footpath');
  assert.equal(network.generation.solver, 'terrain-aware-trail-v1');
  const moved = applyPathNetworkTransaction(network, {
    id: 'move-generated-node',
    operations: [{
      type: 'move-node',
      nodeId: network.nodes[1].id,
      position: [network.nodes[1].position[0] + 2, 0, network.nodes[1].position[2] + 1]
    }]
  });
  assert.notDeepEqual(moved.network, network);
  const undone = replacePathNetwork(moved.network, moved.inverse.replaceNetwork);
  assert.deepEqual(undone.network, network);
});

test('trail solve observes cancellation before stale work can be accepted', () => {
  const terrain = new TerrainQueryService({ terrain: terrainFixture() });
  assert.throws(() => solveTerrainAwareTrails({
    terrain,
    start: [-80, -80],
    end: [80, 80],
    signal: { aborted: true }
  }), /cancelled/);
});

test('hard maximum grade rejects a continuously infeasible terrain field', () => {
  const impossibleTerrain = {
    analysisAt(x) {
      return {
        elevation: x * 2,
        slope: Math.atan(2) * 180 / Math.PI,
        aspect: 0,
        planCurvature: 0,
        profileCurvature: 0,
        roughness: 0,
        localRelief: 0,
        ridgeProbability: 0,
        valleyProbability: 0,
        flowDirectionX: -1,
        flowDirectionZ: 0,
        constructionSuitability: 0,
        traversability: 0
      };
    },
    elevationAt(x) {
      return x * 2;
    },
    describe() {
      return { revisions: { authoredNatural: 1 } };
    }
  };
  const solved = solveTerrainAwareTrails({
    terrain: impossibleTerrain,
    start: [-20, 0, 0],
    end: [20, 0, 0],
    archetype: 'human-footpath',
    candidatePolicies: ['balanced'],
    routeStep: 6,
    maximumStates: 1000
  });
  assert.equal(solved.candidates.length, 0);
  assert.equal(solved.failures[0].reason, 'no-feasible-route');
  assert.ok(solved.failures[0].diagnostics.rejectedByGrade > 0);
});
