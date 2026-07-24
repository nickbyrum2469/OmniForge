import { Renderer3D, terrainHeight } from './renderer.js';
import { add, sub, scale, length, normalize, clamp, cameraForward, cameraRight } from './math.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const deepClone = value => structuredClone(value);

const ui = {
  projectName: $('#projectName'), projectButton: $('#projectButton'), sceneSelect: $('#sceneSelect'), newSceneButton: $('#newSceneButton'),
  saveButton: $('#saveButton'), playButton: $('#playButton'), captureButton: $('#captureButton'), engineVersion: $('#engineVersion'), connectionBadge: $('#connectionBadge'),
  hierarchySearch: $('#hierarchySearch'), hierarchyList: $('#hierarchyList'), sceneNameLabel: $('#sceneNameLabel'), objectCount: $('#objectCount'),
  addQuickButton: $('#addQuickButton'), viewport: $('#viewport'), viewportWrap: $('#viewportWrap'), navPrompt: $('#navPrompt'),
  viewportToast: $('#viewportToast'), viewportModeBadge: $('#viewportModeBadge'), cameraPositionBadge: $('#cameraPositionBadge'),
  gridToggle: $('#gridToggle'), autoCaptureToggle: $('#autoCaptureToggle'), focusButton: $('#focusButton'), groundButton: $('#groundButton'), frameAllButton: $('#frameAllButton'),
  viewportSettingsButton: $('#viewportSettingsButton'), selectionStatus: $('#selectionStatus'), fpsStatus: $('#fpsStatus'),
  inspectorTitle: $('#inspectorTitle'), inspectorContent: $('#inspectorContent'), duplicateButton: $('#duplicateButton'), deleteButton: $('#deleteButton'),
  commandInput: $('#commandInput'), queueCommandButton: $('#queueCommandButton'), commandQueue: $('#commandQueue'), commandCount: $('#commandCount'),
  consoleList: $('#consoleList'), worldSettings: $('#worldSettings'), openProjectFolder: $('#openProjectFolder'),
  projectDialog: $('#projectDialog'), projectNameInput: $('#projectNameInput'), projectTemplateInput: $('#projectTemplateInput'), applyProjectButton: $('#applyProjectButton'),
  newSceneDialog: $('#newSceneDialog'), newSceneNameInput: $('#newSceneNameInput'), newSceneTemplateInput: $('#newSceneTemplateInput'), createSceneButton: $('#createSceneButton'),
  helpDialog: $('#helpDialog'),
  modelImportInput: $('#modelImportInput'), modelCategory: $('#modelCategory'), modelLicense: $('#modelLicense'), importModelButton: $('#importModelButton'), modelImportStatus: $('#modelImportStatus'), modelAssetCount: $('#modelAssetCount'), modelAssetList: $('#modelAssetList'), modelAssetInspector: $('#modelAssetInspector'), assetSearchInput: $('#assetSearchInput'), assetStatusFilter: $('#assetStatusFilter'),
  texturePrompt: $('#texturePrompt'), textureCategory: $('#textureCategory'), textureResolution: $('#textureResolution'), generateTextureButton: $('#generateTextureButton'), sendTextureBriefButton: $('#sendTextureBriefButton'), textureImportInput: $('#textureImportInput'), materialList: $('#materialList'), materialCount: $('#materialCount'), materialInspector: $('#materialInspector'),
  lookSensitivityInput: $('#lookSensitivityInput'), invertHorizontalInput: $('#invertHorizontalInput'), invertVerticalInput: $('#invertVerticalInput'), moveSpeedInput: $('#moveSpeedInput'), fovInput: $('#fovInput'), saveViewportSettingsButton: $('#saveViewportSettingsButton'),
  prefabButton: $('#prefabButton'), prefabDialog: $('#prefabDialog'), prefabNameInput: $('#prefabNameInput'), createPrefabButton: $('#createPrefabButton'), prefabCount: $('#prefabCount'), prefabList: $('#prefabList'),
  saveStateBadge: $('#saveStateBadge'), layoutButton: $('#layoutButton'), commandPaletteButton: $('#commandPaletteButton'), selectionBreadcrumb: $('#selectionBreadcrumb'),
  workspace: $('.workspace'), centerStage: $('#centerStage'), leftPanel: $('#leftPanel'), rightPanel: $('#rightPanel'), bottomDock: $('#bottomDock'),
  leftResizeHandle: $('#leftResizeHandle'), rightResizeHandle: $('#rightResizeHandle'), bottomResizeHandle: $('#bottomResizeHandle'), collapseLeftButton: $('#collapseLeftButton'), collapseRightButton: $('#collapseRightButton'), collapseBottomButton: $('#collapseBottomButton'),
  projectHubDialog: $('#projectHubDialog'), projectSearchInput: $('#projectSearchInput'), projectGrid: $('#projectGrid'), projectHubStatus: $('#projectHubStatus'), newProjectHubButton: $('#newProjectHubButton'), importProjectButton: $('#importProjectButton'), refreshProjectsButton: $('#refreshProjectsButton'),
  duplicateProjectDialog: $('#duplicateProjectDialog'), duplicateProjectNameInput: $('#duplicateProjectNameInput'), duplicateProjectIdInput: $('#duplicateProjectIdInput'), confirmDuplicateProjectButton: $('#confirmDuplicateProjectButton'),
  layoutDialog: $('#layoutDialog'), layoutPresetList: $('#layoutPresetList'), layoutNameInput: $('#layoutNameInput'), saveLayoutButton: $('#saveLayoutButton'), resetLayoutButton: $('#resetLayoutButton'),
  shortcutDialog: $('#shortcutDialog'), shortcutList: $('#shortcutList'), saveShortcutsButton: $('#saveShortcutsButton'), resetShortcutsButton: $('#resetShortcutsButton'),
  commandPaletteDialog: $('#commandPaletteDialog'), commandPaletteInput: $('#commandPaletteInput'), commandPaletteList: $('#commandPaletteList'),
  tutorialDialog: $('#tutorialDialog'), tutorialStepLabel: $('#tutorialStepLabel'), tutorialTitle: $('#tutorialTitle'), tutorialText: $('#tutorialText'), tutorialProgress: $('#tutorialProgress'), tutorialBackButton: $('#tutorialBackButton'), tutorialNextButton: $('#tutorialNextButton'), skipTutorialButton: $('#skipTutorialButton'),
  errorDialog: $('#errorDialog'), errorDialogTitle: $('#errorDialogTitle'), errorDialogMessage: $('#errorDialogMessage'), errorDialogDetails: $('#errorDialogDetails'), copyErrorButton: $('#copyErrorButton'),
  providerSummaryBadge: $('#providerSummaryBadge'), providerList: $('#providerList'), runIntegrationSetupButton: $('#runIntegrationSetupButton'), testAllProvidersButton: $('#testAllProvidersButton'), integrationJobCount: $('#integrationJobCount'), openJobsButton: $('#openJobsButton'), integrationStorageSummary: $('#integrationStorageSummary'),
  jobCountBadge: $('#jobCountBadge'), jobList: $('#jobList'), runProjectIntegrityButton: $('#runProjectIntegrityButton'), runAssetIndexButton: $('#runAssetIndexButton'), runDiagnosticJobButton: $('#runDiagnosticJobButton'), clearCompletedJobsButton: $('#clearCompletedJobsButton'),
  integrationSetupDialog: $('#integrationSetupDialog'), setupProviderList: $('#setupProviderList'), maxConcurrentJobsInput: $('#maxConcurrentJobsInput'), cacheLimitInput: $('#cacheLimitInput'), downloadDirectoryInput: $('#downloadDirectoryInput'), offlineModeInput: $('#offlineModeInput'), chooseDownloadDirectoryButton: $('#chooseDownloadDirectoryButton'), dismissIntegrationSetupButton: $('#dismissIntegrationSetupButton'), saveIntegrationSetupButton: $('#saveIntegrationSetupButton'),
  marketplaceProviderSelect: $('#marketplaceProviderSelect'), marketplaceTypeSelect: $('#marketplaceTypeSelect'), marketplaceSearchInput: $('#marketplaceSearchInput'), marketplaceSearchButton: $('#marketplaceSearchButton'), marketplaceStatusBadge: $('#marketplaceStatusBadge'), marketplaceAttribution: $('#marketplaceAttribution'), marketplaceResults: $('#marketplaceResults'), marketplaceInspector: $('#marketplaceInspector'), marketplaceResultCount: $('#marketplaceResultCount'),
  surfaceGraphSummary: $('#surfaceGraphSummary'), repairSurfaceSeamsButton: $('#repairSurfaceSeamsButton'), generateMissingMapsButton: $('#generateMissingMapsButton'), seamBlendWidthInput: $('#seamBlendWidthInput'), surfaceMapAudit: $('#surfaceMapAudit'), surfaceSourcePreview: $('#surfaceSourcePreview'), surfaceSeamPreview: $('#surfaceSeamPreview'),
  decalNameInput: $('#decalNameInput'), decalCategoryInput: $('#decalCategoryInput'), decalOpacityInput: $('#decalOpacityInput'), decalDepthInput: $('#decalDepthInput'), createDecalButton: $('#createDecalButton'), placeDecalButton: $('#placeDecalButton'), decalList: $('#decalList'),
  atlasNameInput: $('#atlasNameInput'), atlasKindInput: $('#atlasKindInput'), atlasResolutionInput: $('#atlasResolutionInput'), atlasSourceCount: $('#atlasSourceCount'), createAtlasButton: $('#createAtlasButton'), atlasList: $('#atlasList')
};

let state = null;
let scene = null;
let camera = null;
let renderer = null;
let selectedId = null;
let selectedMaterialId = null;
let selectedAssetId = null;
let selectedDecalId = null;
let selectedProviderId = 'local-worker-host';
let pendingModelFile = null;
let marketplaceSearchResults=[];
let selectedMarketplaceAsset=null;
let marketplaceLoading=false;
let keys = new Set();
let lastFrame = performance.now();
let frameCounter = 0;
let fpsTimer = 0;
let playSnapshot = null;
let rigidBodies = new Map();
let physicsAccumulator = 0;
let localMutationAt = 0;
let captureTimer = null;
let cameraPersistTimer = null;
let toastTimer = null;
let materialSaveTimer = null;
let surfacePreviewBaseline = null;
let loading = true;
let projects = [];
let layoutPersistTimer = null;
let paletteActiveIndex = 0;
let tutorialIndex = 0;
let lastErrorDetails = '';
let lastKnownSaveState = 'saved';
let viewportDragLook = false;
let viewportDragLast = null;
let pointerLockSupported = 'pointerLockElement' in document;

async function api(path, options={}) {
  const method=String(options.method||'GET').toUpperCase(),mutating=!['GET','HEAD'].includes(method);
  if(mutating)setSaveState('saving');
  try{
    const response = await fetch(path, {
      headers: options.body ? {'content-type':'application/json'} : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) { const error=new Error(payload.error || `${response.status} ${response.statusText}`);error.details=payload.stack||'';throw error; }
    if(mutating)setSaveState('saved');
    return payload;
  }catch(error){if(mutating)setSaveState('error');throw error;}
}

function activeScene(nextState=state) {
  return nextState.scenes.find(item => item.id === nextState.activeSceneId);
}
function selectedObject() { return scene?.objects.find(object => object.id === selectedId) || null; }
function selectedMaterial() { return state?.assets?.find(asset => asset.id === selectedMaterialId && asset.type === 'material') || null; }
function selectedModelAsset(){return state?.assets?.find(asset=>asset.id===selectedAssetId&&asset.type==='model')||null;}
function selectedSurfaceRecipe(){const material=selectedMaterial();if(!material)return null;return state?.assets?.find(asset=>asset.type==='surfaceRecipe'&&(asset.id===material.surfaceRecipeId||asset.baseMaterialId===material.id))||null;}
function setSaveState(status='saved'){lastKnownSaveState=status;if(!ui.saveStateBadge)return;ui.saveStateBadge.textContent=({saved:'Saved',dirty:'Unsaved',saving:'Saving…',error:'Save error'})[status]||status;ui.saveStateBadge.className=`save-state ${status}`;}
function markLocalMutation() { localMutationAt = Date.now();setSaveState('dirty'); }

function showToast(message, type='') {
  clearTimeout(toastTimer);
  ui.viewportToast.textContent = message;
  ui.viewportToast.className = `viewport-toast show ${type ? `toast-${type}` : ''}`;
  toastTimer = setTimeout(()=>ui.viewportToast.className='viewport-toast',2400);
}

function objectIcon(type) {
  return ({box:'▣',sphere:'●',cylinder:'⬭',plane:'▱',terrain:'⌁',path:'⌇',model:'◆',decal:'◫',directionalLight:'☀',pointLight:'✦',empty:'＋'})[type] || '◇';
}

function typeLabel(type) {
  return ({box:'Box Mesh',sphere:'Sphere Mesh',cylinder:'Cylinder Mesh',plane:'Plane Mesh',terrain:'Procedural Terrain',path:'Terrain Path',model:'Imported Model Asset',decal:'Projected Surface Decal',directionalLight:'Directional Light',pointLight:'Point Light',empty:'Empty Entity'})[type] || type;
}

function setAssetWorkspaceView(view='models',persist=false){
  const valid=['models','surfaces','prefabs','marketplace'],next=valid.includes(view)?view:'models';
  $$('[data-asset-workspace-view]').forEach(button=>button.classList.toggle('active',button.dataset.assetWorkspaceView===next));
  $$('[data-asset-subview]').forEach(panel=>panel.classList.toggle('active',panel.dataset.assetSubview===next));
  if(state?.editor)state.editor.assetWorkspaceView=next;
  if(persist&&state?.editor)api('/api/editor',{method:'POST',body:{assetWorkspaceView:next}}).then(result=>state.engine.revision=result.engine.revision).catch(error=>handleError(error,'Asset workspace view could not be saved'));
}
function fitLayoutToViewport(layout){
  const next={...layout},workspaceWidth=Math.max(900,ui.workspace?.clientWidth||window.innerWidth||1440),workspaceHeight=Math.max(620,ui.workspace?.clientHeight||window.innerHeight-58||800),minCenter=workspaceWidth<1300?460:Math.min(680,Math.max(520,workspaceWidth*.4));
  const minLeft=200,minRight=270,maxSide=Math.max(minLeft+minRight,workspaceWidth-minCenter);
  let left=clamp(Number(next.leftWidth)||260,minLeft,520),right=clamp(Number(next.rightWidth)||330,minRight,560);
  if(!next.leftCollapsed&&!next.rightCollapsed&&left+right>maxSide){const overflow=left+right-maxSide,leftRoom=Math.max(0,left-minLeft),rightRoom=Math.max(0,right-minRight),room=leftRoom+rightRoom||1;left-=overflow*(leftRoom/room);right-=overflow*(rightRoom/room);}
  next.leftWidth=Math.round(left);next.rightWidth=Math.round(right);next.bottomHeight=Math.round(clamp(Number(next.bottomHeight)||250,120,Math.max(120,workspaceHeight-380)));
  return next;
}

function applyState(nextState, options={}) {
  const previousSceneId = state?.activeSceneId;
  const previousSelected = selectedId;
  state = nextState;
  scene = activeScene();
  camera = scene.editorCamera;
  const hasSelection=state.selection&&Object.prototype.hasOwnProperty.call(state.selection,'objectId');
  selectedId = hasSelection ? (state.selection.objectId&&scene.objects.some(o=>o.id===state.selection.objectId)?state.selection.objectId:null) : scene.objects[0]?.id||null;
  if (previousSceneId === state.activeSceneId && previousSelected && scene.objects.some(o=>o.id===previousSelected) && !options.forceSelection) selectedId = previousSelected;
  state.selection.objectId = selectedId;
  const materials = (state.assets || []).filter(asset=>asset.type==='material');
  const requestedMaterial = selectedMaterialId || state.editor?.selectedMaterialId;
  selectedMaterialId = materials.some(asset=>asset.id===requestedMaterial) ? requestedMaterial : materials[0]?.id || null;
  if (state.editor) state.editor.selectedMaterialId = selectedMaterialId;
  const models=(state.assets||[]).filter(asset=>asset.type==='model'),requestedAsset=selectedAssetId||state.editor?.selectedAssetId;
  selectedAssetId=models.some(asset=>asset.id===requestedAsset)?requestedAsset:models[0]?.id||null;
  if(state.editor)state.editor.selectedAssetId=selectedAssetId;
  const requestedProvider=selectedProviderId||state.editor?.selectedProviderId;selectedProviderId=(state.providers||[]).some(provider=>provider.id===requestedProvider)?requestedProvider:(state.providers||[])[0]?.id||null;if(state.editor)state.editor.selectedProviderId=selectedProviderId;
  ui.projectName.textContent = state.project.name;
  ui.engineVersion.textContent = `v${state.engine.version}`;
  ui.gridToggle.checked = Boolean(scene.settings.gridVisible);
  ui.autoCaptureToggle.checked = Boolean(state.editor.autoCapture);
  const codexRecent = state.editor.codexStatus === 'connected' && state.editor.lastCodexConnectionAt && Date.now() - new Date(state.editor.lastCodexConnectionAt).getTime() < 300000;
  ui.connectionBadge.classList.toggle('available', !codexRecent);
  ui.connectionBadge.querySelector('span:last-child').textContent = codexRecent ? 'Codex connected' : 'MCP available';
  $$('[data-transform-mode]').forEach(button=>button.classList.toggle('active',button.dataset.transformMode===(state.editor.transformMode||'move')));
  ui.viewportWrap.style.background = `linear-gradient(${scene.settings.skyTop} 0%, ${scene.settings.skyBottom} 72%, #26343c 100%)`;
  renderer?.setAssets(state.assets);
  renderSceneOptions();
  renderHierarchy();
  renderInspector();
  renderModelAssets();
  renderMaterials();
  renderPrefabs();
  setAssetWorkspaceView(state.editor?.assetWorkspaceView||'models',false);
  renderProviders();
  renderMarketplaceProviders();
  renderJobs();
  renderCommands();
  renderConsole();
  renderWorldSettings();
  applyLayout(state.editor.layout || {}, false);
  renderBreadcrumb();
  installSafeModeBanner();
  setSaveState('saved');
  updateStatus();
  if(ui.projectHubDialog?.open)renderProjectHub();
}


function formatDate(value){
  const date=new Date(value||0);return Number.isNaN(date.getTime())?'Unknown':date.toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
}

async function copyTextToClipboard(value){
  const text=String(value??'');
  if(!text)throw new Error('Nothing was available to copy.');
  if(window.omniforgeDesktop?.copyText){
    const result=await window.omniforgeDesktop.copyText(text);
    if(result?.ok)return true;
  }
  if(navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(text);return true;}catch{}
  }
  const area=document.createElement('textarea');
  area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-9999px';area.style.opacity='0';
  document.body.appendChild(area);area.focus();area.select();area.setSelectionRange(0,text.length);
  const copied=document.execCommand?.('copy')===true;area.remove();
  if(!copied)throw new Error('The operating system rejected the clipboard request.');
  return true;
}

function handleError(error,title='Action failed'){
  const message=String(error?.message||error||'Unknown error');
  lastErrorDetails=String(error?.details||error?.stack||message);
  showToast(message,'error');setSaveState('error');
  if(ui.errorDialog?.open)return;
  if(ui.errorDialog){ui.errorDialogTitle.textContent=title;ui.errorDialogMessage.textContent=message;ui.errorDialogDetails.textContent=lastErrorDetails;ui.errorDialog.showModal();}
}

async function loadProjects({openHub=false}={}){
  try{
    const payload=await api('/api/projects');projects=payload.projects||[];renderProjectHub();
    if(openHub&&!ui.projectHubDialog.open)ui.projectHubDialog.showModal();
  }catch(error){handleError(error,'Could not load projects');}
}

function projectThumbnailUrl(project){
  if(!project.thumbnail)return '';
  const file=String(project.thumbnail).replace(/^\/+/, '');return `/${file}`;
}

function renderProjectHub(){
  if(!ui.projectGrid)return;
  const query=ui.projectSearchInput.value.trim().toLowerCase();
  const filtered=projects.filter(project=>!query||`${project.name} ${project.id} ${project.root}`.toLowerCase().includes(query));
  ui.projectHubStatus.textContent=`${projects.length} managed project${projects.length===1?'':'s'} · Project state, recent ordering, thumbnails, migration, and locks are persistent.`;
  ui.projectGrid.innerHTML=filtered.length?filtered.map(project=>{
    const active=project.id===state?.project?.id,thumb=projectThumbnailUrl(project);
    return `<article class="project-card ${active?'active':''} ${project.missing?'missing':''}" data-project-card="${escapeHtml(project.id)}">
      <div class="project-thumbnail" ${thumb?`style="background-image:linear-gradient(rgba(7,10,15,.08),rgba(7,10,15,.36)),url('${escapeHtml(thumb)}')"`:''}></div>
      <div class="project-card-body"><div class="project-card-title"><strong>${escapeHtml(project.name)}</strong>${active?'<span class="active-pill">OPEN</span>':''}</div>
      <div class="project-meta"><span>${escapeHtml(project.template||'custom')} · schema ${Number(project.schemaVersion||1)}</span><span>Last opened ${escapeHtml(formatDate(project.lastOpenedAt||project.updatedAt))}</span><span>${escapeHtml(project.id)}</span></div>
      ${project.missing?'<div class="project-warning">Project directory is missing or was moved. Locate it to restore access.</div>':''}</div>
      <div class="project-actions">
        ${project.missing?`<button class="primary" data-project-action="locate" data-project-id="${escapeHtml(project.id)}" type="button">Locate</button>`:`<button class="primary" data-project-action="open" data-project-id="${escapeHtml(project.id)}" type="button" ${active?'disabled':''}>${active?'Current':'Open'}</button>`}
        <button data-project-action="folder" data-project-id="${escapeHtml(project.id)}" type="button" ${project.missing?'disabled':''}>Folder</button>
        <button data-project-action="duplicate" data-project-id="${escapeHtml(project.id)}" type="button" ${project.missing?'disabled':''}>Duplicate</button>
        <button class="danger" data-project-action="archive" data-project-id="${escapeHtml(project.id)}" type="button">Archive</button>
      </div></article>`;
  }).join(''):`<div class="project-empty"><strong>No projects match this search.</strong><p>Create a blank game, start from the 3D template, or import an existing folder.</p></div>`;
}

