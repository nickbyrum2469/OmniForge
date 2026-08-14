const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));

export class StalePathGenerationError extends Error {
  constructor(key, revision) {
    super(`Discarded stale path generation ${key}@${revision}.`);
    this.name = 'StalePathGenerationError';
    this.key = key;
    this.revision = revision;
  }
}

export class PathGenerationWorkerPool {
  constructor({
    workerCount,
    hardwareConcurrency,
    workerFactory,
    workerRetryBaseMs = 25,
    workerRetryMaximumMs = 1000,
    workerUrl = new URL('./generation-worker.js', import.meta.url)
  } = {}) {
    const logicalProcessors = Math.max(
      2,
      Math.floor(finite(
        hardwareConcurrency,
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4
      ))
    );
    this.workerCount = Math.round(clamp(workerCount ?? logicalProcessors - 1, 1, logicalProcessors - 1));
    this.workerFactory = workerFactory || (url => new Worker(url, { type: 'module', name: 'OmniForge path generation' }));
    this.workerUrl = workerUrl;
    this.queue = [];
    this.jobs = new Map();
    this.latestRevision = new Map();
    this.slots = [];
    this.slotSequence = 0;
    this.sequence = 0;
    this.closed = false;
    this.workerRetryBaseMs = clamp(workerRetryBaseMs, 1, 60000);
    this.workerRetryMaximumMs = clamp(workerRetryMaximumMs, this.workerRetryBaseMs, 60000);
    this.workerFailureStreak = 0;
    this.workerRetryAt = 0;
    this.workerRetryTimer = null;
    this.metrics = {
      submitted: 0,
      completed: 0,
      cancelled: 0,
      stale: 0,
      failed: 0,
      workerFailures: 0,
      workerStartupFailures: 0,
      workerRetrySchedules: 0,
      preempted: 0,
      totalWorkerMs: 0,
      totalPayloadCloneMs: 0,
      totalDispatchCloneMs: 0,
      totalQueueMs: 0,
      totalLatencyMs: 0
    };
  }

  createSlot(index) {
    const worker = this.workerFactory(this.workerUrl, index);
    const slot = { index, worker, busyJobId: null };
    worker.onmessage = event => this.handleMessage(slot, event.data);
    worker.onerror = error => this.handleWorkerFailure(slot, error);
    return slot;
  }

  retireSlot(slot) {
    const index = this.slots.indexOf(slot);
    if (index < 0) return false;
    this.slots.splice(index, 1);
    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    try {
      slot.worker.terminate();
    } catch {
      // The worker may already have exited.
    }
    return true;
  }

  recordWorkerFailure() {
    this.workerFailureStreak += 1;
    const exponent = Math.min(16, this.workerFailureStreak - 1);
    const delay = Math.min(this.workerRetryMaximumMs, this.workerRetryBaseMs * (2 ** exponent));
    this.workerRetryAt = performance.now() + delay;
    this.metrics.workerFailures += 1;
    return delay;
  }

  clearWorkerFailureBackoff() {
    this.workerFailureStreak = 0;
    this.workerRetryAt = 0;
    if (this.workerRetryTimer) clearTimeout(this.workerRetryTimer);
    this.workerRetryTimer = null;
  }

  scheduleWorkerRetry() {
    if (this.closed || !this.queue.length || this.workerRetryTimer) return false;
    const delay = Math.max(1, this.workerRetryAt - performance.now());
    this.metrics.workerRetrySchedules += 1;
    this.workerRetryTimer = setTimeout(() => {
      this.workerRetryTimer = null;
      if (!this.closed && this.queue.length) this.dispatch();
    }, delay);
    return true;
  }

  failQueuedWorkerStartup(error) {
    const job = this.queue.shift();
    this.recordWorkerFailure();
    this.metrics.workerStartupFailures += 1;
    if (job && this.jobs.has(job.id)) {
      this.jobs.delete(job.id);
      this.metrics.failed += 1;
      job.reject(new Error(`Path generation worker could not start: ${error?.message || String(error)}`));
    }
    this.scheduleWorkerRetry();
  }

