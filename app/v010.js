import { applyCompactWorldRuntime, shouldAdvanceWorldTime } from './world-runtime.js';

const $ = selector => document.querySelector(selector);

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}.`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

const field = id => document.getElementById(id);
const numeric = (id, fallback = 0) => {
  const value = Number(field(id)?.value);
  return Number.isFinite(value) ? value : fallback;
};

let snapshot = null;
let lastFoliageTransaction = null;
let timeTimer = null;
let timeStepInFlight = false;
let previewTimeInEditor = sessionStorage.getItem('omniforge.previewTimeInEditor') === '1';

function synchronizeAuthoritativeEditor() {
  if (snapshot?.state) window.dispatchEvent(new CustomEvent('omniforge:apply-state', { detail: { state: snapshot.state } }));
}

function synchronizeRuntimeOnly() {
  const target = window.__omniforgeV011Bridge?.snapshot?.();
  if (!target || !applyCompactWorldRuntime(target, snapshot?.runtime)) return false;
  const wrap = document.getElementById('viewportWrap');
  if (wrap) wrap.dataset.environmentRenderer = 'webgl';
  return true;
}

function setStatus(message, error = false) {
  const node = field('v010Status');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? '#ff9ea8' : '#b7c2d2';
}

function selectedAssetId() {
  return snapshot?.state?.editor?.selectedAssetId || null;
}

function formatTime(hours) {
  const normalized = ((Number(hours) || 0) % 24 + 24) % 24;
  const hour = Math.floor(normalized);
  const minute = Math.floor((normalized - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function installWorldPanel() {
  if (field('v010WorldTab')) return;
  const tabs = $('.panel-tabs');
  const assetTab = field('assetsTab');
  if (!tabs || !assetTab) {
    setTimeout(installWorldPanel, 200);
    return;
  }

  const tabButton = document.createElement('button');
  tabButton.type = 'button';
  tabButton.className = 'panel-tab';
  tabButton.textContent = 'World';
  tabButton.dataset.v010WorldTab = '1';
  tabs.appendChild(tabButton);

  const panel = document.createElement('section');
  panel.id = 'v010WorldTab';
  panel.className = 'left-tab v010-world-tab';
  panel.innerHTML = `
    <div class="studio-heading">
      <div><small>CONNECTED WORLD SYSTEMS</small><strong>Foliage, lighting, atmosphere, and time</strong></div>
      <span class="studio-badge">v0.10</span>
    </div>
    <p class="v010-section-note">Every control edits the authoritative project scene. Imported assets, generated foliage, terrain, lights, weather, and AI tools share the same persistent state.</p>

    <div class="v010-card">
      <header><b>Time + celestial lighting</b><span id="v010TimeReadout" class="v010-chip">12:00</span></header>
      <div class="v010-grid">
        <label>Time of day<input id="v010Hours" type="range" min="0" max="24" step="0.05"></label>
        <label>Time scale<input id="v010TimeScale" type="number" min="-86400" max="86400" step="10"></label>
        <label>Sun intensity<input id="v010SunIntensity" type="number" min="0" max="20" step="0.1"></label>
        <label>Lighting profile<select id="v010LightingProfile"><option value="compatibility">GTX 1650 compatibility</option><option value="balanced">Balanced</option><option value="quality">Quality</option><option value="reference">Reference capture</option></select></label>
        <label>Preview time while editing<input id="v010PreviewTime" type="checkbox"></label>
      </div>
      <div class="v010-actions"><button id="v010ApplyWorld" class="button primary" type="button">Apply world</button><button id="v010ToggleTime" class="button subtle" type="button">Pause time</button></div>
      <p class="v010-section-note">Automatic time advances in Play mode. Editor preview is opt-in so lighting updates cannot interrupt viewport input or rebuild the entire workspace while authoring.</p>
    </div>

    <div class="v010-card">
      <header><b>Atmosphere Studio</b><span class="v010-chip">SCATTERING + AERIAL PERSPECTIVE</span></header>
      <div class="v010-grid">
        <label>Quality<select id="v010AtmosphereQuality"><option value="compatibility">Compatibility LUT</option><option value="balanced">Balanced LUT</option><option value="quality">Quality volumetrics</option><option value="reference">Reference</option></select></label>
        <label>Visibility (km)<input id="v010Visibility" type="number" min="2" max="500" step="1"></label>
        <label>Rayleigh<input id="v010Rayleigh" type="range" min="0" max="3" step="0.01"></label>
        <label>Mie haze<input id="v010Mie" type="range" min="0" max="1" step="0.01"></label>
        <label>Humidity<input id="v010Humidity" type="range" min="0" max="1" step="0.01"></label>
        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Cloud cover<input id="v010Clouds" type="range" min="0" max="1" step="0.01"></label>
        <label>Fog<input id="v010Fog" type="range" min="0" max="1" step="0.01"></label>
        <label>Weather<select id="v010Weather"><option value="clear">Clear</option><option value="partly-cloudy">Partly cloudy</option><option value="overcast">Overcast</option><option value="rain">Rain</option><option value="storm">Storm</option><option value="snow">Snow</option><option value="fog">Fog</option></select></label>
      </div>
    </div>

    <div class="v010-card">
      <header><b>Foliage + Biome foundation</b><span id="v010FoliageCount" class="v010-chip">0 species</span></header>
      <div class="v010-grid">
        <label>Imported foliage model<select id="v010FoliageAsset"></select></label>
        <label>Species<select id="v010Species"></select></label>
        <label>Seed<input id="v010Seed" type="number" value="1337"></label>
        <label>Radius<input id="v010Radius" type="number" min="2" max="500" value="28"></label>
        <label>Density<input id="v010Density" type="number" min="0.001" max="1" step="0.005" value="0.035"></label>
        <label>Spacing<input id="v010Spacing" type="number" min="0.1" max="50" step="0.1" value="2.5"></label>
      </div>
      <div class="v010-actions"><button id="v010CreateSpecies" class="button subtle" type="button">Create species</button><button id="v010Generate" class="button primary" type="button">Preview region</button><button id="v010Commit" class="button subtle" type="button">Commit preview</button><button id="v010Cancel" class="button subtle" type="button">Cancel preview</button></div>
    </div>

    <div class="v010-card v010-danger-card">
      <header><b>Selected import lifecycle</b><span id="v010SelectedAsset" class="v010-chip">none</span></header>
      <p class="v010-section-note">Archive is reversible. Delete first checks every scene usage and recipe dependency, then moves managed files to OmniForge trash.</p>
      <div class="v010-actions"><button id="v010Usages" class="button subtle" type="button">Find usages</button><button id="v010Archive" class="button subtle" type="button">Archive</button><button id="v010Restore" class="button subtle" type="button">Restore</button><button id="v010Delete" class="button danger" type="button">Delete import</button></div>
    </div>

    <div id="v010Status" class="v010-status">Loading connected world state…</div>
  `;
  assetTab.parentNode.insertBefore(panel, assetTab.nextSibling);

  tabButton.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.left-tab').forEach(item => item.classList.remove('active'));
    tabButton.classList.add('active');
    panel.classList.add('active');
    refresh();
  });
  document.querySelectorAll('.panel-tab:not([data-v010-world-tab])').forEach(item => {
    item.addEventListener('click', () => panel.classList.remove('active'));
  });

  bindControls();
  refresh();
  const version = field('engineVersion');
  if (version) version.textContent = 'v0.10.0';
  const renderBadge = field('renderBadge');
  if (renderBadge) renderBadge.textContent = 'HYBRID PBR + ATMOSPHERE';
}

function applyViewportEnvironment() {
  const wrap = document.getElementById('viewportWrap');
  if (!wrap) return;
  wrap.dataset.environmentRenderer = 'webgl';
  wrap.dataset.weather = String(snapshot?.world?.weather?.preset || 'clear');
}

function populate(options = {}) {
  if (!snapshot?.world) return;
  const world = snapshot.world;
  field('v010TimeReadout').textContent = formatTime(world.time.hours);
  field('v010ToggleTime').textContent = world.time.enabled === false ? 'Resume time' : 'Pause time';
  if (field('v010PreviewTime')) field('v010PreviewTime').checked = previewTimeInEditor;
  if (options.runtimeOnly) { applyViewportEnvironment(); return; }
  field('v010Hours').value = world.time.hours;
  field('v010TimeScale').value = world.time.timeScale;
  field('v010SunIntensity').value = world.lighting.sunIntensity;
  field('v010LightingProfile').value = world.lighting.profile;
  field('v010AtmosphereQuality').value = world.atmosphere.quality;
  field('v010Visibility').value = world.atmosphere.visibilityKm;
  field('v010Rayleigh').value = world.atmosphere.rayleigh;
  field('v010Mie').value = world.atmosphere.mie;
  field('v010Humidity').value = world.atmosphere.humidity;
  field('v010Stars').value = world.sky.starIntensity;
  field('v010Clouds').value = world.clouds.coverage;
  field('v010Fog').value = world.weather.fog;
  field('v010Weather').value = world.weather.preset;

  const models = snapshot.assets.filter(item => item.type === 'model' && !item.archived);
  const species = snapshot.assets.filter(item => item.type === 'foliageSpecies');
  field('v010FoliageAsset').innerHTML = models.map(item => `<option value="${item.id}">${item.name} · ${item.category}</option>`).join('');
  field('v010Species').innerHTML = species.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  field('v010FoliageCount').textContent = `${species.length} species`;
  field('v010SelectedAsset').textContent = selectedAssetId() || 'none';
  applyViewportEnvironment();
}

async function refresh() {
  try {
    snapshot = await api('/api/v010/world');
    synchronizeAuthoritativeEditor();
    populate();
    const worker = snapshot.runtimeDiagnostics?.workers?.local;
    setStatus(worker?.ready === false
      ? 'World systems are connected, but the packaged worker is missing in this build. Rebuild the desktop application from v0.10.'
      : 'World systems connected. Marketplace downloads do not require MCP. Imported and generated objects share scene lighting, shadows, fog, exposure, atmosphere, and weather.');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function applyWorld(extra = {}) {
  const payload = {
    time: { hours: numeric('v010Hours', 12), timeScale: numeric('v010TimeScale', 60), ...(extra.time || {}) },
    lighting: { sunIntensity: numeric('v010SunIntensity', 3.2), profile: field('v010LightingProfile').value },
    atmosphere: {
      quality: field('v010AtmosphereQuality').value,
      visibilityKm: numeric('v010Visibility', 120),
      rayleigh: numeric('v010Rayleigh', 1),
      mie: numeric('v010Mie', 0.16),
      humidity: numeric('v010Humidity', 0.22)
    },
    sky: { starIntensity: numeric('v010Stars', 1) },
    clouds: { coverage: numeric('v010Clouds', 0.25) },
    weather: { preset: field('v010Weather').value, fog: numeric('v010Fog', 0.04) }
  };
  snapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(payload) });
  synchronizeAuthoritativeEditor();
  populate();
}

function bindControls() {
  field('v010ApplyWorld').addEventListener('click', async () => {
    try {
      await applyWorld();
      setStatus('World settings were applied to the authoritative scene and renderer inputs.');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010ToggleTime').addEventListener('click', async () => {
    try {
      await applyWorld({ time: { enabled: snapshot?.world?.time?.enabled === false } });
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010CreateSpecies').addEventListener('click', async () => {
    try {
      const sourceAssetId = field('v010FoliageAsset').value;
      if (!sourceAssetId) throw new Error('Import or select a foliage model first.');
      const result = await api('/api/v010/foliage/species', {
        method: 'POST',
        body: JSON.stringify({ sourceAssetId, spacing: numeric('v010Spacing', 2.5) })
      });
      setStatus(`Created foliage species: ${result.species.name}.`);
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010Generate').addEventListener('click', async () => {
    try {
      const speciesId = field('v010Species').value;
      if (!speciesId) throw new Error('Create a foliage species first.');
      const result = await api('/api/v010/foliage/generate', {
        method: 'POST',
        body: JSON.stringify({
          speciesId,
          seed: numeric('v010Seed', 1337),
          radius: numeric('v010Radius', 28),
          density: numeric('v010Density', 0.035)
        })
      });
      lastFoliageTransaction = result.transactionId;
      setStatus(`Previewed ${result.count} deterministic foliage instances. Paths and structures were excluded.`);
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010Commit').addEventListener('click', async () => {
    if (!lastFoliageTransaction) return setStatus('Generate a foliage preview first.', true);
    try {
      const result = await api('/api/v010/foliage/commit', {
        method: 'POST',
        body: JSON.stringify({ transactionId: lastFoliageTransaction })
      });
      setStatus(`Committed ${result.count} foliage instances.`);
      lastFoliageTransaction = null;
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010Cancel').addEventListener('click', async () => {
    if (!lastFoliageTransaction) return setStatus('There is no active foliage preview.', true);
    try {
      const result = await api('/api/v010/foliage/cancel', {
        method: 'POST',
        body: JSON.stringify({ transactionId: lastFoliageTransaction })
      });
      setStatus(`Removed ${result.removed} foliage preview instances.`);
      lastFoliageTransaction = null;
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010Usages').addEventListener('click', async () => {
    const assetId = selectedAssetId();
    if (!assetId) return setStatus('Select a model import in Assets first.', true);
    try {
      const result = await api(`/api/v010/assets/${encodeURIComponent(assetId)}/usages`);
      const lines = [
        `Scene usages: ${result.sceneUsages.length}`,
        `Dependencies: ${result.dependencies.length}`,
        ...result.sceneUsages.map(item => `${item.sceneName}: ${item.objectName}`),
        ...result.dependencies.map(item => `${item.type}: ${item.name}`)
      ];
      setStatus(lines.join('\n'));
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  for (const action of ['Archive', 'Restore']) {
    field(`v010${action}`).addEventListener('click', async () => {
      const assetId = selectedAssetId();
      if (!assetId) return setStatus('Select a model import in Assets first.', true);
      try {
        await api(`/api/v010/assets/${encodeURIComponent(assetId)}/${action.toLowerCase()}`, { method: 'POST', body: '{}' });
        setStatus(`${action} completed.`);
        await refresh();
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  field('v010Delete').addEventListener('click', async () => {
    const assetId = selectedAssetId();
    if (!assetId) return setStatus('Select a model import in Assets first.', true);
    if (!window.confirm('Move this import and its managed derivatives to OmniForge trash? Deletion will be blocked while references remain.')) return;
    try {
      await api(`/api/v010/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE', body: JSON.stringify({ removeUsages: false }) });
      setStatus('Import moved to managed trash.');
      await refresh();
    } catch (error) {
      const usages = error.payload;
      if (usages?.sceneUsages || usages?.dependencies) {
        setStatus(`Deletion blocked. Scene usages: ${usages.sceneUsages?.length || 0}; dependencies: ${usages.dependencies?.length || 0}. Remove or replace them first.`, true);
      } else {
        setStatus(error.message, true);
      }
    }
  });

  field('v010PreviewTime')?.addEventListener('change', event => {
    previewTimeInEditor = Boolean(event.target.checked);
    sessionStorage.setItem('omniforge.previewTimeInEditor', previewTimeInEditor ? '1' : '0');
    setStatus(previewTimeInEditor
      ? 'Editor time preview enabled. Compact lighting patches will update without replacing the workspace.'
      : 'Editor time preview paused. Time still advances normally in Play mode.');
  });

  timeTimer = window.setInterval(async () => {
    const bridgeSnapshot = window.__omniforgeV011Bridge?.snapshot?.();
    if (!shouldAdvanceWorldTime({
      enabled: snapshot?.world?.time?.enabled,
      editorMode: bridgeSnapshot?.state?.editor?.mode || 'edit',
      previewInEditor: previewTimeInEditor,
      documentHidden: document.hidden,
      inFlight: timeStepInFlight
    })) return;
    timeStepInFlight = true;
    const finishDiagnostic=window.__omniforgeDiagnostics?.begin?.('world-time-step')||(()=>{});
    try {
      const stepped = await api('/api/v010/world/step', { method: 'POST', body: JSON.stringify({ seconds: 2 }) });
      snapshot = {
        ...snapshot,
        ...stepped,
        state: snapshot?.state,
        assets: snapshot?.assets || [],
        transactions: snapshot?.transactions || [],
        runtimeDiagnostics: snapshot?.runtimeDiagnostics || {},
        scene: stepped.runtime?.settings ? { ...(snapshot?.scene || {}), id: stepped.runtime.sceneId, settings: stepped.runtime.settings } : snapshot?.scene
      };
      synchronizeRuntimeOnly();
      populate({ runtimeOnly: true });
      finishDiagnostic({advanced:true});
    } catch (error) {
      finishDiagnostic({error:error.message});
      // The regular refresh/error UI handles runtime disconnects.
    } finally {
      timeStepInFlight = false;
    }
  }, 2000);
}

window.addEventListener('beforeunload', () => {
  if (timeTimer) window.clearInterval(timeTimer);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWorldPanel);
else installWorldPanel();
