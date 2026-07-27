from __future__ import annotations

from pathlib import Path


NEW_TEST = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';
import { defaultWorldSettings } from '../server/v010-systems.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sceneWithScale(celestialMode, celestialScaleMode) {
  return {
    settings: {
      skyTop: '#1f65b7', skyBottom: '#69a9d8', skyGround: '#17242d',
      environmentV010: {
        sky: {
          celestialMode, celestialScaleMode,
          sunSize: 8, moonSize: 24,
          starSizeMin: 4, starSizeMax: 8, starHeroFraction: 0.8
        },
        atmosphere: {}, clouds: {}, weather: {}, lighting: {}
      }
    },
    objects: [
      { properties: { celestialRole: 'sun', azimuth: 180, elevation: 20 } },
      { properties: { celestialRole: 'moon', azimuth: 80, elevation: 35, illumination: 0.8, skyVisibility: 1 } }
    ]
  };
}

test('celestial scale authority is independent from orbital positioning', () => {
  const lights = { dir: [0, -1, 0], color: [1, 1, 1], exposure: 1 };
  const physicalAstronomical = normalizeEnvironmentState(sceneWithScale('astronomical', 'physical'), lights, 0);
  const physicalManual = normalizeEnvironmentState(sceneWithScale('manual', 'physical'), lights, 0);
  const artisticAstronomical = normalizeEnvironmentState(sceneWithScale('astronomical', 'artistic'), lights, 0);

  assert.equal(physicalAstronomical.celestialMode, 'astronomical');
  assert.equal(physicalAstronomical.celestialScaleMode, 'physical');
  assert.equal(physicalAstronomical.physicalCelestial, true);
  assert.equal(physicalManual.celestialMode, 'manual');
  assert.equal(physicalManual.physicalCelestial, true);
  assert.ok(physicalAstronomical.sunAngularRadius <= 0.2666 * 1.15 + 1e-9);
  assert.ok(physicalAstronomical.moonAngularRadius <= 0.259 * 1.35 + 1e-9);

  assert.equal(artisticAstronomical.celestialMode, 'astronomical');
  assert.equal(artisticAstronomical.celestialScaleMode, 'artistic');
  assert.equal(artisticAstronomical.physicalCelestial, false);
  assert.ok(Math.abs(artisticAstronomical.sunAngularRadius - 0.2666 * 8) < 1e-9);
  assert.ok(Math.abs(artisticAstronomical.moonAngularRadius - 0.259 * 24) < 1e-9);
  assert.equal(artisticAstronomical.starSizeMax, 8);
});

test('world defaults and persistence retain explicit body scale authority', () => {
  assert.equal(defaultWorldSettings().sky.celestialScaleMode, 'physical');
  const artistic = defaultWorldSettings({ sky: { celestialMode: 'astronomical', celestialScaleMode: 'artistic', sunSize: 6, moonSize: 12 } });
  assert.equal(artistic.sky.celestialMode, 'astronomical');
  assert.equal(artistic.sky.celestialScaleMode, 'artistic');
  assert.equal(artistic.sky.sunSize, 6);
  assert.equal(artistic.sky.moonSize, 12);
});

