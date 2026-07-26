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
uniform float uRayleigh;
uniform float uMie;
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
  float probability=clamp(uStarDensity*0.014,0.00035,0.035);
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
    float radius=mix(0.00072,0.00235,pow(sizeRandom,2.45))*max(0.28,sizeControl)*(1.0+hero*0.82);
    float aa=max(fwidth(angularDistance),0.000035);
    float disc=1.0-smoothstep(radius-aa,radius+aa,angularDistance);
    vec3 reference=abs(starDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
    vec3 right=normalize(cross(reference,starDirection));
    vec3 up=normalize(cross(starDirection,right));
    vec2 local=vec2(dot(ray,right),dot(ray,up));
    float rayLength=radius*mix(2.0,4.5,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));
    float thin=max(radius*0.12,0.000035);
    float horizontal=exp(-abs(local.y)/thin)*exp(-abs(local.x)/max(rayLength,0.0001));
    float vertical=exp(-abs(local.x)/thin)*exp(-abs(local.y)/max(rayLength,0.0001));
    float diagonal=exp(-abs(local.x+local.y)/(thin*1.5))*exp(-abs(local.x-local.y)/max(rayLength*0.65,0.0001));
    float rays=(horizontal+vertical+diagonal*0.12)*hero*uStarRayStrength*0.026;
    float phase=hash21(cell+seed+43.2)*TAU;
    float speed=mix(0.35,2.1,hash21(cell+seed+9.3))*uStarTwinkleSpeed;
    float pulse=0.5+0.5*sin(uTime*speed+phase);
    float shimmer=0.5+0.5*sin(uTime*speed*1.73+phase*1.41);
    float twinkle=mix(1.0,mix(0.72,1.25,pulse)*mix(0.94,1.06,shimmer),uStarTwinkleAmount);
    float temperature=hash21(cell+seed+71.4);
    vec3 warm=vec3(1.0,0.76,0.56),neutral=vec3(0.94,0.97,1.0),cool=vec3(0.62,0.78,1.0);
    vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);
    starColor=mix(vec3(0.92,0.95,1.0),starColor,uStarColorVariation);
    float energy=(0.34+sizeRandom*1.22+hero*1.35)*uStarBrightness*twinkle;
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
  float warp=(coarse-0.5)*uMilkyWayWidth*uMilkyWayWarp*0.62;
  warp+=sin(longitude*2.0+medium*2.2)*uMilkyWayWidth*uMilkyWayWarp*0.12;
  float widthVariation=mix(0.72,1.34,coarse);
  widthVariation*=1.0+sin(longitude*3.0+medium*1.7)*uMilkyWayWidthVariation*0.13;
  float localWidth=max(0.01,uMilkyWayWidth*max(0.42,widthVariation));
  float signedDistance=latitude-warp;
  float coreBand=exp(-pow(abs(signedDistance)/localWidth,2.0)*1.7);
  float diffuseHalo=exp(-pow(abs(signedDistance)/max(0.018,localWidth*2.7),2.0)*1.25)*0.08;
  float filamentUpper=exp(-pow(abs(signedDistance-localWidth*0.7)/max(0.007,localWidth*0.3),2.0)*2.1)*0.1;
  float filamentLower=exp(-pow(abs(signedDistance+localWidth*0.82)/max(0.007,localWidth*0.34),2.0)*2.15)*0.07;
  float galacticCore=exp(-pow(wrappedDistance(longitude,-0.62)/0.52,2.0))*uMilkyWayCoreStrength;
  float longitudinalBreakup=0.38+0.62*smoothstep(0.24,0.78,coarse*0.64+medium*0.36);
  longitudinalBreakup=mix(0.62,longitudinalBreakup,clamp(uMilkyWayClumping,0.0,1.35));
  float cloudTexture=0.34+coarse*0.28+medium*0.28+fine*0.1;
  float galacticCloudEnvelope=(coreBand+diffuseHalo+filamentUpper+filamentLower)*cloudTexture*longitudinalBreakup;
  float subtleKnots=smoothstep(0.62,0.88,fine)*coreBand*uMilkyWayDetail*0.16;
  float centralDust=exp(-pow(abs(signedDistance)/max(0.004,localWidth*0.2),2.0)*2.4);
  centralDust*=smoothstep(0.34,0.76,medium*0.62+fine*0.38)*uMilkyWayDust;
  float brokenDust=exp(-pow(abs(signedDistance-localWidth*0.34)/max(0.004,localWidth*0.16),2.0)*2.2);
  brokenDust*=smoothstep(0.56,0.84,fine)*uMilkyWayDust*0.26;
  float luminance=max(0.0,(galacticCloudEnvelope+subtleKnots+galacticCore*coreBand*0.22)*(1.0-centralDust*0.86-brokenDust));
  vec3 warmCore=vec3(0.96,0.78,0.62);
  vec3 color=mix(uMilkyWayColor,warmCore,clamp(galacticCore*0.24,0.0,0.3));
  return color*luminance*uMilkyWayIntensity*0.7*horizonMask;
}

