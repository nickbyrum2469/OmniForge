import fs from 'node:fs';

function editPreservingEndings(path, editor) {
  const original = fs.readFileSync(path, 'utf8');
  const ending = original.includes('\r\n') ? '\r\n' : '\n';
  const normalized = original.replace(/\r\n/g, '\n');
  const next = editor(normalized);
  if (next === normalized) return false;
  fs.writeFileSync(path, ending === '\r\n' ? next.replace(/\n/g, '\r\n') : next);
  return true;
}

editPreservingEndings('app/app.js', source => source.replace(
  /\s*ui\.viewportWrap\.style\.background\s*=\s*`linear-gradient\([^`]+`;/g,
  "\n  ui.viewportWrap.style.background = '#0b1018';\n  ui.viewportWrap.dataset.environmentRenderer = 'webgl';"
));

editPreservingEndings('tests/engine.test.mjs', source => source.replace(
`test('horizontal mouse look uses the intuitive right-positive yaw convention',()=>{
  const source=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  assert.match(source,/camera\\.yaw\\+=dx\\*sensitivity\\*\\(camera\\.invertHorizontal\\?-1:1\\)/);
});`,
`test('horizontal mouse look uses the intuitive right-positive yaw convention',()=>{
  const source=fs.readFileSync(path.join(ROOT,'app','viewport-navigation.js'),'utf8');
  assert.match(source,/const horizontal = camera\\.invertHorizontal \\? -1 : 1/);
  assert.match(source,/camera\\.yaw = wrapYaw/);
  assert.match(source,/reason: 'delta-spike'/);
});`
));

editPreservingEndings('tests/v010.test.mjs', source => source.replace(
`  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  const worldCss = fs.readFileSync(path.join(ROOT, 'app', 'v010.css'), 'utf8');
  assert.match(renderer, /drawElementsInstanced/);
  assert.match(renderer, /vertexAttribDivisor/);
  assert.match(renderer, /uFoliageWindStrength/);
  assert.match(renderer, /foliageGroups\\(scene,camera\\)/);
  assert.match(worldUi, /applyViewportEnvironment/);
  assert.match(worldCss, /v010-cloud-drift/);
  assert.match(worldCss, /--v010-stars/);`,
`  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  const worldCss = fs.readFileSync(path.join(ROOT, 'app', 'v010.css'), 'utf8');
  const skyPass = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');
  const environment = fs.readFileSync(path.join(ROOT, 'app', 'environment-runtime.js'), 'utf8');
  assert.match(renderer, /drawElementsInstanced/);
  assert.match(renderer, /vertexAttribDivisor/);
  assert.match(renderer, /uFoliageWindStrength/);
  assert.match(renderer, /foliageGroups\\(scene,camera\\)/);
  assert.match(renderer, /new SkyPass\\(gl\\)/);
  assert.match(worldUi, /applyViewportEnvironment/);
  assert.match(worldUi, /environmentRenderer = 'webgl'/);
  assert.match(skyPass, /uCloudCoverage/);
  assert.match(environment, /normalizeEnvironmentState/);
  assert.doesNotMatch(worldCss, /v010-cloud-drift/);
  assert.doesNotMatch(worldCss, /--v010-stars/);`
));

console.log('Applied Phase 1 follow-up source and regression migrations.');
