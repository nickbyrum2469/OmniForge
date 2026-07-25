from pathlib import Path

PATH = Path('app/renderer.js')
source = PATH.read_text(encoding='utf-8')


def replace_once(text, before, after, label):
    if after in text:
        return text
    if before not in text:
        raise RuntimeError(f'Phase 1A migration could not find {label}.')
    return text.replace(before, after, 1)


source = replace_once(
    source,
    "import { SkyPass } from './sky-pass.js';",
    "import { SkyPass } from './sky-pass.js';\nimport { RenderGraph } from './render-graph.js';\nimport { FrameResources, detectRenderCapabilities } from './frame-resources.js';",
    'renderer imports'
)

source = replace_once(
    source,
    """    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL 2 is required.');
    const gl=this.gl;this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=null;try{this.skyPass=new SkyPass(gl);}catch(error){console.error('Renderer-owned sky initialization failed; using the opaque environment fallback.',error);window.__omniforgeDiagnostics?.warn?.('sky-pass-initialization-failed',{message:error.message});}
""",
    """    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL 2 is required.');
    const gl=this.gl;
    this.contextLost=false;this.frameCounter=0;this.lastFrameReport=null;
    this.capabilities=detectRenderCapabilities(gl);
    this.frameResources=new FrameResources(canvas,gl,{maxDevicePixelRatio:2,onResize:result=>{
      this.renderGraph?.setResource('default-framebuffer',null,{kind:'framebuffer',format:'canvas',width:result.width,height:result.height,pixelRatio:result.pixelRatio,revision:result.revision});
      window.__omniforgeDiagnostics?.event?.('frame-resources-resized',result);
    }});
    this.boundContextLost=event=>this.handleContextLost(event);this.boundContextRestored=()=>this.handleContextRestored();
    canvas.addEventListener('webglcontextlost',this.boundContextLost,false);canvas.addEventListener('webglcontextrestored',this.boundContextRestored,false);
    this.meshProgram=program(gl,meshVS,meshFS);this.depthProgram=program(gl,depthVS,depthFS);this.lineProgram=program(gl,lineVS,lineFS);this.skyPass=null;try{this.skyPass=new SkyPass(gl);}catch(error){console.error('Renderer-owned sky initialization failed; using the opaque environment fallback.',error);window.__omniforgeDiagnostics?.warn?.('sky-pass-initialization-failed',{message:error.message});}
""",
    'renderer constructor initialization'
)

source = replace_once(
    source,
    """    this.createShadowResources(2048);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
""",
    """    this.createShadowResources(2048);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.renderGraph=this.createRenderGraph();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
""",
    'RenderGraph constructor connection'
)

source = replace_once(
    source,
    """    this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
""",
    """    this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    this.frameResources?.updateExternal('shadow-map',this.shadowTexture,{kind:'texture',format:'depth24',width:size,height:size,persistent:true});
    this.frameResources?.updateExternal('shadow-framebuffer',this.shadowFramebuffer,{kind:'framebuffer',width:size,height:size,persistent:true});
  }
""",
    'shadow resource registration'
)

source = replace_once(
    source,
    """  resize(){const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}}
""",
    """  resize(){return this.frameResources.syncCanvasSize();}
""",
    'frame-resource resize authority'
)

