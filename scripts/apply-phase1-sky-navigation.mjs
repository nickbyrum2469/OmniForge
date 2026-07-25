import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Expected source block was not found in ${path}: ${before.slice(0, 80)}`);
  fs.writeFileSync(path, source.replace(before, after));
  return true;
}

function replaceRange(path, start, end, replacement, alreadyMarker) {
  const source = fs.readFileSync(path, 'utf8');
  if (alreadyMarker && source.includes(alreadyMarker)) return false;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Expected source range was not found in ${path}: ${start} -> ${end}`);
  fs.writeFileSync(path, source.slice(0, startIndex) + replacement + source.slice(endIndex));
  return true;
}

replaceOnce(
  'app/app.js',
  "import { cloneCamera, shouldPreserveViewportCamera } from './viewport-state.js';",
  "import { cloneCamera, shouldPreserveViewportCamera } from './viewport-state.js';\nimport { createLookInputState, beginLookInputSession, endLookInputSession, applyLookDelta } from './viewport-navigation.js';"
);

replaceOnce(
  'app/app.js',
  "let interactionActiveUntil = 0;\nlet remotePollInFlight = false;",
  "let interactionActiveUntil = 0;\nlet remotePollInFlight = false;\nlet viewportNavigationIntentUntil = 0;\nconst lookInputState = createLookInputState();"
);

replaceOnce(
  'app/app.js',
  "ui.viewportWrap.style.background = `linear-gradient(${scene.settings.skyTop} 0%, ${scene.settings.skyBottom} 72%, #26343c 100%)`;",
  "ui.viewportWrap.style.background = '#0b1018';\n  ui.viewportWrap.dataset.environmentRenderer = 'webgl';"
);

replaceOnce(
  'app/app.js',
  "function viewportNavigationActive(){return document.pointerLockElement===ui.viewport||viewportDragLook;}",
  "function viewportNavigationActive(){return document.pointerLockElement===ui.viewport||viewportDragLook||Date.now()<viewportNavigationIntentUntil;}"
);

replaceRange(
  'app/app.js',
  '  async function enterViewportNavigation(event){',
  "  ui.viewport.addEventListener('mousedown',event=>{",
  `  async function enterViewportNavigation(event){
    viewportNavigationIntentUntil=Date.now()+1600;
    noteUserInteraction(1800);
    ui.viewport.focus({preventScroll:true});
    if(event){const pick=renderer.pick(scene,camera,event.clientX,event.clientY);selectObject(pick?.id||null,true);}
    if(document.pointerLockElement===ui.viewport)return;
    try{
      const result=ui.viewport.requestPointerLock?.();
      if(result&&typeof result.then==='function')await result;
    }catch(error){
      viewportNavigationIntentUntil=0;
      endLookInputSession(lookInputState);
      pointerLockSupported=false;
      showToast('Pointer lock was blocked. Hold right mouse and use WASD as a fallback.','error');
    }
  }
`,
  'viewportNavigationIntentUntil=Date.now()+1600;'
);

replaceOnce(
  'app/app.js',
  "if(event.button===2){event.preventDefault();ui.viewport.focus({preventScroll:true});viewportDragLook=true;viewportDragLast=[event.clientX,event.clientY];ui.viewportWrap.classList.add('drag-look');}",
  "if(event.button===2){event.preventDefault();viewportNavigationIntentUntil=Date.now()+800;ui.viewport.focus({preventScroll:true});viewportDragLook=true;viewportDragLast=[event.clientX,event.clientY];beginLookInputSession(lookInputState,'right-drag');ui.viewportWrap.classList.add('drag-look');}"
);

replaceOnce(
  'app/app.js',
  "window.addEventListener('mouseup',event=>{if(event.button===2&&viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');keys.clear();persistCameraSoon();}});",
  "window.addEventListener('mouseup',event=>{if(event.button===2&&viewportDragLook){viewportDragLook=false;viewportDragLast=null;viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);ui.viewportWrap.classList.remove('drag-look');keys.clear();persistCameraSoon();}});"
);

replaceOnce(
  'app/app.js',
  "document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===ui.viewport;ui.viewportWrap.classList.toggle('pointer-locked',locked);if(locked){pointerLockSupported=true;showToast('Viewport navigation active','success');}else if(!viewportDragLook){keys.clear();persistCameraSoon();}});",
  "document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===ui.viewport;ui.viewportWrap.classList.toggle('pointer-locked',locked);if(locked){viewportNavigationIntentUntil=Date.now()+500;beginLookInputSession(lookInputState,'pointer-lock');pointerLockSupported=true;showToast('Viewport navigation active','success');}else if(!viewportDragLook){viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);keys.clear();persistCameraSoon();}});"
);

replaceOnce(
  'app/app.js',
  "document.addEventListener('pointerlockerror',()=>{pointerLockSupported=false;showToast('Pointer lock was denied. Hold right mouse and use WASD.','error');});",
  "document.addEventListener('pointerlockerror',()=>{viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);pointerLockSupported=false;showToast('Pointer lock was denied. Hold right mouse and use WASD.','error');});"
);

