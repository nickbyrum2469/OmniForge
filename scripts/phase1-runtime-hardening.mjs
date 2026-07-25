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
  let next = source.replace(
    "const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=new SkyPass(gl);",
    "const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=null;try{this.skyPass=new SkyPass(gl);}catch(error){console.error('Renderer-owned sky initialization failed; using the opaque environment fallback.',error);window.__omniforgeDiagnostics?.warn?.('sky-pass-initialization-failed',{message:error.message});}"
  );
  next = next.replace(
    "try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}",
    "if(this.skyPass){try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}}"
  );
  return next;
});

editPreservingEndings('app/app.js', source => source.replace(
`  const releaseViewportInput=()=>{
    if(viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');}
    viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);keys.clear();
  };`,
`  const releaseViewportInput=()=>{
    const wasNavigating=viewportDragLook||document.pointerLockElement===ui.viewport||Date.now()<viewportNavigationIntentUntil;
    if(viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');}
    viewportNavigationIntentUntil=0;endLookInputSession(lookInputState);keys.clear();
    if(wasNavigating&&cameraDirty)persistCameraSoon();
  };`
));

console.log('Applied Phase 1 sky fallback and viewport release hardening.');
