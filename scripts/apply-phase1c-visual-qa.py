from pathlib import Path
import re


def replace_once(source, pattern, replacement, label, flags=0):
    result, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'Could not replace {label}; matches={count}.')
    return result


# ---------------------------------------------------------------------------
# Pole-safe stellar projection, seam-free Milky Way, and eclipse containment.
# ---------------------------------------------------------------------------
sky_path = Path('app/sky-pass.js')
sky = sky_path.read_text(encoding='utf-8')

if 'vec2 hemisphereOctEncode' not in sky:
    stellar = r'''vec2 hemisphereOctEncode(vec3 direction){
  vec3 ray=normalize(direction);
  float denominator=max(0.00001,abs(ray.x)+abs(ray.y)+abs(ray.z));
  return ray.xz/denominator*0.5+0.5;
}

vec3 hemisphereOctDecode(vec2 uv){
  vec2 p=uv*2.0-1.0;
  float y=1.0-abs(p.x)-abs(p.y);
  if(y<=0.0)return vec3(0.0,-1.0,0.0);
  return normalize(vec3(p.x,y,p.y));
}

vec3 starLayer(vec3 ray,float scale,float seed){
  vec2 uv=hemisphereOctEncode(ray);
  vec2 baseCell=floor(uv*scale);
  vec3 accumulated=vec3(0.0);
  float probability=clamp(uStarDensity*0.00145,0.00004,0.0045);
  for(int oy=-1;oy<=1;oy++)for(int ox=-1;ox<=1;ox++){
    vec2 cell=baseCell+vec2(float(ox),float(oy));
    float identity=hash21(cell+seed*0.017);
    if(identity>probability)continue;
    vec2 offset=vec2(hash21(cell+seed+17.7),hash21(cell+seed+91.2));
    vec2 candidateUv=(cell+mix(vec2(0.18),vec2(0.82),offset))/scale;
    if(any(lessThan(candidateUv,vec2(0.0)))||any(greaterThan(candidateUv,vec2(1.0))))continue;
    vec3 starDirection=hemisphereOctDecode(candidateUv);
    if(starDirection.y<=0.0)continue;
    float cosine=clamp(dot(ray,starDirection),-1.0,1.0);
    float angularDistance=sqrt(max(0.0,2.0*(1.0-cosine)));
    float sizeRandom=hash21(cell+seed+33.4);
    float hero=step(1.0-uStarHeroFraction,hash21(cell+seed+8.8));
    float sizeControl=mix(max(0.08,uStarSizeMin),max(uStarSizeMin,uStarSizeMax),pow(sizeRandom,2.8));
    float radius=mix(0.00016,0.00062,pow(sizeRandom,3.2))*sizeControl*(1.0+hero*0.55);
    float aa=max(fwidth(angularDistance),0.000035);
    float disc=1.0-smoothstep(radius-aa,radius+aa,angularDistance);
    vec3 reference=abs(starDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
    vec3 right=normalize(cross(reference,starDirection));
    vec3 up=normalize(cross(starDirection,right));
    vec2 local=vec2(dot(ray,right),dot(ray,up));
    float rayLength=radius*mix(3.5,9.0,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));
    float thin=max(radius*0.12,0.000035);
    float horizontal=exp(-abs(local.y)/thin)*exp(-abs(local.x)/max(rayLength,0.0001));
    float vertical=exp(-abs(local.x)/thin)*exp(-abs(local.y)/max(rayLength,0.0001));
    float diagonal=exp(-abs(local.x+local.y)/(thin*1.5))*exp(-abs(local.x-local.y)/max(rayLength*0.65,0.0001));
    float rays=(horizontal+vertical+diagonal*0.18)*hero*uStarRayStrength*0.085;
    float phase=hash21(cell+seed+43.2)*TAU;
    float speed=mix(0.35,2.1,hash21(cell+seed+9.3))*uStarTwinkleSpeed;
    float pulse=0.5+0.5*sin(uTime*speed+phase);
    float shimmer=0.5+0.5*sin(uTime*speed*1.73+phase*1.41);
    float twinkle=mix(1.0,mix(0.72,1.25,pulse)*mix(0.94,1.06,shimmer),uStarTwinkleAmount);
    float temperature=hash21(cell+seed+71.4);
    vec3 warm=vec3(1.0,0.76,0.56),neutral=vec3(0.94,0.97,1.0),cool=vec3(0.62,0.78,1.0);
    vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);
    starColor=mix(vec3(0.92,0.95,1.0),starColor,uStarColorVariation);
    float energy=(0.34+sizeRandom*1.22+hero*1.35)*uStarBrightness*twinkle;
    accumulated+=starColor*(disc+rays)*energy;
  }
  return accumulated;
}
'''
    sky = replace_once(
        sky,
        r'vec3 cubeProjection\(vec3 direction\)\{.*?\n\}\n\nvec3 starLayer\(vec3 ray,float scale,float seed\)\{.*?\n\}\n',
        stellar,
        'cube-projected star field',
        re.S,
    )

