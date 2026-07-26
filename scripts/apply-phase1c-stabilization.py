from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, content):
    Path(path).write_text(content, encoding='utf-8')
    print(f'updated {path}')


def replace_required(source, before, after, path, marker=None):
    if marker and marker in source:
        return source
    if before not in source:
        raise RuntimeError(f'Expected anchor missing in {path}: {before[:120]!r}')
    return source.replace(before, after, 1)


# Renderer: one celestial visual authority, synchronized Sun light, softer shadow floor.
path = 'app/renderer.js'
source = read(path)
source = replace_required(
    source,
    "import { HDRPipeline } from './hdr-pipeline.js';",
    "import { HDRPipeline } from './hdr-pipeline.js';\nimport { directionFromAzimuthElevation } from './celestial-mechanics.js';",
    path,
    "import { directionFromAzimuthElevation } from './celestial-mechanics.js';"
)
source = source.replace('return mix(0.32,1.0,sum/9.0);', 'return mix(0.48,1.0,sum/9.0);', 1)
source = replace_required(
    source,
    "  meshFor(object,scene){\n    if(object.type==='box')",
    "  meshFor(object,scene){\n    if(object.properties?.celestialRole)return null;\n    if(object.type==='box')",
    path,
    "if(object.properties?.celestialRole)return null;"
)
old_light = """  lightState(scene,editorMode='edit'){
    const sun=scene.objects.find(o=>o.type==='directionalLight'&&o.visible&&o.properties?.celestialRole==='sun')||scene.objects.find(o=>o.type==='directionalLight'&&o.visible);let dir=[.45,-.8,.25],color=[1,.95,.82],intensity=1,shadows=true;
    if(sun){const rx=(sun.transform.rotation[0]||0)*DEG,ry=(sun.transform.rotation[1]||0)*DEG;dir=normalize([Math.sin(ry)*Math.cos(rx),Math.sin(rx),-Math.cos(ry)*Math.cos(rx)]);color=hexToRgb(sun.properties.color);intensity=Number(sun.properties.intensity||1);shadows=sun.properties.castsShadows!==false;}
    const viewportLighting=resolveViewportLighting(scene.settings||{},editorMode,intensity);intensity=viewportLighting.sunIntensity;
    const points=scene.objects.filter(o=>o.type==='pointLight'&&o.visible).slice(0,4);return {dir,color,intensity,points,shadows,...viewportLighting};
  }"""
new_light = """  lightState(scene,editorMode='edit'){
    const sun=scene.objects.find(o=>o.type==='directionalLight'&&o.visible&&o.properties?.celestialRole==='sun')||scene.objects.find(o=>o.type==='directionalLight'&&o.visible&&!o.properties?.celestialRole);let dir=[.45,-.8,.25],color=[1,.95,.82],intensity=1,shadows=true;
    if(sun){
      const azimuth=Number(sun.properties?.azimuth),elevation=Number(sun.properties?.elevation);
      if(Number.isFinite(azimuth)&&Number.isFinite(elevation))dir=scale(normalize(directionFromAzimuthElevation(azimuth,elevation)),-1);
      else{const rx=(sun.transform.rotation[0]||0)*DEG,ry=(sun.transform.rotation[1]||0)*DEG;dir=normalize([Math.sin(ry)*Math.cos(rx),Math.sin(rx),-Math.cos(ry)*Math.cos(rx)]);}
      color=hexToRgb(sun.properties?.color||'#fff4d8');intensity=Number(sun.properties?.intensity||1);shadows=sun.properties?.castsShadows!==false;
    }
    const viewportLighting=resolveViewportLighting(scene.settings||{},editorMode,intensity);intensity=viewportLighting.sunIntensity;
    const points=scene.objects.filter(o=>o.type==='pointLight'&&o.visible&&!o.properties?.celestialRole).slice(0,4);return {dir,color,intensity,points,shadows,sunAuthorityId:sun?.id||null,...viewportLighting};
  }"""
