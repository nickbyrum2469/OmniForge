import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Git-aware desktop launcher rebuilds after source commits and local edits', () => {
  const launcher = fs.readFileSync(path.join(ROOT, 'START_DESKTOP.bat'), 'utf8');
  const builder = fs.readFileSync(path.join(ROOT, 'BUILD_DESKTOP_WINDOWS.ps1'), 'utf8');

  assert.match(launcher, /source-commit/i);
  assert.match(launcher, /git -C .* rev-parse HEAD/i);
  assert.match(launcher, /git -C .* status --porcelain/i);
  assert.match(launcher, /BUILT_COMMIT/);
  assert.match(launcher, /CURRENT_COMMIT/);
  assert.match(launcher, /different Git source commit/i);

  assert.match(builder, /rev-parse HEAD/i);
  assert.match(builder, /Source commit \$SourceCommit/);
  assert.match(builder, /source-commit/);
});
