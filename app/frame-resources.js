function safeParameter(gl, key, fallback = null) {
  try {
    const value = gl?.getParameter?.(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function detectRenderCapabilities(gl) {
  let timerQuery = false;
  let colorBufferFloat = false;
  let floatLinear = false;
  let debugRenderer = null;
  try { timerQuery = Boolean(gl?.getExtension?.('EXT_disjoint_timer_query_webgl2')); } catch {}
  try { colorBufferFloat = Boolean(gl?.getExtension?.('EXT_color_buffer_float')); } catch {}
  try { floatLinear = Boolean(gl?.getExtension?.('OES_texture_float_linear')); } catch {}
  try {
    const debug = gl?.getExtension?.('WEBGL_debug_renderer_info');
    if (debug) {
      debugRenderer = {
        vendor: safeParameter(gl, debug.UNMASKED_VENDOR_WEBGL, null),
        renderer: safeParameter(gl, debug.UNMASKED_RENDERER_WEBGL, null)
      };
    }
  } catch {}
  return Object.freeze({
    webgl2: Boolean(gl),
    timerQuery,
    colorBufferFloat,
    floatLinear,
    maxTextureSize: Number(safeParameter(gl, gl?.MAX_TEXTURE_SIZE, 0)) || 0,
    maxCubeMapTextureSize: Number(safeParameter(gl, gl?.MAX_CUBE_MAP_TEXTURE_SIZE, 0)) || 0,
    maxColorAttachments: Number(safeParameter(gl, gl?.MAX_COLOR_ATTACHMENTS, 1)) || 1,
    maxDrawBuffers: Number(safeParameter(gl, gl?.MAX_DRAW_BUFFERS, 1)) || 1,
    maxSamples: Number(safeParameter(gl, gl?.MAX_SAMPLES, 0)) || 0,
    maxCombinedTextureUnits: Number(safeParameter(gl, gl?.MAX_COMBINED_TEXTURE_IMAGE_UNITS, 0)) || 0,
    vendor: debugRenderer?.vendor || safeParameter(gl, gl?.VENDOR, null),
    renderer: debugRenderer?.renderer || safeParameter(gl, gl?.RENDERER, null),
    contextRecoveryMode: 'reload-authoritative-state'
  });
}

export class FrameResources {
  constructor(canvas, gl, {
    maxDevicePixelRatio = 2,
    devicePixelRatioProvider = () => Number(globalThis.devicePixelRatio || 1),
    onResize = null
  } = {}) {
    if (!canvas) throw new Error('FrameResources requires a canvas.');
    if (!gl) throw new Error('FrameResources requires a WebGL context.');
    this.canvas = canvas;
    this.gl = gl;
    this.maxDevicePixelRatio = Math.max(0.5, Number(maxDevicePixelRatio) || 2);
    this.devicePixelRatioProvider = devicePixelRatioProvider;
    this.onResize = typeof onResize === 'function' ? onResize : null;
    this.width = Math.max(2, Number(canvas.width || 2));
    this.height = Math.max(2, Number(canvas.height || 2));
    this.pixelRatio = 1;
    this.revision = 0;
    this.contextLost = false;
    this.contextGeneration = 0;
    this.external = new Map();
    this.registerExternal('default-framebuffer', null, { kind: 'framebuffer', format: 'canvas', persistent: true });
  }

  registerExternal(name, value = null, descriptor = {}) {
    const key = String(name || '').trim();
    if (!key) throw new Error('Frame resource names cannot be empty.');
    const current = this.external.get(key);
    const record = {
      name: key,
      value,
      descriptor: structuredClone(descriptor || {}),
      revision: Number(current?.revision || 0) + 1
    };
    this.external.set(key, record);
    return record;
  }

  updateExternal(name, value, descriptor = null) {
    const key = String(name || '').trim();
    const current = this.external.get(key);
    return this.registerExternal(key, value, descriptor === null ? current?.descriptor || {} : descriptor);
  }

  get(name) {
    return this.external.get(String(name || ''))?.value;
  }

  syncCanvasSize() {
    const dpr = Math.min(this.maxDevicePixelRatio, Math.max(0.5, Number(this.devicePixelRatioProvider?.() || 1)));
    const width = Math.max(2, Math.floor(Number(this.canvas.clientWidth || this.canvas.width || 2) * dpr));
    const height = Math.max(2, Math.floor(Number(this.canvas.clientHeight || this.canvas.height || 2) * dpr));
    const changed = this.canvas.width !== width || this.canvas.height !== height || this.pixelRatio !== dpr;
    if (!changed) return { changed: false, width: this.width, height: this.height, pixelRatio: this.pixelRatio, revision: this.revision };
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
    this.pixelRatio = dpr;
    this.revision += 1;
    this.gl.viewport?.(0, 0, width, height);
    const result = { changed: true, width, height, pixelRatio: dpr, revision: this.revision };
    this.onResize?.(result);
    return result;
  }

  markContextLost() {
    this.contextLost = true;
    return this.snapshot();
  }

  markContextRestored() {
    this.contextLost = false;
    this.contextGeneration += 1;
    this.revision += 1;
    return this.snapshot();
  }

  beginFrame(frameIndex) {
    return Object.freeze({
      frameIndex: Number(frameIndex || 0),
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      revision: this.revision,
      contextGeneration: this.contextGeneration,
      contextLost: this.contextLost,
      aspect: this.width / Math.max(1, this.height)
    });
  }

  snapshot() {
    return {
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      revision: this.revision,
      contextLost: this.contextLost,
      contextGeneration: this.contextGeneration,
      external: [...this.external.values()].map(record => ({
        name: record.name,
        revision: record.revision,
        descriptor: structuredClone(record.descriptor || {})
      }))
    };
  }
}
