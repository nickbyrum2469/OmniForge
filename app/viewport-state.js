export function cloneCamera(camera) {
  if (!camera || typeof camera !== 'object') return null;
  return {
    ...camera,
    position: Array.isArray(camera.position) ? camera.position.map(Number) : [0, 0, 0]
  };
}

export function shouldPreserveViewportCamera({
  sameAuthority = false,
  navigationActive = false,
  cameraDirty = false,
  requested = false
} = {}) {
  return Boolean(sameAuthority && (navigationActive || cameraDirty || requested));
}
