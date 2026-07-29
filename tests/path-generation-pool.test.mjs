import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PathGenerationWorkerPool,
  StalePathGenerationError
} from '../app/path-network/generation-pool.js';

class FakeWorker {
  constructor(delay = 4) {
    this.delay = delay;
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
  }

  postMessage(message) {
    setTimeout(() => {
      if (this.terminated) return;
      this.onmessage?.({
        data: {
          id: message.id,
          key: message.key,
          revision: message.revision,
          ok: true,
          result: { revision: message.revision },
          durationMs: this.delay
        }
      });
    }, this.delay);
  }

  terminate() {
    this.terminated = true;
  }
}

test('worker pool reserves one logical processor and distributes queued work', async () => {
  const workers = [];
  const pool = new PathGenerationWorkerPool({
    hardwareConcurrency: 8,
    workerFactory() {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }
  });
  assert.equal(pool.workerCount, 7);
  const results = await Promise.all(Array.from({ length: 9 }, (_, index) => pool.submit({
    key: `route-${index}`,
    revision: 1,
    payload: { index }
  })));
  assert.equal(results.length, 9);
  assert.equal(pool.diagnostics().metrics.completed, 9);
  assert.equal(workers.length, 7);
  pool.close();
});

test('newer generation revisions prevent stale results from committing', async () => {
  const pool = new PathGenerationWorkerPool({
    workerCount: 2,
    hardwareConcurrency: 4,
    workerFactory: () => new FakeWorker(8)
  });
  const stale = pool.submit({ key: 'route', revision: 1, payload: {} });
  const current = pool.submit({ key: 'route', revision: 2, payload: {} });
  await assert.rejects(stale, error => error instanceof StalePathGenerationError);
  assert.equal((await current).revision, 2);
  assert.equal(pool.diagnostics().metrics.stale, 1);
  pool.close();
});

test('cancelling running work replaces the worker and preserves later jobs', async () => {
  const workers = [];
  const pool = new PathGenerationWorkerPool({
    workerCount: 1,
    hardwareConcurrency: 2,
    workerFactory() {
      const worker = new FakeWorker(20);
      workers.push(worker);
      return worker;
    }
  });
  const cancelled = pool.submit({ key: 'route', revision: 1, payload: {} });
  pool.cancel('route', 1);
  await assert.rejects(cancelled, error => error.name === 'AbortError');
  const completed = await pool.submit({ key: 'route', revision: 2, payload: {} });
  assert.equal(completed.revision, 2);
  assert.ok(workers.length >= 2);
  pool.close();
});
