import fs from 'node:fs';

const path = 'scripts/apply-phase1-1-world-authoring.mjs';
let source = fs.readFileSync(path, 'utf8');
const marker = "edit('server/v010-systems.mjs'";
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) throw new Error('Phase 1.1 migration marker was not found.');

const prefix = source.slice(0, markerIndex);
const tail = source.slice(markerIndex);
let output = '';
let inOuterTemplate = false;

for (let index = 0; index < tail.length; index += 1) {
  const character = tail[index];
  if (character === '`' && tail[index - 1] !== '\\') {
    if (!inOuterTemplate) {
      inOuterTemplate = true;
      output += character;
      continue;
    }
    const suffix = tail.slice(index + 1);
    const isOuterClose = /^\s*(?:,|\);)/.test(suffix);
    if (isOuterClose) {
      inOuterTemplate = false;
      output += character;
    } else {
      output += '\\`';
    }
    continue;
  }
  if (inOuterTemplate && character === '$' && tail[index + 1] === '{') {
    output += '\\${';
    index += 1;
    continue;
  }
  output += character;
}

const repaired = prefix + output;
if (repaired !== source) {
  fs.writeFileSync(path, repaired);
  console.log('Repaired raw source templates in the Phase 1.1 migration.');
} else {
  console.log('Phase 1.1 migration source templates were already repaired.');
}
