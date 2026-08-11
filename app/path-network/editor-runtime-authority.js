const finiteRevision = value => Math.max(0, Math.floor(Number(value) || 0));

function rebuilding(message = 'Path geometry is rebuilding for the latest scene and network revision. Your edit was not applied; wait for the spline to finish updating, then try again.') {
  return { ready: false, reason: 'rebuilding', message, runtime: null };
}

export function assessCompiledPathEditAuthority({
  scene,
  pathObject,
  runtime,
  expectedSignature,
  generationDiagnostics
} = {}) {
  if (!scene?.id || !pathObject?.id || pathObject.type !== 'path') {
    return rebuilding('The active path is no longer available. Select the path again before editing it.');
  }

  const signature = String(expectedSignature || '');
  if (!signature || !generationDiagnostics) {
    return rebuilding('The path renderer has not published an exact compiled authority yet. Wait for the spline to finish updating, then try again.');
  }

  const pendingSignature = String(generationDiagnostics.pending?.signature || '');
  if (pendingSignature) return rebuilding();

  const failed = generationDiagnostics.failed;
  if (failed && String(failed.signature || '') === signature) {
    const detail = String(failed.message || 'unknown generation error');
    return {
      ready: false,
      reason: 'failed',
      message: `The latest path geometry could not be compiled (${detail}). Your edit was not applied; correct the path error and retry.`,
      runtime: null
    };
  }

  if (String(generationDiagnostics.readySignature || '') !== signature || !runtime) return rebuilding();

  const network = pathObject.properties?.pathNetwork;
  const networkId = String(network?.id || '');
  const networkRevision = finiteRevision(network?.revision);
  const exactRuntime = (
    String(runtime.pathObjectId || '') === String(pathObject.id)
    && String(runtime.sourceNetworkId || '') === networkId
    && finiteRevision(runtime.sourceRevision) === networkRevision
    && String(runtime.compiled?.sourceNetworkId || '') === networkId
    && finiteRevision(runtime.compiled?.sourceRevision) === networkRevision
    && String(runtime.diagnostics?.sourceNetworkId || '') === networkId
    && finiteRevision(runtime.diagnostics?.sourceRevision) === networkRevision
  );
  if (!networkId || !exactRuntime) return rebuilding();

  return {
    ready: true,
    reason: 'exact-active-authority',
    message: '',
    runtime
  };
}
