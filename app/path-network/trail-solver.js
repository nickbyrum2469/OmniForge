import { normalizePathNetwork } from './model.js';
import { pathArchetype } from './archetypes.js';

const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const distance2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= value.priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }

  pop() {
    if (!this.items.length) return null;
    const result = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      let index = 0;
      while (true) {
        let child = index * 2 + 1;
        if (child >= this.items.length) break;
        if (child + 1 < this.items.length && this.items[child + 1].priority < this.items[child].priority) child += 1;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return result;
  }

  get size() {
    return this.items.length;
  }
}

function pointInRestriction(point, restrictions = []) {
  for (const restriction of restrictions) {
    if (typeof restriction === 'function' && restriction(point[0], point[1])) return true;
    if (restriction?.type === 'circle') {
      if (Math.hypot(point[0] - finite(restriction.x), point[1] - finite(restriction.z)) <= finite(restriction.radius)) {
        return true;
      }
    } else if (restriction) {
      const minX = Math.min(finite(restriction.minX), finite(restriction.maxX));
      const maxX = Math.max(finite(restriction.minX), finite(restriction.maxX));
      const minZ = Math.min(finite(restriction.minZ), finite(restriction.maxZ));
      const maxZ = Math.max(finite(restriction.minZ), finite(restriction.maxZ));
      if (point[0] >= minX && point[0] <= maxX && point[1] >= minZ && point[1] <= maxZ) return true;
    }
  }
  return false;
}

function distanceToPolyline(point, points) {
  let nearest = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const denominator = dx * dx + dz * dz;
    const t = denominator > EPSILON
      ? clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / denominator, 0, 1)
      : 0;
    nearest = Math.min(nearest, Math.hypot(
      point[0] - (start[0] + dx * t),
      point[1] - (start[1] + dz * t)
    ));
  }
  return nearest;
}

function evaluateSegment(start, end, context, options = {}) {
  const distance = distance2(start, end);
  const sampleSpacing = Math.max(0.5, Math.min(
    options.sampleSpacing ?? context.sampleSpacing,
    distance / 2
  ));
  const sampleCount = Math.max(2, Math.ceil(distance / sampleSpacing) + 1);
  const breakdown = {
    distance,
    grade: 0,
    crossSlope: 0,
    roughness: 0,
    earthwork: 0,
    scenic: 0,
    diversity: 0
  };
  let previous = null;
  let maximumGradePercent = 0;
  let maximumCrossSlopeDegrees = 0;
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const x = start[0] + (end[0] - start[0]) * t;
    const z = start[1] + (end[1] - start[1]) * t;
    if (pointInRestriction([x, z], context.restrictions)) {
      return { valid: false, reason: 'forbidden-region', samples, maximumGradePercent, breakdown };
    }
    const analysisKey = `${x.toFixed(3)}:${z.toFixed(3)}:${context.analysisLevel}`;
    let analysis = context.analysisCache.get(analysisKey);
    if (!analysis) {
      analysis = context.terrain.analysisAt(x, z, {
        view: 'authored-natural',
        level: context.analysisLevel
      });
      context.analysisCache.set(analysisKey, analysis);
    }
    const sample = { x, z, y: analysis.elevation, ...analysis };
    samples.push(sample);
    maximumCrossSlopeDegrees = Math.max(maximumCrossSlopeDegrees, analysis.slope);
    breakdown.crossSlope += Math.max(0, analysis.slope - context.profile.maximumCrossSlopeDegrees * 0.35) ** 2;
    breakdown.roughness += analysis.roughness ** 2;
    breakdown.earthwork += (1 - analysis.constructionSuitability) ** 2;
    breakdown.scenic += 1 - clamp(analysis.localRelief / 12, 0, 1);
    if (previous) {
      const horizontal = Math.max(EPSILON, Math.hypot(x - previous.x, z - previous.z));
      const gradePercent = Math.abs(sample.y - previous.y) / horizontal * 100;
      maximumGradePercent = Math.max(maximumGradePercent, gradePercent);
      const preferredRatio = gradePercent / Math.max(EPSILON, context.profile.preferredGradePercent);
      breakdown.grade += preferredRatio ** 4;
    }
    previous = sample;
  }
  if (maximumGradePercent > context.profile.maximumGradePercent + 1e-5) {
    return { valid: false, reason: 'maximum-grade', samples, maximumGradePercent, maximumCrossSlopeDegrees, breakdown };
  }
  if (maximumCrossSlopeDegrees > context.profile.maximumCrossSlopeDegrees + 8) {
    return { valid: false, reason: 'cross-slope', samples, maximumGradePercent, maximumCrossSlopeDegrees, breakdown };
  }
  const divisor = Math.max(1, sampleCount);
  breakdown.grade /= divisor;
  breakdown.crossSlope /= divisor * 100;
  breakdown.roughness /= divisor;
  breakdown.earthwork /= divisor;
  breakdown.scenic /= divisor;
  for (const prior of context.priorCandidates) {
    const midpoint = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5];
    const separation = distanceToPolyline(midpoint, prior.points);
    breakdown.diversity += 1 - smoothSeparation(separation, context.routeStep * 1.5, context.routeStep * 5);
  }
  const weights = context.weights;
  const total = (
    breakdown.distance * weights.distance
    + breakdown.grade * weights.grade
    + breakdown.crossSlope * weights.crossSlope
    + breakdown.roughness * weights.roughness
    + breakdown.earthwork * weights.earthwork
    + breakdown.scenic * weights.scenic
    + breakdown.diversity * context.diversityWeight * distance
  );
  return {
    valid: true,
    reason: 'valid',
    samples,
    maximumGradePercent,
    maximumCrossSlopeDegrees,
    breakdown: { ...breakdown, total },
    total
  };
}

