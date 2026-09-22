import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPulseModel,
  solvePulseLighting,
  aggregatePulseObjects,
  normalizePulseSettings,
  PULSE_VERSION
} from '../engine/lighting/pulse-core.js';
import {
  PULSE_BENCHMARK_SETTINGS,
  PULSE_BENCHMARK_OBJECT_SPECS
} from '../engine/lighting/pulse-benchmark.js';

const object=(type,id,position,scale,color,extra={})=>({
  id,type,visible:true,
  transform:{position,rotation:[0,0,0],scale},
  properties:{color,...extra}
});

test('PULSE model is surface-attached and produces bounded transport links',()=>{
  const scene={
    settings:{lightingMode:'pulse',pulseLighting:{enabled:true,maxDistance:12,maxLinks:6,maxBounces:3}},
    objects:[
      object('box','left',[-2,1,0],[1,2,2],'#b33b32'),
      object('box','right',[2,1,0],[1,2,2],'#d7d7d2'),
      object('pointLight','lamp',[0,1,0],[1,1,1],'#ffffff',{intensity:6,range:8})
    ]
  };
  const model=buildPulseModel(scene);
  assert.equal(model.version,PULSE_VERSION);
  assert.equal(model.cells.length,12);
  assert.ok(model.links.some(list=>list.length>0));
  assert.ok(model.links.every(list=>list.length<=6));
  assert.ok(model.cells.every(cell=>cell.objectId==='left'||cell.objectId==='right'));
});

test('PULSE signed delta removes indirect energy when a light turns off',()=>{
  const scene={
    settings:{lightingMode:'pulse',pulseLighting:{enabled:true,maxDistance:12,maxLinks:8,maxBounces:3,bounceRetention:.7}},
    objects:[
      object('box','left',[-2,1,0],[1,2,2],'#b33b32'),
      object('box','right',[2,1,0],[1,2,2],'#d7d7d2'),
      object('pointLight','lamp',[0,1,0],[1,1,1],'#4c74ff',{intensity:8,range:8})
    ]
  };
  const model=buildPulseModel(scene);
  const on=solvePulseLighting(model,scene);
  const indirectEnergy=[...on.indirect].reduce((sum,value)=>sum+value,0);
  assert.ok(indirectEnergy>0);
  scene.objects.find(item=>item.id==='lamp').properties.intensity=0;
  const off=solvePulseLighting(model,scene,on.indirect);
  assert.ok([...off.delta].some(value=>value<0));
  assert.ok([...off.indirect].reduce((sum,value)=>sum+value,0)<indirectEnergy);
});

test('PULSE aggregates face irradiance per object for cheap WebGL2 sampling',()=>{
  const scene={
    settings:{lightingMode:'pulse',pulseLighting:{enabled:true}},
    objects:[
      object('box','receiver',[0,1,0],[2,2,2],'#ffffff'),
      object('pointLight','lamp',[0,4,0],[1,1,1],'#ffffff',{intensity:5,range:8})
    ]
  };
  const model=buildPulseModel(scene);
  const solved=solvePulseLighting(model,scene);
  const objects=aggregatePulseObjects(model,solved.indirect);
  assert.equal(objects.receiver.normals.length,18);
  assert.equal(objects.receiver.irradiance.length,18);
  assert.equal(objects.receiver.directIrradiance.length,18);
});

test('PULSE many-light direct lane includes lights beyond the legacy four-light forward path',()=>{
  const lights=Array.from({length:12},(_,i)=>object('pointLight','lamp-'+i,[-5+i,4,0],[1,1,1],i%2?'#ff8040':'#4080ff',{intensity:i<4?0:4.5,range:14}));
  const scene={
    settings:{lightingMode:'pulse',pulseLighting:{enabled:true,pointLightLimit:16,maxDistance:18,maxLinks:8,maxBounces:2}},
    objects:[object('box','receiver',[0,1,0],[5,2,5],'#ffffff'),...lights]
  };
  const model=buildPulseModel(scene);
  const solved=solvePulseLighting(model,scene);
  const directEnergy=[...solved.directPoint].reduce((sum,value)=>sum+value,0);
  assert.equal(solved.stats.pointLights,12);
  assert.ok(directEnergy>0,'lights 5-12 should still illuminate PULSE even when the first four are disabled');
  const aggregated=aggregatePulseObjects(model,solved.indirect,solved.directPoint);
  assert.ok(aggregated.receiver.directIrradiance.some(value=>value>0));
});

test('PULSE Atlas Hall is a dark 48-light stress environment',()=>{
  const settings=normalizePulseSettings(PULSE_BENCHMARK_SETTINGS);
  const pointLights=PULSE_BENCHMARK_OBJECT_SPECS.filter(item=>item.type==='pointLight');
  const geometry=PULSE_BENCHMARK_OBJECT_SPECS.filter(item=>['box','plane','cylinder','model'].includes(item.type));
  assert.equal(settings.enabled,true);
  assert.ok(PULSE_BENCHMARK_SETTINGS.ambientIntensity<.05);
  assert.ok(settings.pointLightLimit>=48);
  assert.equal(pointLights.length,48);
  assert.ok(geometry.length>=35);
  assert.ok(PULSE_BENCHMARK_OBJECT_SPECS.some(item=>item.name==='Movable Shutter Left'));
  assert.ok(PULSE_BENCHMARK_OBJECT_SPECS.some(item=>item.name==='Red Bounce Wall'));
  assert.ok(PULSE_BENCHMARK_OBJECT_SPECS.some(item=>item.name==='Blue Bounce Wall'));
});