async function chooseDirectory(title,buttonLabel){
  if(window.omniforgeDesktop?.chooseProjectDirectory)return window.omniforgeDesktop.chooseProjectDirectory({title,buttonLabel});
  const value=window.prompt(`${title}\nEnter an absolute directory path:`);return value||null;
}

async function openProjectById(projectId){
  try{const payload=await api('/api/projects/open',{method:'POST',body:{projectId}});projects=payload.projects||projects;applyState(payload.state,{forceSelection:true});ui.projectHubDialog.close();showToast(`Opened ${payload.state.project.name}`,'success');}
  catch(error){handleError(error,'Project could not be opened');await loadProjects();}
}

async function importProjectFolder(){
  const sourcePath=await chooseDirectory('Import an existing project folder','Import folder');if(!sourcePath)return;
  try{const payload=await api('/api/projects/import',{method:'POST',body:{sourcePath}});projects=payload.projects||projects;applyState(payload.state,{forceSelection:true});ui.projectHubDialog.close();showToast(`Imported ${payload.state.project.name}`,'success');}
  catch(error){handleError(error,'Project import failed');}
}

async function locateMissingProject(projectId){
  const sourcePath=await chooseDirectory('Locate the moved OmniForge project folder','Restore project');if(!sourcePath)return;
  try{const payload=await api('/api/projects/locate',{method:'POST',body:{projectId,sourcePath}});projects=payload.projects||projects;applyState(payload.state,{forceSelection:true});renderProjectHub();showToast('Project location restored','success');}
  catch(error){handleError(error,'Project location could not be restored');}
}

async function archiveProjectById(projectId){
  const project=projects.find(item=>item.id===projectId);if(!project)return;
  if(!window.confirm(`Archive “${project.name}”?\n\nThe managed project folder will move into OmniForge's archive. This does not permanently delete it.`))return;
  try{const payload=await api('/api/projects/archive',{method:'POST',body:{projectId}});projects=payload.projects||projects;applyState(payload.state,{forceSelection:true});renderProjectHub();showToast(`Archived ${project.name}`,'success');}
  catch(error){handleError(error,'Project archive failed');}
}

function currentLayout(){return {...(state?.editor?.layout||{}),leftWidth:Number(state?.editor?.layout?.leftWidth||260),rightWidth:Number(state?.editor?.layout?.rightWidth||330),bottomHeight:Number(state?.editor?.layout?.bottomHeight||250)};}
function applyLayout(layout,persist=false){
  if(!state?.editor)return;const next=fitLayoutToViewport({...currentLayout(),...layout});
  state.editor.layout=next;document.documentElement.style.setProperty('--left-panel-width',`${next.leftWidth}px`);document.documentElement.style.setProperty('--right-panel-width',`${next.rightWidth}px`);document.documentElement.style.setProperty('--bottom-dock-height',`${next.bottomHeight}px`);
  ui.workspace.classList.toggle('left-collapsed',Boolean(next.leftCollapsed));ui.workspace.classList.toggle('right-collapsed',Boolean(next.rightCollapsed));ui.centerStage.classList.toggle('bottom-collapsed',Boolean(next.bottomCollapsed));
  ui.collapseLeftButton.textContent=next.leftCollapsed?'›':'‹';ui.collapseRightButton.textContent=next.rightCollapsed?'‹':'›';ui.collapseBottomButton.textContent=next.bottomCollapsed?'⌃':'⌄';
  renderer?.resize();if(persist)persistLayoutSoon();
}
function persistLayoutSoon(){clearTimeout(layoutPersistTimer);markLocalMutation();layoutPersistTimer=setTimeout(async()=>{try{const next=await api('/api/editor',{method:'POST',body:{layout:state.editor.layout,savedLayouts:state.editor.savedLayouts}});state.engine.revision=next.engine.revision;}catch(error){handleError(error,'Layout could not be saved');}},300);}
function togglePanel(panel){const key=panel==='left'?'leftCollapsed':panel==='right'?'rightCollapsed':'bottomCollapsed';applyLayout({[key]:!state.editor.layout[key]},true);}
function layoutPresets(){return [
  {name:'Default',description:'Balanced hierarchy, viewport, inspector, and AI dock.',leftWidth:260,rightWidth:330,bottomHeight:250,leftCollapsed:false,rightCollapsed:false,bottomCollapsed:false},
  {name:'World Building',description:'Wider hierarchy and inspector with a compact task dock.',leftWidth:330,rightWidth:370,bottomHeight:180,leftCollapsed:false,rightCollapsed:false,bottomCollapsed:false},
  {name:'Materials',description:'Wide material library and inspector for surface authoring.',leftWidth:400,rightWidth:360,bottomHeight:170,leftCollapsed:false,rightCollapsed:false,bottomCollapsed:false},
  {name:'Viewport Focus',description:'Hide every dock and maximize the 3D world.',leftWidth:260,rightWidth:330,bottomHeight:250,leftCollapsed:true,rightCollapsed:true,bottomCollapsed:true},
  ...(state?.editor?.savedLayouts||[]).filter(layout=>!['Default','World Building','Materials','Viewport Focus'].includes(layout.name||''))
];}
function renderLayoutPresets(){ui.layoutPresetList.innerHTML=layoutPresets().map((layout,index)=>`<button class="layout-preset" data-layout-index="${index}" type="button"><div class="layout-bars"></div><strong>${escapeHtml(layout.name||`Layout ${index+1}`)}</strong><small>${escapeHtml(layout.description||'Saved custom workspace layout.')}</small></button>`).join('');$$('[data-layout-index]').forEach(button=>button.addEventListener('click',()=>{const layout=layoutPresets()[Number(button.dataset.layoutIndex)];applyLayout(layout,true);ui.layoutDialog.close();showToast(`Applied ${layout.name}`,'success');}));}

function startResize(kind,event){
  event.preventDefault();const handle=kind==='left'?ui.leftResizeHandle:kind==='right'?ui.rightResizeHandle:ui.bottomResizeHandle;handle.classList.add('dragging');
  const move=moveEvent=>{const bounds=ui.workspace.getBoundingClientRect(),centerBounds=ui.centerStage.getBoundingClientRect();if(kind==='left')applyLayout({leftWidth:moveEvent.clientX-bounds.left});else if(kind==='right')applyLayout({rightWidth:bounds.right-moveEvent.clientX});else applyLayout({bottomHeight:centerBounds.bottom-moveEvent.clientY-28});};
  const end=()=>{handle.classList.remove('dragging');document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);persistLayoutSoon();};document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);
}

const defaultShortcutValues={save:'Ctrl+S',commandPalette:'Ctrl+K',duplicate:'Ctrl+D',focus:'F',resetCamera:'Home',play:'P',delete:'Delete',moveMode:'1',rotateMode:'2',scaleMode:'3',toggleLeftPanel:'Ctrl+Alt+1',toggleRightPanel:'Ctrl+Alt+2',toggleBottomDock:'Ctrl+Alt+3',projectHub:'Ctrl+Shift+P'};
const shortcutLabels={save:'Save scene',commandPalette:'Open command palette',duplicate:'Duplicate selection',focus:'Focus selection',resetCamera:'Reset camera',play:'Play or stop',delete:'Delete selection',moveMode:'Move mode',rotateMode:'Rotate mode',scaleMode:'Scale mode',toggleLeftPanel:'Toggle hierarchy panel',toggleRightPanel:'Toggle inspector panel',toggleBottomDock:'Toggle bottom dock',projectHub:'Open Project Hub'};
function eventShortcut(event){const parts=[];if(event.ctrlKey)parts.push('Ctrl');if(event.metaKey)parts.push('Meta');if(event.altKey)parts.push('Alt');if(event.shiftKey)parts.push('Shift');let key=event.key;if(['Control','Meta','Alt','Shift'].includes(key))return '';if(key===' ')key='Space';if(key.length===1)key=key.toUpperCase();else key=key.replace(/^Arrow/,'');parts.push(key);return parts.join('+');}
function shortcutMatches(event,shortcut){if(!shortcut)return false;const normalized=eventShortcut(event).toLowerCase();return normalized===String(shortcut).toLowerCase();}
function renderShortcuts(){const shortcuts=state.editor.shortcuts||{};ui.shortcutList.innerHTML=Object.entries(shortcutLabels).map(([key,label])=>`<div class="shortcut-row"><label for="shortcut-${escapeHtml(key)}">${escapeHtml(label)}</label><input id="shortcut-${escapeHtml(key)}" data-shortcut-key="${escapeHtml(key)}" readonly value="${escapeHtml(shortcuts[key]||'')}"></div>`).join('');$$('[data-shortcut-key]').forEach(input=>input.addEventListener('keydown',event=>{event.preventDefault();event.stopPropagation();if(event.key==='Backspace'||event.key==='Delete')input.value='';else{const value=eventShortcut(event);if(value)input.value=value;}}));}
async function saveShortcuts(){const next={};$$('[data-shortcut-key]').forEach(input=>next[input.dataset.shortcutKey]=input.value.trim());const values=Object.values(next).filter(Boolean).map(value=>value.toLowerCase()),duplicate=values.find((value,index)=>values.indexOf(value)!==index);if(duplicate)return showToast(`Shortcut conflict: ${duplicate}`,'error');state.editor.shortcuts=next;try{const saved=await api('/api/editor',{method:'POST',body:{shortcuts:next}});state.engine.revision=saved.engine.revision;ui.shortcutDialog.close();showToast('Keyboard shortcuts saved','success');}catch(error){handleError(error,'Shortcuts could not be saved');}}

function resetCamera(){camera.position=[25,15,32];camera.yaw=-.68;camera.pitch=-.29;camera.fov=62;persistCameraSoon();showToast('Camera reset','success');}
function commandDefinitions(){return [
  {id:'projectHub',label:'Open Project Hub',description:'Create, open, import, duplicate, archive, or locate projects.',icon:'◫',shortcutKey:'projectHub',run:()=>loadProjects({openHub:true})},
  {id:'newProject',label:'Create new project',description:'Start an empty 3D project or starter world.',icon:'＋',run:()=>{ui.projectNameInput.value='Untitled Game';ui.projectDialog.showModal();}},
  {id:'importProject',label:'Import project folder',description:'Copy an existing folder into the managed project workspace.',icon:'⇩',run:importProjectFolder},
  {id:'save',label:'Save scene',description:'Persist the active scene and editor camera.',icon:'◆',shortcutKey:'save',run:()=>saveScene()},
  {id:'focus',label:'Focus selected object',description:'Move the editor camera to the current selection.',icon:'◎',shortcutKey:'focus',run:focusSelected},
  {id:'resetCamera',label:'Reset camera',description:'Restore a predictable free-fly camera position.',icon:'⌂',shortcutKey:'resetCamera',run:resetCamera},
  {id:'frameAll',label:'Frame active world',description:'Fit visible scene entities into the viewport.',icon:'⤢',run:frameAll},
  {id:'capture',label:'Capture viewport',description:'Save rendered evidence from the current 3D view.',icon:'◉',run:()=>captureViewport()},
  {id:'play',label:'Toggle play mode',description:'Start or stop the current scene simulation.',icon:'▶',shortcutKey:'play',run:enterPlayMode},
  {id:'layout',label:'Workspace layouts',description:'Apply, save, or reset panel arrangements.',icon:'▦',run:()=>{renderLayoutPresets();ui.layoutDialog.showModal();}},
  {id:'shortcuts',label:'Keyboard shortcuts',description:'Review and remap editor commands.',icon:'⌨',run:()=>{renderShortcuts();ui.shortcutDialog.showModal();}},
  {id:'viewportSettings',label:'Viewport controls',description:'Configure sensitivity, inversion, speed, and field of view.',icon:'⚙',run:()=>ui.viewportSettingsButton.click()},
  {id:'toggleLeft',label:'Toggle hierarchy panel',description:'Collapse or restore the left authoring panel.',icon:'▤',shortcutKey:'toggleLeftPanel',run:()=>togglePanel('left')},
  {id:'toggleRight',label:'Toggle inspector panel',description:'Collapse or restore the inspector.',icon:'▥',shortcutKey:'toggleRightPanel',run:()=>togglePanel('right')},
  {id:'toggleBottom',label:'Toggle development dock',description:'Collapse or restore AI development and console panels.',icon:'▱',shortcutKey:'toggleBottomDock',run:()=>togglePanel('bottom')},
  ...['box','sphere','cylinder','terrain','path','directionalLight','pointLight','empty'].map(type=>({id:`create-${type}`,label:`Create ${typeLabel(type)}`,description:'Add to the active authoritative 3D scene.',icon:objectIcon(type),run:()=>createObject(type)}))
];}
function filteredCommands(){const query=ui.commandPaletteInput.value.trim().toLowerCase();return commandDefinitions().filter(command=>!query||`${command.label} ${command.description}`.toLowerCase().includes(query));}
function renderCommandPalette(){const commands=filteredCommands();paletteActiveIndex=clamp(paletteActiveIndex,0,Math.max(0,commands.length-1));ui.commandPaletteList.innerHTML=commands.length?commands.map((command,index)=>`<button class="palette-item ${index===paletteActiveIndex?'active':''}" data-palette-index="${index}" type="button"><span class="palette-icon">${command.icon}</span><span><strong>${escapeHtml(command.label)}</strong><small>${escapeHtml(command.description)}</small></span>${command.shortcutKey&&state.editor.shortcuts?.[command.shortcutKey]?`<kbd>${escapeHtml(state.editor.shortcuts[command.shortcutKey])}</kbd>`:'<span></span>'}</button>`).join(''):'<div class="project-empty">No commands match.</div>';$$('[data-palette-index]').forEach(button=>button.addEventListener('click',()=>runPaletteCommand(Number(button.dataset.paletteIndex))));}
function openCommandPalette(){paletteActiveIndex=0;ui.commandPaletteInput.value='';renderCommandPalette();if(!ui.commandPaletteDialog.open)ui.commandPaletteDialog.showModal();setTimeout(()=>ui.commandPaletteInput.focus(),0);}
function runPaletteCommand(index=paletteActiveIndex){const command=filteredCommands()[index];if(!command)return;ui.commandPaletteDialog.close();Promise.resolve(command.run()).catch(error=>handleError(error,`${command.label} failed`));}

const tutorialSteps=[
  {title:'Navigate the 3D world',text:'Click the center viewport to capture the mouse. Use WASD to move, Space and Ctrl for vertical movement, Shift to boost, and Escape to release the cursor.'},
  {title:'Select and inspect real entities',text:'Choose objects in the hierarchy or click geometry in the viewport. The Inspector edits the same authoritative entity data used by Codex.'},
  {title:'Create without losing context',text:'Use Create for geometry, terrain, paths, and lights. Use Materials for generated or imported surfaces with live tiling and PBR controls.'},
  {title:'Use the Project Hub',text:'Create, open, duplicate, archive, import, or restore projects from one place. OmniForge records recent projects and prevents concurrent project writes.'},
  {title:'Ask AI, then inspect evidence',text:'Queue work in AI development. Codex uses guarded scene tools and can request actual viewport captures instead of claiming changes it did not inspect.'}
];
function renderTutorial(){const step=tutorialSteps[tutorialIndex];ui.tutorialStepLabel.textContent=`GETTING STARTED · ${tutorialIndex+1}/${tutorialSteps.length}`;ui.tutorialTitle.textContent=step.title;ui.tutorialText.textContent=step.text;ui.tutorialProgress.innerHTML=tutorialSteps.map((_,index)=>`<i class="${index<=tutorialIndex?'active':''}"></i>`).join('');ui.tutorialBackButton.disabled=tutorialIndex===0;ui.tutorialNextButton.textContent=tutorialIndex===tutorialSteps.length-1?'Start creating':'Next';}
async function finishTutorial(){state.editor.firstUseComplete=true;ui.tutorialDialog.close();try{const next=await api('/api/editor',{method:'POST',body:{firstUseComplete:true}});state.engine.revision=next.engine.revision;}catch{}showToast('Workspace ready','success');if(state.settings?.integrations?.setupState==='pending')setTimeout(()=>{renderIntegrationSetup();ui.integrationSetupDialog.showModal();},350);}
function showTutorial(){tutorialIndex=0;renderTutorial();if(!ui.tutorialDialog.open)ui.tutorialDialog.showModal();}

function renderBreadcrumb(){
  const object=selectedObject();if(!object){ui.selectionBreadcrumb.innerHTML='<span>World</span><span class="separator">/</span><span class="current">No selection</span>';return;}
  const chain=[];let current=object;const seen=new Set();while(current&&!seen.has(current.id)){chain.unshift(current);seen.add(current.id);current=current.parentId?scene.objects.find(item=>item.id===current.parentId):null;}
  ui.selectionBreadcrumb.innerHTML=`<button data-breadcrumb-world type="button">${escapeHtml(scene.name)}</button>${chain.map((item,index)=>`<span class="separator">/</span><button class="${index===chain.length-1?'current':''}" data-breadcrumb-id="${escapeHtml(item.id)}" type="button">${escapeHtml(item.name)}</button>`).join('')}`;
  $('[data-breadcrumb-world]')?.addEventListener('click',frameAll);$$('[data-breadcrumb-id]').forEach(button=>button.addEventListener('click',()=>selectObject(button.dataset.breadcrumbId,true)));
}

function installSafeModeBanner(){
  if(!state?.engine?.safeMode)return;let banner=$('.safe-mode-banner');if(!banner){banner=document.createElement('div');banner.className='safe-mode-banner';banner.textContent='SAFE MODE · Play mode and automatic capture are disabled';ui.viewportWrap.appendChild(banner);}ui.autoCaptureToggle.checked=false;ui.autoCaptureToggle.disabled=true;
}