  submit({ key = 'path-network', revision, type = 'solve-trails', payload, priority = 0 } = {}) {
    if (this.closed) return Promise.reject(new Error('Path generation worker pool is closed.'));
    const normalizedRevision = Math.max(1, Math.floor(finite(revision, 1)));
    const latest = this.latestRevision.get(key) || 0;
    if (normalizedRevision < latest) {
      return Promise.reject(new StalePathGenerationError(key, normalizedRevision));
    }
    this.latestRevision.set(key, normalizedRevision);
    const id = `path-job-${Date.now().toString(36)}-${(++this.sequence).toString(36)}`,submittedAt=performance.now(),cloneStartedAt=performance.now(),clonedPayload=structuredClone(payload),payloadCloneMs=performance.now()-cloneStartedAt;
    return new Promise((resolve, reject) => {
      const job = {
        id,
        key,
        revision: normalizedRevision,
        type,
        payload: clonedPayload,
        priority: finite(priority),
        submittedAt,
        payloadCloneMs,
        dispatchCloneMs: 0,
        resolve,
        reject,
        state: 'queued'
      };
      this.jobs.set(id, job);
      this.queue.push(job);
      this.queue.sort((a, b) => b.priority - a.priority || a.submittedAt - b.submittedAt);
      this.metrics.submitted += 1;
      this.metrics.totalPayloadCloneMs += payloadCloneMs;
      this.preemptLowerPriorityWork(job.priority);
      this.dispatch();
    });
  }

