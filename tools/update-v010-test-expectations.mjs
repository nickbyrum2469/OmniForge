import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('tests/engine.test.mjs');
let source = fs.readFileSync(file, 'utf8');
source = source
  .replaceAll("/--set-file-version '0\\.9\\.0\\.0'/", "/--set-file-version '0\\.10\\.0\\.0'/")
  .replaceAll("/--set-product-version '0\\.9\\.0\\.0'/", "/--set-product-version '0\\.10\\.0\\.0'/")
  .replaceAll("assert.equal(health.version,'0.9.0')", "assert.equal(health.version,'0.10.0')");
fs.writeFileSync(file, source, 'utf8');
console.log('Updated release-identity regression assertions to OmniForge v0.10.0.');
