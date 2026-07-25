const clockNow = () => globalThis.performance?.now?.() ?? Date.now();

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
}

function serializableError(error) {
  return {
    name: String(error?.name || 'Error'),
    message: String(error?.message || error || 'Unknown render-pass failure'),
    stack: typeof error?.stack === 'string' ? error.stack : null
  };
}

class GpuPassTimer {
  constructor(gl, { sampleInterval = 30 } = {}) {
    this.gl = gl || null;
    this.extension = null;
    this.sampleInterval = Math.max(1, Number(sampleInterval) || 30);
    this.pending = [];
    this.latest = new Map();
    this.active = null;
    try {
      this.extension = this.gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') || null;
    } catch {
      this.extension = null;
    }
  }

  begin(label, frameIndex) {
    if (!this.extension || !this.gl || this.active || frameIndex % this.sampleInterval !== 0) return null;
    const query = this.gl.createQuery?.();
    if (!query) return null;
    try {
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
      const token = { label, query, frameIndex };
      this.active = token;
      return token;
    } catch {
      this.gl.deleteQuery?.(query);
      this.active = null;
      return null;
    }
  }

  end(token) {
    if (!token || token !== this.active || !this.extension || !this.gl) return;
    try {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.pending.push(token);
    } catch {
      this.gl.deleteQuery?.(token.query);
    } finally {
      this.active = null;
    }
  }

  poll() {
    if (!this.extension || !this.gl || !this.pending.length) return;
    let disjoint = false;
    try {
      disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    } catch {
      disjoint = true;
    }
    const remaining = [];
    for (const item of this.pending) {
      let available = false;
      try {
        available = Boolean(this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT_AVAILABLE));
      } catch {
        available = true;
        disjoint = true;
      }
      if (!available) {
        remaining.push(item);
        continue;
      }
      if (!disjoint) {
        try {
          const nanoseconds = Number(this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT));
          if (Number.isFinite(nanoseconds)) this.latest.set(item.label, nanoseconds / 1_000_000);
        } catch {
          // A missing GPU sample never invalidates the rendered frame.
        }
      }
      this.gl.deleteQuery?.(item.query);
    }
    this.pending = remaining;
  }

  value(label) {
    const value = this.latest.get(label);
    return Number.isFinite(value) ? value : null;
  }

  dispose() {
    if (!this.gl) return;
    if (this.active?.query) this.gl.deleteQuery?.(this.active.query);
    for (const item of this.pending) this.gl.deleteQuery?.(item.query);
    this.active = null;
    this.pending = [];
    this.latest.clear();
  }
}

export class RenderGraph {
  constructor({ gl = null, diagnostics = null, gpuSampleInterval = 30 } = {}) {
    this.gl = gl;
    this.diagnostics = diagnostics;
    this.passes = new Map();
    this.passOrder = [];
    this.compiledOrder = [];
    this.resources = new Map();
    this.importedResources = new Set();
    this.compileRevision = 0;
    this.frameIndex = 0;
    this.lastReport = null;
    this.suspendedReason = null;
    this.gpuTimer = new GpuPassTimer(gl, { sampleInterval: gpuSampleInterval });
  }

  importResource(name, value = null, descriptor = {}) {
    const key = String(name || '').trim();
    if (!key) throw new Error('RenderGraph resource names cannot be empty.');
    this.importedResources.add(key);
    this.resources.set(key, { name: key, value, descriptor: structuredClone(descriptor || {}), revision: 0, imported: true });
    return this;
  }

  setResource(name, value, descriptor = null) {
    const key = String(name || '').trim();
    if (!key) throw new Error('RenderGraph resource names cannot be empty.');
    const current = this.resources.get(key);
    this.resources.set(key, {
      name: key,
      value,
      descriptor: descriptor === null ? structuredClone(current?.descriptor || {}) : structuredClone(descriptor || {}),
      revision: Number(current?.revision || 0) + 1,
      imported: Boolean(current?.imported)
    });
    return value;
  }

  getResource(name) {
    return this.resources.get(String(name || ''))?.value;
  }

  addPass(spec = {}) {
    const name = String(spec.name || '').trim();
    if (!name) throw new Error('RenderGraph passes require a stable name.');
    if (this.passes.has(name)) throw new Error(`RenderGraph pass "${name}" already exists.`);
    if (typeof spec.execute !== 'function') throw new Error(`RenderGraph pass "${name}" requires an execute function.`);
    const pass = {
      name,
      after: uniqueStrings(spec.after),
      reads: uniqueStrings(spec.reads),
      writes: uniqueStrings(spec.writes),
      enabled: typeof spec.enabled === 'function' ? spec.enabled : () => spec.enabled !== false,
      execute: spec.execute,
      critical: spec.critical !== false,
      timing: spec.timing !== false,
      category: String(spec.category || 'render')
    };
    this.passes.set(name, pass);
    this.passOrder.push(name);
    this.compiledOrder = [];
    return this;
  }

  removePass(name) {
    const key = String(name || '');
    this.passes.delete(key);
    this.passOrder = this.passOrder.filter(item => item !== key);
    this.compiledOrder = [];
  }

