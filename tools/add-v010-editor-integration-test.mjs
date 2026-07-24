import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('tests/v010.test.mjs');
let source = fs.readFileSync(file, 'utf8');
if (source.includes("existing Ground button and World tab synchronize through authoritative state")) {
  console.log('Live editor integration test already exists.');
  process.exit(0);
}

const marker = "test('v0.10 bootstrap serves world systems and upgrades the existing Ground command'";
if (!source.includes(marker)) throw new Error('Live editor test insertion point was not found.');

const testBlock = String.raw`test('v0.10 existing Ground button and World tab synchronize through authoritative state', () => {
  const editor = fs.readFileSync(path.join(ROOT, 'app', 'app.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  assert.match(editor, /api\('\/api\/object\/ground',\{method:'POST'/);
  assert.match(editor, /applyState\(payload\.state,\{forceSelection:true\}\)/);
  assert.match(editor, /omniforge:apply-state/);
  assert.doesNotMatch(editor, /bottomOffset=asset\?\.bounds\?\.min/);
  assert.match(worldUi, /synchronizeAuthoritativeEditor/);
  assert.match(worldUi, /CustomEvent\('omniforge:apply-state'/);
});

`;
source = source.replace(marker, testBlock + marker);
fs.writeFileSync(file, source, 'utf8');
console.log('Added live editor state and Ground authority regression test.');
