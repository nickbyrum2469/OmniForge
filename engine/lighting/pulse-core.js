export const PULSE_VERSION = '0.1.0';

export const PULSE_DEFAULTS = Object.freeze({
  enabled: false,
  intensity: 1,
  maxBounces: 3,
  maxLinks: 10,
  maxDistance: 28,
  minLinkWeight: 0.00045,
  maxLinkWeight: 0.32,
  bounceRetention: 0.72,
  pointLightLimit: 8,
  maxIrradiance: 8
});

const PI = Math.PI;
const DEG = PI / 180;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len = a => Math.hypot(a[0],a[1],a[2]);
const norm = a => { const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };
const had = (a,b) => [a[0]*b[0],a[1]*b[1],a[2]*b[2]];

function hexToLinear(hex='#ffffff'){
  const clean=String(hex||'#ffffff').replace('#','');
  const full=clean.length===3?clean.split('').map(c=>c+c).join(''):clean.padEnd(6,'f');
  return [0,2,4].map(i=>Math.pow((parseInt(full.slice(i,i+2),16)||0)/255,2.2));
}

function rotateVec(v,rotation=[0,0,0]){
  const rz=(Number(rotation[2])||0)*DEG,cz=Math.cos(rz),sz=Math.sin(rz);
  let x=v[0]*cz-v[1]*sz,y=v[0]*sz+v[1]*cz,z=v[2];
  const rx=(Number(rotation[0])||0)*DEG,cx=Math.cos(rx),sx=Math.sin(rx);
  const y2=y*cx-z*sx,z2=y*sx+z*cx;y=y2;z=z2;
  const ry=(Number(rotation[1])||0)*DEG,cy=Math.cos(ry),sy=Math.sin(ry);
  return [x*cy+z*sy,y,-x*sy+z*cy];
}

function objectAabb(object){
  const p=(object.transform?.position||[0,0,0]).map(Number);
  const s=(object.transform?.scale||[1,1,1]).map(v=>Math.max(0.01,Math.abs(Number(v)||1)));
  const r=object.transform?.rotation||[0,0,0];
  const ex=rotateVec([s[0]*.5,0,0],r),ey=rotateVec([0,s[1]*.5,0],r),ez=rotateVec([0,0,s[2]*.5],r);
  const h=[
    Math.abs(ex[0])+Math.abs(ey[0])+Math.abs(ez[0]),
    Math.abs(ex[1])+Math.abs(ey[1])+Math.abs(ez[1]),
    Math.abs(ex[2])+Math.abs(ey[2])+Math.abs(ez[2])
  ];
  return {objectId:object.id,min:[p[0]-h[0],p[1]-h[1],p[2]-h[2]],max:[p[0]+h[0],p[1]+h[1],p[2]+h[2]]};
}

function segmentHitsAabb(origin,dir,maxT,box){
  let t0=0,t1=maxT;
  for(let axis=0;axis<3;axis++){
    const d=dir[axis],o=origin[axis];
    if(Math.abs(d)<1e-7){ if(o<box.min[axis]||o>box.max[axis])return false; continue; }
    let a=(box.min[axis]-o)/d,b=(box.max[axis]-o)/d;
    if(a>b){const t=a;a=b;b=t;}
    t0=Math.max(t0,a);t1=Math.min(t1,b);
    if(t1<t0)return false;
  }
  return t1>0&&t0<maxT;
}

function visibleSegment(a,b,occluders,excludeA=null,excludeB=null){
  const delta=sub(b,a),distance=len(delta);
  if(distance<0.025)return true;
  const dir=mul(delta,1/distance),origin=add(a,mul(dir,.035)),maxT=Math.max(.001,distance-.07);
  for(const box of occluders){
    if(box.objectId===excludeA||box.objectId===excludeB)continue;
    if(segmentHitsAabb(origin,dir,maxT,box))return false;
  }
  return true;
}

const FACE_DEFS = [
  {faceIndex:0,n:[1,0,0],axis:0,sign:1},
  {faceIndex:1,n:[-1,0,0],axis:0,sign:-1},
  {faceIndex:2,n:[0,1,0],axis:1,sign:1},
  {faceIndex:3,n:[0,-1,0],axis:1,sign:-1},
  {faceIndex:4,n:[0,0,1],axis:2,sign:1},
  {faceIndex:5,n:[0,0,-1],axis:2,sign:-1}
];

function faceArea(scale,axis){
  if(axis===0)return scale[1]*scale[2];
  if(axis===1)return scale[0]*scale[2];
  return scale[0]*scale[1];
}

