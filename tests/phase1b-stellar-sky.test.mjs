import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeEnvironmentState } from '../app/environment-runtime.js';

const skySource = fs.readFileSync(new URL('../app/sky-pass.js', import.meta.url), 'utf8');
const worldUiSource = fs.readFileSync(new URL('../app/v010.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../server/v010-systems.mjs', import.meta.url), 'utf8');

const length = value => Math.hypot(...value);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

function environmentWith(sky = {}) {
  return normalizeEnvironmentState({
    settings: {
      skyTop: '#102040',
      skyBottom: '#304860',
      environmentV010: {
        nightFactor: 1,
        twilightFactor: 0,
        sky,
        clouds: { coverage: 0, density: 0, windSpeed: 12 },
        weather: { preset: 'clear' },
        atmosphere: { exposure: 1 },
        lighting: { moonIntensity: 0.12 }
      }
    },
    objects: []
  }, {
    dir: [0, 1, 0],
    color: [1, 0.95, 0.82],
    exposure: 1
  }, 12.5);
}

test('stellar controls normalize into bounded independent renderer inputs', () => {
  const environment = environmentWith({
    starIntensity: 2,
    starDensity: 1.6,
    starSizeMin: 1.2,
    starSizeMax: 4.8,
    starBrightnessVariation: 0.8,
    starColorVariation: 0.7,
    starTwinkleAmount: 0.9,
    starTwinkleSpeed: 3.5,
    starSeed: 9876,
    starRotation: 215,
    starHorizonFade: 0.31,
    starWarmColor: '#ffcc99',
    starCoolColor: '#99bbff'
  });
  assert.equal(environment.starDensity, 1.6);
  assert.equal(environment.starSizeMin, 1.2);
  assert.equal(environment.starSizeMax, 4.8);
  assert.equal(environment.starBrightnessVariation, 0.8);
  assert.equal(environment.starColorVariation, 0.7);
  assert.equal(environment.starTwinkleAmount, 0.9);
  assert.equal(environment.starTwinkleSpeed, 3.5);
  assert.equal(environment.starSeed, 9876);
  assert.equal(environment.starRotation, 215);
  assert.equal(environment.starHorizonFade, 0.31);
  assert.equal(environment.starWarmColor.length, 3);
  assert.equal(environment.starCoolColor.length, 3);
});

test('Milky Way orientation is a normalized orthogonal galactic basis', () => {
  const environment = environmentWith({
    milkyWayIntensity: 1.4,
    milkyWayWidth: 21,
    milkyWayDetail: 2.1,
    milkyWayDust: 0.74,
    milkyWayCore: 1.3,
    milkyWayAzimuth: 121,
    milkyWayElevation: 47,
    milkyWayRotation: -36,
    milkyWayColor: '#6677aa',
    milkyWayCoreColor: '#edcfaa'
  });
  assert.ok(Math.abs(length(environment.milkyWayNormal) - 1) < 1e-6);
  assert.ok(Math.abs(length(environment.milkyWayAxis) - 1) < 1e-6);
  assert.ok(Math.abs(dot(environment.milkyWayNormal, environment.milkyWayAxis)) < 1e-6);
  assert.equal(environment.milkyWayWidth, 21);
  assert.equal(environment.milkyWayDetail, 2.1);
  assert.equal(environment.milkyWayDust, 0.74);
  assert.equal(environment.milkyWayCore, 1.3);
});

test('aurora is a separate authored phenomenon and defaults off', () => {
  const defaultEnvironment = environmentWith({});
  assert.equal(defaultEnvironment.auroraIntensity, 0);
  const authored = environmentWith({
    auroraIntensity: 1.8,
    auroraColor: '#44ffaa',
    auroraSecondaryColor: '#7755ff',
    auroraSpeed: 1.2,
    auroraScale: 2.4
  });
  assert.equal(authored.auroraIntensity, 1.8);
  assert.equal(authored.auroraSpeed, 1.2);
  assert.equal(authored.auroraScale, 2.4);
  assert.equal(authored.auroraColor.length, 3);
  assert.equal(authored.auroraSecondaryColor.length, 3);
});

test('sky shader uses independent optimized star, galaxy, aurora, and cloud clocks', () => {
  assert.match(skySource, /vec3 starLayer\(/);
  assert.match(skySource, /vec3 stellarField\(/);
  assert.match(skySource, /vec3 milkyWayField\(/);
  assert.match(skySource, /float dustLane=/);
  assert.match(skySource, /vec3 auroraField\(/);
  assert.match(skySource, /uniform float uCloudTime;/);
  assert.match(skySource, /gl\.uniform1f\(u\.uTime, environment\.timeSeconds\)/);
  assert.match(skySource, /gl\.uniform1f\(u\.uCloudTime, environment\.timeSeconds \* Math\.max/);
  assert.doesNotMatch(skySource, /vec3 galacticNormal=normalize\(vec3\(0\.22,0\.84,-0\.5\)\)/);
  assert.doesNotMatch(skySource, /vec3 starCell=floor\(ray\*mix\(380\.0,760\.0/);
});

test('stellar field avoids a per-pixel neighborhood loop', () => {
  const section = skySource.slice(skySource.indexOf('vec3 starLayer('), skySource.indexOf('vec3 milkyWayField('));
  assert.doesNotMatch(section, /for\s*\(/);
  assert.match(section, /vec3 primary=starLayer/);
  assert.match(section, /vec3 secondary=starLayer/);
});

test('World Studio exposes and persists the full stellar authoring surface', () => {
  for (const id of [
    'v010StarSizeMin', 'v010StarSizeMax', 'v010StarBrightnessVariation', 'v010StarColorVariation',
    'v010StarTwinkleAmount', 'v010StarTwinkleSpeed', 'v010StarSeed', 'v010StarRotation',
    'v010StarHorizonFade', 'v010StarWarmColor', 'v010StarCoolColor', 'v010MilkyWayWidth',
    'v010MilkyWayDetail', 'v010MilkyWayDust', 'v010MilkyWayCore', 'v010MilkyWayAzimuth',
    'v010MilkyWayElevation', 'v010MilkyWayRotation', 'v010MilkyWayColor', 'v010MilkyWayCoreColor',
    'v010AuroraIntensity', 'v010AuroraColor', 'v010AuroraSecondaryColor', 'v010AuroraSpeed', 'v010AuroraScale'
  ]) {
    assert.match(worldUiSource, new RegExp(id));
  }
  assert.match(worldUiSource, /starTwinkleAmount: numeric\('v010StarTwinkleAmount'/);
  assert.match(worldUiSource, /milkyWayRotation: numeric\('v010MilkyWayRotation'/);
  assert.match(worldUiSource, /auroraSecondaryColor: field\('v010AuroraSecondaryColor'\)\.value/);
});

test('new projects receive stable stellar defaults without enabling aurora', () => {
  assert.match(serverSource, /starSizeMin: 0\.55/);
  assert.match(serverSource, /starSizeMax: 2\.4/);
  assert.match(serverSource, /starTwinkleAmount: 0\.48/);
  assert.match(serverSource, /milkyWayDust: 0\.68/);
  assert.match(serverSource, /milkyWayCoreColor: '#e2c9a5'/);
  assert.match(serverSource, /auroraIntensity: 0/);
  assert.match(serverSource, /auroraSecondaryColor: '#7668ff'/);
});
