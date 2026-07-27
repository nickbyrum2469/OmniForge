import { applyCompactWorldRuntime, clearCelestialRuntimeInterpolation, shouldAdvanceWorldTime, updateCelestialRuntimeInterpolation } from './world-runtime.js';
import { applyEnvironmentPreset, environmentPresetOptions } from './environment-presets.js';

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
let celestialAnimationFrame = null;
let timeStepInFlight = false;
let liveWorldApplyTimer = null;
let liveWorldApplyInFlight = false;
let liveWorldApplyQueued = false;
let previewTimeInEditor = sessionStorage.getItem('omniforge.previewTimeInEditor') === '1';

function synchronizeAuthoritativeEditor() {
  const target = window.__omniforgeV011Bridge?.snapshot?.();
  if (target?.scene?.id) clearCelestialRuntimeInterpolation(target.scene.id);
  if (snapshot?.state) window.dispatchEvent(new CustomEvent('omniforge:apply-state', { detail: { state: snapshot.state } }));
}

function synchronizeRuntimeOnly() {
  const target = window.__omniforgeV011Bridge?.snapshot?.();
  if (!target || !applyCompactWorldRuntime(target, snapshot?.runtime)) return false;
  const wrap = document.getElementById('viewportWrap');
  if (wrap) wrap.dataset.environmentRenderer = 'webgl';
  return true;
}

function animateCelestialRuntime(now) {
  const target = window.__omniforgeV011Bridge?.snapshot?.();
  if (target) updateCelestialRuntimeInterpolation(target, now);
  celestialAnimationFrame = window.requestAnimationFrame(animateCelestialRuntime);
}

