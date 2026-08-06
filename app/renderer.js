import {
  DEG, add, sub, scale, dot, cross, length, normalize, clamp,
  mat4Identity, mat4Multiply, mat4Perspective, mat4Ortho, mat4LookAt, mat4Invert,
  transformPoint, modelMatrix, normalMatrix3, hexToRgb, cameraForward
} from './math.js';
import { terrainHeightAt as sharedTerrainHeightAt, pathBlendAt as sharedPathBlendAt, terrainBaseHeightAt, normalizeTerrainProperties, terrainBounds } from './worldgen.js';
import { buildPathGuideSegmentsFromCorridor, buildTerrainConformingPathSurface, terrainPathSamplingDiagnostics } from './path-visuals.js';
import { compileScenePathRuntimes, sampleScenePathTerrain } from './path-network/runtime.js';
import { connectScenePathRuntimeConsumers, sampleSceneGroundSurface } from './path-network/consumers.js';
import { buildPathCostGuideData } from './path-network/debug-visualization.js';
import { resolveViewportLighting } from './world-runtime.js';
import { normalizeEnvironmentState } from './environment-runtime.js';
import { pickTerrainPoint } from './terrain-picking.js';
import { SkyPass } from './sky-pass.js';
import { RenderGraph } from './render-graph.js';
import { FrameResources, detectRenderCapabilities } from './frame-resources.js';
import { HDRPipeline } from './hdr-pipeline.js';
import { directionFromAzimuthElevation } from './celestial-mechanics.js';
import { SRGB_GLSL } from './color-management.js';

