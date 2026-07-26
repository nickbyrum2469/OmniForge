import { DEG } from './math.js';
import { cameraSkyBasis } from './environment-runtime.js';
import { SRGB_GLSL } from './color-management.js';

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
uniform float uRayleigh;
uniform float uMie;
uniform float uMieAnisotropy;
uniform float uOzone;
uniform float uDust;
uniform float uAerialPerspective;
uniform float uHaze;
uniform float uHumidity;
uniform float uWeatherFog;
uniform float uDayFogMultiplier;
uniform float uNightFogMultiplier;
uniform float uStarVisibility;
uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uStarTwinkleAmount;
uniform float uStarTwinkleSpeed;
uniform float uStarSizeMin;
uniform float uStarSizeMax;
uniform float uStarColorVariation;
uniform float uStarRayStrength;
uniform float uStarRayLength;
uniform float uStarHeroFraction;
uniform float uStarSeed;
uniform float uMilkyWayIntensity;
uniform float uMilkyWayWidth;
uniform float uMilkyWayDetail;
uniform float uMilkyWayOrientation;
uniform float uMilkyWayDust;
uniform float uMilkyWayWarp;
uniform float uMilkyWayClumping;
uniform float uMilkyWayCoreStrength;
uniform float uMilkyWayWidthVariation;
uniform vec3 uMilkyWayColor;
uniform float uSunAngularRadius;
uniform float uSunGlow;
uniform float uSolarEclipseCoverage;
uniform float uMoonAngularRadius;
uniform float uMoonGlow;
uniform float uMoonPhase;
uniform float uMoonBrightness;
uniform float uMoonDetail;
uniform float uMoonVisibility;
uniform float uMoonEarthshine;
uniform float uMoonCraterStrength;
uniform float uMoonMariaStrength;
uniform float uMoonSurfaceContrast;
uniform float uMoonPatternRotation;
uniform float uMoonPatternSeed;
uniform float uMoonReliefStrength;
uniform float uMoonLimbDarkening;
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

${SRGB_GLSL}
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
  float n000=hash31(i),n100=hash31(i+vec3(1,0,0)),n010=hash31(i+vec3(0,1,0)),n110=hash31(i+vec3(1,1,0));
  float n001=hash31(i+vec3(0,0,1)),n101=hash31(i+vec3(1,0,1)),n011=hash31(i+vec3(0,1,1)),n111=hash31(i+vec3(1,1,1));
  float x00=mix(n000,n100,f.x),x10=mix(n010,n110,f.x),x01=mix(n001,n101,f.x),x11=mix(n011,n111,f.x);
  return mix(mix(x00,x10,f.y),mix(x01,x11,f.y),f.z);
}
float fbm2(vec2 p){
  float value=0.0,amplitude=0.55;
  mat2 rotation=mat2(0.8,-0.6,0.6,0.8);
  for(int i=0;i<5;i++){value+=noise2(p)*amplitude;p=rotation*p*2.03+17.17;amplitude*=0.5;}
  return value;
}
float fbm3(vec3 p){
  float value=0.0,amplitude=0.56;
  for(int i=0;i<5;i++){value+=noise3(p)*amplitude;p=p*2.03+vec3(13.1,7.7,19.3);amplitude*=0.5;}
  return value;
}

vec2 hemisphereOctEncode(vec3 direction){
  vec3 ray=normalize(direction);
  float denominator=max(0.00001,abs(ray.x)+abs(ray.y)+abs(ray.z));
  return ray.xz/denominator*0.5+0.5;
}

vec3 hemisphereOctDecode(vec2 uv){
  vec2 p=uv*2.0-1.0;
  float y=1.0-abs(p.x)-abs(p.y);
  if(y<=0.0)return vec3(0.0,-1.0,0.0);
  return normalize(vec3(p.x,y,p.y));
}

