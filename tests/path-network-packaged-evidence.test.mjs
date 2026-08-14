import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../scripts/run-path-network-packaged-evidence.ps1', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');

test('packaged path evidence refuses stale or source-archive executables', () => {
  assert.match(script, /git rev-parse HEAD/);
  assert.match(script, /\$packagedCommit -eq 'source-archive'/);
  assert.match(script, /\$packagedCommit -ne \$head/);
  assert.match(script, /Package identity mismatch/);
  assert.match(script, /dist\\OmniForge-win32-x64/);
  assert.match(script, /Start-Process -FilePath \$executable/);
});

test('packaged path evidence is isolated from user project data and ignored as output', () => {
  assert.match(script, /OMNIFORGE_DATA_ROOT = \$runtimeRoot/);
  assert.match(script, /output\\path-network-packaged-evidence/);
  assert.match(script, /Remove-Item -LiteralPath \$runtimeRoot -Recurse/);
  assert.match(script, /foreach \(\$name in @\('logs','incidents','crashes','sessions'\)\)/);
});

test('packaged path evidence captures every required bridge inspection angle', () => {
  for (const id of [
    '01-west-landing-close',
    '02-side-profile',
    '03-east-landing-close',
    '04-wide-elevated',
    '05-underside',
    '06-player-level',
    '07-editor-guides-elevated',
    '08a-native-horizontal-moved',
    '08b-native-vertical-moved',
    '08c-native-drag-restored',
    '08d-world-tab-ui',
    '08e-graph-fixture-ready',
    '08f-native-right-click-insert-undo',
    '08g-native-ctrl-group-drag-undo',
    '08h-native-manual-handle-drag-undo',
    '08i-native-duplicate-undo-redo',
    '08j-native-split-undo-redo',
    '08k-native-join-undo-redo',
    '09-restored-and-saved',
    '10-surface-details-close',
    '11-restarted-persisted',
    '11b-restarted-graph-persisted'
  ]) assert.match(script, new RegExp(`'${id}'`), id);
  assert.match(script, /Get-LookCamera/);
  assert.match(script, /bridgeStyle='steel-girder'/);
  assert.match(script, /function Set-EvidenceRavine/);
  assert.match(script, /canyonMeander=0;canyonDirection=90/);
  assert.match(script, /Set-EvidenceRavine \$port \$terrain\.id 16 12 4/);
  assert.doesNotMatch(script, /mode='lower';x=0;z=0;radius=/);
  assert.match(script, /profileId='muddy-wagon-road';seed=8128/);
  assert.match(script, /hoofPrintDensity=0\.18;bootPrintDensity=0\.12/);
});

test('key packaged stages require native full-window UI proof alongside viewport PNGs', () => {
  assert.match(script, /\$Options\.ContainsKey\('fullWindowCapture'\)/);
  assert.doesNotMatch(script, /if \(\$Options\.fullWindowCapture\)/);
  assert.match(script, /\$expectedFullWindowFile = "\$Id-window\.png"/);
  assert.match(script, /\[string\]\$response\.fullWindowFile/);
  assert.match(script, /reported missing full-window proof/);
  assert.match(script, /fullWindowFile=\$fullWindowFile/);
  assert.match(script, /\$captureOptions\.fullWindowCapture = \$true/);
  assert.match(script, /'08a-native-horizontal-moved'[\s\S]*?fullWindowCapture=\$true/);
  assert.match(script, /'08b-native-vertical-moved'[\s\S]*?fullWindowCapture=\$true/);
  assert.match(script, /'08d-world-tab-ui'[\s\S]*?fullWindowCapture=\$true[\s\S]*?target='world'/);
  for (const id of [
    '08e-graph-fixture-ready',
    '08f-native-right-click-insert-undo',
    '08g-native-ctrl-group-drag-undo',
    '08h-native-manual-handle-drag-undo',
    '08i-native-duplicate-undo-redo',
    '08j-native-split-undo-redo',
    '08k-native-join-undo-redo'
  ]) assert.match(script, new RegExp(`'${id}'[\\s\\S]*?fullWindowCapture=\\$true`));
  assert.match(script, /'09-restored-and-saved'[\s\S]*?fullWindowCapture=\$true/);
  assert.match(script, /'11-restarted-persisted'[\s\S]*?fullWindowCapture=\$true/);
  assert.match(script, /'11b-restarted-graph-persisted'[\s\S]*?fullWindowCapture=\$true/);
  assert.match(desktop, /requestOptions\.fullWindowCapture/);
  assert.match(desktop, /mainWindow\.webContents\.capturePage\(\)/);
  assert.match(desktop, /`\$\{id\}-window\.png`/);
  assert.match(desktop, /fullWindowFile/);
});

