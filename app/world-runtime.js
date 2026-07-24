const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

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

export function applyCompactWorldRuntime(target, runtime) {
  if (!target?.state || !target?.scene || !runtime || target.scene.id !== runtime.sceneId) return false;
  if (runtime.settings && typeof runtime.settings === 'object') {
    target.scene.settings = { ...target.scene.settings, ...structuredClone(runtime.settings) };
  }
  for (const incoming of runtime.celestialObjects || []) {
    const current = target.scene.objects.find(object => object.id === incoming.id)
      || target.scene.objects.find(object => object.properties?.celestialRole && object.properties.celestialRole === incoming.properties?.celestialRole);
    if (!current) continue;
    current.visible = incoming.visible !== false;
    current.transform = structuredClone(incoming.transform || current.transform);
    current.properties = { ...current.properties, ...structuredClone(incoming.properties || {}) };
  }
  const revision = Number(runtime.engineRevision || 0);
  if (revision > Number(target.state.engine?.revision || 0)) target.state.engine.revision = revision;
  return true;
}

export function resolveViewportLighting(settings = {}, editorMode = 'edit', authoredSunIntensity = 1) {
  const night = clamp01(settings.environmentV010?.nightFactor || 0);
  const editing = editorMode !== 'play';
  const ambient = Number(settings.ambientIntensity ?? 0.3);
  const exposure = Number(settings.exposure ?? 1);
  const sun = Number(authoredSunIntensity || 0);
  if (!editing) return { ambientIntensity: ambient, exposure, sunIntensity: sun, editorFill: 0 };
  const editorFill = 0.18 + night * 0.18;
  return {
    ambientIntensity: Math.max(ambient, 0.3 + night * 0.12),
    exposure: Math.max(exposure, 1.08),
    sunIntensity: Math.max(sun, editorFill),
    editorFill
  };
}
