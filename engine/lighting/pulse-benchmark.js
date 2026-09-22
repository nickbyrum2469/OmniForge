export const PULSE_BENCHMARK_SETTINGS = Object.freeze({
  skyTop:'#03060b',
  skyBottom:'#111925',
  ambientColor:'#9db3c8',
  ambientIntensity:0.018,
  gravity:-9.81,
  gridVisible:false,
  gridSize:160,
  gridStep:5,
  fogNear:125,
  fogFar:520,
  exposure:1.05,
  lightingMode:'pulse',
  pulseLighting:{
    enabled:true,
    intensity:1.06,
    maxBounces:3,
    maxLinks:16,
    maxDistance:44,
    bounceRetention:.68,
    pointLightLimit:64,
    maxIrradiance:10
  },
  pulseBenchmark:{
    id:'atlas-hall-v2',
    expectedPointLights:48,
    purpose:'many-light direct visibility, occlusion, color bounce, long-range indirect response'
  }
});

export const PULSE_BENCHMARK_CAMERA = Object.freeze({
  position:[0,7.5,48],
  yaw:0,
  pitch:-0.08,
  moveSpeed:18,
  fastMultiplier:4,
  fov:68,
  lookSensitivity:.0022,
  invertHorizontal:false,
  invertVertical:false
});

const box=(id,name,position,scale,color,properties={})=>({
  type:'box',id,name,position,scale,properties:{color,roughness:.86,metallic:0,...properties}
});
const cylinder=(id,name,position,scale,color,properties={})=>({
  type:'cylinder',id,name,position,scale,properties:{color,roughness:.72,metallic:.05,...properties}
});
const light=(id,name,position,color,intensity,range)=>({
  type:'pointLight',id,name,position,scale:[.45,.45,.45],properties:{color,intensity,range,castsShadows:true}
});

function buildArchitecture(){
  const o=[
    {type:'directionalLight',id:'pulse-sun',name:'PULSE Exterior Sun',position:[0,22,0],rotation:[-28,24,0],properties:{color:'#ffe6c3',intensity:.42,castsShadows:true}},
    box('pulse-floor','Atlas Hall Floor',[0,-.3,-7],[56,.6,108],'#363b43',{roughness:.94}),
    box('pulse-left-shell','Left Hall Wall',[-28,5,-7],[.7,10,108],'#a9b5c0',{roughness:.88}),
    box('pulse-right-shell','Right Hall Wall',[28,5,-7],[.7,10,108],'#a5b0bb',{roughness:.88}),
    box('pulse-rear-shell','Rear Hall Wall',[0,5,-61],[56,10,.7],'#707b86',{roughness:.9}),
    box('pulse-entry-header','Entry Header',[0,9.2,38],[56,1.6,.8],'#20262e',{roughness:.82}),
    box('pulse-bounce-red','Red Bounce Wall',[-24,3,-14],[.45,6,22],'#992b32',{roughness:.9}),
    box('pulse-bounce-blue','Blue Bounce Wall',[24,3,-14],[.45,6,22],'#2853a3',{roughness:.9}),
    box('pulse-bounce-green','Green Bounce Wall',[0,3,-60],[16,6,.45],'#2d7c50',{roughness:.9}),
    box('pulse-neutral-receiver','Neutral Receiver',[0,3,-42],[30,6,.35],'#d0d0ca',{roughness:.93}),
    box('pulse-center-spine','Center Occlusion Spine',[0,3,-4],[.5,6,38],'#0b0e13',{roughness:.99}),
    box('pulse-shutter-left','Movable Shutter Left',[-7,3,14],[10,6,.35],'#10141a',{roughness:.99}),
    box('pulse-shutter-right','Movable Shutter Right',[7,3,14],[10,6,.35],'#10141a',{roughness:.99}),
    cylinder('pulse-metal-a','Metal Receiver A',[-8,2,-32],[2.8,4,2.8],'#79838d',{roughness:.2,metallic:.78}),
    cylinder('pulse-metal-b','Metal Receiver B',[8,2,-32],[2.8,4,2.8],'#646f79',{roughness:.26,metallic:.72}),
    box('pulse-white-island','White Bounce Island',[-9,1.1,-5],[6,2.2,6],'#e7e1d5',{roughness:.7}),
    box('pulse-black-island','Black Receiver Island',[9,1.1,-5],[6,2.2,6],'#080b10',{roughness:.97})
  ];
  for(let i=0;i<7;i++){
    const z=32-i*13;
    o.push(box('pulse-rib-'+i,'Ceiling Rib '+(i+1),[0,8.4,z],[54,.35,1.2],'#3d4650',{roughness:.82,metallic:.08}));
  }
  for(let i=0;i<8;i++){
    const z=28-i*10.5,side=i%2===0?-1:1;
    o.push(box('pulse-fin-'+i,'Occlusion Fin '+(i+1),[side*11.5,3.2,z],[9,.45,6.4],'#11151b',{roughness:.99}));
  }
  for(let i=0;i<6;i++){
    const z=20-i*12;
    o.push(box('pulse-receiver-l-'+i,'Left Receiver '+(i+1),[-18,1.2,z],[4.2,2.4,4.2],i%2?'#b6bcc2':'#7f878f',{roughness:.84}));
    o.push(box('pulse-receiver-r-'+i,'Right Receiver '+(i+1),[18,1.2,z],[4.2,2.4,4.2],i%2?'#929aa2':'#d0d4d5',{roughness:.84}));
  }
  return o;
}

function buildManyLights(){
  const o=[],palette=['#ff7a48','#ffd36a','#fff3d5','#7dc7ff','#557dff','#ba6cff'];
  let index=0;
  for(let row=0;row<5;row++){
    for(let col=0;col<6;col++){
      const x=-20+col*8,z=31-row*15,color=palette[(row*2+col)%palette.length];
      o.push(light('pulse-grid-'+row+'-'+col,'Atlas Ceiling '+(++index),[x,6.9,z],color,5.2+((row+col)%3)*.9,15.5));
    }
  }
  [27,15,3,-9,-21,-33].forEach((z,i)=>{
    o.push(light('pulse-side-l-'+i,'Left Rail '+(i+1),[-24,3.8,z],i%2?'#ff505d':'#ff9d4d',6.2,14));
    o.push(light('pulse-side-r-'+i,'Right Rail '+(i+1),[24,3.8,z],i%2?'#4d6dff':'#55c8ff',6.2,14));
  });
  const gallery=[
    [-12,3,-49,'#ff3f55'],[-6,4.8,-51,'#ff9f4a'],[0,3,-53,'#ffffff'],
    [6,4.8,-51,'#56a6ff'],[12,3,-49,'#7655ff'],[0,6.4,-57,'#7dffb0']
  ];
  gallery.forEach((v,i)=>o.push(light('pulse-gallery-'+i,'Deep Gallery '+(i+1),v.slice(0,3),v[3],7.4,16));
  return o;
}

export const PULSE_BENCHMARK_OBJECT_SPECS = Object.freeze([
  ...buildArchitecture(),
  ...buildManyLights()
]);

export function createPulseBenchmarkSceneObjects(createSceneObject){
  return PULSE_BENCHMARK_OBJECT_SPECS.map(spec=>createSceneObject(spec.type,spec));
}
