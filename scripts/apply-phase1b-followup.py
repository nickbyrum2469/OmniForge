from pathlib import Path

path = Path('app/renderer.js')
source = path.read_text(encoding='utf-8')

frame_import = "import { FrameResources, detectRenderCapabilities } from './frame-resources.js';"
hdr_import = "import { HDRPipeline } from './hdr-pipeline.js';"
if hdr_import not in source:
    if frame_import not in source:
        raise RuntimeError('Renderer FrameResources import anchor is missing.')
    source = source.replace(frame_import, frame_import + '\n' + hdr_import, 1)
    print('Inserted the authoritative HDRPipeline import.')

constructor_marker = 'this.hdrPipeline=new HDRPipeline(gl,this.capabilities);'
if constructor_marker not in source:
    capability_anchor = 'this.capabilities=detectRenderCapabilities(gl);'
    if capability_anchor not in source:
        raise RuntimeError('Renderer capability-construction anchor is missing.')
    source = source.replace(
        capability_anchor,
        capability_anchor + '\n    ' + constructor_marker,
        1
    )
    print('Inserted HDRPipeline construction.')

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

required_contracts = {
    'HDRPipeline import': hdr_import,
    'HDRPipeline constructor': constructor_marker,
    'HDR display pass': method_marker,
    'HDR presentation call': 'this.hdrPipeline.present',
    'display-transform graph pass': "name:'display-transform'",
    'HDR scene color resource': 'hdr-scene-color'
}
missing = [name for name, marker in required_contracts.items() if marker not in source]
if missing:
    raise RuntimeError('Phase 1B renderer integration is incomplete: ' + ', '.join(missing))

path.write_text(source, encoding='utf-8')
print('Phase 1B HDR renderer contracts are complete and callable.')
