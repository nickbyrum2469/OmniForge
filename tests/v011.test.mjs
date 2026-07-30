import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TERRAIN_PRESETS,
  normalizeTerrainProperties,
  normalizePathProperties,
  migrateSceneWorldFoundation,
  terrainBaseHeightAt,
  terrainHeightAt,
  samplePathSpline,
  compilePathProfile,
  pathBlendAt,
  expandTerrain,
  insertPathPoint,
  splitPath
} from '../app/worldgen.js';
import { terrainDiagnostics, pathDiagnostics } from '../server/v011-systems.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function terrain(overrides={}){
  return {id:'terrain-test',type:'terrain',name:'Terrain',visible:true,locked:false,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:normalizeTerrainProperties({preset:'mountainValley',sizeX:240,sizeZ:200,resolution:96,height:42,macroScale:190,detailScale:32,octaves:6,warpStrength:38,ridgeStrength:.75,valleyStrength:.65,valleyRadius:62,seed:17,...overrides},{position:[0,0,0],scale:[1,1,1]})};
}
function pathObject(overrides={}){
  return {id:'path-test',type:'path',name:'Path',visible:true,locked:false,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:normalizePathProperties({width:4,blendDistance:3,points:[[-70,-30],[-34,-12],[0,3],[31,18],[72,35]],worldSpacePoints:true,spline:true,splineTension:.45,samplesPerSegment:14,carveTerrain:true,maxGradePercent:9,maxCutDepth:8,maxFillDepth:3,cutShoulder:4,...overrides},{position:[0,0,0],scale:[1,1,1]})};
}
function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}
async function requestJson(port,pathname,options={}){const response=await fetch(`http://127.0.0.1:${port}${pathname}`,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const body=await response.json().catch(()=>({}));return {status:response.status,body};}
async function waitHealth(port,timeout=12000){const deadline=Date.now()+timeout;while(Date.now()<deadline){try{const result=await requestJson(port,'/api/health');if(result.status===200)return result.body;}catch{}await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('Timed out waiting for v0.11 health.');}

test('v0.11 terrain generation is deterministic, seeded, and offers requested landform presets',()=>{
  for(const id of ['plains','rollingHills','highlands','plateau','mountainValley','canyon','island','archipelago','coastalBasin'])assert.ok(TERRAIN_PRESETS[id],id);
  const a=terrain({seed:42}),b=terrain({seed:42}),c=terrain({seed:43});
  const samples=[[-75,-63],[-10,4],[0,0],[43,79],[101,-22]];
  assert.deepEqual(samples.map(([x,z])=>terrainBaseHeightAt(a,x,z)),samples.map(([x,z])=>terrainBaseHeightAt(b,x,z)));
  assert.notDeepEqual(samples.map(([x,z])=>terrainBaseHeightAt(a,x,z)),samples.map(([x,z])=>terrainBaseHeightAt(c,x,z)));
  const diagnostics=terrainDiagnostics(a,[]);
  assert.ok(diagnostics.relief>1);
  assert.equal(diagnostics.repetitiveBandRisk,'low');
});

test('v0.11 migration converts transform scaling into explicit bounds and world-space path nodes',()=>{
  const scene={settings:{},objects:[
    {id:'t',type:'terrain',transform:{position:[10,2,-5],rotation:[0,0,0],scale:[2,3,4]},properties:{size:100,resolution:80,amplitude:5,frequency:.05,seed:9}},
    {id:'p',type:'path',transform:{position:[7,0,-11],rotation:[0,0,0],scale:[3,1,2]},properties:{points:[[0,0],[10,4],[20,0]],width:3}}
  ]};
  migrateSceneWorldFoundation(scene);
  const t=scene.objects[0],p=scene.objects[1];
  assert.deepEqual(t.transform.scale,[1,1,1]);
  assert.equal(t.properties.sizeX,200);
  assert.equal(t.properties.sizeZ,400);
  assert.equal(t.properties.height,15);
  assert.deepEqual(p.transform.position,[0,0,0]);
  assert.deepEqual(p.transform.scale,[1,1,1]);
  assert.deepEqual(p.properties.points,[[7,-11],[17,-7],[27,-11]]);
  assert.equal(scene.settings.splinesVisible,true);
});

test('expanding terrain bounds preserves old terrain samples and path coordinates exactly',()=>{
  const t=terrain(),p=pathObject();
  const points=[[-80,-50],[-20,14],[0,0],[63,42]];
  const heights=points.map(([x,z])=>terrainBaseHeightAt(t,x,z));
  const pathBefore=structuredClone(p.properties.points);
  const before={...t.properties.bounds};
  expandTerrain(t,'east',180);
  expandTerrain(t,'north',90);
  assert.deepEqual(points.map(([x,z])=>terrainBaseHeightAt(t,x,z)),heights);
  assert.deepEqual(p.properties.points,pathBefore);
  assert.equal(t.properties.bounds.minX,before.minX);
  assert.equal(t.properties.bounds.maxX,before.maxX+180);
  assert.equal(t.properties.bounds.minZ,before.minZ-90);
});

test('spline sampling, insertion, and splitting preserve a smooth connected world-space path',()=>{
  const p=pathObject();
  const dense=samplePathSpline(p);
  assert.ok(dense.length>p.properties.points.length*5);
  assert.deepEqual([dense[0].x,dense[0].z],p.properties.points[0]);
  assert.deepEqual([dense.at(-1).x,dense.at(-1).z],p.properties.points.at(-1));
  const inserted=insertPathPoint(p,8,7);
  assert.equal(inserted.points.length,p.properties.points.length+1);
  const copy=pathObject({points:inserted.points});
  const parts=splitPath(copy,inserted.index);
  assert.deepEqual(parts[0].at(-1),parts[1][0]);
  assert.ok(parts[0].length>=2&&parts[1].length>=2);
});

test('feasible path grade compilation respects maximum grade and bounded terrain cut/fill',()=>{
  const t=terrain({preset:'plains',height:3,ridgeStrength:0,warpStrength:0});
  const p=pathObject({maxGradePercent:12,maxCutDepth:5,maxFillDepth:2});
  const profile=compilePathProfile(p,t);
  let maximum=0;
  for(let index=1;index<profile.length;index++){const a=profile[index-1],b=profile[index],distance=Math.hypot(b.x-a.x,b.z-a.z)||1;maximum=Math.max(maximum,Math.abs(b.y-a.y)/distance*100);}
  assert.equal(profile.diagnostics.feasible,true);
  assert.ok(maximum<=12.01,`compiled maximum grade was ${maximum}`);
  for(const sample of profile.filter((_,index)=>index%8===0)){
    const base=terrainBaseHeightAt(t,sample.x,sample.z);
    assert.ok(sample.y>=base-5.01);
    assert.ok(sample.y<=base+2.01);
  }
  const diagnostics=pathDiagnostics(p,t);
  assert.equal(diagnostics.validation,'passed');
  assert.ok(diagnostics.compiledMaxGradePercent<=12.15);
});

test('corridor authority disables the duplicate terrain material path while legacy compatibility stays explicit',()=>{
  const p=pathObject({carveTerrain:false,width:4,blendDistance:3});
  const sample=samplePathSpline(p)[Math.floor(samplePathSpline(p).length*.42)];
  assert.equal(pathBlendAt([p],sample.x,sample.z),0);
  const legacy=pathObject({...p.properties,surfaceAuthority:'legacy-terrain'});
  assert.ok(pathBlendAt([legacy],sample.x,sample.z)>.9);
  assert.equal(pathBlendAt([p],sample.x+100,sample.z+100),0);
});

test('v0.11 editor, renderer, runtime, desktop, and MCP expose the connected world foundation',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');
  const editor=fs.readFileSync(path.join(ROOT,'app','v011.js'),'utf8');
  const renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  const mcp=fs.readFileSync(path.join(ROOT,'bridge','mcp-server.mjs'),'utf8');
  const packageJson=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  const desktop=fs.readFileSync(path.join(ROOT,'desktop','main.cjs'),'utf8');
  assert.match(html,/id="splineToggle"/);
  assert.match(html,/v011\.css/);
  assert.match(html,/v011\.js/);
  assert.match(editor,/Shift-drag raises or lowers it/);
  assert.match(editor,/Right-click inserts a node into the nearest compiled segment/);
  assert.match(editor,/PathGenerationWorkerPool/);
  assert.match(editor,/workerCount:\s*logicalProcessors\s*-\s*1/);
  assert.doesNotMatch(editor,/Math\.min\(4,\s*logicalProcessors\s*-\s*1\)/);
  assert.match(editor,/\/api\/v012\/path\//);
  assert.match(editor,/terrainPointFromScreen/);
  assert.match(editor,/data-v011-expand/);
  assert.match(renderer,/buildPathGuideSegmentsFromCorridor/);
  assert.match(renderer,/scene\.settings\.splinesVisible!==false/);
  assert.match(renderer,/Spline guides are editor overlays, not world geometry/);
  assert.match(renderer,/if\(scene\.settings\.splinesVisible!==false\)\{\s*\/\/[\s\S]*?gl\.disable\(gl\.DEPTH_TEST\)/);
  assert.match(renderer,/terrainPointFromScreen/);
  assert.match(renderer,/setPathPreview/);
  assert.match(renderer,/pathRuntimeFrameCache/);
  assert.match(app,/__omniforgeV011Bridge/);
  assert.match(mcp,/v011Tools, callV011Tool/);
  assert.equal(packageJson.version,'0.11.0');
  assert.equal(packageJson.scripts.start,'node server/v011-bootstrap.mjs');
  assert.match(desktop,/PRODUCT_VERSION = '0\.11\.0'/);
  assert.match(desktop,/v011-bootstrap\.mjs/);
  assert.match(desktop,/process\.env\.OMNIFORGE_DATA_ROOT/);
  assert.match(desktop,/configuredRuntimePort\(\)/);
  assert.match(desktop,/requestedPort \|\| await findFreePort\(\)/);
});

test('v0.11 bootstrap persists terrain expansion and spline node editing through real APIs',async()=>{
  const port=await freePort(),runtime=fs.mkdtempSync(path.join(os.tmpdir(),'omniforge-v011-api-'));
  const child=spawn(process.execPath,['server/v011-bootstrap.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port),OMNIFORGE_SESSION_TOKEN:'v011-test'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk.toString());
  try{
    const health=await waitHealth(port);assert.equal(health.version,'0.11.0');
    const initial=await requestJson(port,'/api/v011/worldgen');assert.equal(initial.status,200);assert.ok(initial.body.terrain);assert.ok(initial.body.paths.length>=1);
    const terrainId=initial.body.terrain.id,pathId=initial.body.paths[0].id;
    const sample=[0,0,terrainBaseHeightAt(initial.body.terrain,0,0)],before=initial.body.terrain.properties.bounds;
    const expanded=await requestJson(port,`/api/v011/terrain/${terrainId}/expand`,{method:'POST',body:JSON.stringify({direction:'east',amount:125,preserveSamples:[sample]})});
    assert.equal(expanded.status,200);assert.equal(expanded.body.bounds.maxX,before.maxX+125);
    const inserted=await requestJson(port,`/api/v011/path/${pathId}/node`,{method:'POST',body:JSON.stringify({x:9,z:11})});
    assert.equal(inserted.status,201);const index=inserted.body.index;
    const moved=await requestJson(port,`/api/v011/path/${pathId}/node/${index}`,{method:'PATCH',body:JSON.stringify({x:13,z:17})});
    assert.equal(moved.status,200);assert.deepEqual(moved.body.path.properties.points[index],[13,17]);
    const grade=await requestJson(port,`/api/v011/path/${pathId}`,{method:'PATCH',body:JSON.stringify({properties:{carveTerrain:true,maxGradePercent:6,maxCutDepth:4,maxFillDepth:1.5}})});
    assert.equal(grade.status,200);assert.equal(grade.body.path.properties.carveTerrain,true);
    assert.equal(grade.body.diagnostics.validation,grade.body.diagnostics.gameplayReady?'passed':'failed');
    if(grade.body.diagnostics.gameplayReady)assert.ok(grade.body.diagnostics.compiledMaxGradePercent<=6.15);
    else assert.equal(grade.body.diagnostics.constraintStatus,'blocked-infeasible-profile');
    const v2Initial=await requestJson(port,`/api/v012/path/${pathId}/network`);
    assert.equal(v2Initial.status,200);
    assert.equal(v2Initial.body.network.schemaVersion,2);
    const networkRevision=v2Initial.body.network.revision;
    const node=v2Initial.body.network.nodes[1];
    const v2Moved=await requestJson(port,`/api/v012/path/${pathId}/transaction`,{
      method:'POST',
      body:JSON.stringify({
        expectedRevision:networkRevision,
        label:'Raise trail node',
        operations:[{
          type:'move-node',
          nodeId:node.id,
          position:[node.position[0],node.position[1]+4,node.position[2]],
          heightMode:'absolute'
        }]
      })
    });
    assert.equal(v2Moved.status,200);
    assert.equal(v2Moved.body.network.revision,networkRevision+1);
    assert.equal(v2Moved.body.network.nodes.find(item=>item.id===node.id).position[1],node.position[1]+4);
    assert.equal(v2Moved.body.network.nodes.find(item=>item.id===node.id).heightMode,'absolute');
    const conflict=await requestJson(port,`/api/v012/path/${pathId}/transaction`,{
      method:'POST',
      body:JSON.stringify({
        expectedRevision:networkRevision,
        operations:[{type:'move-node',nodeId:node.id,position:node.position}]
      })
    });
    assert.equal(conflict.status,400);
    assert.match(conflict.body.error,/revision conflict/);
    const undone=await requestJson(port,`/api/v012/path/${pathId}/undo`,{
      method:'POST',
      body:JSON.stringify({expectedRevision:networkRevision+1})
    });
    assert.equal(undone.status,200);
    assert.deepEqual(undone.body.network.nodes.find(item=>item.id===node.id).position,node.position);
    assert.equal(undone.body.redoDepth,1);
    const redone=await requestJson(port,`/api/v012/path/${pathId}/redo`,{
      method:'POST',
      body:JSON.stringify({expectedRevision:networkRevision+2})
    });
    assert.equal(redone.status,200);
    assert.equal(redone.body.network.revision,networkRevision+3);
    assert.equal(redone.body.network.nodes.find(item=>item.id===node.id).position[1],node.position[1]+4);
    assert.equal(redone.body.redoDepth,0);
    const settings=await requestJson(port,'/api/v011/scene-settings',{method:'PATCH',body:JSON.stringify({splinesVisible:false})});
    assert.equal(settings.status,200);assert.equal(settings.body.settings.splinesVisible,false);
    const persisted=JSON.parse(fs.readFileSync(path.join(runtime,'data','engine-state.json'),'utf8'));
    assert.equal(persisted.schemaVersion,9);assert.equal(persisted.engine.version,'0.11.0');assert.equal(persisted.scenes[0].settings.splinesVisible,false);
  }finally{child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2500))]);fs.rmSync(runtime,{recursive:true,force:true});}
  assert.equal(stderr,'',stderr);
});