source = replace_required(source, old_light, new_light, path, 'sunAuthorityId:')
source = source.replace("if(object.type.includes('Light'))radius=1;", "if(object.properties?.celestialRole)continue;if(object.type.includes('Light'))radius=1;", 1)
write(path, source)


# App: guard frame scheduling and rebuild renderer without terminating the editor.
path = 'app/app.js'
source = read(path)
source = replace_required(
    source,
    "import { createLookInputState, beginLookInputSession, endLookInputSession, applyLookDelta } from './viewport-navigation.js';",
    "import { createLookInputState, beginLookInputSession, endLookInputSession, applyLookDelta } from './viewport-navigation.js';\nimport { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';",
    path,
    "import { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';"
)
source = replace_required(
    source,
    "const lookInputState = createLookInputState();",
    """const lookInputState = createLookInputState();
let renderRecoveryInFlight = false;
let lastRenderFailureToastAt = 0;
const renderCrashGuard = new RenderCrashGuard({
  failureWindowMs: 5000,
  tripThreshold: 3,
  cooldownMs: 1800,
  onFailure: ({error,recentFailures,totalFailures}) => {
    window.__omniforgeDiagnostics?.warn?.('viewport-render-failure',{message:error.message,stack:error.stack||'',recentFailures,totalFailures});
    const now=Date.now();if(now-lastRenderFailureToastAt>1800){lastRenderFailureToastAt=now;showToast('Viewport renderer recovered from an error. Crash evidence was recorded.','error');}
  },
  onTrip: ({error}) => {
    keys.clear();try{document.exitPointerLock?.();}catch{}
    rebuildRendererAfterFailure(error);
  },
  onRecover: () => window.__omniforgeDiagnostics?.event?.('viewport-render-recovered',{})
});""",
    path,
    'const renderCrashGuard = new RenderCrashGuard'
)
anchor = "function animationLoop(now) {"
if 'function rebuildRendererAfterFailure' not in source:
    helper = """function rebuildRendererAfterFailure(error) {
  if(renderRecoveryInFlight)return;
  renderRecoveryInFlight=true;
  window.__omniforgeDiagnostics?.warn?.('viewport-renderer-rebuild-requested',{message:error?.message||String(error||'unknown')});
  window.setTimeout(()=>{
    try{
      renderer?.dispose?.();
      renderer=new Renderer3D(ui.viewport);
      renderer.setAssets(state?.assets||[]);
      showToast('Viewport renderer restarted without closing OmniForge.','success');
    }catch(rebuildError){
      window.__omniforgeDiagnostics?.warn?.('viewport-renderer-rebuild-failed',{message:rebuildError.message,stack:rebuildError.stack||''});
      showToast('Viewport recovery failed. Reopen OmniForge in Safe Mode and copy the crash details.','error');
    }finally{renderRecoveryInFlight=false;}
  },260);
}

"""
    source = source.replace(anchor, helper + anchor, 1)
