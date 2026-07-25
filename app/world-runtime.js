const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const celestialTracks = new Map();

const shortestAngleDelta = (from, to) => {
  const delta = ((Number(to) - Number(from) + 540) % 360) - 180;
  return Number.isFinite(delta) ? delta : 0;
};
const lerp = (from, to, amount) => Number(from || 0) + (Number(to || 0) - Number(from || 0)) * amount;
const lerpAngle = (from, to, amount) => Number(from || 0) + shortestAngleDelta(from, to) * amount;
const ease = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function trackKey(sceneId, objectId) {
  return `${sceneId}:${objectId}`;
}

function cloneTransform(transform = {}) {
  return {
    position: [...(transform.position || [0, 0, 0])],
    rotation: [...(transform.rotation || [0, 0, 0])],
    scale: [...(transform.scale || [1, 1, 1])]
  };
}

function numericProperties(properties = {}) {
  const result = {};
  for (const key of ['intensity', 'azimuth', 'elevation', 'phase', 'angularSize', 'brightness', 'glow', 'detail']) {
    if (Number.isFinite(Number(properties[key]))) result[key] = Number(properties[key]);
  }
  return result;
}

export function shouldAdvanceWorldTime({
  enabled = true,
  editorMode = 'edit',
  previewInEditor = false,
  documentHidden = false,
  inFlight = false
} = {}) {
  if (enabled === false || documentHidden || inFlight) return false;
  return editorMode === 'play' || previewInEditor === true;
}

export function applyCompactWorldRuntime(target, runtime, options = {}) {
  if (!target?.state || !target?.scene || !runtime || target.scene.id !== runtime.sceneId) return false;
  if (runtime.settings && typeof runtime.settings === 'object') {
    target.scene.settings = { ...target.scene.settings, ...structuredClone(runtime.settings) };
  }
  const now = Number(options.now ?? performance.now());
  const durationMs = Math.max(120, Number(options.durationMs ?? runtime.visualDurationMs ?? 2050));
  for (const incoming of runtime.celestialObjects || []) {
    const current = target.scene.objects.find(object => object.id === incoming.id)
      || target.scene.objects.find(object => object.properties?.celestialRole && object.properties.celestialRole === incoming.properties?.celestialRole);
    if (!current) continue;
    current.visible = incoming.visible !== false;
    const role = incoming.properties?.celestialRole || current.properties?.celestialRole;
    if (!role) {
      current.transform = structuredClone(incoming.transform || current.transform);
      current.properties = { ...current.properties, ...structuredClone(incoming.properties || {}) };
      continue;
    }
    celestialTracks.set(trackKey(target.scene.id, current.id), {
      sceneId: target.scene.id,
      objectId: current.id,
      startedAt: now,
      durationMs,
      fromTransform: cloneTransform(current.transform),
      toTransform: cloneTransform(incoming.transform || current.transform),
      fromProperties: numericProperties(current.properties),
      toProperties: numericProperties(incoming.properties),
      finalProperties: structuredClone(incoming.properties || {})
    });
  }
  const revision = Number(runtime.engineRevision || 0);
  if (revision > Number(target.state.engine?.revision || 0)) target.state.engine.revision = revision;
  return true;
}

export function updateCelestialRuntimeInterpolation(target, now = performance.now()) {
  if (!target?.scene) return false;
  let changed = false;
  for (const [key, track] of celestialTracks) {
    if (track.sceneId !== target.scene.id) continue;
    const object = target.scene.objects.find(item => item.id === track.objectId);
    if (!object) {
      celestialTracks.delete(key);
      continue;
    }
    const amount = ease((Number(now) - track.startedAt) / track.durationMs);
    const from = track.fromTransform;
    const to = track.toTransform;
    object.transform = {
      position: from.position.map((value, index) => lerp(value, to.position[index], amount)),
      rotation: from.rotation.map((value, index) => lerpAngle(value, to.rotation[index], amount)),
      scale: from.scale.map((value, index) => lerp(value, to.scale[index], amount))
    };
    const nextProperties = { ...(object.properties || {}) };
    for (const [property, targetValue] of Object.entries(track.toProperties)) {
      const startValue = track.fromProperties[property] ?? targetValue;
      nextProperties[property] = property === 'azimuth' || property === 'elevation'
        ? lerpAngle(startValue, targetValue, amount)
        : lerp(startValue, targetValue, amount);
    }
    object.properties = nextProperties;
    changed = true;
    if (amount >= 0.9999) {
      object.transform = cloneTransform(track.toTransform);
      object.properties = { ...object.properties, ...structuredClone(track.finalProperties) };
      celestialTracks.delete(key);
    }
  }
  return changed;
}

export function clearCelestialRuntimeInterpolation(sceneId = null) {
  if (!sceneId) {
    celestialTracks.clear();
    return;
  }
  for (const [key, track] of celestialTracks) if (track.sceneId === sceneId) celestialTracks.delete(key);
}

export function resolveViewportLighting(settings = {}, editorMode = 'edit', authoredSunIntensity = 1) {
  const night = clamp01(settings.environmentV010?.nightFactor || 0);
  const editing = editorMode !== 'play';
  const ambient = Math.max(0, Number(settings.ambientIntensity ?? 0.3));
  const exposure = Math.max(0.05, Number(settings.exposure ?? 1));
  const sun = Math.max(0, Number(authoredSunIntensity || 0));
  if (!editing) return { ambientIntensity: ambient, exposure, sunIntensity: sun, editorFill: 0, authoringAssist: false };
  const editorFill = 0.055 + night * 0.105;
  return {
    ambientIntensity: Math.max(ambient, 0.18 + night * 0.08),
    exposure: Math.max(exposure, 0.88 + night * 0.04),
    sunIntensity: sun,
    editorFill,
    authoringAssist: true
  };
}
