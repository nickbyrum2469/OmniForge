import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { syncAssetRecipe } from './asset-pipeline.mjs';
import { starterProviders, normalizeProviders, normalizeJobs, normalizeIntegrationSettings } from './provider-framework.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const RUNTIME_ROOT = path.resolve(process.env.OMNIFORGE_DATA_ROOT || ROOT);
export const DATA_FILE = path.join(RUNTIME_ROOT, 'data', 'engine-state.json');
export const BACKUP_FILE = path.join(RUNTIME_ROOT, 'data', 'engine-state.backup.json');
export const CATALOG_FILE = path.join(RUNTIME_ROOT, 'data', 'project-catalog.json');
export const WORKSPACE_ROOT = path.join(RUNTIME_ROOT, 'workspace', 'projects');
export const ARCHIVE_ROOT = path.join(RUNTIME_ROOT, 'workspace', 'archive');
export const ASSET_ROOT = path.join(RUNTIME_ROOT, 'assets');
export const BUNDLED_ASSET_ROOT = path.join(ROOT, 'assets');
export const SESSION_TOKEN = process.env.OMNIFORGE_SESSION_TOKEN || `dev-${process.pid}`;
export const RUNTIME_PORT = Number(process.env.OMNIFORGE_PORT || 4177);

const now = () => new Date().toISOString();
const id = prefix => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const slugify = (value, fallback='project') => String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || fallback;

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function safeReadJson(file, fallback=null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function copyDirectory(source, destination, options={}) {
  const excluded = new Set(options.excluded || ['.git','node_modules','dist','build','.desktop-cache','captures','logs']);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to, options);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function copyBundledAssets() {
  if (path.resolve(ASSET_ROOT) === path.resolve(BUNDLED_ASSET_ROOT)) return;
  if (!fs.existsSync(BUNDLED_ASSET_ROOT)) return;
  fs.mkdirSync(ASSET_ROOT, { recursive: true });
  copyDirectory(BUNDLED_ASSET_ROOT, ASSET_ROOT, { excluded: [] });
}

function baseObject(type, name, position=[0,0,0], options={}) {
  return {
    id: options.id || id(type),
    name,
    type,
    parentId: options.parentId || null,
    visible: options.visible !== false,
    locked: Boolean(options.locked),
    transform: {
      position: [...position],
      rotation: options.rotation ? [...options.rotation] : [0,0,0],
      scale: options.scale ? [...options.scale] : [1,1,1]
    },
    components: options.components || [],
    properties: options.properties || {}
  };
}

export function normalizeMaterialSettings(settings={}, fallback={}) {
  const merged = { ...fallback, ...settings };
  const offset = Array.isArray(merged.uvOffset) ? merged.uvOffset : [0,0];
  const finite = (value, defaultValue) => Number.isFinite(Number(value)) ? Number(value) : defaultValue;
  const clampValue = (value, min, max, defaultValue) => Math.max(min, Math.min(max, finite(value, defaultValue)));
  return {
    worldScale: clampValue(merged.worldScale, 0.05, 100, 3),
    uvRotation: clampValue(merged.uvRotation, -3600, 3600, 0),
    uvOffset: [clampValue(offset[0], -1000, 1000, 0), clampValue(offset[1], -1000, 1000, 0)],
    roughness: clampValue(merged.roughness, 0, 1, 0.8),
    roughnessMultiplier: clampValue(merged.roughnessMultiplier, 0.1, 2, 1),
    metallic: clampValue(merged.metallic, 0, 1, 0),
    normalStrength: clampValue(merged.normalStrength, 0, 4, 1),
    aoStrength: clampValue(merged.aoStrength, 0, 2, 1),
    heightStrength: clampValue(merged.heightStrength, 0, 0.25, 0.035)
  };
}


export function normalizeSurfaceRecipe(recipe={}, fallback={}) {
  const merged={...fallback,...recipe};
  const layers={...(fallback.layers||{}),...(recipe.layers||{})};
  const masks={...(fallback.masks||{}),...(recipe.masks||{})};
  const layerColors={...(fallback.layerColors||{}),...(recipe.layerColors||{})};
  const advanced={...(fallback.advanced||{}),...(recipe.advanced||{})};
  const graph={...(fallback.graph||{}),...(recipe.graph||{})};
  const clampValue=(value,min,max,defaultValue)=>{const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:defaultValue));};
  const hex=(value,defaultValue)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():defaultValue;
  const normalizeNodes=(nodes)=>Array.isArray(nodes)?nodes.slice(0,64).map((node,index)=>({
    id:String(node?.id||`node-${index+1}`).slice(0,80),
    type:String(node?.type||'constant').slice(0,40),
    label:String(node?.label||node?.type||`Node ${index+1}`).slice(0,80),
    enabled:node?.enabled!==false,
    value:clampValue(node?.value,0,2,1),
    params:node?.params&&typeof node.params==='object'?structuredClone(node.params):{}
  })):[];
  const defaultNodes=[
    {id:'node-base',type:'base-material',label:'Base Material',enabled:true,value:1,params:{}},
    {id:'node-slope',type:'slope-mask',label:'Slope Mask',enabled:true,value:Number(masks.slope??.35),params:{}},
    {id:'node-cavity',type:'cavity-mask',label:'Cavity Mask',enabled:true,value:Number(masks.cavities??.65),params:{}},
    {id:'node-weather',type:'weather-state',label:'Weather State',enabled:true,value:1,params:{}},
    {id:'node-output',type:'surface-output',label:'Surface Output',enabled:true,value:1,params:{}}
  ];
  const nodes=normalizeNodes(graph.nodes?.length?graph.nodes:defaultNodes);
  const nodeIds=new Set(nodes.map(node=>node.id));
  const edges=Array.isArray(graph.edges)?graph.edges.slice(0,128).map(edge=>({from:String(edge?.from||''),to:String(edge?.to||'')})).filter(edge=>nodeIds.has(edge.from)&&nodeIds.has(edge.to)):[];
  const normalized={
    id:String(merged.id||''),type:'surfaceRecipe',schemaVersion:2,name:String(merged.name||'Surface Recipe').slice(0,120),
    baseMaterialId:String(merged.baseMaterialId||''),sourceRecipeId:merged.sourceRecipeId?String(merged.sourceRecipeId):null,
    layers:{
      dirt:clampValue(layers.dirt,0,1,0),moss:clampValue(layers.moss,0,1,0),wetness:clampValue(layers.wetness,0,1,0),snow:clampValue(layers.snow,0,1,0),
      damage:clampValue(layers.damage,0,1,0),colorVariation:clampValue(layers.colorVariation,0,1,.15),roughnessVariation:clampValue(layers.roughnessVariation,0,1,.12),detailAmount:clampValue(layers.detailAmount,0,2,1),detailScale:clampValue(layers.detailScale,.05,100,4)
    },
    layerColors:{
      dirt:hex(layerColors.dirt,'#4b2c18'),moss:hex(layerColors.moss,'#245b29'),snow:hex(layerColors.snow,'#dbe7f0'),damage:hex(layerColors.damage,'#17100d')
    },
    masks:{
      upwardFacing:clampValue(masks.upwardFacing,0,1,1),downwardFacing:clampValue(masks.downwardFacing,0,1,0),slope:clampValue(masks.slope,0,1,.35),cavities:clampValue(masks.cavities,0,1,.65),
      convexEdges:clampValue(masks.convexEdges,0,1,.15),groundContact:clampValue(masks.groundContact,0,1,.35),waterContact:clampValue(masks.waterContact,0,1,0),sunExposure:clampValue(masks.sunExposure,0,1,.25),shade:clampValue(masks.shade,0,1,.55),
      windFacing:clampValue(masks.windFacing,0,1,0),distanceFromPaths:clampValue(masks.distanceFromPaths,0,1,0),distanceFromStructures:clampValue(masks.distanceFromStructures,0,1,0),terrainLayer:clampValue(masks.terrainLayer,0,1,0),vertexPaint:clampValue(masks.vertexPaint,0,1,0),authoredMask:clampValue(masks.authoredMask,0,1,0)
    },
    advanced:{
      projection:['world','triplanar','uv0','uv1'].includes(advanced.projection)?advanced.projection:'world',
      macroScale:clampValue(advanced.macroScale,.1,500,24),detailScale:clampValue(advanced.detailScale,.05,100,4),
      blendSharpness:clampValue(advanced.blendSharpness,.05,8,1),parallaxSteps:Math.round(clampValue(advanced.parallaxSteps,0,32,8)),
      layerOrder:Array.isArray(advanced.layerOrder)?advanced.layerOrder.filter(v=>['dirt','moss','wetness','snow','damage'].includes(v)).slice(0,5):['dirt','moss','wetness','snow','damage']
    },
    graph:{version:1,nodes,edges,outputNodeId:nodeIds.has(graph.outputNodeId)?graph.outputNodeId:'node-output'},
    weatherResponse:{wetness:clampValue(merged.weatherResponse?.wetness,0,2,1),snow:clampValue(merged.weatherResponse?.snow,0,2,1),frost:clampValue(merged.weatherResponse?.frost,0,2,0),drought:clampValue(merged.weatherResponse?.drought,0,2,0)},
    tags:Array.isArray(merged.tags)?merged.tags.map(v=>String(v).slice(0,40)).slice(0,30):[],
    protected:Boolean(merged.protected),createdAt:merged.createdAt||now(),updatedAt:now(),compilation:merged.compilation&&typeof merged.compilation==='object'?structuredClone(merged.compilation):null
  };
  const warnings=[];
  const errors=[];
  if(!normalized.id)errors.push('A stable recipe ID is required.');
  if(!normalized.baseMaterialId)errors.push('A base material is required.');
  if(normalized.layers.wetness>.8&&normalized.layers.snow>.8)warnings.push('Very high wetness and snow may flatten surface contrast.');
  if(normalized.layers.detailAmount>1.6)warnings.push('High detail strength may shimmer at distance.');
  if(normalized.advanced.projection==='triplanar'&&normalized.advanced.blendSharpness>5)warnings.push('Very sharp triplanar blending may reveal projection seams.');
  if(!nodes.some(node=>node.type==='surface-output'&&node.enabled))errors.push('The material graph requires an enabled Surface Output node.');
  normalized.validation={state:errors.length?'failed':warnings.length?'warning':'valid',errors,warnings,checkedAt:now()};
  return normalized;
}

