import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTerrainConformingPathSurface, terrainPathSamplingDiagnostics } from '../app/path-visuals.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terrain = { id: 'terrain-large', type: 'terrain', visible: true, transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }, properties: { preset: 'rollingHills', sizeX: 2048, sizeZ: 2048, resolutionX: 64, resolutionZ: 64, height: 22, seed: 17 } };
const pathObject = { id: 'path-narrow', type: 'path', visible: true, transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }, properties: { worldSpacePoints: true, points: [[-300,-120],[0,40],[310,180]], width: 3, blendDistance: 2.5, carveTerrain: true, maxGradePercent: 12, surfaceOffset: 0.03 } };

const approximately = (actual, expected, tolerance = 1e-5) => Math.abs(actual - expected) <= tolerance;

test('large terrain reports vertex sampling that cannot reliably carry a narrow road', () => {
  const diagnostics = terrainPathSamplingDiagnostics(terrain, [pathObject]);
  assert.equal(diagnostics.available, true);
  assert.equal(diagnostics.undersampled, true);
  assert.ok(diagnostics.maximumSpacing > diagnostics.minimumPathWidth);
  assert.equal(diagnostics.dedicatedPathSurface, true);
  assert.equal(diagnostics.corridorCompiler, 'pathway-studio-v1');
});

test('terrain-conforming corridor remains dense and renderable independent of terrain grid resolution', () => {
  const mesh = buildTerrainConformingPathSurface(pathObject, terrain, [pathObject]);
  assert.ok(mesh.positions.length > 180);
  assert.ok(mesh.indices.length > 90);
  assert.equal(mesh.positions.length / 3, mesh.blends.length);
  assert.equal(mesh.diagnostics.crossSectionBands, 9);
  assert.ok([...mesh.positions].every(Number.isFinite));
  assert.ok([...mesh.normals].every(Number.isFinite));
  assert.ok([...mesh.normals].some((value,index)=>index%3===1&&value>0.5));
  const firstRow = [...mesh.blends.slice(0, 9)];
  const expected = [0, .12, .48, 1, 1, 1, .48, .12, 0];
  assert.ok(firstRow.every((value, index) => approximately(value, expected[index])));
  const leftRoadEdge = 3 * 3;
  const rightRoadEdge = 5 * 3;
  const firstWidth = Math.hypot(
    mesh.positions[leftRoadEdge] - mesh.positions[rightRoadEdge],
    mesh.positions[leftRoadEdge + 2] - mesh.positions[rightRoadEdge + 2]
  );
  assert.ok(Math.abs(firstWidth - 3) < 0.05);
});

test('renderer owns an engineering corridor pass instead of relying only on terrain vertex blend', () => {
  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  assert.match(renderer, /pathSurfaceFor\(pathObject,scene\)/);
  assert.match(renderer, /renderPathSurfacePass\(frame\)/);
  assert.match(renderer, /buildTerrainConformingPathSurface/);
  assert.match(renderer, /gl\.polygonOffset\(-2,-2\)/);
  assert.match(renderer, /terrain-path-grid-undersampled/);
  assert.match(renderer, /pathSurfaceCount:this\.pathSurfaces\.size/);
  assert.match(renderer, /pathwayCorridors:/);
});
