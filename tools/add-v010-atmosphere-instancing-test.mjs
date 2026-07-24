import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('tests/v010.test.mjs');
let source = fs.readFileSync(file, 'utf8');
if (source.includes("atmosphere controls affect lighting weather surfaces and optimized foliage rendering")) {
  console.log('Atmosphere and instancing test already exists.');
  process.exit(0);
}

const marker = "test('v0.10 existing Ground button and World tab synchronize through authoritative state'";
if (!source.includes(marker)) throw new Error('Atmosphere/instancing test insertion point was not found.');

const testBlock = String.raw`test('v0.10 atmosphere controls affect lighting weather surfaces and optimized foliage rendering', () => {
  const scene = { settings: {}, objects: [] };
  const world = defaultWorldSettings({
    time: { hours: 23 },
    clouds: { coverage: 0.85, density: 0.9, shadowStrength: 0.6 },
    weather: { preset: 'storm', fog: 0.35, windStrength: 0.8 },
    sky: { starIntensity: 1.4, milkyWayIntensity: 0.8, auroraIntensity: 0.5 }
  });
  const result = applyWorldToScene(scene, world);
  const sun = scene.objects.find(object => object.properties?.celestialRole === 'sun');
  assert.ok(result.night > 0.5);
  assert.ok(scene.settings.cloudAttenuation < 1);
  assert.ok(scene.settings.weatherWetness > 0.5);
  assert.ok(scene.settings.windStrength >= 0.8);
  assert.ok(scene.settings.starIntensity >= 0);
  assert.ok(sun.properties.intensity < world.lighting.sunIntensity);
  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  const worldCss = fs.readFileSync(path.join(ROOT, 'app', 'v010.css'), 'utf8');
  assert.match(renderer, /drawElementsInstanced/);
  assert.match(renderer, /vertexAttribDivisor/);
  assert.match(renderer, /uFoliageWindStrength/);
  assert.match(renderer, /foliageGroups\(scene,camera\)/);
  assert.match(worldUi, /applyViewportEnvironment/);
  assert.match(worldCss, /v010-cloud-drift/);
  assert.match(worldCss, /--v010-stars/);
});

`;
source = source.replace(marker, testBlock + marker);
fs.writeFileSync(file, source, 'utf8');
console.log('Added atmosphere, weather, and WebGL2 foliage instancing regression test.');
