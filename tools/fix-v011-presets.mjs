import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve('server/v011-systems.mjs');
let source=fs.readFileSync(file,'utf8');
if(!source.includes('TERRAIN_PRESETS,'))source=source.replace('  clamp,\n','  clamp,\n  TERRAIN_PRESETS,\n');
const pattern=/export function updateTerrainProperties\(terrain, patch = \{\}\) \{[\s\S]*?\n\}\n\nexport function updatePathProperties/;
const replacement=`export function updateTerrainProperties(terrain, patch = {}) {\n  const current = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});\n  const protectedKeys = new Set(['bounds', 'sizeX', 'sizeZ']);\n  const selectedPreset = patch.preset && TERRAIN_PRESETS[patch.preset] ? TERRAIN_PRESETS[patch.preset] : null;\n  const next = selectedPreset ? { ...current, ...selectedPreset, preset: patch.preset } : { ...current };\n  for (const [key, value] of Object.entries(patch || {})) {\n    if (protectedKeys.has(key)) continue;\n    next[key] = value;\n  }\n  next.generatedRevision = Number(current.generatedRevision || 0) + 1;\n  terrain.properties = normalizeTerrainProperties(next, { ...terrain.transform, scale: [1, 1, 1] });\n  terrain.transform.scale = [1, 1, 1];\n  return terrain.properties;\n}\n\nexport function updatePathProperties`;
if(!source.includes('const selectedPreset = patch.preset')){if(!pattern.test(source))throw new Error('Terrain preset update function was not found.');source=source.replace(pattern,replacement);}
fs.writeFileSync(file,source,'utf8');
await import('./fix-v011-regressions.mjs');
console.log('Terrain preset defaults and v0.11 regression repairs applied.');