function cellsForObject(object){
  const type=object.type;
  if(!['box','plane','cylinder','model'].includes(type))return [];
  const position=(object.transform?.position||[0,0,0]).map(Number);
  const rotation=object.transform?.rotation||[0,0,0];
  const scale=(object.transform?.scale||[1,1,1]).map(v=>Math.max(.02,Math.abs(Number(v)||1)));
  const albedo=hexToLinear(object.properties?.color||'#9da7b8');
  if(type==='plane'){
    const n=norm(rotateVec([0,1,0],rotation));
    return [{id:`${object.id}:2`,objectId:object.id,faceIndex:2,position:[...position],normal:n,area:Math.max(.02,scale[0]*scale[2]),albedo}];
  }
  return FACE_DEFS.map(face=>{
    const local=[0,0,0];local[face.axis]=face.sign*scale[face.axis]*.5;
    return {
      id:`${object.id}:${face.faceIndex}`,
      objectId:object.id,
      faceIndex:face.faceIndex,
      position:add(position,rotateVec(local,rotation)),
      normal:norm(rotateVec(face.n,rotation)),
      area:Math.max(.02,faceArea(scale,face.axis)),
      albedo
    };
  });
}

export function normalizePulseSettings(settings={}){
  const authored=settings.pulseLighting||{};
  return {
    ...PULSE_DEFAULTS,
    ...authored,
    enabled:settings.lightingMode==='pulse'||authored.enabled===true,
    intensity:Number.isFinite(Number(authored.intensity))?Number(authored.intensity):PULSE_DEFAULTS.intensity,
    maxBounces:clamp(Math.round(Number(authored.maxBounces??PULSE_DEFAULTS.maxBounces)),1,6),
    maxLinks:clamp(Math.round(Number(authored.maxLinks??PULSE_DEFAULTS.maxLinks)),2,24),
    maxDistance:clamp(Number(authored.maxDistance??PULSE_DEFAULTS.maxDistance),4,120),
    bounceRetention:clamp(Number(authored.bounceRetention??PULSE_DEFAULTS.bounceRetention),.1,.95)
  };
}

export function buildPulseModel(scene){
  const settings=normalizePulseSettings(scene.settings||{});
  const geometry=(scene.objects||[]).filter(object=>object.visible!==false&&!['directionalLight','pointLight','empty','path','decal','terrain'].includes(object.type));
  const cells=geometry.flatMap(cellsForObject);
  const occluders=geometry.filter(object=>object.properties?.castsShadows!==false).map(objectAabb);
  const links=Array.from({length:cells.length},()=>[]);
  for(let i=0;i<cells.length;i++){
    const a=cells[i],candidates=[];
    for(let j=0;j<cells.length;j++){
      if(i===j)continue;
      const b=cells[j];if(a.objectId===b.objectId)continue;
      const delta=sub(b.position,a.position),distance=len(delta);
      if(distance<.08||distance>settings.maxDistance)continue;
      const dir=mul(delta,1/distance);
      const cosA=Math.max(0,dot(a.normal,dir)),cosB=Math.max(0,dot(b.normal,mul(dir,-1)));
      if(cosA<.035||cosB<.035)continue;
      let factor=cosA*cosB*a.area/(PI*Math.max(.08,distance*distance));
      factor=clamp(factor,0,settings.maxLinkWeight);
      if(factor<settings.minLinkWeight)continue;
      if(!visibleSegment(a.position,b.position,occluders,a.objectId,b.objectId))continue;
      candidates.push({to:j,weight:factor,distance});
    }
    candidates.sort((x,y)=>y.weight-x.weight);
    links[i]=candidates.slice(0,settings.maxLinks);
  }
  return {version:PULSE_VERSION,settings,cells,links,occluders};
}

function sunState(scene){
  const sun=(scene.objects||[]).find(object=>object.type==='directionalLight'&&object.visible!==false);
  if(!sun)return null;
  const rx=(Number(sun.transform?.rotation?.[0])||0)*DEG,ry=(Number(sun.transform?.rotation?.[1])||0)*DEG;
  const dir=norm([Math.sin(ry)*Math.cos(rx),Math.sin(rx),-Math.cos(ry)*Math.cos(rx)]);
  return {dir,color:hexToLinear(sun.properties?.color||'#fff1d3'),intensity:Number(sun.properties?.intensity??1),castsShadows:sun.properties?.castsShadows!==false};
}

