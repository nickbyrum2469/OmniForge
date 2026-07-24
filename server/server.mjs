import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  ROOT, RUNTIME_ROOT, WORKSPACE_ROOT, ASSET_ROOT, SESSION_TOKEN, RUNTIME_PORT, readState, writeState, mutateState, addActivity, recordError,
  activeScene, findObject, createSceneObject, safeWorkspacePath, createDefaultState, normalizeMaterialSettings, normalizeSurfaceRecipe, compileSurfaceRecipe, normalizeDecalRecipe, normalizeAtlasRecipe,
  listProjects, createProject, openProject, duplicateProject, archiveProject, importProject, locateProject, refreshProjectCatalog, updateProjectThumbnail, projectLockFile
} from './state-store.mjs';
import {
  importModelAsset, rebuildCanonicalAsset, createSafeRepairDerivative, generateCollision, generateLodsForAsset, refreshSceneUsages, syncAssetRecipe
} from './asset-pipeline.mjs';
import { normalizeProvider, normalizeIntegrationSettings } from './provider-framework.mjs';
import { initializeJobManager, createJob, cancelJob, retryJob, clearCompletedJobs, shutdownJobs } from './job-manager.mjs';
import { searchMarketplace, marketplaceDetails, prepareMarketplaceDownload, resolveMarketplaceImportFiles, createMaterialFromMarketplaceDownload, inspectDownloadedJob } from './marketplace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(ROOT, 'app');
const port = Number(process.env.OMNIFORGE_PORT || RUNTIME_PORT || readState().settings.port || 4177);
const sessionToken = SESSION_TOKEN;
const host = process.env.OMNIFORGE_HOST || '127.0.0.1';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp':'image/webp', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.obj': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function text(res, status, body, type='text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000_000) throw new Error('Request body exceeds the 100 MB import limit.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sanitizeScene(scene) {
  if (!scene || typeof scene !== 'object') throw new Error('Scene payload is required.');
  if (!Array.isArray(scene.objects)) throw new Error('Scene objects must be an array.');
  if (scene.objects.length > 10000) throw new Error('Scene object limit exceeded.');
  const seen = new Set();
  for (const object of scene.objects) {
    if (!object.id || !object.type || !object.name) throw new Error('Every scene object requires id, type, and name.');
    if (seen.has(object.id)) throw new Error(`Duplicate object id: ${object.id}`);
    seen.add(object.id);
    if (!object.transform || !Array.isArray(object.transform.position) || object.transform.position.length !== 3) {
      throw new Error(`Invalid transform for ${object.id}`);
    }
  }
  return scene;
}

function savePngDataUrl(dataUrl, kind='viewport', metadata={}) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('A PNG data URL is required.');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 18_000_000) throw new Error('Capture is empty or too large.');
  const dir = path.join(RUNTIME_ROOT, 'captures');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  const name = `${kind}-${stamp}.png`;
  const output = path.join(dir, name);
  fs.writeFileSync(output, buffer);
  return { name, path: output, file: `captures/${name}`, url: `/captures/${encodeURIComponent(name)}`, bytes: buffer.length, metadata };
}


function slugify(value, fallback='asset') {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || fallback;
}

function saveImageDataUrl(dataUrl, outputBase) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('A PNG, JPEG, or WebP data URL is required.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 20_000_000) throw new Error('Image is empty or too large.');
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const outputPath = `${outputBase}.${extension}`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return { bytes:buffer.length, extension, outputPath };
}

function createMaterialAsset(body) {
  const materialId = body.id ? `material-${slugify(body.id.replace(/^material-/,''), 'surface')}` : `material-${slugify(body.name, 'surface')}-${Date.now().toString(36)}`;
  const folder = path.join(ASSET_ROOT, 'materials', materialId);
  const maps = {};
  for (const [mapName, dataUrl] of Object.entries(body.maps || {})) {
    if (!dataUrl) continue;
    const safeMap = slugify(mapName, 'map');
    const saved = saveImageDataUrl(dataUrl, path.join(folder, safeMap));
    const file = `${safeMap}.${saved.extension}`;
    maps[mapName] = { file: `assets/materials/${materialId}/${file}`, url: `/assets/materials/${encodeURIComponent(materialId)}/${encodeURIComponent(file)}` };
  }
  return {
    id: materialId,
    type: 'material',
    name: String(body.name || 'Generated Material').slice(0,120),
    category: String(body.category || 'surface').slice(0,50),
    prompt: String(body.prompt || '').slice(0,5000),
    source: String(body.source || 'local-procedural').slice(0,100),
    license: String(body.license || 'Generated locally for project use').slice(0,200),
    createdAt: new Date().toISOString(),
    maps,
    settings: normalizeMaterialSettings(body.settings || {}),
    tags: Array.isArray(body.tags) ? body.tags.map(value=>String(value).slice(0,40)).slice(0,30) : []
  };
}

function createMaterialDerivative(state, body) {
  const source=state.assets.find(item=>item.id===body.materialId&&item.type==='material');
  if(!source)throw new Error('Source material not found.');
  const material=createMaterialAsset({
    name:body.name||`${source.name} Processed`,category:body.category||source.category,prompt:body.prompt||source.prompt,
    maps:body.maps||{},source:body.source||`Processed derivative of ${source.name}`,license:body.license||source.license,
    settings:body.settings||source.settings,tags:[...(source.tags||[]),'processed-derivative',...(body.tags||[])]
  });
  material.sourceAssetId=source.id;material.derivativeOperation=String(body.operation||'surface-processing').slice(0,80);material.sharedMapSourceId=body.shareUnchangedMaps===false?null:source.id;
  material.maps={...(body.shareUnchangedMaps===false?{}:structuredClone(source.maps||{})),...(material.maps||{})};
  const recipeSource=state.assets.find(item=>item.type==='surfaceRecipe'&&item.id===source.surfaceRecipeId);
  const recipe=normalizeSurfaceRecipe({...(recipeSource||{}),id:`surface-recipe-${slugify(material.name,'surface')}-${Date.now().toString(36)}`,name:`${material.name} Surface`,baseMaterialId:material.id,sourceRecipeId:recipeSource?.id||null,protected:false,createdAt:new Date().toISOString()},recipeSource||{});
  recipe.compilation=compileSurfaceRecipe(recipe);material.surfaceRecipeId=recipe.id;
  source.derivativeAssetIds=[...(source.derivativeAssetIds||[]),material.id];state.assets.unshift(recipe);state.assets.unshift(material);
  return {material,recipe};
}