  compile() {
    const visiting = new Set();
    const visited = new Set();
    const result = [];
    const visit = name => {
      if (visited.has(name)) return;
      if (visiting.has(name)) throw new Error(`RenderGraph dependency cycle includes "${name}".`);
      const pass = this.passes.get(name);
      if (!pass) throw new Error(`RenderGraph references missing pass "${name}".`);
      visiting.add(name);
      for (const dependency of pass.after) {
        if (!this.passes.has(dependency)) throw new Error(`RenderGraph pass "${name}" depends on missing pass "${dependency}".`);
        visit(dependency);
      }
      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };
    for (const name of this.passOrder) visit(name);

    const available = new Set(this.importedResources);
    for (const name of result) {
      const pass = this.passes.get(name);
      for (const resource of pass.reads) {
        if (!available.has(resource) && !pass.writes.includes(resource)) {
          throw new Error(`RenderGraph pass "${name}" reads "${resource}" before it is imported or written.`);
        }
      }
      for (const resource of pass.writes) available.add(resource);
    }
    this.compiledOrder = result;
    this.compileRevision += 1;
    return [...result];
  }

  suspend(reason = 'suspended') {
    this.suspendedReason = String(reason || 'suspended');
  }

  resume() {
    this.suspendedReason = null;
  }

  execute(context = {}) {
    this.frameIndex += 1;
    this.gpuTimer.poll();
    if (this.suspendedReason) {
      this.lastReport = {
        frameIndex: this.frameIndex,
        suspended: true,
        reason: this.suspendedReason,
        passes: [],
        totalCpuMs: 0,
        compileRevision: this.compileRevision
      };
      return this.lastReport;
    }
    if (!this.compiledOrder.length) this.compile();

    const report = {
      frameIndex: this.frameIndex,
      suspended: false,
      reason: null,
      passes: [],
      totalCpuMs: 0,
      compileRevision: this.compileRevision,
      resourceRevision: Number(context.resourceRevision || 0)
    };
    const frameStart = clockNow();
    const resourceApi = {
      get: name => this.getResource(name),
      set: (name, value, descriptor = null) => this.setResource(name, value, descriptor),
      describe: name => structuredClone(this.resources.get(String(name || ''))?.descriptor || {})
    };

    for (const name of this.compiledOrder) {
      const pass = this.passes.get(name);
      let enabled = false;
      try {
        enabled = Boolean(pass.enabled(context, resourceApi));
      } catch (error) {
        const entry = { name, category: pass.category, status: 'enable-error', cpuMs: 0, gpuMs: this.gpuTimer.value(name), error: serializableError(error) };
        report.passes.push(entry);
        if (pass.critical) throw error;
        continue;
      }
      if (!enabled) {
        report.passes.push({ name, category: pass.category, status: 'disabled', cpuMs: 0, gpuMs: this.gpuTimer.value(name), error: null });
        continue;
      }

      const start = clockNow();
      const gpuToken = pass.timing ? this.gpuTimer.begin(name, this.frameIndex) : null;
      let status = 'ok';
      let failure = null;
      try {
        pass.execute(context, resourceApi);
        for (const resource of pass.writes) {
          if (!this.resources.has(resource)) this.setResource(resource, null, { producer: name });
          else {
            const current = this.resources.get(resource);
            current.revision = Number(current.revision || 0) + 1;
            current.descriptor = { ...(current.descriptor || {}), producer: name };
          }
        }
      } catch (error) {
        status = 'error';
        failure = serializableError(error);
        this.diagnostics?.warn?.('render-pass-failed', { pass: name, ...failure });
        if (pass.critical) {
          this.gpuTimer.end(gpuToken);
          const cpuMs = clockNow() - start;
          report.passes.push({ name, category: pass.category, status, cpuMs, gpuMs: this.gpuTimer.value(name), error: failure });
          report.totalCpuMs = clockNow() - frameStart;
          this.lastReport = report;
          throw error;
        }
      } finally {
        this.gpuTimer.end(gpuToken);
      }
      report.passes.push({
        name,
        category: pass.category,
        status,
        cpuMs: pass.timing ? clockNow() - start : 0,
        gpuMs: this.gpuTimer.value(name),
        error: failure
      });
    }

    report.totalCpuMs = clockNow() - frameStart;
    this.lastReport = report;
    return report;
  }

  diagnosticsSnapshot() {
    return {
      frameIndex: this.frameIndex,
      compileRevision: this.compileRevision,
      order: [...this.compiledOrder],
      suspendedReason: this.suspendedReason,
      resources: [...this.resources.values()].map(resource => ({
        name: resource.name,
        revision: resource.revision,
        imported: resource.imported,
        descriptor: structuredClone(resource.descriptor || {})
      })),
      lastReport: this.lastReport ? structuredClone(this.lastReport) : null
    };
  }

  dispose() {
    this.gpuTimer.dispose();
    this.passes.clear();
    this.passOrder = [];
    this.compiledOrder = [];
    this.resources.clear();
    this.importedResources.clear();
  }
}