function pointStates(scene,limit){
  return (scene.objects||[]).filter(object=>object.type==='pointLight'&&object.visible!==false).slice(0,limit).map(light=>({
    id:light.id,
    position:(light.transform?.position||[0,0,0]).map(Number),
    color:hexToLinear(light.properties?.color||'#ffffff'),
    intensity:Number(light.properties?.intensity??1),
    range:Math.max(.01,Number(light.properties?.range??12))
  }));
}

export function computePulseSource(model,scene){
  const source=new Float32Array(model.cells.length*3),sun=sunState(scene),points=pointStates(scene,model.settings.pointLightLimit);
  for(let i=0;i<model.cells.length;i++){
    const cell=model.cells[i];let E=[0,0,0];
    if(sun&&sun.intensity>0){
      const toSun=mul(sun.dir,-1),ndl=Math.max(0,dot(cell.normal,toSun));
      if(ndl>0){
        const visible=!sun.castsShadows||visibleSegment(add(cell.position,mul(cell.normal,.025)),add(cell.position,mul(toSun,240)),model.occluders,cell.objectId,null);
        if(visible)E=add(E,mul(sun.color,sun.intensity*ndl));
      }
    }
    for(const light of points){
      const delta=sub(light.position,cell.position),distance=len(delta);
      if(distance>=light.range||distance<.02)continue;
      const L=mul(delta,1/distance),ndl=Math.max(0,dot(cell.normal,L));
      if(ndl<=0)continue;
      if(!visibleSegment(add(cell.position,mul(cell.normal,.025)),light.position,model.occluders,cell.objectId,light.id))continue;
      const falloff=Math.max(0,1-distance/light.range),power=light.intensity*falloff*falloff;
      E=add(E,mul(light.color,power*ndl));
    }
    const reflected=mul(had(E,cell.albedo),1/PI);
    source[i*3]=reflected[0];source[i*3+1]=reflected[1];source[i*3+2]=reflected[2];
  }
  return source;
}

export function solvePulseLighting(model,scene,previousIndirect=null){
  const source=computePulseSource(model,scene),n=model.cells.length,indirect=new Float32Array(n*3);
  let front=new Float32Array(source);
  for(let bounce=0;bounce<model.settings.maxBounces;bounce++){
    const next=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const sr=i*3,r=front[sr],g=front[sr+1],b=front[sr+2];
      if(Math.max(Math.abs(r),Math.abs(g),Math.abs(b))<1e-6)continue;
      for(const link of model.links[i]){
        const dr=link.to*3,w=link.weight;
        const rr=r*w,gg=g*w,bb=b*w;
        indirect[dr]+=rr;indirect[dr+1]+=gg;indirect[dr+2]+=bb;
        const alb=model.cells[link.to].albedo,retain=model.settings.bounceRetention;
        next[dr]+=rr*alb[0]*retain;next[dr+1]+=gg*alb[1]*retain;next[dr+2]+=bb*alb[2]*retain;
      }
    }
    front=next;
  }
  for(let i=0;i<indirect.length;i++)indirect[i]=clamp(indirect[i],0,model.settings.maxIrradiance);
  const previous=previousIndirect&&previousIndirect.length===indirect.length?previousIndirect:new Float32Array(indirect.length);
  const delta=new Float32Array(indirect.length);let deltaEnergy=0,maxDelta=0;
  for(let i=0;i<indirect.length;i++){delta[i]=indirect[i]-previous[i];const a=Math.abs(delta[i]);deltaEnergy+=a;maxDelta=Math.max(maxDelta,a);}
  return {source,indirect,delta,stats:{cells:n,links:model.links.reduce((sum,list)=>sum+list.length,0),deltaEnergy,maxDelta,bounces:model.settings.maxBounces}};
}

export function aggregatePulseObjects(model,indirect){
  const objects={};
  for(let i=0;i<model.cells.length;i++){
    const cell=model.cells[i];
    let entry=objects[cell.objectId];
    if(!entry)entry=objects[cell.objectId]={normals:new Array(18).fill(0),irradiance:new Array(18).fill(0)};
    const o=cell.faceIndex*3,s=i*3;
    entry.normals[o]=cell.normal[0];entry.normals[o+1]=cell.normal[1];entry.normals[o+2]=cell.normal[2];
    entry.irradiance[o]=indirect[s];entry.irradiance[o+1]=indirect[s+1];entry.irradiance[o+2]=indirect[s+2];
  }
  return objects;
}