test('World panel exposes readable live size controls without replacing the workspace', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'app', 'v010.css'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'server', 'v010-api.mjs'), 'utf8');

  assert.match(ui, /id="v010CelestialScaleMode"/);
  assert.match(ui, /id="v010SunSizeValue"/);
  assert.match(ui, /id="v010MoonSizeValue"/);
  assert.match(ui, /data-v010-live-world/);
  assert.match(ui, /scheduleLiveWorldApply/);
  assert.match(ui, /runtimeOnly: true/);
  assert.match(ui, /celestialScaleMode: field\('v010CelestialScaleMode'\)\.value/);
  assert.match(css, /\.v010-control-value/);
  assert.match(api, /runtime: compactWorldRuntime\(result\.state\)/);
});
'''


def replace_once(root: Path, relative: str, old: str, new: str, changed: list[str], label: str) -> None:
    path = root / relative
    source = path.read_text(encoding='utf-8')
    if new in source:
        return
    if old not in source:
        raise RuntimeError(f'Expected source contract was not found for {label} in {relative}.')
    path.write_text(source.replace(old, new, 1), encoding='utf-8')
    changed.append(relative)


def append_once(root: Path, relative: str, marker: str, block: str, changed: list[str]) -> None:
    path = root / relative
    source = path.read_text(encoding='utf-8')
    if marker in source:
        return
    path.write_text(source.rstrip() + '\n\n' + block.strip() + '\n', encoding='utf-8')
    changed.append(relative)


def apply(root: Path, changed: list[str]) -> None:
    replace_once(
        root,
        'server/v010-systems.mjs',
        """      celestialMode: 'astronomical',
      sunAzimuth: -90,""",
        """      celestialMode: 'astronomical',
      celestialScaleMode: 'physical',
      sunAzimuth: -90,""",
        changed,
        'default celestial scale authority',
    )

    replace_once(
        root,
        'app/environment-runtime.js',
        """  const celestialMode = String(worldSky.celestialMode || 'astronomical');
  const physicalCelestial = celestialMode === 'astronomical';""",
        """  const celestialMode = String(worldSky.celestialMode || 'astronomical');
  const celestialScaleMode = String(worldSky.celestialScaleMode || 'physical') === 'artistic' ? 'artistic' : 'physical';
  const physicalCelestial = celestialScaleMode === 'physical';""",
        changed,
        'independent scale authority',
    )
    replace_once(
        root,
        'app/environment-runtime.js',
        """    celestialMode,
    physicalCelestial,""",
        """    celestialMode,
    celestialScaleMode,
    physicalCelestial,""",
        changed,
        'scale authority diagnostics',
    )

    replace_once(
        root,
        'server/v010-api.mjs',
        """      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/world/step')""",
        """      json(res, 200, { ...result.result, state: result.state, runtime: compactWorldRuntime(result.state) });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/v010/world/step')""",
        changed,
        'compact runtime returned by world patch',
    )

    replace_once(
        root,
        'app/v010.js',
        """let celestialAnimationFrame = null;
let timeStepInFlight = false;
let previewTimeInEditor = sessionStorage.getItem('omniforge.previewTimeInEditor') === '1';""",
        """let celestialAnimationFrame = null;
let timeStepInFlight = false;
let liveWorldApplyTimer = null;
let liveWorldApplyInFlight = false;
let liveWorldApplyQueued = false;
let previewTimeInEditor = sessionStorage.getItem('omniforge.previewTimeInEditor') === '1';""",
        changed,
        'live authoring state',
    )

    replace_once(
        root,
        'app/v010.js',
        """    <div class="v010-card">
      <header><b>Celestial Studio</b><span id="v010CelestialReadout" class="v010-chip">SUN + MOON</span></header>""",
        """    <div class="v010-card" data-v010-live-world>
      <header><b>Celestial Studio</b><span id="v010CelestialReadout" class="v010-chip">SUN + MOON</span></header>""",
        changed,
        'live celestial card',
    )
    replace_once(
        root,
        'app/v010.js',
        """        <label>Positioning<select id="v010CelestialMode"><option value="astronomical">Time-driven orbit</option><option value="manual">Manual azimuth/elevation</option></select></label>
        <label>Sun size<input id="v010SunSize" type="range" min="0.1" max="8" step="0.05"></label>""",
        """        <label>Positioning<select id="v010CelestialMode"><option value="astronomical">Time-driven orbit</option><option value="manual">Manual azimuth/elevation</option></select></label>
        <label>Body size authority<select id="v010CelestialScaleMode"><option value="physical">Physical angular scale</option><option value="artistic">Artistic full-range scale</option></select></label>
        <label><span class="v010-label-row"><span>Sun size</span><output id="v010SunSizeValue" class="v010-control-value">1.00×</output></span><input id="v010SunSize" type="range" min="0.1" max="12" step="0.05"></label>""",
        changed,
        'Sun scale authoring',
    )
    replace_once(
        root,
        'app/v010.js',
        """        <label>Moon size<input id="v010MoonSize" type="range" min="0.1" max="32" step="0.05"></label>""",
        """        <label><span class="v010-label-row"><span>Moon size</span><output id="v010MoonSizeValue" class="v010-control-value">1.25×</output></span><input id="v010MoonSize" type="range" min="0.1" max="32" step="0.05"></label>""",
        changed,
        'Moon scale readout',
    )
    replace_once(
        root,
        'app/v010.js',
        """        <label>Planet size<input id="v010PlanetSize" type="range" min="0.1" max="18" step="0.1"></label>""",
        """        <label><span class="v010-label-row"><span>Planet size</span><output id="v010PlanetSizeValue" class="v010-control-value">4.50×</output></span><input id="v010PlanetSize" type="range" min="0.1" max="18" step="0.1"></label>""",
        changed,
        'planet scale readout',
    )
    replace_once(
        root,
        'app/v010.js',
        """      <p class="v010-section-note">Time-driven mode follows world time. Manual mode preserves the exact Sun, Moon, and planet positions entered here.</p>
      <div id="v010EnvironmentDiagnostics" class="v010-status">Celestial authority loading…</div>""",
        """      <div id="v010ScaleHint" class="v010-section-note v010-scale-hint">Physical scale preserves realistic angular sizes. Choose Artistic scale to honor the full sliders while keeping either orbit mode.</div>
      <p class="v010-section-note">Time-driven mode follows world time. Manual mode preserves the exact Sun, Moon, and planet positions entered here. Positioning and body scale are independent.</p>
      <div id="v010EnvironmentDiagnostics" class="v010-status">Celestial authority loading…</div>""",
        changed,
        'scale authority explanation',
    )
    replace_once(
        root,
        'app/v010.js',
        """    <div class="v010-card">
      <header><b>Atmosphere Studio</b><span class="v010-chip">SCATTERING + AERIAL PERSPECTIVE</span></header>""",
        """    <div class="v010-card" data-v010-live-world>
      <header><b>Atmosphere Studio</b><span class="v010-chip">SCATTERING + AERIAL PERSPECTIVE</span></header>""",
        changed,
        'live atmosphere card',
    )
    replace_once(
        root,
        'app/v010.js',
        """        <label>Minimum star size<input id="v010StarSizeMin" type="range" min="0.05" max="4" step="0.05"></label>
        <label>Maximum star size<input id="v010StarSizeMax" type="range" min="0.05" max="8" step="0.05"></label>""",
        """        <label><span class="v010-label-row"><span>Minimum star size</span><output id="v010StarSizeMinValue" class="v010-control-value">0.18 px</output></span><input id="v010StarSizeMin" type="range" min="0.05" max="4" step="0.05"></label>
        <label><span class="v010-label-row"><span>Maximum star size</span><output id="v010StarSizeMaxValue" class="v010-control-value">1.35 px</output></span><input id="v010StarSizeMax" type="range" min="0.05" max="8" step="0.05"></label>""",
        changed,
        'star scale readouts',
    )
    replace_once(
        root,
        'app/v010.js',
        """        <label>Milky Way width<input id="v010MilkyWayWidth" type="range" min="0.02" max="0.8" step="0.01"></label>""",
        """        <label><span class="v010-label-row"><span>Milky Way width</span><output id="v010MilkyWayWidthValue" class="v010-control-value">0.22</output></span><input id="v010MilkyWayWidth" type="range" min="0.02" max="0.8" step="0.01"></label>""",
        changed,
        'Milky Way width readout',
    )

    replace_once(
        root,
        'app/v010.js',
        """  field('v010CelestialMode').value = world.sky.celestialMode || 'astronomical';
  field('v010SunSize').value = world.sky.sunSize ?? 1;""",
        """  field('v010CelestialMode').value = world.sky.celestialMode || 'astronomical';
  field('v010CelestialScaleMode').value = world.sky.celestialScaleMode || 'physical';
  field('v010SunSize').value = world.sky.sunSize ?? 1;""",
        changed,
        'populate scale authority',
    )
    replace_once(
        root,
        'app/v010.js',
        """  field('v010Weather').value = world.weather.preset;
  const celestialReadout = snapshot.scene?.settings?.environmentV010?.celestial;""",
        """  field('v010Weather').value = world.weather.preset;
  updateCelestialControlState();
  const celestialReadout = snapshot.scene?.settings?.environmentV010?.celestial;""",
        changed,
        'refresh live readouts',
    )
    replace_once(
        root,
        'app/v010.js',
        """      celestialMode: field('v010CelestialMode').value,
      sunSize: numeric('v010SunSize', 1), sunGlow: numeric('v010SunGlow', 1),""",
        """      celestialMode: field('v010CelestialMode').value,
      celestialScaleMode: field('v010CelestialScaleMode').value,
      sunSize: numeric('v010SunSize', 1), sunGlow: numeric('v010SunGlow', 1),""",
        changed,
        'persist scale authority',
    )
    replace_once(
        root,
        'app/v010.js',
        """  snapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(payload) });
  synchronizeAuthoritativeEditor();
  populate();
}

function bindControls() {""",
        """  const nextSnapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(payload) });
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

function bindControls() {""",
        changed,
        'runtime-only live world authoring',
    )
    replace_once(
        root,
        'app/v010.js',
        """  field('v010ApplyWorld').addEventListener('click', async () => {
    try {
      await applyWorld();""",
        """  field('v010ApplyWorld').addEventListener('click', async () => {
    try {
      if (liveWorldApplyTimer) window.clearTimeout(liveWorldApplyTimer);
      await applyWorld();""",
        changed,
        'explicit Apply world ordering',
    )
    replace_once(
        root,
        'app/v010.js',
        """  field('v010ApplyPreset').addEventListener('click', async () => {""",
        """  document.querySelectorAll('[data-v010-live-world] input, [data-v010-live-world] select').forEach(control => {
    const eventName = control.type === 'range' || control.type === 'color' ? 'input' : 'change';
    control.addEventListener(eventName, scheduleLiveWorldApply);
  });
  updateCelestialControlState();

  field('v010ApplyPreset').addEventListener('click', async () => {""",
        changed,
        'live visual-control binding',
    )
    replace_once(
        root,
        'app/v010.js',
        """  if (timeTimer) window.clearInterval(timeTimer);
  if (celestialAnimationFrame !== null) window.cancelAnimationFrame(celestialAnimationFrame);""",
        """  if (timeTimer) window.clearInterval(timeTimer);
  if (liveWorldApplyTimer) window.clearTimeout(liveWorldApplyTimer);
  if (celestialAnimationFrame !== null) window.cancelAnimationFrame(celestialAnimationFrame);""",
        changed,
        'live preview cleanup',
    )

    append_once(
        root,
        'app/v010.css',
        '.v010-control-value',
        r'''