function smoothSeparation(value, near, far) {
  const t = clamp((value - near) / Math.max(EPSILON, far - near), 0, 1);
  return t * t * (3 - 2 * t);
}

function reconstruct(states, key, end) {
  const points = [[...end]];
  let current = states.get(key);
  while (current) {
    points.push([current.x, current.z]);
    current = current.parent ? states.get(current.parent) : null;
  }
  return points.reverse();
}

function simplifyRoute(points, context) {
  if (points.length <= 2) return { points, segments: [] };
  const result = [points[0]];
  const segments = [];
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    let acceptedIndex = startIndex + 1;
    let acceptedEvaluation = null;
    for (let candidateIndex = points.length - 1; candidateIndex > startIndex; candidateIndex -= 1) {
      const evaluation = evaluateSegment(points[startIndex], points[candidateIndex], context);
      if (!evaluation.valid) continue;
      const directDistance = distance2(points[startIndex], points[candidateIndex]);
      const routeDistance = points.slice(startIndex, candidateIndex).reduce(
        (sum, point, index) => sum + distance2(point, points[startIndex + index + 1]),
        0
      );
      if (directDistance < routeDistance * 0.62 && candidateIndex > startIndex + 2) continue;
      acceptedIndex = candidateIndex;
      acceptedEvaluation = evaluation;
      break;
    }
    if (!acceptedEvaluation) acceptedEvaluation = evaluateSegment(points[startIndex], points[acceptedIndex], context);
    result.push(points[acceptedIndex]);
    segments.push(acceptedEvaluation);
    startIndex = acceptedIndex;
  }
  return { points: result, segments };
}

