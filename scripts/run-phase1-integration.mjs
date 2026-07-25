import fs from 'node:fs';

const targets = ['app/app.js', 'app/renderer.js', 'app/v010.js', 'app/v010.css'];
const endings = new Map();
for (const path of targets) {
  const source = fs.readFileSync(path, 'utf8');
  const ending = source.includes('\r\n') ? '\r\n' : '\n';
  endings.set(path, ending);
  if (ending === '\r\n') fs.writeFileSync(path, source.replace(/\r\n/g, '\n'));
}

await import('./apply-phase1-sky-navigation.mjs');

for (const path of targets) {
  if (endings.get(path) !== '\r\n') continue;
  const source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  fs.writeFileSync(path, source.replace(/\n/g, '\r\n'));
}

await import('./phase1-followup.mjs');

console.log('Phase 1 integration completed with original line-ending conventions preserved.');
