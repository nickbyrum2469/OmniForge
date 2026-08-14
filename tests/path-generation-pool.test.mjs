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
  assert.equal(workers.length, 0, 'workers should be created only when work is submitted');
  const results = await Promise.all(Array.from({ length: 9 }, (_, index) => pool.submit({
    key: `route-${index}`,
    revision: 1,
    payload: { index }
  })));
  assert.equal(results.length, 9);
  assert.equal(pool.diagnostics().metrics.completed, 9);
  assert.ok(results.every(result => Number.isFinite(result.totalDurationMs) && Number.isFinite(result.queueDurationMs)));
  assert.ok(pool.diagnostics().metrics.totalPayloadCloneMs >= 0);
  assert.ok(pool.diagnostics().metrics.totalDispatchCloneMs >= 0);
  assert.ok(pool.diagnostics().metrics.totalLatencyMs >= pool.diagnostics().metrics.totalWorkerMs);
  assert.equal(workers.length, 7);
  pool.close();
});

test('worker pool grows only to the queued workload instead of spawning idle workers', async () => {
  const workers = [];
  const pool = new PathGenerationWorkerPool({
    hardwareConcurrency: 32,
    workerFactory() {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }
  });
  assert.equal(pool.workerCount, 31);
  const results = await Promise.all(Array.from({ length: 4 }, (_, index) => pool.submit({
    key: `alternative-${index}`,
    revision: 1,
    payload: { index }
  })));
  assert.equal(results.length, 4);
  assert.equal(workers.length, 4);
  assert.equal(pool.diagnostics().running, 0);
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

test('worker results must match the submitted key and revision', async () => {
  class MismatchedWorker extends FakeWorker {
    postMessage(message) {
      setTimeout(() => this.onmessage?.({ data: {
        id: message.id, key: `${message.key}-wrong`, revision: message.revision,
        ok: true, result: {}, durationMs: 1
      } }), 1);
    }
  }
  const pool = new PathGenerationWorkerPool({ workerCount: 1, hardwareConcurrency: 2, workerFactory: () => new MismatchedWorker() });
  await assert.rejects(pool.submit({ key: 'exact', revision: 3, payload: {} }), /mismatched job identity/);
  pool.close();
});

test('cancel reports queued and running work that it removed', async () => {
  const pool = new PathGenerationWorkerPool({ workerCount: 1, hardwareConcurrency: 2, workerFactory: () => new FakeWorker(50) });
  const running = pool.submit({ key: 'same', revision: 1, payload: {} });
  const queued = pool.submit({ key: 'same', revision: 2, payload: {} });
  assert.equal(pool.cancel('same'), 2);
  await assert.rejects(running, error => error.name === 'AbortError');
  await assert.rejects(queued, error => error.name === 'AbortError');
  pool.close();
});

test('interactive rendering preempts and then resumes lower-priority route work', async () => {
  const starts = [];
  class RecordingWorker extends FakeWorker {
    postMessage(message) {
      starts.push(message.key);
      this.delay = message.key === 'interactive' ? 1 : 20;
      super.postMessage(message);
    }
  }
  const pool = new PathGenerationWorkerPool({ workerCount: 1, hardwareConcurrency: 2, workerFactory: () => new RecordingWorker() });
  const route = pool.submit({ key: 'route', revision: 1, payload: {}, priority: 0 });
  const interactive = pool.submit({ key: 'interactive', revision: 1, payload: {}, priority: 100000 });
  assert.equal((await interactive).key, 'interactive');
  assert.equal((await route).key, 'route');
  assert.deepEqual(starts, ['route', 'interactive', 'route']);
  assert.equal(pool.diagnostics().metrics.preempted, 1);
  pool.close();
});

test('a synchronous worker startup failure rejects once without idle respawn', async () => {
  let starts = 0;
  const pool = new PathGenerationWorkerPool({
    workerCount: 2,
    hardwareConcurrency: 4,
    workerRetryBaseMs: 5,
    workerRetryMaximumMs: 10,
    workerFactory() {
      starts += 1;
      throw new Error('module worker unavailable');
    }
  });
  await assert.rejects(
    pool.submit({ key: 'startup', revision: 1, payload: {} }),
    /could not start: module worker unavailable/
  );
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(starts, 1, 'an idle failed pool must not respawn workers');
  assert.equal(pool.diagnostics().queued, 0);
  assert.equal(pool.diagnostics().metrics.workerStartupFailures, 1);
  assert.equal(pool.diagnostics().workerHealth.failureStreak, 1);
  pool.close();
});

test('a synchronous worker dispatch failure rejects cleanly without recursive replacement', async () => {
  let starts = 0;
  class DispatchFailureWorker extends FakeWorker {
    postMessage() { throw new Error('worker bootstrap rejected the module'); }
  }
  const pool = new PathGenerationWorkerPool({
    workerCount: 1,
    hardwareConcurrency: 2,
    workerRetryBaseMs: 5,
    workerRetryMaximumMs: 5,
    workerFactory() {
      starts += 1;
      return new DispatchFailureWorker();
    }
  });
  await assert.rejects(
    pool.submit({ key: 'dispatch-startup', revision: 1, payload: {} }),
    /worker failed: worker bootstrap rejected the module/
  );
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(starts, 1);
  assert.equal(pool.diagnostics().queued, 0);
  assert.equal(pool.diagnostics().running, 0);
  pool.close();
});

test('a crashed worker rejects its active job and retries queued demand after bounded backoff', async () => {
  const starts = [];
  class StartupCrashWorker extends FakeWorker {
    postMessage() {
      setTimeout(() => this.onerror?.({ message: 'startup script failed', preventDefault() {} }), 0);
    }
  }
  const pool = new PathGenerationWorkerPool({
    workerCount: 1,
    hardwareConcurrency: 2,
    workerRetryBaseMs: 5,
    workerRetryMaximumMs: 10,
    workerFactory() {
      const worker = starts.length === 0 ? new StartupCrashWorker() : new FakeWorker(1);
      starts.push(worker);
      return worker;
    }
  });
  const failed = pool.submit({ key: 'first', revision: 1, payload: {} });
  const recovered = pool.submit({ key: 'second', revision: 1, payload: {} });
  await assert.rejects(failed, /worker failed: startup script failed/);
  assert.equal((await recovered).key, 'second');
  assert.equal(starts.length, 2);
  assert.equal(pool.diagnostics().metrics.workerFailures, 1);
  assert.equal(pool.diagnostics().metrics.workerRetrySchedules, 1);
  assert.equal(pool.diagnostics().workerHealth.failureStreak, 0);
  pool.close();
});

test('an idle worker crash is retired and recreated only when later work requests capacity', async () => {
  const workers = [];
  const pool = new PathGenerationWorkerPool({
    workerCount: 1,
    hardwareConcurrency: 2,
    workerRetryBaseMs: 5,
    workerRetryMaximumMs: 5,
    workerFactory() {
      const worker = new FakeWorker(1);
      workers.push(worker);
      return worker;
    }
  });
  await pool.submit({ key: 'warmup', revision: 1, payload: {} });
  workers[0].onerror?.({ message: 'idle worker exited', preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(workers.length, 1, 'idle failures must not create replacement workers');
  assert.equal((await pool.submit({ key: 'later', revision: 1, payload: {} })).key, 'later');
  assert.equal(workers.length, 2);
  pool.close();
});
