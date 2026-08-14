import { sharedPathGenerationWorkerPool } from './path-network/generation-pool.js';
import { trailArchetypes } from './path-network/archetypes.js';
import { trailCandidateToPathNetwork } from './path-network/trail-solver.js';
import { nearestCompiledScreenStation } from './path-network/editor-screen-picking.js';
import {
  completePathInsertGesture,
  contextMenuPathInsertDecision,
  createPathInsertGesture,
  updatePathInsertGesture
} from './path-network/editor-insert-gesture.js';
import { PATH_BRIDGE_STYLES } from './path-network/model.js';
import { pathCrossSectionProfiles } from './path-network/cross-section-profiles.js';
import { pathSurfaceDetailProfiles } from './path-network/surface-detail-profiles.js';
import {
  advancePathNodeDragGesture,
  createPathNodeDragGesture,
  shouldCommitPathNodeDragGesture
} from './path-network/editor-drag-preview.js';
import {
  createPathNodeGroupPreview,
  pathNodeGroupMoveOperations,
  prunePathNodeSelection,
  togglePathNodeSelection,
  updatePathNodeGroupPreview
} from './path-network/editor-selection.js';
import { samplePathEditorCurvePreview } from './path-network/editor-curve-preview.js';
import {
  intersectPathHandleRayCameraPlane,
  pathHandleEndpoints,
  previewPathHandleDrag,
  resolvePathNodePosition
} from './path-network/editor-handle-preview.js';
import { suggestPathNodeHandles } from './path-network/transactions.js';
import { routeRestrictionsFromScene } from './path-network/world-constraints.js';
import { assessCompiledPathEditAuthority } from './path-network/editor-runtime-authority.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

let foundation = null;
let splineEditPathId = null;
let selectedSplineNodeIndex = null;
let terrainSculptMode = null;
let draggingNode = null;
let draggingHandle = null;
let inspectorObserver = null;
let inspectorEnhanceQueued = false;
let overlayFrame = 0;
let foundationRefreshPromise = null;
let foundationSignature = '';
let selectedPathNodeId = null;
let selectedPathNodeIds = new Set();
let selectedPathSegmentId = null;
let pathSelectionOwnerId = null;
let routeGenerationRevision = 0;
let routeGenerationPool = null;
let pathDragPreviewFrame = 0;
let pendingPathInsertGesture = null;
let completedPathInsertGesture = null;
let lastPathInsertGesture = null;
let routeGenerationState = {
  status: 'idle',
  pathId: null,
  candidates: [],
  selectedCandidate: 0,
  durationMs: 0,
  error: ''
};
const routeDrafts = new Map();
const pathDiagnosticModes = new Map();

function pathDiagnosticMode(object) {
  if (pathDiagnosticModes.has(object.id)) return pathDiagnosticModes.get(object.id);
  const editor = object.properties?.pathNetwork?.editor || {};
  const mode = editor.showConstructionBounds ? 'construction'
    : editor.showCutFill ? 'cut-fill'
      : editor.showCurvature ? 'curvature'
        : editor.showGrade ? 'grade' : 'none';
  pathDiagnosticModes.set(object.id, mode);
  return mode;
}


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

function compiledPathEditAuthority(object) {
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  if (!snapshot?.scene || !renderer) return assessCompiledPathEditAuthority({ scene: snapshot?.scene, pathObject: object });
  const expectedSignature = renderer.pathRenderSignature?.(snapshot.scene, { fresh: true });
  const generationDiagnostics = renderer.pathRenderGeneration?.diagnostics?.()
    || renderer.getRenderDiagnostics?.()?.pathRenderGeneration
    || null;
  const runtime = renderer.scenePathRuntimes?.(snapshot.scene)
    ?.find(item => item.pathObjectId === object?.id) || null;
  return assessCompiledPathEditAuthority({
    scene: snapshot.scene,
    pathObject: object,
    runtime,
    expectedSignature,
    generationDiagnostics
  });
}

function pathNodeSelection(object) {
  ensurePathSelectionScope(object);
  const nodes = object?.properties?.pathNetwork?.nodes || [];
  const middle = Math.max(0, Math.floor((nodes.length || 1) / 2));
  let selection = prunePathNodeSelection(object?.properties?.pathNetwork, {
    nodeIds: selectedPathNodeIds,
    primaryNodeId: selectedPathNodeId
  });
  let index = selection.primaryNodeId ? nodes.findIndex(node => node.id === selection.primaryNodeId) : -1;
  if (index < 0) index = Math.max(0, Math.min(Math.max(0, nodes.length - 1), Number(selectedSplineNodeIndex ?? middle)));
  const node = nodes[index] || { id: null, position: [0, 0, 0], heightMode: 'terrain', heightOffset: 0 };
  selectedPathNodeId = node.id;
  if (node.id && !selection.nodeIds.length) selection = { nodeIds: [node.id], primaryNodeId: node.id };
  selectedPathNodeIds = new Set(selection.nodeIds);
  return { index, node, point: node.position, nodeIds: selection.nodeIds };
}

function ensurePathSelectionScope(object) {
  const nextOwnerId = object?.type === 'path' ? String(object.id || '') : '';
  if (pathSelectionOwnerId === nextOwnerId) return;
  pathSelectionOwnerId = nextOwnerId;
  selectedPathNodeId = null;
  selectedPathNodeIds = new Set();
  selectedPathSegmentId = null;
  selectedSplineNodeIndex = null;
}

function setPathNodeSelection(object, nodeId, { additive = false, preserveGroup = false } = {}) {
  ensurePathSelectionScope(object);
  const network = object?.properties?.pathNetwork;
  if (!network) return { nodeIds: [], primaryNodeId: null };
  const current = prunePathNodeSelection(network, {
    nodeIds: selectedPathNodeIds,
    primaryNodeId: selectedPathNodeId
  });
  const id = String(nodeId || '');
  let next;
  if (preserveGroup && current.nodeIds.includes(id)) {
    next = { nodeIds: [...current.nodeIds], primaryNodeId: id };
  } else {
    next = togglePathNodeSelection(network, current, id, { additive });
  }
  selectedPathNodeIds = new Set(next.nodeIds);
  selectedPathNodeId = next.primaryNodeId;
  selectedSplineNodeIndex = network.nodes.findIndex(node => node.id === next.primaryNodeId);
  return next;
}

function resolveEditorNodePosition(scene, renderer, node) {
  return resolvePathNodePosition(node, {
    terrainHeightAt: (x, z) => renderer?.terrainHeightForScene?.(scene, x, z)
  });
}

