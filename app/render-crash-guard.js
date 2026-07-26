const finite = value => Number.isFinite(Number(value));

export function sanitizeCameraState(camera = {}, fallback = {}) {
  const safe = {
    position: Array.isArray(camera.position) && camera.position.length >= 3 && camera.position.every(finite)
      ? camera.position.slice(0, 3).map(Number)
      : Array.isArray(fallback.position) ? fallback.position.slice(0, 3).map(Number) : [8, 6, 12],
    yaw: finite(camera.yaw) ? Number(camera.yaw) : finite(fallback.yaw) ? Number(fallback.yaw) : -0.65,
    pitch: finite(camera.pitch) ? Number(camera.pitch) : finite(fallback.pitch) ? Number(fallback.pitch) : -0.28,
    fov: finite(camera.fov) ? Math.max(30, Math.min(110, Number(camera.fov))) : finite(fallback.fov) ? Number(fallback.fov) : 62,
    moveSpeed: finite(camera.moveSpeed) ? Math.max(0.1, Math.min(500, Number(camera.moveSpeed))) : finite(fallback.moveSpeed) ? Number(fallback.moveSpeed) : 12,
    lookSensitivity: finite(camera.lookSensitivity) ? Math.max(0.0001, Math.min(0.02, Number(camera.lookSensitivity))) : finite(fallback.lookSensitivity) ? Number(fallback.lookSensitivity) : 0.0023,
    invertHorizontal: Boolean(camera.invertHorizontal ?? fallback.invertHorizontal),
    invertVertical: Boolean(camera.invertVertical ?? fallback.invertVertical),
    fastMultiplier: finite(camera.fastMultiplier) ? Math.max(1, Math.min(20, Number(camera.fastMultiplier))) : finite(fallback.fastMultiplier) ? Number(fallback.fastMultiplier) : 3.5
  };
  safe.pitch = Math.max(-Math.PI * 0.495, Math.min(Math.PI * 0.495, safe.pitch));
  safe.yaw = ((safe.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return safe;
}

export class RenderCrashGuard {
  constructor({ failureWindowMs = 5000, tripThreshold = 3, cooldownMs = 1800, onFailure = null, onTrip = null, onRecover = null } = {}) {
    this.failureWindowMs = Math.max(250, Number(failureWindowMs) || 5000);
    this.tripThreshold = Math.max(1, Math.floor(Number(tripThreshold) || 3));
    this.cooldownMs = Math.max(100, Number(cooldownMs) || 1800);
    this.onFailure = typeof onFailure === 'function' ? onFailure : null;
    this.onTrip = typeof onTrip === 'function' ? onTrip : null;
    this.onRecover = typeof onRecover === 'function' ? onRecover : null;
    this.failures = [];
    this.suspendedUntil = 0;
    this.totalFailures = 0;
    this.lastError = null;
    this.lastGoodFrameAt = 0;
  }

  snapshot(now = performance.now()) {
    this.prune(now);
    return {
      totalFailures: this.totalFailures,
      recentFailures: this.failures.length,
      suspended: now < this.suspendedUntil,
      suspendedUntil: this.suspendedUntil,
      lastGoodFrameAt: this.lastGoodFrameAt,
      lastError: this.lastError ? { message: this.lastError.message, stack: this.lastError.stack || '' } : null
    };
  }

  prune(now) {
    const cutoff = Number(now) - this.failureWindowMs;
    this.failures = this.failures.filter(value => value >= cutoff);
  }

  run(callback, now = performance.now()) {
    const timestamp = Number(now) || performance.now();
    if (timestamp < this.suspendedUntil) return { rendered: false, suspended: true, error: this.lastError };
    try {
      const value = callback();
      const recovered = this.failures.length > 0 || this.lastError;
      this.failures = [];
      this.lastError = null;
      this.lastGoodFrameAt = timestamp;
      if (recovered) this.onRecover?.({ at: timestamp });
      return { rendered: true, suspended: false, value };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.totalFailures += 1;
      this.lastError = normalized;
      this.failures.push(timestamp);
      this.prune(timestamp);
      this.onFailure?.({ error: normalized, at: timestamp, recentFailures: this.failures.length, totalFailures: this.totalFailures });
      if (this.failures.length >= this.tripThreshold) {
        this.suspendedUntil = timestamp + this.cooldownMs;
        this.onTrip?.({ error: normalized, at: timestamp, suspendedUntil: this.suspendedUntil, recentFailures: this.failures.length, totalFailures: this.totalFailures });
      }
      return { rendered: false, suspended: timestamp < this.suspendedUntil, error: normalized };
    }
  }
}
