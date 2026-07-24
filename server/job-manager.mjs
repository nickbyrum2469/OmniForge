import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readState, mutateState, addActivity, DATA_FILE, ASSET_ROOT, RUNTIME_ROOT } from './state-store.mjs';
import { normalizeJob } from './provider-framework.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_CANDIDATES = [
  path.resolve(here, '../workers/local-worker.mjs'),
  process.resourcesPath ? path.resolve(process.resourcesPath, 'app/workers/local-worker.mjs') : null,
  path.resolve(process.cwd(), 'workers/local-worker.mjs')
].filter(Boolean);
const active = new Map();
let scheduling = false;
const now = () => new Date().toISOString();
const makeId = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function resolveWorkerFile() {
  return WORKER_CANDIDATES.find(candidate => fs.existsSync(candidate)) || null;
}

export function getWorkerDiagnostics() {
  const workerFile = resolveWorkerFile();
  return { ready: Boolean(workerFile), workerFile, candidates: WORKER_CANDIDATES };
}

function updateJob(jobId, updater) {
  return mutateState(state => {
    const job = (state.jobs || []).find(item => item.id === jobId);
    if (!job) throw new Error('Job not found.');
    updater(job, state);
    job.updatedAt = now();
    return job;
  }).result;
}

function activeLimit() {
  return Math.max(1, Math.min(8, Number(readState().settings?.integrations?.maxConcurrentJobs) || 2));
}

export function initializeJobManager() {
  mutateState(state => {
    state.jobs = Array.isArray(state.jobs) ? state.jobs : [];
    const diagnostics = getWorkerDiagnostics();
    state.runtimeDiagnostics = {
      ...(state.runtimeDiagnostics || {}),
      workers: { ...(state.runtimeDiagnostics?.workers || {}), local: { ...diagnostics, checkedAt: now() } }
    };
    if (!diagnostics.ready) {
      for (const provider of state.providers || []) {
        if ((provider.operations || []).some(operation => ['marketplace-download', 'asset-index', 'project-integrity', 'diagnostic-delay'].includes(operation))) {
          provider.status = {
            ...(provider.status || {}),
            state: 'failed',
            message: 'Required packaged worker is missing. Rebuild OmniForge with the workers directory included.',
            lastHealthCheck: now()
          };
        }
      }
    }
    for (const job of state.jobs) {
      if (['queued', 'running'].includes(job.state)) {
        job.state = 'interrupted';
        job.stage = 'Interrupted by application restart';
        job.completedAt = now();
        job.retryEligible = true;
        job.errors = [...(job.errors || []), 'The editor stopped before this job completed.'];
      }
    }
    return state.jobs;
  });
}

export function createJob(request = {}) {
  const diagnostics = getWorkerDiagnostics();
  if (!diagnostics.ready) {
    throw new Error('The OmniForge background worker is missing from this build. Rebuild the desktop application from the v0.10 source; MCP is not required.');
  }
  const providerId = String(request.providerId || 'local-worker-host');
  const operation = String(request.operation || 'diagnostic-delay');
  const { result } = mutateState(state => {
    const provider = (state.providers || []).find(item => item.id === providerId);
    if (!provider) throw new Error('Provider not found.');
    if (!provider.enabled) throw new Error(`${provider.displayName} is disabled.`);
    if (!provider.operations?.includes(operation) && providerId !== 'local-worker-host') throw new Error(`${provider.displayName} does not support ${operation}.`);
    const job = normalizeJob({
      id: makeId(),
      providerId,
      operation,
      title: request.title || `${provider.displayName}: ${operation}`,
      inputs: request.inputs || {},
      prompt: request.prompt || '',
      settings: request.settings || {},
      sourceJobId: request.sourceJobId || null,
      attempt: Number(request.attempt || 1),
      state: 'queued',
      stage: 'Queued',
      progress: 0,
      createdAt: now(),
      validation: { state: 'pending', warnings: [] }
    });
    state.jobs.unshift(job);
    addActivity(state, 'job', `Queued ${job.title}.`, { jobId: job.id, providerId, operation });
    return job;
  });
  setImmediate(schedule);
  return result;
}