milky = r'''vec3 milkyWay(vec3 ray,float horizonMask){
  float orientation=radians(uMilkyWayOrientation);
  vec3 galacticNormal=normalize(vec3(0.31*sin(orientation)+0.18,0.74,0.31*cos(orientation)-0.51));
  vec3 reference=abs(galacticNormal.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 tangent=normalize(cross(reference,galacticNormal));
  vec3 bitangent=normalize(cross(galacticNormal,tangent));
  float latitude=dot(ray,galacticNormal);
  float longitude=atan(dot(ray,bitangent),dot(ray,tangent));
  vec3 periodic=vec3(cos(longitude),sin(longitude),latitude);
  float coarse=fbm3(periodic*vec3(1.45,1.45,3.2)+vec3(3.7,11.2,5.4)+uStarSeed*0.00031);
  float medium=fbm3(periodic*vec3(3.1,3.1,8.2)+vec3(17.4,2.8,23.1)+uStarSeed*0.00057);
  float fine=fbm3(periodic*vec3(7.4,7.4,19.0)+vec3(31.3,8.1,4.6)+uStarSeed*0.00093);
  float warp=(coarse-0.5)*uMilkyWayWidth*uMilkyWayWarp*0.72;
  warp+=sin(longitude*2.0+medium*2.7)*uMilkyWayWidth*uMilkyWayWarp*0.16;
  float widthVariation=mix(0.68,1.42,coarse);
  widthVariation*=1.0+sin(longitude*3.0+medium*1.8)*uMilkyWayWidthVariation*0.17;
  float localWidth=max(0.009,uMilkyWayWidth*max(0.38,widthVariation));
  float signedDistance=latitude-warp;
  float coreBand=exp(-pow(abs(signedDistance)/localWidth,2.0)*1.55);
  float broadHalo=exp(-pow(abs(signedDistance)/max(0.016,localWidth*3.4),2.0)*1.05)*0.22;
  float upperWisp=exp(-pow(abs(signedDistance-localWidth*0.72)/max(0.006,localWidth*0.42),2.0)*1.7)*0.28;
  float lowerWisp=exp(-pow(abs(signedDistance+localWidth*0.9)/max(0.006,localWidth*0.52),2.0)*1.8)*0.19;
  float galacticCore=exp(-pow(wrappedDistance(longitude,-0.62)/0.58,2.0))*uMilkyWayCoreStrength;
  float clumpMask=mix(1.0,smoothstep(0.28,0.72,coarse*0.62+medium*0.38),clamp(uMilkyWayClumping,0.0,1.0));
  float brokenEdges=mix(0.62,1.18,smoothstep(0.2,0.84,medium+fine*0.18));
  float stellarKnots=pow(max(0.0,fine-0.5),2.6)*2.6*uMilkyWayDetail;
  float centralDust=exp(-pow(abs(signedDistance)/max(0.004,localWidth*0.22),2.0)*2.2);
  centralDust*=smoothstep(0.3,0.78,medium*0.58+fine*0.42)*uMilkyWayDust;
  float sideDust=exp(-pow(abs(signedDistance-localWidth*0.36)/max(0.004,localWidth*0.17),2.0)*2.0);
  sideDust*=smoothstep(0.48,0.84,fine)*uMilkyWayDust*0.36;
  float structure=(coreBand+broadHalo+upperWisp+lowerWisp)*(0.38+coarse*0.46+galacticCore*0.72+stellarKnots);
  float luminance=max(0.0,structure*clumpMask*brokenEdges*(1.0-centralDust*0.88-sideDust));
  vec3 warmCore=vec3(0.96,0.76,0.57);
  vec3 color=mix(uMilkyWayColor,warmCore,clamp(galacticCore*0.28,0.0,0.36));
  return color*luminance*uMilkyWayIntensity*0.48*horizonMask;
}'''
sky = replace_once(sky, r'vec3 milkyWay\(vec3 ray,float horizonMask\)\{.*?\n\}', milky, 'Milky Way function', re.S)