function solveCandidate(start, end, context) {
  const headingCount = context.headingCount;
  const directAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const initialHeading = ((Math.round(directAngle / (Math.PI * 2) * headingCount) % headingCount) + headingCount) % headingCount;
  const padding = Math.max(context.routeStep * 5, distance2(start, end) * context.detourFactor);
  const bounds = {
    minX: Math.min(start[0], end[0]) - padding,
    maxX: Math.max(start[0], end[0]) + padding,
    minZ: Math.min(start[1], end[1]) - padding,
    maxZ: Math.max(start[1], end[1]) + padding
  };
  const keyFor = (x, z, heading) => (
    `${Math.round(x / context.routeStep)}:${Math.round(z / context.routeStep)}:${heading}`
  );
  const startKey = keyFor(start[0], start[1], initialHeading);
  const states = new Map([[startKey, {
    key: startKey,
    x: start[0],
    z: start[1],
    heading: initialHeading,
    cost: 0,
    parent: null,
    evaluation: null
  }]]);
  const open = new MinHeap();
  open.push({ key: startKey, priority: distance2(start, end) });
  let expanded = 0;
  let rejectedByGrade = 0;
  let rejectedByRestriction = 0;
  let goalKey = null;

  while (open.size && expanded < context.maximumStates) {
    if (context.signal?.aborted) throw new Error('Trail solve cancelled.');
    const queued = open.pop();
    const state = states.get(queued.key);
    if (!state || queued.priority > state.priority + EPSILON) continue;
    expanded += 1;
    const goalEvaluation = distance2([state.x, state.z], end) <= context.routeStep * 1.75
      ? evaluateSegment(
          [state.x, state.z],
          end,
          context,
          { sampleSpacing: context.searchSampleSpacing }
        )
      : null;
    if (goalEvaluation?.valid) {
      goalKey = state.key;
      break;
    }
    for (const headingDelta of [-1, 0, 1]) {
      const heading = (state.heading + headingDelta + headingCount) % headingCount;
      const radians = heading / headingCount * Math.PI * 2;
      const next = [
        state.x + Math.cos(radians) * context.routeStep,
        state.z + Math.sin(radians) * context.routeStep
      ];
      if (next[0] < bounds.minX || next[0] > bounds.maxX || next[1] < bounds.minZ || next[1] > bounds.maxZ) continue;
      const evaluation = evaluateSegment(
        [state.x, state.z],
        next,
        context,
        { sampleSpacing: context.searchSampleSpacing }
      );
      if (!evaluation.valid) {
        if (evaluation.reason === 'maximum-grade') rejectedByGrade += 1;
        if (evaluation.reason === 'forbidden-region') rejectedByRestriction += 1;
        continue;
      }
      const turnRatio = Math.abs(headingDelta);
      const turnRadius = context.routeStep / Math.max(EPSILON, 2 * Math.sin(Math.max(EPSILON, Math.abs(headingDelta) * Math.PI / headingCount)));
      if (headingDelta && turnRadius < context.profile.minimumTurnRadius) continue;
      const cost = state.cost + evaluation.total + turnRatio ** 2 * context.turnWeight;
      const key = keyFor(next[0], next[1], heading);
      const previous = states.get(key);
      if (previous && previous.cost <= cost) continue;
      const heuristic = distance2(next, end) * context.weights.distance;
      const nextState = {
        key,
        x: next[0],
        z: next[1],
        heading,
        cost,
        parent: state.key,
        evaluation,
        priority: cost + heuristic
      };
      states.set(key, nextState);
      open.push({ key, priority: nextState.priority });
    }
  }
  if (!goalKey) {
    return {
      valid: false,
      reason: expanded >= context.maximumStates ? 'state-budget-exhausted' : 'no-feasible-route',
      diagnostics: { expanded, rejectedByGrade, rejectedByRestriction }
    };
  }
  const rawPoints = reconstruct(states, goalKey, end);
  const simplified = simplifyRoute(rawPoints, context);
  if (simplified.segments.some(segment => !segment.valid)) {
    return { valid: false, reason: 'simplification-revalidation-failed', diagnostics: { expanded } };
  }
  const totalCost = simplified.segments.reduce((sum, segment) => sum + segment.total, 0);
  return {
    valid: true,
    points: simplified.points,
    segments: simplified.segments,
    totalCost,
    diagnostics: {
      expanded,
      rejectedByGrade,
      rejectedByRestriction,
      rawPointCount: rawPoints.length,
      simplifiedPointCount: simplified.points.length,
      maximumGradePercent: Math.max(0, ...simplified.segments.map(segment => segment.maximumGradePercent))
    }
  };
}

function candidateWeights(profile, policy) {
  const weights = { ...profile.weights };
  if (policy === 'shortest') {
    weights.distance *= 1.45;
    weights.grade *= 0.72;
    weights.scenic = 0;
  } else if (policy === 'lowest-grade') {
    weights.grade *= 1.8;
    weights.crossSlope *= 1.25;
    weights.distance *= 0.85;
  } else if (policy === 'scenic') {
    weights.scenic *= 2.4;
    weights.distance *= 0.82;
  }
  return weights;
}