function renderSceneOptions() {
  ui.sceneSelect.innerHTML = state.scenes.map(item => `<option value="${escapeHtml(item.id)}" ${item.id===state.activeSceneId?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
  ui.sceneNameLabel.textContent = scene.name;
  ui.objectCount.textContent = `${scene.objects.length} object${scene.objects.length===1?'':'s'}`;
}

function renderHierarchy() {
  const q = ui.hierarchySearch.value.trim().toLowerCase();
  const filtered = scene.objects.filter(object => !q || `${object.name} ${object.type}`.toLowerCase().includes(q));
  ui.hierarchyList.innerHTML = filtered.length ? filtered.map(object => `
    <div class="hierarchy-item ${object.id===selectedId?'selected':''} ${object.visible?'':'hidden'}" data-object-id="${escapeHtml(object.id)}">
      <button class="visibility text-button" data-visibility-id="${escapeHtml(object.id)}" type="button" title="Toggle visibility">${object.visible?'◉':'○'}</button>
      <span class="object-icon">${objectIcon(object.type)}</span>
      <span class="object-name">${escapeHtml(object.name)}</span>
      ${object.locked?'<span title="Locked">⌑</span>':''}
    </div>`).join('') : `<div class="empty-state compact"><strong>No matching objects</strong><p>Change the search or create a new scene object.</p></div>`;
  $$('[data-object-id]').forEach(item => item.addEventListener('click', event => {
    if (event.target.closest('[data-visibility-id]')) return;
    selectObject(item.dataset.objectId, true);
  }));
  $$('[data-visibility-id]').forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    const object = scene.objects.find(o=>o.id===button.dataset.visibilityId);
    if (object) await patchObject(object.id,{visible:!object.visible});
  }));
}

function section(title, body, trailing='') {
  return `<section class="inspector-section"><div class="section-title"><span>${title}</span><span>${trailing}</span></div><div class="section-body">${body}</div></section>`;
}
function numberWrap(axis, value, path) {
  return `<div class="number-wrap ${axis.toLowerCase()}"><span>${axis}</span><input data-number-path="${path}" type="number" step="0.1" value="${Number(value).toFixed(2)}"></div>`;
}
function vectorField(label, values, root) {
  return `<div class="vector-field"><label>${label}</label>${numberWrap('X',values[0],`${root}.0`)}${numberWrap('Y',values[1],`${root}.1`)}${numberWrap('Z',values[2],`${root}.2`)}</div>`;
}
function propNumber(label,key,value,step='0.1',min='',max='') {
  return `<div class="property-row"><label>${label}</label><input data-property-key="${key}" type="number" step="${step}" ${min!==''?`min="${min}"`:''} ${max!==''?`max="${max}"`:''} value="${Number(value)}"></div>`;
}
function propCheck(label,key,value) {
  return `<div class="property-row"><label>${label}</label><input data-property-key="${key}" type="checkbox" ${value?'checked':''}></div>`;
}
function propColor(label,key,value) {
  return `<div class="property-row"><label>${label}</label><input data-property-key="${key}" type="color" value="${escapeHtml(value || '#ffffff')}"></div>`;
}

function materialSelect(value) {
  const options=(state.assets||[]).filter(asset=>asset.type==='material').map(asset=>`<option value="${escapeHtml(asset.id)}" ${asset.id===value?'selected':''}>${escapeHtml(asset.name)}</option>`).join('');
  return `<div class="property-row"><label>Material asset</label><select class="material-select" data-material-id><option value="">Procedural color</option>${options}</select></div>`;
}

function objectPropertiesHtml(object) {
  const p=object.properties || {};
  if (['box','sphere','cylinder','plane'].includes(object.type)) return materialSelect(p.materialId)+propColor('Material color','color',p.color)+propNumber('Metallic','metallic',p.metallic||0,'0.01',0,1)+propNumber('Roughness','roughness',p.roughness??.7,'0.01',0,1)+propCheck('Cast shadows','castsShadows',p.castsShadows!==false)+propCheck('Receive shadows','receivesShadows',p.receivesShadows!==false)+propCheck('Collision','collider',p.collider!==false);
  if (object.type==='terrain') return materialSelect(p.materialId)+propColor('Fallback color','color',p.color)+propNumber('World size','size',p.size||80,'1',10,500)+propNumber('Resolution','resolution',p.resolution||80,'1',4,192)+propNumber('Hill height','amplitude',p.amplitude||0,'0.25',0,40)+propNumber('Feature scale','frequency',p.frequency||.05,'0.005',.005,.5)+propNumber('Seed','seed',p.seed||0,'1')+propCheck('Receive shadows','receivesShadows',p.receivesShadows!==false)+propCheck('Collision','collider',p.collider!==false);
  if (object.type==='path') return materialSelect(p.materialId)+propColor('Fallback color','color',p.color)+propNumber('Path width','width',p.width||3,'0.1',.2,50)+propNumber('Blend shoulder','blendDistance',p.blendDistance??2.5,'0.1',.1,30)+propNumber('Edge irregularity','edgeNoise',p.edgeNoise??.5,'0.05',0,4)+propCheck('Conform to terrain','conformToTerrain',p.conformToTerrain!==false)+propCheck('Collision','collider',p.collider!==false)+propCheck('Navigation','navigation',p.navigation!==false)+propNumber('Nature clearance','vegetationExclusion',p.vegetationExclusion||0,'0.1',0,20)+`<div class="surface-blend-callout">The terrain remains authoritative. This path paints a soft, noise-broken material mask into the terrain instead of floating a hard-edged mesh above it.</div>`;
  if (object.type==='decal') return materialSelect(p.materialId)+propColor('Tint','color',p.color)+propNumber('Opacity','opacity',p.opacity??.85,'0.05',0,1)+propNumber('Projection depth','projectionDepth',p.projectionDepth??.25,'0.05',.001,20)+propNumber('Sort order','sortOrder',p.sortOrder||0,'1',-1000,1000)+`<div class="surface-blend-callout">This is an authored surface decal. Keep projection depth narrow and inspect nearby geometry before approval.</div>`;
  if (object.type==='directionalLight') return propColor('Light color','color',p.color)+propNumber('Intensity','intensity',p.intensity||1,'0.05',0,12)+propCheck('Cast shadows','castsShadows',p.castsShadows!==false);
  if (object.type==='pointLight') return propColor('Light color','color',p.color)+propNumber('Intensity','intensity',p.intensity||1,'0.1',0,50)+propNumber('Range','range',p.range||10,'0.5',.5,100);
  if (object.type==='model') {const asset=(state.assets||[]).find(item=>item.type==='model'&&item.id===p.assetId);return `<div class="model-object-reference"><div class="property-row"><label>Asset</label><span>${escapeHtml(asset?.name||p.assetId||'Missing')}</span></div><div class="property-row"><label>Asset ID</label><code>${escapeHtml(p.assetId||'')}</code></div>${propColor('Fallback color','color',p.color)}${propCheck('Collision','collider',Boolean(p.collider))}${propCheck('Cast shadows','castsShadows',p.castsShadows!==false)}${propCheck('Receive shadows','receivesShadows',p.receivesShadows!==false)}</div>`;}
  return `<p class="panel-hint">This entity has no renderer properties yet.</p>`;
}

function renderInspector() {
  const object = selectedObject();
  ui.duplicateButton.disabled = !object;
  ui.prefabButton.disabled = !object;
  ui.deleteButton.disabled = !object || object.locked;
  if (!object) {
    ui.inspectorTitle.textContent='Nothing selected';
    ui.inspectorContent.innerHTML='<div class="inspector-empty"><div><strong>Select a 3D object</strong><p>Click an object in the viewport or choose it from the hierarchy to edit its live scene data.</p></div></div>';
    return;
  }
  ui.inspectorTitle.textContent=object.name;
  const components=(object.components||[]).map((component,index)=>{
    const item=typeof component==='string'?{type:component}:component,type=item.type||'Component';
    let fields='';
    if(type==='RigidBody')fields=`<div class="component-fields">${propNumber('Mass',`component.${index}.mass`,item.mass??1,'0.1',.01,10000)}${propNumber('Restitution',`component.${index}.restitution`,item.restitution??.18,'0.01',0,1)}${propCheck('Use gravity',`component.${index}.useGravity`,item.useGravity!==false)}${propCheck('Kinematic',`component.${index}.kinematic`,Boolean(item.kinematic))}</div>`;
    if(type==='Collider')fields=`<div class="component-fields"><div class="property-row"><label>Shape</label><select data-component-path="${index}.shape"><option value="box" ${item.shape==='box'?'selected':''}>Box</option><option value="sphere" ${item.shape==='sphere'?'selected':''}>Sphere</option></select></div>${propCheck('Trigger',`component.${index}.trigger`,Boolean(item.trigger))}</div>`;
    if(type==='Rotator')fields=`<div class="component-fields">${propNumber('X speed',`component.${index}.x`,item.x??0,'1',-720,720)}${propNumber('Y speed',`component.${index}.y`,item.y??30,'1',-720,720)}${propNumber('Z speed',`component.${index}.z`,item.z??0,'1',-720,720)}</div>`;
    return `<div class="component-card"><div class="component-pill"><span>${escapeHtml(type)}</span><button data-remove-component="${index}" type="button">Remove</button></div>${fields}</div>`;
  }).join('');
  const pathPoints=object.type==='path'?section('Spline control points',`<div class="path-points">${(object.properties.points||[]).map((point,index)=>`<div class="path-point"><span>${index+1}</span><input data-path-point="${index}.0" type="number" step=".5" value="${point[0]}"><input data-path-point="${index}.1" type="number" step=".5" value="${point[1]}"><button data-remove-point="${index}" type="button">×</button></div>`).join('')}<button id="addPathPoint" class="path-add" type="button">Add control point</button></div>`,`${object.properties.points?.length||0} points`):'';
  ui.inspectorContent.innerHTML=`
    <div class="object-summary"><div class="object-type-icon">${objectIcon(object.type)}</div><div><input id="objectNameInput" value="${escapeHtml(object.name)}"><div class="object-meta">${escapeHtml(typeLabel(object.type))} · ${escapeHtml(object.id)}</div></div></div>
    ${object.properties?.prefabId?`<div class="prefab-pill"><span>Prefab instance</span><span>${escapeHtml(object.properties.prefabId)}</span></div>`:''}
    ${object.type==='model'&&object.properties?.previewOnly?`<div class="surface-blend-callout"><strong>Placement preview</strong><p>This model is temporary. Inspect grounding, scale, orientation, collision clearance, and composition before committing.</p><div class="material-tuner-actions"><button id="commitAssetPreviewButton" class="button primary" type="button">Commit placement</button><button id="cancelAssetPreviewButton" class="button subtle" type="button">Cancel preview</button></div></div>`:''}
    ${section('Transform',vectorField('Position',object.transform.position,'position')+vectorField('Rotation',object.transform.rotation,'rotation')+vectorField('Scale',object.transform.scale,'scale'),'WORLD')}
    ${section('Properties',objectPropertiesHtml(object),object.type.toUpperCase())}
    ${pathPoints}
    ${section('Components',`${components || '<p class="panel-hint">No extra behavior components.</p>'}<div class="component-add-row"><button id="addRigidbody" class="add-component" type="button">+ Rigidbody</button><button id="addCollider" class="add-component" type="button">+ Collider</button><button id="addRotator" class="add-component" type="button">+ Rotator</button></div>`,`${object.components?.length||0}`)}
    ${section('Entity flags',propCheck('Visible','__visible',object.visible)+propCheck('Locked','__locked',object.locked),'SCENE')}
  `;
  bindInspector(object);
  $('#commitAssetPreviewButton')?.addEventListener('click',()=>commitAssetPreview(object.id));
  $('#cancelAssetPreviewButton')?.addEventListener('click',()=>cancelAssetPreview(object.id));
}

function setNested(arrayRoot,index,value){ arrayRoot[Number(index)] = Number(value); }
function bindInspector(object) {
  $('#objectNameInput')?.addEventListener('change',event=>patchObject(object.id,{name:event.target.value.trim()||object.name}));
  $$('[data-number-path]').forEach(input=>input.addEventListener('change',event=>{
    const [root,index]=input.dataset.numberPath.split('.');
    const transform=deepClone(object.transform); setNested(transform[root],index,event.target.value);
    if(root==='scale') transform[root][Number(index)] = Math.max(.01,transform[root][Number(index)]);
    patchObject(object.id,{transform});
  }));
  $('[data-material-id]')?.addEventListener('change',event=>patchObject(object.id,{properties:{materialId:event.target.value||null}}));
  $$('[data-property-key]').forEach(input=>input.addEventListener('change',event=>{
    const key=input.dataset.propertyKey;if(key.startsWith('component.'))return;
    if(key==='__visible') return patchObject(object.id,{visible:input.checked});
    if(key==='__locked') return patchObject(object.id,{locked:input.checked});
    const value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
    patchObject(object.id,{properties:{[key]:value}});
  }));
  $$('[data-property-key^="component."]').forEach(input=>input.addEventListener('change',event=>{
    event.stopImmediatePropagation();
    const [,index,field]=input.dataset.propertyKey.split('.'),components=deepClone(object.components||[]),component=typeof components[Number(index)]==='string'?{type:components[Number(index)]}:components[Number(index)];
    component[field]=input.type==='checkbox'?input.checked:Number(input.value);components[Number(index)]=component;patchObject(object.id,{components});
  }));
  $$('[data-component-path]').forEach(input=>input.addEventListener('change',()=>{const [index,field]=input.dataset.componentPath.split('.'),components=deepClone(object.components||[]),component=typeof components[Number(index)]==='string'?{type:components[Number(index)]}:components[Number(index)];component[field]=input.value;components[Number(index)]=component;patchObject(object.id,{components});}));
  $$('[data-path-point]').forEach(input=>input.addEventListener('change',event=>{
    const [index,axis]=input.dataset.pathPoint.split('.');const points=deepClone(object.properties.points||[]);points[Number(index)][Number(axis)]=Number(input.value);patchObject(object.id,{properties:{points}});
  }));
  $$('[data-remove-point]').forEach(button=>button.addEventListener('click',()=>{
    const points=deepClone(object.properties.points||[]);if(points.length<=2)return showToast('A path needs at least two points.','error');points.splice(Number(button.dataset.removePoint),1);patchObject(object.id,{properties:{points}});
  }));
  $('#addPathPoint')?.addEventListener('click',()=>{
    const points=deepClone(object.properties.points||[]),last=points.at(-1)||[0,0],prev=points.at(-2)||[last[0]-8,last[1]];points.push([last[0]+(last[0]-prev[0]||8),last[1]+(last[1]-prev[1])]);patchObject(object.id,{properties:{points}});
  });
  $('#addRigidbody')?.addEventListener('click',()=>{
    const components=deepClone(object.components||[]);if(components.some(c=>(c.type||c)==='RigidBody'))return showToast('Rigidbody already added.');components.push({type:'RigidBody',mass:1,useGravity:true,kinematic:false,restitution:.18});patchObject(object.id,{components});
  });
  $('#addCollider')?.addEventListener('click',()=>{const components=deepClone(object.components||[]);if(components.some(c=>(c.type||c)==='Collider'))return showToast('Collider already added.');components.push({type:'Collider',shape:object.type==='sphere'?'sphere':'box',trigger:false});patchObject(object.id,{components});});
  $('#addRotator')?.addEventListener('click',()=>{const components=deepClone(object.components||[]);if(components.some(c=>(c.type||c)==='Rotator'))return showToast('Rotator already added.');components.push({type:'Rotator',x:0,y:30,z:0});patchObject(object.id,{components});});
  $$('[data-remove-component]').forEach(button=>button.addEventListener('click',()=>{const components=deepClone(object.components||[]);components.splice(Number(button.dataset.removeComponent),1);patchObject(object.id,{components});}));
}


function hashText(text) {
  let h=2166136261;
  for(const char of String(text)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function surfacePalette(category){
  return ({
    grass:[[45,73,38],[77,105,55],[111,119,62]],
    dirt:[[79,55,37],[116,80,49],[147,106,68]],
    sand:[[157,135,91],[196,174,123],[218,199,154]],
    gravel:[[72,72,69],[112,108,101],[157,151,139]],
    rock:[[58,64,67],[96,101,102],[139,139,132]],
    snow:[[178,190,198],[218,226,231],[246,247,245]],
    custom:[[65,78,70],[109,119,105],[154,151,126]]
  })[category] || [[65,78,70],[109,119,105],[154,151,126]];
}
function textureName(prompt,category){
  const words=String(prompt||'').replace(/[^a-z0-9 ]/gi,' ').trim().split(/\s+/).filter(Boolean).slice(0,4);
  return (words.length?words.join(' '):category).replace(/\b\w/g,char=>char.toUpperCase());
}
function makeCanvas(size){const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;return canvas;}
function tileNoise(x,y,size,seed,frequency=1){
  const ax=x/size*Math.PI*2,ay=y/size*Math.PI*2;
  const a=Math.sin(ax*frequency+seed*.00013)*Math.cos(ay*frequency*1.17-seed*.00019);
  const b=Math.sin((ax+ay)*frequency*.53+seed*.00031)*.48;
  const c=Math.cos((ax*.37-ay*.61)*frequency*1.91-seed*.00011)*.24;
  return (a+b+c)/1.72;
}
async function generateTextureMaps(prompt,category,size){
  await sleep(30);
  const seed=hashText(`${prompt}|${category}`),palette=surfacePalette(category),count=size*size,height=new Float32Array(count);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let h=tileNoise(x,y,size,seed,2)*.52+tileNoise(x,y,size,seed+17,7)*.26+tileNoise(x,y,size,seed+61,19)*.11;
    if(category==='gravel')h+=Math.max(0,tileNoise(x,y,size,seed+91,31)-.42)*.9;
    if(category==='grass')h+=Math.sin((x+y*.18)/size*Math.PI*2*34+seed)*.035;
    if(category==='sand')h+=Math.sin((x+y*.32)/size*Math.PI*2*8)*.09;
    height[y*size+x]=h;
  }
  const baseCanvas=makeCanvas(size),baseCtx=baseCanvas.getContext('2d'),base=baseCtx.createImageData(size,size);
  const normalCanvas=makeCanvas(size),normalCtx=normalCanvas.getContext('2d'),normal=normalCtx.createImageData(size,size);
  const roughCanvas=makeCanvas(size),roughCtx=roughCanvas.getContext('2d'),rough=roughCtx.createImageData(size,size);
  const aoCanvas=makeCanvas(size),aoCtx=aoCanvas.getContext('2d'),ao=aoCtx.createImageData(size,size);
  const mix=(a,b,t)=>a+(b-a)*t,wrap=v=>(v+size)%size;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const index=y*size+x,i=index*4,h=height[index],macro=tileNoise(x,y,size,seed+7,3)*.5+.5,micro=tileNoise(x,y,size,seed+29,23)*.5+.5;
    const t=clamp(macro*.66+micro*.34,0,1),left=t<.5?palette[0]:palette[1],right=t<.5?palette[1]:palette[2],lt=t<.5?t*2:(t-.5)*2;
    let r=mix(left[0],right[0],lt),g=mix(left[1],right[1],lt),b=mix(left[2],right[2],lt);
    if(category==='grass'){const blade=Math.max(0,Math.sin((x*1.7+y*.21+seed%97)*.22))*Math.max(0,micro-.53);g+=blade*32;r-=blade*8;}
    if(category==='gravel'&&h>.42){r+=25;g+=23;b+=20;}
    if(category==='snow'){const sparkle=Math.max(0,micro-.78)*55;r+=sparkle;g+=sparkle;b+=sparkle;}
    base.data.set([clamp(r,0,255),clamp(g,0,255),clamp(b,0,255),255],i);
    const dx=height[y*size+wrap(x+1)]-height[y*size+wrap(x-1)],dy=height[wrap(y+1)*size+x]-height[wrap(y-1)*size+x],strength=category==='rock'||category==='gravel'?4.5:2.4,normalLength=Math.hypot(dx*strength,dy*strength,1)||1;
    normal.data.set([(-dx*strength/normalLength*.5+.5)*255,(-dy*strength/normalLength*.5+.5)*255,(1/normalLength*.5+.5)*255,255],i);
    const roughValue=clamp((category==='snow'?.72:category==='rock'?.78:category==='grass'?.9:.84)+(micro-.5)*.12,0,1)*255;
    rough.data.set([roughValue,roughValue,roughValue,255],i);
    const aoValue=clamp(.88+h*.13,0,1)*255;ao.data.set([aoValue,aoValue,aoValue,255],i);
  }
  baseCtx.putImageData(base,0,0);normalCtx.putImageData(normal,0,0);roughCtx.putImageData(rough,0,0);aoCtx.putImageData(ao,0,0);
  return {baseColor:baseCanvas.toDataURL('image/png'),normal:normalCanvas.toDataURL('image/png'),roughness:roughCanvas.toDataURL('image/png'),ambientOcclusion:aoCanvas.toDataURL('image/png')};
}

function materialNumberControl(label,key,value,{step=.1,min='',max='',note=''}={}){
  return `<div class="material-control"><label>${escapeHtml(label)}${note?`<em>${escapeHtml(note)}</em>`:''}</label><input data-material-setting="${escapeHtml(key)}" type="number" step="${step}" ${min!==''?`min="${min}"`:''} ${max!==''?`max="${max}"`:''} value="${Number(value)}"></div>`;
}
function readNestedSetting(settings,key){
  if(key==='uvOffset.0')return settings.uvOffset?.[0]??0;
  if(key==='uvOffset.1')return settings.uvOffset?.[1]??0;
  return settings[key];
}
function writeNestedSetting(settings,key,value){
  if(key.startsWith('uvOffset.')){const index=Number(key.at(-1));settings.uvOffset=Array.isArray(settings.uvOffset)?[...settings.uvOffset]:[0,0];settings.uvOffset[index]=value;}
  else settings[key]=value;
}
function selectMaterial(materialId,persist=true){
  if(!(state.assets||[]).some(asset=>asset.id===materialId&&asset.type==='material'))return;
  selectedMaterialId=materialId;
  surfacePreviewBaseline=null;
  if(state.editor)state.editor.selectedMaterialId=materialId;
  renderMaterials();
  if(persist){markLocalMutation();api('/api/editor',{method:'POST',body:{selectedMaterialId:materialId}}).then(next=>{state.engine.revision=next.engine.revision;}).catch(()=>{});}
}
function surfaceControl(label,path,value,{step=.05,min=0,max=1,note=''}={}){
  return `<div class="material-control"><label>${escapeHtml(label)}${note?`<em>${escapeHtml(note)}</em>`:''}</label><input data-surface-setting="${escapeHtml(path)}" type="number" step="${step}" min="${min}" max="${max}" value="${Number(value)}"></div>`;
}
function surfaceColorControl(label,path,value){return `<div class="material-control"><label>${escapeHtml(label)}</label><input data-surface-color="${escapeHtml(path)}" type="color" value="${escapeHtml(value||'#ffffff')}"></div>`;}
function writeRecipeValue(recipe,path,value){const parts=path.split('.');let target=recipe;while(parts.length>1){const key=parts.shift();target[key]={...(target[key]||{})};target=target[key];}target[parts[0]]=value;recipe.updatedAt=new Date().toISOString();}
function setSurfaceStudioMode(mode,persist=true){
  const valid=['simple','advanced','processing','decals','atlas'],next=valid.includes(mode)?mode:'simple';
  $$('[data-surface-mode]').forEach(button=>button.classList.toggle('active',button.dataset.surfaceMode===next));
  $$('[data-surface-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.surfacePanel===next));
  if(state?.editor)state.editor.surfaceStudioMode=next;
  renderMaterialInspector();renderSurfaceWorkspace();
  if(persist)api('/api/editor',{method:'POST',body:{surfaceStudioMode:next}}).then(nextState=>state.engine.revision=nextState.engine.revision).catch(()=>{});
}
function surfaceGraphMarkup(recipe){
  const graph=recipe?.graph||{},nodes=graph.nodes||[];
  return `<div class="surface-graph"><div class="surface-graph-header"><span>Recipe graph v${Number(graph.version||1)}</span><span>${nodes.length} nodes</span></div><div class="surface-graph-nodes">${nodes.map(node=>`<label class="surface-node ${node.enabled===false?'disabled':''}"><input data-surface-node-enabled="${escapeHtml(node.id)}" type="checkbox" ${node.enabled===false?'':'checked'}><span><strong>${escapeHtml(node.label||node.type)}</strong><small>${escapeHtml(node.type)}</small></span><input data-surface-node-value="${escapeHtml(node.id)}" type="number" min="0" max="2" step=".05" value="${Number(node.value??1)}"></label>`).join('')}</div></div>`;
}
function surfaceRecipeMarkup(recipe){
  if(!recipe)return '<div class="material-helper">No surface recipe is linked to this material. Reopen the project once to migrate it into the recipe system.</div>';
  const l=recipe.layers||{},m=recipe.masks||{},a=recipe.advanced||{},c=recipe.layerColors||{},warnings=[...(recipe.validation?.errors||[]),...(recipe.validation?.warnings||[])],advanced=state?.editor?.surfaceStudioMode==='advanced';
  const simpleControls=`${surfaceControl('Dirt','layers.dirt',l.dirt)}${surfaceControl('Moss','layers.moss',l.moss)}${surfaceControl('Wetness','layers.wetness',l.wetness)}${surfaceControl('Snow','layers.snow',l.snow)}${surfaceControl('Damage','layers.damage',l.damage)}${surfaceControl('Color variation','layers.colorVariation',l.colorVariation)}${surfaceControl('Roughness variation','layers.roughnessVariation',l.roughnessVariation)}${surfaceControl('Detail amount','layers.detailAmount',l.detailAmount,{step:.05,min:0,max:2})}`;
  const advancedControls=`${surfaceControl('Detail scale','layers.detailScale',l.detailScale,{step:.1,min:.05,max:100})}${surfaceControl('Upward mask','masks.upwardFacing',m.upwardFacing)}${surfaceControl('Downward mask','masks.downwardFacing',m.downwardFacing)}${surfaceControl('Slope mask','masks.slope',m.slope)}${surfaceControl('Cavity mask','masks.cavities',m.cavities)}${surfaceControl('Convex-edge mask','masks.convexEdges',m.convexEdges)}${surfaceControl('Ground contact','masks.groundContact',m.groundContact)}${surfaceControl('Water contact','masks.waterContact',m.waterContact)}${surfaceControl('Sun exposure','masks.sunExposure',m.sunExposure)}${surfaceControl('Shade','masks.shade',m.shade)}${surfaceControl('Wind-facing','masks.windFacing',m.windFacing)}${surfaceControl('Distance from paths','masks.distanceFromPaths',m.distanceFromPaths)}${surfaceControl('Distance from structures','masks.distanceFromStructures',m.distanceFromStructures)}${surfaceControl('Macro scale','advanced.macroScale',a.macroScale,{step:.5,min:.1,max:500})}${surfaceControl('Graph detail scale','advanced.detailScale',a.detailScale,{step:.1,min:.05,max:100})}${surfaceControl('Blend sharpness','advanced.blendSharpness',a.blendSharpness,{step:.05,min:.05,max:8})}${surfaceControl('Parallax steps','advanced.parallaxSteps',a.parallaxSteps,{step:1,min:0,max:32})}`;
  return `<section class="surface-recipe-tuner" data-surface-recipe="${escapeHtml(recipe.id)}">
    <div class="material-divider"><span>SURFACE RECIPE v${Number(recipe.schemaVersion||1)}</span><span id="surfaceRecipeStatus" class="material-saved">${surfacePreviewBaseline?'Preview':recipe.compilation?.state==='ready'?'Compiled':'Committed'}</span></div>
    <div class="material-helper"><strong>${escapeHtml(recipe.name)}</strong><br>${advanced?'Advanced mode edits deterministic masks, graph nodes, layer colors, projection, and environment response.':'Simple mode exposes the main art controls. Switch to Advanced for deterministic world masks and graph settings.'}</div>
    <div class="material-control-grid">${simpleControls}${advanced?advancedControls:''}</div>
    ${advanced?`<div class="material-divider"><span>LAYER COLORS</span><span>LINEAR BLEND</span></div><div class="material-control-grid">${surfaceColorControl('Dirt tint','layerColors.dirt',c.dirt)}${surfaceColorControl('Moss tint','layerColors.moss',c.moss)}${surfaceColorControl('Snow tint','layerColors.snow',c.snow)}${surfaceColorControl('Damage tint','layerColors.damage',c.damage)}</div>${surfaceGraphMarkup(recipe)}`:''}
    ${warnings.length?`<div class="surface-warning">${warnings.map(escapeHtml).join('<br>')}</div>`:'<div class="surface-valid">Recipe validation currently passes.</div>'}
    <div class="surface-compilation">${recipe.compilation?`<strong>${escapeHtml(recipe.compilation.state)}</strong><code>${escapeHtml(recipe.compilation.key||'')}</code><small>${escapeHtml(recipe.compilation.hash?.slice(0,20)||'')}</small>`:'<span>Not compiled yet</span>'}</div>
    <div class="material-tuner-actions"><button id="commitSurfaceRecipeButton" class="button primary" type="button" ${surfacePreviewBaseline?'':'disabled'}>Commit preview</button><button id="revertSurfaceRecipeButton" class="button subtle" type="button" ${surfacePreviewBaseline?'':'disabled'}>Revert</button><button id="compileSurfaceRecipeButton" class="button subtle" type="button">Compile</button><button id="variantSurfaceRecipeButton" class="button subtle" type="button">Create recipe variant</button></div>
  </section>`;
}
async function commitSurfaceRecipe(){const recipe=selectedSurfaceRecipe();if(!recipe||!surfacePreviewBaseline)return;try{const payload=await api(`/api/surface-recipe/${encodeURIComponent(recipe.id)}`,{method:'PATCH',body:{name:recipe.name,layers:recipe.layers,layerColors:recipe.layerColors,masks:recipe.masks,advanced:recipe.advanced,graph:recipe.graph,weatherResponse:recipe.weatherResponse,tags:recipe.tags}});surfacePreviewBaseline=null;applyState(payload.state,{forceSelection:false});selectMaterial(recipe.baseMaterialId,false);showToast('Surface recipe committed and compiled','success');}catch(error){handleError(error,'Surface recipe could not be committed');}}
function revertSurfaceRecipe(){const recipe=selectedSurfaceRecipe();if(!recipe||!surfacePreviewBaseline)return;const index=state.assets.findIndex(asset=>asset.id===recipe.id);state.assets[index]=surfacePreviewBaseline;surfacePreviewBaseline=null;renderer?.setAssets(state.assets);renderMaterials();showToast('Surface preview reverted','success');}
async function compileSelectedSurfaceRecipe(){const recipe=selectedSurfaceRecipe();if(!recipe)return;try{const payload=await api(`/api/surface-recipe/${encodeURIComponent(recipe.id)}/compile`,{method:'POST',body:{}});applyState(payload.state,{forceSelection:false});selectMaterial(recipe.baseMaterialId,false);showToast(`Compiled ${recipe.name}`,'success');}catch(error){handleError(error,'Surface compilation failed');}}
async function createSurfaceRecipeVariant(){const recipe=selectedSurfaceRecipe(),material=selectedMaterial();if(!recipe||!material)return;try{const payload=await api('/api/surface-recipe/variant',{method:'POST',body:{recipeId:recipe.id,name:`${recipe.name} Variant`,layers:recipe.layers,layerColors:recipe.layerColors,masks:recipe.masks,advanced:recipe.advanced,graph:recipe.graph,assignMaterialId:material.id}});surfacePreviewBaseline=null;applyState(payload.state,{forceSelection:false});selectMaterial(material.id,false);showToast('Surface recipe variant created and assigned','success');}catch(error){handleError(error,'Surface recipe variant failed');}}

function renderMaterialInspector(){
  if(!ui.materialInspector)return;
  const asset=selectedMaterial();
  if(!asset){ui.materialInspector.innerHTML='<div class="material-inspector-empty">Select a project material to tune its tiling, orientation, surface response, and height detail.</div>';return;}
  const settings={worldScale:3,uvRotation:0,uvOffset:[0,0],roughness:.8,roughnessMultiplier:1,metallic:0,normalStrength:1,aoStrength:1,heightStrength:.035,...(asset.settings||{})};
  const mapNames=['baseColor','normal','roughness','ambientOcclusion','height'];
  const mapBadges=mapNames.map(name=>`<span class="${asset.maps?.[name]?'':'missing'}">${name==='ambientOcclusion'?'AO':name}</span>`).join('');
  ui.materialInspector.innerHTML=`<section class="material-tuner" data-tuned-material="${escapeHtml(asset.id)}">
    <div class="material-tuner-header"><div><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.id)}<br>${escapeHtml(asset.license||'License not recorded')}</small></div><span id="materialSaveStatus" class="material-saved">Saved</span></div>
    <div class="material-map-badges">${mapBadges}</div>
    <div class="material-helper"><strong>Tiling:</strong> Tile size is measured in world units. A smaller value repeats the texture more often; a larger value makes each texture tile cover more ground.</div>
    <div class="material-control-grid">
      ${materialNumberControl('Tile size','worldScale',settings.worldScale,{step:.05,min:.05,max:100,note:'world units'})}
      ${materialNumberControl('UV rotation','uvRotation',settings.uvRotation,{step:1,min:-3600,max:3600,note:'degrees'})}
      ${materialNumberControl('Offset X','uvOffset.0',settings.uvOffset?.[0]??0,{step:.05,min:-1000,max:1000})}
      ${materialNumberControl('Offset Z','uvOffset.1',settings.uvOffset?.[1]??0,{step:.05,min:-1000,max:1000})}
      ${materialNumberControl('Base roughness','roughness',settings.roughness,{step:.01,min:0,max:1})}
      ${materialNumberControl('Roughness map','roughnessMultiplier',settings.roughnessMultiplier,{step:.05,min:.1,max:2,note:'multiplier'})}
      ${materialNumberControl('Metallic','metallic',settings.metallic,{step:.01,min:0,max:1})}
      ${materialNumberControl('Normal strength','normalStrength',settings.normalStrength,{step:.05,min:0,max:4})}
      ${materialNumberControl('AO strength','aoStrength',settings.aoStrength,{step:.05,min:0,max:2})}
      ${materialNumberControl('Height depth','heightStrength',settings.heightStrength,{step:.005,min:0,max:.25,note:'parallax'})}
    </div>
    <div class="material-helper">Changes preview immediately in the live 3D viewport and auto-save to the authoritative material asset. They affect every object using this material; create a variant for isolated tuning.</div>
    <div class="material-tuner-actions"><button id="saveMaterialSettingsButton" class="button primary" type="button">Save settings</button><button id="createMaterialVariantButton" class="button subtle" type="button">Create variant</button></div>
    ${surfaceRecipeMarkup(selectedSurfaceRecipe())}
  </section>`;
  $$('[data-material-setting]').forEach(input=>input.addEventListener('input',()=>{
    const current=selectedMaterial();if(!current)return;
    const value=Number(input.value);if(!Number.isFinite(value))return;
    current.settings={...(current.settings||{}),uvOffset:Array.isArray(current.settings?.uvOffset)?[...current.settings.uvOffset]:[0,0]};
    writeNestedSetting(current.settings,input.dataset.materialSetting,value);
    renderer?.setAssets(state.assets);
    markLocalMutation();
    const status=$('#materialSaveStatus');if(status){status.textContent='Unsaved';status.className='material-dirty';}
    clearTimeout(materialSaveTimer);materialSaveTimer=setTimeout(()=>saveMaterialSettings(current.id),420);
  }));
  const markSurfacePreview=()=>{renderer?.setAssets(state.assets);markLocalMutation();const status=$('#surfaceRecipeStatus');if(status){status.textContent='Preview';status.className='material-dirty';}$('#commitSurfaceRecipeButton')?.removeAttribute('disabled');$('#revertSurfaceRecipeButton')?.removeAttribute('disabled');renderSurfaceWorkspace();};
  $$('[data-surface-setting]').forEach(input=>input.addEventListener('input',()=>{const recipe=selectedSurfaceRecipe();if(!recipe)return;const value=Number(input.value);if(!Number.isFinite(value))return;if(!surfacePreviewBaseline)surfacePreviewBaseline=deepClone(recipe);writeRecipeValue(recipe,input.dataset.surfaceSetting,value);markSurfacePreview();}));
  $$('[data-surface-color]').forEach(input=>input.addEventListener('input',()=>{const recipe=selectedSurfaceRecipe();if(!recipe)return;if(!surfacePreviewBaseline)surfacePreviewBaseline=deepClone(recipe);writeRecipeValue(recipe,input.dataset.surfaceColor,input.value);markSurfacePreview();}));
  $$('[data-surface-node-enabled]').forEach(input=>input.addEventListener('change',()=>{const recipe=selectedSurfaceRecipe(),node=recipe?.graph?.nodes?.find(item=>item.id===input.dataset.surfaceNodeEnabled);if(!node)return;if(!surfacePreviewBaseline)surfacePreviewBaseline=deepClone(recipe);node.enabled=input.checked;markSurfacePreview();renderMaterialInspector();}));
  $$('[data-surface-node-value]').forEach(input=>input.addEventListener('input',()=>{const recipe=selectedSurfaceRecipe(),node=recipe?.graph?.nodes?.find(item=>item.id===input.dataset.surfaceNodeValue),value=Number(input.value);if(!node||!Number.isFinite(value))return;if(!surfacePreviewBaseline)surfacePreviewBaseline=deepClone(recipe);node.value=value;markSurfacePreview();}));
  $('#commitSurfaceRecipeButton')?.addEventListener('click',commitSurfaceRecipe);$('#revertSurfaceRecipeButton')?.addEventListener('click',revertSurfaceRecipe);$('#compileSurfaceRecipeButton')?.addEventListener('click',compileSelectedSurfaceRecipe);$('#variantSurfaceRecipeButton')?.addEventListener('click',createSurfaceRecipeVariant);
  $('#saveMaterialSettingsButton')?.addEventListener('click',()=>saveMaterialSettings(asset.id,true));
  $('#createMaterialVariantButton')?.addEventListener('click',()=>createMaterialVariant(asset.id));
}
async function saveMaterialSettings(materialId,announce=false){
  const asset=(state.assets||[]).find(item=>item.id===materialId&&item.type==='material');if(!asset)return;
  const status=$('#materialSaveStatus');if(status){status.textContent='Saving…';status.className='material-dirty';}
  try{
    const payload=await api(`/api/material/${encodeURIComponent(materialId)}`,{method:'PATCH',body:{settings:asset.settings}});
    selectedMaterialId=payload.asset.id;applyState(payload.state,{forceSelection:false});
    if(announce)showToast(`Saved ${payload.asset.name} material settings`,'success');
  }catch(error){if(status){status.textContent='Save failed';status.className='material-dirty';}showToast(error.message,'error');}
}
async function createMaterialVariant(materialId){
  const source=(state.assets||[]).find(item=>item.id===materialId&&item.type==='material');if(!source)return;
  try{
    const payload=await api('/api/material/variant',{method:'POST',body:{materialId,name:`${source.name} Variant`,settings:source.settings}});
    selectedMaterialId=payload.asset.id;applyState(payload.state,{forceSelection:false});showToast(`Created ${payload.asset.name}`,'success');
  }catch(error){showToast(error.message,'error');}
}
function assetThumbnailUrl(asset){const file=asset?.thumbnail||asset?.preview;if(!file)return '';return `/${String(file).replace(/^\/+/, '')}`;}
function formatBytes(bytes){const value=Number(bytes||0);if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`;}
function formatDimensions(values){return Array.isArray(values)?values.map(value=>Number(value||0).toFixed(2)).join(' × '):'Unknown';}
function assetStateClass(asset){if(asset.validation?.state==='failed')return 'failed';return asset.approvalState||asset.status||'draft';}
function selectModelAsset(assetId,persist=true){if(!(state.assets||[]).some(asset=>asset.id===assetId&&asset.type==='model'))return;selectedAssetId=assetId;if(state.editor)state.editor.selectedAssetId=assetId;renderModelAssets();if(persist)api('/api/editor',{method:'POST',body:{selectedAssetId:assetId,assetView:'library'}}).then(next=>state.engine.revision=next.engine.revision).catch(()=>{});}
function healthList(items,className='warning',empty='None reported.'){const values=Array.isArray(items)?items:[];return values.length?`<ul class="asset-health-list">${values.map(item=>`<li class="${className}">${escapeHtml(item)}</li>`).join('')}</ul>`:`<p class="panel-hint">${escapeHtml(empty)}</p>`;}
function renderModelAssetInspector(){
  if(!ui.modelAssetInspector)return;const asset=selectedModelAsset();if(!asset){ui.modelAssetInspector.innerHTML='<div class="material-empty">Import or select a 3D asset to inspect geometry, provenance, collision, LODs, validation, and scene usages.</div>';return;}
  const health=asset.health||{},validation=asset.validation||{},stateClass=assetStateClass(asset),usages=asset.sceneUsages||[],canRender=Boolean(asset.canonicalFile&&asset.meshUrl),approved=asset.approvalState==='approved',needsRebuild=Number(asset.canonicalImporterVersion||0)<2||health.nodeTransformsApplied!==true;
  ui.modelAssetInspector.innerHTML=`<article class="asset-health-report">
    <div class="asset-health-header"><div><h3>${escapeHtml(asset.name)}</h3><small>${escapeHtml(asset.category||'model')} · ${escapeHtml(asset.id)}</small></div><span class="asset-state ${escapeHtml(stateClass)}">${escapeHtml((asset.approvalState||validation.state||'draft').toUpperCase())}</span></div>
    <div class="asset-metrics">
      <div class="asset-metric"><span>Dimensions</span><strong>${escapeHtml(formatDimensions(health.dimensions||asset.bounds?.size))} m</strong></div>
      <div class="asset-metric"><span>Geometry</span><strong>${Number(asset.triangleCount||0).toLocaleString()} tris</strong></div>
      <div class="asset-metric"><span>Vertices</span><strong>${Number(asset.vertexCount||0).toLocaleString()}</strong></div>
      <div class="asset-metric"><span>Source size</span><strong>${escapeHtml(formatBytes(asset.fileBytes))}</strong></div>
      <div class="asset-metric"><span>Materials</span><strong>${Number(health.materialCount||asset.materialSlots?.length||0)}</strong></div>
      <div class="asset-metric"><span>LODs / Collision</span><strong>${asset.lods?.length||0} / ${escapeHtml(asset.collisionStatus||'missing')}</strong></div>
      <div class="asset-metric"><span>Scene instances</span><strong>${Number(health.meshInstanceCount||1)}</strong></div>
      <div class="asset-metric"><span>Node transforms</span><strong>${health.nodeTransformsApplied===false?'Review':'Applied'}</strong></div>
    </div>
    ${needsRebuild?`<div class="asset-import-rebuild-callout"><strong>Import upgrade recommended</strong><span>This asset was processed before the hierarchy-aware importer. Rebuild it from the preserved original to apply nested node transforms and material groups.</span><button class="primary" data-asset-action="rebuild" data-asset-id="${escapeHtml(asset.id)}" type="button">Rebuild import</button></div>`:''}
    <div class="asset-health-section"><h4>Blocking validation</h4>${healthList(validation.errors||health.blocking,'error','No blocking validation failures.')}</div>
    <div class="asset-health-section"><h4>Warnings</h4>${healthList(validation.warnings||health.warnings,'warning','No current warnings.')}</div>
    <div class="asset-health-section"><h4>Recommended repairs</h4>${healthList(health.recommendedRepairs,'warning','No automatic repair is currently recommended.')}</div>
    <div class="asset-health-section"><h4>Scene usages</h4>${usages.length?`<ul class="asset-health-list">${usages.map(usage=>`<li>${escapeHtml(usage.sceneName)} / ${escapeHtml(usage.objectName)}</li>`).join('')}</ul>`:'<p class="panel-hint">Not placed in a scene.</p>'}</div>
    <div class="asset-health-section"><h4>Authoritative recipe</h4><div class="asset-provenance">Recipe: ${escapeHtml(asset.assetRecipeId||'Pending migration')}<br>Canonical: ${escapeHtml(asset.canonicalFile||'Unavailable')}<br>Source relationship: ${escapeHtml(asset.sourceAssetId||'Original source')}</div></div>
    <div class="asset-health-section"><h4>Provenance</h4><div class="asset-provenance">Source: ${escapeHtml(asset.provenance?.source||'Unknown')}<br>Creator: ${escapeHtml(asset.provenance?.creator||'Unknown')}<br>License: ${escapeHtml(asset.provenance?.license||'Unresolved')}<br>SHA-256: ${escapeHtml(asset.checksum||'Unknown')}<br>Original: ${escapeHtml(asset.provenance?.originalFileName||asset.sourceFile||'Unknown')}</div></div>
    <div class="asset-processing-actions">
      <button class="primary" data-asset-action="${approved?'place':'preview'}" data-asset-id="${escapeHtml(asset.id)}" type="button" ${canRender?'':'disabled'}>${approved?'Place in scene':'Preview placement'}</button>
      <button data-asset-action="approve" data-asset-id="${escapeHtml(asset.id)}" type="button" ${!canRender||validation.state==='failed'?'disabled':''}>${approved?'Return to draft':'Approve'}</button>
      <button data-asset-action="rebuild" data-asset-id="${escapeHtml(asset.id)}" type="button">Rebuild import</button>
      <button data-asset-action="repair" data-asset-id="${escapeHtml(asset.id)}" type="button" ${canRender?'':'disabled'}>Repair safe issues</button>
      <button data-asset-action="collision" data-asset-id="${escapeHtml(asset.id)}" type="button" ${asset.bounds?'':'disabled'}>Generate collision</button>
      <button data-asset-action="lods" data-asset-id="${escapeHtml(asset.id)}" type="button" ${canRender?'':'disabled'}>Generate 2 LODs</button>
      <button data-asset-action="thumbnail" data-asset-id="${escapeHtml(asset.id)}" type="button" ${canRender?'':'disabled'}>Capture thumbnail</button>
    </div>
  </article>`;
  $$('[data-asset-action]').forEach(button=>button.addEventListener('click',()=>runAssetAction(button.dataset.assetAction,button.dataset.assetId)));
}
function renderModelAssets(){
  if(!ui.modelAssetList)return;const all=(state.assets||[]).filter(asset=>asset.type==='model'),query=ui.assetSearchInput?.value.trim().toLowerCase()||'',status=ui.assetStatusFilter?.value||'';const assets=all.filter(asset=>(!query||JSON.stringify(asset).toLowerCase().includes(query))&&(!status||asset.approvalState===status||asset.status===status));ui.modelAssetCount.textContent=String(all.length);if(!all.some(asset=>asset.id===selectedAssetId))selectedAssetId=all[0]?.id||null;
  ui.modelAssetList.innerHTML=assets.length?assets.map(asset=>{const thumb=assetThumbnailUrl(asset),stateClass=assetStateClass(asset);return `<article class="model-asset-card ${asset.id===selectedAssetId?'selected':''}" data-model-asset="${escapeHtml(asset.id)}"><div class="model-asset-thumb" ${thumb?`style="background-image:url('${escapeHtml(thumb)}')"`:''}>${thumb?'':'◆'}</div><div class="model-asset-body"><div class="model-asset-title"><strong>${escapeHtml(asset.name)}</strong><span class="asset-state ${escapeHtml(stateClass)}">${escapeHtml((asset.approvalState||asset.status||'draft').toUpperCase())}</span></div><div class="model-asset-meta"><span>${escapeHtml(asset.category||'model')}</span><span>${Number(asset.triangleCount||0).toLocaleString()} tris</span><span>${asset.lods?.length||0} LOD</span><span>${escapeHtml(asset.collisionStatus||'missing')} collision</span></div><div class="model-asset-actions"><button data-card-asset-action="${asset.approvalState==='approved'?'place':'preview'}" data-asset-id="${escapeHtml(asset.id)}" type="button">${asset.approvalState==='approved'?'Place':'Preview'}</button><button data-card-asset-action="inspect" data-asset-id="${escapeHtml(asset.id)}" type="button">Health</button></div></div></article>`;}).join(''):'<div class="material-empty">No matching 3D assets. Import a GLB or embedded glTF to create the canonical asset library.</div>';
  $$('[data-model-asset]').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('button'))return;selectModelAsset(card.dataset.modelAsset);}));
  $$('[data-card-asset-action]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();selectModelAsset(button.dataset.assetId,false);if(button.dataset.cardAssetAction!=='inspect')runAssetAction(button.dataset.cardAssetAction,button.dataset.assetId);else renderModelAssetInspector();}));
  renderModelAssetInspector();
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('File read failed.'));reader.readAsDataURL(file);});}
async function importSelectedModel(){
  const file=pendingModelFile;if(!file)return showToast('Choose a GLB or glTF first.','error');ui.importModelButton.disabled=true;ui.modelImportStatus.textContent='Reading and validating…';
  try{const dataUrl=await fileToDataUrl(file),payload=await api('/api/asset/import',{method:'POST',body:{fileName:file.name,name:file.name.replace(/\.[^.]+$/,''),dataUrl,category:ui.modelCategory.value,license:ui.modelLicense.value,creator:'User',source:'Local file import',tags:[ui.modelCategory.value]}});pendingModelFile=null;ui.modelImportInput.value='';ui.modelImportStatus.textContent=`Imported ${payload.asset.name}`;selectedAssetId=payload.asset.id;applyState(payload.state,{forceSelection:false});document.querySelector('[data-left-tab="assets"]')?.click();setAssetWorkspaceView('models',true);showToast(payload.asset.validation?.state==='failed'?'Imported to Unvalidated Assets':'3D asset imported','success');}
  catch(error){handleError(error,'3D asset import failed');ui.modelImportStatus.textContent='Import failed';}finally{ui.importModelButton.disabled=!pendingModelFile;}
}
async function previewAsset(assetId){const payload=await api('/api/asset/place-preview',{method:'POST',body:{assetId}});applyState(payload.state,{forceSelection:true});focusSelected();showToast('Placement preview created. Commit or cancel from the Inspector.','success');return payload.object;}
async function placeAsset(assetId){const payload=await api('/api/asset/place',{method:'POST',body:{assetId}});applyState(payload.state,{forceSelection:true});focusSelected();scheduleAutoCapture(`Placed ${payload.object.name}`);showToast('Asset placed in the real scene','success');return payload.object;}
async function captureAssetThumbnail(assetId){let object=scene.objects.find(item=>item.type==='model'&&item.properties?.assetId===assetId);if(!object)object=await previewAsset(assetId);await selectObject(object.id,false);focusSelected();await sleep(500);const payload=await api('/api/asset/thumbnail',{method:'POST',body:{assetId,dataUrl:ui.viewport.toDataURL('image/png')}});selectedAssetId=assetId;applyState(payload.state,{forceSelection:false});showToast('Asset thumbnail captured from the real viewport','success');}
async function runAssetAction(action,assetId){
  try{
    if(action==='inspect'){selectModelAsset(assetId);return;}
    if(action==='preview'){await previewAsset(assetId);return;}
    if(action==='place'){await placeAsset(assetId);return;}
    if(action==='thumbnail'){await captureAssetThumbnail(assetId);return;}
    if(action==='approve'){const asset=(state.assets||[]).find(item=>item.id===assetId),payload=await api('/api/asset/approve',{method:'POST',body:{assetId,approved:asset?.approvalState!=='approved'}});selectedAssetId=assetId;applyState(payload.state,{forceSelection:false});showToast(payload.asset.approvalState==='approved'?'Asset approved':'Asset returned to draft','success');return;}
    if(action==='rebuild'){const payload=await api('/api/asset/rebuild',{method:'POST',body:{assetId}});selectedAssetId=payload.asset.id;applyState(payload.state,{forceSelection:false});renderer?.setAssets(payload.state.assets);showToast('Canonical import rebuilt from the preserved source','success');return;}
    if(action==='repair'){const payload=await api('/api/asset/repair',{method:'POST',body:{assetId,settings:{centerPivot:true,recalculateNormals:true,unitScale:1}}});selectedAssetId=payload.asset.id;applyState(payload.state,{forceSelection:false});showToast('Reversible repair derivative created','success');return;}
    if(action==='collision'){const payload=await api('/api/asset/collision',{method:'POST',body:{assetId}});selectedAssetId=assetId;applyState(payload.state,{forceSelection:false});showToast('Bounds collision generated; inspect clearance before approval','success');return;}
    if(action==='lods'){const payload=await api('/api/asset/lods',{method:'POST',body:{assetId,ratios:[.5,.2]}});selectedAssetId=assetId;applyState(payload.state,{forceSelection:false});showToast('Two LOD derivatives generated','success');return;}
  }catch(error){handleError(error,'Asset operation failed');}
}
async function commitAssetPreview(objectId){try{const payload=await api('/api/asset/commit-preview',{method:'POST',body:{objectId}});applyState(payload.state,{forceSelection:true});scheduleAutoCapture(`Committed ${payload.object.name}`);showToast('Asset placement committed','success');}catch(error){handleError(error,'Placement commit failed');}}
async function cancelAssetPreview(objectId){try{const next=await api('/api/asset/cancel-preview',{method:'POST',body:{objectId}});applyState(next,{forceSelection:true});showToast('Asset placement preview cancelled','success');}catch(error){handleError(error,'Placement cancellation failed');}}



