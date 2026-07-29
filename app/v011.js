import { PathGenerationWorkerPool } from './path-network/generation-pool.js';
import { trailArchetypes } from './path-network/archetypes.js';
import { trailCandidateToPathNetwork } from './path-network/trail-solver.js';
import { nearestCompiledStation } from './path-network/compiler.js';
import {
  createPathNodeDragPreview,
  pathNodeFromDragPreview,
  updatePathNodeDragPreview
} from './path-network/editor-drag-preview.js';
import { suggestPathNodeHandles } from './path-network/transactions.js';
import { routeRestrictionsFromScene } from './path-network/world-constraints.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

let foundation = null;
let splineEditPathId = null;
let selectedSplineNodeIndex = null;
let terrainSculptMode = null;
let draggingNode = null;
let inspectorObserver = null;
let inspectorEnhanceQueued = false;
let overlayFrame = 0;
let foundationRefreshPromise = null;
let foundationSignature = '';
let selectedPathNodeId = null;
let routeGenerationRevision = 0;
let routeGenerationPool = null;
let pathDragPreviewFrame = 0;
let routeGenerationState = {
  status: 'idle',
  pathId: null,
  candidates: [],
  selectedCandidate: 0,
  durationMs: 0,
  error: ''
};
const routeDrafts = new Map();


function bridge() {
  return window.__omniforgeV011Bridge || null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}

function currentSnapshot() {
  return bridge()?.snapshot?.() || null;
}

function applyPayload(payload, forceSelection = false) {
  if (payload?.presets || payload?.pathDiagnostics || payload?.foundation) foundation = payload;
  if (payload?.state) bridge()?.applyState?.(payload.state, { forceSelection });
  refreshToolbar();
  enhanceInspector();
}

async function applyMutation(payload, forceSelection = true) {
  if (payload?.state) bridge()?.applyState?.(payload.state, { forceSelection });
  await refreshFoundation();
}

function currentFoundationSignature() {
  const snapshot = currentSnapshot();
  const terrain = snapshot?.scene?.objects?.find(object => object.type === 'terrain');
  const paths = snapshot?.scene?.objects?.filter(object => object.type === 'path') || [];
  return JSON.stringify([
    snapshot?.scene?.id || '',
    terrain?.id || '',
    terrain?.properties?.generatedRevision || 0,
    terrain?.properties?.seed || 0,
    terrain?.properties?.bounds || null,
    paths.map(path => [
      path.id,
      path.visible !== false,
      path.properties?.pathNetwork?.revision || path.properties?.profileRevision || 0
    ])
  ]);
}

async function refreshFoundation() {
  if (foundationRefreshPromise) return foundationRefreshPromise;
  const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('worldgen-refresh')||(()=>{});
  foundationRefreshPromise = (async () => {
    try {
      applyPayload(await api('/api/v011/worldgen'));
      foundationSignature = currentFoundationSignature();
    } catch (error) {
      bridge()?.showToast?.(error.message, 'error');
    } finally {
      finishDiagnostic({signature:foundationSignature});
      foundationRefreshPromise = null;
    }
  })();
  return foundationRefreshPromise;
}

function selectedObject() {
  const snapshot = currentSnapshot();
  return snapshot?.scene?.objects?.find(object => object.id === snapshot.selectedId) || null;
}

function terrainObject() {
  return currentSnapshot()?.scene?.objects?.find(object => object.type === 'terrain') || foundation?.terrain || null;
}

function activePath() {
  const object = selectedObject();
  return object?.type === 'path' ? object : null;
}

function activePathRuntime(object) {
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  if (!snapshot?.scene || !renderer?.scenePathRuntimes) return null;
  return renderer.scenePathRuntimes(snapshot.scene)
    .find(runtime => runtime.pathObjectId === object?.id) || null;
}

function pathNodeSelection(object) {
  const nodes = object?.properties?.pathNetwork?.nodes || [];
  const middle = Math.max(0, Math.floor((nodes.length || 1) / 2));
  let index = selectedPathNodeId ? nodes.findIndex(node => node.id === selectedPathNodeId) : -1;
  if (index < 0) index = Math.max(0, Math.min(Math.max(0, nodes.length - 1), Number(selectedSplineNodeIndex ?? middle)));
  const node = nodes[index] || { id: null, position: [0, 0, 0], heightMode: 'terrain', heightOffset: 0 };
  selectedPathNodeId = node.id;
  return { index, node, point: node.position };
}

function routeDraft(object) {
  const network = object?.properties?.pathNetwork;
  const nodes = network?.nodes || [];
  const first = nodes[0]?.position || [-20, 0, -20];
  const last = nodes.at(-1)?.position || [20, 0, 20];
  if (!routeDrafts.has(object.id)) {
    routeDrafts.set(object.id, {
      archetype: 'human-footpath',
      startX: first[0],
      startZ: first[2],
      endX: last[0],
      endZ: last[2],
      seed: 1,
      useRestriction: false,
      restrictionMinX: Math.min(first[0], last[0]) * 0.2,
      restrictionMaxX: Math.max(first[0], last[0]) * 0.2,
      restrictionMinZ: Math.min(first[2], last[2]) * 0.2,
      restrictionMaxZ: Math.max(first[2], last[2]) * 0.2
    });
  }
  return routeDrafts.get(object.id);
}

function routeCandidateLength(candidate) {
  const points = Array.isArray(candidate?.points) ? candidate.points : [];
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      Number(points[index]?.[0] || 0) - Number(points[index - 1]?.[0] || 0),
      Number(points[index]?.[1] || 0) - Number(points[index - 1]?.[1] || 0)
    );
  }
  return length;
}

function routeCandidateCost(candidate) {
  const keys = ['distance', 'grade', 'crossSlope', 'roughness', 'earthwork', 'scenic', 'diversity', 'total'];
  return Object.fromEntries(keys.map(key => [
    key,
    (candidate?.segmentCosts || []).reduce(
      (sum, segment) => sum + Number(segment?.breakdown?.[key] || 0),
      0
    )
  ]));
}

function numberControl(label, key, value, options = {}) {
  return `<label class="v011-field"><span>${escapeHtml(label)}</span><input data-v011-property="${escapeHtml(key)}" type="number" value="${Number(value ?? 0)}" step="${options.step ?? 0.1}" ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''}></label>`;
}

function compactNumber(value, precision = 3) {
  return Number(Number(value || 0).toFixed(precision));
}

