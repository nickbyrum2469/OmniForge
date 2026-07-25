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
uniform float uStarSizeMin;
uniform float uStarSizeMax;
uniform float uStarBrightnessVariation;
uniform float uStarColorVariation;
uniform float uStarTwinkleAmount;
uniform float uStarTwinkleSpeed;
uniform float uStarSeed;
uniform float uStarRotation;
uniform float uStarHorizonFade;
uniform vec3 uStarWarmColor;
uniform vec3 uStarCoolColor;
uniform float uMilkyWayIntensity;
uniform float uMilkyWayWidth;
uniform float uMilkyWayDetail;
uniform float uMilkyWayDust;
uniform float uMilkyWayCore;
uniform vec3 uMilkyWayNormal;
uniform vec3 uMilkyWayAxis;
uniform vec3 uMilkyWayColor;
uniform vec3 uMilkyWayCoreColor;
uniform float uAuroraIntensity;
uniform vec3 uAuroraColor;
uniform vec3 uAuroraSecondaryColor;
uniform float uAuroraSpeed;
uniform float uAuroraScale;
uniform float uSunAngularRadius;
uniform float uSunGlow;
uniform float uMoonAngularRadius;
uniform float uMoonGlow;
uniform float uMoonPhase;
uniform float uMoonBrightness;
uniform float uMoonDetail;
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
uniform float uCloudTime;
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
vec3 rotateAroundY(vec3 value,float angle){
  float c=cos(angle),s=sin(angle);
  return vec3(value.x*c-value.z*s,value.y,value.x*s+value.z*c);
}
vec2 octEncode(vec3 direction){
  vec3 p=direction.xzy/max(0.0001,abs(direction.x)+abs(direction.y)+abs(direction.z));
  vec2 encoded=p.xy;
  if(p.z<0.0)encoded=(1.0-abs(encoded.yx))*sign(encoded.xy+vec2(0.00001));
  return encoded*0.5+0.5;
}
vec3 starLayer(vec3 ray,float grid,float probability,float seedOffset){
  vec2 coordinates=octEncode(ray)*grid;
  vec2 cell=floor(coordinates);
  vec2 local=fract(coordinates);
  vec2 seedVector=vec2(uStarSeed*0.013+seedOffset,uStarSeed*0.021-seedOffset*0.37);
  float seed=hash21(cell+seedVector);
  float present=step(1.0-probability,seed);
  vec2 offset=vec2(hash21(cell+seedVector+17.13),hash21(cell+seedVector+53.71));
  offset=0.20+offset*0.60;
  float sizeRandom=pow(hash21(cell+seedVector+91.37),2.2);
  float size=mix(uStarSizeMin,uStarSizeMax,sizeRandom);
  float radius=mix(0.025,0.19,clamp(size/8.0,0.0,1.0));
  float distanceToStar=length(local-offset);
  float core=1.0-smoothstep(radius*0.12,radius,distanceToStar);
  float halo=(1.0-smoothstep(radius,radius*3.2,distanceToStar))*0.18;
  float brightnessRandom=hash21(cell+seedVector+123.4);
  float brightness=mix(1.0-uStarBrightnessVariation*0.62,1.0+uStarBrightnessVariation*1.45,brightnessRandom);
  float frequency=0.62+hash21(cell+seedVector+151.9)*2.4;
  float pulse=0.5+0.5*sin(uTime*uStarTwinkleSpeed*frequency+seed*TAU);
  float twinkle=mix(1.0,0.56+pulse*0.88,uStarTwinkleAmount);
  float temperature=hash21(cell+seedVector+199.2);
  vec3 temperatureColor=mix(uStarWarmColor,uStarCoolColor,temperature);
  vec3 starColor=mix(vec3(1.0),temperatureColor,uStarColorVariation);
  return starColor*(core+halo)*present*brightness*twinkle;
}
vec3 stellarField(vec3 ray){
  vec3 rotated=rotateAroundY(ray,radians(uStarRotation));
  float density01=clamp((uStarDensity-0.08)/1.92,0.0,1.0);
  float grid=mix(170.0,520.0,density01);
  vec3 primary=starLayer(rotated,grid,mix(0.004,0.045,density01),0.0);
  vec3 secondary=starLayer(rotated,grid*0.47,mix(0.003,0.022,density01),37.4)*0.72;
  return primary+secondary;
}
vec3 milkyWayField(vec3 ray){
  if(uMilkyWayIntensity<=0.001)return vec3(0.0);
  vec3 normal=normalize(uMilkyWayNormal);
  vec3 axis=normalize(uMilkyWayAxis-normal*dot(uMilkyWayAxis,normal));
  vec3 side=normalize(cross(normal,axis));
  float latitude=dot(ray,normal);
  float longitude=atan(dot(ray,side),dot(ray,axis));
  float width=max(0.006,sin(radians(uMilkyWayWidth)));
  float envelope=exp(-pow(abs(latitude)/width,1.58));
  float detail=max(0.2,uMilkyWayDetail);
  vec2 galacticUv=vec2(longitude/PI,latitude/width);
  float macro=fbm2(galacticUv*vec2(2.7,1.25)*detail+vec2(uStarSeed*0.0007,9.2));
  float filament=fbm2(galacticUv*vec2(8.4,3.2)*detail+vec2(31.4,uStarSeed*0.0011));
  float coreShape=exp(-pow(abs(longitude)/0.72,2.0))*uMilkyWayCore;
  float density=envelope*(0.17+macro*0.58+filament*0.25)*(0.68+coreShape*0.72);
  float dustNoise=fbm2(galacticUv*vec2(5.5,8.0)*detail+71.0);
  float dustLane=exp(-pow(latitude/max(0.001,width*0.19),2.0))*smoothstep(0.34,0.78,dustNoise)*uMilkyWayDust;
  float stellarKnots=pow(max(0.0,filament-0.56),2.0)*envelope;
  vec3 galacticColor=mix(uMilkyWayColor,uMilkyWayCoreColor,clamp(coreShape+stellarKnots*0.7,0.0,1.0));
  return galacticColor*density*(1.0-dustLane*0.84)*(1.0+stellarKnots*0.65)*uMilkyWayIntensity;
}
vec3 auroraField(vec3 ray){
  if(uAuroraIntensity<=0.001||ray.y<=0.0)return vec3(0.0);
  float azimuth=atan(ray.z,ray.x)/TAU+0.5;
  float scale=max(0.2,uAuroraScale);
  float flow=fbm2(vec2(azimuth*8.0*scale+uTime*uAuroraSpeed*0.025,ray.y*5.2));
  float ribbons=pow(0.5+0.5*sin((azimuth*13.0*scale+flow*1.9+uTime*uAuroraSpeed*0.012)*TAU),7.0);
  float wisps=smoothstep(0.46,0.82,fbm2(vec2(azimuth*19.0*scale-uTime*uAuroraSpeed*0.018,ray.y*8.0+flow)));
  float vertical=smoothstep(0.015,0.12,ray.y)*(1.0-smoothstep(0.56,0.92,ray.y));
  float curtain=vertical*(ribbons*0.72+wisps*0.38)*uAuroraIntensity;
  vec3 color=mix(uAuroraColor,uAuroraSecondaryColor,clamp(ray.y*1.5+flow*0.28,0.0,1.0));
  return color*curtain;
}
vec3 toneMap(vec3 value){
  value*=max(0.05,uExposure);
  value=(value*(2.51*value+0.03))/(value*(2.43*value+0.59)+0.14);
  return pow(clamp(value,0.0,1.0),vec3(1.0/2.2));
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
  cloudUv+=uCloudWind*uCloudTime*0.00045;
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
  vec3 wind=vec3(uCloudWind.x,0.0,uCloudWind.y)*uCloudTime*0.42;
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
  sky+=uSunColor*(sunGlow+sunDisc*(3.8+uSunGlow*1.5));
  sky+=uSunColor*horizon*uTwilightFactor*0.22;

  float moonDot=max(dot(ray,uMoonDirection),0.0);
  vec2 moonUv=celestialUv(ray,uMoonDirection,uMoonAngularRadius);
  float moonRadius=length(moonUv);
  float moonDisc=1.0-smoothstep(0.94,1.02,moonRadius);
  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));
  float phaseAngle=uMoonPhase*TAU;
  float phaseLighting=smoothstep(-0.035,0.035,moonUv.x*sin(phaseAngle)-moonSphere*cos(phaseAngle));
  float crater=(noise2(moonUv*16.0+uCloudSeed)-0.5)*0.20*uMoonDetail+(noise2(moonUv*41.0+17.0)-0.5)*0.08*uMoonDetail;
  vec3 moonSurface=uMoonColor*(0.78+crater);
  sky+=moonSurface*moonDisc*phaseLighting*uNightFactor*uMoonBrightness*2.1;
  float moonGlow=pow(moonDot,mix(38.0,110.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*uNightFactor*uMoonGlow*0.22;
  sky+=uMoonColor*moonGlow;

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

  float starHorizon=smoothstep(max(0.0,uStarHorizonFade*0.22),max(0.02,uStarHorizonFade),ray.y);
  sky+=stellarField(ray)*uStarVisibility*starHorizon;
  sky+=milkyWayField(ray)*uNightFactor*starHorizon;
  sky+=auroraField(ray)*uNightFactor;

  vec4 cloud=uCloudQuality<0.5?layeredCloud(ray,moonGlow,moonDisc):volumetricCloud(ray);
  sky=mix(sky,cloud.rgb,clamp(cloud.a,0.0,0.96));
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
      'uForward','uRight','uUp','uCameraPosition','uTanHalfFov','uAspect','uSunDirection','uMoonDirection','uSunColor','uMoonColor',
      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility','uStarDensity',
      'uStarSizeMin','uStarSizeMax','uStarBrightnessVariation','uStarColorVariation','uStarTwinkleAmount','uStarTwinkleSpeed','uStarSeed','uStarRotation','uStarHorizonFade','uStarWarmColor','uStarCoolColor',
      'uMilkyWayIntensity','uMilkyWayWidth','uMilkyWayDetail','uMilkyWayDust','uMilkyWayCore','uMilkyWayNormal','uMilkyWayAxis','uMilkyWayColor','uMilkyWayCoreColor',
      'uAuroraIntensity','uAuroraColor','uAuroraSecondaryColor','uAuroraSpeed','uAuroraScale','uSunAngularRadius','uSunGlow','uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail',
      'uPlanetEnabled','uPlanetDirection','uPlanetColor','uPlanetAngularRadius','uPlanetBrightness','uPlanetRings',
      'uCloudCoverage','uCloudDensity','uCloudWind','uCloudSeed','uCloudQuality','uCloudAltitude','uCloudThickness','uTime','uCloudTime','uExposure','uWeatherDarkening'
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
    gl.uniform1f(u.uStarSizeMin, environment.starSizeMin);
    gl.uniform1f(u.uStarSizeMax, environment.starSizeMax);
    gl.uniform1f(u.uStarBrightnessVariation, environment.starBrightnessVariation);
    gl.uniform1f(u.uStarColorVariation, environment.starColorVariation);
    gl.uniform1f(u.uStarTwinkleAmount, environment.starTwinkleAmount);
    gl.uniform1f(u.uStarTwinkleSpeed, environment.starTwinkleSpeed);
    gl.uniform1f(u.uStarSeed, environment.starSeed);
    gl.uniform1f(u.uStarRotation, environment.starRotation);
    gl.uniform1f(u.uStarHorizonFade, environment.starHorizonFade);
    gl.uniform3fv(u.uStarWarmColor, environment.starWarmColor);
    gl.uniform3fv(u.uStarCoolColor, environment.starCoolColor);
    gl.uniform1f(u.uMilkyWayIntensity, environment.milkyWayIntensity);
    gl.uniform1f(u.uMilkyWayWidth, environment.milkyWayWidth);
    gl.uniform1f(u.uMilkyWayDetail, environment.milkyWayDetail);
    gl.uniform1f(u.uMilkyWayDust, environment.milkyWayDust);
    gl.uniform1f(u.uMilkyWayCore, environment.milkyWayCore);
    gl.uniform3fv(u.uMilkyWayNormal, environment.milkyWayNormal);
    gl.uniform3fv(u.uMilkyWayAxis, environment.milkyWayAxis);
    gl.uniform3fv(u.uMilkyWayColor, environment.milkyWayColor);
    gl.uniform3fv(u.uMilkyWayCoreColor, environment.milkyWayCoreColor);
    gl.uniform1f(u.uAuroraIntensity, environment.auroraIntensity);
    gl.uniform3fv(u.uAuroraColor, environment.auroraColor);
    gl.uniform3fv(u.uAuroraSecondaryColor, environment.auroraSecondaryColor);
    gl.uniform1f(u.uAuroraSpeed, environment.auroraSpeed);
    gl.uniform1f(u.uAuroraScale, environment.auroraScale);
    gl.uniform1f(u.uSunAngularRadius, environment.sunAngularRadius);
    gl.uniform1f(u.uSunGlow, environment.sunGlow);
    gl.uniform1f(u.uMoonAngularRadius, environment.moonAngularRadius);
    gl.uniform1f(u.uMoonGlow, environment.moonGlow);
    gl.uniform1f(u.uMoonPhase, environment.moonPhase);
    gl.uniform1f(u.uMoonBrightness, environment.moonBrightness);
    gl.uniform1f(u.uMoonDetail, environment.moonDetail);
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
    gl.uniform1f(u.uTime, environment.timeSeconds);
    gl.uniform1f(u.uCloudTime, environment.timeSeconds * Math.max(0.05, environment.cloudWindSpeed / 12));
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