old_render = """  render(scene,camera,selectedId,options={}){
    const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('Renderer3D.render',{objects:scene.objects.length},12)||(()=>{});
    this.resize();
    const gl=this.gl,{viewProj}=this.cameraMatrices(camera),lights=this.lightState(scene,options.editorMode||'edit'),lightViewProj=this.lightMatrix(scene,lights);
    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    lights.environment=environment;
    lights.moonDir=environment.moonDirection;
    lights.moonColor=environment.moonColor;
    lights.moonIntensity=environment.moonLightIntensity;
    if(lights.shadows)this.renderShadow(scene,lightViewProj);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(this.skyPass){try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}}
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.cullFace(gl.BACK);
    const foliageGroups=this.foliageGroups(scene,camera),foliageIds=new Set([...foliageGroups.values()].flat().map(item=>item.id));
    const objects=scene.objects.filter(o=>o.visible&&!['empty','path'].includes(o.type)&&!foliageIds.has(o.id));objects.sort((a,b)=>{const rank=o=>o.type==='terrain'?-20:o.type==='decal'?20+Number(o.properties?.sortOrder||0):0;return rank(a)-rank(b);});for(const object of objects){const mesh=this.meshFor(object,scene);if(!mesh)continue;if(object.type==='decal'){gl.enable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);}this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.enable(gl.CULL_FACE);}}
    for(const instances of foliageGroups.values()){const object=instances[0],mesh=this.meshFor(object,scene);if(mesh)this.drawMesh(object,mesh,viewProj,lightViewProj,scene,false,camera,lights,instances);}
    this.ensureGrid(scene);if(scene.settings.gridVisible)this.drawLines(this.grid,mat4Identity(),viewProj,[.45,.56,.68,.18]);
    if(scene.settings.splinesVisible!==false){const xray=typeof document!=='undefined'&&document.body.classList.contains('v011-spline-editing');if(xray)gl.disable(gl.DEPTH_TEST);for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){const buffers=this.pathBuffers(pathObject,scene),selected=pathObject.id===selectedId;this.drawLines(buffers.edges,mat4Identity(),viewProj,selected?[.96,.56,1,1]:[.56,.34,.18,.7],selected?3:2);if(selected)this.drawLines(buffers.center,mat4Identity(),viewProj,[1,.9,1,1],3);}if(xray)gl.enable(gl.DEPTH_TEST);}
    const selected=scene.objects.find(o=>o.id===selectedId);if(selected&&selected.visible&&!['terrain','path','empty'].includes(selected.type)){gl.disable(gl.DEPTH_TEST);let selectionTransform=selected.transform;if(selected.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===selected.properties?.assetId),bounds=asset?.bounds;if(bounds)selectionTransform={position:[selected.transform.position[0]+(bounds.center?.[0]||0)*selected.transform.scale[0],selected.transform.position[1]+(bounds.center?.[1]||0)*selected.transform.scale[1],selected.transform.position[2]+(bounds.center?.[2]||0)*selected.transform.scale[2]],rotation:selected.transform.rotation,scale:[Math.max(.02,Math.abs((bounds.size?.[0]||1)*selected.transform.scale[0])),Math.max(.02,Math.abs((bounds.size?.[1]||1)*selected.transform.scale[1])),Math.max(.02,Math.abs((bounds.size?.[2]||1)*selected.transform.scale[2]))]};}this.drawLines(this.selectionBox,modelMatrix(selectionTransform),viewProj,[.72,.45,1,1],2);gl.enable(gl.DEPTH_TEST);}
    let webglError;
    if(window.__omniforgeDiagnostics?.enabled&&performance.now()-Number(this.lastDiagnosticGlCheck||0)>=1000){
      this.lastDiagnosticGlCheck=performance.now();
      webglError=gl.getError();
    }
    finishDiagnostic(webglError===undefined?{}:{webglError});
  }
"""