export function solveTerrainAwareTrails({
  terrain,
  start,
  end,
  archetype = 'human-footpath',
  restrictions = [],
  candidatePolicies = ['balanced', 'shortest', 'lowest-grade'],
  seed = 1,
  routeStep = 6,
  sampleSpacing = 1.5,
  headingCount = 16,
  maximumStates = 16000,
  detourFactor = 0.65,
  diversityWeight = 3,
  signal = null
} = {}) {
  if (!terrain?.analysisAt || !terrain?.elevationAt) throw new Error('A TerrainQueryService is required.');
  if (!Array.isArray(start) || !Array.isArray(end)) throw new Error('Trail start and end coordinates are required.');
  const profile = pathArchetype(archetype);
  if (profile.solverFamily !== 'trail') throw new Error(`${archetype} does not use the trail solver.`);
  const toHorizontalPoint = value => [
    finite(value[0]),
    finite(value.length >= 3 ? value[2] : value[1])
  ];
  const origin = toHorizontalPoint(start);
  const destination = toHorizontalPoint(end);
  if (distance2(origin, destination) < Math.max(1, routeStep)) throw new Error('Trail endpoints are too close together.');
  const candidates = [];
  const failures = [];
  for (let index = 0; index < candidatePolicies.length; index += 1) {
    const policy = candidatePolicies[index];
    const result = solveCandidate(origin, destination, {
      terrain,
      profile,
      restrictions,
      priorCandidates: candidates,
      weights: candidateWeights(profile, policy),
      routeStep: clamp(routeStep, 1, 100),
      sampleSpacing: clamp(sampleSpacing, 0.25, 25),
      searchSampleSpacing: Math.max(
        clamp(sampleSpacing, 0.25, 25),
        clamp(routeStep, 1, 100) * 0.5
      ),
      headingCount: Math.round(clamp(headingCount, 12, 72)),
      maximumStates: Math.round(clamp(maximumStates, 100, 250000)),
      detourFactor: clamp(detourFactor, 0.2, 3),
      diversityWeight: clamp(diversityWeight, 0, 50),
      turnWeight: profile.minimumTurnRadius * 0.25,
      analysisLevel: routeStep >= 16 ? 'regional' : routeStep >= 8 ? 'medium' : 'local',
      analysisCache: new Map(),
      signal
    });
    if (!result.valid) {
      failures.push({ policy, ...result });
      continue;
    }
    const duplicate = candidates.some(candidate => {
      const averageSeparation = result.points.reduce(
        (sum, point) => sum + distanceToPolyline(point, candidate.points),
        0
      ) / result.points.length;
      return averageSeparation < routeStep * 0.45;
    });
    if (duplicate && candidates.length) {
      failures.push({ policy, valid: false, reason: 'candidate-not-diverse', diagnostics: result.diagnostics });
      continue;
    }
    candidates.push({
      id: `trail-${seed}-${policy}-${candidates.length}`,
      policy,
      seed,
      archetype: profile.id,
      points: result.points,
      segmentCosts: result.segments.map((segment, segmentIndex) => ({
        segmentIndex,
        maximumGradePercent: segment.maximumGradePercent,
        maximumCrossSlopeDegrees: segment.maximumCrossSlopeDegrees,
        sampleCount: segment.samples.length,
        breakdown: segment.breakdown
      })),
      totalCost: result.totalCost,
      diagnostics: result.diagnostics
    });
  }
  return {
    schemaVersion: 1,
    terrainView: 'authored-natural',
    terrainRevision: terrain.describe().revisions.authoredNatural,
    archetype: profile,
    start: origin,
    end: destination,
    candidates,
    failures,
    diagnostics: {
      candidateCount: candidates.length,
      failureCount: failures.length,
      deterministicSeed: seed
    }
  };
}

export function trailCandidateToPathNetwork(candidate, options = {}) {
  if (!candidate?.points?.length || candidate.points.length < 2) throw new Error('A solved trail candidate is required.');
  const profile = pathArchetype(candidate.archetype);
  const id = String(options.id || candidate.id);
  const nodes = candidate.points.map((point, index) => ({
    id: `${id}:node:${index}`,
    position: [point[0], 0, point[1]],
    heightMode: 'terrain',
    heightOffset: 0,
    handleMode: 'automatic'
  }));
  return normalizePathNetwork({
    id,
    purpose: String(options.purpose || 'terrain-aware trail'),
    pathClass: profile.id,
    sourceRevisions: { terrain: finite(options.terrainRevision, 0) },
    generation: {
      solver: 'terrain-aware-trail-v1',
      seed: candidate.seed,
      policy: candidate.policy,
      totalCost: candidate.totalCost
    },
    nodes,
    segments: nodes.slice(0, -1).map((node, index) => ({
      id: `${id}:segment:${index}`,
      fromNode: node.id,
      toNode: nodes[index + 1].id,
      curveType: 'hermite',
      constructionMode: 'conform',
      constructionLocked: true,
      crossSectionProfile: {
        width: profile.width,
        shoulderWidth: Math.max(0.1, profile.width * 0.18),
        drainageEnabled: profile.drainageRequired,
        ditchDepth: profile.drainageRequired ? 0.08 : 0,
        blendDistance: Math.max(0.4, profile.width * 0.8)
      },
      gameplayRules: {
        vehicleClass: profile.trafficType,
        traversable: true,
        navigation: true,
        collider: true,
        speedLimitKph: profile.trafficType === 'pedestrian' ? 8 : 12
      },
      costBreakdown: candidate.segmentCosts[index] || null
    })),
    engineering: {
      maxGradePercent: profile.maximumGradePercent,
      minimumCurveRadius: profile.minimumTurnRadius,
      civilAssist: false
    }
  });
}