function marketplaceProviders(){return (state?.providers||[]).filter(provider=>provider.enabled&&(provider.capabilities||[]).includes('asset-search')&&!provider.id.startsWith('local-'));}
function renderMarketplaceProviders(){
  if(!ui.marketplaceProviderSelect)return;const providers=marketplaceProviders(),current=ui.marketplaceProviderSelect.value;
  ui.marketplaceProviderSelect.innerHTML=providers.map(provider=>`<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.displayName)}</option>`).join('');
  if(providers.some(provider=>provider.id===current))ui.marketplaceProviderSelect.value=current;else if(providers[0])ui.marketplaceProviderSelect.value=providers[0].id;
  const provider=providers.find(item=>item.id===ui.marketplaceProviderSelect.value);if(ui.marketplaceStatusBadge)ui.marketplaceStatusBadge.textContent=provider?.status?.state?.toUpperCase()||'OFFLINE';
  if(ui.marketplaceAttribution)ui.marketplaceAttribution.textContent=provider?.id==='poly-haven'?'Assets are supplied by Poly Haven. Downloaded assets are CC0; OmniForge records source and creator metadata.':provider?.id==='ambientcg'?'ambientCG assets are CC0. OmniForge shows the source and imports supported PBR packages through staging.':provider?`${provider.displayName} is a curated CC0 catalog. Packs without a stable direct file link open the official source page for selective download.`:'Enable a marketplace provider in Integrations.';
}
function renderMarketplaceResults(){
  if(!ui.marketplaceResults)return;ui.marketplaceResultCount.textContent=String(marketplaceSearchResults.length);
  if(marketplaceLoading){ui.marketplaceResults.innerHTML='<div class="material-empty">Searching provider and cached metadata…</div>';return;}
  ui.marketplaceResults.innerHTML=marketplaceSearchResults.length?marketplaceSearchResults.map(asset=>`<article class="marketplace-card ${selectedMarketplaceAsset?.id===asset.id&&selectedMarketplaceAsset?.providerId===asset.providerId?'selected':''}" data-marketplace-select="${escapeHtml(asset.providerId)}::${escapeHtml(asset.id)}"><div class="marketplace-thumb">${asset.thumbnail?`<img src="${escapeHtml(asset.thumbnail)}" alt="" loading="lazy">`:'<span>◆</span>'}</div><div class="marketplace-card-body"><div class="marketplace-card-title"><strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(asset.license||'Review')}</span></div><small>${escapeHtml(asset.providerId)} · ${escapeHtml(asset.category||asset.kind||'asset')}</small><p>${escapeHtml(asset.description||'No provider description.')}</p><div class="marketplace-tags">${(asset.tags||[]).slice(0,5).map(tag=>`<span>${escapeHtml(tag)}</span>`).join('')}</div></div></article>`).join(''):'<div class="material-empty">No matching assets were returned. Try a broader search or another provider.</div>';
  $$('[data-marketplace-select]').forEach(card=>card.addEventListener('click',()=>{const [providerId,...rest]=card.dataset.marketplaceSelect.split('::');loadMarketplaceDetails(providerId,rest.join('::'));}));
}
function renderMarketplaceInspector(){
  if(!ui.marketplaceInspector)return;const asset=selectedMarketplaceAsset;
  if(!asset){ui.marketplaceInspector.innerHTML='<div class="material-empty">Select a marketplace result to inspect its source, license, download choices, and import support.</div>';return;}
  const choices=asset.downloadChoices||[],automated=choices.length>0,source=asset.sourcePage?`<a class="button subtle marketplace-link" href="${escapeHtml(asset.sourcePage)}" target="_blank" rel="noreferrer">Open official source</a>`:'';
  ui.marketplaceInspector.innerHTML=`<article class="marketplace-detail"><div class="marketplace-detail-head"><div><small>${escapeHtml(asset.providerId)} · ${escapeHtml(asset.kind)}</small><h3>${escapeHtml(asset.name)}</h3></div><span class="provider-status connected">${escapeHtml(asset.license||'Review')}</span></div><p>${escapeHtml(asset.description||'No provider description.')}</p><dl><dt>Creator</dt><dd>${escapeHtml(asset.creator||asset.providerId)}</dd><dt>Category</dt><dd>${escapeHtml(asset.category||asset.kind)}</dd><dt>Automated import</dt><dd>${automated?'Supported choice available':'Open source and import manually'}</dd></dl>${choices.length?`<label>Download format<select id="marketplaceChoiceSelect">${choices.map(choice=>`<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.label)}</option>`).join('')}</select></label>`:''}<div class="studio-actions">${automated?'<button id="marketplaceDownloadButton" class="button primary" type="button">Download to staging</button>':''}${source}</div><div class="marketplace-safety">Downloads run through the persistent Job Center. Files are staged, checksummed, and imported only after the job succeeds. Unsupported packages remain staged instead of being reported as imported.</div></article>`;
  $('#marketplaceDownloadButton')?.addEventListener('click',downloadSelectedMarketplaceAsset);
}
async function searchMarketplaceCatalog(){
  const providerId=ui.marketplaceProviderSelect.value;if(!providerId)return showToast('Enable a marketplace provider first.','error');marketplaceLoading=true;selectedMarketplaceAsset=null;renderMarketplaceResults();renderMarketplaceInspector();
  try{const params=new URLSearchParams({providerId,q:ui.marketplaceSearchInput.value.trim(),type:ui.marketplaceTypeSelect.value,limit:'40'}),payload=await api(`/api/marketplace/search?${params}`);marketplaceSearchResults=payload.results||[];showToast(`Found ${marketplaceSearchResults.length} assets`,'success');}
  catch(error){marketplaceSearchResults=[];handleError(error,'Marketplace search failed');}finally{marketplaceLoading=false;renderMarketplaceResults();}
}
async function loadMarketplaceDetails(providerId,assetId){
  try{ui.marketplaceInspector.innerHTML='<div class="material-empty">Loading formats and provenance…</div>';const params=new URLSearchParams({providerId,assetId}),payload=await api(`/api/marketplace/details?${params}`);selectedMarketplaceAsset=payload.asset;renderMarketplaceResults();renderMarketplaceInspector();}
  catch(error){selectedMarketplaceAsset=null;renderMarketplaceInspector();handleError(error,'Marketplace details failed');}
}
async function downloadSelectedMarketplaceAsset(){
  const asset=selectedMarketplaceAsset,choiceId=$('#marketplaceChoiceSelect')?.value;if(!asset||!choiceId)return;
  try{const payload=await api('/api/marketplace/download',{method:'POST',body:{providerId:asset.providerId,assetId:asset.id,choiceId}});applyState(payload.state,{forceSelection:false});openJobCenter();showToast(`Downloading ${asset.name} in Job Center`,'success');}
  catch(error){handleError(error,'Marketplace download failed');}
}
async function importMarketplaceJob(jobId){
  try{const payload=await api('/api/marketplace/import-job',{method:'POST',body:{jobId}});applyState(payload.state,{forceSelection:false});document.querySelector('[data-left-tab="assets"]')?.click();setAssetWorkspaceView(payload.kind==='material'?'surfaces':'models',true);showToast(`${payload.asset.name} imported into OmniForge`,'success');}
  catch(error){handleError(error,'Marketplace import failed');}
}

