import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');

test('native graph evidence is stable-id-first and keeps index lookup only as an explicit compatibility fallback', () => {
  assert.match(desktop, /function normalizedVisualNodeReference/);
  assert.match(desktop, /requires a stable nodeId \(nodeIndex is a legacy fallback\)/);
  assert.match(desktop, /input\.nodeId\s*\?network\?\.nodes\?\.findIndex/);
  assert.match(desktop, /const resolvedBy=input\.nodeId\?'nodeId':'nodeIndex'/);
  assert.match(desktop, /resolvedBy:before\.resolvedBy/);
  assert.match(desktop, /\[data-spline-node-id\]/);
  assert.match(desktop, /\.dataset\.splineNodeId/);
  assert.match(desktop, /nodeId\.length>512/);
});

test('consecutive native node edits re-enter viewport spline editing through the real packaged control', () => {
  assert.match(desktop, /async function ensureVisualPathNodeSnapshot/);
  assert.match(desktop, /document\.body\.classList\.contains\('v011-spline-editing'\)/);
  assert.match(desktop, /sendVisualControlClick\(contents,'#v011SplineEdit'\)/);
  assert.match(desktop, /const before=await ensureVisualPathNodeSnapshot\(contents,pathId,reference\)/);
  assert.doesNotMatch(desktop, /splineEditPathId\s*=/);
});

test('native right-click insertion targets one named current compiled segment and proves its graph delta', () => {
  assert.match(desktop, /actionType==='path-node-insert'/);
  assert.match(desktop, /function visualCompiledPathTarget/);
  assert.match(desktop, /return \{ready:false,error:'Exact compiled Path Network segment evidence is unavailable\.'/);
  assert.match(desktop, /if\(!result\?\.ready\)throw new Error\(String\(result\?\.error/);
  assert.match(desktop, /requires an allow-listed compiled segmentId/);
  assert.match(desktop, /runtime\.compiled\.segments\.find\(item=>String\(item\.id\)===input\.segmentId\)/);
  assert.match(desktop, /Number\(runtime\.sourceRevision\)!==Number\(path\.properties\.pathNetwork\.revision\)/);
  assert.match(desktop, /elementFromPoint\(x,y\)/);
  assert.match(desktop, /button:'right'.*modifiers:\['rightButtonDown'\]/);
  assert.match(desktop, /type:'contextMenu',x,y,button:'right'/);
  assert.match(desktop, /after\.nodeIds\.length!==before\.nodeIds\.length\+1/);
  assert.match(desktop, /after\.segmentIds\.length!==before\.segmentIds\.length\+1/);
  assert.match(desktop, /insertedNodeIds\.length!==1/);
  assert.match(desktop, /insertedNode=after\.nodes\.find/);
  assert.match(desktop, /insertedNode\.heightMode/);
  assert.match(desktop, /splitEdges\.length!==2/);
  assert.match(desktop, /!splitEndpoints\.has\(original\.fromNode\)/);
  assert.match(desktop, /!splitEndpoints\.has\(original\.toNode\)/);
  assert.match(desktop, /visualCompiledSegmentPolyline/);
  assert.match(desktop, /visualPolylineDeviation/);
  assert.match(desktop, /centerlineDeviation>0\.01/);
  assert.match(desktop, /did not restore the graph after native right-click insertion/);
});

test('native tangent and multi-node actions remain allow-listed semantic gestures without arbitrary selectors', () => {
  assert.match(desktop, /actionType==='path-handle-drag'/);
  assert.match(desktop, /ensureVisualPathNodePrimary/);
  assert.match(desktop, /handleMode:String\(node\.handleMode\|\|'automatic'\)/);
  assert.match(desktop, /did not make stable node .* primary for spline-handle editing/);
  assert.match(desktop, /\['incoming','outgoing'\]\.includes\(side\)/);
  assert.match(desktop, /#splineNodeOverlay \[data-spline-handle\]/);
  assert.match(desktop, /item\.dataset\.splineNodeId/);
  assert.match(desktop, /item\.dataset\.splineHandle/);
  assert.match(desktop, /vectorDelta:visualPositionDelta/);
  assert.match(desktop, /did not restore the authored spline tangent handle/);
  assert.match(desktop, /actionType==='path-node-toggle-selection'/);
  assert.match(desktop, /sendVisualClick\(contents,before\.rect,\['control'\]\)/);
  assert.match(desktop, /actionType==='path-node-group-drag'/);
  assert.match(desktop, /groupNodeIds\.length<2/);
  assert.match(desktop, /selectionChecks\.some\(node=>!node\.selectedMember\)/);
  assert.match(desktop, /did not isolate the exact stable-node group/);
  assert.match(desktop, /Native group drag did not apply one coherent delta/);
  assert.match(desktop, /did not restore every stable node from the group drag/);
  assert.match(desktop, /if\(!\['#saveButton','#playButton','#captureButton'\]\.includes\(selector\)\)/);
  assert.doesNotMatch(desktop, /document\.querySelector\(action\.selector\)/);
  assert.doesNotMatch(desktop, /eval\(.*action/);
});

test('native graph controls are bounded and prove Duplicate, Split, Join, Undo, and Redo topology', () => {
  assert.match(desktop, /actionType==='path-network-duplicate'/);
  assert.match(desktop, /sendVisualControlClick\(contents,'#v012DuplicateNetwork'\)/);
  assert.match(desktop, /createdIds\.length!==1/);
  assert.match(desktop, /sendVisualControlClick\(contents,'#v012UndoPath'\)/);
  assert.match(desktop, /sendVisualControlClick\(contents,'#v012RedoPath'\)/);
  assert.match(desktop, /redoVerified:true/);

  assert.match(desktop, /actionType==='path-network-split'/);
  assert.match(desktop, /ensureVisualPathNodePrimary\(contents,pathId,reference\)/);
  assert.match(desktop, /degree!==2/);
  assert.match(desktop, /sendVisualControlClick\(contents,'#v012SplitNetwork'\)/);
  assert.match(desktop, /retained\.segments\.length\+extracted\.segments\.length!==sourceBefore\.segments\.length/);

  assert.match(desktop, /actionType==='path-network-join'/);
  assert.match(desktop, /sourcePathId===pathId\|\|sourcePathId\.length>512/);
  assert.match(desktop, /sendVisualSelectOption\(contents,'#v012JoinSourcePath',sourcePathId\)/);
  assert.match(desktop, /sendVisualControlClick\(contents,'#v012JoinPath'\)/);
  assert.match(desktop, /targetAfter\.segments\.length!==targetBefore\.segments\.length\+sourceBefore\.segments\.length\+1/);
  assert.match(desktop, /visualAssertExactPath\(visualPathById\(restored,sourcePathId\),sourceBefore,'Final Undo Join source'\)/);
});

test('native graph primitives do not expand the generic selector surface', () => {
  assert.match(desktop, /if\(!\['#saveButton','#playButton','#captureButton'\]\.includes\(selector\)\)/);
  assert.doesNotMatch(desktop, /action\.selector.*v012DuplicateNetwork/);
  assert.doesNotMatch(desktop, /action\.selector.*v012SplitNetwork/);
  assert.doesNotMatch(desktop, /action\.selector.*v012JoinPath/);
});
