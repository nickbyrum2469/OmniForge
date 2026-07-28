import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePathProperties, compilePathProfile } from '../app/worldgen.js';
import { buildPathwayCorridor, analyzePathwayCorridor } from '../app/pathway-corridor.js';
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

test('renderer and editor expose Pathway Studio authority and telemetry',()=>{
  const renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  assert.match(renderer,/pathwayCorridors:/);
  assert.match(renderer,/materialId:terrain\.properties\?\.materialId/);
  assert.match(renderer,/gl\.polygonOffset\(-2,-2\)/);
  assert.match(app,/renderPathwayInspector/);
  assert.match(app,/applyPathwayPreset/);
  assert.match(app,/fitPathwayLanesButton/);
  assert.doesNotMatch(app,/paints a soft, noise-broken material mask into the terrain instead of floating/);
});