function ensureCelestialAnimation() {
  if (celestialAnimationFrame === null) celestialAnimationFrame = window.requestAnimationFrame(animateCelestialRuntime);
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
        <label>Editor lighting<select id="v010ViewportLightingMode"><option value="authoring-assist">Authoring Assist</option><option value="game-accurate">Game Accurate</option></select></label>
        <label>Look preset<select id="v010LookPreset">${environmentPresetOptions().map(item => `<option value="${item.id}">${item.label}</option>`).join('')}</select></label>
        <label>Preview time while editing<input id="v010PreviewTime" type="checkbox"></label>
      </div>
      <div class="v010-actions"><button id="v010ApplyWorld" class="button primary" type="button">Apply world</button><button id="v010ApplyPreset" class="button subtle" type="button">Apply look preset</button><button id="v010ToggleTime" class="button subtle" type="button">Pause time</button></div>
      <p class="v010-section-note">Automatic time advances in Play mode. Editor preview is opt-in so lighting updates cannot interrupt viewport input or rebuild the entire workspace while authoring.</p>
    </div>

    <div class="v010-card" data-v010-live-world>
      <header><b>Celestial Studio</b><span id="v010CelestialReadout" class="v010-chip">SUN + MOON</span></header>
      <div class="v010-grid">
        <label>Positioning<select id="v010CelestialMode"><option value="astronomical">Time-driven orbit</option><option value="manual">Manual azimuth/elevation</option></select></label>
        <label>Body size authority<select id="v010CelestialScaleMode"><option value="physical">Physical angular scale</option><option value="artistic">Artistic full-range scale</option></select></label>
        <label><span class="v010-label-row"><span>Sun size</span><output id="v010SunSizeValue" class="v010-control-value">1.00×</output></span><input id="v010SunSize" type="range" min="0.1" max="12" step="0.05"></label>
        <label>Sun glow<input id="v010SunGlow" type="range" min="0" max="5" step="0.05"></label>
        <label>Sun azimuth<input id="v010SunAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Sun elevation<input id="v010SunElevation" type="number" min="-90" max="90" step="1"></label>
        <label><span class="v010-label-row"><span>Moon size</span><output id="v010MoonSizeValue" class="v010-control-value">1.25×</output></span><input id="v010MoonSize" type="range" min="0.1" max="32" step="0.05"></label>
        <label>Phase authority<select id="v010MoonPhaseMode"><option value="sun-relative">Computed from Sun–Moon geometry</option><option value="manual">Manual artistic phase</option></select></label>
        <label>Moon age (days)<input id="v010MoonAge" type="range" min="0" max="29.530588" step="0.02"></label>
        <label>Manual phase<input id="v010MoonPhase" type="range" min="0" max="1" step="0.005"></label>
        <label>Orbit period (days)<input id="v010MoonOrbitPeriod" type="number" min="1" max="2000" step="0.001"></label>
        <label>Orbit inclination<input id="v010MoonInclination" type="number" min="0" max="45" step="0.01"></label>
        <label>Earthshine<input id="v010MoonEarthshine" type="range" min="0" max="0.5" step="0.005"></label>
        <label>Lunar events<select id="v010EclipseMode"><option value="automatic">Automatic eclipses</option><option value="off">Disabled</option><option value="force-solar">Force solar eclipse</option><option value="force-lunar">Force lunar eclipse</option></select></label>
        <label>Moon brightness<input id="v010MoonBrightness" type="range" min="0" max="5" step="0.05"></label>
        <label>Moon glow<input id="v010MoonGlow" type="range" min="0" max="5" step="0.05"></label>
        <label>Moon detail<input id="v010MoonDetail" type="range" min="0" max="3" step="0.05"></label>
        <label>Moon craters<input id="v010MoonCraters" type="range" min="0" max="2" step="0.02"></label>
        <label>Moon maria pattern<input id="v010MoonMaria" type="range" min="0" max="2" step="0.02"></label>
        <label>Moon surface contrast<input id="v010MoonContrast" type="range" min="0.2" max="3" step="0.02"></label>
        <label>Moon relief<input id="v010MoonRelief" type="range" min="0" max="2" step="0.02"></label>
        <label>Moon pattern rotation<input id="v010MoonPatternRotation" type="range" min="-180" max="180" step="1"></label>
        <label>Moon pattern seed<input id="v010MoonPatternSeed" type="number" step="1"></label>
        <label>Moon limb darkening<input id="v010MoonLimb" type="range" min="0" max="1" step="0.01"></label>
        <label>Eclipse coverage<input id="v010EclipseCoverage" type="range" min="0.5" max="2" step="0.01"></label>
        <label>Moon azimuth<input id="v010MoonAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Moon elevation<input id="v010MoonElevation" type="number" min="-90" max="90" step="1"></label>
        <label>Show planet<input id="v010PlanetEnabled" type="checkbox"></label>
        <label><span class="v010-label-row"><span>Planet size</span><output id="v010PlanetSizeValue" class="v010-control-value">4.50×</output></span><input id="v010PlanetSize" type="range" min="0.1" max="18" step="0.1"></label>
        <label>Planet azimuth<input id="v010PlanetAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Planet elevation<input id="v010PlanetElevation" type="number" min="-90" max="90" step="1"></label>
        <label>Planet rings<input id="v010PlanetRings" type="range" min="0" max="1" step="0.01"></label>
      </div>
      <div id="v010ScaleHint" class="v010-section-note v010-scale-hint">Physical scale preserves realistic angular sizes. Choose Artistic scale to honor the full sliders while keeping either orbit mode.</div>
      <p class="v010-section-note">Time-driven mode follows world time. Manual mode preserves the exact Sun, Moon, and planet positions entered here. Positioning and body scale are independent.</p>
      <div id="v010EnvironmentDiagnostics" class="v010-status">Celestial authority loading…</div>
    </div>

    <div class="v010-card" data-v010-live-world>
      <header><b>Atmosphere Studio</b><span class="v010-chip">SCATTERING + AERIAL PERSPECTIVE</span></header>
      <div class="v010-grid">
        <label>Quality<select id="v010AtmosphereQuality"><option value="compatibility">Compatibility LUT</option><option value="balanced">Balanced LUT</option><option value="quality">Quality volumetrics</option><option value="reference">Reference</option></select></label>
        <label>Visibility (km)<input id="v010Visibility" type="number" min="2" max="500" step="1"></label>
        <label>Rayleigh<input id="v010Rayleigh" type="range" min="0" max="3" step="0.01"></label>
        <label>Mie haze<input id="v010Mie" type="range" min="0" max="1" step="0.01"></label>
        <label>Mie directionality<input id="v010MieAnisotropy" type="range" min="0" max="0.95" step="0.01"></label>
        <label>Ozone / twilight<input id="v010Ozone" type="range" min="0" max="3" step="0.01"></label>
        <label>Atmospheric dust<input id="v010Dust" type="range" min="0" max="1" step="0.005"></label>
        <label>Aerial perspective<input id="v010AerialPerspective" type="range" min="0" max="3" step="0.01"></label>
        <label>Humidity<input id="v010Humidity" type="range" min="0" max="1" step="0.01"></label>
        <label>Clear-air haze<input id="v010Haze" type="range" min="0" max="1" step="0.005"></label>
        <label>Day fog response<input id="v010DayFog" type="range" min="0" max="2" step="0.01"></label>
        <label>Night fog response<input id="v010NightFog" type="range" min="0" max="2" step="0.01"></label>
        <label>Exposure<input id="v010Exposure" type="range" min="0.2" max="3" step="0.02"></label>
        <label>Saturation<input id="v010Saturation" type="range" min="0" max="3" step="0.01"></label>
        <label>Contrast<input id="v010Contrast" type="range" min="0.2" max="3" step="0.01"></label>
        <label>Vibrance<input id="v010Vibrance" type="range" min="-1" max="1" step="0.01"></label>
        <label>Tone mapper<select id="v010ToneMapper"><option value="neutral">Neutral</option><option value="aces">ACES filmic</option></select></label>
        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Star density<input id="v010StarDensity" type="range" min="0.02" max="2" step="0.02"></label>
        <label>Star brightness<input id="v010StarBrightness" type="range" min="0" max="8" step="0.05"></label>
        <label>Twinkle amount<input id="v010StarTwinkle" type="range" min="0" max="1" step="0.01"></label>
        <label>Twinkle speed<input id="v010StarTwinkleSpeed" type="range" min="0" max="12" step="0.05"></label>
        <label><span class="v010-label-row"><span>Minimum star size</span><output id="v010StarSizeMinValue" class="v010-control-value">0.18 px</output></span><input id="v010StarSizeMin" type="range" min="0.05" max="4" step="0.05"></label>
        <label><span class="v010-label-row"><span>Maximum star size</span><output id="v010StarSizeMaxValue" class="v010-control-value">1.35 px</output></span><input id="v010StarSizeMax" type="range" min="0.05" max="8" step="0.05"></label>
        <label>Star color variation<input id="v010StarColorVariation" type="range" min="0" max="1" step="0.01"></label>
        <label>Star ray strength<input id="v010StarRays" type="range" min="0" max="2" step="0.01"></label>
        <label>Star ray length<input id="v010StarRayLength" type="range" min="0.1" max="4" step="0.02"></label>
        <label>Hero star fraction<input id="v010HeroStars" type="range" min="0" max="0.2" step="0.002"></label>
        <label>Star seed<input id="v010StarSeed" type="number" step="1"></label>
        <label>Daylight star extinction<input id="v010StarExtinction" type="range" min="0.1" max="8" step="0.05"></label>
        <label>Milky Way brightness<input id="v010MilkyWay" type="range" min="0" max="3" step="0.05"></label>
        <label><span class="v010-label-row"><span>Milky Way width</span><output id="v010MilkyWayWidthValue" class="v010-control-value">0.22</output></span><input id="v010MilkyWayWidth" type="range" min="0.02" max="0.8" step="0.01"></label>
        <label>Milky Way detail<input id="v010MilkyWayDetail" type="range" min="0" max="3" step="0.05"></label>
        <label>Milky Way orientation<input id="v010MilkyWayOrientation" type="range" min="-180" max="180" step="1"></label>
        <label>Milky Way dust lanes<input id="v010MilkyWayDust" type="range" min="0" max="1" step="0.01"></label>
        <label>Milky Way warp<input id="v010MilkyWayWarp" type="range" min="0" max="2" step="0.02"></label>
        <label>Milky Way clumping<input id="v010MilkyWayClumping" type="range" min="0" max="2" step="0.02"></label>
        <label>Galactic core<input id="v010MilkyWayCore" type="range" min="0" max="3" step="0.02"></label>
        <label>Width variation<input id="v010MilkyWayWidthVariation" type="range" min="0" max="2" step="0.02"></label>
        <label>Milky Way color<input id="v010MilkyWayColor" type="color"></label>
        <label>Cloud mode<select id="v010CloudQuality"><option value="layered">Optimized layered</option><option value="balanced">Volumetric balanced</option><option value="quality">Volumetric quality</option><option value="reference">Volumetric reference</option></select></label>
        <label>Cloud cover<input id="v010Clouds" type="range" min="0" max="1" step="0.01"></label>
        <label>Cloud density<input id="v010CloudDensity" type="range" min="0" max="1" step="0.01"></label>
        <label>Cloud altitude<input id="v010CloudAltitude" type="number" min="50" max="20000" step="50"></label>
        <label>Cloud thickness<input id="v010CloudThickness" type="number" min="50" max="20000" step="50"></label>
        <label>Cloud wind speed<input id="v010CloudWindSpeed" type="number" min="0" max="300" step="1"></label>
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
  field('v010ViewportLightingMode').value = world.lighting.viewportMode || 'authoring-assist';
  field('v010LookPreset').value = world.lookPreset || 'natural-balanced';
  field('v010AtmosphereQuality').value = world.atmosphere.quality;
  field('v010Visibility').value = world.atmosphere.visibilityKm;
  field('v010Rayleigh').value = world.atmosphere.rayleigh;
  field('v010Mie').value = world.atmosphere.mie;
  field('v010MieAnisotropy').value = world.atmosphere.mieAnisotropy ?? 0.78;
  field('v010Ozone').value = world.atmosphere.ozone ?? 1;
  field('v010Dust').value = world.atmosphere.dust ?? 0.02;
  field('v010AerialPerspective').value = world.atmosphere.aerialPerspective ?? 1;
  field('v010Humidity').value = world.atmosphere.humidity;
  field('v010Haze').value = world.atmosphere.haze ?? 0.006;
  field('v010DayFog').value = world.atmosphere.dayFogMultiplier ?? 0.04;
  field('v010NightFog').value = world.atmosphere.nightFogMultiplier ?? 0.18;
  field('v010Exposure').value = world.atmosphere.exposure;
  field('v010Saturation').value = world.atmosphere.saturation ?? 1.08;
  field('v010Contrast').value = world.atmosphere.contrast ?? 1.03;
  field('v010Vibrance').value = world.atmosphere.vibrance ?? 0.1;
  field('v010ToneMapper').value = world.atmosphere.toneMapper || 'neutral';
  field('v010CelestialMode').value = world.sky.celestialMode || 'astronomical';
  field('v010CelestialScaleMode').value = world.sky.celestialScaleMode || 'physical';
  field('v010SunSize').value = world.sky.sunSize ?? 1;
  field('v010SunGlow').value = world.sky.sunGlow ?? 1;
  field('v010SunAzimuth').value = world.sky.sunAzimuth ?? -90;
  field('v010SunElevation').value = world.sky.sunElevation ?? 45;
  field('v010MoonSize').value = world.sky.moonSize ?? 1.45;
  field('v010MoonPhaseMode').value = world.sky.moonPhaseMode || 'sun-relative';
  const celestialState = snapshot.scene?.settings?.environmentV010?.celestial || {};
  field('v010MoonAge').value = celestialState.moon?.ageDays ?? 14.765;
  field('v010MoonPhase').value = world.sky.moonPhase ?? 0.72;
  field('v010MoonOrbitPeriod').value = world.sky.moonOrbitPeriodDays ?? 29.530588;
  field('v010MoonInclination').value = world.sky.moonOrbitInclination ?? 5.145;
  field('v010MoonEarthshine').value = world.sky.moonEarthshine ?? 0.08;
  field('v010EclipseMode').value = world.sky.eclipseMode || 'automatic';
  field('v010MoonBrightness').value = world.sky.moonBrightness ?? 1.05;
  field('v010MoonGlow').value = world.sky.moonGlow ?? 0.7;
  field('v010MoonDetail').value = world.sky.moonDetail ?? 1;
  field('v010MoonCraters').value = world.sky.moonCraterStrength ?? 0.85;
  field('v010MoonMaria').value = world.sky.moonMariaStrength ?? 0.62;
  field('v010MoonContrast').value = world.sky.moonSurfaceContrast ?? 1.18;
  field('v010MoonRelief').value = world.sky.moonReliefStrength ?? 0.38;
  field('v010MoonPatternRotation').value = world.sky.moonPatternRotation ?? -12;
  field('v010MoonPatternSeed').value = world.sky.moonPatternSeed ?? 2718;
  field('v010MoonLimb').value = world.sky.moonLimbDarkening ?? 0.28;
  field('v010EclipseCoverage').value = world.sky.solarEclipseCoverage ?? 1.08;
  field('v010MoonAzimuth').value = world.sky.moonAzimuth ?? 90;
  field('v010MoonElevation').value = world.sky.moonElevation ?? 32;
  field('v010PlanetEnabled').checked = Boolean(world.sky.planetEnabled);
  field('v010PlanetSize').value = world.sky.planetSize ?? 4.5;
  field('v010PlanetAzimuth').value = world.sky.planetAzimuth ?? 215;
  field('v010PlanetElevation').value = world.sky.planetElevation ?? 28;
  field('v010PlanetRings').value = world.sky.planetRings ?? 0.65;
  field('v010Stars').value = world.sky.starIntensity;
  field('v010StarDensity').value = world.sky.starDensity ?? 0.72;
  field('v010StarBrightness').value = world.sky.starBrightness ?? 1;
  field('v010StarTwinkle').value = world.sky.starTwinkleAmount ?? 0.32;
  field('v010StarTwinkleSpeed').value = world.sky.starTwinkleSpeed ?? 1;
  field('v010StarSizeMin').value = world.sky.starSizeMin ?? 0.35;
  field('v010StarSizeMax').value = world.sky.starSizeMax ?? 1.8;
  field('v010StarColorVariation').value = world.sky.starColorVariation ?? 0.72;
  field('v010StarRays').value = world.sky.starRayStrength ?? 0.24;
  field('v010StarRayLength').value = world.sky.starRayLength ?? 1.15;
  field('v010HeroStars').value = world.sky.starHeroFraction ?? 0.035;
  field('v010StarSeed').value = world.sky.starSeed ?? 1337;
  field('v010StarExtinction').value = world.sky.starDaylightExtinction ?? 1.35;
  field('v010MilkyWay').value = world.sky.milkyWayIntensity ?? 0.32;
  field('v010MilkyWayWidth').value = world.sky.milkyWayWidth ?? 0.16;
  field('v010MilkyWayDetail').value = world.sky.milkyWayDetail ?? 0.72;
  field('v010MilkyWayOrientation').value = world.sky.milkyWayOrientation ?? 22;
  field('v010MilkyWayDust').value = world.sky.milkyWayDust ?? 0.7;
  field('v010MilkyWayWarp').value = world.sky.milkyWayWarp ?? 0.48;
  field('v010MilkyWayClumping').value = world.sky.milkyWayClumping ?? 0.72;
  field('v010MilkyWayCore').value = world.sky.milkyWayCoreStrength ?? 0.65;
  field('v010MilkyWayWidthVariation').value = world.sky.milkyWayWidthVariation ?? 0.6;
  field('v010MilkyWayColor').value = world.sky.milkyWayColor || '#8fa7d8';
  field('v010CloudQuality').value = world.clouds.quality || 'layered';
  field('v010Clouds').value = world.clouds.coverage;
  field('v010CloudDensity').value = world.clouds.density ?? 0.45;
  field('v010CloudAltitude').value = world.clouds.altitude ?? 2200;
  field('v010CloudThickness').value = world.clouds.thickness ?? 1800;
  field('v010CloudWindSpeed').value = world.clouds.windSpeed ?? 12;
  field('v010Fog').value = world.weather.fog;
  field('v010Weather').value = world.weather.preset;
  updateCelestialControlState();
  const celestialReadout = snapshot.scene?.settings?.environmentV010?.celestial;
  field('v010CelestialReadout').textContent = (world.sky.celestialMode === 'manual' ? 'MANUAL' : formatTime(world.time.hours)) + ' · ' + (celestialReadout?.moon?.phaseName || 'Moon') + ' ' + (Number(celestialReadout?.moon?.illumination ?? world.sky.moonPhase ?? 0.72) * 100).toFixed(0) + '%' + (celestialReadout?.event?.type && celestialReadout.event.type !== 'none' ? ' · ' + celestialReadout.event.type.replace('-', ' ').toUpperCase() : '');
  const environment = snapshot.scene?.settings?.environmentV010 || snapshot.state?.scenes?.find(item => item.id === snapshot.state?.activeSceneId)?.settings?.environmentV010 || {};
  const diagnostics = field('v010EnvironmentDiagnostics');
  if (diagnostics) diagnostics.textContent = `Authority: 1 Sun + 1 Moon · Day ${Number(environment.sunDayFactor || 0).toFixed(2)} · Twilight ${Number(environment.twilightFactor || 0).toFixed(2)} · Night ${Number(environment.nightFactor || 0).toFixed(2)} · Exposure ${Number(snapshot.scene?.settings?.exposure ?? 1).toFixed(2)} · ${previewTimeInEditor ? 'smooth editor preview' : 'authoritative edit pause'}`;

  const assets = Array.isArray(snapshot.assets) ? snapshot.assets : Array.isArray(snapshot.state?.assets) ? snapshot.state.assets : [];
  const models = assets.filter(item => item.type === 'model' && !item.archived);
  const species = assets.filter(item => item.type === 'foliageSpecies');
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

async function applyWorld(extra = {}, options = {}) {
  const payload = {
    lookPreset: options.preservePreset ? (snapshot?.world?.lookPreset || 'custom') : 'custom',
    time: { hours: numeric('v010Hours', 12), timeScale: numeric('v010TimeScale', 60), ...(extra.time || {}) },
    lighting: { sunIntensity: numeric('v010SunIntensity', 3.2), profile: field('v010LightingProfile').value, viewportMode: field('v010ViewportLightingMode').value },
    atmosphere: {
      quality: field('v010AtmosphereQuality').value,
      visibilityKm: numeric('v010Visibility', 120),
      rayleigh: numeric('v010Rayleigh', 1),
      mie: numeric('v010Mie', 0.16),
      mieAnisotropy: numeric('v010MieAnisotropy', 0.78),
      ozone: numeric('v010Ozone', 1),
      dust: numeric('v010Dust', 0.02),
      aerialPerspective: numeric('v010AerialPerspective', 1),
      humidity: numeric('v010Humidity', 0.04),
      haze: numeric('v010Haze', 0.006),
      dayFogMultiplier: numeric('v010DayFog', 0.04),
      nightFogMultiplier: numeric('v010NightFog', 0.18),
      exposure: numeric('v010Exposure', 1),
      saturation: numeric('v010Saturation', 1.08),
      contrast: numeric('v010Contrast', 1.03),
      vibrance: numeric('v010Vibrance', 0.1),
      toneMapper: field('v010ToneMapper').value
    },
    sky: {
      celestialMode: field('v010CelestialMode').value,
      celestialScaleMode: field('v010CelestialScaleMode').value,
      sunSize: numeric('v010SunSize', 1), sunGlow: numeric('v010SunGlow', 1),
      sunAzimuth: numeric('v010SunAzimuth', -90), sunElevation: numeric('v010SunElevation', 45),
      moonSize: numeric('v010MoonSize', 1.45), moonPhase: numeric('v010MoonPhase', 0.72), moonPhaseMode: field('v010MoonPhaseMode').value,
      lunarEpochDay: Number(snapshot?.world?.time?.absoluteDay ?? snapshot?.world?.time?.dayOfYear ?? 172) + numeric('v010Hours', 12) / 24 - numeric('v010MoonAge', 14.765),
      moonOrbitPeriodDays: numeric('v010MoonOrbitPeriod', 29.530588), moonOrbitInclination: numeric('v010MoonInclination', 5.145),
      moonEarthshine: numeric('v010MoonEarthshine', 0.08), eclipseMode: field('v010EclipseMode').value,
      moonBrightness: numeric('v010MoonBrightness', 0.92), moonGlow: numeric('v010MoonGlow', 0.22), moonDetail: numeric('v010MoonDetail', 1.45),
      moonCraterStrength: numeric('v010MoonCraters', 0.85), moonMariaStrength: numeric('v010MoonMaria', 0.62), moonSurfaceContrast: numeric('v010MoonContrast', 1.18), moonReliefStrength: numeric('v010MoonRelief', 0.38),
      moonPatternRotation: numeric('v010MoonPatternRotation', -12), moonPatternSeed: numeric('v010MoonPatternSeed', 2718), moonLimbDarkening: numeric('v010MoonLimb', 0.28), solarEclipseCoverage: numeric('v010EclipseCoverage', 1.08),
      moonAzimuth: numeric('v010MoonAzimuth', 90), moonElevation: numeric('v010MoonElevation', 32),
      planetEnabled: Boolean(field('v010PlanetEnabled').checked), planetSize: numeric('v010PlanetSize', 4.5),
      planetAzimuth: numeric('v010PlanetAzimuth', 215), planetElevation: numeric('v010PlanetElevation', 28), planetRings: numeric('v010PlanetRings', 0.65),
      starIntensity: numeric('v010Stars', 1), starDensity: numeric('v010StarDensity', 0.72), starBrightness: numeric('v010StarBrightness', 1),
      starTwinkleAmount: numeric('v010StarTwinkle', 0.32), starTwinkleSpeed: numeric('v010StarTwinkleSpeed', 1),
      starSizeMin: numeric('v010StarSizeMin', 0.18), starSizeMax: numeric('v010StarSizeMax', 1.35), starColorVariation: numeric('v010StarColorVariation', 0.72), starRayStrength: numeric('v010StarRays', 0.24), starRayLength: numeric('v010StarRayLength', 1.15), starHeroFraction: numeric('v010HeroStars', 0.035), starSeed: numeric('v010StarSeed', 1337),
      starDaylightExtinction: numeric('v010StarExtinction', 1.35), milkyWayIntensity: numeric('v010MilkyWay', 0.32),
      milkyWayWidth: numeric('v010MilkyWayWidth', 0.22), milkyWayDetail: numeric('v010MilkyWayDetail', 1.15), milkyWayOrientation: numeric('v010MilkyWayOrientation', 22), milkyWayDust: numeric('v010MilkyWayDust', 0.7),
      milkyWayWarp: numeric('v010MilkyWayWarp', 0.48), milkyWayClumping: numeric('v010MilkyWayClumping', 0.72), milkyWayCoreStrength: numeric('v010MilkyWayCore', 0.65), milkyWayWidthVariation: numeric('v010MilkyWayWidthVariation', 0.6),
      milkyWayColor: field('v010MilkyWayColor').value
    },
    clouds: {
      quality: field('v010CloudQuality').value,
      coverage: numeric('v010Clouds', 0.25), density: numeric('v010CloudDensity', 0.45),
      altitude: numeric('v010CloudAltitude', 2200), thickness: numeric('v010CloudThickness', 1800), windSpeed: numeric('v010CloudWindSpeed', 12)
    },
    weather: { preset: field('v010Weather').value, fog: numeric('v010Fog', 0.04) }
  };
  const nextSnapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(payload) });
  snapshot = {
    ...snapshot,
    ...nextSnapshot,
    scene: nextSnapshot.runtime?.settings
      ? { ...(snapshot?.scene || {}), id: nextSnapshot.runtime.sceneId, settings: nextSnapshot.runtime.settings }
      : (nextSnapshot.scene || snapshot?.scene)
  };
  if (options.runtimeOnly && nextSnapshot.runtime) {
    synchronizeRuntimeOnly();
    populate({ runtimeOnly: true });
    updateCelestialControlState();
  } else {
    synchronizeAuthoritativeEditor();
    populate();
  }
  return snapshot;
}

