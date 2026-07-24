import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const filePath = file => path.join(root, file);
const read = file => fs.readFileSync(filePath(file), 'utf8');
const write = (file, content) => fs.writeFileSync(filePath(file), content, 'utf8');

function replaceOnce(file, before, after, label = file) {
  const source = read(file);
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`v0.11 patch target not found: ${label}`);
  write(file, source.replace(before, after));
  return true;
}

function replaceRegex(file, pattern, replacement, marker, label = file) {
  const source = read(file);
  if (marker && source.includes(marker)) return false;
  if (!pattern.test(source)) throw new Error(`v0.11 regex patch target not found: ${label}`);
  write(file, source.replace(pattern, replacement));
  return true;
}

// Shared state authority and migration.
replaceOnce(
  'server/state-store.mjs',
  "import { starterProviders, normalizeProviders, normalizeJobs, normalizeIntegrationSettings } from './provider-framework.mjs';",
  "import { starterProviders, normalizeProviders, normalizeJobs, normalizeIntegrationSettings } from './provider-framework.mjs';\nimport { migrateSceneWorldFoundation, normalizeTerrainProperties, normalizePathProperties } from '../app/worldgen.js';",
  'worldgen state import'
);

let stateStore = read('server/state-store.mjs');
stateStore = stateStore
  .replaceAll("version:'0.9.0'", "version:'0.11.0'")
  .replaceAll("version: '0.9.0'", "version: '0.11.0'")
  .replaceAll('schemaVersion:8', 'schemaVersion:9')
  .replaceAll('schemaVersion: 8', 'schemaVersion: 9')
  .replaceAll('Math.max(8,', 'Math.max(9,')
  .replaceAll('state.schemaVersion = 8;', 'state.schemaVersion = 9;')
  .replaceAll('project.schemaVersion=8', 'project.schemaVersion=9')
  .replaceAll('schemaVersion:8,createdAt', 'schemaVersion:9,createdAt')
  .replaceAll('schemaVersion:8 }', 'schemaVersion:9 }');
write('server/state-store.mjs', stateStore);