function compile(gl,type,source){
  const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function program(gl,vs,fs){
  const p=gl.createProgram(); gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function smoothstep(a,b,x){const t=clamp((x-a)/(b-a||1),0,1);return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function isEditorReference(object){return object?.properties?.renderClass==='editor-only'||object?.properties?.editorReference===true;}
function affectsSurfaceRecipes(object){return object?.properties?.affectsSurfaceRecipes!==false&&!isEditorReference(object);}

const meshVS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in float aBlend;
layout(location=4) in vec4 aInstance0;
layout(location=5) in vec4 aInstance1;
layout(location=6) in vec4 aInstance2;
layout(location=7) in vec4 aInstance3;
layout(location=8) in vec4 aSurfaceDetail0;
layout(location=9) in vec4 aSurfaceDetail1;
layout(location=10) in vec4 aSurfaceDetail2;
layout(location=11) in vec4 aSurfaceDetail3;
uniform mat4 uModel;
uniform float uInstanced;
uniform float uTime;
uniform float uFoliageWind;
uniform float uFoliageWindStrength;
uniform float uFoliageWindFrequency;
uniform float uFoliageBaseY;
uniform float uFoliageHeight;
uniform vec3 uFoliageWindDirection;
uniform mat4 uViewProj;
uniform mat4 uLightViewProj;
uniform mat3 uNormalMat;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUV;
out float vBlend;
flat out vec4 vSurfaceDetail0;
flat out vec4 vSurfaceDetail1;
flat out vec4 vSurfaceDetail2;
flat out vec4 vSurfaceDetail3;
out vec4 vShadowCoord;
void main(){
  mat4 instanceModel=mat4(aInstance0,aInstance1,aInstance2,aInstance3);
  mat4 model=uInstanced>.5?instanceModel:uModel;
  vec3 localPosition=aPosition;
  if(uFoliageWind>.5){
    float height=max(uFoliageHeight,.001);
    float bend=clamp((aPosition.y-uFoliageBaseY)/height,0.0,1.0);
    float phase=dot(model[3].xz,vec2(.173,.119));
    float sway=sin(uTime*uFoliageWindFrequency+phase)*uFoliageWindStrength*bend*bend;
    localPosition.xz+=normalize(uFoliageWindDirection.xz+vec2(.0001))*sway;
  }
  vec4 world=model*vec4(localPosition,1.0);
  vWorld=world.xyz;
  vNormal=normalize(uInstanced>.5?mat3(model)*aNormal:uNormalMat*aNormal);
  vUV=aUV;
  vBlend=aBlend;
  vSurfaceDetail0=aSurfaceDetail0;
  vSurfaceDetail1=aSurfaceDetail1;
  vSurfaceDetail2=aSurfaceDetail2;
  vSurfaceDetail3=aSurfaceDetail3;
  vShadowCoord=uLightViewProj*world;
  gl_Position=uViewProj*world;
}`;
const meshFS=`#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUV;
in float vBlend;
flat in vec4 vSurfaceDetail0;
flat in vec4 vSurfaceDetail1;
flat in vec4 vSurfaceDetail2;
flat in vec4 vSurfaceDetail3;
in vec4 vShadowCoord;
out vec4 outColor;
uniform vec3 uBaseColor;
uniform vec3 uPathColor;
uniform vec3 uAmbientColor;
uniform vec3 uSkyZenithColor;
uniform vec3 uSkyHorizonColor;
uniform vec3 uSkyGroundColor;
uniform float uAmbientIntensity;
uniform float uEditorFill;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonIntensity;
uniform int uPointCount;
uniform vec3 uPointPos[4];
uniform vec3 uPointColor[4];
uniform vec2 uPointData[4];
uniform float uSelected;
uniform vec3 uCameraPos;
uniform float uRoughness;
uniform float uMetallic;
uniform float uIsTerrain;
uniform float uUseBaseTexture;
uniform float uUsePathTexture;
uniform float uBaseTextureTintStrength;
uniform float uPathTextureTintStrength;
uniform float uBaseColorIsLinear;
uniform float uUseBaseNormal;
uniform float uUsePathNormal;
uniform float uUseBaseRoughness;
uniform float uUsePathRoughness;
uniform float uUseBaseAO;
uniform float uUsePathAO;
uniform float uBaseNormalStrength;
uniform float uPathNormalStrength;
uniform float uBaseTextureScale;
uniform float uPathTextureScale;
uniform float uBaseTextureRotation;
uniform float uPathTextureRotation;
uniform vec2 uBaseTextureOffset;
uniform vec2 uPathTextureOffset;
uniform float uBaseRoughnessMultiplier;
uniform float uPathRoughnessMultiplier;
uniform float uBaseAOStrength;
uniform float uPathAOStrength;
uniform float uBaseHeightStrength;
uniform float uPathHeightStrength;
uniform float uUseBaseHeight;
uniform float uUsePathHeight;
uniform sampler2D uBaseTexture;
uniform sampler2D uPathTexture;
uniform sampler2D uBaseNormalTexture;
uniform sampler2D uPathNormalTexture;
uniform sampler2D uBaseRoughnessTexture;
uniform sampler2D uPathRoughnessTexture;
uniform sampler2D uBaseAOTexture;
uniform sampler2D uPathAOTexture;
uniform sampler2D uBaseHeightTexture;
uniform sampler2D uPathHeightTexture;
uniform sampler2D uShadowMap;
uniform float uShadowEnabled;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uExposure;
uniform vec4 uBaseSurfaceLayers;
uniform vec4 uPathSurfaceLayers;
uniform vec4 uBaseSurfaceExtra;
uniform vec4 uPathSurfaceExtra;
uniform vec4 uBaseSurfaceMasks;
uniform vec4 uPathSurfaceMasks;
uniform vec4 uBaseSurfaceMasks2;
uniform vec4 uPathSurfaceMasks2;
uniform vec4 uBaseSurfaceMasks3;
uniform vec4 uPathSurfaceMasks3;
uniform vec4 uBaseWeatherResponse;
uniform vec4 uPathWeatherResponse;
uniform vec4 uBaseAdvanced;
uniform vec4 uPathAdvanced;
uniform vec3 uBaseDirtColor;
uniform vec3 uBaseMossColor;
uniform vec3 uBaseSnowColor;
uniform vec3 uBaseDamageColor;
uniform vec3 uPathDirtColor;
uniform vec3 uPathMossColor;
uniform vec3 uPathSnowColor;
uniform vec3 uPathDamageColor;
uniform vec4 uEnvironmentState;
uniform vec3 uWindDirection;
uniform int uStructureCount;
uniform vec3 uStructurePos[4];
uniform float uOpacity;

${SRGB_GLSL}
const float PI=3.14159265359;

float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float noise2(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
float softPatternChance(float randomValue,float coverage){
  float enabled=smoothstep(0.0,.015,coverage);
  return smoothstep(1.0-coverage-.075,1.0-coverage+.075,randomValue)*enabled;
}
vec4 pathSurfaceDetailMasks(
  vec2 uv,
  vec4 detail0,
  vec4 detail1,
  vec4 detail2,
  vec4 detail3,
  float weatherWetness,
  out float erosionMask,
  out vec2 detailNormalXY
){
  float profile=detail0.x;
  float roadWidth=max(.1,detail3.w);
  erosionMask=0.0;
  detailNormalXY=vec2(0.0);
  if(profile<.5)return vec4(0.0);

  float seed=detail0.y*65535.0+profile*37.17;
  float puddleCoverage=clamp(detail0.z,0.0,.75);
  float puddleScale=max(.25,detail0.w);
  float puddleDepth=clamp(detail1.x,0.0,.15);
  float rutStrength=clamp(detail1.y,0.0,1.0);
  float wheelGauge=max(.3,detail1.z);
  float rutWidth=max(.03,detail1.w);
  float hoofDensity=clamp(detail2.x,0.0,1.0);
  float hoofScale=max(.03,detail2.y);
  float bootDensity=clamp(detail2.z,0.0,1.0);
  float bootScale=max(.03,detail2.w);
  float erosionStrength=clamp(detail3.x,0.0,1.0);
  float detailNormalStrength=clamp(detail3.y,0.0,2.0);
  float weatherResponse=clamp(detail3.z,0.0,3.0);

  float longitudinalMeters=uv.x;
  float lateralMeters=(uv.y-.5)*roadWidth;
  float edgeDistance=roadWidth*.5-abs(lateralMeters);
  float edgeFade=max(.04,min(.22,roadWidth*.045));
  float roadMask=smoothstep(-edgeFade,edgeFade,edgeDistance);
  float wet=smoothstep(0.0,1.0,clamp(weatherWetness*weatherResponse,0.0,1.0));

  float halfGauge=min(wheelGauge*.5,max(.05,roadWidth*.46-rutWidth));
  float rutDistance=min(abs(lateralMeters-halfGauge),abs(lateralMeters+halfGauge));
  float rutAA=max(fwidth(rutDistance),.003);
  float rutLines=1.0-smoothstep(rutWidth*.5-rutAA,rutWidth*.5+rutAA,rutDistance);
  float rutBreakup=.48+.52*noise2(vec2(longitudinalMeters*.31+seed,lateralMeters*1.9+seed*.07));
  float ruts=rutLines*rutBreakup*rutStrength*roadMask;

  vec2 puddleGrid=vec2(
    longitudinalMeters/max(.25,puddleScale*1.35),
    lateralMeters/max(.25,puddleScale*.68)
  );
  vec2 puddleCell=floor(puddleGrid);
  vec2 puddleLocal=fract(puddleGrid);
  vec2 puddleCenter=vec2(
    .18+.64*hash21(puddleCell+vec2(seed,3.1)),
    .18+.64*hash21(puddleCell+vec2(7.7,seed))
  );
  vec2 puddleDelta=(puddleLocal-puddleCenter)*vec2(.76,1.58);
  float puddleDistance=length(puddleDelta);
  float puddleAA=max(fwidth(puddleDistance),.006);
  float puddleShape=1.0-smoothstep(.22-puddleAA,.43+puddleAA,puddleDistance);
  float puddleFill=clamp(puddleCoverage*(.28+.72*wet)+wet*.18,0.0,.82);
  float puddleChance=softPatternChance(hash21(puddleCell+vec2(seed,seed*.37)),puddleFill);
  float puddleDepthFactor=smoothstep(0.0,.035,puddleDepth);
  float puddles=puddleShape*puddleChance*(.22+.78*wet)*puddleDepthFactor*roadMask;

  float hoofStride=max(.22,hoofScale*4.1);
  float hoofStep=floor(longitudinalMeters/hoofStride+seed*.013);
  float hoofPhase=fract(longitudinalMeters/hoofStride+seed*.013)-.5;
  float hoofSide=(mod(hoofStep,2.0)<1.0?-1.0:1.0)*min(roadWidth*.16,.42);
  vec2 hoofDelta=vec2(hoofPhase*hoofStride/hoofScale,(lateralMeters-hoofSide)/hoofScale);
  float hoofDistance=length(hoofDelta*vec2(1.0,.82));
  float hoofShape=1.0-smoothstep(.72,1.18,hoofDistance);
  float hoofChance=softPatternChance(hash21(vec2(hoofStep,seed+11.0)),hoofDensity);
  float hoof=hoofShape*hoofChance*roadMask;

  float bootStride=max(.24,bootScale*4.6);
  float bootStep=floor(longitudinalMeters/bootStride+seed*.021);
  float bootPhase=fract(longitudinalMeters/bootStride+seed*.021)-.5;
  float bootSide=(mod(bootStep,2.0)<1.0?-1.0:1.0)*min(roadWidth*.12,.3);
  vec2 bootDelta=vec2(bootPhase*bootStride/(bootScale*1.45),(lateralMeters-bootSide)/bootScale);
  float bootDistance=length(bootDelta);
  float bootShape=1.0-smoothstep(.68,1.1,bootDistance);
  float bootChance=softPatternChance(hash21(vec2(bootStep+23.0,seed)),bootDensity);
  float boots=bootShape*bootChance*roadMask;

  float edgeWear=1.0-smoothstep(0.0,max(.18,roadWidth*.22),max(0.0,edgeDistance));
  float erosionNoise=.3+.7*noise2(vec2(longitudinalMeters*.18+seed*.11,lateralMeters*.52-seed*.03));
  erosionMask=clamp(erosionStrength*erosionNoise*(.3+.7*edgeWear)*roadMask,0.0,1.0);
  float relief=ruts*.7+puddles*puddleDepth*24.0+hoof*.42+boots*.34+erosionMask*.38;
  vec2 grain=vec2(
    noise2(vec2(longitudinalMeters*1.7+seed,lateralMeters*2.1))-.5,
    noise2(vec2(lateralMeters*2.3-seed,longitudinalMeters*1.5))-.5
  );
  float rutSide=sign(lateralMeters)*(1.0-smoothstep(0.0,max(.02,rutWidth),rutDistance));
  detailNormalXY=(grain*relief+vec2(0.0,rutSide*ruts*.32))*detailNormalStrength*roadMask;
  return clamp(vec4(puddles,ruts,hoof,boots),0.0,1.0);
}
float shadowFactor(){
  if(uShadowEnabled<0.5)return 1.0;
  vec3 proj=vShadowCoord.xyz/max(vShadowCoord.w,0.0001);
  proj=proj*0.5+0.5;
  if(proj.z<=0.0||proj.z>=1.0||proj.x<=0.0||proj.x>=1.0||proj.y<=0.0||proj.y>=1.0)return 1.0;
  vec2 texel=1.0/vec2(textureSize(uShadowMap,0));
  float current=proj.z-max(.0007,.0024*(1.0-max(dot(normalize(vNormal),normalize(-uLightDir)),0.0)));
  float sum=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    float closest=texture(uShadowMap,proj.xy+vec2(x,y)*texel).r;
    sum+=current<=closest?1.0:0.0;
  }
  return sum/9.0;
}
float distributionGGX(vec3 n,vec3 h,float roughness){
  float a=roughness*roughness,a2=a*a,nDotH=max(dot(n,h),0.0);
  float denominator=nDotH*nDotH*(a2-1.0)+1.0;
  return a2/max(PI*denominator*denominator,0.000001);
}
float geometrySchlickGGX(float nDotV,float roughness){
  float r=roughness+1.0,k=(r*r)/8.0;
  return nDotV/max(nDotV*(1.0-k)+k,0.000001);
}
float geometrySmith(vec3 n,vec3 v,vec3 l,float roughness){
  return geometrySchlickGGX(max(dot(n,v),0.0),roughness)*geometrySchlickGGX(max(dot(n,l),0.0),roughness);
}
vec3 fresnelSchlick(float cosTheta,vec3 f0){
  return f0+(1.0-f0)*pow(clamp(1.0-cosTheta,0.0,1.0),5.0);
}
vec3 evaluateDirectBRDF(vec3 albedo,vec3 n,vec3 viewDir,vec3 lightDir,vec3 radiance,float roughness,float metallic){
  vec3 halfDir=normalize(viewDir+lightDir);
  float nDotL=max(dot(n,lightDir),0.0),nDotV=max(dot(n,viewDir),0.0);
  if(nDotL<=0.0||nDotV<=0.0)return vec3(0.0);
  vec3 f0=mix(vec3(0.04),albedo,metallic);
  vec3 f=fresnelSchlick(max(dot(halfDir,viewDir),0.0),f0);
  float d=distributionGGX(n,halfDir,roughness),g=geometrySmith(n,viewDir,lightDir,roughness);
  vec3 specular=(d*g*f)/max(4.0*nDotV*nDotL,0.0001);
  vec3 diffuse=(vec3(1.0)-f)*(1.0-metallic)*albedo/PI;
  return (diffuse+specular)*radiance*nDotL;
}
vec3 applyWorldNormal(vec3 geometricNormal, vec3 sampledNormal, float strength){
  vec3 n=normalize(geometricNormal);
  vec3 tangent=normalize(vec3(1.0,0.0,0.0)-n*dot(n,vec3(1.0,0.0,0.0)));
  if(length(tangent)<.05)tangent=normalize(vec3(0.0,0.0,1.0)-n*dot(n,vec3(0.0,0.0,1.0)));
  vec3 bitangent=normalize(cross(n,tangent));
  sampledNormal.xy*=strength;
  return normalize(tangent*sampledNormal.x+bitangent*sampledNormal.y+n*max(.05,sampledNormal.z));
}
float nearestStructureMask(){
  float nearest=9999.0;
  for(int i=0;i<4;i++){if(i>=uStructureCount)break;nearest=min(nearest,length(vWorld.xz-uStructurePos[i].xz));}
  return 1.0-smoothstep(0.0,12.0,nearest);
}
vec3 applySurfaceRecipe(vec3 color, vec4 layers, vec4 extra, vec4 masks, vec4 masks2, vec4 masks3, vec4 weatherResponse, vec4 advanced, vec3 dirtColor, vec3 mossColor, vec3 snowColor, vec3 damageColor, vec3 n, vec2 uv, float lightAmount){
  float rawUp=smoothstep(.12,.92,n.y),upward=rawUp*masks.x;
  float downward=smoothstep(.12,.92,-n.y)*masks2.x;
  float slope=(1.0-rawUp)*masks.y;
  float macroScale=max(.1,advanced.x),detailScale=max(.05,advanced.y);
  float cavity=(1.0-noise2(uv*1.9+.17))*masks.z;
  float convex=noise2(uv*detailScale*1.73+.41)*masks3.w;
  float ground=(1.0-smoothstep(0.0,8.0,abs(vWorld.y)))*masks.w;
  float water=(1.0-smoothstep(0.0,2.0,abs(vWorld.y-uEnvironmentState.x)))*masks2.y;
  float sun=lightAmount*masks2.z,shade=(1.0-lightAmount)*masks2.w;
  float windFacing=(dot(normalize(n),normalize(uWindDirection))*.5+.5)*masks3.x*uEnvironmentState.w;
  float pathNear=vBlend*masks3.y;
  float structureNear=nearestStructureMask()*masks3.z;
  float weatherWet=clamp(uEnvironmentState.y*weatherResponse.x,0.0,1.0);
  float weatherSnow=clamp(uEnvironmentState.z*weatherResponse.y,0.0,1.0);
  float dirtMask=clamp(layers.x*(.12+cavity*.48+ground*.36+slope*.22+structureNear*.22+pathNear*.30+downward*.12),0.0,1.0);
  float mossMask=clamp(layers.y*(cavity*.42+ground*.24+shade*.58+water*.65)*(1.0-slope*.22),0.0,1.0);
  float wetMask=clamp(layers.z*(.35+cavity*.31+ground*.18+water*.72)+weatherWet,0.0,1.0);
  float snowMask=clamp((layers.w+weatherSnow)*upward*(.48+shade*.22)*(1.0-water*.65),0.0,1.0);
  float damageMask=clamp(extra.x*(noise2(uv*detailScale)+slope*.28+convex*.24+windFacing*.10),0.0,1.0);
  color=mix(color,dirtColor,dirtMask*.74);
  color=mix(color,mossColor,mossMask*.70);
  color*=1.0-wetMask*.30;
  color=mix(color,snowColor,snowMask*.90);
  color=mix(color,damageColor,damageMask*.46);
  float macro=(noise2(vWorld.xz/macroScale)-.5)*extra.y;
  return max(vec3(.001),color*(1.0+macro));
}
void main(){
  vec3 viewDir=normalize(uCameraPos-vWorld);
  vec2 baseUV=uIsTerrain>.5?vWorld.xz/max(uBaseTextureScale,0.05):vUV;
  vec2 pathUV=vWorld.xz/max(uPathTextureScale,0.05);
  float baseC=cos(uBaseTextureRotation),baseS=sin(uBaseTextureRotation);
  float pathC=cos(uPathTextureRotation),pathS=sin(uPathTextureRotation);
  baseUV=mat2(baseC,-baseS,baseS,baseC)*baseUV+uBaseTextureOffset;
  pathUV=mat2(pathC,-pathS,pathS,pathC)*pathUV+uPathTextureOffset;
  if(uUseBaseHeight>.5&&uBaseHeightStrength>0.0){
    float h=texture(uBaseHeightTexture,baseUV).r-.5;
    baseUV-=normalize(viewDir.xz+vec2(.0001))*h*uBaseHeightStrength;
  }
  if(uUsePathHeight>.5&&uPathHeightStrength>0.0){
    float h=texture(uPathHeightTexture,pathUV).r-.5;
    pathUV-=normalize(viewDir.xz+vec2(.0001))*h*uPathHeightStrength;
  }
  float blend=uIsTerrain>.5?smoothstep(.015,.985,clamp(vBlend+(noise2(vWorld.xz*.65)-.5)*.10,0.0,1.0)):0.0;

  vec3 baseFactor=mix(srgbToLinear(max(uBaseColor,vec3(0.0))),max(uBaseColor,vec3(0.0)),uBaseColorIsLinear);
  vec3 baseLinear=baseFactor;
  if(uUseBaseTexture>0.5){
    vec3 tex=texture(uBaseTexture,baseUV).rgb;
    baseLinear=srgbToLinear(max(tex,vec3(0.0)))*mix(vec3(1.0),baseFactor,clamp(uBaseTextureTintStrength,0.0,1.0));
  }else if(uIsTerrain>0.5){
    float macro=noise2(vWorld.xz*0.035)*0.22+noise2(vWorld.xz*0.21)*0.08;
    baseLinear*=0.82+macro;
  }

  vec3 pathLinear=srgbToLinear(max(uPathColor,vec3(0.0)));
  if(uUsePathTexture>0.5){
    vec3 ptex=texture(uPathTexture,pathUV).rgb;
    pathLinear=srgbToLinear(max(ptex,vec3(0.0)))*mix(vec3(1.0),pathLinear,clamp(uPathTextureTintStrength,0.0,1.0));
  }else{
    float grit=noise2(vWorld.xz*1.8)*0.18+noise2(vWorld.xz*.3)*.12;
    pathLinear*=.78+grit;
  }
  vec3 geometricN=normalize(vNormal);
  float recipeLight=max(dot(geometricN,normalize(-uLightDir)),0.0);
  baseLinear=applySurfaceRecipe(baseLinear,uBaseSurfaceLayers,uBaseSurfaceExtra,uBaseSurfaceMasks,uBaseSurfaceMasks2,uBaseSurfaceMasks3,uBaseWeatherResponse,uBaseAdvanced,uBaseDirtColor,uBaseMossColor,uBaseSnowColor,uBaseDamageColor,geometricN,baseUV,recipeLight);
  pathLinear=applySurfaceRecipe(pathLinear,uPathSurfaceLayers,uPathSurfaceExtra,uPathSurfaceMasks,uPathSurfaceMasks2,uPathSurfaceMasks3,uPathWeatherResponse,uPathAdvanced,uPathDirtColor,uPathMossColor,uPathSnowColor,uPathDamageColor,geometricN,pathUV,recipeLight);
  float pathErosion=0.0;
  vec2 pathDetailNormalXY=vec2(0.0);
  vec4 pathDetail=pathSurfaceDetailMasks(
    vUV,
    vSurfaceDetail0,
    vSurfaceDetail1,
    vSurfaceDetail2,
    vSurfaceDetail3,
    uEnvironmentState.y,
    pathErosion,
    pathDetailNormalXY
  );
  float pathDetailActive=step(.5,vSurfaceDetail0.x);
  float trafficWear=max(pathDetail.y,max(pathDetail.z,pathDetail.w));
  vec3 detailedSurface=uIsTerrain>.5?pathLinear:baseLinear;
  detailedSurface*=1.0-trafficWear*.19-pathErosion*.11;
  detailedSurface=mix(detailedSurface,detailedSurface*.24+vec3(.004,.006,.008),pathDetail.x*.78);
  detailedSurface=mix(detailedSurface,uPathDirtColor,pathErosion*.18);
  if(uIsTerrain>.5)baseLinear=mix(baseLinear,detailedSurface,blend);
  else baseLinear=mix(baseLinear,detailedSurface,pathDetailActive);

  vec3 n=geometricN;
  if(uIsTerrain>.5){
    vec3 baseN=uUseBaseNormal>.5?texture(uBaseNormalTexture,baseUV).xyz*2.0-1.0:vec3(0,0,1);
    vec3 pathN=uUsePathNormal>.5?texture(uPathNormalTexture,pathUV).xyz*2.0-1.0:vec3(0,0,1);
    vec3 mapped=mix(normalize(vec3(baseN.xy*uBaseNormalStrength,max(.05,baseN.z))),normalize(vec3(pathN.xy*uPathNormalStrength,max(.05,pathN.z))),blend);
    n=applyWorldNormal(n,mapped,1.0);
  }else if(uUseBaseNormal>.5){
    vec3 baseN=texture(uBaseNormalTexture,baseUV).xyz*2.0-1.0;
    n=applyWorldNormal(n,baseN,uBaseNormalStrength);
  }
  if(pathDetailActive>.5){
    n=applyWorldNormal(n,normalize(vec3(pathDetailNormalXY,1.0)),1.0);
  }

  float roughness=clamp(uRoughness,0.03,1.0);
  float baseR=(uUseBaseRoughness>.5?texture(uBaseRoughnessTexture,baseUV).r:roughness)*uBaseRoughnessMultiplier;
  float pathR=(uUsePathRoughness>.5?texture(uPathRoughnessTexture,pathUV).r:roughness)*uPathRoughnessMultiplier;
  baseR=clamp(baseR,.03,1.0);pathR=clamp(pathR,.03,1.0);
  roughness=uIsTerrain>.5?mix(baseR,pathR,blend):baseR;
  float roughVariation=uIsTerrain>.5?mix(uBaseSurfaceExtra.w,uPathSurfaceExtra.w,blend):uBaseSurfaceExtra.w;roughness=clamp(roughness+(noise2(vWorld.xz*.31)-.5)*roughVariation,.03,1.0);
  roughness=mix(roughness,.14,pathDetail.x*.9);
  roughness=mix(roughness,.92,trafficWear*.42);
  roughness=mix(roughness,.96,pathErosion*.28);
  vec4 recipeLayers=uIsTerrain>.5?mix(uBaseSurfaceLayers,uPathSurfaceLayers,blend):uBaseSurfaceLayers;
  roughness=mix(roughness,.18,clamp(recipeLayers.z,0.0,1.0)*.72);
  roughness=mix(roughness,.88,clamp(recipeLayers.w,0.0,1.0)*smoothstep(.2,.9,n.y));
  float baseAO=mix(1.0,uUseBaseAO>.5?texture(uBaseAOTexture,baseUV).r:1.0,clamp(uBaseAOStrength,0.0,2.0));
  float pathAO=mix(1.0,uUsePathAO>.5?texture(uPathAOTexture,pathUV).r:1.0,clamp(uPathAOStrength,0.0,2.0));
  float materialAO=clamp(uIsTerrain>.5?mix(baseAO,pathAO,blend):baseAO,0.0,1.25);

  vec3 lightDir=normalize(-uLightDir);
  float ndl=max(dot(n,lightDir),0.0);
  float shadow=shadowFactor();
  float hemi=n.y*.5+.5;
  vec3 ambientAuthority=srgbToLinear(max(uAmbientColor,vec3(0.0)));
  float upFacing=max(n.y,0.0),downFacing=max(-n.y,0.0),horizonFacing=1.0-abs(n.y);
  vec3 directionalSky=srgbToLinear(max(uSkyZenithColor,vec3(0.0)))*upFacing
    +srgbToLinear(max(uSkyHorizonColor,vec3(0.0)))*horizonFacing
    +srgbToLinear(max(uSkyGroundColor,vec3(0.0)))*downFacing;
  float authorityLuma=max(dot(ambientAuthority,vec3(0.2126,0.7152,0.0722)),0.001);
  float directionalLuma=max(dot(directionalSky,vec3(0.2126,0.7152,0.0722)),0.001);
  directionalSky*=authorityLuma/directionalLuma;
  vec3 ambientIrradiance=mix(ambientAuthority,directionalSky,0.18);
  vec3 ambient=ambientIrradiance*uAmbientIntensity*(.38+.62*hemi)*materialAO;
  vec3 editorAmbient=baseLinear*vec3(uEditorFill)*(.55+.45*hemi)*materialAO;
  float moonNdl=max(dot(n,normalize(uMoonDir)),0.0);
  vec3 color=baseLinear*ambient+editorAmbient;
  color+=evaluateDirectBRDF(baseLinear,n,viewDir,lightDir,srgbToLinear(uLightColor)*uLightIntensity*shadow,roughness,uMetallic);
  color+=evaluateDirectBRDF(baseLinear,n,viewDir,normalize(uMoonDir),srgbToLinear(uMoonColor)*uMoonIntensity,roughness,uMetallic);

  for(int i=0;i<4;i++){
    if(i>=uPointCount)break;
    vec3 toL=uPointPos[i]-vWorld;
    float dist=length(toL),range=uPointData[i].y;
    float normalizedDistance=dist/max(range,0.001);
    float rangeWindow=clamp(1.0-pow(normalizedDistance,4.0),0.0,1.0);
    float attenuation=(rangeWindow*rangeWindow)/max(dist*dist,0.25);
    color+=evaluateDirectBRDF(baseLinear,n,viewDir,normalize(toL),srgbToLinear(uPointColor[i])*uPointData[i].x*attenuation,roughness,uMetallic);
  }

  float rim=pow(1.0-max(dot(viewDir,n),0.0),4.0)*.028;
  color+=rim;
  color=mix(color,color+vec3(.18,.055,.34),uSelected*.25);
  float distanceToCamera=length(uCameraPos-vWorld);
  float extinction=4.60517/max(1.0,uFogFar-uFogNear);
  float transmittance=exp(-extinction*max(0.0,distanceToCamera-uFogNear));
  color=mix(srgbToLinear(max(uFogColor,vec3(0.0))),color,transmittance);
  outColor=vec4(max(color,vec3(0.0)),clamp(uOpacity,0.0,1.0));
}`;
const depthVS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=4) in vec4 aInstance0;
layout(location=5) in vec4 aInstance1;
layout(location=6) in vec4 aInstance2;
layout(location=7) in vec4 aInstance3;
uniform mat4 uModel;
uniform mat4 uLightViewProj;
uniform float uInstanced;
void main(){mat4 instanceModel=mat4(aInstance0,aInstance1,aInstance2,aInstance3);mat4 model=uInstanced>.5?instanceModel:uModel;gl_Position=uLightViewProj*model*vec4(aPosition,1.0);}`;
const depthFS=`#version 300 es
precision highp float;
void main(){}`;
const lineVS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main(){gl_Position=uViewProj*uModel*vec4(aPosition,1.0);}`;
const lineFS=`#version 300 es
precision highp float;
out vec4 outColor;
uniform vec4 uColor;
void main(){outColor=uColor;}`;

function meshData(positions,normals,indices,uvs=null,blends=null){
  const count=positions.length/3;
  return {
    positions:new Float32Array(positions),normals:new Float32Array(normals),indices:new Uint32Array(indices),
    uvs:new Float32Array(uvs||Array.from({length:count*2},()=>0)),
    blends:new Float32Array(blends||Array.from({length:count},()=>0))
  };
}
function cubeMesh(){
  const p=[],n=[],i=[],uv=[];
  const faces=[
    [[0,0,1],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],
    [[0,0,-1],[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],
    [[1,0,0],[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],
    [[-1,0,0],[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],
    [[0,1,0],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],
    [[0,-1,0],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]
  ];
  faces.forEach(f=>{const base=p.length/3;for(let v=1;v<5;v++){p.push(...f[v]);n.push(...f[0]);}uv.push(0,0,1,0,1,1,0,1);i.push(base,base+1,base+2,base,base+2,base+3);});
  return meshData(p,n,i,uv);
}
function planeMesh(){return meshData([-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5],[0,1,0,0,1,0,0,1,0,0,1,0],[0,1,2,0,2,3],[0,0,1,0,1,1,0,1]);}
function sphereMesh(seg=32,rings=20){
  const p=[],n=[],idx=[],uv=[];
  for(let y=0;y<=rings;y++)for(let x=0;x<=seg;x++){
    const v=y/rings,u=x/seg,phi=v*Math.PI,theta=u*Math.PI*2;
    const nx=Math.sin(phi)*Math.sin(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.cos(theta);
    p.push(nx*.5,ny*.5,nz*.5);n.push(nx,ny,nz);uv.push(u,1-v);
  }
  for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){const a=y*(seg+1)+x,b=a+seg+1;idx.push(a,b,a+1,b,b+1,a+1);}
  return meshData(p,n,idx,uv);
}
function cylinderMesh(seg=32){
  const p=[],n=[],idx=[],uv=[];
  for(let y=0;y<2;y++)for(let s=0;s<=seg;s++){
    const a=s/seg*Math.PI*2,x=Math.sin(a)*.5,z=Math.cos(a)*.5;
    p.push(x,y-.5,z);n.push(Math.sin(a),0,Math.cos(a));uv.push(s/seg,y);
  }
  for(let s=0;s<seg;s++){const a=s,b=s+seg+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const topCenter=p.length/3;p.push(0,.5,0);n.push(0,1,0);uv.push(.5,.5);
  const bottomCenter=p.length/3;p.push(0,-.5,0);n.push(0,-1,0);uv.push(.5,.5);
  for(let s=0;s<seg;s++){
    const a=s/seg*Math.PI*2,b=(s+1)/seg*Math.PI*2;
    const ta=p.length/3;p.push(Math.sin(a)*.5,.5,Math.cos(a)*.5,Math.sin(b)*.5,.5,Math.cos(b)*.5);n.push(0,1,0,0,1,0);uv.push(.5+Math.sin(a)*.5,.5+Math.cos(a)*.5,.5+Math.sin(b)*.5,.5+Math.cos(b)*.5);idx.push(topCenter,ta,ta+1);
    const ba=p.length/3;p.push(Math.sin(b)*.5,-.5,Math.cos(b)*.5,Math.sin(a)*.5,-.5,Math.cos(a)*.5);n.push(0,-1,0,0,-1,0);uv.push(.5+Math.sin(b)*.5,.5+Math.cos(b)*.5,.5+Math.sin(a)*.5,.5+Math.cos(a)*.5);idx.push(bottomCenter,ba,ba+1);
  }
  return meshData(p,n,idx,uv);
}

export function terrainHeight(terrain,x,z,paths=[]){return sharedTerrainHeightAt(terrain,x,z,paths);}
export function pathBlendAt(paths,x,z){return sharedPathBlendAt(paths,x,z);}
export function activePathChunkKeys(pathRuntimes,chunkSize){
  const active=new Set();
  for(const runtime of pathRuntimes||[]){
    const modifier=runtime?.terrainModifier;
    if(!modifier)continue;
    if(Math.abs(Number(modifier.chunkSize)-chunkSize)<1e-7){
      for(const key of modifier.terrainDirtyChunkKeys||[])active.add(key);
      continue;
    }
    // A caller may intentionally compile paths at a different streaming tile
    // size. Remap only the modifier's explicit terrain-active bounds; never
    // infer terrain ownership from bridge/tunnel mode in the renderer.
    for(const entry of modifier.terrainEntries||[])for(const bounds of entry.terrainBounds||[]){
      const minX=Math.floor(bounds.minX/chunkSize),maxX=Math.floor(bounds.maxX/chunkSize);
      const minZ=Math.floor(bounds.minZ/chunkSize),maxZ=Math.floor(bounds.maxZ/chunkSize);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)active.add(`${x}:${z}`);
    }
    // Junction terrain is compiled from the shared validated junction polygon
    // rather than a segment corridor. When the renderer streams at a
    // different chunk size, include those explicit polygon bounds as well so
    // the junction underlay cannot silently fall back to coarse authored
    // terrain and poke through the finished intersection.
    for(const entry of modifier.junctionEntries||[]){
      const bounds=entry?.bounds;
      if(!bounds)continue;
      const minX=Math.floor(bounds.minX/chunkSize),maxX=Math.floor(bounds.maxX/chunkSize);
      const minZ=Math.floor(bounds.minZ/chunkSize),maxZ=Math.floor(bounds.maxZ/chunkSize);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)active.add(`${x}:${z}`);
    }
  }
  return active;
}
function rendererTerrainSamplingRuntimes(pathRuntimes,chunkSize){
  // Terrain modifiers are compiled at the world streaming chunk size (often
  // 64 m). Querying that broad entry bucket for every 0.625 m terrain vertex
  // repeatedly normalized every cross section in the chunk and blocked the
  // renderer thread for seconds. Build an immutable renderer-local fine index
  // over the modifier's explicit terrain-active bounds. Sampling still uses
  // samplePathTerrainModifier through sampleScenePathTerrain, so the height
  // result is unchanged; only unrelated entries are removed from each query.
  const fineChunkSize=clamp((Number(chunkSize)||64)/16,1,4),result=[];
  let indexedEntryCount=0,indexedCellReferenceCount=0;
  for(const runtime of pathRuntimes||[]){
    const modifier=runtime?.terrainModifier;
    if(!modifier)continue;
    const chunks=new Map();
    const register=(entry,boundsList)=>{
      const visited=new Set();
      for(const bounds of boundsList||[]){
        if(!bounds)continue;
        const minX=Math.floor(bounds.minX/fineChunkSize),maxX=Math.floor(bounds.maxX/fineChunkSize);
        const minZ=Math.floor(bounds.minZ/fineChunkSize),maxZ=Math.floor(bounds.maxZ/fineChunkSize);
        for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
          const key=`${x}:${z}`;
          if(visited.has(key))continue;
          visited.add(key);
          if(!chunks.has(key))chunks.set(key,[]);
          chunks.get(key).push(entry);indexedCellReferenceCount+=1;
        }
      }
      if(visited.size)indexedEntryCount+=1;
    };
    for(const entry of modifier.terrainEntries||[])register(entry,entry.terrainBounds||[]);
    for(const entry of modifier.junctionEntries||[])register(entry,[entry.bounds]);
    if(chunks.size)result.push({...runtime,terrainModifier:{...modifier,chunkSize:fineChunkSize,chunks}});
  }
  result.samplingDiagnostics={fineChunkSize,indexedEntryCount,indexedCellReferenceCount,queryCount:0,fastRejectCount:0};
  return result;
}
function pathTerrainVertexSample(object,pathRuntimes,x,z){
  const baseY=terrainBaseHeightAt(object,x,z),pathSample=sampleScenePathTerrain(pathRuntimes,baseY,x,z);
  const diagnostics=pathRuntimes?.samplingDiagnostics;
  if(diagnostics){diagnostics.queryCount+=1;if(!pathSample.terrainApplied)diagnostics.fastRejectCount+=1;}
  return {
    height:pathSample.height,
    // Path Network v2 renders the road, shoulder, gutter, curb, sidewalk, and
    // earthwork as their own compiled surfaces. Painting the supporting
    // terrain with the road material created a second, nearly coplanar road
    // layer and the colliding textures reported on the target PC. The terrain
    // mesh now owns only terrain material; the compiled surface owns the path.
    blend:0
  };
}
const TERRAIN_PATH_SURFACE_CLEARANCE=.002;
const TERRAIN_CLIP_EPSILON=1e-7;
const TERRAIN_CLIP_BOUNDARY_GUARD=.00025;
function polygonAreaXZ(polygon){
  let area=0;
  for(let index=0;index<polygon.length;index+=1){
    const current=polygon[index],next=polygon[(index+1)%polygon.length];
    area+=current[0]*next[1]-next[0]*current[1];
  }
  return area*.5;
}
function cleanPolygonXZ(polygon,tolerance=1e-7){
  const cleaned=[];
  for(const point of polygon||[]){
    if(!cleaned.length||Math.hypot(point[0]-cleaned.at(-1)[0],point[1]-cleaned.at(-1)[1])>tolerance)cleaned.push(point);
  }
  if(cleaned.length>2&&Math.hypot(cleaned[0][0]-cleaned.at(-1)[0],cleaned[0][1]-cleaned.at(-1)[1])<=tolerance)cleaned.pop();
  let changed=true;
  while(changed&&cleaned.length>3){
    changed=false;
    for(let index=0;index<cleaned.length;index+=1){
      const previous=cleaned[(index+cleaned.length-1)%cleaned.length],current=cleaned[index],next=cleaned[(index+1)%cleaned.length];
      const turn=(current[0]-previous[0])*(next[1]-current[1])-(current[1]-previous[1])*(next[0]-current[0]);
      if(Math.abs(turn)<=tolerance){cleaned.splice(index,1);changed=true;break;}
    }
  }
  return cleaned;
}
function clipPolygonByLineXZ(polygon,start,end,keepInside=true,outsideGuard=0){
  if(polygon.length<3)return [];
  const side=point=>(end[0]-start[0])*(point[1]-start[1])-(end[1]-start[1])*(point[0]-start[0]);
  const outsideThreshold=-Math.hypot(end[0]-start[0],end[1]-start[1])*outsideGuard;
  const output=[];
  for(let index=0;index<polygon.length;index+=1){
    const current=polygon[index],next=polygon[(index+1)%polygon.length];
    const currentSide=side(current),nextSide=side(next),threshold=keepInside?-TERRAIN_CLIP_EPSILON:outsideThreshold;
    const currentInside=keepInside?currentSide>=threshold:currentSide<=threshold;
    const nextInside=keepInside?nextSide>=threshold:nextSide<=threshold;
    if(currentInside)output.push(current);
    if(currentInside!==nextInside){
      const amount=(currentSide-threshold)/(currentSide-nextSide||1);
      output.push([lerp(current[0],next[0],amount),lerp(current[1],next[1],amount)]);
    }
  }
  return cleanPolygonXZ(output);
}
function intersectConvexPolygonsXZ(subject,clip){
  let result=[...subject],boundary=polygonAreaXZ(clip)<0?[...clip].reverse():clip;
  for(let index=0;index<boundary.length&&result.length>=3;index+=1){
    result=clipPolygonByLineXZ(result,boundary[index],boundary[(index+1)%boundary.length],true);
  }
  return result;
}
function subtractConvexPolygonXZ(subject,clip){
  const boundary=polygonAreaXZ(clip)<0?[...clip].reverse():clip;
  let inside=[subject],outside=[];
  for(let index=0;index<boundary.length&&inside.length;index+=1){
    const nextInside=[];
    for(const polygon of inside){
      // Keep the visible terrain a sub-millimetre beyond the travel-surface
      // boundary. Without this guard, Float32 upload can round an exactly
      // shared edge back through the road and produce flickering hairline
      // slivers even though the double-precision clipping result is exact.
      const retained=clipPolygonByLineXZ(polygon,boundary[index],boundary[(index+1)%boundary.length],false,TERRAIN_CLIP_BOUNDARY_GUARD);
      const candidate=clipPolygonByLineXZ(polygon,boundary[index],boundary[(index+1)%boundary.length],true);
      if(retained.length>=3&&Math.abs(polygonAreaXZ(retained))>TERRAIN_CLIP_EPSILON)outside.push(retained);
      if(candidate.length>=3&&Math.abs(polygonAreaXZ(candidate))>TERRAIN_CLIP_EPSILON)nextInside.push(candidate);
    }
    inside=nextInside;
  }
  return outside;
}
function barycentricXZ(point,triangle){
  const [a,b,c]=triangle,denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(denominator)<=TERRAIN_CLIP_EPSILON)return [1,0,0];
  const first=((b[1]-c[1])*(point[0]-c[0])+(c[0]-b[0])*(point[1]-c[1]))/denominator;
  const second=((c[1]-a[1])*(point[0]-c[0])+(a[0]-c[0])*(point[1]-c[1]))/denominator;
  return [first,second,1-first-second];
}
function interpolateTriangleValueXZ(point,triangle,values){
  const weights=barycentricXZ(point,triangle);
  return values[0]*weights[0]+values[1]*weights[1]+values[2]*weights[2];
}
function clipPolygonBySurfacePenetration(polygon,terrainTriangle,surfaceTriangle,clearance){
  if(polygon.length<3)return [];
  const value=point=>interpolateTriangleValueXZ(point,terrainTriangle.points,terrainTriangle.heights)
    -interpolateTriangleValueXZ(point,surfaceTriangle.points,surfaceTriangle.heights)+clearance;
  const output=[];
  for(let index=0;index<polygon.length;index+=1){
    const current=polygon[index],next=polygon[(index+1)%polygon.length],currentValue=value(current),nextValue=value(next);
    const currentInside=currentValue>=-TERRAIN_CLIP_EPSILON,nextInside=nextValue>=-TERRAIN_CLIP_EPSILON;
    if(currentInside)output.push(current);
    if(currentInside!==nextInside){
      const amount=currentValue/(currentValue-nextValue||1);
      output.push([lerp(current[0],next[0],amount),lerp(current[1],next[1],amount)]);
    }
  }
  return cleanPolygonXZ(output);
}
function pointSegmentDistanceSquaredXZ(point,start,end){
  const dx=end[0]-start[0],dz=end[2]-start[2],denominator=dx*dx+dz*dz;
  const amount=denominator>1e-12?clamp(((point[0]-start[0])*dx+(point[1]-start[2])*dz)/denominator,0,1):0;
  const offsetX=point[0]-lerp(start[0],end[0],amount),offsetZ=point[1]-lerp(start[2],end[2],amount);
  return offsetX*offsetX+offsetZ*offsetZ;
}
function pathSurfaceConstructionClassifier(runtime,chunkSize){
  const segments=runtime?.compiled?.segments||[],modes=new Set();
  for(const segment of segments)for(const interval of segment.constructionIntervals||[])modes.add(interval.mode);
  const disallowed=new Set(['tunnel','invalid']);
  if(![...modes].some(mode=>disallowed.has(mode)))return {allows:()=>true,kind:'all-visible',queryCount:0,pairTestCount:0};
  if(modes.size&&[...modes].every(mode=>disallowed.has(mode)))return {allows:()=>false,kind:'all-hidden',queryCount:0,pairTestCount:0};

  // Mixed construction needs per-triangle classification, but it does not
  // need the full terrain modifier sampler (which normalizes cross sections
  // and searches every corridor). Index the already-compiled station pairs
  // once and resolve the nearest pair in a compact grid.
  const cellSize=clamp(Number(chunkSize)||8,4,16),cells=new Map(),pairs=[];
  const registerPair=pair=>{
    pair.id=pairs.length;pairs.push(pair);
    const minX=Math.floor((Math.min(pair.start[0],pair.end[0])-cellSize)/cellSize),maxX=Math.floor((Math.max(pair.start[0],pair.end[0])+cellSize)/cellSize);
    const minZ=Math.floor((Math.min(pair.start[2],pair.end[2])-cellSize)/cellSize),maxZ=Math.floor((Math.max(pair.start[2],pair.end[2])+cellSize)/cellSize);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(pair);
    }
  };
  for(const segment of segments){
    const samples=segment.samples||[],intervals=segment.constructionIntervals||[];
    const modeAt=distance=>intervals.find(interval=>distance>=interval.startDistance-1e-6&&distance<=interval.endDistance+1e-6)?.mode||segment.construction?.mode||'invalid';
    for(let index=0;index<samples.length-1;index+=1){
      const start=samples[index],end=samples[index+1],distance=(Number(start.distance||0)+Number(end.distance||0))*.5;
      registerPair({start:start.position,end:end.position,mode:modeAt(distance)});
    }
  }
  const classifier={kind:'mixed',queryCount:0,pairTestCount:0};
  classifier.allows=point=>{
    classifier.queryCount+=1;
    const candidates=cells.get(`${Math.floor(point[0]/cellSize)}:${Math.floor(point[1]/cellSize)}`)||pairs;
    let nearest=null,nearestDistance=Infinity;
    for(const pair of candidates){
      classifier.pairTestCount+=1;
      const distance=pointSegmentDistanceSquaredXZ(point,pair.start,pair.end);
      if(distance<nearestDistance){nearestDistance=distance;nearest=pair;}
    }
    return nearest&&!disallowed.has(nearest.mode);
  };
  return classifier;
}
function pathTerrainSurfaceMasks(pathRuntimes,chunkSize){
  // Only horizontal travel surfaces own visibility against terrain. Earthwork
  // deliberately meets the authored terrain at its outer boundary, while
  // curb/edge meshes are vertical closures and must not cut extra holes.
  const triangles=[],chunks=new Map(),renderMeshes=['road','shoulder','gutter','sidewalk'];
  const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  let consideredTriangleCount=0,constructionRejectedTriangleCount=0,constructionClassifierQueryCount=0,constructionClassifierPairTestCount=0;
  const register=triangle=>{
    triangle.id=triangles.length;triangles.push(triangle);
    bounds.minX=Math.min(bounds.minX,triangle.bounds.minX);bounds.maxX=Math.max(bounds.maxX,triangle.bounds.maxX);
    bounds.minZ=Math.min(bounds.minZ,triangle.bounds.minZ);bounds.maxZ=Math.max(bounds.maxZ,triangle.bounds.maxZ);
    const minChunkX=Math.floor(triangle.bounds.minX/chunkSize),maxChunkX=Math.floor(triangle.bounds.maxX/chunkSize);
    const minChunkZ=Math.floor(triangle.bounds.minZ/chunkSize),maxChunkZ=Math.floor(triangle.bounds.maxZ/chunkSize);
    for(let x=minChunkX;x<=maxChunkX;x++)for(let z=minChunkZ;z<=maxChunkZ;z++){
      const key=`${x}:${z}`;if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(triangle);
    }
  };
  for(const runtime of pathRuntimes||[]){
    const classifier=pathSurfaceConstructionClassifier(runtime,chunkSize);
    const meshes=runtime?.geometry?.meshes||{};
    for(const meshName of [...renderMeshes,'structure']){
      const mesh=meshes[meshName];if(!mesh?.indices?.length)continue;
      for(let offset=0;offset<mesh.indices.length;offset+=3){
        consideredTriangleCount+=1;
        const vertexIndices=[mesh.indices[offset],mesh.indices[offset+1],mesh.indices[offset+2]];
        const role=mesh.roles?.[vertexIndices[0]]||'';
        if(meshName==='structure'&&!/^bridge-.*deck/.test(role))continue;
        const vertices=vertexIndices.map(index=>Array.from(mesh.positions.slice(index*3,index*3+3)));
        const face=cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0]));
        if(face[1]<=TERRAIN_CLIP_EPSILON)continue;
        const points=vertices.map(point=>[point[0],point[2]]);
        if(Math.abs(polygonAreaXZ(points))<=TERRAIN_CLIP_EPSILON)continue;
        const centerX=(vertices[0][0]+vertices[1][0]+vertices[2][0])/3,centerZ=(vertices[0][2]+vertices[1][2]+vertices[2][2])/3;
        // A tunnel's visible floor is intentionally below untouched terrain;
        // its projected footprint must never punch a skylight through the
        // terrain above it. Invalid work likewise has no production surface.
        if(meshName!=='structure'&&!classifier.allows([centerX,centerZ])){constructionRejectedTriangleCount+=1;continue;}
        register({
          points:polygonAreaXZ(points)<0?[...points].reverse():points,
          heights:polygonAreaXZ(points)<0?vertices.map(point=>point[1]).reverse():vertices.map(point=>point[1]),
          bounds:{
            minX:Math.min(...points.map(point=>point[0])),maxX:Math.max(...points.map(point=>point[0])),
            minZ:Math.min(...points.map(point=>point[1])),maxZ:Math.max(...points.map(point=>point[1]))
          }
        });
      }
    }
    constructionClassifierQueryCount+=classifier.queryCount;
    constructionClassifierPairTestCount+=classifier.pairTestCount;
  }
  return {
    triangles,chunks,chunkSize,bounds,
    consideredTriangleCount,
    constructionRejectedTriangleCount,
    constructionClassifierQueryCount,
    constructionClassifierPairTestCount,
    nextQueryId:1
  };
}
function maskTrianglesForBounds(mask,bounds){
  const candidates=[],queryId=mask.nextQueryId++,minChunkX=Math.floor(bounds.minX/mask.chunkSize),maxChunkX=Math.floor(bounds.maxX/mask.chunkSize),minChunkZ=Math.floor(bounds.minZ/mask.chunkSize),maxChunkZ=Math.floor(bounds.maxZ/mask.chunkSize);
  for(let x=minChunkX;x<=maxChunkX;x++)for(let z=minChunkZ;z<=maxChunkZ;z++)for(const triangle of mask.chunks.get(`${x}:${z}`)||[]){
    if(triangle.lastQueryId===queryId)continue;
    triangle.lastQueryId=queryId;candidates.push(triangle);
  }
  return candidates;
}
function clipTerrainTrianglesAgainstPathSurfaces({positions,indices,uvs,blends,origin,pathRuntimes,chunkSize}){
  // The terrain streaming chunk is deliberately coarse. A separate compact
  // surface-mask grid prevents every terrain triangle from testing hundreds
  // of unrelated road triangles in that chunk.
  const startedAt=globalThis.performance?.now?.()??Date.now();
  const mask=pathTerrainSurfaceMasks(pathRuntimes,clamp(chunkSize/16,1,4)),maskBuiltAt=globalThis.performance?.now?.()??Date.now(),originalTriangleCount=indices.length/3;
  const emptyResult={
    maskTriangleCount:0,inputTriangleCount:originalTriangleCount,outputTriangleCount:originalTriangleCount,clippedTriangleCount:0,removedTriangleCount:0,addedVertexCount:0,
    terrainTriangleFastRejectCount:originalTriangleCount,terrainTriangleCandidateQueryCount:0,surfaceTriangleBoundsTestCount:0,surfaceTriangleIntersectionTestCount:0,
    consideredSurfaceTriangleCount:mask.consideredTriangleCount,constructionRejectedSurfaceTriangleCount:mask.constructionRejectedTriangleCount,
    constructionClassifierQueryCount:mask.constructionClassifierQueryCount,constructionClassifierPairTestCount:mask.constructionClassifierPairTestCount,
    maskBuildDurationMs:maskBuiltAt-startedAt,clipDurationMs:0
  };
  if(!mask.triangles.length)return emptyResult;
  const [ox,oy,oz]=origin,nextIndices=[];let clippedTriangleCount=0,removedTriangleCount=0,addedVertexCount=0,terrainTriangleFastRejectCount=0,terrainTriangleCandidateQueryCount=0,surfaceTriangleBoundsTestCount=0,surfaceTriangleIntersectionTestCount=0;
  const pointForIndex=index=>[positions[index*3]+ox,positions[index*3+1]+oy,positions[index*3+2]+oz];
  for(let offset=0;offset<indices.length;offset+=3){
    const sourceIndices=[indices[offset],indices[offset+1],indices[offset+2]];
    const ia=sourceIndices[0]*3,ib=sourceIndices[1]*3,ic=sourceIndices[2]*3;
    const ax=positions[ia]+ox,az=positions[ia+2]+oz,bx=positions[ib]+ox,bz=positions[ib+2]+oz,cx=positions[ic]+ox,cz=positions[ic+2]+oz;
    const bounds={minX:Math.min(ax,bx,cx),maxX:Math.max(ax,bx,cx),minZ:Math.min(az,bz,cz),maxZ:Math.max(az,bz,cz)};
    if(mask.bounds.maxX<bounds.minX||mask.bounds.minX>bounds.maxX||mask.bounds.maxZ<bounds.minZ||mask.bounds.minZ>bounds.maxZ){
      nextIndices.push(...sourceIndices);terrainTriangleFastRejectCount+=1;continue;
    }
    const candidates=maskTrianglesForBounds(mask,bounds);terrainTriangleCandidateQueryCount+=1;
    if(!candidates.length){nextIndices.push(...sourceIndices);terrainTriangleFastRejectCount+=1;continue;}
    const vertices=sourceIndices.map(pointForIndex),points=[[ax,az],[bx,bz],[cx,cz]];
    const signedArea=polygonAreaXZ(points);
    if(Math.abs(signedArea)<=TERRAIN_CLIP_EPSILON)continue;
    const triangle={points,heights:vertices.map(point=>point[1])};
    let fragments=[signedArea<0?[...points].reverse():points],clipped=false;
    for(const surface of candidates){
      surfaceTriangleBoundsTestCount+=1;
      if(surface.bounds.maxX<bounds.minX||surface.bounds.minX>bounds.maxX||surface.bounds.maxZ<bounds.minZ||surface.bounds.minZ>bounds.maxZ)continue;
      const nextFragments=[];
      for(const fragment of fragments){
        surfaceTriangleIntersectionTestCount+=1;
        const overlap=intersectConvexPolygonsXZ(fragment,surface.points);
        if(overlap.length<3||Math.abs(polygonAreaXZ(overlap))<=TERRAIN_CLIP_EPSILON){nextFragments.push(fragment);continue;}
        const penetration=clipPolygonBySurfacePenetration(overlap,triangle,surface,TERRAIN_PATH_SURFACE_CLEARANCE);
        if(penetration.length<3||Math.abs(polygonAreaXZ(penetration))<=TERRAIN_CLIP_EPSILON){nextFragments.push(fragment);continue;}
        nextFragments.push(...subtractConvexPolygonXZ(fragment,penetration));clipped=true;
      }
      fragments=nextFragments;if(!fragments.length)break;
    }
    if(!clipped){nextIndices.push(...sourceIndices);continue;}
    clippedTriangleCount+=1;
    if(!fragments.length){removedTriangleCount+=1;continue;}
    const sourceUV=sourceIndices.map(index=>[uvs[index*2],uvs[index*2+1]]),sourceBlend=sourceIndices.map(index=>blends[index]);
    for(const fragment of fragments){
      const polygon=cleanPolygonXZ(fragment);
      if(polygon.length<3||Math.abs(polygonAreaXZ(polygon))<=TERRAIN_CLIP_EPSILON)continue;
      const fragmentIndices=polygon.map(point=>{
        const weights=barycentricXZ(point,triangle.points),index=positions.length/3;
        const worldY=triangle.heights[0]*weights[0]+triangle.heights[1]*weights[1]+triangle.heights[2]*weights[2];
        positions.push(point[0]-ox,worldY-oy,point[1]-oz);
        uvs.push(
          sourceUV[0][0]*weights[0]+sourceUV[1][0]*weights[1]+sourceUV[2][0]*weights[2],
          sourceUV[0][1]*weights[0]+sourceUV[1][1]*weights[1]+sourceUV[2][1]*weights[2]
        );
        blends.push(sourceBlend[0]*weights[0]+sourceBlend[1]*weights[1]+sourceBlend[2]*weights[2]);
        addedVertexCount+=1;return index;
      });
      // Counter-clockwise X/Z winding points down in this Y-up coordinate
      // system. Emit the fan in reverse order to preserve upward terrain faces.
      for(let index=1;index<fragmentIndices.length-1;index+=1)nextIndices.push(fragmentIndices[0],fragmentIndices[index+1],fragmentIndices[index]);
    }
  }
  indices.length=nextIndices.length;
  for(let index=0;index<nextIndices.length;index+=1)indices[index]=nextIndices[index];
  if(clippedTriangleCount){
    const remap=new Map(),compactPositions=[],compactUVs=[],compactBlends=[];
    for(let offset=0;offset<indices.length;offset+=1){
      const sourceIndex=indices[offset];
      let targetIndex=remap.get(sourceIndex);
      if(targetIndex===undefined){
        targetIndex=compactPositions.length/3;remap.set(sourceIndex,targetIndex);
        compactPositions.push(...positions.slice(sourceIndex*3,sourceIndex*3+3));
        compactUVs.push(...uvs.slice(sourceIndex*2,sourceIndex*2+2));
        compactBlends.push(blends[sourceIndex]);
      }
      indices[offset]=targetIndex;
    }
    positions.length=compactPositions.length;
    for(let index=0;index<compactPositions.length;index+=1)positions[index]=compactPositions[index];
    uvs.length=compactUVs.length;
    for(let index=0;index<compactUVs.length;index+=1)uvs[index]=compactUVs[index];
    blends.length=compactBlends.length;
    for(let index=0;index<compactBlends.length;index+=1)blends[index]=compactBlends[index];
  }
  const completedAt=globalThis.performance?.now?.()??Date.now();
  return {
    maskTriangleCount:mask.triangles.length,inputTriangleCount:originalTriangleCount,outputTriangleCount:indices.length/3,clippedTriangleCount,removedTriangleCount,addedVertexCount,
    terrainTriangleFastRejectCount,terrainTriangleCandidateQueryCount,surfaceTriangleBoundsTestCount,surfaceTriangleIntersectionTestCount,
    consideredSurfaceTriangleCount:mask.consideredTriangleCount,constructionRejectedSurfaceTriangleCount:mask.constructionRejectedTriangleCount,
    constructionClassifierQueryCount:mask.constructionClassifierQueryCount,constructionClassifierPairTestCount:mask.constructionClassifierPairTestCount,
    maskBuildDurationMs:maskBuiltAt-startedAt,clipDurationMs:completedAt-maskBuiltAt
  };
}
function coarseTerrainEdgeSample(object,tile,edge,t,steps){
  steps=Math.max(1,steps);
  const scaled=clamp(t,0,1)*steps,index=Math.min(steps-1,Math.floor(scaled)),local=scaled-index;
  const along0=index/steps,along1=(index+1)/steps;
  const x0=edge==='left'?tile.minX:edge==='right'?tile.maxX:lerp(tile.minX,tile.maxX,along0);
  const x1=edge==='left'?tile.minX:edge==='right'?tile.maxX:lerp(tile.minX,tile.maxX,along1);
  const z0=edge==='bottom'?tile.minZ:edge==='top'?tile.maxZ:lerp(tile.minZ,tile.maxZ,along0);
  const z1=edge==='bottom'?tile.minZ:edge==='top'?tile.maxZ:lerp(tile.minZ,tile.maxZ,along1);
  return {
    height:lerp(terrainBaseHeightAt(object,x0,z0),terrainBaseHeightAt(object,x1,z1),local),
    blend:0
  };
}
function weldedTerrainNormals(positions,indices,tolerance=1e-4){
  const accumulated=new Float64Array(positions.length),groups=new Map();
  for(let t=0;t<indices.length;t+=3){
    const ia=indices[t]*3,ib=indices[t+1]*3,ic=indices[t+2]*3;
    const A=[positions[ia],positions[ia+1],positions[ia+2]],B=[positions[ib],positions[ib+1],positions[ib+2]],C=[positions[ic],positions[ic+1],positions[ic+2]];
    const face=cross(sub(B,A),sub(C,A));
    if(length(face)<=1e-12)continue;
    for(const offset of [ia,ib,ic]){
      accumulated[offset]+=face[0];accumulated[offset+1]+=face[1];accumulated[offset+2]+=face[2];
    }
  }
  for(let offset=0;offset<positions.length;offset+=3){
    const key=`${Math.round(positions[offset]/tolerance)}:${Math.round(positions[offset+1]/tolerance)}:${Math.round(positions[offset+2]/tolerance)}`;
    let group=groups.get(key);
    if(!group){group={offsets:[],sum:[0,0,0]};groups.set(key,group);}
    group.offsets.push(offset);
    group.sum[0]+=accumulated[offset];group.sum[1]+=accumulated[offset+1];group.sum[2]+=accumulated[offset+2];
  }
  const normals=new Float32Array(positions.length);
  for(const group of groups.values()){
    const normal=length(group.sum)>1e-12?normalize(group.sum):[0,1,0];
    for(const offset of group.offsets){normals[offset]=normal[0];normals[offset+1]=normal[1];normals[offset+2]=normal[2];}
  }
  return normals;
}
export function terrainMesh(object,paths,pathRuntimes=[]){
  const props=normalizeTerrainProperties(object.properties||{},object.transform||{}),resX=clamp(Math.round(Number(props.resolutionX||props.resolution||128)),8,256),resZ=clamp(Math.round(Number(props.resolutionZ||props.resolution||128)),8,256),bounds=props.bounds,p=[],n=[],idx=[],uv=[],blends=[];
  const ox=Number(object.transform.position?.[0]||0),oy=Number(object.transform.position?.[1]||0),oz=Number(object.transform.position?.[2]||0);
  const chunkSize=clamp(Number(props.chunkSize||64),8,512);
  const activeTerrainKeys=pathRuntimes.length?activePathChunkKeys(pathRuntimes,chunkSize):new Set();
  const terrainSamplingRuntimes=pathRuntimes.length?rendererTerrainSamplingRuntimes(pathRuntimes,chunkSize):[];
  const authoredBaseOnly=pathRuntimes.length>0&&activeTerrainKeys.size===0;
  terrainMesh.lastPathDetail=null;
  if(!pathRuntimes.length||authoredBaseOnly){
    for(let z=0;z<=resZ;z++)for(let x=0;x<=resX;x++){
      const wx=lerp(bounds.minX,bounds.maxX,x/resX),wz=lerp(bounds.minZ,bounds.maxZ,z/resZ);
      // A bridge, tunnel, or invalid path has no terrain authority. Preserve
      // the exact authored terrain grid rather than changing topology merely
      // because a non-terrain path runtime exists in the scene.
      const wy=authoredBaseOnly?terrainBaseHeightAt(object,wx,wz):terrainHeight(object,wx,wz,paths);
      p.push(wx-ox,wy-oy,wz-oz);n.push(0,1,0);uv.push(x/resX,z/resZ);blends.push(authoredBaseOnly?0:pathBlendAt(paths,wx,wz));
    }
    for(let z=0;z<resZ;z++)for(let x=0;x<resX;x++){const a=z*(resX+1)+x,b=a+resX+1;idx.push(a,b,a+1,b,b+1,a+1);}
    if(authoredBaseOnly)terrainMesh.lastPathDetail={
      strategy:'authored-base-no-terrain-modifier',
      tileCount:1,
      highTileCount:0,
      transitionTileCount:0,
      targetSpacing:null,
      transitionSpacing:null,
      maximumBoundaryMismatch:0,
      boundaryStitches:{vertexCount:0,triangleCount:0,maximumWidth:0},
      baseCellSize:[(bounds.maxX-bounds.minX)/resX,(bounds.maxZ-bounds.minZ)/resZ]
    };
  }else{
    // Path construction is rendered through complete terrain chunks. Modifier
    // chunks use fine geometry, a one-chunk transition ring absorbs the density
    // change, and untouched chunks keep the authored world budget. Every denser
    // edge is projected to its path-aware coarser neighbor, so adjacent tiers
    // describe the same boundary without a floating patch, curtain, or hole.
    const minChunkX=Math.floor(bounds.minX/chunkSize),maxChunkX=Math.ceil(bounds.maxX/chunkSize)-1;
    const minChunkZ=Math.floor(bounds.minZ/chunkSize),maxChunkZ=Math.ceil(bounds.maxZ/chunkSize)-1;
    const highKeys=activeTerrainKeys,transitionKeys=new Set(highKeys),tiles=new Map();
    for(const key of highKeys){
      const [cx,cz]=key.split(':').map(Number);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)transitionKeys.add(`${cx+dx}:${cz+dz}`);
    }
    const baseStepX=(bounds.maxX-bounds.minX)/resX,baseStepZ=(bounds.maxZ-bounds.minZ)/resZ;
    for(let cz=minChunkZ;cz<=maxChunkZ;cz++)for(let cx=minChunkX;cx<=maxChunkX;cx++){
      const minX=Math.max(bounds.minX,cx*chunkSize),maxX=Math.min(bounds.maxX,(cx+1)*chunkSize);
      const minZ=Math.max(bounds.minZ,cz*chunkSize),maxZ=Math.min(bounds.maxZ,(cz+1)*chunkSize);
      if(maxX<=minX||maxZ<=minZ)continue;
      const key=`${cx}:${cz}`,tier=highKeys.has(key)?'high':transitionKeys.has(key)?'transition':'base';
      tiles.set(`${cx}:${cz}`,{
        cx,cz,minX,maxX,minZ,maxZ,tier,
        lowStepsX:Math.max(1,Math.round((maxX-minX)/baseStepX)),
        lowStepsZ:Math.max(1,Math.round((maxZ-minZ)/baseStepZ))
      });
    }
    for(const tile of tiles.values()){
      const spacing=tile.tier==='high'?.625:tile.tier==='transition'?2:null;
      tile.stepsX=spacing?clamp(Math.ceil((tile.maxX-tile.minX)/spacing),2,128):tile.lowStepsX;
      tile.stepsZ=spacing?clamp(Math.ceil((tile.maxZ-tile.minZ)/spacing),2,128):tile.lowStepsZ;
    }
    let highTileCount=0,transitionTileCount=0,maximumBoundaryMismatch=0;
    for(const tile of tiles.values()){
      const stepsX=tile.stepsX,stepsZ=tile.stepsZ;
      if(tile.tier==='high')highTileCount+=1;
      if(tile.tier==='transition')transitionTileCount+=1;
      const offset=p.length/3;
      for(let z=0;z<=stepsZ;z++)for(let x=0;x<=stepsX;x++){
        const tx=x/stepsX,tz=z/stepsZ,wx=lerp(tile.minX,tile.maxX,tx),wz=lerp(tile.minZ,tile.maxZ,tz);
        const leftNeighbor=tiles.get(`${tile.cx-1}:${tile.cz}`),rightNeighbor=tiles.get(`${tile.cx+1}:${tile.cz}`);
        const bottomNeighbor=tiles.get(`${tile.cx}:${tile.cz-1}`),topNeighbor=tiles.get(`${tile.cx}:${tile.cz+1}`);
        const leftTransition=x===0&&leftNeighbor&&leftNeighbor.stepsZ<stepsZ;
        const rightTransition=x===stepsX&&rightNeighbor&&rightNeighbor.stepsZ<stepsZ;
        const bottomTransition=z===0&&bottomNeighbor&&bottomNeighbor.stepsX<stepsX;
        const topTransition=z===stepsZ&&topNeighbor&&topNeighbor.stepsX<stepsX;
        let transition=null;
        if(leftTransition)transition=coarseTerrainEdgeSample(object,tile,'left',tz,leftNeighbor.stepsZ);
        else if(rightTransition)transition=coarseTerrainEdgeSample(object,tile,'right',tz,rightNeighbor.stepsZ);
        else if(bottomTransition)transition=coarseTerrainEdgeSample(object,tile,'bottom',tx,bottomNeighbor.stepsX);
        else if(topTransition)transition=coarseTerrainEdgeSample(object,tile,'top',tx,topNeighbor.stepsX);
        // Only chunks intersecting a compiled modifier need signed-distance
        // evaluation. Transition/base tiles are guaranteed outside those
        // conservative modifier bounds, so sampling the authored terrain there
        // avoids tens of thousands of pointless corridor searches per edit.
        const direct=transition===null
          ?(tile.tier==='high'?pathTerrainVertexSample(object,terrainSamplingRuntimes,wx,wz):{height:terrainBaseHeightAt(object,wx,wz),blend:0})
          :null;
        const wy=transition===null?direct.height:transition.height;
        // The compiled road, shoulder, and earthwork meshes own the visible
        // corridor boundary. Restrict the terrain underlay to the road/shoulder
        // support area so grid interpolation cannot paint a jagged dirt halo
        // beyond the exact swept construction geometry.
        const blend=transition===null?direct.blend:transition.blend;
        p.push(wx-ox,wy-oy,wz-oz);n.push(0,1,0);uv.push((wx-bounds.minX)/(bounds.maxX-bounds.minX),(wz-bounds.minZ)/(bounds.maxZ-bounds.minZ));blends.push(blend);
        if(transition!==null)maximumBoundaryMismatch=Math.max(maximumBoundaryMismatch,Math.abs(wy-transition.height));
      }
      const row=stepsX+1;
      for(let z=0;z<stepsZ;z++)for(let x=0;x<stepsX;x++){
        const a=offset+z*row+x,b=a+row;
        idx.push(a,b,a+1,b,b+1,a+1);
      }
    }
    terrainMesh.lastPathDetail={
      strategy:'watertight-chunks',
      tileCount:tiles.size,
      highTileCount,
      transitionTileCount,
      targetSpacing:.625,
      transitionSpacing:2,
      maximumBoundaryMismatch,
      // The former boundary-stitch pass appended nearly coplanar terrain
      // quads beside the exact path geometry. Those duplicate surfaces were a
      // source of texture collision and have no ownership in Path Network v2.
      boundaryStitches:{vertexCount:0,triangleCount:0,maximumWidth:0},
      terrainSampling:{...terrainSamplingRuntimes.samplingDiagnostics},
      baseCellSize:[baseStepX,baseStepZ]
    };
  }
  if(pathRuntimes.length){
    const surfaceClipping=clipTerrainTrianglesAgainstPathSurfaces({
      positions:p,indices:idx,uvs:uv,blends,origin:[ox,oy,oz],pathRuntimes,chunkSize
    });
    if(terrainMesh.lastPathDetail)terrainMesh.lastPathDetail.surfaceClipping=surfaceClipping;
  }
  // Chunk tiles intentionally duplicate their boundary vertices. Weld their
  // accumulated normals by position so the same geometric boundary cannot
  // acquire two lighting responses and appear as a crack.
  const normals=weldedTerrainNormals(p,idx);
  return {positions:new Float32Array(p),normals,indices:new Uint32Array(idx),uvs:new Float32Array(uv),blends:new Float32Array(blends)};
}
function pathLineData(object,terrain,paths){
  const corridor=buildTerrainConformingPathSurface(object,terrain,paths);
  return buildPathGuideSegmentsFromCorridor(corridor);
}
function createBufferMesh(gl,data){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffers=[];
  const bind=(location,size,array)=>{const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
  const vertexCount=data.positions.length/3;
  const detailStream=name=>{
    const source=data[name];
    if(source&&source.length!==vertexCount*4)throw new Error(`${name} must contain four values per vertex.`);
    return source instanceof Float32Array
      ?source
      :new Float32Array(source||vertexCount*4);
  };
  bind(0,3,data.positions);bind(1,3,data.normals);bind(2,2,data.uvs);bind(3,1,data.blends);
  bind(8,4,detailStream('surfaceDetail0'));
  bind(9,4,detailStream('surfaceDetail1'));
  bind(10,4,detailStream('surfaceDetail2'));
  bind(11,4,detailStream('surfaceDetail3'));
  const ib=gl.createBuffer();buffers.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);gl.bindVertexArray(null);
  return {vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,indexStride:4,buffers,groups:Array.isArray(data.groups)?data.groups:[],sourceMaterials:Array.isArray(data.sourceMaterials)?data.sourceMaterials:[],sourceMaterial:data.material||null};
}
function createLineBuffer(gl,positions){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.bindVertexArray(null);return {vao,count:positions.length/3,buffer:b};
}
export function pathSurfaceCullMode(kind){
  return kind==='structure'?'double-sided':'front-face';
}

export class Renderer3D{
  constructor(canvas){
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL 2 is required.');
    const gl=this.gl;
    this.contextLost=false;this.frameCounter=0;this.lastFrameReport=null;
    this.capabilities=detectRenderCapabilities(gl);
    this.hdrPipeline=new HDRPipeline(gl,this.capabilities);
    this.frameResources=new FrameResources(canvas,gl,{maxDevicePixelRatio:2,onResize:result=>{
      this.hdrPipeline?.ensureSize(result.width,result.height);
      this.renderGraph?.setResource('default-framebuffer',null,{kind:'framebuffer',format:'canvas',width:result.width,height:result.height,pixelRatio:result.pixelRatio,revision:result.revision});
      window.__omniforgeDiagnostics?.event?.('frame-resources-resized',result);
    }});
    this.boundContextLost=event=>this.handleContextLost(event);this.boundContextRestored=()=>this.handleContextRestored();
    canvas.addEventListener('webglcontextlost',this.boundContextLost,false);canvas.addEventListener('webglcontextrestored',this.boundContextRestored,false);
    this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=null;try{this.skyPass=new SkyPass(gl);}catch(error){console.error('Renderer-owned sky initialization failed; using the opaque environment fallback.',error);window.__omniforgeDiagnostics?.warn?.('sky-pass-initialization-failed',{message:error.message});}
    this.staticMeshes={cube:createBufferMesh(gl,cubeMesh()),plane:createBufferMesh(gl,planeMesh()),sphere:createBufferMesh(gl,sphereMesh()),cylinder:createBufferMesh(gl,cylinderMesh())};
    this.dynamic=new Map();this.pathLines=new Map();this.pathSurfaces=new Map();this.pathPreview=null;this.pathRuntimeFrameCache=null;this.lastTerrainSamplingDiagnostics=null;this.terrainSamplingWarningSignature='';this.textureCache=new Map();this.instanceBuffers=new Set();this.renderStart=performance.now();this.assets=[];this.modelMeshes=new Map();this.modelLoads=new Map();this.modelRevisions=new Map();this.modelLoadRevisions=new Map();this.grid=null;this.gridKey='';this.selectionBox=createLineBuffer(gl,this.boxLines());this.whiteTexture=this.createSolidTexture([255,255,255,255]);this.flatNormalTexture=this.createSolidTexture([128,128,255,255]);
    this.createShadowResources(2048);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.disable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.renderGraph=this.createRenderGraph();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  modelRevision(asset){return String(asset?.canonicalRevision||asset?.updatedAt||asset?.meshUrl||'0');}
  disposeModelMesh(assetId){const mesh=this.modelMeshes.get(assetId);if(mesh){this.gl.deleteVertexArray(mesh.vao);for(const buffer of mesh.buffers||[])this.gl.deleteBuffer(buffer);}this.modelMeshes.delete(assetId);this.modelRevisions.delete(assetId);}
  setAssets(assets){
    const next=Array.isArray(assets)?assets:[],models=new Map(next.filter(item=>item.type==='model'&&item.meshUrl).map(asset=>[asset.id,asset]));
    for(const assetId of [...this.modelMeshes.keys()]){const asset=models.get(assetId);if(!asset||this.modelRevisions.get(assetId)!==this.modelRevision(asset))this.disposeModelMesh(assetId);}
    this.assets=next;
    for(const asset of models.values())this.ensureModelMesh(asset);
  }
  setPathPreview(pathObject){this.pathPreview=pathObject?structuredClone(pathObject):null;this.pathRuntimeFrameCache=null;}
  pathRenderScene(scene){return this.pathPreview?{...scene,objects:[...scene.objects.filter(object=>object.id!==this.pathPreview.id),this.pathPreview]}:scene;}
  ensureModelMesh(asset){
    if(!asset?.id||!asset.meshUrl)return;const revision=this.modelRevision(asset);
    if(this.modelMeshes.has(asset.id)&&this.modelRevisions.get(asset.id)===revision)return;
    if(this.modelLoads.has(asset.id)&&this.modelLoadRevisions.get(asset.id)===revision)return;
    if(this.modelMeshes.has(asset.id))this.disposeModelMesh(asset.id);
    this.modelLoadRevisions.set(asset.id,revision);
    const separator=asset.meshUrl.includes('?')?'&':'?',url=`${asset.meshUrl}${separator}revision=${encodeURIComponent(revision)}`;
    const task=fetch(url,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`Model mesh ${response.status}`);return response.json();}).then(data=>{
      if(this.modelLoadRevisions.get(asset.id)!==revision)return;const current=this.assets.find(item=>item.id===asset.id);if(!current||this.modelRevision(current)!==revision)return;
      const vertexCount=Math.floor((data.positions?.length||0)/3);
      const normalized={positions:new Float32Array(data.positions||[]),normals:new Float32Array(data.normals||[]),uvs:new Float32Array(data.uvs||new Array(vertexCount*2).fill(0)),indices:new Uint32Array(data.indices||[]),blends:new Float32Array(data.blends||new Array(vertexCount).fill(0)),groups:Array.isArray(data.groups)?data.groups:[],sourceMaterials:Array.isArray(data.sourceMaterials)?data.sourceMaterials:[],material:data.material||null};
      if(!normalized.positions.length||!normalized.indices.length)throw new Error('Canonical model mesh has no renderable geometry.');
      this.disposeModelMesh(asset.id);this.modelMeshes.set(asset.id,createBufferMesh(this.gl,normalized));this.modelRevisions.set(asset.id,revision);
    }).catch(error=>{if(this.modelLoadRevisions.get(asset.id)===revision)console.error(`Failed to load ${asset.name||asset.id}`,error);}).finally(()=>{if(this.modelLoadRevisions.get(asset.id)===revision){this.modelLoads.delete(asset.id);this.modelLoadRevisions.delete(asset.id);}});
    this.modelLoads.set(asset.id,task);
  }
  createSolidTexture(rgba){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return t;}
  createShadowResources(size){
    const gl=this.gl;this.shadowSize=size;this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    this.frameResources?.updateExternal('shadow-map',this.shadowTexture,{kind:'texture',format:'depth24',width:size,height:size,persistent:true});
    this.frameResources?.updateExternal('shadow-framebuffer',this.shadowFramebuffer,{kind:'framebuffer',width:size,height:size,persistent:true});
  }
  textureFor(asset,mapName='baseColor'){
    const map=asset?.maps?.[mapName],url=map?.url||map||(mapName==='baseColor'?asset?.url:null),fallback=mapName==='normal'?this.flatNormalTexture:this.whiteTexture,scale=Number(asset?.settings?.worldScale||4);
    if(!url)return {texture:fallback,ready:false,scale};
    const cacheKey=`${mapName}:${url}`,cached=this.textureCache.get(cacheKey);if(cached)return {texture:cached.texture,ready:cached.ready,scale};
    const entry={texture:fallback,ready:false,error:false};this.textureCache.set(cacheKey,entry);const image=new Image();
    image.onload=()=>{const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);entry.texture=t;entry.ready=true;};
    image.onerror=()=>{entry.error=true;};image.src=url;return {texture:entry.texture,ready:false,scale};
  }
  textureFromUrl(url,flipY=false){
    const fallback=this.whiteTexture;if(!url)return {texture:fallback,ready:false,scale:1};
    const cacheKey=`imported:${flipY?'flip':'native'}:${url}`,cached=this.textureCache.get(cacheKey);if(cached)return {texture:cached.texture,ready:cached.ready,scale:1};
    const entry={texture:fallback,ready:false,error:false};this.textureCache.set(cacheKey,entry);const image=new Image();
    image.onload=()=>{const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flipY);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);entry.texture=t;entry.ready=true;};
    image.onerror=()=>{entry.error=true;};image.src=url;return {texture:entry.texture,ready:false,scale:1};
  }
  materialAsset(id){return this.assets.find(asset=>asset.id===id&&asset.type==='material')||null;}
  surfaceRecipeForMaterial(material){if(!material)return null;return this.assets.find(asset=>asset.id===material.surfaceRecipeId&&asset.type==='surfaceRecipe')||this.assets.find(asset=>asset.type==='surfaceRecipe'&&asset.baseMaterialId===material.id)||null;}
  resize(){return this.frameResources.syncCanvasSize();}
  boxLines(){const c=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],e=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],p=[];e.forEach(([a,b])=>p.push(...c[a],...c[b]));return p;}
  gridLines(size,step){const p=[],half=size/2;for(let v=-half;v<=half+.001;v+=step){p.push(-half,.015,v,half,.015,v,v,.015,-half,v,.015,half);}return p;}
  ensureGrid(scene){const key=`${scene.settings.gridSize}:${scene.settings.gridStep}`;if(key===this.gridKey&&this.grid)return;if(this.grid){this.gl.deleteVertexArray(this.grid.vao);this.gl.deleteBuffer(this.grid.buffer);}this.grid=createLineBuffer(this.gl,this.gridLines(Number(scene.settings.gridSize||100),Number(scene.settings.gridStep||5)));this.gridKey=key;}
  meshFor(object,scene){
    if(object.properties?.celestialRole)return null;
    if(object.type==='box')return this.staticMeshes.cube;if(object.type==='decal')return this.staticMeshes.plane;if(this.staticMeshes[object.type])return this.staticMeshes[object.type];if(object.type==='directionalLight'||object.type==='pointLight')return this.staticMeshes.sphere;if(object.type==='empty'||object.type==='path')return null;
    if(object.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId);if(asset)this.ensureModelMesh(asset);return asset?this.modelMeshes.get(asset.id)||null:null;}
    const paths=scene.objects.filter(o=>o.type==='path'),pathRuntimes=object.type==='terrain'?this.scenePathRuntimes(scene):[],signature=JSON.stringify([object.type,object.properties,object.transform.scale,paths.map(p=>[p.visible,p.transform,p.properties])]),cached=this.dynamic.get(object.id);
    if(cached?.signature===signature)return cached.mesh;if(cached){for(const b of cached.mesh.buffers)this.gl.deleteBuffer(b);this.gl.deleteVertexArray(cached.mesh.vao);}
    const data=object.type==='terrain'?terrainMesh(object,paths,pathRuntimes):null;if(!data)return null;const mesh=createBufferMesh(this.gl,data);this.dynamic.set(object.id,{signature,mesh});return mesh;
  }
  prepareInstances(mesh,objects){
    const gl=this.gl,matrices=new Float32Array(objects.length*16);
    objects.forEach((object,index)=>matrices.set(modelMatrix(object.transform),index*16));
    if(!mesh.instanceBuffer){mesh.instanceBuffer=gl.createBuffer();mesh.buffers.push(mesh.instanceBuffer);this.instanceBuffers.add(mesh.instanceBuffer);}
    gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,matrices,gl.DYNAMIC_DRAW);
    for(let column=0;column<4;column++){const location=4+column;gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,64,column*16);gl.vertexAttribDivisor(location,1);}
    return objects.length;
  }
  foliageGroups(scene,camera){
    const groups=new Map();
    for(const object of scene.objects){
      if(!object.visible||object.type!=='model'||!object.properties?.foliageInstance)continue;
      const limit=Number(object.properties?.lod?.impostor||180),distance=Math.hypot(object.transform.position[0]-camera.position[0],object.transform.position[1]-camera.position[1],object.transform.position[2]-camera.position[2]);
      if(distance>limit)continue;
      const key=`${object.properties.assetId||'missing'}:${object.properties.foliageSpeciesId||'species'}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);
    }
    return groups;
  }
  pathBuffers(pathObject,scene){
    const runtime=this.scenePathRuntimes(scene).find(item=>item.pathObjectId===pathObject.id);if(!runtime)return {center:null,edges:null};
    const blockedGuideCount=(runtime.geometry.guides.blockedCorridors||[]).length;
    const signature=`${runtime.sourceRevision}:${runtime.generationRevision}:${pathObject.properties?.previewRevision||0}:${runtime.geometry.guides.center.length}:${runtime.geometry.guides.edges.length}:${blockedGuideCount}`,cached=this.pathLines.get(pathObject.id);if(cached?.signature===signature)return cached;
    if(cached){for(const item of [cached.center,cached.edges,cached.construction,...(cached.costSegments||[]).map(entry=>entry.buffer),...(cached.blockedCorridors||[]).flatMap(entry=>[entry.boundaries,entry.hatches,entry.endCaps])])if(item){this.gl.deleteVertexArray(item.vao);this.gl.deleteBuffer(item.buffer);}}
    const data=runtime.geometry.guides,costSegments=buildPathCostGuideData(runtime).map(entry=>({...entry,buffer:createLineBuffer(this.gl,entry.positions)})),blockedCorridors=(data.blockedCorridors||[]).map(entry=>({...entry,boundaries:createLineBuffer(this.gl,entry.boundaries),hatches:createLineBuffer(this.gl,entry.hatches),endCaps:createLineBuffer(this.gl,entry.endCaps)})),next={signature,center:createLineBuffer(this.gl,data.center),edges:createLineBuffer(this.gl,data.edges),construction:createLineBuffer(this.gl,data.construction),costSegments,blockedCorridors};this.pathLines.set(pathObject.id,next);return next;
  }
  drawBlockedPathGuides(buffers,viewProj){
    for(const blocked of buffers.blockedCorridors||[]){
      this.drawLines(blocked.hatches,mat4Identity(),viewProj,[1,.55,.1,.7],2);
      this.drawLines(blocked.boundaries,mat4Identity(),viewProj,[1,.08,.03,1],4);
      this.drawLines(blocked.endCaps,mat4Identity(),viewProj,[1,.78,.25,1],5);
    }
  }
  pathSurfaceFor(pathObject,scene){
    const runtime=this.scenePathRuntimes(scene).find(item=>item.pathObjectId===pathObject.id);if(!runtime)return null;
    const signature=`${runtime.sourceRevision}:${runtime.generationRevision}:${pathObject.properties?.previewRevision||0}`,cached=this.pathSurfaces.get(pathObject.id);
    if(cached?.signature===signature)return cached.meshes;
    if(cached?.meshes)for(const mesh of Object.values(cached.meshes)){if(!mesh)continue;for(const buffer of mesh.buffers||[])this.gl.deleteBuffer(buffer);this.gl.deleteVertexArray(mesh.vao);}
    const diagnostics=runtime.diagnostics;
    if(!diagnostics.valid)window.__omniforgeDiagnostics?.warn?.('path-network-v2-partially-blocked',{pathId:pathObject.id,diagnostics});
    const meshes={};
    for(const [name,data] of Object.entries(runtime.geometry.meshes)){
      if(data.indices.length)meshes[name]=createBufferMesh(this.gl,data);
    }
    this.pathSurfaces.set(pathObject.id,{signature,meshes,diagnostics});return meshes;
  }
  scenePathRuntimes(scene){
    const terrain=scene?.objects?.find(object=>object.type==='terrain'&&object.visible!==false),paths=(scene?.objects||[]).filter(object=>object.type==='path'&&object.visible!==false);
    const revisionKey=JSON.stringify([
      terrain?.id||null,
      terrain?.properties?.generatedRevision||0,
      paths.map(pathObject=>[
        pathObject.id,
        pathObject.properties?.pathNetwork?.revision||0,
        pathObject.properties?.previewRevision||0
      ])
    ]);
    const cached=this.pathRuntimeFrameCache;
    if(
      cached
      && cached.terrain===terrain
      && cached.revisionKey===revisionKey
      && cached.paths.length===paths.length
      && cached.paths.every((pathObject,index)=>pathObject===paths[index])
    )return cached.runtimes;
    try{
      const runtimes=compileScenePathRuntimes(scene);
      this.pathRuntimeFrameCache={terrain,paths:[...paths],revisionKey,runtimes};
      return runtimes;
    }catch(error){
      this.pathRuntimeFrameCache=null;
      window.__omniforgeDiagnostics?.warn?.('path-network-v2-compile-failed',{message:error.message});
      return [];
    }
  }
  updateTerrainSamplingDiagnostics(scene){
    const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false),paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);
    const diagnostics=terrainPathSamplingDiagnostics(terrain,paths);this.lastTerrainSamplingDiagnostics=diagnostics;
    const signature=JSON.stringify(diagnostics);
    if(diagnostics.undersampled&&signature!==this.terrainSamplingWarningSignature){this.terrainSamplingWarningSignature=signature;window.__omniforgeDiagnostics?.warn?.('terrain-path-grid-undersampled',diagnostics);}
    return diagnostics;
  }
  cameraMatrices(camera){const forward=cameraForward(camera),target=add(camera.position,forward),view=mat4LookAt(camera.position,target),proj=mat4Perspective((camera.fov||62)*DEG,this.canvas.width/this.canvas.height,.08,12000),viewProj=mat4Multiply(proj,view);return {view,proj,viewProj,inverse:mat4Invert(viewProj)};}
  worldToScreen(camera,point){const rect=this.canvas.getBoundingClientRect(),{viewProj}=this.cameraMatrices(camera),x=point[0],y=point[1],z=point[2],cx=viewProj[0]*x+viewProj[4]*y+viewProj[8]*z+viewProj[12],cy=viewProj[1]*x+viewProj[5]*y+viewProj[9]*z+viewProj[13],cz=viewProj[2]*x+viewProj[6]*y+viewProj[10]*z+viewProj[14],cw=viewProj[3]*x+viewProj[7]*y+viewProj[11]*z+viewProj[15];if(cw<=.001)return {visible:false,x:0,y:0};const nx=cx/cw,ny=cy/cw;return {visible:cz/cw>=-1&&cz/cw<=1&&nx>=-1.2&&nx<=1.2&&ny>=-1.2&&ny<=1.2,x:(nx*.5+.5)*rect.width,y:(1-(ny*.5+.5))*rect.height};}
  terrainBaseHeightForScene(scene,x,z){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);return terrain?terrainBaseHeightAt(terrain,x,z):0;}
  terrainHeightForScene(scene,x,z){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);if(!terrain)return 0;const baseY=terrainBaseHeightAt(terrain,x,z);return sampleScenePathTerrain(this.scenePathRuntimes(scene),baseY,x,z).height;}
  scenePathConsumers(scene){
    const runtimes=this.scenePathRuntimes(scene),cached=this.pathRuntimeFrameCache;
    if(cached?.runtimes===runtimes&&cached.sceneConsumers)return cached.sceneConsumers;
    const sceneConsumers=connectScenePathRuntimeConsumers(runtimes);
    if(cached?.runtimes===runtimes)cached.sceneConsumers=sceneConsumers;
    return sceneConsumers;
  }
  groundSurfaceForScene(scene,x,z,options={}){
    const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);
    if(!terrain)return {height:0,source:'terrain',generationRevision:0};
    const terrainHeight=this.terrainHeightForScene(scene,x,z);
    return sampleSceneGroundSurface(this.scenePathConsumers(scene),terrainHeight,x,z,options);
  }
  terrainPointFromScreen(scene,camera,x,y,{surface='scene'}={}){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);if(!terrain)return null;const heightAt=surface==='base'?(px,pz)=>terrainBaseHeightAt(terrain,px,pz):(px,pz)=>this.terrainHeightForScene(scene,px,pz);return pickTerrainPoint({ray:this.rayFromScreen(camera,x,y),bounds:terrainBounds(terrain),heightAt,step:Math.min(6,Math.max(2,Number(terrain.properties?.chunkSize||64)*.06)),refinementSteps:12});}
  lightState(scene,editorMode='edit',viewportLightingMode=null){
    const sun=scene.objects.find(o=>o.type==='directionalLight'&&o.visible&&o.properties?.celestialRole==='sun')||scene.objects.find(o=>o.type==='directionalLight'&&o.visible&&!o.properties?.celestialRole);let dir=[.45,-.8,.25],color=[1,.95,.82],intensity=1,shadows=true;
    if(sun){
      const azimuth=Number(sun.properties?.azimuth),elevation=Number(sun.properties?.elevation);
      if(Number.isFinite(azimuth)&&Number.isFinite(elevation))dir=scale(normalize(directionFromAzimuthElevation(azimuth,elevation)),-1);
      else{const rx=(sun.transform.rotation[0]||0)*DEG,ry=(sun.transform.rotation[1]||0)*DEG;dir=normalize([Math.sin(ry)*Math.cos(rx),Math.sin(rx),-Math.cos(ry)*Math.cos(rx)]);}
      color=hexToRgb(sun.properties?.color||'#fff4d8');intensity=Number(sun.properties?.intensity||1);shadows=sun.properties?.castsShadows!==false;
    }
    const viewportLighting=resolveViewportLighting(scene.settings||{},editorMode,intensity,viewportLightingMode);intensity=viewportLighting.sunIntensity;
    const points=scene.objects.filter(o=>o.type==='pointLight'&&o.visible&&!o.properties?.celestialRole).slice(0,4);return {dir,color,intensity,points,shadows,sunAuthorityId:sun?.id||null,...viewportLighting};
  }
  lightMatrix(scene,lights){
    const terrain=scene.objects.find(o=>o.type==='terrain'),bounds=terrain?terrainBounds(terrain):{minX:-50,maxX:50,minZ:-50,maxZ:50},size=Math.max(60,Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)*.72),center=[(bounds.minX+bounds.maxX)*.5,terrain?.transform?.position?.[1]||0,(bounds.minZ+bounds.maxZ)*.5],eye=sub(center,scale(lights.dir,size*.8)),view=mat4LookAt(eye,center,[0,1,0]),proj=mat4Ortho(-size,size,-size,size,1,size*3);return mat4Multiply(proj,view);
  }
  renderShadow(scene,lightViewProj,options={}){
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.viewport(0,0,this.shadowSize,this.shadowSize);gl.clear(gl.DEPTH_BUFFER_BIT);gl.colorMask(false,false,false,false);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);gl.useProgram(this.depthProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram,'uLightViewProj'),false,lightViewProj);
    for(const object of scene.objects){if(!object.visible||['empty','path','directionalLight','pointLight'].includes(object.type)||object.properties?.castsShadows===false||(options.hideEditorReferences&&isEditorReference(object)))continue;const mesh=this.meshFor(object,scene);if(!mesh)continue;gl.bindVertexArray(mesh.vao);gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram,'uModel'),false,modelMatrix(object.transform));gl.drawElements(gl.TRIANGLES,mesh.count,mesh.indexType,0);}
    gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram,'uModel'),false,mat4Identity());
    for(const pathObject of scene.objects.filter(object=>object.type==='path'&&object.visible!==false&&object.properties?.castsShadows!==false)){
      const meshes=this.pathSurfaceFor(pathObject,scene);if(!meshes)continue;
      for(const mesh of Object.values(meshes)){if(!mesh)continue;gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.indexType,0);}
    }
    gl.bindVertexArray(null);gl.cullFace(gl.BACK);gl.colorMask(true,true,true,true);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }
  drawMesh(object,mesh,viewProj,lightViewProj,scene,selected,camera,lights,instances=null,materialPath=null){
    const gl=this.gl,p=this.meshProgram;gl.useProgram(p);gl.bindVertexArray(mesh.vao);const instanced=Array.isArray(instances)&&instances.length>0;let transform=object.transform;if(object.type==='directionalLight'||object.type==='pointLight')transform={...object.transform,scale:[.7,.7,.7]};const model=instanced?mat4Identity():modelMatrix(transform);
    const firstPath=materialPath||scene.objects.find(o=>o.type==='path'&&o.visible),baseAsset=this.materialAsset(object.properties?.materialId),pathAsset=this.materialAsset(firstPath?.properties?.materialId),baseRecipe=this.surfaceRecipeForMaterial(baseAsset),pathRecipe=this.surfaceRecipeForMaterial(pathAsset);
    const baseMaps={baseColor:this.textureFor(baseAsset,'baseColor'),normal:this.textureFor(baseAsset,'normal'),roughness:this.textureFor(baseAsset,'roughness'),ao:this.textureFor(baseAsset,'ambientOcclusion'),height:this.textureFor(baseAsset,'height')};
    const pathMaps={baseColor:this.textureFor(pathAsset,'baseColor'),normal:this.textureFor(pathAsset,'normal'),roughness:this.textureFor(pathAsset,'roughness'),ao:this.textureFor(pathAsset,'ambientOcclusion'),height:this.textureFor(pathAsset,'height')};
    const setM4=(name,value)=>gl.uniformMatrix4fv(gl.getUniformLocation(p,name),false,value),set3=(name,value)=>gl.uniform3fv(gl.getUniformLocation(p,name),value),set1=(name,value)=>gl.uniform1f(gl.getUniformLocation(p,name),value);
    const bindMap=(unit,uniform,entry)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.uniform1i(gl.getUniformLocation(p,uniform),unit);};
    setM4('uModel',model);setM4('uViewProj',viewProj);setM4('uLightViewProj',lightViewProj);gl.uniformMatrix3fv(gl.getUniformLocation(p,'uNormalMat'),false,normalMatrix3(model));
    set1('uInstanced',instanced?1:0);
    const instanceCount=instanced?this.prepareInstances(mesh,instances):0,asset=object.type==='model'?this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId):null,bounds=asset?.bounds||{min:[0,0,0],size:[1,1,1]},foliageWind=object.properties?.wind||{};
    set1('uTime',(performance.now()-this.renderStart)/1000);set1('uFoliageWind',instanced?1:0);set1('uFoliageWindStrength',Number(foliageWind.strength??.35)*Number(scene.settings.windStrength??.35));set1('uFoliageWindFrequency',Number(foliageWind.frequency??1));set1('uFoliageBaseY',Number(bounds.min?.[1]??0));set1('uFoliageHeight',Math.max(.001,Number(bounds.size?.[1]??1)));set3('uFoliageWindDirection',new Float32Array(Array.isArray(scene.settings.windDirection)?scene.settings.windDirection:[1,0,.25]));
    const drawRange=(count,offset=0)=>{if(instanced)gl.drawElementsInstanced(gl.TRIANGLES,count,mesh.indexType,offset,instanceCount);else gl.drawElements(gl.TRIANGLES,count,mesh.indexType,offset);};
    set3('uBaseColor',hexToRgb(object.properties.color||'#9da7b8'));set3('uPathColor',hexToRgb(firstPath?.properties?.color||'#73573d'));set3('uAmbientColor',hexToRgb(scene.settings.ambientColor||'#ffffff'));
    set3('uSkyZenithColor',lights.environment?.zenithColor||hexToRgb(scene.settings.skyTop||'#1f65b7'));set3('uSkyHorizonColor',lights.environment?.horizonColor||hexToRgb(scene.settings.skyBottom||'#69a9d8'));set3('uSkyGroundColor',lights.environment?.groundColor||hexToRgb(scene.settings.skyGround||'#17242d'));
    set1('uAmbientIntensity',lights.ambientIntensity);set1('uEditorFill',lights.editorFill);
    set3('uLightDir',lights.dir);set3('uLightColor',lights.color);set1('uLightIntensity',lights.intensity);set3('uMoonDir',lights.moonDir||[0,1,0]);set3('uMoonColor',lights.moonColor||[.66,.78,.92]);set1('uMoonIntensity',Number(lights.moonIntensity||0));gl.uniform1i(gl.getUniformLocation(p,'uPointCount'),lights.points.length);
    const pp=new Float32Array(12),pc=new Float32Array(12),pd=new Float32Array(8);lights.points.forEach((l,i)=>{pp.set(l.transform.position,i*3);pc.set(hexToRgb(l.properties.color),i*3);pd.set([Number(l.properties.intensity||1),Number(l.properties.range||10)],i*2);});gl.uniform3fv(gl.getUniformLocation(p,'uPointPos[0]'),pp);gl.uniform3fv(gl.getUniformLocation(p,'uPointColor[0]'),pc);gl.uniform2fv(gl.getUniformLocation(p,'uPointData[0]'),pd);
    set1('uSelected',selected?1:0);set3('uCameraPos',camera.position);set1('uRoughness',Number(baseAsset?.settings?.roughness??object.properties.roughness??.75));set1('uMetallic',Number(baseAsset?.settings?.metallic??object.properties.metallic??0));set1('uIsTerrain',object.type==='terrain'?1:0);
    const baseSettings=baseAsset?.settings||{},pathSettings=pathAsset?.settings||{};
    set1('uBaseColorIsLinear',0);set1('uBaseTextureTintStrength',Number(baseSettings.tintStrength??0));set1('uPathTextureTintStrength',Number(pathSettings.tintStrength??0));
    const recipeVec=(recipe,key,defaults)=>{const source=recipe?.[key]||{},nodes=recipe?.graph?.nodes||[],output=nodes.find(node=>node.type==='surface-output'),disabled=output&&output.enabled===false,nodeTypeFor={slope:'slope-mask',cavities:'cavity-mask',wetness:'weather-state',snow:'weather-state'};return new Float32Array(defaults.map(([name,value])=>{if(disabled)return Number(value);let result=Number(source[name]??value),node=nodes.find(item=>item.type===nodeTypeFor[name]);if(node){if(node.enabled===false)return 0;result*=Number(node.value??1);}return result;}));};
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseSurfaceLayers'),recipeVec(baseRecipe,'layers',[['dirt',0],['moss',0],['wetness',0],['snow',0]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathSurfaceLayers'),recipeVec(pathRecipe,'layers',[['dirt',0],['moss',0],['wetness',0],['snow',0]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseSurfaceExtra'),recipeVec(baseRecipe,'layers',[['damage',0],['colorVariation',0],['detailAmount',1],['roughnessVariation',0]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathSurfaceExtra'),recipeVec(pathRecipe,'layers',[['damage',0],['colorVariation',0],['detailAmount',1],['roughnessVariation',0]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseSurfaceMasks'),recipeVec(baseRecipe,'masks',[['upwardFacing',1],['slope',.35],['cavities',.65],['groundContact',.35]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathSurfaceMasks'),recipeVec(pathRecipe,'masks',[['upwardFacing',1],['slope',.35],['cavities',.65],['groundContact',.35]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseSurfaceMasks2'),recipeVec(baseRecipe,'masks',[['downwardFacing',0],['waterContact',0],['sunExposure',.25],['shade',.55]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathSurfaceMasks2'),recipeVec(pathRecipe,'masks',[['downwardFacing',0],['waterContact',0],['sunExposure',.25],['shade',.55]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseSurfaceMasks3'),recipeVec(baseRecipe,'masks',[['windFacing',0],['distanceFromPaths',0],['distanceFromStructures',0],['convexEdges',.15]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathSurfaceMasks3'),recipeVec(pathRecipe,'masks',[['windFacing',0],['distanceFromPaths',0],['distanceFromStructures',0],['convexEdges',.15]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseWeatherResponse'),recipeVec(baseRecipe,'weatherResponse',[['wetness',1],['snow',1],['frost',0],['drought',0]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathWeatherResponse'),recipeVec(pathRecipe,'weatherResponse',[['wetness',1],['snow',1],['frost',0],['drought',0]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uBaseAdvanced'),recipeVec(baseRecipe,'advanced',[['macroScale',24],['detailScale',4],['blendSharpness',1],['parallaxSteps',8]]));
    gl.uniform4fv(gl.getUniformLocation(p,'uPathAdvanced'),recipeVec(pathRecipe,'advanced',[['macroScale',24],['detailScale',4],['blendSharpness',1],['parallaxSteps',8]]));
    const recipeColor=(recipe,key,fallback)=>hexToRgb(recipe?.layerColors?.[key]||fallback);
    set3('uBaseDirtColor',recipeColor(baseRecipe,'dirt','#4b2c18'));set3('uBaseMossColor',recipeColor(baseRecipe,'moss','#245b29'));set3('uBaseSnowColor',recipeColor(baseRecipe,'snow','#dbe7f0'));set3('uBaseDamageColor',recipeColor(baseRecipe,'damage','#17100d'));
    set3('uPathDirtColor',recipeColor(pathRecipe,'dirt','#4b2c18'));set3('uPathMossColor',recipeColor(pathRecipe,'moss','#245b29'));set3('uPathSnowColor',recipeColor(pathRecipe,'snow','#dbe7f0'));set3('uPathDamageColor',recipeColor(pathRecipe,'damage','#17100d'));
    const wind=Array.isArray(scene.settings.windDirection)?scene.settings.windDirection:[1,0,.25];gl.uniform4fv(gl.getUniformLocation(p,'uEnvironmentState'),new Float32Array([Number(scene.settings.waterLevel??-100),Number(scene.settings.weatherWetness??0),Number(scene.settings.weatherSnow??0),Number(scene.settings.windStrength??.35)]));set3('uWindDirection',new Float32Array(wind));
    const structures=scene.objects.filter(item=>item.visible&&['box','model','cylinder'].includes(item.type)&&affectsSurfaceRecipes(item)).slice(0,4),sp=new Float32Array(12);structures.forEach((item,index)=>sp.set(item.transform.position,index*3));gl.uniform1i(gl.getUniformLocation(p,'uStructureCount'),structures.length);gl.uniform3fv(gl.getUniformLocation(p,'uStructurePos[0]'),sp);
    set1('uOpacity',Number(object.properties?.opacity??1));
    set1('uBaseTextureScale',baseMaps.baseColor.scale);set1('uPathTextureScale',pathMaps.baseColor.scale);set1('uBaseNormalStrength',Number(baseSettings.normalStrength??1)*Number(baseRecipe?.layers?.detailAmount??1));set1('uPathNormalStrength',Number(pathSettings.normalStrength??1)*Number(pathRecipe?.layers?.detailAmount??1));
    set1('uBaseTextureRotation',Number(baseSettings.uvRotation||0)*DEG);set1('uPathTextureRotation',Number(pathSettings.uvRotation||0)*DEG);
    gl.uniform2fv(gl.getUniformLocation(p,'uBaseTextureOffset'),new Float32Array(Array.isArray(baseSettings.uvOffset)?baseSettings.uvOffset:[0,0]));gl.uniform2fv(gl.getUniformLocation(p,'uPathTextureOffset'),new Float32Array(Array.isArray(pathSettings.uvOffset)?pathSettings.uvOffset:[0,0]));
    set1('uBaseRoughnessMultiplier',Number(baseSettings.roughnessMultiplier??1));set1('uPathRoughnessMultiplier',Number(pathSettings.roughnessMultiplier??1));set1('uBaseAOStrength',Number(baseSettings.aoStrength??1));set1('uPathAOStrength',Number(pathSettings.aoStrength??1));set1('uBaseHeightStrength',Number(baseSettings.heightStrength??0));set1('uPathHeightStrength',Number(pathSettings.heightStrength??0));
    bindMap(0,'uBaseTexture',baseMaps.baseColor);bindMap(1,'uPathTexture',pathMaps.baseColor);bindMap(2,'uBaseNormalTexture',baseMaps.normal);bindMap(3,'uPathNormalTexture',pathMaps.normal);bindMap(4,'uBaseRoughnessTexture',baseMaps.roughness);bindMap(5,'uPathRoughnessTexture',pathMaps.roughness);bindMap(6,'uBaseAOTexture',baseMaps.ao);bindMap(7,'uPathAOTexture',pathMaps.ao);bindMap(8,'uBaseHeightTexture',baseMaps.height);bindMap(9,'uPathHeightTexture',pathMaps.height);
    set1('uUseBaseTexture',baseAsset&&baseMaps.baseColor.ready?1:0);set1('uUsePathTexture',pathAsset&&pathMaps.baseColor.ready?1:0);set1('uUseBaseNormal',baseAsset&&baseMaps.normal.ready?1:0);set1('uUsePathNormal',pathAsset&&pathMaps.normal.ready?1:0);set1('uUseBaseRoughness',baseAsset&&baseMaps.roughness.ready?1:0);set1('uUsePathRoughness',pathAsset&&pathMaps.roughness.ready?1:0);set1('uUseBaseAO',baseAsset&&baseMaps.ao.ready?1:0);set1('uUsePathAO',pathAsset&&pathMaps.ao.ready?1:0);set1('uUseBaseHeight',baseAsset&&baseMaps.height.ready?1:0);set1('uUsePathHeight',pathAsset&&pathMaps.height.ready?1:0);
    gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(gl.getUniformLocation(p,'uShadowMap'),10);set1('uShadowEnabled',lights.shadows&&object.properties?.receivesShadows!==false?1:0);
    set3('uFogColor',lights.environment?.fogColor||hexToRgb(scene.settings.skyBottom||'#8ca6b8'));set1('uFogNear',Number(scene.settings.fogNear??80));set1('uFogFar',Number(scene.settings.fogFar??260));set1('uExposure',lights.exposure);
    const useImportedGroups=object.type==='model'&&!baseAsset&&Array.isArray(mesh.groups)&&mesh.groups.length;
    if(useImportedGroups){
      for(const group of mesh.groups){
        const material=group.material||mesh.sourceMaterials?.[group.materialIndex]||mesh.sourceMaterial||{};
        const color=Array.isArray(material.baseColor)?material.baseColor:[.62,.66,.72,1];
        const importedBase=this.textureFromUrl(material.textureUrls?.baseColor,false);
        const importedNormal=this.textureFromUrl(material.textureUrls?.normal,false);
        const importedRoughness=this.textureFromUrl(material.textureUrls?.roughness,false);
        const importedAO=this.textureFromUrl(material.textureUrls?.ao,false);
        set3('uBaseColor',new Float32Array([Number(color[0]??.62),Number(color[1]??.66),Number(color[2]??.72)]));
        set1('uBaseColorIsLinear',1);set1('uBaseTextureTintStrength',Number(material.textureTintStrength??1));
        bindMap(0,'uBaseTexture',importedBase);bindMap(2,'uBaseNormalTexture',importedNormal);bindMap(4,'uBaseRoughnessTexture',importedRoughness);bindMap(6,'uBaseAOTexture',importedAO);
        set1('uUseBaseTexture',importedBase.ready?1:0);set1('uUseBaseNormal',importedNormal.ready?1:0);set1('uUseBaseRoughness',importedRoughness.ready?1:0);set1('uUseBaseAO',importedAO.ready?1:0);set1('uUseBaseHeight',0);
        set1('uBaseTextureScale',1);set1('uBaseNormalStrength',Number(material.normalStrength??1));set1('uBaseRoughnessMultiplier',Number(material.roughnessMultiplier??1));set1('uBaseAOStrength',Number(material.aoStrength??1));
        const alpha=Number(color[3]??1);set1('uOpacity',alpha);set1('uRoughness',Number(material.roughness??.8));set1('uMetallic',Number(material.metallic??0));
        if(alpha<.999){gl.enable(gl.BLEND);gl.depthMask(false);}else{gl.disable(gl.BLEND);gl.depthMask(true);}
        if(material.doubleSided)gl.disable(gl.CULL_FACE);else gl.enable(gl.CULL_FACE);
        drawRange(Number(group.indexCount||0),Number(group.indexOffset||0)*mesh.indexStride);
      }
      gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    }else drawRange(mesh.count,0);
    gl.bindVertexArray(null);
  }
  drawLines(buffer,model,viewProj,color,width=1){if(!buffer?.count)return;const gl=this.gl,p=this.lineProgram;gl.useProgram(p);gl.bindVertexArray(buffer.vao);gl.uniformMatrix4fv(gl.getUniformLocation(p,'uModel'),false,model);gl.uniformMatrix4fv(gl.getUniformLocation(p,'uViewProj'),false,viewProj);gl.uniform4fv(gl.getUniformLocation(p,'uColor'),color);gl.lineWidth(width);gl.drawArrays(gl.LINES,0,buffer.count);gl.bindVertexArray(null);}
  createRenderGraph(){
    const graph=new RenderGraph({gl:this.gl,diagnostics:window.__omniforgeDiagnostics,gpuSampleInterval:30});
    for(const [name,descriptor] of [
      ['scene',{kind:'authority'}],['camera',{kind:'authority'}],['lighting',{kind:'frame-state'}],['environment',{kind:'frame-state'}],
      ['default-framebuffer',{kind:'framebuffer',format:'canvas'}],['hdr-scene-color',{kind:'texture',format:'rgba16f'}],['hdr-scene-depth',{kind:'renderbuffer',format:'depth24'}]
    ])graph.importResource(name,name==='default-framebuffer'?null:null,descriptor);
    graph.addPass({name:'shadow',category:'shadow',reads:['scene','camera','lighting'],writes:['shadow-map'],enabled:frame=>Boolean(frame.lights.shadows),execute:frame=>this.renderShadow(frame.scene,frame.lightViewProj,frame.options)});
    graph.addPass({name:'environment',category:'environment',after:['shadow'],reads:['camera','environment','default-framebuffer'],writes:['hdr-scene-color','hdr-scene-depth'],execute:frame=>this.renderEnvironmentPass(frame)});
    graph.addPass({name:'opaque-world',category:'geometry',after:['environment'],reads:['scene','camera','lighting','environment','shadow-map','hdr-scene-color','hdr-scene-depth'],writes:['hdr-scene-color','hdr-scene-depth'],execute:frame=>this.renderOpaqueWorldPass(frame)});
    graph.addPass({name:'editor-overlays',category:'editor',after:['opaque-world'],reads:['scene','camera','hdr-scene-color','hdr-scene-depth'],writes:['hdr-scene-color'],execute:frame=>this.renderEditorOverlayPass(frame)});
    graph.addPass({name:'display-transform',category:'display',after:['editor-overlays'],reads:['hdr-scene-color','environment'],writes:['scene-color'],execute:frame=>this.renderDisplayPass(frame)});
    graph.addPass({name:'diagnostics',category:'diagnostics',after:['display-transform'],reads:['scene-color'],writes:['frame-telemetry'],critical:false,execute:frame=>this.renderDiagnosticsPass(frame)});
    graph.compile();
    return graph;
  }
  renderEnvironmentPass(frame){
    const {gl,camera,environment}=frame;
    this.hdrPipeline.bindScene(this.canvas.width,this.canvas.height);
    gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(this.skyPass){try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}}
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);gl.cullFace(gl.BACK);
  }
  renderDisplayPass(frame){
    this.hdrPipeline.present({
      exposure: frame.environment.exposureEV,
      saturation: frame.environment.saturation,
      contrast: frame.environment.contrast,
      vibrance: frame.environment.vibrance,
      toneMapper: frame.environment.toneMapper
    });
  }
  renderOpaqueWorldPass(frame){
    const {gl,scene,camera,selectedId,viewProj,lightViewProj,lights,foliageGroups,foliageIds}=frame;
    const objects=scene.objects.filter(o=>o.visible&&!['empty','path'].includes(o.type)&&!foliageIds.has(o.id)&&!(frame.options.hideEditorReferences&&isEditorReference(o)));
    objects.sort((a,b)=>{const rank=o=>o.type==='terrain'?-20:o.type==='decal'?20+Number(o.properties?.sortOrder||0):0;return rank(a)-rank(b);});
    for(const object of objects){
      const mesh=this.meshFor(object,scene);if(!mesh)continue;
      gl.disable(gl.BLEND);gl.depthMask(true);
      const transparent=object.type==='decal'||Number(object.properties?.opacity??1)<.999;
      if(transparent){gl.enable(gl.BLEND);gl.depthMask(false);}
      if(object.type==='decal'){gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);}
      this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);
      if(object.type==='terrain')this.renderPathSurfacePass(frame);
      if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.CULL_FACE);}
      if(transparent){gl.disable(gl.BLEND);gl.depthMask(true);}
    }
    for(const instances of foliageGroups.values()){const object=instances[0],mesh=this.meshFor(object,scene);if(mesh)this.drawMesh(object,mesh,viewProj,lightViewProj,scene,false,camera,lights,instances);}
  }
  renderPathSurfacePass(frame){
    const {gl,scene,camera,viewProj,lightViewProj,lights}=frame;
    const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);if(!terrain)return;
    const pathScene=this.pathRenderScene(scene),paths=pathScene.objects.filter(object=>object.type==='path'&&object.visible!==false);if(!paths.length)return;
    gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);
    for(const pathObject of paths){
      const meshes=this.pathSurfaceFor(pathObject,pathScene);if(!meshes)continue;
      const segmentProfile=pathObject.properties?.pathNetwork?.segments?.[0]?.materialProfile||{};
      for(const [kind,mesh] of Object.entries(meshes)){
        if(!mesh)continue;
        const structural=kind==='structure';
        if(pathSurfaceCullMode(kind)==='double-sided')gl.disable(gl.CULL_FACE);
        else{gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);}
        const terrainMaterial={materialId:terrain.properties?.materialId||null,color:terrain.properties?.color||'#35522f'};
        const roadLike=kind==='road'||kind==='gutter';
        const curbLike=kind==='curb';
        const sidewalkLike=kind==='sidewalk'||kind==='sidewalkEdge';
        const objectSurface=structural||curbLike||sidewalkLike;
        const materialId=structural
          ?(segmentProfile.structureMaterialId||pathObject.properties?.structureMaterialId||null)
          :curbLike
            ?(segmentProfile.curbMaterialId||pathObject.properties?.curbMaterialId||null)
            :sidewalkLike
              ?(segmentProfile.sidewalkMaterialId||pathObject.properties?.sidewalkMaterialId||null)
              :roadLike
                ?(segmentProfile.surfaceMaterialId||pathObject.properties?.materialId||null)
                :terrainMaterial.materialId;
        const color=structural
          ?(pathObject.properties?.structureColor||'#596168')
          :curbLike
            ?(pathObject.properties?.curbColor||'#9a9b96')
            :sidewalkLike
              ?(pathObject.properties?.sidewalkColor||'#777c80')
              :roadLike
                ?(pathObject.properties?.color||'#73573d')
                :terrainMaterial.color;
        const proxy={id:`path-network-v2:${kind}:${pathObject.id}`,type:objectSurface?'model':'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{...pathObject.properties,...terrainMaterial,materialId,color,opacity:1,castsShadows:true,receivesShadows:true}};
        this.drawMesh(proxy,mesh,viewProj,lightViewProj,scene,false,camera,lights,null,objectSurface?null:pathObject);
      }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
  }
  renderEditorOverlayPass(frame){
    const {gl,scene,camera,selectedId,viewProj,options}=frame;
    const pathScene=this.pathRenderScene(scene);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.ensureGrid(scene);if(scene.settings.gridVisible)this.drawLines(this.grid,mat4Identity(),viewProj,[.45,.56,.68,.18]);
    if(scene.settings.splinesVisible!==false){
      // Spline guides are editor overlays, not world geometry. The previous
      // v011-spline-editing-only x-ray path left unselected guides depth-tested,
      // making them z-fight with sampled terrain and appear disconnected.
      gl.disable(gl.DEPTH_TEST);
      for(const pathObject of pathScene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){const buffers=this.pathBuffers(pathObject,pathScene),runtime=this.scenePathRuntimes(pathScene).find(item=>item.pathObjectId===pathObject.id),preview=pathObject.id===this.pathPreview?.id,selected=pathObject.id===selectedId,showCosts=preview||pathObject.properties?.pathNetwork?.editor?.showGrade===true||runtime?.diagnostics?.valid===false;this.drawLines(buffers.edges,mat4Identity(),viewProj,preview?[.2,.9,1,1]:(selected?[.96,.56,1,1]:[.56,.34,.18,.7]),preview?4:(selected?3:2));if(showCosts)for(const entry of buffers.costSegments||[])this.drawLines(entry.buffer,mat4Identity(),viewProj,entry.color,preview?6:5);if(selected||preview){this.drawLines(buffers.center,mat4Identity(),viewProj,showCosts?[1,1,1,.78]:(preview?[.85,1,1,1]:[1,.9,1,1]),showCosts?1.5:3);this.drawLines(buffers.construction,mat4Identity(),viewProj,preview?[.15,1,.7,.95]:[.25,.85,1,.9],2);}if(options?.editorMode!=='play')this.drawBlockedPathGuides(buffers,viewProj);}
      gl.enable(gl.DEPTH_TEST);
    }
    const selected=scene.objects.find(o=>o.id===selectedId);
    if(selected&&selected.visible&&!['terrain','path','empty'].includes(selected.type)){
      gl.disable(gl.DEPTH_TEST);let selectionTransform=selected.transform;
      if(selected.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===selected.properties?.assetId),bounds=asset?.bounds;if(bounds)selectionTransform={position:[selected.transform.position[0]+(bounds.center?.[0]||0)*selected.transform.scale[0],selected.transform.position[1]+(bounds.center?.[1]||0)*selected.transform.scale[1],selected.transform.position[2]+(bounds.center?.[2]||0)*selected.transform.scale[2]],rotation:selected.transform.rotation,scale:[Math.max(.02,Math.abs((bounds.size?.[0]||1)*selected.transform.scale[0])),Math.max(.02,Math.abs((bounds.size?.[1]||1)*selected.transform.scale[1])),Math.max(.02,Math.abs((bounds.size?.[2]||1)*selected.transform.scale[2]))]};}
      this.drawLines(this.selectionBox,modelMatrix(selectionTransform),viewProj,[.72,.45,1,1],2);gl.enable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND);
  }
  renderDiagnosticsPass(frame){
    if(window.__omniforgeDiagnostics?.enabled&&performance.now()-Number(this.lastDiagnosticGlCheck||0)>=1000){
      this.lastDiagnosticGlCheck=performance.now();frame.webglError=frame.gl.getError();
    }
  }
  handleContextLost(event){
    event?.preventDefault?.();this.contextLost=true;this.frameResources.markContextLost();this.renderGraph?.suspend('webgl-context-lost');
    window.__omniforgeDiagnostics?.warn?.('webgl-context-lost',{frameIndex:this.frameCounter,resources:this.frameResources.snapshot()});
  }
  handleContextRestored(){
    this.contextLost=false;this.frameResources.markContextRestored();
    window.__omniforgeDiagnostics?.event?.('webgl-context-restored',{recoveryMode:this.capabilities.contextRecoveryMode,contextGeneration:this.frameResources.contextGeneration});
    setTimeout(()=>globalThis.location?.reload?.(),0);
  }
  getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport,terrainSampling:this.lastTerrainSamplingDiagnostics,pathSurfaceCount:this.pathSurfaces.size,pathwayCorridors:[...this.pathSurfaces.entries()].map(([id,entry])=>({id,...(entry.diagnostics||{})}))};}
  dispose(){
    this.resizeObserver?.disconnect?.();this.canvas.removeEventListener('webglcontextlost',this.boundContextLost,false);this.canvas.removeEventListener('webglcontextrestored',this.boundContextRestored,false);this.renderGraph?.dispose?.();this.hdrPipeline?.dispose?.();
  }
  render(scene,camera,selectedId,options={}){
    const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('Renderer3D.render',{objects:scene.objects.length},12)||(()=>{});
    if(this.contextLost||this.frameResources.contextLost){finishDiagnostic({suspended:true,reason:'webgl-context-lost'});return;}
    this.resize();this.frameCounter+=1;
    const gl=this.gl,{viewProj}=this.cameraMatrices(camera),lights=this.lightState(scene,options.editorMode||'edit',options.hideEditorReferences?'game-accurate':options.viewportLightingMode),lightViewProj=this.lightMatrix(scene,lights);
    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    this.updateTerrainSamplingDiagnostics(scene);
    lights.environment=environment;lights.moonDir=environment.moonDirection;lights.moonColor=environment.moonColor;lights.moonIntensity=environment.moonLightIntensity;
    const foliageGroups=this.foliageGroups(scene,camera),foliageIds=new Set([...foliageGroups.values()].flat().map(item=>item.id));
    const frameResources=this.frameResources.beginFrame(this.frameCounter);
    const frame={gl,scene,camera,selectedId,options,viewProj,lights,lightViewProj,environment,foliageGroups,foliageIds,frameResources,resourceRevision:frameResources.revision,webglError:undefined};
    this.renderGraph.setResource('scene',scene);this.renderGraph.setResource('camera',camera);this.renderGraph.setResource('lighting',lights);this.renderGraph.setResource('environment',environment);
    let graphReport;
    try{graphReport=this.renderGraph.execute(frame);}catch(error){
      window.__omniforgeDiagnostics?.warn?.('render-graph-frame-failed',{message:error.message,frameIndex:this.frameCounter});
      this.hdrPipeline.bindScene(this.canvas.width,this.canvas.height);gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      graphReport=this.renderGraph.lastReport;
    }
    this.lastFrameReport={frameIndex:this.frameCounter,frameResources,graph:graphReport,capabilities:this.capabilities};
    if(window.__omniforgeDiagnostics?.enabled)window.__omniforgeRenderGraph=this.getRenderDiagnostics();
    finishDiagnostic({webglError:frame.webglError,renderGraphCpuMs:graphReport?.totalCpuMs,resourceRevision:frameResources.revision,passCount:graphReport?.passes?.length||0});
  }
  rayFromScreen(camera,x,y){const rect=this.canvas.getBoundingClientRect(),nx=((x-rect.left)/rect.width)*2-1,ny=1-((y-rect.top)/rect.height)*2,{inverse}=this.cameraMatrices(camera),near=transformPoint(inverse,[nx,ny,-1]),far=transformPoint(inverse,[nx,ny,1]);return {origin:[...camera.position],dir:normalize(sub(far,near))};}
  pick(scene,camera,x,y){const ray=this.rayFromScreen(camera,x,y);let best=null,bestT=Infinity;for(const object of scene.objects){if(!object.visible||object.locked||['terrain','path','empty'].includes(object.type))continue;let center=object.transform.position,s=object.transform.scale;let radius=.5*Math.hypot(s[0],s[1],s[2]);if(object.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId),bounds=asset?.bounds;if(bounds){center=[object.transform.position[0]+(bounds.center?.[0]||0)*s[0],object.transform.position[1]+(bounds.center?.[1]||0)*s[1],object.transform.position[2]+(bounds.center?.[2]||0)*s[2]];radius=Math.max(.15,(bounds.radius||Math.hypot(...(bounds.size||[1,1,1]))*.5)*Math.max(...s.map(Math.abs)));}}if(object.properties?.celestialRole)continue;if(object.type.includes('Light'))radius=1;const oc=sub(ray.origin,center),b=dot(oc,ray.dir),c=dot(oc,oc)-radius*radius,disc=b*b-c;if(disc<0)continue;const t=-b-Math.sqrt(disc);if(t>0&&t<bestT){bestT=t;best=object;}}return best;}
}
