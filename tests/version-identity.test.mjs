import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('repository and packaged project manifests report one OmniForge runtime version', () => {
  const packageManifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const projectManifest = JSON.parse(fs.readFileSync(new URL('../omniforge.project.json', import.meta.url), 'utf8'));
  const desktopSource = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  const editorHtml = fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const editorBootstrap = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
  const mcpSource = fs.readFileSync(new URL('../bridge/mcp-server.mjs', import.meta.url), 'utf8');
  assert.equal(projectManifest.version, packageManifest.version);
  assert.match(desktopSource, new RegExp(`const PRODUCT_VERSION = '${packageManifest.version.replaceAll('.', '\\.')}'`));
  assert.match(editorHtml, new RegExp(`id="engineVersion">v${packageManifest.version.replaceAll('.', '\\.')}`));
  assert.match(editorBootstrap, new RegExp(`version\\.textContent = 'v${packageManifest.version.replaceAll('.', '\\.')}'`));
  assert.match(mcpSource, new RegExp(`OmniForge ${packageManifest.version.replaceAll('.', '\\.')} MCP server started`));
});
