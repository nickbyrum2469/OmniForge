import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('app/renderer.js');
let source = fs.readFileSync(file, 'utf8');
source = source
  .replace("wind=object.properties?.wind||{};", "foliageWind=object.properties?.wind||{};")
  .replace("Number(wind.strength??.35)*Number(scene.settings.windStrength??.35)", "Number(foliageWind.strength??.35)*Number(scene.settings.windStrength??.35)")
  .replace("Number(wind.frequency??1)", "Number(foliageWind.frequency??1)");
fs.writeFileSync(file, source, 'utf8');
console.log('Resolved foliage wind identifier collision.');