function terrainPanel(object) {
  const properties = object.properties || {};
  const presets = foundation?.presets || [];
  const diagnostics = foundation?.terrainDiagnostics;
  const resolutionX = Number(properties.resolutionX || properties.resolution || 128);
  const resolutionZ = Number(properties.resolutionZ || properties.resolution || 128);
  const spacingX = properties.bounds ? (properties.bounds.maxX - properties.bounds.minX) / Math.max(1, resolutionX) : 0;
  const spacingZ = properties.bounds ? (properties.bounds.maxZ - properties.bounds.minZ) / Math.max(1, resolutionZ) : 0;
  const densityStatus = properties.densityLimited ? 'LIMIT REACHED' : Math.max(spacingX, spacingZ) > 2 ? 'COARSE' : 'OK';
  return `<section class="v011-authoring-panel" data-v011-panel="terrain">
    <div class="v011-panel-title"><div><small>WORLD FOUNDATION v0.11</small><strong>Terrain generator</strong></div><span>${escapeHtml(properties.preset || 'rollingHills')}</span></div>
    <label class="v011-field"><span>Landform preset</span><select id="v011TerrainPreset">${presets.map(preset => `<option value="${escapeHtml(preset.id)}" ${preset.id === properties.preset ? 'selected' : ''}>${escapeHtml(preset.label)}</option>`).join('')}</select></label>
    <div class="v011-grid">
      ${numberControl('Height', 'height', properties.height, { step: 0.5, min: 0, max: 1000 })}
      ${numberControl('Macro scale', 'macroScale', properties.macroScale, { step: 1, min: 8, max: 5000 })}
      ${numberControl('Detail scale', 'detailScale', properties.detailScale, { step: 1, min: 2, max: 1000 })}
      ${numberControl('Octaves', 'octaves', properties.octaves, { step: 1, min: 1, max: 10 })}
      ${numberControl('Domain warp', 'warpStrength', properties.warpStrength, { step: 1, min: 0, max: 500 })}
      ${numberControl('Mountain ridges', 'ridgeStrength', properties.ridgeStrength, { step: 0.05, min: 0, max: 1.5 })}
      ${numberControl('Plateau strength', 'plateauStrength', properties.plateauStrength, { step: 0.05, min: 0, max: 1 })}
      ${numberControl('Valley strength', 'valleyStrength', properties.valleyStrength, { step: 0.05, min: 0, max: 1.5 })}
      ${numberControl('Valley radius', 'valleyRadius', properties.valleyRadius, { step: 1, min: 4, max: 5000 })}
      ${numberControl('Canyon depth', 'canyonDepth', properties.canyonDepth, { step: 0.5, min: 0, max: 1000 })}
      ${numberControl('Canyon width', 'canyonWidth', properties.canyonWidth, { step: 1, min: 1, max: 2000 })}
      ${numberControl('Canyon floor', 'canyonFloorWidth', properties.canyonFloorWidth, { step: 0.5, min: 0.2, max: 500 })}
      ${numberControl('Canyon meander', 'canyonMeander', properties.canyonMeander, { step: 1, min: 0, max: 1000 })}
      ${numberControl('Island strength', 'islandStrength', properties.islandStrength, { step: 0.05, min: 0, max: 2 })}
      ${numberControl('Island radius', 'islandRadius', properties.islandRadius, { step: 1, min: 4, max: 10000 })}
      ${numberControl('Sea level', 'seaLevel', properties.seaLevel, { step: 0.5, min: -1000, max: 1000 })}
      ${numberControl('Seed', 'seed', properties.seed, { step: 1 })}
      ${numberControl('Expand step', 'expandStep', properties.expandStep, { step: 10, min: 1, max: 10000 })}
    </div>
    <div class="v011-expand-map">
      <button data-v011-expand="north" type="button">Expand north</button>
      <button data-v011-expand="west" type="button">Expand west</button>
      <button data-v011-expand="all" class="primary" type="button">Expand all</button>
      <button data-v011-expand="east" type="button">Expand east</button>
      <button data-v011-expand="south" type="button">Expand south</button>
    </div>
    <div class="v011-sculpt-controls">
      <div class="v011-panel-title"><div><small>LOCAL TERRAIN EDITING</small><strong>Non-destructive sculpt stamps</strong></div><span>${properties.sculptLayers?.length || 0} edits</span></div>
      <div class="v011-grid">
        <label class="v011-field"><span>Mode</span><select id="v011SculptMode"><option value="raise">Raise</option><option value="lower">Lower</option><option value="flatten">Flatten</option></select></label>
        ${numberControl('Radius', 'sculptRadius', 8, { step: 0.5, min: 0.25, max: 500 })}
        ${numberControl('Strength', 'sculptStrength', 2, { step: 0.1, min: 0.001, max: 1000 })}
        ${numberControl('Flatten height', 'sculptTargetHeight', properties.baseElevation || 0, { step: 0.25, min: -1000, max: 1000 })}
      </div>
      <div class="v011-actions"><button id="v011ToggleSculpt" type="button">${terrainSculptMode?.terrainId === object.id ? 'Finish sculpting' : 'Sculpt in viewport'}</button><button id="v011UndoSculpt" type="button">Undo last sculpt</button><button id="v011ClearSculpt" type="button">Clear sculpt layer</button></div>
      <p class="v011-note">Click terrain to apply a local reversible stamp. Global procedural controls remain available above.</p>
    </div>
    <div class="v011-readout"><span>Bounds</span><code>${properties.bounds ? `${properties.bounds.minX.toFixed(0)}, ${properties.bounds.minZ.toFixed(0)} → ${properties.bounds.maxX.toFixed(0)}, ${properties.bounds.maxZ.toFixed(0)}` : 'not migrated'}</code></div>
    <div class="v011-readout"><span>Mesh density</span><code>${spacingX.toFixed(2)} × ${spacingZ.toFixed(2)} m/vertex · ${densityStatus}</code></div>
    <div class="v011-readout"><span>Relief</span><code>${diagnostics ? diagnostics.relief.toFixed(2) : '—'} m</code></div>
    <div class="v011-readout"><span>Pattern risk</span><code>${escapeHtml(diagnostics?.repetitiveBandRisk || '—')}</code></div>
    <p class="v011-note">World expansion changes explicit terrain bounds. It does not scale terrain coordinates, path nodes, noise frequency, or existing object positions.</p>
  </section>`;
}