export function compileSurfaceRecipe(recipe={}) {
  const normalized=normalizeSurfaceRecipe(recipe,recipe);
  const payload={schemaVersion:normalized.schemaVersion,baseMaterialId:normalized.baseMaterialId,layers:normalized.layers,layerColors:normalized.layerColors,masks:normalized.masks,advanced:normalized.advanced,graph:normalized.graph,weatherResponse:normalized.weatherResponse};
  const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const activeLayers=Object.entries(normalized.layers||{}).filter(([key,value])=>!['detailScale'].includes(key)&&Math.abs(Number(value)||0)>.001).map(([key])=>key);
  const activeMasks=Object.entries(normalized.masks||{}).filter(([,value])=>Math.abs(Number(value)||0)>.001).map(([key])=>key);
  const graphNodes=normalized.graph?.nodes?.length||0;
  const projectionCost=normalized.advanced?.projection==='triplanar'?3:normalized.advanced?.projection==='world'?1.25:1;
  const estimatedTextureSamples=Math.round((5+activeLayers.length*.5+activeMasks.length*.15+graphNodes*.25)*projectionCost);
  const estimatedAlu=Math.round(32+activeLayers.length*6+activeMasks.length*4+graphNodes*5+(normalized.advanced?.parallaxSteps||0));
  const lowEndWarnings=[];
  if(estimatedTextureSamples>24)lowEndWarnings.push('High texture-sampling cost for GTX 1650-class hardware. Consider a material instance with fewer active layers or UV/world projection instead of triplanar.');
  if(estimatedAlu>180)lowEndWarnings.push('High shader arithmetic cost. Reduce graph nodes, masks, or parallax steps for the low-end profile.');
  if((normalized.advanced?.parallaxSteps||0)>12)lowEndWarnings.push('Parallax steps above 12 should be disabled or reduced in the GTX 1650 profile.');
  return {
    state:normalized.validation.state==='failed'?'failed':'ready',hash,key:`surface-${hash.slice(0,16)}`,rendererVersion:'surface-runtime-2',compiledAt:now(),warnings:[...(normalized.validation.warnings||[]),...lowEndWarnings],errors:[...(normalized.validation.errors||[])],
    cost:{estimatedTextureSamples,estimatedAlu,activeLayers,activeMasks,graphNodes,projection:normalized.advanced?.projection||'world',lowEndWarnings,profileHints:{gtx1650:{recommendedTextureSamples:24,recommendedAlu:180,parallaxSteps:Math.min(8,normalized.advanced?.parallaxSteps||0),allowTriplanar:estimatedTextureSamples<=18}}}
  };
}

