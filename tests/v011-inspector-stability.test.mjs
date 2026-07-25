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