function pathPanel(object) {
  const properties = object.properties || {};
  const network = properties.pathNetwork;
  if (network?.schemaVersion !== 2) {
    return `<section class="v011-authoring-panel" data-v011-panel="path"><div class="v011-panel-title"><div><small>PATH NETWORK</small><strong>Migration required</strong></div></div><p class="v011-note">This path has not been migrated to the authoritative 3D Path Network. Save and reopen the project before editing it.</p></section>`;
  }
  const { index: selectedIndex, node: selectedNode } = pathNodeSelection(object);
  const runtime = activePathRuntime(object);
  const compilerDiagnostics = runtime?.compiled?.diagnostics;
  const invalidSegments = runtime?.compiled?.segments?.filter(segment => segment.construction.mode === 'invalid') || [];
  const runtimeState = !runtime ? 'compiling' : runtime.diagnostics.valid ? 'ready' : 'blocked';
  const constructionSummary = runtime?.compiled?.segments
    ?.map(segment => segment.construction.mode)
    .filter((mode, index, modes) => modes.indexOf(mode) === index)
    .join(' · ') || 'pending';
  const failureReasons = invalidSegments
    .map(segment => segment.construction.reason)
    .filter((reason, index, reasons) => reasons.indexOf(reason) === index)
    .join(' · ');
  const selectedSegment = network.segments.find(segment => segment.fromNode === selectedNode.id || segment.toNode === selectedNode.id) || network.segments[0];
  const draft = routeDraft(object);
  const generation = routeGenerationState.pathId === object.id ? routeGenerationState : { status: 'idle', candidates: [], selectedCandidate: 0, durationMs: 0, error: '' };
  const candidate = generation.candidates[generation.selectedCandidate];
  const cost = routeCandidateCost(candidate);
  const archetypeOptions = trailArchetypes().map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.archetype ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
  const constructionOptions = ['auto', 'conform', 'cut-fill', 'retaining-wall', 'bridge', 'tunnel', 'stairs']
    .map(mode => `<option value="${mode}" ${mode === selectedSegment?.constructionMode ? 'selected' : ''}>${mode}</option>`).join('');
  const suggestedHandles = suggestPathNodeHandles(network, selectedNode.id);
  const incomingHandle = selectedNode.incomingHandle || suggestedHandles.incomingHandle;
  const outgoingHandle = selectedNode.outgoingHandle || suggestedHandles.outgoingHandle;
  const manualHandlesAllowed = suggestedHandles.degree <= 2;
  const handleOptions = ['automatic', 'aligned', 'free']
    .map(mode => `<option value="${mode}" ${mode === selectedNode.handleMode ? 'selected' : ''} ${mode !== 'automatic' && !manualHandlesAllowed ? 'disabled' : ''}>${mode}</option>`).join('');
  return `<section class="v011-authoring-panel" data-v011-panel="path">
    <div class="v011-panel-title"><div><small>PATH NETWORK v2</small><strong>3D corridor authoring</strong></div><span>r${network.revision} · ${network.nodes.length} nodes</span></div>
    <div class="v012-runtime-status ${runtimeState}" data-v012-runtime-status="${runtimeState}">
      <strong>${runtimeState === 'ready' ? 'Compiled and usable' : runtimeState === 'blocked' ? 'Blocked — route is not gameplay-safe' : 'Compiling route diagnostics'}</strong>
      <span>${runtimeState === 'blocked'
        ? `${invalidSegments.length} invalid segment${invalidSegments.length === 1 ? '' : 's'} · ${escapeHtml(failureReasons || 'construction validation failed')}`
        : `${escapeHtml(constructionSummary)}${compilerDiagnostics ? ` · max grade ${Number(compilerDiagnostics.maximumGradePercent || 0).toFixed(1)}%` : ''}`}</span>
    </div>
    <button id="v011SplineEdit" class="button ${splineEditPathId === object.id ? 'primary' : 'subtle'}" type="button">${splineEditPathId === object.id ? 'Finish spline editing' : 'Edit nodes in viewport'}</button>
    <p class="v011-note"><strong>Viewport:</strong> left-drag moves a node over terrain. Shift-drag raises or lowers it. Right-click inserts a node into the nearest compiled segment.</p>
    <div class="v011-grid">
      <label class="v011-field"><span>Show this spline</span><input id="v012ShowSpline" type="checkbox" ${network.editor?.showSpline !== false ? 'checked' : ''}></label>
      <label class="v011-field"><span>Route cost overlay</span><input id="v012ShowRouteCosts" type="checkbox" ${network.editor?.showGrade === true ? 'checked' : ''}></label>
      <label class="v011-field"><span>Construction mode</span><select id="v012ConstructionMode">${constructionOptions}</select></label>
      <label class="v011-field"><span>Lock construction</span><input id="v012ConstructionLocked" type="checkbox" ${selectedSegment?.constructionLocked ? 'checked' : ''}></label>
      <label class="v011-field"><span>Civil Assist</span><input id="v012CivilAssist" type="checkbox" ${network.engineering?.civilAssist !== false ? 'checked' : ''}></label>
    </div>
    <div class="v011-node-editor">
      <div class="v011-panel-title"><div><small>SELECTED 3D NODE</small><strong>Node ${selectedIndex + 1}</strong></div><span>${escapeHtml(selectedNode.heightMode)}</span></div>
      <div class="v011-grid">
        <label class="v011-field"><span>X</span><input id="v012NodeX" type="number" step="0.1" value="${Number(selectedNode.position[0] || 0)}"></label>
        <label class="v011-field"><span>Y</span><input id="v012NodeY" type="number" step="0.1" value="${Number(selectedNode.position[1] || 0)}"></label>
        <label class="v011-field"><span>Z</span><input id="v012NodeZ" type="number" step="0.1" value="${Number(selectedNode.position[2] || 0)}"></label>
        <label class="v011-field"><span>Height mode</span><select id="v012HeightMode">${['terrain','offset','absolute'].map(mode=>`<option value="${mode}" ${mode===selectedNode.heightMode?'selected':''}>${mode}</option>`).join('')}</select></label>
        <label class="v011-field"><span>Terrain offset</span><input id="v012HeightOffset" type="number" step="0.1" value="${Number(selectedNode.heightOffset || 0)}"></label>
      </div>
      <div class="v011-actions v012-action-row"><button id="v012ApplyNode" class="primary" type="button">Apply 3D node</button><button id="v012SnapTerrain" type="button">Snap to terrain</button><button id="v012DeleteNode" type="button">Delete node</button><button id="v012UndoPath" type="button">Undo path edit</button><button id="v012RedoPath" type="button">Redo path edit</button></div>
      <div class="v012-handle-editor">
        <div class="v011-panel-title"><div><small>SPLINE HANDLES</small><strong>Curve direction and reach</strong></div><span>${escapeHtml(selectedNode.handleMode)}</span></div>
        <div class="v011-grid">
          <label class="v011-field"><span>Handle mode</span><select id="v012HandleMode">${handleOptions}</select></label>
          <label class="v011-field"><span>Aligned direction</span><select id="v012HandleAuthority"><option value="outgoing">Outgoing handle</option><option value="incoming">Incoming handle</option></select></label>
          <label class="v011-field"><span>Incoming X</span><input id="v012IncomingHandleX" data-v012-handle-vector type="number" step="0.1" value="${compactNumber(incomingHandle[0])}"></label>
          <label class="v011-field"><span>Incoming Y</span><input id="v012IncomingHandleY" data-v012-handle-vector type="number" step="0.1" value="${compactNumber(incomingHandle[1])}"></label>
          <label class="v011-field"><span>Incoming Z</span><input id="v012IncomingHandleZ" data-v012-handle-vector type="number" step="0.1" value="${compactNumber(incomingHandle[2])}"></label>
          <label class="v011-field"><span>Outgoing X</span><input id="v012OutgoingHandleX" data-v012-handle-vector type="number" step="0.1" value="${compactNumber(outgoingHandle[0])}"></label>
          <label class="v011-field"><span>Outgoing Y</span><input id="v012OutgoingHandleY" data-v012-handle-vector type="number" step="0.1" value="${compactNumber(outgoingHandle[1])}"></label>
          <label class="v011-field"><span>Outgoing Z</span><input id="v012OutgoingHandleZ" data-v012-handle-vector type="number" step="0.1" value="${compactNumber(outgoingHandle[2])}"></label>
        </div>
        <div class="v011-actions"><button id="v012ApplyHandles" type="button">Apply spline handles</button></div>
        <p class="v011-note">${manualHandlesAllowed
          ? 'Automatic derives a smooth tangent from neighboring nodes. Aligned keeps both handles collinear; choose which side controls direction. Free keeps both vectors independent.'
          : 'This is a junction node. Its shared approach geometry remains automatic; edit the connected approach nodes for predictable intersections.'}</p>
      </div>
    </div>
    <div class="v011-actions"><button id="v012ReverseNetwork" type="button">Reverse segment directions</button></div>
    <div class="v012-route-generator">
      <div class="v011-panel-title"><div><small>TERRAIN-AWARE TRAIL SOLVER</small><strong>Generate non-destructive route</strong></div><span>${escapeHtml(generation.status)}</span></div>
      <div class="v011-grid">
        <label class="v011-field"><span>Archetype</span><select id="v012RouteArchetype">${archetypeOptions}</select></label>
        <label class="v011-field"><span>Seed</span><input id="v012RouteSeed" type="number" step="1" value="${Number(draft.seed)}"></label>
        <label class="v011-field"><span>Start X</span><input id="v012RouteStartX" type="number" step="1" value="${Number(draft.startX)}"></label>
        <label class="v011-field"><span>Start Z</span><input id="v012RouteStartZ" type="number" step="1" value="${Number(draft.startZ)}"></label>
        <label class="v011-field"><span>Destination X</span><input id="v012RouteEndX" type="number" step="1" value="${Number(draft.endX)}"></label>
        <label class="v011-field"><span>Destination Z</span><input id="v012RouteEndZ" type="number" step="1" value="${Number(draft.endZ)}"></label>
        <label class="v011-field"><span>Forbidden rectangle</span><input id="v012UseRestriction" type="checkbox" ${draft.useRestriction?'checked':''}></label>
        <label class="v011-field"><span>Forbidden min X</span><input id="v012RestrictionMinX" type="number" step="1" value="${Number(draft.restrictionMinX)}"></label>
        <label class="v011-field"><span>Forbidden max X</span><input id="v012RestrictionMaxX" type="number" step="1" value="${Number(draft.restrictionMaxX)}"></label>
        <label class="v011-field"><span>Forbidden min Z</span><input id="v012RestrictionMinZ" type="number" step="1" value="${Number(draft.restrictionMinZ)}"></label>
        <label class="v011-field"><span>Forbidden max Z</span><input id="v012RestrictionMaxZ" type="number" step="1" value="${Number(draft.restrictionMaxZ)}"></label>
      </div>
      <div class="v011-actions v012-action-row"><button id="v012GenerateRoutes" class="primary" type="button" ${generation.status==='solving'?'disabled':''}>${generation.status==='solving'?'Solving on worker pool…':'Generate alternatives'}</button><button id="v012CancelRoutes" type="button">Cancel preview</button></div>
      ${generation.candidates.length?`<label class="v011-field"><span>Candidate</span><select id="v012RouteCandidate">${generation.candidates.map((item,index)=>`<option value="${index}" ${index===generation.selectedCandidate?'selected':''}>${escapeHtml(item.policy)} · ${item.points.length} points · ${Number(item.totalCost).toFixed(1)} cost</option>`).join('')}</select></label>`:''}
      ${candidate?`<div class="v012-cost-grid"><span>Length <strong>${routeCandidateLength(candidate).toFixed(1)} m</strong></span><span>Max grade <strong>${Number(candidate.diagnostics?.maximumGradePercent||0).toFixed(1)}%</strong></span><span>Solve wall <strong>${Number(generation.durationMs).toFixed(0)} ms</strong></span><span>Distance cost <strong>${cost.distance.toFixed(1)}</strong></span><span>Grade cost <strong>${cost.grade.toFixed(1)}</strong></span><span>Cross-slope cost <strong>${cost.crossSlope.toFixed(1)}</strong></span><span>Earthwork cost <strong>${cost.earthwork.toFixed(1)}</strong></span><span>Scenic cost <strong>${cost.scenic.toFixed(1)}</strong></span><span>Total cost <strong>${Number(candidate.totalCost||cost.total).toFixed(1)}</strong></span></div><div class="v012-cost-legend" aria-label="Route cost overlay legend"><span class="low">Low cost</span><span class="medium">Moderate</span><span class="high">High / invalid</span></div><div class="v011-readout"><span>Protected scene footprints</span><code>${generation.automaticRestrictionCount || 0}</code></div><div class="v011-readout"><span>Rejected search edges</span><code>${Number(candidate.diagnostics?.rejectedByRestriction||0)} restricted · ${Number(candidate.diagnostics?.rejectedByGrade||0)} grade</code></div><div class="v011-actions"><button id="v012CommitRoute" class="primary" type="button">Commit selected route</button></div>`:''}
      ${generation.error?`<p class="v012-error">${escapeHtml(generation.error)}</p>`:''}
      <p class="v011-note">Alternatives use the authored-natural terrain view, validate full segment grades, and remain previews until committed. First-pass trails do not deform terrain.</p>
    </div>
    <div class="v011-readout"><span>Network purpose</span><code>${escapeHtml(network.purpose)}</code></div>
    <div class="v011-readout"><span>Path class</span><code>${escapeHtml(network.pathClass)}</code></div>
    <div class="v011-readout"><span>History</span><code>${properties.pathNetworkUndo?.length || 0} undo · ${properties.pathNetworkRedo?.length || 0} redo</code></div>
  </section>`;
}

