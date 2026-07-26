const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const celestialTracks = new Map();
const environmentTracks = new Map();

const shortestAngleDelta = (from, to) => {
  const delta = ((Number(to) - Number(from) + 540) % 360) - 180;
  return Number.isFinite(delta) ? delta : 0;
};
const lerp = (from, to, amount) => Number(from || 0) + (Number(to || 0) - Number(from || 0)) * amount;
const lerpAngle = (from, to, amount) => Number(from || 0) + shortestAngleDelta(from, to) * amount;
const linearAmount = value => clamp01(value);

const INTERPOLATED_SETTING_KEYS = Object.freeze([
  'ambientIntensity', 'exposure', 'displayExposureEV', 'colorSaturation', 'colorContrast', 'colorVibrance',
  'fogNear', 'fogFar', 'cloudCoverage', 'cloudDensity', 'cloudAttenuation', 'starIntensity', 'starDensity',
  'milkyWayIntensity', 'auroraIntensity', 'windStrength', 'weatherWetness', 'weatherSnow'
]);
const INTERPOLATED_COLOR_KEYS = Object.freeze(['skyTop', 'skyBottom', 'skyGround', 'ambientColor']);

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
  for (const key of [
    'intensity', 'azimuth', 'elevation', 'phase', 'illumination', 'angularSize', 'brightness', 'glow', 'detail',
    'earthshine', 'skyVisibility', 'solarEclipse', 'lunarEclipse', 'separationDegrees'
  ]) {
    if (Number.isFinite(Number(properties[key]))) result[key] = Number(properties[key]);
  }
  return result;
}

function parseHex(value, fallback = '#000000') {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || fallback));
  const hex = match ? match[1] : fallback.replace('#', '');
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function formatHex(rgb) {
  return `#${rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function environmentKey(sceneId) {
  return `environment:${sceneId}`;
}

function environmentEndpoints(current = {}, incoming = {}) {
  const fromNumbers = {};
  const toNumbers = {};
  for (const key of INTERPOLATED_SETTING_KEYS) {
    const from = Number(current[key]);
    const to = Number(incoming[key]);
    if (Number.isFinite(to)) {
      fromNumbers[key] = Number.isFinite(from) ? from : to;
      toNumbers[key] = to;
    }
  }
  const fromColors = {};
  const toColors = {};
  for (const key of INTERPOLATED_COLOR_KEYS) {
    if (typeof incoming[key] === 'string') {
      fromColors[key] = parseHex(current[key], incoming[key]);
      toColors[key] = parseHex(incoming[key]);
    }
  }
  return { fromNumbers, toNumbers, fromColors, toColors };
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
  const now = Number(options.now ?? performance.now());
  const durationMs = Math.max(180, Number(options.durationMs ?? runtime.visualDurationMs ?? 1100));

  if (runtime.settings && typeof runtime.settings === 'object') {
    const incoming = structuredClone(runtime.settings);
    const current = target.scene.settings || {};
    const endpoints = environmentEndpoints(current, incoming);
    environmentTracks.set(environmentKey(target.scene.id), {
      sceneId: target.scene.id,
      startedAt: now,
      durationMs,
      incoming,
      ...endpoints
    });
    target.scene.settings = {
      ...current,
      ...incoming,
      ...Object.fromEntries(Object.keys(endpoints.toNumbers).map(key => [key, current[key] ?? endpoints.toNumbers[key]])),
      ...Object.fromEntries(Object.keys(endpoints.toColors).map(key => [key, current[key] ?? incoming[key]]))
    };
  }

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
  const timestamp = Number(now) || performance.now();

  const environmentTrack = environmentTracks.get(environmentKey(target.scene.id));
  if (environmentTrack) {
    const amount = linearAmount((timestamp - environmentTrack.startedAt) / environmentTrack.durationMs);
    const settings = { ...(target.scene.settings || {}), ...environmentTrack.incoming };
    for (const [key, targetValue] of Object.entries(environmentTrack.toNumbers)) {
      settings[key] = lerp(environmentTrack.fromNumbers[key], targetValue, amount);
    }
    for (const [key, targetValue] of Object.entries(environmentTrack.toColors)) {
      settings[key] = formatHex(targetValue.map((value, index) => lerp(environmentTrack.fromColors[key][index], value, amount)));
    }
    target.scene.settings = settings;
    changed = true;
    if (amount >= 0.9999) environmentTracks.delete(environmentKey(target.scene.id));
  }

  for (const [key, track] of celestialTracks) {
    if (track.sceneId !== target.scene.id) continue;
    const object = target.scene.objects.find(item => item.id === track.objectId);
    if (!object) {
      celestialTracks.delete(key);
      continue;
    }
    const amount = linearAmount((timestamp - track.startedAt) / track.durationMs);
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
    environmentTracks.clear();
    return;
  }
  for (const [key, track] of celestialTracks) if (track.sceneId === sceneId) celestialTracks.delete(key);
  environmentTracks.delete(environmentKey(sceneId));
}

export function resolveViewportLighting(settings = {}, editorMode = 'edit', authoredSunIntensity = 1) {
  const night = clamp01(settings.environmentV010?.nightFactor || 0);
  const editing = editorMode !== 'play';
  const ambient = Math.max(0, Number(settings.ambientIntensity ?? 0.3));
  const exposure = Math.max(0.05, Number(settings.exposure ?? 1));
  const sun = Math.max(0, Number(authoredSunIntensity || 0));
  if (!editing) return { ambientIntensity: ambient, exposure, sunIntensity: sun, editorFill: 0, authoringAssist: false };
  const editorFill = 0.045 + night * 0.085;
  return {
    ambientIntensity: Math.max(ambient, 0.2 + night * 0.07),
    exposure: Math.max(exposure, 0.76 + night * 0.06),
    sunIntensity: sun,
    editorFill,
    authoringAssist: true
  };
}

export function runtimeInterpolationDiagnostics(sceneId) {
  const celestial = [...celestialTracks.values()].filter(track => !sceneId || track.sceneId === sceneId).length;
  return { celestialTracks: celestial, environmentTrack: environmentTracks.has(environmentKey(sceneId)), mode: 'continuous-linear' };
}