sky = sky.replace(
    "vec3 stars=starLayer(ray,280.0,uStarSeed)+starLayer(ray,510.0,uStarSeed+101.0)+starLayer(ray,860.0,uStarSeed+271.0);",
    "vec3 stars=starLayer(ray,180.0,uStarSeed)+starLayer(ray,360.0,uStarSeed+101.0);",
)

sky = sky.replace(
    "  sky+=vec3(1.0,0.88,0.64)*(coronaInner*2.8+coronaOuter*0.38)*uSolarEclipse*(1.0-eclipseDisc*0.92);",
    "  float eclipseSilhouette=eclipseDisc*uSolarEclipse*uDayFactor;\n  sky=mix(sky,vec3(0.0015,0.002,0.003),eclipseSilhouette*0.985);\n  sky+=vec3(1.0,0.88,0.64)*(coronaInner*2.8+coronaOuter*0.38)*uSolarEclipse*(1.0-eclipseDisc*0.92);",
)
sky = sky.replace("  sky*=1.0-eclipseOcclusion*0.995;\n", "")

if 'vec3 cubeProjection' in sky:
    raise RuntimeError('The cube-projected stellar field survived the visual repair.')
if 'ray*5.3+tangent*longitude' in sky:
    raise RuntimeError('The non-periodic Milky Way domain survived the visual repair.')
if 'sky*=1.0-eclipseOcclusion' in sky:
    raise RuntimeError('The free-floating solar-eclipse blackout survived the visual repair.')
sky_path.write_text(sky, encoding='utf-8')
print('Replaced distorted stars, seam-prone Milky Way mapping, and free-floating eclipse blackout.')


# ---------------------------------------------------------------------------
# Canvas-only rendered evidence hook for packaged visual QA.
# ---------------------------------------------------------------------------
app_path = Path('app/app.js')
app_source = app_path.read_text(encoding='utf-8')
if 'window.__omniforgeVisualTestCapture' not in app_source:
    marker = "function objectIcon(type) {"
    hook = r'''async function captureVisualTestFrame(options={}) {
  if(!ui.viewport||!camera||!scene)throw new Error('Viewport is not ready for visual capture.');
  const originalCamera=cloneCamera(camera);
  const originalGrid=scene.settings.gridVisible;
  const originalSplines=scene.settings.splinesVisible;
  try{
    if(options.camera){
      const next=cloneCamera(camera);
      if(Array.isArray(options.camera.position)&&options.camera.position.length===3)next.position=options.camera.position.map(Number);
      for(const key of ['yaw','pitch','fov'])if(Number.isFinite(Number(options.camera[key])))next[key]=Number(options.camera[key]);
      camera=sanitizeCameraState(next,originalCamera);
    }
    if(options.hideGuides!==false){scene.settings.gridVisible=false;scene.settings.splinesVisible=false;}
    const waitMs=Math.max(80,Math.min(3000,Number(options.waitMs||500)));
    await sleep(waitMs);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return ui.viewport.toDataURL('image/png');
  }finally{
    camera=originalCamera;
    scene.settings.gridVisible=originalGrid;
    scene.settings.splinesVisible=originalSplines;
  }
}
window.__omniforgeVisualTestCapture=captureVisualTestFrame;

'''
    if marker not in app_source:
        raise RuntimeError('Could not find app visual-capture insertion point.')
    app_source = app_source.replace(marker, hook + marker, 1)
app_path.write_text(app_source, encoding='utf-8')
print('Added canvas-only visual evidence capture hook.')


