import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessCompiledPathEditAuthority } from '../app/path-network/editor-runtime-authority.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture({ networkRevision = 7, runtimeRevision = networkRevision } = {}) {
  const scene = { id: 'scene-active' };
  const pathObject = {
    id: 'path-active',
    type: 'path',
    properties: {
      pathNetwork: {
        id: 'network-active',
        revision: networkRevision,
        nodes: [{ id: 'a', position: [0, 0, 0] }]
      }
    }
  };
  const runtime = {
    pathObjectId: pathObject.id,
    sourceNetworkId: 'network-active',
    sourceRevision: runtimeRevision,
    compiled: { sourceNetworkId: 'network-active', sourceRevision: runtimeRevision },
    diagnostics: { sourceNetworkId: 'network-active', sourceRevision: runtimeRevision }
  };
  return { scene, pathObject, runtime, expectedSignature: 'scene-and-network-signature' };
}

test('compiled viewport edits accept only the exact ready scene and network authority', () => {
  const value = fixture();
  const result = assessCompiledPathEditAuthority({
    ...value,
    generationDiagnostics: { readySignature: value.expectedSignature, pending: null, failed: null }
  });
  assert.equal(result.ready, true);
  assert.equal(result.runtime, value.runtime);
});

test('a pending exact rebuild preserves authored input and refuses insertion', () => {
  const value = fixture();
  const before = structuredClone(value.pathObject.properties.pathNetwork);
  const result = assessCompiledPathEditAuthority({
    ...value,
    generationDiagnostics: {
      readySignature: 'previous-signature',
      pending: { signature: value.expectedSignature, revision: 8 },
      failed: null
    }
  });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'rebuilding');
  assert.match(result.message, /not applied/i);
  assert.match(result.message, /try again/i);
  assert.deepEqual(value.pathObject.properties.pathNetwork, before);
});

test('a stale compiled network revision is rejected even when the renderer signature claims ready', () => {
  const value = fixture({ networkRevision: 9, runtimeRevision: 8 });
  const result = assessCompiledPathEditAuthority({
    ...value,
    generationDiagnostics: { readySignature: value.expectedSignature, pending: null, failed: null }
  });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'rebuilding');
  assert.equal(result.runtime, null);
});

test('a failed exact rebuild reports the compiler failure without accepting stale geometry', () => {
  const value = fixture();
  const result = assessCompiledPathEditAuthority({
    ...value,
    generationDiagnostics: {
      readySignature: 'previous-signature',
      pending: null,
      failed: { signature: value.expectedSignature, message: 'invalid junction polygon' }
    }
  });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'failed');
  assert.match(result.message, /invalid junction polygon/);
  assert.match(result.message, /correct the path error and retry/i);
});

test('right-click insertion checks exact compiled authority before terrain picking or mutation', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  const start = source.indexOf("canvas.addEventListener('contextmenu'");
  const end = source.indexOf("document.addEventListener('pointerlockchange'", start);
  assert.ok(start >= 0 && end > start, 'context-menu edit handler was not found');
  const handler = source.slice(start, end);
  const guard = handler.indexOf('const authority = compiledPathEditAuthority(path)');
  const hitTest = handler.indexOf('terrainPointFromScreen');
  const nearest = handler.indexOf('nearestCompiledStation(authority.runtime.compiled, point)');
  const transaction = handler.indexOf('await transactPathNetwork');
  assert.ok(guard >= 0 && guard < hitTest && hitTest < nearest && nearest < transaction);
  assert.match(handler, /if \(!authority\.ready\) return bridge\(\)\?\.showToast\?\.\(authority\.message, 'error'\)/);
  assert.doesNotMatch(handler, /nearestCompiledStation\(activePathRuntime/);
});
