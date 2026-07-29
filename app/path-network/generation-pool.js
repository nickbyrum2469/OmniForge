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
    this.sequence = 0;
    this.closed = false;
    this.metrics = {
      submitted: 0,
      completed: 0,
      cancelled: 0,
      stale: 0,
      failed: 0,
      totalWorkerMs: 0
    };
    for (let index = 0; index < this.workerCount; index += 1) this.slots.push(this.createSlot(index));
  }

  createSlot(index) {
    const worker = this.workerFactory(this.workerUrl, index);
    const slot = { index, worker, busyJobId: null };
    worker.onmessage = event => this.handleMessage(slot, event.data);
    worker.onerror = error => this.handleWorkerFailure(slot, error);
    return slot;
  }

  replaceSlot(slot) {
    try {
      slot.worker.terminate();
    } catch {
      // The worker may already have exited.
    }
    const replacement = this.createSlot(slot.index);
    this.slots[slot.index] = replacement;
    return replacement;
  }

  submit({ key = 'path-network', revision, type = 'solve-trails', payload, priority = 0 } = {}) {
    if (this.closed) return Promise.reject(new Error('Path generation worker pool is closed.'));
    const normalizedRevision = Math.max(1, Math.floor(finite(revision, 1)));
    const latest = this.latestRevision.get(key) || 0;
    if (normalizedRevision < latest) {
      return Promise.reject(new StalePathGenerationError(key, normalizedRevision));
    }
    this.latestRevision.set(key, normalizedRevision);
    const id = `path-job-${Date.now().toString(36)}-${(++this.sequence).toString(36)}`;
    return new Promise((resolve, reject) => {
      const job = {
        id,
        key,
        revision: normalizedRevision,
        type,
        payload: structuredClone(payload),
        priority: finite(priority),
        submittedAt: performance.now(),
        resolve,
        reject,
        state: 'queued'
      };
      this.jobs.set(id, job);
      this.queue.push(job);
      this.queue.sort((a, b) => b.priority - a.priority || a.submittedAt - b.submittedAt);
      this.metrics.submitted += 1;
      this.dispatch();
    });
  }

  dispatch() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (slot.busyJobId || !this.queue.length) continue;
      const job = this.queue.shift();
      if (!job || !this.jobs.has(job.id)) continue;
      slot.busyJobId = job.id;
      job.state = 'running';
      job.startedAt = performance.now();
      slot.worker.postMessage({
        id: job.id,
        key: job.key,
        revision: job.revision,
        type: job.type,
        payload: job.payload
      });
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
    this.metrics.totalWorkerMs += Math.max(0, finite(message.durationMs));
    this.settle(slot, job, () => job.resolve({
      key: job.key,
      revision: job.revision,
      result: message.result,
      durationMs: Math.max(0, finite(message.durationMs))
    }));
  }

  handleWorkerFailure(slot, error) {
    const job = slot.busyJobId ? this.jobs.get(slot.busyJobId) : null;
    if (job) {
      this.jobs.delete(job.id);
      this.metrics.failed += 1;
      job.reject(new Error(error?.message || 'Path generation worker crashed.'));
    }
    this.replaceSlot(slot);
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
    for (const slot of [...this.slots]) {
      const job = slot.busyJobId ? this.jobs.get(slot.busyJobId) : null;
      if (!job || !matches(job)) continue;
      this.jobs.delete(job.id);
      this.metrics.cancelled += 1;
      job.reject(new DOMException('Path generation cancelled.', 'AbortError'));
      this.replaceSlot(slot);
    }
    this.dispatch();
    return queued.length + this.slots.filter(slot => {
      const job = slot.busyJobId ? this.jobs.get(slot.busyJobId) : null;
      return Boolean(job && matches(job));
    }).length;
  }

  diagnostics() {
    return {
      schemaVersion: 1,
      workerCount: this.workerCount,
      queued: this.queue.length,
      running: this.slots.filter(slot => slot.busyJobId).length,
      latestRevision: Object.fromEntries(this.latestRevision),
      metrics: { ...this.metrics },
      jobs: [...this.jobs.values()].map(job => ({
        id: job.id,
        key: job.key,
        revision: job.revision,
        state: job.state,
        priority: job.priority
      }))
    };
  }

  close() {
    this.closed = true;
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