# ---------------------------------------------------------------------------
# Desktop-side request watcher: CI asks the packaged editor for real PNGs.
# ---------------------------------------------------------------------------
desktop_path = Path('desktop/main.cjs')
desktop = desktop_path.read_text(encoding='utf-8')
if 'VISUAL_CAPTURE_DIR' not in desktop:
    desktop = desktop.replace(
        "const DIAGNOSTIC_MODE = process.env.OMNIFORGE_DIAGNOSTICS === '1' || process.argv.includes('--diagnostics');",
        "const DIAGNOSTIC_MODE = process.env.OMNIFORGE_DIAGNOSTICS === '1' || process.argv.includes('--diagnostics');\nconst VISUAL_CAPTURE_DIR = String(process.env.OMNIFORGE_CAPTURE_DIR || '').trim();",
        1,
    )
    desktop = desktop.replace(
        "let rendererRecoveryAttempts = [];",
        "let rendererRecoveryAttempts = [];\nlet visualCaptureTimer = null;\nlet visualCaptureInFlight = false;",
        1,
    )
    watcher = r'''
function installVisualCaptureWatcher() {
  if(!VISUAL_CAPTURE_DIR||!mainWindow||mainWindow.isDestroyed())return;
  fs.mkdirSync(VISUAL_CAPTURE_DIR,{recursive:true});
  const requestFile=path.join(VISUAL_CAPTURE_DIR,'capture-request.json');
  if(visualCaptureTimer)clearInterval(visualCaptureTimer);
  visualCaptureTimer=setInterval(async()=>{
    if(visualCaptureInFlight||!mainWindow||mainWindow.isDestroyed()||!fs.existsSync(requestFile))return;
    visualCaptureInFlight=true;
    const processingFile=path.join(VISUAL_CAPTURE_DIR,`capture-processing-${process.pid}.json`);
    try{
      fs.renameSync(requestFile,processingFile);
      const request=readJson(processingFile,{});
      const id=String(request.id||Date.now()).replace(/[^a-z0-9_-]/gi,'-');
      const options=JSON.stringify(request.options||{});
      const dataUrl=await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestCapture(${options})`,true);
      const match=/^data:image\/png;base64,(.+)$/s.exec(String(dataUrl||''));
      if(!match)throw new Error('Renderer did not return a PNG data URL.');
      fs.writeFileSync(path.join(VISUAL_CAPTURE_DIR,`${id}.png`),Buffer.from(match[1],'base64'));
      writeJson(path.join(VISUAL_CAPTURE_DIR,`${id}.json`),{ok:true,id,at:new Date().toISOString()});
    }catch(error){
      const request=readJson(processingFile,{});const id=String(request.id||'capture-error').replace(/[^a-z0-9_-]/gi,'-');
      writeJson(path.join(VISUAL_CAPTURE_DIR,`${id}.json`),{ok:false,id,error:error.message,stack:error.stack||''});
      writeIncident('visual-capture-failed',{id,message:error.message,stack:error.stack||''});
    }finally{
      fs.rmSync(processingFile,{force:true});visualCaptureInFlight=false;
    }
  },180);
  visualCaptureTimer.unref?.();
}
'''
    desktop = desktop.replace("function findFreePort() {", watcher + "\nfunction findFreePort() {", 1)
    desktop = desktop.replace(
        "  mainWindow.on('closed',()=>{mainWindow=null;});",
        "  mainWindow.on('closed',()=>{if(visualCaptureTimer){clearInterval(visualCaptureTimer);visualCaptureTimer=null;}mainWindow=null;});",
        1,
    )
    desktop = desktop.replace(
        "  await mainWindow.loadURL(`${allowedOrigin}/?desktop=1&safeMode=${safeMode?'1':'0'}&recovered=${recoveryReason?'1':'0'}&diagnostics=${DIAGNOSTIC_MODE?'1':'0'}`);",
        "  await mainWindow.loadURL(`${allowedOrigin}/?desktop=1&safeMode=${safeMode?'1':'0'}&recovered=${recoveryReason?'1':'0'}&diagnostics=${DIAGNOSTIC_MODE?'1':'0'}`);\n  installVisualCaptureWatcher();",
        1,
    )
desktop_path.write_text(desktop, encoding='utf-8')
print('Added packaged-editor PNG capture request watcher.')