function decalObjectFromRecipe(recipe,material,body={}) {
  const position=Array.isArray(body.position)?body.position.map(Number):[0,.04,0];
  const size=Array.isArray(body.size)&&body.size.length===2?body.size.map(Number):[3,3];
  return createSceneObject('decal',{name:body.name||recipe.name,position,rotation:Array.isArray(body.rotation)?body.rotation.map(Number):[0,0,0],scale:[Math.max(.05,size[0]),1,Math.max(.05,size[1])],properties:{decalRecipeId:recipe.id,materialId:material.id,color:body.color||'#ffffff',opacity:Number(body.opacity??recipe.opacity??.85),roughness:Number(material.settings?.roughness??.8),metallic:Number(material.settings?.metallic??0),projectionDepth:recipe.projection?.depth??.25,sortOrder:recipe.sortOrder||0,castsShadows:false,receivesShadows:true,collider:false,previewOnly:Boolean(body.previewOnly)}});
}

function rgbToHex(color=[.65,.68,.74]) {
  return `#${color.slice(0,3).map(value=>Math.max(0,Math.min(255,Math.round(Number(value||0)*255))).toString(16).padStart(2,'0')).join('')}`;
}
function terrainHeightAt(terrain,x,z){
  if(!terrain)return 0;const p=terrain.transform.position,s=terrain.transform.scale,props=terrain.properties||{};const lx=(x-p[0])/(s[0]||1),lz=(z-p[2])/(s[2]||1),seed=Number(props.seed||0),f=Number(props.frequency||.05),a=Number(props.amplitude||0);const n1=Math.sin((lx+seed*2.13)*f)*Math.cos((lz-seed*.73)*f*1.17),n2=Math.sin((lx+lz)*f*.47+seed*1.91)*.48,n3=Math.cos((lx*.37-lz*.61)*f*1.9-seed)*.22,n4=Math.sin((lx*.73+lz*.19)*f*3.4+seed*.31)*.09;return p[1]+(n1+n2+n3+n4)*a*(s[1]||1);
}
function modelObjectFromAsset(asset,body={}){
  const size=asset.bounds?.size||[1,1,1],position=Array.isArray(body.position)?body.position.map(Number):[0,0,0],scene=body.scene||null;
  const terrain=scene?.objects?.find(object=>object.type==='terrain');if(!Array.isArray(body.position))position[1]=terrainHeightAt(terrain,position[0],position[2])+Math.max(0,size[1]/2-(asset.bounds?.center?.[1]||0));
  return createSceneObject('model',{name:body.name||asset.name,position,scale:Array.isArray(body.scale)?body.scale.map(Number):[1,1,1],rotation:Array.isArray(body.rotation)?body.rotation.map(Number):[0,0,0],properties:{assetId:asset.id,color:rgbToHex(asset.material?.baseColor),metallic:Number(asset.material?.metallic||0),roughness:Number(asset.material?.roughness??.8),collider:asset.collisionStatus==='generated',collision:asset.collision||null,castsShadows:true,receivesShadows:true,previewOnly:Boolean(body.previewOnly),previewTransactionId:body.previewTransactionId||null}});
}

function upsertAssetRecipe(state,asset){
  if(!asset||asset.type!=='model')return null;
  const existing=state.assets.find(item=>item.type==='assetRecipe'&&(item.canonicalAssetId===asset.id||item.id===asset.assetRecipeId));
  const recipe=syncAssetRecipe(asset,existing||{});asset.assetRecipeId=recipe.id;
  if(existing)Object.assign(existing,recipe);else state.assets.push(recipe);
  return recipe;
}

function applyObjectPatch(object, patch) {
  const allowed = ['name','parentId','visible','locked','transform','properties','components'];
  for (const key of allowed) {
    if (!(key in patch)) continue;
    if (key === 'transform') {
      object.transform = {
        position: Array.isArray(patch.transform.position) ? patch.transform.position.map(Number) : object.transform.position,
        rotation: Array.isArray(patch.transform.rotation) ? patch.transform.rotation.map(Number) : object.transform.rotation,
        scale: Array.isArray(patch.transform.scale) ? patch.transform.scale.map(Number) : object.transform.scale
      };
    } else if (key === 'properties') {
      object.properties = { ...(object.properties || {}), ...(patch.properties || {}) };
    } else if (key === 'components') {
      object.components = Array.isArray(patch.components) ? patch.components : object.components;
    } else {
      object[key] = patch[key];
    }
  }
}

function searchState(state, query) {
  const q = String(query || '').trim().toLowerCase();
  const scene = activeScene(state);
  if (!q) return { objects: scene.objects, assets: state.assets, commands: state.commands.slice(0,20), activity: state.activity.slice(0,20) };
  const includes = value => JSON.stringify(value).toLowerCase().includes(q);
  return {
    objects: scene.objects.filter(includes),
    assets: state.assets.filter(includes),
    commands: state.commands.filter(includes).slice(0,30),
    evidence: state.evidence.filter(includes).slice(0,30),
    activity: state.activity.filter(includes).slice(0,30)
  };
}

function listWorkspace(relative='.', maxEntries=500) {
  const root = safeWorkspacePath(relative);
  if (!fs.existsSync(root)) return [];
  const result = [];
  const queue = [root];
  while (queue.length && result.length < maxEntries) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(WORKSPACE_ROOT, full).replaceAll('\\','/');
      result.push({ path: rel, type: entry.isDirectory() ? 'directory' : 'file', bytes: entry.isFile() ? fs.statSync(full).size : null });
      if (entry.isDirectory()) queue.push(full);
      if (result.length >= maxEntries) break;
    }
  }
  return result;
}

function probeHealth(portNumber, token, timeoutMs=650) {
  return new Promise(resolve=>{
    const request=http.get({host:'127.0.0.1',port:Number(portNumber),path:'/api/health',timeout:timeoutMs},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
        try{const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));resolve(response.statusCode===200&&payload.sessionToken===token);}catch{resolve(false);}
      });
    });
    request.on('timeout',()=>{request.destroy();resolve(false);});request.on('error',()=>resolve(false));
  });
}

let activeLockPath=null;
async function assertProjectUnlocked(projectId){
  const record=listProjects({includeArchived:true}).find(project=>project.id===projectId);
  if(!record||record.missing)return;
  const lockPath=projectLockFile(record.root);
  if(!fs.existsSync(lockPath))return;
  let lock=null;try{lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));}catch{}
  if(!lock){fs.rmSync(lockPath,{force:true});return;}
  if(lock.sessionToken===sessionToken)return;
  const active=await probeHealth(lock.port,lock.sessionToken);
  if(active)throw new Error(`Project “${record.name}” is already open in another OmniForge session.`);
  fs.rmSync(lockPath,{force:true});
}

