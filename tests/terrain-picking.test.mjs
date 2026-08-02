import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickTerrainPoint,
  terrainRayDistanceRange
} from '../app/terrain-picking.js';

const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

test('terrain ray picking clips work to the terrain XZ bounds', () => {
  const range = terrainRayDistanceRange({
    origin: [0, 100, 100],
    dir: [0, -0.5, -1]
  }, bounds, { margin: 0, maximumDistance: 12000 });
  assert.deepEqual(range, [50, 150]);
});

test('terrain ray picking returns a precise intersection without scanning 12 km', () => {
  let samples = 0;
  const point = pickTerrainPoint({
    ray: {
      origin: [0, 100, 40],
      dir: [0, -1, -0.2]
    },
    bounds,
    heightAt: () => {
      samples += 1;
      return 10;
    },
    step: 4,
    refinementSteps: 12
  });
  assert.ok(point);
  assert.ok(Math.abs(point[1] - 10) < 1e-6);
  assert.ok(Math.abs(point[2] - 22) < 0.01);
  assert.ok(samples < 60, `expected a bounded pick, received ${samples} height samples`);
});

test('terrain ray picking rejects rays that never enter the terrain bounds', () => {
  const point = pickTerrainPoint({
    ray: {
      origin: [200, 50, 200],
      dir: [1, -1, 0]
    },
    bounds,
    heightAt: () => 0
  });
  assert.equal(point, null);
});
