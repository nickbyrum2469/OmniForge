import fs from 'node:fs';
import path from 'node:path';

const testsRoot=path.resolve('tests');
for(const entry of fs.readdirSync(testsRoot,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith('.mjs'))continue;
  const file=path.join(testsRoot,entry.name);
  let source=fs.readFileSync(file,'utf8');
  source=source
    .replaceAll("'0.10.0'","'0.11.0'")
    .replaceAll('"0.10.0"','"0.11.0"')
    .replaceAll('0\\.10\\.0','0\\.11\\.0')
    .replaceAll("'0.10.0.0'","'0.11.0.0'")
    .replaceAll('v010-bootstrap.mjs','v011-bootstrap.mjs')
    .replaceAll('schemaVersion,8','schemaVersion,9')
    .replaceAll('schemaVersion, 8','schemaVersion, 9');
  fs.writeFileSync(file,source,'utf8');
}
console.log('Updated v0.11 release, bootstrap, and schema regression expectations.');
