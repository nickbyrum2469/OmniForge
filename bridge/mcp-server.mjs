import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import {
  readState, mutateState, addActivity, activeScene, findObject,
  createSceneObject, safeWorkspacePath, WORKSPACE_ROOT, ASSET_ROOT, normalizeMaterialSettings, normalizeSurfaceRecipe, compileSurfaceRecipe, normalizeDecalRecipe, normalizeAtlasRecipe, createProject, listProjects, openProject, duplicateProject, archiveProject
} from '../server/state-store.mjs';
import { importModelAsset, rebuildCanonicalAsset, createSafeRepairDerivative, generateCollision, generateLodsForAsset, refreshSceneUsages, syncAssetRecipe } from '../server/asset-pipeline.mjs';
import { terrainHeight } from '../app/renderer.js';
import { createJob, cancelJob, retryJob, clearCompletedJobs } from '../server/job-manager.mjs';
import { searchMarketplace, marketplaceDetails, prepareMarketplaceDownload, resolveMarketplaceImportFiles, createMaterialFromMarketplaceDownload, inspectDownloadedJob } from '../server/marketplace.mjs';
import { v010Tools, callV010Tool } from './v010-tools.mjs';

const SERVER_INFO={name:'omniforge',version:'0.10.0'};
const now=()=>new Date().toISOString();

function upsertAssetRecipe(state,asset){
  if(!asset||asset.type!=='model')return null;
  const existing=state.assets.find(item=>item.type==='assetRecipe'&&(item.canonicalAssetId===asset.id||item.id===asset.assetRecipeId));
  const recipe=syncAssetRecipe(asset,existing||{});asset.assetRecipeId=recipe.id;
  if(existing)Object.assign(existing,recipe);else state.assets.push(recipe);
  return recipe;
}