vec3 starLayer(vec3 ray,float scale,float seed){
  vec2 uv=hemisphereOctEncode(ray);
  vec2 baseCell=floor(uv*scale);
  vec3 accumulated=vec3(0.0);
  float probability=clamp(uStarDensity*0.13,0.003,0.25);
  for(int oy=-1;oy<=1;oy++)for(int ox=-1;ox<=1;ox++){
    vec2 cell=baseCell+vec2(float(ox),float(oy));
    float identity=hash21(cell+seed*0.017);
    if(identity>probability)continue;
    vec2 offset=vec2(hash21(cell+seed+17.7),hash21(cell+seed+91.2));
    vec2 candidateUv=(cell+mix(vec2(0.18),vec2(0.82),offset))/scale;
    if(any(lessThan(candidateUv,vec2(0.0)))||any(greaterThan(candidateUv,vec2(1.0))))continue;
    vec3 starDirection=hemisphereOctDecode(candidateUv);
    if(starDirection.y<=0.0)continue;
    float cosine=clamp(dot(ray,starDirection),-1.0,1.0);
    float angularDistance=sqrt(max(0.0,2.0*(1.0-cosine)));
    float sizeRandom=hash21(cell+seed+33.4);
    float hero=step(1.0-uStarHeroFraction,hash21(cell+seed+8.8));
    float sizeControl=mix(max(0.08,uStarSizeMin),max(uStarSizeMin,uStarSizeMax),pow(sizeRandom,2.8));
    float aa=max(fwidth(angularDistance),0.000035);
    float radius=max(aa*1.45,mix(0.00052,0.00172,pow(sizeRandom,2.3))*max(0.32,sizeControl)*(1.0+hero*0.66));
    float sigma=max(aa*1.05,radius*0.58);
    float psf=exp(-0.5*pow(angularDistance/sigma,2.0));
    psf*=1.0-smoothstep(radius*2.2,radius*3.15,angularDistance);
    float core=1.0-smoothstep(max(0.0,radius-aa),radius+aa,angularDistance);
    float disc=max(core,psf*0.88);
    vec3 reference=abs(starDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
    vec3 right=normalize(cross(reference,starDirection));
    vec3 up=normalize(cross(starDirection,right));
    vec2 local=vec2(dot(ray,right),dot(ray,up));
    float rayLength=radius*mix(2.0,4.2,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));
    float thin=max(radius*0.095,aa*0.42);
    float horizontal=exp(-abs(local.y)/thin)*exp(-abs(local.x)/max(rayLength,0.0001));
    float vertical=exp(-abs(local.x)/thin)*exp(-abs(local.y)/max(rayLength,0.0001));
    float diagonal=exp(-abs(local.x+local.y)/(thin*1.5))*exp(-abs(local.x-local.y)/max(rayLength*0.65,0.0001));
    float rays=(horizontal+vertical+diagonal*0.1)*hero*uStarRayStrength*0.018;
    float phase=hash21(cell+seed+43.2)*TAU;
    float speed=mix(0.35,2.1,hash21(cell+seed+9.3))*uStarTwinkleSpeed;
    float pulse=0.5+0.5*sin(uTime*speed+phase);
    float shimmer=0.5+0.5*sin(uTime*speed*1.73+phase*1.41);
    float horizonTwinkle=1.0-smoothstep(0.04,0.68,starDirection.y);
    float twinkleAmount=uStarTwinkleAmount*mix(0.24,1.0,horizonTwinkle)*mix(0.42,1.0,sizeRandom);
    float twinkle=mix(1.0,mix(0.78,1.19,pulse)*mix(0.96,1.04,shimmer),twinkleAmount);
    float temperature=hash21(cell+seed+71.4);
    vec3 warm=vec3(1.0,0.83,0.67),neutral=vec3(0.94,0.97,1.0),cool=vec3(0.72,0.84,1.0);
    vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);
    starColor=mix(vec3(0.92,0.95,1.0),starColor,uStarColorVariation);
    float energy=(0.18+pow(sizeRandom,2.2)*1.18+hero*1.12)*uStarBrightness*twinkle;
    accumulated+=starColor*(disc+rays)*energy;
  }
  return accumulated;
}

float wrappedDistance(float a,float b){return abs(atan(sin(a-b),cos(a-b)));}

