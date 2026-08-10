import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Git-aware desktop launcher builds only committed source while preserving live runtime state', () => {
  const launcher = fs.readFileSync(path.join(ROOT, 'START_DESKTOP.bat'), 'utf8');
  const builder = fs.readFileSync(path.join(ROOT, 'BUILD_DESKTOP_WINDOWS.ps1'), 'utf8');

  assert.match(launcher, /source-commit/i);
  assert.match(launcher, /source-tree/i);
  assert.match(launcher, /rev-parse --is-inside-work-tree/i);
  assert.match(launcher, /rev-parse --show-toplevel/i);
  assert.match(launcher, /REPOSITORY_ROOT/);
  assert.match(launcher, /EXPECTED_ROOT/);
  assert.match(launcher, /must be launched from the authoritative repository root/i);
  assert.match(launcher, /must be launched from its authoritative Git checkout/i);
  assert.match(launcher, /git rev-parse HEAD/i);
  assert.match(launcher, /git rev-parse "HEAD\^\^\{tree\}"/i);
  assert.match(launcher, /if not defined CURRENT_COMMIT/i);
  assert.match(launcher, /could not resolve the authoritative Git HEAD/i);
  assert.match(launcher, /git status --porcelain -uall/i);
  assert.match(launcher, /could not verify the authoritative working tree/i);
  for (const protectedPath of ['data/engine-state.json', 'data/engine-state.backup.json', 'data/project-catalog.json']) {
    assert.match(launcher, new RegExp(protectedPath.replaceAll('/', '\\/')));
    assert.match(builder, new RegExp(protectedPath.replaceAll('/', '\\/')));
  }
  assert.match(launcher, /DIRTY_PATH=!DIRTY_LINE:~3!/);
  assert.match(launcher, /uncommitted changes outside the protected runtime-state files/i);
  assert.match(launcher, /exit \/b 1/);
  assert.match(launcher, /BUILT_COMMIT/);
  assert.match(launcher, /BUILT_TREE/);
  assert.match(launcher, /CURRENT_COMMIT/);
  assert.match(launcher, /CURRENT_TREE/);
  assert.match(launcher, /different committed Git source tree/i);
  assert.match(launcher, /build source-commit does not match the authoritative Git HEAD/i);
  assert.match(launcher, /build source-tree does not match the authoritative Git tree/i);

  assert.match(builder, /rev-parse HEAD/i);
  assert.match(builder, /rev-parse .*\^\{tree\}/i);
  assert.match(builder, /archive --format=zip --output=\$CommittedSourceArchive \$SourceCommit/i);
  assert.match(builder, /\$Source = Join-Path \$BuildSourceRoot \$Folder/);
  assert.match(builder, /\$Source = Join-Path \$BuildSourceRoot \$File/);
  assert.doesNotMatch(builder, /\$Source = Join-Path \$PSScriptRoot \$Folder/);
  assert.doesNotMatch(builder, /'captures','logs'/);
  assert.match(builder, /Refusing to stamp a dirty source tree as commit/);
  assert.match(builder, /finally \{[\s\S]*Remove-Item -LiteralPath \$BuildStagingRoot/);
  assert.match(builder, /Source commit \$SourceCommit/);
  assert.match(builder, /source-commit/);
  assert.match(builder, /source-tree/);
});
