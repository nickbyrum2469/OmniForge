import fs from 'node:fs';
import path from 'node:path';

const file=path.resolve('bridge/mcp-server.mjs');
let source=fs.readFileSync(file,'utf8');
function replaceOnce(before,after,label){if(source.includes(after))return;if(!source.includes(before))throw new Error(`v0.11 MCP patch target not found: ${label}`);source=source.replace(before,after);}
replaceOnce("import { v010Tools, callV010Tool } from './v010-tools.mjs';","import { v010Tools, callV010Tool } from './v010-tools.mjs';\nimport { v011Tools, callV011Tool } from './v011-tools.mjs';",'v011 import');
replaceOnce("const SERVER_INFO={name:'omniforge',version:'0.10.0'};","const SERVER_INFO={name:'omniforge',version:'0.11.0'};",'server version');
replaceOnce('const tools=[...v010Tools,','const tools=[...v011Tools,...v010Tools,','tool registration');
replaceOnce("async function callTool(name,args={}){\n  const v010Result=await callV010Tool(name,args);","async function callTool(name,args={}){\n  const v011Result=await callV011Tool(name,args);\n  if(v011Result.handled)return response(v011Result.value);\n  const v010Result=await callV010Tool(name,args);",'tool delegation');
fs.writeFileSync(file,source,'utf8');
console.log('Connected MCP to v0.11 terrain and spline authorities.');