replaceOnce(
  'server/state-store.mjs',
  "const terrain = baseObject('terrain', 'Terrain', [0,0,0], { id:'terrain-main', properties:{ size:100,resolution:96,amplitude:4,frequency:.055,seed:17,color:'#526d49',roughness:.86,materialId:'material-highland-grass',collider:true,receivesShadows:true } });",
  "const terrain = baseObject('terrain', 'Terrain', [0,0,0], { id:'terrain-main', properties:normalizeTerrainProperties({ preset:'mountainValley',sizeX:180,sizeZ:180,resolution:144,height:34,macroScale:190,detailScale:34,octaves:6,warpStrength:38,ridgeStrength:.72,valleyStrength:.58,valleyRadius:58,canyonDepth:0,islandStrength:0,seaLevel:0,seed:17,color:'#526d49',roughness:.86,materialId:'material-highland-grass',collider:true,receivesShadows:true,hydrologyReady:true },{position:[0,0,0],scale:[1,1,1]}) });",
  'starter terrain v0.11'
);
replaceOnce(
  'server/state-store.mjs',
  "const pathObject = baseObject('path', 'Terrain Path', [0,0,0], { id:'path-main', properties:{ width:3.2,surfaceOffset:.03,color:'#73573d',materialId:'material-packed-earth',blendDistance:3.2,edgeNoise:.65,points:[[-32,-22],[-20,-13],[-8,-8],[5,-2],[17,9],[30,16]],conformToTerrain:true,collider:true,navigation:true,vegetationExclusion:1.2 } });",
  "const pathObject = baseObject('path', 'Terrain Path', [0,0,0], { id:'path-main', properties:normalizePathProperties({ width:3.2,surfaceOffset:.03,color:'#73573d',materialId:'material-packed-earth',blendDistance:3.2,edgeNoise:.36,points:[[-48,-34],[-31,-20],[-12,-11],[7,-3],[24,13],[47,28]],worldSpacePoints:true,spline:true,splineTension:.42,samplesPerSegment:16,showSpline:true,carveTerrain:true,maxGradePercent:11,maxCutDepth:7,maxFillDepth:2.5,cutShoulder:4.2,conformToTerrain:true,collider:true,navigation:true,vegetationExclusion:1.2 },{position:[0,0,0],scale:[1,1,1]}) });",
  'starter spline v0.11'
);
replaceOnce(
  'server/state-store.mjs',
  "const block = baseObject('box', 'Scene Block', [7,6.05,4], { id:'block-main', scale:[6,4,6], properties:{ color:'#3f66a3',metallic:.08,roughness:.78,collider:true } });",
  "const block = baseObject('box', 'Scale Reference Block', [7,6.05,4], { id:'block-main', scale:[6,4,6], properties:{ color:'#3f66a3',metallic:.08,roughness:.78,collider:true,editorReference:true,purpose:'Starter scale, collision, lighting, and shadow reference. No scene-management behavior.' } });",
  'explain Scene Block'
);
replaceOnce(
  'server/state-store.mjs',
  "gridVisible:true,gridSize:100,gridStep:5,fogNear:90",
  "gridVisible:true,splinesVisible:true,worldChunkSize:64,gridSize:200,gridStep:5,fogNear:90",
  'starter spline visibility'
);
replaceOnce(
  'server/state-store.mjs',
  "const scene = starterScene(template);\n  return {",
  "const scene = migrateSceneWorldFoundation(starterScene(template));\n  return {",
  'default scene migration'
);
replaceOnce(
  'server/state-store.mjs',
  "scene.settings = { fogNear:90,fogFar:280,exposure:1,gridVisible:true,waterLevel:-100,windDirection:[1,0,.25],windStrength:.35,season:'summer',weatherWetness:0,weatherSnow:0,...scene.settings };\n    scene.editorCamera",
  "scene.settings = { fogNear:90,fogFar:280,exposure:1,gridVisible:true,splinesVisible:true,worldChunkSize:64,waterLevel:-100,windDirection:[1,0,.25],windStrength:.35,season:'summer',weatherWetness:0,weatherSnow:0,...scene.settings };\n    migrateSceneWorldFoundation(scene);\n    const referenceBlock=scene.objects.find(object=>object.id==='block-main'&&object.name==='Scene Block');if(referenceBlock){referenceBlock.name='Scale Reference Block';referenceBlock.properties={...(referenceBlock.properties||{}),editorReference:true,purpose:'Starter scale, collision, lighting, and shadow reference. No scene-management behavior.'};}\n    scene.editorCamera",
  'migrate every project scene'
);
replaceOnce(
  'server/state-store.mjs',
  "terrain:{name:'Terrain',properties:{size:80,resolution:80,amplitude:3,frequency:.06,seed:11,color:'#607b52',roughness:.9,materialId:null,collider:true,receivesShadows:true}},",
  "terrain:{name:'Terrain',properties:normalizeTerrainProperties({preset:'rollingHills',sizeX:120,sizeZ:120,resolution:112,height:18,macroScale:150,detailScale:34,octaves:6,warpStrength:20,ridgeStrength:.18,seed:11,color:'#607b52',roughness:.9,materialId:null,collider:true,receivesShadows:true,hydrologyReady:true},{position:[0,0,0],scale:[1,1,1]})},",
  'new terrain defaults'
);
replaceOnce(
  'server/state-store.mjs',
  "path:{name:'Path',properties:{width:3,surfaceOffset:.03,color:'#8c7354',materialId:null,blendDistance:2.5,edgeNoise:.5,points:[[-10,0],[0,0],[10,0]],conformToTerrain:true,collider:true,navigation:true,vegetationExclusion:1}},",
  "path:{name:'Path',properties:normalizePathProperties({width:3,surfaceOffset:.03,color:'#8c7354',materialId:null,blendDistance:2.5,edgeNoise:.35,points:[[-10,0],[0,0],[10,0]],worldSpacePoints:true,spline:true,splineTension:.5,samplesPerSegment:14,showSpline:true,carveTerrain:false,maxGradePercent:12,maxCutDepth:6,maxFillDepth:2.5,cutShoulder:3,conformToTerrain:true,collider:true,navigation:true,vegetationExclusion:1},{position:[0,0,0],scale:[1,1,1]})},",
  'new path defaults'
);

