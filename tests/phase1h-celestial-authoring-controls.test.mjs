import test from 'node:test';
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

test('packaged visual profiles declare artistic body scale explicitly', () => {
  const capture = fs.readFileSync(path.join(ROOT, 'scripts', 'run-phase1c-visual-captures.ps1'), 'utf8');
  assert.match(capture, /\$captureSkyDefaults=@\{[\s\S]*celestialMode='manual'[\s\S]*celestialScaleMode='artistic'/);
  assert.match(capture, /moonSize=1\.25/);
  assert.match(capture, /starSizeMin=\.36;starSizeMax=1\.55/);
});
