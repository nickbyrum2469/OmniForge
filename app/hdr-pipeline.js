function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'HDR display shader compilation failed.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'HDR display program linking failed.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

import { SRGB_GLSL } from './color-management.js';

const displayVS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 positions[3]=vec2[](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
  vec2 p=positions[gl_VertexID];
  vUv=p*0.5+0.5;
  gl_Position=vec4(p,0.0,1.0);
}`;

const displayFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSceneColor;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform float uVibrance;
uniform int uToneMapper;

${SRGB_GLSL}
vec3 aces(vec3 value){
  return clamp((value*(2.51*value+0.03))/(value*(2.43*value+0.59)+0.14),0.0,1.0);
}
vec3 reinhard(vec3 value){return value/(1.0+value);}
vec3 neutral(vec3 value){
  const float startCompression=0.8-0.04;
  const float desaturation=0.15;
  float x=min(value.r,min(value.g,value.b));
  float offset=x<0.08?x-6.25*x*x:0.04;
  value-=offset;
  float peak=max(value.r,max(value.g,value.b));
  if(peak<startCompression)return value;
  float d=1.0-startCompression;
  float newPeak=1.0-d*d/(peak+d-startCompression);
  value*=newPeak/peak;
  float g=1.0-1.0/(desaturation*(peak-newPeak)+1.0);
  return mix(value,newPeak*vec3(1.0),g);
}
vec3 grade(vec3 color){
  float luma=dot(color,vec3(0.2126,0.7152,0.0722));
  float chroma=max(color.r,max(color.g,color.b))-min(color.r,min(color.g,color.b));
  float adaptiveVibrance=1.0+uVibrance*(1.0-clamp(chroma,0.0,1.0));
  color=mix(vec3(luma),color,max(0.0,uSaturation)*adaptiveVibrance);
  color=(color-0.18)*max(0.05,uContrast)+0.18;
  return max(color,vec3(0.0));
}
void main(){
  vec3 color=max(texture(uSceneColor,vUv).rgb,vec3(0.0));
  color*=exp2(uExposure);
  color=grade(color);
  color=uToneMapper==1?reinhard(color):(uToneMapper==2?neutral(color):aces(color));
  color=linearToSrgb(clamp(color,0.0,1.0));
  outColor=vec4(color,1.0);
}`;

export class HDRPipeline {
  constructor(gl, { colorBufferFloat = false, floatLinear = false } = {}) {
    if (!gl) throw new Error('HDRPipeline requires WebGL 2.');
    this.gl = gl;
    this.colorBufferFloat = Boolean(colorBufferFloat);
    this.floatLinear = Boolean(floatLinear);
    this.program = createProgram(gl, displayVS, displayFS);
    this.vao = gl.createVertexArray();
    this.framebuffer = null;
    this.colorTexture = null;
    this.depthBuffer = null;
    this.width = 0;
    this.height = 0;
    this.format = 'uninitialized';
    this.revision = 0;
    this.locations = {
      sceneColor: gl.getUniformLocation(this.program, 'uSceneColor'),
      exposure: gl.getUniformLocation(this.program, 'uExposure'),
      saturation: gl.getUniformLocation(this.program, 'uSaturation'),
      contrast: gl.getUniformLocation(this.program, 'uContrast'),
      vibrance: gl.getUniformLocation(this.program, 'uVibrance'),
      toneMapper: gl.getUniformLocation(this.program, 'uToneMapper')
    };
  }

  destroyTargets() {
    const gl = this.gl;
    if (this.colorTexture) gl.deleteTexture(this.colorTexture);
    if (this.depthBuffer) gl.deleteRenderbuffer(this.depthBuffer);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    this.colorTexture = null;
    this.depthBuffer = null;
    this.framebuffer = null;
  }

  createTargets(width, height, preferFloat = this.colorBufferFloat) {
    const gl = this.gl;
    this.destroyTargets();
    const framebuffer = gl.createFramebuffer();
    const colorTexture = gl.createTexture();
    const depthBuffer = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    const internalFormat = preferFloat ? gl.RGBA16F : gl.RGBA8;
    const type = preferFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
    const filter = preferFloat && !this.floatLinear ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(colorTexture);
      gl.deleteRenderbuffer(depthBuffer);
      gl.deleteFramebuffer(framebuffer);
      if (preferFloat) return this.createTargets(width, height, false);
      throw new Error(`HDR scene framebuffer is incomplete: 0x${status.toString(16)}.`);
    }
    this.framebuffer = framebuffer;
    this.colorTexture = colorTexture;
    this.depthBuffer = depthBuffer;
    this.width = width;
    this.height = height;
    this.format = preferFloat ? 'rgba16f' : 'rgba8-fallback';
    this.revision += 1;
    return this.snapshot();
  }

  ensureSize(width, height) {
    const nextWidth = Math.max(2, Math.floor(Number(width) || 2));
    const nextHeight = Math.max(2, Math.floor(Number(height) || 2));
    if (this.framebuffer && this.width === nextWidth && this.height === nextHeight) return this.snapshot();
    return this.createTargets(nextWidth, nextHeight, this.colorBufferFloat);
  }

  bindScene(width, height) {
    this.ensureSize(width, height);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
  }

  present({ exposure = 0, saturation = 1, contrast = 1, vibrance = 0, toneMapper = 'aces' } = {}) {
    const gl = this.gl;
    if (!this.framebuffer || !this.colorTexture) return;
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST);
    const cullEnabled = gl.isEnabled(gl.CULL_FACE);
    const blendEnabled = gl.isEnabled(gl.BLEND);
    const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.uniform1i(this.locations.sceneColor, 0);
    gl.uniform1f(this.locations.exposure, Number(exposure) || 0);
    gl.uniform1f(this.locations.saturation, Math.max(0, Number(saturation) || 0));
    gl.uniform1f(this.locations.contrast, Math.max(0.05, Number(contrast) || 1));
    gl.uniform1f(this.locations.vibrance, Number(vibrance) || 0);
    gl.uniform1i(this.locations.toneMapper, ({ aces: 0, reinhard: 1, neutral: 2 })[String(toneMapper)] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.depthMask(depthMask);
    if (depthEnabled) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (cullEnabled) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    if (blendEnabled) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  }

  snapshot() {
    return {
      width: this.width,
      height: this.height,
      format: this.format,
      revision: this.revision,
      floatingPoint: this.format === 'rgba16f'
    };
  }

  dispose() {
    this.destroyTargets();
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.program) this.gl.deleteProgram(this.program);
    this.vao = null;
    this.program = null;
  }
}