// Renderer uses the same worldgen authority as server, grounding, foliage, and future water.
replaceOnce(
  'app/renderer.js',
  "} from './math.js';",
  "} from './math.js';\nimport { terrainHeightAt as sharedTerrainHeightAt, pathBlendAt as sharedPathBlendAt, samplePathSpline, normalizeTerrainProperties, normalizePathProperties, terrainBounds } from './worldgen.js';",
  'renderer worldgen import'
);
replaceRegex(
  'app/renderer.js',
  /export function terrainHeight\(terrain,x,z\)\{[\s\S]*?\n\}\nfunction terrainMesh/,
  `export function terrainHeight(terrain,x,z,paths=[]){return sharedTerrainHeightAt(terrain,x,z,paths);}\nexport function pathBlendAt(paths,x,z){return sharedPathBlendAt(paths,x,z);}\nfunction terrainMesh`,
  'sharedTerrainHeightAt(terrain,x,z,paths)',
  'replace repeated sine terrain'
);
replaceRegex(
  'app/renderer.js',
  /function terrainMesh\(object,paths\)\{[\s\S]*?\n\}\nfunction pathLineData/,
  `function terrainMesh(object,paths){\n  const props=normalizeTerrainProperties(object.properties||{},object.transform||{}),resX=clamp(Math.round(Number(props.resolutionX||props.resolution||128)),8,256),resZ=clamp(Math.round(Number(props.resolutionZ||props.resolution||128)),8,256),bounds=props.bounds,p=[],n=[],idx=[],uv=[],blends=[];\n  const ox=Number(object.transform.position?.[0]||0),oy=Number(object.transform.position?.[1]||0),oz=Number(object.transform.position?.[2]||0);\n  for(let z=0;z<=resZ;z++)for(let x=0;x<=resX;x++){\n    const wx=lerp(bounds.minX,bounds.maxX,x/resX),wz=lerp(bounds.minZ,bounds.maxZ,z/resZ),wy=terrainHeight(object,wx,wz,paths);\n    p.push(wx-ox,wy-oy,wz-oz);n.push(0,1,0);uv.push(x/resX,z/resZ);blends.push(pathBlendAt(paths,wx,wz));\n  }\n  for(let z=0;z<resZ;z++)for(let x=0;x<resX;x++){const a=z*(resX+1)+x,b=a+resX+1;idx.push(a,b,a+1,b,b+1,a+1);}\n  const normals=new Float32Array(p.length);\n  for(let t=0;t<idx.length;t+=3){const ia=idx[t]*3,ib=idx[t+1]*3,ic=idx[t+2]*3,A=[p[ia],p[ia+1],p[ia+2]],B=[p[ib],p[ib+1],p[ib+2]],C=[p[ic],p[ic+1],p[ic+2]],fn=normalize(cross(sub(B,A),sub(C,A)));for(const ii of [ia,ib,ic]){normals[ii]+=fn[0];normals[ii+1]+=fn[1];normals[ii+2]+=fn[2];}}\n  for(let k=0;k<normals.length;k+=3){const q=normalize([normals[k],normals[k+1],normals[k+2]]);normals[k]=q[0];normals[k+1]=q[1];normals[k+2]=q[2];}\n  return {positions:new Float32Array(p),normals,indices:new Uint32Array(idx),uvs:new Float32Array(uv),blends:new Float32Array(blends)};\n}\nfunction pathLineData`,
  'const props=normalizeTerrainProperties(object.properties||{}',
  'terrain mesh stable bounds'
);
replaceRegex(
  'app/renderer.js',
  /function pathLineData\(object,terrain\)\{[\s\S]*?\n\}\nfunction createBufferMesh/,
  `function pathLineData(object,terrain,paths){\n  const properties=normalizePathProperties(object.properties||{},object.transform||{}),dense=samplePathSpline(object,{spacing:Math.max(.45,Number(properties.width||3)*.28)}),width=Number(properties.width||3),center=[],edges=[];\n  for(let i=0;i<dense.length-1;i++){\n    const a=dense[i],b=dense[i+1],dir=normalize([b.x-a.x,0,b.z-a.z]),side=normalize([-dir[2],0,dir[0]]),ay=terrainHeight(terrain,a.x,a.z,paths)+Number(properties.surfaceOffset||.03)+.06,by=terrainHeight(terrain,b.x,b.z,paths)+Number(properties.surfaceOffset||.03)+.06;\n    center.push(a.x,ay,a.z,b.x,by,b.z);for(const sign of [-1,1])edges.push(a.x+side[0]*width*.5*sign,ay,a.z+side[2]*width*.5*sign,b.x+side[0]*width*.5*sign,by,b.z+side[2]*width*.5*sign);\n  }\n  return {center,edges};\n}\nfunction createBufferMesh`,
  'dense=samplePathSpline(object',
  'spline line generation'
);
replaceOnce(
  'app/renderer.js',
  "const data=pathLineData(pathObject,terrain),next=",
  "const data=pathLineData(pathObject,terrain,scene.objects.filter(object=>object.type==='path'&&object.visible!==false)),next=",
  'path line scene authority'
);
replaceOnce(
  'app/renderer.js',
  "cameraMatrices(camera){const forward=cameraForward(camera),target=add(camera.position,forward),view=mat4LookAt(camera.position,target),proj=mat4Perspective((camera.fov||62)*DEG,this.canvas.width/this.canvas.height,.08,1200);return {view,proj,viewProj:mat4Multiply(proj,view),inverse:mat4Invert(mat4Multiply(proj,view))};}",
  "cameraMatrices(camera){const forward=cameraForward(camera),target=add(camera.position,forward),view=mat4LookAt(camera.position,target),proj=mat4Perspective((camera.fov||62)*DEG,this.canvas.width/this.canvas.height,.08,12000),viewProj=mat4Multiply(proj,view);return {view,proj,viewProj,inverse:mat4Invert(viewProj)};}\n  worldToScreen(camera,point){const rect=this.canvas.getBoundingClientRect(),{viewProj}=this.cameraMatrices(camera),x=point[0],y=point[1],z=point[2],cx=viewProj[0]*x+viewProj[4]*y+viewProj[8]*z+viewProj[12],cy=viewProj[1]*x+viewProj[5]*y+viewProj[9]*z+viewProj[13],cz=viewProj[2]*x+viewProj[6]*y+viewProj[10]*z+viewProj[14],cw=viewProj[3]*x+viewProj[7]*y+viewProj[11]*z+viewProj[15];if(cw<=.001)return {visible:false,x:0,y:0};const nx=cx/cw,ny=cy/cw;return {visible:cz/cw>=-1&&cz/cw<=1&&nx>=-1.2&&nx<=1.2&&ny>=-1.2&&ny<=1.2,x:(nx*.5+.5)*rect.width,y:(1-(ny*.5+.5))*rect.height};}\n  terrainHeightForScene(scene,x,z){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false),paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);return terrainHeight(terrain,x,z,paths);}\n  terrainPointFromScreen(scene,camera,x,y){const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);if(!terrain)return null;const paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false),ray=this.rayFromScreen(camera,x,y),bounds=terrainBounds(terrain);let previous=null;for(let distance=0;distance<=12000;distance+=Math.max(1,Number(terrain.properties?.chunkSize||64)*.08)){const point=add(ray.origin,scale(ray.dir,distance));if(point[0]<bounds.minX-10||point[0]>bounds.maxX+10||point[2]<bounds.minZ-10||point[2]>bounds.maxZ+10)continue;const delta=point[1]-terrainHeight(terrain,point[0],point[2],paths);if(previous&&previous.delta>=0&&delta<=0){let low=previous.distance,high=distance;for(let step=0;step<18;step++){const mid=(low+high)*.5,p=add(ray.origin,scale(ray.dir,mid)),d=p[1]-terrainHeight(terrain,p[0],p[2],paths);if(d>0)low=mid;else high=mid;}const hit=add(ray.origin,scale(ray.dir,(low+high)*.5));return [hit[0],terrainHeight(terrain,hit[0],hit[2],paths),hit[2]];}previous={distance,delta};}return null;}",
  'renderer projection and terrain picking'
);
replaceOnce(
  'app/renderer.js',
  "const terrain=scene.objects.find(o=>o.type==='terrain'),size=Math.max(60,Number(terrain?.properties?.size||100)*.72),center=terrain?.transform?.position||[0,0,0],eye=",
  "const terrain=scene.objects.find(o=>o.type==='terrain'),bounds=terrain?terrainBounds(terrain):{minX:-50,maxX:50,minZ:-50,maxZ:50},size=Math.max(60,Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)*.72),center=[(bounds.minX+bounds.maxX)*.5,terrain?.transform?.position?.[1]||0,(bounds.minZ+bounds.maxZ)*.5],eye=",
  'shadow bounds follow expansion'
);
replaceOnce(
  'app/renderer.js',
  "for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible)){",
  "if(scene.settings.splinesVisible!==false)for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){",
  'global spline visibility'
);

