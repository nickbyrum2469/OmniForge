import { mutateState, activeScene, addActivity, createSceneObject } from '../server/state-store.mjs';
import {
  ensureWorldFoundationState,
  terrainDiagnostics,
  pathDiagnostics,
  updateTerrainProperties,
  updatePathProperties,
  expandTerrain,
  insertPathPoint,
  splitPath,
  normalizePathProperties,
  fitGroundContactV011
} from '../server/v011-systems.mjs';
import { TERRAIN_PRESETS } from '../app/worldgen.js';

export const v011Tools = [
  { name:'omniforge_get_world_foundation',description:'Read authoritative v0.11 terrain bounds, landform recipe, spline paths, grade profiles, expansion state, and diagnostics.',inputSchema:{type:'object',properties:{}} },
  { name:'omniforge_update_terrain_generator',description:'Update the authoritative terrain preset or advanced worldgen parameters without scaling existing paths or objects.',inputSchema:{type:'object',required:['terrainId','properties'],properties:{terrainId:{type:'string'},properties:{type:'object'}}} },
  { name:'omniforge_expand_world',description:'Expand terrain bounds north, south, east, west, or all directions while preserving existing world-space terrain samples and path nodes.',inputSchema:{type:'object',required:['terrainId','direction'],properties:{terrainId:{type:'string'},direction:{type:'string',enum:['north','south','east','west','all']},amount:{type:'number',minimum:1,maximum:10000}}} },
  { name:'omniforge_update_path_engineering',description:'Update spline tension, sampling, visibility, terrain cut/fill, maximum grade, and bounded cut/fill settings for one authoritative path.',inputSchema:{type:'object',required:['pathId','properties'],properties:{pathId:{type:'string'},properties:{type:'object'}}} },
  { name:'omniforge_insert_path_node',description:'Insert a world-space control node into the nearest segment of an authoritative spline path.',inputSchema:{type:'object',required:['pathId','x','z'],properties:{pathId:{type:'string'},x:{type:'number'},z:{type:'number'}}} },
  { name:'omniforge_split_path',description:'Split one spline path at a control node into two connected authoritative path objects.',inputSchema:{type:'object',required:['pathId','index'],properties:{pathId:{type:'string'},index:{type:'integer',minimum:1},name:{type:'string'}}} },
  { name:'omniforge_reverse_path',description:'Reverse path node order without changing its world-space shape.',inputSchema:{type:'object',required:['pathId'],properties:{pathId:{type:'string'}}} }
];

function findTerrain(state,id){const terrain=activeScene(state).objects.find(object=>object.id===id&&object.type==='terrain');if(!terrain)throw new Error('Terrain not found.');if(terrain.locked)throw new Error('Terrain is locked.');return terrain;}
function findPath(state,id){const path=activeScene(state).objects.find(object=>object.id===id&&object.type==='path');if(!path)throw new Error('Path not found.');if(path.locked)throw new Error('Path is locked.');return path;}

export async function callV011Tool(name,args={}){
  if(name==='omniforge_get_world_foundation'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const scene=activeScene(state),terrain=scene.objects.find(object=>object.type==='terrain'),paths=scene.objects.filter(object=>object.type==='path');return {foundation:state.worldFoundationV011,terrain,paths,presets:Object.entries(TERRAIN_PRESETS).map(([id,value])=>({id,...value})),terrainDiagnostics:terrain?terrainDiagnostics(terrain,paths):null,pathDiagnostics:terrain?paths.map(path=>({pathId:path.id,...pathDiagnostics(path,terrain)})):[]};});return {handled:true,value:result};
  }
  if(name==='omniforge_update_terrain_generator'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const terrain=findTerrain(state,args.terrainId),properties=updateTerrainProperties(terrain,args.properties||{}),scene=activeScene(state),diagnostics=terrainDiagnostics(terrain,scene.objects.filter(object=>object.type==='path'));addActivity(state,'worldgen',`Codex updated terrain generator: ${terrain.name}.`,{terrainId:terrain.id,preset:properties.preset});return {terrain,diagnostics};});return {handled:true,value:result};
  }
  if(name==='omniforge_expand_world'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const terrain=findTerrain(state,args.terrainId),bounds=expandTerrain(terrain,args.direction,Number(args.amount||terrain.properties.expandStep||100));addActivity(state,'worldgen',`Codex expanded ${terrain.name} ${args.direction}.`,{terrainId:terrain.id,bounds});return {terrain,bounds};});return {handled:true,value:result};
  }
  if(name==='omniforge_update_path_engineering'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),properties=updatePathProperties(path,args.properties||{}),terrain=activeScene(state).objects.find(object=>object.type==='terrain');addActivity(state,'path',`Codex updated spline engineering: ${path.name}.`,{pathId:path.id});return {path,properties,diagnostics:terrain?pathDiagnostics(path,terrain):null};});return {handled:true,value:result};
  }
  if(name==='omniforge_insert_path_node'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),inserted=insertPathPoint(path,Number(args.x),Number(args.z));updatePathProperties(path,{points:inserted.points});addActivity(state,'path',`Codex inserted a spline node on ${path.name}.`,{pathId:path.id,index:inserted.index});return {path,index:inserted.index};});return {handled:true,value:result};
  }
  if(name==='omniforge_split_path'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const scene=activeScene(state),path=findPath(state,args.pathId),properties=normalizePathProperties(path.properties||{},path.transform||{}),parts=splitPath(path,Number(args.index));updatePathProperties(path,{points:parts[0]});const created=createSceneObject('path',{name:String(args.name||`${path.name} Branch`).slice(0,120),position:[0,0,0],properties:{...properties,points:parts[1],worldSpacePoints:true,profileRevision:1}});scene.objects.push(created);state.selection.objectId=created.id;addActivity(state,'path',`Codex split ${path.name}.`,{sourcePathId:path.id,createdPathId:created.id});return {source:path,created};});return {handled:true,value:result};
  }
  if(name==='omniforge_reverse_path'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),properties=normalizePathProperties(path.properties||{},path.transform||{});updatePathProperties(path,{points:[...properties.points].reverse()});return path;});return {handled:true,value:result};
  }
  if(name==='omniforge_ground_object'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const scene=activeScene(state),object=scene.objects.find(item=>item.id===args.objectId);if(!object)throw new Error('Object not found.');const asset=object.properties?.assetId?state.assets.find(item=>item.id===object.properties.assetId&&item.type==='model'):null;const diagnostics=fitGroundContactV011({scene,object,asset,maxTilt:Number(args.maxTilt||35)});return {object,diagnostics};});return {handled:true,value:result};
  }
  return {handled:false,value:null};
}