old_loop = """function animationLoop(now) {
  const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('animationLoop',{},20)||(()=>{});
  const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;updateCamera(dt);if(state?.editor.mode==='play'){behaviorStep(dt);physicsAccumulator=Math.min(.2,physicsAccumulator+dt);while(physicsAccumulator>=1/60){physicsStep(1/60);physicsAccumulator-=1/60;}}if(renderer&&scene)renderer.render(scene,camera,selectedId,{editorMode:state?.editor?.mode||'edit'});
  frameCounter++;fpsTimer+=dt;if(fpsTimer>=.5){ui.fpsStatus.textContent=`${Math.round(frameCounter/fpsTimer)} FPS`;frameCounter=0;fpsTimer=0;ui.cameraPositionBadge.textContent=`X ${camera.position[0].toFixed(1)} · Y ${camera.position[1].toFixed(1)} · Z ${camera.position[2].toFixed(1)}`;}
  finishDiagnostic({dtMs:Number((dt*1000).toFixed(3))});
  requestAnimationFrame(animationLoop);
}"""
new_loop = """function animationLoop(now) {
  const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('animationLoop',{},20)||(()=>{});
  let dt=0;let renderResult={rendered:false};
  try{
    dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    if(camera){const safe=sanitizeCameraState(camera,scene?.editorCamera||{});Object.assign(camera,safe);if(scene)scene.editorCamera={...safe,position:[...safe.position]};}
    updateCamera(dt);
    if(state?.editor.mode==='play'){behaviorStep(dt);physicsAccumulator=Math.min(.2,physicsAccumulator+dt);while(physicsAccumulator>=1/60){physicsStep(1/60);physicsAccumulator-=1/60;}}
    renderResult=renderCrashGuard.run(()=>{if(renderer&&scene)renderer.render(scene,camera,selectedId,{editorMode:state?.editor?.mode||'edit'});},now);
    frameCounter++;fpsTimer+=dt;if(fpsTimer>=.5){ui.fpsStatus.textContent=`${Math.round(frameCounter/Math.max(.001,fpsTimer))} FPS`;frameCounter=0;fpsTimer=0;ui.cameraPositionBadge.textContent=`X ${camera.position[0].toFixed(1)} · Y ${camera.position[1].toFixed(1)} · Z ${camera.position[2].toFixed(1)}`;}
  }catch(error){renderResult=renderCrashGuard.run(()=>{throw error;},now);}
  finally{
    finishDiagnostic({dtMs:Number((dt*1000).toFixed(3)),rendered:Boolean(renderResult.rendered),suspended:Boolean(renderResult.suspended)});
    requestAnimationFrame(animationLoop);
  }
}"""
source = replace_required(source, old_loop, new_loop, path, 'renderResult=renderCrashGuard.run')
source = source.replace(
    "snapshot:()=>deepClone({state,scene,camera,selectedId,playMode:state?.editor?.mode||'edit',projects,layout:state?.editor?.layout}),",
    "snapshot:()=>deepClone({state,scene,camera,selectedId,playMode:state?.editor?.mode||'edit',projects,layout:state?.editor?.layout,renderCrashGuard:renderCrashGuard.snapshot()}),",
    1
)
write(path, source)


# Desktop shell: structured incidents and bounded renderer/GPU recovery.
path = 'desktop/main.cjs'
source = read(path)
source = replace_required(
    source,
    "const LOG_DIR = path.join(uniqueUserData, 'logs');",
    "const LOG_DIR = path.join(uniqueUserData, 'logs');\nconst INCIDENT_DIR = path.join(uniqueUserData, 'incidents');",
    path,
    'const INCIDENT_DIR ='
)
source = source.replace("fs.mkdirSync(LOG_DIR, { recursive: true });", "fs.mkdirSync(LOG_DIR, { recursive: true });\nfs.mkdirSync(INCIDENT_DIR, { recursive: true });", 1)
source = replace_required(
    source,
    "let runtimeInfo = null;",
    "let runtimeInfo = null;\nlet rendererRecoveryInFlight = false;\nlet rendererRecoveryAttempts = [];",
    path,
    'let rendererRecoveryInFlight'
)
incident_anchor = "function appendDiagnostic(message) { fs.appendFileSync(path.join(LOG_DIR,'diagnostics.log'),`[${new Date().toISOString()}] ${message}\\n`,'utf8'); }"
if 'function writeIncident' not in source:
    incident_helpers = incident_anchor + """
function writeIncident(kind, details={}) {
  const timestamp=new Date();const incident={kind,product:PRODUCT_NAME,version:PRODUCT_VERSION,at:timestamp.toISOString(),pid:process.pid,safeMode,runtime:runtimeInfo,details};
  const filename=`${timestamp.toISOString().replace(/[:.]/g,'-')}-${String(kind).replace(/[^a-z0-9_-]/gi,'-')}.json`;
  try{writeJson(path.join(INCIDENT_DIR,filename),incident);}catch(error){appendLog(`Incident write failed: ${error.message}`);}
  return incident;
}
function recentRendererRecoveryCount(now=Date.now()) {
  const cutoff=now-60000;rendererRecoveryAttempts=rendererRecoveryAttempts.filter(value=>value>=cutoff);return rendererRecoveryAttempts.length;
}
async function recoverRendererProcess(kind, details={}) {
  writeIncident(kind,details);
  if(shuttingDown||!mainWindow||mainWindow.isDestroyed()||rendererRecoveryInFlight)return;
  const reason=String(details.reason||'unknown');if(reason==='clean-exit')return;
  rendererRecoveryAttempts.push(Date.now());const attempts=recentRendererRecoveryCount();
  if(attempts>2){
    const result=await dialog.showMessageBox(mainWindow,{type:'error',title:'OmniForge viewport recovery',message:'The viewport renderer stopped repeatedly.',detail:`Crash evidence was saved to ${INCIDENT_DIR}. Reopen in Safe Mode to inspect the project without intensive rendering.`,buttons:['Open Safe Mode','Keep editor open','Quit'],defaultId:0,cancelId:1,noLink:true});
    if(result.response===0){app.relaunch({args:[...process.argv.slice(1).filter(arg=>arg!=='--safe-mode'),'--safe-mode']});app.exit(0);}
    else if(result.response===2)app.quit();
    return;
  }
  rendererRecoveryInFlight=true;
  try{appendLog(`Recovering viewport after ${kind}; attempt=${attempts}`);await new Promise(resolve=>setTimeout(resolve,350));if(mainWindow&&!mainWindow.isDestroyed())await mainWindow.reload();}
  catch(error){appendLog(`Viewport recovery failed: ${error.stack||error.message}`);writeIncident('renderer-recovery-failed',{message:error.message,stack:error.stack||''});}
  finally{rendererRecoveryInFlight=false;}
}
"""
    source = source.replace(incident_anchor, incident_helpers, 1)
