from pathlib import Path
import re

path = Path('app/renderer.js')
source = path.read_text(encoding='utf-8')

frame_import = "import { FrameResources, detectRenderCapabilities } from './frame-resources.js';"
hdr_import = "import { HDRPipeline } from './hdr-pipeline.js';"
if hdr_import not in source:
    if frame_import not in source:
        raise RuntimeError('Renderer FrameResources import anchor is missing.')
    source = source.replace(frame_import, frame_import + '\n' + hdr_import, 1)
    print('Inserted the authoritative HDRPipeline import.')
while source.count(hdr_import) > 1:
    source = source.replace(hdr_import + '\n' + hdr_import, hdr_import, 1)

constructor_marker = 'this.hdrPipeline=new HDRPipeline(gl,this.capabilities);'
if constructor_marker not in source:
    capability_anchor = 'this.capabilities=detectRenderCapabilities(gl);'
    if capability_anchor not in source:
        raise RuntimeError('Renderer capability-construction anchor is missing.')
    source = source.replace(capability_anchor, capability_anchor + '\n    ' + constructor_marker, 1)
    print('Inserted HDRPipeline construction.')

canonical_graph = '''  createRenderGraph(){
    const graph=new RenderGraph({gl:this.gl,diagnostics:window.__omniforgeDiagnostics,gpuSampleInterval:30});
    for(const [name,descriptor] of [
      ['scene',{kind:'authority'}],['camera',{kind:'authority'}],['lighting',{kind:'frame-state'}],['environment',{kind:'frame-state'}],
      ['default-framebuffer',{kind:'framebuffer',format:'canvas'}],['hdr-scene-color',{kind:'texture',format:'rgba16f'}],['hdr-scene-depth',{kind:'renderbuffer',format:'depth24'}]
    ])graph.importResource(name,name==='default-framebuffer'?null:null,descriptor);
    graph.addPass({name:'shadow',category:'shadow',reads:['scene','camera','lighting'],writes:['shadow-map'],enabled:frame=>Boolean(frame.lights.shadows),execute:frame=>this.renderShadow(frame.scene,frame.lightViewProj)});
    graph.addPass({name:'environment',category:'environment',after:['shadow'],reads:['camera','environment','default-framebuffer'],writes:['hdr-scene-color','hdr-scene-depth'],execute:frame=>this.renderEnvironmentPass(frame)});
    graph.addPass({name:'opaque-world',category:'geometry',after:['environment'],reads:['scene','camera','lighting','environment','shadow-map','hdr-scene-color','hdr-scene-depth'],writes:['hdr-scene-color','hdr-scene-depth'],execute:frame=>this.renderOpaqueWorldPass(frame)});
    graph.addPass({name:'display-transform',category:'display',after:['opaque-world'],reads:['hdr-scene-color','hdr-scene-depth','environment'],writes:['scene-color','scene-depth'],execute:frame=>this.renderDisplayPass(frame)});
    graph.addPass({name:'editor-overlays',category:'editor',after:['display-transform'],reads:['scene','camera','scene-color','scene-depth'],writes:['scene-color'],execute:frame=>this.renderEditorOverlayPass(frame)});
    graph.addPass({name:'diagnostics',category:'diagnostics',after:['editor-overlays'],reads:['scene-color'],writes:['frame-telemetry'],critical:false,execute:frame=>this.renderDiagnosticsPass(frame)});
    graph.compile();
    return graph;
  }
'''
source, graph_count = re.subn(
    r"  createRenderGraph\(\)\{.*?\n  \}\n(?=  renderEnvironmentPass\(frame\)\{)",
    canonical_graph,
    source,
    count=1,
    flags=re.S
)
if graph_count != 1:
    raise RuntimeError('Renderer RenderGraph block could not be normalized.')

source = source.replace(
    '    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);',
    '    this.hdrPipeline.bindScene(this.canvas.width,this.canvas.height);',
    1
)

method_marker = '  renderDisplayPass(frame){'
if method_marker not in source:
    anchor = '  renderOpaqueWorldPass(frame){'
    if anchor not in source:
        raise RuntimeError('Renderer opaque-pass insertion point is missing.')
    method = '''  renderDisplayPass(frame){
    this.hdrPipeline.present({
      exposure: frame.environment.exposureEV,
      saturation: frame.environment.saturation,
      contrast: frame.environment.contrast,
      vibrance: frame.environment.vibrance,
      toneMapper: frame.environment.toneMapper
    });
  }
'''
    source = source.replace(anchor, method + anchor, 1)
    print('Inserted the callable HDR display-transform pass.')

source = re.sub(
    r"getRenderDiagnostics\(\)\{return \{capabilities:this\.capabilities,frameResources:this\.frameResources\.snapshot\(\),(?:hdrPipeline:this\.hdrPipeline\.snapshot\(\),)?renderGraph:this\.renderGraph\.diagnosticsSnapshot\(\),lastFrameReport:this\.lastFrameReport\};\}",
    "getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport};}",
    source,
    count=1
)
source = re.sub(
    r"this\.renderGraph\?\.dispose\?\.\(\);(?:this\.hdrPipeline\?\.dispose\?\.\(\);)*",
    "this.renderGraph?.dispose?.();this.hdrPipeline?.dispose?.();",
    source
)

required_contracts = {
    'one HDRPipeline import': hdr_import,
    'one HDRPipeline constructor': constructor_marker,
    'one HDR display pass': method_marker,
    'HDR presentation call': 'this.hdrPipeline.present',
    'one display-transform graph pass': "name:'display-transform'",
    'HDR scene color resource': "['hdr-scene-color',{kind:'texture',format:'rgba16f'}]",
    'HDR scene depth resource': "['hdr-scene-depth',{kind:'renderbuffer',format:'depth24'}]",
    'HDR scene binding': 'this.hdrPipeline.bindScene(this.canvas.width,this.canvas.height);',
    'HDR diagnostics': 'hdrPipeline:this.hdrPipeline.snapshot()',
    'HDR disposal': 'this.hdrPipeline?.dispose?.();'
}
missing = [name for name, marker in required_contracts.items() if marker not in source]
if missing:
    raise RuntimeError('Phase 1B renderer integration is incomplete: ' + ', '.join(missing))
count_contracts = {
    'HDRPipeline import': source.count(hdr_import),
    'HDRPipeline constructor': source.count(constructor_marker),
    'display-transform graph pass': source.count("name:'display-transform'"),
    'HDR scene color declaration': source.count("['hdr-scene-color',{kind:'texture',format:'rgba16f'}]"),
    'HDR scene depth declaration': source.count("['hdr-scene-depth',{kind:'renderbuffer',format:'depth24'}]"),
    'HDR disposal': source.count('this.hdrPipeline?.dispose?.();')
}
invalid_counts = [f'{name}={count}' for name, count in count_contracts.items() if count != 1]
if invalid_counts:
    raise RuntimeError('Phase 1B renderer contracts are duplicated: ' + ', '.join(invalid_counts))

path.write_text(source, encoding='utf-8')
print('Phase 1B HDR RenderGraph is canonical, complete, and idempotent.')
