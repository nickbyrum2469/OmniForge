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
    '01-approach',
    '02-side',
    '03-rear',
    '04-elevated',
    '05-underside',
    '06-player-level',
    '07-editor-guides-elevated',
    '08a-native-horizontal-moved',
    '08b-native-vertical-moved',
    '08c-native-drag-restored',
    '09-restored-and-saved',
    '10-surface-details-close',
    '11-restarted-persisted'
  ]) assert.match(script, new RegExp(`'${id}'`), id);
  assert.match(script, /Get-LookCamera/);
  assert.match(script, /bridgeStyle='steel-girder'/);
  assert.match(script, /mode='lower';x=0;z=0;radius=18;strength=12/);
  assert.match(script, /profileId='muddy-wagon-road';seed=8128/);
  assert.match(script, /hoofPrintDensity=0\.18;bootPrintDensity=0\.12/);
});

test('packaged evidence renders every bridge family at a compatible span and width', () => {
  for (const style of [
    'timber-trestle',
    'stone-arch',
    'steel-girder',
    'masonry-causeway',
    'rope-footbridge'
  ]) assert.match(script, new RegExp(`bridgeStyle='${style}'|style='${style}'`), style);
  assert.match(
    script,
    /slug='masonry-causeway';style='masonry-causeway';radius=8\.0;depth=6\.0;width=6\.0;vehicleClass='mixed';profileId='dirt-road'/,
    'masonry causeway evidence must retain the deterministic span that compiles a real bridge interval'
  );
  assert.match(script, /family-\$\(\$fixture\.slug\)-\$\(\$familyView\.suffix\)/);
  assert.match(script, /suffix='approach'/);
  assert.match(script, /suffix='side'/);
  assert.match(script, /suffix='underside'/);
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

test('packaged gate drives real horizontal and Shift-vertical spline handles and proves Undo', () => {
  assert.match(script, /type='dismiss-first-use-tutorial'/);
  assert.match(script, /nativeInputActions=@\(/);
  assert.match(script, /type='path-node-drag'.*vertical=\$false.*undo=\$false/);
  assert.match(script, /type='path-node-drag'.*vertical=\$true.*undo=\$false/);
  assert.match(script, /type='path-undo'.*expectedPosition=@\(55,0,0\)/);
  assert.match(script, /type='path-undo'.*expectedPosition=@\(-55,0,0\)/);
  assert.match(script, /nativeInputTelemetry/);
  assert.match(script, /undoVerified/);
  assert.match(desktop, /#splineNodeOverlay \[data-spline-node=/);
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
  assert.match(desktop, /modifiers:releasedModifiers/);
  assert.match(desktop, /heldModifiers=action\.vertical\?\['shift','leftButtonDown'\]:\['leftButtonDown'\]/);
  assert.match(desktop, /releasedModifiers=action\.vertical\?\['shift'\]:\[\]/);
  assert.match(desktop, /#v012UndoPath/);
  assert.match(desktop, /did not restore the dragged node position/);
});

test('canvas capture hook drives bounded semantic actions and returns timing evidence', () => {
  assert.match(app, /const visualTestClickTargets=Object\.freeze/);
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