function referencePanel(object) {
  if (object.id !== 'block-main' && object.name !== 'Scene Block' && object.name !== 'Scale Reference Block') return '';
  return `<section class="v011-authoring-panel" data-v011-panel="reference"><div class="v011-panel-title"><div><small>STARTER REFERENCE</small><strong>Scale Reference Block</strong></div></div><p class="v011-note">This is only a starter scale, lighting, collision, and shadow reference. It has no hidden scene-management behavior and can be moved or deleted. A production animated character and Character Studio are separate roadmap systems—not disguised inside this box.</p></section>`;
}

function enhanceInspector() {
  const container = $('#inspectorContent');
  const object = selectedObject();
  if (!container || !object) return;
  const signature = `${object.id}:${currentSnapshot()?.state?.engine?.revision || 0}:${foundation?.terrainDiagnostics?.checkedAt || ''}:${splineEditPathId || ''}:${selectedPathNodeId || ''}:${terrainSculptMode?.terrainId || ''}:${routeGenerationRevision}:${routeGenerationState.status}:${routeGenerationState.selectedCandidate}`;
  if (container.dataset.v011Signature === signature && container.querySelector('[data-v011-panel]')) return;
  const selectedNode = pathNodeSelection(object);
  container.dataset.v011Signature = signature;
  container.querySelectorAll('[data-v011-panel]').forEach(node => node.remove());
  const reference = referencePanel(object);
  if (object.type === 'terrain') container.insertAdjacentHTML('beforeend', terrainPanel(object));
  if (object.type === 'path') container.insertAdjacentHTML('beforeend', pathPanel(object));
  if (reference) container.insertAdjacentHTML('beforeend', reference);

  if (['terrain', 'path'].includes(object.type)) {
    container.querySelectorAll('[data-number-path^="scale."]').forEach(input => {
      input.disabled = true;
      input.title = 'Terrain and path scale is locked. Use explicit world bounds, path width, and landform controls.';
    });
  }

  $('#v011TerrainPreset')?.addEventListener('change', event => updateTerrain(object.id, { preset: event.target.value }));
  container.querySelectorAll('[data-v011-panel="terrain"] [data-v011-property]').forEach(input => { if (input.dataset.v011Property.startsWith('sculpt')) return; input.addEventListener('change', () => updateTerrain(object.id, { [input.dataset.v011Property]: Number(input.value) })); });
  container.querySelectorAll('[data-v011-expand]').forEach(button => button.addEventListener('click', () => expandWorld(object.id, button.dataset.v011Expand)));
  $('#v011ToggleSculpt')?.addEventListener('click', () => {
    terrainSculptMode = terrainSculptMode?.terrainId === object.id ? null : {
      terrainId: object.id,
      mode: $('#v011SculptMode')?.value || 'raise',
      radius: Number(container.querySelector('[data-v011-property="sculptRadius"]')?.value || 8),
      strength: Number(container.querySelector('[data-v011-property="sculptStrength"]')?.value || 2),
      targetHeight: Number(container.querySelector('[data-v011-property="sculptTargetHeight"]')?.value || 0)
    };
    document.body.classList.toggle('v011-terrain-sculpting', Boolean(terrainSculptMode));
    enhanceInspector();
  });
  $('#v011UndoSculpt')?.addEventListener('click', () => terrainSculptAction(object.id, 'undo'));
  $('#v011ClearSculpt')?.addEventListener('click', () => terrainSculptAction(object.id, 'clear'));

  $('#v011SplineEdit')?.addEventListener('click', () => {
    splineEditPathId = splineEditPathId === object.id ? null : object.id;
    document.body.classList.toggle('v011-spline-editing', Boolean(splineEditPathId));
    enhanceInspector();
  });
  $('#v012ShowSpline')?.addEventListener('change', event => replacePathNetwork(object, {
    ...object.properties.pathNetwork,
    editor: { ...object.properties.pathNetwork.editor, showSpline: event.target.checked }
  }, 'Toggle spline visibility'));
  $('#v012ShowRouteCosts')?.addEventListener('change', event => replacePathNetwork(object, {
    ...object.properties.pathNetwork,
    editor: { ...object.properties.pathNetwork.editor, showGrade: event.target.checked }
  }, 'Toggle route cost overlay'));
  $('#v012ConstructionMode')?.addEventListener('change', () => updateSelectedConstruction(object, selectedNode.node));
  $('#v012ConstructionLocked')?.addEventListener('change', () => updateSelectedConstruction(object, selectedNode.node));
  $('#v012CivilAssist')?.addEventListener('change', event => replacePathNetwork(object, {
    ...object.properties.pathNetwork,
    engineering: { ...object.properties.pathNetwork.engineering, civilAssist: event.target.checked }
  }, 'Update Civil Assist'));
  $('#v012ApplyNode')?.addEventListener('click', () => applySelectedNode(object, selectedNode.node));
  $('#v012HandleMode')?.addEventListener('change', updateHandleInputState);
  $('#v012ApplyHandles')?.addEventListener('click', () => applySelectedNodeHandles(object, selectedNode.node));
  updateHandleInputState();
  $('#v012SnapTerrain')?.addEventListener('click', () => transactPathNetwork(object, {
    label: 'Snap node to terrain',
    operations: [{ type: 'set-node-height', nodeId: selectedNode.node.id, heightMode: 'terrain', heightOffset: 0 }]
  }));
  $('#v012DeleteNode')?.addEventListener('click', () => transactPathNetwork(object, {
    label: 'Delete path node',
    operations: [{ type: 'delete-node', nodeId: selectedNode.node.id }]
  }));
  $('#v012UndoPath')?.addEventListener('click', () => undoPathNetwork(object));
  $('#v012RedoPath')?.addEventListener('click', () => redoPathNetwork(object));
  $('#v012ReverseNetwork')?.addEventListener('click', () => transactPathNetwork(object, {
    label: 'Reverse path directions',
    operations: object.properties.pathNetwork.segments.map(segment => ({ type: 'reverse-segment', segmentId: segment.id }))
  }));
  for (const id of ['v012RouteArchetype','v012RouteSeed','v012RouteStartX','v012RouteStartZ','v012RouteEndX','v012RouteEndZ','v012UseRestriction','v012RestrictionMinX','v012RestrictionMaxX','v012RestrictionMinZ','v012RestrictionMaxZ']) {
    $(`#${id}`)?.addEventListener('change', () => captureRouteDraft(object));
  }
  $('#v012GenerateRoutes')?.addEventListener('click', () => generateRouteAlternatives(object));
  $('#v012CancelRoutes')?.addEventListener('click', () => cancelRoutePreview(object.id));
  $('#v012RouteCandidate')?.addEventListener('change', event => selectRouteCandidate(object, Number(event.target.value)));
  $('#v012CommitRoute')?.addEventListener('click', () => commitRoutePreview(object));
}

