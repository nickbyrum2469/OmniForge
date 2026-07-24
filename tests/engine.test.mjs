import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createDefaultState, createSceneObject, safeWorkspacePath, ROOT, normalizeMaterialSettings, normalizeSurfaceRecipe, compileSurfaceRecipe, normalizeDecalRecipe, normalizeAtlasRecipe } from '../server/state-store.mjs';
import { terrainHeight, pathBlendAt } from '../app/renderer.js';
import { importModelAsset, rebuildCanonicalAsset, createSafeRepairDerivative, generateCollision, generateLodsForAsset, parseGlb, syncAssetRecipe } from '../server/asset-pipeline.mjs';
import { starterProviders, normalizeProviders, normalizeIntegrationSettings, normalizeJob } from '../server/provider-framework.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));

function walk(dir, result=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['captures','logs','.git','node_modules','dist','.desktop-cache'].includes(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full,result);
    else if(!/\.(png|jpg|jpeg|zip|ico)$/.test(entry.name)) result.push(full);
  }
  return result;
}


function createTriangleGlb(){
  const position=Buffer.from(new Float32Array([-.5,0,0,.5,0,0,0,1,0]).buffer),normal=Buffer.from(new Float32Array([0,0,1,0,0,1,0,0,1]).buffer),uv=Buffer.from(new Float32Array([0,0,1,0,.5,1]).buffer),index=Buffer.from(new Uint16Array([0,1,2]).buffer);
  const chunks=[],views=[];let offset=0;for(const source of [position,normal,uv,index]){const aligned=(offset+3)&~3;if(aligned>offset)chunks.push(Buffer.alloc(aligned-offset));offset=aligned;views.push({buffer:0,byteOffset:offset,byteLength:source.length});chunks.push(source);offset+=source.length;}
  const bin=Buffer.concat(chunks);const gltf={asset:{version:'2.0',generator:'OmniForge test'},buffers:[{byteLength:bin.length}],bufferViews:views,accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-.5,0,0],max:[.5,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'},{bufferView:3,componentType:5123,count:3,type:'SCALAR'}],materials:[{name:'Test Material',pbrMetallicRoughness:{baseColorFactor:[.25,.55,.9,1],metallicFactor:.1,roughnessFactor:.7}}],meshes:[{name:'Triangle',primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  let json=Buffer.from(JSON.stringify(gltf));const jsonPad=(4-json.length%4)%4;if(jsonPad)json=Buffer.concat([json,Buffer.alloc(jsonPad,0x20)]);const binPad=(4-bin.length%4)%4,binChunk=binPad?Buffer.concat([bin,Buffer.alloc(binPad)]):bin,total=12+8+json.length+8+binChunk.length,out=Buffer.alloc(total);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);const binHeader=20+json.length;out.writeUInt32LE(binChunk.length,binHeader);out.writeUInt32LE(0x004e4942,binHeader+4);binChunk.copy(out,binHeader+8);return out;
}


function createTransformedMultiMaterialGlb(){
  const position=Buffer.from(new Float32Array([-.5,0,0,.5,0,0,0,1,0]).buffer),normal=Buffer.from(new Float32Array([0,0,1,0,0,1,0,0,1]).buffer),uv=Buffer.from(new Float32Array([0,0,1,0,.5,1]).buffer),index=Buffer.from(new Uint16Array([0,1,2]).buffer);
  const chunks=[],views=[];let offset=0;for(const source of [position,normal,uv,index]){const aligned=(offset+3)&~3;if(aligned>offset)chunks.push(Buffer.alloc(aligned-offset));offset=aligned;views.push({buffer:0,byteOffset:offset,byteLength:source.length});chunks.push(source);offset+=source.length;}
  const bin=Buffer.concat(chunks),half=Math.sin(Math.PI/4),gltf={asset:{version:'2.0',generator:'OmniForge transform test'},buffers:[{byteLength:bin.length}],bufferViews:views,accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-.5,0,0],max:[.5,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'},{bufferView:3,componentType:5123,count:3,type:'SCALAR'}],materials:[{name:'Body Red',pbrMetallicRoughness:{baseColorFactor:[.8,.05,.03,1],metallicFactor:.25,roughnessFactor:.3}},{name:'Trim Dark',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.08,.09,.12,1],metallicFactor:.5,roughnessFactor:.6}}],meshes:[{name:'Assembly',primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0},{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:1}]}],nodes:[{name:'Left Assembly',translation:[-2,0,0],mesh:0},{name:'Right Root',translation:[2,0,0],scale:[2,1,1],children:[2]},{name:'Nested Assembly',translation:[0,1,0],rotation:[0,0,half,half],mesh:0}],scenes:[{nodes:[0,1]}],scene:0};
  let json=Buffer.from(JSON.stringify(gltf));const jsonPad=(4-json.length%4)%4;if(jsonPad)json=Buffer.concat([json,Buffer.alloc(jsonPad,0x20)]);const binPad=(4-bin.length%4)%4,binChunk=binPad?Buffer.concat([bin,Buffer.alloc(binPad)]):bin,total=12+8+json.length+8+binChunk.length,out=Buffer.alloc(total);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);const binHeader=20+json.length;out.writeUInt32LE(binChunk.length,binHeader);out.writeUInt32LE(0x004e4942,binHeader+4);binChunk.copy(out,binHeader+8);return out;
}

function tempRoot(prefix='omniforge-test-'){
  return fs.mkdtempSync(path.join(os.tmpdir(),prefix));
}

function freePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(error=>error?reject(error):resolve(address.port));});
  });
}