vec3 milkyWay(vec3 ray,float horizonMask){
  float orientation=radians(uMilkyWayOrientation);
  vec3 galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78));
  vec3 reference=abs(galacticNormal.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 tangent=normalize(cross(reference,galacticNormal));
  vec3 bitangent=normalize(cross(galacticNormal,tangent));
  float latitude=dot(ray,galacticNormal);
  float longitude=atan(dot(ray,bitangent),dot(ray,tangent));
  vec3 periodic=vec3(cos(longitude),sin(longitude),latitude);
  float coarse=fbm3(periodic*vec3(1.35,1.35,3.0)+vec3(3.7,11.2,5.4)+uStarSeed*0.00031);
  float medium=fbm3(periodic*vec3(3.4,3.4,7.6)+vec3(17.4,2.8,23.1)+uStarSeed*0.00057);
  float fine=fbm3(periodic*vec3(8.2,8.2,15.0)+vec3(31.3,8.1,4.6)+uStarSeed*0.00093);
  float warp=(coarse-0.5)*uMilkyWayWidth*uMilkyWayWarp*0.74;
  warp+=sin(longitude*2.0+medium*2.2)*uMilkyWayWidth*uMilkyWayWarp*0.15;
  float widthVariation=mix(0.62,1.46,coarse);
  widthVariation*=1.0+sin(longitude*3.0+medium*1.7)*uMilkyWayWidthVariation*0.18;
  float localWidth=max(0.008,uMilkyWayWidth*max(0.34,widthVariation));
  float signedDistance=latitude-warp;
  float narrowBand=exp(-pow(abs(signedDistance)/localWidth,2.0)*1.9);
  float broadBand=exp(-pow(abs(signedDistance)/max(0.018,localWidth*2.45),2.0)*1.28);
  float outerHalo=exp(-pow(abs(signedDistance)/max(0.025,localWidth*4.6),2.0)*1.2);
  float galacticCore=exp(-pow(wrappedDistance(longitude,1.5708)/0.48,2.0))*uMilkyWayCoreStrength;
  float coreBulge=exp(-pow(abs(signedDistance)/max(0.025,localWidth*2.15),2.0))*galacticCore;
  float longitudinalBreakup=mix(0.44,smoothstep(0.24,0.76,coarse*0.52+medium*0.48),clamp(uMilkyWayClumping,0.0,1.0));
  float cloudContrast=smoothstep(0.3,0.78,coarse*0.36+medium*0.48+fine*0.16);
  float cloudMasses=(0.16+cloudContrast*0.84)*longitudinalBreakup;
  float filamentA=exp(-pow(abs(signedDistance-localWidth*(0.52+medium*0.2))/max(0.004,localWidth*0.18),2.0)*1.8);
  float filamentB=exp(-pow(abs(signedDistance+localWidth*(0.68+coarse*0.18))/max(0.004,localWidth*0.2),2.0)*1.9);
  float stellarKnots=pow(smoothstep(0.48,0.88,fine),2.0)*narrowBand*uMilkyWayDetail;
  float micro=pow(smoothstep(0.52,0.9,noise3(periodic*vec3(25.0,25.0,46.0)+uStarSeed*0.0017)),2.8)*narrowBand*uMilkyWayDetail;
  float granularStars=pow(smoothstep(0.72,0.98,noise3(periodic*vec3(82.0,82.0,128.0)+uStarSeed*0.0031)),5.0);
  granularStars*=narrowBand*uMilkyWayDetail*(0.24+galacticCore*0.52);
  float dustBreakup=smoothstep(0.34,0.7,noise3(periodic*vec3(5.7,5.7,14.0)+vec3(9.0,17.0,4.0)));
  float centralOffset=localWidth*(0.32*sin(longitude*3.1+coarse*5.0)+(medium-0.5)*0.55);
  float centralWidth=localWidth*mix(0.045,0.12,dustBreakup);
  float centralDust=exp(-pow(abs(signedDistance-centralOffset)/max(0.0028,centralWidth),2.0)*1.7);
  float centralPresence=smoothstep(0.4,0.66,dustBreakup)*mix(0.28,1.0,smoothstep(0.36,0.7,coarse));
  centralDust*=centralPresence*uMilkyWayDust;
  float branchOffset=localWidth*(0.24+0.16*sin(longitude*2.4+medium*4.0));
  float branchA=exp(-pow(abs(signedDistance-branchOffset)/max(0.0035,localWidth*0.085),2.0)*1.65);
  float branchB=exp(-pow(abs(signedDistance+branchOffset*0.82)/max(0.0035,localWidth*0.1),2.0)*1.7);
  float branchMask=smoothstep(0.44,0.82,coarse*0.36+fine*0.64);
  float branchingDust=(branchA+branchB*0.72)*branchMask*uMilkyWayDust;
  float darkPockets=smoothstep(0.58,0.82,(1.0-medium)*0.58+fine*0.42)*narrowBand*uMilkyWayDust;
  float cloudLight=narrowBand*(0.045+cloudMasses*1.05)+broadBand*cloudMasses*0.075+outerHalo*0.01;
  cloudLight+=coreBulge*(0.12+cloudContrast*0.98)+filamentA*0.052+filamentB*0.04+stellarKnots*0.18+micro*0.06+granularStars*0.46;
  float dustTransmission=clamp(1.0-centralDust*0.94-branchingDust*0.62-darkPockets*0.58,0.018,1.0);
  float luminance=max(0.0,cloudLight*dustTransmission+coreBulge*0.08+granularStars*0.2);
  vec3 coolCloud=srgbToLinear(uMilkyWayColor);
  vec3 warmCore=vec3(1.0,0.56,0.28);
  vec3 color=mix(coolCloud,warmCore,clamp(coreBulge*0.68,0.0,0.72));
  color=mix(color,vec3(0.34,0.2,0.58),clamp((1.0-galacticCore)*uMilkyWayWarp*0.08,0.0,0.18));
  return color*luminance*uMilkyWayIntensity*1.34*horizonMask;
}

vec2 celestialUv(vec3 ray,vec3 direction,float angularRadius){
  vec3 reference=abs(direction.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 right=normalize(cross(reference,direction));
  vec3 up=normalize(cross(direction,right));
  float scale=max(0.00005,sin(radians(max(0.02,angularRadius))));
  return vec2(dot(ray,right),dot(ray,up))/scale;
}

vec2 craterField(vec2 uv,float scale,float seed){
  vec2 g=uv*scale;
  vec2 cell=floor(g);
  vec2 local=fract(g)-0.5;
  float albedo=0.0;
  float height=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 neighbor=vec2(float(x),float(y));
    vec2 id=cell+neighbor;
    vec2 center=neighbor+vec2(hash21(id+seed),hash21(id+seed+41.7))-0.5;
    float radius=mix(0.11,0.34,hash21(id+seed+17.3));
    vec2 delta=local-center;
    float d=length(delta);
    float age=mix(0.55,1.0,hash21(id+seed+73.1));
    float bowl=(1.0-smoothstep(radius*0.08,radius,d))*age;
    float rim=exp(-pow((d-radius)/max(0.018,radius*0.19),2.0))*age;
    float ejecta=(1.0-smoothstep(radius*0.92,radius*2.35,d));
    ejecta*=pow(0.5+0.5*cos(atan(delta.y,delta.x)*mix(4.0,8.0,floor(hash21(id+seed+29.0)*3.0))),3.0);
    float peak=(1.0-smoothstep(0.0,radius*0.18,d))*step(0.78,hash21(id+seed+119.0));
    albedo+=rim*0.024-bowl*0.082+ejecta*0.009;
    height+=rim*0.09-bowl*0.22+peak*0.045;
  }
  return vec2(clamp(albedo,-0.28,0.16),clamp(height,-0.48,0.24));
}