new_render = """  createRenderGraph(){
    const graph=new RenderGraph({gl:this.gl,diagnostics:window.__omniforgeDiagnostics,gpuSampleInterval:30});
    for(const [name,descriptor] of [
      ['scene',{kind:'authority'}],['camera',{kind:'authority'}],['lighting',{kind:'frame-state'}],['environment',{kind:'frame-state'}],
      ['default-framebuffer',{kind:'framebuffer',format:'canvas'}]
    ])graph.importResource(name,name==='default-framebuffer'?null:null,descriptor);
    graph.addPass({name:'shadow',category:'shadow',reads:['scene','camera','lighting'],writes:['shadow-map'],enabled:frame=>Boolean(frame.lights.shadows),execute:frame=>this.renderShadow(frame.scene,frame.lightViewProj)});
    graph.addPass({name:'environment',category:'environment',after:['shadow'],reads:['camera','environment','default-framebuffer'],writes:['scene-color','scene-depth'],execute:frame=>this.renderEnvironmentPass(frame)});
    graph.addPass({name:'opaque-world',category:'geometry',after:['environment'],reads:['scene','camera','lighting','environment','shadow-map','scene-color','scene-depth'],writes:['scene-color','scene-depth'],execute:frame=>this.renderOpaqueWorldPass(frame)});
    graph.addPass({name:'editor-overlays',category:'editor',after:['opaque-world'],reads:['scene','camera','scene-color','scene-depth'],writes:['scene-color'],execute:frame=>this.renderEditorOverlayPass(frame)});
    graph.addPass({name:'diagnostics',category:'diagnostics',after:['editor-overlays'],reads:['scene-color'],writes:['frame-telemetry'],critical:false,execute:frame=>this.renderDiagnosticsPass(frame)});
    graph.compile();
    return graph;
  }
  renderEnvironmentPass(frame){
    const {gl,camera,environment}=frame;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(this.skyPass){try{this.skyPass.render(camera,environment);}catch(error){window.__omniforgeDiagnostics?.warn?.('sky-pass-failed',{message:error.message});}}
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.cullFace(gl.BACK);
  }
  renderOpaqueWorldPass(frame){
    const {gl,scene,camera,selectedId,viewProj,lightViewProj,lights,foliageGroups,foliageIds}=frame;
    const objects=scene.objects.filter(o=>o.visible&&!['empty','path'].includes(o.type)&&!foliageIds.has(o.id));
    objects.sort((a,b)=>{const rank=o=>o.type==='terrain'?-20:o.type==='decal'?20+Number(o.properties?.sortOrder||0):0;return rank(a)-rank(b);});
    for(const object of objects){
      const mesh=this.meshFor(object,scene);if(!mesh)continue;
      if(object.type==='decal'){gl.enable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);}
      this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);
      if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.enable(gl.CULL_FACE);}
    }
    for(const instances of foliageGroups.values()){const object=instances[0],mesh=this.meshFor(object,scene);if(mesh)this.drawMesh(object,mesh,viewProj,lightViewProj,scene,false,camera,lights,instances);}
  }
  renderEditorOverlayPass(frame){
    const {gl,scene,camera,selectedId,viewProj}=frame;
    this.ensureGrid(scene);if(scene.settings.gridVisible)this.drawLines(this.grid,mat4Identity(),viewProj,[.45,.56,.68,.18]);
    if(scene.settings.splinesVisible!==false){
      const xray=typeof document!=='undefined'&&document.body.classList.contains('v011-spline-editing');if(xray)gl.disable(gl.DEPTH_TEST);
      for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){const buffers=this.pathBuffers(pathObject,scene),selected=pathObject.id===selectedId;this.drawLines(buffers.edges,mat4Identity(),viewProj,selected?[.96,.56,1,1]:[.56,.34,.18,.7],selected?3:2);if(selected)this.drawLines(buffers.center,mat4Identity(),viewProj,[1,.9,1,1],3);}
      if(xray)gl.enable(gl.DEPTH_TEST);
    }
    const selected=scene.objects.find(o=>o.id===selectedId);
    if(selected&&selected.visible&&!['terrain','path','empty'].includes(selected.type)){
      gl.disable(gl.DEPTH_TEST);let selectionTransform=selected.transform;
      if(selected.type==='model'){const asset=this.assets.find(item=>item.type==='model'&&item.id===selected.properties?.assetId),bounds=asset?.bounds;if(bounds)selectionTransform={position:[selected.transform.position[0]+(bounds.center?.[0]||0)*selected.transform.scale[0],selected.transform.position[1]+(bounds.center?.[1]||0)*selected.transform.scale[1],selected.transform.position[2]+(bounds.center?.[2]||0)*selected.transform.scale[2]],rotation:selected.transform.rotation,scale:[Math.max(.02,Math.abs((bounds.size?.[0]||1)*selected.transform.scale[0])),Math.max(.02,Math.abs((bounds.size?.[1]||1)*selected.transform.scale[1])),Math.max(.02,Math.abs((bounds.size?.[2]||1)*selected.transform.scale[2]))]};}
      this.drawLines(this.selectionBox,modelMatrix(selectionTransform),viewProj,[.72,.45,1,1],2);gl.enable(gl.DEPTH_TEST);
    }
  }
  renderDiagnosticsPass(frame){
    if(window.__omniforgeDiagnostics?.enabled&&performance.now()-Number(this.lastDiagnosticGlCheck||0)>=1000){
      this.lastDiagnosticGlCheck=performance.now();frame.webglError=frame.gl.getError();
    }
  }
  handleContextLost(event){
    event?.preventDefault?.();this.contextLost=true;this.frameResources.markContextLost();this.renderGraph?.suspend('webgl-context-lost');
    window.__omniforgeDiagnostics?.warn?.('webgl-context-lost',{frameIndex:this.frameCounter,resources:this.frameResources.snapshot()});
  }
  handleContextRestored(){
    this.contextLost=false;this.frameResources.markContextRestored();
    window.__omniforgeDiagnostics?.event?.('webgl-context-restored',{recoveryMode:this.capabilities.contextRecoveryMode,contextGeneration:this.frameResources.contextGeneration});
    setTimeout(()=>globalThis.location?.reload?.(),0);
  }
  getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport};}
  dispose(){
    this.resizeObserver?.disconnect?.();this.canvas.removeEventListener('webglcontextlost',this.boundContextLost,false);this.canvas.removeEventListener('webglcontextrestored',this.boundContextRestored,false);this.renderGraph?.dispose?.();
  }
  render(scene,camera,selectedId,options={}){
    const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('Renderer3D.render',{objects:scene.objects.length},12)||(()=>{});
    if(this.contextLost||this.frameResources.contextLost){finishDiagnostic({suspended:true,reason:'webgl-context-lost'});return;}
    this.resize();this.frameCounter+=1;
    const gl=this.gl,{viewProj}=this.cameraMatrices(camera),lights=this.lightState(scene,options.editorMode||'edit'),lightViewProj=this.lightMatrix(scene,lights);
    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    lights.environment=environment;lights.moonDir=environment.moonDirection;lights.moonColor=environment.moonColor;lights.moonIntensity=environment.moonLightIntensity;
    const foliageGroups=this.foliageGroups(scene,camera),foliageIds=new Set([...foliageGroups.values()].flat().map(item=>item.id));
    const frameResources=this.frameResources.beginFrame(this.frameCounter);
    const frame={gl,scene,camera,selectedId,options,viewProj,lights,lightViewProj,environment,foliageGroups,foliageIds,frameResources,resourceRevision:frameResources.revision,webglError:undefined};
    this.renderGraph.setResource('scene',scene);this.renderGraph.setResource('camera',camera);this.renderGraph.setResource('lighting',lights);this.renderGraph.setResource('environment',environment);
    let graphReport;
    try{graphReport=this.renderGraph.execute(frame);}catch(error){
      window.__omniforgeDiagnostics?.warn?.('render-graph-frame-failed',{message:error.message,frameIndex:this.frameCounter});
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(environment.groundColor[0],environment.groundColor[1],environment.groundColor[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      graphReport=this.renderGraph.lastReport;
    }
    this.lastFrameReport={frameIndex:this.frameCounter,frameResources,graph:graphReport,capabilities:this.capabilities};
    if(window.__omniforgeDiagnostics?.enabled)window.__omniforgeRenderGraph=this.getRenderDiagnostics();
    finishDiagnostic({webglError:frame.webglError,renderGraphCpuMs:graphReport?.totalCpuMs,resourceRevision:frameResources.revision,passCount:graphReport?.passes?.length||0});
  }
"""

source = replace_once(source, old_render, new_render, 'monolithic renderer frame')

PATH.write_text(source, encoding='utf-8')
print('Applied Phase 1A RenderGraph and frame-resource integration.')