.v010-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.v010-control-value {
  color: #a9d5ff;
  font: 600 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: nowrap;
}

.v010-scale-hint {
  margin-top: 9px;
  padding: 7px 8px;
  border: 1px solid rgba(98, 164, 220, 0.24);
  border-radius: 7px;
  background: rgba(20, 43, 66, 0.32);
}

.v010-grid input[type='range'] {
  min-height: 18px;
  cursor: ew-resize;
}
''',
        changed,
    )

    replace_once(
        root,
        'tests/phase1g-celestial-optics.test.mjs',
        """test('astronomical mode constrains destructive presentation without mutating manual Custom ranges', () => {
  const lights = { dir: [0, -1, 0], color: [1, 1, 1], exposure: 1 };
  const physical = normalizeEnvironmentState(sceneAtSunElevation(20, {
    sunSize: 8, moonSize: 24, starSizeMin: 4, starSizeMax: 8, starHeroFraction: 0.8
  }), lights, 0);
  assert.equal(physical.celestialMode, 'astronomical');
  assert.equal(physical.physicalCelestial, true);
  assert.ok(physical.sunAngularRadius <= 0.2666 * 1.15 + 1e-9);
  assert.ok(physical.moonAngularRadius <= 0.259 * 1.35 + 1e-9);
  assert.ok(physical.starSizeMax <= 1.1);
  assert.ok(physical.starHeroFraction <= 0.008);

  const artistic = normalizeEnvironmentState(sceneAtSunElevation(20, {
    celestialMode: 'manual', sunSize: 8, moonSize: 24, starSizeMax: 8, starHeroFraction: 0.8
  }), lights, 0);
  assert.equal(artistic.physicalCelestial, false);
  assert.ok(artistic.sunAngularRadius > physical.sunAngularRadius);
  assert.ok(artistic.moonAngularRadius > physical.moonAngularRadius);
  assert.equal(artistic.starSizeMax, 8);
});""",
        """test('scale authority constrains physical presentation without coupling it to orbit positioning', () => {
  const lights = { dir: [0, -1, 0], color: [1, 1, 1], exposure: 1 };
  const physical = normalizeEnvironmentState(sceneAtSunElevation(20, {
    celestialScaleMode: 'physical', sunSize: 8, moonSize: 24, starSizeMin: 4, starSizeMax: 8, starHeroFraction: 0.8
  }), lights, 0);
  assert.equal(physical.celestialMode, 'astronomical');
  assert.equal(physical.celestialScaleMode, 'physical');
  assert.equal(physical.physicalCelestial, true);
  assert.ok(physical.sunAngularRadius <= 0.2666 * 1.15 + 1e-9);
  assert.ok(physical.moonAngularRadius <= 0.259 * 1.35 + 1e-9);
  assert.ok(physical.starSizeMax <= 1.1);
  assert.ok(physical.starHeroFraction <= 0.008);

  const artistic = normalizeEnvironmentState(sceneAtSunElevation(20, {
    celestialMode: 'astronomical', celestialScaleMode: 'artistic', sunSize: 8, moonSize: 24, starSizeMax: 8, starHeroFraction: 0.8
  }), lights, 0);
  assert.equal(artistic.celestialMode, 'astronomical');
  assert.equal(artistic.celestialScaleMode, 'artistic');
  assert.equal(artistic.physicalCelestial, false);
  assert.ok(artistic.sunAngularRadius > physical.sunAngularRadius);
  assert.ok(artistic.moonAngularRadius > physical.moonAngularRadius);
  assert.equal(artistic.starSizeMax, 8);
});""",
        changed,
        'scale-authority optics test',
    )

    test_path = root / 'tests/phase1h-celestial-authoring-controls.test.mjs'
    if not test_path.exists():
        test_path.write_text(NEW_TEST, encoding='utf-8')
        changed.append('tests/phase1h-celestial-authoring-controls.test.mjs')
    elif test_path.read_text(encoding='utf-8') != NEW_TEST:
        raise RuntimeError('Celestial authoring regression test exists with unexpected content.')

    append_once(
        root,
        'progress.md',
        '## Celestial authoring controls',
        '''
## Celestial authoring controls

- Decoupled orbital positioning from visual body scale.
- Physical mode retains safe angular-size clamps; Artistic mode honors full Sun, Moon, and star sliders while time-driven orbits continue normally.
- Added numeric authored/rendered readouts so clamping is explicit instead of silent.
- Added debounced runtime-only preview and persistence for celestial, atmospheric, star, Milky Way, cloud, and weather controls.
- Added server runtime responses and regression coverage for persistence, scale authority, and UI wiring.

The PR remains draft pending exact packaged Windows and target-PC interaction validation.
''',
        changed,
    )