function releaseActiveProjectLock(){
  if(!activeLockPath)return;
  try{const lock=JSON.parse(fs.readFileSync(activeLockPath,'utf8'));if(lock.sessionToken===sessionToken)fs.rmSync(activeLockPath,{force:true});}catch{}
  activeLockPath=null;
}

function acquireActiveProjectLock(state=readState()){
  releaseActiveProjectLock();
  const lockPath=projectLockFile(state.project.root);fs.mkdirSync(path.dirname(lockPath),{recursive:true});
  fs.writeFileSync(lockPath,JSON.stringify({appId:'omniforge',projectId:state.project.id,sessionToken,port,pid:process.pid,startedAt:new Date().toISOString()},null,2),'utf8');
  activeLockPath=lockPath;
}


async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, port, name: 'OmniForge', version:'0.10.0', sessionToken, pid:process.pid, safeMode:process.env.OMNIFORGE_SAFE_MODE==='1' });
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, readState());

  if (req.method === 'GET' && url.pathname === '/api/providers') {
    const state=readState();return json(res,200,{providers:state.providers||[],settings:state.settings?.integrations||{},jobs:state.jobs||[]});
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/providers/')) {
    const providerId=decodeURIComponent(url.pathname.slice('/api/providers/'.length));const body=await readBody(req);
    const {state,result}=mutateState(state=>{
      const provider=(state.providers||[]).find(item=>item.id===providerId);if(!provider)throw new Error('Provider not found.');
      if(body.enabled!==undefined){if(provider.required&&!body.enabled)throw new Error('This provider is required by the authoritative editor.');provider.enabled=Boolean(body.enabled);provider.status={...provider.status,state:provider.enabled?(provider.status?.state==='disconnected'?'connected':provider.status?.state||'connected'):'disconnected',message:provider.enabled?(provider.status?.message||'Provider enabled.'):'Provider disabled by user.'};}
      if(body.settings&&typeof body.settings==='object')provider.settings={...(provider.settings||{}),...body.settings};
      provider.updatedAt=new Date().toISOString();addActivity(state,'provider',`Updated provider: ${provider.displayName}.`,{providerId,enabled:provider.enabled});return provider;
    });return json(res,200,{provider:result,state});
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/health')) {
    const providerId=decodeURIComponent(url.pathname.slice('/api/providers/'.length,-'/health'.length));
    const job=createJob({providerId,operation:'provider-health-check',title:`Health check: ${providerId}`});return json(res,202,{job,state:readState()});
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/setup') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{
      state.settings.integrations=normalizeIntegrationSettings({...state.settings?.integrations,...(body.settings||{}),setupState:body.dismissed?'dismissed':'completed',completedAt:body.dismissed?state.settings?.integrations?.completedAt:new Date().toISOString(),dismissedAt:body.dismissed?new Date().toISOString():null});
      if(Array.isArray(body.providers))for(const change of body.providers){const provider=(state.providers||[]).find(item=>item.id===change.id);if(provider&&!provider.required&&change.enabled!==undefined){provider.enabled=Boolean(change.enabled);provider.status={...provider.status,state:provider.enabled?'connected':'disconnected'};provider.updatedAt=new Date().toISOString();}}
      addActivity(state,'provider',body.dismissed?'Integration setup dismissed.':'Integration setup completed.',{settings:state.settings.integrations});return state.settings.integrations;
    });return json(res,200,{settings:result,state});
  }

  if (req.method === 'GET' && url.pathname === '/api/marketplace/search') {
    const providerId=String(url.searchParams.get('providerId')||'poly-haven'),query=String(url.searchParams.get('q')||''),type=String(url.searchParams.get('type')||'all'),limit=Number(url.searchParams.get('limit')||30),offset=Number(url.searchParams.get('offset')||0);
    return json(res,200,await searchMarketplace({providerId,query,type,limit,offset}));
  }

  if (req.method === 'GET' && url.pathname === '/api/marketplace/details') {
    const providerId=String(url.searchParams.get('providerId')||''),assetId=String(url.searchParams.get('assetId')||'');if(!providerId||!assetId)throw new Error('Provider and asset IDs are required.');return json(res,200,{asset:await marketplaceDetails(providerId,assetId)});
  }

  if (req.method === 'POST' && url.pathname === '/api/marketplace/download') {
    const body=await readBody(req),asset=await marketplaceDetails(String(body.providerId||''),String(body.assetId||'')),choice=(asset.downloadChoices||[]).find(item=>item.id===body.choiceId)||(asset.downloadChoices||[])[0];if(!choice)throw new Error('This catalog item does not expose an automated download. Open its source page and import the downloaded files manually.');const prepared=prepareMarketplaceDownload({providerId:asset.providerId,asset,choice});const job=createJob({providerId:asset.providerId,operation:'marketplace-download',title:`Download ${asset.name}`,inputs:prepared,settings:{}});return json(res,202,{job,state:readState()});
  }

  if (req.method === 'POST' && url.pathname === '/api/marketplace/import-job') {
    const body=await readBody(req),stateBefore=readState(),job=(stateBefore.jobs||[]).find(item=>item.id===body.jobId);if(!job)throw new Error('Download job not found.');if(job.state!=='succeeded')throw new Error('The marketplace download must finish before import.');const download=inspectDownloadedJob(job),resolved=resolveMarketplaceImportFiles(job);let imported;
    if(resolved.modelFiles.length){const file=resolved.modelFiles[0],buffer=fs.readFileSync(file),record=importModelAsset({assetRoot:ASSET_ROOT,name:download.asset?.name||path.basename(file,path.extname(file)),fileName:path.basename(file),dataUrl:`data:${path.extname(file).toLowerCase()==='.glb'?'model/gltf-binary':'model/gltf+json'};base64,${buffer.toString('base64')}`,category:download.asset?.category||'static-prop',license:download.asset?.license||'Review required',creator:download.asset?.creator||download.providerId,source:download.asset?.sourcePage||`${download.providerId}:${download.asset?.id||''}`,tags:[...(download.asset?.tags||[]),download.providerId,'marketplace']});
      const payload=mutateState(state=>{const existing=state.assets.findIndex(item=>item.id===record.id);if(existing>=0)state.assets[existing]={...state.assets[existing],...record};else state.assets.unshift(record);upsertAssetRecipe(state,record);state.editor.selectedAssetId=record.id;const liveJob=(state.jobs||[]).find(item=>item.id===job.id);if(liveJob){liveJob.importedAssetId=record.id;liveJob.stage='Imported into asset library';}addActivity(state,'marketplace',`Imported marketplace model: ${record.name}`,{providerId:download.providerId,providerAssetId:download.asset?.id,assetId:record.id,jobId:job.id});return record;});imported=payload.result;return json(res,201,{asset:imported,kind:'model',state:payload.state});
    }
    if(Object.keys(resolved.maps).length){const material=createMaterialFromMarketplaceDownload({assetRoot:ASSET_ROOT,download}),payload=mutateState(state=>{state.assets.unshift(material);const recipe=normalizeSurfaceRecipe({id:`surface-recipe-${material.id.replace(/^material-/,'')}`,name:`${material.name} Surface`,baseMaterialId:material.id,tags:[...(material.tags||[]),'surface-recipe']});material.surfaceRecipeId=recipe.id;state.assets.push(recipe);state.editor.selectedMaterialId=material.id;const liveJob=(state.jobs||[]).find(item=>item.id===job.id);if(liveJob){liveJob.importedAssetId=material.id;liveJob.stage='Imported into material library';}addActivity(state,'marketplace',`Imported marketplace material: ${material.name}`,{providerId:download.providerId,providerAssetId:download.asset?.id,materialId:material.id,recipeId:recipe.id,jobId:job.id});return material;});imported=payload.result;return json(res,201,{asset:imported,kind:'material',state:payload.state});
    }
    throw new Error('The downloaded package does not contain a supported GLB, embedded glTF, or recognized PBR texture set. It remains safely staged for manual inspection.');
  }

  if (req.method === 'GET' && url.pathname === '/api/jobs') { const state=readState();return json(res,200,{jobs:state.jobs||[]}); }

  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const body=await readBody(req);const allowed=new Set(['diagnostic-delay','asset-index','project-integrity']);if(!allowed.has(body.operation))throw new Error('Unsupported manual job operation.');
    const job=createJob({providerId:body.providerId||'local-worker-host',operation:body.operation,title:body.title,settings:body.settings||{},inputs:body.inputs||{},prompt:body.prompt||''});return json(res,202,{job,state:readState()});
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/cancel')) {
    const jobId=decodeURIComponent(url.pathname.slice('/api/jobs/'.length,-'/cancel'.length));const job=cancelJob(jobId);return json(res,200,{job,state:readState()});
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/retry')) {
    const jobId=decodeURIComponent(url.pathname.slice('/api/jobs/'.length,-'/retry'.length));const job=retryJob(jobId);return json(res,202,{job,state:readState()});
  }

  if (req.method === 'DELETE' && url.pathname === '/api/jobs/completed') { clearCompletedJobs();return json(res,200,readState()); }
  if (req.method === 'GET' && url.pathname === '/api/search') return json(res, 200, searchState(readState(), url.searchParams.get('q')));
  if (req.method === 'GET' && url.pathname === '/api/workspace/files') return json(res, 200, listWorkspace(url.searchParams.get('path') || '.', Number(url.searchParams.get('limit') || 500)));

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, { projects:listProjects({ includeArchived:url.searchParams.get('archived')==='1' }), catalog:refreshProjectCatalog() });
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/create') {
    const body=await readBody(req);releaseActiveProjectLock();const state=createProject({name:body.name,template:body.template,id:body.id});acquireActiveProjectLock(state);
    addActivity(state,'project',`Created project: ${state.project.name}`);writeState(state);
    return json(res,201,{state,projects:listProjects()});
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/open') {
    const body=await readBody(req);await assertProjectUnlocked(body.projectId);releaseActiveProjectLock();const state=openProject(body.projectId);acquireActiveProjectLock(state);
    return json(res,200,{state,projects:listProjects()});
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/duplicate') {
    const body=await readBody(req);const state=duplicateProject(body.projectId,body.name);releaseActiveProjectLock();acquireActiveProjectLock(state);
    return json(res,201,{state,projects:listProjects()});
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/archive') {
    const body=await readBody(req);releaseActiveProjectLock();const state=archiveProject(body.projectId);acquireActiveProjectLock(state);
    return json(res,200,{state,projects:listProjects()});
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/import') {
    const body=await readBody(req);const state=importProject(body.sourcePath,{name:body.name});releaseActiveProjectLock();acquireActiveProjectLock(state);
    return json(res,201,{state,projects:listProjects()});
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/locate') {
    const body=await readBody(req);const state=locateProject(body.projectId,body.sourcePath);releaseActiveProjectLock();acquireActiveProjectLock(state);
    return json(res,200,{state,projects:listProjects()});
  }

  if (req.method === 'POST' && url.pathname === '/api/project') {
    const body=await readBody(req);const state=createProject({name:body.name,template:body.template,id:body.id});releaseActiveProjectLock();acquireActiveProjectLock(state);
    return json(res,201,state);
  }

  if (req.method === 'POST' && url.pathname === '/api/scene/save') {
    const body = await readBody(req);
    const incoming = sanitizeScene(body.scene);
    const { state } = mutateState(state => {
      const index = state.scenes.findIndex(scene => scene.id === incoming.id);
      if (index < 0) state.scenes.push(incoming); else state.scenes[index] = incoming;
      state.activeSceneId = incoming.id;
      if (body.selection) state.selection = body.selection;
      if (body.editor) state.editor = { ...state.editor, ...body.editor };
      addActivity(state, 'scene', `Saved scene ${incoming.name} with ${incoming.objects.length} objects.`);
    });
    return json(res, 200, state);
  }

  if (req.method === 'POST' && url.pathname === '/api/scene/new') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const scene = {
        id: body.id || `scene-${Date.now().toString(36)}`,
        name: String(body.name || 'New Scene').slice(0,100),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        settings: {
          skyTop: '#17243d', skyBottom: '#8ca6b8', ambientColor: '#b8c6d8', ambientIntensity: 0.34,
          gravity: -9.81, gridVisible: true, gridSize: 100, gridStep: 5, fogNear:90, fogFar:280, exposure:1
        },
        editorCamera: { position: [16,12,22], yaw: -2.5, pitch: -0.3, moveSpeed: 12, fastMultiplier: 3.5, fov: 62, lookSensitivity:.0023, invertHorizontal:false, invertVertical:false },
        objects: body.template === 'starter-3d' ? createDefaultState().scenes[0].objects : [
          createSceneObject('directionalLight', { id: 'sun-main', name: 'Sun', position:[0,15,0], rotation:[-45,35,0] })
        ]
      };
      state.scenes.push(scene);
      state.activeSceneId = scene.id;
      state.selection = { objectId: scene.objects[0]?.id || null };
      addActivity(state, 'scene', `Created scene: ${scene.name}`);
      return scene;
    });
    return json(res, 201, { scene: result, state });
  }

  if (req.method === 'POST' && url.pathname === '/api/scene/select') {
    const body = await readBody(req);
    const { state } = mutateState(state => {
      if (!state.scenes.some(scene => scene.id === body.sceneId)) throw new Error('Scene not found.');
      state.activeSceneId = body.sceneId;
      state.selection = { objectId: activeScene(state).objects[0]?.id || null };
      addActivity(state, 'scene', `Activated scene: ${activeScene(state).name}`);
    });
    return json(res, 200, state);
  }

  if (req.method === 'POST' && url.pathname === '/api/object') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const object = createSceneObject(body.type, body);
      activeScene(state).objects.push(object);
      state.selection.objectId = object.id;
      state.editor.lastFocusObjectId = object.id;
      addActivity(state, 'object', `Created ${object.type}: ${object.name}`);
      return object;
    });
    return json(res, 201, { object: result, state });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/object/')) {
    const objectId = decodeURIComponent(url.pathname.slice('/api/object/'.length));
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const object = findObject(state, objectId);
      if (!object) throw new Error('Object not found.');
      applyObjectPatch(object, body);
      state.selection.objectId = object.id;
      state.editor.lastFocusObjectId = object.id;
      addActivity(state, 'object', `Updated ${object.name}.`, { objectId });
      return object;
    });
    return json(res, 200, { object: result, state });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/object/')) {
    const objectId = decodeURIComponent(url.pathname.slice('/api/object/'.length));
    const { state } = mutateState(state => {
      const scene = activeScene(state);
      const object = scene.objects.find(item => item.id === objectId);
      if (!object) throw new Error('Object not found.');
      if (object.locked) throw new Error('Object is locked.');
      scene.objects = scene.objects.filter(item => item.id !== objectId && item.parentId !== objectId);
      state.selection.objectId = scene.objects[0]?.id || null;
      addActivity(state, 'object', `Deleted ${object.name}.`);
    });
    return json(res, 200, state);
  }

  if (req.method === 'POST' && url.pathname === '/api/object/duplicate') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const object = findObject(state, body.objectId);
      if (!object) throw new Error('Object not found.');
      const clone = structuredClone(object);
      clone.id = `${object.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      clone.name = `${object.name} Copy`;
      clone.transform.position = clone.transform.position.map((value,index) => value + (index === 0 ? 1.5 : 0));
      activeScene(state).objects.push(clone);
      state.selection.objectId = clone.id;
      addActivity(state, 'object', `Duplicated ${object.name}.`);
      return clone;
    });
    return json(res, 201, { object: result, state });
  }

  if (req.method === 'POST' && url.pathname === '/api/selection') {
    const body = await readBody(req);
    const { state } = mutateState(state => {
      if (body.objectId && !findObject(state, body.objectId)) throw new Error('Object not found.');
      state.selection.objectId = body.objectId || null;
      if (body.objectId) state.editor.lastFocusObjectId = body.objectId;
    });
    return json(res, 200, state);
  }

  if (req.method === 'POST' && url.pathname === '/api/editor') {
    const body = await readBody(req);
    const { state } = mutateState(state => {
      state.editor = { ...state.editor, ...body };
      if (body.camera) activeScene(state).editorCamera = { ...activeScene(state).editorCamera, ...body.camera };
    });
    return json(res, 200, state);
  }

  if (req.method === 'POST' && url.pathname === '/api/command') {
    const body = await readBody(req);
    const textValue = String(body.text || '').trim();
    if (!textValue) throw new Error('Command text is required.');
    const { state, result } = mutateState(state => {
      const command = {
        id: `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
        text: textValue,
        status: 'queued',
        priority: body.priority || 'normal',
        createdAt: new Date().toISOString(), claimedAt: null, completedAt: null,
        result: null
      };
      state.commands.unshift(command);
      addActivity(state, 'command', `Queued for Codex: ${textValue}`);
      return command;
    });
    return json(res, 201, { command: result, state });
  }


  if (req.method === 'GET' && url.pathname === '/api/assets') {
    const state=readState();for(const asset of state.assets.filter(item=>item.type==='model'))refreshSceneUsages(asset,state);
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase(),category=String(url.searchParams.get('category')||'').trim();
    const assets=state.assets.filter(item=>item.type==='model').filter(asset=>(!q||JSON.stringify(asset).toLowerCase().includes(q))&&(!category||asset.category===category));
    return json(res,200,{assets,categories:[...new Set(state.assets.filter(item=>item.type==='model').map(asset=>asset.category))],state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/import') {
    const body=await readBody(req);const record=importModelAsset({assetRoot:ASSET_ROOT,name:body.name,fileName:body.fileName,dataUrl:body.dataUrl,category:body.category,license:body.license,creator:body.creator,source:body.source,tags:body.tags});
    const {state,result}=mutateState(state=>{
      const duplicate=state.assets.find(item=>item.type==='model'&&item.checksum===record.checksum&&item.id!==record.id);
      if(duplicate){record.duplicateOf=duplicate.id;record.validation.warnings=[...(record.validation.warnings||[]),`Duplicate content matches ${duplicate.name}.`];record.validation.state=record.validation.state==='failed'?'failed':'warning';}
      const index=state.assets.findIndex(item=>item.id===record.id);let stored;if(index>=0){state.assets[index]={...state.assets[index],...record};stored=state.assets[index];}else{state.assets.unshift(record);stored=record;}
      const recipe=upsertAssetRecipe(state,stored);state.editor.selectedAssetId=stored.id;state.editor.assetView='library';addActivity(state,'asset',`Imported 3D asset: ${stored.name}`,{assetId:stored.id,assetRecipeId:recipe?.id,validation:stored.validation,checksum:stored.checksum});return stored;
    });
    return json(res,201,{asset:result,state});
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/asset/')) {
    const assetId=decodeURIComponent(url.pathname.slice('/api/asset/'.length));const state=readState(),asset=state.assets.find(item=>item.id===assetId&&item.type==='model');if(!asset)throw new Error('3D asset not found.');refreshSceneUsages(asset,state);const recipe=state.assets.find(item=>item.type==='assetRecipe'&&item.id===asset.assetRecipeId)||syncAssetRecipe(asset);return json(res,200,{asset,recipe,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/rebuild') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!asset)throw new Error('Asset not found.');rebuildCanonicalAsset({assetRoot:ASSET_ROOT,asset});const recipe=upsertAssetRecipe(state,asset);state.editor.selectedAssetId=asset.id;addActivity(state,'asset',`Rebuilt canonical import: ${asset.name}`,{assetId:asset.id,assetRecipeId:recipe?.id,importerVersion:asset.canonicalImporterVersion,nodeTransformsApplied:asset.health?.nodeTransformsApplied,meshInstanceCount:asset.health?.meshInstanceCount});return asset;});return json(res,200,{asset:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/repair') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const source=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!source)throw new Error('Source asset not found.');const derivative=createSafeRepairDerivative({assetRoot:ASSET_ROOT,source,settings:body.settings||{}});source.derivativeAssetIds=[...(source.derivativeAssetIds||[]),derivative.id];state.assets.unshift(derivative);const recipe=upsertAssetRecipe(state,derivative);upsertAssetRecipe(state,source);state.editor.selectedAssetId=derivative.id;addActivity(state,'asset',`Created safe repair derivative: ${derivative.name}`,{assetId:derivative.id,assetRecipeId:recipe?.id,sourceAssetId:source.id});return derivative;});return json(res,201,{asset:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/collision') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!asset)throw new Error('Asset not found.');asset.collision=generateCollision(asset);asset.collisionStatus='generated';asset.updatedAt=new Date().toISOString();const recipe=upsertAssetRecipe(state,asset);addActivity(state,'asset',`Generated bounds collision: ${asset.name}`,{assetId:asset.id,assetRecipeId:recipe?.id,collision:asset.collision});return asset;});return json(res,200,{asset:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/lods') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!asset)throw new Error('Asset not found.');asset.lods=generateLodsForAsset({assetRoot:ASSET_ROOT,asset,ratios:Array.isArray(body.ratios)?body.ratios:[.5,.2]});asset.updatedAt=new Date().toISOString();const recipe=upsertAssetRecipe(state,asset);addActivity(state,'asset',`Generated ${asset.lods.length} LOD derivatives: ${asset.name}`,{assetId:asset.id,assetRecipeId:recipe?.id,lods:asset.lods});return asset;});return json(res,200,{asset:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/approve') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!asset)throw new Error('Asset not found.');if(asset.validation?.state==='failed'||!asset.canonicalFile)throw new Error('Blocking validation failures must be resolved before approval.');asset.approvalState=body.approved===false?'draft':'approved';asset.status=asset.approvalState==='approved'?'validated':asset.status;asset.updatedAt=new Date().toISOString();const recipe=upsertAssetRecipe(state,asset);addActivity(state,'asset',`${asset.approvalState==='approved'?'Approved':'Returned to draft'} asset: ${asset.name}`,{assetId:asset.id,assetRecipeId:recipe?.id});return asset;});return json(res,200,{asset:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/place-preview') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!asset||!asset.canonicalFile)throw new Error('A canonical model asset is required for placement.');const transactionId=`asset-preview-${Date.now().toString(36)}`,object=modelObjectFromAsset(asset,{...body,scene:activeScene(state),previewOnly:true,previewTransactionId:transactionId});activeScene(state).objects.push(object);state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'asset',`Previewed asset placement: ${asset.name}`,{assetId:asset.id,objectId:object.id,transactionId});return {asset,object,transactionId};});return json(res,201,{...result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/commit-preview') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const object=findObject(state,body.objectId);if(!object||object.type!=='model'||!object.properties?.previewOnly)throw new Error('Asset preview object not found.');object.properties.previewOnly=false;object.properties.previewTransactionId=null;const asset=state.assets.find(item=>item.id===object.properties.assetId&&item.type==='model');if(asset){refreshSceneUsages(asset,state);upsertAssetRecipe(state,asset);}addActivity(state,'asset',`Committed asset placement: ${object.name}`,{objectId:object.id,assetId:object.properties.assetId});return object;});return json(res,200,{object:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/cancel-preview') {
    const body=await readBody(req);const {state}=mutateState(state=>{const scene=activeScene(state),object=scene.objects.find(item=>item.id===body.objectId&&item.type==='model'&&item.properties?.previewOnly);if(!object)throw new Error('Asset preview object not found.');scene.objects=scene.objects.filter(item=>item.id!==object.id);state.selection.objectId=scene.objects[0]?.id||null;addActivity(state,'asset',`Cancelled asset placement preview: ${object.name}`,{objectId:object.id});});return json(res,200,state);
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/place') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===body.assetId&&item.type==='model');if(!asset||!asset.canonicalFile)throw new Error('A canonical model asset is required for placement.');if(asset.approvalState!=='approved'&&body.allowDraft!==true)throw new Error('Approve the asset or explicitly place it as a draft preview.');const object=modelObjectFromAsset(asset,{...body,scene:activeScene(state),previewOnly:false});activeScene(state).objects.push(object);state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;refreshSceneUsages(asset,state);upsertAssetRecipe(state,asset);addActivity(state,'asset',`Placed asset: ${asset.name}`,{assetId:asset.id,objectId:object.id});return object;});return json(res,201,{object:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/asset/thumbnail') {
    const body=await readBody(req),assetId=String(body.assetId||''),capture=savePngDataUrl(body.dataUrl,'asset-thumbnail',{assetId});const {state,result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===assetId&&item.type==='model');if(!asset)throw new Error('Asset not found.');asset.thumbnail=capture.file;asset.preview=capture.file;asset.updatedAt=new Date().toISOString();upsertAssetRecipe(state,asset);addActivity(state,'asset',`Captured asset thumbnail: ${asset.name}`,{assetId:asset.id,file:capture.file});return asset;});return json(res,201,{asset:result,capture,state});
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/surface-recipe/')) {
    const recipeId=decodeURIComponent(url.pathname.slice('/api/surface-recipe/'.length));
    const body=await readBody(req);
    const {state,result}=mutateState(state=>{
      const index=state.assets.findIndex(item=>item.id===recipeId&&item.type==='surfaceRecipe');
      if(index<0)throw new Error('Surface recipe not found.');
      const existing=state.assets[index];
      const next=normalizeSurfaceRecipe({...existing,...body,id:existing.id,type:'surfaceRecipe',protected:existing.protected,createdAt:existing.createdAt},existing);
      if(!state.assets.some(item=>item.id===next.baseMaterialId&&item.type==='material'))throw new Error('Surface recipe base material is missing.');
      next.compilation=compileSurfaceRecipe(next);state.assets[index]=next;
      addActivity(state,'surface',`Updated surface recipe: ${next.name}`,{recipeId:next.id,baseMaterialId:next.baseMaterialId,validation:next.validation});
      return next;
    });
    return json(res,200,{recipe:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/surface-recipe/variant') {
    const body=await readBody(req);
    const {state,result}=mutateState(state=>{
      const source=state.assets.find(item=>item.id===body.recipeId&&item.type==='surfaceRecipe');
      if(!source)throw new Error('Surface recipe not found.');
      const variant=normalizeSurfaceRecipe({...source,...body,id:`surface-recipe-${slugify(body.name||`${source.name}-variant`,'surface')}-${Date.now().toString(36)}`,name:body.name||`${source.name} Variant`,sourceRecipeId:source.id,protected:false,createdAt:new Date().toISOString()},source);
      state.assets.unshift(variant);
      if(body.assignMaterialId){const material=state.assets.find(item=>item.id===body.assignMaterialId&&item.type==='material');if(!material)throw new Error('Assigned material not found.');if(material.id!==variant.baseMaterialId)throw new Error('Surface recipe variant belongs to a different material.');material.surfaceRecipeId=variant.id;}
      addActivity(state,'surface',`Created surface recipe variant: ${variant.name}`,{recipeId:variant.id,sourceRecipeId:source.id,assignedMaterialId:body.assignMaterialId||null});
      return variant;
    });
    return json(res,201,{recipe:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/material') {
    const body = await readBody(req);
    const asset = createMaterialAsset(body);
    const { state } = mutateState(state => {
      const recipe=normalizeSurfaceRecipe({id:`surface-recipe-${slugify(asset.name,'surface')}-${Date.now().toString(36)}`,name:`${asset.name} Surface`,baseMaterialId:asset.id,layers:{colorVariation:.15,detailAmount:1},tags:[asset.category,'generated']});
      recipe.compilation=compileSurfaceRecipe(recipe);asset.surfaceRecipeId=recipe.id;
      state.assets = state.assets.filter(item => item.id !== asset.id);
      state.assets.unshift(recipe);
      state.assets.unshift(asset);
      addActivity(state, 'asset', `Created material and surface recipe: ${asset.name}`, { assetId: asset.id, recipeId:recipe.id, maps: Object.keys(asset.maps) });
    });
    return json(res, 201, { asset, state });
  }


  if (req.method === 'POST' && url.pathname === '/api/material/derivative') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const created=createMaterialDerivative(state,body);state.editor.selectedMaterialId=created.material.id;addActivity(state,'surface',`Created processed material derivative: ${created.material.name}`,{materialId:created.material.id,sourceMaterialId:created.material.sourceAssetId,operation:created.material.derivativeOperation,recipeId:created.recipe.id});return created;});return json(res,201,{...result,state});
  }

  if (req.method === 'POST' && /^\/api\/surface-recipe\/[^/]+\/compile$/.test(url.pathname)) {
    const recipeId=decodeURIComponent(url.pathname.split('/')[3]);const {state,result}=mutateState(state=>{const recipe=state.assets.find(item=>item.id===recipeId&&item.type==='surfaceRecipe');if(!recipe)throw new Error('Surface recipe not found.');recipe.compilation=compileSurfaceRecipe(recipe);recipe.updatedAt=new Date().toISOString();addActivity(state,'surface',`Compiled surface recipe: ${recipe.name}`,{recipeId:recipe.id,compilation:recipe.compilation});return recipe;});return json(res,200,{recipe:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/decal') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const material=state.assets.find(item=>item.id===body.materialId&&item.type==='material');if(!material)throw new Error('A registered material is required for the decal.');const recipe=normalizeDecalRecipe({...body,id:body.id||`decal-${slugify(body.name||material.name,'decal')}-${Date.now().toString(36)}`,materialId:material.id,provenance:{source:body.source||material.source,license:body.license||material.license}});state.assets.unshift(recipe);addActivity(state,'decal',`Created decal recipe: ${recipe.name}`,{decalId:recipe.id,materialId:material.id,validation:recipe.validation});return recipe;});return json(res,201,{decal:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/decal/place') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const recipe=state.assets.find(item=>item.id===body.decalId&&item.type==='decalRecipe');if(!recipe)throw new Error('Decal recipe not found.');const material=state.assets.find(item=>item.id===recipe.materialId&&item.type==='material');if(!material)throw new Error('Decal material not found.');const object=decalObjectFromRecipe(recipe,material,body);activeScene(state).objects.push(object);state.selection.objectId=object.id;addActivity(state,'decal',`Placed decal: ${recipe.name}`,{decalId:recipe.id,objectId:object.id,materialId:material.id});return object;});return json(res,201,{object:result,state});
  }

  if (req.method === 'POST' && url.pathname === '/api/atlas') {
    const body=await readBody(req);const {state,result}=mutateState(state=>{const sources=(body.materialIds||[]).map(id=>state.assets.find(item=>item.id===id&&item.type==='material')).filter(Boolean);if(!sources.length)throw new Error('Select at least one material for the atlas.');const columns=Math.ceil(Math.sqrt(sources.length)),rows=Math.ceil(sources.length/columns);const entries=sources.map((asset,index)=>({id:`entry-${index+1}`,assetId:asset.id,label:asset.name,rect:[(index%columns)/columns,Math.floor(index/columns)/rows,1/columns,1/rows]}));const atlas=normalizeAtlasRecipe({...body,id:body.id||`${body.kind==='trim-sheet'?'trim':'atlas'}-${slugify(body.name||'surface-library','atlas')}-${Date.now().toString(36)}`,entries});state.assets.unshift(atlas);addActivity(state,'surface',`Created ${atlas.kind}: ${atlas.name}`,{atlasId:atlas.id,entries:atlas.entries.length,occupancy:atlas.occupancy});return atlas;});return json(res,201,{atlas:result,state});
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/material/')) {
    const assetId = decodeURIComponent(url.pathname.slice('/api/material/'.length));
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const asset = state.assets.find(item => item.id === assetId && item.type === 'material');
      if (!asset) throw new Error('Material not found.');
      if (body.name !== undefined) asset.name = String(body.name || asset.name).trim().slice(0,120) || asset.name;
      if (body.category !== undefined) asset.category = String(body.category || asset.category).trim().slice(0,50) || asset.category;
      if (body.license !== undefined) asset.license = String(body.license || asset.license).trim().slice(0,200) || asset.license;
      if (Array.isArray(body.tags)) asset.tags = body.tags.map(value=>String(value).slice(0,40)).slice(0,30);
      if (body.surfaceRecipeId !== undefined) {
        const recipe=state.assets.find(item=>item.id===body.surfaceRecipeId&&item.type==='surfaceRecipe');
        if(!recipe)throw new Error('Surface recipe not found.');
        if(recipe.baseMaterialId!==asset.id)throw new Error('Surface recipe does not belong to this material.');
        asset.surfaceRecipeId=recipe.id;
      }
      if (body.settings) asset.settings = normalizeMaterialSettings(body.settings, asset.settings || {});
      asset.updatedAt = new Date().toISOString();
      addActivity(state, 'asset', `Updated material settings: ${asset.name}`, { assetId: asset.id, settings: asset.settings });
      return asset;
    });
    return json(res, 200, { asset: result, state });
  }

  if (req.method === 'POST' && url.pathname === '/api/material/variant') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const source = state.assets.find(item => item.id === body.materialId && item.type === 'material');
      if (!source) throw new Error('Source material not found.');
      const variant = structuredClone(source);
      variant.id = `material-${slugify(body.name || `${source.name}-variant`, 'variant')}-${Date.now().toString(36)}`;
      variant.name = String(body.name || `${source.name} Variant`).slice(0,120);
      variant.sourceAssetId = source.id;
      variant.instanceOf = source.id;
      variant.sharedMaps = true;
      variant.source = `Material instance of ${source.name}`;
      variant.protected = false;
      variant.createdAt = new Date().toISOString();
      variant.updatedAt = variant.createdAt;
      variant.settings = normalizeMaterialSettings(body.settings || {}, source.settings || {});
      state.assets.unshift(variant);
      addActivity(state, 'asset', `Created material instance: ${variant.name}`, { assetId: variant.id, sourceAssetId: source.id });
      return variant;
    });
    return json(res, 201, { asset: result, state });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/material/')) {
    const assetId = decodeURIComponent(url.pathname.slice('/api/material/'.length));
    const { state } = mutateState(state => {
      const asset = state.assets.find(item => item.id === assetId && item.type === 'material');
      if (!asset) throw new Error('Material not found.');
      if (asset.protected) throw new Error('This starter material is protected. Duplicate or generate a replacement instead.');
      state.assets = state.assets.filter(item => item.id !== assetId);
      for (const scene of state.scenes) for (const object of scene.objects) if (object.properties?.materialId === assetId) object.properties.materialId = null;
      fs.rmSync(path.join(ASSET_ROOT, 'materials', assetId), { recursive:true, force:true });
      addActivity(state, 'asset', `Deleted material: ${asset.name}`);
    });
    return json(res, 200, state);
  }

  if (req.method === 'POST' && url.pathname === '/api/material/apply') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const asset = state.assets.find(item => item.id === body.materialId && item.type === 'material');
      if (!asset) throw new Error('Material not found.');
      const object = findObject(state, body.objectId);
      if (!object) throw new Error('Object not found.');
      object.properties = { ...(object.properties || {}), materialId: asset.id };
      state.selection.objectId = object.id;
      addActivity(state, 'asset', `Applied ${asset.name} to ${object.name}.`, { assetId:asset.id, objectId:object.id });
      return { asset, object };
    });
    return json(res, 200, { ...result, state });
  }

  if (req.method === 'POST' && url.pathname === '/api/prefab') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const object = findObject(state, body.objectId);
      if (!object) throw new Error('Object not found.');
      const prefab = { id:body.id || `prefab-${slugify(body.name || object.name)}-${Date.now().toString(36)}`, name:String(body.name || object.name).slice(0,120), sourceObjectId:object.id, object:structuredClone(object), createdAt:new Date().toISOString() };
      state.prefabs = state.prefabs.filter(item=>item.id!==prefab.id);
      state.prefabs.unshift(prefab);
      addActivity(state,'prefab',`Created prefab: ${prefab.name}`);
      return prefab;
    });
    return json(res,201,{ prefab:result,state });
  }

  if (req.method === 'POST' && url.pathname === '/api/prefab/instantiate') {
    const body = await readBody(req);
    const { state, result } = mutateState(state => {
      const prefab = state.prefabs.find(item=>item.id===body.prefabId);
      if (!prefab) throw new Error('Prefab not found.');
      const object=structuredClone(prefab.object);
      object.id=`${object.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      object.name=body.name || prefab.name;
      if (Array.isArray(body.position)) object.transform.position=body.position.map(Number);
      object.properties={...(object.properties||{}),prefabId:prefab.id};
      activeScene(state).objects.push(object);state.selection.objectId=object.id;addActivity(state,'prefab',`Instantiated prefab: ${prefab.name}`);return object;
    });
    return json(res,201,{ object:result,state });
  }

  if (req.method === 'POST' && url.pathname === '/api/capture') {
    const body = await readBody(req);
    const capture = savePngDataUrl(body.dataUrl, body.kind || 'viewport', body.metadata || {});
    const { state, result } = mutateState(state => {
      const evidence = {
        id: `evidence-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
        type: body.kind || 'viewport', title: body.title || '3D viewport capture', status: 'captured',
        file: capture.file, bytes: capture.bytes, metadata: capture.metadata, createdAt: new Date().toISOString()
      };
      state.evidence.unshift(evidence);
      if ((body.kind || 'viewport') === 'viewport') state.project.thumbnail = capture.file;
      addActivity(state, 'evidence', `Captured ${evidence.title}.`);
      return evidence;
    });
    return json(res, 201, { capture, evidence: result, state });
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    const current=readState();const reset=createDefaultState({name:current.project.name,id:current.project.id,template:current.project.template,root:current.project.root,createdAt:current.project.createdAt});
    writeState(reset, false);
    return json(res, 200, reset);
  }

  if (req.method === 'POST' && url.pathname === '/api/open-folder') {
    const body = await readBody(req);
    const current=readState();
    const folder = body.projectRoot ? current.project.root : body.path ? safeWorkspacePath(body.path) : WORKSPACE_ROOT;
    if (process.platform === 'win32') spawn('explorer.exe', [folder], { detached:true, stdio:'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [folder], { detached:true, stdio:'ignore' }).unref();
    else spawn('xdg-open', [folder], { detached:true, stdio:'ignore' }).unref();
    return json(res, 200, { opened: folder });
  }

  return json(res, 404, { error: 'API route not found.' });
}

function serveStatic(req, res, url) {
  let filePath;
  let allowedRoot;
  if (url.pathname.startsWith('/captures/')) {
    filePath = path.join(RUNTIME_ROOT, decodeURIComponent(url.pathname.slice(1)));
    allowedRoot = path.join(RUNTIME_ROOT, 'captures');
  } else if (url.pathname.startsWith('/assets/')) {
    filePath = path.join(RUNTIME_ROOT, decodeURIComponent(url.pathname.slice(1)));
    allowedRoot = ASSET_ROOT;
  } else {
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    filePath = path.join(appDir, requested);
    allowedRoot = appDir;
  }
  if (!path.resolve(filePath).startsWith(path.resolve(allowedRoot))) return text(res, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return text(res, 404, 'Not found');
  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { 'content-type': mime[ext] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${port}`}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (error) {
    try{mutateState(state=>{recordError(state,error.message,{path:req.url,method:req.method});});}catch{}
    json(res, 500, { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
});

initializeJobManager();
await assertProjectUnlocked(readState().project.id);
server.listen(port, host, () => {
  acquireActiveProjectLock(readState());
  console.log(`OmniForge 0.9.0 running at http://${host}:${port}`);
  console.log('Press Ctrl+C to stop.');
});

function shutdown(signal='shutdown'){
  shutdownJobs();
  releaseActiveProjectLock();
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),1200).unref();
}
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('exit',releaseActiveProjectLock);