const tools=[...v010Tools,
  {
    name:'omniforge_get_state',
    description:'Read the authoritative OmniForge project, active 3D scene, selected object, editor state, Codex command queue, and recent evidence.',
    inputSchema:{type:'object',properties:{compact:{type:'boolean',default:false}}}
  },
  {
    name:'omniforge_list_objects',
    description:'List objects in the active 3D scene with type, transforms, components, properties, visibility, and lock state.',
    inputSchema:{type:'object',properties:{type:{type:'string'},query:{type:'string'}}}
  },
  {
    name:'omniforge_search',
    description:'Search active scene objects, assets, queued commands, evidence, and activity by meaning-bearing text.',
    inputSchema:{type:'object',required:['query'],properties:{query:{type:'string'}}}
  },
  {
    name:'omniforge_create_project',
    description:'Configure the general-purpose game project identity. This never assumes a genre, game name, or pre-existing project.',
    inputSchema:{type:'object',required:['name'],properties:{name:{type:'string'},id:{type:'string'},template:{type:'string',enum:['empty-3d','starter-3d']}}}
  },
  {
    name:'omniforge_list_projects',
    description:'List managed OmniForge projects with recent ordering, project roots, thumbnails, schema versions, missing-directory state, and archive state.',
    inputSchema:{type:'object',properties:{includeArchived:{type:'boolean',default:false}}}
  },
  {
    name:'omniforge_open_project',
    description:'Switch the authoritative editor state to an existing managed project. Use only when the user explicitly requests a project switch.',
    inputSchema:{type:'object',required:['projectId'],properties:{projectId:{type:'string'}}}
  },
  {
    name:'omniforge_duplicate_project',
    description:'Create an independent managed copy of an existing project while excluding generated cache and build folders.',
    inputSchema:{type:'object',required:['projectId'],properties:{projectId:{type:'string'},name:{type:'string'}}}
  },
  {
    name:'omniforge_archive_project',
    description:'Move a managed project into the OmniForge archive. This is reversible at the filesystem level but requires explicit user intent.',
    inputSchema:{type:'object',required:['projectId'],properties:{projectId:{type:'string'}}}
  },
  {
    name:'omniforge_create_scene',
    description:'Create and activate a new 3D scene.',
    inputSchema:{type:'object',required:['name'],properties:{name:{type:'string'},id:{type:'string'},template:{type:'string',enum:['empty-3d','starter-3d']}}}
  },
  {
    name:'omniforge_create_object',
    description:'Create a live 3D scene object. Supported types are box, sphere, cylinder, plane, terrain, path, directionalLight, pointLight, and empty.',
    inputSchema:{type:'object',required:['type'],properties:{type:{type:'string',enum:['box','sphere','cylinder','plane','terrain','path','directionalLight','pointLight','empty']},name:{type:'string'},position:{type:'array',items:{type:'number'},minItems:3,maxItems:3},rotation:{type:'array',items:{type:'number'},minItems:3,maxItems:3},scale:{type:'array',items:{type:'number'},minItems:3,maxItems:3},properties:{type:'object'},components:{type:'array'}}}
  },
  {
    name:'omniforge_update_object',
    description:'Update one existing 3D object. Only supplied fields are changed. Transform arrays use [x,y,z], with rotation in degrees.',
    inputSchema:{type:'object',required:['objectId','patch'],properties:{objectId:{type:'string'},patch:{type:'object'}}}
  },
  {
    name:'omniforge_delete_object',
    description:'Delete an unlocked object from the active scene.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'}}}
  },
  {
    name:'omniforge_duplicate_object',
    description:'Duplicate an existing object and offset the copy for immediate inspection.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'},name:{type:'string'}}}
  },
  {
    name:'omniforge_batch_edit',
    description:'Apply a single atomic batch of create, update, delete, select, and scene-setting operations. Use this for coherent system or level changes.',
    inputSchema:{type:'object',required:['operations'],properties:{operations:{type:'array',items:{type:'object'}},summary:{type:'string'}}}
  },
  {
    name:'omniforge_ground_object',
    description:'Fit an unlocked mesh entity to authoritative terrain with category-aware support points, controlled tilt, root sockets, foundation mode, or vehicle contact mode.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'},maxTilt:{type:'number',minimum:0,maximum:89}}}
  },
  {
    name:'omniforge_list_materials',
    description:'List registered PBR material assets, their texture maps, provenance, license, settings, and current scene usage.',
    inputSchema:{type:'object',properties:{query:{type:'string'}}}
  },
  {
    name:'omniforge_apply_material',
    description:'Apply a registered material asset to a terrain, path, or mesh entity through the authoritative scene model.',
    inputSchema:{type:'object',required:['objectId','materialId'],properties:{objectId:{type:'string'},materialId:{type:'string'}}}
  },
  {
    name:'omniforge_update_material_settings',
    description:'Update a registered material’s live tiling, rotation, offset, roughness, metallic, normal, ambient-occlusion, and height-depth settings. Changes affect every scene entity using the material.',
    inputSchema:{type:'object',required:['materialId','settings'],properties:{materialId:{type:'string'},settings:{type:'object',properties:{worldScale:{type:'number',minimum:.05,maximum:100},uvRotation:{type:'number'},uvOffset:{type:'array',items:{type:'number'},minItems:2,maxItems:2},roughness:{type:'number',minimum:0,maximum:1},roughnessMultiplier:{type:'number',minimum:.1,maximum:2},metallic:{type:'number',minimum:0,maximum:1},normalStrength:{type:'number',minimum:0,maximum:4},aoStrength:{type:'number',minimum:0,maximum:2},heightStrength:{type:'number',minimum:0,maximum:.25}}}}}
  },
  {
    name:'omniforge_create_material_variant',
    description:'Create a non-destructive material variant that shares source maps but has independent tiling and surface-response settings.',
    inputSchema:{type:'object',required:['materialId'],properties:{materialId:{type:'string'},name:{type:'string'},settings:{type:'object'}}}
  },
  {
    name:'omniforge_list_surface_recipes',
    description:'List reusable Surface Recipe assets, their base materials, deterministic layers, world masks, validation results, and provenance relationships.',
    inputSchema:{type:'object',properties:{query:{type:'string'}}}
  },
  {
    name:'omniforge_update_surface_recipe',
    description:'Update a Surface Recipe through guarded deterministic layers and masks. This is a committed operation; use editor preview controls for human review first.',
    inputSchema:{type:'object',required:['recipeId'],properties:{recipeId:{type:'string'},name:{type:'string'},layers:{type:'object'},layerColors:{type:'object'},masks:{type:'object'},advanced:{type:'object'},graph:{type:'object'},weatherResponse:{type:'object'},tags:{type:'array',items:{type:'string'}}}}
  },
  {
    name:'omniforge_create_surface_recipe_variant',
    description:'Create a non-destructive Surface Recipe variant linked to the same base material.',
    inputSchema:{type:'object',required:['recipeId'],properties:{recipeId:{type:'string'},name:{type:'string'},layers:{type:'object'},layerColors:{type:'object'},masks:{type:'object'},advanced:{type:'object'},graph:{type:'object'}}}
  },
  {
    name:'omniforge_compile_surface_recipe',
    description:'Validate and compile one authoritative Surface Recipe into a deterministic cached runtime program key.',
    inputSchema:{type:'object',required:['recipeId'],properties:{recipeId:{type:'string'}}}
  },
  {
    name:'omniforge_create_decal_recipe',
    description:'Create a first-class decal recipe from a registered material. Placement remains a separate guarded action.',
    inputSchema:{type:'object',required:['materialId','name'],properties:{materialId:{type:'string'},name:{type:'string'},category:{type:'string'},opacity:{type:'number',minimum:0,maximum:1},projectionDepth:{type:'number',minimum:.001,maximum:20},channels:{type:'object'}}}
  },
  {
    name:'omniforge_place_decal',
    description:'Place a registered decal recipe as a scene entity at an explicit inspected world position.',
    inputSchema:{type:'object',required:['decalId','position'],properties:{decalId:{type:'string'},position:{type:'array',items:{type:'number'},minItems:3,maxItems:3},size:{type:'array',items:{type:'number'},minItems:2,maxItems:2},rotation:{type:'array',items:{type:'number'},minItems:3,maxItems:3}}}
  },
  {
    name:'omniforge_create_surface_atlas',
    description:'Create a deterministic atlas or trim-sheet recipe from registered material IDs without overwriting source maps.',
    inputSchema:{type:'object',required:['name','materialIds'],properties:{name:{type:'string'},kind:{type:'string',enum:['atlas','trim-sheet']},resolution:{type:'integer',minimum:256,maximum:8192},materialIds:{type:'array',items:{type:'string'},minItems:1}}}
  },
  {
    name:'omniforge_configure_path_blend',
    description:'Configure a terrain-conforming path material mask, including width, soft blend shoulder, edge irregularity, navigation, collision, and vegetation clearance.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'},width:{type:'number'},blendDistance:{type:'number'},edgeNoise:{type:'number'},vegetationExclusion:{type:'number'},collider:{type:'boolean'},navigation:{type:'boolean'}}}
  },
  {
    name:'omniforge_create_prefab',
    description:'Save an existing scene entity and its components as a reusable prefab.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'},name:{type:'string'},id:{type:'string'}}}
  },
  {
    name:'omniforge_instantiate_prefab',
    description:'Create a scene entity from a registered prefab and optionally place it at a specific world position.',
    inputSchema:{type:'object',required:['prefabId'],properties:{prefabId:{type:'string'},name:{type:'string'},position:{type:'array',items:{type:'number'},minItems:3,maxItems:3}}}
  },
  {
    name:'omniforge_list_model_assets',
    description:'List canonical 3D model assets with validation, health reports, provenance, collision, LODs, approval, and real scene usages.',
    inputSchema:{type:'object',properties:{query:{type:'string'},category:{type:'string'},approvalState:{type:'string'}}}
  },
  {
    name:'omniforge_get_model_asset',
    description:'Read one canonical 3D asset record and refresh its real scene usage relationships.',
    inputSchema:{type:'object',required:['assetId'],properties:{assetId:{type:'string'}}}
  },
  {
    name:'omniforge_import_model_from_project',
    description:'Import a GLB or embedded glTF from inside the current managed project workspace. Preserves the source and creates validation plus a canonical render derivative.',
    inputSchema:{type:'object',required:['path'],properties:{path:{type:'string'},name:{type:'string'},category:{type:'string'},license:{type:'string'},creator:{type:'string'},tags:{type:'array',items:{type:'string'}}}}
  },
  {
    name:'omniforge_rebuild_asset_import',
    description:'Rebuild an existing canonical model from its preserved original source using the current hierarchy-aware importer. Backs up the previous canonical mesh and resets the asset to draft for rendered inspection.',
    inputSchema:{type:'object',required:['assetId'],properties:{assetId:{type:'string'}}}
  },
  {
    name:'omniforge_repair_model_asset',
    description:'Create a reversible safe-repair derivative. The approved source asset is never overwritten.',
    inputSchema:{type:'object',required:['assetId'],properties:{assetId:{type:'string'},centerPivot:{type:'boolean'},unitScale:{type:'number',minimum:.0001,maximum:10000}}}
  },
  {
    name:'omniforge_generate_model_collision',
    description:'Generate a bounds-based collision descriptor for a model asset. Rendered doorway and gameplay-clearance inspection is still required.',
    inputSchema:{type:'object',required:['assetId'],properties:{assetId:{type:'string'}}}
  },
  {
    name:'omniforge_generate_model_lods',
    description:'Generate two non-destructive geometry LOD derivatives and record their triangle counts.',
    inputSchema:{type:'object',required:['assetId'],properties:{assetId:{type:'string'},ratios:{type:'array',items:{type:'number'},minItems:1,maxItems:4}}}
  },
  {
    name:'omniforge_preview_model_placement',
    description:'Create a temporary real-scene placement preview using the canonical asset and terrain grounding. It must be committed or cancelled after inspection.',
    inputSchema:{type:'object',required:['assetId'],properties:{assetId:{type:'string'},position:{type:'array',items:{type:'number'},minItems:3,maxItems:3},rotation:{type:'array',items:{type:'number'},minItems:3,maxItems:3},scale:{type:'array',items:{type:'number'},minItems:3,maxItems:3}}}
  },
  {
    name:'omniforge_commit_model_preview',
    description:'Commit an inspected temporary model placement preview.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'}}}
  },
  {
    name:'omniforge_cancel_model_preview',
    description:'Remove a temporary model placement preview without altering the asset.',
    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'}}}
  },
  {
    name:'omniforge_search_marketplace',
    description:'Search an enabled free asset provider through OmniForge’s normalized marketplace API. Returns source, license, category, tags, and preview metadata without downloading.',
    inputSchema:{type:'object',required:['providerId'],properties:{providerId:{type:'string',enum:['poly-haven','ambientcg','kenney','quaternius','quaternius-animations']},query:{type:'string'},type:{type:'string',enum:['all','model','material','hdri','animation']},limit:{type:'integer',minimum:1,maximum:60}}}
  },
  {
    name:'omniforge_get_marketplace_asset',
    description:'Read one marketplace asset with its official source, CC0 license metadata, and normalized download choices.',
    inputSchema:{type:'object',required:['providerId','assetId'],properties:{providerId:{type:'string'},assetId:{type:'string'}}}
  },
  {
    name:'omniforge_download_marketplace_asset',
    description:'Queue a persistent staged marketplace download. The result remains unimported until validation and an explicit import operation.',
    inputSchema:{type:'object',required:['providerId','assetId'],properties:{providerId:{type:'string'},assetId:{type:'string'},choiceId:{type:'string'}}}
  },
  {
    name:'omniforge_import_marketplace_job',
    description:'Import a succeeded marketplace download job into the canonical model or material library. Unsupported packages remain staged and return an honest error.',
    inputSchema:{type:'object',required:['jobId'],properties:{jobId:{type:'string'}}}
  },
  {
    name:'omniforge_list_providers',
    description:'List registered OmniForge providers, capabilities, enabled state, health status, backend, hardware report, and settings. Providers are isolated from scene authority.',
    inputSchema:{type:'object',properties:{enabledOnly:{type:'boolean',default:false}}}
  },
  {
    name:'omniforge_update_provider',
    description:'Enable, disable, or update non-secret settings for a provider. Required providers cannot be disabled.',
    inputSchema:{type:'object',required:['providerId'],properties:{providerId:{type:'string'},enabled:{type:'boolean'},settings:{type:'object'}}}
  },
  {
    name:'omniforge_run_provider_health',
    description:'Queue an isolated real provider health check. This returns a job, not an unsupported success claim.',
    inputSchema:{type:'object',required:['providerId'],properties:{providerId:{type:'string'}}}
  },
  {
    name:'omniforge_list_jobs',
    description:'List persistent provider and worker jobs with state, progress, logs, validation, outputs, retry eligibility, and cancellation status.',
    inputSchema:{type:'object',properties:{state:{type:'string'},providerId:{type:'string'},limit:{type:'integer',minimum:1,maximum:500}}}
  },
  {
    name:'omniforge_submit_job',
    description:'Queue a guarded background job. Supported v0.7 operations are project-integrity, asset-index, and diagnostic-delay.',
    inputSchema:{type:'object',required:['operation'],properties:{providerId:{type:'string'},operation:{type:'string',enum:['project-integrity','asset-index','diagnostic-delay']},title:{type:'string'},settings:{type:'object'},inputs:{type:'object'},prompt:{type:'string'}}}
  },
  {
    name:'omniforge_cancel_job',
    description:'Cancel a queued or running background job and preserve its audit history.',
    inputSchema:{type:'object',required:['jobId'],properties:{jobId:{type:'string'}}}
  },
  {
    name:'omniforge_retry_job',
    description:'Retry a failed, cancelled, or interrupted job as a new auditable attempt.',
    inputSchema:{type:'object',required:['jobId'],properties:{jobId:{type:'string'}}}
  },
  {
    name:'omniforge_clear_completed_jobs',
    description:'Clear completed job cards while preserving activity records. This does not delete imported assets or worker outputs.',
    inputSchema:{type:'object',properties:{}}
  },
  {
    name:'omniforge_get_commands',
    description:'Read user requests queued from the engine interface. Filter by queued, claimed, running, completed, or failed status.',
    inputSchema:{type:'object',properties:{status:{type:'string'}}}
  },
  {
    name:'omniforge_claim_command',
    description:'Claim a queued user request before changing the scene so the editor visibly tracks Codex ownership.',
    inputSchema:{type:'object',required:['commandId'],properties:{commandId:{type:'string'}}}
  },
  {
    name:'omniforge_complete_command',
    description:'Complete or fail a claimed command with an honest result summary and optional evidence references.',
    inputSchema:{type:'object',required:['commandId','status','result'],properties:{commandId:{type:'string'},status:{type:'string',enum:['completed','failed']},result:{type:'string'},evidenceFiles:{type:'array',items:{type:'string'}}}}
  },
  {
    name:'omniforge_request_capture',
    description:'Ask the live editor to focus an object and capture the actual 3D viewport. The browser performs the capture; this tool records a pending request, not fake evidence.',
    inputSchema:{type:'object',properties:{objectId:{type:'string'},title:{type:'string'}}}
  },
  {
    name:'omniforge_read_project_file',
    description:'Read a UTF-8 file inside the current OmniForge-managed projects workspace.',
    inputSchema:{type:'object',required:['path'],properties:{path:{type:'string'},maxBytes:{type:'integer',minimum:1,maximum:1000000}}}
  },
  {
    name:'omniforge_write_project_file',
    description:'Write a UTF-8 source or data file inside the managed projects workspace. Scene objects should normally be changed with structured scene tools instead.',
    inputSchema:{type:'object',required:['path','content'],properties:{path:{type:'string'},content:{type:'string'},createDirectories:{type:'boolean',default:true}}}
  }
];