export function normalizeDecalRecipe(decal={},fallback={}) {
  const merged={...fallback,...decal};
  const clampValue=(value,min,max,defaultValue)=>{const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:defaultValue));};
  const channels={...(fallback.channels||{}),...(decal.channels||{})};
  const warnings=[];const errors=[];
  const normalized={
    id:String(merged.id||''),type:'decalRecipe',schemaVersion:1,name:String(merged.name||'Decal').slice(0,120),materialId:String(merged.materialId||''),sourceDecalId:merged.sourceDecalId?String(merged.sourceDecalId):null,
    category:String(merged.category||'dirt').slice(0,40),channels:{baseColor:channels.baseColor!==false,normal:Boolean(channels.normal),roughness:Boolean(channels.roughness),metallic:Boolean(channels.metallic),ao:Boolean(channels.ao),height:Boolean(channels.height),opacity:channels.opacity!==false},
    projection:{depth:clampValue(merged.projection?.depth,.001,20,.25),angle:clampValue(merged.projection?.angle,0,180,90),surfaceLimit:clampValue(merged.projection?.surfaceLimit,0,1,.8)},
    sortOrder:Math.round(clampValue(merged.sortOrder,-1000,1000,0)),fadeDistance:clampValue(merged.fadeDistance,.1,500,80),opacity:clampValue(merged.opacity,0,1,.85),batchingCompatible:merged.batchingCompatible!==false,
    provenance:{source:String(merged.provenance?.source||'OmniForge authored decal').slice(0,240),license:String(merged.provenance?.license||'Project use').slice(0,200)},
    tags:Array.isArray(merged.tags)?merged.tags.map(v=>String(v).slice(0,40)).slice(0,30):[],protected:Boolean(merged.protected),createdAt:merged.createdAt||now(),updatedAt:now()
  };
  if(!normalized.id)errors.push('A stable decal ID is required.');if(!normalized.materialId)errors.push('A source material is required.');
  if(normalized.projection.depth>5)warnings.push('Large decal projection depth may affect unintended surfaces.');
  normalized.validation={state:errors.length?'failed':warnings.length?'warning':'valid',errors,warnings,checkedAt:now()};return normalized;
}

export function normalizeAtlasRecipe(atlas={},fallback={}) {
  const merged={...fallback,...atlas};const entries=Array.isArray(merged.entries)?merged.entries.slice(0,128):[];
  const normalizedEntries=entries.map((entry,index)=>({id:String(entry?.id||`entry-${index+1}`),assetId:String(entry?.assetId||''),label:String(entry?.label||entry?.assetId||`Entry ${index+1}`).slice(0,80),rect:Array.isArray(entry?.rect)&&entry.rect.length===4?entry.rect.map(Number):[0,0,1,1]}));
  const occupied=normalizedEntries.reduce((sum,entry)=>sum+Math.max(0,entry.rect[2])*Math.max(0,entry.rect[3]),0);
  return {id:String(merged.id||''),type:'atlasRecipe',schemaVersion:1,name:String(merged.name||'Texture Atlas').slice(0,120),kind:['atlas','trim-sheet'].includes(merged.kind)?merged.kind:'atlas',resolution:Math.max(256,Math.min(8192,Math.round(Number(merged.resolution)||2048))),entries:normalizedEntries,occupancy:Math.min(1,occupied),sourceRecipeId:merged.sourceRecipeId?String(merged.sourceRecipeId):null,createdAt:merged.createdAt||now(),updatedAt:now(),validation:{state:normalizedEntries.length?'valid':'warning',warnings:normalizedEntries.length?[]:['Add at least one source material to the atlas.'],errors:[],checkedAt:now()}};
}

