const { app, BrowserWindow, dialog, shell, ipcMain, crashReporter, session, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const APP_ROOT = path.resolve(__dirname, '..');
const PRODUCT_NAME = 'OmniForge';
const PRODUCT_VERSION = '0.9.0';
const APP_ID = 'com.omniforge.editor';
const ICON = path.join(APP_ROOT, 'resources', process.platform === 'win32' ? 'omniforge-icon.ico' : 'omniforge-icon.png');

app.setName(PRODUCT_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
const uniqueUserData = path.join(app.getPath('appData'), 'OmniForge');
app.setPath('userData', uniqueUserData);
app.setPath('crashDumps', path.join(uniqueUserData, 'crashes'));
app.setAboutPanelOptions({ applicationName: PRODUCT_NAME, applicationVersion: PRODUCT_VERSION, copyright: 'Copyright © 2026 OmniForge', credits: 'AI-native 3D game creation workspace', iconPath: path.join(APP_ROOT, 'resources', 'omniforge-icon.png') });
crashReporter.start({ productName: PRODUCT_NAME, companyName: 'OmniForge', uploadToServer: false, compress: true });

const SESSION_DIR = path.join(uniqueUserData, 'sessions');
const LOG_DIR = path.join(uniqueUserData, 'logs');
const LIFECYCLE_FILE = path.join(SESSION_DIR, 'lifecycle.json');
const RUNTIME_FILE = path.join(SESSION_DIR, 'runtime.json');
fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

let engineProcess = null;
let mainWindow = null;
let shuttingDown = false;
let safeMode = process.argv.includes('--safe-mode');
let recoveryReason = null;
let runtimeInfo = null;

function readJson(file, fallback=null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp=`${file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(value,null,2),'utf8'); fs.renameSync(temp,file); }
function appendLog(message) { fs.appendFileSync(path.join(LOG_DIR,'desktop.log'),`[${new Date().toISOString()}] ${message}\n`,'utf8'); }

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.unref(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const address=server.address(); const port=typeof address==='object'&&address?address.port:0; server.close(()=>resolve(port)); });
  });
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
  const port=await findFreePort();
  const token=crypto.randomBytes(24).toString('hex');
  const serverScript=path.join(APP_ROOT,'server','server.mjs');
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
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.on('close',()=>{if(!mainWindow.isDestroyed()){const bounds=mainWindow.getBounds();writeJson(windowStateFile,{...bounds,maximized:mainWindow.isMaximized()});}});
  mainWindow.on('closed',()=>{mainWindow=null;});
  await mainWindow.loadURL(`${allowedOrigin}/?desktop=1&safeMode=${safeMode?'1':'0'}&recovered=${recoveryReason?'1':'0'}`);
}

markSessionStart();
const gotLock=app.requestSingleInstanceLock({appId:APP_ID});
if(!gotLock)app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(()=>{installIpcHandlers();return createMainWindow();}).catch(async error=>{appendLog(error.stack||error.message);dialog.showErrorBox('OmniForge failed to start',error.stack||error.message);await stopRuntime();app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(shuttingDown)return;shuttingDown=true;event.preventDefault();stopRuntime().finally(()=>{markSessionClean();app.exit(0);});});
  process.on('uncaughtException',error=>{appendLog(`Uncaught exception: ${error.stack||error.message}`);});
  process.on('unhandledRejection',error=>{appendLog(`Unhandled rejection: ${error?.stack||error}`);});
}