source = source.replace(
    "mainWindow.webContents.on('render-process-gone',(_event,details)=>appendLog(`Renderer process gone reason=${details.reason} exitCode=${details.exitCode}`));",
    "mainWindow.webContents.on('render-process-gone',(_event,details)=>{appendLog(`Renderer process gone reason=${details.reason} exitCode=${details.exitCode}`);recoverRendererProcess('renderer-process-gone',details);});",
    1
)
source = source.replace(
    "mainWindow.on('unresponsive',()=>appendLog('Main window renderer became unresponsive.'));",
    "mainWindow.on('unresponsive',()=>{appendLog('Main window renderer became unresponsive.');writeIncident('renderer-unresponsive',{url:mainWindow?.webContents?.getURL?.()||''});});",
    1
)
source = source.replace(
    "app.whenReady().then(()=>{installIpcHandlers();return createMainWindow();}).catch",
    "app.on('child-process-gone',(_event,details)=>{if(details?.type==='GPU'){appendLog(`GPU process gone reason=${details.reason} exitCode=${details.exitCode}`);recoverRendererProcess('gpu-process-gone',details);}});\n  app.whenReady().then(()=>{installIpcHandlers();return createMainWindow();}).catch",
    1
)
source = source.replace(
    "process.on('uncaughtException',error=>{appendLog(`Uncaught exception: ${error.stack||error.message}`);});",
    "process.on('uncaughtException',error=>{appendLog(`Uncaught exception: ${error.stack||error.message}`);writeIncident('desktop-uncaught-exception',{message:error.message,stack:error.stack||''});});",
    1
)
source = source.replace(
    "process.on('unhandledRejection',error=>{appendLog(`Unhandled rejection: ${error?.stack||error}`);});",
    "process.on('unhandledRejection',error=>{appendLog(`Unhandled rejection: ${error?.stack||error}`);writeIncident('desktop-unhandled-rejection',{message:error?.message||String(error),stack:error?.stack||''});});",
    1
)
write(path, source)