function starterSurfaceRecipes(){
  return [
    normalizeSurfaceRecipe({id:'surface-recipe-highland-grass',name:'Highland Grass Surface',baseMaterialId:'material-highland-grass',layers:{dirt:.12,moss:.16,wetness:.05,snow:0,damage:.03,colorVariation:.24,detailAmount:1.05},masks:{upwardFacing:1,slope:.28,cavities:.72,groundContact:.45,sunExposure:.18,shade:.62},tags:['terrain','grass','starter'],protected:true}),
    normalizeSurfaceRecipe({id:'surface-recipe-packed-earth',name:'Packed Earth Path Surface',baseMaterialId:'material-packed-earth',layers:{dirt:.28,moss:.04,wetness:.08,snow:0,damage:.12,colorVariation:.18,detailAmount:1.12},masks:{upwardFacing:.9,slope:.38,cavities:.62,groundContact:.5,sunExposure:.2,shade:.35},tags:['terrain','path','starter'],protected:true})
  ];
}

function starterMaterials() {
  return [
    { id:'material-highland-grass', type:'material', name:'Highland Grass', category:'terrain', source:'OmniForge procedural material pipeline', license:'Generated locally for unrestricted project use', createdAt:now(), maps:{baseColor:{file:'assets/materials/material-highland-grass/basecolor.png',url:'/assets/materials/material-highland-grass/basecolor.png'},normal:{file:'assets/materials/material-highland-grass/normal.png',url:'/assets/materials/material-highland-grass/normal.png'},roughness:{file:'assets/materials/material-highland-grass/roughness.png',url:'/assets/materials/material-highland-grass/roughness.png'},ambientOcclusion:{file:'assets/materials/material-highland-grass/ao.png',url:'/assets/materials/material-highland-grass/ao.png'},height:{file:'assets/materials/material-highland-grass/height.png',url:'/assets/materials/material-highland-grass/height.png'}}, settings:normalizeMaterialSettings({worldScale:3.5,roughness:.9,metallic:0,normalStrength:1.15,roughnessMultiplier:1,aoStrength:1,heightStrength:.035}), tags:['grass','terrain','starter','seamless','pbr'], surfaceRecipeId:'surface-recipe-highland-grass', protected:true },
    { id:'material-packed-earth', type:'material', name:'Packed Earth Path', category:'terrain', source:'OmniForge procedural material pipeline', license:'Generated locally for unrestricted project use', createdAt:now(), maps:{baseColor:{file:'assets/materials/material-packed-earth/basecolor.png',url:'/assets/materials/material-packed-earth/basecolor.png'},normal:{file:'assets/materials/material-packed-earth/normal.png',url:'/assets/materials/material-packed-earth/normal.png'},roughness:{file:'assets/materials/material-packed-earth/roughness.png',url:'/assets/materials/material-packed-earth/roughness.png'},ambientOcclusion:{file:'assets/materials/material-packed-earth/ao.png',url:'/assets/materials/material-packed-earth/ao.png'},height:{file:'assets/materials/material-packed-earth/height.png',url:'/assets/materials/material-packed-earth/height.png'}}, settings:normalizeMaterialSettings({worldScale:2.3,roughness:.82,metallic:0,normalStrength:1.25,roughnessMultiplier:1,aoStrength:1,heightStrength:.04}), tags:['dirt','path','starter','seamless','pbr'], surfaceRecipeId:'surface-recipe-packed-earth', protected:true }
  ];
}

function starterScene(template='starter-3d') {
  const sun = baseObject('directionalLight', 'Sun', [0,18,0], { id:'sun-main', rotation:[-48,32,0], properties:{ color:'#fff1d1', intensity:1.45, castsShadows:true } });
  const objects = [sun];
  if (template === 'starter-3d') {
    const terrain = baseObject('terrain', 'Terrain', [0,0,0], { id:'terrain-main', properties:{ size:100,resolution:96,amplitude:4,frequency:.055,seed:17,color:'#526d49',roughness:.86,materialId:'material-highland-grass',collider:true,receivesShadows:true } });
    const pathObject = baseObject('path', 'Terrain Path', [0,0,0], { id:'path-main', properties:{ width:3.2,surfaceOffset:.03,color:'#73573d',materialId:'material-packed-earth',blendDistance:3.2,edgeNoise:.65,points:[[-32,-22],[-20,-13],[-8,-8],[5,-2],[17,9],[30,16]],conformToTerrain:true,collider:true,navigation:true,vegetationExclusion:1.2 } });
    const block = baseObject('box', 'Scene Block', [7,6.05,4], { id:'block-main', scale:[6,4,6], properties:{ color:'#3f66a3',metallic:.08,roughness:.78,collider:true } });
    const marker = baseObject('sphere', 'World Marker', [-12,4,-4], { id:'marker-main', scale:[2.2,2.2,2.2], properties:{ color:'#a96cff',metallic:.2,roughness:.42,collider:true } });
    objects.unshift(terrain, pathObject);
    objects.push(block, marker);
  }
  return {
    id:'scene-main', name:'Main', createdAt:now(), updatedAt:now(),
    settings:{ skyTop:'#17243d',skyBottom:'#8ca6b8',ambientColor:'#b8c6d8',ambientIntensity:.48,gravity:-9.81,gridVisible:true,gridSize:100,gridStep:5,fogNear:90,fogFar:280,exposure:1.22,waterLevel:-100,windDirection:[1,0,.25],windStrength:.35,season:'summer',weatherWetness:0,weatherSnow:0 },
    editorCamera:{ position:[25,15,32],yaw:-.68,pitch:-.29,moveSpeed:12,fastMultiplier:3.5,fov:62,lookSensitivity:.0023,invertHorizontal:false,invertVertical:false },
    objects
  };
}

