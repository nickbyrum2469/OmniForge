import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  linearChannelToSrgb,
  linearToSrgb,
  srgbChannelToLinear,
  srgbToLinear
} from '../app/color-management.js';
import {
  WORLD_UNITS_PER_METER,
  atmosphereVisibilityRange,
  kilometersToWorldUnits
} from '../app/world-units.js';
import { resolveViewportLighting } from '../app/world-runtime.js';

const renderer = fs.readFileSync(new URL('../app/renderer.js', import.meta.url), 'utf8');
const hdr = fs.readFileSync(new URL('../app/hdr-pipeline.js', import.meta.url), 'utf8');
const stateStore = fs.readFileSync(new URL('../server/state-store.mjs', import.meta.url), 'utf8');
const worldSystems = fs.readFileSync(new URL('../server/v010-systems.mjs', import.meta.url), 'utf8');

test('exact sRGB transfer functions round-trip representative values', () => {
  assert.equal(srgbChannelToLinear(0.04045), 0.04045 / 12.92);
  assert.equal(linearChannelToSrgb(0.0031308), 0.0031308 * 12.92);
  for (const channel of [0, 0.018, 0.18, 0.5, 1]) {
    assert.ok(Math.abs(linearChannelToSrgb(srgbChannelToLinear(channel)) - channel) < 1e-9);
  }
  const source = [0.1, 0.5, 0.9];
  const roundTrip = linearToSrgb(srgbToLinear(source));
  roundTrip.forEach((channel, index) => assert.ok(Math.abs(channel - source[index]) < 1e-9));
});

test('world distance authority is one world unit per meter', () => {
  assert.equal(WORLD_UNITS_PER_METER, 1);
  assert.equal(kilometersToWorldUnits(1), 1000);
  const clear = atmosphereVisibilityRange({ visibilityKm: 320, weatherFog: 0, haze: 0 });
  const fog = atmosphereVisibilityRange({ visibilityKm: 320, weatherFog: 0.8, haze: 0.1 });
  assert.equal(clear.far, 320000);
  assert.ok(fog.far < clear.far);
  assert.ok(fog.near >= 0 && fog.near < fog.far);
});

test('Game Accurate is explicit and Authoring Assist does not change Play lighting', () => {
  const settings = {
    ambientIntensity: 0.05,
    exposure: 0.6,
    viewportLightingMode: 'authoring-assist',
    environmentV010: { nightFactor: 1 }
  };
  assert.equal(resolveViewportLighting(settings, 'edit', 0).authoringAssist, true);
  assert.deepEqual(resolveViewportLighting(settings, 'edit', 0, 'game-accurate'), {
    ambientIntensity: 0.05,
    exposure: 0.6,
    sunIntensity: 0,
    editorFill: 0,
    authoringAssist: false
  });
  assert.deepEqual(resolveViewportLighting(settings, 'play', 0), {
    ambientIntensity: 0.05,
    exposure: 0.6,
    sunIntensity: 0,
    editorFill: 0,
    authoringAssist: false
  });
});

test('renderer uses linear HDR PBR without legacy brightness and shadow cheats', () => {
  assert.match(renderer, /distributionGGX/);
  assert.match(renderer, /geometrySmith/);
  assert.match(renderer, /fresnelSchlick/);
  assert.match(renderer, /return sum\/9\.0;/);
  assert.match(renderer, /exp\(-extinction\*/);
  assert.match(renderer, /rangeWindow\*rangeWindow\)\/max\(dist\*dist/);
  assert.doesNotMatch(renderer, /\*1\.34/);
  assert.doesNotMatch(renderer, /\*1\.30/);
  assert.doesNotMatch(renderer, /slopeCavity/);
  assert.doesNotMatch(renderer, /mix\(0\.66,1\.0,sum\/9\.0\)/);
  assert.match(hdr, /linearToSrgb/);
  assert.doesNotMatch(hdr, /1\.0\/2\.2/);
});

test('authored texture albedo is not unintentionally darkened by a fallback object color', () => {
  assert.match(renderer, /uBaseTextureTintStrength/);
  assert.match(renderer, /baseLinear=srgbToLinear\(max\(tex,vec3\(0\.0\)\)\)\*mix\(vec3\(1\.0\),baseFactor/);
  assert.match(renderer, /set1\('uBaseTextureTintStrength',Number\(baseSettings\.tintStrength\?\?0\)\)/);
  assert.match(renderer, /set1\('uBaseTextureTintStrength',1\)/);
  assert.doesNotMatch(renderer, /baseLinear\*=srgbToLinear/);
  assert.doesNotMatch(renderer, /pathLinear\*=srgbToLinear/);
});

test('light colors are decoded to linear space before BRDF evaluation', () => {
  assert.match(renderer, /srgbToLinear\(uLightColor\)\*uLightIntensity\*shadow/);
  assert.match(renderer, /srgbToLinear\(uMoonColor\)\*uMoonIntensity/);
  assert.match(renderer, /srgbToLinear\(uPointColor\[i\]\)\*uPointData\[i\]\.x/);
});

test('game-accurate daylight includes authored sky irradiance without an editor-only fill light', () => {
  assert.match(worldSystems, /ambientIntensity: \(0\.12 \+ day \* 0\.45 \+ Number\(world\.lighting\.indirectStrength \?\? 0\.72\) \* 0\.66\)/);
  assert.match(worldSystems, /const ambientDay = mix\(\[12, 20, 48\], \[154, 178, 210\], day\)/);
  assert.match(worldSystems, /const horizonWarmth = twilight \* \(0\.2 \+ day \* 0\.12\)/);
  assert.match(worldSystems, /const ambientTwilight = mix\(ambientDay, \[74, 72, 102\], twilight \* 0\.34\)/);
  assert.match(renderer, /baseLinear\*ambient\+editorAmbient/);
  assert.match(renderer, /uEditorFill/);
});

test('solar eclipses dim and cool the same world-lighting authority used by rendered geometry', () => {
  assert.match(worldSystems, /const eclipseDaylight = 1 - solarEclipse \* 0\.94/);
  assert.match(worldSystems, /ambientColor: hex\(eclipseAmbient\)/);
  assert.match(worldSystems, /intensity: Number\(world\.lighting\.sunIntensity \|\| 2\.35\).*eclipseDaylight/s);
});

test('starter editor references are classified and excluded from surface rules', () => {
  assert.match(stateStore, /renderClass:'editor-only'/);
  assert.match(stateStore, /affectsSurfaceRecipes:false/);
  assert.match(renderer, /function isEditorReference/);
  assert.match(renderer, /function affectsSurfaceRecipes/);
});