# Runtime compact sampling cadence.
path = 'server/v010-api.mjs'
source = read(path)
source = source.replace('visualDurationMs: 2050,', 'visualDurationMs: 1100,', 1)
source = source.replace(".filter(object => object.type === 'directionalLight' || object.properties?.celestialRole)", ".filter(object => Boolean(object.properties?.celestialRole))", 1)
write(path, source)


# World defaults and derived atmosphere.
path = 'server/v010-systems.mjs'
source = read(path)
source = source.replace("lookPreset: existing.lookPreset || 'natural-balanced'", "lookPreset: existing.lookPreset || 'clear-day'", 1)
replacements = {
    "sunIntensity: 3.05,": "sunIntensity: 2.35,",
    "moonIntensity: 0.18,": "moonIntensity: 0.14,",
    "indirectStrength: 0.5,": "indirectStrength: 0.72,",
    "mie: 0.16,": "mie: 0.035,",
    "haze: 0.045,": "haze: 0.006,",
    "humidity: 0.18,": "humidity: 0.04,",
    "visibilityKm: 145,": "visibilityKm: 320,",
    "exposure: 0.92,": "exposure: 0.7,",
    "saturation: 1.04,": "saturation: 1.08,",
    "contrast: 1.03,": "contrast: 1.03,",
    "vibrance: 0.08,": "vibrance: 0.1,",
    "toneMapper: 'aces',": "toneMapper: 'neutral',",
    "sunGlow: 0.72,": "sunGlow: 0.38,",
    "moonSize: 1.45,": "moonSize: 1.25,",
    "moonBrightness: 1.05,": "moonBrightness: 0.92,",
    "moonGlow: 0.48,": "moonGlow: 0.22,",
    "moonDetail: 1,": "moonDetail: 1.45,",
    "starIntensity: 1.05,": "starIntensity: 0.9,",
    "starDensity: 0.72,": "starDensity: 0.55,",
    "starBrightness: 1,": "starBrightness: 0.82,",
    "starSizeMin: 0.35,": "starSizeMin: 0.18,",
    "starSizeMax: 1.8,": "starSizeMax: 1.35,",
    "milkyWayIntensity: 0.32,": "milkyWayIntensity: 0.22,",
    "milkyWayWidth: 0.16,": "milkyWayWidth: 0.22,",
    "milkyWayDetail: 0.72,": "milkyWayDetail: 1.15,",
    "milkyWayDust: 0.58,": "milkyWayDust: 0.7,",
    "coverage: 0.2,": "coverage: 0.03,",
    "density: 0.42,": "density: 0.16,",
    "shadowStrength: 0.24,": "shadowStrength: 0.12,",
    "fog: 0.018,": "fog: 0,"
}
for before, after in replacements.items():
    source = source.replace(before, after, 1)
if 'dayFogMultiplier:' not in source:
    source = source.replace("      aerialPerspective: 1,", "      aerialPerspective: 1,\n      dayFogMultiplier: 0.04,\n      nightFogMultiplier: 0.18,", 1)
new_sky_controls = """      solarEclipseCoverage: 1.08,
      moonCraterStrength: 0.85,
      moonMariaStrength: 0.62,
      moonSurfaceContrast: 1.18,
      moonPatternRotation: -12,
      moonPatternSeed: 2718,
      moonReliefStrength: 0.38,
      moonLimbDarkening: 0.28,
      moonStyle: 'earth-like',
      starRayStrength: 0.24,
      starRayLength: 1.15,
      starHeroFraction: 0.035,
      milkyWayWarp: 0.48,
      milkyWayClumping: 0.72,
      milkyWayCoreStrength: 0.65,
      milkyWayWidthVariation: 0.6,
"""
if 'moonCraterStrength:' not in source:
    source = source.replace("      moonColor: '#a9c5eb',\n", "      moonColor: '#c9d4e4',\n" + new_sky_controls, 1)
