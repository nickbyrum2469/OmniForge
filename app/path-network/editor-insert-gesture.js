const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function createPathInsertGesture({ pathId, clientX, clientY, now = 0, pointerLocked = false } = {}) {
  if (pointerLocked) return null;
  return {
    pathId: String(pathId || ''),
    x: finite(clientX),
    y: finite(clientY),
    moved: false,
    startedAt: finite(now)
  };
}

export function updatePathInsertGesture(gesture, { clientX, clientY, forceMoved = false, thresholdPixels = 4 } = {}) {
  if (!gesture) return null;
  const moved = forceMoved === true || Math.hypot(
    finite(clientX, gesture.x) - gesture.x,
    finite(clientY, gesture.y) - gesture.y
  ) > Math.max(1, finite(thresholdPixels, 4));
  return moved && !gesture.moved ? { ...gesture, moved: true } : gesture;
}

export function completePathInsertGesture(gesture, {
  pathId,
  now = 0,
  maximumDurationMs = 900
} = {}) {
  if (!gesture) return { gesture: null, shouldInsert: false };
  const completedAt = finite(now);
  const completed = {
    ...gesture,
    completedAt,
    durationMs: Math.max(0, completedAt - finite(gesture.startedAt))
  };
  return {
    gesture: completed,
    shouldInsert: completed.pathId === String(pathId || '')
      && !completed.moved
      && completed.durationMs <= Math.max(1, finite(maximumDurationMs, 900))
  };
}

export function contextMenuPathInsertDecision({
  pendingGesture,
  completedGesture,
  pathId,
  now = 0,
  maximumDurationMs = 900,
  completedGestureWindowMs = 1000
} = {}) {
  if (pendingGesture) {
    return completePathInsertGesture(pendingGesture, { pathId, now, maximumDurationMs });
  }
  const completedAt = finite(completedGesture?.completedAt, Number.NEGATIVE_INFINITY);
  const recent = finite(now) - completedAt <= Math.max(1, finite(completedGestureWindowMs, 1000));
  return {
    gesture: completedGesture || null,
    // Mouseup already dispatched every completed stationary gesture. A later
    // Chromium contextmenu is acknowledgement, never a second mutation.
    shouldInsert: false,
    recentCompletedGesture: recent
      && completedGesture?.pathId === String(pathId || '')
  };
}