// Existing editor controls use stable terrain/path authority.
replaceOnce(
  'app/app.js',
  "if (object.type==='terrain') return materialSelect(p.materialId)+propColor('Fallback color','color',p.color)+propNumber('World size','size',p.size||80,'1',10,500)+propNumber('Resolution','resolution',p.resolution||80,'1',4,192)+propNumber('Hill height','amplitude',p.amplitude||0,'0.25',0,40)+propNumber('Feature scale','frequency',p.frequency||.05,'0.005',.005,.5)+propNumber('Seed','seed',p.seed||0,'1')+propCheck('Receive shadows','receivesShadows',p.receivesShadows!==false)+propCheck('Collision','collider',p.collider!==false);",
  "if (object.type==='terrain') return materialSelect(p.materialId)+propColor('Fallback color','color',p.color)+propNumber('Mesh resolution','resolution',p.resolution||128,'1',8,256)+propCheck('Receive shadows','receivesShadows',p.receivesShadows!==false)+propCheck('Collision','collider',p.collider!==false)+`<div class=\"surface-blend-callout\"><strong>Stable world bounds</strong><p>Terrain scale is locked. Use the v0.11 Terrain Generator below to change landforms or expand north, south, east, west, or all directions without stretching paths.</p></div>`;",
  'terrain inspector authority'
);
replaceOnce(
  'app/app.js',
  "const floor=terrainHeight(terrain,object.transform.position[0],object.transform.position[2]),half=objectHalfExtents(object)[1];",
  "const floor=terrainHeight(terrain,object.transform.position[0],object.transform.position[2],scene.objects.filter(item=>item.type==='path'&&item.visible!==false)),half=objectHalfExtents(object)[1];",
  'physics samples carved terrain'
);
replaceOnce(
  'app/app.js',
  "window.__omniforgeDebug=Object.freeze({",
  "window.__omniforgeV011Bridge=Object.freeze({snapshot:()=>({state,scene,camera,selectedId}),renderer:()=>renderer,api,applyState,selectObject,showToast,markLocalMutation,renderInspector});\n    window.__omniforgeDebug=Object.freeze({",
  'v0.11 editor bridge'
);

