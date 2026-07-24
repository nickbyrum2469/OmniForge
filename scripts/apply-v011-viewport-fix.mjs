import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Expected source block was not found in ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
  return true;
}

replaceOnce(
  'app/app.js',
  "import { add, sub, scale, length, normalize, clamp, cameraForward, cameraRight } from './math.js';",
  "import { add, sub, scale, length, normalize, clamp, cameraForward, cameraRight } from './math.js';\nimport { cloneCamera, shouldPreserveViewportCamera } from './viewport-state.js';"
);

replaceOnce(
  'app/app.js',
  'let cameraPersistTimer = null;',
  'let cameraPersistTimer = null;\nlet cameraDirty = false;\nlet cameraMutationVersion = 0;'
);

replaceOnce(
  'app/app.js',
  "function markLocalMutation() { localMutationAt = Date.now();setSaveState('dirty'); }",
  "function markLocalMutation() { localMutationAt = Date.now();setSaveState('dirty'); }\nfunction noteCameraMutation() { cameraDirty = true;cameraMutationVersion += 1;localMutationAt = Date.now(); }"
);

replaceOnce(
  'app/app.js',
  `function applyState(nextState, options={}) {
  const previousSceneId = state?.activeSceneId;
  const previousSelected = selectedId;
  state = nextState;
  scene = activeScene();
  camera = scene.editorCamera;`,
  `function applyState(nextState, options={}) {
  const previousSceneId = state?.activeSceneId;
  const previousProjectId = state?.project?.id;
  const previousSelected = selectedId;
  const liveCamera = cloneCamera(camera);
  const preserveLiveCamera = shouldPreserveViewportCamera({
    sameAuthority: Boolean(liveCamera && previousProjectId === nextState?.project?.id && previousSceneId === nextState?.activeSceneId),
    navigationActive: viewportNavigationActive(),
    cameraDirty,
    requested: Boolean(options.preserveCamera)
  });
  state = nextState;
  scene = activeScene();
  camera = preserveLiveCamera && liveCamera ? liveCamera : scene.editorCamera;
  if (preserveLiveCamera && liveCamera) scene.editorCamera = cloneCamera(liveCamera);`
);

replaceOnce(
  'app/app.js',
  "const sensitivity=Number(camera.lookSensitivity||.0023);camera.yaw+=dx*sensitivity*(camera.invertHorizontal?-1:1);camera.pitch=clamp(camera.pitch+dy*sensitivity*(camera.invertVertical?1:-1),-Math.PI/2+.02,Math.PI/2-.02);",
  "const sensitivity=Number(camera.lookSensitivity||.0023);camera.yaw+=dx*sensitivity*(camera.invertHorizontal?-1:1);camera.pitch=clamp(camera.pitch+dy*sensitivity*(camera.invertVertical?1:-1),-Math.PI/2+.02,Math.PI/2-.02);scene.editorCamera=cloneCamera(camera);noteCameraMutation();"
);

replaceOnce(
  'app/app.js',
  "if(length(movement)>.001){camera.position=add(camera.position,scale(normalize(movement),speed*dt));scene.editorCamera=camera;}",
  "if(length(movement)>.001){camera.position=add(camera.position,scale(normalize(movement),speed*dt));scene.editorCamera=cloneCamera(camera);noteCameraMutation();}"
);

replaceOnce(
  'app/app.js',
  "function persistCameraSoon(){clearTimeout(cameraPersistTimer);cameraPersistTimer=setTimeout(()=>api('/api/editor',{method:'POST',body:{camera:{...camera,position:[...camera.position]}}}).then(next=>{state.engine.revision=next.engine.revision;}).catch(()=>{}),500);}",
  `function persistCameraSoon(){
  noteCameraMutation();
  clearTimeout(cameraPersistTimer);
  const requestedVersion=cameraMutationVersion;
  cameraPersistTimer=setTimeout(()=>{
    const persistedCamera=cloneCamera(camera);
    api('/api/editor',{method:'POST',body:{camera:persistedCamera}}).then(next=>{
      state.engine.revision=next.engine.revision;
      if(cameraMutationVersion===requestedVersion){cameraDirty=false;scene.editorCamera=cloneCamera(camera);}
    }).catch(()=>{});
  },500);
}`
);

replaceOnce(
  'app/app.js',
  "if(!state||Date.now()-localMutationAt<900||state.editor.mode==='play')return;",
  "if(!state||viewportNavigationActive()||cameraDirty||Date.now()-localMutationAt<900||state.editor.mode==='play')return;"
);

replaceOnce(
  'app/renderer.js',
  "import { terrainHeightAt as sharedTerrainHeightAt, pathBlendAt as sharedPathBlendAt, samplePathSpline, normalizeTerrainProperties, normalizePathProperties, terrainBounds } from './worldgen.js';",
  "import { terrainHeightAt as sharedTerrainHeightAt, pathBlendAt as sharedPathBlendAt, samplePathSpline, normalizeTerrainProperties, normalizePathProperties, terrainBounds } from './worldgen.js';\nimport { buildPathGuideSegments } from './path-visuals.js';"
);

replaceOnce(
  'app/renderer.js',
  `function pathLineData(object,terrain,paths){
  const properties=normalizePathProperties(object.properties||{},object.transform||{}),dense=samplePathSpline(object,{spacing:Math.max(.45,Number(properties.width||3)*.28)}),width=Number(properties.width||3),center=[],edges=[];
  for(let i=0;i<dense.length-1;i++){
    const a=dense[i],b=dense[i+1],dir=normalize([b.x-a.x,0,b.z-a.z]),side=normalize([-dir[2],0,dir[0]]),ay=terrainHeight(terrain,a.x,a.z,paths)+Number(properties.surfaceOffset||.03)+.06,by=terrainHeight(terrain,b.x,b.z,paths)+Number(properties.surfaceOffset||.03)+.06;
    center.push(a.x,ay,a.z,b.x,by,b.z);for(const sign of [-1,1])edges.push(a.x+side[0]*width*.5*sign,ay,a.z+side[2]*width*.5*sign,b.x+side[0]*width*.5*sign,by,b.z+side[2]*width*.5*sign);
  }
  return {center,edges};
}`,
  `function pathLineData(object,terrain,paths){
  const properties=normalizePathProperties(object.properties||{},object.transform||{}),width=Number(properties.width||3),dense=samplePathSpline(object,{spacing:Math.max(.25,width*.16)}),offset=Number(properties.surfaceOffset||.03)+.08;
  return buildPathGuideSegments(dense,width,(x,z)=>terrainHeight(terrain,x,z,paths),offset);
}`
);