const defaultShortcuts = () => ({
  save:'Ctrl+S', commandPalette:'Ctrl+K', duplicate:'Ctrl+D', focus:'F', resetCamera:'Home', play:'P', delete:'Delete',
  moveMode:'1', rotateMode:'2', scaleMode:'3', toggleLeftPanel:'Ctrl+Alt+1', toggleRightPanel:'Ctrl+Alt+2', toggleBottomDock:'Ctrl+Alt+3', projectHub:'Ctrl+Shift+P'
});

const defaultLayout = () => ({ leftWidth:260,rightWidth:330,bottomHeight:250,leftCollapsed:false,rightCollapsed:false,bottomCollapsed:false,name:'Default' });

export function createDefaultState(options={}) {
  const name = String(options.name || 'Untitled Game').trim().slice(0,120) || 'Untitled Game';
  const projectId = options.id || slugify(name, 'untitled-game');
  const template = options.template || 'starter-3d';
  const root = options.root || path.join(WORKSPACE_ROOT, projectId);
  const scene = starterScene(template);
  return {
    schemaVersion:8,
    engine:{ name:'OmniForge', version:'0.9.0', status:'ready', revision:1, updatedAt:now(), safeMode:Boolean(process.env.OMNIFORGE_SAFE_MODE === '1') },
    project:{ id:projectId,name,root,template,schemaVersion:8,createdAt:options.createdAt || now(),updatedAt:now(),lastOpenedAt:now(),thumbnail:null,importSource:options.importSource || null },
    activeSceneId:scene.id,
    scenes:[scene],
    selection:{ objectId:scene.objects.find(o=>o.type==='box')?.id || scene.objects[0]?.id || null },
    editor:{ mode:'edit',transformMode:'move',snap:.5,autoCapture:false,runtimeConnected:true,lastFocusObjectId:null,codexStatus:'available',lastCodexConnectionAt:null,captureRequest:null,viewportMessage:null,selectedMaterialId:'material-highland-grass',selectedAssetId:null,selectedProviderId:'local-worker-host',assetView:'library',assetWorkspaceView:'surfaces',surfaceStudioMode:'simple',saveState:'saved',firstUseComplete:false,safeMode:Boolean(process.env.OMNIFORGE_SAFE_MODE === '1'),layout:defaultLayout(),savedLayouts:[defaultLayout()],shortcuts:defaultShortcuts(),recentErrors:[] },
    assets:[...starterMaterials(),...starterSurfaceRecipes()], prefabs:[], commands:[], evidence:[],
    providers:starterProviders(),jobs:[],
    activity:[{ id:id('activity'),type:'engine',message:'General-purpose 3D workspace initialized.',createdAt:now() }],
    settings:{ port:RUNTIME_PORT,desktopMode:Boolean(process.env.OMNIFORGE_DESKTOP==='1'),integrations:normalizeIntegrationSettings() }
  };
}

