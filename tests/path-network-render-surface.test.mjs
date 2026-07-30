import test from 'node:test';
import assert from 'node:assert/strict';
import { pathSurfaceCullMode } from '../app/renderer.js';

test('road construction surfaces use the terrain front-face visibility contract', () => {
  for (const kind of ['road', 'shoulder', 'earthwork']) {
    assert.equal(pathSurfaceCullMode(kind), 'front-face');
  }
});

test('volumetric bridge, tunnel, and retaining structure geometry remains two-sided', () => {
  assert.equal(pathSurfaceCullMode('structure'), 'double-sided');
});