function pathSegmentSelection(object, node = null) {
  ensurePathSelectionScope(object);
  const network = object?.properties?.pathNetwork;
  const segments = network?.segments || [];
  let segment = selectedPathSegmentId
    ? segments.find(item => item.id === selectedPathSegmentId)
    : null;
  if (!segment && node?.id) {
    segment = segments.find(item => item.fromNode === node.id || item.toNode === node.id) || null;
  }
  segment ||= segments[0] || null;
  selectedPathSegmentId = segment?.id || null;
  return { segment, segments };
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
  const { index: selectedIndex, node: selectedNode, nodeIds: selectedNodeIdsForPanel } = pathNodeSelection(object);
  const diagnosticOverlay = pathDiagnosticMode(object);
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
  const { segment: selectedSegment } = pathSegmentSelection(object, selectedNode);
  const selectedNodeDegree = network.segments.filter(segment => segment.fromNode === selectedNode.id || segment.toNode === selectedNode.id).length;
  const selectedNodeCanSplit = selectedNodeDegree === 2 && selectedNode.locked !== true;
  const nodeIndexById = new Map(network.nodes.map((node, index) => [node.id, index + 1]));
  const segmentOptions = network.segments.map((segment, index) => {
    const from = nodeIndexById.get(segment.fromNode) || '?';
    const to = nodeIndexById.get(segment.toNode) || '?';
    return `<option value="${escapeHtml(segment.id)}" ${segment.id === selectedSegment?.id ? 'selected' : ''}>Segment ${index + 1} · node ${from} → ${to}</option>`;
  }).join('');
  const draft = routeDraft(object);
  const generation = routeGenerationState.pathId === object.id ? routeGenerationState : { status: 'idle', candidates: [], selectedCandidate: 0, durationMs: 0, error: '' };
  const candidate = generation.candidates[generation.selectedCandidate];
  const cost = routeCandidateCost(candidate);
  const archetypeOptions = trailArchetypes().map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.archetype ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
  const constructionOptions = ['auto', 'conform', 'cut-fill', 'retaining-wall', 'bridge', 'tunnel', 'stairs']
    .map(mode => `<option value="${mode}" ${mode === selectedSegment?.constructionMode ? 'selected' : ''}>${mode}</option>`).join('');
  const crossSectionProfiles = pathCrossSectionProfiles();
  const selectedCrossSectionProfile = selectedSegment?.crossSectionProfile?.profileId || 'dirt-road';
  const crossSectionOptions = crossSectionProfiles
    .map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === selectedCrossSectionProfile ? 'selected' : ''}>${escapeHtml(profile.label)}</option>`)
    .join('');
  const selectedProfileDefinition = crossSectionProfiles.find(profile => profile.id === selectedCrossSectionProfile)
    || crossSectionProfiles.find(profile => profile.id === 'dirt-road');
  const surfaceDetailProfiles = pathSurfaceDetailProfiles();
  const selectedSurfaceDetailProfile = selectedSegment?.surfaceDetailProfile?.profileId || 'weathered-dirt-road';
  const surfaceDetailOptions = surfaceDetailProfiles
    .map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === selectedSurfaceDetailProfile ? 'selected' : ''}>${escapeHtml(profile.label)}</option>`)
    .join('');
  const selectedSurfaceDetailDefinition = surfaceDetailProfiles.find(profile => profile.id === selectedSurfaceDetailProfile)
    || surfaceDetailProfiles.find(profile => profile.id === 'weathered-dirt-road');
  const selectedSurfaceDetail = selectedSegment?.surfaceDetailProfile
    || selectedSurfaceDetailDefinition?.values
    || {};
  const bridgeLabels = {
    auto: 'Auto — match span and path type',
    'timber-trestle': 'Timber trestle',
    'stone-arch': 'Stone arch',
    'steel-girder': 'Steel girder',
    'masonry-causeway': 'Masonry causeway',
    'rope-footbridge': 'Rope footbridge'
  };
  const bridgeStyle = selectedSegment?.structureProfile?.bridgeStyle || 'auto';
  const bridgeOptions = PATH_BRIDGE_STYLES
    .map(style => `<option value="${style}" ${style === bridgeStyle ? 'selected' : ''}>${escapeHtml(bridgeLabels[style] || style)}</option>`)
    .join('');
  const activeBridgeSelections = (runtime?.geometry?.bridgeSelections || [])
    .filter(item => item.segmentId === selectedSegment?.id);
  const suggestedHandles = suggestPathNodeHandles(network, selectedNode.id);
  const incomingHandle = selectedNode.incomingHandle || suggestedHandles.incomingHandle;
  const outgoingHandle = selectedNode.outgoingHandle || suggestedHandles.outgoingHandle;
  const manualHandlesAllowed = suggestedHandles.degree <= 2;
  const handleOptions = ['automatic', 'aligned', 'free']
    .map(mode => `<option value="${mode}" ${mode === selectedNode.handleMode ? 'selected' : ''} ${mode !== 'automatic' && !manualHandlesAllowed ? 'disabled' : ''}>${mode}</option>`).join('');
  const joinablePaths = (currentSnapshot()?.scene?.objects || [])
    .filter(item => (
      item.type === 'path'
      && item.id !== object.id
      && item.properties?.pathNetwork?.schemaVersion === 2
    ));
  const joinOptions = joinablePaths
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${item.properties.pathNetwork.nodes.length} nodes</option>`)
    .join('');
  return `<section class="v011-authoring-panel" data-v011-panel="path">
    <div class="v011-panel-title"><div><small>PATH NETWORK v2</small><strong>3D corridor authoring</strong></div><span>r${network.revision} · ${network.nodes.length} nodes</span></div>
    <div class="v012-runtime-status ${runtimeState}" data-v012-runtime-status="${runtimeState}">
      <strong>${runtimeState === 'ready' ? 'Compiled and usable' : runtimeState === 'blocked' ? 'Blocked — route is not gameplay-safe' : 'Compiling route diagnostics'}</strong>
      <span>${runtimeState === 'blocked'
        ? `${invalidSegments.length} invalid segment${invalidSegments.length === 1 ? '' : 's'} · ${escapeHtml(failureReasons || 'construction validation failed')}`
        : `${escapeHtml(constructionSummary)}${compilerDiagnostics ? ` · max grade ${Number(compilerDiagnostics.maximumGradePercent || 0).toFixed(1)}%` : ''}`}</span>
    </div>
    <div class="v012-cross-section-editor">
      <div class="v011-panel-title"><div><small>ROAD PROFILE</small><strong>One cross-section authority</strong></div><span>${escapeHtml(selectedCrossSectionProfile)}</span></div>
      <label class="v011-field"><span>Editing segment</span><select id="v012SelectedSegment">${segmentOptions}</select></label>
      <label class="v011-field"><span>Street or trail type</span><select id="v012CrossSectionProfile">${crossSectionOptions}</select></label>
      <p id="v012CrossSectionDescription" class="v011-note">${escapeHtml(selectedProfileDefinition?.description || '')}</p>
      <div class="v011-actions v012-action-row"><button id="v012ApplySegmentProfile" type="button">Apply to selected segment</button><button id="v012ApplyNetworkProfile" class="primary" type="button">Apply to whole path</button></div>
      <p class="v011-note">The same profile drives the visible surface, terrain support, gutters, curbs, sidewalks, collision, navigation, foliage clearance, and saved project state.</p>
      <label class="v011-field"><span>Surface character</span><select id="v012SurfaceDetailProfile">${surfaceDetailOptions}</select></label>
      <p id="v012SurfaceDetailDescription" class="v011-note">${escapeHtml(selectedSurfaceDetailDefinition?.description || '')}</p>
      <details class="v012-surface-detail-editor">
        <summary>Fine tune surface details</summary>
        <div class="v011-grid">
          <label class="v011-field"><span>Pattern seed</span><input id="v012SurfaceSeed" type="number" step="1" value="${Number(selectedSurfaceDetail.seed ?? 2718)}"></label>
          <label class="v011-field"><span>Puddle coverage</span><input id="v012PuddleCoverage" type="number" min="0" max="0.75" step="0.01" value="${Number(selectedSurfaceDetail.puddleCoverage ?? 0.04)}"></label>
          <label class="v011-field"><span>Puddle size (m)</span><input id="v012PuddleScale" type="number" min="0.25" max="100" step="0.1" value="${Number(selectedSurfaceDetail.puddleScale ?? 3.5)}"></label>
          <label class="v011-field"><span>Puddle depth (m)</span><input id="v012PuddleDepth" type="number" min="0" max="0.15" step="0.002" value="${Number(selectedSurfaceDetail.puddleDepth ?? 0.012)}"></label>
          <label class="v011-field"><span>Wheel-rut strength</span><input id="v012WheelRutStrength" type="number" min="0" max="1" step="0.05" value="${Number(selectedSurfaceDetail.wheelRutStrength ?? 0.18)}"></label>
          <label class="v011-field"><span>Wheel gauge (m)</span><input id="v012WheelTrackGauge" type="number" min="0.3" max="4" step="0.05" value="${Number(selectedSurfaceDetail.wheelTrackGauge ?? 1.45)}"></label>
          <label class="v011-field"><span>Rut width (m)</span><input id="v012WheelRutWidth" type="number" min="0.03" max="0.75" step="0.01" value="${Number(selectedSurfaceDetail.wheelRutWidth ?? 0.16)}"></label>
          <label class="v011-field"><span>Hoof-print density</span><input id="v012HoofPrintDensity" type="number" min="0" max="1" step="0.05" value="${Number(selectedSurfaceDetail.hoofPrintDensity ?? 0)}"></label>
          <label class="v011-field"><span>Boot-print density</span><input id="v012BootPrintDensity" type="number" min="0" max="1" step="0.05" value="${Number(selectedSurfaceDetail.bootPrintDensity ?? 0.04)}"></label>
          <label class="v011-field"><span>Erosion strength</span><input id="v012ErosionStrength" type="number" min="0" max="1" step="0.05" value="${Number(selectedSurfaceDetail.erosionStrength ?? 0.12)}"></label>
          <label class="v011-field"><span>Relief strength</span><input id="v012DetailNormalStrength" type="number" min="0" max="2" step="0.05" value="${Number(selectedSurfaceDetail.detailNormalStrength ?? 0.35)}"></label>
          <label class="v011-field"><span>Weather response</span><input id="v012WeatherResponse" type="number" min="0" max="3" step="0.05" value="${Number(selectedSurfaceDetail.weatherResponse ?? 1)}"></label>
        </div>
      </details>
      <div class="v011-actions v012-action-row"><button id="v012ApplySegmentSurfaceDetail" type="button">Apply detail to segment</button><button id="v012ApplyNetworkSurfaceDetail" type="button">Apply detail to whole path</button></div>
      <p class="v011-note">Surface details are deterministic and weather-aware: puddles, wheel ruts, hoof impressions, boot traffic, and erosion remain tied to the compiled road instead of floating decals.</p>
    </div>
    <button id="v011SplineEdit" class="button ${splineEditPathId === object.id ? 'primary' : 'subtle'}" type="button">${splineEditPathId === object.id ? 'Finish spline editing' : 'Edit nodes in viewport'}</button>
    <p class="v011-note"><strong>Viewport:</strong> click selects one node; Ctrl/Cmd-click toggles a group. Drag moves the selection over terrain. Shift-drag raises or lowers it. Right-click inserts a node into the nearest compiled segment.</p>
    <div class="v011-grid">
      <label class="v011-field"><span>Show this spline</span><input id="v012ShowSpline" type="checkbox" ${network.editor?.showSpline !== false ? 'checked' : ''}></label>
      <label class="v011-field"><span>Diagnostic overlay</span><select id="v012DiagnosticOverlay"><option value="none" ${diagnosticOverlay === 'none' ? 'selected' : ''}>None</option><option value="grade" ${diagnosticOverlay === 'grade' ? 'selected' : ''}>Grade</option><option value="curvature" ${diagnosticOverlay === 'curvature' ? 'selected' : ''}>Curvature</option><option value="cut-fill" ${diagnosticOverlay === 'cut-fill' ? 'selected' : ''}>Cut / fill</option><option value="construction" ${diagnosticOverlay === 'construction' ? 'selected' : ''}>Construction bounds</option></select></label>
      <label class="v011-field"><span>Construction mode</span><select id="v012ConstructionMode">${constructionOptions}</select></label>
      <label class="v011-field"><span>Lock construction</span><input id="v012ConstructionLocked" type="checkbox" ${selectedSegment?.constructionLocked ? 'checked' : ''}></label>
      <label class="v011-field"><span>Bridge family</span><select id="v012BridgeStyle">${bridgeOptions}</select></label>
      <label class="v011-field"><span>Bridge railings</span><input id="v012BridgeRailings" type="checkbox" ${selectedSegment?.structureProfile?.railings !== false ? 'checked' : ''}></label>
      <label class="v011-field"><span>Civil Assist</span><input id="v012CivilAssist" type="checkbox" ${network.engineering?.civilAssist !== false ? 'checked' : ''}></label>
    </div>
    <div class="v012-overlay-legend" aria-label="Path overlay legend"><span class="grade">Grade</span><span class="curvature">Curvature</span><span class="cut">Cut</span><span class="fill">Fill</span><span class="construction">Construction</span></div>
    <p class="v011-note">${activeBridgeSelections.length
      ? `Resolved bridge: ${escapeHtml(activeBridgeSelections.map(item => `${item.label} · ${Number(item.span).toFixed(1)} m span`).join(' · '))}`
      : 'Bridge families are only generated for validated bridge intervals. Terrain-following dirt paths remain terrain construction and never receive bridge supports.'}</p>
    <div class="v011-node-editor">
      <div class="v011-panel-title"><div><small>SELECTED 3D NODE${selectedNodeIdsForPanel.length > 1 ? ' GROUP' : ''}</small><strong>${selectedNodeIdsForPanel.length > 1 ? `${selectedNodeIdsForPanel.length} nodes · primary ${selectedIndex + 1}` : `Node ${selectedIndex + 1}`}</strong></div><span>${escapeHtml(selectedNode.heightMode)}</span></div>
      <div class="v011-grid">
        <label class="v011-field"><span>X</span><input id="v012NodeX" type="number" step="0.1" value="${Number(selectedNode.position[0] || 0)}"></label>
        <label class="v011-field"><span>Y</span><input id="v012NodeY" type="number" step="0.1" value="${Number(selectedNode.position[1] || 0)}"></label>
        <label class="v011-field"><span>Z</span><input id="v012NodeZ" type="number" step="0.1" value="${Number(selectedNode.position[2] || 0)}"></label>
        <label class="v011-field"><span>Height mode</span><select id="v012HeightMode">${['terrain','offset','absolute'].map(mode=>`<option value="${mode}" ${mode===selectedNode.heightMode?'selected':''}>${mode}</option>`).join('')}</select></label>
        <label class="v011-field"><span>Terrain offset</span><input id="v012HeightOffset" type="number" step="0.1" value="${Number(selectedNode.heightOffset || 0)}"></label>
      </div>
      <div class="v011-actions v012-action-row"><button id="v012ApplyNode" class="primary" type="button">Apply 3D node</button><button id="v012SnapTerrain" type="button">Snap to terrain</button><button id="v012DeleteNode" type="button">Delete node</button><button id="v012UndoPath" type="button">Undo path edit</button><button id="v012RedoPath" type="button">Redo path edit</button></div>
      <div class="v012-group-editor" ${selectedNodeIdsForPanel.length > 1 ? '' : 'hidden'}>
        <div class="v011-panel-title"><div><small>GROUP DELTA</small><strong>Move selected nodes together</strong></div><span>${selectedNodeIdsForPanel.length} selected</span></div>
        <div class="v011-grid"><label class="v011-field"><span>Delta X</span><input id="v012GroupDeltaX" type="number" step="0.1" value="0"></label><label class="v011-field"><span>Delta Y</span><input id="v012GroupDeltaY" type="number" step="0.1" value="0"></label><label class="v011-field"><span>Delta Z</span><input id="v012GroupDeltaZ" type="number" step="0.1" value="0"></label></div>
        <div class="v011-actions"><button id="v012ApplyGroupDelta" class="primary" type="button">Apply group delta</button></div>
        <p class="v011-note">X/Z preserves each node's terrain, offset, or absolute height authority. A non-zero Y delta converts the selected nodes into explicit absolute-height anchors.</p>
      </div>
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
    <div class="v011-actions v012-action-row"><button id="v012ReverseNetwork" type="button">Reverse segment directions</button><button id="v012DuplicateNetwork" type="button">Duplicate path</button><button id="v012SplitNetwork" type="button" ${selectedNodeCanSplit ? '' : 'disabled'}>Split at primary node</button></div>
    <p class="v011-note">Duplicate creates an independent offset copy. Split is available only on a degree-2 articulation node; endpoints and junctions stay protected from ambiguous graph cuts.</p>
    <div class="v012-network-tools">
      <div class="v011-panel-title"><div><small>PATH BRANCHES</small><strong>Join paths into one network</strong></div><span>${joinablePaths.length} available</span></div>
      ${joinablePaths.length
        ? `<label class="v011-field"><span>Branch path</span><select id="v012JoinSourcePath">${joinOptions}</select></label>
           <div class="v011-actions"><button id="v012JoinPath" class="primary" type="button">Join nearest branch</button></div>
           <p class="v011-note">Connects the branch's nearest open end to the closest point on this road. The separate branch object is removed, and one Undo restores both paths.</p>`
        : '<p class="v011-note">No separate Path Network branches are available. Create another path before using Join.</p>'}
    </div>
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
  const signature = `${object.id}:${currentSnapshot()?.state?.engine?.revision || 0}:${foundation?.terrainDiagnostics?.checkedAt || ''}:${splineEditPathId || ''}:${pathSelectionOwnerId || ''}:${selectedPathNodeId || ''}:${[...selectedPathNodeIds].join(',')}:${selectedPathSegmentId || ''}:${terrainSculptMode?.terrainId || ''}:${routeGenerationRevision}:${routeGenerationState.status}:${routeGenerationState.selectedCandidate}`;
  if (container.dataset.v011Signature === signature && container.querySelector('[data-v011-panel]')) return;
  const selectedNode = pathNodeSelection(object);
  container.dataset.v011Signature = signature;
  container.querySelectorAll('[data-v011-panel]').forEach(node => node.remove());
  const reference = referencePanel(object);
  if (object.type === 'terrain') container.insertAdjacentHTML('beforeend', terrainPanel(object));
  if (object.type === 'path') container.insertAdjacentHTML('beforeend', pathPanel(object));
  const selectedSegment = object.type === 'path' ? pathSegmentSelection(object, selectedNode.node).segment : null;
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
  $('#v012DiagnosticOverlay')?.addEventListener('change', event => {
    const mode = event.target.value || 'none';
    pathDiagnosticModes.set(object.id, mode);
    bridge()?.renderer?.()?.setPathDiagnosticMode?.(object.id, mode);
  });
  $('#v012SelectedSegment')?.addEventListener('change', event => {
    selectedPathSegmentId = event.target.value || null;
    enhanceInspector();
  });
  $('#v012ConstructionMode')?.addEventListener('change', () => updateSelectedConstruction(object, selectedSegment));
  $('#v012ConstructionLocked')?.addEventListener('change', () => updateSelectedConstruction(object, selectedSegment));
  $('#v012CrossSectionProfile')?.addEventListener('change', event => {
    const profile = pathCrossSectionProfiles().find(item => item.id === event.target.value);
    const description = $('#v012CrossSectionDescription');
    if (description) description.textContent = profile?.description || '';
  });
  $('#v012ApplySegmentProfile')?.addEventListener('click', () => updateSelectedCrossSection(object, selectedSegment, false));
  $('#v012ApplyNetworkProfile')?.addEventListener('click', () => updateSelectedCrossSection(object, selectedSegment, true));
  $('#v012SurfaceDetailProfile')?.addEventListener('change', event => {
    const profile = pathSurfaceDetailProfiles().find(item => item.id === event.target.value);
    const description = $('#v012SurfaceDetailDescription');
    if (description) description.textContent = profile?.description || '';
    const values = profile?.values || {};
    const assignments = {
      v012SurfaceSeed: values.seed,
      v012PuddleCoverage: values.puddleCoverage,
      v012PuddleScale: values.puddleScale,
      v012PuddleDepth: values.puddleDepth,
      v012WheelRutStrength: values.wheelRutStrength,
      v012WheelTrackGauge: values.wheelTrackGauge,
      v012WheelRutWidth: values.wheelRutWidth,
      v012HoofPrintDensity: values.hoofPrintDensity,
      v012BootPrintDensity: values.bootPrintDensity,
      v012ErosionStrength: values.erosionStrength,
      v012DetailNormalStrength: values.detailNormalStrength,
      v012WeatherResponse: values.weatherResponse
    };
    for (const [id, value] of Object.entries(assignments)) {
      const input = $(`#${id}`);
      if (input && Number.isFinite(Number(value))) input.value = String(value);
    }
  });
  $('#v012ApplySegmentSurfaceDetail')?.addEventListener('click', () => updateSelectedSurfaceDetail(object, selectedSegment, false));
  $('#v012ApplyNetworkSurfaceDetail')?.addEventListener('click', () => updateSelectedSurfaceDetail(object, selectedSegment, true));
  $('#v012BridgeStyle')?.addEventListener('change', () => updateSelectedStructure(object, selectedSegment));
  $('#v012BridgeRailings')?.addEventListener('change', () => updateSelectedStructure(object, selectedSegment));
  $('#v012CivilAssist')?.addEventListener('change', event => replacePathNetwork(object, {
    ...object.properties.pathNetwork,
    engineering: { ...object.properties.pathNetwork.engineering, civilAssist: event.target.checked }
  }, 'Update Civil Assist'));
  $('#v012ApplyNode')?.addEventListener('click', () => applySelectedNode(object, selectedNode.node));
  $('#v012ApplyGroupDelta')?.addEventListener('click', () => applySelectedNodeGroupDelta(object));
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
    operations: [{ type: 'reverse-network' }]
  }));
  $('#v012DuplicateNetwork')?.addEventListener('click', () => duplicatePathNetworkObject(object));
  $('#v012SplitNetwork')?.addEventListener('click', () => splitPathNetworkObject(object, selectedNode.node));
  $('#v012JoinPath')?.addEventListener('click', () => joinPathNetwork(object, $('#v012JoinSourcePath')?.value));
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