source = source.replace('const dayTop = [48, 115, 196];', 'const dayTop = [31, 101, 183];', 1)
source = source.replace('const dayBottom = [155, 199, 229];', 'const dayBottom = [105, 174, 219];', 1)
source = source.replace("const atmosphericHaze = clamp(Number(world.atmosphere.haze || 0) + Number(world.atmosphere.mie || 0) * 0.35 + Number(world.atmosphere.humidity || 0) * 0.12, 0, 0.9);", "const atmosphericHaze = clamp(Number(world.atmosphere.haze || 0) + Number(world.atmosphere.mie || 0) * 0.22 + Number(world.atmosphere.humidity || 0) * 0.05, 0, 0.9);")
source = source.replace("const fogMultiplier = Math.max(0.04, (1 - weatherFog * 0.88) * (1 - atmosphericHaze * 0.5));", "const authoredFogMultiplier = day * Number(world.atmosphere.dayFogMultiplier ?? 0.04) + night * Number(world.atmosphere.nightFogMultiplier ?? 0.18);\n  const fogMultiplier = Math.max(0.02, (1 - weatherFog * 0.94 * authoredFogMultiplier) * (1 - atmosphericHaze * 0.3));")
source = source.replace("ambientIntensity: (0.028 + day * 0.15 + Number(world.lighting.indirectStrength || 0.5) * 0.18)", "ambientIntensity: (0.04 + day * 0.16 + Number(world.lighting.indirectStrength || 0.72) * 0.22)")
source = source.replace("fogNear: Math.max(18, Number(world.atmosphere.visibilityKm || 120) * 1.35 * fogMultiplier),", "fogNear: Math.max(80, Number(world.atmosphere.visibilityKm || 320) * 2.8 * fogMultiplier),")
source = source.replace("fogFar: Math.max(70, Number(world.atmosphere.visibilityKm || 120) * 6.2 * fogMultiplier),", "fogFar: Math.max(420, Number(world.atmosphere.visibilityKm || 320) * 18 * fogMultiplier),")
source = source.replace("intensity: Number(world.lighting.sunIntensity || 3.05)", "intensity: Number(world.lighting.sunIntensity || 2.35)")
source = source.replace("* (1 - day * 0.86)", "* (1 - day * 0.94)")
source = source.replace("castsShadows: true,", "castsShadows: true,\n    renderProxy: false,", 1)
source = source.replace("castsShadows: false", "castsShadows: false,\n    renderProxy: false", 1)
write(path, source)