test('paired canvas and full-window evidence retain one camera and editor state until page capture completes', () => {
  assert.match(app, /pendingVisualCaptureRestore/);
  assert.match(app, /result\.captureHoldToken=captureHoldToken/);
  assert.match(app, /__omniforgeVisualTestFinishCapture=finishVisualCaptureHold/);
  assert.match(desktop, /captureHoldToken=String\(captureResult\?\.captureHoldToken\|\|''\)/);
  const pageCapture = desktop.indexOf('mainWindow.webContents.capturePage()');
  const releaseCapture = desktop.indexOf('window.__omniforgeVisualTestFinishCapture', pageCapture);
  assert.ok(pageCapture >= 0, 'full-window page capture must exist');
  assert.ok(releaseCapture > pageCapture, 'renderer state must be released only after full-window page capture');
  assert.match(desktop, /if\(captureHoldToken&&mainWindow&&!mainWindow\.isDestroyed\(\)\)/);
});

test('packaged evidence renders every bridge family at a compatible span and width', () => {
  assert.match(script, /\$horizontalX = \[double\]\$horizontalPosition\[0\]/);
  assert.match(script, /\(\$horizontalX-10\)/);
  assert.doesNotMatch(script, /\$horizontalPosition\[0\]-10/);
  for (const style of [
    'timber-trestle',
    'stone-arch',
    'steel-girder',
    'masonry-causeway',
    'rope-footbridge'
  ]) assert.match(script, new RegExp(`bridgeStyle='${style}'|style='${style}'`), style);
  assert.match(
    script,
    /slug='masonry-causeway';style='masonry-causeway';canyonWidth=5\.5;canyonDepth=6\.0;canyonFloorWidth=1\.5;width=6\.0;vehicleClass='mixed';profileId='dirt-road'/,
    'masonry causeway evidence must retain the deterministic span that compiles a real bridge interval'
  );
  assert.match(script, /family-\$\(\$fixture\.slug\)-\$\(\$familyView\.suffix\)/);
  assert.match(script, /suffix='landing-close'/);
  assert.match(script, /suffix='side'/);
  assert.match(script, /suffix='underside'/);
  assert.match(script, /suffix='player-level'/);
  assert.match(script, /suffix='wide-elevated'/);
  assert.match(script, /ravine=@\{width=\$fixture\.canyonWidth;depth=\$fixture\.canyonDepth;floorWidth=\$fixture\.canyonFloorWidth;direction=90;meander=0\}/);
  assert.match(script, /bridgeFamilies=\$bridgeFamilyRecords/);
  assert.match(script, /Restore primary packaged steel bridge fixture/);
  assert.match(script, /New-ExpectedPathFixture/);
  assert.match(script, /expectedPathNetwork=\$fixtureExpectation/);
  assert.match(script, /networkId=\$NetworkId/);
  assert.match(script, /New-ExpectedPathFixture \$path\.id \(\[string\]\$networkResult\.network\.id\)/);
  assert.match(app, /Visual capture fixture mismatch/);
  assert.match(app, /Visual capture render fixture mismatch/);
  assert.match(app, /minimumBridgeIntervalCount/);
  assert.match(app, /expected nodes/);
  assert.match(app, /expected segments/);
  assert.match(app, /compiled node identities differ/);
  assert.match(app, /compiled segment identities differ/);
  assert.match(app, /compiled revision .* differs from authoritative revision/);
  assert.match(app, /uploaded revision .* differs from authoritative revision/);
  assert.match(app, /uploaded node identities differ/);
  assert.match(app, /uploaded segment identities differ/);
  assert.match(app, /resolved bridge family/);
  assert.match(app, /expected uploaded bridge structure geometry/);
  assert.match(app, /expected drawn bridge structure geometry/);
  assert.match(app, /bridge structure was last drawn in frame/);
  assert.match(app, /const currentFixture=visualCaptureSceneFixture\(options\.expectedPathNetwork\)/);
  assert.match(app, /validateVisualCaptureRenderFixture\(options\.expectedPathNetwork,renderTelemetry,currentFixture\)/);
  assert.match(app, /function applyVisualTestCamera/);
  assert.match(app, /function visualTestNeedsInputCamera/);
  for (const action of [
    'path-node-drag',
    'path-node-group-drag',
    'path-node-toggle-selection',
    'path-node-insert',
    'path-handle-drag',
    'path-network-split',
    'path-undo'
  ]) assert.match(app, new RegExp(`'${action}'`));
  assert.match(app, /cameraBoundActions\.has\(String\(action\?\.type\|\|''\)\)/);
  assert.match(app, /visualTestNeedsInputCamera\(options\)&&applyVisualTestCamera\(options\.inputCamera\|\|options\.camera\)/);
  assert.match(app, /applyVisualTestCamera\(options\.camera\)/);
  assert.match(app, /normalizedVisualTestCamera\(options\.restoreCamera,camera\)/);
  assert.match(app, /__omniforgeVisualTestCameraSnapshot/);
  assert.match(app, /__omniforgeVisualTestRestoreCamera/);
  assert.match(app, /requestAnimationFrame\(\(\)=>requestAnimationFrame\(resolve\)\)/);
  assert.match(desktop, /requestOptions\.restoreCamera=nativeCameraRestore/);
  assert.match(app, /uploadedStructureIndexCount/);
  assert.match(app, /drawnStructureIndexCount/);
  assert.match(app, /structureVertexCount/);
  assert.match(app, /surfaceProfileId/);
  assert.match(app, /await selectObject\(expectedPathId,false\)/);
});

