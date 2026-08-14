import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coherentPathRenderScene,
  disposePathRenderBundle,
  pathRenderBundleMatchesScene
} from '../app/renderer.js';

function scene({ id = 'scene-a', terrainId = 'terrain', pathVisible = false } = {}) {
  return {
    id,
    settings: { worldChunkSize: 96, exposure: 1.25 },
    objects: [
      { id: terrainId, type: 'terrain', visible: true, properties: { revision: 2 } },
      { id: 'road', type: 'path', visible: pathVisible, properties: { revision: 2 } },
      { id: 'sun', type: 'directionalLight', visible: true, properties: {} }
    ]
  };
}

function bundle() {
  return {
    sceneId: 'scene-a',
    terrainId: 'terrain',
    worldChunkSize: 64,
    terrain: { id: 'terrain', type: 'terrain', visible: true, properties: { revision: 1 } },
    paths: [{ id: 'road', type: 'path', visible: true, properties: { revision: 1 } }],
    terrainMesh: { vao: 'terrain-vao', buffers: ['terrain-buffer'] },
    pathLines: new Map([['road', { center: { vao: 'line-vao', buffer: 'line-buffer' } }]]),
    pathSurfaces: new Map([['road', { meshes: { road: { vao: 'road-vao', buffers: ['road-buffer'] } } }]])
  };
}

test('coherent bundle retains its terrain and road until the matching scene swap completes', () => {
  const current = scene({ pathVisible: false });
  const active = bundle();
  assert.equal(pathRenderBundleMatchesScene(active, current), true);
  const rendered = coherentPathRenderScene(current, active);
  assert.equal(rendered.objects.find(object => object.type === 'terrain').properties.revision, 1);
  assert.equal(rendered.objects.find(object => object.type === 'path').visible, true);
  assert.equal(rendered.objects.find(object => object.id === 'sun'), current.objects.find(object => object.id === 'sun'));
  assert.equal(rendered.settings.worldChunkSize, 64);
  assert.equal(rendered.settings.exposure, 1.25);
});

test('a bundle can never cross into another scene or terrain with reused object ids', () => {
  const active = bundle();
  const otherScene = scene({ id: 'scene-b', terrainId: 'terrain' });
  assert.equal(pathRenderBundleMatchesScene(active, otherScene), false);
  assert.equal(coherentPathRenderScene(otherScene, active), otherScene);
  const otherTerrain = scene({ id: 'scene-a', terrainId: 'terrain-new' });
  assert.equal(pathRenderBundleMatchesScene(active, otherTerrain), false);
  assert.equal(coherentPathRenderScene(otherTerrain, active), otherTerrain);
});

test('disposing a render bundle releases terrain, guide, and surface GPU resources', () => {
  const deletedBuffers = [], deletedVertexArrays = [];
  const gl = {
    deleteBuffer: value => deletedBuffers.push(value),
    deleteVertexArray: value => deletedVertexArrays.push(value)
  };
  disposePathRenderBundle(gl, bundle());
  assert.deepEqual(new Set(deletedBuffers), new Set(['terrain-buffer', 'line-buffer', 'road-buffer']));
  assert.deepEqual(new Set(deletedVertexArrays), new Set(['terrain-vao', 'line-vao', 'road-vao']));
});
