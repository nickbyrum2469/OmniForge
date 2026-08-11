import { mutateState, activeScene, addActivity } from '../server/state-store.mjs';
import {
  ensureWorldFoundationState,
  terrainDiagnostics,
  pathDiagnostics,
  updateTerrainProperties,
  expandTerrain,
  applyLegacyPathCompatibilityMutation,
  fitGroundContactV011
} from '../server/v011-systems.mjs';
import { TERRAIN_PRESETS } from '../app/worldgen.js';

export const v011Tools = [
  { name:'omniforge_get_world_foundation',description:'Read authoritative v0.11 terrain bounds, landform recipe, spline paths, grade profiles, expansion state, and diagnostics.',inputSchema:{type:'object',properties:{}} },
  { name:'omniforge_update_terrain_generator',description:'Update the authoritative terrain preset or advanced worldgen parameters without scaling existing paths or objects.',inputSchema:{type:'object',required:['terrainId','properties'],properties:{terrainId:{type:'string'},properties:{type:'object'}}} },
  { name:'omniforge_expand_world',description:'Expand terrain bounds north, south, east, west, or all directions while preserving existing world-space terrain samples and path nodes.',inputSchema:{type:'object',required:['terrainId','direction'],properties:{terrainId:{type:'string'},direction:{type:'string',enum:['north','south','east','west','all']},amount:{type:'number',minimum:1,maximum:10000}}} },
  { name:'omniforge_update_path_engineering',description:'Compatibility name that updates supported schema-v2 Path Network engineering, width, spline mode, visibility, collision, and navigation fields. Unsupported legacy-only fields fail with v2 transaction guidance.',inputSchema:{type:'object',required:['pathId','properties'],properties:{pathId:{type:'string'},expectedRevision:{type:'integer',minimum:1},properties:{type:'object'}}} },
  { name:'omniforge_insert_path_node',description:'Compatibility name that inserts a stable schema-v2 node into the nearest compiled Path Network segment.',inputSchema:{type:'object',required:['pathId','x','z'],properties:{pathId:{type:'string'},x:{type:'number'},y:{type:'number'},z:{type:'number'},expectedRevision:{type:'integer',minimum:1}}} },
  { name:'omniforge_split_path',description:'Legacy points-based split is disabled because it cannot preserve schema-v2 graph authority. Use stable v2 node/segment transactions and merge operations.',inputSchema:{type:'object',required:['pathId','index'],properties:{pathId:{type:'string'},index:{type:'integer',minimum:1},name:{type:'string'},expectedRevision:{type:'integer',minimum:1}}} },
  { name:'omniforge_reverse_path',description:'Compatibility name that reverses every schema-v2 segment direction without changing the compiled centerline.',inputSchema:{type:'object',required:['pathId'],properties:{pathId:{type:'string'},expectedRevision:{type:'integer',minimum:1}}} }
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
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),terrain=activeScene(state).objects.find(object=>object.type==='terrain'),compatibility=applyLegacyPathCompatibilityMutation(path,terrain,'update-engineering',{properties:args.properties||{},expectedRevision:args.expectedRevision}),diagnostics=pathDiagnostics(path,terrain);addActivity(state,'path-network',`Codex delegated legacy engineering update to ${path.name} Path Network revision ${compatibility.network.revision}.`,{pathId:path.id,revision:compatibility.network.revision});return {...compatibility,properties:path.properties,diagnostics};});return {handled:true,value:result};
  }
  if(name==='omniforge_insert_path_node'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),terrain=activeScene(state).objects.find(object=>object.type==='terrain'),compatibility=applyLegacyPathCompatibilityMutation(path,terrain,'insert-node',args);state.selection.objectId=path.id;addActivity(state,'path-network',`Codex inserted stable node ${compatibility.nodeId} on ${path.name}.`,{pathId:path.id,nodeId:compatibility.nodeId,revision:compatibility.network.revision});return compatibility;});return {handled:true,value:result};
  }
  if(name==='omniforge_split_path'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),terrain=activeScene(state).objects.find(object=>object.type==='terrain');return applyLegacyPathCompatibilityMutation(path,terrain,'split',args);});return {handled:true,value:result};
  }
  if(name==='omniforge_reverse_path'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const path=findPath(state,args.pathId),terrain=activeScene(state).objects.find(object=>object.type==='terrain'),compatibility=applyLegacyPathCompatibilityMutation(path,terrain,'reverse',args);state.selection.objectId=path.id;addActivity(state,'path-network',`Codex reversed ${path.name} Path Network segment directions.`,{pathId:path.id,revision:compatibility.network.revision});return compatibility;});return {handled:true,value:result};
  }
  if(name==='omniforge_ground_object'){
    const {result}=mutateState(state=>{ensureWorldFoundationState(state);const scene=activeScene(state),object=scene.objects.find(item=>item.id===args.objectId);if(!object)throw new Error('Object not found.');const asset=object.properties?.assetId?state.assets.find(item=>item.id===object.properties.assetId&&item.type==='model'):null;const diagnostics=fitGroundContactV011({scene,object,asset,maxTilt:Number(args.maxTilt||35)});return {object,diagnostics};});return {handled:true,value:result};
  }
  return {handled:false,value:null};
}