vec2 celestialUv(vec3 ray,vec3 direction,float angularRadius){
  vec3 reference=abs(direction.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 right=normalize(cross(reference,direction));
  vec3 up=normalize(cross(direction,right));
  float scale=max(0.00005,sin(radians(max(0.02,angularRadius))));
  return vec2(dot(ray,right),dot(ray,up))/scale;
}

float craterField(vec2 uv,float scale,float seed){
  vec2 g=uv*scale;
  vec2 cell=floor(g);
  vec2 local=fract(g)-0.5;
  float nearest=10.0;
  float ring=0.0;
  float basin=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 neighbor=vec2(float(x),float(y));
    vec2 id=cell+neighbor;
    vec2 center=neighbor+vec2(hash21(id+seed),hash21(id+seed+41.7))-0.5;
    float radius=mix(0.11,0.34,hash21(id+seed+17.3));
    float d=length(local-center);
    nearest=min(nearest,d);
    ring=max(ring,exp(-pow((d-radius)/max(0.012,radius*0.12),2.0)));
    basin=max(basin,(1.0-smoothstep(0.0,radius,d))*mix(0.2,0.8,hash21(id+seed+73.1)));
  }
  return ring*0.28-basin*0.42;
}

vec3 lunarSurface(vec2 moonUv,vec3 surfaceNormal,float phaseLighting){
  float rotation=radians(uMoonPatternRotation);
  mat2 r=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation));
  vec2 rotated=r*moonUv;
  vec3 rotatedNormal=normalize(vec3(r*surfaceNormal.xy,surfaceNormal.z));
  float low=fbm3(rotatedNormal*2.15+uMoonPatternSeed*0.0009);
  float mid=fbm3(rotatedNormal*5.7+vec3(8.1,2.7,19.4)+uMoonPatternSeed*0.0017);
  float maria=smoothstep(0.5,0.72,low*0.78+mid*0.22);
  maria*=smoothstep(-0.86,0.18,rotated.x+rotated.y*0.22)+smoothstep(0.62,-0.4,rotated.x-rotated.y*0.7)*0.45;
  maria=clamp(maria,0.0,1.0)*uMoonMariaStrength;
  float craters=(craterField(rotated,5.5,uMoonPatternSeed)+craterField(rotated,13.0,uMoonPatternSeed+91.0)*0.55+craterField(rotated,31.0,uMoonPatternSeed+211.0)*0.24)*uMoonCraterStrength;
  float grain=(fbm3(rotatedNormal*22.0+31.0)-0.5)*0.12*uMoonDetail;
  float relief=craters*uMoonReliefStrength;
  vec3 bright=uMoonColor*mix(0.78,1.1,phaseLighting);
  vec3 dark=bright*vec3(0.42,0.48,0.56);
  vec3 surface=mix(bright,dark,clamp(maria,0.0,0.86));
  surface*=1.0+grain+relief;
  surface=pow(max(surface,vec3(0.001)),vec3(max(0.2,uMoonSurfaceContrast)));
  return surface;
}

