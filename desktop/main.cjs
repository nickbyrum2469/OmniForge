const { app, BrowserWindow, dialog, shell, ipcMain, crashReporter, session, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const APP_ROOT = path.resolve(__dirname, '..');
const PRODUCT_NAME = 'OmniForge';
const PRODUCT_VERSION = '0.11.0';
const APP_ID = 'com.omniforge.editor';
const ICON = path.join(APP_ROOT, 'resources', process.platform === 'win32' ? 'omniforge-icon.ico' : 'omniforge-icon.png');
const DIAGNOSTIC_MODE = process.env.OMNIFORGE_DIAGNOSTICS === '1' || process.argv.includes('--diagnostics');
const VISUAL_CAPTURE_DIR = String(process.env.OMNIFORGE_CAPTURE_DIR || '').trim();
if(DIAGNOSTIC_MODE)app.commandLine.appendSwitch('remote-debugging-port',String(process.env.OMNIFORGE_DEBUG_PORT||'9229'));

app.setName(PRODUCT_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
const configuredDataRoot = String(process.env.OMNIFORGE_DATA_ROOT || '').trim();
const uniqueUserData = configuredDataRoot ? path.resolve(configuredDataRoot) : path.join(app.getPath('appData'), 'OmniForge');
app.setPath('userData', uniqueUserData);
app.setPath('crashDumps', path.join(uniqueUserData, 'crashes'));
app.setAboutPanelOptions({ applicationName: PRODUCT_NAME, applicationVersion: PRODUCT_VERSION, copyright: 'Copyright © 2026 OmniForge', credits: 'AI-native 3D game creation workspace', iconPath: path.join(APP_ROOT, 'resources', 'omniforge-icon.png') });
crashReporter.start({ productName: PRODUCT_NAME, companyName: 'OmniForge', uploadToServer: false, compress: true });

const SESSION_DIR = path.join(uniqueUserData, 'sessions');
const LOG_DIR = path.join(uniqueUserData, 'logs');
const INCIDENT_DIR = path.join(uniqueUserData, 'incidents');
const LIFECYCLE_FILE = path.join(SESSION_DIR, 'lifecycle.json');
const RUNTIME_FILE = path.join(SESSION_DIR, 'runtime.json');
fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(INCIDENT_DIR, { recursive: true });

let engineProcess = null;
let mainWindow = null;
let shuttingDown = false;
let safeMode = process.argv.includes('--safe-mode');
let recoveryReason = null;
let runtimeInfo = null;
let rendererRecoveryInFlight = false;
let rendererRecoveryAttempts = [];
let visualCaptureTimer = null;
let visualCaptureInFlight = false;

function readJson(file, fallback=null) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/,'')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp=`${file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(value,null,2),'utf8'); fs.renameSync(temp,file); }
function appendLog(message) { fs.appendFileSync(path.join(LOG_DIR,'desktop.log'),`[${new Date().toISOString()}] ${message}\n`,'utf8'); }
function appendDiagnostic(message) { fs.appendFileSync(path.join(LOG_DIR,'diagnostics.log'),`[${new Date().toISOString()}] ${message}\n`,'utf8'); }
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



const visualInputDelay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function normalizedVisualNodeReference(action={}) {
  const nodeId=String(action.nodeId||'').trim();
  const parsedIndex=Number.parseInt(String(action.nodeIndex??''),10);
  const nodeIndex=Number.isInteger(parsedIndex)?Math.max(0,Math.min(128,parsedIndex)):null;
  if(nodeId.length>512)throw new Error('Packaged native path input nodeId exceeds the 512-character safety limit.');
  if(!nodeId&&nodeIndex===null)throw new Error('Packaged native path input requires a stable nodeId (nodeIndex is a legacy fallback).');
  return {nodeId,nodeIndex};
}

async function visualPathNodeSnapshot(contents, pathId, reference, options={}) {
  const input = JSON.stringify({ pathId, nodeId:String(reference?.nodeId||''), nodeIndex:reference?.nodeIndex??null, requireElement:options.requireElement!==false, requireHitTarget:options.requireHitTarget!==false });
  return contents.executeJavaScript(`(async()=>{
    const input=${input};
    const response=await fetch('/api/state');
    if(!response.ok)throw new Error('Visual input state request failed: '+response.status);
    const payload=await response.json();
    const state=payload.state||payload;
    const scene=(state.scenes||[]).find(item=>item.id===state.activeSceneId);
    const path=(scene?.objects||[]).find(item=>item.id===input.pathId&&item.type==='path');
    const network=path?.properties?.pathNetwork;
    const nodeIndex=input.nodeId
      ?network?.nodes?.findIndex(item=>String(item.id)===input.nodeId)
      :Number(input.nodeIndex);
    const node=network?.nodes?.[nodeIndex];
    const elements=[...new Set(document.querySelectorAll('#splineNodeOverlay [data-spline-node-id]:not([data-spline-handle]),#splineNodeOverlay [data-spline-node]'))];
    const element=elements.find(item=>String(item.dataset.splineNodeId||'')===String(node?.id||''))||elements.find(item=>Number(item.dataset.splineNode)===nodeIndex)||null;
    if(!network||!node)throw new Error('Visual input Path Network node is unavailable.');
    const renderer=window.__omniforgeV011Bridge?.renderer?.();
    const terrainY=renderer?.terrainHeightForScene?.(scene,Number(node.position?.[0]||0),Number(node.position?.[2]||0))??Number(node.position?.[1]||0);
    const effectivePosition=[Number(node.position?.[0]||0),node.heightMode==='absolute'?Number(node.position?.[1]||0):terrainY+(node.heightMode==='offset'?Number(node.heightOffset||0):0),Number(node.position?.[2]||0)];
    const resolvedBy=input.nodeId?'nodeId':'nodeIndex';
    if(input.requireElement&&!element)throw new Error('Visual input spline handle is unavailable for stable node '+String(node.id)+'.');
    const stateOnly=()=>({
      revision:Number(network.revision||0),nodeId:String(node.id),nodeIndex,
      resolvedBy,position:(node.position||[]).map(Number),effectivePosition,heightMode:String(node.heightMode||'terrain'),heightOffset:Number(node.heightOffset||0),
      handleMode:String(node.handleMode||'automatic'),incomingHandle:Array.isArray(node.incomingHandle)?node.incomingHandle.map(Number):null,
      outgoingHandle:Array.isArray(node.outgoingHandle)?node.outgoingHandle.map(Number):null,rect:null,hitTargetMatches:false,topElement:null,openDialog:null
    });
    if(!element)return stateOnly();
    const rect=element.getBoundingClientRect();
    const style=getComputedStyle(element);
    if(element.hidden||style.display==='none'||style.visibility==='hidden'||rect.width<1||rect.height<1){
      if(!input.requireElement)return stateOnly();
      throw new Error('Visual input spline handle is not visible for stable node '+String(node.id)+'.');
    }
    const centerX=rect.x+rect.width*.5;
    const centerY=rect.y+rect.height*.5;
    const topElement=document.elementFromPoint(centerX,centerY);
    const openDialog=document.querySelector('dialog[open]');
    const hitTargetMatches=topElement===element||element.contains(topElement);
    if(input.requireHitTarget&&!hitTargetMatches)throw new Error('Visual input spline handle is covered by '+String(topElement?.id||topElement?.className||topElement?.tagName||'unknown element')+'.');
    return {
      revision:Number(network.revision||0),
      nodeId:String(node.id),
      nodeIndex,
      resolvedBy,
      position:(node.position||[]).map(Number),
      effectivePosition,
      heightMode:String(node.heightMode||'terrain'),
      heightOffset:Number(node.heightOffset||0),
      handleMode:String(node.handleMode||'automatic'),
      incomingHandle:Array.isArray(node.incomingHandle)?node.incomingHandle.map(Number):null,
      outgoingHandle:Array.isArray(node.outgoingHandle)?node.outgoingHandle.map(Number):null,
      rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
      hitTargetMatches,
      selectedMember:element.matches('.selected-member,.selected-primary,.selected'),
      selectedPrimary:element.matches('.selected-primary,.selected'),
      topElement:topElement?.id||topElement?.className||topElement?.tagName||null,
      openDialog:openDialog?.id||null
    };
  })()`, true);
}

async function dismissVisualFirstUseTutorial(contents) {
  const status=()=>contents.executeJavaScript(`(async()=>{
    const response=await fetch('/api/state');
    if(!response.ok)throw new Error('First-use state request failed: '+response.status);
    const payload=await response.json();
    const state=payload.state||payload;
    return {
      tutorialOpen:Boolean(document.querySelector('#tutorialDialog')?.open),
      tutorialComplete:Boolean(state?.editor?.firstUseComplete),
      integrationOpen:Boolean(document.querySelector('#integrationSetupDialog')?.open),
      integrationState:String(state?.settings?.integrations?.setupState||'pending')
    };
  })()`,true);
  const appearanceDeadline=Date.now()+20000;
  let dismissedTutorial=false;
  let dismissedIntegration=false;
  while(Date.now()<appearanceDeadline){
    const current=await status();
    if(current.tutorialOpen){
      await sendVisualClick(contents,await visualElementBounds(contents,'#skipTutorialButton'));
      dismissedTutorial=true;
      await visualInputDelay(80);
      continue;
    }
    if(!current.tutorialComplete){await visualInputDelay(80);continue;}
    if(current.integrationOpen&&current.integrationState==='pending'&&!dismissedIntegration){
      await sendVisualClick(contents,await visualElementBounds(contents,'#dismissIntegrationSetupButton'));
      dismissedIntegration=true;
      await visualInputDelay(80);
      continue;
    }
    if(current.integrationOpen||current.integrationState==='pending'){await visualInputDelay(80);continue;}
    return {
      type:'dismiss-first-use-tutorial',
      dismissed:dismissedTutorial||dismissedIntegration,
      dismissedTutorial,
      dismissedIntegration,
      alreadyClosed:!dismissedTutorial&&!dismissedIntegration,
      integrationState:current.integrationState
    };
  }
  throw new Error('First-use onboarding did not settle before native editor input.');
}

async function visualElementBounds(contents, selector) {
  const encoded = JSON.stringify(selector);
  return contents.executeJavaScript(`(()=>{
    const element=document.querySelector(${encoded});
    if(!element)throw new Error('Visual input control is unavailable: '+${encoded});
    element.scrollIntoView({block:'center',inline:'center',behavior:'auto'});
    const rect=element.getBoundingClientRect();
    const style=getComputedStyle(element);
    if(element.hidden||style.display==='none'||style.visibility==='hidden'||rect.width<1||rect.height<1){
      throw new Error('Visual input control is not visible: '+${encoded});
    }
    if(element.disabled)throw new Error('Visual input control is disabled: '+${encoded});
    const centerX=rect.x+rect.width*.5,centerY=rect.y+rect.height*.5;
    const topElement=document.elementFromPoint(centerX,centerY);
    if(topElement!==element&&!element.contains(topElement)){
      const blocker=topElement?.id||topElement?.className||topElement?.tagName||'unknown element';
      throw new Error('Visual input control is covered by '+blocker+': '+${encoded});
    }
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  })()`, true);
}

async function waitForVisualElementBounds(contents,selector,timeoutMs=5000) {
  const deadline=Date.now()+timeoutMs;let lastError=null;
  while(Date.now()<deadline){
    try{return await visualElementBounds(contents,selector);}
    catch(error){lastError=error;await visualInputDelay(80);}
  }
  throw lastError||new Error(`Visual input control did not become available: ${selector}.`);
}

async function sendVisualControlClick(contents,selector) {
  await sendVisualClick(contents,await waitForVisualElementBounds(contents,selector));
}

async function sendVisualSelectOption(contents,selector,value) {
  const input=JSON.stringify({selector,value:String(value||'')});
  const option=await contents.executeJavaScript(`(()=>{const input=${input},select=document.querySelector(input.selector);if(!select)throw new Error('Visual input select is unavailable: '+input.selector);const index=[...select.options].findIndex(item=>String(item.value)===input.value);if(index<0)throw new Error('Visual input select has no allow-listed option '+input.value+'.');return {index,current:String(select.value),optionCount:select.options.length};})()`,true);
  await sendVisualClick(contents,await waitForVisualElementBounds(contents,selector));
  contents.sendInputEvent({type:'keyDown',keyCode:'Home'});
  contents.sendInputEvent({type:'keyUp',keyCode:'Home'});
  for(let index=0;index<option.index;index++){
    contents.sendInputEvent({type:'keyDown',keyCode:'Down'});
    contents.sendInputEvent({type:'keyUp',keyCode:'Down'});
  }
  contents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
  contents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await visualInputDelay(100);
  const selected=await contents.executeJavaScript(`(()=>String(document.querySelector(${JSON.stringify(selector)})?.value||''))()`,true);
  if(selected!==String(value))throw new Error(`Native select input did not choose stable value ${String(value)}.`);
  return {...option,selected};
}

function visualPositionDelta(left, right) {
  return Math.hypot(...left.map((value,index)=>Number(value)-Number(right[index]||0)));
}

async function waitForVisualPathRevision(contents, action, reference, minimumRevision, timeoutMs=12000, options={}) {
  const deadline=Date.now()+timeoutMs;
  let latest=null;
  while(Date.now()<deadline){
    await visualInputDelay(80);
    latest=await visualPathNodeSnapshot(contents,action.pathId,reference,options);
    if(latest.revision>minimumRevision)return latest;
  }
  const actionLabel=String(action.type||'')==='path-undo'
    ?'native Undo'
    :(action.vertical?'vertical':'horizontal')+' node drag';
  throw new Error(`Visual input timed out waiting for Path Network revision after ${actionLabel}.`);
}

async function visualPathNetworkSnapshot(contents,pathId) {
  const input=JSON.stringify({pathId});
  return contents.executeJavaScript(`(async()=>{
    const input=${input};
    const response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw new Error('Visual Path Network state request failed: '+response.status);
    const payload=await response.json(),state=payload.state||payload;
    const scene=(state.scenes||[]).find(item=>item.id===state.activeSceneId);
    const path=(scene?.objects||[]).find(item=>item.id===input.pathId&&item.type==='path');
    const network=path?.properties?.pathNetwork;
    if(!network)throw new Error('Visual Path Network is unavailable: '+input.pathId);
    const selected=[...document.querySelectorAll('#splineNodeOverlay [data-spline-node-id].selected-member,#splineNodeOverlay [data-spline-node-id].selected-primary,#splineNodeOverlay [data-spline-node-id].selected')].map(element=>String(element.dataset.splineNodeId||''));
    return {
      revision:Number(network.revision||0),
      nodeIds:(network.nodes||[]).map(node=>String(node.id)),
      nodes:(network.nodes||[]).map(node=>({id:String(node.id),position:(node.position||[]).map(Number),heightMode:String(node.heightMode||'terrain'),heightOffset:Number(node.heightOffset||0)})),
      segmentIds:(network.segments||[]).map(segment=>String(segment.id)),
      segments:(network.segments||[]).map(segment=>({id:String(segment.id),fromNode:String(segment.fromNode),toNode:String(segment.toNode)})),
      selectedNodeIds:selected
    };
  })()`,true);
}

async function visualPathSceneSnapshot(contents,pathId) {
  const input=JSON.stringify({pathId});
  return contents.executeJavaScript(`(async()=>{
    const input=${input},response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw new Error('Visual Path Network scene request failed: '+response.status);
    const payload=await response.json(),state=payload.state||payload,scene=(state.scenes||[]).find(item=>item.id===state.activeSceneId);
    const paths=(scene?.objects||[]).filter(item=>item.type==='path'&&item.properties?.pathNetwork).map(item=>{
      const network=item.properties.pathNetwork;
      return {
        id:String(item.id),name:String(item.name||''),networkId:String(network.id||''),revision:Number(network.revision||0),
        nodeIds:(network.nodes||[]).map(node=>String(node.id)),
        nodes:(network.nodes||[]).map(node=>({id:String(node.id),position:(node.position||[]).map(Number),heightMode:String(node.heightMode||'terrain'),heightOffset:Number(node.heightOffset||0),handleMode:String(node.handleMode||'automatic'),incomingHandle:Array.isArray(node.incomingHandle)?node.incomingHandle.map(Number):null,outgoingHandle:Array.isArray(node.outgoingHandle)?node.outgoingHandle.map(Number):null})),
        segments:(network.segments||[]).map(segment=>({id:String(segment.id),fromNode:String(segment.fromNode),toNode:String(segment.toNode)}))
      };
    });
    const target=paths.find(item=>item.id===input.pathId)||null;
    if(!target)throw new Error('Visual Path Network scene target is unavailable: '+input.pathId);
    return {engineRevision:Number(state.engine?.revision||0),selectionObjectId:String(state.selection?.objectId||''),pathIds:paths.map(path=>path.id),paths,target};
  })()`,true);
}

async function waitForVisualSceneRevision(contents,pathId,minimumEngineRevision,timeoutMs=12000) {
  const deadline=Date.now()+timeoutMs;let latest=null;
  while(Date.now()<deadline){
    await visualInputDelay(80);
    latest=await visualPathSceneSnapshot(contents,pathId);
    if(latest.engineRevision>minimumEngineRevision)return latest;
  }
  throw new Error(`Visual input timed out waiting for scene revision after native Path Network graph edit on ${pathId}.`);
}

function visualPathById(snapshot,pathId) {
  return snapshot.paths.find(path=>path.id===pathId)||null;
}

function visualPathTopology(path) {
  return JSON.stringify({networkId:path?.networkId||'',nodes:path?.nodes||[],segments:path?.segments||[]});
}

function visualAssertExactPath(left,right,label) {
  if(!left||!right||visualPathTopology(left)!==visualPathTopology(right))throw new Error(`${label} did not preserve the exact stable Path Network topology.`);
}

function visualDistancePointToSegment(point,start,end) {
  const line=end.map((value,index)=>Number(value)-Number(start[index]||0));
  const relative=point.map((value,index)=>Number(value)-Number(start[index]||0));
  const denominator=line.reduce((sum,value)=>sum+value*value,0);
  const t=denominator>1e-12?Math.max(0,Math.min(1,relative.reduce((sum,value,index)=>sum+value*line[index],0)/denominator)):0;
  return Math.hypot(...point.map((value,index)=>Number(value)-(Number(start[index]||0)+line[index]*t)));
}

function visualPolylineDeviation(left,right) {
  const directed=(source,target)=>Math.max(0,...source.map(point=>Math.min(...target.slice(1).map((end,index)=>visualDistancePointToSegment(point,target[index],end)))));
  if(left.length<2||right.length<2)return Number.POSITIVE_INFINITY;
  return Math.max(directed(left,right),directed(right,left));
}

async function visualCompiledSegmentPolyline(contents,pathId,segmentIds) {
  const input=JSON.stringify({pathId,segmentIds:[...new Set((segmentIds||[]).map(value=>String(value||'')).filter(Boolean))]});
  const result=await contents.executeJavaScript(`(()=>{
    const input=${input},bridge=window.__omniforgeV011Bridge,snapshot=bridge?.snapshot?.(),renderer=bridge?.renderer?.();
    const path=snapshot?.scene?.objects?.find(item=>item.id===input.pathId&&item.type==='path');
    const runtime=renderer?.scenePathRuntimes?.(snapshot.scene)?.find(item=>item.pathObjectId===input.pathId);
    if(!path?.properties?.pathNetwork||!runtime?.compiled)return {ready:false,error:'Exact compiled Path Network segment evidence is unavailable.'};
    if(Number(runtime.sourceRevision)!==Number(path.properties.pathNetwork.revision))return {ready:false,error:'Compiled Path Network segment evidence is stale.'};
    const segments=input.segmentIds.map(id=>runtime.compiled.segments.find(item=>String(item.id)===id));
    if(segments.some(segment=>!segment?.samples?.length))return {ready:false,error:'One or more exact compiled Path Network segments are unavailable.'};
    const points=[];
    for(const segment of segments){
      for(const sample of segment.samples){
        const position=sample.position.map(Number),previous=points.at(-1);
        if(!previous||Math.hypot(...position.map((value,index)=>value-previous[index]))>1e-8)points.push(position);
      }
    }
    return {ready:true,sourceRevision:Number(runtime.sourceRevision),segmentIds:segments.map(segment=>String(segment.id)),points};
  })()`,true);
  if(!result?.ready)throw new Error(String(result?.error||'Exact compiled Path Network segment evidence is unavailable.'));
  return result;
}

async function waitForVisualCompiledSegmentPolyline(contents,pathId,segmentIds,timeoutMs=12000) {
  const deadline=Date.now()+timeoutMs;let lastError=null;
  while(Date.now()<deadline){
    try{return await visualCompiledSegmentPolyline(contents,pathId,segmentIds);}
    catch(error){lastError=error;await visualInputDelay(80);}
  }
  throw lastError||new Error(`Compiled Path Network segment evidence did not become current for ${pathId}.`);
}

async function waitForVisualMutationRender(contents,checkpoint,timeoutMs=12000) {
  const expected={
    pathId:String(checkpoint.pathId||''),
    minimumNetworkRevision:Number(checkpoint.networkRevision||0),
    expectedPathIds:Array.isArray(checkpoint.pathIds)?checkpoint.pathIds.map(String):null
  };
  const input=JSON.stringify(expected);
  const deadline=Date.now()+timeoutMs;let latest=null;
  while(Date.now()<deadline){
    latest=await contents.executeJavaScript(`(()=>{
      const input=${input},bridge=window.__omniforgeV011Bridge,snapshot=bridge?.snapshot?.(),renderer=bridge?.renderer?.(),scene=snapshot?.scene;
      const paths=(scene?.objects||[]).filter(item=>item.type==='path'&&item.properties?.pathNetwork);
      const path=paths.find(item=>String(item.id)===input.pathId),network=path?.properties?.pathNetwork;
      const runtimes=renderer?.scenePathRuntimes?.(scene)||[],runtime=runtimes.find(item=>String(item.pathObjectId)===input.pathId);
      if(!network||!runtime?.compiled)return null;
      const nodeIds=(network.nodes||[]).map(node=>String(node.id)),segmentIds=(network.segments||[]).map(segment=>String(segment.id));
      const compiledNodeIds=(runtime.compiled.nodes||[]).map(node=>String(node.id)),compiledSegmentIds=(runtime.compiled.segments||[]).map(segment=>String(segment.id));
      return {
        engineRevision:Number(snapshot?.state?.engine?.revision||snapshot?.engine?.revision||0),
        networkRevision:Number(network.revision||0),sourceRevision:Number(runtime.sourceRevision||0),
        pathIds:paths.map(item=>String(item.id)),nodeIds,segmentIds,compiledNodeIds,compiledSegmentIds
      };
    })()`,true);
    if(latest){
      const pathIdsMatch=!expected.expectedPathIds||JSON.stringify(latest.pathIds)===JSON.stringify(expected.expectedPathIds);
      const exactAuthority=latest.sourceRevision===latest.networkRevision&&latest.networkRevision>=expected.minimumNetworkRevision&&
        JSON.stringify(latest.nodeIds)===JSON.stringify(latest.compiledNodeIds)&&JSON.stringify(latest.segmentIds)===JSON.stringify(latest.compiledSegmentIds);
      if(pathIdsMatch&&exactAuthority){
        await contents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',true);
        return latest;
      }
    }
    await visualInputDelay(80);
  }
  throw new Error(`Validated mutated Path Network ${checkpoint.pathId||'unknown'} did not reach the packaged renderer before evidence capture.`);
}

async function captureVisualMutationCheckpoint(contents,captureDirectory,captureId,checkpoint) {
  const renderState=await waitForVisualMutationRender(contents,checkpoint);
  const canvasDataUrl=await contents.executeJavaScript(`(()=>document.querySelector('#viewport')?.toDataURL('image/png')||'')()`,true);
  const match=/^data:image\/png;base64,(.+)$/s.exec(String(canvasDataUrl||''));
  if(!match)throw new Error('Mutated Path Network checkpoint did not return a viewport PNG.');
  const canvasFile=`${captureId}-mutated.png`,fullWindowFile=`${captureId}-mutated-window.png`;
  fs.writeFileSync(path.join(captureDirectory,canvasFile),Buffer.from(match[1],'base64'));
  const windowImage=await contents.capturePage();
  fs.writeFileSync(path.join(captureDirectory,fullWindowFile),windowImage.toPNG());
  return {...checkpoint,canvasFile,fullWindowFile,renderState,capturedAt:new Date().toISOString()};
}

async function waitForVisualNetworkRevision(contents,pathId,minimumRevision,timeoutMs=12000) {
  const deadline=Date.now()+timeoutMs;let latest=null;
  while(Date.now()<deadline){await visualInputDelay(80);latest=await visualPathNetworkSnapshot(contents,pathId);if(latest.revision>minimumRevision)return latest;}
  throw new Error(`Visual input timed out waiting for Path Network ${pathId} to advance beyond revision ${minimumRevision}.`);
}

async function visualCompiledPathTarget(contents,action) {
  const input=JSON.stringify({pathId:String(action.pathId||'path-main'),segmentId:String(action.segmentId||''),stationFraction:Number(action.stationFraction??0.5)});
  return contents.executeJavaScript(`(()=>{
    const input=${input},bridge=window.__omniforgeV011Bridge,snapshot=bridge?.snapshot?.(),renderer=bridge?.renderer?.();
    const path=snapshot?.scene?.objects?.find(item=>item.id===input.pathId&&item.type==='path');
    const runtime=renderer?.scenePathRuntimes?.(snapshot.scene)?.find(item=>item.pathObjectId===input.pathId);
    if(!path?.properties?.pathNetwork||!runtime?.compiled)throw new Error('Exact compiled Path Network target is unavailable.');
    if(!document.querySelector('#splineNodeOverlay [data-spline-node-id]:not([data-spline-handle])'))throw new Error('Path node editing is not active for native right-click insertion.');
    if(Number(runtime.sourceRevision)!==Number(path.properties.pathNetwork.revision))throw new Error('Compiled Path Network target is stale.');
    if(!input.segmentId)throw new Error('Native right-click insertion requires an allow-listed compiled segmentId.');
    const segment=runtime.compiled.segments.find(item=>String(item.id)===input.segmentId);
    if(!segment?.samples?.length)throw new Error('Compiled Path Network segment is unavailable: '+input.segmentId);
    const fraction=Math.max(.05,Math.min(.95,Number.isFinite(input.stationFraction)?input.stationFraction:.5));
    const sample=segment.samples[Math.round((segment.samples.length-1)*fraction)],screen=renderer.worldToScreen(snapshot.camera,sample.position);
    const canvas=document.querySelector('#viewport'),rect=canvas?.getBoundingClientRect();
    if(!screen?.visible||!rect)throw new Error('Compiled Path Network target is not visible in the viewport.');
    const x=rect.left+screen.x,y=rect.top+screen.y,top=document.elementFromPoint(x,y);
    if(top!==canvas)throw new Error('Compiled Path Network target is covered by '+String(top?.id||top?.className||top?.tagName||'unknown element')+'.');
    return {x,y,segmentId:String(segment.id),position:sample.position.map(Number),revision:Number(runtime.sourceRevision),nodeCount:path.properties.pathNetwork.nodes.length,segmentCount:path.properties.pathNetwork.segments.length};
  })()`,true);
}

async function visualPathHandleSnapshot(contents,pathId,reference,side) {
  const input=JSON.stringify({pathId,nodeId:String(reference.nodeId||''),nodeIndex:reference.nodeIndex,side});
  return contents.executeJavaScript(`(async()=>{
    const input=${input},response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw new Error('Visual handle state request failed: '+response.status);
    const payload=await response.json(),state=payload.state||payload,scene=(state.scenes||[]).find(item=>item.id===state.activeSceneId);
    const path=(scene?.objects||[]).find(item=>item.id===input.pathId&&item.type==='path'),network=path?.properties?.pathNetwork;
    const nodeIndex=input.nodeId?network?.nodes?.findIndex(item=>String(item.id)===input.nodeId):Number(input.nodeIndex),node=network?.nodes?.[nodeIndex];
    if(!node)throw new Error('Visual spline handle node is unavailable.');
    const element=[...document.querySelectorAll('#splineNodeOverlay [data-spline-handle]')].find(item=>String(item.dataset.splineNodeId||'')===String(node.id)&&String(item.dataset.splineHandle||'')===input.side)||null;
    if(!element)throw new Error('Visual '+input.side+' spline tangent handle is unavailable for stable node '+String(node.id)+'.');
    const rect=element.getBoundingClientRect(),style=getComputedStyle(element),top=document.elementFromPoint(rect.x+rect.width*.5,rect.y+rect.height*.5);
    if(element.hidden||style.display==='none'||style.visibility==='hidden'||rect.width<1||rect.height<1)throw new Error('Visual spline tangent handle is not visible.');
    return {revision:Number(network.revision||0),nodeId:String(node.id),nodeIndex,side:input.side,vector:(input.side==='incoming'?node.incomingHandle:node.outgoingHandle)?.map(Number)||null,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},hitTargetMatches:top===element||element.contains(top),topElement:top?.id||top?.className||top?.tagName||null};
  })()`,true);
}

async function ensureVisualPathNodePrimary(contents,pathId,reference,timeoutMs=3000) {
  let node=await visualPathNodeSnapshot(contents,pathId,reference);
  if(node.selectedPrimary)return node;
  await sendVisualClick(contents,node.rect);
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    await visualInputDelay(50);
    node=await visualPathNodeSnapshot(contents,pathId,{nodeId:node.nodeId,nodeIndex:null},{requireHitTarget:false});
    if(node.selectedPrimary)return node;
  }
  throw new Error(`Native node selection did not make stable node ${node.nodeId} primary for spline-handle editing.`);
}

async function visualSaveSnapshot(contents) {
  return contents.executeJavaScript(`(async()=>{
    const response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw new Error('Visual Save state request failed: '+response.status);
    const payload=await response.json();
    const state=payload.state||payload;
    const activity=(state.activity||[]).find(item=>item?.type==='scene'&&String(item.message||'').startsWith('Saved scene '))||null;
    const badge=document.querySelector('#saveStateBadge');
    return {
      revision:Number(state?.engine?.revision||0),
      activityId:activity?.id?String(activity.id):null,
      activityMessage:activity?.message?String(activity.message):null,
      activityCreatedAt:activity?.createdAt?String(activity.createdAt):null,
      badgeText:String(badge?.textContent||'').trim(),
      badgeClass:String(badge?.className||'')
    };
  })()`, true);
}

async function waitForVisualSave(contents, before, timeoutMs=12000) {
  const deadline=Date.now()+timeoutMs;
  let latest=null;
  while(Date.now()<deadline){
    await visualInputDelay(80);
    latest=await visualSaveSnapshot(contents);
    if(/\berror\b/.test(latest.badgeClass)||latest.badgeText==='Save error'){
      throw new Error('The native Save control reported a save error.');
    }
    const freshActivity=Boolean(latest.activityId)&&latest.activityId!==before.activityId&&String(latest.activityMessage||'').startsWith('Saved scene ');
    const savedBadge=/\bsaved\b/.test(latest.badgeClass)&&latest.badgeText==='Saved';
    if(latest.revision>before.revision&&freshActivity&&savedBadge)return latest;
  }
  throw new Error(`Native Save was not proven by /api/scene/save activity, revision advance, and the Saved badge (before=${before.revision}, after=${latest?.revision??'unavailable'}).`);
}

async function sendVisualClick(contents, bounds, modifiers=[]) {
  const x=Math.round(bounds.x+bounds.width*.5),y=Math.round(bounds.y+bounds.height*.5);
  contents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1,modifiers});
  await visualInputDelay(35);
  contents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1,modifiers});
}

async function sendVisualDrag(contents,bounds,{dx=0,dy=0,modifiers=[]}={}) {
  const startX=Math.round(bounds.x+bounds.width*.5),startY=Math.round(bounds.y+bounds.height*.5);
  const heldModifiers=[...modifiers,'leftButtonDown'];
  contents.sendInputEvent({type:'mouseDown',x:startX,y:startY,button:'left',clickCount:1,modifiers:heldModifiers});
  for(let step=1;step<=8;step++){
    await visualInputDelay(24);
    contents.sendInputEvent({type:'mouseMove',x:Math.round(startX+dx*step/8),y:Math.round(startY+dy*step/8),button:'left',clickCount:1,modifiers:heldModifiers});
  }
  contents.sendInputEvent({type:'mouseUp',x:Math.round(startX+dx),y:Math.round(startY+dy),button:'left',clickCount:1,modifiers});
}

async function performVisualInputActions(contents, actions=[], {captureMutation=null}={}) {
  const telemetry=[];
  const captureValidatedMutation=async(actionType,pathId,details={})=>{
    if(typeof captureMutation!=='function')return null;
    return captureMutation({actionType,pathId,...details});
  };
  for(const rawAction of Array.isArray(actions)?actions:[]){
    const action=rawAction&&typeof rawAction==='object'?rawAction:{};
    const actionType=String(action.type||'');
    if(actionType==='dismiss-first-use-tutorial'){
      const started=Date.now();
      const result=await dismissVisualFirstUseTutorial(contents);
      telemetry.push({...result,durationMs:Date.now()-started});
      continue;
    }
    if(actionType==='click-control'){
      const selector=String(action.selector||'');
      if(!['#saveButton','#playButton','#captureButton'].includes(selector)){
        throw new Error(`Unsupported packaged native control selector: ${selector||'missing selector'}.`);
      }
      const started=Date.now();
      const saveBefore=selector==='#saveButton'?await visualSaveSnapshot(contents):null;
      await sendVisualClick(contents,await visualElementBounds(contents,selector));
      const saveAfter=saveBefore?await waitForVisualSave(contents,saveBefore):null;
      await visualInputDelay(Math.max(50,Math.min(3000,Number(action.waitMs||250))));
      telemetry.push({
        type:'click-control',selector,label:String(action.label||selector),durationMs:Date.now()-started,
        saveVerified:Boolean(saveAfter),saveBefore,saveAfter
      });
      continue;
    }
    if(actionType==='path-node-insert'){
      const pathId=String(action.pathId||'path-main'),before=await visualPathNetworkSnapshot(contents,pathId);
      const target=await visualCompiledPathTarget(contents,{...action,pathId});
      const centerlineBefore=await visualCompiledSegmentPolyline(contents,pathId,[target.segmentId]);
      const started=Date.now(),x=Math.round(target.x),y=Math.round(target.y);
      contents.sendInputEvent({type:'mouseDown',x,y,button:'right',clickCount:1,modifiers:['rightButtonDown']});
      await visualInputDelay(35);
      contents.sendInputEvent({type:'mouseUp',x,y,button:'right',clickCount:1,modifiers:[]});
      // Electron's synthetic right-button down/up pair is genuine pointer input,
      // but Chromium does not synthesize the DOM contextmenu event from that
      // pair on every Windows build. Dispatch Electron's native context-menu
      // input event as the final step of the same bounded right-click gesture.
      contents.sendInputEvent({type:'contextMenu',x,y,button:'right',clickCount:1,modifiers:[]});
      const after=await waitForVisualNetworkRevision(contents,pathId,before.revision);
      if(after.nodeIds.length!==before.nodeIds.length+1||after.segmentIds.length!==before.segmentIds.length+1){
        throw new Error('Native right-click did not split one compiled segment into two Path Network segments.');
      }
      const insertedNodeIds=after.nodeIds.filter(id=>!before.nodeIds.includes(id));
      if(insertedNodeIds.length!==1)throw new Error('Native right-click did not create exactly one stable Path Network node.');
      const original=before.segments.find(segment=>segment.id===target.segmentId),insertedNodeId=insertedNodeIds[0],insertedNode=after.nodes.find(node=>node.id===insertedNodeId)||null;
      if(!insertedNode||!['terrain','offset','absolute'].includes(insertedNode.heightMode))throw new Error('Native right-click did not persist a valid inserted-node height authority.');
      const replacementSegments=after.segments.filter(segment=>!before.segmentIds.includes(segment.id)||segment.id===target.segmentId);
      const splitEdges=replacementSegments.filter(segment=>[segment.fromNode,segment.toNode].includes(insertedNodeId));
      const splitEndpoints=new Set(splitEdges.flatMap(segment=>[segment.fromNode,segment.toNode]).filter(nodeId=>nodeId!==insertedNodeId));
      if(!original||splitEdges.length!==2||!splitEndpoints.has(original.fromNode)||!splitEndpoints.has(original.toNode)){
        throw new Error('Native right-click changed graph counts but did not split the named compiled segment around the new stable node.');
      }
      const orderedSplitEdges=splitEdges[0].fromNode===original.fromNode
        ?[splitEdges[0],splitEdges[1]]
        :splitEdges[1].fromNode===original.fromNode
          ?[splitEdges[1],splitEdges[0]]
          :[];
      if(orderedSplitEdges.length!==2||orderedSplitEdges[0].toNode!==insertedNodeId||orderedSplitEdges[1].fromNode!==insertedNodeId||orderedSplitEdges[1].toNode!==original.toNode){
        throw new Error('Native right-click produced an unordered or reversed compiled segment split.');
      }
      const centerlineAfter=await waitForVisualCompiledSegmentPolyline(contents,pathId,orderedSplitEdges.map(segment=>segment.id));
      const centerlineDeviation=visualPolylineDeviation(centerlineBefore.points,centerlineAfter.points);
      if(!Number.isFinite(centerlineDeviation)||centerlineDeviation>0.01){
        throw new Error(`Native right-click changed the compiled centerline by ${Number.isFinite(centerlineDeviation)?centerlineDeviation.toFixed(4):'an unbounded amount'} m; the packaged limit is 0.01 m.`);
      }
      const mutationCapture=await captureValidatedMutation(actionType,pathId,{networkRevision:after.revision,nodeIds:after.nodeIds,segmentIds:after.segmentIds});
      let restored=null;
      if(action.undo!==false){
        await sendVisualClick(contents,await visualElementBounds(contents,'#v012UndoPath'));
        restored=await waitForVisualNetworkRevision(contents,pathId,after.revision);
        if(JSON.stringify(restored.nodeIds)!==JSON.stringify(before.nodeIds)||JSON.stringify(restored.segments)!==JSON.stringify(before.segments)){
          throw new Error('The real Undo path edit control did not restore the graph after native right-click insertion.');
        }
      }
      telemetry.push({type:'path-node-insert',pathId,segmentId:target.segmentId,nodeId:insertedNodeId,insertedNode,resolvedBy:'compiledSegmentId',durationMs:Date.now()-started,before,target,after,centerlineBefore,centerlineAfter,centerlineDeviation,mutationCapture,restored,undoVerified:Boolean(restored)});
      continue;
    }
    if(actionType==='path-node-toggle-selection'){
      const pathId=String(action.pathId||'path-main'),reference=normalizedVisualNodeReference(action);
      const before=await visualPathNodeSnapshot(contents,pathId,reference),started=Date.now();
      if(!before.hitTargetMatches)throw new Error(`Visual input spline handle is covered by ${String(before.topElement||'unknown element')}.`);
      await sendVisualClick(contents,before.rect,['control']);
      await visualInputDelay(Math.max(50,Math.min(2000,Number(action.waitMs||180))));
      const after=await visualPathNodeSnapshot(contents,pathId,{nodeId:before.nodeId,nodeIndex:null},{requireHitTarget:false}),network=await visualPathNetworkSnapshot(contents,pathId),selected=after.selectedMember;
      if(action.expectedSelected!==undefined&&selected!==(action.expectedSelected===true))throw new Error('Native Ctrl-click did not produce the expected stable-node selection state.');
      telemetry.push({type:'path-node-toggle-selection',pathId,nodeId:before.nodeId,resolvedBy:before.resolvedBy,durationMs:Date.now()-started,selected,selectedNodeIds:network.selectedNodeIds});
      continue;
    }
    if(actionType==='path-handle-drag'){
      const pathId=String(action.pathId||'path-main'),reference=normalizedVisualNodeReference(action),resolvedBy=reference.nodeId?'nodeId':'nodeIndex',side=String(action.side||'outgoing');
      if(!['incoming','outgoing'].includes(side))throw new Error(`Unsupported spline tangent handle side: ${side}.`);
      const primary=await ensureVisualPathNodePrimary(contents,pathId,reference);
      const before=await visualPathHandleSnapshot(contents,pathId,{nodeId:primary.nodeId,nodeIndex:null},side);
      if(!before.hitTargetMatches)throw new Error(`Visual ${side} spline tangent handle is covered by ${String(before.topElement||'unknown element')}.`);
      const dx=Math.max(-240,Math.min(240,Number(action.dx??48))),dy=Math.max(-180,Math.min(180,Number(action.dy??0))),started=Date.now();
      await sendVisualDrag(contents,before.rect,{dx,dy});
      const stableReference={nodeId:primary.nodeId,nodeIndex:null};
      const afterNode=await waitForVisualPathRevision(contents,{...action,pathId},stableReference,before.revision,12000,{requireElement:false});
      const afterVector=side==='incoming'?afterNode.incomingHandle:afterNode.outgoingHandle;
      if(!Array.isArray(before.vector)||!Array.isArray(afterVector)||visualPositionDelta(afterVector,before.vector)<0.001)throw new Error('Native spline tangent drag did not change its authored handle vector.');
      const mutationCapture=await captureValidatedMutation(actionType,pathId,{networkRevision:afterNode.revision,nodeId:before.nodeId,side});
      let restored=null;
      if(action.undo!==false){
        await sendVisualClick(contents,await visualElementBounds(contents,'#v012UndoPath'));
        restored=await waitForVisualPathRevision(contents,{...action,type:'path-undo',pathId},stableReference,afterNode.revision,12000,{requireElement:false,requireHitTarget:false});
        const restoredVector=side==='incoming'?restored.incomingHandle:restored.outgoingHandle;
        if(restored.handleMode!==before.handleMode||!Array.isArray(restoredVector)||visualPositionDelta(restoredVector,before.vector)>0.001){
          throw new Error('The real Undo path edit control did not restore the authored spline tangent handle.');
        }
      }
      telemetry.push({type:'path-handle-drag',pathId,nodeId:before.nodeId,resolvedBy,side,durationMs:Date.now()-started,before,after:afterNode,mutationCapture,restored,vectorDelta:visualPositionDelta(afterVector,before.vector),undoVerified:Boolean(restored)});
      continue;
    }
    if(actionType==='path-network-duplicate'){
      const pathId=String(action.pathId||'path-main'),before=await visualPathSceneSnapshot(contents,pathId),started=Date.now();
      await sendVisualControlClick(contents,'#v012DuplicateNetwork');
      const after=await waitForVisualSceneRevision(contents,pathId,before.engineRevision);
      const createdIds=after.pathIds.filter(id=>!before.pathIds.includes(id));
      if(createdIds.length!==1)throw new Error('Native Duplicate path did not create exactly one independent Path Network object.');
      const created=visualPathById(after,createdIds[0]),sourceBefore=visualPathById(before,pathId),sourceAfter=visualPathById(after,pathId);
      visualAssertExactPath(sourceAfter,sourceBefore,'Native Duplicate path');
      if(!created||created.nodeIds.length!==sourceBefore.nodeIds.length||created.segments.length!==sourceBefore.segments.length||created.networkId===sourceBefore.networkId){
        throw new Error('Native Duplicate path did not create one distinct graph with matching topology counts.');
      }
      if(after.selectionObjectId!==pathId)throw new Error('Native Duplicate path did not keep the source history owner selected.');
      const mutationCapture=await captureValidatedMutation(actionType,pathId,{engineRevision:after.engineRevision,pathIds:after.pathIds,createdPathId:created.id});
      await sendVisualControlClick(contents,'#v012UndoPath');
      const undone=await waitForVisualSceneRevision(contents,pathId,after.engineRevision);
      if(undone.pathIds.includes(created.id)||undone.pathIds.length!==before.pathIds.length)throw new Error('Native Undo did not remove the duplicated Path Network object.');
      visualAssertExactPath(visualPathById(undone,pathId),sourceBefore,'Undo Duplicate path');
      await sendVisualControlClick(contents,'#v012RedoPath');
      const redone=await waitForVisualSceneRevision(contents,pathId,undone.engineRevision),redoneCreated=visualPathById(redone,created.id);
      if(!redoneCreated||redone.pathIds.length!==after.pathIds.length)throw new Error('Native Redo did not restore the duplicated Path Network object.');
      visualAssertExactPath(redoneCreated,created,'Redo Duplicate path');
      await sendVisualControlClick(contents,'#v012UndoPath');
      const restored=await waitForVisualSceneRevision(contents,pathId,redone.engineRevision);
      if(restored.pathIds.includes(created.id)||restored.pathIds.length!==before.pathIds.length)throw new Error('Final native Undo did not restore the pre-duplicate scene graph.');
      visualAssertExactPath(visualPathById(restored,pathId),sourceBefore,'Final Undo Duplicate path');
      telemetry.push({type:'path-network-duplicate',pathId,resolvedBy:'pathId',createdPathId:created.id,durationMs:Date.now()-started,before,after,mutationCapture,undone,redone,restored,undoVerified:true,redoVerified:true});
      continue;
    }
    if(actionType==='path-network-split'){
      const pathId=String(action.pathId||'path-main'),reference=normalizedVisualNodeReference(action),node=await ensureVisualPathNodePrimary(contents,pathId,reference),before=await visualPathSceneSnapshot(contents,pathId),started=Date.now();
      const sourceBefore=visualPathById(before,pathId),degree=sourceBefore.segments.filter(segment=>segment.fromNode===node.nodeId||segment.toNode===node.nodeId).length;
      if(degree!==2)throw new Error(`Native Split path requires stable degree-2 node ${node.nodeId}; received degree ${degree}.`);
      await sendVisualControlClick(contents,'#v012SplitNetwork');
      const after=await waitForVisualSceneRevision(contents,pathId,before.engineRevision),createdIds=after.pathIds.filter(id=>!before.pathIds.includes(id));
      if(createdIds.length!==1)throw new Error('Native Split path did not create exactly one extracted Path Network object.');
      const retained=visualPathById(after,pathId),extracted=visualPathById(after,createdIds[0]);
      if(!retained||!extracted||!retained.nodeIds.includes(node.nodeId)||!extracted.nodeIds.some(id=>id!==node.nodeId)||after.selectionObjectId!==pathId){
        throw new Error('Native Split path did not preserve its retained history owner and extracted stable graph.');
      }
      if(retained.segments.length+extracted.segments.length!==sourceBefore.segments.length)throw new Error('Native Split path changed the total authored segment count.');
      const mutationCapture=await captureValidatedMutation(actionType,pathId,{engineRevision:after.engineRevision,pathIds:after.pathIds,createdPathId:extracted.id});
      await sendVisualControlClick(contents,'#v012UndoPath');
      const undone=await waitForVisualSceneRevision(contents,pathId,after.engineRevision);
      if(undone.pathIds.includes(extracted.id)||undone.pathIds.length!==before.pathIds.length)throw new Error('Native Undo did not remove the split Path Network object.');
      visualAssertExactPath(visualPathById(undone,pathId),sourceBefore,'Undo Split path');
      await sendVisualControlClick(contents,'#v012RedoPath');
      const redone=await waitForVisualSceneRevision(contents,pathId,undone.engineRevision);
      if(!visualPathById(redone,extracted.id)||redone.pathIds.length!==after.pathIds.length)throw new Error('Native Redo did not restore both split Path Network objects.');
      visualAssertExactPath(visualPathById(redone,pathId),retained,'Redo Split path retained graph');
      visualAssertExactPath(visualPathById(redone,extracted.id),extracted,'Redo Split path extracted graph');
      await sendVisualControlClick(contents,'#v012UndoPath');
      const restored=await waitForVisualSceneRevision(contents,pathId,redone.engineRevision);
      if(restored.pathIds.includes(extracted.id)||restored.pathIds.length!==before.pathIds.length)throw new Error('Final native Undo did not restore the pre-split scene graph.');
      visualAssertExactPath(visualPathById(restored,pathId),sourceBefore,'Final Undo Split path');
      telemetry.push({type:'path-network-split',pathId,nodeId:node.nodeId,resolvedBy:node.resolvedBy,createdPathId:extracted.id,durationMs:Date.now()-started,before,after,mutationCapture,undone,redone,restored,undoVerified:true,redoVerified:true});
      continue;
    }
    if(actionType==='path-network-join'){
      const pathId=String(action.pathId||'path-main'),sourcePathId=String(action.sourcePathId||'').trim();
      if(!sourcePathId||sourcePathId===pathId||sourcePathId.length>512)throw new Error('Native Join path requires one distinct stable sourcePathId.');
      const before=await visualPathSceneSnapshot(contents,pathId),sourceBefore=visualPathById(before,sourcePathId),targetBefore=visualPathById(before,pathId),started=Date.now();
      if(!sourceBefore)throw new Error(`Native Join source Path Network is unavailable: ${sourcePathId}.`);
      const selectedSource=await sendVisualSelectOption(contents,'#v012JoinSourcePath',sourcePathId);
      await sendVisualControlClick(contents,'#v012JoinPath');
      const after=await waitForVisualSceneRevision(contents,pathId,before.engineRevision),targetAfter=visualPathById(after,pathId);
      if(after.pathIds.includes(sourcePathId)||after.pathIds.length!==before.pathIds.length-1)throw new Error('Native Join path did not remove exactly the chosen source Path Network object.');
      if(!targetAfter||targetAfter.nodeIds.length!==targetBefore.nodeIds.length+sourceBefore.nodeIds.length||targetAfter.segments.length!==targetBefore.segments.length+sourceBefore.segments.length+1){
        throw new Error('Native Join path did not create the exact welded target topology.');
      }
      if(after.selectionObjectId!==pathId)throw new Error('Native Join path did not keep the target history owner selected.');
      const mutationCapture=await captureValidatedMutation(actionType,pathId,{engineRevision:after.engineRevision,pathIds:after.pathIds,removedPathId:sourcePathId});
      await sendVisualControlClick(contents,'#v012UndoPath');
      const undone=await waitForVisualSceneRevision(contents,pathId,after.engineRevision);
      visualAssertExactPath(visualPathById(undone,pathId),targetBefore,'Undo Join target');
      visualAssertExactPath(visualPathById(undone,sourcePathId),sourceBefore,'Undo Join source');
      if(undone.pathIds.length!==before.pathIds.length)throw new Error('Native Undo did not restore the source Path Network object after Join.');
      await sendVisualControlClick(contents,'#v012RedoPath');
      const redone=await waitForVisualSceneRevision(contents,pathId,undone.engineRevision);
      if(redone.pathIds.includes(sourcePathId)||redone.pathIds.length!==after.pathIds.length)throw new Error('Native Redo did not remove the joined source Path Network object again.');
      visualAssertExactPath(visualPathById(redone,pathId),targetAfter,'Redo Join target');
      await sendVisualControlClick(contents,'#v012UndoPath');
      const restored=await waitForVisualSceneRevision(contents,pathId,redone.engineRevision);
      visualAssertExactPath(visualPathById(restored,pathId),targetBefore,'Final Undo Join target');
      visualAssertExactPath(visualPathById(restored,sourcePathId),sourceBefore,'Final Undo Join source');
      telemetry.push({type:'path-network-join',pathId,sourcePathId,resolvedBy:'pathId+sourcePathId',selectedSource,durationMs:Date.now()-started,before,after,mutationCapture,undone,redone,restored,undoVerified:true,redoVerified:true});
      continue;
    }
    if(actionType==='path-undo'){
      const pathId=String(action.pathId||'path-main');
      const reference=normalizedVisualNodeReference(action);
      const normalized={...action,type:'path-undo',pathId,...reference};
      const before=await visualPathNodeSnapshot(contents,pathId,reference);
      const started=Date.now();
      await sendVisualClick(contents,await visualElementBounds(contents,'#v012UndoPath'));
      const after=await waitForVisualPathRevision(contents,normalized,reference,before.revision);
      const expectedPosition=Array.isArray(action.expectedPosition)
        ?action.expectedPosition.slice(0,3).map(Number)
        :null;
      if(expectedPosition&&visualPositionDelta(after.position,expectedPosition)>0.005){
        throw new Error('The real Undo path edit control did not restore the expected authored node position.');
      }
      telemetry.push({
        type:'path-undo',pathId,nodeIndex:before.nodeIndex,nodeId:before.nodeId,resolvedBy:before.resolvedBy,durationMs:Date.now()-started,
        before,after,expectedPosition,undoVerified:Boolean(expectedPosition)
      });
      continue;
    }
    if(!['path-node-drag','path-node-group-drag'].includes(actionType))throw new Error(`Unsupported packaged native input action: ${actionType||'missing type'}.`);
    const pathId=String(action.pathId||'path-main');
    const reference=normalizedVisualNodeReference(action),normalized={...action,pathId,...reference};
    const before=await visualPathNodeSnapshot(contents,pathId,reference);
    if(!before.hitTargetMatches){
      const blocker=before.openDialog?`open dialog #${before.openDialog}`:`element ${String(before.topElement||'unknown')}`;
      throw new Error(`Visual input spline handle is covered by ${blocker}.`);
    }
    const startX=Math.round(before.rect.x+before.rect.width*.5),startY=Math.round(before.rect.y+before.rect.height*.5);
    const dx=Math.max(-240,Math.min(240,Number(action.dx??(action.vertical?0:54))));
    const dy=Math.max(-180,Math.min(180,Number(action.dy??(action.vertical?-48:12))));
    // Electron's mouseMove input does not infer the held-button bit from an
    // earlier mouseDown. Chromium therefore emitted PointerEvent.buttons=0,
    // and the real editor correctly cancelled the drag as a released button.
    // Carry the native left-button modifier through each move, then remove it
    // on mouseUp so the visible packaged app receives a genuine drag gesture.
    const heldModifiers=action.vertical?['shift']:[];
    const started=Date.now();
    const groupNodeIds=actionType==='path-node-group-drag'?[...new Set((action.nodeIds||[]).map(value=>String(value||'').trim()).filter(Boolean))]:[];
    if(actionType==='path-node-group-drag'){
      if(groupNodeIds.length<2||!groupNodeIds.includes(before.nodeId))throw new Error('Packaged group drag requires at least two stable nodeIds including the drag anchor.');
      const initialSelection=await visualPathNetworkSnapshot(contents,pathId);
      for(const nodeId of initialSelection.selectedNodeIds.filter(nodeId=>!groupNodeIds.includes(nodeId))){
        const extra=await visualPathNodeSnapshot(contents,pathId,{nodeId,nodeIndex:null},{requireHitTarget:false});
        if(!extra.hitTargetMatches)throw new Error(`Selected node ${nodeId} cannot be natively deselected because its viewport handle is not a hit target.`);
        await sendVisualClick(contents,extra.rect,['control']);
        await visualInputDelay(80);
      }
      for(const nodeId of groupNodeIds){
        const member=await visualPathNodeSnapshot(contents,pathId,{nodeId,nodeIndex:null},{requireHitTarget:false});
        if(member.selectedMember)continue;
        if(!member.hitTargetMatches)throw new Error(`Stable group member ${nodeId} is not a native viewport hit target.`);
        await sendVisualClick(contents,member.rect,['control']);
        await visualInputDelay(80);
      }
      const selectionChecks=await Promise.all(groupNodeIds.map(nodeId=>visualPathNodeSnapshot(contents,pathId,{nodeId,nodeIndex:null},{requireHitTarget:false})));
      if(selectionChecks.some(node=>!node.selectedMember))throw new Error('Native Ctrl-click did not select every stable group-drag node.');
      const exactSelection=await visualPathNetworkSnapshot(contents,pathId);
      if(exactSelection.selectedNodeIds.length!==groupNodeIds.length||exactSelection.selectedNodeIds.some(nodeId=>!groupNodeIds.includes(nodeId))){
        throw new Error('Native Ctrl-click did not isolate the exact stable-node group requested for dragging.');
      }
    }
    const groupBefore=actionType==='path-node-group-drag'
      ?await Promise.all(groupNodeIds.map(nodeId=>visualPathNodeSnapshot(contents,pathId,{nodeId,nodeIndex:null},{requireElement:false,requireHitTarget:false})))
      :[before];
    await sendVisualDrag(contents,{x:startX-1,y:startY-1,width:2,height:2},{dx,dy,modifiers:heldModifiers});
    const after=await waitForVisualPathRevision(contents,normalized,reference,before.revision);
    const groupAfter=actionType==='path-node-group-drag'
      ?await Promise.all(groupNodeIds.map(nodeId=>visualPathNodeSnapshot(contents,pathId,{nodeId,nodeIndex:null},{requireElement:false,requireHitTarget:false})))
      :[after];
    const horizontalDelta=Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2]);
    const verticalDelta=Math.abs(after.effectivePosition[1]-before.effectivePosition[1]);
    if(action.vertical){
      if(verticalDelta<0.01||after.heightMode!=='absolute')throw new Error('Shift-drag did not raise/lower the authored 3D Path Network node.');
    }else if(horizontalDelta<0.01){
      throw new Error('Horizontal spline-handle drag did not move the authored Path Network node over terrain.');
    }
    if(actionType==='path-node-group-drag'){
      const deltas=groupAfter.map((node,index)=>(action.vertical?node.effectivePosition:node.position).map((value,axis)=>value-(action.vertical?groupBefore[index].effectivePosition:groupBefore[index].position)[axis]));
      if(visualPositionDelta(deltas[0],[0,0,0])<0.01)throw new Error('Native group drag did not move the selected stable nodes.');
      if(deltas.some(delta=>visualPositionDelta(delta,deltas[0])>0.01))throw new Error('Native group drag did not apply one coherent delta to every selected stable node.');
    }
    const mutationCapture=await captureValidatedMutation(actionType,pathId,{networkRevision:after.revision,nodeIds:groupNodeIds.length?groupNodeIds:[before.nodeId]});
    let restored=null;
    if(action.undo!==false){
      const undoBounds=await visualElementBounds(contents,'#v012UndoPath');
      await sendVisualClick(contents,undoBounds);
      restored=await waitForVisualPathRevision(contents,normalized,reference,after.revision);
      if(visualPositionDelta(restored.position,before.position)>0.005){
        throw new Error('The real Undo path edit control did not restore the dragged node position.');
      }
      if(restored.heightMode!==before.heightMode||Math.abs(restored.heightOffset-before.heightOffset)>0.0001){
        throw new Error('The real Undo path edit control did not restore the dragged node height authority.');
      }
      if(actionType==='path-node-group-drag'){
        const groupRestored=await Promise.all(groupNodeIds.map(nodeId=>visualPathNodeSnapshot(contents,pathId,{nodeId,nodeIndex:null},{requireElement:false,requireHitTarget:false})));
        const groupRestoredCorrectly=groupRestored.every((node,index)=>visualPositionDelta(node.position,groupBefore[index].position)<=0.005&&node.heightMode===groupBefore[index].heightMode&&Math.abs(node.heightOffset-groupBefore[index].heightOffset)<=0.0001);
        if(!groupRestoredCorrectly)throw new Error('The real Undo path edit control did not restore every stable node from the group drag.');
        restored={...restored,group:groupRestored};
      }
    }
    telemetry.push({
      type:actionType,pathId,nodeIndex:before.nodeIndex,nodeId:before.nodeId,resolvedBy:before.resolvedBy,nodeIds:groupNodeIds,vertical:Boolean(action.vertical),
      durationMs:Date.now()-started,before,after,mutationCapture,restored,
      groupBefore,groupAfter,horizontalDelta,verticalDelta,undoVerified:Boolean(restored)
    });
  }
  return telemetry;
}