  preemptLowerPriorityWork(priority) {
    if (priority < 100000 || this.slots.length < this.workerCount) return false;
    const candidate = this.slots
      .map(slot => ({ slot, job: slot.busyJobId ? this.jobs.get(slot.busyJobId) : null }))
      .filter(entry => entry.job && entry.job.priority < priority)
      .sort((left, right) => left.job.priority - right.job.priority || right.job.startedAt - left.job.startedAt)[0];
    if (!candidate) return false;
    const { slot, job } = candidate;
    slot.busyJobId = null;
    this.retireSlot(slot);
    job.state = 'queued';
    delete job.startedAt;
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority || a.submittedAt - b.submittedAt);
    this.metrics.preempted += 1;
    return true;
  }

  dispatch() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.busyJobId && this.queue.length) this.startNextJob(slot);
    }
    if (this.queue.length && performance.now() < this.workerRetryAt) {
      this.scheduleWorkerRetry();
      return;
    }
    while (this.queue.length && this.slots.length < this.workerCount) {
      let slot;
      try {
        slot = this.createSlot(this.slotSequence++);
      } catch (error) {
        this.failQueuedWorkerStartup(error);
        break;
      }
      this.slots.push(slot);
      this.startNextJob(slot);
    }
  }

  startNextJob(slot) {
    if (this.closed || slot.busyJobId) return false;
    let job = null;
    while (this.queue.length && !job) {
      const candidate = this.queue.shift();
      if (candidate && this.jobs.has(candidate.id)) job = candidate;
    }
    if (!job) return false;
    slot.busyJobId = job.id;
    job.state = 'running';
    job.startedAt = performance.now();
    const dispatchStartedAt = performance.now();
    try {
      slot.worker.postMessage({
        id: job.id,
        key: job.key,
        revision: job.revision,
        type: job.type,
        payload: job.payload
      });
      job.dispatchCloneMs = performance.now() - dispatchStartedAt;
      this.metrics.totalDispatchCloneMs += job.dispatchCloneMs;
      return true;
    } catch (error) {
      job.dispatchCloneMs = performance.now() - dispatchStartedAt;
      this.metrics.totalDispatchCloneMs += job.dispatchCloneMs;
      this.handleWorkerFailure(slot, error);
      return false;
    }
  }

  settle(slot, job, callback) {
    this.jobs.delete(job.id);
    slot.busyJobId = null;
    callback();
    this.dispatch();
  }

  handleMessage(slot, message = {}) {
    const job = this.jobs.get(message.id);
    if (!job || slot.busyJobId !== message.id) return;
    if (message.key !== job.key || Number(message.revision) !== job.revision) {
      this.metrics.failed += 1;
      this.settle(slot, job, () => job.reject(new Error('Path generation worker returned mismatched job identity.')));
      return;
    }
    const latest = this.latestRevision.get(job.key);
    if (latest !== job.revision) {
      this.metrics.stale += 1;
      this.settle(slot, job, () => job.reject(new StalePathGenerationError(job.key, job.revision)));
      return;
    }
    if (!message.ok) {
      this.metrics.failed += 1;
      this.settle(slot, job, () => job.reject(new Error(message.error || 'Path generation worker failed.')));
      return;
    }
    this.metrics.completed += 1;
    this.clearWorkerFailureBackoff();
    this.metrics.totalWorkerMs += Math.max(0, finite(message.durationMs));
    const completedAt=performance.now(),queueDurationMs=Math.max(0,finite(job.startedAt)-finite(job.submittedAt)),totalDurationMs=Math.max(0,completedAt-finite(job.submittedAt));this.metrics.totalQueueMs+=queueDurationMs;this.metrics.totalLatencyMs+=totalDurationMs;
    this.settle(slot, job, () => job.resolve({
      key: job.key,
      revision: job.revision,
      result: message.result,
      durationMs: Math.max(0, finite(message.durationMs)),
      queueDurationMs,
      totalDurationMs,
      payloadCloneMs:Math.max(0,finite(job.payloadCloneMs)),
      dispatchCloneMs:Math.max(0,finite(job.dispatchCloneMs))
    }));
  }

  handleWorkerFailure(slot, error) {
    error?.preventDefault?.();
    if (!this.slots.includes(slot)) return;
    const job = slot.busyJobId ? this.jobs.get(slot.busyJobId) : null;
    if (job) {
      this.jobs.delete(job.id);
      this.metrics.failed += 1;
      job.reject(new Error(`Path generation worker failed: ${error?.message || 'worker crashed'}`));
    }
    this.retireSlot(slot);
    this.recordWorkerFailure();
    this.dispatch();
  }

  cancel(key, revision = null) {
    const matches = job => job.key === key && (revision === null || job.revision === revision);
    const queued = this.queue.filter(matches);
    this.queue = this.queue.filter(job => !matches(job));
    for (const job of queued) {
      this.jobs.delete(job.id);
      this.metrics.cancelled += 1;
      job.reject(new DOMException('Path generation cancelled.', 'AbortError'));
    }
    let runningCount = 0;
    for (const slot of [...this.slots]) {
      const job = slot.busyJobId ? this.jobs.get(slot.busyJobId) : null;
      if (!job || !matches(job)) continue;
      runningCount += 1;
      this.jobs.delete(job.id);
      this.metrics.cancelled += 1;
      job.reject(new DOMException('Path generation cancelled.', 'AbortError'));
      this.retireSlot(slot);
    }
    this.dispatch();
    return queued.length + runningCount;
  }

  diagnostics() {
    return {
      schemaVersion: 1,
      workerCount: this.workerCount,
      queued: this.queue.length,
      running: this.slots.filter(slot => slot.busyJobId).length,
      workerHealth: {
        failureStreak: this.workerFailureStreak,
        retryScheduled: Boolean(this.workerRetryTimer),
        retryInMs: Math.max(0, this.workerRetryAt - performance.now())
      },
      latestRevision: Object.fromEntries(this.latestRevision),
      metrics: { ...this.metrics },
      jobs: [...this.jobs.values()].map(job => ({
        id: job.id,
        key: job.key,
        revision: job.revision,
        state: job.state,
        priority: job.priority,
        payloadCloneMs:job.payloadCloneMs,
        dispatchCloneMs:job.dispatchCloneMs,
        queueDurationMs:job.startedAt?Math.max(0,job.startedAt-job.submittedAt):Math.max(0,performance.now()-job.submittedAt)
      }))
    };
  }

  close() {
    this.closed = true;
    if (this.workerRetryTimer) clearTimeout(this.workerRetryTimer);
    this.workerRetryTimer = null;
    for (const job of this.jobs.values()) job.reject(new DOMException('Path generation pool closed.', 'AbortError'));
    this.jobs.clear();
    this.queue.length = 0;
    for (const slot of this.slots) {
      try {
        slot.worker.terminate();
      } catch {
        // Ignore already terminated workers.
      }
    }
    this.slots.length = 0;
  }
}

let sharedPool = null;

export function sharedPathGenerationWorkerPool(options = {}) {
  if (!sharedPool || sharedPool.closed) sharedPool = new PathGenerationWorkerPool(options);
  return sharedPool;
}

export function closeSharedPathGenerationWorkerPool() {
  sharedPool?.close();
  sharedPool = null;
}