export function cancelJob(jobId) {
  const processHandle = active.get(jobId);
  const result = updateJob(jobId, (job, state) => {
    if (['succeeded', 'failed', 'cancelled'].includes(job.state)) throw new Error('This job is already complete.');
    job.cancellationRequested = true;
    job.state = 'cancelled';
    job.stage = 'Cancelled';
    job.completedAt = now();
    job.retryEligible = true;
    job.logs = [...(job.logs || []), { time: now(), level: 'warning', message: 'Cancellation requested by user.' }].slice(-300);
    addActivity(state, 'job', `Cancelled ${job.title}.`, { jobId });
  });
  if (processHandle) {
    try {
      processHandle.kill('SIGTERM');
      setTimeout(() => { if (!processHandle.killed) processHandle.kill('SIGKILL'); }, 600).unref();
    } catch {}
  }
  setImmediate(schedule);
  return result;
}

export function retryJob(jobId) {
  const source = (readState().jobs || []).find(item => item.id === jobId);
  if (!source) throw new Error('Job not found.');
  if (!['failed', 'cancelled', 'interrupted'].includes(source.state)) throw new Error('Only failed, cancelled, or interrupted jobs can be retried.');
  return createJob({
    providerId: source.providerId,
    operation: source.operation,
    title: `Retry: ${source.title}`,
    inputs: source.inputs,
    prompt: source.prompt,
    settings: source.settings,
    sourceJobId: source.id,
    attempt: Number(source.attempt || 1) + 1
  });
}

export function clearCompletedJobs() {
  return mutateState(state => {
    const before = (state.jobs || []).length;
    state.jobs = (state.jobs || []).filter(job => !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(job.state));
    addActivity(state, 'job', `Cleared ${before - state.jobs.length} completed jobs.`);
    return state.jobs;
  }).result;
}

export function getJobs() {
  return readState().jobs || [];
}

function schedule() {
  if (scheduling) return;
  scheduling = true;
  try {
    while (active.size < activeLimit()) {
      const state = readState();
      const job = (state.jobs || []).find(item => item.state === 'queued' && !item.cancellationRequested);
      if (!job) break;
      runJob(job.id);
    }
  } finally {
    scheduling = false;
  }
}

function failUnavailableWorker(jobId) {
  updateJob(jobId, (job, state) => {
    job.state = 'failed';
    job.stage = 'Worker unavailable';
    job.completedAt = now();
    job.retryEligible = true;
    const message = 'The packaged background worker is missing. Rebuild OmniForge with the workers directory included; MCP is not required.';
    job.errors = [message];
    job.logs = [...(job.logs || []), { time: now(), level: 'error', message }].slice(-300);
    addActivity(state, 'job', `Failed ${job.title}: worker unavailable.`, { jobId, candidates: WORKER_CANDIDATES });
  });
}

