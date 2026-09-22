import { buildPulseModel, solvePulseLighting, aggregatePulseObjects, normalizePulseSettings, PULSE_VERSION } from '/engine/lighting/pulse-core.js';

let model=null;
let geometryKey='';
let lastIndirect=null;
let generation=0;

function post(type,payload={}){self.postMessage({type,...payload});}

self.onmessage=event=>{
  const message=event.data||{};
  if(message.type!=='sync')return;
  generation=Number(message.generation||generation+1);
  const scene=message.scene;
  if(!scene)return;
  const settings=normalizePulseSettings(scene.settings||{});
  if(!settings.enabled){
    model=null;geometryKey='';lastIndirect=null;
    post('result',{generation,version:PULSE_VERSION,objects:{},stats:{enabled:false}});
    return;
  }
  const started=performance.now();
  try{
    const rebuild=!model||geometryKey!==message.geometryKey;
    if(rebuild){
      model=buildPulseModel(scene);
      geometryKey=String(message.geometryKey||'');
      lastIndirect=null;
      post('status',{generation,stage:'graph',cells:model.cells.length,links:model.links.reduce((sum,list)=>sum+list.length,0)});
    }
    const solved=solvePulseLighting(model,scene,lastIndirect);
    lastIndirect=solved.indirect;
    const objects=aggregatePulseObjects(model,solved.indirect);
    post('result',{
      generation,
      version:PULSE_VERSION,
      objects,
      stats:{
        enabled:true,
        rebuild,
        cells:solved.stats.cells,
        links:solved.stats.links,
        bounces:solved.stats.bounces,
        deltaEnergy:solved.stats.deltaEnergy,
        maxDelta:solved.stats.maxDelta,
        solveMs:performance.now()-started
      }
    });
  }catch(error){
    post('error',{generation,message:error.message,stack:error.stack||''});
  }
};
