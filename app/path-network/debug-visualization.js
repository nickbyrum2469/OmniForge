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

function segmentPairPositions(samples, lift = 0.12) {
  const pairs = [];
  for (let index = 1; index < (samples?.length || 0); index += 1) {
    const start = samples[index - 1];
    const end = samples[index];
    if (!start?.position || !end?.position) continue;
    pairs.push({
      start,
      end,
      positions: [
        finite(start.position[0]), finite(start.position[1]) + lift, finite(start.position[2]),
        finite(end.position[0]), finite(end.position[1]) + lift, finite(end.position[2])
      ]
    });
  }
  return pairs;
}

function gradientColor(value) {
  const severity = clamp01(value);
  if (severity <= 0.5) {
    const t = severity * 2;
    return [0.08 + 0.85 * t, 0.9, 0.95 - 0.68 * t, 0.98];
  }
  const t = (severity - 0.5) * 2;
  return [0.93, 0.9 - 0.72 * t, 0.27 - 0.18 * t, 0.98];
}

const CONSTRUCTION_COLORS = Object.freeze({
  conform: [0.16, 0.92, 0.38, 0.98],
  'cut-fill': [0.95, 0.74, 0.15, 0.98],
  'retaining-wall': [0.96, 0.38, 0.16, 0.98],
  bridge: [0.18, 0.72, 1, 0.98],
  tunnel: [0.68, 0.35, 1, 0.98],
  stairs: [0.95, 0.42, 0.82, 0.98],
  invalid: [1, 0.08, 0.12, 1]
});

function constructionModeAt(segment, distance) {
  return (segment?.constructionIntervals || []).find(interval => (
    distance >= finite(interval.startDistance) - 1e-6
    && distance <= finite(interval.endDistance) + 1e-6
  ))?.mode || segment?.construction?.mode || 'invalid';
}

function guideEntry(segmentId, mode, pair, severity, metadata = {}) {
  return {
    segmentId,
    mode,
    positions: pair.positions,
    severity: clamp01(severity),
    color: metadata.color || gradientColor(severity),
    ...metadata
  };
}

/**
 * Build per-station authoring overlays from the exact compiled path authority.
 * These are view-only diagnostics: selecting one never mutates the saved Path
 * Network or requests a terrain rebuild.
 */
export function buildPathDiagnosticGuideData(runtime, mode = 'grade', options = {}) {
  const selectedMode = ['grade', 'curvature', 'cut-fill', 'construction'].includes(mode)
    ? mode
    : 'grade';
  const engineering = runtime?.compiled?.engineering || {};
  const lift = finite(options.lift, 0.16);
  const entries = [];
  for (const segment of runtime?.compiled?.segments || []) {
    const pairs = segmentPairPositions(segment.samples, lift);
    const maximumCurvature = Math.max(
      1e-5,
      ...pairs.flatMap(pair => [Math.abs(finite(pair.start.curvature)), Math.abs(finite(pair.end.curvature))])
    );
    for (const pair of pairs) {
      if (selectedMode === 'construction') {
        const distance = (finite(pair.start.distance) + finite(pair.end.distance)) * 0.5;
        const constructionMode = constructionModeAt(segment, distance);
        entries.push(guideEntry(segment.id, selectedMode, pair, constructionMode === 'invalid' ? 1 : 0, {
          constructionMode,
          color: CONSTRUCTION_COLORS[constructionMode] || CONSTRUCTION_COLORS.invalid
        }));
        continue;
      }
      if (selectedMode === 'curvature') {
        const curvature = Math.max(Math.abs(finite(pair.start.curvature)), Math.abs(finite(pair.end.curvature)));
        entries.push(guideEntry(segment.id, selectedMode, pair, curvature / maximumCurvature, { curvature }));
        continue;
      }
      if (selectedMode === 'cut-fill') {
        const startDelta = finite(pair.start.position?.[1]) - finite(pair.start.baseY, pair.start.position?.[1]);
        const endDelta = finite(pair.end.position?.[1]) - finite(pair.end.baseY, pair.end.position?.[1]);
        const delta = Math.abs(startDelta) >= Math.abs(endDelta) ? startDelta : endDelta;
        const limit = delta >= 0
          ? Math.max(0.01, finite(engineering.maxFillDepth, 2.5))
          : Math.max(0.01, finite(engineering.maxCutDepth, 6));
        const severity = Math.abs(delta) / limit;
        entries.push(guideEntry(segment.id, selectedMode, pair, severity, {
          terrainDelta: delta,
          color: delta >= 0
            ? [0.2 + 0.72 * clamp01(severity), 0.55, 1 - 0.65 * clamp01(severity), 0.98]
            : [1, 0.75 - 0.56 * clamp01(severity), 0.12, 0.98]
        }));
        continue;
      }
      const horizontal = Math.hypot(
        finite(pair.end.position?.[0]) - finite(pair.start.position?.[0]),
        finite(pair.end.position?.[2]) - finite(pair.start.position?.[2])
      );
      const gradePercent = horizontal > 1e-6
        ? Math.abs(finite(pair.end.position?.[1]) - finite(pair.start.position?.[1])) / horizontal * 100
        : Infinity;
      entries.push(guideEntry(
        segment.id,
        selectedMode,
        pair,
        gradePercent / Math.max(0.01, finite(engineering.maxGradePercent, 12)),
        { gradePercent }
      ));
    }
  }
  return entries;
}