async function duplicatePathNetworkObject(object) {
  try {
    const network = object.properties.pathNetwork;
    const widths = network.segments
      .map(segment => Number(segment.crossSectionProfile?.width || 2))
      .filter(Number.isFinite);
    const clearance = Math.max(4, ...widths) * 2;
    const first = network.nodes[0]?.position || [0, 0, 0];
    const last = network.nodes.at(-1)?.position || [1, 0, 0];
    const dx = Number(last[0] || 0) - Number(first[0] || 0);
    const dz = Number(last[2] || 0) - Number(first[2] || 0);
    const length = Math.hypot(dx, dz);
    const offset = length > 1e-6
      ? [-dz / length * clearance, 0, dx / length * clearance]
      : [clearance, 0, clearance];
    const payload = await api(`/api/v012/path/${encodeURIComponent(object.id)}/duplicate`, {
      method: 'POST',
      body: {
        expectedRevision: object.properties.pathNetwork.revision,
        name: `${object.name} Copy`,
        offset,
        label: 'Duplicate path network'
      }
    });
    // Creation history belongs to the source path. Keep it selected so the
    // very next Undo removes the duplicate instead of presenting an empty
    // history panel on the newly created object.
    splineEditPathId = object.id;
    pathSelectionOwnerId = object.id;
    selectedPathNodeId = object.properties.pathNetwork.nodes[0]?.id || null;
    selectedPathNodeIds = new Set(selectedPathNodeId ? [selectedPathNodeId] : []);
    await applyMutation(payload, false);
    bridge()?.showToast?.(`Duplicated ${object.name} as ${payload.path.name}`, 'success');
    return payload;
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
    return null;
  }
}

