import {
  DEG, add, sub, scale, dot, cross, length, normalize, clamp,
  mat4Identity, mat4Multiply, mat4Perspective, mat4Ortho, mat4LookAt, mat4Invert,
  transformPoint, modelMatrix, normalMatrix3, hexToRgb, cameraForward
} from './math.js';
import { terrainHeightAt as sharedTerrainHeightAt, pathBlendAt as sharedPathBlendAt, samplePathSpline, normalizeTerrainProperties, normalizePathProperties, terrainBounds } from './worldgen.js';
import { buildPathGuideSegments } from './path-visuals.js';
import { resolveViewportLighting } from './world-runtime.js';
import { normalizeEnvironmentState } from './environment-runtime.js';
import { SkyPass } from './sky-pass.js';

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
  vShadowCoord=uLightViewProj*world;
  gl_Position=uViewProj*world;
}`;
const meshFS=`#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUV;
in float vBlend;
in vec4 vShadowCoord;
out vec4 outColor;
uniform vec3 uBaseColor;
uniform vec3 uPathColor;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
uniform float uEditorFill;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uLightIntensity;
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

float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float noise2(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
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
  return mix(0.32,1.0,sum/9.0);
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

  vec3 baseLinear=pow(max(uBaseColor,vec3(0.001)),vec3(2.2));
  if(uUseBaseTexture>0.5){
    vec3 tex=texture(uBaseTexture,baseUV).rgb;
    baseLinear*=pow(max(tex,vec3(0.001)),vec3(2.2))*1.34;
  }else if(uIsTerrain>0.5){
    float macro=noise2(vWorld.xz*0.035)*0.22+noise2(vWorld.xz*0.21)*0.08;
    baseLinear*=0.82+macro;
  }

  vec3 pathLinear=pow(max(uPathColor,vec3(0.001)),vec3(2.2));
  if(uUsePathTexture>0.5){
    vec3 ptex=texture(uPathTexture,pathUV).rgb;
    pathLinear*=pow(max(ptex,vec3(0.001)),vec3(2.2))*1.30;
  }else{
    float grit=noise2(vWorld.xz*1.8)*0.18+noise2(vWorld.xz*.3)*.12;
    pathLinear*=.78+grit;
  }
  vec3 geometricN=normalize(vNormal);
  float recipeLight=max(dot(geometricN,normalize(-uLightDir)),0.0);
  baseLinear=applySurfaceRecipe(baseLinear,uBaseSurfaceLayers,uBaseSurfaceExtra,uBaseSurfaceMasks,uBaseSurfaceMasks2,uBaseSurfaceMasks3,uBaseWeatherResponse,uBaseAdvanced,uBaseDirtColor,uBaseMossColor,uBaseSnowColor,uBaseDamageColor,geometricN,baseUV,recipeLight);
  pathLinear=applySurfaceRecipe(pathLinear,uPathSurfaceLayers,uPathSurfaceExtra,uPathSurfaceMasks,uPathSurfaceMasks2,uPathSurfaceMasks3,uPathWeatherResponse,uPathAdvanced,uPathDirtColor,uPathMossColor,uPathSnowColor,uPathDamageColor,geometricN,pathUV,recipeLight);
  if(uIsTerrain>.5)baseLinear=mix(baseLinear,pathLinear,blend);

  vec3 n=geometricN;
  if(uIsTerrain>.5){
    vec3 baseN=uUseBaseNormal>.5?texture(uBaseNormalTexture,baseUV).xyz*2.0-1.0:vec3(0,0,1);
    vec3 pathN=uUsePathNormal>.5?texture(uPathNormalTexture,pathUV).xyz*2.0-1.0:vec3(0,0,1);
    vec3 mapped=mix(normalize(vec3(baseN.xy*uBaseNormalStrength,max(.05,baseN.z))),normalize(vec3(pathN.xy*uPathNormalStrength,max(.05,pathN.z))),blend);
    n=applyWorldNormal(n,mapped,1.0);
  }

  float roughness=clamp(uRoughness,0.03,1.0);
  float baseR=(uUseBaseRoughness>.5?texture(uBaseRoughnessTexture,baseUV).r:roughness)*uBaseRoughnessMultiplier;
  float pathR=(uUsePathRoughness>.5?texture(uPathRoughnessTexture,pathUV).r:roughness)*uPathRoughnessMultiplier;
  baseR=clamp(baseR,.03,1.0);pathR=clamp(pathR,.03,1.0);
  roughness=uIsTerrain>.5?mix(baseR,pathR,blend):baseR;
  float roughVariation=uIsTerrain>.5?mix(uBaseSurfaceExtra.w,uPathSurfaceExtra.w,blend):uBaseSurfaceExtra.w;roughness=clamp(roughness+(noise2(vWorld.xz*.31)-.5)*roughVariation,.03,1.0);
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
  vec3 ambient=pow(max(uAmbientColor,vec3(.001)),vec3(2.2))*uAmbientIntensity*(.38+.62*hemi)*materialAO;
  vec3 editorAmbient=baseLinear*vec3(uEditorFill)*(.55+.45*hemi)*materialAO;
  float slopeCavity=mix(.72,1.0,smoothstep(.03,.82,abs(n.y)));
  vec3 diffuse=uLightColor*ndl*uLightIntensity*shadow;
  vec3 halfDir=normalize(lightDir+viewDir);
  float specPower=mix(128.0,6.0,roughness);
  float f0=mix(.04,1.0,uMetallic);
  float spec=pow(max(dot(n,halfDir),0.0),specPower)*f0*(1.05-roughness*.52)*shadow;
  vec3 color=(baseLinear*(ambient+diffuse)+editorAmbient)*slopeCavity+uLightColor*spec*uLightIntensity;

  for(int i=0;i<4;i++){
    if(i>=uPointCount)break;
    vec3 toL=uPointPos[i]-vWorld;
    float dist=length(toL),range=uPointData[i].y;
    float att=max(0.0,1.0-dist/max(range,0.001));
    float d=max(dot(n,normalize(toL)),0.0);
    color+=baseLinear*uPointColor[i]*d*uPointData[i].x*att*att*materialAO;
  }

  float rim=pow(1.0-max(dot(viewDir,n),0.0),4.0)*.028;
  color+=rim;
  color=mix(color,color+vec3(.18,.055,.34),uSelected*.25);
  float distanceToCamera=length(uCameraPos-vWorld);
  float fog=smoothstep(uFogNear,uFogFar,distanceToCamera);
  color=mix(color,pow(max(uFogColor,vec3(.001)),vec3(2.2)),fog*.86);
  color*=max(.05,uExposure);
  color=(color*(2.51*color+.03))/(color*(2.43*color+.59)+.14);
  color=pow(clamp(color,0.0,1.0),vec3(1.0/2.2));
  outColor=vec4(color,clamp(uOpacity,0.0,1.0));
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
export function terrainMesh(object,paths){
  const props=normalizeTerrainProperties(object.properties||{},object.transform||{}),resX=clamp(Math.round(Number(props.resolutionX||props.resolution||128)),8,256),resZ=clamp(Math.round(Number(props.resolutionZ||props.resolution||128)),8,256),bounds=props.bounds,p=[],n=[],idx=[],uv=[],blends=[];
  const ox=Number(object.transform.position?.[0]||0),oy=Number(object.transform.position?.[1]||0),oz=Number(object.transform.position?.[2]||0);
  for(let z=0;z<=resZ;z++)for(let x=0;x<=resX;x++){
    const wx=lerp(bounds.minX,bounds.maxX,x/resX),wz=lerp(bounds.minZ,bounds.maxZ,z/resZ),wy=terrainHeight(object,wx,wz,paths);
    p.push(wx-ox,wy-oy,wz-oz);n.push(0,1,0);uv.push(x/resX,z/resZ);blends.push(pathBlendAt(paths,wx,wz));
  }
  for(let z=0;z<resZ;z++)for(let x=0;x<resX;x++){const a=z*(resX+1)+x,b=a+resX+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const normals=new Float32Array(p.length);
  for(let t=0;t<idx.length;t+=3){const ia=idx[t]*3,ib=idx[t+1]*3,ic=idx[t+2]*3,A=[p[ia],p[ia+1],p[ia+2]],B=[p[ib],p[ib+1],p[ib+2]],C=[p[ic],p[ic+1],p[ic+2]],fn=normalize(cross(sub(B,A),sub(C,A)));for(const ii of [ia,ib,ic]){normals[ii]+=fn[0];normals[ii+1]+=fn[1];normals[ii+2]+=fn[2];}}
  for(let k=0;k<normals.length;k+=3){const q=normalize([normals[k],normals[k+1],normals[k+2]]);normals[k]=q[0];normals[k+1]=q[1];normals[k+2]=q[2];}
  return {positions:new Float32Array(p),normals,indices:new Uint32Array(idx),uvs:new Float32Array(uv),blends:new Float32Array(blends)};
}
function pathLineData(object,terrain,paths){
  const properties=normalizePathProperties(object.properties||{},object.transform||{}),width=Number(properties.width||3),dense=samplePathSpline(object,{spacing:Math.max(.25,width*.16)}),offset=Number(properties.surfaceOffset||.03)+.08;
  return buildPathGuideSegments(dense,width,(x,z)=>terrainHeight(terrain,x,z,paths),offset);
}
function createBufferMesh(gl,data){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffers=[];
  const bind=(location,size,array)=>{const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
  bind(0,3,data.positions);bind(1,3,data.normals);bind(2,2,data.uvs);bind(3,1,data.blends);
  const ib=gl.createBuffer();buffers.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);gl.bindVertexArray(null);
  return {vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,indexStride:4,buffers,groups:Array.isArray(data.groups)?data.groups:[],sourceMaterials:Array.isArray(data.sourceMaterials)?data.sourceMaterials:[],sourceMaterial:data.material||null};
}
function createLineBuffer(gl,positions){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.bindVertexArray(null);return {vao,count:positions.length/3,buffer:b};
}

export class Renderer3D{
  constructor(canvas){
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL 2 is required.');
    const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=null;try{this.skyPass=new SkyPass(gl);}catch(error){console.error('Renderer-owned sky initialization failed; using the opaque environment fallback.',error);window.__omniforgeDiagnostics?.warn?.('sky-pass-initialization-failed',{message:error.message});}
    this.staticMeshes={cube:createBufferMesh(gl,cubeMesh()),plane:createBufferMesh(gl,planeMesh()),sphere:createBufferMesh(gl,sphereMesh()),cylinder:createBufferMesh(gl,cylinderMesh())};
    this.dynamic=new Map();this.pathLines=new Map();this.textureCache=new Map();this.instanceBuffers=new Set();this.renderStart=performance.now();this.assets=[];this.modelMeshes=new Map();this.modelLoads=new Map();this.modelRevisions=new Map();this.modelLoadRevisions=new Map();this.grid=null;this.gridKey='';this.selectionBox=createLineBuffer(gl,this.boxLines());this.whiteTexture=this.createSolidTexture([255,255,255,255]);this.flatNormalTexture=this.createSolidTexture([128,128,255,255]);
    this.createShadowResources(2048);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
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
  resize(){const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}}
  boxLines(){const c=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],e=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],p=[];e.forEach(([a,b])=>p.push(...c[a],...c[b]));return p;}
  gridLines(size,step){const p=[],half=size/2;for(let v=-half;v<=half+.001;v+=step){p.push(-half,.015,v,half,.015,v,v,.015,-half,v,.015,half);}return p;}
  ensureGrid(scene){const key=`${scene.settings.gridSize}:${scene.settings.gridStep}`;if(key===this.gridKey&&this.grid)return;if(this.grid){this.gl.deleteVertexArray(this.grid.vao);this.gl.deleteBuffer(this.grid.buffer);}this.grid=createLineBuffer(this.gl,this.gridLines(Number(scene.settings.gridSize||100),Number(scene.settings.gridStep||5)));this.gridKey=key;}
  meshFor(object,scene){
    if(object.type==='box')return this.staticMeshes.cube;if(object.type==='decal')return this.staticMeshes.plane;if(this.staticMeshes[object.type])return this.staticMeshes[object.type];if(object.type==='directionalLight'||object.type==='pointLight')return this.staticMeshes.sphere;if(object.type==='empty'||object.type==='path')return null;
    if(object.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId);if(asset)this.ensureModelMesh(asset);return asset?this.modelMeshes.get(asset.id)||null:null;}
    const paths=scene.objects.filter(o=>o.type==='path'),signature=JSON.stringify([object.type,object.properties,object.transform.scale,paths.map(p=>[p.visible,p.transform,p.properties])]),cached=this.dynamic.get(object.id);
    if(cached?.signature===signature)return cached.mesh;if(cached){for(const b of cached.mesh.buffers)this.gl.deleteBuffer(b);this.gl.deleteVertexArray(cached.mesh.vao);}
    const data=object.type==='terrain'?terrainMesh(object,paths):null;if(!data)return null;const mesh=createBufferMesh(this.gl,data);this.dynamic.set(object.id,{signature,mesh});return mesh;
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
    const terrain=scene.objects.find(o=>o.type==='terrain'),signature=JSON.stringify([pathObject.properties,pathObject.transform,terrain?.properties,terrain?.transform]),cached=this.pathLines.get(pathObject.id);if(cached?.signature===signature)return cached;
    if(cached){for(const item of [cached.center,cached.edges])if(item){this.gl.deleteVertexArray(item.vao);this.gl.deleteBuffer(item.buffer);}}
    const data=pathLineData(pathObject,terrain,scene.objects.filter(object=>object.type==='path'&&object.visible!==false)),next={signature,center:createLineBuffer(this.gl,data.center),edges:createLineBuffer(this.gl,data.edges)};this.pathLines.set(pathObject.id,next);return next;
  }
  cameraMatrices(camera){const forward=cameraForward(camera),target=add(camera.position,forward),view=mat4LookAt(camera.position,target),proj=mat4Perspective((camera.fov||62)*DEG,this.canvas.width/this.canvas.height,.08,12000),viewProj=mat4Multiply(proj,view);return {view,proj,viewProj,inverse:mat4Invert(viewProj)};}
  worldToScreen(camera,point){const rect=this.canvas.getBoundingClientRect(),{viewProj}=this.cameraMatrices(camera),x=point[0],y=point[1],z=point[2],cx=viewProj[0]*x+viewProj[4]*y+viewProj[8]*z+viewProj[12],cy=viewProj[1]*x+viewProj[5]*y+viewProj[9]*z+viewProj[13],cz=viewProj[2]*x+viewProj[6]*y+viewProj[10]*z+viewProj[14],cw=viewProj[3]*x+viewProj[7]*y+viewProj[11]*z+viewProj[15];if(cw<=.001)return {visible:false,x:0,y:0};const nx=cx/cw,ny=cy/cw;return {visible:cz/cw>=-1&&cz/cw<=1&&nx>=-1.2&&nx<=1.2&&ny>=-1.2&&ny<=1.2,x:(nx*.5+.5)*rect.width,y:(1-(ny*.5+.5))*rect.height};}
  terrainHeightForScene(scene,x,z){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false),paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);return terrainHeight(terrain,x,z,paths);}
  terrainPointFromScreen(scene,camera,x,y){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);if(!terrain)return null;const paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false),ray=this.rayFromScreen(camera,x,y),bounds=terrainBounds(terrain);let previous=null;for(let distance=0;distance<=12000;distance+=Math.max(1,Number(terrain.properties?.chunkSize||64)*.08)){const point=add(ray.origin,scale(ray.dir,distance));if(point[0]<bounds.minX-10||point[0]>bounds.maxX+10||point[2]<bounds.minZ-10||point[2]>bounds.maxZ+10)continue;const delta=point[1]-terrainHeight(terrain,point[0],point[2],paths);if(previous&&previous.delta>=0&&delta<=0){let low=previous.distance,high=distance;for(let step=0;step<18;step++){const mid=(low+high)*.5,p=add(ray.origin,scale(ray.dir,mid)),d=p[1]-terrainHeight(terrain,p[0],p[2],paths);if(d>0)low=mid;else high=mid;}const hit=add(ray.origin,scale(ray.dir,(low+high)*.5));return [hit[0],terrainHeight(terrain,hit[0],hit[2],paths),hit[2]];}previous={distance,delta};}return null;}
  lightState(scene,editorMode='edit'){
    const sun=scene.objects.find(o=>o.type==='directionalLight'&&o.visible);let dir=[.45,-.8,.25],color=[1,.95,.82],intensity=1,shadows=true;
    if(sun){const rx=(sun.transform.rotation[0]||0)*DEG,ry=(sun.transform.rotation[1]||0)*DEG;dir=normalize([Math.sin(ry)*Math.cos(rx),Math.sin(rx),-Math.cos(ry)*Math.cos(rx)]);color=hexToRgb(sun.properties.color);intensity=Number(sun.properties.intensity||1);shadows=sun.properties.castsShadows!==false;}
    const viewportLighting=resolveViewportLighting(scene.settings||{},editorMode,intensity);intensity=viewportLighting.sunIntensity;
    const points=scene.objects.filter(o=>o.type==='pointLight'&&o.visible).slice(0,4);return {dir,color,intensity,points,shadows,...viewportLighting};
  }
  lightMatrix(scene,lights){
    const terrain=scene.objects.find(o=>o.type==='terrain'),bounds=terrain?terrainBounds(terrain):{minX:-50,maxX:50,minZ:-50,maxZ:50},size=Math.max(60,Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)*.72),center=[(bounds.minX+bounds.maxX)*.5,terrain?.transform?.position?.[1]||0,(bounds.minZ+bounds.maxZ)*.5],eye=sub(center,scale(lights.dir,size*.8)),view=mat4LookAt(eye,center,[0,1,0]),proj=mat4Ortho(-size,size,-size,size,1,size*3);return mat4Multiply(proj,view);
  }
  renderShadow(scene,lightViewProj){
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.viewport(0,0,this.shadowSize,this.shadowSize);gl.clear(gl.DEPTH_BUFFER_BIT);gl.colorMask(false,false,false,false);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);gl.useProgram(this.depthProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram,'uLightViewProj'),false,lightViewProj);
    for(const object of scene.objects){if(!object.visible||['empty','path','directionalLight','pointLight'].includes(object.type)||object.properties?.castsShadows===false)continue;const mesh=this.meshFor(object,scene);if(!mesh)continue;gl.bindVertexArray(mesh.vao);gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram,'uModel'),false,modelMatrix(object.transform));gl.drawElements(gl.TRIANGLES,mesh.count,mesh.indexType,0);}
    gl.bindVertexArray(null);gl.cullFace(gl.BACK);gl.colorMask(true,true,true,true);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }
  drawMesh(object,mesh,viewProj,lightViewProj,scene,selected,camera,lights,instances=null){
    const gl=this.gl,p=this.meshProgram;gl.useProgram(p);gl.bindVertexArray(mesh.vao);const instanced=Array.isArray(instances)&&instances.length>0;let transform=object.transform;if(object.type==='directionalLight'||object.type==='pointLight')transform={...object.transform,scale:[.7,.7,.7]};const model=instanced?mat4Identity():modelMatrix(transform);
    const firstPath=scene.objects.find(o=>o.type==='path'&&o.visible),baseAsset=this.materialAsset(object.properties?.materialId),pathAsset=this.materialAsset(firstPath?.properties?.materialId),baseRecipe=this.surfaceRecipeForMaterial(baseAsset),pathRecipe=this.surfaceRecipeForMaterial(pathAsset);
    const baseMaps={baseColor:this.textureFor(baseAsset,'baseColor'),normal:this.textureFor(baseAsset,'normal'),roughness:this.textureFor(baseAsset,'roughness'),ao:this.textureFor(baseAsset,'ambientOcclusion'),height:this.textureFor(baseAsset,'height')};
    const pathMaps={baseColor:this.textureFor(pathAsset,'baseColor'),normal:this.textureFor(pathAsset,'normal'),roughness:this.textureFor(pathAsset,'roughness'),ao:this.textureFor(pathAsset,'ambientOcclusion'),height:this.textureFor(pathAsset,'height')};
    const setM4=(name,value)=>gl.uniformMatrix4fv(gl.getUniformLocation(p,name),false,value),set3=(name,value)=>gl.uniform3fv(gl.getUniformLocation(p,name),value),set1=(name,value)=>gl.uniform1f(gl.getUniformLocation(p,name),value);
    const bindMap=(unit,uniform,entry)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.uniform1i(gl.getUniformLocation(p,uniform),unit);};
    setM4('uModel',model);setM4('uViewProj',viewProj);setM4('uLightViewProj',lightViewProj);gl.uniformMatrix3fv(gl.getUniformLocation(p,'uNormalMat'),false,normalMatrix3(model));
    set1('uInstanced',instanced?1:0);
    const instanceCount=instanced?this.prepareInstances(mesh,instances):0,asset=object.type==='model'?this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId):null,bounds=asset?.bounds||{min:[0,0,0],size:[1,1,1]},foliageWind=object.properties?.wind||{};
    set1('uTime',(performance.now()-this.renderStart)/1000);set1('uFoliageWind',instanced?1:0);set1('uFoliageWindStrength',Number(foliageWind.strength??.35)*Number(scene.settings.windStrength??.35));set1('uFoliageWindFrequency',Number(foliageWind.frequency??1));set1('uFoliageBaseY',Number(bounds.min?.[1]??0));set1('uFoliageHeight',Math.max(.001,Number(bounds.size?.[1]??1)));set3('uFoliageWindDirection',new Float32Array(Array.isArray(scene.settings.windDirection)?scene.settings.windDirection:[1,0,.25]));
    const drawRange=(count,offset=0)=>{if(instanced)gl.drawElementsInstanced(gl.TRIANGLES,count,mesh.indexType,offset,instanceCount);else gl.drawElements(gl.TRIANGLES,count,mesh.indexType,offset);};
    set3('uBaseColor',hexToRgb(object.properties.color||'#9da7b8'));set3('uPathColor',hexToRgb(firstPath?.properties?.color||'#73573d'));set3('uAmbientColor',hexToRgb(scene.settings.ambientColor||'#ffffff'));set1('uAmbientIntensity',lights.ambientIntensity);set1('uEditorFill',lights.editorFill);
    set3('uLightDir',lights.dir);set3('uLightColor',lights.color);set1('uLightIntensity',lights.intensity);gl.uniform1i(gl.getUniformLocation(p,'uPointCount'),lights.points.length);
    const pp=new Float32Array(12),pc=new Float32Array(12),pd=new Float32Array(8);lights.points.forEach((l,i)=>{pp.set(l.transform.position,i*3);pc.set(hexToRgb(l.properties.color),i*3);pd.set([Number(l.properties.intensity||1),Number(l.properties.range||10)],i*2);});gl.uniform3fv(gl.getUniformLocation(p,'uPointPos[0]'),pp);gl.uniform3fv(gl.getUniformLocation(p,'uPointColor[0]'),pc);gl.uniform2fv(gl.getUniformLocation(p,'uPointData[0]'),pd);
    set1('uSelected',selected?1:0);set3('uCameraPos',camera.position);set1('uRoughness',Number(baseAsset?.settings?.roughness??object.properties.roughness??.75));set1('uMetallic',Number(baseAsset?.settings?.metallic??object.properties.metallic??0));set1('uIsTerrain',object.type==='terrain'?1:0);
    const baseSettings=baseAsset?.settings||{},pathSettings=pathAsset?.settings||{};
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
    const structures=scene.objects.filter(item=>item.visible&&['box','model','cylinder'].includes(item.type)).slice(0,4),sp=new Float32Array(12);structures.forEach((item,index)=>sp.set(item.transform.position,index*3));gl.uniform1i(gl.getUniformLocation(p,'uStructureCount'),structures.length);gl.uniform3fv(gl.getUniformLocation(p,'uStructurePos[0]'),sp);
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
        const color=Array.isArray(material.baseColor)?material.baseColor:[.62,.66,.72,1],importedBase=this.textureFromUrl(material.textureUrls?.baseColor,false);
        set3('uBaseColor',new Float32Array([Number(color[0]??.62),Number(color[1]??.66),Number(color[2]??.72)]));
        bindMap(0,'uBaseTexture',importedBase);set1('uUseBaseTexture',importedBase.ready?1:0);set1('uBaseTextureScale',1);
        set1('uOpacity',Number(color[3]??1));set1('uRoughness',Number(material.roughness??.8));set1('uMetallic',Number(material.metallic??0));
        if(material.doubleSided)gl.disable(gl.CULL_FACE);else gl.enable(gl.CULL_FACE);
        drawRange(Number(group.indexCount||0),Number(group.indexOffset||0)*mesh.indexStride);
      }
      gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    }else drawRange(mesh.count,0);
    gl.bindVertexArray(null);
  }
  drawLines(buffer,model,viewProj,color,width=1){if(!buffer?.count)return;const gl=this.gl,p=this.lineProgram;gl.useProgram(p);gl.bindVertexArray(buffer.vao);gl.uniformMatrix4fv(gl.getUniformLocation(p,'uModel'),false,model);gl.uniformMatrix4fv(gl.getUniformLocation(p,'uViewProj'),false,viewProj);gl.uniform4fv(gl.getUniformLocation(p,'uColor'),color);gl.lineWidth(width);gl.drawArrays(gl.LINES,0,buffer.count);gl.bindVertexArray(null);}
  render(scene,camera,selectedId,options={}){
    const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('Renderer3D.render',{objects:scene.objects.length},12)||(()=>{});
    this.resize();
    const gl=this.gl,{viewProj}=this.cameraMatrices(camera),lights=this.lightState(scene,options.editorMode||'edit'),lightViewProj=this.lightMatrix(scene,lights);
    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    lights.environment=environment;
    if(lights.shadows)this.renderShadow(scene,lightViewProj);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(this.skyPass){try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}}
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.cullFace(gl.BACK);
    const foliageGroups=this.foliageGroups(scene,camera),foliageIds=new Set([...foliageGroups.values()].flat().map(item=>item.id));
    const objects=scene.objects.filter(o=>o.visible&&!['empty','path'].includes(o.type)&&!foliageIds.has(o.id));objects.sort((a,b)=>{const rank=o=>o.type==='terrain'?-20:o.type==='decal'?20+Number(o.properties?.sortOrder||0):0;return rank(a)-rank(b);});for(const object of objects){const mesh=this.meshFor(object,scene);if(!mesh)continue;if(object.type==='decal'){gl.enable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);}this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.enable(gl.CULL_FACE);}}
    for(const instances of foliageGroups.values()){const object=instances[0],mesh=this.meshFor(object,scene);if(mesh)this.drawMesh(object,mesh,viewProj,lightViewProj,scene,false,camera,lights,instances);}
    this.ensureGrid(scene);if(scene.settings.gridVisible)this.drawLines(this.grid,mat4Identity(),viewProj,[.45,.56,.68,.18]);
    if(scene.settings.splinesVisible!==false)for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){const buffers=this.pathBuffers(pathObject,scene),selected=pathObject.id===selectedId;this.drawLines(buffers.edges,mat4Identity(),viewProj,selected?[.83,.62,1,.9]:[.30,.22,.15,.28],selected?2:1);if(selected)this.drawLines(buffers.center,mat4Identity(),viewProj,[.92,.8,1,1],2);}
    const selected=scene.objects.find(o=>o.id===selectedId);if(selected&&selected.visible&&!['terrain','path','empty'].includes(selected.type)){gl.disable(gl.DEPTH_TEST);let selectionTransform=selected.transform;if(selected.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===selected.properties?.assetId),bounds=asset?.bounds;if(bounds)selectionTransform={position:[selected.transform.position[0]+(bounds.center?.[0]||0)*selected.transform.scale[0],selected.transform.position[1]+(bounds.center?.[1]||0)*selected.transform.scale[1],selected.transform.position[2]+(bounds.center?.[2]||0)*selected.transform.scale[2]],rotation:selected.transform.rotation,scale:[Math.max(.02,Math.abs((bounds.size?.[0]||1)*selected.transform.scale[0])),Math.max(.02,Math.abs((bounds.size?.[1]||1)*selected.transform.scale[1])),Math.max(.02,Math.abs((bounds.size?.[2]||1)*selected.transform.scale[2]))]};}this.drawLines(this.selectionBox,modelMatrix(selectionTransform),viewProj,[.72,.45,1,1],2);gl.enable(gl.DEPTH_TEST);}
    let webglError;
    if(window.__omniforgeDiagnostics?.enabled&&performance.now()-Number(this.lastDiagnosticGlCheck||0)>=1000){
      this.lastDiagnosticGlCheck=performance.now();
      webglError=gl.getError();
    }
    finishDiagnostic(webglError===undefined?{}:{webglError});
  }
  rayFromScreen(camera,x,y){const rect=this.canvas.getBoundingClientRect(),nx=((x-rect.left)/rect.width)*2-1,ny=1-((y-rect.top)/rect.height)*2,{inverse}=this.cameraMatrices(camera),near=transformPoint(inverse,[nx,ny,-1]),far=transformPoint(inverse,[nx,ny,1]);return {origin:[...camera.position],dir:normalize(sub(far,near))};}
  pick(scene,camera,x,y){const ray=this.rayFromScreen(camera,x,y);let best=null,bestT=Infinity;for(const object of scene.objects){if(!object.visible||object.locked||['terrain','path','empty'].includes(object.type))continue;let center=object.transform.position,s=object.transform.scale;let radius=.5*Math.hypot(s[0],s[1],s[2]);if(object.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId),bounds=asset?.bounds;if(bounds){center=[object.transform.position[0]+(bounds.center?.[0]||0)*s[0],object.transform.position[1]+(bounds.center?.[1]||0)*s[1],object.transform.position[2]+(bounds.center?.[2]||0)*s[2]];radius=Math.max(.15,(bounds.radius||Math.hypot(...(bounds.size||[1,1,1]))*.5)*Math.max(...s.map(Math.abs)));}}if(object.type.includes('Light'))radius=1;const oc=sub(ray.origin,center),b=dot(oc,ray.dir),c=dot(oc,oc)-radius*radius,disc=b*b-c;if(disc<0)continue;const t=-b-Math.sqrt(disc);if(t>0&&t<bestT){bestT=t;best=object;}}return best;}
}