test('packaged evidence inspects every production path-surface character in world', () => {
  for (const profile of [
    'weathered-dirt-road',
    'muddy-wagon-road',
    'hoof-trail',
    'walked-footpath'
  ]) assert.match(script, new RegExp(`profileId='${profile}'`), profile);
  assert.match(script, /surface-\$\(\$surfaceFixture\.slug\)/);
  assert.match(script, /type='set-segment-surface-detail'/);
  assert.match(script, /surfaceProfiles=\$surfaceProfileRecords/);
  assert.match(script, /Restore primary packaged muddy-wagon surface character/);
});

test('two-minute gate exercises real packaged renderer actions and restores its edit', () => {
  assert.match(script, /\[int\]\$DurationSeconds = 120/);
  assert.match(script, /while \(\$interactionWatch\.Elapsed\.TotalSeconds -lt/);
  assert.match(script, /type='viewport-navigate'/);
  assert.match(script, /type='path-transaction'/);
  assert.match(script, /type='path-undo'/);
  assert.match(script, /type='click-control';selector='#saveButton'/);
  assert.match(script, /The interaction loop did not restore the authored bridge endpoint before Save/);
  assert.match(script, /Assert-ProcessResponsive/);
  assert.match(script, /Close-PackagedGracefully/);
  assert.match(script, /Assert-PersistedPathFixture/);
  assert.match(script, /gracefulShutdowns/);
  assert.doesNotMatch(script, /type='save';message='Packaged path evidence saved'/);
});

test('packaged evidence records a bounded Electron process tree with renderer and GPU resources', () => {
  assert.match(script, /function Get-ProcessResourceSample/);
  assert.match(script, /function Get-BoundedProcessTree/);
  assert.match(script, /\$frontier = \$next\.ToArray\(\)/);
  assert.match(script, /return \$tree\.ToArray\(\)/);
  assert.doesNotMatch(script, /\$frontier = @\(\$next\)/);
  assert.match(script, /Get-CimInstance -ClassName Win32_Process/);
  assert.match(script, /MaximumDepth=8/);
  assert.match(script, /MaximumProcesses=64/);
  assert.match(script, /desktop = \[int\]\$DesktopProcess\.Id/);
  assert.match(script, /runtime = \$runtimeProcessId/);
  assert.match(script, /role -eq 'renderer'/);
  assert.match(script, /role -eq 'gpu'/);
  assert.match(script, /No live Electron renderer process was found beneath desktop PID/);
  assert.match(script, /No live Electron GPU process was found beneath desktop PID/);
  assert.match(script, /parentPid=\[int\]\$entry\.parentProcessId/);
  assert.match(script, /exited=\$true/);
  assert.match(script, /exited=\$false/);
  assert.match(script, /role -eq 'renderer' -and \$_\.exited -ne \$true/);
  assert.match(script, /role -eq 'gpu' -and \$_\.exited -ne \$true/);
  assert.match(script, /electronProcessTree=\$treeSamples/);
  assert.match(script, /cpuSeconds=\[double\]\$process\.TotalProcessorTime\.TotalSeconds/);
  assert.match(script, /workingSetBytes=\[int64\]\$process\.WorkingSet64/);
  assert.match(script, /privateMemoryBytes=\[int64\]\$process\.PrivateMemorySize64/);
  assert.match(script, /threadCount=\[int\]\$process\.Threads\.Count/);
  assert.match(script, /'after-startup'/);
  assert.match(script, /'before-sustained-interaction'/);
  assert.match(script, /Get-ProcessResourceSample \$process \$runtimeRoot \$id/);
  assert.match(script, /'before-saved-editor-close'/);
  assert.match(script, /'after-restart'/);
  assert.match(script, /'before-restarted-editor-close'/);
  assert.match(script, /resourceSamples=\$resourceSamples/);
});

test('packaged gate drives real horizontal and Shift-vertical spline handles and proves Undo', () => {
  assert.match(script, /type='dismiss-first-use-tutorial'/);
  assert.match(script, /nativeInputActions=@\(/);
  assert.match(script, /type='path-node-drag'.*nodeId='approach-west'.*vertical=\$false.*undo=\$false/);
  assert.match(script, /type='path-node-drag'.*nodeId='approach-west'.*dy=-16.*vertical=\$true.*undo=\$false/);
  assert.match(script, /type='path-undo'.*nodeId='approach-west'.*expectedPosition=\$horizontalPosition/);
  assert.match(script, /inputCamera=\(Get-LookCamera/);
  assert.match(script, /type='path-undo'.*expectedPosition=\$horizontalPosition/);
  assert.match(script, /type='path-undo'.*expectedPosition=@\(-55,0,0\)/);
  assert.match(script, /nativeInputTelemetry/);
  assert.match(script, /undoVerified/);
  assert.match(desktop, /#splineNodeOverlay \[data-spline-node-id\]/);
  assert.match(desktop, /dismissVisualFirstUseTutorial/);
  assert.match(desktop, /#skipTutorialButton/);
  assert.match(desktop, /#dismissIntegrationSetupButton/);
  assert.match(desktop, /firstUseComplete/);
  assert.match(desktop, /integrationState/);
  assert.match(desktop, /current\.integrationOpen&&current\.integrationState==='pending'&&!dismissedIntegration/);
  assert.match(desktop, /current\.integrationOpen\|\|current\.integrationState==='pending'/);
  assert.match(desktop, /window\.__omniforgeVisualTestSynchronize/);
  assert.match(desktop, /nativeSynchronizationTelemetry/);
  assert.match(desktop, /actionType==='click-control'/);
  assert.match(desktop, /appearanceDeadline/);
  assert.match(desktop, /hitTargetMatches/);
  assert.match(desktop, /Visual input spline handle is covered by/);
  assert.match(desktop, /sendInputEvent\(\{type:'mouseDown'/);
  assert.match(desktop, /type:'mouseMove'/);
  assert.match(desktop, /leftButtonDown/);
  assert.match(desktop, /modifiers:heldModifiers/);
  assert.match(desktop, /const heldModifiers=\[\.\.\.modifiers,'leftButtonDown'\]/);
  assert.match(desktop, /const heldModifiers=action\.vertical\?\['shift'\]:\[\]/);
  assert.match(desktop, /#v012UndoPath/);
  assert.match(desktop, /did not restore the dragged node position/);
});

test('packaged graph gate drives stable-ID native insertion, grouping, handles, split, duplicate, and join', () => {
  assert.match(script, /function New-ExpectedGraphFixture/);
  assert.match(script, /function Assert-ExactGraphTopology/);
  assert.match(script, /function Assert-NativeGraphCapture/);
  assert.match(script, /id='path-graph-evidence'/);
  assert.match(script, /\$graphAuthority = Invoke-Api \$port "\/api\/v012\/path\/\$\(\$graphPath\.id\)\/network"/);
  assert.match(script, /expectedRevision=\$graphRevision/);
  assert.doesNotMatch(script, /\$graphPath\.properties\.pathNetwork\.revision/);
  assert.match(script, /id='graph-west'/);
  assert.match(script, /id='graph-middle'/);
  assert.match(script, /id='graph-east'/);
  assert.match(script, /type='path-node-insert';pathId=\$graphPath\.id;segmentId='graph-west-middle'/);
  assert.match(script, /heightMode='terrain'/);
  assert.match(script, /insertedNode\.heightMode -notin @\('terrain','offset'\)/);
  assert.match(script, /type='path-node-toggle-selection';pathId=\$graphPath\.id;nodeId='graph-west'/);
  assert.match(script, /type='path-node-group-drag';pathId=\$graphPath\.id;nodeId='graph-middle';nodeIds=@\('graph-west','graph-middle'\)/);
  assert.match(script, /type='path-handle-drag';pathId=\$graphPath\.id;nodeId='graph-middle';side='outgoing'/);
  assert.match(script, /type='path-network-duplicate';pathId=\$graphPath\.id/);
  assert.match(script, /type='path-network-split';pathId=\$graphPath\.id;nodeId='graph-middle'/);
  assert.match(script, /id='path-graph-branch'/);
  assert.match(script, /\$branchAuthority = Invoke-Api \$port "\/api\/v012\/path\/\$\(\$branch\.id\)\/network"/);
  assert.match(script, /\$branchRevision = \[int\]\$branchAuthority\.network\.revision/);
  assert.match(script, /expectedRevision=\$branchRevision/);
  assert.doesNotMatch(script, /\$branch\.properties\.pathNetwork\.revision/);
  assert.match(script, /type='path-network-join';pathId=\$graphPath\.id;sourcePathId=\$branch\.id/);
  assert.match(script, /graphEdits=\$graphEditRecords/);
  assert.match(script, /resolvedBy -ne 'compiledSegmentId'/);
  assert.match(script, /\$insertionDeviation -gt 0\.01/);
  assert.match(desktop, /centerlineDeviation>0\.01/);
  assert.match(desktop, /return \{ready:false,error:'Compiled Path Network segment evidence is stale\.'/);
  assert.match(script, /resolvedBy -ne 'nodeId'/);
  assert.match(script, /undoVerified/);
  assert.match(script, /redoVerified/);
  assert.match(script, /Assert-ExactPathRenderRevision/);
});

test('packaged graph gate preserves the exact graph and restored Join source through Save and restart', () => {
  assert.match(script, /function Get-ExactPathNetworkSignature/);
  assert.match(script, /\$graphBeforeSave = \(Invoke-Api \$port "\/api\/v012\/path\/\$\(\$graphPath\.id\)\/network"\)\.network/);
  assert.match(script, /\$branchBeforeSave = \(Invoke-Api \$port "\/api\/v012\/path\/\$\(\$branch\.id\)\/network"\)\.network/);
  assert.match(script, /\$restartGraphSignature -ne \$graphPersistenceSignature/);
  assert.match(script, /\$restartBranchSignature -ne \$branchPersistenceSignature/);
  assert.match(script, /Packaged Save\/restart changed the exact Gate 1 graph/);
  assert.match(script, /restartGraphCapture=\$restartGraphRecord/);
  assert.match(script, /graphPersistence=@\{/);
});

test('canvas capture hook drives bounded semantic actions and returns timing evidence', () => {
  assert.match(app, /const visualTestClickTargets=Object\.freeze/);
  assert.match(app, /ai:'\[data-dock-tab="codex"\]'/);
  assert.match(app, /worldSettings:'\[data-dock-tab="scene"\]'/);
  assert.doesNotMatch(app, /data-bottom-tab/);
  assert.match(app, /world:'\[data-v010-world-tab\]'/);
  assert.match(app, /async function runVisualTestActions/);
  assert.match(app, /type==='viewport-navigate'/);
  assert.match(app, /type==='path-transaction'/);
  assert.match(app, /type==='path-undo'/);
  assert.match(app, /interactionTelemetry/);
  assert.doesNotMatch(app, /eval\(.*visualTest/);
  assert.match(desktop, /interactionTelemetry:captureResult\?\.interactionTelemetry\|\|\[\]/);
  assert.match(desktop, /nativeInputTelemetry/);
});

test('packaged evidence proves the committed source tree and every packaged source blob', () => {
  assert.match(script, /source-tree/);
  assert.match(script, /git rev-parse 'HEAD\^\{tree\}'/);
  assert.match(script, /Package source-tree mismatch/);
  assert.match(script, /Get-SourceTreeDigest/);
  assert.match(script, /git -C \$RepositoryRoot ls-tree -r --name-only HEAD/);
  assert.match(script, /git hash-object -- \$packagedFile/);
  assert.match(script, /Packaged source contains a stale extra file/);
  assert.match(script, /packagedSourceAudit=\$packagedSourceAudit/);
  const auditedFolders = script.match(/\$sourceFolders = @\(([^\n]+)\)/)?.[1] || '';
  assert.doesNotMatch(auditedFolders, /'data'|'output'|'captures'|'logs'/);
});

test('one native Save click proves the scene-save revision, activity, and Saved badge', () => {
  assert.equal((script.match(/selector='#saveButton'/g) || []).length, 1);
  assert.match(desktop, /async function visualSaveSnapshot/);
  assert.match(desktop, /fetch\('\/api\/state',\{cache:'no-store'\}\)/);
  assert.match(desktop, /item\?\.type==='scene'/);
  assert.match(desktop, /startsWith\('Saved scene '\)/);
  assert.match(desktop, /latest\.revision>before\.revision/);
  assert.match(desktop, /latest\.activityId!==before\.activityId/);
  assert.match(desktop, /latest\.badgeText==='Saved'/);
  assert.match(desktop, /saveVerified:Boolean\(saveAfter\)/);
  assert.match(script, /saveTelemetry\[0\]\.saveAfter\.revision/);
  assert.match(script, /\/api\/scene\/save revision, activity, and Saved badge evidence/);
});

test('packaged startup, responsiveness, shutdown, and restart are tied to one isolated runtime identity', () => {
  assert.match(script, /function Wait-PackagedHealth/);
  assert.match(script, /sessions\\runtime\.json/);
  assert.match(script, /Marker\.sessionToken -ne \[string\]\$Health\.sessionToken/i);
  assert.match(script, /Marker\.pid -ne \[int\]\$Health\.pid/i);
  assert.match(script, /Assert-RuntimeIdentity \$health \$marker \$Port \$Stage/);
  assert.match(script, /Wait-PackagedHealth \$process \$port \$runtimeRoot/g);
  assert.match(script, /\[int\]\$Process\.ExitCode -ne 0/);
  assert.match(script, /sessions\\lifecycle\.json/);
  assert.match(script, /lifecycle\.cleanShutdown -ne \$true/);
  assert.match(script, /lifecycle\.pid -ne \$processId/);
  assert.match(script, /close-request\.json/);
  assert.match(script, /processId=\$processId;stage=\$Stage/);
  assert.match(desktop, /const closeRequestFile=path\.join\(VISUAL_CAPTURE_DIR,'close-request\.json'\)/);
  assert.match(desktop, /Number\(closeRequest\.processId\)!==process\.pid/);
  assert.match(desktop, /mainWindow\.close\(\)/);
  assert.doesNotMatch(script, /\.CloseMainWindow\(\)/);
});

test('failure cleanup kills the process tree and proves the exact port remains offline', () => {
  assert.match(script, /function Test-PortBindable/);
  assert.match(script, /consecutiveOfflineProbes -ge 4/);
  assert.match(script, /-not \$healthOnline -and \$portBindable/);
  assert.match(script, /function Stop-PackagedProcessTree/);
  assert.match(script, /runtimeMarker\.pid/);
  assert.match(script, /taskkill\.exe/);
  assert.match(script, /'\/T','\/F'/);
  assert.match(script, /Stop-PackagedProcessTree \$process \$port \$runtimeRoot/);
  assert.doesNotMatch(script, /Stop-Process -Id \$process\.Id/);
});

test('every semantic path edit validates the exact post-action renderer revision', () => {
  assert.match(app, /const currentFixture=visualCaptureSceneFixture\(options\.expectedPathNetwork\)/);
  assert.match(app, /validateVisualCaptureRenderFixture\(options\.expectedPathNetwork,renderTelemetry,currentFixture\)/);
  assert.match(script, /pathActionTelemetry\[0\]\.result\.afterRevision -ne \$postActionRevision/);
  assert.match(script, /fixtureExpectation\.minimumNetworkRevision = \$postActionRevision/);
  assert.match(script, /Assert-ExactPathRenderRevision \$record \$path\.id \$postActionRevision/);
  assert.match(script, /corridor\.renderer\.sourceRevision -ne \$ExpectedRevision/);
});