function installVisualCaptureWatcher() {
  if(!VISUAL_CAPTURE_DIR||!mainWindow||mainWindow.isDestroyed())return;
  fs.mkdirSync(VISUAL_CAPTURE_DIR,{recursive:true});
  const requestFile=path.join(VISUAL_CAPTURE_DIR,'capture-request.json');
  const closeRequestFile=path.join(VISUAL_CAPTURE_DIR,'close-request.json');
  if(visualCaptureTimer)clearInterval(visualCaptureTimer);
  visualCaptureTimer=setInterval(async()=>{
    if(visualCaptureInFlight||!mainWindow||mainWindow.isDestroyed())return;
    if(fs.existsSync(closeRequestFile)){
      const closeRequest=readJson(closeRequestFile,{});
      fs.rmSync(closeRequestFile,{force:true});
      if(Number(closeRequest.processId)!==process.pid){
        appendLog(`Rejected visual close request for PID ${closeRequest.processId||'unknown'}; desktop PID is ${process.pid}.`);
        return;
      }
      // Close the actual editor BrowserWindow. Process.CloseMainWindow is not
      // deterministic when diagnostic mode owns a detached Chromium DevTools
      // window, because Windows may report that tool window as the process's
      // main HWND after restart.
      mainWindow.close();
      return;
    }
    if(!fs.existsSync(requestFile))return;
    visualCaptureInFlight=true;
    const processingFile=path.join(VISUAL_CAPTURE_DIR,`capture-processing-${process.pid}.json`);
    let nativeCameraRestore=null;
    let captureHoldToken=null;
    try{
      fs.renameSync(requestFile,processingFile);
      const request=readJson(processingFile,{});
      const id=String(request.id||Date.now()).replace(/[^a-z0-9_-]/gi,'-');
      const requestOptions={...(request.options||{})};
      const mutationCaptures=[];
      let nativeSynchronizationTelemetry=null;
      if(Array.isArray(requestOptions.nativeInputActions)&&requestOptions.nativeInputActions.length){
        nativeCameraRestore=await mainWindow.webContents.executeJavaScript('window.__omniforgeVisualTestCameraSnapshot()',true);
        requestOptions.restoreCamera=nativeCameraRestore;
        const synchronizeOptions=JSON.stringify(requestOptions);
        nativeSynchronizationTelemetry=await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestSynchronize(${synchronizeOptions})`,true);
        if(requestOptions.captureMutatedState===true&&(requestOptions.inputCamera||requestOptions.camera)){
          const mutationCamera=JSON.stringify(requestOptions.inputCamera||requestOptions.camera);
          await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestRestoreCamera(${mutationCamera})`,true);
          await mainWindow.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',true);
        }
      }
      const captureMutation=requestOptions.captureMutatedState===true
        ?async checkpoint=>{
          if(mutationCaptures.length)throw new Error('One evidence request may capture only one validated mutated Path Network state.');
          const capture=await captureVisualMutationCheckpoint(mainWindow.webContents,VISUAL_CAPTURE_DIR,id,checkpoint);
          mutationCaptures.push(capture);
          return capture;
        }
        :null;
      const nativeInputTelemetry=await performVisualInputActions(mainWindow.webContents,requestOptions.nativeInputActions,{captureMutation});
      if(requestOptions.captureMutatedState===true&&mutationCaptures.length!==1)throw new Error('Requested mutated Path Network evidence was not captured before Undo.');
      const options=JSON.stringify(requestOptions);
      const captureResult=await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestCapture(${options})`,true);
      captureHoldToken=String(captureResult?.captureHoldToken||'');
      if(requestOptions.fullWindowCapture===true&&!captureHoldToken)throw new Error('Renderer did not hold the paired full-window capture state.');
      const dataUrl=typeof captureResult==='string'?captureResult:captureResult?.dataUrl;
      const match=/^data:image\/png;base64,(.+)$/s.exec(String(dataUrl||''));
      if(!match)throw new Error('Renderer did not return a PNG data URL.');
      fs.writeFileSync(path.join(VISUAL_CAPTURE_DIR,`${id}.png`),Buffer.from(match[1],'base64'));
      let fullWindowFile=null;
      if(requestOptions.fullWindowCapture===true){
        // The canvas PNG proves rendered geometry. A separate Chromium page
        // capture proves the surrounding packaged editor UI, including tabs,
        // Inspector controls, Save state, and any modal/overlay that could
        // intercept real input. Keep both artifacts tied to one request ID.
        const windowImage=await mainWindow.webContents.capturePage();
        fullWindowFile=`${id}-window.png`;
        fs.writeFileSync(path.join(VISUAL_CAPTURE_DIR,fullWindowFile),windowImage.toPNG());
      }
      if(captureHoldToken){
        const releaseToken=JSON.stringify(captureHoldToken);
        await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestFinishCapture(${releaseToken})`,true);
        captureHoldToken=null;
      }
      writeJson(path.join(VISUAL_CAPTURE_DIR,`${id}.json`),{ok:true,id,at:new Date().toISOString(),fullWindowFile,mutationCaptures,renderTelemetry:captureResult?.renderTelemetry||null,synchronizationTelemetry:captureResult?.synchronizationTelemetry||null,fixtureTelemetry:captureResult?.fixtureTelemetry||null,nativeSynchronizationTelemetry,interactionTelemetry:captureResult?.interactionTelemetry||[],nativeInputTelemetry});
    }catch(error){
      const request=readJson(processingFile,{});const id=String(request.id||'capture-error').replace(/[^a-z0-9_-]/gi,'-');
      writeJson(path.join(VISUAL_CAPTURE_DIR,`${id}.json`),{ok:false,id,error:error.message,stack:error.stack||''});
      writeIncident('visual-capture-failed',{id,message:error.message,stack:error.stack||''});
    }finally{
      if(captureHoldToken&&mainWindow&&!mainWindow.isDestroyed()){
        const releaseToken=JSON.stringify(captureHoldToken);
        await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestFinishCapture(${releaseToken})`,true).catch(error=>appendLog(`Visual capture state restore failed: ${error.message}`));
        captureHoldToken=null;
      }
      if(nativeCameraRestore&&mainWindow&&!mainWindow.isDestroyed()){
        const restoreCamera=JSON.stringify(nativeCameraRestore);
        await mainWindow.webContents.executeJavaScript(`window.__omniforgeVisualTestRestoreCamera(${restoreCamera})`,true).catch(()=>{});
      }
      fs.rmSync(processingFile,{force:true});visualCaptureInFlight=false;
    }
  },180);
  visualCaptureTimer.unref?.();
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.unref(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const address=server.address(); const port=typeof address==='object'&&address?address.port:0; server.close(()=>resolve(port)); });
  });
}

function configuredRuntimePort() {
  const requested = Number.parseInt(String(process.env.OMNIFORGE_PORT || ''), 10);
  return Number.isInteger(requested) && requested > 0 && requested <= 65535 ? requested : 0;
}

function probeHealth(port, token, timeoutMs=1000) {
  return new Promise(resolve=>{
    const request=http.get({host:'127.0.0.1',port:Number(port),path:'/api/health',timeout:timeoutMs},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
        try{const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));resolve(response.statusCode===200&&(!token||payload.sessionToken===token)?payload:null);}catch{resolve(null);}
      });
    });
    request.on('timeout',()=>{request.destroy();resolve(null);});request.on('error',()=>resolve(null));
  });
}

async function cleanupStaleRuntime() {
  const marker=readJson(RUNTIME_FILE);
  if(!marker)return;
  const health=await probeHealth(marker.port,marker.sessionToken,700);
  if(!health){fs.rmSync(RUNTIME_FILE,{force:true});return;}
  appendLog(`Cleaning stale runtime pid=${marker.pid} port=${marker.port}`);
  await terminateProcessTree(marker.pid);
  fs.rmSync(RUNTIME_FILE,{force:true});
}

function terminateProcessTree(pid) {
  return new Promise(resolve=>{
    if(!pid)return resolve();
    if(process.platform==='win32'){
      const killer=spawn('taskkill',['/pid',String(pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.once('exit',()=>resolve());killer.once('error',()=>resolve());
    }else{
      try{process.kill(-Number(pid),'SIGTERM');}catch{try{process.kill(Number(pid),'SIGTERM');}catch{}}
      setTimeout(()=>{try{process.kill(-Number(pid),'SIGKILL');}catch{}resolve();},500).unref();
    }
  });
}

function waitForHealth(port, token, timeoutMs=20000) {
  const started=Date.now();
  return new Promise((resolve,reject)=>{
    const attempt=async()=>{const health=await probeHealth(port,token,1100);if(health)return resolve(health);if(Date.now()-started>timeoutMs)return reject(new Error('OmniForge runtime did not become ready.'));setTimeout(attempt,180);};attempt();
  });
}

async function stopRuntime() {
  if(!engineProcess&&!runtimeInfo)return;
  const pid=engineProcess?.pid||runtimeInfo?.pid;
  await terminateProcessTree(pid);
  engineProcess=null;runtimeInfo=null;fs.rmSync(RUNTIME_FILE,{force:true});
}

function markSessionStart() {
  const previous=readJson(LIFECYCLE_FILE);
  if(previous&&previous.cleanShutdown===false){recoveryReason=`The previous OmniForge session ended unexpectedly at ${previous.startedAt || 'an unknown time'}.`;}
  writeJson(LIFECYCLE_FILE,{appId:APP_ID,version:PRODUCT_VERSION,pid:process.pid,startedAt:new Date().toISOString(),cleanShutdown:false,safeMode});
}
function markSessionClean() {
  const current=readJson(LIFECYCLE_FILE,{appId:APP_ID,version:PRODUCT_VERSION,startedAt:new Date().toISOString()});
  writeJson(LIFECYCLE_FILE,{...current,endedAt:new Date().toISOString(),cleanShutdown:true});
}

async function chooseRecoveryMode() {
  if(!recoveryReason||safeMode)return;
  const result=await dialog.showMessageBox({
    type:'warning',title:'OmniForge recovery',message:'The previous session did not close cleanly.',detail:`${recoveryReason}\n\nOmniForge maintains atomic project state and a backup copy. Choose Safe Mode to disable play mode and automation while inspecting the recovered project.`,
    buttons:['Recover normally','Open in Safe Mode','Quit'],defaultId:0,cancelId:2,noLink:true
  });
  if(result.response===2){app.quit();throw new Error('Startup cancelled by user.');}
  if(result.response===1)safeMode=true;
}

async function startRuntime() {
  await cleanupStaleRuntime();
  const requestedPort=configuredRuntimePort();
  const port=requestedPort || await findFreePort();
  if(requestedPort){
    const existing=await probeHealth(requestedPort,null,500);
    if(existing)throw new Error(`The requested OmniForge runtime port ${requestedPort} is already in use.`);
  }
  const token=crypto.randomBytes(24).toString('hex');
  const serverScript=path.join(APP_ROOT,'server','v011-bootstrap.mjs');
  const logFile=fs.openSync(path.join(LOG_DIR,'runtime.log'),'a');
  engineProcess=spawn(process.execPath,[serverScript],{
    cwd:APP_ROOT,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore',logFile,logFile],
    env:{...process.env,ELECTRON_RUN_AS_NODE:'1',OMNIFORGE_PORT:String(port),OMNIFORGE_DESKTOP:'1',OMNIFORGE_DATA_ROOT:uniqueUserData,OMNIFORGE_SESSION_TOKEN:token,OMNIFORGE_SAFE_MODE:safeMode?'1':'0'}
  });
  runtimeInfo={pid:engineProcess.pid,port,sessionToken:token,startedAt:new Date().toISOString()};writeJson(RUNTIME_FILE,runtimeInfo);
  engineProcess.once('exit',code=>{
    appendLog(`Runtime exited code=${code}`);fs.rmSync(RUNTIME_FILE,{force:true});
    if(!shuttingDown&&mainWindow&&!mainWindow.isDestroyed())dialog.showErrorBox('OmniForge Runtime Stopped',`The local runtime exited unexpectedly (code ${code ?? 'unknown'}). Your last saved project state remains on disk.`);
  });
  await waitForHealth(port,token);
  return {port,token};
}

function installIpcHandlers() {
  ipcMain.handle('omniforge:choose-project-directory',async(_event,options)=>{
    const result=await dialog.showOpenDialog(mainWindow,{title:options?.title||'Choose project directory',properties:['openDirectory','createDirectory'],buttonLabel:options?.buttonLabel||'Choose folder'});
    return result.canceled?null:result.filePaths[0]||null;
  });
  ipcMain.handle('omniforge:open-path',async(_event,target)=>{
    if(typeof target!=='string'||!target.trim())return 'A path is required.';
    return shell.openPath(path.resolve(target));
  });
  ipcMain.handle('omniforge:show-item',async(_event,target)=>{if(typeof target==='string'&&target.trim())shell.showItemInFolder(path.resolve(target));return true;});
  ipcMain.handle('omniforge:copy-text',(_event,value)=>{
    const text=String(value??'');
    if(!text) return {ok:false,error:'Nothing was available to copy.'};
    clipboard.writeText(text);
    return {ok:clipboard.readText()===text};
  });
  ipcMain.handle('omniforge:lifecycle-info',()=>({productName:PRODUCT_NAME,version:PRODUCT_VERSION,userData:uniqueUserData,safeMode,recoveryReason,runtime:runtimeInfo}));
  ipcMain.handle('omniforge:relaunch-safe-mode',()=>{app.relaunch({args:[...process.argv.slice(1).filter(arg=>arg!=='--safe-mode'),'--safe-mode']});app.exit(0);});
  ipcMain.handle('omniforge:relaunch-normal',()=>{app.relaunch({args:process.argv.slice(1).filter(arg=>arg!=='--safe-mode')});app.exit(0);});
}

async function createMainWindow() {
  await chooseRecoveryMode();
  const {port}=await startRuntime();
  const windowStateFile=path.join(uniqueUserData,'window-state.json');
  const saved=readJson(windowStateFile,{});
  mainWindow=new BrowserWindow({
    title:`${PRODUCT_NAME} ${PRODUCT_VERSION}`,width:saved.width||1600,height:saved.height||980,x:saved.x,y:saved.y,minWidth:1120,minHeight:720,show:false,backgroundColor:'#0d1119',autoHideMenuBar:true,icon:fs.existsSync(ICON)?ICON:undefined,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}
  });
  if(saved.maximized)mainWindow.maximize();
  const allowedOrigin=`http://127.0.0.1:${port}`;
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))shell.openExternal(url);return{action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,target)=>{if(!target.startsWith(allowedOrigin))event.preventDefault();});
  const isTrustedEditorOrigin = value => {
    try { return new URL(value || '').origin === allowedOrigin; } catch { return false; }
  };
  session.defaultSession.setPermissionCheckHandler((webContents,permission,requestingOrigin)=>{
    const origin=requestingOrigin || webContents?.getURL?.() || '';
    return permission==='pointerLock' && isTrustedEditorOrigin(origin);
  });
  session.defaultSession.setPermissionRequestHandler((webContents,permission,callback,details)=>{
    const origin=details?.requestingUrl || webContents?.getURL?.() || '';
    callback(permission==='pointerLock' && isTrustedEditorOrigin(origin));
  });
  mainWindow.webContents.on('console-message',(_event,level,message,line,sourceId)=>{
    if(DIAGNOSTIC_MODE)appendDiagnostic(`Renderer console level=${level} ${sourceId||'unknown'}:${line||0} ${message}`);
    if(Number(level)>=2)appendLog(`Renderer console level=${level} ${sourceId||'unknown'}:${line||0} ${message}`);
  });
  mainWindow.webContents.on('before-input-event',(event,input)=>{
    const protectedNavigationChord=(input.control||input.meta)&&!input.alt&&String(input.key||'').toLowerCase()==='w';
    if(protectedNavigationChord){
      event.preventDefault();
      if(DIAGNOSTIC_MODE)appendDiagnostic('Protected viewport Ctrl+W navigation chord from closing the editor.');
    }
  });
  mainWindow.webContents.on('render-process-gone',(_event,details)=>{appendLog(`Renderer process gone reason=${details.reason} exitCode=${details.exitCode}`);recoverRendererProcess('renderer-process-gone',details);});
  mainWindow.on('unresponsive',()=>{appendLog('Main window renderer became unresponsive.');writeIncident('renderer-unresponsive',{url:mainWindow?.webContents?.getURL?.()||''});});
  mainWindow.on('responsive',()=>appendLog('Main window renderer recovered responsiveness.'));
  mainWindow.once('ready-to-show',()=>{
    mainWindow.show();
    if(DIAGNOSTIC_MODE)mainWindow.webContents.openDevTools({mode:'detach',activate:true});
  });
  mainWindow.on('close',()=>{if(!mainWindow.isDestroyed()){const bounds=mainWindow.getBounds();writeJson(windowStateFile,{...bounds,maximized:mainWindow.isMaximized()});}});
  mainWindow.on('closed',()=>{if(visualCaptureTimer){clearInterval(visualCaptureTimer);visualCaptureTimer=null;}mainWindow=null;});
  await mainWindow.loadURL(`${allowedOrigin}/?desktop=1&safeMode=${safeMode?'1':'0'}&recovered=${recoveryReason?'1':'0'}&diagnostics=${DIAGNOSTIC_MODE?'1':'0'}`);
  installVisualCaptureWatcher();
}

markSessionStart();
const gotLock=app.requestSingleInstanceLock({appId:APP_ID});
if(!gotLock)app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.on('child-process-gone',(_event,details)=>{if(details?.type==='GPU'){appendLog(`GPU process gone reason=${details.reason} exitCode=${details.exitCode}`);recoverRendererProcess('gpu-process-gone',details);}});
  app.whenReady().then(()=>{installIpcHandlers();return createMainWindow();}).catch(async error=>{appendLog(error.stack||error.message);dialog.showErrorBox('OmniForge failed to start',error.stack||error.message);await stopRuntime();app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(shuttingDown)return;shuttingDown=true;event.preventDefault();stopRuntime().finally(()=>{markSessionClean();app.exit(0);});});
  process.on('uncaughtException',error=>{appendLog(`Uncaught exception: ${error.stack||error.message}`);writeIncident('desktop-uncaught-exception',{message:error.message,stack:error.stack||''});});
  process.on('unhandledRejection',error=>{appendLog(`Unhandled rejection: ${error?.stack||error}`);writeIncident('desktop-unhandled-rejection',{message:error?.message||String(error),stack:error?.stack||''});});
}
