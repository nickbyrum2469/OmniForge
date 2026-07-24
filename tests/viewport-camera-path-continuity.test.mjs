import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneCamera, shouldPreserveViewportCamera } from '../app/viewport-state.js';
import { buildPathGuideSegments } from '../app/path-visuals.js';

test('live viewport camera remains authoritative during navigation and pending persistence', () => {
  assert.equal(shouldPreserveViewportCamera({ sameAuthority: true, navigationActive: true }), true);
  assert.equal(shouldPreserveViewportCamera({ sameAuthority: true, cameraDirty: true }), true);
  assert.equal(shouldPreserveViewportCamera({ sameAuthority: true, requested: true }), true);
  assert.equal(shouldPreserveViewportCamera({ sameAuthority: false, navigationActive: true, cameraDirty: true }), false);
  assert.equal(shouldPreserveViewportCamera({ sameAuthority: true }), false);

  const source = { position: [10, 20, 30], yaw: 1.25, pitch: -0.4, fov: 62 };
  const copy = cloneCamera(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy, source);
  assert.notEqual(copy.position, source.position);
});

test('path guide edges share exact joined endpoints and follow edge terrain height', () => {
  const samples = [
    { x: 0, z: 0 },
    { x: 8, z: 0 },
    { x: 12, z: 5 },
    { x: 18, z: 8 }
  ];
  const heightAt = (x, z) => x * 0.1 + z * 0.2;
  const geometry = buildPathGuideSegments(samples, 4, heightAt, 0.1);

  assert.equal(geometry.center.length, (samples.length - 1) * 6);
  assert.equal(geometry.edges.length, (samples.length - 1) * 12);

  for (let segment = 0; segment < samples.length - 2; segment += 1) {
    const currentLeftEnd = geometry.edges.slice(segment * 12 + 3, segment * 12 + 6);
    const nextLeftStart = geometry.edges.slice((segment + 1) * 12, (segment + 1) * 12 + 3);
    const currentRightEnd = geometry.edges.slice(segment * 12 + 9, segment * 12 + 12);
    const nextRightStart = geometry.edges.slice((segment + 1) * 12 + 6, (segment + 1) * 12 + 9);
    assert.deepEqual(currentLeftEnd, nextLeftStart);
    assert.deepEqual(currentRightEnd, nextRightStart);
  }

  for (let index = 0; index < geometry.edges.length; index += 3) {
    const [x, y, z] = geometry.edges.slice(index, index + 3);
    assert.ok(Math.abs(y - (heightAt(x, z) + 0.1)) < 1e-10);
  }
});
