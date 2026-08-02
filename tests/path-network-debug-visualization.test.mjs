import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPathCostGuideData,
  compiledSegmentLinePositions,
  pathCostColor,
  pathSegmentCostSeverity
} from '../app/path-network/debug-visualization.js';

const compiledSegment = ({
  id = 'segment-a',
  grade = 5,
  constructionMode = 'conform'
} = {}) => ({
  id,
  samples: [
    { position: [0, 1, 0] },
    { position: [3, 2, 4] },
    { position: [6, 2.5, 8] }
  ],
  metrics: { maximumGradePercent: grade },
  construction: { mode: constructionMode }
});

test('cost guide geometry comes from the exact compiled station positions', () => {
  const positions = compiledSegmentLinePositions(compiledSegment(), 0.2);
  assert.deepEqual(positions, [
    0, 1.2, 0, 3, 2.2, 4,
    3, 2.2, 4, 6, 2.7, 8
  ]);
});

test('grade, generated cost, and invalid construction produce bounded severity', () => {
  const ordinary = pathSegmentCostSeverity({
    compiledSegment: compiledSegment({ grade: 5 }),
    networkSegment: { costBreakdown: { breakdown: { total: 20 } } },
    engineering: { maxGradePercent: 20 },
    maximumTotalCost: 40
  });
  const severe = pathSegmentCostSeverity({
    compiledSegment: compiledSegment({ grade: 20 }),
    networkSegment: { costBreakdown: { breakdown: { total: 40 } } },
    engineering: { maxGradePercent: 20 },
    maximumTotalCost: 40
  });
  const invalid = pathSegmentCostSeverity({
    compiledSegment: compiledSegment({ constructionMode: 'invalid' }),
    engineering: { maxGradePercent: 20 }
  });
  assert.ok(ordinary > 0 && ordinary < severe);
  assert.equal(severe, 1);
  assert.equal(invalid, 1);
  assert.deepEqual(pathCostColor(0), [0.1, 0.9, 0.25, 0.98]);
  assert.deepEqual(pathCostColor(1), [0.95, 0.18000000000000005, 0.08, 0.98]);
});

test('runtime debug data keeps segment diagnostics beside compiled geometry', () => {
  const runtime = {
    network: {
      segments: [{
        id: 'segment-a',
        costBreakdown: { breakdown: { distance: 12, grade: 4, total: 16 } }
      }]
    },
    compiled: {
      engineering: { maxGradePercent: 10 },
      segments: [compiledSegment({ grade: 7 })]
    }
  };
  const guides = buildPathCostGuideData(runtime);
  assert.equal(guides.length, 1);
  assert.equal(guides[0].segmentId, 'segment-a');
  assert.equal(guides[0].maximumGradePercent, 7);
  assert.equal(guides[0].costBreakdown.breakdown.total, 16);
  assert.equal(guides[0].positions.length, 12);
});