# World panel: all new controls, explicit Custom, faster compact time samples.
path = 'app/v010.js'
source = read(path)
source = source.replace(
    "<label>Moon detail<input id=\"v010MoonDetail\" type=\"range\" min=\"0\" max=\"3\" step=\"0.05\"></label>",
    """<label>Moon detail<input id="v010MoonDetail" type="range" min="0" max="3" step="0.05"></label>
        <label>Moon craters<input id="v010MoonCraters" type="range" min="0" max="2" step="0.02"></label>
        <label>Moon maria pattern<input id="v010MoonMaria" type="range" min="0" max="2" step="0.02"></label>
        <label>Moon surface contrast<input id="v010MoonContrast" type="range" min="0.2" max="3" step="0.02"></label>
        <label>Moon relief<input id="v010MoonRelief" type="range" min="0" max="2" step="0.02"></label>
        <label>Moon pattern rotation<input id="v010MoonPatternRotation" type="range" min="-180" max="180" step="1"></label>
        <label>Moon pattern seed<input id="v010MoonPatternSeed" type="number" step="1"></label>
        <label>Moon limb darkening<input id="v010MoonLimb" type="range" min="0" max="1" step="0.01"></label>
        <label>Eclipse coverage<input id="v010EclipseCoverage" type="range" min="0.5" max="2" step="0.01"></label>""",
    1
)
source = source.replace(
    "<label>Humidity<input id=\"v010Humidity\" type=\"range\" min=\"0\" max=\"1\" step=\"0.01\"></label>",
    """<label>Humidity<input id="v010Humidity" type="range" min="0" max="1" step="0.01"></label>
        <label>Clear-air haze<input id="v010Haze" type="range" min="0" max="1" step="0.005"></label>
        <label>Day fog response<input id="v010DayFog" type="range" min="0" max="2" step="0.01"></label>
        <label>Night fog response<input id="v010NightFog" type="range" min="0" max="2" step="0.01"></label>""",
    1
)
source = source.replace(
    "<label>Star color variation<input id=\"v010StarColorVariation\" type=\"range\" min=\"0\" max=\"1\" step=\"0.01\"></label>",
    """<label>Star color variation<input id="v010StarColorVariation" type="range" min="0" max="1" step="0.01"></label>
        <label>Star ray strength<input id="v010StarRays" type="range" min="0" max="2" step="0.01"></label>
        <label>Star ray length<input id="v010StarRayLength" type="range" min="0.1" max="4" step="0.02"></label>
        <label>Hero star fraction<input id="v010HeroStars" type="range" min="0" max="0.2" step="0.002"></label>""",
    1
)
source = source.replace(
    "<label>Milky Way dust lanes<input id=\"v010MilkyWayDust\" type=\"range\" min=\"0\" max=\"1\" step=\"0.01\"></label>",
    """<label>Milky Way dust lanes<input id="v010MilkyWayDust" type="range" min="0" max="1" step="0.01"></label>
        <label>Milky Way warp<input id="v010MilkyWayWarp" type="range" min="0" max="2" step="0.02"></label>
        <label>Milky Way clumping<input id="v010MilkyWayClumping" type="range" min="0" max="2" step="0.02"></label>
        <label>Galactic core<input id="v010MilkyWayCore" type="range" min="0" max="3" step="0.02"></label>
        <label>Width variation<input id="v010MilkyWayWidthVariation" type="range" min="0" max="2" step="0.02"></label>""",
    1
)
populate_anchor = "  field('v010MoonDetail').value = world.sky.moonDetail ?? 1;"
populate_extra = populate_anchor + """
  field('v010MoonCraters').value = world.sky.moonCraterStrength ?? 0.85;
  field('v010MoonMaria').value = world.sky.moonMariaStrength ?? 0.62;
  field('v010MoonContrast').value = world.sky.moonSurfaceContrast ?? 1.18;
  field('v010MoonRelief').value = world.sky.moonReliefStrength ?? 0.38;
  field('v010MoonPatternRotation').value = world.sky.moonPatternRotation ?? -12;
  field('v010MoonPatternSeed').value = world.sky.moonPatternSeed ?? 2718;
  field('v010MoonLimb').value = world.sky.moonLimbDarkening ?? 0.28;
  field('v010EclipseCoverage').value = world.sky.solarEclipseCoverage ?? 1.08;"""