float lunarEllipse(vec2 uv,vec2 center,vec2 axes,float angle){
  float c=cos(angle),s=sin(angle);
  mat2 rotation=mat2(c,-s,s,c);
  float distanceToBasin=length((rotation*(uv-center))/axes);
  return 1.0-smoothstep(0.76,1.08,distanceToBasin);
}

vec3 lunarSurface(vec2 moonUv,vec3 surfaceNormal,float phaseLighting){
  float rotation=radians(uMoonPatternRotation);
  mat2 r=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation));
  vec2 rotated=r*moonUv;
  vec3 rotatedNormal=normalize(vec3(r*surfaceNormal.xy,surfaceNormal.z));
  float low=fbm3(rotatedNormal*2.15+uMoonPatternSeed*0.0009);
  float mid=fbm3(rotatedNormal*5.7+vec3(8.1,2.7,19.4)+uMoonPatternSeed*0.0017);
  vec2 mareWarp=vec2(
    fbm3(rotatedNormal*4.2+vec3(2.4,8.1,17.7)),
    fbm3(rotatedNormal*4.7+vec3(19.2,3.7,5.8))
  )-0.5;
  vec2 mareUv=rotated+mareWarp*0.16*(1.0-smoothstep(0.7,1.0,length(rotated)));
  float mareRegions=0.0;
  mareRegions=max(mareRegions,lunarEllipse(mareUv,vec2(-0.13,0.21),vec2(0.48,0.23),-0.2));
  mareRegions=max(mareRegions,lunarEllipse(mareUv,vec2(0.23,0.07),vec2(0.22,0.36),-0.48)*0.86);
  mareRegions=max(mareRegions,lunarEllipse(mareUv,vec2(-0.09,-0.15),vec2(0.33,0.18),0.28)*0.76);
  float mareBreakup=smoothstep(0.31,0.71,mid*0.68+low*0.32);
  float maria=smoothstep(0.56,0.75,low*0.72+mid*0.28)*0.38;
  maria=max(maria,mareRegions*mix(0.36,0.78,mareBreakup));
  maria*=smoothstep(1.0,0.72,length(rotated));
  maria=clamp(maria,0.0,1.0)*uMoonMariaStrength;
  vec2 craters=(craterField(rotated,5.5,uMoonPatternSeed)+craterField(rotated,13.0,uMoonPatternSeed+91.0)*0.48+craterField(rotated,31.0,uMoonPatternSeed+211.0)*0.18)*uMoonCraterStrength;
  float grain=(fbm3(rotatedNormal*22.0+31.0)-0.5)*0.12*uMoonDetail;
  float relief=craters.y*uMoonReliefStrength;
  vec3 bright=srgbToLinear(uMoonColor)*mix(0.78,1.1,phaseLighting);
  vec3 dark=bright*vec3(0.52,0.55,0.61);
  vec3 surface=mix(bright,dark,clamp(maria,0.0,0.86));
  surface*=1.0+grain+craters.x+relief;
  surface=pow(max(surface,vec3(0.001)),vec3(max(0.2,uMoonSurfaceContrast)));
  return surface;
}

vec4 layeredCloud(vec3 ray,float moonGlow,float moonDisc){
  if(uCloudCoverage<=0.001||ray.y<=-0.08)return vec4(0);
  float projection=max(0.1,ray.y+0.22);
  vec2 cloudUv=ray.xz/projection*0.72+uCloudWind*uTime*0.00045+vec2(uCloudSeed*0.00017,uCloudSeed*0.00029);
  float broad=fbm2(cloudUv*0.52+vec2(7.1,19.3));
  float shape=fbm2(cloudUv*1.15),detail=fbm2(cloudUv*3.1+23.4)*0.24;
  float wisps=fbm2(cloudUv*7.4+vec2(41.2,5.8))*0.08;
  float cloudField=shape*0.72+broad*0.18+detail+wisps;
  float threshold=1.02-uCloudCoverage*0.72;
  float mask=smoothstep(threshold,threshold+0.17,cloudField)*uCloudDensity*smoothstep(-0.05,0.18,ray.y);
  float forwardScatter=pow(max(dot(ray,uSunDirection),0.0),8.0);
  float edgeLight=1.0-smoothstep(threshold,threshold+0.38,cloudField);
  vec3 sunTint=srgbToLinear(uSunColor);
  vec3 shadowColor=mix(vec3(0.25,0.29,0.36),sunTint*0.38,uTwilightFactor*0.42);
  vec3 litColor=mix(vec3(0.78,0.82,0.87),sunTint*1.18,uTwilightFactor*0.78);
  vec3 dayColor=mix(shadowColor,litColor,clamp(0.28+edgeLight*0.44+forwardScatter*0.2,0.0,1.0));
  dayColor+=sunTint*forwardScatter*edgeLight*0.72;
  vec3 nightColor=mix(vec3(0.035,0.045,0.065),srgbToLinear(uMoonColor)*0.34,moonGlow+moonDisc*0.3);
  return vec4(mix(nightColor,dayColor,uDayFactor)*(1.0-uWeatherDarkening*0.72),mask*0.86);
}