// HTML and release identity.
replaceOnce('app/index.html', '<link rel="stylesheet" href="v010.css">', '<link rel="stylesheet" href="v010.css">\n  <link rel="stylesheet" href="v011.css">', 'v011 stylesheet');
replaceOnce('app/index.html', '<label class="toolbar-check"><input id="gridToggle" type="checkbox" checked><span>Grid</span></label>', '<label class="toolbar-check"><input id="gridToggle" type="checkbox" checked><span>Grid</span></label>\n          <label class="toolbar-check"><input id="splineToggle" type="checkbox" checked><span>Splines</span></label>', 'spline toolbar toggle');
replaceOnce('app/index.html', '<script type="module" src="v010.js"></script>', '<script type="module" src="v010.js"></script>\n  <script type="module" src="v011.js"></script>', 'v011 editor module');

// Server systems delegate to shared terrain and spline calculations.
replaceOnce(
  'server/v010-systems.mjs',
  "const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));",
  "import { terrainHeightAt as sharedTerrainHeightAt, terrainNormalAt as sharedTerrainNormalAt, distanceToPaths as sharedDistanceToPaths } from '../app/worldgen.js';\n\nconst clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));",
  'server shared worldgen import'
);
replaceRegex(
  'server/v010-systems.mjs',
  /export function terrainHeightAt\(terrain, x, z\) \{[\s\S]*?\n\}\n\nexport function terrainNormalAt\(terrain, x, z, step = 0\.35\) \{[\s\S]*?\n\}/,
  `export function terrainHeightAt(terrain, x, z, paths = []) { return sharedTerrainHeightAt(terrain, x, z, paths); }\n\nexport function terrainNormalAt(terrain, x, z, paths = [], step = 0.35) { return sharedTerrainNormalAt(terrain, x, z, paths, step); }`,
  'sharedTerrainHeightAt(terrain, x, z, paths)',
  'server terrain authority'
);
replaceRegex(
  'server/v010-systems.mjs',
  /function segmentDistance\(x, z, a, b\) \{[\s\S]*?\n\}\n\nexport function distanceToPaths\(paths, x, z\) \{[\s\S]*?\n\}/,
  `export function distanceToPaths(paths, x, z) { return sharedDistanceToPaths(paths, x, z); }`,
  'sharedDistanceToPaths(paths, x, z)',
  'server spline distance authority'
);
replaceOnce('server/v010-systems.mjs', 'const normal = terrainNormalAt(terrain, x, z);', 'const normal = terrainNormalAt(terrain, x, z, paths);', 'foliage slope path awareness');
replaceOnce('server/v010-systems.mjs', 'const y = terrainHeightAt(terrain, x, z) - Number(species.rootBurial || 0.08);', 'const y = terrainHeightAt(terrain, x, z, paths) - Number(species.rootBurial || 0.08);', 'foliage height path awareness');

