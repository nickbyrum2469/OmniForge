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
uniform vec3 uCameraPosition;
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
uniform float uStarBrightness;
uniform float uStarTwinkleAmount;
uniform float uStarTwinkleSpeed;
uniform float uStarSizeMin;
uniform float uStarSizeMax;
uniform float uStarColorVariation;
uniform float uStarSeed;
uniform float uMilkyWayIntensity;
uniform float uMilkyWayWidth;
uniform float uMilkyWayDetail;
uniform float uMilkyWayOrientation;
uniform float uMilkyWayDust;
uniform vec3 uMilkyWayColor;
uniform float uSunAngularRadius;
uniform float uSunGlow;
uniform float uMoonAngularRadius;
uniform float uMoonGlow;
uniform float uMoonPhase;
uniform float uMoonBrightness;
uniform float uMoonDetail;
uniform float uMoonVisibility;
uniform float uMoonEarthshine;
uniform float uLunarEclipse;
uniform float uSolarEclipse;
uniform float uPlanetEnabled;
uniform vec3 uPlanetDirection;
uniform vec3 uPlanetColor;
uniform float uPlanetAngularRadius;
uniform float uPlanetBrightness;
uniform float uPlanetRings;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform vec2 uCloudWind;
uniform float uCloudSeed;
uniform float uCloudQuality;
uniform float uCloudAltitude;
uniform float uCloudThickness;
uniform float uTime;
uniform float uExposure;
uniform float uWeatherDarkening;

const float PI=3.14159265359;
const float TAU=6.28318530718;

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
float noise3(vec3 p){
  vec3 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  float n000=hash31(i);
  float n100=hash31(i+vec3(1,0,0));
  float n010=hash31(i+vec3(0,1,0));
  float n110=hash31(i+vec3(1,1,0));
  float n001=hash31(i+vec3(0,0,1));
  float n101=hash31(i+vec3(1,0,1));
  float n011=hash31(i+vec3(0,1,1));
  float n111=hash31(i+vec3(1,1,1));
  float x00=mix(n000,n100,f.x),x10=mix(n010,n110,f.x);
  float x01=mix(n001,n101,f.x),x11=mix(n011,n111,f.x);
  return mix(mix(x00,x10,f.y),mix(x01,x11,f.y),f.z);
}
float fbm2(vec2 p){
  float value=0.0,amplitude=0.55;
  mat2 rotation=mat2(0.8,-0.6,0.6,0.8);
  for(int i=0;i<5;i++){
    value+=noise2(p)*amplitude;
    p=rotation*p*2.03+17.17;
    amplitude*=0.5;
  }
  return value;
}
float fbm3(vec3 p){
  float value=0.0,amplitude=0.56;
  for(int i=0;i<4;i++){
    value+=noise3(p)*amplitude;
    p=p*2.03+vec3(13.1,7.7,19.3);
    amplitude*=0.5;
  }
  return value;
}
vec3 toneMap(vec3 value){
  value*=max(0.05,uExposure);
  value=(value*(2.51*value+0.03))/(value*(2.43*value+0.59)+0.14);
  return pow(clamp(value,0.0,1.0),vec3(1.0/2.2));
}

