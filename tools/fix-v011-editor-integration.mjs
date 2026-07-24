import fs from 'node:fs';
import path from 'node:path';
const read=file=>fs.readFileSync(path.resolve(file),'utf8');
const write=(file,content)=>fs.writeFileSync(path.resolve(file),content,'utf8');

let editor=read('app/v011.js');
editor=editor.replace(
  "function applyPayload(payload, forceSelection = false) {\n  foundation = payload;\n  if (payload?.state) bridge()?.applyState?.(payload.state, { forceSelection });\n  refreshToolbar();\n  enhanceInspector();\n}",
  "function applyPayload(payload, forceSelection = false) {\n  if (payload?.presets || payload?.pathDiagnostics || payload?.foundation) foundation = payload;\n  if (payload?.state) bridge()?.applyState?.(payload.state, { forceSelection });\n  refreshToolbar();\n  enhanceInspector();\n}\n\nasync function applyMutation(payload, forceSelection = true) {\n  if (payload?.state) bridge()?.applyState?.(payload.state, { forceSelection });\n  await refreshFoundation();\n}"
);
editor=editor.replace(
  "function enhanceInspector() {\n  const container = $('#inspectorContent');\n  const object = selectedObject();\n  if (!container || !object) return;\n  container.querySelectorAll('[data-v011-panel]').forEach(node => node.remove());",
  "function enhanceInspector() {\n  const container = $('#inspectorContent');\n  const object = selectedObject();\n  if (!container || !object) return;\n  const signature = `${object.id}:${currentSnapshot()?.state?.engine?.revision || 0}:${foundation?.terrainDiagnostics?.checkedAt || ''}`;\n  if (container.dataset.v011Signature === signature && container.querySelector('[data-v011-panel]')) return;\n  container.dataset.v011Signature = signature;\n  container.querySelectorAll('[data-v011-panel]').forEach(node => node.remove());"
);
editor=editor
  .replaceAll("applyPayload(await api(`/api/v011/terrain/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);","await applyMutation(await api(`/api/v011/terrain/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);")
  .replaceAll("applyPayload(await api(`/api/v011/terrain/${encodeURIComponent(id)}/expand`, { method: 'POST', body: { direction, amount } }), true);","await applyMutation(await api(`/api/v011/terrain/${encodeURIComponent(id)}/expand`, { method: 'POST', body: { direction, amount } }), true);")
  .replaceAll("applyPayload(await api(`/api/v011/path/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);","await applyMutation(await api(`/api/v011/path/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);")
  .replaceAll("applyPayload(await api(`/api/v011/path/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }), true);","await applyMutation(await api(`/api/v011/path/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }), true);")
  .replaceAll("applyPayload(await api(`/api/v011/path/${encodeURIComponent(drag.pathId)}/node/${drag.index}`, { method: 'PATCH', body: { x: point[0], z: point[1] } }), true);","await applyMutation(await api(`/api/v011/path/${encodeURIComponent(drag.pathId)}/node/${drag.index}`, { method: 'PATCH', body: { x: point[0], z: point[1] } }), true);")
  .replaceAll("applyPayload(await api(`/api/v011/path/${encodeURIComponent(splineEditPathId)}/node`, { method: 'POST', body: { x: point[0], z: point[2] } }), true);","await applyMutation(await api(`/api/v011/path/${encodeURIComponent(splineEditPathId)}/node`, { method: 'POST', body: { x: point[0], z: point[2] } }), true);");
editor=editor.replace(
  "function installToolbar() {\n  if ($('#splineToggle')) return;\n  const grid = $('#gridToggle')?.closest('label');\n  if (!grid) return;\n  const label = document.createElement('label');\n  label.className = 'toolbar-check';\n  label.innerHTML = '<input id=\"splineToggle\" type=\"checkbox\" checked><span>Splines</span>';\n  grid.insertAdjacentElement('afterend', label);\n  $('#splineToggle').addEventListener('change', async event => {",
  "function installToolbar() {\n  let input = $('#splineToggle');\n  if (!input) {\n    const grid = $('#gridToggle')?.closest('label');\n    if (!grid) return;\n    const label = document.createElement('label');\n    label.className = 'toolbar-check';\n    label.innerHTML = '<input id=\"splineToggle\" type=\"checkbox\" checked><span>Splines</span>';\n    grid.insertAdjacentElement('afterend', label);\n    input = $('#splineToggle');\n  }\n  if (input.dataset.v011Bound) return;\n  input.dataset.v011Bound = 'true';\n  input.addEventListener('change', async event => {"
);
write('app/v011.js',editor);

let server=read('server/server.mjs');
if(!server.includes("from '../app/worldgen.js'"))server=server.replace("import { searchMarketplace, marketplaceDetails, prepareMarketplaceDownload, resolveMarketplaceImportFiles, createMaterialFromMarketplaceDownload, inspectDownloadedJob } from './marketplace.mjs';","import { searchMarketplace, marketplaceDetails, prepareMarketplaceDownload, resolveMarketplaceImportFiles, createMaterialFromMarketplaceDownload, inspectDownloadedJob } from './marketplace.mjs';\nimport { terrainHeightAt as sharedTerrainHeightAt } from '../app/worldgen.js';");
server=server.replace(/function terrainHeightAt\(terrain,x,z\)\{[\s\S]*?\n\}/,"function terrainHeightAt(terrain,x,z,paths=[]){return sharedTerrainHeightAt(terrain,x,z,paths);}");
server=server.replace("const terrain=scene?.objects?.find(object=>object.type==='terrain');if(!Array.isArray(body.position))position[1]=terrainHeightAt(terrain,position[0],position[2])+Math.max(0,size[1]/2-(asset.bounds?.center?.[1]||0));","const terrain=scene?.objects?.find(object=>object.type==='terrain'),paths=scene?.objects?.filter(object=>object.type==='path'&&object.visible!==false)||[];if(!Array.isArray(body.position))position[1]=terrainHeightAt(terrain,position[0],position[2],paths)+Math.max(0,size[1]/2-(asset.bounds?.center?.[1]||0));");
write('server/server.mjs',server);
console.log('Stabilized v0.11 editor mutation refresh, spline toggle binding, inspector augmentation, and server placement.');
