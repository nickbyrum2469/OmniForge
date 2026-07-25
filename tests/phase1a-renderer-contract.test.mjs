import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
const graphSource = fs.readFileSync(new URL('../app/render-graph.js', import.meta.url), 'utf8');
const resourcesSource = fs.readFileSync(new URL('../app/frame-resources.js', import.meta.url), 'utf8');
const plan = fs.readFileSync(new URL('../docs/PHASE_1A_RENDERGRAPH_FRAME_RESOURCES.md', import.meta.url), 'utf8');

const phase1bHdr = /import \{ HDRPipeline \} from '\.\/hdr-pipeline\.js';/.test(renderer);

test('Renderer3D submits the frame through one authoritative RenderGraph', () => {
  assert.match(renderer, /import \{ RenderGraph \} from '\.\/render-graph\.js';/);
  assert.match(renderer, /import \{ FrameResources, detectRenderCapabilities \} from '\.\/frame-resources\.js';/);
  assert.match(renderer, /this\.renderGraph=this\.createRenderGraph\(\)/);
  assert.match(renderer, /this\.renderGraph\.execute\(frame\)/);
  assert.match(renderer, /getRenderDiagnostics\(\)/);
});

test('Phase 1A pass names and dependencies remain unique as later phases extend the graph', () => {
  for (const name of ['shadow', 'environment', 'opaque-world', 'editor-overlays', 'diagnostics']) {
    const occurrences = renderer.match(new RegExp(`name:'${name}'`, 'g')) || [];
    assert.equal(occurrences.length, 1, `${name} must be declared exactly once`);
  }
  assert.match(renderer, /after:\['shadow'\]/);
  assert.match(renderer, /after:\['environment'\]/);
  if (phase1bHdr) {
    assert.match(renderer, /name:'display-transform'/);
    assert.match(renderer, /after:\['opaque-world'\]/);
    assert.match(renderer, /after:\['display-transform'\]/);
  } else {
    assert.match(renderer, /after:\['opaque-world'\]/);
  }
  assert.match(renderer, /after:\['editor-overlays'\]/);
});

test('monolithic renderer work is separated into explicit pass methods', () => {
  assert.match(renderer, /renderEnvironmentPass\(frame\)/);
  assert.match(renderer, /renderOpaqueWorldPass\(frame\)/);
  assert.match(renderer, /renderEditorOverlayPass\(frame\)/);
  assert.match(renderer, /renderDiagnosticsPass\(frame\)/);
  if (phase1bHdr) assert.match(renderer, /renderDisplayPass\(frame\)/);
  const renderMethod = renderer.slice(renderer.indexOf('  render(scene,camera,selectedId,options={}){'));
  assert.doesNotMatch(renderMethod.split('  rayFromScreen')[0], /for\(const object of objects\)/);
});

test('WebGL context loss suspends graph submission and restoration reloads authoritative state', () => {
  assert.match(renderer, /addEventListener\('webglcontextlost'/);
  assert.match(renderer, /event\?\.preventDefault\?\.\(\)/);
  assert.match(renderer, /this\.renderGraph\?\.suspend\('webgl-context-lost'\)/);
  assert.match(renderer, /addEventListener\('webglcontextrestored'/);
  assert.match(renderer, /contextRecoveryMode/);
  assert.match(renderer, /globalThis\.location\?\.reload\?\.\(\)/);
});

test('display mapping remains explicit and advances only through a declared phase boundary', () => {
  if (phase1bHdr) {
    assert.match(renderer, /hdr-scene-color/);
    assert.match(renderer, /name:'display-transform'/);
    assert.match(renderer, /this\.hdrPipeline\.present/);
    assert.doesNotMatch(renderer, /color\*=max\(\.05,uExposure\)/);
    assert.doesNotMatch(renderer, /color=\(color\*\(2\.51\*color\+\.03\)\)/);
  } else {
    assert.match(renderer, /color\*=max\(\.05,uExposure\)/);
    assert.match(renderer, /color=\(color\*\(2\.51\*color\+\.03\)\)/);
    assert.match(plan, /does not claim:[\s\S]*linear HDR scene color/i);
    assert.match(plan, /next phase[\s\S]*Phase 1B/i);
  }
});

test('RenderGraph and FrameResources expose the required safety contracts', () => {
  assert.match(graphSource, /dependency cycle/);
  assert.match(graphSource, /reads .* before it is imported or written/);
  assert.match(graphSource, /EXT_disjoint_timer_query_webgl2/);
  assert.match(graphSource, /suspend\(reason/);
  assert.match(resourcesSource, /syncCanvasSize\(\)/);
  assert.match(resourcesSource, /markContextLost\(\)/);
  assert.match(resourcesSource, /contextGeneration/);
  assert.match(resourcesSource, /detectRenderCapabilities/);
});
