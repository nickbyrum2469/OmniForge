const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

let foundation = null;
let splineEditPathId = null;
let draggingNode = null;
let inspectorObserver = null;
let overlayFrame = 0;

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
  foundation = payload;
  if (payload?.state) bridge()?.applyState?.(payload.state, { forceSelection });
  refreshToolbar();
  enhanceInspector();
}

async function refreshFoundation() {
  try {
    applyPayload(await api('/api/v011/worldgen'));
  } catch (error) {
    bridge()?.showToast?.(error.message, 'error');
  }
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
    <div class="v011-readout"><span>Bounds</span><code>${properties.bounds ? `${properties.bounds.minX.toFixed(0)}, ${properties.bounds.minZ.toFixed(0)} → ${properties.bounds.maxX.toFixed(0)}, ${properties.bounds.maxZ.toFixed(0)}` : 'not migrated'}</code></div>
    <div class="v011-readout"><span>Relief</span><code>${diagnostics ? diagnostics.relief.toFixed(2) : '—'} m</code></div>
    <div class="v011-readout"><span>Pattern risk</span><code>${escapeHtml(diagnostics?.repetitiveBandRisk || '—')}</code></div>
    <p class="v011-note">World expansion changes explicit terrain bounds. It does not scale terrain coordinates, path nodes, noise frequency, or existing object positions.</p>
  </section>`;
}

function pathPanel(object) {
  const properties = object.properties || {};
  const diagnostics = foundation?.pathDiagnostics?.find(item => item.pathId === object.id);
  const middle = Math.max(1, Math.floor((properties.points?.length || 2) / 2));
  return `<section class="v011-authoring-panel" data-v011-panel="path">
    <div class="v011-panel-title"><div><small>SPLINE + GRADE v0.11</small><strong>Path engineering</strong></div><span>${properties.points?.length || 0} nodes</span></div>
    <button id="v011SplineEdit" class="button ${splineEditPathId === object.id ? 'primary' : 'subtle'}" type="button">${splineEditPathId === object.id ? 'Finish spline editing' : 'Edit nodes in viewport'}</button>
    <p class="v011-note"><strong>Viewport:</strong> drag a node with the left mouse button. Right-click terrain to insert a node into the nearest spline segment.</p>
    <div class="v011-grid">
      <label class="v011-field"><span>Spline path</span><input data-v011-path-check="spline" type="checkbox" ${properties.spline !== false ? 'checked' : ''}></label>
      <label class="v011-field"><span>Show this spline</span><input data-v011-path-check="showSpline" type="checkbox" ${properties.showSpline !== false ? 'checked' : ''}></label>
      ${numberControl('Spline tension', 'splineTension', properties.splineTension, { step: 0.05, min: 0, max: 1 })}
      ${numberControl('Samples/segment', 'samplesPerSegment', properties.samplesPerSegment, { step: 1, min: 2, max: 64 })}
      <label class="v011-field"><span>Cut/fill terrain</span><input data-v011-path-check="carveTerrain" type="checkbox" ${properties.carveTerrain ? 'checked' : ''}></label>
      ${numberControl('Maximum grade %', 'maxGradePercent', properties.maxGradePercent, { step: 0.5, min: 0.1, max: 100 })}
      ${numberControl('Maximum cut', 'maxCutDepth', properties.maxCutDepth, { step: 0.25, min: 0, max: 1000 })}
      ${numberControl('Maximum fill', 'maxFillDepth', properties.maxFillDepth, { step: 0.25, min: 0, max: 1000 })}
      ${numberControl('Cut shoulder', 'cutShoulder', properties.cutShoulder, { step: 0.25, min: 0.1, max: 200 })}
    </div>
    <div class="v011-actions"><button id="v011ReversePath" type="button">Reverse direction</button><label>Split at node <input id="v011SplitIndex" type="number" min="1" max="${Math.max(1, (properties.points?.length || 2) - 2)}" step="1" value="${middle}"></label><button id="v011SplitPath" type="button">Split path</button></div>
    <div class="v011-readout"><span>Raw maximum grade</span><code>${diagnostics ? diagnostics.rawMaxGradePercent.toFixed(1) : '—'}%</code></div>
    <div class="v011-readout"><span>Compiled grade</span><code>${diagnostics ? diagnostics.compiledMaxGradePercent.toFixed(1) : '—'}%</code></div>
    <div class="v011-readout"><span>Grade validation</span><code>${escapeHtml(diagnostics?.validation || '—')}</code></div>
    <p class="v011-note">Cut/fill is bounded by maximum cut, fill, and grade. The terrain remains authoritative; the path cannot flatten or rescale the whole world.</p>
  </section>`;
}

function referencePanel(object) {
  if (object.id !== 'block-main' && object.name !== 'Scene Block' && object.name !== 'Scale Reference Block') return '';
  return `<section class="v011-authoring-panel"><div class="v011-panel-title"><div><small>STARTER REFERENCE</small><strong>Scale Reference Block</strong></div></div><p class="v011-note">This is only a starter scale, lighting, collision, and shadow reference. It has no hidden scene-management behavior and can be moved or deleted. A production animated character and Character Studio are separate roadmap systems—not disguised inside this box.</p></section>`;
}

function enhanceInspector() {
  const container = $('#inspectorContent');
  const object = selectedObject();
  if (!container || !object) return;
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
  container.querySelectorAll('[data-v011-panel="terrain"] [data-v011-property]').forEach(input => input.addEventListener('change', () => updateTerrain(object.id, { [input.dataset.v011Property]: Number(input.value) })));
  container.querySelectorAll('[data-v011-expand]').forEach(button => button.addEventListener('click', () => expandWorld(object.id, button.dataset.v011Expand)));

  $('#v011SplineEdit')?.addEventListener('click', () => {
    splineEditPathId = splineEditPathId === object.id ? null : object.id;
    document.body.classList.toggle('v011-spline-editing', Boolean(splineEditPathId));
    enhanceInspector();
  });
  container.querySelectorAll('[data-v011-panel="path"] [data-v011-property]').forEach(input => input.addEventListener('change', () => updatePath(object.id, { [input.dataset.v011Property]: Number(input.value) })));
  container.querySelectorAll('[data-v011-path-check]').forEach(input => input.addEventListener('change', () => updatePath(object.id, { [input.dataset.v011PathCheck]: input.checked })));
  $('#v011ReversePath')?.addEventListener('click', () => pathAction(object.id, 'reverse'));
  $('#v011SplitPath')?.addEventListener('click', () => pathAction(object.id, 'split', { index: Number($('#v011SplitIndex')?.value || 1) }));
}

async function updateTerrain(id, properties) {
  try {
    applyPayload(await api(`/api/v011/terrain/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);
    bridge()?.showToast?.('Terrain regenerated from stable world-space coordinates', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function expandWorld(id, direction) {
  const amount = Number(selectedObject()?.properties?.expandStep || 100);
  try {
    applyPayload(await api(`/api/v011/terrain/${encodeURIComponent(id)}/expand`, { method: 'POST', body: { direction, amount } }), true);
    bridge()?.showToast?.(`Expanded world ${direction} by ${amount} units`, 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function updatePath(id, properties) {
  try {
    applyPayload(await api(`/api/v011/path/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } }), true);
    bridge()?.showToast?.('Spline and grade profile updated', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function pathAction(id, action, body = {}) {
  try {
    applyPayload(await api(`/api/v011/path/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }), true);
    splineEditPathId = action === 'split' ? null : splineEditPathId;
    bridge()?.showToast?.(action === 'split' ? 'Path split into connected spline objects' : 'Path direction reversed', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

function installToolbar() {
  if ($('#splineToggle')) return;
  const grid = $('#gridToggle')?.closest('label');
  if (!grid) return;
  const label = document.createElement('label');
  label.className = 'toolbar-check';
  label.innerHTML = '<input id="splineToggle" type="checkbox" checked><span>Splines</span>';
  grid.insertAdjacentElement('afterend', label);
  $('#splineToggle').addEventListener('change', async event => {
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
  draggingNode = { pathId: path.id, index: Number(event.currentTarget.dataset.splineNode), pointerId: event.pointerId };
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
    applyPayload(await api(`/api/v011/path/${encodeURIComponent(drag.pathId)}/node/${drag.index}`, { method: 'PATCH', body: { x: point[0], z: point[1] } }), true);
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

function installViewportEditing() {
  const canvas = $('#viewport');
  if (!canvas || canvas.dataset.v011EditingBound) return;
  canvas.dataset.v011EditingBound = 'true';
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
      applyPayload(await api(`/api/v011/path/${encodeURIComponent(splineEditPathId)}/node`, { method: 'POST', body: { x: point[0], z: point[2] } }), true);
      bridge()?.showToast?.('Spline node inserted', 'success');
    } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
  }, true);
}

function watchInspector() {
  const target = $('#inspectorContent');
  if (!target || inspectorObserver) return;
  inspectorObserver = new MutationObserver(() => queueMicrotask(enhanceInspector));
  inspectorObserver.observe(target, { childList: true, subtree: false });
}

async function bootstrap() {
  const deadline = Date.now() + 15000;
  while (!bridge() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (!bridge()) return;
  installToolbar();
  installOverlay();
  installViewportEditing();
  watchInspector();
  await refreshFoundation();
  renderNodeOverlay();
  window.addEventListener('omniforge:apply-state', () => queueMicrotask(() => { refreshFoundation(); enhanceInspector(); }));
}

bootstrap();
