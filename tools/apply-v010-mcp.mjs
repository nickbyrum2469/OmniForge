import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('bridge/mcp-server.mjs');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`MCP patch target not found: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "import { searchMarketplace, marketplaceDetails, prepareMarketplaceDownload, resolveMarketplaceImportFiles, createMaterialFromMarketplaceDownload, inspectDownloadedJob } from '../server/marketplace.mjs';",
  "import { searchMarketplace, marketplaceDetails, prepareMarketplaceDownload, resolveMarketplaceImportFiles, createMaterialFromMarketplaceDownload, inspectDownloadedJob } from '../server/marketplace.mjs';\nimport { v010Tools, callV010Tool } from './v010-tools.mjs';",
  'v0.10 tool import'
);
replaceOnce('const tools=[', 'const tools=[...v010Tools,', 'tool registration');
replaceOnce(
  "description:'Place a mesh entity directly on the authoritative terrain using its current world footprint instead of guessing a Y coordinate.',\n    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'}}}",
  "description:'Fit an unlocked mesh entity to authoritative terrain with category-aware support points, controlled tilt, root sockets, foundation mode, or vehicle contact mode.',\n    inputSchema:{type:'object',required:['objectId'],properties:{objectId:{type:'string'},maxTilt:{type:'number',minimum:0,maximum:89}}}",
  'ground tool schema'
);
replaceOnce(
  'async function callTool(name,args={}){\n  switch(name){',
  "async function callTool(name,args={}){\n  const v010Result=await callV010Tool(name,args);\n  if(v010Result.handled)return response(v010Result.value);\n  switch(name){",
  'v0.10 tool delegation'
);

fs.writeFileSync(file, source, 'utf8');
console.log('Connected MCP to authoritative v0.10 systems.');
