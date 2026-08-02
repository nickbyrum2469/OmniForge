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
