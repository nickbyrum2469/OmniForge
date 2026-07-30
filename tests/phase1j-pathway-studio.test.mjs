import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePathProperties, compilePathProfile, pathBlendAt, terrainHeightAt, terrainBaseHeightAt } from '../app/worldgen.js';
import { buildPathwayCorridor, analyzePathwayCorridor, validatePathwayMesh } from '../app/pathway-corridor.js';
import { buildPathGuideSegmentsFromCorridor } from '../app/path-visuals.js';
import { PATHWAY_PRESETS, applyPathwayPreset } from '../app/pathway-studio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terrain={id:'large',type:'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{preset:'rollingHills',sizeX:2048,sizeZ:2048,resolutionX:64,resolutionZ:64,height:34,seed:91}};
const pathObject={id:'mountain-route',type:'path',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{worldSpacePoints:true,points:[[-420,-260],[-120,30],[80,170],[390,250]],...PATHWAY_PRESETS.mountainRoad,carveTerrain:true}};

test('path properties expose engineering-grade corridor controls with bounded defaults',()=>{
  const properties=normalizePathProperties({});
  assert.equal(properties.carveTerrain,true);
  assert.equal(properties.bankMode,'auto');
  assert.ok(properties.shoulderWidth>0);
  assert.ok(properties.sideSlopeWidth>0);
  assert.ok(properties.meshSpacing>=.15);
  assert.ok(properties.profileSmoothingPasses>=0);
  assert.equal(properties.surfaceAuthority,'corridor');
  assert.equal(properties.terrainModificationAuthority,'corridor');
});

test('Pathway Studio presets preserve spline authority while applying complete road designs',()=>{
  const source={points:[[0,0],[10,0]],worldSpacePoints:true,materialId:'material-dirt',profileRevision:4};
  const next=applyPathwayPreset(source,'highway');
  assert.deepEqual(next.points,source.points);
  assert.equal(next.materialId,'material-dirt');
  assert.equal(next.laneCount,4);
  assert.equal(next.width,14.4);
  assert.equal(next.profileRevision,5);
});

test('grade-aware profile enforces grade while infeasible cut/fill becomes an explicit recommendation',()=>{
  const profile=compilePathProfile(pathObject,terrain);
  const properties=normalizePathProperties(pathObject.properties,pathObject.transform);
  assert.ok(profile.length>20);
  for(let index=1;index<profile.length;index++){
    const previous=profile[index-1],current=profile[index],distance=Math.max(1e-6,Math.hypot(current.x-previous.x,current.z-previous.z));
    assert.ok(Math.abs((current.y-previous.y)/distance)*100<=properties.maxGradePercent+.001);
    assert.ok(Number.isFinite(current.baseY));
    assert.ok(Number.isFinite(current.y));
  }
});

test('corridor contains road crown, shoulders, drainage slopes, and terrain seams',()=>{
  const mesh=buildPathwayCorridor(pathObject,terrain,[pathObject]);
  assert.ok(mesh.positions.length>500);
  assert.ok(mesh.indices.length>500);
  assert.equal(mesh.diagnostics.crossSectionBands,9);
  const firstRow=[...mesh.blends.slice(0,9)],expected=[0,.12,.48,1,1,1,.48,.12,0];
  assert.ok(firstRow.every((value,index)=>Math.abs(value-expected[index])<1e-5));
  assert.ok(mesh.diagnostics.triangleCount>0);
  assert.ok(mesh.diagnostics.renderLift>0);
  assert.ok([...mesh.normals].every(Number.isFinite));
});

test('route diagnostics surface terrain risk and civil-engineering recommendations',()=>{
  const diagnostics=analyzePathwayCorridor(pathObject,terrain,[pathObject]);
  assert.equal(diagnostics.valid,true);
  assert.ok(diagnostics.length>500);
  assert.ok(diagnostics.terrainSpacing>pathObject.properties.width);
  assert.ok(Array.isArray(diagnostics.warnings));
  assert.ok(diagnostics.warnings.some(message=>message.includes('terrain grid')));
});