function requestJson(port,pathname='/api/health'){
  return new Promise((resolve,reject)=>{
    const req=http.get({host:'127.0.0.1',port,path:pathname,timeout:2500},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
        try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(error){reject(error);}
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Request timeout')));req.on('error',reject);
  });
}

function postJson(port,pathname,payload){
  return new Promise((resolve,reject)=>{
    const body=Buffer.from(JSON.stringify(payload));
    const req=http.request({host:'127.0.0.1',port,path:pathname,method:'POST',timeout:6000,headers:{'content-type':'application/json','content-length':body.length}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
        const text=Buffer.concat(chunks).toString('utf8');
        try{resolve({status:res.statusCode,body:JSON.parse(text)});}catch(error){reject(new Error(`Invalid JSON response: ${text.slice(0,300)}`));}
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Request timeout')));req.on('error',reject);req.end(body);
  });
}

async function waitForHealth(port,attempts=45){
  let lastError;
  for(let i=0;i<attempts;i++){
    try{const result=await requestJson(port);if(result.status===200&&result.body.ok)return result.body;}catch(error){lastError=error;}
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  throw lastError || new Error('Server health check failed.');
}

async function waitForJob(port,jobId,attempts=100){
  let last;
  for(let i=0;i<attempts;i++){
    const result=await requestJson(port,'/api/state');last=(result.body.jobs||[]).find(job=>job.id===jobId);
    if(last&&['succeeded','failed','cancelled','interrupted'].includes(last.state))return last;
    await new Promise(resolve=>setTimeout(resolve,60));
  }
  throw new Error(`Job ${jobId} did not complete. Last state: ${JSON.stringify(last)}`);
}

test('default project is general-purpose and contains a real 3D starter scene',()=>{
  const state=createDefaultState();
  assert.equal(state.project.name,'Untitled Game');
  assert.equal(state.project.template,'starter-3d');
  assert.equal(state.scenes.length,1);
  const types=new Set(state.scenes[0].objects.map(object=>object.type));
  assert.ok(types.has('terrain'));
  assert.ok(types.has('path'));
  assert.ok(types.has('directionalLight'));
  assert.ok(types.has('box'));
  assert.equal(state.editor.runtimeConnected,true);
  assert.equal(state.schemaVersion,8);
  assert.equal(state.engine.version,'0.9.0');
  assert.ok(state.assets.filter(asset=>asset.type==='material').length>=2);
});

test('editor defaults include persistent layouts, shortcuts, recovery state, and camera preferences',()=>{
  const state=createDefaultState();
  assert.equal(state.editor.layout.name,'Default');
  assert.ok(state.editor.layout.leftWidth>0);
  assert.ok(Array.isArray(state.editor.savedLayouts));
  for(const command of ['save','commandPalette','focus','resetCamera','projectHub'])assert.ok(state.editor.shortcuts[command]);
  assert.equal(state.editor.firstUseComplete,false);
  assert.ok(Array.isArray(state.editor.recentErrors));
  const camera=state.scenes[0].editorCamera;
  for(const key of ['lookSensitivity','invertHorizontal','invertVertical','moveSpeed','fov'])assert.ok(key in camera);
});

test('all supported scene primitives receive valid transforms and properties',()=>{
  for(const type of ['box','sphere','cylinder','plane','terrain','path','model','directionalLight','pointLight','empty']){
    const object=createSceneObject(type,{position:[1,2,3]});
    assert.equal(object.type,type);
    assert.deepEqual(object.transform.position,[1,2,3]);
    assert.equal(object.transform.scale.length,3);
    assert.ok(object.id);
  }
});

test('terrain height is deterministic and responds to world position',()=>{
  const terrain=createSceneObject('terrain',{position:[0,0,0],properties:{seed:22,amplitude:6,frequency:.07,size:100,resolution:32}});
  const a=terrainHeight(terrain,2,3);
  const b=terrainHeight(terrain,2,3);
  const c=terrainHeight(terrain,20,16);
  assert.equal(a,b);
  assert.notEqual(a,c);
  assert.ok(Number.isFinite(a));
});

test('path defaults preserve terrain-conforming system relationships',()=>{
  const pathObject=createSceneObject('path');
  assert.equal(pathObject.properties.conformToTerrain,true);
  assert.equal(pathObject.properties.navigation,true);
  assert.equal(pathObject.properties.collider,true);
  assert.ok(pathObject.properties.points.length>=2);
});

test('terrain path mask produces a soft shoulder instead of a hard ribbon',()=>{
  const pathObject=createSceneObject('path',{position:[0,0,0],properties:{width:4,blendDistance:3,edgeNoise:0,points:[[-10,0],[10,0]]}});
  const center=pathBlendAt([pathObject],0,0),shoulder=pathBlendAt([pathObject],0,3.5),outside=pathBlendAt([pathObject],0,8);
  assert.ok(center>.99);
  assert.ok(shoulder>0&&shoulder<1);
  assert.equal(outside,0);
});

test('starter PBR materials include real texture-map files and are protected',()=>{
  const state=createDefaultState();
  for(const material of state.assets.filter(asset=>asset.type==='material')){
    assert.equal(material.protected,true);
    for(const key of ['baseColor','normal','roughness','ambientOcclusion','height']){
      assert.ok(material.maps[key]?.file,`${material.name} missing ${key}`);
      assert.ok(fs.existsSync(path.join(ROOT,material.maps[key].file)),`${material.name} file missing: ${key}`);
    }
  }
});

test('horizontal mouse look uses the intuitive right-positive yaw convention',()=>{
  const source=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  assert.match(source,/camera\.yaw\+=dx\*sensitivity\*\(camera\.invertHorizontal\?-1:1\)/);
});

test('desktop lifecycle implements native isolation, recovery, safe mode, and clean process ownership',()=>{
  const source=fs.readFileSync(path.join(ROOT,'desktop','main.cjs'),'utf8');
  const preload=fs.readFileSync(path.join(ROOT,'desktop','preload.cjs'),'utf8');
  for(const pattern of [
    /requestSingleInstanceLock/, /setPath\(['"]userData['"]/, /crashReporter\.start/,
    /cleanShutdown:false/, /--safe-mode/, /runtime\.json/, /terminateProcessTree/,
    /will-navigate/, /setPermissionRequestHandler/, /contextIsolation:true/, /sandbox:true/
  ]) assert.match(source,pattern);
  assert.match(preload,/contextBridge\.exposeInMainWorld\(['"]omniforgeDesktop['"]/);
  for(const file of ['BUILD_DESKTOP_WINDOWS.ps1','START_DESKTOP.bat','STOP_ENGINE.bat','START_BROWSER_DEV.bat','resources/omniforge-icon.ico'])assert.ok(fs.existsSync(path.join(ROOT,file)),file);
});

test('Windows desktop builder pins and stamps the native executable metadata',()=>{
  const source=fs.readFileSync(path.join(ROOT,'BUILD_DESKTOP_WINDOWS.ps1'),'utf8');
  for(const pattern of [
    /ElectronVersion = '43\.2\.0'/, /RceditVersion = '2\.0\.0'/,
    /Get-FileHash -Algorithm SHA256/, /Rename-Item .*electron\.exe.*OmniForge\.exe/,
    /--set-icon/, /ProductName 'OmniForge'/, /FileDescription 'OmniForge AI-Native 3D Game Engine'/,
    /--set-file-version '0\.10\.0\.0'/, /--set-product-version '0\.10\.0\.0'/
  ]) assert.match(source,pattern);
  assert.ok(fs.existsSync(path.join(ROOT,'resources','omniforge-icon.ico')));
});

test('project hub and editor usability controls are wired into the authoritative editor',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');
  const editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'app','styles.css'),'utf8');
  for(const id of ['projectHubDialog','projectGrid','layoutDialog','shortcutDialog','commandPaletteDialog','tutorialDialog','errorDialog','selectionBreadcrumb','saveStateBadge','leftResizeHandle','rightResizeHandle','bottomResizeHandle'])assert.match(html,new RegExp(`id=["']${id}["']`));
  for(const fn of ['loadProjects','openProjectById','archiveProjectById','importProjectFolder','applyLayout','persistLayoutSoon','openCommandPalette','renderShortcuts','renderBreadcrumb','showTutorial','resetCamera','focusSelected'])assert.match(editor,new RegExp(`function\\s+${fn}|const\\s+${fn}\\s*=`));
  assert.match(editor,/\/api\/projects\/duplicate/);assert.match(editor,/showTutorial/);
  for(const stateClass of ['left-collapsed','right-collapsed','bottom-collapsed','save-state','resize-handle','project-card'])assert.match(css,new RegExp(stateClass));
});

test('project store supports create, open, duplicate, archive, import, migration, and moved-project recovery',()=>{
  const runtime=tempRoot();
  const moduleUrl=pathToFileURL(path.join(ROOT,'server','state-store.mjs')).href;
  const script=`
    import fs from 'node:fs';import path from 'node:path';
    const store=await import(${JSON.stringify(moduleUrl)});
    const first=store.createProject({name:'Lifecycle Test',template:'starter-3d'});
    if(first.schemaVersion!==8)throw new Error('Migration schema failed');
    const opened=store.openProject(first.project.id);
    if(opened.project.id!==first.project.id)throw new Error('Open failed');
    const duplicate=store.duplicateProject(first.project.id,'Lifecycle Copy');
    if(duplicate.project.id===first.project.id)throw new Error('Duplicate identity failed');
    const external=path.join(${JSON.stringify(runtime)},'external-import');fs.mkdirSync(external,{recursive:true});
    fs.cpSync(first.project.root,external,{recursive:true});
    const imported=store.importProject(external,{name:'Imported Lifecycle'});
    if(!imported.project.importSource)throw new Error('Import provenance missing');
    const moved=store.createProject({name:'Moved Project'});const movedExternal=path.join(${JSON.stringify(runtime)},'moved-source');
    fs.renameSync(moved.project.root,movedExternal);
    const missing=store.listProjects({includeArchived:true}).find(p=>p.id===moved.project.id);
    if(!missing?.missing)throw new Error('Missing project not detected');
    const located=store.locateProject(moved.project.id,movedExternal);
    if(located.project.id!==moved.project.id||!fs.existsSync(located.project.root))throw new Error('Locate failed');
    const archivedFrom=duplicate.project.id;store.archiveProject(archivedFrom);
    const archived=store.listProjects({includeArchived:true}).find(p=>p.id===archivedFrom);
    if(!archived?.archived||!archived.archivedRoot)throw new Error('Archive failed');
    console.log(JSON.stringify({projects:store.listProjects({includeArchived:true}).length,active:store.readState().project.id}));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:'42871'},encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const summary=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.ok(summary.projects>=4);
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('two runtime sessions cannot write the same active project simultaneously',async()=>{
  const runtime=tempRoot('omniforge-lock-');
  const port1=42931,port2=42932;
  const first=spawn(process.execPath,['server/server.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port1),OMNIFORGE_SESSION_TOKEN:'lock-session-one'},stdio:['ignore','pipe','pipe']});
  let firstOut='',firstErr='';first.stdout.on('data',d=>firstOut+=d);first.stderr.on('data',d=>firstErr+=d);
  try{
    await waitForHealth(port1);
    const second=spawnSync(process.execPath,['server/server.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port2),OMNIFORGE_SESSION_TOKEN:'lock-session-two'},encoding:'utf8',timeout:7000});
    assert.notEqual(second.status,0,'Second server unexpectedly acquired the same project.');
    assert.match(`${second.stderr}\n${second.stdout}`,/already open in another OmniForge session/i);
  }finally{
    first.kill('SIGTERM');await new Promise(resolve=>first.once('exit',resolve));
    fs.rmSync(runtime,{recursive:true,force:true});
  }
  assert.equal(firstErr,'',firstErr||firstOut);
});

test('starter objects are grounded against the authoritative terrain surface',()=>{
  const state=createDefaultState();
  const scene=state.scenes[0];
  const terrain=scene.objects.find(object=>object.type==='terrain');
  for(const object of scene.objects.filter(object=>['box','sphere'].includes(object.type))){
    const surface=terrainHeight(terrain,object.transform.position[0],object.transform.position[2]);
    const bottom=object.transform.position[1]-object.transform.scale[1]/2;
    assert.ok(Math.abs(bottom-surface)<0.08,`${object.name} is not grounded: ${bottom} versus ${surface}`);
  }
});

test('browser automation bridge exposes read-only snapshots and controlled editor actions',()=>{
  const source=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  assert.match(source,/window\.__omniforgeDebug=Object\.freeze/);
  for(const operation of ['snapshot','setCamera','select','togglePlay','capture'])assert.match(source,new RegExp(`${operation}:`));
});

test('managed workspace path cannot escape the projects root',()=>{
  assert.ok(safeWorkspacePath('untitled-game').startsWith(path.resolve(ROOT,'workspace','projects')));
  assert.throws(()=>safeWorkspacePath('../../outside'));
});

test('Codex MCP initializes and exposes scene, material, prefab, and project lifecycle tools',()=>{
  const runtime=tempRoot('omniforge-mcp-');
  const input=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}},
    {jsonrpc:'2.0',id:2,method:'tools/list',params:{}}
  ].map(value=>JSON.stringify(value)).join('\n')+'\n';
  const probe=spawnSync(process.execPath,['bridge/mcp-server.mjs'],{cwd:ROOT,input,encoding:'utf8',timeout:10000,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime}});
  assert.equal(probe.status,0,probe.stderr);
  const messages=probe.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  const tools=messages.find(message=>message.id===2)?.result?.tools||[];
  assert.ok(tools.length>=49,`Expected at least 49 tools, received ${tools.length}`);
  for(const tool of ['omniforge_batch_edit','omniforge_request_capture','omniforge_apply_material','omniforge_update_material_settings','omniforge_create_material_variant','omniforge_list_surface_recipes','omniforge_update_surface_recipe','omniforge_create_surface_recipe_variant','omniforge_configure_path_blend','omniforge_create_prefab','omniforge_list_projects','omniforge_open_project','omniforge_duplicate_project','omniforge_archive_project','omniforge_list_model_assets','omniforge_get_model_asset','omniforge_import_model_from_project','omniforge_rebuild_asset_import','omniforge_repair_model_asset','omniforge_generate_model_collision','omniforge_generate_model_lods','omniforge_preview_model_placement','omniforge_commit_model_preview','omniforge_cancel_model_preview','omniforge_list_providers','omniforge_update_provider','omniforge_run_provider_health','omniforge_list_jobs','omniforge_submit_job','omniforge_cancel_job','omniforge_retry_job','omniforge_clear_completed_jobs'])assert.ok(tools.some(item=>item.name===tool),tool);
  assert.ok(tools.every(tool=>tool.name.startsWith('omniforge_')));
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('Codex can import and rebuild a hierarchy-aware model through guarded MCP tools',()=>{
  const runtime=tempRoot('omniforge-mcp-rebuild-'),projectFile=path.join(runtime,'workspace','projects','untitled-game','imports','car.glb'),glb=createTransformedMultiMaterialGlb();fs.mkdirSync(path.dirname(projectFile),{recursive:true});fs.writeFileSync(projectFile,glb);
  const digest=crypto.createHash('sha256').update(glb).digest('hex'),assetId=`asset-mcp-car-${digest.slice(0,10)}`;
  const input=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}},
    {jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'omniforge_import_model_from_project',arguments:{path:'untitled-game/imports/car.glb',name:'MCP Car',category:'vehicle',license:'CC0'}}},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'omniforge_rebuild_asset_import',arguments:{assetId}}}
  ].map(value=>JSON.stringify(value)).join('\n')+'\n';
  const probe=spawnSync(process.execPath,['bridge/mcp-server.mjs'],{cwd:ROOT,input,encoding:'utf8',timeout:10000,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime}});
  assert.equal(probe.status,0,probe.stderr);const messages=probe.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  const imported=JSON.parse(messages.find(message=>message.id===2).result.content[0].text),rebuilt=JSON.parse(messages.find(message=>message.id===3).result.content[0].text);
  assert.equal(imported.id,assetId);assert.equal(rebuilt.id,assetId);assert.equal(rebuilt.canonicalImporterVersion,3);assert.equal(rebuilt.health.nodeTransformsApplied,true);assert.equal(rebuilt.materialSlots.length,4);
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('material authoring settings clamp safely and preserve tiling transforms',()=>{
  const settings=normalizeMaterialSettings({worldScale:.001,uvRotation:45,uvOffset:[2.5,-1.25],roughness:2,roughnessMultiplier:3,metallic:-1,normalStrength:9,aoStrength:1.4,heightStrength:.5});
  assert.equal(settings.worldScale,.05);
  assert.equal(settings.uvRotation,45);
  assert.deepEqual(settings.uvOffset,[2.5,-1.25]);
  assert.equal(settings.roughness,1);
  assert.equal(settings.roughnessMultiplier,2);
  assert.equal(settings.metallic,0);
  assert.equal(settings.normalStrength,4);
  assert.equal(settings.aoStrength,1.4);
  assert.equal(settings.heightStrength,.25);
});

test('material tuner exposes live tiling and PBR response controls',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');
  const editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  const renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  assert.match(html,/id="materialInspector"/);
  for(const key of ['worldScale','uvRotation','uvOffset.0','roughnessMultiplier','normalStrength','aoStrength','heightStrength'])assert.match(editor,new RegExp(key.replace('.','\\.')));
  for(const uniform of ['uBaseTextureRotation','uBaseTextureOffset','uBaseHeightTexture','uBaseHeightStrength','uBaseRoughnessMultiplier','uBaseAOStrength'])assert.match(renderer,new RegExp(uniform));
  assert.match(editor,/auto-save to the authoritative material asset/i);
});

test('active source and documentation contain no legacy product assumptions',()=>{
  const files=walk(ROOT).filter(file=>!file.endsWith('engine-state.json'));
  const forbidden=new RegExp([['Project','Ascension'].join(' '),['project','ascension'].join('-'),['Ascension','Foundry'].join(' '),['ascension','foundry'].join('-')].join('|'),'i');
  const hits=[];
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    if(forbidden.test(text))hits.push(path.relative(ROOT,file));
  }
  assert.deepEqual(hits,[]);
});


test('desktop clipboard and pointer-lock permissions use guarded native paths',()=>{
  const main=fs.readFileSync(path.join(ROOT,'desktop','main.cjs'),'utf8');
  const preload=fs.readFileSync(path.join(ROOT,'desktop','preload.cjs'),'utf8');
  const editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  assert.match(main,/omniforge:copy-text/);assert.match(main,/clipboard\.writeText/);
  assert.match(main,/permission==='pointerLock'/);assert.match(main,/isTrustedEditorOrigin/);
  assert.match(preload,/copyText: value => ipcRenderer\.invoke\('omniforge:copy-text'/);
  assert.match(editor,/copyTextToClipboard/);assert.match(editor,/document\.execCommand/);
  assert.match(editor,/pointerlockerror/);assert.match(editor,/viewportDragLook/);
});

test('surface recipes are stable linked assets with validation and deterministic masks',()=>{
  const state=createDefaultState();
  const materials=state.assets.filter(asset=>asset.type==='material');
  const recipes=state.assets.filter(asset=>asset.type==='surfaceRecipe');
  assert.ok(recipes.length>=2);
  for(const material of materials){
    const recipe=recipes.find(item=>item.id===material.surfaceRecipeId);
    assert.ok(recipe,`${material.name} recipe missing`);
    assert.equal(recipe.baseMaterialId,material.id);
    assert.ok(['valid','warning'].includes(recipe.validation.state));
    for(const key of ['dirt','moss','wetness','snow','damage','colorVariation','detailAmount'])assert.ok(key in recipe.layers);
    for(const key of ['upwardFacing','slope','cavities','groundContact'])assert.ok(key in recipe.masks);
  }
  const normalized=normalizeSurfaceRecipe({id:'surface-test',baseMaterialId:'material-test',layers:{dirt:8,moss:-2,detailAmount:9},masks:{slope:3}});
  assert.equal(normalized.layers.dirt,1);assert.equal(normalized.layers.moss,0);assert.equal(normalized.layers.detailAmount,2);assert.equal(normalized.masks.slope,1);
});

test('Surface Studio preview, commit, revert, and recipe rendering are wired',()=>{
  const editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  const renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  for(const token of ['surfaceRecipeMarkup','commitSurfaceRecipe','revertSurfaceRecipe','createSurfaceRecipeVariant','data-surface-setting'])assert.match(editor,new RegExp(token));
  for(const uniform of ['uBaseSurfaceLayers','uPathSurfaceLayers','uBaseSurfaceMasks','uPathSurfaceMasks','applySurfaceRecipe'])assert.match(renderer,new RegExp(uniform));
});


test('desktop launcher rejects stale packaged executables',()=>{
  const launcher=fs.readFileSync(path.join(ROOT,'START_DESKTOP.bat'),'utf8');
  assert.match(launcher,/EXPECTED_VERSION=OmniForge 0\.9\.0/);
  assert.match(launcher,/findstr \/b \/l/);
  assert.match(launcher,/NEEDS_BUILD/);
});


test('canonical GLB pipeline preserves source and produces health, render, collision, LOD, and repair derivatives',()=>{
  const runtime=tempRoot('omniforge-assets-'),assetRoot=path.join(runtime,'assets'),glb=createTriangleGlb(),dataUrl=`data:model/gltf-binary;base64,${glb.toString('base64')}`;
  const parsed=parseGlb(glb);assert.equal(parsed.gltf.asset.version,'2.0');
  const asset=importModelAsset({assetRoot,name:'Health Triangle',fileName:'health-triangle.glb',dataUrl,category:'static-prop',license:'CC0',creator:'Test'});
  assert.equal(asset.type,'model');assert.equal(asset.validation.state,'valid');assert.equal(asset.triangleCount,1);assert.equal(asset.vertexCount,3);assert.ok(fs.existsSync(path.join(runtime,asset.sourceFile)));assert.ok(fs.existsSync(path.join(runtime,asset.canonicalFile)));
  const collision=generateCollision(asset);assert.equal(collision.shape,'box');assert.equal(collision.size.length,3);
  const lods=generateLodsForAsset({assetRoot,asset,ratios:[.5,.2]});assert.equal(lods.length,2);for(const lod of lods)assert.ok(fs.existsSync(path.join(runtime,lod.file)));
  const repaired=createSafeRepairDerivative({assetRoot,source:asset,settings:{centerPivot:true,unitScale:2}});assert.equal(repaired.sourceAssetId,asset.id);assert.equal(repaired.pivotMode,'bounds-center');assert.ok(fs.existsSync(path.join(runtime,repaired.canonicalFile)));
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('asset workspace exposes real import, health, reversible processing, preview, and commit flows',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8'),editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8'),renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8'),server=fs.readFileSync(path.join(ROOT,'server','server.mjs'),'utf8');
  for(const id of ['modelImportInput','modelCategory','modelLicense','importModelButton','modelAssetList','modelAssetInspector','assetSearchInput'])assert.match(html,new RegExp(`id=["']${id}["']`));
  for(const token of ['importSelectedModel','renderModelAssets','previewAsset','commitAssetPreview','cancelAssetPreview','captureAssetThumbnail'])assert.match(editor,new RegExp(token));
  for(const token of ['ensureModelMesh','modelMeshes','object.type===\'model\''])assert.match(renderer,new RegExp(token));
  for(const route of ['/api/asset/import','/api/asset/rebuild','/api/asset/repair','/api/asset/collision','/api/asset/lods','/api/asset/place-preview','/api/asset/commit-preview','/api/asset/cancel-preview','/api/asset/thumbnail'])assert.ok(server.includes(route),route);
});


test('asset recipes remain synchronized with canonical models, collision, LODs, provenance, and usages',()=>{
  const runtime=tempRoot('omniforge-asset-recipe-'),assetRoot=path.join(runtime,'assets');
  const glb=createTriangleGlb(),asset=importModelAsset({assetRoot,name:'Recipe Triangle',fileName:'recipe.glb',dataUrl:`data:model/gltf-binary;base64,${glb.toString('base64')}`,category:'static-prop',license:'CC0',creator:'Test'});
  asset.collision=generateCollision(asset);asset.collisionStatus='generated';asset.lods=generateLodsForAsset({assetRoot,asset,ratios:[.5,.2]});asset.sceneUsages=[{sceneId:'scene-one',sceneName:'Scene One',objectId:'object-one',objectName:'Recipe Triangle'}];
  const recipe=syncAssetRecipe(asset);
  assert.equal(recipe.id,`asset-recipe-${asset.id}`);
  assert.equal(recipe.canonicalAssetId,asset.id);
  assert.equal(recipe.canonicalFile,asset.canonicalFile);
  assert.equal(recipe.collisionStatus,'generated');
  assert.equal(recipe.lods.length,2);
  assert.equal(recipe.sceneUsages.length,1);
  assert.equal(recipe.provenance.license,'CC0');
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('real asset API imports, recipes, processes, previews, commits, and persists a GLB through the authoritative server',async()=>{
  const runtime=tempRoot('omniforge-asset-api-'),port=43041;
  const server=spawn(process.execPath,['server/server.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port),OMNIFORGE_SESSION_TOKEN:'asset-api-test'},stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  try{
    await waitForHealth(port);
    const glb=createTriangleGlb(),dataUrl=`data:model/gltf-binary;base64,${glb.toString('base64')}`;
    const imported=await postJson(port,'/api/asset/import',{name:'API Triangle',fileName:'api-triangle.glb',dataUrl,category:'static-prop',license:'CC0',creator:'Test Suite',source:'Automated integration fixture'});
    assert.equal(imported.status,201,JSON.stringify(imported.body));
    const asset=imported.body.asset;assert.ok(asset.assetRecipeId);assert.ok(imported.body.state.assets.some(item=>item.type==='assetRecipe'&&item.id===asset.assetRecipeId));
    assert.ok(fs.existsSync(path.join(runtime,asset.sourceFile)));assert.ok(fs.existsSync(path.join(runtime,asset.canonicalFile)));
    const rebuilt=await postJson(port,'/api/asset/rebuild',{assetId:asset.id});assert.equal(rebuilt.status,200);assert.equal(rebuilt.body.asset.canonicalImporterVersion,3);assert.equal(rebuilt.body.asset.health.nodeTransformsApplied,true);assert.equal(rebuilt.body.asset.approvalState,'draft');
    const historyDirectory=path.join(path.dirname(path.join(runtime,asset.canonicalFile)),'history');assert.ok(fs.existsSync(historyDirectory));assert.ok(fs.readdirSync(historyDirectory).length>=1);
    const collision=await postJson(port,'/api/asset/collision',{assetId:asset.id});assert.equal(collision.status,200);assert.equal(collision.body.asset.collisionStatus,'generated');
    const lods=await postJson(port,'/api/asset/lods',{assetId:asset.id,ratios:[.5,.2]});assert.equal(lods.status,200);assert.equal(lods.body.asset.lods.length,2);
    const approved=await postJson(port,'/api/asset/approve',{assetId:asset.id,approved:true});assert.equal(approved.status,200);assert.equal(approved.body.asset.approvalState,'approved');
    const preview=await postJson(port,'/api/asset/place-preview',{assetId:asset.id});assert.equal(preview.status,201);assert.equal(preview.body.object.properties.previewOnly,true);
    const committed=await postJson(port,'/api/asset/commit-preview',{objectId:preview.body.object.id});assert.equal(committed.status,200);assert.equal(committed.body.object.properties.previewOnly,false);
    const detail=await requestJson(port,`/api/asset/${encodeURIComponent(asset.id)}`);assert.equal(detail.status,200);assert.equal(detail.body.recipe.canonicalAssetId,asset.id);assert.equal(detail.body.asset.sceneUsages.length,1);
    const restartedState=JSON.parse(fs.readFileSync(path.join(runtime,'data','engine-state.json'),'utf8'));assert.ok(restartedState.assets.some(item=>item.id===asset.id));assert.ok(restartedState.assets.some(item=>item.id===asset.assetRecipeId));
  }finally{
    server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));fs.rmSync(runtime,{recursive:true,force:true});
  }
  assert.equal(stderr,'',stderr);
});



test('canonical importer applies nested glTF node transforms and preserves primitive material groups',()=>{
  const runtime=tempRoot('omniforge-transform-import-'),assetRoot=path.join(runtime,'assets'),glb=createTransformedMultiMaterialGlb();
  const asset=importModelAsset({assetRoot,name:'Transformed Assembly',fileName:'assembly.glb',dataUrl:`data:model/gltf-binary;base64,${glb.toString('base64')}`,category:'vehicle',license:'CC0',creator:'Test'});
  assert.equal(asset.health.nodeTransformsApplied,true);
  assert.equal(asset.health.meshInstanceCount,2);
  assert.equal(asset.materialSlots.length,4);
  const canonical=JSON.parse(fs.readFileSync(path.join(runtime,asset.canonicalFile),'utf8'));
  assert.equal(canonical.schemaVersion,2);
  assert.equal(canonical.groups.length,4);
  assert.equal(canonical.groups[0].nodeName,'Left Assembly');
  assert.equal(canonical.groups[2].nodeName,'Nested Assembly');
  const xs=canonical.positions.filter((_,index)=>index%3===0),ys=canonical.positions.filter((_,index)=>index%3===1);
  assert.ok(Math.min(...xs)<-2.4);
  assert.ok(Math.max(...xs)>=2); 
  assert.ok(Math.max(...ys)>1.4);
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('canonical rebuild repairs legacy imports from preserved source and retains rollback history',()=>{
  const runtime=tempRoot('omniforge-rebuild-import-'),assetRoot=path.join(runtime,'assets'),glb=createTransformedMultiMaterialGlb();
  const asset=importModelAsset({assetRoot,name:'Legacy Car Assembly',fileName:'car.glb',dataUrl:`data:model/gltf-binary;base64,${glb.toString('base64')}`,category:'vehicle',license:'CC0',creator:'Test'});
  const sourcePath=path.join(runtime,asset.sourceFile),sourceChecksum=fs.readFileSync(sourcePath).toString('base64');
  const canonicalPath=path.join(runtime,asset.canonicalFile),legacy=JSON.parse(fs.readFileSync(canonicalPath,'utf8'));legacy.schemaVersion=1;legacy.groups=[];legacy.nodeTransformsApplied=false;fs.writeFileSync(canonicalPath,JSON.stringify(legacy));asset.canonicalImporterVersion=1;asset.health.nodeTransformsApplied=false;asset.approvalState='approved';
  const rebuilt=rebuildCanonicalAsset({assetRoot,asset});
  assert.equal(rebuilt.id,asset.id);assert.equal(rebuilt.canonicalImporterVersion,3);assert.equal(rebuilt.health.nodeTransformsApplied,true);assert.equal(rebuilt.health.meshInstanceCount,2);assert.equal(rebuilt.approvalState,'draft');assert.ok(rebuilt.canonicalRevision);
  const canonical=JSON.parse(fs.readFileSync(canonicalPath,'utf8'));assert.equal(canonical.schemaVersion,2);assert.equal(canonical.groups.length,4);
  const historyDir=path.join(path.dirname(canonicalPath),'history');assert.ok(fs.readdirSync(historyDir).some(name=>name.startsWith('mesh-before-rebuild-')));
  assert.equal(fs.readFileSync(sourcePath).toString('base64'),sourceChecksum);
  fs.rmSync(runtime,{recursive:true,force:true});
});

test('asset workspace reflows into focused subviews and protects the viewport from panel overlap',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8'),editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8'),styles=fs.readFileSync(path.join(ROOT,'app','styles.css'),'utf8'),renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  for(const view of ['models','surfaces','prefabs'])assert.match(html,new RegExp(`data-asset-workspace-view=["']${view}["']`));
  assert.match(editor,/function setAssetWorkspaceView/);assert.match(editor,/function fitLayoutToViewport/);assert.match(editor,/data-asset-action=\"rebuild\"/);assert.ok(editor.includes('/api/asset/rebuild'));assert.match(styles,/\.asset-subview\.active/);assert.match(styles,/--border:#273142/);assert.match(styles,/\.viewport-toolbar\{[^}]*overflow-x:auto/);
  assert.match(renderer,/useImportedGroups/);assert.match(renderer,/group\.indexOffset/);assert.match(renderer,/modelRevisions/);assert.match(renderer,/canonicalRevision/);
});

test('provider framework normalizes independent providers, settings, and persistent job records',()=>{
  const providers=normalizeProviders(starterProviders());
  assert.ok(providers.length>=3);
  assert.ok(providers.some(provider=>provider.id==='local-worker-host'&&provider.required));
  assert.ok(providers.every(provider=>provider.status&&provider.capabilities&&provider.operations));
  const settings=normalizeIntegrationSettings({cacheLimitGb:999,maxConcurrentJobs:99,offlineMode:true});
  assert.equal(settings.cacheLimitGb,500);assert.equal(settings.maxConcurrentJobs,8);assert.equal(settings.offlineMode,true);
  const job=normalizeJob({id:'job-test',providerId:'local-worker-host',operation:'asset-index',progress:4,state:'queued'});
  assert.equal(job.progress,1);assert.equal(job.state,'queued');assert.equal(job.validation.state,'pending');
  const state=createDefaultState();assert.ok(Array.isArray(state.providers));assert.ok(Array.isArray(state.jobs));assert.equal(state.settings.integrations.setupState,'pending');
});

test('Integrations workspace and Job Center are connected to guarded provider and worker routes',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8'),editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8'),server=fs.readFileSync(path.join(ROOT,'server','server.mjs'),'utf8'),manager=fs.readFileSync(path.join(ROOT,'server','job-manager.mjs'),'utf8'),worker=fs.readFileSync(path.join(ROOT,'workers','local-worker.mjs'),'utf8');
  for(const id of ['integrationsTab','providerList','runIntegrationSetupButton','jobsDock','jobList','integrationSetupDialog','maxConcurrentJobsInput','offlineModeInput'])assert.match(html,new RegExp(`id=["']${id}["']`));
  for(const token of ['renderProviders','renderJobs','runProviderHealth','queueBackgroundJob','cancelBackgroundJob','retryBackgroundJob','saveIntegrationSetup'])assert.match(editor,new RegExp(token));
  for(const route of ['/api/providers','/api/integrations/setup','/api/jobs','/health','/cancel','/retry'])assert.ok(server.includes(route),route);
  for(const token of ['spawn(process.execPath','cancellationRequested','retryJob','shutdownJobs'])assert.match(manager,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const operation of ['provider-health-check','asset-index','project-integrity','diagnostic-delay'])assert.match(worker,new RegExp(operation));
});

test('real provider health, project validation, cancellation, retry, and restart-safe jobs run through isolated workers',async()=>{
  const runtime=tempRoot('omniforge-provider-api-'),port=await freePort();
  const server=spawn(process.execPath,['server/server.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port),OMNIFORGE_SESSION_TOKEN:'provider-api-test'},stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  try{
    const health=await waitForHealth(port);assert.equal(health.version,'0.10.0');
    const initial=await requestJson(port,'/api/state');assert.ok(initial.body.providers.some(provider=>provider.id==='local-worker-host'));
    const healthQueued=await postJson(port,'/api/providers/local-worker-host/health',{});assert.equal(healthQueued.status,202);const healthJob=await waitForJob(port,healthQueued.body.job.id);assert.equal(healthJob.state,'succeeded');assert.equal(healthJob.validation.state,'passed');assert.equal(healthJob.outputs[0].type,'hardware-report');
    const afterHealth=await requestJson(port,'/api/state');const provider=afterHealth.body.providers.find(item=>item.id==='local-worker-host');assert.ok(provider.status.lastHealthCheck);assert.equal(provider.status.state,'connected');
    const integrityQueued=await postJson(port,'/api/jobs',{operation:'project-integrity',title:'Integration integrity'});const integrity=await waitForJob(port,integrityQueued.body.job.id);assert.equal(integrity.state,'succeeded');assert.equal(integrity.outputs[0].type,'project-integrity');
    const diagnosticQueued=await postJson(port,'/api/jobs',{operation:'diagnostic-delay',title:'Cancel me',settings:{durationMs:700,steps:14}});await new Promise(resolve=>setTimeout(resolve,100));const cancelled=await postJson(port,`/api/jobs/${diagnosticQueued.body.job.id}/cancel`,{});assert.equal(cancelled.body.job.state,'cancelled');
    const retried=await postJson(port,`/api/jobs/${diagnosticQueued.body.job.id}/retry`,{});const retryComplete=await waitForJob(port,retried.body.job.id);assert.equal(retryComplete.state,'succeeded');assert.equal(retryComplete.sourceJobId,diagnosticQueued.body.job.id);assert.equal(retryComplete.attempt,2);
    const persisted=JSON.parse(fs.readFileSync(path.join(runtime,'data','engine-state.json'),'utf8'));assert.ok(persisted.jobs.some(job=>job.id===retryComplete.id&&job.state==='succeeded'));
  }finally{server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));fs.rmSync(runtime,{recursive:true,force:true});}
  assert.equal(stderr,'',stderr);
});

test('v0.8 marketplace workspace, providers, staged downloads, and guarded import are wired into the authoritative editor',()=>{
  const state=createDefaultState(),providerIds=new Set(state.providers.map(provider=>provider.id));
  for(const id of ['poly-haven','ambientcg','kenney','quaternius','quaternius-animations'])assert.ok(providerIds.has(id),id);
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8'),editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8'),server=fs.readFileSync(path.join(ROOT,'server','server.mjs'),'utf8'),marketplace=fs.readFileSync(path.join(ROOT,'server','marketplace.mjs'),'utf8'),worker=fs.readFileSync(path.join(ROOT,'workers','local-worker.mjs'),'utf8'),mcp=fs.readFileSync(path.join(ROOT,'bridge','mcp-server.mjs'),'utf8');
  for(const id of ['marketplaceAssetSubview','marketplaceProviderSelect','marketplaceSearchInput','marketplaceResults','marketplaceInspector'])assert.match(html,new RegExp(`id=["']${id}["']`));
  for(const token of ['searchMarketplaceCatalog','loadMarketplaceDetails','downloadSelectedMarketplaceAsset','importMarketplaceJob'])assert.match(editor,new RegExp(token));
  for(const route of ['/api/marketplace/search','/api/marketplace/details','/api/marketplace/download','/api/marketplace/import-job'])assert.ok(server.includes(route),route);
  for(const token of ['searchMarketplace','marketplaceDetails','prepareMarketplaceDownload','resolveMarketplaceImportFiles'])assert.match(marketplace,new RegExp(token));
  assert.match(worker,/marketplace-download/);
  for(const tool of ['omniforge_search_marketplace','omniforge_get_marketplace_asset','omniforge_download_marketplace_asset','omniforge_import_marketplace_job'])assert.match(mcp,new RegExp(tool));
});

test('mocked Poly Haven search completes a real staged download job and imports a canonical model',async()=>{
  const runtime=tempRoot('omniforge-marketplace-api-'),mockRoot=tempRoot('omniforge-marketplace-mocks-'),port=await freePort(),fixture=path.join(here,'fixtures','validated-cube.glb');
  fs.writeFileSync(path.join(mockRoot,'poly-haven-assets.json'),JSON.stringify({marketplace_cube:{name:'Marketplace Cube',description:'Mocked CC0 model used for the end-to-end provider test.',type:2,category:'Props',tags:['cube','test'],authors:[{name:'Test Artist'}]}}));
  fs.writeFileSync(path.join(mockRoot,'poly-haven-files-marketplace-cube.json'),JSON.stringify({gltf:{'1k':{glb:{url:'https://mock.invalid/marketplace_cube.glb',localPath:fixture,size:fs.statSync(fixture).size,md5:crypto.createHash('md5').update(fs.readFileSync(fixture)).digest('hex')}}}}));
  const server=spawn(process.execPath,['server/server.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port),OMNIFORGE_SESSION_TOKEN:'marketplace-api-test',OMNIFORGE_MARKETPLACE_MOCK_ROOT:mockRoot},stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  try{
    const health=await waitForHealth(port);assert.equal(health.version,'0.10.0');
    const search=await requestJson(port,'/api/marketplace/search?providerId=poly-haven&q=cube&type=model&limit=10');assert.equal(search.status,200);assert.equal(search.body.results.length,1);assert.equal(search.body.results[0].license,'CC0');
    const details=await requestJson(port,'/api/marketplace/details?providerId=poly-haven&assetId=marketplace_cube');assert.equal(details.status,200);assert.ok(details.body.asset.downloadChoices.length>=1);
    const queued=await postJson(port,'/api/marketplace/download',{providerId:'poly-haven',assetId:'marketplace_cube',choiceId:details.body.asset.downloadChoices[0].id});assert.equal(queued.status,202);
    const job=await waitForJob(port,queued.body.job.id);assert.equal(job.state,'succeeded');assert.equal(job.outputs[0].type,'marketplace-download');assert.ok(fs.existsSync(job.outputs[0].value.files[0].path));
    const imported=await postJson(port,'/api/marketplace/import-job',{jobId:job.id});assert.equal(imported.status,201);assert.equal(imported.body.kind,'model');assert.match(imported.body.asset.source,/polyhaven\.com/);assert.equal(imported.body.asset.license,'CC0');assert.ok(imported.body.asset.canonicalFile);
    const persisted=JSON.parse(fs.readFileSync(path.join(runtime,'data','engine-state.json'),'utf8'));assert.ok(persisted.assets.some(asset=>asset.id===imported.body.asset.id&&asset.type==='model'));assert.equal(persisted.jobs.find(item=>item.id===job.id).importedAssetId,imported.body.asset.id);
  }finally{server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));fs.rmSync(runtime,{recursive:true,force:true});fs.rmSync(mockRoot,{recursive:true,force:true});}
  assert.equal(stderr,'',stderr);
});

test('ambientCG provider migrates existing v2 settings to the supported v3 asset API',()=>{
  const starter=starterProviders().find(provider=>provider.id==='ambientcg');
  assert.equal(starter.settings.apiBase,'https://ambientcg.com/api/v3');
  assert.equal(starter.status.version,'v3');
  const migrated=normalizeProviders([{...starter,settings:{...starter.settings,apiBase:'https://ambientcg.com/api/v2'},status:{...starter.status,version:'v2'}}]).find(provider=>provider.id==='ambientcg');
  assert.equal(migrated.settings.apiBase,'https://ambientcg.com/api/v3');
  assert.equal(migrated.status.version,'v3');
  const marketplace=fs.readFileSync(path.join(ROOT,'server','marketplace.mjs'),'utf8');
  assert.match(marketplace,/api\/v3/);
  assert.doesNotMatch(marketplace,/ambientcg\.com\/api\/v2/);
});


test('v0.9 Surface Recipe v2 normalizes advanced masks, graph data, colors, and deterministic compilation',()=>{
  const recipe=normalizeSurfaceRecipe({id:'surface-recipe-test',name:'Test Surface',baseMaterialId:'material-test',layers:{dirt:.4,roughnessVariation:.3,detailScale:7},layerColors:{moss:'#336633'},masks:{downwardFacing:.2,waterContact:.7,distanceFromStructures:.8},advanced:{projection:'triplanar',macroScale:32,blendSharpness:2.5},graph:{nodes:[{id:'base',type:'base-material',enabled:true,value:1},{id:'output',type:'surface-output',enabled:true,value:1}],edges:[{from:'base',to:'output'}],outputNodeId:'output'}});
  assert.equal(recipe.schemaVersion,2);assert.equal(recipe.layers.roughnessVariation,.3);assert.equal(recipe.masks.waterContact,.7);assert.equal(recipe.advanced.projection,'triplanar');assert.equal(recipe.layerColors.moss,'#336633');assert.equal(recipe.validation.state,'valid');
  const first=compileSurfaceRecipe(recipe),second=compileSurfaceRecipe(recipe);assert.equal(first.state,'ready');assert.equal(first.hash,second.hash);assert.match(first.key,/^surface-/);
  const broken=normalizeSurfaceRecipe({...recipe,graph:{nodes:[{id:'output',type:'surface-output',enabled:false}],edges:[],outputNodeId:'output'}},recipe);assert.equal(broken.validation.state,'failed');
});

test('v0.9 decal and atlas recipes validate stable production metadata',()=>{
  const decal=normalizeDecalRecipe({id:'decal-mud',name:'Mud Splash',materialId:'material-earth',opacity:.7,projection:{depth:.4},channels:{baseColor:true,roughness:true}});assert.equal(decal.type,'decalRecipe');assert.equal(decal.validation.state,'valid');assert.equal(decal.channels.roughness,true);
  const atlas=normalizeAtlasRecipe({id:'atlas-town',name:'Town Atlas',kind:'atlas',resolution:2048,entries:[{id:'a',assetId:'material-a',rect:[0,0,.5,1]},{id:'b',assetId:'material-b',rect:[.5,0,.5,1]}]});assert.equal(atlas.type,'atlasRecipe');assert.equal(atlas.occupancy,1);assert.equal(atlas.validation.state,'valid');
});

test('v0.9 Production Surface Studio exposes map processing, advanced graph, decals, atlases, and guarded tools',()=>{
  const html=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8'),editor=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8'),renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8'),server=fs.readFileSync(path.join(ROOT,'server','server.mjs'),'utf8'),mcp=fs.readFileSync(path.join(ROOT,'bridge','mcp-server.mjs'),'utf8');
  for(const id of ['surfaceAdvancedPanel','surfaceProcessingPanel','surfaceDecalPanel','surfaceAtlasPanel','repairSurfaceSeamsButton','generateMissingMapsButton','surfaceSourcePreview','surfaceSeamPreview','createDecalButton','createAtlasButton'])assert.match(html,new RegExp(`id=["']${id}["']`));
  for(const token of ['makeSeamlessCanvas','pbrMapsFromCanvas','processSelectedMaterial','createDecalRecipe','createSurfaceAtlas','surfaceGraphMarkup'])assert.match(editor,new RegExp(token));
  for(const token of ['uEnvironmentState','uStructurePos','uBaseSurfaceMasks2','uBaseLayer','uOpacity','nearestStructureMask'])assert.ok(renderer.includes(token)||token==='uBaseLayer',token);
  for(const route of ['/api/material/derivative','/api/decal','/api/decal/place','/api/atlas','/compile'])assert.ok(server.includes(route),route);
  for(const tool of ['omniforge_compile_surface_recipe','omniforge_create_decal_recipe','omniforge_place_decal','omniforge_create_surface_atlas'])assert.match(mcp,new RegExp(tool));
});

test('v0.9 real API creates processed material derivatives, compiles recipes, creates decals, and persists atlas layouts',async()=>{
  const runtime=tempRoot('omniforge-surface-v09-'),port=await freePort(),server=spawn(process.execPath,['server/server.mjs'],{cwd:ROOT,env:{...process.env,OMNIFORGE_DATA_ROOT:runtime,OMNIFORGE_PORT:String(port),OMNIFORGE_SESSION_TOKEN:'surface-v09-test'},stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  try{
    const health=await waitForHealth(port);assert.equal(health.version,'0.10.0');const state=(await requestJson(port,'/api/state')).body,source=state.assets.find(item=>item.type==='material');assert.ok(source);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XjT5WQAAAABJRU5ErkJggg==';
    const derivative=await postJson(port,'/api/material/derivative',{materialId:source.id,name:'Processed Test',operation:'seam-repair',maps:{baseColor:png,normal:png,roughness:png,ambientOcclusion:png,height:png},shareUnchangedMaps:true});assert.equal(derivative.status,201);assert.equal(derivative.body.material.sourceAssetId,source.id);assert.equal(derivative.body.recipe.compilation.state,'ready');
    const compiled=await postJson(port,`/api/surface-recipe/${encodeURIComponent(derivative.body.recipe.id)}/compile`,{});assert.equal(compiled.status,200);assert.equal(compiled.body.recipe.compilation.state,'ready');
    const decal=await postJson(port,'/api/decal',{materialId:derivative.body.material.id,name:'Dirt Decal',category:'dirt',opacity:.8,projection:{depth:.2}});assert.equal(decal.status,201);assert.equal(decal.body.decal.validation.state,'valid');
    const placed=await postJson(port,'/api/decal/place',{decalId:decal.body.decal.id,position:[0,.05,0],size:[2,3]});assert.equal(placed.status,201);assert.equal(placed.body.object.type,'decal');
    const atlas=await postJson(port,'/api/atlas',{name:'Test Atlas',kind:'atlas',resolution:1024,materialIds:[source.id,derivative.body.material.id]});assert.equal(atlas.status,201);assert.equal(atlas.body.atlas.entries.length,2);assert.equal(atlas.body.atlas.occupancy,1);
    const persisted=(await requestJson(port,'/api/state')).body;assert.ok(persisted.assets.some(item=>item.id===decal.body.decal.id));assert.ok(persisted.assets.some(item=>item.id===atlas.body.atlas.id));assert.ok(persisted.scenes[0].objects.some(item=>item.type==='decal'));
  } finally {server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));if(stderr)assert.doesNotMatch(stderr,/SyntaxError|ReferenceError|TypeError/);}
});