vec4 volumetricCloud(vec3 ray){
  if(uCloudCoverage<=0.001||ray.y<=0.002)return vec4(0);
  float bottom=uCloudAltitude,top=bottom+uCloudThickness;
  float t0=(bottom-uCameraPosition.y)/ray.y,t1=(top-uCameraPosition.y)/ray.y;
  float enter=max(0.0,min(t0,t1)),exit=min(80000.0,max(t0,t1));
  if(exit<=enter)return vec4(0);
  int steps=uCloudQuality<1.5?12:(uCloudQuality<2.5?20:28);
  float stepLength=(exit-enter)/float(steps),jitter=hash21(gl_FragCoord.xy+uCloudSeed);
  vec3 wind=vec3(uCloudWind.x,0.0,uCloudWind.y)*uTime*0.42;
  vec3 accumulated=vec3(0);float alpha=0.0;
  for(int i=0;i<28;i++){
    if(i>=steps||alpha>.985)break;
    float t=enter+(float(i)+jitter)*stepLength;
    vec3 position=uCameraPosition+ray*t;
    float height01=clamp((position.y-bottom)/max(1.0,uCloudThickness),0.0,1.0);
    float profile=smoothstep(0.0,0.16,height01)*smoothstep(1.0,0.68,height01);
    vec3 samplePosition=position*vec3(0.00042,0.00074,0.00042)+wind*0.00042+uCloudSeed*0.001;
    float broad=fbm3(samplePosition*0.54+vec3(7.2,19.1,3.4));
    float base=fbm3(samplePosition),erosion=noise3(samplePosition*3.7+17.0)*0.22;
    float cloudField=base*0.76+broad*0.16+erosion;
    float threshold=1.03-uCloudCoverage*0.72;
    float density=smoothstep(threshold,threshold+0.15,cloudField)*profile*uCloudDensity;
    float sampleAlpha=1.0-exp(-density*stepLength*0.00135);
    float forwardScatter=pow(max(dot(ray,uSunDirection),0.0),7.0);
    float edgeLight=1.0-smoothstep(threshold,threshold+0.34,cloudField);
    float verticalLight=mix(0.68,1.0,height01);
    vec3 sunTint=srgbToLinear(uSunColor);
    vec3 shadowColor=mix(vec3(0.22,0.26,0.33),sunTint*0.34,uTwilightFactor*0.36);
    vec3 litColor=mix(vec3(0.72,0.77,0.83),sunTint*1.16,uTwilightFactor*0.78);
    vec3 dayColor=mix(shadowColor,litColor,clamp(0.2+edgeLight*0.46+forwardScatter*0.26,0.0,1.0))*verticalLight;
    dayColor+=sunTint*forwardScatter*edgeLight*0.65;
    vec3 nightColor=mix(vec3(0.022,0.03,0.05),srgbToLinear(uMoonColor)*0.28,max(dot(ray,uMoonDirection),0.0));
    vec3 sampleColor=mix(nightColor,dayColor,uDayFactor)*(1.0-uWeatherDarkening*0.78);
    accumulated+=(1.0-alpha)*sampleColor*sampleAlpha;alpha+=(1.0-alpha)*sampleAlpha;
  }
  return vec4(accumulated/max(alpha,0.0001),alpha);
}

