import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathSurfaceCullMode } from '../app/renderer.js';

const rendererSource = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
const pathUiSource = fs.readFileSync(new URL('../app/v011.js', import.meta.url), 'utf8');

test('road construction surfaces use the terrain front-face visibility contract', () => {
  for (const kind of ['road', 'shoulder', 'earthwork']) {
    assert.equal(pathSurfaceCullMode(kind), 'front-face');
  }
});

test('volumetric bridge, tunnel, and retaining structure geometry remains two-sided', () => {
  assert.equal(pathSurfaceCullMode('structure'), 'double-sided');
});

test('path structures use grouped PBR materials and participate in world shadows', () => {
  assert.match(rendererSource, /type:structural\?'model':'terrain'/);
  assert.match(rendererSource, /castsShadows:true,receivesShadows:true/);
  assert.match(rendererSource, /for\(const pathObject of scene\.objects\.filter\(object=>object\.type==='path'.*castsShadows/);
});

test('a blocked branch warns without suppressing valid meshes in the same network', () => {
  assert.match(rendererSource, /path-network-v2-partially-blocked/);
  assert.doesNotMatch(rendererSource, /if\(!diagnostics\.valid\)\{[\s\S]{0,240}return null/);
});

test('Pathway Studio exposes the data-driven bridge family transaction', () => {
  assert.match(pathUiSource, /id="v012BridgeStyle"/);
  assert.match(pathUiSource, /set-segment-structure/);
  for (const style of ['timber-trestle', 'stone-arch', 'steel-girder', 'masonry-causeway', 'rope-footbridge']) {
    assert.match(pathUiSource, new RegExp(style));
  }
});
