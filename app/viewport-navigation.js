const TAU = Math.PI * 2;

export function wrapYaw(value) {
  const yaw = Number(value) || 0;
  return ((yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

export function createLookInputState() {
  return { source: null, ignoreEvents: 0, lastEventAt: 0, rejectedSpikes: 0 };
}

export function beginLookInputSession(state, source, now = performance.now()) {
  state.source = source;
  state.ignoreEvents = source === 'pointer-lock' ? 1 : 0;
  state.lastEventAt = Number(now) || 0;
  return state;
}

export function endLookInputSession(state) {
  state.source = null;
  state.ignoreEvents = 0;
  state.lastEventAt = 0;
  return state;
}

export function applyLookDelta(camera, state, {
  dx = 0,
  dy = 0,
  source = 'pointer-lock',
  now = performance.now()
} = {}) {
  const x = Number(dx);
  const y = Number(dy);
  const timestamp = Number(now) || 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { changed: false, reason: 'non-finite' };
  if (state.source !== source) beginLookInputSession(state, source, timestamp);

  const gap = state.lastEventAt ? timestamp - state.lastEventAt : 0;
  state.lastEventAt = timestamp;
  if (gap > 280) {
    state.ignoreEvents = Math.max(state.ignoreEvents, 1);
    return { changed: false, reason: 'resume-guard' };
  }
  if (state.ignoreEvents > 0) {
    state.ignoreEvents -= 1;
    return { changed: false, reason: 'session-warmup' };
  }

  const axisLimit = source === 'pointer-lock' ? 320 : 180;
  const magnitudeLimit = source === 'pointer-lock' ? 420 : 240;
  if (Math.abs(x) > axisLimit || Math.abs(y) > axisLimit || Math.hypot(x, y) > magnitudeLimit) {
    state.rejectedSpikes += 1;
    return { changed: false, reason: 'delta-spike', dx: x, dy: y };
  }

  const sensitivity = Math.max(0.0005, Math.min(0.008, Number(camera.lookSensitivity || 0.0023)));
  const horizontal = camera.invertHorizontal ? -1 : 1;
  const vertical = camera.invertVertical ? 1 : -1;
  camera.yaw = wrapYaw(Number(camera.yaw || 0) + x * sensitivity * horizontal);
  camera.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, Number(camera.pitch || 0) + y * sensitivity * vertical));
  return { changed: x !== 0 || y !== 0, reason: 'applied', dx: x, dy: y };
}
