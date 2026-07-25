const SUN_NAMES = new Set(['sun', 'sun main', 'main sun']);
const MOON_NAMES = new Set(['moon', 'moon main', 'main moon']);

const normalizedName = object => String(object?.name || '').trim().toLowerCase();
const roleOf = object => String(object?.properties?.celestialRole || '').trim().toLowerCase();

export function isCelestialProxy(object) {
  return Boolean(object?.properties?.celestialProxy && ['sun', 'moon'].includes(roleOf(object)));
}

function isSunCandidate(object) {
  if (!object) return false;
  if (roleOf(object) === 'sun') return true;
  if (object.type !== 'directionalLight') return false;
  return SUN_NAMES.has(normalizedName(object)) || ['sun-main', 'directionalLight-v010-sun', 'celestial-v010-sun'].includes(object.id);
}

function isMoonCandidate(object) {
  if (!object) return false;
  if (roleOf(object) === 'moon') return true;
  return MOON_NAMES.has(normalizedName(object)) || ['celestial-v010-moon', 'moon-main'].includes(object.id);
}

function remapEditorReferences(state, removedIds, replacementId) {
  if (!removedIds.size) return;
  if (removedIds.has(state.selection?.objectId)) state.selection.objectId = replacementId;
  if (removedIds.has(state.editor?.lastFocusObjectId)) state.editor.lastFocusObjectId = replacementId;
  for (const scene of state.scenes || []) {
    for (const object of scene.objects || []) {
      if (removedIds.has(object.parentId)) object.parentId = null;
    }
  }
}

export function celestialAuthorityNeedsRepair(state, activeScene) {
  const scene = activeScene(state);
  const sunCandidates = (scene.objects || []).filter(isSunCandidate);
  const moonCandidates = (scene.objects || []).filter(isMoonCandidate);
  const sun = sunCandidates.find(object => roleOf(object) === 'sun');
  const moon = moonCandidates.find(object => roleOf(object) === 'moon');
  return !state.worldV010
    || sunCandidates.length !== 1
    || moonCandidates.length !== 1
    || !isCelestialProxy(sun)
    || !isCelestialProxy(moon)
    || sun?.locked !== true
    || moon?.locked !== true;
}

export function repairCelestialAuthority(state, {
  activeScene,
  defaultWorldSettings,
  applyWorldToScene,
  addActivity = null,
  reason = 'celestial-authority-repair'
}) {
  const scene = activeScene(state);
  state.worldV010 = defaultWorldSettings(state.worldV010 || {});
  const beforeIds = new Set((scene.objects || []).map(object => object.id));
  const derived = applyWorldToScene(scene, state.worldV010);
  const sun = scene.objects.find(object => object.id === derived.sunId)
    || scene.objects.find(object => roleOf(object) === 'sun');
  const moon = scene.objects.find(object => object.id === derived.moonId)
    || scene.objects.find(object => roleOf(object) === 'moon');
  if (!sun || !moon) throw new Error('The celestial authority could not create a canonical Sun and Moon.');

  sun.name = 'Sun';
  sun.locked = true;
  sun.properties = {
    ...(sun.properties || {}),
    celestialRole: 'sun',
    celestialProxy: true,
    celestialProxyKey: 'sun-primary',
    protected: true,
    editorOnlyProxy: true
  };
  moon.name = 'Moon';
  moon.locked = true;
  moon.properties = {
    ...(moon.properties || {}),
    celestialRole: 'moon',
    celestialProxy: true,
    celestialProxyKey: 'moon-primary',
    protected: true,
    editorOnlyProxy: true
  };

  const duplicateSunIds = new Set(scene.objects.filter(object => object !== sun && isSunCandidate(object)).map(object => object.id));
  const duplicateMoonIds = new Set(scene.objects.filter(object => object !== moon && isMoonCandidate(object)).map(object => object.id));
  const removedIds = new Set([...duplicateSunIds, ...duplicateMoonIds]);
  if (removedIds.size) scene.objects = scene.objects.filter(object => !removedIds.has(object.id));
  remapEditorReferences(state, duplicateSunIds, sun.id);
  remapEditorReferences(state, duplicateMoonIds, moon.id);

  const createdIds = scene.objects.filter(object => !beforeIds.has(object.id)).map(object => object.id);
  const changed = createdIds.length > 0 || removedIds.size > 0
    || !beforeIds.has(sun.id) || !beforeIds.has(moon.id)
    || sun.properties.celestialProxy !== true || moon.properties.celestialProxy !== true;
  const diagnostics = {
    changed,
    reason,
    sunId: sun.id,
    moonId: moon.id,
    createdIds,
    removedIds: [...removedIds],
    sunCandidatesBefore: duplicateSunIds.size + 1,
    moonCandidatesBefore: duplicateMoonIds.size + 1
  };
  if ((createdIds.length || removedIds.size) && addActivity) {
    addActivity(state, 'world', `Repaired celestial authority: one Sun and one Moon remain.`, diagnostics);
  }
  return { world: state.worldV010, scene, sun, moon, derived, diagnostics };
}

export function patchCelestialWorldFromProxy(state, object, patch = {}, defaultWorldSettings) {
  if (!isCelestialProxy(object)) return false;
  const role = roleOf(object);
  const world = defaultWorldSettings(state.worldV010 || {});
  const properties = patch.properties || {};
  const rotation = patch.transform?.rotation;
  world.sky.celestialMode = 'manual';

  if (role === 'sun') {
    if (Array.isArray(rotation)) {
      world.sky.sunElevation = -Number(rotation[0] || 0);
      world.sky.sunAzimuth = Number(rotation[1] || 0) - 180;
    }
    if (properties.intensity !== undefined) world.lighting.sunIntensity = Math.max(0, Number(properties.intensity) || 0);
    if (properties.angularSize !== undefined) world.sky.sunSize = Math.max(0.1, Number(properties.angularSize) || 1);
    if (properties.glow !== undefined) world.sky.sunGlow = Math.max(0, Number(properties.glow) || 0);
  } else {
    if (Array.isArray(rotation)) {
      world.sky.moonElevation = Number(rotation[0] || 0);
      world.sky.moonAzimuth = Number(rotation[1] || 0);
    }
    if (properties.intensity !== undefined) world.lighting.moonIntensity = Math.max(0, Number(properties.intensity) || 0);
    if (properties.angularSize !== undefined) world.sky.moonSize = Math.max(0.1, Number(properties.angularSize) || 1);
    if (properties.phase !== undefined) world.sky.moonPhase = ((Number(properties.phase) || 0) % 1 + 1) % 1;
    if (properties.brightness !== undefined) world.sky.moonBrightness = Math.max(0, Number(properties.brightness) || 0);
    if (properties.glow !== undefined) world.sky.moonGlow = Math.max(0, Number(properties.glow) || 0);
    if (properties.detail !== undefined) world.sky.moonDetail = Math.max(0, Number(properties.detail) || 0);
    if (properties.color !== undefined) world.sky.moonColor = String(properties.color || '#a9c5eb');
  }

  state.worldV010 = defaultWorldSettings({ ...world, updatedAt: new Date().toISOString() });
  return true;
}