function providerStatusClass(provider){return provider?.status?.state||(!provider?.enabled?'disconnected':'unavailable');}
function renderProviders(){
  const providers=state?.providers||[],ready=providers.filter(provider=>provider.enabled&&provider.status?.state==='connected').length,activeJobs=(state?.jobs||[]).filter(job=>['queued','running'].includes(job.state));
  if(ui.providerSummaryBadge)ui.providerSummaryBadge.textContent=`${ready} READY`;
  if(ui.integrationJobCount)ui.integrationJobCount.textContent=String(activeJobs.length);
  if(ui.providerList)ui.providerList.innerHTML=providers.length?providers.map(provider=>{const status=providerStatusClass(provider),hardware=provider.status?.hardware,hardwareText=hardware?`${hardware.cpuModel||'CPU'} · ${hardware.logicalCores||'?'} threads${hardware.gpus?.length?` · ${hardware.gpus[0]}`:''}`:'';return `<article class="provider-card ${escapeHtml(status)}" data-provider-id="${escapeHtml(provider.id)}"><div class="provider-card-header"><div><strong>${escapeHtml(provider.displayName)}</strong><small>${escapeHtml(provider.description)}</small></div><span class="provider-status ${escapeHtml(status)}">${escapeHtml(status.toUpperCase())}</span></div><div class="provider-capabilities">${(provider.capabilities||[]).map(cap=>`<span>${escapeHtml(cap)}</span>`).join('')}</div>${provider.status?.message?`<small>${escapeHtml(provider.status.message)}</small>`:''}${hardwareText?`<small>${escapeHtml(hardwareText)}</small>`:''}<div class="provider-actions"><button class="button subtle" data-provider-action="health" data-provider-id="${escapeHtml(provider.id)}" type="button" ${!provider.enabled?'disabled':''}>Run health check</button>${provider.required?'<span class="provider-required">Required</span>':`<label class="switch-row">Enabled <input class="provider-toggle" data-provider-toggle="${escapeHtml(provider.id)}" type="checkbox" ${provider.enabled?'checked':''}></label>`}</div></article>`;}).join(''):'<div class="material-empty">No providers are registered.</div>';
  if(ui.integrationStorageSummary){const settings=state?.settings?.integrations||{};ui.integrationStorageSummary.innerHTML=`<strong>Execution policy</strong><br>${Number(settings.maxConcurrentJobs||2)} concurrent jobs · ${Number(settings.cacheLimitGb||20)} GB cache limit · ${settings.offlineMode?'Offline mode enabled':'Network providers allowed'}<br>Downloads: ${escapeHtml(settings.downloadDirectory||'downloads')}`;}
  $$('[data-provider-action="health"]').forEach(button=>button.addEventListener('click',()=>runProviderHealth(button.dataset.providerId)));
  $$('[data-provider-toggle]').forEach(toggle=>toggle.addEventListener('change',()=>setProviderEnabled(toggle.dataset.providerToggle,toggle.checked)));
}
function jobOutputSummary(job){
  const output=job.outputs?.[0];if(!output)return job.errors?.[0]||job.warnings?.[0]||'';
  if(output.type==='asset-index'){const value=output.value||{};return `${value.total||0} assets · ${value.managedFiles||0} managed files · ${(value.missing||[]).length} missing references`;}
  if(output.type==='project-integrity'){const value=output.value||{};return `${value.sceneCount||0} scenes · ${value.entityCount||0} entities · ${(value.errors||[]).length} errors · ${(value.warnings||[]).length} warnings`;}
  if(output.type==='hardware-report'){const value=output.value||{};return `${value.cpuModel||'CPU'} · ${value.logicalCores||'?'} logical cores · ${value.gpus?.[0]||'GPU not identified'}`;}
  if(output.type==='provider-health'){const value=output.value||{};return value.error?`Provider warning: ${value.error}`:`Live provider response · ${value.bytes||0} bytes`;}
  if(output.type==='marketplace-download'){const value=output.value||{};return `${value.asset?.name||'Asset'} · ${(value.files||[]).length} files · ${(value.files||[]).reduce((sum,file)=>sum+(file.bytes||0),0)/1048576<1?'<1':((value.files||[]).reduce((sum,file)=>sum+(file.bytes||0),0)/1048576).toFixed(1)} MB staged${job.importedAssetId?` · imported as ${job.importedAssetId}`:''}`;}
  return JSON.stringify(output.value||output).slice(0,500);
}
function renderJobs(){
  const jobs=state?.jobs||[],active=jobs.filter(job=>['queued','running'].includes(job.state));
  if(ui.jobCountBadge)ui.jobCountBadge.textContent=String(active.length);if(ui.integrationJobCount)ui.integrationJobCount.textContent=String(active.length);
  if(!ui.jobList)return;ui.jobList.innerHTML=jobs.length?jobs.slice(0,100).map(job=>{const pct=Math.round((Number(job.progress)||0)*100),canCancel=['queued','running'].includes(job.state),canRetry=['failed','cancelled','interrupted'].includes(job.state),canImport=job.operation==='marketplace-download'&&job.state==='succeeded'&&!job.importedAssetId,summary=jobOutputSummary(job);return `<article class="job-card" data-job-id="${escapeHtml(job.id)}"><div class="job-title"><strong>${escapeHtml(job.title)}</strong><small>${escapeHtml(job.providerId)} · ${escapeHtml(job.operation)} · attempt ${Number(job.attempt||1)}</small></div><div class="job-progress-wrap"><div class="job-stage"><span>${escapeHtml(job.stage||job.state)}</span><span class="job-state ${escapeHtml(job.state)}">${escapeHtml(job.state)} · ${pct}%</span></div><div class="job-progress"><i style="width:${pct}%"></i></div></div><div class="job-actions">${canCancel?`<button data-job-action="cancel" data-job-id="${escapeHtml(job.id)}" type="button">Cancel</button>`:''}${canRetry?`<button data-job-action="retry" data-job-id="${escapeHtml(job.id)}" type="button">Retry</button>`:''}${canImport?`<button data-job-action="import-marketplace" data-job-id="${escapeHtml(job.id)}" type="button">Import</button>`:''}</div>${summary?`<div class="job-output">${escapeHtml(summary)}</div>`:''}</article>`;}).join(''):'<div class="job-empty">No background jobs yet. Run a health check, marketplace download, project integrity check, or asset index.</div>';
  $$('[data-job-action="cancel"]').forEach(button=>button.addEventListener('click',()=>cancelBackgroundJob(button.dataset.jobId)));
  $$('[data-job-action="retry"]').forEach(button=>button.addEventListener('click',()=>retryBackgroundJob(button.dataset.jobId)));
  $$('[data-job-action="import-marketplace"]').forEach(button=>button.addEventListener('click',()=>importMarketplaceJob(button.dataset.jobId)));
}
function renderIntegrationSetup(){
  const providers=state?.providers||[],settings=state?.settings?.integrations||{};
  ui.setupProviderList.innerHTML=providers.map(provider=>`<label class="setup-provider"><span><strong>${escapeHtml(provider.displayName)}</strong><small>${escapeHtml(provider.description)}</small></span><input class="provider-toggle" data-setup-provider="${escapeHtml(provider.id)}" type="checkbox" ${provider.enabled?'checked':''} ${provider.required?'disabled':''}></label>`).join('');
  ui.maxConcurrentJobsInput.value=String(settings.maxConcurrentJobs||2);ui.cacheLimitInput.value=String(settings.cacheLimitGb||20);ui.downloadDirectoryInput.value=settings.downloadDirectory||'downloads';ui.offlineModeInput.checked=Boolean(settings.offlineMode);
}
async function setProviderEnabled(providerId,enabled){try{const payload=await api(`/api/providers/${encodeURIComponent(providerId)}`,{method:'PATCH',body:{enabled}});applyState(payload.state,{forceSelection:false});showToast(`${payload.provider.displayName} ${enabled?'enabled':'disabled'}`,'success');}catch(error){handleError(error,'Provider update failed');}}
async function runProviderHealth(providerId){try{const payload=await api(`/api/providers/${encodeURIComponent(providerId)}/health`,{method:'POST',body:{}});applyState(payload.state,{forceSelection:false});openJobCenter();showToast(`Health check queued for ${providerId}`,'success');}catch(error){handleError(error,'Provider health check failed');}}
async function testAllProviders(){for(const provider of state.providers||[]){if(provider.enabled)await runProviderHealth(provider.id);}}
function openJobCenter(){document.querySelector('[data-dock-tab="jobs"]')?.click();if(state.editor.layout?.bottomCollapsed)togglePanel('bottom');}
async function queueBackgroundJob(operation,title,settings={}){try{const payload=await api('/api/jobs',{method:'POST',body:{providerId:'local-worker-host',operation,title,settings}});applyState(payload.state,{forceSelection:false});openJobCenter();showToast(`${title} queued`,'success');}catch(error){handleError(error,'Background job could not be queued');}}
async function cancelBackgroundJob(jobId){try{const payload=await api(`/api/jobs/${encodeURIComponent(jobId)}/cancel`,{method:'POST',body:{}});applyState(payload.state,{forceSelection:false});showToast('Job cancelled','success');}catch(error){handleError(error,'Job cancellation failed');}}
async function retryBackgroundJob(jobId){try{const payload=await api(`/api/jobs/${encodeURIComponent(jobId)}/retry`,{method:'POST',body:{}});applyState(payload.state,{forceSelection:false});showToast('Job retry queued','success');}catch(error){handleError(error,'Job retry failed');}}
async function saveIntegrationSetup(dismissed=false){
  const providerChanges=$$('[data-setup-provider]').map(input=>({id:input.dataset.setupProvider,enabled:input.checked}));
  try{const payload=await api('/api/integrations/setup',{method:'POST',body:{dismissed,providers:providerChanges,settings:{maxConcurrentJobs:Number(ui.maxConcurrentJobsInput.value)||2,cacheLimitGb:Number(ui.cacheLimitInput.value)||20,downloadDirectory:ui.downloadDirectoryInput.value.trim()||'downloads',offlineMode:ui.offlineModeInput.checked}}});applyState(payload.state,{forceSelection:false});ui.integrationSetupDialog.close();showToast(dismissed?'Setup dismissed':'Integration setup saved','success');}catch(error){handleError(error,'Integration setup could not be saved');}
}

