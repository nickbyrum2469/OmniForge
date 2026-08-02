const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = value => Math.max(0, Math.min(1, finite(value)));

export function compiledSegmentLinePositions(segment, lift = 0.12) {
  const positions = [];
  const samples = Array.isArray(segment?.samples) ? segment.samples : [];
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1]?.position;
    const end = samples[index]?.position;
    if (!start || !end) continue;
    positions.push(
      finite(start[0]), finite(start[1]) + lift, finite(start[2]),
      finite(end[0]), finite(end[1]) + lift, finite(end[2])
    );
  }
  return positions;
}

export function pathSegmentCostSeverity({
  compiledSegment,
  networkSegment,
  engineering,
  maximumTotalCost = 0
} = {}) {
  const maximumGrade = Math.max(0.01, finite(engineering?.maxGradePercent, 12));
  const gradeRatio = clamp01(finite(compiledSegment?.metrics?.maximumGradePercent) / maximumGrade);
  const breakdown = networkSegment?.costBreakdown?.breakdown || {};
  const total = finite(breakdown.total);
  const costRatio = maximumTotalCost > 0 ? clamp01(total / maximumTotalCost) : 0;
  const constructionPenalty = compiledSegment?.construction?.mode === 'invalid'
    ? 1
    : ['bridge', 'tunnel', 'retaining-wall'].includes(compiledSegment?.construction?.mode)
      ? 0.2
      : 0;
  return clamp01(Math.max(constructionPenalty, gradeRatio * 0.7 + costRatio * 0.3));
}

export function pathCostColor(severity) {
  const value = clamp01(severity);
  if (value <= 0.5) {
    const t = value / 0.5;
    return [0.1 + 0.85 * t, 0.9, 0.25 - 0.12 * t, 0.98];
  }
  const t = (value - 0.5) / 0.5;
  return [0.95, 0.9 - 0.72 * t, 0.13 - 0.05 * t, 0.98];
}

export function buildPathCostGuideData(runtime, options = {}) {
  const networkSegments = new Map((runtime?.network?.segments || []).map(segment => [segment.id, segment]));
  const totals = [...networkSegments.values()].map(segment => finite(segment.costBreakdown?.breakdown?.total));
  const maximumTotalCost = Math.max(0, ...totals);
  return (runtime?.compiled?.segments || []).map(compiledSegment => {
    const networkSegment = networkSegments.get(compiledSegment.id);
    const severity = pathSegmentCostSeverity({
      compiledSegment,
      networkSegment,
      engineering: runtime?.compiled?.engineering,
      maximumTotalCost
    });
    return {
      segmentId: compiledSegment.id,
      positions: compiledSegmentLinePositions(compiledSegment, finite(options.lift, 0.12)),
      severity,
      color: pathCostColor(severity),
      maximumGradePercent: finite(compiledSegment.metrics?.maximumGradePercent),
      constructionMode: compiledSegment.construction?.mode || 'conform',
      costBreakdown: networkSegment?.costBreakdown ? structuredClone(networkSegment.costBreakdown) : null
    };
  });
}