vec3 starLayer(vec2 uv,float scale,float seed){
  vec2 gridScale=vec2(scale,scale*0.5);
  vec2 cell=floor(uv*gridScale);
  vec2 local=fract(uv*gridScale)-0.5;
  float identity=hash21(cell+seed);
  float probability=clamp(uStarDensity*0.018,0.0004,0.06);
  if(identity<1.0-probability)return vec3(0.0);
  float sizeRandom=hash21(cell+seed+17.7);
  float radius=mix(0.018,0.105,pow(sizeRandom,5.0))*mix(uStarSizeMin,uStarSizeMax,sizeRandom);
  float disc=1.0-smoothstep(radius*0.34,radius,length(local));
  float phase=hash21(cell+seed+43.2)*TAU;
  float speed=mix(0.55,2.6,hash21(cell+seed+9.3))*uStarTwinkleSpeed;
  float pulse=0.5+0.5*sin(uTime*speed+phase);
  float twinkle=mix(1.0,mix(0.52,1.42,pulse),uStarTwinkleAmount);
  float temperature=hash21(cell+seed+71.4);
  vec3 warm=vec3(1.0,0.74,0.52),neutral=vec3(0.92,0.96,1.0),cool=vec3(0.58,0.76,1.0);
  vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);
  starColor=mix(vec3(0.86,0.91,1.0),starColor,uStarColorVariation);
  return starColor*disc*twinkle*uStarBrightness*(0.45+sizeRandom*1.8);
}
vec3 milkyWay(vec3 ray,float horizonMask){
  float orientation=radians(uMilkyWayOrientation);
  vec3 galacticNormal=normalize(vec3(0.36*sin(orientation)+0.24,0.82,0.36*cos(orientation)-0.42));
  vec3 tangent=normalize(cross(abs(galacticNormal.y)>.94?vec3(1,0,0):vec3(0,1,0),galacticNormal));
  vec3 bitangent=normalize(cross(galacticNormal,tangent));
  float latitude=dot(ray,galacticNormal);
  float longitude=atan(dot(ray,bitangent),dot(ray,tangent));
  float warp=(fbm2(vec2(longitude*1.35,4.7))-0.5)*uMilkyWayWidth*0.7*uMilkyWayDetail;
  float distanceFromPlane=abs(latitude-warp);
  float core=exp(-pow(distanceFromPlane/max(0.008,uMilkyWayWidth),2.0)*2.2);
  float halo=exp(-pow(distanceFromPlane/max(0.015,uMilkyWayWidth*2.8),2.0)*1.4)*0.32;
  vec2 cloudUv=vec2(longitude*7.0,latitude/max(0.01,uMilkyWayWidth)*2.3);
  float clouds=0.42+0.58*fbm2(cloudUv*mix(0.7,2.2,uMilkyWayDetail/3.0)+uStarSeed*0.001);
  float granular=pow(noise2(cloudUv*11.0+31.0),4.0)*0.42*uMilkyWayDetail;
  float dustNoise=fbm2(vec2(longitude*11.0,latitude/max(0.01,uMilkyWayWidth)*5.0)+19.2);
  float dustLane=exp(-pow((latitude-warp*0.55)/max(0.004,uMilkyWayWidth*0.18),2.0)*2.0)*smoothstep(0.36,0.76,dustNoise)*uMilkyWayDust;
  float luminance=max(0.0,(core+halo)*(clouds+granular)*(1.0-dustLane*0.88));
  vec3 color=mix(uMilkyWayColor,vec3(0.92,0.72,0.55),smoothstep(0.55,1.0,clouds)*0.2);
  return color*luminance*uMilkyWayIntensity*0.72*horizonMask;
}

