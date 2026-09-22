export const PULSE_BENCHMARK_SETTINGS = Object.freeze({
  skyTop:'#08111f',
  skyBottom:'#58748a',
  ambientColor:'#a8bdd0',
  ambientIntensity:0.035,
  gravity:-9.81,
  gridVisible:false,
  gridSize:120,
  gridStep:5,
  fogNear:110,
  fogFar:420,
  exposure:1,
  lightingMode:'pulse',
  pulseLighting:{
    enabled:true,
    intensity:1.18,
    maxBounces:3,
    maxLinks:12,
    maxDistance:32,
    bounceRetention:.70
  }
});

export const PULSE_BENCHMARK_CAMERA = Object.freeze({
  position:[0,5.8,32],
  yaw:0,
  pitch:-0.11,
  moveSpeed:14,
  fastMultiplier:3.5,
  fov:66,
  lookSensitivity:.0023,
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
  type:'pointLight',id,name,position,scale:[.55,.55,.55],properties:{color,intensity,range}
});

export const PULSE_BENCHMARK_OBJECT_SPECS = Object.freeze([
  {type:'directionalLight',id:'pulse-sun',name:'PULSE Sun',position:[0,18,0],rotation:[-38,32,0],properties:{color:'#fff0cf',intensity:1.15,castsShadows:true}},

  box('pulse-courtyard-floor','Courtyard Floor',[0,-.3,23],[42,.6,20],'#66717c',{roughness:.92}),
  box('pulse-main-floor','Foundry Floor',[0,-.3,-3],[34,.6,34],'#3b424b',{roughness:.94}),
  box('pulse-back-floor','Deep Gallery Floor',[0,-.3,-21],[34,.6,16],'#282d34',{roughness:.96}),

  box('pulse-left-shell','Left Exterior Wall',[-17,4,-4],[.6,8,50],'#c8d1d8',{roughness:.84}),
  box('pulse-right-shell','Right Exterior Wall',[17,4,-4],[.6,8,50],'#b9c6d1',{roughness:.84}),
  box('pulse-back-shell','Rear Exterior Wall',[0,4,-29],[34,.6,8],'#949fa9',{roughness:.88}),

  box('pulse-entry-left','Entry Left Pier',[-10,3.5,14],[14,7,.7],'#aeb9c3',{roughness:.82}),
  box('pulse-entry-right','Entry Right Pier',[10,3.5,14],[14,7,.7],'#aeb9c3',{roughness:.82}),
  box('pulse-entry-header','Entry Header',[0,7,14],[6,2.2,.7],'#6d7883',{roughness:.8}),

  box('pulse-occlusion-left','Black Occlusion Wall L',[-8,3.2,4],[12,6.4,.45],'#11151b',{roughness:.98}),
  box('pulse-occlusion-right','Black Occlusion Wall R',[8,3.2,4],[12,6.4,.45],'#11151b',{roughness:.98}),
  box('pulse-occlusion-header','Black Occlusion Header',[0,7,4],[4,2,.45],'#161a20',{roughness:.96}),

  box('pulse-red-wall','Red Bounce Wall',[-13.5,3,-8],[.45,6,12],'#7f2026',{roughness:.9}),
  box('pulse-blue-wall','Blue Bounce Wall',[13.5,3,-8],[.45,6,12],'#1e3e79',{roughness:.9}),
  box('pulse-neutral-back','Neutral Receiver Wall',[0,3,-15],[26,6,.45],'#c4c7c9',{roughness:.92}),

  box('pulse-center-divider','Thin Divider',[0,3,-8],[.22,6,13],'#252b32',{roughness:.96}),
  box('pulse-divider-cap','Divider Cap',[0,6.4,-8],[3.4,.24,.5],'#4a535d',{roughness:.78,metallic:.1}),

  box('pulse-left-ceiling','Left Canopy',[-9,7,-3],[15,.45,14],'#5d666d',{roughness:.82}),
  box('pulse-right-ceiling','Right Canopy',[9,7,-3],[15,.45,14],'#5a636d',{roughness:.82}),

  cylinder('pulse-pillar-a','Pillar A',[-11,3.2,10],[1.25,6.4,1.25],'#737c84',{roughness:.68}),
  cylinder('pulse-pillar-b','Pillar B',[11,3.2,10],[1.25,6.4,1.25],'#737c84',{roughness:.68}),
  cylinder('pulse-pillar-c','Pillar C',[-11,3.2,-16],[1.1,6.4,1.1],'#4d555e',{roughness:.72}),
  cylinder('pulse-pillar-d','Pillar D',[11,3.2,-16],[1.1,6.4,1.1],'#4d555e',{roughness:.72}),

  box('pulse-island-white','White Bounce Pedestal',[-5,1,-2],[4,2,4],'#dedbd1',{roughness:.7}),
  box('pulse-island-dark','Dark Receiver Pedestal',[5,1,-2],[4,2,4],'#11151a',{roughness:.95}),
  box('pulse-metal-monolith','Metal Monolith',[0,2.2,-20],[3,4.4,1.6],'#59636c',{roughness:.18,metallic:.82}),

  box('pulse-step-1','Gallery Step 1',[-7,.2,-20],[5,.4,4],'#6b7278',{roughness:.9}),
  box('pulse-step-2','Gallery Step 2',[-7,.45,-21.2],[5,.5,4],'#737a80',{roughness:.9}),
  box('pulse-step-3','Gallery Step 3',[-7,.7,-22.5],[5,.6,4],'#7b8287',{roughness:.9}),
  box('pulse-step-4','Gallery Step 4',[-7,.95,-23.8],[5,.7,4],'#848b90',{roughness:.9}),

  box('pulse-color-panel-red','Red Test Panel',[-6,2.4,-14.5],[4,4.8,.18],'#9d282d',{roughness:.88}),
  box('pulse-color-panel-blue','Blue Test Panel',[6,2.4,-14.5],[4,4.8,.18],'#244f9a',{roughness:.88}),
  box('pulse-color-panel-green','Green Test Panel',[0,2.4,-28.4],[4,4.8,.18],'#2d754c',{roughness:.88}),

  light('pulse-warm-light','Warm Atrium Light',[-7,4.4,0],'#ff9b54',8.2,18),
  light('pulse-blue-light','Blue Side-Room Light',[8.5,3.4,-7],'#4c74ff',8.6,17),
  light('pulse-red-light','Red Gallery Light',[-10,2.8,-20],'#ff4350',5.6,13),
  light('pulse-white-light','White Transition Light',[0,5.4,10],'#fff1d1',5.8,16)
]);

export function createPulseBenchmarkSceneObjects(createSceneObject){
  return PULSE_BENCHMARK_OBJECT_SPECS.map(spec=>createSceneObject(spec.type,spec));
}
