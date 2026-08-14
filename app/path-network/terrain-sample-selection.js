const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function authorityText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

export function pathTerrainSampleCandidate(sample, runtime = {}) {
  return {
    sample,
    influence: finiteOr(sample?.influence, 0),
    lateralDistance: finiteOr(sample?.lateralDistance, Infinity),
    networkId: authorityText(runtime?.sourceNetworkId, runtime?.pathObjectId || '~'),
    pathObjectId: authorityText(runtime?.pathObjectId, '~'),
    segmentId: authorityText(sample?.segmentId, '~'),
    entryId: authorityText(sample?.entryId, '~')
  };
}

export function comparePathTerrainSampleCandidates(left, right) {
  if (left.influence !== right.influence) return right.influence - left.influence;
  if (left.lateralDistance !== right.lateralDistance) return left.lateralDistance - right.lateralDistance;
  for (const key of ['networkId', 'pathObjectId', 'segmentId', 'entryId']) {
    const order = left[key].localeCompare(right[key]);
    if (order !== 0) return order;
  }
  return 0;
}

export function selectPreferredPathTerrainSample(selected, sample, runtime = {}) {
  const candidate = pathTerrainSampleCandidate(sample, runtime);
  if (!selected || comparePathTerrainSampleCandidates(candidate, selected) < 0) return candidate;
  return selected;
}