vec4 layeredCloud(vec3 ray,float moonGlow,float moonDisc){
  if(uCloudCoverage<=0.001||ray.y<=-0.08)return vec4(0);
  float projection=max(0.1,ray.y+0.22);
  vec2 cloudUv=ray.xz/projection*0.72+uCloudWind*uTime*0.00045+vec2(uCloudSeed*0.00017,uCloudSeed*0.00029);
  float shape=fbm2(cloudUv*1.15),detail=fbm2(cloudUv*3.1+23.4)*0.24;
  float threshold=1.02-uCloudCoverage*0.72;
  float mask=smoothstep(threshold,threshold+0.16,shape+detail)*uCloudDensity*smoothstep(-0.05,0.18,ray.y);
  float cloudLight=0.44+0.56*pow(max(dot(normalize(vec3(ray.x,0.32,ray.z)),uSunDirection),0.0),2.0);
  vec3 dayColor=mix(vec3(0.34,0.38,0.44),vec3(1.0,0.96,0.9),cloudLight);
  vec3 nightColor=mix(vec3(0.035,0.045,0.065),uMoonColor*0.34,moonGlow+moonDisc*0.3);
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
    float base=fbm3(samplePosition),erosion=noise3(samplePosition*3.7+17.0)*0.22;
    float threshold=1.03-uCloudCoverage*0.72;
    float density=smoothstep(threshold,threshold+0.15,base+erosion)*profile*uCloudDensity;
    float sampleAlpha=1.0-exp(-density*stepLength*0.00135);
    float sunFacing=max(dot(normalize(vec3(ray.x,0.28,ray.z)),uSunDirection),0.0),lighting=0.34+0.66*sunFacing;
    vec3 dayColor=mix(vec3(0.28,0.31,0.37),vec3(1.0,0.95,0.86),lighting);
    vec3 nightColor=mix(vec3(0.022,0.03,0.05),uMoonColor*0.28,max(dot(ray,uMoonDirection),0.0));
    vec3 sampleColor=mix(nightColor,dayColor,uDayFactor)*(1.0-uWeatherDarkening*0.78);
    accumulated+=(1.0-alpha)*sampleColor*sampleAlpha;alpha+=(1.0-alpha)*sampleAlpha;
  }
  return vec4(accumulated/max(alpha,0.0001),alpha);
}

