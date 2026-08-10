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
    '08-native-node-drag-undo',
    '09-restored-and-saved',
    '10-surface-details-close'
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
  assert.match(script, /family-\$\(\$fixture\.slug\)-\$\(\$familyView\.suffix\)/);
  assert.match(script, /suffix='approach'/);
  assert.match(script, /suffix='side'/);
  assert.match(script, /suffix='underside'/);
  assert.match(script, /bridgeFamilies=\$bridgeFamilyRecords/);
  assert.match(script, /Restore primary packaged steel bridge fixture/);
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
  assert.match(script, /type='click';target='save'/);
  assert.match(script, /The interaction loop did not restore the authored bridge endpoint before Save/);
  assert.match(script, /Assert-ProcessResponsive/);
});

test('packaged gate drives real horizontal and Shift-vertical spline handles and proves Undo', () => {
  assert.match(script, /type='dismiss-first-use-tutorial'/);
  assert.match(script, /nativeInputActions=@\(/);
  assert.match(script, /type='path-node-drag'.*vertical=\$false.*undo=\$true/);
  assert.match(script, /type='path-node-drag'.*vertical=\$true.*undo=\$true/);
  assert.match(script, /nativeInputTelemetry/);
  assert.match(script, /undoVerified/);
  assert.match(desktop, /#splineNodeOverlay \[data-spline-node=/);
  assert.match(desktop, /dismissVisualFirstUseTutorial/);
  assert.match(desktop, /#skipTutorialButton/);
  assert.match(desktop, /hitTargetMatches/);
  assert.match(desktop, /Visual input spline handle is covered by/);
  assert.match(desktop, /sendInputEvent\(\{type:'mouseDown'/);
  assert.match(desktop, /type:'mouseMove'/);
  assert.match(desktop, /modifiers=action\.vertical\?\['shift'\]:\[\]/);
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