source = source.replace(populate_anchor, populate_extra, 1)
source = source.replace("  field('v010Humidity').value = world.atmosphere.humidity;", "  field('v010Humidity').value = world.atmosphere.humidity;\n  field('v010Haze').value = world.atmosphere.haze ?? 0.006;\n  field('v010DayFog').value = world.atmosphere.dayFogMultiplier ?? 0.04;\n  field('v010NightFog').value = world.atmosphere.nightFogMultiplier ?? 0.18;", 1)
source = source.replace("  field('v010StarColorVariation').value = world.sky.starColorVariation ?? 0.65;", "  field('v010StarColorVariation').value = world.sky.starColorVariation ?? 0.72;\n  field('v010StarRays').value = world.sky.starRayStrength ?? 0.24;\n  field('v010StarRayLength').value = world.sky.starRayLength ?? 1.15;\n  field('v010HeroStars').value = world.sky.starHeroFraction ?? 0.035;", 1)
source = source.replace("  field('v010MilkyWayDust').value = world.sky.milkyWayDust ?? 0.58;", "  field('v010MilkyWayDust').value = world.sky.milkyWayDust ?? 0.7;\n  field('v010MilkyWayWarp').value = world.sky.milkyWayWarp ?? 0.48;\n  field('v010MilkyWayClumping').value = world.sky.milkyWayClumping ?? 0.72;\n  field('v010MilkyWayCore').value = world.sky.milkyWayCoreStrength ?? 0.65;\n  field('v010MilkyWayWidthVariation').value = world.sky.milkyWayWidthVariation ?? 0.6;", 1)
source = source.replace("async function applyWorld(extra = {}) {\n  const payload = {", "async function applyWorld(extra = {}, options = {}) {\n  const payload = {\n    lookPreset: options.preservePreset ? (snapshot?.world?.lookPreset || 'custom') : 'custom',", 1)
source = source.replace("      humidity: numeric('v010Humidity', 0.22),\n      exposure:", "      humidity: numeric('v010Humidity', 0.04),\n      haze: numeric('v010Haze', 0.006),\n      dayFogMultiplier: numeric('v010DayFog', 0.04),\n      nightFogMultiplier: numeric('v010NightFog', 0.18),\n      exposure:", 1)
source = source.replace("moonBrightness: numeric('v010MoonBrightness', 1.05), moonGlow: numeric('v010MoonGlow', 0.48), moonDetail: numeric('v010MoonDetail', 1),", "moonBrightness: numeric('v010MoonBrightness', 0.92), moonGlow: numeric('v010MoonGlow', 0.22), moonDetail: numeric('v010MoonDetail', 1.45),\n      moonCraterStrength: numeric('v010MoonCraters', 0.85), moonMariaStrength: numeric('v010MoonMaria', 0.62), moonSurfaceContrast: numeric('v010MoonContrast', 1.18), moonReliefStrength: numeric('v010MoonRelief', 0.38),\n      moonPatternRotation: numeric('v010MoonPatternRotation', -12), moonPatternSeed: numeric('v010MoonPatternSeed', 2718), moonLimbDarkening: numeric('v010MoonLimb', 0.28), solarEclipseCoverage: numeric('v010EclipseCoverage', 1.08),", 1)
source = source.replace("starSizeMin: numeric('v010StarSizeMin', 0.35), starSizeMax: numeric('v010StarSizeMax', 1.8), starColorVariation: numeric('v010StarColorVariation', 0.65), starSeed:", "starSizeMin: numeric('v010StarSizeMin', 0.18), starSizeMax: numeric('v010StarSizeMax', 1.35), starColorVariation: numeric('v010StarColorVariation', 0.72), starRayStrength: numeric('v010StarRays', 0.24), starRayLength: numeric('v010StarRayLength', 1.15), starHeroFraction: numeric('v010HeroStars', 0.035), starSeed:", 1)
source = source.replace("milkyWayWidth: numeric('v010MilkyWayWidth', 0.16), milkyWayDetail: numeric('v010MilkyWayDetail', 0.72), milkyWayOrientation: numeric('v010MilkyWayOrientation', 22), milkyWayDust: numeric('v010MilkyWayDust', 0.58)", "milkyWayWidth: numeric('v010MilkyWayWidth', 0.22), milkyWayDetail: numeric('v010MilkyWayDetail', 1.15), milkyWayOrientation: numeric('v010MilkyWayOrientation', 22), milkyWayDust: numeric('v010MilkyWayDust', 0.7),\n      milkyWayWarp: numeric('v010MilkyWayWarp', 0.48), milkyWayClumping: numeric('v010MilkyWayClumping', 0.72), milkyWayCoreStrength: numeric('v010MilkyWayCore', 0.65), milkyWayWidthVariation: numeric('v010MilkyWayWidthVariation', 0.6)", 1)
source = source.replace("await applyWorld({ time: { enabled: snapshot?.world?.time?.enabled === false } });", "await applyWorld({ time: { enabled: snapshot?.world?.time?.enabled === false } }, { preservePreset: true });", 1)
source = source.replace("body: JSON.stringify({ seconds: 2 })", "body: JSON.stringify({ seconds: 1 })", 1)
source = source.replace("  }, 2000);", "  }, 1000);", 1)
write(path, source)

print('Applied Phase 1C crash, celestial, atmosphere, preset, and authoring integration.')
