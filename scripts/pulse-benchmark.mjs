import { performance } from 'node:perf_hooks';
import { buildPulseModel, solvePulseLighting, aggregatePulseObjects, PULSE_VERSION } from '../engine/lighting/pulse-core.js';
import { PULSE_BENCHMARK_SETTINGS, PULSE_BENCHMARK_OBJECT_SPECS } from '../engine/lighting/pulse-benchmark.js';

const sceneObject=spec=>({
  id:spec.id,type:spec.type,name:spec.name,visible:true,
  transform:{position:[...(spec.position||[0,0,0])],rotation:[...(spec.rotation||[0,0,0])],scale:[...(spec.scale||[1,1,1])]},
  properties:{...(spec.properties||{})}
});

const scene={id:'pulse-atlas-headless',settings:structuredClone(PULSE_BENCHMARK_SETTINGS),objects:PULSE_BENCHMARK_OBJECT_SPECS.map(sceneObject)};
const buildStart=performance.now();
const model=buildPulseModel(scene);
const buildMs=performance.now()-buildStart;
const solveStart=performance.now();
const solved=solvePulseLighting(model,scene);
const solveMs=performance.now()-solveStart;
const objects=aggregatePulseObjects(model,solved.indirect,solved.directPoint);
const sum=array=>[...array].reduce((total,value)=>total+Math.max(0,Number(value)||0),0);
const result={
  version:PULSE_VERSION,pointLights:solved.stats.pointLights,geometryObjects:Object.keys(objects).length,
  cells:solved.stats.cells,links:solved.stats.links,bounces:solved.stats.bounces,
  buildMs:Number(buildMs.toFixed(3)),solveMs:Number(solveMs.toFixed(3)),
  directEnergy:Number(sum(solved.directPoint).toFixed(6)),indirectEnergy:Number(sum(solved.indirect).toFixed(6)),
  maxDelta:Number(solved.stats.maxDelta.toFixed(6))
};
console.log(JSON.stringify(result,null,2));
if(result.pointLights<48)throw new Error('PULSE benchmark did not include all 48 authored point lights.');
if(result.cells<150)throw new Error('PULSE benchmark geometry did not produce enough surface cells.');
if(result.directEnergy<=0)throw new Error('PULSE benchmark produced no many-light direct energy.');
if(result.indirectEnergy<=0)throw new Error('PULSE benchmark produced no indirect bounce energy.');