let surfacePreviewToken=0;
function materialMapUrl(material,name='baseColor'){const map=material?.maps?.[name];return typeof map==='string'?map:map?.url||'';}
function loadSurfaceImage(url){return new Promise((resolve,reject)=>{if(!url)return reject(new Error('The selected material has no base-color image.'));const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('The selected texture could not be loaded.'));image.src=url;});}
function imageCanvas(image,maxSize=512){const ratio=Math.min(1,maxSize/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height)),canvas=makeCanvas(Math.max(2,Math.round((image.naturalWidth||image.width)*ratio)));canvas.height=Math.max(2,Math.round((image.naturalHeight||image.height)*ratio));canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0,canvas.width,canvas.height);return canvas;}
function wrapOffsetCanvas(source,dx,dy){const out=makeCanvas(source.width);out.height=source.height;const ctx=out.getContext('2d');for(const ox of [-source.width,0,source.width])for(const oy of [-source.height,0,source.height])ctx.drawImage(source,dx+ox,dy+oy);return out;}
function healCenterSeams(canvas,blendWidth=32){const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.getImageData(0,0,canvas.width,canvas.height),src=new Uint8ClampedArray(image.data),w=canvas.width,h=canvas.height,cx=Math.floor(w/2),cy=Math.floor(h/2),bw=Math.max(2,Math.min(Math.floor(Math.min(w,h)/3),Math.round(blendWidth)));const mixPixel=(x,y,sx,sy,t)=>{const i=(y*w+x)*4,j=(sy*w+sx)*4;for(let c=0;c<3;c++)image.data[i+c]=src[i+c]*(1-t)+src[j+c]*t;};for(let y=0;y<h;y++)for(let x=Math.max(0,cx-bw);x<Math.min(w,cx+bw);x++){const d=Math.abs(x-cx)/bw,t=(1-d)*.5,sx=Math.max(0,Math.min(w-1,2*cx-x-1));mixPixel(x,y,sx,y,t);}src.set(image.data);for(let y=Math.max(0,cy-bw);y<Math.min(h,cy+bw);y++)for(let x=0;x<w;x++){const d=Math.abs(y-cy)/bw,t=(1-d)*.5,sy=Math.max(0,Math.min(h-1,2*cy-y-1));mixPixel(x,y,x,sy,t);}ctx.putImageData(image,0,0);return canvas;}
function makeSeamlessCanvas(source,blendWidth=32){const offset=wrapOffsetCanvas(source,Math.floor(source.width/2),Math.floor(source.height/2));healCenterSeams(offset,blendWidth);return wrapOffsetCanvas(offset,Math.ceil(source.width/2),Math.ceil(source.height/2));}
function pbrMapsFromCanvas(baseCanvas){const w=baseCanvas.width,h=baseCanvas.height,ctx=baseCanvas.getContext('2d',{willReadFrequently:true}),src=ctx.getImageData(0,0,w,h),luma=new Float32Array(w*h),wrap=(v,n)=>(v+n)%n;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;luma[y*w+x]=(src.data[i]*.2126+src.data[i+1]*.7152+src.data[i+2]*.0722)/255;}const make=()=>{const c=makeCanvas(w);c.height=h;return [c,c.getContext('2d',{willReadFrequently:true})];},[normalCanvas,normalCtx]=make(),[roughCanvas,roughCtx]=make(),[aoCanvas,aoCtx]=make(),[heightCanvas,heightCtx]=make(),normal=normalCtx.createImageData(w,h),rough=roughCtx.createImageData(w,h),ao=aoCtx.createImageData(w,h),height=heightCtx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const idx=y*w+x,i=idx*4,s=(xx,yy)=>luma[wrap(yy,h)*w+wrap(xx,w)],gx=(s(x+1,y-1)+2*s(x+1,y)+s(x+1,y+1))-(s(x-1,y-1)+2*s(x-1,y)+s(x-1,y+1)),gy=(s(x-1,y+1)+2*s(x,y+1)+s(x+1,y+1))-(s(x-1,y-1)+2*s(x,y-1)+s(x+1,y-1)),strength=2.25,len=Math.hypot(gx*strength,gy*strength,1)||1,nx=-gx*strength/len,ny=-gy*strength/len,nz=1/len,local=(Math.abs(gx)+Math.abs(gy))*.5,rv=clamp(.82-local*.22+(s(x,y)-.5)*.08,.08,1),av=clamp(.96-local*.38-(.5-s(x,y))*.18,.25,1),hv=clamp(s(x,y),0,1);normal.data.set([(nx*.5+.5)*255,(ny*.5+.5)*255,(nz*.5+.5)*255,255],i);rough.data.set([rv*255,rv*255,rv*255,255],i);ao.data.set([av*255,av*255,av*255,255],i);height.data.set([hv*255,hv*255,hv*255,255],i);}normalCtx.putImageData(normal,0,0);roughCtx.putImageData(rough,0,0);aoCtx.putImageData(ao,0,0);heightCtx.putImageData(height,0,0);return {normal:normalCanvas.toDataURL('image/png'),roughness:roughCanvas.toDataURL('image/png'),ambientOcclusion:aoCanvas.toDataURL('image/png'),height:heightCanvas.toDataURL('image/png')};}
function drawTextureRepeat(canvas,image,offset=false){if(!canvas||!image)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const tile=Math.max(48,Math.min(128,Math.round(h*.62))),start=offset?-tile/2:0;for(let y=start;y<h;y+=tile)for(let x=start;x<w;x+=tile)ctx.drawImage(image,x,y,tile,tile);ctx.strokeStyle='rgba(200,160,255,.55)';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1);}
async function renderSurfacePreviews(){const token=++surfacePreviewToken,material=selectedMaterial(),url=materialMapUrl(material);if(!ui.surfaceSourcePreview||!url)return;try{const image=await loadSurfaceImage(url);if(token!==surfacePreviewToken)return;drawTextureRepeat(ui.surfaceSourcePreview,image,false);drawTextureRepeat(ui.surfaceSeamPreview,image,true);}catch{const canvases=[ui.surfaceSourcePreview,ui.surfaceSeamPreview];for(const canvas of canvases){if(!canvas)continue;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111822';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#7e8a9b';ctx.font='11px sans-serif';ctx.fillText('Preview unavailable',12,24);}}}
async function processSelectedMaterial(operation){const material=selectedMaterial();if(!material)return showToast('Select a material first.','error');const baseUrl=materialMapUrl(material);if(!baseUrl)return showToast('The selected material has no base-color map.','error');const button=operation==='seam-repair'?ui.repairSurfaceSeamsButton:ui.generateMissingMapsButton,original=button.textContent;button.disabled=true;button.textContent='Processing…';try{const image=await loadSurfaceImage(baseUrl),source=imageCanvas(image,512),processed=operation==='seam-repair'?makeSeamlessCanvas(source,Number(ui.seamBlendWidthInput?.value||32)):source,maps={...pbrMapsFromCanvas(processed)};if(operation==='seam-repair')maps.baseColor=processed.toDataURL('image/png');const payload=await api('/api/material/derivative',{method:'POST',body:{materialId:material.id,name:`${material.name} ${operation==='seam-repair'?'Seamless':'PBR'}`,operation,maps,shareUnchangedMaps:true,settings:material.settings,tags:[operation]}});applyState(payload.state,{forceSelection:false});selectMaterial(payload.material.id,false);showToast(`Created ${payload.material.name}`,'success');}catch(error){handleError(error,'Surface processing failed');}finally{button.disabled=false;button.textContent=original;}}
function renderSurfaceWorkspace(){
  if(!state)return;const mode=state.editor?.surfaceStudioMode||'simple';$$('[data-surface-mode]').forEach(button=>button.classList.toggle('active',button.dataset.surfaceMode===mode));$$('[data-surface-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.surfacePanel===mode));
  const recipe=selectedSurfaceRecipe(),material=selectedMaterial(),maps=material?.maps||{},required=['baseColor','normal','roughness','ambientOcclusion','height'];
  if(ui.surfaceGraphSummary)ui.surfaceGraphSummary.innerHTML=recipe?`<div class="graph-metric"><strong>${recipe.graph?.nodes?.length||0}</strong><span>nodes</span></div><div class="graph-metric"><strong>${recipe.graph?.edges?.length||0}</strong><span>edges</span></div><div class="graph-metric"><strong>${escapeHtml(recipe.advanced?.projection||'world')}</strong><span>projection</span></div><div class="graph-metric"><strong>${escapeHtml(recipe.compilation?.state||'uncompiled')}</strong><span>cache</span></div><div class="graph-metric"><strong>${recipe.compilation?.cost?.estimatedTextureSamples??'—'}</strong><span>sample cost</span></div><div class="graph-metric"><strong>${recipe.compilation?.cost?.estimatedAlu??'—'}</strong><span>ALU estimate</span></div>`:'<div class="material-empty">Select a material to inspect its graph.</div>';
  if(ui.surfaceMapAudit)ui.surfaceMapAudit.innerHTML=material?required.map(name=>`<span class="${maps[name]?'ready':'missing'}">${escapeHtml(name)} · ${maps[name]?'ready':'missing'}</span>`).join(''):'<span class="missing">Select a material</span>';
  renderSurfacePreviews();
  const decals=(state.assets||[]).filter(asset=>asset.type==='decalRecipe');if(decals.length&&!decals.some(item=>item.id===selectedDecalId))selectedDecalId=decals[0].id;
  if(ui.decalList)ui.decalList.innerHTML=decals.length?decals.map(item=>`<article class="decal-card ${item.id===selectedDecalId?'selected':''}" data-decal-id="${escapeHtml(item.id)}"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)} · opacity ${Number(item.opacity||0).toFixed(2)}</small></div><span class="asset-state ${escapeHtml(item.validation?.state||'valid')}">${escapeHtml(item.validation?.state||'valid')}</span></article>`).join(''):'<div class="material-empty">Create a decal from the selected material.</div>';
  $$('[data-decal-id]').forEach(card=>card.addEventListener('click',()=>{selectedDecalId=card.dataset.decalId;renderSurfaceWorkspace();}));
  const atlases=(state.assets||[]).filter(asset=>asset.type==='atlasRecipe');if(ui.atlasSourceCount)ui.atlasSourceCount.textContent=`${(state.assets||[]).filter(asset=>asset.type==='material').length} selected`;if(ui.atlasList)ui.atlasList.innerHTML=atlases.length?atlases.map(item=>`<article class="atlas-card"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.kind)} · ${item.resolution}px · ${item.entries?.length||0} regions</small></div><div class="atlas-mini">${(item.entries||[]).map(entry=>`<i style="left:${entry.rect[0]*100}%;top:${entry.rect[1]*100}%;width:${entry.rect[2]*100}%;height:${entry.rect[3]*100}%" title="${escapeHtml(entry.label)}"></i>`).join('')}</div></article>`).join(''):'<div class="material-empty">No atlas or trim recipes yet.</div>';
}
async function createDecalRecipe(){const material=selectedMaterial();if(!material)return showToast('Select a material first.','error');try{const payload=await api('/api/decal',{method:'POST',body:{name:ui.decalNameInput.value.trim()||`${material.name} Decal`,category:ui.decalCategoryInput.value,materialId:material.id,opacity:Number(ui.decalOpacityInput.value||.85),projection:{depth:Number(ui.decalDepthInput.value||.25),angle:90,surfaceLimit:.8},channels:{baseColor:true,normal:Boolean(material.maps?.normal),roughness:Boolean(material.maps?.roughness),ao:Boolean(material.maps?.ambientOcclusion),height:Boolean(material.maps?.height),opacity:true}}});selectedDecalId=payload.decal.id;applyState(payload.state,{forceSelection:false});setSurfaceStudioMode('decals',false);showToast(`Created ${payload.decal.name}`,'success');}catch(error){handleError(error,'Decal creation failed');}}
async function placeSelectedDecal(){const recipe=(state.assets||[]).find(item=>item.id===selectedDecalId&&item.type==='decalRecipe');if(!recipe)return showToast('Select a decal first.','error');const forward=cameraForward(camera),point=add(camera.position,scale(forward,7)),terrain=scene.objects.find(item=>item.type==='terrain'&&item.visible),position=[point[0],terrainHeight(terrain,point[0],point[2])+.035,point[2]];try{const payload=await api('/api/decal/place',{method:'POST',body:{decalId:recipe.id,position,size:[3,3]}});applyState(payload.state,{forceSelection:true});scheduleAutoCapture(`Placed decal ${recipe.name}`);showToast(`Placed ${recipe.name}`,'success');}catch(error){handleError(error,'Decal placement failed');}}
async function createSurfaceAtlas(){const materialIds=(state.assets||[]).filter(asset=>asset.type==='material').map(asset=>asset.id);if(!materialIds.length)return showToast('Create at least one material first.','error');try{const payload=await api('/api/atlas',{method:'POST',body:{name:ui.atlasNameInput.value.trim()||'Surface Atlas',kind:ui.atlasKindInput.value,resolution:Number(ui.atlasResolutionInput.value||2048),materialIds}});applyState(payload.state,{forceSelection:false});setSurfaceStudioMode('atlas',false);showToast(`Created ${payload.atlas.name}`,'success');}catch(error){handleError(error,'Atlas creation failed');}}

function renderMaterials(){
  if(!ui.materialList)return;
  const materials=(state.assets||[]).filter(asset=>asset.type==='material');ui.materialCount.textContent=String(materials.length);
  if(!materials.some(asset=>asset.id===selectedMaterialId))selectedMaterialId=materials[0]?.id||null;
  ui.materialList.innerHTML=materials.length?materials.map(asset=>{
    const thumb=asset.maps?.baseColor?.url||asset.maps?.baseColor||'';
    return `<article class="material-card ${asset.id===selectedMaterialId?'selected':''}" data-material-card="${escapeHtml(asset.id)}"><div class="material-thumb" style="${thumb?`background-image:url('${escapeHtml(thumb)}')`:''}"></div><div class="material-info"><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.category||'surface')} · tile ${Number(asset.settings?.worldScale??3).toFixed(2)}</small><div class="material-actions"><button data-apply-material="${escapeHtml(asset.id)}" type="button">Apply selected</button><button data-copy-material="${escapeHtml(asset.id)}" type="button">Use ID</button>${asset.maps&&Object.keys(asset.maps).length&&!asset.protected?`<button data-delete-material="${escapeHtml(asset.id)}" class="danger" type="button">Delete</button>`:asset.protected?'<span class="protected-label">Protected</span>':''}</div></div></article>`;
  }).join(''):`<div class="material-empty">Describe or import a texture to create the first project material.</div>`;
  $$('[data-material-card]').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('button'))return;selectMaterial(card.dataset.materialCard);}));
  $$('[data-apply-material]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();selectMaterial(button.dataset.applyMaterial,false);applyMaterial(button.dataset.applyMaterial);}));
  $$('[data-copy-material]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();selectMaterial(button.dataset.copyMaterial,false);ui.commandInput.value=`Use material asset ${button.dataset.copyMaterial} on the appropriate selected world surface and validate the rendered result.`;showToast('Material ID placed in the AI command','success');}));
  $$('[data-delete-material]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();deleteMaterial(button.dataset.deleteMaterial);}));
  renderMaterialInspector();
  renderSurfaceWorkspace();
}
async function applyMaterial(materialId){
  const object=selectedObject();if(!object)return showToast('Select a terrain, path, or mesh first.','error');
  try{const payload=await api('/api/material/apply',{method:'POST',body:{materialId,objectId:object.id}});applyState(payload.state,{forceSelection:true});scheduleAutoCapture(`Applied ${payload.asset.name}`);showToast(`Applied ${payload.asset.name}`,'success');}catch(error){showToast(error.message,'error');}
}
async function deleteMaterial(materialId){
  try{const next=await api(`/api/material/${encodeURIComponent(materialId)}`,{method:'DELETE'});applyState(next,{forceSelection:true});showToast('Material deleted');}catch(error){showToast(error.message,'error');}
}
async function generateMaterial(){
  const prompt=ui.texturePrompt.value.trim(),category=ui.textureCategory.value,size=Number(ui.textureResolution.value||512);
  if(!prompt)return showToast('Describe the texture you want first.','error');
  const old=ui.generateTextureButton.textContent;ui.generateTextureButton.disabled=true;ui.generateTextureButton.textContent='Generating maps…';
  try{
    const maps=await generateTextureMaps(prompt,category,size),name=textureName(prompt,category),payload=await api('/api/material',{method:'POST',body:{name,category,prompt,maps,source:'OmniForge local procedural generator',license:'Generated locally for project use',settings:{worldScale:category==='gravel'?1.6:category==='grass'?3.2:2.4,roughness:category==='snow'?.72:category==='grass'?.9:.84,metallic:0,normalStrength:1,roughnessMultiplier:1,aoStrength:1,heightStrength:.035,uvRotation:0,uvOffset:[0,0]},tags:[category,'seamless','generated']}});
    applyState(payload.state,{forceSelection:true});showToast(`Generated ${payload.asset.name}`,'success');
  }catch(error){showToast(error.message,'error');}finally{ui.generateTextureButton.disabled=false;ui.generateTextureButton.textContent=old;}
}
async function importTexture(file){
  if(!file)return;const read=new FileReader();read.onload=async()=>{try{const payload=await api('/api/material',{method:'POST',body:{name:file.name.replace(/\.[^.]+$/,''),category:'imported',prompt:'Imported external or ChatGPT-generated seamless texture',maps:{baseColor:read.result},source:'User import',license:'User must confirm source and commercial-use rights',settings:{worldScale:3,roughness:.82,metallic:0,normalStrength:1,roughnessMultiplier:1,aoStrength:1,heightStrength:0,uvRotation:0,uvOffset:[0,0]},tags:['imported']}});applyState(payload.state,{forceSelection:true});showToast(`Imported ${payload.asset.name}`,'success');}catch(error){showToast(error.message,'error');}};read.readAsDataURL(file);
}
async function sendTextureBrief(){
  const prompt=ui.texturePrompt.value.trim();if(!prompt)return showToast('Describe the texture first.','error');
  ui.commandInput.value=`Create or source a production-ready seamless ${ui.textureCategory.value} PBR material from this brief: ${prompt}. Required maps: base color, normal, roughness, ambient occlusion, and height when useful. Record provenance and license, import it into OmniForge, apply it to the appropriate selected surface, capture the viewport, and correct visible seams or scale problems.`;
  await queueCommand();
}
async function createPrefab(){
  const object=selectedObject();if(!object)return;
  try{const payload=await api('/api/prefab',{method:'POST',body:{objectId:object.id,name:ui.prefabNameInput.value.trim()||object.name}});applyState(payload.state,{forceSelection:true});ui.prefabDialog.close();showToast(`Created prefab ${payload.prefab.name}`,'success');}catch(error){showToast(error.message,'error');}
}
function renderPrefabs(){
  if(!ui.prefabList)return;const prefabs=state.prefabs||[];ui.prefabCount.textContent=String(prefabs.length);
  ui.prefabList.innerHTML=prefabs.length?prefabs.map(prefab=>`<article class="prefab-card"><div><strong>${escapeHtml(prefab.name)}</strong><small>${escapeHtml(prefab.object?.type||'entity')} · ${escapeHtml(prefab.id)}</small></div><button class="button subtle" data-instantiate-prefab="${escapeHtml(prefab.id)}" type="button">Place</button></article>`).join(''):`<div class="material-empty">Select an entity and use ◆ in the Inspector to save a reusable prefab.</div>`;
  $$('[data-instantiate-prefab]').forEach(button=>button.addEventListener('click',async()=>{try{const forward=cameraForward(camera),position=add(camera.position,scale(forward,8)),payload=await api('/api/prefab/instantiate',{method:'POST',body:{prefabId:button.dataset.instantiatePrefab,position}});applyState(payload.state,{forceSelection:true});focusSelected();scheduleAutoCapture(`Placed prefab ${payload.object.name}`);showToast(`Placed ${payload.object.name}`,'success');}catch(error){showToast(error.message,'error');}}));
}

function renderCommands() {
  const commands=state.commands.slice(0,5);ui.commandCount.textContent=state.commands.filter(c=>['queued','claimed','running'].includes(c.status)).length;
  ui.commandQueue.innerHTML=commands.length?commands.map(command=>`<div class="command-item ${escapeHtml(command.status)}"><span class="command-state"></span><p>${escapeHtml(command.text)}</p><small>${escapeHtml(command.status)}</small></div>`).join(''):`<div class="command-item completed"><span class="command-state"></span><p>No queued work. Type a request above; Codex can claim it through the MCP bridge.</p><small>ready</small></div>`;
}
function renderConsole() {
  ui.consoleList.innerHTML=state.activity.slice(0,20).map(item=>`<div class="console-line"><time>${new Date(item.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><b>${escapeHtml(item.type)}</b><span>${escapeHtml(item.message)}</span></div>`).join('');
}
function renderWorldSettings() {
  const s=scene.settings,wind=Array.isArray(s.windDirection)?s.windDirection:[1,0,.25];
  ui.worldSettings.innerHTML=`
    <div class="property-section-title">Lighting and atmosphere</div>
    ${propColor('Sky top','skyTop',s.skyTop)}${propColor('Sky horizon','skyBottom',s.skyBottom)}${propColor('Ambient color','ambientColor',s.ambientColor)}
    ${propNumber('Ambient strength','ambientIntensity',s.ambientIntensity,'0.01',0,2)}${propNumber('Exposure','exposure',s.exposure??1.22,'0.01',.1,4)}
    ${propNumber('Fog start','fogNear',s.fogNear??90,'1',0,1000)}${propNumber('Fog end','fogFar',s.fogFar??280,'1',1,3000)}
    <div class="property-section-title">Environment state</div>
    <label class="property-row"><span>Season</span><select data-world-season><option value="spring">Spring</option><option value="summer">Summer</option><option value="autumn">Autumn</option><option value="winter">Winter</option></select></label>
    ${propNumber('Water level','waterLevel',s.waterLevel??-100,'0.1',-1000,1000)}
    ${propNumber('Weather wetness','weatherWetness',s.weatherWetness??0,'0.01',0,1)}${propNumber('Weather snow','weatherSnow',s.weatherSnow??0,'0.01',0,1)}
    ${propNumber('Wind strength','windStrength',s.windStrength??.35,'0.01',0,5)}
    <div class="property-grid compact"><label><span>Wind X</span><input data-wind-axis="0" type="number" step="0.05" value="${Number(wind[0]??1)}"></label><label><span>Wind Y</span><input data-wind-axis="1" type="number" step="0.05" value="${Number(wind[1]??0)}"></label><label><span>Wind Z</span><input data-wind-axis="2" type="number" step="0.05" value="${Number(wind[2]??.25)}"></label></div>
    <div class="property-section-title">Simulation and grid</div>
    ${propNumber('Gravity','gravity',s.gravity,'0.1',-50,50)}${propNumber('Grid size','gridSize',s.gridSize,'5',10,1000)}${propNumber('Grid step','gridStep',s.gridStep,'1',.1,100)}${propCheck('Grid visible','gridVisible',s.gridVisible)}`;
  const seasonSelect=ui.worldSettings.querySelector('[data-world-season]');if(seasonSelect)seasonSelect.value=s.season||'summer';
  $$(`#worldSettings [data-property-key]`).forEach(input=>input.addEventListener('change',()=>{
    const key=input.dataset.propertyKey;scene.settings[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
    if(key==='gridVisible')ui.gridToggle.checked=scene.settings.gridVisible;
    ui.viewportWrap.style.background=`linear-gradient(${scene.settings.skyTop} 0%, ${scene.settings.skyBottom} 72%, #26343c 100%)`;
    saveScene('World settings updated');
  }));
  seasonSelect?.addEventListener('change',()=>{scene.settings.season=seasonSelect.value;saveScene('Season updated');});
  $$(`#worldSettings [data-wind-axis]`).forEach(input=>input.addEventListener('change',()=>{const next=[...wind];next[Number(input.dataset.windAxis)]=Number(input.value)||0;scene.settings.windDirection=next;saveScene('Wind direction updated');}));
}

function updateStatus() {
  const object=selectedObject();
  ui.selectionStatus.textContent=object?`${object.name} · ${typeLabel(object.type)}`:'No object selected';
  ui.viewportModeBadge.textContent=state.editor.mode==='play'?'PLAY':'EDIT';
  ui.viewportModeBadge.classList.toggle('playing',state.editor.mode==='play');
  ui.playButton.classList.toggle('playing',state.editor.mode==='play');
  ui.playButton.querySelector('span:last-child').textContent=state.editor.mode==='play'?'Stop':'Play';
}

async function selectObject(id, persist=false) {
  if(id&&!scene.objects.some(o=>o.id===id))return;
  selectedId=id||null;state.selection.objectId=selectedId;renderHierarchy();renderInspector();renderBreadcrumb();updateStatus();
  if(persist){markLocalMutation();api('/api/selection',{method:'POST',body:{objectId:selectedId}}).then(next=>{state.engine.revision=next.engine.revision;}).catch(error=>handleError(error,'Selection could not be saved'));}
}

async function patchObject(id, patch) {
  try {
    markLocalMutation();
    const payload=await api(`/api/object/${encodeURIComponent(id)}`,{method:'PATCH',body:patch});
    applyState(payload.state,{forceSelection:true});
    scheduleAutoCapture(`Updated ${payload.object.name}`);
  } catch(error){showToast(error.message,'error');}
}

async function createObject(type) {
  try{
    const forward=cameraForward(camera);let position=add(camera.position,scale(forward,8));position=position.map(v=>Math.round(v*2)/2);
    if(type==='terrain'||type==='path')position=[0,0,0];
    if(type==='directionalLight')position=[0,15,0];
    markLocalMutation();const payload=await api('/api/object',{method:'POST',body:{type,position}});applyState(payload.state,{forceSelection:true});focusSelected();scheduleAutoCapture(`Created ${payload.object.name}`);
  }catch(error){showToast(error.message,'error');}
}

async function duplicateSelected() {
  if(!selectedId)return;try{markLocalMutation();const payload=await api('/api/object/duplicate',{method:'POST',body:{objectId:selectedId}});applyState(payload.state,{forceSelection:true});scheduleAutoCapture(`Duplicated ${payload.object.name}`);}catch(error){showToast(error.message,'error');}
}
async function deleteSelected() {
  const object=selectedObject();if(!object||object.locked)return;try{markLocalMutation();const next=await api(`/api/object/${encodeURIComponent(object.id)}`,{method:'DELETE'});applyState(next,{forceSelection:true});showToast(`Deleted ${object.name}`);}catch(error){showToast(error.message,'error');}
}

async function saveScene(message='Scene saved') {
  try{
    markLocalMutation();scene.editorCamera={...camera,position:[...camera.position]};
    const next=await api('/api/scene/save',{method:'POST',body:{scene,selection:{objectId:selectedId},editor:{autoCapture:ui.autoCaptureToggle.checked,mode:state.editor.mode,transformMode:state.editor.transformMode}}});
    state.engine.revision=next.engine.revision;showToast(message,'success');
  }catch(error){showToast(error.message,'error');}
}

function focusSelected() {
  const object=selectedObject();if(!object)return showToast('Select an object first.');
  const asset=object.type==='model'?(state.assets||[]).find(item=>item.type==='model'&&item.id===object.properties?.assetId):null,bounds=asset?.bounds;
  const center=bounds?[object.transform.position[0]+(bounds.center?.[0]||0)*object.transform.scale[0],object.transform.position[1]+(bounds.center?.[1]||0)*object.transform.scale[1],object.transform.position[2]+(bounds.center?.[2]||0)*object.transform.scale[2]]:object.transform.position;
  const radius=Math.max(2,bounds?(bounds.radius||Math.hypot(...(bounds.size||[1,1,1]))*.5)*Math.max(...object.transform.scale.map(Math.abs)):length(object.transform.scale)*.7);const forward=cameraForward(camera);camera.position=sub(center,scale(forward,radius*3.2));state.editor.lastFocusObjectId=object.id;persistCameraSoon();showToast(`Focused ${object.name}`);
}
async function groundSelected(){
  const object=selectedObject(),terrain=scene.objects.find(o=>o.type==='terrain'&&o.visible);if(!object)return showToast('Select an object first.','error');if(!terrain||['terrain','path','directionalLight','pointLight','empty'].includes(object.type))return showToast('This entity cannot be grounded to terrain.','error');
  const transform=deepClone(object.transform),asset=object.type==='model'?(state.assets||[]).find(item=>item.type==='model'&&item.id===object.properties?.assetId):null;
  const bottomOffset=asset?.bounds?.min?asset.bounds.min[1]*transform.scale[1]:-objectHalfExtents(object)[1];transform.position[1]=terrainHeight(terrain,transform.position[0],transform.position[2])-bottomOffset;await patchObject(object.id,{transform});showToast(`${object.name} grounded to terrain`,'success');
}
function frameAll() {
  const visible=scene.objects.filter(o=>o.visible&&o.type!=='directionalLight');if(!visible.length)return;
  const center=visible.reduce((sum,o)=>add(sum,o.transform.position),[0,0,0]).map(v=>v/visible.length);camera.position=[center[0]+38,center[1]+28,center[2]+44];camera.yaw=-.71;camera.pitch=-.39;persistCameraSoon();showToast('Framed active world');
}
function persistCameraSoon(){clearTimeout(cameraPersistTimer);cameraPersistTimer=setTimeout(()=>api('/api/editor',{method:'POST',body:{camera:{...camera,position:[...camera.position]}}}).then(next=>{state.engine.revision=next.engine.revision;}).catch(()=>{}),500);}

async function captureViewport(title='3D viewport capture') {
  try{
    renderer.render(scene,camera,selectedId);
    const dataUrl=ui.viewport.toDataURL('image/png');
    const payload=await api('/api/capture',{method:'POST',body:{dataUrl,kind:'viewport',title,metadata:{sceneId:scene.id,selectedObjectId:selectedId,camera:deepClone(camera),objectCount:scene.objects.length}}});
    state=payload.state;showToast(`Saved ${payload.capture.name}`,'success');return payload;
  }catch(error){showToast(error.message,'error');throw error;}
}
function scheduleAutoCapture(title) { if(!state.editor.autoCapture)return;clearTimeout(captureTimer);captureTimer=setTimeout(()=>captureViewport(`Automatic inspection: ${title}`),900); }

async function queueCommand() {
  const text=ui.commandInput.value.trim();if(!text)return showToast('Describe what Codex should build.','error');
  try{markLocalMutation();const payload=await api('/api/command',{method:'POST',body:{text}});state=payload.state;scene=activeScene();ui.commandInput.value='';renderCommands();renderConsole();showToast('Command queued for Codex','success');}catch(error){showToast(error.message,'error');}
}

function enterPlayMode() {
  if(state.engine.safeMode)return showToast('Play mode is disabled in Safe Mode. Relaunch normally when the recovered project is stable.','error');
  if(state.editor.mode==='play')return exitPlayMode();
  playSnapshot=new Map(scene.objects.map(o=>[o.id,deepClone(o.transform)]));rigidBodies.clear();
  scene.objects.forEach(o=>{if((o.components||[]).some(c=>(c.type||c)==='RigidBody'))rigidBodies.set(o.id,{velocity:[0,0,0]});});
  physicsAccumulator=0;state.editor.mode='play';updateStatus();showToast('Play mode started');
}
function exitPlayMode() {
  if(playSnapshot)scene.objects.forEach(o=>{const t=playSnapshot.get(o.id);if(t)o.transform=t;});
  playSnapshot=null;rigidBodies.clear();physicsAccumulator=0;state.editor.mode='edit';updateStatus();showToast('Returned to edit mode');
}
function objectHalfExtents(object){
  const s=object.transform.scale||[1,1,1];
  if(object.type==='sphere'){const r=Math.max(.05,Math.max(...s)*.5);return [r,r,r];}
  if(object.type==='model'){const asset=(state.assets||[]).find(item=>item.type==='model'&&item.id===object.properties?.assetId),size=asset?.bounds?.size;if(size)return [Math.max(.05,Math.abs(size[0]*s[0])*.5),Math.max(.05,Math.abs(size[1]*s[1])*.5),Math.max(.05,Math.abs(size[2]*s[2])*.5)];}
  return [Math.max(.05,Math.abs(s[0])*.5),Math.max(.05,Math.abs(s[1])*.5),Math.max(.05,Math.abs(s[2])*.5)];
}
function hasCollider(object){return object.properties?.collider!==false&&(object.properties?.collider===true||(object.components||[]).some(c=>(c.type||c)==='Collider'));}
function resolveStaticAabb(object,body,other){
  if(other.id===object.id||!other.visible||!hasCollider(other)||['terrain','path','directionalLight','pointLight','empty'].includes(other.type))return;
  if(rigidBodies.has(other.id))return;
  const a=objectHalfExtents(object),b=objectHalfExtents(other),d=sub(object.transform.position,other.transform.position),px=a[0]+b[0]-Math.abs(d[0]),py=a[1]+b[1]-Math.abs(d[1]),pz=a[2]+b[2]-Math.abs(d[2]);
  if(px<=0||py<=0||pz<=0)return;
  const restitution=clamp(Number(body.component?.restitution??.18),0,1);
  if(py<=px&&py<=pz){const sign=d[1]>=0?1:-1;object.transform.position[1]+=py*sign;body.velocity[1]=-body.velocity[1]*restitution;}
  else if(px<=pz){const sign=d[0]>=0?1:-1;object.transform.position[0]+=px*sign;body.velocity[0]=-body.velocity[0]*restitution;}
  else{const sign=d[2]>=0?1:-1;object.transform.position[2]+=pz*sign;body.velocity[2]=-body.velocity[2]*restitution;}
}
function physicsStep(dt) {
  const terrain=scene.objects.find(o=>o.type==='terrain'&&o.visible),gravity=Number(scene.settings.gravity||-9.81);
  for(const [id,body] of rigidBodies){
    const object=scene.objects.find(o=>o.id===id);if(!object)continue;
    const component=(object.components||[]).find(c=>(c.type||c)==='RigidBody');body.component=component||{};
    if(component?.kinematic)continue;
    if(component?.useGravity!==false)body.velocity[1]+=gravity*dt;
    object.transform.position[0]+=body.velocity[0]*dt;object.transform.position[1]+=body.velocity[1]*dt;object.transform.position[2]+=body.velocity[2]*dt;
    if(terrain&&hasCollider(object)){
      const floor=terrainHeight(terrain,object.transform.position[0],object.transform.position[2]),half=objectHalfExtents(object)[1];
      if(object.transform.position[1]-half<floor){const restitution=clamp(Number(component?.restitution??.18),0,1);object.transform.position[1]=floor+half;body.velocity[1]=Math.abs(body.velocity[1])>.35?-body.velocity[1]*restitution:0;}
    }
    if(hasCollider(object))for(const other of scene.objects)resolveStaticAabb(object,body,other);
    body.velocity=body.velocity.map(value=>Math.abs(value)<.0005?0:value*.999);
  }
}
function behaviorStep(dt){
  for(const object of scene.objects){
    for(const component of object.components||[]){
      if((component.type||component)==='Rotator'){
        object.transform.rotation[0]+=Number(component.x||0)*dt;object.transform.rotation[1]+=Number(component.y||0)*dt;object.transform.rotation[2]+=Number(component.z||0)*dt;
      }
    }
  }
}

function viewportNavigationActive(){return document.pointerLockElement===ui.viewport||viewportDragLook;}

function updateCamera(dt) {
  if(!viewportNavigationActive())return;
  const forward=cameraForward(camera),right=cameraRight(camera),speed=Number(camera.moveSpeed||12)*(keys.has('ShiftLeft')||keys.has('ShiftRight')?Number(camera.fastMultiplier||3.5):1);let movement=[0,0,0];
  if(keys.has('KeyW'))movement=add(movement,forward);if(keys.has('KeyS'))movement=sub(movement,forward);if(keys.has('KeyD'))movement=add(movement,right);if(keys.has('KeyA'))movement=sub(movement,right);if(keys.has('Space'))movement[1]+=1;if(keys.has('ControlLeft')||keys.has('ControlRight'))movement[1]-=1;
  if(length(movement)>.001){camera.position=add(camera.position,scale(normalize(movement),speed*dt));scene.editorCamera=camera;}
}

function animationLoop(now) {
  const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;updateCamera(dt);if(state?.editor.mode==='play'){behaviorStep(dt);physicsAccumulator=Math.min(.2,physicsAccumulator+dt);while(physicsAccumulator>=1/60){physicsStep(1/60);physicsAccumulator-=1/60;}}if(renderer&&scene)renderer.render(scene,camera,selectedId);
  frameCounter++;fpsTimer+=dt;if(fpsTimer>=.5){ui.fpsStatus.textContent=`${Math.round(frameCounter/fpsTimer)} FPS`;frameCounter=0;fpsTimer=0;ui.cameraPositionBadge.textContent=`X ${camera.position[0].toFixed(1)} · Y ${camera.position[1].toFixed(1)} · Z ${camera.position[2].toFixed(1)}`;}
  requestAnimationFrame(animationLoop);
}

async function nudgeSelected(code) {
  const object=selectedObject();
  if(!object||object.locked)return false;
  const mode=state.editor.transformMode||'move';
  const transform=deepClone(object.transform);
  const snap=Number(state.editor.snap||0.5);
  let changed=true;
  if(mode==='move'){
    if(code==='ArrowLeft')transform.position[0]-=snap;
    else if(code==='ArrowRight')transform.position[0]+=snap;
    else if(code==='ArrowUp')transform.position[2]-=snap;
    else if(code==='ArrowDown')transform.position[2]+=snap;
    else if(code==='PageUp')transform.position[1]+=snap;
    else if(code==='PageDown')transform.position[1]-=snap;
    else changed=false;
  }else if(mode==='rotate'){
    const step=5;
    if(code==='ArrowLeft')transform.rotation[1]-=step;
    else if(code==='ArrowRight')transform.rotation[1]+=step;
    else if(code==='ArrowUp')transform.rotation[0]-=step;
    else if(code==='ArrowDown')transform.rotation[0]+=step;
    else if(code==='PageUp')transform.rotation[2]+=step;
    else if(code==='PageDown')transform.rotation[2]-=step;
    else changed=false;
  }else if(mode==='scale'){
    const delta=(code==='ArrowUp'||code==='ArrowRight'||code==='PageUp')?snap:(code==='ArrowDown'||code==='ArrowLeft'||code==='PageDown')?-snap:0;
    if(!delta)changed=false;
    else if(code==='PageUp'||code==='PageDown')transform.scale[1]=Math.max(.05,transform.scale[1]+delta);
    else transform.scale=transform.scale.map(value=>Math.max(.05,value+delta));
  }
  if(changed){await patchObject(object.id,{transform});return true;}
  return false;
}

function bindTabs() {
  $$('[data-left-tab]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-left-tab]').forEach(b=>b.classList.toggle('active',b===button));$$('.left-tab').forEach(tab=>tab.classList.remove('active'));$(`#${button.dataset.leftTab}Tab`).classList.add('active');
  }));
  $$('[data-dock-tab]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-dock-tab]').forEach(b=>b.classList.toggle('active',b===button));$$('.dock-content').forEach(tab=>tab.classList.remove('active'));$(`#${button.dataset.dockTab}Dock`).classList.add('active');
  }));
}