replaceRange(
  'app/app.js',
  "  document.addEventListener('mousemove',event=>{",
  "  document.addEventListener('keydown',event=>{",
  `  document.addEventListener('mousemove',event=>{
    let dx=0,dy=0,source='pointer-lock';
    if(document.pointerLockElement===ui.viewport){dx=event.movementX;dy=event.movementY;}
    else if(viewportDragLook&&viewportDragLast){source='right-drag';dx=event.clientX-viewportDragLast[0];dy=event.clientY-viewportDragLast[1];viewportDragLast=[event.clientX,event.clientY];}
    else return;
    const result=applyLookDelta(camera,lookInputState,{dx,dy,source,now:event.timeStamp||performance.now()});
    if(result.reason==='delta-spike')window.__omniforgeDiagnostics?.warn?.('viewport-look-delta-rejected',{source,dx,dy,rejectedSpikes:lookInputState.rejectedSpikes});
    if(!result.changed)return;
    scene.editorCamera=cloneCamera(camera);noteCameraMutation();
  });
  const releaseViewportInput=()=>{
    if(viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');}
    viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);keys.clear();
  };
  window.addEventListener('blur',releaseViewportInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseViewportInput();});
`,
  'viewport-look-delta-rejected'
);

replaceOnce(
  'app/renderer.js',
  "import { resolveViewportLighting } from './world-runtime.js';",
  "import { resolveViewportLighting } from './world-runtime.js';\nimport { normalizeEnvironmentState } from './environment-runtime.js';\nimport { SkyPass } from './sky-pass.js';"
);

replaceOnce(
  'app/renderer.js',
  "this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,preserveDrawingBuffer:true,premultipliedAlpha:false});",
  "this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true,premultipliedAlpha:false});"
);

replaceOnce(
  'app/renderer.js',
  "const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);",
  "const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=new SkyPass(gl);"
);

replaceOnce(
  'app/renderer.js',
  "set3('uFogColor',hexToRgb(scene.settings.skyBottom||'#8ca6b8'));set1('uFogNear',Number(scene.settings.fogNear??80));",
  "set3('uFogColor',lights.environment?.fogColor||hexToRgb(scene.settings.skyBottom||'#8ca6b8'));set1('uFogNear',Number(scene.settings.fogNear??80));"
);

replaceRange(
  'app/renderer.js',
  '    this.resize();const gl=this.gl,',
  '    const foliageGroups=this.foliageGroups(scene,camera)',
  `    this.resize();
    const gl=this.gl,{viewProj}=this.cameraMatrices(camera),lights=this.lightState(scene,options.editorMode||'edit'),lightViewProj=this.lightMatrix(scene,lights);
    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    lights.environment=environment;
    if(lights.shadows)this.renderShadow(scene,lightViewProj);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.cullFace(gl.BACK);
`,
  'const environment=normalizeEnvironmentState(scene,lights'
);

replaceRange(
  'app/v010.js',
  'function synchronizeRuntimeOnly() {',
  'function setStatus(message, error = false) {',
  `function synchronizeRuntimeOnly() {
  const target = window.__omniforgeV011Bridge?.snapshot?.();
  if (!target || !applyCompactWorldRuntime(target, snapshot?.runtime)) return false;
  const wrap = document.getElementById('viewportWrap');
  if (wrap) wrap.dataset.environmentRenderer = 'webgl';
  return true;
}

`,
  "wrap.dataset.environmentRenderer = 'webgl'"
);

replaceRange(
  'app/v010.js',
  'function applyViewportEnvironment() {',
  'function populate(options = {}) {',
  `function applyViewportEnvironment() {
  const wrap = document.getElementById('viewportWrap');
  if (!wrap) return;
  wrap.dataset.environmentRenderer = 'webgl';
  wrap.dataset.weather = String(snapshot?.world?.weather?.preset || 'clear');
}

`,
  "wrap.dataset.environmentRenderer = 'webgl';\n  wrap.dataset.weather"
);

{
  const path = 'app/v010.css';
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes("#viewportWrap[data-legacy-sky='1']")) {
    const start = source.indexOf('\n#viewportWrap {');
    if (start < 0) throw new Error('Legacy viewport atmosphere CSS block was not found.');
    const replacement = `
#viewportWrap {
  isolation: isolate;
  overflow: hidden;
  background: #0b1018;
}

#viewportWrap::before,
#viewportWrap::after {
  content: none;
  display: none;
  pointer-events: none;
}

#viewportWrap[data-legacy-sky='1']::before,
#viewportWrap[data-legacy-sky='1']::after {
  content: '';
}

#viewport {
  position: relative;
  z-index: 1;
  background: transparent;
}
`;
    fs.writeFileSync(path, source.slice(0, start) + replacement);
  }
}

console.log('Applied Phase 1 renderer-owned sky and guarded viewport navigation integration.');
