import fs from 'node:fs';
import path from 'node:path';

const rendererFile = path.resolve('app/renderer.js');
let source = fs.readFileSync(rendererFile, 'utf8');

const smoothstep = "function smoothstep(a,b,x){const t=clamp((x-a)/(b-a||1),0,1);return t*t*(3-2*t);}";
const helpers = `${smoothstep}\nfunction lerp(a,b,t){return a+(b-a)*t;}`;
if (!source.includes('function lerp(a,b,t)')) {
  if (!source.includes(smoothstep)) throw new Error('Renderer interpolation insertion point was not found.');
  source = source.replace(smoothstep, helpers);
}

if (!source.includes('export function terrainMesh(object,paths)')) {
  if (!source.includes('function terrainMesh(object,paths)')) throw new Error('Terrain mesh export insertion point was not found.');
  source = source.replace('function terrainMesh(object,paths)', 'export function terrainMesh(object,paths)');
}
fs.writeFileSync(rendererFile, source, 'utf8');

const testFile = path.resolve('tests/v011-renderer-runtime.test.mjs');
const testSource = `import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainMesh } from '../app/renderer.js';
import { normalizeTerrainProperties } from '../app/worldgen.js';

function finiteArray(values, label) {
  assert.ok(values.length > 0, \`${'${label}'} should not be empty\`);
  for (const value of values) assert.ok(Number.isFinite(value), \`${'${label}'} contained a non-finite value\`);
}

test('v0.11 renderer constructs a finite terrain mesh without missing runtime helpers', () => {
  const terrain = {
    id: 'terrain-runtime-test',
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: normalizeTerrainProperties({
      preset: 'mountainValley',
      bounds: { minX: -48, maxX: 80, minZ: -32, maxZ: 64 },
      resolutionX: 24,
      resolutionZ: 18,
      height: 22,
      macroScale: 90,
      detailScale: 18,
      seed: 27
    }, { position: [0, 0, 0], scale: [1, 1, 1] })
  };

  const mesh = terrainMesh(terrain, []);
  const expectedVertices = (24 + 1) * (18 + 1);
  assert.equal(mesh.positions.length, expectedVertices * 3);
  assert.equal(mesh.normals.length, expectedVertices * 3);
  assert.equal(mesh.uvs.length, expectedVertices * 2);
  assert.equal(mesh.blends.length, expectedVertices);
  assert.equal(mesh.indices.length, 24 * 18 * 6);
  finiteArray(mesh.positions, 'positions');
  finiteArray(mesh.normals, 'normals');
  finiteArray(mesh.uvs, 'uvs');
  finiteArray(mesh.blends, 'blends');
  finiteArray(mesh.indices, 'indices');
});
`;
fs.writeFileSync(testFile, testSource, 'utf8');
console.log('Defined renderer interpolation and installed executable terrain-mesh regression coverage.');