function bindEvents() {
  bindTabs();
  $$('[data-asset-workspace-view]').forEach(button=>button.addEventListener('click',()=>setAssetWorkspaceView(button.dataset.assetWorkspaceView,true)));
  ui.marketplaceSearchButton?.addEventListener('click',searchMarketplaceCatalog);ui.marketplaceSearchInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchMarketplaceCatalog();}});ui.marketplaceProviderSelect?.addEventListener('change',()=>{marketplaceSearchResults=[];selectedMarketplaceAsset=null;renderMarketplaceProviders();renderMarketplaceResults();renderMarketplaceInspector();});
  ui.runIntegrationSetupButton.addEventListener('click',()=>{renderIntegrationSetup();ui.integrationSetupDialog.showModal();});
  ui.testAllProvidersButton.addEventListener('click',testAllProviders);ui.openJobsButton.addEventListener('click',openJobCenter);
  ui.runProjectIntegrityButton.addEventListener('click',()=>queueBackgroundJob('project-integrity','Project integrity check'));
  ui.runAssetIndexButton.addEventListener('click',()=>queueBackgroundJob('asset-index','Asset registry index'));
  ui.runDiagnosticJobButton.addEventListener('click',()=>queueBackgroundJob('diagnostic-delay','Cancellable worker diagnostic',{durationMs:6000,steps:20}));
  ui.clearCompletedJobsButton.addEventListener('click',async()=>{try{const next=await api('/api/jobs/completed',{method:'DELETE'});applyState(next,{forceSelection:false});showToast('Completed jobs cleared','success');}catch(error){handleError(error,'Completed jobs could not be cleared');}});
  ui.saveIntegrationSetupButton.addEventListener('click',()=>saveIntegrationSetup(false));ui.dismissIntegrationSetupButton.addEventListener('click',()=>saveIntegrationSetup(true));
  ui.chooseDownloadDirectoryButton.addEventListener('click',async()=>{try{const directory=await window.omniforgeDesktop?.chooseProjectDirectory?.({title:'Choose provider download directory',buttonLabel:'Use folder'});if(directory)ui.downloadDirectoryInput.value=directory;}catch(error){handleError(error,'Download directory could not be selected');}});
  ui.layoutButton.addEventListener('click',()=>{renderLayoutPresets();ui.layoutDialog.showModal();});
  ui.commandPaletteButton.addEventListener('click',openCommandPalette);
  ui.collapseLeftButton.addEventListener('click',()=>togglePanel('left'));ui.collapseRightButton.addEventListener('click',()=>togglePanel('right'));ui.collapseBottomButton.addEventListener('click',()=>togglePanel('bottom'));
  ui.leftResizeHandle.addEventListener('pointerdown',event=>startResize('left',event));ui.rightResizeHandle.addEventListener('pointerdown',event=>startResize('right',event));ui.bottomResizeHandle.addEventListener('pointerdown',event=>startResize('bottom',event));
  window.addEventListener('resize',()=>{if(state?.editor)applyLayout(state.editor.layout||{},false);});
  ui.newProjectHubButton.addEventListener('click',()=>{ui.projectNameInput.value='Untitled Game';ui.projectTemplateInput.value='empty-3d';ui.projectDialog.showModal();});
  ui.importProjectButton.addEventListener('click',importProjectFolder);ui.refreshProjectsButton.addEventListener('click',()=>loadProjects());ui.projectSearchInput.addEventListener('input',renderProjectHub);
  ui.projectGrid.addEventListener('click',async event=>{const button=event.target.closest('[data-project-action]');if(!button)return;const projectId=button.dataset.projectId,action=button.dataset.projectAction,project=projects.find(item=>item.id===projectId);if(action==='open')await openProjectById(projectId);else if(action==='locate')await locateMissingProject(projectId);else if(action==='archive')await archiveProjectById(projectId);else if(action==='duplicate'){ui.duplicateProjectIdInput.value=projectId;ui.duplicateProjectNameInput.value=`${project?.name||'Project'} Copy`;ui.duplicateProjectDialog.showModal();}else if(action==='folder'&&project){try{if(window.omniforgeDesktop?.openPath)await window.omniforgeDesktop.openPath(project.root);else await api('/api/open-folder',{method:'POST',body:{path:project.id}});}catch(error){handleError(error,'Project folder could not be opened');}}});
  ui.confirmDuplicateProjectButton.addEventListener('click',async()=>{try{const payload=await api('/api/projects/duplicate',{method:'POST',body:{projectId:ui.duplicateProjectIdInput.value,name:ui.duplicateProjectNameInput.value}});projects=payload.projects||projects;applyState(payload.state,{forceSelection:true});ui.duplicateProjectDialog.close();ui.projectHubDialog.close();showToast('Project duplicated','success');}catch(error){handleError(error,'Project duplicate failed');}});
  ui.saveLayoutButton.addEventListener('click',()=>{const name=ui.layoutNameInput.value.trim();if(!name)return showToast('Name the layout first.','error');const saved={...currentLayout(),name,description:'Saved custom workspace layout.'};state.editor.savedLayouts=[...(state.editor.savedLayouts||[]).filter(item=>item.name!==name),saved];ui.layoutNameInput.value='';persistLayoutSoon();renderLayoutPresets();showToast(`Saved ${name}`,'success');});
  ui.resetLayoutButton.addEventListener('click',()=>{applyLayout(layoutPresets()[0],true);ui.layoutDialog.close();showToast('Default layout restored','success');});
  ui.saveShortcutsButton.addEventListener('click',saveShortcuts);ui.resetShortcutsButton.addEventListener('click',()=>{state.editor.shortcuts={...defaultShortcutValues};renderShortcuts();});
  ui.commandPaletteInput.addEventListener('input',()=>{paletteActiveIndex=0;renderCommandPalette();});ui.commandPaletteInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();paletteActiveIndex++;renderCommandPalette();}else if(event.key==='ArrowUp'){event.preventDefault();paletteActiveIndex--;renderCommandPalette();}else if(event.key==='Enter'){event.preventDefault();runPaletteCommand();}});
  ui.tutorialBackButton.addEventListener('click',()=>{tutorialIndex=Math.max(0,tutorialIndex-1);renderTutorial();});ui.tutorialNextButton.addEventListener('click',()=>{if(tutorialIndex>=tutorialSteps.length-1)finishTutorial();else{tutorialIndex++;renderTutorial();}});ui.skipTutorialButton.addEventListener('click',finishTutorial);
  ui.copyErrorButton.addEventListener('click',async()=>{const original=ui.copyErrorButton.textContent;try{await copyTextToClipboard(lastErrorDetails||ui.errorDialogMessage.textContent);ui.copyErrorButton.textContent='Copied';showToast('Error details copied','success');}catch(error){handleError(error,'Clipboard copy failed');}finally{setTimeout(()=>{ui.copyErrorButton.textContent=original;},1200);}});
  ui.hierarchySearch.addEventListener('input',renderHierarchy);
  ui.addQuickButton.addEventListener('click',()=>{$('[data-left-tab="create"]').click();});
  $$('[data-create]').forEach(button=>button.addEventListener('click',()=>createObject(button.dataset.create)));
  ui.saveButton.addEventListener('click',()=>saveScene());ui.playButton.addEventListener('click',enterPlayMode);ui.captureButton.addEventListener('click',()=>captureViewport());
  ui.focusButton.addEventListener('click',focusSelected);ui.groundButton.addEventListener('click',groundSelected);ui.frameAllButton.addEventListener('click',frameAll);ui.duplicateButton.addEventListener('click',duplicateSelected);ui.deleteButton.addEventListener('click',deleteSelected);
  ui.gridToggle.addEventListener('change',()=>{scene.settings.gridVisible=ui.gridToggle.checked;renderWorldSettings();saveScene('Grid setting saved');});
  ui.modelImportInput.addEventListener('change',()=>{pendingModelFile=ui.modelImportInput.files?.[0]||null;ui.importModelButton.disabled=!pendingModelFile;ui.modelImportStatus.textContent=pendingModelFile?`${pendingModelFile.name} · ${formatBytes(pendingModelFile.size)}`:'No file selected';});
  ui.importModelButton.addEventListener('click',importSelectedModel);
  ui.assetSearchInput.addEventListener('input',renderModelAssets);ui.assetStatusFilter.addEventListener('change',renderModelAssets);
  ui.generateTextureButton.addEventListener('click',generateMaterial);
  ui.sendTextureBriefButton.addEventListener('click',sendTextureBrief);
  ui.textureImportInput.addEventListener('change',()=>{const file=ui.textureImportInput.files?.[0];importTexture(file);ui.textureImportInput.value='';});
  $$('[data-surface-mode]').forEach(button=>button.addEventListener('click',()=>setSurfaceStudioMode(button.dataset.surfaceMode,true)));
  ui.repairSurfaceSeamsButton?.addEventListener('click',()=>processSelectedMaterial('seam-repair'));
  ui.generateMissingMapsButton?.addEventListener('click',()=>processSelectedMaterial('generate-pbr-maps'));
  ui.seamBlendWidthInput?.addEventListener('input',renderSurfacePreviews);
  ui.createDecalButton?.addEventListener('click',createDecalRecipe);ui.placeDecalButton?.addEventListener('click',placeSelectedDecal);
  ui.createAtlasButton?.addEventListener('click',createSurfaceAtlas);
  ui.prefabButton.addEventListener('click',()=>{const object=selectedObject();if(!object)return;ui.prefabNameInput.value=object.name;ui.prefabDialog.showModal();});
  ui.createPrefabButton.addEventListener('click',createPrefab);
  ui.saveViewportSettingsButton.addEventListener('click',async()=>{
    camera.lookSensitivity=clamp(Number(ui.lookSensitivityInput.value)||.0023,.0005,.008);
    camera.invertHorizontal=ui.invertHorizontalInput.checked;
    camera.invertVertical=ui.invertVerticalInput.checked;
    camera.moveSpeed=clamp(Number(ui.moveSpeedInput.value)||12,1,100);
    camera.fov=clamp(Number(ui.fovInput.value)||62,30,110);
    try{await saveScene('Viewport settings saved');ui.helpDialog.close();showToast('Viewport controls updated','success');}catch(error){handleError(error,'Viewport settings could not be saved');}
  });
  ui.autoCaptureToggle.addEventListener('change',()=>{if(state.engine.safeMode){ui.autoCaptureToggle.checked=false;return showToast('Automatic capture is disabled in Safe Mode.','error');}state.editor.autoCapture=ui.autoCaptureToggle.checked;api('/api/editor',{method:'POST',body:{autoCapture:state.editor.autoCapture}}).then(next=>state.engine.revision=next.engine.revision);showToast(state.editor.autoCapture?'Automatic inspection enabled':'Automatic inspection disabled');});
  ui.queueCommandButton.addEventListener('click',queueCommand);ui.commandInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();queueCommand();}});
  $$('.prompt-examples button').forEach(button=>button.addEventListener('click',()=>{ui.commandInput.value=button.textContent;ui.commandInput.focus();}));
  ui.openProjectFolder.addEventListener('click',async()=>{try{if(window.omniforgeDesktop?.openPath)await window.omniforgeDesktop.openPath(state.project.root);else await api('/api/open-folder',{method:'POST',body:{projectRoot:true}});}catch(error){handleError(error,'Project folder could not be opened');}});
  ui.projectButton.addEventListener('click',()=>loadProjects({openHub:true}));
  ui.newSceneButton.addEventListener('click',()=>ui.newSceneDialog.showModal());ui.viewportSettingsButton.addEventListener('click',()=>{ui.lookSensitivityInput.value=String(camera.lookSensitivity||.0023);ui.invertHorizontalInput.checked=Boolean(camera.invertHorizontal);ui.invertVerticalInput.checked=Boolean(camera.invertVertical);ui.moveSpeedInput.value=String(camera.moveSpeed||12);ui.fovInput.value=String(camera.fov||62);ui.helpDialog.showModal();});
  $$('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  ui.applyProjectButton.addEventListener('click',async()=>{
    try{const payload=await api('/api/projects/create',{method:'POST',body:{name:ui.projectNameInput.value,template:ui.projectTemplateInput.value}});projects=payload.projects||projects;applyState(payload.state,{forceSelection:true});ui.projectDialog.close();ui.projectHubDialog.close();showToast('Project created','success');}
    catch(error){handleError(error,'Project creation failed');}
  });
  ui.createSceneButton.addEventListener('click',async()=>{try{const payload=await api('/api/scene/new',{method:'POST',body:{name:ui.newSceneNameInput.value,template:ui.newSceneTemplateInput.value}});applyState(payload.state,{forceSelection:true});ui.newSceneDialog.close();showToast(`Created ${payload.scene.name}`,'success');}catch(error){showToast(error.message,'error');}});
  ui.sceneSelect.addEventListener('change',async()=>{try{const next=await api('/api/scene/select',{method:'POST',body:{sceneId:ui.sceneSelect.value}});applyState(next,{forceSelection:true});}catch(error){showToast(error.message,'error');}});
  $$('[data-transform-mode]').forEach(button=>button.addEventListener('click',()=>{$$('[data-transform-mode]').forEach(b=>b.classList.toggle('active',b===button));state.editor.transformMode=button.dataset.transformMode;api('/api/editor',{method:'POST',body:{transformMode:state.editor.transformMode}}).then(next=>state.engine.revision=next.engine.revision);}));

  async function enterViewportNavigation(event){
    ui.viewport.focus({preventScroll:true});
    if(event){const pick=renderer.pick(scene,camera,event.clientX,event.clientY);selectObject(pick?.id||null,true);}
    if(document.pointerLockElement===ui.viewport)return;
    try{
      const result=ui.viewport.requestPointerLock?.();
      if(result&&typeof result.then==='function')await result;
    }catch(error){
      pointerLockSupported=false;
      showToast('Pointer lock was blocked. Hold right mouse and use WASD as a fallback.','error');
    }
  }
  ui.viewport.addEventListener('mousedown',event=>{
    if(event.button===0){enterViewportNavigation(event);return;}
    if(event.button===2){event.preventDefault();ui.viewport.focus({preventScroll:true});viewportDragLook=true;viewportDragLast=[event.clientX,event.clientY];ui.viewportWrap.classList.add('drag-look');}
  });
  ui.viewport.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('mouseup',event=>{if(event.button===2&&viewportDragLook){viewportDragLook=false;viewportDragLast=null;ui.viewportWrap.classList.remove('drag-look');keys.clear();persistCameraSoon();}});
  document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===ui.viewport;ui.viewportWrap.classList.toggle('pointer-locked',locked);if(locked){pointerLockSupported=true;showToast('Viewport navigation active','success');}else if(!viewportDragLook){keys.clear();persistCameraSoon();}});
  document.addEventListener('pointerlockerror',()=>{pointerLockSupported=false;showToast('Pointer lock was denied. Hold right mouse and use WASD.','error');});
  document.addEventListener('mousemove',event=>{
    let dx=0,dy=0;
    if(document.pointerLockElement===ui.viewport){dx=event.movementX;dy=event.movementY;}
    else if(viewportDragLook&&viewportDragLast){dx=event.clientX-viewportDragLast[0];dy=event.clientY-viewportDragLast[1];viewportDragLast=[event.clientX,event.clientY];}
    else return;
    const sensitivity=Number(camera.lookSensitivity||.0023);camera.yaw+=dx*sensitivity*(camera.invertHorizontal?-1:1);camera.pitch=clamp(camera.pitch+dy*sensitivity*(camera.invertVertical?1:-1),-Math.PI/2+.02,Math.PI/2-.02);
  });
  document.addEventListener('keydown',event=>{
    keys.add(event.code);
    if(viewportNavigationActive()){if(['Space','ControlLeft','ControlRight'].includes(event.code))event.preventDefault();return;}
    const target=event.target,typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
    if(shortcutMatches(event,state.editor.shortcuts?.commandPalette)){event.preventDefault();openCommandPalette();return;}
    if(shortcutMatches(event,state.editor.shortcuts?.projectHub)){event.preventDefault();loadProjects({openHub:true});return;}
    if(typing)return;
    const handlers={
      save:()=>saveScene(),duplicate:duplicateSelected,focus:focusSelected,resetCamera,play:enterPlayMode,delete:deleteSelected,
      moveMode:()=>document.querySelector('[data-transform-mode="move"]')?.click(),rotateMode:()=>document.querySelector('[data-transform-mode="rotate"]')?.click(),scaleMode:()=>document.querySelector('[data-transform-mode="scale"]')?.click(),
      toggleLeftPanel:()=>togglePanel('left'),toggleRightPanel:()=>togglePanel('right'),toggleBottomDock:()=>togglePanel('bottom')
    };
    for(const [action,handler] of Object.entries(handlers)){if(shortcutMatches(event,state.editor.shortcuts?.[action])){event.preventDefault();handler();return;}}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.code)){event.preventDefault();nudgeSelected(event.code);}
  });
  document.addEventListener('keyup',event=>keys.delete(event.code));
}