function runJob(jobId) {
  const state = readState();
  const job = (state.jobs || []).find(item => item.id === jobId);
  if (!job || job.state !== 'queued') return;
  const provider = (state.providers || []).find(item => item.id === job.providerId);
  const workerFile = resolveWorkerFile();
  if (!workerFile) {
    failUnavailableWorker(jobId);
    setImmediate(schedule);
    return;
  }
  updateJob(jobId, (next, current) => {
    next.state = 'running';
    next.stage = 'Starting isolated worker';
    next.startedAt = now();
    next.progress = 0.01;
    next.logs = [...(next.logs || []), { time: now(), level: 'info', message: `Starting isolated worker process: ${workerFile}` }].slice(-300);
    addActivity(current, 'job', `Started ${next.title}.`, { jobId, workerFile });
  });
  const payload = {
    jobId,
    providerId: job.providerId,
    provider,
    operation: job.operation,
    inputs: job.inputs,
    prompt: job.prompt,
    settings: job.settings,
    stateFile: DATA_FILE,
    assetRoot: ASSET_ROOT,
    runtimeRoot: RUNTIME_ROOT,
    projectRoot: state.project.root
  };
  const requestFolder=path.join(RUNTIME_ROOT,'job-requests');
  fs.mkdirSync(requestFolder,{recursive:true});
  const requestFile=path.join(requestFolder,`${jobId}.json`);
  fs.writeFileSync(requestFile,JSON.stringify(payload),'utf8');
  const child = spawn(process.execPath, [workerFile, '--request-file', requestFile], {
    cwd: RUNTIME_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false
  });
  active.set(jobId, child);
  let stdout = '';
  let stderr = '';
  const consume = line => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { event = { type: 'log', level: 'info', message: line }; }
    try {
      if (event.type === 'progress') updateJob(jobId, current => {
        if (current.state === 'cancelled') return;
        current.stage = event.stage || current.stage;
        current.progress = Math.max(current.progress || 0, Math.min(1, Number(event.progress) || 0));
        if (event.message) current.logs = [...(current.logs || []), { time: event.time || now(), level: 'info', message: event.message }].slice(-300);
      });
      else if (event.type === 'log') updateJob(jobId, current => {
        current.logs = [...(current.logs || []), { time: event.time || now(), level: event.level || 'info', message: String(event.message || '') }].slice(-300);
      });
      else if (event.type === 'error') updateJob(jobId, current => {
        current.errors = [...(current.errors || []), String(event.message || 'Worker error')].slice(-100);
        current.logs = [...(current.logs || []), { time: event.time || now(), level: 'error', message: String(event.message || 'Worker error') }].slice(-300);
      });
      else if (event.type === 'result') finishJob(jobId, event.result || {});
    } catch {}
  };
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    const lines = stdout.split(/\r?\n/);
    stdout = lines.pop() || '';
    for (const line of lines) consume(line);
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', error => { stderr += `${error.stack||error.message}\n`; });
  child.on('exit', (code, signal) => {
    if (stdout.trim()) consume(stdout);
    active.delete(jobId);
    fs.rmSync(requestFile,{force:true});
    const current = (readState().jobs || []).find(item => item.id === jobId);
    if (current && !['succeeded', 'failed', 'cancelled'].includes(current.state)) {
      updateJob(jobId, (next, root) => {
        next.state = 'failed';
        next.stage = 'Worker failed';
        next.completedAt = now();
        next.elapsedMs = next.startedAt ? Date.now() - new Date(next.startedAt).getTime() : 0;
        next.retryEligible = true;
        next.errors = [...(next.errors || []), stderr.trim() || `Worker exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`].slice(-100);
        addActivity(root, 'job', `Failed ${next.title}.`, { jobId });
      });
    }
    setImmediate(schedule);
  });
}

function finishJob(jobId, result) {
  updateJob(jobId, (job, state) => {
    if (job.state === 'cancelled') return;
    job.state = result.errors?.length ? 'failed' : 'succeeded';
    job.stage = job.state === 'succeeded' ? 'Completed' : 'Completed with errors';
    job.progress = 1;
    job.completedAt = now();
    job.elapsedMs = job.startedAt ? Date.now() - new Date(job.startedAt).getTime() : 0;
    job.outputs = Array.isArray(result.outputs) ? result.outputs : [];
    job.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    job.errors = Array.isArray(result.errors) ? result.errors : [];
    job.validation = result.validation || { state: job.state === 'succeeded' ? 'passed' : 'failed', warnings: job.warnings, errors: job.errors };
    job.retryEligible = job.state !== 'succeeded';
    job.logs = [...(job.logs || []), { time: now(), level: job.state === 'succeeded' ? 'success' : 'error', message: job.state === 'succeeded' ? 'Job completed successfully.' : 'Job completed with errors.' }].slice(-300);
    if (job.operation === 'provider-health-check' && result.providerStatus) {
      const provider = (state.providers || []).find(item => item.id === job.providerId);
      if (provider) {
        provider.status = { ...provider.status, ...result.providerStatus, lastHealthCheck: now() };
        provider.updatedAt = now();
      }
    }
    addActivity(state, 'job', `${job.state === 'succeeded' ? 'Completed' : 'Failed'} ${job.title}.`, { jobId, validation: job.validation });
  });
}

export function shutdownJobs() {
  for (const [jobId, child] of active) {
    try { child.kill('SIGTERM'); } catch {}
    try {
      updateJob(jobId, job => {
        if (job.state === 'running') {
          job.state = 'interrupted';
          job.stage = 'Interrupted by shutdown';
          job.completedAt = now();
          job.retryEligible = true;
        }
      });
    } catch {}
  }
  active.clear();
}