async function updateTerrain(id, properties) {
  try {
    await applyMutation(await api(`/api/v011/terrain/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);
    bridge()?.showToast?.('Terrain regenerated from stable world-space coordinates', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function expandWorld(id, direction) {
  const amount = Number(selectedObject()?.properties?.expandStep || 100);
  try {
    await applyMutation(await api(`/api/v011/terrain/${encodeURIComponent(id)}/expand`, { method: 'POST', body: { direction, amount } }), true);
    bridge()?.showToast?.(`Expanded world ${direction} by ${amount} units`, 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function terrainSculptAction(id, action) {
  try {
    const route = action === 'undo' ? '/api/v011/terrain/' + encodeURIComponent(id) + '/sculpt/undo' : '/api/v011/terrain/' + encodeURIComponent(id) + '/sculpt';
    const options = action === 'clear' ? { method: 'DELETE' } : { method: 'POST', body: {} };
    await applyMutation(await api(route, options), true);
    bridge()?.showToast?.(action === 'undo' ? 'Undid the last terrain sculpt stamp' : 'Cleared local terrain sculpt edits', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function replacePathNetwork(object, network, label) {
  try {
    const payload = await api(`/api/v012/path/${encodeURIComponent(object.id)}/network`, {
      method: 'PUT',
      body: {
        expectedRevision: object.properties.pathNetwork.revision,
        label,
        network
      }
    });
    await applyMutation(payload, true);
    bridge()?.showToast?.(`${label} · Path Network r${payload.network.revision}`, 'success');
    return payload;
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
    return null;
  }
}

async function transactPathNetwork(object, transaction) {
  try {
    const payload = await api(`/api/v012/path/${encodeURIComponent(object.id)}/transaction`, {
      method: 'POST',
      body: {
        ...transaction,
        expectedRevision: object.properties.pathNetwork.revision
      }
    });
    await applyMutation(payload, true);
    if (selectedPathNodeId && !payload.network.nodes.some(node => node.id === selectedPathNodeId)) {
      selectedPathNodeId = payload.network.nodes[Math.max(0, payload.network.nodes.length - 1)]?.id || null;
    }
    bridge()?.showToast?.(`${transaction.label || 'Path edit'} · r${payload.network.revision}`, 'success');
    return payload;
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
    return null;
  }
}

async function undoPathNetwork(object) {
  try {
    const payload = await api(`/api/v012/path/${encodeURIComponent(object.id)}/undo`, {
      method: 'POST',
      body: { expectedRevision: object.properties.pathNetwork.revision }
    });
    await applyMutation(payload, true);
    bridge()?.showToast?.(`Undid path edit · r${payload.network.revision}`, 'success');
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
  }
}

async function redoPathNetwork(object) {
  try {
    const payload = await api(`/api/v012/path/${encodeURIComponent(object.id)}/redo`, {
      method: 'POST',
      body: { expectedRevision: object.properties.pathNetwork.revision }
    });
    await applyMutation(payload, true);
    bridge()?.showToast?.(`Redid path edit · r${payload.network.revision}`, 'success');
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
  }
}

function applySelectedNode(object, node) {
  return transactPathNetwork(object, {
    label: 'Update 3D path node',
    operations: [{
      type: 'move-node',
      nodeId: node.id,
      position: [
        Number($('#v012NodeX')?.value || 0),
        Number($('#v012NodeY')?.value || 0),
        Number($('#v012NodeZ')?.value || 0)
      ],
      heightMode: $('#v012HeightMode')?.value || node.heightMode,
      heightOffset: Number($('#v012HeightOffset')?.value || 0)
    }]
  });
}

function updateHandleInputState() {
  const mode = $('#v012HandleMode')?.value || 'automatic';
  const disabled = mode === 'automatic';
  document.querySelectorAll('[data-v012-handle-vector]').forEach(input => {
    input.disabled = disabled;
  });
  const authority = $('#v012HandleAuthority');
  if (authority) authority.disabled = mode !== 'aligned';
}

function applySelectedNodeHandles(object, node) {
  return transactPathNetwork(object, {
    label: 'Update spline handles',
    operations: [{
      type: 'set-node-handles',
      nodeId: node.id,
      handleMode: $('#v012HandleMode')?.value || node.handleMode,
      primaryHandle: $('#v012HandleAuthority')?.value || 'outgoing',
      incomingHandle: [
        Number($('#v012IncomingHandleX')?.value || 0),
        Number($('#v012IncomingHandleY')?.value || 0),
        Number($('#v012IncomingHandleZ')?.value || 0)
      ],
      outgoingHandle: [
        Number($('#v012OutgoingHandleX')?.value || 0),
        Number($('#v012OutgoingHandleY')?.value || 0),
        Number($('#v012OutgoingHandleZ')?.value || 0)
      ]
    }]
  });
}

function updateSelectedConstruction(object, node) {
  const segment = object.properties.pathNetwork.segments.find(item => item.fromNode === node.id || item.toNode === node.id)
    || object.properties.pathNetwork.segments[0];
  if (!segment) return;
  return transactPathNetwork(object, {
    label: 'Update construction mode',
    operations: [{
      type: 'set-segment-construction',
      segmentId: segment.id,
      constructionMode: $('#v012ConstructionMode')?.value || segment.constructionMode,
      locked: $('#v012ConstructionLocked')?.checked === true
    }]
  });
}

function captureRouteDraft(object) {
  const draft = routeDraft(object);
  Object.assign(draft, {
    archetype: $('#v012RouteArchetype')?.value || draft.archetype,
    seed: Number($('#v012RouteSeed')?.value || 1),
    startX: Number($('#v012RouteStartX')?.value || 0),
    startZ: Number($('#v012RouteStartZ')?.value || 0),
    endX: Number($('#v012RouteEndX')?.value || 0),
    endZ: Number($('#v012RouteEndZ')?.value || 0),
    useRestriction: $('#v012UseRestriction')?.checked === true,
    restrictionMinX: Number($('#v012RestrictionMinX')?.value || 0),
    restrictionMaxX: Number($('#v012RestrictionMaxX')?.value || 0),
    restrictionMinZ: Number($('#v012RestrictionMinZ')?.value || 0),
    restrictionMaxZ: Number($('#v012RestrictionMaxZ')?.value || 0)
  });
  return draft;
}

function pathGenerationPool() {
  if (!routeGenerationPool) {
    const logicalProcessors = Math.max(2, Number(navigator.hardwareConcurrency || 4));
    routeGenerationPool = new PathGenerationWorkerPool({
      workerCount: Math.min(4, logicalProcessors - 1)
    });
  }
  return routeGenerationPool;
}

function previewPathObject(object, candidate, previewRevision) {
  const solved = routeGenerationState.solveResult;
  const network = trailCandidateToPathNetwork(candidate, {
    id: '__path-network-preview__',
    purpose: `${object.name} terrain-aware route preview`,
    terrainRevision: solved?.terrainRevision
  });
  return {
    id: '__path-network-preview__',
    type: 'path',
    name: 'Route Preview',
    visible: true,
    locked: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      ...object.properties,
      color: '#20c8e8',
      showSpline: true,
      previewOnly: true,
      previewRevision,
      pathNetwork: network
    }
  };
}

function showRouteCandidate(object) {
  const candidate = routeGenerationState.candidates[routeGenerationState.selectedCandidate];
  bridge()?.renderer?.()?.setPathPreview(candidate ? previewPathObject(object, candidate, routeGenerationRevision) : null);
}

function selectRouteCandidate(object, index) {
  routeGenerationState.selectedCandidate = Math.max(0, Math.min(routeGenerationState.candidates.length - 1, Number(index || 0)));
  routeGenerationRevision += 1;
  showRouteCandidate(object);
  enhanceInspector();
}

function cancelRoutePreview(pathId) {
  if (routeGenerationPool) {
    for (const policy of ['balanced', 'shortest', 'lowest-grade', 'scenic']) {
      routeGenerationPool.cancel(`${pathId}:route:${policy}`);
    }
  }
  bridge()?.renderer?.()?.setPathPreview(null);
  routeGenerationState = { status: 'idle', pathId: null, candidates: [], selectedCandidate: 0, durationMs: 0, error: '' };
  routeGenerationRevision += 1;
  enhanceInspector();
}

async function generateRouteAlternatives(object) {
  const draft = captureRouteDraft(object);
  const terrain = terrainObject();
  if (!terrain) return bridge()?.showToast?.('A visible authoritative terrain is required.', 'error');
  cancelRoutePreview(object.id);
  const revision = ++routeGenerationRevision;
  const policies = ['balanced', 'shortest', 'lowest-grade', 'scenic'];
  const snapshot = currentSnapshot();
  const profile = trailArchetypes().find(item => item.id === draft.archetype);
  const automaticRestrictions = routeRestrictionsFromScene({
    scene: snapshot?.scene,
    assets: snapshot?.state?.assets,
    excludeObjectIds: [object.id],
    clearance: Math.max(0.5, Number(profile?.clearance || profile?.width || 1) * 0.5)
  });
  const manualRestrictions = draft.useRestriction ? [{
    minX: Math.min(draft.restrictionMinX, draft.restrictionMaxX),
    maxX: Math.max(draft.restrictionMinX, draft.restrictionMaxX),
    minZ: Math.min(draft.restrictionMinZ, draft.restrictionMaxZ),
    maxZ: Math.max(draft.restrictionMinZ, draft.restrictionMaxZ)
  }] : [];
  const restrictions = [...automaticRestrictions, ...manualRestrictions];
  routeGenerationState = {
    status: 'solving',
    pathId: object.id,
    candidates: [],
    selectedCandidate: 0,
    durationMs: 0,
    error: '',
    automaticRestrictionCount: automaticRestrictions.length
  };
  enhanceInspector();
  const startedAt = performance.now();
  try {
    const settled = await Promise.allSettled(policies.map((policy, index) => pathGenerationPool().submit({
      key: `${object.id}:route:${policy}`,
      revision,
      priority: policies.length - index,
      payload: {
        terrain,
        tileSize: terrain.properties?.chunkSize,
        halo: 1,
        options: {
          start: [draft.startX, draft.startZ],
          end: [draft.endX, draft.endZ],
          archetype: draft.archetype,
          candidatePolicies: [policy],
          candidateCount: 1,
          restrictions,
          seed: draft.seed + index * 7919
        }
      }
    })));
    if (revision !== routeGenerationRevision) return;
    const successful = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .filter(result => result.result?.candidates?.length);
    const candidates = successful.map(result => result.result.candidates[0]);
    if (!candidates.length) {
      const reasons = settled.map(result => result.status === 'rejected'
        ? result.reason?.message
        : result.value?.result?.failures?.[0]?.reason).filter(Boolean);
      throw new Error(`No feasible route was found. ${reasons.join(' · ')}`);
    }
    routeGenerationState = {
      status: 'preview',
      pathId: object.id,
      candidates,
      selectedCandidate: 0,
      durationMs: performance.now() - startedAt,
      error: '',
      solveResult: successful[0].result,
      automaticRestrictionCount: automaticRestrictions.length
    };
    routeGenerationRevision += 1;
    showRouteCandidate(object);
    bridge()?.showToast?.(`Generated ${candidates.length} terrain-aware alternatives`, 'success');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    routeGenerationState = {
      status: 'failed',
      pathId: object.id,
      candidates: [],
      selectedCandidate: 0,
      durationMs: performance.now() - startedAt,
      error: error.message,
      automaticRestrictionCount: automaticRestrictions.length
    };
    routeGenerationRevision += 1;
    bridge()?.showToast?.(error.message, 'error');
  }
  enhanceInspector();
}

async function commitRoutePreview(object) {
  const candidate = routeGenerationState.pathId === object.id
    ? routeGenerationState.candidates[routeGenerationState.selectedCandidate]
    : null;
  if (!candidate) return;
  const network = trailCandidateToPathNetwork(candidate, {
    id: object.id,
    purpose: `${object.name} terrain-aware ${candidate.archetype}`,
    terrainRevision: routeGenerationState.solveResult?.terrainRevision
  });
  bridge()?.renderer?.()?.setPathPreview(null);
  const result = await replacePathNetwork(object, network, `Commit ${candidate.policy} route`);
  if (result) {
    routeGenerationState = { status: 'idle', pathId: null, candidates: [], selectedCandidate: 0, durationMs: 0, error: '' };
    routeGenerationRevision += 1;
  } else showRouteCandidate(object);
}

async function updatePathNode(id, index, x, z) {
  try {
    await applyMutation(await api('/api/v011/path/' + encodeURIComponent(id) + '/node/' + index, { method: 'PATCH', body: { x, z } }), true);
    selectedSplineNodeIndex = index;
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function insertPathNode(id, index, point) {
  try {
    const x = Number(point?.[0] || 0) + 0.01;
    const z = Number(point?.[1] || 0) + 0.01;
    await applyMutation(await api('/api/v011/path/' + encodeURIComponent(id) + '/node', { method: 'POST', body: { x, z, index } }), true);
    selectedSplineNodeIndex = index;
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function deletePathNode(id, index) {
  try {
    await applyMutation(await api('/api/v011/path/' + encodeURIComponent(id) + '/node/' + index, { method: 'DELETE' }), true);
    selectedSplineNodeIndex = Math.max(0, index - 1);
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function updatePath(id, properties) {
  try {
    await applyMutation(await api(`/api/v011/path/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);
    bridge()?.showToast?.('Spline and grade profile updated', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function pathAction(id, action, body = {}) {
  try {
    await applyMutation(await api(`/api/v011/path/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }), true);
    if (action === 'split') { splineEditPathId = null; selectedSplineNodeIndex = null; }
    bridge()?.showToast?.(action === 'split' ? 'Path split into connected spline objects' : 'Path direction reversed', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

function installToolbar() {
  let input = $('#splineToggle');
  if (!input) {
    const grid = $('#gridToggle')?.closest('label');
    if (!grid) return;
    const label = document.createElement('label');
    label.className = 'toolbar-check';
    label.innerHTML = '<input id="splineToggle" type="checkbox" checked><span>Splines</span>';
    grid.insertAdjacentElement('afterend', label);
    input = $('#splineToggle');
  }
  if (input.dataset.v011Bound) return;
  input.dataset.v011Bound = 'true';
  input.addEventListener('change', async event => {
    try {
      applyPayload(await api('/api/v011/scene-settings', { method: 'PATCH', body: { splinesVisible: event.target.checked } }));
    } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
  });
}

function refreshToolbar() {
  installToolbar();
  const snapshot = currentSnapshot();
  if ($('#splineToggle') && snapshot?.scene) $('#splineToggle').checked = snapshot.scene.settings?.splinesVisible !== false;
}

function installOverlay() {
  const wrap = $('#viewportWrap');
  if (!wrap || $('#splineNodeOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'splineNodeOverlay';
  overlay.className = 'spline-node-overlay';
  wrap.appendChild(overlay);
}

function renderNodeOverlay() {
  overlayFrame = requestAnimationFrame(renderNodeOverlay);
  const overlay = $('#splineNodeOverlay');
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  if (!overlay || !snapshot || !renderer || !splineEditPathId || snapshot.scene.settings?.splinesVisible === false) {
    if (overlay) overlay.replaceChildren();
    return;
  }
  const authoritativePath = snapshot.scene.objects.find(object => object.id === splineEditPathId && object.type === 'path');
  const path = draggingNode?.pathId === splineEditPathId
    ? draggingNode.previewPath
    : authoritativePath;
  if (!path?.properties?.pathNetwork) { overlay.replaceChildren(); return; }
  const nodes = path.properties.pathNetwork.nodes || [];
  const existing = new Map([...overlay.querySelectorAll('[data-spline-node]')].map(node => [Number(node.dataset.splineNode), node]));
  nodes.forEach((node, index) => {
    const terrainY = renderer.terrainHeightForScene?.(snapshot.scene, node.position[0], node.position[2]) ?? 0;
    const y = node.heightMode === 'absolute' ? node.position[1] : terrainY + (node.heightMode === 'offset' ? Number(node.heightOffset || 0) : 0);
    const screen = renderer.worldToScreen?.(snapshot.camera, [node.position[0], y + 0.55, node.position[2]]);
    let handle = existing.get(index);
    if (!handle) {
      handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'spline-node-handle';
      handle.dataset.splineNode = String(index);
      handle.addEventListener('pointerdown', beginNodeDrag);
      overlay.appendChild(handle);
    }
    existing.delete(index);
    if (!screen?.visible) { handle.hidden = true; return; }
    handle.hidden = false;
    handle.classList.toggle('selected', node.id === selectedPathNodeId);
    handle.title = `Node ${index + 1} · ${node.heightMode} · ${y.toFixed(2)} m`;
    handle.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    handle.textContent = String(index + 1);
  });
  existing.forEach(node => node.remove());
}

function beginNodeDrag(event) {
  event.preventDefault();
  event.stopPropagation();
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === splineEditPathId);
  if (!path) return;
  selectedSplineNodeIndex = Number(event.currentTarget.dataset.splineNode);
  const node = path.properties?.pathNetwork?.nodes?.[selectedSplineNodeIndex];
  if (!node) return;
  selectedPathNodeId = node.id;
  const renderer = bridge()?.renderer?.();
  draggingNode = {
    pathId: path.id,
    nodeId: node.id,
    index: selectedSplineNodeIndex,
    pointerId: event.pointerId,
    startClientY: event.clientY,
    startPosition: [...node.position],
    startHeightMode: node.heightMode,
    startHeightOffset: node.heightOffset,
    vertical: event.shiftKey === true,
    previewPath: createPathNodeDragPreview(path, node.id),
    restorePreview: renderer?.pathPreview ? structuredClone(renderer.pathPreview) : null
  };
  enhanceInspector();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', dragNode, true);
  window.addEventListener('pointerup', finishNodeDrag, true);
}

function flushNodeDragPreview() {
  pathDragPreviewFrame = 0;
  if (!draggingNode?.previewPath) return;
  bridge()?.renderer?.()?.setPathPreview(draggingNode.previewPath);
}

function scheduleNodeDragPreview() {
  if (!pathDragPreviewFrame) pathDragPreviewFrame = requestAnimationFrame(flushNodeDragPreview);
}

function dragNode(event) {
  if (!draggingNode) return;
  event.preventDefault();
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  const node = pathNodeFromDragPreview(draggingNode.previewPath, draggingNode.nodeId);
  if (!node) return;
  if (draggingNode.vertical || event.shiftKey) {
    draggingNode.vertical = true;
    updatePathNodeDragPreview(draggingNode.previewPath, draggingNode.nodeId, {
      position: [node.position[0], draggingNode.startPosition[1] - (event.clientY - draggingNode.startClientY) * 0.15, node.position[2]],
      heightMode: 'absolute',
      heightOffset: 0
    });
  } else {
    const point = renderer?.terrainPointFromScreen?.(snapshot.scene, snapshot.camera, event.clientX, event.clientY);
    if (!point) return;
    updatePathNodeDragPreview(draggingNode.previewPath, draggingNode.nodeId, {
      position: [point[0], node.heightMode === 'absolute' ? node.position[1] : point[1], point[2]]
    });
  }
  scheduleNodeDragPreview();
}

async function finishNodeDrag(event) {
  if (!draggingNode) return;
  event.preventDefault();
  window.removeEventListener('pointermove', dragNode, true);
  window.removeEventListener('pointerup', finishNodeDrag, true);
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === draggingNode.pathId);
  const drag = draggingNode;
  const node = pathNodeFromDragPreview(drag.previewPath, drag.nodeId);
  if (pathDragPreviewFrame) {
    cancelAnimationFrame(pathDragPreviewFrame);
    pathDragPreviewFrame = 0;
  }
  draggingNode = null;
  bridge()?.renderer?.()?.setPathPreview(drag.restorePreview);
  if (!node) return;
  await transactPathNetwork(path, {
    label: drag.vertical ? 'Raise or lower path node' : 'Move path node',
    operations: [{
      type: 'move-node',
      nodeId: drag.nodeId,
      position: [...node.position],
      heightMode: node.heightMode,
      heightOffset: node.heightOffset
    }]
  });
}

function installViewportEditing() {
  const canvas = $('#viewport');
  if (!canvas || canvas.dataset.v011EditingBound) return;
  canvas.dataset.v011EditingBound = 'true';
  canvas.addEventListener('click', async event => {
    if (!terrainSculptMode || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const snapshot = currentSnapshot();
    const point = bridge()?.renderer?.()?.terrainPointFromScreen?.(snapshot.scene, snapshot.camera, event.clientX, event.clientY);
    if (!point) return bridge()?.showToast?.('The sculpt cursor did not hit terrain.', 'error');
    try {
      await applyMutation(await api('/api/v011/terrain/' + encodeURIComponent(terrainSculptMode.terrainId) + '/sculpt', { method: 'POST', body: { ...terrainSculptMode, x: point[0], z: point[2], targetHeight: terrainSculptMode.mode === 'flatten' ? terrainSculptMode.targetHeight : point[1] } }), true);
      bridge()?.showToast?.('Applied ' + terrainSculptMode.mode + ' terrain sculpt', 'success');
    } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
  }, true);
  canvas.addEventListener('mousedown', event => {
    if (!splineEditPathId) return;
    if (event.button === 0 && event.target === canvas) {
      const handle = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-spline-node]');
      if (handle) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
  }, true);
  canvas.addEventListener('contextmenu', async event => {
    if (!splineEditPathId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const snapshot = currentSnapshot();
    const point = bridge()?.renderer?.()?.terrainPointFromScreen?.(snapshot.scene, snapshot.camera, event.clientX, event.clientY);
    if (!point) return bridge()?.showToast?.('The cursor did not hit terrain.', 'error');
    const path = snapshot.scene.objects.find(object => object.id === splineEditPathId);
    const nearest = nearestCompiledStation(activePathRuntime(path)?.compiled, point);
    if (!nearest) return bridge()?.showToast?.('No compiled path segment was found.', 'error');
    const nodeId = `${path.id}:node:${Date.now().toString(36)}`;
    selectedPathNodeId = nodeId;
    await transactPathNetwork(path, {
      label: 'Insert path node',
      operations: [{
        type: 'insert-node',
        segmentId: nearest.segmentId,
        node: { id: nodeId, position: [point[0], point[1], point[2]], heightMode: 'terrain' }
      }]
    });
  }, true);
}

function watchInspector() {
  const target = $('#inspectorContent');
  if (!target || inspectorObserver) return;
  inspectorObserver = new MutationObserver(() => {
    if (inspectorEnhanceQueued) return;
    inspectorEnhanceQueued = true;
    queueMicrotask(() => {
      inspectorEnhanceQueued = false;
      enhanceInspector();
    });
  });
  inspectorObserver.observe(target, { childList: true, subtree: false });
}

async function bootstrap() {
  const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('v011-bootstrap')||(()=>{});
  const deadline = Date.now() + 15000;
  while (!bridge() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (!bridge()) return;
  installToolbar();
  installOverlay();
  installViewportEditing();
  watchInspector();
  await refreshFoundation();
  renderNodeOverlay();
  window.addEventListener('omniforge:apply-state', () => queueMicrotask(() => {
    const nextSignature = currentFoundationSignature();
    if (nextSignature !== foundationSignature) refreshFoundation();
    enhanceInspector();
  }));
  finishDiagnostic({ready:true});
}

bootstrap();
