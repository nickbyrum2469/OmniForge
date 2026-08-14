import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractivePathRenderGeneration } from '../app/path-network/interactive-render-generation.js';

class DeferredPool {
  constructor() { this.jobs = []; this.cancelled = []; }
  submit(job) {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    this.jobs.push({ ...job, resolve, reject });
    return promise;
  }
  cancel(key, revision) {
    this.cancelled.push({ key, revision });
    const job = this.jobs.find(entry => entry.key === key && entry.revision === revision);
    if (job) job.reject(new DOMException('cancelled', 'AbortError'));
    return job ? 1 : 0;
  }
}

test('active generation stays ready while a newer exact revision is pending and stale work cannot commit', async () => {
  const pool = new DeferredPool(), commits = [];
  const coordinator = new InteractivePathRenderGeneration({ pool, key: 'renderer', onReady: value => commits.push(value.signature) });
  const firstPromise = coordinator.request({ signature: 'A', payload: {} });
  pool.jobs[0].resolve({ revision: 1, result: { signature: 'A' }, durationMs: 2, queueDurationMs: 1, totalDurationMs: 4, payloadCloneMs: .2, dispatchCloneMs: .1 });
  await firstPromise;
  assert.equal(coordinator.isReady('A'), true);
  assert.deepEqual(coordinator.diagnostics().lastReadyTiming,{workerDurationMs:2,queueDurationMs:1,totalDurationMs:4,payloadCloneMs:.2,dispatchCloneMs:.1});

  const secondPromise = coordinator.request({ signature: 'B', payload: {} });
  assert.equal(coordinator.isReady('A'), true, 'last valid generation must remain active while B compiles');
  const thirdPromise = coordinator.request({ signature: 'C', payload: {} });
  assert.deepEqual(pool.cancelled, [{ key: 'renderer', revision: 2 }]);
  await secondPromise;
  pool.jobs[2].resolve({ revision: 3, result: { signature: 'C' }, durationMs: 3 });
  await thirdPromise;
  assert.deepEqual(commits, ['A', 'C']);
  assert.equal(coordinator.isReady('C'), true);
});

test('mismatched signatures fail closed and are throttled instead of flooding the pool', async () => {
  const pool = new DeferredPool(), errors = [];
  const coordinator = new InteractivePathRenderGeneration({ pool, key: 'renderer', onError: error => errors.push(error.message) });
  const pending = coordinator.request({ signature: 'expected', payload: {} });
  pool.jobs[0].resolve({ revision: 1, result: { signature: 'wrong' }, durationMs: 1 });
  await pending;
  assert.equal(errors.length, 1);
  assert.equal(coordinator.request({ signature: 'expected', payload: {} }), null);
  assert.equal(pool.jobs.length, 1);
});
