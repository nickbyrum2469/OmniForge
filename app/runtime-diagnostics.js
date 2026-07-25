const enabled = new URLSearchParams(location.search).get('diagnostics') === '1';

function timestamp() {
  return new Date().toISOString();
}

function serialize(detail) {
  try {
    return JSON.stringify(detail);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function log(type, detail = {}) {
  if (!enabled) return;
  console.info(`[OmniForge diagnostic] ${timestamp()} ${type} ${serialize(detail)}`);
}

function warn(type, detail = {}) {
  if (!enabled) return;
  console.warn(`[OmniForge diagnostic] ${timestamp()} ${type} ${serialize(detail)}`);
}

const diagnostics = {
  enabled,
  log,
  warn,
  begin(type, detail = {}, thresholdMs = 0) {
    if (!enabled) return () => {};
    const started = performance.now();
    return (result = {}) => {
      const durationMs = performance.now() - started;
      if (durationMs >= thresholdMs) log(type, { ...detail, ...result, durationMs: Number(durationMs.toFixed(3)) });
      return durationMs;
    };
  }
};

window.__omniforgeDiagnostics = Object.freeze(diagnostics);

if (enabled) {
  window.addEventListener('error', event => log('unhandled-error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack || ''
  }));
  window.addEventListener('unhandledrejection', event => log('unhandled-rejection', {
    reason: event.reason?.stack || String(event.reason)
  }));

  for (const type of ['pointerdown', 'click']) {
    document.addEventListener(type, event => {
      const top = document.elementFromPoint(event.clientX, event.clientY);
      log(`input-${type}`, {
        target: event.target?.id || event.target?.className || event.target?.tagName,
        topElement: top?.id || top?.className || top?.tagName,
        pointerLock: document.pointerLockElement?.id || null
      });
    }, true);
  }

  const canvas = document.getElementById('viewport');
  canvas?.addEventListener('webglcontextlost', event => log('webgl-context-lost', {
    statusMessage: event.statusMessage
  }));
  canvas?.addEventListener('webglcontextrestored', () => log('webgl-context-restored'));

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) log('long-task', {
            durationMs: Number(entry.duration.toFixed(3)),
            startTimeMs: Number(entry.startTime.toFixed(3))
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch (error) {
      log('long-task-observer-unavailable', { message: error.message });
    }
  }

  let expected = performance.now() + 100;
  window.setInterval(() => {
    const now = performance.now();
    const stallMs = now - expected;
    if (stallMs > 250) warn('event-loop-stall', {
      stallMs: Number(stallMs.toFixed(3))
    });
    expected = now + 100;
  }, 100);
  log('diagnostics-ready', { href: location.href });
}