// Runtime and package use v0.11 bootstrap.
let packageJson = JSON.parse(read('package.json'));
packageJson.version = '0.11.0';
packageJson.description = 'General-purpose AI-native 3D game engine with connected assets, foliage, atmosphere, stable worldgen, terrain expansion, and editable spline paths.';
packageJson.scripts.start = 'node server/v011-bootstrap.mjs';
write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

let desktop = read('desktop/main.cjs').replaceAll("const PRODUCT_VERSION = '0.10.0';", "const PRODUCT_VERSION = '0.11.0';").replaceAll("path.join(APP_ROOT,'server','v010-bootstrap.mjs')", "path.join(APP_ROOT,'server','v011-bootstrap.mjs')");
write('desktop/main.cjs', desktop);
let build = read('BUILD_DESKTOP_WINDOWS.ps1').replaceAll("version = '0.10.0'", "version = '0.11.0'").replaceAll("'0.10.0.0'", "'0.11.0.0'").replaceAll('OmniForge 0.10.0', 'OmniForge 0.11.0');
write('BUILD_DESKTOP_WINDOWS.ps1', build);

for (const file of ['server/server.mjs','bridge/mcp-server.mjs','README.md','omniforge.project.json']) {
  if (!fs.existsSync(filePath(file))) continue;
  let source = read(file).replaceAll('0.10.0', '0.11.0').replaceAll('v0.10', 'v0.11');
  write(file, source);
}

console.log('Applied connected OmniForge v0.11 terrain, spline, world expansion, editor, runtime, and shared-authority patches.');
