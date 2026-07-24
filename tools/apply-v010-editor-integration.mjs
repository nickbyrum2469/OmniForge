import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceOnce(file, before, after, label) {
  const source = read(file);
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Editor integration patch target not found: ${label || file}`);
  write(file, source.replace(before, after));
  return true;
}

replaceOnce(
  'app/app.js',
  "async function groundSelected(){\n  const object=selectedObject(),terrain=scene.objects.find(o=>o.type==='terrain'&&o.visible);if(!object)return showToast('Select an object first.','error');if(!terrain||['terrain','path','directionalLight','pointLight','empty'].includes(object.type))return showToast('This entity cannot be grounded to terrain.','error');\n  const transform=deepClone(object.transform),asset=object.type==='model'?(state.assets||[]).find(item=>item.type==='model'&&item.id===object.properties?.assetId):null;\n  const bottomOffset=asset?.bounds?.min?asset.bounds.min[1]*transform.scale[1]:-objectHalfExtents(object)[1];transform.position[1]=terrainHeight(terrain,transform.position[0],transform.position[2])-bottomOffset;await patchObject(object.id,{transform});showToast(`${object.name} grounded to terrain`,'success');\n}",
  "async function groundSelected(){\n  const object=selectedObject(),terrain=scene.objects.find(o=>o.type==='terrain'&&o.visible);\n  if(!object)return showToast('Select an object first.','error');\n  if(!terrain||['terrain','path','directionalLight','pointLight','empty'].includes(object.type))return showToast('This entity cannot be grounded to terrain.','error');\n  try{\n    markLocalMutation();\n    const payload=await api('/api/object/ground',{method:'POST',body:{objectId:object.id,maxTilt:35}});\n    applyState(payload.state,{forceSelection:true});\n    const diagnostics=payload.diagnostics||{};\n    scheduleAutoCapture(`Grounded ${object.name} using ${diagnostics.mode||'terrain contact'}`);\n    showToast(`${object.name} grounded · ${diagnostics.mode||'terrain contact'} · ${Number(diagnostics.terrainSlopeDegrees||0).toFixed(1)}° slope`,'success');\n  }catch(error){handleError(error,'Grounding failed');}\n}",
  'authoritative Ground button'
);

replaceOnce(
  'app/app.js',
  "    window.addEventListener('error',event=>handleError(event.error||event.message,'Unexpected editor error'));window.addEventListener('unhandledrejection',event=>handleError(event.reason,'Unexpected editor error'));",
  "    window.addEventListener('omniforge:apply-state',event=>{const nextState=event.detail?.state;if(nextState?.engine&&Array.isArray(nextState.scenes))applyState(nextState,{forceSelection:false});});\n    window.addEventListener('error',event=>handleError(event.error||event.message,'Unexpected editor error'));window.addEventListener('unhandledrejection',event=>handleError(event.reason,'Unexpected editor error'));",
  'direct editor state synchronization'
);

replaceOnce(
  'app/v010.js',
  "let snapshot = null;\nlet lastFoliageTransaction = null;\nlet timeTimer = null;",
  "let snapshot = null;\nlet lastFoliageTransaction = null;\nlet timeTimer = null;\n\nfunction synchronizeAuthoritativeEditor() {\n  if (snapshot?.state) window.dispatchEvent(new CustomEvent('omniforge:apply-state', { detail: { state: snapshot.state } }));\n}",
  'World-tab state synchronization helper'
);

replaceOnce(
  'app/v010.js',
  "    snapshot = await api('/api/v010/world');\n    populate();",
  "    snapshot = await api('/api/v010/world');\n    synchronizeAuthoritativeEditor();\n    populate();",
  'refresh synchronization'
);

replaceOnce(
  'app/v010.js',
  "  snapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(payload) });\n  populate();",
  "  snapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(payload) });\n  synchronizeAuthoritativeEditor();\n  populate();",
  'world apply synchronization'
);

replaceOnce(
  'app/v010.js',
  "      snapshot = await api('/api/v010/world/step', { method: 'POST', body: JSON.stringify({ seconds: 2 }) });\n      populate();",
  "      snapshot = await api('/api/v010/world/step', { method: 'POST', body: JSON.stringify({ seconds: 2 }) });\n      synchronizeAuthoritativeEditor();\n      populate();",
  'time-step synchronization'
);

console.log('Existing editor controls now use and immediately reflect v0.10 authorities.');