function response(value){return {content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value,null,2)}]};}
function applyPatch(object,patch){
  for(const key of ['name','parentId','visible','locked'])if(key in patch)object[key]=patch[key];
  if(patch.transform)object.transform={position:patch.transform.position?.map(Number)||object.transform.position,rotation:patch.transform.rotation?.map(Number)||object.transform.rotation,scale:patch.transform.scale?.map(Number)||object.transform.scale};
  if(patch.properties)object.properties={...(object.properties||{}),...patch.properties};
  if(Array.isArray(patch.components))object.components=patch.components;
}
function sceneSummary(state){const scene=activeScene(state);return {engine:state.engine,project:state.project,activeSceneId:state.activeSceneId,scene:{id:scene.id,name:scene.name,settings:scene.settings,editorCamera:scene.editorCamera,objectCount:scene.objects.length,objects:scene.objects},selection:state.selection,editor:state.editor,commands:state.commands.slice(0,30),evidence:state.evidence.slice(0,30),activity:state.activity.slice(0,30)};}
function searchState(query){const state=readState(),scene=activeScene(state),q=String(query||'').toLowerCase(),includes=v=>JSON.stringify(v).toLowerCase().includes(q);return {objects:scene.objects.filter(includes),assets:state.assets.filter(includes),commands:state.commands.filter(includes).slice(0,30),evidence:state.evidence.filter(includes).slice(0,30),activity:state.activity.filter(includes).slice(0,30)};}

