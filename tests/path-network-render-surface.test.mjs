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
  assert.match(rendererSource, /const objectSurface=structural\|\|curbLike\|\|sidewalkLike/);
  assert.match(rendererSource, /type:objectSurface\?'model':'terrain'/);
  assert.match(rendererSource, /castsShadows:true,receivesShadows:true/);
  assert.match(rendererSource, /for\(const pathObject of scene\.objects\.filter\(object=>object\.type==='path'.*castsShadows/);
});

test('curbs and sidewalks use their own PBR material authority instead of the road blend', () => {
  assert.match(rendererSource, /segmentProfile\.curbMaterialId/);
  assert.match(rendererSource, /segmentProfile\.sidewalkMaterialId/);
  assert.match(rendererSource, /objectSurface\?null:pathObject/);
  assert.match(rendererSource, /curbColor\|\|'#9a9b96'/);
  assert.match(rendererSource, /sidewalkColor\|\|'#777c80'/);
  assert.match(rendererSource, /kind==='sidewalk'\|\|kind==='sidewalkEdge'/);
});

test('road surface character is deterministic, weather-aware, and evaluated on compiled road UVs', () => {
  for (let index = 0; index < 4; index += 1) {
    assert.match(rendererSource, new RegExp(`layout\\(location=${8 + index}\\) in vec4 aSurfaceDetail${index}`));
    assert.match(rendererSource, new RegExp(`flat out vec4 vSurfaceDetail${index}`));
    assert.match(rendererSource, new RegExp(`flat in vec4 vSurfaceDetail${index}`));
    assert.match(rendererSource, new RegExp(`bind\\(${8 + index},4,detailStream\\('surfaceDetail${index}'\\)\\)`));
  }
  assert.match(rendererSource, /vec4 pathSurfaceDetailMasks\(/);
  assert.match(rendererSource, /vec4 detail0,[\s\S]{0,120}vec4 detail3,/);
  assert.match(rendererSource, /float longitudinalMeters=uv\.x/);
  assert.match(rendererSource, /float lateralMeters=\(uv\.y-\.5\)\*roadWidth/);
  assert.match(rendererSource, /float halfGauge=min\(wheelGauge\*\.5/);
  assert.match(rendererSource, /rutWidth\*\.5-rutAA/);
  assert.match(rendererSource, /rutLines/);
  assert.match(rendererSource, /puddleShape/);
  assert.match(rendererSource, /hoofShape/);
  assert.match(rendererSource, /bootShape/);
  assert.match(rendererSource, /softPatternChance/);
  assert.match(rendererSource, /puddleDepth\*24\.0/);
  assert.match(rendererSource, /erosionStrength\*erosionNoise/);
  assert.match(rendererSource, /detailNormalStrength\*roadMask/);
  assert.match(rendererSource, /weatherWetness\*weatherResponse/);
  assert.match(rendererSource, /vSurfaceDetail0,[\s\S]{0,160}vSurfaceDetail3,[\s\S]{0,80}uEnvironmentState\.y/);
  assert.doesNotMatch(rendererSource, /pathSurfaceDetailMasks\(vUV,vBlend/);
  assert.match(rendererSource, /roughness=mix\(roughness,.14,pathDetail\.x\*\.9\)/);
  assert.match(rendererSource, /pathDetailActive=step\(\.5,vSurfaceDetail0\.x\)/);
  assert.match(rendererSource, /new Float32Array\(source\|\|vertexCount\*4\)/);
});

test('a blocked branch warns without suppressing valid meshes in the same network', () => {
  assert.match(rendererSource, /path-network-v2-partially-blocked/);
  assert.doesNotMatch(rendererSource, /if\(!diagnostics\.valid\)\{[\s\S]{0,240}return null/);
});

test('blocked corridors are editor-only hatched guides and never enter the shadow or opaque mesh path', () => {
  assert.match(rendererSource, /blockedCorridors=.*createLineBuffer/);
  assert.match(rendererSource, /options\?\.editorMode!==['"]play['"]/);
  assert.match(rendererSource, /blocked\.hatches/);
  assert.match(rendererSource, /blocked\.boundaries/);
  assert.match(rendererSource, /blocked\.endCaps/);
  assert.doesNotMatch(rendererSource, /renderShadow[\s\S]{0,1800}blockedCorridors/);
});

test('Pathway Studio exposes the data-driven bridge family transaction', () => {
  assert.match(pathUiSource, /id="v012BridgeStyle"/);
  assert.match(pathUiSource, /set-segment-structure/);
  for (const style of ['timber-trestle', 'stone-arch', 'steel-girder', 'masonry-causeway', 'rope-footbridge']) {
    assert.match(pathUiSource, new RegExp(style));
  }
});
