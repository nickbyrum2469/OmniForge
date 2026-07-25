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
    paths.map(path => [path.id, path.visible !== false, path.properties?.profileRevision || 0, path.properties?.points || []])
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

function numberControl(label, key, value, options = {}) {
  return `<label class="v011-field"><span>${escapeHtml(label)}</span><input data-v011-property="${escapeHtml(key)}" type="number" value="${Number(value ?? 0)}" step="${options.step ?? 0.1}" ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''}></label>`;
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
  const diagnostics = foundation?.pathDiagnostics?.find(item => item.pathId === object.id);
  const middle = Math.max(1, Math.floor((properties.points?.length || 2) / 2));
  const selectedIndex = Math.max(0, Math.min((properties.points?.length || 1) - 1, Number(selectedSplineNodeIndex ?? middle)));
  const selectedPoint = properties.points?.[selectedIndex] || [0, 0];
  return `<section class="v011-authoring-panel" data-v011-panel="path">
    <div class="v011-panel-title"><div><small>SPLINE + GRADE v0.11</small><strong>Path engineering</strong></div><span>${properties.points?.length || 0} nodes</span></div>
    <button id="v011SplineEdit" class="button ${splineEditPathId === object.id ? 'primary' : 'subtle'}" type="button">${splineEditPathId === object.id ? 'Finish spline editing' : 'Edit nodes in viewport'}</button>
    <p class="v011-note"><strong>Viewport:</strong> drag a node with the left mouse button. Right-click terrain to insert a node into the nearest spline segment.</p>
    <div class="v011-grid">
      <label class="v011-field"><span>Spline path</span><input data-v011-path-check="spline" type="checkbox" ${properties.spline !== false ? 'checked' : ''}></label>
      <label class="v011-field"><span>Show this spline</span><input data-v011-path-check="showSpline" type="checkbox" ${properties.showSpline !== false ? 'checked' : ''}></label>
      ${numberControl('Width', 'width', properties.width ?? 3, { step: 0.25, min: 0.1, max: 200 })}
      ${numberControl('Blend shoulder', 'blendDistance', properties.blendDistance ?? 2.5, { step: 0.25, min: 0.05, max: 200 })}
      ${numberControl('Surface offset', 'surfaceOffset', properties.surfaceOffset ?? 0.03, { step: 0.01, min: -10, max: 10 })}
      ${numberControl('Edge noise', 'edgeNoise', properties.edgeNoise ?? 0.45, { step: 0.05, min: 0, max: 5 })}
      ${numberControl('Spline tension', 'splineTension', properties.splineTension, { step: 0.05, min: 0, max: 1 })}
      ${numberControl('Samples/segment', 'samplesPerSegment', properties.samplesPerSegment, { step: 1, min: 2, max: 64 })}
      <label class="v011-field"><span>Cut/fill terrain</span><input data-v011-path-check="carveTerrain" type="checkbox" ${properties.carveTerrain ? 'checked' : ''}></label>
      ${numberControl('Maximum grade %', 'maxGradePercent', properties.maxGradePercent, { step: 0.5, min: 0.1, max: 100 })}
      ${numberControl('Maximum cut', 'maxCutDepth', properties.maxCutDepth, { step: 0.25, min: 0, max: 1000 })}
      ${numberControl('Maximum fill', 'maxFillDepth', properties.maxFillDepth, { step: 0.25, min: 0, max: 1000 })}
      ${numberControl('Cut shoulder', 'cutShoulder', properties.cutShoulder, { step: 0.25, min: 0.1, max: 200 })}
    </div>
    <div class="v011-node-editor">
      <div class="v011-panel-title"><div><small>SELECTED NODE</small><strong>Node ${selectedIndex + 1}</strong></div><span>X/Z</span></div>
      <div class="v011-grid"><label class="v011-field"><span>X</span><input id="v011NodeX" type="number" step="0.1" value="${Number(selectedPoint[0] || 0)}"></label><label class="v011-field"><span>Z</span><input id="v011NodeZ" type="number" step="0.1" value="${Number(selectedPoint[1] || 0)}"></label></div>
      <div class="v011-actions"><button id="v011ApplyNode" type="button">Apply coordinates</button><button id="v011InsertBefore" type="button">Insert before</button><button id="v011InsertAfter" type="button">Insert after</button><button id="v011DeleteNode" type="button">Delete node</button><button id="v011SplitPath" type="button">Split selected node</button></div>
    </div>
    <div class="v011-actions"><button id="v011ReversePath" type="button">Reverse direction</button></div>
    <div class="v011-readout"><span>Raw maximum grade</span><code>${diagnostics ? diagnostics.rawMaxGradePercent.toFixed(1) : '—'}%</code></div>
    <div class="v011-readout"><span>Compiled grade</span><code>${diagnostics ? diagnostics.compiledMaxGradePercent.toFixed(1) : '—'}%</code></div>
    <div class="v011-readout"><span>Grade validation</span><code>${escapeHtml(diagnostics?.validation || '—')}</code></div>
    <p class="v011-note">Cut/fill is bounded by maximum cut, fill, and grade. The terrain remains authoritative; the path cannot flatten or rescale the whole world.</p>
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
  const signature = `${object.id}:${currentSnapshot()?.state?.engine?.revision || 0}:${foundation?.terrainDiagnostics?.checkedAt || ''}`;
  if (container.dataset.v011Signature === signature && container.querySelector('[data-v011-panel]')) return;
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
  container.querySelectorAll('[data-v011-panel="path"] [data-v011-property]').forEach(input => input.addEventListener('change', () => updatePath(object.id, { [input.dataset.v011Property]: Number(input.value) })));
  container.querySelectorAll('[data-v011-path-check]').forEach(input => input.addEventListener('change', () => updatePath(object.id, { [input.dataset.v011PathCheck]: input.checked })));
  $('#v011ReversePath')?.addEventListener('click', () => pathAction(object.id, 'reverse'));
  $('#v011ApplyNode')?.addEventListener('click', () => updatePathNode(object.id, selectedIndex, Number($('#v011NodeX')?.value || 0), Number($('#v011NodeZ')?.value || 0)));
  $('#v011InsertBefore')?.addEventListener('click', () => insertPathNode(object.id, selectedIndex, selectedPoint));
  $('#v011InsertAfter')?.addEventListener('click', () => insertPathNode(object.id, selectedIndex + 1, selectedPoint));
  $('#v011DeleteNode')?.addEventListener('click', () => deletePathNode(object.id, selectedIndex));
  $('#v011SplitPath')?.addEventListener('click', () => pathAction(object.id, 'split', { index: selectedIndex }));
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
  const path = snapshot.scene.objects.find(object => object.id === splineEditPathId && object.type === 'path');
  const terrain = snapshot.scene.objects.find(object => object.type === 'terrain');
  if (!path || !terrain) { overlay.replaceChildren(); return; }
  const points = path.properties?.points || [];
  const existing = new Map([...overlay.querySelectorAll('[data-spline-node]')].map(node => [Number(node.dataset.splineNode), node]));
  points.forEach((point, index) => {
    const y = renderer.terrainHeightForScene?.(snapshot.scene, point[0], point[1]) ?? 0;
    const screen = renderer.worldToScreen?.(snapshot.camera, [point[0], y + 0.55, point[1]]);
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
    handle.classList.toggle('selected', index === Number(selectedSplineNodeIndex));
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
  draggingNode = { pathId: path.id, index: selectedSplineNodeIndex, pointerId: event.pointerId };
  enhanceInspector();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', dragNode, true);
  window.addEventListener('pointerup', finishNodeDrag, true);
}

function dragNode(event) {
  if (!draggingNode) return;
  event.preventDefault();
  const snapshot = currentSnapshot();
  const renderer = bridge()?.renderer?.();
  const point = renderer?.terrainPointFromScreen?.(snapshot.scene, snapshot.camera, event.clientX, event.clientY);
  const path = snapshot?.scene?.objects?.find(object => object.id === draggingNode.pathId);
  if (!point || !path?.properties?.points?.[draggingNode.index]) return;
  path.properties.points[draggingNode.index] = [point[0], point[2]];
  path.properties.profileRevision = Number(path.properties.profileRevision || 0) + 1;
}

async function finishNodeDrag(event) {
  if (!draggingNode) return;
  event.preventDefault();
  window.removeEventListener('pointermove', dragNode, true);
  window.removeEventListener('pointerup', finishNodeDrag, true);
  const snapshot = currentSnapshot();
  const path = snapshot?.scene?.objects?.find(object => object.id === draggingNode.pathId);
  const point = path?.properties?.points?.[draggingNode.index];
  const drag = draggingNode;
  draggingNode = null;
  if (!point) return;
  try {
    await applyMutation(await api(`/api/v011/path/${encodeURIComponent(drag.pathId)}/node/${drag.index}`, { method: 'PATCH', body: { x: point[0], z: point[1] } }), true);
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
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
    try {
      await applyMutation(await api(`/api/v011/path/${encodeURIComponent(splineEditPathId)}/node`, { method: 'POST', body: { x: point[0], z: point[2] } }), true);
      bridge()?.showToast?.('Spline node inserted', 'success');
    } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
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
