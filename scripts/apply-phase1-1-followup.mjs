import fs from 'node:fs';

function edit(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next === source) return false;
  fs.writeFileSync(path, next);
  console.log(`updated ${path}`);
  return true;
}

function replaceRequired(source, before, after, path) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Expected follow-up block was not found in ${path}: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

edit('app/v011.js', source => replaceRequired(source,
"  container.querySelectorAll('[data-v011-panel=\"terrain\"] [data-v011-property]').forEach(input => input.addEventListener('change', () => updateTerrain(object.id, { [input.dataset.v011Property]: Number(input.value) })));",
"  container.querySelectorAll('[data-v011-panel=\"terrain\"] [data-v011-property]').forEach(input => { if (input.dataset.v011Property.startsWith('sculpt')) return; input.addEventListener('change', () => updateTerrain(object.id, { [input.dataset.v011Property]: Number(input.value) })); });",
'app/v011.js'));

edit('server/v010-systems.mjs', source => {
  let next = source;
  next = replaceRequired(next,
"  sun.transform.rotation = [90 - sunElevationDegrees, sunAzimuth, 0];",
"  sun.transform.rotation = [-sunElevationDegrees, sunAzimuth + 180, 0];",
'server/v010-systems.mjs');
  next = replaceRequired(next,
"  moon.transform.rotation = [90 - moonElevationDegrees, moonAzimuth, 0];",
"  moon.transform.rotation = [moonElevationDegrees, moonAzimuth, 0];",
'server/v010-systems.mjs');
  next = replaceRequired(next,
"    angularSize: Number(world.sky.moonSize ?? 1.45),\n    castsShadows: false",
"    angularSize: Number(world.sky.moonSize ?? 1.45),\n    azimuth: moonAzimuth,\n    elevation: moonElevationDegrees,\n    castsShadows: false",
'server/v010-systems.mjs');
  return next;
});

edit('app/environment-runtime.js', source => replaceRequired(source,
`  const rotation = object.transform?.rotation || [0, 0, 0];
  const rayDirection = directionFromAzimuthElevation(Number(rotation[1] || 0), 90 - Number(rotation[0] || 0));
  return normalize(scale(rayDirection, -1));`,
`  const azimuth = Number(object.properties?.azimuth);
  const elevation = Number(object.properties?.elevation);
  if (Number.isFinite(azimuth) && Number.isFinite(elevation)) return directionFromAzimuthElevation(azimuth, elevation);
  const rotation = object.transform?.rotation || [0, 0, 0];
  return directionFromAzimuthElevation(Number(rotation[1] || 0), Number(rotation[0] || 0));`,
'app/environment-runtime.js'));

edit('app/sky-pass.js', source => {
  let next = source;
  next = next.replace("float profile=smoothstep(0.0,0.16,height01)*smoothstep(1.0,0.68,height01);", "float profile=smoothstep(0.0,0.16,height01)*(1.0-smoothstep(0.68,1.0,height01));");
  next = next.replace("float ring=(smoothstep(1.75,1.55,ringEllipse)-smoothstep(1.18,1.02,ringEllipse))*uPlanetRings;", "float ringOuter=1.0-smoothstep(1.55,1.75,ringEllipse);\n    float ringInner=1.0-smoothstep(1.02,1.18,ringEllipse);\n    float ring=max(0.0,ringOuter-ringInner)*uPlanetRings;");
  return next;
});

console.log('Applied Phase 1.1 correctness follow-up.');