const clampControl = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

function setControlReadout(id, text) {
  const output = field(id);
  if (!output) return;
  output.value = text;
  output.textContent = text;
}

function updateCelestialControlState() {
  const scaleMode = field('v010CelestialScaleMode')?.value || 'physical';
  const physical = scaleMode === 'physical';
  const authoredSun = numeric('v010SunSize', 1);
  const authoredMoon = numeric('v010MoonSize', 1.25);
  const authoredStarMin = numeric('v010StarSizeMin', 0.18);
  const authoredStarMax = numeric('v010StarSizeMax', 1.35);
  const renderedSun = physical ? clampControl(authoredSun, 0.85, 1.15) : clampControl(authoredSun, 0.1, 12);
  const renderedMoon = physical ? clampControl(authoredMoon, 0.85, 1.35) : clampControl(authoredMoon, 0.1, 32);
  const renderedStarMin = physical ? clampControl(authoredStarMin, 0.05, 0.35) : clampControl(authoredStarMin, 0.02, 4);
  const renderedStarMax = physical ? clampControl(authoredStarMax, 0.2, 1.1) : clampControl(authoredStarMax, 0.02, 8);
  const formatted = (authored, rendered, suffix) => Math.abs(authored - rendered) > 0.0001
    ? `${authored.toFixed(2)}${suffix} → ${rendered.toFixed(2)}${suffix}`
    : `${rendered.toFixed(2)}${suffix}`;
  setControlReadout('v010SunSizeValue', formatted(authoredSun, renderedSun, '×'));
  setControlReadout('v010MoonSizeValue', formatted(authoredMoon, renderedMoon, '×'));
  setControlReadout('v010PlanetSizeValue', `${numeric('v010PlanetSize', 4.5).toFixed(2)}×`);
  setControlReadout('v010StarSizeMinValue', formatted(authoredStarMin, renderedStarMin, ' px'));
  setControlReadout('v010StarSizeMaxValue', formatted(authoredStarMax, renderedStarMax, ' px'));
  setControlReadout('v010MilkyWayWidthValue', numeric('v010MilkyWayWidth', 0.22).toFixed(2));
  const hint = field('v010ScaleHint');
  if (hint) hint.textContent = physical
    ? 'Physical scale is active: Sun, Moon, and star footprints are safely clamped. The readouts show authored → rendered values whenever a clamp is active.'
    : 'Artistic scale is active: the full Sun, Moon, and star-size sliders are honored while orbit positioning remains independently time-driven or manual.';
}

