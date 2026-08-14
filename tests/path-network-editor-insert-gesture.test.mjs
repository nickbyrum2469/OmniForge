import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completePathInsertGesture,
  contextMenuPathInsertDecision,
  createPathInsertGesture,
  updatePathInsertGesture
} from '../app/path-network/editor-insert-gesture.js';

test('one stationary right click may insert and its following context menu remains stationary', () => {
  const pending = createPathInsertGesture({ pathId: 'road', clientX: 100, clientY: 80, now: 10 });
  const completed = completePathInsertGesture(pending, { pathId: 'road', now: 40 });
  assert.equal(completed.shouldInsert, true);
  const fallback = contextMenuPathInsertDecision({
    completedGesture: completed.gesture,
    pathId: 'road',
    now: 45
  });
  assert.equal(fallback.shouldInsert, false, 'contextmenu after mouseup must never dispatch a second insertion');
  assert.equal(fallback.recentCompletedGesture, true);
});

test('right drag never becomes insertion when Chromium emits contextmenu after release', () => {
  const pending = createPathInsertGesture({ pathId: 'road', clientX: 100, clientY: 80, now: 10 });
  const moved = updatePathInsertGesture(pending, { clientX: 118, clientY: 82 });
  const completed = completePathInsertGesture(moved, { pathId: 'road', now: 80 });
  assert.equal(completed.shouldInsert, false);
  assert.equal(contextMenuPathInsertDecision({
    completedGesture: completed.gesture,
    pathId: 'road',
    now: 85
  }).shouldInsert, false);
});

test('pending moved gestures, stale gestures, and another path all fail closed', () => {
  const pending = updatePathInsertGesture(
    createPathInsertGesture({ pathId: 'road', clientX: 0, clientY: 0, now: 0 }),
    { forceMoved: true }
  );
  assert.equal(contextMenuPathInsertDecision({ pendingGesture: pending, pathId: 'road', now: 50 }).shouldInsert, false);
  const stationary = completePathInsertGesture(
    createPathInsertGesture({ pathId: 'road', clientX: 0, clientY: 0, now: 0 }),
    { pathId: 'road', now: 20 }
  ).gesture;
  assert.equal(contextMenuPathInsertDecision({ completedGesture: stationary, pathId: 'road', now: 5000 }).shouldInsert, false);
  assert.equal(contextMenuPathInsertDecision({ completedGesture: stationary, pathId: 'other', now: 25 }).shouldInsert, false);
});

test('pointer lock and release-only displacement cannot become insertion', () => {
  assert.equal(createPathInsertGesture({ pathId: 'path', clientX: 10, clientY: 10, pointerLocked: true }), null);
  const gesture = createPathInsertGesture({ pathId: 'path', clientX: 10, clientY: 10, now: 0 });
  const released = updatePathInsertGesture(gesture, { clientX: 30, clientY: 10 });
  assert.equal(completePathInsertGesture(released, { pathId: 'path', now: 100 }).shouldInsert, false);
});
