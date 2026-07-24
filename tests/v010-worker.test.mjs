import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('v0.10 worker IPC drains stdout before finalizing jobs', () => {
  const manager = fs.readFileSync(path.join(ROOT, 'server', 'job-manager.mjs'), 'utf8');
  const worker = fs.readFileSync(path.join(ROOT, 'workers', 'local-worker.mjs'), 'utf8');
  assert.match(manager, /'--request-file', requestFile/);
  assert.match(manager, /child\.on\('close'/);
  assert.doesNotMatch(manager, /child\.on\('exit'/);
  assert.match(manager, /fs\.rmSync\(requestFile,\{force:true\}\)/);
  assert.match(worker, /process\.argv\.indexOf\('--request-file'\)/);
  assert.match(worker, /fs\.readFileSync\(path\.resolve\(requestFile\),'utf8'\)/);
});
