import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('app/renderer.js');
let source = fs.readFileSync(file, 'utf8');

const smoothstep = "function smoothstep(a,b,x){const t=clamp((x-a)/(b-a||1),0,1);return t*t*(3-2*t);}";
const helpers = `${smoothstep}\nfunction lerp(a,b,t){return a+(b-a)*t;}`;
if (!source.includes('function lerp(a,b,t)')) {
  if (!source.includes(smoothstep)) throw new Error('Renderer interpolation insertion point was not found.');
  source = source.replace(smoothstep, helpers);
}

if (!source.includes('export function terrainMesh(object,paths)')) {
  if (!source.includes('function terrainMesh(object,paths)')) throw new Error('Terrain mesh export insertion point was not found.');
  source = source.replace('function terrainMesh(object,paths)', 'export function terrainMesh(object,paths)');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Defined renderer lerp helper and exported terrainMesh for executable regression coverage.');