vec2 celestialUv(vec3 ray,vec3 direction,float angularRadius){
  vec3 reference=abs(direction.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 right=normalize(cross(reference,direction));
  vec3 up=normalize(cross(direction,right));
  float scale=max(0.00005,sin(radians(max(0.02,angularRadius))));
  return vec2(dot(ray,right),dot(ray,up))/scale;
}
vec4 layeredCloud(vec3 ray,float moonGlow,float moonDisc){
  if(uCloudCoverage<=0.001||ray.y<=-0.08)return vec4(0);
  float projection=max(0.1,ray.y+0.22);
  vec2 cloudUv=ray.xz/projection*0.72;
  cloudUv+=uCloudWind*uTime*0.00045;
  cloudUv+=vec2(uCloudSeed*0.00017,uCloudSeed*0.00029);
  float shape=fbm2(cloudUv*1.15);
  float detail=fbm2(cloudUv*3.1+23.4)*0.24;
  float threshold=1.02-uCloudCoverage*0.72;
  float mask=smoothstep(threshold,threshold+0.16,shape+detail)*uCloudDensity;
  mask*=smoothstep(-0.05,0.18,ray.y);
  float cloudLight=0.44+0.56*pow(max(dot(normalize(vec3(ray.x,0.32,ray.z)),uSunDirection),0.0),2.0);
  vec3 dayColor=mix(vec3(0.34,0.38,0.44),vec3(1.0,0.96,0.9),cloudLight);
  vec3 nightColor=mix(vec3(0.035,0.045,0.065),uMoonColor*0.34,moonGlow+moonDisc*0.3);
  vec3 cloudColor=mix(nightColor,dayColor,uDayFactor)*(1.0-uWeatherDarkening*0.72);
  return vec4(cloudColor,mask*0.86);
}
vec4 volumetricCloud(vec3 ray){
  if(uCloudCoverage<=0.001||ray.y<=0.002)return vec4(0);
  float bottom=uCloudAltitude;
  float top=bottom+uCloudThickness;
  float t0=(bottom-uCameraPosition.y)/ray.y;
  float t1=(top-uCameraPosition.y)/ray.y;
  float enter=max(0.0,min(t0,t1));
  float exit=min(80000.0,max(t0,t1));
  if(exit<=enter)return vec4(0);
  int steps=uCloudQuality<1.5?12:(uCloudQuality<2.5?20:32);
  float stepLength=(exit-enter)/float(steps);
  float jitter=hash21(gl_FragCoord.xy+uCloudSeed);
  vec3 wind=vec3(uCloudWind.x,0.0,uCloudWind.y)*uTime*0.42;
  vec3 accumulated=vec3(0);
  float alpha=0.0;
  for(int i=0;i<32;i++){
    if(i>=steps||alpha>.985)break;
    float t=enter+(float(i)+jitter)*stepLength;
    vec3 position=uCameraPosition+ray*t;
    float height01=clamp((position.y-bottom)/max(1.0,uCloudThickness),0.0,1.0);
    float profile=smoothstep(0.0,0.16,height01)*smoothstep(1.0,0.68,height01);
    vec3 samplePosition=position*vec3(0.00042,0.00074,0.00042)+wind*0.00042+uCloudSeed*0.001;
    float base=fbm3(samplePosition);
    float erosion=noise3(samplePosition*3.7+17.0)*0.22;
    float threshold=1.03-uCloudCoverage*0.72;
    float density=smoothstep(threshold,threshold+0.15,base+erosion)*profile*uCloudDensity;
    float sampleAlpha=1.0-exp(-density*stepLength*0.00135);
    float sunFacing=max(dot(normalize(vec3(ray.x,0.28,ray.z)),uSunDirection),0.0);
    float lighting=0.34+0.66*sunFacing;
    vec3 dayColor=mix(vec3(0.28,0.31,0.37),vec3(1.0,0.95,0.86),lighting);
    vec3 nightColor=mix(vec3(0.022,0.03,0.05),uMoonColor*0.28,max(dot(ray,uMoonDirection),0.0));
    vec3 sampleColor=mix(nightColor,dayColor,uDayFactor)*(1.0-uWeatherDarkening*0.78);
    accumulated+=(1.0-alpha)*sampleColor*sampleAlpha;
    alpha+=(1.0-alpha)*sampleAlpha;
  }
  return vec4(accumulated/max(alpha,0.0001),alpha);
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
  float sunThresholdOuter=cos(radians(max(0.03,uSunAngularRadius*1.18)));
  float sunThresholdInner=cos(radians(max(0.02,uSunAngularRadius*0.90)));
  float sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uDayFactor;
  float sunGlow=pow(sunDot,mix(10.0,34.0,clamp(uSunGlow/3.0,0.0,1.0)))*(0.1+uSunGlow*0.18+uTwilightFactor*0.42);
  float eclipseLight=1.0-uSolarEclipse*0.94;
  sky+=uSunColor*(sunGlow*(1.0-uSolarEclipse*0.72)+sunDisc*(3.8+uSunGlow*1.5)*eclipseLight);
  sky+=uSunColor*horizon*uTwilightFactor*0.22;
  float corona=pow(sunDot,420.0)*uSolarEclipse*(1.0-sunDisc)*3.2;
  sky+=vec3(1.0,0.88,0.62)*corona;

  float moonDot=max(dot(ray,uMoonDirection),0.0);
  vec2 moonUv=celestialUv(ray,uMoonDirection,uMoonAngularRadius);
  float moonRadius=length(moonUv);
  float moonDisc=1.0-smoothstep(0.94,1.02,moonRadius);
  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));
  vec3 moonReference=abs(uMoonDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 moonRight=normalize(cross(moonReference,uMoonDirection));
  vec3 moonUp=normalize(cross(uMoonDirection,moonRight));
  vec3 moonSurfaceNormal=normalize(moonRight*moonUv.x+moonUp*moonUv.y-uMoonDirection*moonSphere);
  float directPhase=max(dot(moonSurfaceNormal,uSunDirection),0.0);
  float phaseLighting=max(directPhase,uMoonEarthshine*(1.0-directPhase));
  float crater=(noise2(moonUv*16.0+uCloudSeed)-0.5)*0.20*uMoonDetail+(noise2(moonUv*41.0+17.0)-0.5)*0.08*uMoonDetail;
  vec3 normalMoonSurface=uMoonColor*(0.78+crater);
  vec3 eclipsedMoon=mix(normalMoonSurface,vec3(0.72,0.12,0.045),uLunarEclipse*0.88);
  float eclipseMoonEnergy=mix(1.0,0.24,uLunarEclipse);
  sky*=1.0-moonDisc*uSolarEclipse*0.985;
  sky+=eclipsedMoon*moonDisc*phaseLighting*uMoonVisibility*uMoonBrightness*2.1*eclipseMoonEnergy;
  float moonGlow=pow(moonDot,mix(38.0,110.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*uMoonVisibility*uMoonGlow*0.22;
  sky+=mix(uMoonColor,vec3(0.78,0.18,0.06),uLunarEclipse)*moonGlow;

  if(uPlanetEnabled>.5){
    vec2 planetUv=celestialUv(ray,uPlanetDirection,uPlanetAngularRadius);
    float planetRadius=length(planetUv);
    float planetDisc=1.0-smoothstep(0.94,1.02,planetRadius);
    float bands=0.84+0.16*sin(planetUv.y*18.0+noise2(planetUv*5.0)*2.0);
    sky+=uPlanetColor*planetDisc*bands*uPlanetBrightness*uNightFactor;
    float ringEllipse=length(vec2(planetUv.x,planetUv.y*4.4));
    float ring=(smoothstep(1.75,1.55,ringEllipse)-smoothstep(1.18,1.02,ringEllipse))*uPlanetRings;
    ring*=1.0-smoothstep(0.0,0.22,abs(planetUv.y));
    sky+=uPlanetColor*ring*uPlanetBrightness*0.72*uNightFactor;
  }

  float starHorizon=smoothstep(0.02,0.2,ray.y);
  vec2 starUv=vec2(atan(ray.z,ray.x)/TAU+0.5,asin(clamp(ray.y,-1.0,1.0))/PI+0.5);
  vec3 stars=starLayer(starUv,420.0,uStarSeed)+starLayer(starUv,760.0,uStarSeed+101.0)+starLayer(starUv,1180.0,uStarSeed+271.0);
  sky+=stars*uStarVisibility*starHorizon;
  sky+=milkyWay(ray,starHorizon);

  vec4 cloud=uCloudQuality<0.5?layeredCloud(ray,moonGlow,moonDisc):volumetricCloud(ray);
  sky=mix(sky,cloud.rgb,clamp(cloud.a,0.0,0.96));
  sky*=1.0-uWeatherDarkening*0.42;
  outColor=vec4(max(sky,vec3(0.0001)),1.0);
}`;

export class SkyPass {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, skyVS, skyFS);
    this.vao = gl.createVertexArray();
    this.locations = {};
    for (const name of [
      'uForward','uRight','uUp','uCameraPosition','uTanHalfFov','uAspect','uSunDirection','uMoonDirection','uSunColor','uMoonColor',
      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility','uStarDensity','uStarBrightness','uStarTwinkleAmount','uStarTwinkleSpeed','uStarSizeMin','uStarSizeMax','uStarColorVariation','uStarSeed',
      'uMilkyWayIntensity','uMilkyWayWidth','uMilkyWayDetail','uMilkyWayOrientation','uMilkyWayDust','uMilkyWayColor','uSunAngularRadius','uSunGlow','uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail','uMoonVisibility','uMoonEarthshine','uLunarEclipse','uSolarEclipse',
      'uPlanetEnabled','uPlanetDirection','uPlanetColor','uPlanetAngularRadius','uPlanetBrightness','uPlanetRings',
      'uCloudCoverage','uCloudDensity','uCloudWind','uCloudSeed','uCloudQuality','uCloudAltitude','uCloudThickness','uTime','uExposure','uWeatherDarkening'
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
    const cloudQuality = ({ compatibility: 0, layered: 0, balanced: 1, quality: 2, reference: 3 })[String(environment.cloudQuality)] ?? 0;
    gl.uniform3fv(u.uForward, forward);
    gl.uniform3fv(u.uRight, right);
    gl.uniform3fv(u.uUp, up);
    gl.uniform3fv(u.uCameraPosition, camera.position || [0, 0, 0]);
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
    gl.uniform1f(u.uStarBrightness, environment.starBrightness);
    gl.uniform1f(u.uStarTwinkleAmount, environment.starTwinkleAmount);
    gl.uniform1f(u.uStarTwinkleSpeed, environment.starTwinkleSpeed);
    gl.uniform1f(u.uStarSizeMin, environment.starSizeMin);
    gl.uniform1f(u.uStarSizeMax, environment.starSizeMax);
    gl.uniform1f(u.uStarColorVariation, environment.starColorVariation);
    gl.uniform1f(u.uStarSeed, environment.starSeed);
    gl.uniform1f(u.uMilkyWayIntensity, environment.milkyWayIntensity);
    gl.uniform1f(u.uMilkyWayWidth, environment.milkyWayWidth);
    gl.uniform1f(u.uMilkyWayDetail, environment.milkyWayDetail);
    gl.uniform1f(u.uMilkyWayOrientation, environment.milkyWayOrientation);
    gl.uniform1f(u.uMilkyWayDust, environment.milkyWayDust);
    gl.uniform3fv(u.uMilkyWayColor, environment.milkyWayColor);
    gl.uniform1f(u.uSunAngularRadius, environment.sunAngularRadius);
    gl.uniform1f(u.uSunGlow, environment.sunGlow);
    gl.uniform1f(u.uMoonAngularRadius, environment.moonAngularRadius);
    gl.uniform1f(u.uMoonGlow, environment.moonGlow);
    gl.uniform1f(u.uMoonPhase, environment.moonPhase);
    gl.uniform1f(u.uMoonBrightness, environment.moonBrightness);
    gl.uniform1f(u.uMoonDetail, environment.moonDetail);
    gl.uniform1f(u.uMoonVisibility, environment.moonVisibility);
    gl.uniform1f(u.uMoonEarthshine, environment.moonEarthshine);
    gl.uniform1f(u.uLunarEclipse, environment.lunarEclipseFactor);
    gl.uniform1f(u.uSolarEclipse, environment.solarEclipseFactor);
    gl.uniform1f(u.uPlanetEnabled, environment.planetEnabled ? 1 : 0);
    gl.uniform3fv(u.uPlanetDirection, environment.planetDirection);
    gl.uniform3fv(u.uPlanetColor, environment.planetColor);
    gl.uniform1f(u.uPlanetAngularRadius, environment.planetAngularRadius);
    gl.uniform1f(u.uPlanetBrightness, environment.planetBrightness);
    gl.uniform1f(u.uPlanetRings, environment.planetRings);
    gl.uniform1f(u.uCloudCoverage, environment.cloudCoverage);
    gl.uniform1f(u.uCloudDensity, environment.cloudDensity);
    gl.uniform2fv(u.uCloudWind, environment.cloudWindDirection);
    gl.uniform1f(u.uCloudSeed, environment.cloudSeed);
    gl.uniform1f(u.uCloudQuality, cloudQuality);
    gl.uniform1f(u.uCloudAltitude, environment.cloudAltitude);
    gl.uniform1f(u.uCloudThickness, environment.cloudThickness);
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