async function pollRemoteState() {
  if(!state||Date.now()-localMutationAt<900||state.editor.mode==='play')return;
  try{
    const remote=await api('/api/state');
    if(remote.engine.revision>state.engine.revision){
      const captureRequest=remote.editor?.captureRequest;
      applyState(remote,{forceSelection:true});
      if(captureRequest?.status==='pending'){
        if(captureRequest.objectId&&scene.objects.some(o=>o.id===captureRequest.objectId)){
          await selectObject(captureRequest.objectId,false);
          focusSelected();
          await sleep(450);
        }
        await captureViewport(captureRequest.title||'Codex requested 3D inspection');
        const next=await api('/api/editor',{method:'POST',body:{captureRequest:null}});
        state.engine.revision=next.engine.revision;
      }
    }
  }catch{}
}

async function bootstrap() {
  try{
    const [initialState,projectPayload]=await Promise.all([api('/api/state'),api('/api/projects')]);state=initialState;projects=projectPayload.projects||[];scene=activeScene();
    renderer=new Renderer3D(ui.viewport);renderer.setAssets(state.assets);applyState(state,{forceSelection:true});bindEvents();renderProjectHub();loading=false;
    window.__omniforgeDebug=Object.freeze({
      snapshot:()=>deepClone({state,scene,camera,selectedId,playMode:state?.editor?.mode||'edit',projects,layout:state?.editor?.layout}),
      setCamera:patch=>{if(patch&&typeof patch==='object'){if(Array.isArray(patch.position))camera.position=patch.position.map(Number);for(const key of ['yaw','pitch','fov','moveSpeed'])if(Number.isFinite(Number(patch[key])))camera[key]=Number(patch[key]);scene.editorCamera={...camera,position:[...camera.position]};}},
      select:id=>selectObject(id,false),togglePlay:()=>enterPlayMode(),capture:title=>captureViewport(title||'Automated viewport inspection'),openProjectHub:()=>loadProjects({openHub:true}),applyLayout:patch=>applyLayout(patch,false)
    });
    window.addEventListener('error',event=>handleError(event.error||event.message,'Unexpected editor error'));window.addEventListener('unhandledrejection',event=>handleError(event.reason,'Unexpected editor error'));
    requestAnimationFrame(animationLoop);setInterval(pollRemoteState,1000);showToast(state.engine.safeMode?'Recovered project opened in Safe Mode':'OmniForge ready','success');
    const params=new URLSearchParams(location.search);if(params.get('panel')==='assets')document.querySelector('[data-left-tab="assets"]')?.click();if(params.get('panel')==='integrations')document.querySelector('[data-left-tab="integrations"]')?.click();if(params.get('asset'))selectModelAsset(params.get('asset'),false);if(!state.editor.firstUseComplete&&!params.has('skipTutorial'))setTimeout(showTutorial,500);else if(state.settings?.integrations?.setupState==='pending'&&!params.has('skipSetup'))setTimeout(()=>{renderIntegrationSetup();ui.integrationSetupDialog.showModal();},850);
  }catch(error){document.body.innerHTML=`<main style="padding:40px;color:white"><h1>OmniForge failed to start</h1><p>${escapeHtml(error.message)}</p><pre style="white-space:pre-wrap;color:#ff9bad">${escapeHtml(error.stack||'')}</pre></main>`;}
}

bootstrap();