function migrateState(input) {
  if (!input || typeof input !== 'object') return createDefaultState();
  const state = structuredClone(input);
  if (!state.project) return createDefaultState();
  state.schemaVersion = 8;
  state.engine = { name:'OmniForge', version:'0.9.0',status:'ready',revision:1,updatedAt:now(), ...state.engine, version:'0.9.0', safeMode:Boolean(process.env.OMNIFORGE_SAFE_MODE === '1') };
  state.project = { schemaVersion:8,createdAt:now(),updatedAt:now(),lastOpenedAt:now(),thumbnail:null, ...state.project, schemaVersion:8 };
  const managedProjectRoot = path.join(WORKSPACE_ROOT, state.project.id || slugify(state.project.name));
  if (!path.isAbsolute(state.project.root || '') || !path.resolve(state.project.root).startsWith(path.resolve(WORKSPACE_ROOT) + path.sep)) state.project.root = managedProjectRoot;
  state.assets = Array.isArray(state.assets) ? state.assets : starterMaterials();
  state.prefabs = Array.isArray(state.prefabs) ? state.prefabs : [];
  state.commands = Array.isArray(state.commands) ? state.commands : [];
  state.evidence = Array.isArray(state.evidence) ? state.evidence : [];
  state.providers = normalizeProviders(state.providers || []);
  state.jobs = normalizeJobs(state.jobs || []);
  state.settings = { ...(state.settings || {}), port:RUNTIME_PORT, desktopMode:Boolean(process.env.OMNIFORGE_DESKTOP==='1'), integrations:normalizeIntegrationSettings(state.settings?.integrations || {}) };
  state.activity = Array.isArray(state.activity) ? state.activity : [];
  state.editor = { mode:'edit',transformMode:'move',snap:.5,autoCapture:false,runtimeConnected:true,codexStatus:'available',captureRequest:null,selectedMaterialId:null,selectedAssetId:null,selectedProviderId:'local-worker-host',assetView:'library',assetWorkspaceView:'surfaces',surfaceStudioMode:'simple',saveState:'saved',firstUseComplete:false,safeMode:false,layout:defaultLayout(),savedLayouts:[defaultLayout()],shortcuts:defaultShortcuts(),recentErrors:[], ...state.editor };
  state.editor.layout = { ...defaultLayout(), ...(state.editor.layout || {}) };
  state.editor.savedLayouts = Array.isArray(state.editor.savedLayouts) && state.editor.savedLayouts.length ? state.editor.savedLayouts : [defaultLayout()];
  state.editor.shortcuts = { ...defaultShortcuts(), ...(state.editor.shortcuts || {}) };
  state.editor.recentErrors = Array.isArray(state.editor.recentErrors) ? state.editor.recentErrors.slice(0,30) : [];
  state.editor.mode = 'edit';
  state.editor.safeMode = Boolean(process.env.OMNIFORGE_SAFE_MODE === '1');
  const starterRecipes=starterSurfaceRecipes();
  for(const recipe of starterRecipes)if(!state.assets.some(asset=>asset.id===recipe.id))state.assets.push(recipe);
  const generatedAssetRecipes=[];
  for (const asset of state.assets.filter(asset=>asset.type==='model')) {
    asset.status=asset.status||'unvalidated';
    asset.approvalState=asset.approvalState||'unvalidated';
    asset.derivativeAssetIds=Array.isArray(asset.derivativeAssetIds)?asset.derivativeAssetIds:[];
    asset.sceneUsages=Array.isArray(asset.sceneUsages)?asset.sceneUsages:[];
    asset.lods=Array.isArray(asset.lods)?asset.lods:[];
    asset.affordances=Array.isArray(asset.affordances)?asset.affordances:[];
    asset.sockets=Array.isArray(asset.sockets)?asset.sockets:[];
    asset.tags=Array.isArray(asset.tags)?asset.tags:[];
    const existingRecipe=state.assets.find(item=>item.type==='assetRecipe'&&(item.canonicalAssetId===asset.id||item.id===asset.assetRecipeId));
    const recipe=syncAssetRecipe(asset,existingRecipe||{});asset.assetRecipeId=recipe.id;
    if(existingRecipe)Object.assign(existingRecipe,recipe);else generatedAssetRecipes.push(recipe);
  }
  state.assets.push(...generatedAssetRecipes);
  const generatedRecipes=[];
  for (const material of state.assets.filter(asset=>asset.type==='material')) {
    material.settings=normalizeMaterialSettings(material.settings||{});
    let recipe=state.assets.find(asset=>asset.type==='surfaceRecipe'&&asset.baseMaterialId===material.id);
    if(!recipe){recipe=normalizeSurfaceRecipe({id:`surface-recipe-${slugify(material.id.replace(/^material-/,''),'surface')}`,name:`${material.name} Surface`,baseMaterialId:material.id,layers:{colorVariation:.15,detailAmount:1},tags:[material.category||'surface']});generatedRecipes.push(recipe);}
    material.surfaceRecipeId=recipe.id;
  }
  state.assets.push(...generatedRecipes);
  for(let index=0;index<state.assets.length;index++)if(state.assets[index].type==='surfaceRecipe')state.assets[index]=normalizeSurfaceRecipe(state.assets[index],state.assets[index]);
  for(let index=0;index<state.assets.length;index++){const asset=state.assets[index];if(asset.type==='decalRecipe')state.assets[index]=normalizeDecalRecipe(asset,asset);else if(asset.type==='atlasRecipe')state.assets[index]=normalizeAtlasRecipe(asset,asset);}
  for (const scene of state.scenes || []) {
    scene.settings = { fogNear:90,fogFar:280,exposure:1,gridVisible:true,waterLevel:-100,windDirection:[1,0,.25],windStrength:.35,season:'summer',weatherWetness:0,weatherSnow:0,...scene.settings };
    scene.editorCamera = { lookSensitivity:.0023,invertHorizontal:false,invertVertical:false,moveSpeed:12,fov:62,...scene.editorCamera };
  }
  return state;
}

export function projectStateFile(projectRoot) { return path.join(projectRoot, '.omniforge', 'project-state.json'); }
export function projectLockFile(projectRoot) { return path.join(projectRoot, '.omniforge', 'project.lock.json'); }

export function readCatalog() {
  ensureDirectories();
  const raw = safeReadJson(CATALOG_FILE, { schemaVersion:1, activeProjectId:null, projects:[] });
  raw.schemaVersion = 1;
  raw.projects = Array.isArray(raw.projects) ? raw.projects : [];
  for(const project of raw.projects){
    const managedRoot=path.join(WORKSPACE_ROOT,project.id||slugify(project.name,'untitled-game'));
    if(!path.isAbsolute(project.root||'')||!path.resolve(project.root).startsWith(path.resolve(WORKSPACE_ROOT)+path.sep))project.root=managedRoot;
    project.schemaVersion=Math.max(8,Number(project.schemaVersion)||0);
  }
  return raw;
}

export function writeCatalog(catalog) { atomicWrite(CATALOG_FILE, catalog); return catalog; }

export function refreshProjectCatalog() {
  const catalog = readCatalog();
  for (const project of catalog.projects) {
    project.missing = !fs.existsSync(project.root);
    if (!project.missing) {
      const state = safeReadJson(projectStateFile(project.root));
      if (state?.project) {
        project.name = state.project.name || project.name;
        project.thumbnail = state.project.thumbnail || project.thumbnail || null;
        project.updatedAt = state.project.updatedAt || project.updatedAt;
        project.schemaVersion = state.schemaVersion || project.schemaVersion || 1;
      }
    }
  }
  writeCatalog(catalog);
  return catalog;
}