async function callTool(name,args={}){
  const v010Result=await callV010Tool(name,args);
  if(v010Result.handled)return response(v010Result.value);
  switch(name){
    case 'omniforge_get_state':{
      const state=readState();
      if(!args.compact)return response(sceneSummary(state));
      const scene=activeScene(state);return response({engine:state.engine,project:state.project,scene:{id:scene.id,name:scene.name,objectCount:scene.objects.length,objectIds:scene.objects.map(o=>o.id)},selection:state.selection,editor:state.editor,pendingCommands:state.commands.filter(c=>['queued','claimed','running'].includes(c.status))});
    }
    case 'omniforge_list_objects':{
      const objects=activeScene(readState()).objects.filter(o=>(!args.type||o.type===args.type)&&(!args.query||JSON.stringify(o).toLowerCase().includes(String(args.query).toLowerCase())));return response(objects);
    }
    case 'omniforge_search':return response(searchState(args.query));
    case 'omniforge_create_project':{const state=createProject({name:args.name,id:args.id,template:args.template||'empty-3d'});return response(state.project);}
    case 'omniforge_list_projects':return response(listProjects({includeArchived:Boolean(args.includeArchived)}));
    case 'omniforge_open_project':return response(openProject(args.projectId).project);
    case 'omniforge_duplicate_project':return response(duplicateProject(args.projectId,args.name).project);
    case 'omniforge_archive_project':return response(archiveProject(args.projectId).project);
    case 'omniforge_create_scene':{
      const {result}=mutateState(state=>{const starter=args.template==='starter-3d'?activeScene(readState()).objects.map(o=>structuredClone(o)):[createSceneObject('directionalLight',{id:`sun-${Date.now().toString(36)}`,position:[0,15,0],rotation:[-45,35,0]})];const scene={id:args.id||`scene-${Date.now().toString(36)}`,name:args.name,createdAt:now(),updatedAt:now(),settings:{skyTop:'#17243d',skyBottom:'#8ca6b8',ambientColor:'#b8c6d8',ambientIntensity:.34,gravity:-9.81,gridVisible:true,gridSize:100,gridStep:5,fogNear:90,fogFar:280,exposure:1},editorCamera:{position:[16,12,22],yaw:-.65,pitch:-.3,moveSpeed:12,fastMultiplier:3.5,fov:62,lookSensitivity:.0023,invertHorizontal:false,invertVertical:false},objects:starter};state.scenes.push(scene);state.activeSceneId=scene.id;state.selection.objectId=scene.objects[0]?.id||null;addActivity(state,'scene',`Codex created scene: ${scene.name}`);return scene;});return response(result);
    }
    case 'omniforge_create_object':{
      const {result}=mutateState(state=>{const object=createSceneObject(args.type,args);activeScene(state).objects.push(object);state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'object',`Codex created ${object.type}: ${object.name}`);return object;});return response(result);
    }
    case 'omniforge_update_object':{
      const {result}=mutateState(state=>{const object=findObject(state,args.objectId);if(!object)throw new Error('Object not found.');if(object.locked)throw new Error('Object is locked.');applyPatch(object,args.patch||{});state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'object',`Codex updated ${object.name}.`,{objectId:object.id});return object;});return response(result);
    }
    case 'omniforge_delete_object':{
      const {result}=mutateState(state=>{const scene=activeScene(state),object=scene.objects.find(o=>o.id===args.objectId);if(!object)throw new Error('Object not found.');if(object.locked)throw new Error('Object is locked.');scene.objects=scene.objects.filter(o=>o.id!==object.id&&o.parentId!==object.id);state.selection.objectId=scene.objects[0]?.id||null;addActivity(state,'object',`Codex deleted ${object.name}.`);return {deleted:object.id,name:object.name};});return response(result);
    }
    case 'omniforge_duplicate_object':{
      const {result}=mutateState(state=>{const object=findObject(state,args.objectId);if(!object)throw new Error('Object not found.');const clone=structuredClone(object);clone.id=`${object.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;clone.name=args.name||`${object.name} Copy`;clone.transform.position[0]+=1.5;activeScene(state).objects.push(clone);state.selection.objectId=clone.id;addActivity(state,'object',`Codex duplicated ${object.name}.`);return clone;});return response(result);
    }
    case 'omniforge_batch_edit':{
      const {result}=mutateState(state=>{const scene=activeScene(state),results=[];for(const op of args.operations||[]){if(op.action==='create'){const object=createSceneObject(op.type,op);scene.objects.push(object);results.push({action:'create',id:object.id});state.selection.objectId=object.id;}else if(op.action==='update'){const object=scene.objects.find(o=>o.id===op.objectId);if(!object)throw new Error(`Object not found: ${op.objectId}`);if(object.locked)throw new Error(`Object is locked: ${op.objectId}`);applyPatch(object,op.patch||{});results.push({action:'update',id:object.id});}else if(op.action==='delete'){const object=scene.objects.find(o=>o.id===op.objectId);if(!object)throw new Error(`Object not found: ${op.objectId}`);if(object.locked)throw new Error(`Object is locked: ${op.objectId}`);scene.objects=scene.objects.filter(o=>o.id!==op.objectId&&o.parentId!==op.objectId);results.push({action:'delete',id:op.objectId});}else if(op.action==='select'){state.selection.objectId=op.objectId||null;results.push({action:'select',id:op.objectId});}else if(op.action==='sceneSettings'){scene.settings={...scene.settings,...op.patch};results.push({action:'sceneSettings'});}else throw new Error(`Unsupported batch action: ${op.action}`);}addActivity(state,'batch',args.summary||`Codex applied ${results.length} scene operations.`,{results});return {summary:args.summary||'',results,revisionWillAdvance:true};});return response(result);
    }
    case 'omniforge_ground_object':{
      const {result}=mutateState(state=>{const object=findObject(state,args.objectId),terrain=activeScene(state).objects.find(item=>item.type==='terrain'&&item.visible);if(!object)throw new Error('Object not found.');if(!terrain)throw new Error('No visible authoritative terrain exists.');if(['terrain','path','directionalLight','pointLight','empty'].includes(object.type))throw new Error('This entity type cannot be grounded.');const half=Math.max(.05,Number(object.transform.scale?.[1]||1)*.5);object.transform.position[1]=terrainHeight(terrain,object.transform.position[0],object.transform.position[2])+half;state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'spatial',`Codex grounded ${object.name} to terrain.`,{objectId:object.id});return object;});return response(result);
    }
    case 'omniforge_list_materials':{
      const state=readState(),q=String(args.query||'').toLowerCase(),materials=state.assets.filter(asset=>asset.type==='material'&&(!q||JSON.stringify(asset).toLowerCase().includes(q))).map(asset=>({...asset,usedBy:state.scenes.flatMap(scene=>scene.objects.filter(object=>object.properties?.materialId===asset.id).map(object=>({sceneId:scene.id,objectId:object.id,name:object.name})))}));return response(materials);
    }
    case 'omniforge_apply_material':{
      const {result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===args.materialId&&item.type==='material');if(!asset)throw new Error('Material not found.');const object=findObject(state,args.objectId);if(!object)throw new Error('Object not found.');object.properties={...(object.properties||{}),materialId:asset.id};state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'asset',`Codex applied ${asset.name} to ${object.name}.`,{assetId:asset.id,objectId:object.id});return {asset,object};});return response(result);
    }
    case 'omniforge_update_material_settings':{
      const {result}=mutateState(state=>{const asset=state.assets.find(item=>item.id===args.materialId&&item.type==='material');if(!asset)throw new Error('Material not found.');asset.settings=normalizeMaterialSettings(args.settings||{},asset.settings||{});asset.updatedAt=now();addActivity(state,'asset',`Codex updated material settings: ${asset.name}.`,{assetId:asset.id,settings:asset.settings});return asset;});return response(result);
    }
    case 'omniforge_create_material_variant':{
      const {result}=mutateState(state=>{const source=state.assets.find(item=>item.id===args.materialId&&item.type==='material');if(!source)throw new Error('Material not found.');const variant=structuredClone(source);variant.id=`material-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;variant.name=args.name||`${source.name} Variant`;variant.sourceAssetId=source.id;variant.source=`Variant of ${source.name}`;variant.protected=false;variant.createdAt=now();variant.updatedAt=variant.createdAt;variant.settings=normalizeMaterialSettings(args.settings||{},source.settings||{});state.assets.unshift(variant);addActivity(state,'asset',`Codex created material variant: ${variant.name}.`,{assetId:variant.id,sourceAssetId:source.id});return variant;});return response(result);
    }
    case 'omniforge_list_surface_recipes':{
      const query=String(args.query||'').toLowerCase();const recipes=readState().assets.filter(item=>item.type==='surfaceRecipe'&&(!query||JSON.stringify(item).toLowerCase().includes(query)));return response(recipes);
    }
    case 'omniforge_update_surface_recipe':{
      const {result}=mutateState(state=>{const index=state.assets.findIndex(item=>item.id===args.recipeId&&item.type==='surfaceRecipe');if(index<0)throw new Error('Surface recipe not found.');const current=state.assets[index];const next=normalizeSurfaceRecipe({...current,...args,id:current.id,type:'surfaceRecipe',protected:current.protected,createdAt:current.createdAt},current);state.assets[index]=next;addActivity(state,'surface',`Codex updated surface recipe: ${next.name}.`,{recipeId:next.id,validation:next.validation});return next;});return response(result);
    }
    case 'omniforge_create_surface_recipe_variant':{
      const {result}=mutateState(state=>{const source=state.assets.find(item=>item.id===args.recipeId&&item.type==='surfaceRecipe');if(!source)throw new Error('Surface recipe not found.');const variant=normalizeSurfaceRecipe({...source,...args,id:`surface-recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,name:args.name||`${source.name} Variant`,sourceRecipeId:source.id,protected:false,createdAt:now()},source);state.assets.unshift(variant);addActivity(state,'surface',`Codex created surface recipe variant: ${variant.name}.`,{recipeId:variant.id,sourceRecipeId:source.id});return variant;});return response(result);
    }
    case 'omniforge_compile_surface_recipe':{
      const {result}=mutateState(state=>{const recipe=state.assets.find(item=>item.id===args.recipeId&&item.type==='surfaceRecipe');if(!recipe)throw new Error('Surface recipe not found.');recipe.compilation=compileSurfaceRecipe(recipe);recipe.updatedAt=now();addActivity(state,'surface',`Codex compiled surface recipe: ${recipe.name}.`,{recipeId:recipe.id,compilation:recipe.compilation});return recipe;});return response(result);
    }
    case 'omniforge_create_decal_recipe':{
      const {result}=mutateState(state=>{const material=state.assets.find(item=>item.id===args.materialId&&item.type==='material');if(!material)throw new Error('Material not found.');const recipe=normalizeDecalRecipe({id:`decal-${String(args.name).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now().toString(36)}`,name:args.name,materialId:material.id,category:args.category||'dirt',opacity:args.opacity??.85,projection:{depth:args.projectionDepth??.25,angle:90,surfaceLimit:.8},channels:args.channels||{baseColor:true,normal:Boolean(material.maps?.normal),roughness:Boolean(material.maps?.roughness),opacity:true},provenance:{source:material.source,license:material.license}});state.assets.unshift(recipe);addActivity(state,'decal',`Codex created decal recipe: ${recipe.name}.`,{decalId:recipe.id,materialId:material.id});return recipe;});return response(result);
    }
    case 'omniforge_place_decal':{
      const {result}=mutateState(state=>{const recipe=state.assets.find(item=>item.id===args.decalId&&item.type==='decalRecipe');if(!recipe)throw new Error('Decal recipe not found.');const material=state.assets.find(item=>item.id===recipe.materialId&&item.type==='material');if(!material)throw new Error('Decal material not found.');const size=Array.isArray(args.size)?args.size:[3,3],object=createSceneObject('decal',{name:recipe.name,position:args.position,rotation:args.rotation||[0,0,0],scale:[Math.max(.05,Number(size[0])),1,Math.max(.05,Number(size[1]))],properties:{decalRecipeId:recipe.id,materialId:material.id,color:'#ffffff',opacity:recipe.opacity,projectionDepth:recipe.projection.depth,sortOrder:recipe.sortOrder,castsShadows:false,receivesShadows:true,collider:false}});activeScene(state).objects.push(object);state.selection.objectId=object.id;addActivity(state,'decal',`Codex placed decal: ${recipe.name}.`,{decalId:recipe.id,objectId:object.id});return object;});return response(result);
    }
    case 'omniforge_create_surface_atlas':{
      const {result}=mutateState(state=>{const sources=args.materialIds.map(id=>state.assets.find(item=>item.id===id&&item.type==='material')).filter(Boolean);if(!sources.length)throw new Error('No valid material IDs were supplied.');const columns=Math.ceil(Math.sqrt(sources.length)),rows=Math.ceil(sources.length/columns),entries=sources.map((asset,index)=>({id:`entry-${index+1}`,assetId:asset.id,label:asset.name,rect:[(index%columns)/columns,Math.floor(index/columns)/rows,1/columns,1/rows]}));const atlas=normalizeAtlasRecipe({id:`${args.kind==='trim-sheet'?'trim':'atlas'}-${String(args.name).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now().toString(36)}`,name:args.name,kind:args.kind||'atlas',resolution:args.resolution||2048,entries});state.assets.unshift(atlas);addActivity(state,'surface',`Codex created ${atlas.kind}: ${atlas.name}.`,{atlasId:atlas.id,entries:atlas.entries.length});return atlas;});return response(result);
    }
    case 'omniforge_configure_path_blend':{
      const {result}=mutateState(state=>{const object=findObject(state,args.objectId);if(!object||object.type!=='path')throw new Error('A path object is required.');const numeric=(key,min,max)=>{if(args[key]!==undefined)object.properties[key]=Math.max(min,Math.min(max,Number(args[key])));};numeric('width',.2,100);numeric('blendDistance',.05,50);numeric('edgeNoise',0,8);numeric('vegetationExclusion',0,50);if(args.collider!==undefined)object.properties.collider=Boolean(args.collider);if(args.navigation!==undefined)object.properties.navigation=Boolean(args.navigation);object.properties.conformToTerrain=true;state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'path',`Codex configured terrain blend for ${object.name}.`,{objectId:object.id});return object;});return response(result);
    }
    case 'omniforge_create_prefab':{
      const {result}=mutateState(state=>{const object=findObject(state,args.objectId);if(!object)throw new Error('Object not found.');const prefab={id:args.id||`prefab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,name:args.name||object.name,sourceObjectId:object.id,object:structuredClone(object),createdAt:now()};state.prefabs=state.prefabs.filter(item=>item.id!==prefab.id);state.prefabs.unshift(prefab);addActivity(state,'prefab',`Codex created prefab: ${prefab.name}.`);return prefab;});return response(result);
    }
    case 'omniforge_instantiate_prefab':{
      const {result}=mutateState(state=>{const prefab=state.prefabs.find(item=>item.id===args.prefabId);if(!prefab)throw new Error('Prefab not found.');const object=structuredClone(prefab.object);object.id=`${object.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;object.name=args.name||prefab.name;if(Array.isArray(args.position))object.transform.position=args.position.map(Number);object.properties={...(object.properties||{}),prefabId:prefab.id};activeScene(state).objects.push(object);state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'prefab',`Codex instantiated prefab: ${prefab.name}.`);return object;});return response(result);
    }
    case 'omniforge_list_model_assets':{
      const state=readState(),query=String(args.query||'').toLowerCase();const assets=state.assets.filter(item=>item.type==='model').filter(asset=>(!query||JSON.stringify(asset).toLowerCase().includes(query))&&(!args.category||asset.category===args.category)&&(!args.approvalState||asset.approvalState===args.approvalState));for(const asset of assets)refreshSceneUsages(asset,state);return response(assets);
    }
    case 'omniforge_get_model_asset':{
      const state=readState(),asset=state.assets.find(item=>item.type==='model'&&item.id===args.assetId);if(!asset)throw new Error('Model asset not found.');refreshSceneUsages(asset,state);return response(asset);
    }
    case 'omniforge_import_model_from_project':{
      const target=safeWorkspacePath(args.path);if(!fs.existsSync(target)||!fs.statSync(target).isFile())throw new Error('Model file not found in the managed project workspace.');const buffer=fs.readFileSync(target),extension=path.extname(target).toLowerCase();if(!['.glb','.gltf'].includes(extension))throw new Error('Only GLB and embedded glTF files are supported.');const dataUrl=`data:${extension==='.glb'?'model/gltf-binary':'model/gltf+json'};base64,${buffer.toString('base64')}`;const asset=importModelAsset({assetRoot:ASSET_ROOT,name:args.name||path.basename(target,extension),fileName:path.basename(target),dataUrl,category:args.category,license:args.license,creator:args.creator||'User',source:`Managed project file: ${args.path}`,tags:args.tags});mutateState(state=>{const index=state.assets.findIndex(item=>item.id===asset.id);let stored;if(index>=0){state.assets[index]={...state.assets[index],...asset};stored=state.assets[index];}else{state.assets.unshift(asset);stored=asset;}const recipe=upsertAssetRecipe(state,stored);state.editor.selectedAssetId=stored.id;addActivity(state,'asset',`Codex imported 3D asset: ${stored.name}.`,{assetId:stored.id,assetRecipeId:recipe?.id,validation:stored.validation});});return response(asset);
    }
    case 'omniforge_rebuild_asset_import':{
      const {result}=mutateState(state=>{const asset=state.assets.find(item=>item.type==='model'&&item.id===args.assetId);if(!asset)throw new Error('Model asset not found.');rebuildCanonicalAsset({assetRoot:ASSET_ROOT,asset});const recipe=upsertAssetRecipe(state,asset);state.editor.selectedAssetId=asset.id;addActivity(state,'asset',`Codex rebuilt canonical import: ${asset.name}.`,{assetId:asset.id,assetRecipeId:recipe?.id,importerVersion:asset.canonicalImporterVersion,nodeTransformsApplied:asset.health?.nodeTransformsApplied,meshInstanceCount:asset.health?.meshInstanceCount});return asset;});return response(result);
    }
    case 'omniforge_repair_model_asset':{
      const {result}=mutateState(state=>{const source=state.assets.find(item=>item.type==='model'&&item.id===args.assetId);if(!source)throw new Error('Model asset not found.');const derivative=createSafeRepairDerivative({assetRoot:ASSET_ROOT,source,settings:{centerPivot:args.centerPivot!==false,unitScale:Number(args.unitScale||1)}});source.derivativeAssetIds=[...(source.derivativeAssetIds||[]),derivative.id];state.assets.unshift(derivative);const recipe=upsertAssetRecipe(state,derivative);upsertAssetRecipe(state,source);state.editor.selectedAssetId=derivative.id;addActivity(state,'asset',`Codex created safe repair derivative: ${derivative.name}.`,{assetId:derivative.id,assetRecipeId:recipe?.id,sourceAssetId:source.id});return derivative;});return response(result);
    }
    case 'omniforge_generate_model_collision':{
      const {result}=mutateState(state=>{const asset=state.assets.find(item=>item.type==='model'&&item.id===args.assetId);if(!asset)throw new Error('Model asset not found.');asset.collision=generateCollision(asset);asset.collisionStatus='generated';asset.updatedAt=now();const recipe=upsertAssetRecipe(state,asset);addActivity(state,'asset',`Codex generated bounds collision: ${asset.name}.`,{assetId:asset.id,assetRecipeId:recipe?.id});return asset;});return response(result);
    }
    case 'omniforge_generate_model_lods':{
      const {result}=mutateState(state=>{const asset=state.assets.find(item=>item.type==='model'&&item.id===args.assetId);if(!asset)throw new Error('Model asset not found.');asset.lods=generateLodsForAsset({assetRoot:ASSET_ROOT,asset,ratios:Array.isArray(args.ratios)?args.ratios:[.5,.2]});asset.updatedAt=now();const recipe=upsertAssetRecipe(state,asset);addActivity(state,'asset',`Codex generated model LODs: ${asset.name}.`,{assetId:asset.id,assetRecipeId:recipe?.id,lods:asset.lods});return asset;});return response(result);
    }
    case 'omniforge_preview_model_placement':{
      const {result}=mutateState(state=>{const asset=state.assets.find(item=>item.type==='model'&&item.id===args.assetId);if(!asset?.canonicalFile)throw new Error('Canonical model asset not found.');const scene=activeScene(state),terrain=scene.objects.find(object=>object.type==='terrain'),size=asset.bounds?.size||[1,1,1],center=asset.bounds?.center||[0,0,0],position=Array.isArray(args.position)?args.position.map(Number):[0,0,0];if(!Array.isArray(args.position))position[1]=terrainHeight(terrain,position[0],position[2])+Math.max(0,size[1]/2-center[1]);const object=createSceneObject('model',{name:asset.name,position,rotation:args.rotation,scale:args.scale,properties:{assetId:asset.id,color:'#aab4c6',metallic:Number(asset.material?.metallic||0),roughness:Number(asset.material?.roughness??.8),collider:asset.collisionStatus==='generated',collision:asset.collision||null,previewOnly:true,previewTransactionId:`asset-preview-${Date.now().toString(36)}`,castsShadows:true,receivesShadows:true}});scene.objects.push(object);state.selection.objectId=object.id;state.editor.lastFocusObjectId=object.id;addActivity(state,'asset',`Codex created model placement preview: ${asset.name}.`,{assetId:asset.id,objectId:object.id});return object;});return response(result);
    }
    case 'omniforge_commit_model_preview':{
      const {result}=mutateState(state=>{const object=findObject(state,args.objectId);if(!object||object.type!=='model'||!object.properties?.previewOnly)throw new Error('Model preview not found.');object.properties.previewOnly=false;object.properties.previewTransactionId=null;const asset=state.assets.find(item=>item.type==='model'&&item.id===object.properties.assetId);if(asset){refreshSceneUsages(asset,state);upsertAssetRecipe(state,asset);}addActivity(state,'asset',`Codex committed model placement: ${object.name}.`,{objectId:object.id});return object;});return response(result);
    }
    case 'omniforge_cancel_model_preview':{
      const {result}=mutateState(state=>{const scene=activeScene(state),object=scene.objects.find(item=>item.id===args.objectId&&item.type==='model'&&item.properties?.previewOnly);if(!object)throw new Error('Model preview not found.');scene.objects=scene.objects.filter(item=>item.id!==object.id);state.selection.objectId=scene.objects[0]?.id||null;addActivity(state,'asset',`Codex cancelled model placement preview: ${object.name}.`);return {cancelled:object.id};});return response(result);
    }
    case 'omniforge_search_marketplace':return response(await searchMarketplace({providerId:args.providerId,query:args.query||'',type:args.type||'all',limit:args.limit||30}));
    case 'omniforge_get_marketplace_asset':return response(await marketplaceDetails(args.providerId,args.assetId));
    case 'omniforge_download_marketplace_asset':{
      const asset=await marketplaceDetails(args.providerId,args.assetId),choice=(asset.downloadChoices||[]).find(item=>item.id===args.choiceId)||(asset.downloadChoices||[])[0];if(!choice)throw new Error('This catalog item requires manual download from its official source page.');const prepared=prepareMarketplaceDownload({providerId:asset.providerId,asset,choice});return response(createJob({providerId:asset.providerId,operation:'marketplace-download',title:`Download ${asset.name}`,inputs:prepared,settings:{}}));
    }
    case 'omniforge_import_marketplace_job':{
      const state=readState(),job=(state.jobs||[]).find(item=>item.id===args.jobId);if(!job)throw new Error('Download job not found.');if(job.state!=='succeeded')throw new Error('The marketplace download must finish before import.');const download=inspectDownloadedJob(job),resolved=resolveMarketplaceImportFiles(job);
      if(resolved.modelFiles.length){const file=resolved.modelFiles[0],buffer=fs.readFileSync(file),record=importModelAsset({assetRoot:ASSET_ROOT,name:download.asset?.name||path.basename(file,path.extname(file)),fileName:path.basename(file),dataUrl:`data:${path.extname(file).toLowerCase()==='.glb'?'model/gltf-binary':'model/gltf+json'};base64,${buffer.toString('base64')}`,category:download.asset?.category||'static-prop',license:download.asset?.license||'Review required',creator:download.asset?.creator||download.providerId,source:download.asset?.sourcePage||`${download.providerId}:${download.asset?.id||''}`,tags:[...(download.asset?.tags||[]),download.providerId,'marketplace']});const {result}=mutateState(root=>{const index=root.assets.findIndex(item=>item.id===record.id);if(index>=0)root.assets[index]={...root.assets[index],...record};else root.assets.unshift(record);upsertAssetRecipe(root,record);const live=(root.jobs||[]).find(item=>item.id===job.id);if(live){live.importedAssetId=record.id;live.stage='Imported into asset library';}addActivity(root,'marketplace',`Codex imported marketplace model: ${record.name}.`,{providerId:download.providerId,providerAssetId:download.asset?.id,assetId:record.id,jobId:job.id});return record;});return response(result);}
      if(Object.keys(resolved.maps).length){const material=createMaterialFromMarketplaceDownload({assetRoot:ASSET_ROOT,download}),{result}=mutateState(root=>{root.assets.unshift(material);const recipe=normalizeSurfaceRecipe({id:`surface-recipe-${material.id.replace(/^material-/,'')}`,name:`${material.name} Surface`,baseMaterialId:material.id,tags:[...(material.tags||[]),'surface-recipe']});material.surfaceRecipeId=recipe.id;root.assets.push(recipe);const live=(root.jobs||[]).find(item=>item.id===job.id);if(live){live.importedAssetId=material.id;live.stage='Imported into material library';}addActivity(root,'marketplace',`Codex imported marketplace material: ${material.name}.`,{materialId:material.id,providerId:download.providerId,jobId:job.id});return material;});return response(result);}
      throw new Error('The downloaded package contains no supported GLB, embedded glTF, or recognized PBR texture set.');
    }
    case 'omniforge_list_providers':{const providers=(readState().providers||[]).filter(provider=>!args.enabledOnly||provider.enabled);return response(providers);}
    case 'omniforge_update_provider':{
      const {result}=mutateState(state=>{const provider=(state.providers||[]).find(item=>item.id===args.providerId);if(!provider)throw new Error('Provider not found.');if(args.enabled!==undefined){if(provider.required&&!args.enabled)throw new Error('Required providers cannot be disabled.');provider.enabled=Boolean(args.enabled);provider.status={...provider.status,state:provider.enabled?'connected':'disconnected',message:provider.enabled?'Provider enabled through guarded MCP action.':'Provider disabled through guarded MCP action.'};}if(args.settings&&typeof args.settings==='object')provider.settings={...(provider.settings||{}),...args.settings};provider.updatedAt=now();addActivity(state,'provider',`Codex updated provider: ${provider.displayName}.`,{providerId:provider.id,enabled:provider.enabled});return provider;});return response(result);
    }
    case 'omniforge_run_provider_health':return response(createJob({providerId:args.providerId,operation:'provider-health-check',title:`Health check: ${args.providerId}`}));
    case 'omniforge_list_jobs':{let jobs=readState().jobs||[];if(args.state)jobs=jobs.filter(job=>job.state===args.state);if(args.providerId)jobs=jobs.filter(job=>job.providerId===args.providerId);return response(jobs.slice(0,Math.max(1,Math.min(500,Number(args.limit)||100))));}
    case 'omniforge_submit_job':{const allowed=new Set(['project-integrity','asset-index','diagnostic-delay']);if(!allowed.has(args.operation))throw new Error('Unsupported job operation.');return response(createJob({providerId:args.providerId||'local-worker-host',operation:args.operation,title:args.title,settings:args.settings||{},inputs:args.inputs||{},prompt:args.prompt||''}));}
    case 'omniforge_cancel_job':return response(cancelJob(args.jobId));
    case 'omniforge_retry_job':return response(retryJob(args.jobId));
    case 'omniforge_clear_completed_jobs':return response(clearCompletedJobs());
    case 'omniforge_get_commands':{const commands=readState().commands.filter(c=>!args.status||c.status===args.status);return response(commands);}
    case 'omniforge_claim_command':{
      const {result}=mutateState(state=>{const command=state.commands.find(c=>c.id===args.commandId);if(!command)throw new Error('Command not found.');if(command.status!=='queued')throw new Error(`Command is ${command.status}, not queued.`);command.status='claimed';command.claimedAt=now();addActivity(state,'command',`Codex claimed: ${command.text}`);return command;});return response(result);
    }
    case 'omniforge_complete_command':{
      const {result}=mutateState(state=>{const command=state.commands.find(c=>c.id===args.commandId);if(!command)throw new Error('Command not found.');command.status=args.status;command.completedAt=now();command.result=args.result;command.evidenceFiles=args.evidenceFiles||[];addActivity(state,'command',`Codex ${args.status}: ${command.text}`);return command;});return response(result);
    }
    case 'omniforge_request_capture':{
      const {result}=mutateState(state=>{if(args.objectId&&!findObject(state,args.objectId))throw new Error('Object not found.');const request={id:`capture-request-${Date.now().toString(36)}`,objectId:args.objectId||state.selection.objectId,title:args.title||'Codex requested 3D inspection',status:'pending',createdAt:now()};state.editor.captureRequest=request;if(request.objectId){state.selection.objectId=request.objectId;state.editor.lastFocusObjectId=request.objectId;}addActivity(state,'evidence',`Codex requested viewport capture: ${request.title}`);return request;});return response(result);
    }
    case 'omniforge_read_project_file':{
      const target=safeWorkspacePath(args.path);if(!fs.existsSync(target)||!fs.statSync(target).isFile())throw new Error('File not found.');const buffer=fs.readFileSync(target);const max=Math.min(Number(args.maxBytes||250000),1000000);if(buffer.length>max)throw new Error(`File exceeds maxBytes (${buffer.length}).`);return response(buffer.toString('utf8'));
    }
    case 'omniforge_write_project_file':{
      const target=safeWorkspacePath(args.path);if(args.createDirectories!==false)fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,String(args.content),'utf8');mutateState(state=>addActivity(state,'file',`Codex wrote project file: ${args.path}`,{bytes:Buffer.byteLength(String(args.content))}));return response({path:path.relative(WORKSPACE_ROOT,target).replaceAll('\\','/'),bytes:Buffer.byteLength(String(args.content))});
    }
    default:throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message){process.stdout.write(`${JSON.stringify(message)}\n`);}
async function handle(message){const {id,method,params}=message;try{if(method==='initialize'){mutateState(state=>{state.editor.codexStatus='connected';state.editor.lastCodexConnectionAt=now();addActivity(state,'connection','Codex connected through the OmniForge MCP bridge.');});return send({jsonrpc:'2.0',id,result:{protocolVersion:params?.protocolVersion||'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:SERVER_INFO,instructions:'Operate on the authoritative OmniForge scene through structured object and batch tools. Claim queued user commands before changing the world. Request viewport captures instead of inventing visual evidence. Do not assume a genre, project, or engine architecture that is not present.'}});}if(method==='ping')return send({jsonrpc:'2.0',id,result:{}});if(method==='tools/list')return send({jsonrpc:'2.0',id,result:{tools}});if(method==='tools/call')return send({jsonrpc:'2.0',id,result:await callTool(params?.name,params?.arguments||{})});if(method?.startsWith('notifications/'))return;send({jsonrpc:'2.0',id,error:{code:-32601,message:`Method not found: ${method}`}});}catch(error){if(id!==undefined)send({jsonrpc:'2.0',id,error:{code:-32000,message:error.message}});}}

console.error('OmniForge 0.9.0 MCP server started.');
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',line=>{if(!line.trim())return;try{handle(JSON.parse(line));}catch(error){console.error(`Invalid MCP message: ${error.message}`);}});

process.on('exit',()=>{
  try{
    mutateState(state=>{
      state.editor.codexStatus='available';
      addActivity(state,'connection','Codex MCP bridge disconnected.');
    });
  }catch{}
});
