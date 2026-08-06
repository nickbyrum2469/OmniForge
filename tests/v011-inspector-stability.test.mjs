import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Scene Block inspector enhancement has a stable marker and coalesced observer', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  const referenceStart = source.indexOf('function referencePanel');
  const referenceEnd = source.indexOf('function enhanceInspector', referenceStart);
  const referencePanel = source.slice(referenceStart, referenceEnd);
  const observerStart = source.indexOf('function watchInspector');
  const observerEnd = source.indexOf('async function bootstrap', observerStart);
  const observer = source.slice(observerStart, observerEnd);

  assert.match(referencePanel, /data-v011-panel="reference"/);
  assert.match(observer, /if \(inspectorEnhanceQueued\) return/);
  assert.match(observer, /inspectorEnhanceQueued = false;\s*enhanceInspector\(\)/);
});

test('object inspector bindings stay scoped to the replaceable inspector subtree', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'app.js'), 'utf8');
  const bindingStart = source.indexOf('function bindInspector');
  const bindingEnd = source.indexOf('function hashText', bindingStart);
  const binding = source.slice(bindingStart, bindingEnd);

  assert.match(binding, /const container = ui\.inspectorContent/);
  assert.match(binding, /const find = selector => container\.querySelector\(selector\)/);
  assert.match(binding, /const findAll = selector => container\.querySelectorAll\(selector\)/);
  assert.doesNotMatch(binding, /\$\$\(/);
  assert.doesNotMatch(binding, /(?<![A-Za-z])\$\(/);
});

test('diagnostic mode includes input, event-loop, WebGL, and long-task evidence', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'runtime-diagnostics.js'), 'utf8');
  for (const evidence of [
    'event-loop-stall',
    'webgl-context-lost',
    'long-task',
    'unhandled-rejection'
  ]) assert.match(source, new RegExp(evidence));
  assert.match(source, /for \(const type of \['pointerdown', 'click'\]\)/);
  assert.match(source, /log\(`input-\$\{type\}`/);
  assert.match(source, /JSON\.stringify\(detail\)/);
});

test('spline drag instrumentation uses the runtime diagnostics API that exists in packaged builds', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  assert.doesNotMatch(source, /__omniforgeDiagnostics\?\.event\?\.\('path-node-drag-/);
  for (const eventName of [
    'path-node-drag-begin',
    'path-node-drag-rejected',
    'path-node-drag-preview',
    'path-node-drag-commit'
  ]) {
    assert.ok(source.includes(`window.__omniforgeDiagnostics?.log?.('${eventName}'`));
  }
});

test('Pathway Studio applies shared road profiles through one undoable Path Network transaction', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  const panelStart = source.indexOf('function pathPanel');
  const panelEnd = source.indexOf('function referencePanel', panelStart);
  const panel = source.slice(panelStart, panelEnd);
  const updateStart = source.indexOf('function updateSelectedCrossSection');
  const updateEnd = source.indexOf('function updateSelectedStructure', updateStart);
  const update = source.slice(updateStart, updateEnd);

  assert.match(panel, /id="v012CrossSectionProfile"/);
  assert.match(panel, /id="v012ApplySegmentProfile"/);
  assert.match(panel, /id="v012ApplyNetworkProfile"/);
  assert.match(update, /type: 'set-segment-cross-section'/);
  assert.match(update, /return transactPathNetwork\(object/);
  assert.doesNotMatch(update, /replacePathNetwork\(/);
});

test('branch editing targets an explicit selected segment instead of the first edge touching a node', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  const panelStart = source.indexOf('function pathPanel');
  const panelEnd = source.indexOf('function referencePanel', panelStart);
  const panel = source.slice(panelStart, panelEnd);
  const updateStart = source.indexOf('function updateSelectedConstruction');
  const updateEnd = source.indexOf('function captureRouteDraft', updateStart);
  const updates = source.slice(updateStart, updateEnd);

  assert.match(source, /let selectedPathSegmentId = null/);
  assert.match(source, /function pathSegmentSelection/);
  assert.match(panel, /id="v012SelectedSegment"/);
  assert.match(source, /selectedPathSegmentId = event\.target\.value/);
  assert.match(updates, /function updateSelectedConstruction\(object, segment\)/);
  assert.match(updates, /function updateSelectedCrossSection\(object, selectedSegment/);
  assert.match(updates, /function updateSelectedStructure\(object, segment\)/);
  assert.doesNotMatch(updates, /fromNode === node\.id \|\| item\.toNode === node\.id/);
});

test('surface character controls use the selected compiled segment and one transactional authority', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  const panelStart = source.indexOf('function pathPanel');
  const panelEnd = source.indexOf('function referencePanel', panelStart);
  const panel = source.slice(panelStart, panelEnd);
  const updateStart = source.indexOf('function updateSelectedSurfaceDetail');
  const updateEnd = source.indexOf('function updateSelectedStructure', updateStart);
  const update = source.slice(updateStart, updateEnd);

  assert.match(panel, /id="v012SurfaceDetailProfile"/);
  assert.match(panel, /id="v012ApplySegmentSurfaceDetail"/);
  assert.match(panel, /id="v012ApplyNetworkSurfaceDetail"/);
  for (const id of [
    'v012PuddleCoverage',
    'v012PuddleScale',
    'v012PuddleDepth',
    'v012WheelRutStrength',
    'v012WheelTrackGauge',
    'v012WheelRutWidth',
    'v012HoofPrintDensity',
    'v012BootPrintDensity',
    'v012ErosionStrength',
    'v012DetailNormalStrength',
    'v012WeatherResponse'
  ]) assert.match(panel, new RegExp(`id="${id}"`));
  assert.match(panel, /puddles, wheel ruts, hoof impressions, boot traffic, and erosion/);
  assert.match(update, /type: 'set-segment-surface-detail'/);
  assert.match(update, /type: 'set-default-surface-detail'/);
  assert.match(update, /surfaceDetailProfile/);
  assert.match(update, /segmentId: segment\.id/);
  assert.match(update, /return transactPathNetwork\(object/);
  assert.doesNotMatch(update, /replacePathNetwork\(/);
});