function upsertCatalogProject(state, extra={}) {
  const catalog = readCatalog();
  const existing = catalog.projects.find(p=>p.id===state.project.id);
  const record = {
    id:state.project.id,name:state.project.name,root:state.project.root,template:state.project.template,
    schemaVersion:state.schemaVersion,createdAt:state.project.createdAt,updatedAt:state.project.updatedAt,lastOpenedAt:state.project.lastOpenedAt || now(),
    thumbnail:state.project.thumbnail || null,archived:false,missing:false,importSource:state.project.importSource || null,...extra
  };
  if (existing) Object.assign(existing, record); else catalog.projects.unshift(record);
  catalog.activeProjectId = state.project.id;
  catalog.projects.sort((a,b)=>new Date(b.lastOpenedAt||0)-new Date(a.lastOpenedAt||0));
  writeCatalog(catalog);
  return record;
}

function ensureDirectories() {
  for (const dir of [path.dirname(DATA_FILE),WORKSPACE_ROOT,ARCHIVE_ROOT,ASSET_ROOT]) fs.mkdirSync(dir,{recursive:true});
  copyBundledAssets();
}

export function ensureState() {
  ensureDirectories();
  if (!fs.existsSync(DATA_FILE)) {
    const catalog = refreshProjectCatalog();
    const candidate = catalog.projects.find(p=>!p.archived && !p.missing && fs.existsSync(projectStateFile(p.root)));
    const state = candidate ? migrateState(safeReadJson(projectStateFile(candidate.root))) : createDefaultState();
    fs.mkdirSync(state.project.root,{recursive:true});
    writeState(state,false);
  }
}

export function readState() {
  ensureState();
  let parsed = safeReadJson(DATA_FILE);
  if (!parsed) parsed = safeReadJson(BACKUP_FILE);
  const state = migrateState(parsed || createDefaultState());
  return state;
}

export function writeState(state, bump=true) {
  ensureDirectories();
  const next = migrateState(state);
  if (bump) {
    next.engine.revision = Number(next.engine.revision || 0) + 1;
    next.engine.updatedAt = now();
    next.project.updatedAt = now();
    const scene = next.scenes.find(item=>item.id===next.activeSceneId);
    if (scene) scene.updatedAt = now();
  }
  next.editor.saveState = 'saved';
  fs.mkdirSync(next.project.root,{recursive:true});
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE,BACKUP_FILE);
  atomicWrite(DATA_FILE,next);
  atomicWrite(projectStateFile(next.project.root),next);
  upsertCatalogProject(next);
  return next;
}

export function mutateState(mutator) {
  const state = readState();
  const result = mutator(state);
  const written = writeState(state);
  return { state:written, result };
}

export function listProjects(options={}) {
  const catalog = refreshProjectCatalog();
  return catalog.projects.filter(p=>options.includeArchived ? true : !p.archived);
}

export function createProject(options={}) {
  const name = String(options.name || 'Untitled Game').trim().slice(0,120) || 'Untitled Game';
  let projectId = slugify(options.id || name, 'untitled-game');
  let suffix = 2;
  while (fs.existsSync(path.join(WORKSPACE_ROOT,projectId))) projectId = `${slugify(options.id || name)}-${suffix++}`;
  const root = path.join(WORKSPACE_ROOT,projectId);
  fs.mkdirSync(root,{recursive:true});
  const state = createDefaultState({ name,id:projectId,template:options.template || 'empty-3d',root });
  writeState(state,false);
  return state;
}

export function openProject(projectId) {
  const catalog = refreshProjectCatalog();
  const record = catalog.projects.find(p=>p.id===projectId && !p.archived);
  if (!record) throw new Error('Project not found.');
  if (record.missing || !fs.existsSync(record.root)) throw new Error('Project directory is missing. Use Locate to restore it.');
  const loaded = safeReadJson(projectStateFile(record.root));
  if (!loaded) throw new Error('Project state is missing or unreadable.');
  const state = migrateState(loaded);
  state.project.lastOpenedAt = now();
  return writeState(state,false);
}

export function duplicateProject(projectId, requestedName='') {
  const catalog = refreshProjectCatalog();
  const source = catalog.projects.find(p=>p.id===projectId && !p.archived);
  if (!source || source.missing) throw new Error('Source project is unavailable.');
  const name = String(requestedName || `${source.name} Copy`).trim().slice(0,120);
  let newId = slugify(name);
  let suffix=2;
  while (fs.existsSync(path.join(WORKSPACE_ROOT,newId))) newId=`${slugify(name)}-${suffix++}`;
  const destination = path.join(WORKSPACE_ROOT,newId);
  copyDirectory(source.root,destination,{excluded:['.git','node_modules','dist','build','.desktop-cache','captures','logs','project.lock.json']});
  const projectFile = projectStateFile(destination);
  const state = migrateState(safeReadJson(projectFile) || createDefaultState({name,id:newId,root:destination,template:source.template}));
  state.project = {...state.project,id:newId,name,root:destination,createdAt:now(),updatedAt:now(),lastOpenedAt:now(),thumbnail:null};
  state.engine.revision=1;
  return writeState(state,false);
}

export function archiveProject(projectId) {
  const catalog = refreshProjectCatalog();
  const record = catalog.projects.find(p=>p.id===projectId);
  if (!record) throw new Error('Project not found.');
  if (!record.missing && fs.existsSync(record.root)) {
    const target = path.join(ARCHIVE_ROOT,`${record.id}-${Date.now().toString(36)}`);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.renameSync(record.root,target);
    record.archivedRoot=target;
  }
  record.archived=true;record.missing=false;record.archivedAt=now();
  if(catalog.activeProjectId===projectId)catalog.activeProjectId=null;
  writeCatalog(catalog);
  const next = catalog.projects.find(p=>!p.archived&&!p.missing&&p.id!==projectId);
  return next ? openProject(next.id) : createProject({name:'Untitled Game',template:'starter-3d'});
}

