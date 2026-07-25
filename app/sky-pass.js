import { DEG } from './math.js';
import { cameraSkyBasis } from './environment-runtime.js';

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Sky shader compilation failed.';
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
    const message = gl.getProgramInfoLog(program) || 'Sky program linking failed.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

const skyVS = `#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 positions[3]=vec2[](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
  vNdc=positions[gl_VertexID];
  gl_Position=vec4(vNdc,1.0,1.0);
}`;

const skyFS = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform vec3 uSunDirection;
uniform vec3 uMoonDirection;
uniform vec3 uSunColor;
uniform vec3 uMoonColor;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform float uDayFactor;
uniform float uNightFactor;
uniform float uTwilightFactor;
uniform float uStarVisibility;
uniform float uStarDensity;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform vec2 uCloudWind;
uniform float uCloudSeed;
uniform float uTime;
uniform float uExposure;
uniform float uWeatherDarkening;

float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float hash31(vec3 p){
  p=fract(p*0.1031);
  p+=dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float noise2(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);
}
float fbm(vec2 p){
  float value=0.0;
  float amplitude=0.55;
  mat2 rotation=mat2(0.8,-0.6,0.6,0.8);
  for(int i=0;i<5;i++){
    value+=noise2(p)*amplitude;
    p=rotation*p*2.03+17.17;
    amplitude*=0.5;
  }
  return value;
}
vec3 toneMap(vec3 value){
  value*=max(0.05,uExposure);
  value=(value*(2.51*value+0.03))/(value*(2.43*value+0.59)+0.14);
  return pow(clamp(value,0.0,1.0),vec3(1.0/2.2));
}
void main(){
  vec3 ray=normalize(uForward+uRight*vNdc.x*uTanHalfFov*uAspect+uUp*vNdc.y*uTanHalfFov);
  float horizon=pow(clamp(1.0-abs(ray.y),0.0,1.0),4.0);
  float upper=smoothstep(-0.04,0.7,ray.y);
  float below=smoothstep(-0.45,-0.02,ray.y);
  vec3 sky=mix(uGroundColor,uHorizonColor,below);
  sky=mix(sky,uZenithColor,upper);
  sky=mix(sky,uHorizonColor,horizon*0.48);

  float sunDot=max(dot(ray,uSunDirection),0.0);
  float sunGlow=pow(sunDot,24.0)*(0.18+uTwilightFactor*0.55);
  float sunDisc=smoothstep(0.99955,0.99982,sunDot)*uDayFactor;
  sky+=uSunColor*(sunGlow+sunDisc*5.2);
  sky+=uSunColor*horizon*uTwilightFactor*0.22;

  float moonDot=max(dot(ray,uMoonDirection),0.0);
  float moonDisc=smoothstep(0.99972,0.9999,moonDot)*uNightFactor;
  float moonGlow=pow(moonDot,80.0)*uNightFactor*0.2;
  sky+=uMoonColor*(moonDisc*1.8+moonGlow);

  vec3 starCell=floor(ray*mix(380.0,760.0,clamp(uStarDensity*0.7,0.0,1.0))+uCloudSeed);
  float starSeed=hash31(starCell);
  float starThreshold=mix(0.9988,0.9968,clamp(uStarDensity-0.45,0.0,1.0));
  float star=step(starThreshold,starSeed);
  float twinkle=0.72+0.28*sin(uTime*(1.2+hash31(starCell+7.0)*2.2)+starSeed*31.0);
  float starHorizon=smoothstep(0.01,0.18,ray.y);
  sky+=vec3(0.72,0.84,1.0)*star*twinkle*uStarVisibility*starHorizon;

  float cloudMask=0.0;
  if(uCloudCoverage>0.001&&ray.y>-0.08){
    float projection=max(0.1,ray.y+0.22);
    vec2 cloudUv=ray.xz/projection*0.72;
    cloudUv+=uCloudWind*uTime*0.00045;
    cloudUv+=vec2(uCloudSeed*0.00017,uCloudSeed*0.00029);
    float shape=fbm(cloudUv*1.15);
    float detail=fbm(cloudUv*3.1+23.4)*0.24;
    float field=shape+detail;
    float threshold=1.02-uCloudCoverage*0.72;
    cloudMask=smoothstep(threshold,threshold+0.16,field)*uCloudDensity;
    cloudMask*=smoothstep(-0.05,0.18,ray.y);
    float cloudLight=0.44+0.56*pow(max(dot(normalize(vec3(ray.x,0.32,ray.z)),uSunDirection),0.0),2.0);
    vec3 cloudDay=mix(vec3(0.34,0.38,0.44),vec3(1.0,0.96,0.9),cloudLight);
    vec3 cloudNight=mix(vec3(0.035,0.045,0.065),uMoonColor*0.34,moonGlow+moonDisc*0.3);
    vec3 cloudColor=mix(cloudNight,cloudDay,uDayFactor);
    cloudColor*=1.0-uWeatherDarkening*0.72;
    sky=mix(sky,cloudColor,cloudMask*0.86);
  }

  sky*=1.0-uWeatherDarkening*0.42;
  outColor=vec4(toneMap(max(sky,vec3(0.0001))),1.0);
}`;

export class SkyPass {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, skyVS, skyFS);
    this.vao = gl.createVertexArray();
    this.locations = {};
    for (const name of [
      'uForward','uRight','uUp','uTanHalfFov','uAspect','uSunDirection','uMoonDirection','uSunColor','uMoonColor',
      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility',
      'uStarDensity','uCloudCoverage','uCloudDensity','uCloudWind','uCloudSeed','uTime','uExposure','uWeatherDarkening'
    ]) this.locations[name] = gl.getUniformLocation(this.program, name);
  }

  render(camera, environment) {
    const gl = this.gl;
    const { forward, right, up } = cameraSkyBasis(camera);
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST);
    const cullEnabled = gl.isEnabled(gl.CULL_FACE);
    const blendEnabled = gl.isEnabled(gl.BLEND);
    const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    const u = this.locations;
    gl.uniform3fv(u.uForward, forward);
    gl.uniform3fv(u.uRight, right);
    gl.uniform3fv(u.uUp, up);
    gl.uniform1f(u.uTanHalfFov, Math.tan((Number(camera.fov || 62) * DEG) * 0.5));
    gl.uniform1f(u.uAspect, gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight));
    gl.uniform3fv(u.uSunDirection, environment.sunDirection);
    gl.uniform3fv(u.uMoonDirection, environment.moonDirection);
    gl.uniform3fv(u.uSunColor, environment.sunColor);
    gl.uniform3fv(u.uMoonColor, environment.moonColor);
    gl.uniform3fv(u.uZenithColor, environment.zenithColor);
    gl.uniform3fv(u.uHorizonColor, environment.horizonColor);
    gl.uniform3fv(u.uGroundColor, environment.groundColor);
    gl.uniform1f(u.uDayFactor, environment.dayFactor);
    gl.uniform1f(u.uNightFactor, environment.nightFactor);
    gl.uniform1f(u.uTwilightFactor, environment.twilightFactor);
    gl.uniform1f(u.uStarVisibility, environment.starVisibility);
    gl.uniform1f(u.uStarDensity, environment.starDensity);
    gl.uniform1f(u.uCloudCoverage, environment.cloudCoverage);
    gl.uniform1f(u.uCloudDensity, environment.cloudDensity);
    gl.uniform2fv(u.uCloudWind, environment.cloudWindDirection);
    gl.uniform1f(u.uCloudSeed, environment.cloudSeed);
    gl.uniform1f(u.uTime, environment.timeSeconds * Math.max(0.05, environment.cloudWindSpeed / 12));
    gl.uniform1f(u.uExposure, environment.exposure);
    gl.uniform1f(u.uWeatherDarkening, environment.weatherDarkening);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(depthMask);
    if (depthEnabled) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (cullEnabled) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    if (blendEnabled) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  }
}
