import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samplePathEditorCurvePreview } from '../app/path-network/editor-curve-preview.js';

const editor = readFileSync(new URL('../app/v011.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/v011.css', import.meta.url), 'utf8');
const curvePreview = readFileSync(new URL('../app/path-network/editor-curve-preview.js', import.meta.url), 'utf8');

test('graph editor uses stable node ids, additive selection, and one group transaction', () => {
  assert.match(editor, /data-spline-node-id/);
  assert.match(editor, /event\.ctrlKey\s*\|\|\s*event\.metaKey/);
  assert.match(editor, /createPathNodeGroupPreview\(/);
  assert.match(editor, /pathNodeGroupMoveOperations\(drag\.groupPreview\)/);
  assert.match(editor, /selected-member/);
  assert.match(editor, /selected-primary/);
  assert.doesNotMatch(editor, /dataset\.splineNode\s*=/);
  assert.match(editor, /ensurePathSelectionScope\(object\)/);
  assert.match(editor, /pathSelectionOwnerId/);
});

test('manual tangent gizmos preview both handle modes and commit through set-node-handles', () => {
  assert.match(editor, /data-spline-handle/);
  assert.match(editor, /intersectPathHandleRayCameraPlane\(/);
  assert.match(editor, /previewPathHandleDrag\(/);
  assert.match(editor, /type:\s*'set-node-handles'/);
  assert.match(styles, /\.spline-handle-connectors/);
  assert.match(styles, /\.spline-tangent-handle/);
});

test('stationary right click inserts once while right drag remains viewport navigation', () => {
  assert.match(editor, /pendingPathInsertGesture/);
  assert.match(editor, /Math\.hypot\(event\.clientX - pendingPathInsertGesture\.x/);
  assert.match(editor, /pendingPathInsertGesture\.moved = true/);
  assert.match(editor, /event\.button !== 2 \|\| !pendingPathInsertGesture/);
  assert.match(editor, /gesture\.moved \|\| performance\.now\(\) - gesture\.startedAt > 900/);
  assert.match(editor, /insertPathNodeFromViewport\(event, 'right-click-release'\)/);
  assert.match(editor, /insertPathNodeFromViewport\(event, 'contextmenu'\)/);
  assert.match(editor, /performance\.now\(\) - lastPathInsertGesture\.at < 400/);
});

test('node dragging draws a lightweight curve and width ribbon without replacing renderer authority', () => {
  assert.match(editor, /samplePathEditorCurvePreview\(path/);
  assert.match(editor, /spline-drag-preview-ribbon/);
  assert.match(editor, /spline-drag-preview-center/);
  assert.match(curvePreview, /never compiles terrain, construction, collision, or structures/i);
  assert.match(curvePreview, /segment\.curveControl\?\.fromHandle/);
  assert.match(curvePreview, /segment\.curveControl\?\.toHandle/);
  assert.doesNotMatch(curvePreview, /compilePathNetwork|setPathPreview|terrainModifier/);
  assert.match(styles, /\.spline-drag-preview-ribbon/);
});

test('lightweight drag preview follows exact segment-local curve controls', () => {
  const path = {
    id: 'preview-authority',
    type: 'path',
    properties: {
      pathNetwork: {
        nodes: [
          { id: 'a', position: [0, 0, 0], handleMode: 'automatic' },
          { id: 'b', position: [12, 0, 0], handleMode: 'automatic' }
        ],
        segments: [{
          id: 'ab',
          fromNode: 'a',
          toNode: 'b',
          curveType: 'hermite',
          curveControl: { fromHandle: [0, 0, 8], toHandle: [0, 0, 8] },
          crossSectionProfile: { width: 2 }
        }]
      }
    }
  };
  const preview = samplePathEditorCurvePreview(path, { samplesPerSegment: 4 })[0];
  // Bezier controls [0,0,8] and [12,0,8] put t=0.5 exactly at z=6.
  assert.deepEqual(preview.center[2], [6, 0, 6]);
});

test('join promotes its returned junction as the only path-scoped primary selection', () => {
  const join = editor.slice(editor.indexOf('async function joinPathNetwork'), editor.indexOf('async function undoPathNetwork'));
  assert.match(join, /pathSelectionOwnerId\s*=\s*target\.id/);
  assert.match(join, /selectedPathNodeIds\s*=\s*new Set\(payload\.junctionNodeId/);
});

test('diagnostic overlay is ephemeral while graph split and duplicate use v2 APIs', () => {
  const overlayListener = editor.slice(
    editor.indexOf("$('#v012DiagnosticOverlay')?.addEventListener"),
    editor.indexOf("$('#v012SelectedSegment')?.addEventListener")
  );
  assert.match(overlayListener, /pathDiagnosticModes\.set/);
  assert.match(overlayListener, /setPathDiagnosticMode/);
  assert.doesNotMatch(overlayListener, /replacePathNetwork|\/api\//);
  assert.match(editor, /\/api\/v012\/path\/\$\{encodeURIComponent\(object\.id\)\}\/duplicate/);
  assert.match(editor, /\/api\/v012\/path\/\$\{encodeURIComponent\(object\.id\)\}\/split/);
  assert.match(editor, /Split at primary node/);
});
