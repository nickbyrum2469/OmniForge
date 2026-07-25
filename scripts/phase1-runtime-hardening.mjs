import fs from 'node:fs';

function editPreservingEndings(path, editor) {
  const original = fs.readFileSync(path, 'utf8');
  const ending = original.includes('\r\n') ? '\r\n' : '\n';
  const normalized = original.replace(/\r\n/g, '\n');
  const next = editor(normalized);
  if (next === normalized) return false;
  fs.writeFileSync(path, ending === '\r\n' ? next.replace(/\n/g, '\r\n') : next);
  return true;
}

editPreservingEndings('app/renderer.js', source => {
  const programPrefix = "    const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);";
  const guardedInitialization = "this.skyPass=null;try{this.skyPass=new SkyPass(gl);}catch(error){console.error('Renderer-owned sky initialization failed; using the opaque environment fallback.',error);window.__omniforgeDiagnostics?.warn?.('sky-pass-initialization-failed',{message:error.message});}";
  const guardedRender = "    if(this.skyPass){try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}}";
  const lines = source.split('\n');
  let sawConstructor = false;
  let sawRender = false;
  const next = lines.map(line => {
    if (line.startsWith(programPrefix)) {
      sawConstructor = true;
      return `${programPrefix}${guardedInitialization}`;
    }
    if (line.includes('this.skyPass.render(camera,environment)') && line.includes('sky-pass-failed')) {
      sawRender = true;
      return guardedRender;
    }
    return line;
  });
  if (!sawConstructor) throw new Error('Renderer constructor program initialization was not found.');
  if (!sawRender) throw new Error('Renderer sky-pass invocation was not found.');
  return next.join('\n');
});

editPreservingEndings('app/app.js', source => {
  const oldBlock = `  const releaseViewportInput=()=>{
    if(viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');}
    viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);keys.clear();
  };`;
  const guardedBlock = `  const releaseViewportInput=()=>{
    const wasNavigating=viewportDragLook||document.pointerLockElement===ui.viewport||Date.now()<viewportNavigationIntentUntil;
    if(viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');}
    viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);keys.clear();
    if(wasNavigating&&cameraDirty)persistCameraSoon();
  };`;
  return source.includes(guardedBlock) ? source : source.replace(oldBlock, guardedBlock);
});

console.log('Applied idempotent Phase 1 sky fallback and viewport release hardening.');
