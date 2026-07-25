from pathlib import Path

path = Path('app/renderer.js')
source = path.read_text(encoding='utf-8')
marker = '  renderDisplayPass(frame){'
if marker not in source:
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
    path.write_text(source, encoding='utf-8')
    print('Inserted the callable HDR display-transform pass.')
else:
    print('HDR display-transform method is already present.')
