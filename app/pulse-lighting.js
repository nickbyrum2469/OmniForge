const now=()=>typeof performance!=='undefined'?performance.now():Date.now();

function pulseEnabled(scene){
  const settings=scene?.settings||{};
  return settings.lightingMode==='pulse'||settings.pulseLighting?.enabled===true;
}

function relevantGeometryObject(object){
  return object?.visible!==false&&['box','plane','cylinder','model'].includes(object?.type);
}

function geometryKey(scene){
  const chunks=[scene?.id||'',scene?.objects?.length||0];
  for(const object of scene?.objects||[]){
    if(!relevantGeometryObject(object))continue;
    const t=object.transform||{},p=t.position||[],r=t.rotation||[],s=t.scale||[];
    chunks.push(object.id,object.type,object.visible!==false?1:0,
      p.map(Number).join(','),r.map(Number).join(','),s.map(Number).join(','),
      object.properties?.color||'',object.properties?.castsShadows===false?0:1);
  }
  return chunks.join('|');
}

function lightingKey(scene){
  const chunks=[scene?.settings?.lightingMode||'',JSON.stringify(scene?.settings?.pulseLighting||{})];
  for(const object of scene?.objects||[]){
    if(!['directionalLight','pointLight'].includes(object?.type))continue;
    const t=object.transform||{},p=t.position||[],r=t.rotation||[];
    chunks.push(object.id,object.type,object.visible!==false?1:0,p.map(Number).join(','),r.map(Number).join(','),
      object.properties?.color||'',Number(object.properties?.intensity||0),Number(object.properties?.range||0),object.properties?.castsShadows===false?0:1);
  }
  return chunks.join('|');
}

function serializeScene(scene){
  return {
    id:scene.id,
    settings:{
      lightingMode:scene.settings?.lightingMode,
      pulseLighting:structuredClone(scene.settings?.pulseLighting||{})
    },
    objects:(scene.objects||[]).filter(object=>
      relevantGeometryObject(object)||['directionalLight','pointLight'].includes(object.type)
    ).map(object=>({
      id:object.id,
      type:object.type,
      visible:object.visible!==false,
      transform:{
        position:[...(object.transform?.position||[0,0,0])],
        rotation:[...(object.transform?.rotation||[0,0,0])],
        scale:[...(object.transform?.scale||[1,1,1])]
      },
      properties:{
        color:object.properties?.color,
        metallic:object.properties?.metallic,
        roughness:object.properties?.roughness,
        intensity:object.properties?.intensity,
        range:object.properties?.range,
        castsShadows:object.properties?.castsShadows
      }
    }))
  };
}

const ZERO_SAMPLE=Object.freeze({
  normals:new Float32Array(18),
  irradiance:new Float32Array(18),
  directIrradiance:new Float32Array(18),
  ready:false
});

export class PulseLightingController{
  constructor(){
    this.worker=null;
    this.objects=new Map();
    this.generation=0;
    this.appliedGeneration=0;
    this.lastGeometryKey='';
    this.lastLightingKey='';
    this.lastSyncAt=-Infinity;
    this.stats={enabled:false,ready:false,solveMs:0,cells:0,links:0,bounces:0,deltaEnergy:0,maxDelta:0,error:null};
    if(typeof Worker!=='undefined'){
      try{
        this.worker=new Worker(new URL('./pulse-worker.js',import.meta.url),{type:'module'});
        this.worker.onmessage=event=>this.onMessage(event.data||{});
        this.worker.onerror=event=>{
          this.stats={...this.stats,error:event.message||'PULSE worker error',ready:false};
          console.error('PULSE worker error',event);
        };
      }catch(error){
        this.stats={...this.stats,error:error.message,ready:false};
      }
    }
  }

  onMessage(message){
    if(Number(message.generation||0)<this.appliedGeneration)return;
    if(message.type==='error'){
      this.stats={...this.stats,error:message.message||'Unknown PULSE error',ready:false};
      console.error('PULSE solve error',message.message,message.stack||'');
      return;
    }
    if(message.type!=='result')return;
    this.appliedGeneration=Number(message.generation||0);
    this.objects.clear();
    for(const [objectId,entry] of Object.entries(message.objects||{})){
      this.objects.set(objectId,{
        normals:new Float32Array(entry.normals||18),
        irradiance:new Float32Array(entry.irradiance||18),
        directIrradiance:new Float32Array(entry.directIrradiance||18),
        ready:true
      });
    }
    this.stats={...this.stats,...(message.stats||{}),ready:Boolean(message.stats?.enabled),error:null,version:message.version||null};
  }

  sync(scene,{force=false}={}){
    const enabled=pulseEnabled(scene);
    this.stats.enabled=enabled;
    if(!enabled){
      if(this.objects.size)this.objects.clear();
      this.stats.ready=false;
      return false;
    }
    if(!this.worker){
      this.stats.error=this.stats.error||'Web Worker unavailable';
      return false;
    }
    const t=now();
    if(!force&&t-this.lastSyncAt<120)return false;
    this.lastSyncAt=t;
    const nextGeometry=geometryKey(scene),nextLighting=lightingKey(scene);
    if(!force&&nextGeometry===this.lastGeometryKey&&nextLighting===this.lastLightingKey)return false;
    this.lastGeometryKey=nextGeometry;
    this.lastLightingKey=nextLighting;
    this.generation+=1;
    this.worker.postMessage({
      type:'sync',
      generation:this.generation,
      geometryKey:nextGeometry,
      lightingKey:nextLighting,
      scene:serializeScene(scene)
    });
    return true;
  }

  sampleObject(objectId){
    return this.objects.get(objectId)||ZERO_SAMPLE;
  }

  strength(scene){
    const value=Number(scene?.settings?.pulseLighting?.intensity??1);
    return Number.isFinite(value)?Math.max(0,Math.min(4,value)):1;
  }

  snapshot(){
    return {...this.stats,objects:this.objects.size,generation:this.appliedGeneration};
  }

  dispose(){
    this.worker?.terminate?.();
    this.worker=null;
    this.objects.clear();
  }
}