async function flushLiveWorldApply() {
  if (!snapshot?.world) return;
  if (liveWorldApplyInFlight) {
    liveWorldApplyQueued = true;
    return;
  }
  liveWorldApplyInFlight = true;
  try {
    await applyWorld({}, { runtimeOnly: true });
    setStatus('Live world preview applied and persisted without replacing the editor workspace.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    liveWorldApplyInFlight = false;
    if (liveWorldApplyQueued) {
      liveWorldApplyQueued = false;
      liveWorldApplyTimer = window.setTimeout(flushLiveWorldApply, 0);
    }
  }
}

function scheduleLiveWorldApply() {
  updateCelestialControlState();
  if (liveWorldApplyTimer) window.clearTimeout(liveWorldApplyTimer);
  liveWorldApplyTimer = window.setTimeout(flushLiveWorldApply, 140);
}

function bindControls() {
  field('v010ApplyWorld').addEventListener('click', async () => {
    try {
      if (liveWorldApplyTimer) window.clearTimeout(liveWorldApplyTimer);
      await applyWorld();
      setStatus('World settings were applied to the authoritative scene and renderer inputs.');
    } catch (error) {
      setStatus(error.message, true);
    }
  });


  document.querySelectorAll('[data-v010-live-world] input, [data-v010-live-world] select').forEach(control => {
    const eventName = control.type === 'range' || control.type === 'color' ? 'input' : 'change';
    control.addEventListener(eventName, scheduleLiveWorldApply);
  });
  updateCelestialControlState();

  field('v010ApplyPreset').addEventListener('click', async () => {
    try {
      const presetId = field('v010LookPreset').value;
      const nextWorld = applyEnvironmentPreset(snapshot?.world || {}, presetId);
      snapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(nextWorld) });
      synchronizeAuthoritativeEditor();
      populate();
      setStatus(`Applied ${field('v010LookPreset').selectedOptions[0]?.textContent || presetId}. The preset edits the same authoritative world controls shown below.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  field('v010ToggleTime').addEventListener('click', async () => {
    try {
      await applyWorld({ time: { enabled: snapshot?.world?.time?.enabled === false } }, { preservePreset: true });
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
      const stepped = await api('/api/v010/world/step', { method: 'POST', body: JSON.stringify({ seconds: 1 }) });
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
  }, 1000);
}

window.addEventListener('beforeunload', () => {
  if (timeTimer) window.clearInterval(timeTimer);
  if (liveWorldApplyTimer) window.clearTimeout(liveWorldApplyTimer);
  if (celestialAnimationFrame !== null) window.cancelAnimationFrame(celestialAnimationFrame);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { installWorldPanel(); ensureCelestialAnimation(); });
else { installWorldPanel(); ensureCelestialAnimation(); }
