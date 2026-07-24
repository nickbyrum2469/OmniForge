import fs from 'node:fs';
import path from 'node:path';

const read=file=>fs.readFileSync(path.resolve(file),'utf8');
const write=(file,content)=>fs.writeFileSync(path.resolve(file),content,'utf8');

let state=read('server/state-store.mjs');
state=state.replace(
  "import { migrateSceneWorldFoundation, normalizeTerrainProperties, normalizePathProperties } from '../app/worldgen.js';",
  "import { migrateSceneWorldFoundation, normalizeTerrainProperties, normalizePathProperties, terrainHeightAt } from '../app/worldgen.js';"
);
state=state.replace(
  "const scene = migrateSceneWorldFoundation(starterScene(template));\n  return {",
  "const scene = migrateSceneWorldFoundation(starterScene(template));\n  const starterTerrain=scene.objects.find(object=>object.type==='terrain'),starterPaths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);\n  if(starterTerrain)for(const object of scene.objects.filter(item=>['block-main','marker-main'].includes(item.id))){const half=Math.max(.05,Math.abs(Number(object.transform.scale?.[1]||1))*.5);object.transform.position[1]=terrainHeightAt(starterTerrain,object.transform.position[0],object.transform.position[2],starterPaths)+half;}\n  return {"
);
write('server/state-store.mjs',state);

let systems=read('server/v011-systems.mjs');
const diagnosticsPattern=/export function pathDiagnostics\(pathObject, terrain\) \{[\s\S]*?\n\}\n\nexport function updateTerrainProperties/;
const diagnosticsReplacement=`export function pathDiagnostics(pathObject, terrain) {\n  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});\n  const samples = samplePathSpline(pathObject, { spacing: Math.max(0.5, properties.width * 0.3) });\n  const profile = compilePathProfile(pathObject, terrain);\n  let rawMaxGrade = 0, compiledMaxGrade = 0, estimatedCut = 0, estimatedFill = 0;\n  for (let index = 1; index < profile.length; index += 1) {\n    const a = profile[index - 1], b = profile[index];\n    const distance = Math.max(0.001, Math.hypot(b.x - a.x, b.z - a.z));\n    const rawA = terrainBaseHeightAt(terrain, a.x, a.z), rawB = terrainBaseHeightAt(terrain, b.x, b.z);\n    rawMaxGrade = Math.max(rawMaxGrade, Math.abs(rawB - rawA) / distance * 100);\n    compiledMaxGrade = Math.max(compiledMaxGrade, Math.abs(b.y - a.y) / distance * 100);\n    if (b.y < rawB) estimatedCut += rawB - b.y; else estimatedFill += b.y - rawB;\n  }\n  return {\n    schemaVersion: 1, nodeCount: properties.points.length, sampleCount: samples.length, profileSampleCount: profile.length, spline: properties.spline,\n    rawMaxGradePercent: rawMaxGrade, compiledMaxGradePercent: compiledMaxGrade, configuredMaxGradePercent: properties.maxGradePercent,\n    estimatedCut, estimatedFill, carveTerrain: properties.carveTerrain,\n    validation: compiledMaxGrade <= properties.maxGradePercent + 0.15 ? 'passed' : 'failed', checkedAt: now()\n  };\n}\n\nexport function updateTerrainProperties`;
if(!systems.includes('profileSampleCount: profile.length')){
  if(!diagnosticsPattern.test(systems))throw new Error('Path diagnostics function was not found.');
  systems=systems.replace(diagnosticsPattern,diagnosticsReplacement);
}
write('server/v011-systems.mjs',systems);

for(const name of fs.readdirSync('tests')){
  if(!name.endsWith('.mjs'))continue;
  const file=path.join('tests',name);
  let source=read(file);
  source=source
    .replaceAll("'0.9.0'","'0.11.0'")
    .replaceAll('"0.9.0"','"0.11.0"')
    .replaceAll('0\\.9\\.0','0\\.11\\.0')
    .replaceAll('schemaVersion!==8','schemaVersion!==9')
    .replaceAll('schemaVersion===8','schemaVersion===9')
    .replaceAll('schemaVersion !== 8','schemaVersion !== 9')
    .replaceAll('schemaVersion === 8','schemaVersion === 9');
  if(name==='engine.test.mjs'){
    source=source.replace(
      "const terrain=scene.objects.find(object=>object.type==='terrain');\n  for(const object of scene.objects.filter(object=>['box','sphere'].includes(object.type))){\n    const surface=terrainHeight(terrain,object.transform.position[0],object.transform.position[2]);",
      "const terrain=scene.objects.find(object=>object.type==='terrain');\n  const paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);\n  for(const object of scene.objects.filter(object=>['box','sphere'].includes(object.type))){\n    const surface=terrainHeight(terrain,object.transform.position[0],object.transform.position[2],paths);"
    );
  }
  write(file,source);
}

for(const launcher of ['START_DESKTOP.bat','RUN_OMNIFORGE.bat','RUN_OMNIFORGE_DESKTOP.bat']){
  if(!fs.existsSync(path.resolve(launcher)))continue;
  let source=read(launcher).replaceAll('EXPECTED_VERSION=OmniForge 0.9.0','EXPECTED_VERSION=OmniForge 0.11.0').replaceAll('EXPECTED_VERSION=OmniForge 0.10.0','EXPECTED_VERSION=OmniForge 0.11.0');
  write(launcher,source);
}

console.log('Repaired path-aware starter grounding, profile diagnostics, v0.11 migration expectations, and all desktop launcher identities.');