void main(){
  vec3 ray=normalize(uForward+uRight*vNdc.x*uTanHalfFov*uAspect+uUp*vNdc.y*uTanHalfFov);
  float horizon=pow(clamp(1.0-abs(ray.y),0.0,1.0),4.2);
  float upper=smoothstep(-0.04,0.82,ray.y),below=smoothstep(-0.45,-0.02,ray.y);
  vec3 sky=mix(uGroundColor,uHorizonColor,below);
  sky=mix(sky,uZenithColor,upper);
  float clearAirHaze=clamp(uHaze+uMie*0.28+uHumidity*0.08,0.0,1.0);
  float fogResponse=mix(uNightFogMultiplier,uDayFogMultiplier,uDayFactor)*uWeatherFog;
  float horizonHaze=clamp(clearAirHaze*0.6+fogResponse,0.0,0.92)*horizon;
  sky=mix(sky,uHorizonColor,horizon*(0.12+clearAirHaze*0.28));
  sky=mix(sky,mix(uHorizonColor,vec3(0.78,0.84,0.88),0.2),horizonHaze);
  sky*=mix(0.9,1.08,clamp(uRayleigh/1.5,0.0,1.0));

  float sunDot=max(dot(ray,uSunDirection),0.0);
  float sunThresholdOuter=cos(radians(max(0.03,uSunAngularRadius*1.18)));
  float sunThresholdInner=cos(radians(max(0.02,uSunAngularRadius*0.90)));
  float sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uDayFactor;
  vec3 eclipseDirection=normalize(mix(uMoonDirection,uSunDirection,smoothstep(0.92,0.999,uSolarEclipse)));
  float eclipseRadius=max(uMoonAngularRadius,uSunAngularRadius*uSolarEclipseCoverage);
  vec2 eclipseUv=celestialUv(ray,eclipseDirection,eclipseRadius);
  float eclipseDisc=1.0-smoothstep(0.96,1.015,length(eclipseUv));
  float eclipseOcclusion=eclipseDisc*uSolarEclipse;
  float visibleSunDisc=sunDisc*(1.0-eclipseOcclusion);
  float sunGlow=pow(sunDot,mix(11.0,36.0,clamp(uSunGlow/3.0,0.0,1.0)))*(0.07+uSunGlow*0.15+uTwilightFactor*0.38);
  sky+=uSunColor*(sunGlow*(1.0-uSolarEclipse*0.93)+visibleSunDisc*(3.15+uSunGlow*1.15));
  sky+=uSunColor*horizon*uTwilightFactor*0.18;
  float coronaInner=pow(sunDot,1500.0),coronaOuter=pow(sunDot,420.0);
  float eclipseSilhouette=eclipseDisc*uSolarEclipse*uDayFactor;
  sky=mix(sky,vec3(0.0015,0.002,0.003),eclipseSilhouette*0.985);
  sky+=vec3(1.0,0.88,0.64)*(coronaInner*2.2+coronaOuter*0.24)*uSolarEclipse*(1.0-eclipseDisc);
  sky=mix(sky,vec3(0.00001),eclipseSilhouette);

  float moonDot=max(dot(ray,uMoonDirection),0.0);
  vec2 moonUv=celestialUv(ray,uMoonDirection,uMoonAngularRadius);
  float moonRadius=length(moonUv),moonDisc=1.0-smoothstep(0.965,1.015,moonRadius);
  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));
  vec3 moonReference=abs(uMoonDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 moonRight=normalize(cross(moonReference,uMoonDirection)),moonUp=normalize(cross(uMoonDirection,moonRight));
  vec3 moonSurfaceNormal=normalize(moonRight*moonUv.x+moonUp*moonUv.y-uMoonDirection*moonSphere);
  float directPhase=max(dot(moonSurfaceNormal,uSunDirection),0.0);
  float phaseLighting=max(directPhase,uMoonEarthshine*(1.0-directPhase));
  float limb=mix(1.0,pow(max(0.0,moonSphere),0.32),uMoonLimbDarkening);
  vec3 normalMoonSurface=lunarSurface(moonUv,moonSurfaceNormal,phaseLighting)*limb;
  vec3 eclipsedMoon=mix(normalMoonSurface,vec3(0.58,0.09,0.035)*(0.7+normalMoonSurface),uLunarEclipse*0.9);
  float eclipseMoonEnergy=mix(1.0,0.22,uLunarEclipse);
  float independentMoonVisibility=uMoonVisibility*(1.0-smoothstep(0.92,0.999,uSolarEclipse));
  sky+=eclipsedMoon*moonDisc*phaseLighting*independentMoonVisibility*uMoonBrightness*1.7*eclipseMoonEnergy;
  float moonGlow=pow(moonDot,mix(42.0,130.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*independentMoonVisibility*uMoonGlow*0.15;
  sky+=mix(uMoonColor,vec3(0.68,0.14,0.05),uLunarEclipse)*moonGlow;

  if(uPlanetEnabled>.5){
    vec2 planetUv=celestialUv(ray,uPlanetDirection,uPlanetAngularRadius);
    float planetRadius=length(planetUv),planetDisc=1.0-smoothstep(0.96,1.015,planetRadius);
    float bands=0.84+0.16*sin(planetUv.y*18.0+noise2(planetUv*5.0)*2.0);
    sky+=uPlanetColor*planetDisc*bands*uPlanetBrightness*uNightFactor;
    float ringEllipse=length(vec2(planetUv.x,planetUv.y*4.4));
    float ring=(smoothstep(1.75,1.55,ringEllipse)-smoothstep(1.18,1.02,ringEllipse))*uPlanetRings;
    ring*=1.0-smoothstep(0.0,0.22,abs(planetUv.y));
    sky+=uPlanetColor*ring*uPlanetBrightness*0.72*uNightFactor;
  }

  float starHorizon=smoothstep(0.015,0.16,ray.y);
  vec3 stars=starLayer(ray,180.0,uStarSeed)+starLayer(ray,360.0,uStarSeed+101.0);
  sky+=stars*uStarVisibility*starHorizon;
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
      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uRayleigh','uMie','uHaze','uHumidity','uWeatherFog','uDayFogMultiplier','uNightFogMultiplier',
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
      uDayFactor:environment.dayFactor,uNightFactor:environment.nightFactor,uTwilightFactor:environment.twilightFactor,uRayleigh:environment.atmosphereRayleigh,uMie:environment.atmosphereMie,uHaze:environment.atmosphereHaze,uHumidity:environment.atmosphereHumidity,uWeatherFog:environment.weatherFog,uDayFogMultiplier:environment.dayFogMultiplier,uNightFogMultiplier:environment.nightFogMultiplier,
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
