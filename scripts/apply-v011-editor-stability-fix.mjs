import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchDirectory = path.join(root, 'scripts', 'patches');
const patchFiles = fs.readdirSync(patchDirectory)
  .filter(name => /^v011-editor-stability-\d+\.patch$/.test(name))
  .sort();

if (!patchFiles.length) throw new Error('No v0.11 editor-stability patch parts were found.');

const patch = patchFiles
  .map(name => fs.readFileSync(path.join(patchDirectory, name), 'utf8'))
  .join('\n');

const result = spawnSync('git', ['apply', '--whitespace=nowarn', '-'], {
  cwd: root,
  input: patch,
  encoding: 'utf8'
});

if (result.status !== 0) {
  process.stderr.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  throw new Error(`The deterministic editor-stability patch failed with exit code ${result.status}.`);
}

console.log(`Applied ${patchFiles.length} verified v0.11 editor-stability patch parts to the authoritative repair branch; Windows packaging verification is required before integration.`);