void main(){
  vec3 ray=normalize(uForward+uRight*vNdc.x*uTanHalfFov*uAspect+uUp*vNdc.y*uTanHalfFov);
  float horizon=pow(clamp(1.0-abs(ray.y),0.0,1.0),4.2);
  float upper=smoothstep(-0.04,0.82,ray.y),below=smoothstep(-0.45,-0.02,ray.y);
  vec3 zenithLinear=srgbToLinear(uZenithColor),horizonLinear=srgbToLinear(uHorizonColor),groundLinear=srgbToLinear(uGroundColor);
  vec3 sunLinear=srgbToLinear(uSunColor),moonLinear=srgbToLinear(uMoonColor);
  vec3 sky=mix(groundLinear,horizonLinear,below);
  sky=mix(sky,zenithLinear,upper);
  float clearAirHaze=clamp(uHaze+uMie*0.28+uHumidity*0.08,0.0,1.0);
  float fogResponse=mix(uNightFogMultiplier,uDayFogMultiplier,uDayFactor)*uWeatherFog;
  float horizonHaze=clamp(clearAirHaze*0.6+fogResponse,0.0,0.92)*horizon;
  sky=mix(sky,horizonLinear,horizon*(0.12+clearAirHaze*0.28));
  sky=mix(sky,mix(horizonLinear,srgbToLinear(vec3(0.78,0.84,0.88)),0.2),horizonHaze);
  sky*=mix(0.9,1.08,clamp(uRayleigh/1.5,0.0,1.0));

  float sunCos=clamp(dot(ray,uSunDirection),-1.0,1.0);
  float rayleighPhase=3.0/(16.0*PI)*(1.0+sunCos*sunCos);
  float g=clamp(uMieAnisotropy,0.0,0.95);
  float mieDenominator=max(0.001,pow(1.0+g*g-2.0*g*sunCos,1.5));
  float miePhase=3.0/(8.0*PI)*((1.0-g*g)*(1.0+sunCos*sunCos))/((2.0+g*g)*mieDenominator);
  float airMass=1.0/max(0.075,ray.y+0.11);
  vec3 betaRayleigh=vec3(0.12,0.28,0.72)*max(0.0,uRayleigh);
  vec3 opticalDepth=(betaRayleigh*0.16+vec3(uMie*0.18+uHaze*0.08+uDust*0.1))*airMass;
  vec3 transmittance=exp(-opticalDepth);
  vec3 physicalScatter=(betaRayleigh*rayleighPhase*2.8+vec3(1.0,0.78,0.52)*miePhase*uMie*1.4)*(vec3(1.0)-transmittance);
  vec2 horizonDirection=normalize(ray.xz+vec2(0.00001));
  vec2 sunHorizonDirection=normalize(uSunDirection.xz+vec2(0.00001));
  float twilightSunward=pow(max(dot(horizonDirection,sunHorizonDirection),0.0),2.4);
  vec3 twilightScatter=mix(vec3(0.08,0.035,0.18),vec3(0.7,0.16,0.035),twilightSunward);
  physicalScatter+=twilightScatter*(uOzone*uTwilightFactor*horizon)*0.13;
  float physicalWeight=clamp((uDayFactor*0.62+uTwilightFactor*0.34)*uAerialPerspective,0.0,0.72);
  sky=mix(sky,sky*transmittance+physicalScatter,physicalWeight);
  float eclipseWorldResponse=uSolarEclipse*uDayFactor;
  sky*=mix(1.0,0.16,eclipseWorldResponse);
  sky=mix(sky,vec3(0.002,0.006,0.018),eclipseWorldResponse*0.58);

  float sunDot=max(dot(ray,uSunDirection),0.0);
  float sunThresholdOuter=cos(radians(max(0.03,uSunAngularRadius*1.18)));
  float sunThresholdInner=cos(radians(max(0.02,uSunAngularRadius*0.90)));
  float sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uDayFactor;
  float eclipseRadius=max(uMoonAngularRadius,uSunAngularRadius*uSolarEclipseCoverage);
  vec2 eclipseUv=celestialUv(ray,uMoonDirection,eclipseRadius);
  float eclipseDisc=1.0-smoothstep(0.96,1.015,length(eclipseUv));
  float eclipseActive=step(0.001,uSolarEclipse);
  float eclipseOcclusion=eclipseDisc*eclipseActive;
  float visibleSunDisc=sunDisc*(1.0-eclipseOcclusion);
  float sunGlow=pow(sunDot,mix(11.0,36.0,clamp(uSunGlow/3.0,0.0,1.0)))*(0.07+uSunGlow*0.15+uTwilightFactor*0.38);
  sky+=sunLinear*(sunGlow*(1.0-uSolarEclipse*0.93)+visibleSunDisc*(3.15+uSunGlow*1.15));
  sky+=sunLinear*horizon*uTwilightFactor*(0.025+twilightSunward*0.34);
  vec2 sunCoronaUv=celestialUv(ray,uSunDirection,uSunAngularRadius);
  float eclipseRadius01=length(sunCoronaUv);
  float eclipseAngle=atan(sunCoronaUv.y,sunCoronaUv.x);
  vec2 coronaDirection=vec2(cos(eclipseAngle),sin(eclipseAngle));
  float coronaNoise=noise3(vec3(coronaDirection*3.2,uStarSeed*0.00073));
  float fineStreamers=smoothstep(0.5,0.84,noise3(vec3(coronaDirection*8.4,uStarSeed*0.0017)));
  float broadStreamers=smoothstep(0.34,0.82,noise3(vec3(coronaDirection*1.7,uStarSeed*0.0011)));
  float directionalWisps=pow(0.5+0.5*cos(eclipseAngle*5.0+coronaNoise*4.2),3.2);
  float streamerStrength=clamp(fineStreamers*0.48+broadStreamers*0.56+directionalWisps*0.24,0.0,1.0);
  float coronaDistance=max(0.0,eclipseRadius01-1.0);
  float coronaReach=mix(0.16,0.82,streamerStrength);
  float coronaEnvelope=exp(-coronaDistance/max(0.035,coronaReach));
  float coronaOutside=smoothstep(0.985,1.015,eclipseRadius01)*(1.0-smoothstep(3.6,4.5,eclipseRadius01));
  float innerRim=exp(-pow((eclipseRadius01-1.0)/0.038,2.0))*coronaOutside;
  float corona=coronaEnvelope*coronaOutside*(0.18+streamerStrength*0.92);
  float totality=smoothstep(0.995,1.035,uSolarEclipseCoverage)*uSolarEclipse;
  float annularity=(1.0-smoothstep(0.94,1.0,uSolarEclipseCoverage))*uSolarEclipse;
  float annularRing=innerRim*annularity;
  float diamondWindow=exp(-pow((uSolarEclipseCoverage-1.0)/0.025,2.0))*uSolarEclipse;
  float diamondAngle=abs(atan(sin(eclipseAngle-2.58),cos(eclipseAngle-2.58)));
  float diamondRing=exp(-pow(diamondAngle/0.055,2.0))*innerRim*diamondWindow;
  float eclipseSilhouette=eclipseDisc*eclipseActive*uDayFactor;
  sky=mix(sky,vec3(0.0015,0.002,0.003),eclipseSilhouette*0.985);
  vec3 coronaColor=mix(vec3(1.0,0.93,0.79),vec3(0.46,0.64,1.0),smoothstep(0.08,1.5,coronaDistance));
  sky+=coronaColor*(innerRim*2.4+corona*0.82)*totality;
  sky+=vec3(1.0,0.66,0.24)*(annularRing*3.0+diamondRing*8.0);
  sky=mix(sky,vec3(0.00001),eclipseSilhouette);

  float moonDot=max(dot(ray,uMoonDirection),0.0);
  vec2 moonUv=celestialUv(ray,uMoonDirection,uMoonAngularRadius);
  float moonRadius=length(moonUv),moonDisc=1.0-smoothstep(0.965,1.015,moonRadius);
  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));
  float independentMoonVisibility=uMoonVisibility*(1.0-eclipseActive);
  if(moonDisc>0.001){
    vec3 moonReference=abs(uMoonDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
    vec3 moonRight=normalize(cross(moonReference,uMoonDirection)),moonUp=normalize(cross(uMoonDirection,moonRight));
    vec3 moonSurfaceNormal=normalize(moonRight*moonUv.x+moonUp*moonUv.y-uMoonDirection*moonSphere);
    float directPhase=max(dot(moonSurfaceNormal,uSunDirection),0.0);
    float phaseLighting=max(directPhase,uMoonEarthshine*(1.0-directPhase));
    float limb=mix(1.0,pow(max(0.0,moonSphere),0.32),uMoonLimbDarkening);
    vec3 normalMoonSurface=lunarSurface(moonUv,moonSurfaceNormal,phaseLighting)*limb;
    vec3 eclipsedMoon=mix(normalMoonSurface,vec3(0.58,0.09,0.035)*(0.7+normalMoonSurface),uLunarEclipse*0.9);
    float eclipseMoonEnergy=mix(1.0,0.22,uLunarEclipse);
    sky+=eclipsedMoon*moonDisc*phaseLighting*independentMoonVisibility*uMoonBrightness*1.7*eclipseMoonEnergy;
  }
  float moonGlow=pow(moonDot,mix(42.0,130.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*independentMoonVisibility*uMoonGlow*0.15;
  sky+=mix(moonLinear,vec3(0.68,0.14,0.05),uLunarEclipse)*moonGlow;

  if(uPlanetEnabled>.5){
    vec2 planetUv=celestialUv(ray,uPlanetDirection,uPlanetAngularRadius);
    float planetRadius=length(planetUv),planetDisc=1.0-smoothstep(0.96,1.015,planetRadius);
    float bands=0.84+0.16*sin(planetUv.y*18.0+noise2(planetUv*5.0)*2.0);
    sky+=srgbToLinear(uPlanetColor)*planetDisc*bands*uPlanetBrightness*uNightFactor;
    float ringEllipse=length(vec2(planetUv.x,planetUv.y*4.4));
    float ring=(smoothstep(1.75,1.55,ringEllipse)-smoothstep(1.18,1.02,ringEllipse))*uPlanetRings;
    ring*=1.0-smoothstep(0.0,0.22,abs(planetUv.y));
    sky+=srgbToLinear(uPlanetColor)*ring*uPlanetBrightness*0.72*uNightFactor;
  }

  float starHorizon=smoothstep(0.015,0.16,ray.y);
  vec3 stars=starLayer(ray,180.0,uStarSeed)+starLayer(ray,360.0,uStarSeed+101.0);
  float eclipseStarVisibility=pow(uSolarEclipse,7.0)*uDayFactor*0.34;
  sky+=stars*max(uStarVisibility,eclipseStarVisibility)*starHorizon*(1.0-eclipseSilhouette);
  sky+=milkyWay(ray,starHorizon);

  vec4 cloud=uCloudQuality<0.5?layeredCloud(ray,moonGlow,moonDisc):volumetricCloud(ray);
  sky=mix(sky,cloud.rgb,clamp(cloud.a,0.0,0.96));
  sky*=1.0-uWeatherDarkening*0.38;
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
      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uRayleigh','uMie','uMieAnisotropy','uOzone','uDust','uAerialPerspective','uHaze','uHumidity','uWeatherFog','uDayFogMultiplier','uNightFogMultiplier',
      'uStarVisibility','uStarDensity','uStarBrightness','uStarTwinkleAmount','uStarTwinkleSpeed','uStarSizeMin','uStarSizeMax','uStarColorVariation','uStarRayStrength','uStarRayLength','uStarHeroFraction','uStarSeed',
      'uMilkyWayIntensity','uMilkyWayWidth','uMilkyWayDetail','uMilkyWayOrientation','uMilkyWayDust','uMilkyWayWarp','uMilkyWayClumping','uMilkyWayCoreStrength','uMilkyWayWidthVariation','uMilkyWayColor',
      'uSunAngularRadius','uSunGlow','uSolarEclipseCoverage','uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail','uMoonVisibility','uMoonEarthshine','uMoonCraterStrength','uMoonMariaStrength','uMoonSurfaceContrast','uMoonPatternRotation','uMoonPatternSeed','uMoonReliefStrength','uMoonLimbDarkening','uLunarEclipse','uSolarEclipse',
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
    const f = (name, value) => gl.uniform1f(u[name], Number(value) || 0);
    gl.uniform3fv(u.uForward, forward);gl.uniform3fv(u.uRight, right);gl.uniform3fv(u.uUp, up);
    gl.uniform3fv(u.uCameraPosition, camera.position || [0, 0, 0]);
    f('uTanHalfFov',Math.tan((Number(camera.fov || 62) * DEG) * 0.5));f('uAspect',gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight));
    gl.uniform3fv(u.uSunDirection, environment.sunDirection);gl.uniform3fv(u.uMoonDirection, environment.moonDirection);gl.uniform3fv(u.uSunColor, environment.sunColor);gl.uniform3fv(u.uMoonColor, environment.moonColor);
    gl.uniform3fv(u.uZenithColor, environment.zenithColor);gl.uniform3fv(u.uHorizonColor, environment.horizonColor);gl.uniform3fv(u.uGroundColor, environment.groundColor);
    for(const [name,value] of Object.entries({
      uDayFactor:environment.dayFactor,uNightFactor:environment.nightFactor,uTwilightFactor:environment.twilightFactor,uRayleigh:environment.atmosphereRayleigh,uMie:environment.atmosphereMie,uMieAnisotropy:environment.atmosphereMieAnisotropy,uOzone:environment.atmosphereOzone,uDust:environment.atmosphereDust,uAerialPerspective:environment.aerialPerspective,uHaze:environment.atmosphereHaze,uHumidity:environment.atmosphereHumidity,uWeatherFog:environment.weatherFog,uDayFogMultiplier:environment.dayFogMultiplier,uNightFogMultiplier:environment.nightFogMultiplier,
      uStarVisibility:environment.starVisibility,uStarDensity:environment.starDensity,uStarBrightness:environment.starBrightness,uStarTwinkleAmount:environment.starTwinkleAmount,uStarTwinkleSpeed:environment.starTwinkleSpeed,uStarSizeMin:environment.starSizeMin,uStarSizeMax:environment.starSizeMax,uStarColorVariation:environment.starColorVariation,uStarRayStrength:environment.starRayStrength,uStarRayLength:environment.starRayLength,uStarHeroFraction:environment.starHeroFraction,uStarSeed:environment.starSeed,
      uMilkyWayIntensity:environment.milkyWayIntensity,uMilkyWayWidth:environment.milkyWayWidth,uMilkyWayDetail:environment.milkyWayDetail,uMilkyWayOrientation:environment.milkyWayOrientation,uMilkyWayDust:environment.milkyWayDust,uMilkyWayWarp:environment.milkyWayWarp,uMilkyWayClumping:environment.milkyWayClumping,uMilkyWayCoreStrength:environment.milkyWayCoreStrength,uMilkyWayWidthVariation:environment.milkyWayWidthVariation,
      uSunAngularRadius:environment.sunAngularRadius,uSunGlow:environment.sunGlow,uSolarEclipseCoverage:environment.solarEclipseCoverage,uMoonAngularRadius:environment.moonAngularRadius,uMoonGlow:environment.moonGlow,uMoonPhase:environment.moonPhase,uMoonBrightness:environment.moonBrightness,uMoonDetail:environment.moonDetail,uMoonVisibility:environment.moonVisibility,uMoonEarthshine:environment.moonEarthshine,uMoonCraterStrength:environment.moonCraterStrength,uMoonMariaStrength:environment.moonMariaStrength,uMoonSurfaceContrast:environment.moonSurfaceContrast,uMoonPatternRotation:environment.moonPatternRotation,uMoonPatternSeed:environment.moonPatternSeed,uMoonReliefStrength:environment.moonReliefStrength,uMoonLimbDarkening:environment.moonLimbDarkening,uLunarEclipse:environment.lunarEclipseFactor,uSolarEclipse:environment.solarEclipseFactor,
      uPlanetEnabled:environment.planetEnabled?1:0,uPlanetAngularRadius:environment.planetAngularRadius,uPlanetBrightness:environment.planetBrightness,uPlanetRings:environment.planetRings,
      uCloudCoverage:environment.cloudCoverage,uCloudDensity:environment.cloudDensity,uCloudSeed:environment.cloudSeed,uCloudQuality:cloudQuality,uCloudAltitude:environment.cloudAltitude,uCloudThickness:environment.cloudThickness,uTime:environment.timeSeconds*Math.max(0.05,environment.cloudWindSpeed/12),uExposure:environment.exposure,uWeatherDarkening:environment.weatherDarkening
    }))f(name,value);
    gl.uniform3fv(u.uMilkyWayColor,environment.milkyWayColor);gl.uniform3fv(u.uPlanetDirection,environment.planetDirection);gl.uniform3fv(u.uPlanetColor,environment.planetColor);gl.uniform2fv(u.uCloudWind,environment.cloudWindDirection);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(depthMask);
    if (depthEnabled) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (cullEnabled) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    if (blendEnabled) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.vao = null;
    this.program = null;
  }
}
