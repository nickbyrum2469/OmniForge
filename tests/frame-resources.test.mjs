import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameResources, detectRenderCapabilities } from '../app/frame-resources.js';

function fakeGl() {
  return {
    MAX_TEXTURE_SIZE: 1,
    MAX_CUBE_MAP_TEXTURE_SIZE: 2,
    MAX_COLOR_ATTACHMENTS: 3,
    MAX_DRAW_BUFFERS: 4,
    MAX_SAMPLES: 5,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 6,
    VENDOR: 7,
    RENDERER: 8,
    viewportCalls: [],
    viewport(...args) { this.viewportCalls.push(args); },
    getParameter(key) {
      return ({ 1: 8192, 2: 4096, 3: 4, 4: 4, 5: 8, 6: 32, 7: 'Test Vendor', 8: 'Test Renderer' })[key] ?? null;
    },
    getExtension(name) {
      if (name === 'EXT_color_buffer_float') return {};
      if (name === 'OES_texture_float_linear') return {};
      return null;
    }
  };
}

function fakeCanvas() {
  return { width: 2, height: 2, clientWidth: 640, clientHeight: 360 };
}

test('FrameResources owns physical canvas size and caps device-pixel ratio', () => {
  const gl = fakeGl();
  const canvas = fakeCanvas();
  const resizeEvents = [];
  const resources = new FrameResources(canvas, gl, {
    maxDevicePixelRatio: 2,
    devicePixelRatioProvider: () => 3,
    onResize: event => resizeEvents.push(event)
  });
  const first = resources.syncCanvasSize();
  assert.equal(first.changed, true);
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 720);
  assert.equal(first.pixelRatio, 2);
  assert.equal(first.revision, 1);
  assert.deepEqual(gl.viewportCalls.at(-1), [0, 0, 1280, 720]);
  assert.equal(resizeEvents.length, 1);

  const second = resources.syncCanvasSize();
  assert.equal(second.changed, false);
  assert.equal(second.revision, 1);
  assert.equal(resizeEvents.length, 1);
});

test('FrameResources increments revision only for a real size change', () => {
  const gl = fakeGl();
  const canvas = fakeCanvas();
  const resources = new FrameResources(canvas, gl, { devicePixelRatioProvider: () => 1 });
  resources.syncCanvasSize();
  canvas.clientWidth = 800;
  const resized = resources.syncCanvasSize();
  assert.equal(resized.changed, true);
  assert.equal(resized.width, 800);
  assert.equal(resized.revision, 2);
});

test('FrameResources tracks external resources and context generations', () => {
  const resources = new FrameResources(fakeCanvas(), fakeGl(), { devicePixelRatioProvider: () => 1 });
  resources.registerExternal('shadow-map', { id: 'shadow' }, { kind: 'texture', format: 'depth24' });
  assert.equal(resources.get('shadow-map').id, 'shadow');
  const lost = resources.markContextLost();
  assert.equal(lost.contextLost, true);
  const restored = resources.markContextRestored();
  assert.equal(restored.contextLost, false);
  assert.equal(restored.contextGeneration, 1);
  assert.equal(restored.revision, 1);
  assert.ok(restored.external.some(resource => resource.name === 'default-framebuffer'));
  assert.ok(restored.external.some(resource => resource.name === 'shadow-map'));
});

test('FrameResources emits immutable per-frame dimensions', () => {
  const resources = new FrameResources(fakeCanvas(), fakeGl(), { devicePixelRatioProvider: () => 1 });
  resources.syncCanvasSize();
  const frame = resources.beginFrame(12);
  assert.equal(frame.frameIndex, 12);
  assert.equal(frame.width, 640);
  assert.equal(frame.height, 360);
  assert.equal(frame.aspect, 640 / 360);
  assert.equal(Object.isFrozen(frame), true);
});

test('render capability detection reports supported and missing optional features safely', () => {
  const capabilities = detectRenderCapabilities(fakeGl());
  assert.equal(capabilities.webgl2, true);
  assert.equal(capabilities.colorBufferFloat, true);
  assert.equal(capabilities.floatLinear, true);
  assert.equal(capabilities.timerQuery, false);
  assert.equal(capabilities.maxTextureSize, 8192);
  assert.equal(capabilities.maxDrawBuffers, 4);
  assert.equal(capabilities.vendor, 'Test Vendor');
  assert.equal(capabilities.renderer, 'Test Renderer');
  assert.equal(capabilities.contextRecoveryMode, 'reload-authoritative-state');
  assert.equal(Object.isFrozen(capabilities), true);
});