export function importProject(sourcePath, options={}) {
  const resolved = path.resolve(sourcePath || '');
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error('Choose a valid project directory.');
  const sourceState = safeReadJson(projectStateFile(resolved));
  const name = String(options.name || sourceState?.project?.name || path.basename(resolved)).trim().slice(0,120) || 'Imported Project';
  let projectId=slugify(options.id || name);
  let suffix=2;while(fs.existsSync(path.join(WORKSPACE_ROOT,projectId)))projectId=`${slugify(name)}-${suffix++}`;
  const destination=path.join(WORKSPACE_ROOT,projectId);
  copyDirectory(resolved,destination);
  const state=migrateState(sourceState || createDefaultState({name,id:projectId,root:destination,template:'empty-3d',importSource:resolved}));
  state.project={...state.project,id:projectId,name,root:destination,importSource:resolved,createdAt:now(),updatedAt:now(),lastOpenedAt:now()};
  return writeState(state,false);
}

export function locateProject(projectId, locatedPath) {
  const catalog=refreshProjectCatalog();
  const record=catalog.projects.find(p=>p.id===projectId);
  if(!record)throw new Error('Project not found.');
  const source=path.resolve(locatedPath||'');
  if(!fs.existsSync(source)||!fs.statSync(source).isDirectory())throw new Error('Located directory is invalid.');
  const destination=path.join(WORKSPACE_ROOT,record.id);
  if(path.resolve(source)!==path.resolve(destination)){
    if(fs.existsSync(destination))fs.rmSync(destination,{recursive:true,force:true});
    copyDirectory(source,destination);
  }
  record.root=destination;record.missing=false;record.updatedAt=now();record.lastOpenedAt=now();
  writeCatalog(catalog);
  return openProject(record.id);
}

export function updateProjectThumbnail(file) {
  const {state}=mutateState(state=>{state.project.thumbnail=file || null;return state.project;});
  return state;
}

export function addActivity(state, type, message, details={}) {
  state.activity.unshift({ id:id('activity'),type,message,details,createdAt:now() });
  state.activity=state.activity.slice(0,250);
}

export function recordError(state, message, details={}) {
  state.editor.recentErrors = Array.isArray(state.editor.recentErrors) ? state.editor.recentErrors : [];
  state.editor.recentErrors.unshift({ id:id('error'),message:String(message),details,createdAt:now() });
  state.editor.recentErrors=state.editor.recentErrors.slice(0,30);
}

export function activeScene(state) {
  const scene=state.scenes.find(item=>item.id===state.activeSceneId);
  if(!scene)throw new Error('Active scene not found.');
  return scene;
}

export function findObject(state, objectId) { return activeScene(state).objects.find(object=>object.id===objectId); }

export function createSceneObject(type, options={}) {
  const defaults={
    box:{name:'Box',properties:{color:'#8ba1c7',metallic:.05,roughness:.75,collider:true}},
    sphere:{name:'Sphere',properties:{color:'#aa87ee',metallic:.1,roughness:.5,collider:true}},
    cylinder:{name:'Cylinder',properties:{color:'#d19366',metallic:.04,roughness:.72,collider:true}},
    plane:{name:'Plane',properties:{color:'#7f9474',metallic:0,roughness:.9,collider:true}},
    decal:{name:'Decal',properties:{color:'#ffffff',opacity:.85,metallic:0,roughness:.8,materialId:null,decalRecipeId:null,projectionDepth:.25,sortOrder:0,castsShadows:false,receivesShadows:true,collider:false}},
    terrain:{name:'Terrain',properties:{size:80,resolution:80,amplitude:3,frequency:.06,seed:11,color:'#607b52',roughness:.9,materialId:null,collider:true,receivesShadows:true}},
    path:{name:'Path',properties:{width:3,surfaceOffset:.03,color:'#8c7354',materialId:null,blendDistance:2.5,edgeNoise:.5,points:[[-10,0],[0,0],[10,0]],conformToTerrain:true,collider:true,navigation:true,vegetationExclusion:1}},
    directionalLight:{name:'Directional Light',properties:{color:'#fff1d3',intensity:1,castsShadows:true}},
    pointLight:{name:'Point Light',properties:{color:'#ffd3a3',intensity:2,range:12}},
    model:{name:'Imported Model',properties:{assetId:null,color:'#aab4c6',metallic:0,roughness:.8,collider:false,castsShadows:true,receivesShadows:true}},
    empty:{name:'Empty',properties:{}}
  };
  if(!defaults[type])throw new Error(`Unsupported object type: ${type}`);
  const preset=defaults[type];
  return baseObject(type,options.name||preset.name,options.position||[0,2,0],{ id:options.id,rotation:options.rotation,scale:options.scale,parentId:options.parentId,properties:{...preset.properties,...(options.properties||{})},components:Array.isArray(options.components)?options.components:[] });
}

export function safeWorkspacePath(relativePath='.') {
  const target=path.resolve(WORKSPACE_ROOT,relativePath);const root=path.resolve(WORKSPACE_ROOT);
  if(target!==root&&!target.startsWith(`${root}${path.sep}`))throw new Error('Path escapes the managed workspace.');
  return target;
}