test('the saved target-PC branch is blocked instead of producing an unbounded suspended slab',()=>{
  const savedTerrain={id:'terrain-main',type:'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{
    preset:'archipelago',sizeX:1000,sizeZ:1000,resolutionX:118,resolutionZ:118,height:31,seed:17,
    bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},macroScale:145,detailScale:26,octaves:10,
    lacunarity:2.03,gain:.5,warpStrength:38,ridgeStrength:.46,plateauStrength:.02,plateauSteps:7,
    valleyStrength:.05,valleyRadius:120,islandStrength:1,islandRadius:168,generatedRevision:45
  }};
  const savedPath={id:'path-branch',type:'path',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{
    worldSpacePoints:true,points:[[5.6,-2],[17.6,9],[30.6,16]],width:4.8,blendDistance:1.6,
    spline:true,splineTension:.5,samplesPerSegment:14,maxGradePercent:14,maxCutDepth:5,maxFillDepth:3,
    shoulderWidth:.9,shoulderDrop:.08,crownHeight:.08,sideSlopeWidth:3.4,meshSpacing:.55,
    drainageEnabled:true,ditchDepth:.22,carveTerrain:false,profileRevision:9
  }};
  const profile=compilePathProfile(savedPath,savedTerrain);
  assert.equal(profile.diagnostics.feasible,false);
  assert.equal(profile.diagnostics.gameplayReady,false);
  for(const station of profile){
    assert.ok(station.y>=station.baseY-5.0001);
    assert.ok(station.y<=station.baseY+3.0001);
  }
  const mesh=buildPathwayCorridor(savedPath,savedTerrain,[savedPath]);
  assert.equal(mesh.diagnostics.gameplayReady,false);
  assert.equal(mesh.diagnostics.constraintStatus,'blocked-infeasible-profile');
  assert.equal(mesh.diagnostics.verticalEdgeLimitExceeded,true);
  assert.equal(pathBlendAt([savedPath],17.6,9),0);
  assert.equal(terrainHeightAt(savedTerrain,17.6,9,[savedPath]),terrainBaseHeightAt(savedTerrain,17.6,9));
});

test('spline guide center and edges are extracted from the exact final corridor stations',()=>{
  const mesh=buildPathwayCorridor(pathObject,terrain,[pathObject]);
  const guide=buildPathGuideSegmentsFromCorridor(mesh,0);
  assert.ok(guide.center.length>6);
  assert.deepEqual(guide.center.slice(0,3),Array.from(mesh.positions.slice(4*3,4*3+3)));
  assert.deepEqual(guide.edges.slice(0,3),Array.from(mesh.positions.slice(3*3,3*3+3)));
});

test('mesh validation rejects non-finite, degenerate, and excessive vertical geometry',()=>{
  const positions=[0,0,0,1,0,0,0,20,1];
  const validation=validatePathwayMesh(positions,[0,1,2],3,{maximumVerticalEdge:8});
  assert.equal(validation.meshValid,false);
  assert.equal(validation.verticalEdgeLimitExceeded,true);
  const degenerate=validatePathwayMesh([0,0,0,1,0,0,2,0,0],[0,1,2],3);
  assert.equal(degenerate.meshValid,false);
  assert.equal(degenerate.degenerateTriangleCount,1);
});

test('renderer and editor expose Pathway Studio authority and telemetry',()=>{
  const renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  const v011=fs.readFileSync(path.join(ROOT,'app','v011.js'),'utf8');
  const styles=fs.readFileSync(path.join(ROOT,'app','styles.css'),'utf8');
  assert.match(renderer,/pathwayCorridors:/);
  assert.match(renderer,/materialId:terrain\.properties\?\.materialId/);
  assert.match(renderer,/gl\.polygonOffset\(-2,-2\)/);
  assert.match(app,/renderPathwayInspector/);
  assert.match(app,/applyPathwayPreset/);
  assert.match(app,/fitPathwayLanesButton/);
  assert.match(styles,/\.pathway-status\.bad/);
  assert.match(v011,/function pathNodeSelection\(object\)/);
  assert.match(v011,/selectedPathNodeId/);
  assert.match(v011,/type: 'move-node'/);
  assert.match(v011,/type: 'insert-node'/);
  assert.match(v011,/nearestCompiledStation/);
  assert.doesNotMatch(v011,/function nearestNetworkSegment/);
  assert.match(v011,/createPathNodeDragPreview/);
  assert.match(v011,/scheduleNodeDragPreview/);
  assert.doesNotMatch(v011,/setPathPreview\(draggingNode\.previewPath\)/);
  assert.match(v011,/path-node-drag-preview/);
  assert.match(v011,/\{ surface: 'base' \}/);
  assert.doesNotMatch(v011,/clearPathRuntimeCache/);
  assert.match(v011,/v012ApplyHandles/);
  assert.match(v011,/type: 'set-node-handles'/);
  assert.match(v011,/suggestPathNodeHandles/);
  assert.match(v011,/type: 'delete-node'/);
  assert.match(v011,/\/api\/v012\/path\//);
  assert.match(v011,/routeRestrictionsFromScene/);
  assert.match(v011,/Protected scene footprints/);
  assert.match(v011,/Grade cost/);
  assert.match(v011,/v012ShowRouteCosts/);
  assert.match(v011,/data-v012-runtime-status/);
  assert.match(v011,/Blocked — route is not gameplay-safe/);
  assert.match(renderer,/buildPathCostGuideData/);
  assert.doesNotMatch(app,/paints a soft, noise-broken material mask into the terrain instead of floating/);
});
