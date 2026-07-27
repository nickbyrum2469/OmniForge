import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTerrainConformingPathSurface, terrainPathSamplingDiagnostics } from '../app/path-visuals.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terrain = { id: 'terrain-large', type: 'terrain', visible: true, transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }, properties: { preset: 'rollingHills', sizeX: 2048, sizeZ: 2048, resolutionX: 64, resolutionZ: 64, height: 22, seed: 17 } };
const pathObject = { id: 'path-narrow', type: 'path', visible: true, transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }, properties: { worldSpacePoints: true, points: [[-300,-120],[0,40],[310,180]], width: 3, blendDistance: 2.5, carveTerrain: true, maxGradePercent: 12, surfaceOffset: 0.03 } };

test('large terrain reports vertex sampling that cannot reliably carry a narrow road', () => {
  const diagnostics = terrainPathSamplingDiagnostics(terrain, [pathObject]);
  assert.equal(diagnostics.available, true);assert.equal(diagnostics.undersampled, true);assert.ok(diagnostics.maximumSpacing > diagnostics.minimumPathWidth);assert.equal(diagnostics.dedicatedPathSurface, true);
});

test('terrain-conforming path surface remains dense and renderable independent of terrain grid resolution', () => {
  const mesh = buildTerrainConformingPathSurface(pathObject, terrain, [pathObject]);
  assert.ok(mesh.positions.length > 60);assert.ok(mesh.indices.length > 30);assert.equal(mesh.positions.length / 3, mesh.blends.length);assert.ok([...mesh.blends].every(value => value === 1));assert.ok([...mesh.positions].every(Number.isFinite));assert.ok([...mesh.normals].every(Number.isFinite));assert.ok([...mesh.normals].some((value,index)=>index%3===1&&value>0.5));
  const firstWidth = Math.hypot(mesh.positions[0] - mesh.positions[3], mesh.positions[2] - mesh.positions[5]);assert.ok(Math.abs(firstWidth - 3) < 0.05);
});

test('renderer owns a separate opaque path surface pass instead of relying only on terrain vertex blend', () => {
  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  assert.match(renderer, /pathSurfaceFor\(pathObject,scene\)/);assert.match(renderer, /renderPathSurfacePass\(frame\)/);assert.match(renderer, /buildTerrainConformingPathSurface/);assert.match(renderer, /gl\.polygonOffset\(-1,-1\)/);assert.match(renderer, /terrain-path-grid-undersampled/);assert.match(renderer, /pathSurfaceCount:this\.pathSurfaces\.size/);
});
