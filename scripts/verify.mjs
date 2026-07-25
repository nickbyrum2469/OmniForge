import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const testFiles=fs.readdirSync('tests')
  .filter(file=>file.endsWith('.test.mjs'))
  .sort()
  .map(file=>`tests/${file}`);

const checks=[
  ['Syntax: server', [process.execPath,'--check','server/server.mjs']],
  ['Syntax: provider framework', [process.execPath,'--check','server/provider-framework.mjs']],
  ['Syntax: job manager', [process.execPath,'--check','server/job-manager.mjs']],
  ['Syntax: marketplace', [process.execPath,'--check','server/marketplace.mjs']],
  ['Syntax: local worker', [process.execPath,'--check','workers/local-worker.mjs']],
  ['Syntax: MCP bridge', [process.execPath,'--check','bridge/mcp-server.mjs']],
  ['Syntax: editor', [process.execPath,'--check','app/app.js']],
  ['Syntax: runtime diagnostics', [process.execPath,'--check','app/runtime-diagnostics.js']],
  ['Syntax: renderer', [process.execPath,'--check','app/renderer.js']],
  ['Syntax: desktop shell', [process.execPath,'--check','desktop/main.cjs']],
  ['Automated tests', [process.execPath,'--test',...testFiles]]
];

for(const [label,command] of checks){
  const [exe,...args]=command;
  const result=spawnSync(exe,args,{stdio:'inherit',shell:false});
  if(result.status!==0){
    console.error(`${label} failed.`);
    process.exit(result.status||1);
  }
  console.log(`${label}: passed`);
}

for(const required of [
  'app/index.html','app/renderer.js','app/app.js','bridge/mcp-server.mjs',
  'desktop/main.cjs','desktop/preload.cjs','resources/omniforge-icon.png','resources/omniforge-icon.ico',
  'BUILD_DESKTOP_WINDOWS.ps1','START_ENGINE.bat','START_DESKTOP.bat','START_BROWSER_DEV.bat','STOP_ENGINE.bat','CONNECT_CODEX.bat',
  'data/engine-state.json','data/project-catalog.json','data/catalogs/kenney.json','data/catalogs/quaternius.json','data/catalogs/quaternius-animations.json',
  'docs/SURFACE_STUDIO_V09.md','docs/VERIFICATION_V090.md','docs/FILES_CHANGED_V090.md','docs/AUTO_OPTIMIZATION_V021.md','docs/ROADMAP_V06_TO_V21.md','docs/MARKETPLACE.md','docs/VERIFICATION_V080.md','docs/FILES_CHANGED_V080.md','docs/OMNIFORGE_V051_IMPLEMENTATION_PLAN.md','docs/ROADMAP_V06_TO_V20.md','docs/VERIFICATION_V071.md','docs/FILES_CHANGED_V071.md','docs/PROVIDER_SDK.md','docs/JOB_SYSTEM.md','docs/WORKER_PROTOCOL.md','docs/VERIFICATION_V060.md','docs/FILES_CHANGED_V060.md','docs/ASSET_PIPELINE.md','docs/VERIFICATION_V052.md','docs/FILES_CHANGED_V052.md','docs/VERIFICATION_V051.md','docs/WINDOWS_SMOKE_TEST.md','docs/FILES_CHANGED_V051.md',
  'assets/materials/material-highland-grass/basecolor.png','assets/materials/material-packed-earth/basecolor.png','tests/fixtures/validated-cube.glb'
]){
  if(!fs.existsSync(required))throw new Error(`Required file missing: ${required}`);
}
console.log('Package structure: passed');
console.log('OmniForge verification complete.');
