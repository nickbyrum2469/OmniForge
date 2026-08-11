const finiteRevision = value => Math.max(1, Math.floor(Number(value) || 1));
let coordinatorSequence = 0;

function expectedCancellation(error) {
  return error?.name === 'AbortError' || error?.name === 'StalePathGenerationError';
}

export class InteractivePathRenderGeneration {
  constructor({ pool, key, onReady, onError } = {}) {
    if (!pool?.submit || !pool?.cancel) throw new Error('Interactive path rendering requires a revisioned worker pool.');
    this.pool = pool;
    this.key = String(key || `interactive-path-render-${++coordinatorSequence}`);
    this.onReady = typeof onReady === 'function' ? onReady : () => {};
    this.onError = typeof onError === 'function' ? onError : () => {};
    this.revision = 0;
    this.pending = null;
    this.readySignature = '';
    this.lastReadyTiming = null;
    this.failed = null;
    this.closed = false;
  }

  request({ signature, payload, context = null, priority = 100000 } = {}) {
    if (this.closed) return null;
    const normalizedSignature = String(signature || '');
    if (!normalizedSignature) throw new Error('Interactive path rendering requires an exact source signature.');
    if (this.readySignature === normalizedSignature) return null;
    if (this.pending?.signature === normalizedSignature) return this.pending.promise;
    if (this.failed?.signature === normalizedSignature && performance.now() - this.failed.at < 1000) return null;
    if (this.failed?.signature !== normalizedSignature) this.failed = null;
    if (this.pending) this.pool.cancel(this.key, this.pending.revision);

    const revision = finiteRevision(++this.revision);
    const pending = {
      signature: normalizedSignature,
      revision,
      context,
      promise: null
    };
    pending.promise = this.pool.submit({
      key: this.key,
      revision,
      type: 'compile-render-runtime',
      payload,
      priority
    }).then(message => {
      if (this.closed || this.pending !== pending || message.revision !== revision) return null;
      if (message.result?.signature !== normalizedSignature) {
        throw new Error('Interactive path worker returned a mismatched source signature.');
      }
      const accepted = this.onReady({
        signature: normalizedSignature,
        revision,
        context,
        result: message.result,
        workerDurationMs: message.durationMs,
        queueDurationMs:message.queueDurationMs,
        poolLatencyMs:message.totalDurationMs,
        payloadCloneMs:message.payloadCloneMs,
        dispatchCloneMs:message.dispatchCloneMs
      });
      if (this.pending === pending) this.pending = null;
      if (accepted !== false) {
        this.readySignature = normalizedSignature;
        this.lastReadyTiming={workerDurationMs:message.durationMs,queueDurationMs:message.queueDurationMs,totalDurationMs:message.totalDurationMs,payloadCloneMs:message.payloadCloneMs,dispatchCloneMs:message.dispatchCloneMs};
        this.failed = null;
      }
      return message.result;
    }).catch(error => {
      if (this.pending === pending) this.pending = null;
      if (!expectedCancellation(error)) {
        this.failed = { signature: normalizedSignature, at: performance.now(), message: error?.message || String(error) };
        this.onError(error, { signature: normalizedSignature, revision, context });
      }
      return null;
    });
    this.pending = pending;
    return pending.promise;
  }

  isReady(signature) {
    return this.readySignature === String(signature || '');
  }

  diagnostics() {
    return {
      schemaVersion: 1,
      key: this.key,
      revision: this.revision,
      readySignature: this.readySignature,
      lastReadyTiming:this.lastReadyTiming?{...this.lastReadyTiming}:null,
      pending: this.pending ? {
        signature: this.pending.signature,
        revision: this.pending.revision
      } : null,
      failed: this.failed ? { ...this.failed } : null
    };
  }

  close() {
    this.closed = true;
    if (this.pending) this.pool.cancel(this.key, this.pending.revision);
    this.pending = null;
  }
}