async function splitPathNetworkObject(object, node) {
  if (!node?.id) return;
  const degree = object.properties.pathNetwork.segments
    .filter(segment => segment.fromNode === node.id || segment.toNode === node.id).length;
  if (degree !== 2) {
    bridge()?.showToast?.('Split requires a degree-2 path node, not an endpoint or junction.', 'error');
    return;
  }
  try {
    const payload = await api(`/api/v012/path/${encodeURIComponent(object.id)}/split`, {
      method: 'POST',
      body: {
        expectedRevision: object.properties.pathNetwork.revision,
        nodeId: node.id,
        name: `${object.name} Split`,
        label: 'Split path network'
      }
    });
    // As with duplication, the retained path owns the atomic history entry.
    // Leave it active so Undo/Redo remains immediately discoverable.
    splineEditPathId = object.id;
    pathSelectionOwnerId = object.id;
    selectedPathNodeId = payload.splitNodeId;
    selectedPathNodeIds = new Set([payload.splitNodeId]);
    await applyMutation(payload, false);
    bridge()?.showToast?.(`Split ${object.name} into two independent paths`, 'success');
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
    const selection = prunePathNodeSelection(payload.network, {
      nodeIds: selectedPathNodeIds,
      primaryNodeId: selectedPathNodeId
    });
    selectedPathNodeIds = new Set(selection.nodeIds);
    selectedPathNodeId = selection.primaryNodeId
      || payload.network.nodes[Math.max(0, payload.network.nodes.length - 1)]?.id
      || null;
    if (selectedPathNodeId && !selectedPathNodeIds.size) selectedPathNodeIds.add(selectedPathNodeId);
    bridge()?.showToast?.(`${transaction.label || 'Path edit'} · r${payload.network.revision}`, 'success');
    return payload;
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
    return null;
  }
}

async function joinPathNetwork(target, sourceId) {
  const source = currentSnapshot()?.scene?.objects?.find(object => object.id === sourceId);
  if (!source?.properties?.pathNetwork) {
    bridge()?.showToast?.('Select a valid Path Network branch to join.', 'error');
    return null;
  }
  try {
    const payload = await api(`/api/v012/path/${encodeURIComponent(target.id)}/merge/${encodeURIComponent(source.id)}`, {
      method: 'POST',
      body: {
        expectedRevision: target.properties.pathNetwork.revision,
        expectedSourceRevision: source.properties.pathNetwork.revision,
        label: `Join ${source.name}`
      }
    });
    splineEditPathId = target.id;
    pathSelectionOwnerId = target.id;
    selectedPathNodeId = payload.junctionNodeId;
    selectedPathNodeIds = new Set(payload.junctionNodeId ? [payload.junctionNodeId] : []);
    await applyMutation(payload, true);
    bridge()?.showToast?.(
      `Joined ${source.name} · ${payload.importedSegmentCount + 1} connected segments · r${payload.network.revision}`,
      'success'
    );
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

function applySelectedNodeGroupDelta(object) {
  const network = object?.properties?.pathNetwork;
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  if (!network || !snapshot?.scene) return;
  const deltaX = Number($('#v012GroupDeltaX')?.value || 0);
  const deltaY = Number($('#v012GroupDeltaY')?.value || 0);
  const deltaZ = Number($('#v012GroupDeltaZ')?.value || 0);
  if (![deltaX, deltaY, deltaZ].every(Number.isFinite)) {
    bridge()?.showToast?.('Group deltas must be finite numbers.', 'error');
    return;
  }
  if (deltaX === 0 && deltaY === 0 && deltaZ === 0) {
    bridge()?.showToast?.('Enter a non-zero group delta.', 'error');
    return;
  }
  const selection = prunePathNodeSelection(network, {
    nodeIds: selectedPathNodeIds,
    primaryNodeId: selectedPathNodeId
  });
  if (selection.nodeIds.length < 2) {
    bridge()?.showToast?.('Ctrl/Cmd-click at least two path nodes first.', 'error');
    return;
  }
  const preview = createPathNodeGroupPreview(object, selection, {
    resolveEffectivePosition: node => resolveEditorNodePosition(snapshot.scene, renderer, node)
  });
  if (deltaY !== 0) {
    updatePathNodeGroupPreview(preview, { deltaY, vertical: true });
    for (const nodeId of preview.nodeIds) {
      const node = preview.previewPath.properties.pathNetwork.nodes.find(item => item.id === nodeId);
      node.position[0] += deltaX;
      node.position[2] += deltaZ;
    }
  } else {
    updatePathNodeGroupPreview(preview, { deltaX, deltaZ });
  }
  return transactPathNetwork(object, {
    label: `Move ${selection.nodeIds.length} path nodes`,
    operations: pathNodeGroupMoveOperations(preview)
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

function updateSelectedConstruction(object, segment) {
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

function updateSelectedCrossSection(object, selectedSegment, wholeNetwork = false) {
  const network = object.properties.pathNetwork;
  if (!selectedSegment) return;
  const profileId = $('#v012CrossSectionProfile')?.value || selectedSegment.crossSectionProfile?.profileId || 'dirt-road';
  const segments = wholeNetwork ? network.segments : [selectedSegment];
  const operations = segments.map(segment => ({
    type: 'set-segment-cross-section',
    segmentId: segment.id,
    profileId
  }));
  if (wholeNetwork) operations.push({ type: 'set-default-cross-section', profileId });
  return transactPathNetwork(object, {
    label: wholeNetwork ? `Apply ${profileId} to whole path` : `Apply ${profileId} to segment`,
    operations
  });
}

function updateSelectedSurfaceDetail(object, selectedSegment, wholeNetwork = false) {
  const network = object.properties.pathNetwork;
  if (!selectedSegment) return;
  const profileId = $('#v012SurfaceDetailProfile')?.value
    || selectedSegment.surfaceDetailProfile?.profileId
    || 'weathered-dirt-road';
  const numberValue = (id, fallback) => {
    const value = Number($(`#${id}`)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  const surfaceDetailProfile = {
    seed: Math.trunc(numberValue('v012SurfaceSeed', selectedSegment.surfaceDetailProfile?.seed ?? 2718)),
    puddleCoverage: numberValue('v012PuddleCoverage', selectedSegment.surfaceDetailProfile?.puddleCoverage ?? 0.04),
    puddleScale: numberValue('v012PuddleScale', selectedSegment.surfaceDetailProfile?.puddleScale ?? 3.5),
    puddleDepth: numberValue('v012PuddleDepth', selectedSegment.surfaceDetailProfile?.puddleDepth ?? 0.012),
    wheelRutStrength: numberValue('v012WheelRutStrength', selectedSegment.surfaceDetailProfile?.wheelRutStrength ?? 0.18),
    wheelTrackGauge: numberValue('v012WheelTrackGauge', selectedSegment.surfaceDetailProfile?.wheelTrackGauge ?? 1.45),
    wheelRutWidth: numberValue('v012WheelRutWidth', selectedSegment.surfaceDetailProfile?.wheelRutWidth ?? 0.16),
    hoofPrintDensity: numberValue('v012HoofPrintDensity', selectedSegment.surfaceDetailProfile?.hoofPrintDensity ?? 0),
    bootPrintDensity: numberValue('v012BootPrintDensity', selectedSegment.surfaceDetailProfile?.bootPrintDensity ?? 0.04),
    erosionStrength: numberValue('v012ErosionStrength', selectedSegment.surfaceDetailProfile?.erosionStrength ?? 0.12),
    detailNormalStrength: numberValue('v012DetailNormalStrength', selectedSegment.surfaceDetailProfile?.detailNormalStrength ?? 0.35),
    weatherResponse: numberValue('v012WeatherResponse', selectedSegment.surfaceDetailProfile?.weatherResponse ?? 1)
  };
  const segments = wholeNetwork ? network.segments : [selectedSegment];
  const operations = segments.map(segment => ({
    type: 'set-segment-surface-detail',
    segmentId: segment.id,
    profileId,
    surfaceDetailProfile
  }));
  if (wholeNetwork) operations.push({ type: 'set-default-surface-detail', profileId, surfaceDetailProfile });
  return transactPathNetwork(object, {
    label: wholeNetwork ? `Apply ${profileId} detail to whole path` : `Apply ${profileId} detail to segment`,
    operations
  });
}

function updateSelectedStructure(object, segment) {
  if (!segment) return;
  return transactPathNetwork(object, {
    label: 'Update bridge family',
    operations: [{
      type: 'set-segment-structure',
      segmentId: segment.id,
      bridgeStyle: $('#v012BridgeStyle')?.value || segment.structureProfile?.bridgeStyle || 'auto',
      railings: $('#v012BridgeRailings')?.checked !== false
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
  if (!routeGenerationPool) routeGenerationPool = sharedPathGenerationWorkerPool();
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
  if (!wrap) return;
  let overlay = $('#splineNodeOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'splineNodeOverlay';
    overlay.className = 'spline-node-overlay';
    wrap.appendChild(overlay);
  }
  if (overlay.dataset.nodeDragDelegated !== 'true') {
    // Handles are reconciled continuously while the camera and scene move.
    // Keep one stable listener on the overlay instead of tying input authority
    // to the lifetime of an individual button element.
    overlay.addEventListener('pointerdown', event => {
      if (event.target?.closest?.('[data-spline-handle]')) beginPathHandleDrag(event);
      else beginNodeDrag(event);
    }, true);
    overlay.dataset.nodeDragDelegated = 'true';
  }
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
    ? draggingNode.groupPreview?.previewPath
    : authoritativePath;
  if (!path?.properties?.pathNetwork) { overlay.replaceChildren(); return; }
  ensurePathSelectionScope(path);
  const nodes = path.properties.pathNetwork.nodes || [];
  const selection = prunePathNodeSelection(path.properties.pathNetwork, {
    nodeIds: selectedPathNodeIds,
    primaryNodeId: selectedPathNodeId
  });
  selectedPathNodeIds = new Set(selection.nodeIds);
  selectedPathNodeId = selection.primaryNodeId;
  renderEditorCurvePreview({ overlay, path, snapshot, renderer });
  ensureHandleConnectorLayer(overlay);
  const existing = new Map([...overlay.querySelectorAll('[data-spline-node-id]')]
    .filter(node => !node.dataset.splineHandle)
    .map(node => [node.dataset.splineNodeId, node]));
  nodes.forEach((node, index) => {
    const y = resolveEditorNodePosition(snapshot.scene, renderer, node)[1];
    const screen = renderer.worldToScreen?.(snapshot.camera, [node.position[0], y + 0.55, node.position[2]]);
    let handle = existing.get(node.id);
    if (!handle) {
      handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'spline-node-handle';
      overlay.appendChild(handle);
    }
    handle.dataset.splineNodeId = node.id;
    handle.dataset.splineNodeIndex = String(index);
    existing.delete(node.id);
    if (!screen?.visible) { handle.hidden = true; return; }
    handle.hidden = false;
    const member = selectedPathNodeIds.has(node.id);
    const primary = node.id === selectedPathNodeId;
    handle.classList.toggle('selected', member);
    handle.classList.toggle('selected-member', member && !primary);
    handle.classList.toggle('selected-primary', primary);
    handle.setAttribute('aria-pressed', member ? 'true' : 'false');
    handle.title = `Node ${index + 1} · ${node.heightMode} · ${y.toFixed(2)} m`;
    handle.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    handle.textContent = String(index + 1);
  });
  existing.forEach(node => node.remove());
  renderPathHandleGizmos({ overlay, path, snapshot, renderer });
}

function ensureEditorCurvePreviewLayer(overlay) {
  let svg = overlay.querySelector('.spline-drag-preview');
  if (svg) return svg;
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('spline-drag-preview');
  svg.setAttribute('aria-hidden', 'true');
  overlay.prepend(svg);
  return svg;
}

function renderEditorCurvePreview({ overlay, path, snapshot, renderer }) {
  const svg = ensureEditorCurvePreviewLayer(overlay);
  if (!draggingNode || draggingNode.pathId !== path.id) {
    svg.hidden = true;
    svg.replaceChildren();
    return;
  }
  svg.hidden = false;
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, overlay.clientWidth)} ${Math.max(1, overlay.clientHeight)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const curves = samplePathEditorCurvePreview(path, {
    resolveNodePosition: node => resolveEditorNodePosition(snapshot.scene, renderer, node),
    samplesPerSegment: 18
  });
  const fragment = document.createDocumentFragment();
  const project = points => points
    .map(point => renderer.worldToScreen?.(snapshot.camera, [point[0], point[1] + 0.08, point[2]]))
    .filter(point => point?.visible)
    .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  for (const curve of curves) {
    const left = project(curve.left);
    const right = project(curve.right);
    const center = project(curve.center);
    if (left.length > 1 && right.length > 1) {
      const ribbon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      ribbon.classList.add('spline-drag-preview-ribbon');
      ribbon.dataset.previewSegmentId = curve.segmentId;
      ribbon.setAttribute('points', [...left, ...right.reverse()].join(' '));
      fragment.appendChild(ribbon);
    }
    if (center.length > 1) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.classList.add('spline-drag-preview-center');
      line.dataset.previewSegmentId = curve.segmentId;
      line.setAttribute('points', center.join(' '));
      fragment.appendChild(line);
    }
  }
  svg.replaceChildren(fragment);
}

function beginNodeDrag(event) {
  const overlay = $('#splineNodeOverlay');
  const handle = event.target?.closest?.('[data-spline-node-id]:not([data-spline-handle])');
  if (!overlay || !handle || !overlay.contains(handle)) return;
  if (event.button !== 0 || event.isPrimary === false || draggingNode || draggingHandle) {
    window.__omniforgeDiagnostics?.log?.('path-node-drag-rejected', {
      button: event.button,
      isPrimary: event.isPrimary,
      pointerId: event.pointerId,
      dragAlreadyActive: Boolean(draggingNode || draggingHandle)
    });
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === splineEditPathId);
  if (!path) return;
  const node = path.properties?.pathNetwork?.nodes?.find(item => item.id === handle.dataset.splineNodeId);
  if (!node) return;
  if (event.ctrlKey || event.metaKey) {
    setPathNodeSelection(path, node.id, { additive: true });
    enhanceInspector();
    return;
  }
  const selection = setPathNodeSelection(path, node.id, { preserveGroup: true });
  const renderer = bridge()?.renderer?.();
  const startSurfacePoint = renderer?.terrainPointFromScreen?.(
    snapshot.scene,
    snapshot.camera,
    event.clientX,
    event.clientY,
    { surface: 'base' }
  ) || resolveEditorNodePosition(snapshot.scene, renderer, node);
  draggingNode = {
    pathId: path.id,
    nodeId: node.id,
    index: selectedSplineNodeIndex,
    pointerId: event.pointerId,
    captureTarget: handle,
    startClientY: event.clientY,
    startSurfacePoint,
    selectionAtStart: selection,
    vertical: event.shiftKey === true,
    gesture: createPathNodeDragGesture({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      vertical: event.shiftKey === true
    }),
    groupPreview: createPathNodeGroupPreview(path, selection, {
      resolveEffectivePosition: item => resolveEditorNodePosition(snapshot.scene, renderer, item)
    })
  };
  window.__omniforgeDiagnostics?.log?.('path-node-drag-begin', {
    pathId: path.id,
    nodeId: node.id,
    pointerId: event.pointerId,
    vertical: event.shiftKey === true,
    nodeCount: selection.nodeIds.length
  });
  enhanceInspector();
  handle.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', dragNode, true);
  window.addEventListener('pointerup', finishNodeDrag, true);
  window.addEventListener('pointercancel', cancelNodeDragFromEvent, true);
  handle.addEventListener('lostpointercapture', cancelNodeDragFromEvent, { once: true });
}

function ensureHandleConnectorLayer(overlay) {
  let svg = overlay.querySelector('.spline-handle-connectors');
  if (svg) return svg;
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('spline-handle-connectors');
  svg.setAttribute('aria-hidden', 'true');
  for (const side of ['incoming', 'outgoing']) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.dataset.splineHandleLine = side;
    svg.appendChild(line);
  }
  overlay.prepend(svg);
  return svg;
}

function renderPathHandleGizmos({ overlay, path, snapshot, renderer }) {
  const network = path?.properties?.pathNetwork;
  const primary = network?.nodes?.find(node => node.id === selectedPathNodeId);
  const svg = ensureHandleConnectorLayer(overlay);
  const existing = new Map([...overlay.querySelectorAll('[data-spline-handle]')]
    .map(button => [button.dataset.splineHandle, button]));
  if (!primary || !['free', 'aligned'].includes(primary.handleMode)) {
    svg.hidden = true;
    existing.forEach(button => button.remove());
    return;
  }
  const suggested = suggestPathNodeHandles(network, primary.id);
  if (suggested.degree > 2) {
    svg.hidden = true;
    existing.forEach(button => button.remove());
    return;
  }
  const preview = draggingHandle?.pathId === path.id && draggingHandle.nodeId === primary.id
    ? draggingHandle.preview : null;
  const displayNode = preview ? {
    ...primary,
    handleMode: preview.handleMode,
    incomingHandle: preview.incomingHandle,
    outgoingHandle: preview.outgoingHandle
  } : primary;
  const endpoints = pathHandleEndpoints(displayNode, {
    terrainHeightAt: (x, z) => renderer.terrainHeightForScene?.(snapshot.scene, x, z),
    suggestedHandles: suggested
  });
  const nodeScreen = renderer.worldToScreen?.(snapshot.camera, endpoints.position);
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, overlay.clientWidth)} ${Math.max(1, overlay.clientHeight)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.hidden = !nodeScreen?.visible;
  for (const side of ['incoming', 'outgoing']) {
    const endpointScreen = renderer.worldToScreen?.(snapshot.camera, endpoints[side]);
    const line = svg.querySelector(`[data-spline-handle-line="${side}"]`);
    let button = existing.get(side);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = `spline-tangent-handle ${side}`;
      button.dataset.splineHandle = side;
      overlay.appendChild(button);
    }
    button.dataset.splineNodeId = primary.id;
    existing.delete(side);
    const visible = Boolean(nodeScreen?.visible && endpointScreen?.visible);
    button.hidden = !visible;
    if (line) line.hidden = !visible;
    if (!visible) continue;
    line?.setAttribute('x1', String(nodeScreen.x));
    line?.setAttribute('y1', String(nodeScreen.y));
    line?.setAttribute('x2', String(endpointScreen.x));
    line?.setAttribute('y2', String(endpointScreen.y));
    button.style.transform = `translate(${endpointScreen.x}px, ${endpointScreen.y}px)${side === 'outgoing' ? ' rotate(45deg)' : ''}`;
    button.title = `${side === 'incoming' ? 'Incoming' : 'Outgoing'} ${displayNode.handleMode} tangent · drag to shape curve`;
    button.setAttribute('aria-label', button.title);
  }
  existing.forEach(button => button.remove());
}

function flushNodeDragPreview() {
  pathDragPreviewFrame = 0;
  if (!draggingNode?.groupPreview?.previewPath) return;
  // renderNodeOverlay reads previewPath directly, so the selected handle still
  // tracks the pointer each animation frame. Replacing the renderer's complete
  // path authority here forced the corridor, terrain, collision, and structural
  // meshes to regenerate on every pointer event and blocked editor input.
  // Full connected-system generation now happens once on pointer release.
  window.__omniforgeDiagnostics?.log?.('path-node-drag-preview', {
    pathId: draggingNode.pathId,
    nodeId: draggingNode.nodeId,
    nodeCount: draggingNode.groupPreview.nodeIds.length
  });
}

function scheduleNodeDragPreview() {
  if (!pathDragPreviewFrame) pathDragPreviewFrame = requestAnimationFrame(flushNodeDragPreview);
}

function dragNode(event) {
  if (!draggingNode || event.pointerId !== draggingNode.pointerId) return;
  const decision = advancePathNodeDragGesture(draggingNode.gesture, event);
  if (decision.cancel) {
    cancelNodeDrag('primary-button-released');
    return;
  }
  if (!decision.accepted) return;
  event.preventDefault();
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  if (draggingNode.gesture.vertical) {
    draggingNode.vertical = true;
    updatePathNodeGroupPreview(draggingNode.groupPreview, {
      deltaY: -(event.clientY - draggingNode.startClientY) * 0.15,
      vertical: true
    });
  } else {
    const point = renderer?.terrainPointFromScreen?.(
      snapshot.scene,
      snapshot.camera,
      event.clientX,
      event.clientY,
      { surface: 'base' }
    );
    if (!point) return;
    updatePathNodeGroupPreview(draggingNode.groupPreview, {
      deltaX: point[0] - draggingNode.startSurfacePoint[0],
      deltaZ: point[2] - draggingNode.startSurfacePoint[2]
    });
  }
  scheduleNodeDragPreview();
}

function releaseNodeDragListeners(drag) {
  window.removeEventListener('pointermove', dragNode, true);
  window.removeEventListener('pointerup', finishNodeDrag, true);
  window.removeEventListener('pointercancel', cancelNodeDragFromEvent, true);
  drag?.captureTarget?.removeEventListener?.('lostpointercapture', cancelNodeDragFromEvent);
  if (drag?.captureTarget?.hasPointerCapture?.(drag.pointerId)) {
    drag.captureTarget.releasePointerCapture(drag.pointerId);
  }
}

function clearNodeDragPreview(drag) {
  if (pathDragPreviewFrame) {
    cancelAnimationFrame(pathDragPreviewFrame);
    pathDragPreviewFrame = 0;
  }
  // Node dragging no longer replaces the renderer-owned preview, so there is
  // nothing to restore here. Avoid invalidating the terrain/path runtime cache
  // immediately before the release transaction performs its one real rebuild.
}

function cancelNodeDrag() {
  if (!draggingNode) return;
  const drag = draggingNode;
  draggingNode = null;
  releaseNodeDragListeners(drag);
  clearNodeDragPreview(drag);
}

function cancelNodeDragFromEvent(event) {
  if (!draggingNode || (event.pointerId !== undefined && event.pointerId !== draggingNode.pointerId)) return;
  cancelNodeDrag('pointer-cancelled');
}

async function finishNodeDrag(event) {
  if (!draggingNode || event.pointerId !== draggingNode.pointerId) return;
  event.preventDefault();
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === draggingNode.pathId);
  const drag = draggingNode;
  const shouldCommit = shouldCommitPathNodeDragGesture(drag.gesture, event);
  draggingNode = null;
  releaseNodeDragListeners(drag);
  clearNodeDragPreview(drag);
  if (!shouldCommit || !path || !drag.groupPreview) {
    if (path && drag.selectionAtStart?.nodeIds?.length > 1) {
      setPathNodeSelection(path, drag.nodeId);
      enhanceInspector();
    }
    return;
  }
  window.__omniforgeDiagnostics?.log?.('path-node-drag-commit', {
    pathId: drag.pathId,
    nodeId: drag.nodeId,
    vertical: drag.vertical,
    nodeCount: drag.groupPreview.nodeIds.length
  });
  await transactPathNetwork(path, {
    label: drag.vertical
      ? `Raise or lower ${drag.groupPreview.nodeIds.length} path node${drag.groupPreview.nodeIds.length === 1 ? '' : 's'}`
      : `Move ${drag.groupPreview.nodeIds.length} path node${drag.groupPreview.nodeIds.length === 1 ? '' : 's'}`,
    operations: pathNodeGroupMoveOperations(drag.groupPreview)
  });
}

function beginPathHandleDrag(event) {
  const overlay = $('#splineNodeOverlay');
  const handle = event.target?.closest?.('[data-spline-handle]');
  if (!overlay || !handle || !overlay.contains(handle)) return;
  if (event.button !== 0 || event.isPrimary === false || draggingNode || draggingHandle) return;
  event.preventDefault();
  event.stopPropagation();
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === splineEditPathId && object.type === 'path');
  const network = path?.properties?.pathNetwork;
  const node = network?.nodes?.find(item => item.id === handle.dataset.splineNodeId);
  if (!path || !node || !['free', 'aligned'].includes(node.handleMode)) return;
  const suggested = suggestPathNodeHandles(network, node.id);
  if (suggested.degree > 2) return bridge()?.showToast?.('Junction handles remain automatic; shape each connected approach instead.', 'error');
  setPathNodeSelection(path, node.id, { preserveGroup: true });
  const renderer = bridge()?.renderer?.();
  const endpoints = pathHandleEndpoints(node, {
    terrainHeightAt: (x, z) => renderer?.terrainHeightForScene?.(snapshot.scene, x, z),
    suggestedHandles: suggested
  });
  const rect = renderer?.canvas?.getBoundingClientRect?.();
  const centerRay = rect ? renderer.rayFromScreen?.(
    snapshot.camera,
    rect.left + rect.width * 0.5,
    rect.top + rect.height * 0.5
  ) : null;
  draggingHandle = {
    pathId: path.id,
    nodeId: node.id,
    side: handle.dataset.splineHandle,
    pointerId: event.pointerId,
    captureTarget: handle,
    node: structuredClone(node),
    nodePosition: endpoints.position,
    startEndpoint: endpoints[handle.dataset.splineHandle],
    planeNormal: centerRay?.dir || [0, 0, -1],
    suggested,
    preview: null,
    gesture: createPathNodeDragGesture({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      vertical: event.shiftKey === true
    })
  };
  enhanceInspector();
  handle.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', dragPathHandle, true);
  window.addEventListener('pointerup', finishPathHandleDrag, true);
  window.addEventListener('pointercancel', cancelPathHandleDragFromEvent, true);
  handle.addEventListener('lostpointercapture', cancelPathHandleDragFromEvent, { once: true });
}

function dragPathHandle(event) {
  if (!draggingHandle || event.pointerId !== draggingHandle.pointerId) return;
  const decision = advancePathNodeDragGesture(draggingHandle.gesture, event);
  if (decision.cancel) return cancelPathHandleDrag();
  if (!decision.accepted) return;
  event.preventDefault();
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  let worldPoint;
  if (draggingHandle.gesture.vertical) {
    worldPoint = [
      draggingHandle.startEndpoint[0],
      draggingHandle.startEndpoint[1] - (event.clientY - draggingHandle.gesture.startClientY) * 0.15,
      draggingHandle.startEndpoint[2]
    ];
  } else {
    const ray = renderer?.rayFromScreen?.(snapshot.camera, event.clientX, event.clientY);
    worldPoint = intersectPathHandleRayCameraPlane(ray, draggingHandle.startEndpoint, draggingHandle.planeNormal);
  }
  if (!worldPoint) return;
  try {
    draggingHandle.preview = previewPathHandleDrag({
      node: draggingHandle.node,
      nodePosition: draggingHandle.nodePosition,
      side: draggingHandle.side,
      worldPoint,
      handleMode: draggingHandle.node.handleMode,
      suggestedHandles: draggingHandle.suggested,
      minimumLength: 0.01
    });
  } catch {
    // Keep the last valid preview while the cursor crosses the node center.
  }
}

function releasePathHandleDragListeners(drag) {
  window.removeEventListener('pointermove', dragPathHandle, true);
  window.removeEventListener('pointerup', finishPathHandleDrag, true);
  window.removeEventListener('pointercancel', cancelPathHandleDragFromEvent, true);
  drag?.captureTarget?.removeEventListener?.('lostpointercapture', cancelPathHandleDragFromEvent);
  if (drag?.captureTarget?.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
}

function cancelPathHandleDrag() {
  if (!draggingHandle) return;
  const drag = draggingHandle;
  draggingHandle = null;
  releasePathHandleDragListeners(drag);
}

function cancelPathHandleDragFromEvent(event) {
  if (!draggingHandle || (event.pointerId !== undefined && event.pointerId !== draggingHandle.pointerId)) return;
  cancelPathHandleDrag();
}

async function finishPathHandleDrag(event) {
  if (!draggingHandle || event.pointerId !== draggingHandle.pointerId) return;
  event.preventDefault();
  const drag = draggingHandle;
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === drag.pathId);
  const shouldCommit = shouldCommitPathNodeDragGesture(drag.gesture, event);
  draggingHandle = null;
  releasePathHandleDragListeners(drag);
  if (!shouldCommit || !drag.preview || !path) return;
  await transactPathNetwork(path, {
    label: `Shape ${drag.side} spline tangent`,
    operations: [{
      type: 'set-node-handles',
      nodeId: drag.nodeId,
      handleMode: drag.preview.handleMode,
      primaryHandle: drag.preview.primaryHandle,
      incomingHandle: drag.preview.incomingHandle,
      outgoingHandle: drag.preview.outgoingHandle
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
    const point = bridge()?.renderer?.()?.terrainPointFromScreen?.(
      snapshot.scene,
      snapshot.camera,
      event.clientX,
      event.clientY,
      { surface: 'base' }
    );
    if (!point) return bridge()?.showToast?.('The sculpt cursor did not hit terrain.', 'error');
    try {
      await applyMutation(await api('/api/v011/terrain/' + encodeURIComponent(terrainSculptMode.terrainId) + '/sculpt', { method: 'POST', body: { ...terrainSculptMode, x: point[0], z: point[2], targetHeight: terrainSculptMode.mode === 'flatten' ? terrainSculptMode.targetHeight : point[1] } }), true);
      bridge()?.showToast?.('Applied ' + terrainSculptMode.mode + ' terrain sculpt', 'success');
    } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
  }, true);
  canvas.addEventListener('mousedown', event => {
    if (!splineEditPathId) return;
    if (event.button === 0 && event.target === canvas) {
      const handle = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-spline-node-id]');
      if (handle) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    if (event.button === 2 && event.target === canvas) {
      pendingPathInsertGesture = createPathInsertGesture({
        pathId: splineEditPathId,
        clientX: event.clientX,
        clientY: event.clientY,
        now: performance.now(),
        pointerLocked: document.pointerLockElement === canvas
      });
      completedPathInsertGesture = null;
    }
  }, true);
  window.addEventListener('mousemove', event => {
    if (!pendingPathInsertGesture || !(event.buttons & 2)) return;
    pendingPathInsertGesture = updatePathInsertGesture(pendingPathInsertGesture, event);
  }, true);
  canvas.addEventListener('mouseleave', event => {
    if (pendingPathInsertGesture && (event.buttons & 2)) {
      pendingPathInsertGesture = updatePathInsertGesture(pendingPathInsertGesture, { ...event, forceMoved: true });
    }
  }, true);
  const insertPathNodeFromViewport = async (event, source) => {
    if (!splineEditPathId) return;
    const signature = `${splineEditPathId}:${Math.round(event.clientX)}:${Math.round(event.clientY)}`;
    if (lastPathInsertGesture?.signature === signature && performance.now() - lastPathInsertGesture.at < 400) return;
    const snapshot = currentSnapshot();
    const path = snapshot?.scene?.objects?.find(object => object.id === splineEditPathId);
    const authority = compiledPathEditAuthority(path);
    if (!authority.ready) return bridge()?.showToast?.(authority.message, 'error');
    const renderer = bridge()?.renderer?.();
    const viewportBounds = canvas.getBoundingClientRect();
    const nearest = nearestCompiledScreenStation(authority.runtime.compiled, {
      clientX: event.clientX,
      clientY: event.clientY,
      rayFromScreen: (clientX, clientY) => renderer?.rayFromScreen?.(snapshot.camera, clientX, clientY),
      worldToScreen: position => {
        const projected = renderer?.worldToScreen?.(snapshot.camera, position);
        return projected ? { ...projected, x: viewportBounds.left + projected.x, y: viewportBounds.top + projected.y } : null;
      },
      maximumDistancePixels: 28
    });
    if (!nearest) return bridge()?.showToast?.('Right-click closer to the visible spline to insert a node.', 'error');
    lastPathInsertGesture = { signature, at: performance.now(), source };
    const network = path.properties.pathNetwork;
    const segment = network.segments.find(item => item.id === nearest.segmentId);
    const compiledSegment = authority.runtime.compiled.segments.find(item => item.id === nearest.segmentId);
    const fromNode = network.nodes.find(item => item.id === segment?.fromNode);
    const toNode = network.nodes.find(item => item.id === segment?.toNode);
    const preserveCurve = segment?.curveType === 'hermite';
    const sharedHeightMode = fromNode?.heightMode === toNode?.heightMode
      ? fromNode.heightMode
      : 'absolute';
    const heightOffset = sharedHeightMode === 'offset'
      ? Number(fromNode.heightOffset || 0) + (Number(toNode.heightOffset || 0) - Number(fromNode.heightOffset || 0)) * nearest.curveT
      : 0;
    const nodeId = `${path.id}:node:${Date.now().toString(36)}`;
    selectedPathNodeId = nodeId;
    selectedPathNodeIds = new Set([nodeId]);
    await transactPathNetwork(path, {
      label: 'Insert path node',
      terrainRevision: compiledSegment?.curveAuthority?.terrainRevision,
      operations: [{
        type: 'insert-node',
        segmentId: nearest.segmentId,
        curveT: nearest.curveT,
        preserveCurve,
        curveAuthority: preserveCurve ? compiledSegment?.curveAuthority : null,
        node: {
          id: nodeId,
          position: [...nearest.position],
          heightMode: sharedHeightMode,
          heightOffset
        }
      }]
    });
  };
  window.addEventListener('mouseup', event => {
    if (event.button !== 2 || !pendingPathInsertGesture) return;
    const releasedGesture = updatePathInsertGesture(pendingPathInsertGesture, event);
    const decision = completePathInsertGesture(releasedGesture, {
      pathId: splineEditPathId,
      now: performance.now()
    });
    pendingPathInsertGesture = null;
    completedPathInsertGesture = decision.gesture;
    if (decision.shouldInsert) void insertPathNodeFromViewport(event, 'right-click-release');
  }, true);
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const decision = contextMenuPathInsertDecision({
      pendingGesture: updatePathInsertGesture(pendingPathInsertGesture, event),
      completedGesture: completedPathInsertGesture,
      pathId: splineEditPathId,
      now: performance.now()
    });
    pendingPathInsertGesture = null;
    completedPathInsertGesture = decision.gesture;
    if (decision.shouldInsert) void insertPathNodeFromViewport(event, 'contextmenu');
  }, true);
  window.addEventListener('blur', () => {
    pendingPathInsertGesture = null;
    completedPathInsertGesture = null;
  });
  document.addEventListener('pointerlockchange', () => {
    pendingPathInsertGesture = null;
    completedPathInsertGesture = null;
  });
  const cancelViewportEdits = () => {
    cancelNodeDrag();
    cancelPathHandleDrag();
  };
  document.addEventListener('pointerlockchange', cancelViewportEdits);
  window.addEventListener('blur', cancelViewportEdits);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelViewportEdits();
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') cancelViewportEdits();
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
