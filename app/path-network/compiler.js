import {
  PATH_CONSTRUCTION_MODES,
  normalizePathNetwork,
  pathNetworkNodeMap,
  validatePathNetwork
} from './model.js';

const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (value, amount) => [value[0] * amount, value[1] * amount, value[2] * amount];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length3 = value => Math.hypot(value[0], value[1], value[2]);
const distance3 = (a, b) => length3(sub3(a, b));
const normalize3 = (value, fallback = [0, 0, 1]) => {
  const length = length3(value);
  return length > EPSILON ? scale3(value, 1 / length) : [...fallback];
};
const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

function nodePosition(node, terrainHeightAt) {
  const [x, storedY, z] = node.position;
  if (node.heightMode === 'absolute') return [x, storedY, z];
  const terrainY = typeof terrainHeightAt === 'function' ? finite(terrainHeightAt(x, z), storedY) : storedY;
  return [x, terrainY + (node.heightMode === 'offset' ? node.heightOffset : 0), z];
}

function adjacencyFor(network) {
  const adjacency = new Map(network.nodes.map(node => [node.id, []]));
  for (const segment of network.segments) {
    adjacency.get(segment.fromNode)?.push({ segmentId: segment.id, nodeId: segment.toNode });
    adjacency.get(segment.toNode)?.push({ segmentId: segment.id, nodeId: segment.fromNode });
  }
  return adjacency;
}

function automaticTangent(nodeId, otherId, isStart, positions, adjacency, distance, tension) {
  const node = positions.get(nodeId);
  const other = positions.get(otherId);
  const connected = (adjacency.get(nodeId) || []).filter(item => item.nodeId !== otherId);
  // Hermite endpoint tangents are derivatives in the segment's from -> to
  // direction. A degree-one end node therefore needs node - other, while a
  // degree-one start node needs other - node. Reusing other - node at both
  // ends points the final derivative backwards, makes the curve overshoot its
  // authored endpoint, and folds wide road/earthwork sweeps over themselves.
  let vector = isStart ? sub3(other, node) : sub3(node, other);
  if (connected.length === 1) {
    const neighbor = positions.get(connected[0].nodeId);
    vector = isStart ? sub3(other, neighbor) : sub3(neighbor, other);
  }
  const chordDirection = isStart ? sub3(other, node) : sub3(node, other);
  const direction = normalize3(vector, normalize3(chordDirection));
  return scale3(direction, distance * clamp(1 - tension * 0.72, 0.12, 1));
}

function segmentTangents(segment, fromNode, toNode, positions, adjacency, tension) {
  const start = positions.get(fromNode.id);
  const end = positions.get(toNode.id);
  const distance = Math.max(EPSILON, distance3(start, end));
  const startTangent = fromNode.handleMode !== 'automatic' && fromNode.outgoingHandle
    ? scale3(fromNode.outgoingHandle, 3)
    : automaticTangent(fromNode.id, toNode.id, true, positions, adjacency, distance, tension);
  const endTangent = toNode.handleMode !== 'automatic' && toNode.incomingHandle
    ? scale3(toNode.incomingHandle, -3)
    : automaticTangent(toNode.id, fromNode.id, false, positions, adjacency, distance, tension);
  return { startTangent, endTangent };
}

function hermitePoint(start, end, startTangent, endTangent, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [
    h00 * start[0] + h10 * startTangent[0] + h01 * end[0] + h11 * endTangent[0],
    h00 * start[1] + h10 * startTangent[1] + h01 * end[1] + h11 * endTangent[1],
    h00 * start[2] + h10 * startTangent[2] + h01 * end[2] + h11 * endTangent[2]
  ];
}

function hermiteDerivative(start, end, startTangent, endTangent, t) {
  const t2 = t * t;
  const h00 = 6 * t2 - 6 * t;
  const h10 = 3 * t2 - 4 * t + 1;
  const h01 = -6 * t2 + 6 * t;
  const h11 = 3 * t2 - 2 * t;
  return [
    h00 * start[0] + h10 * startTangent[0] + h01 * end[0] + h11 * endTangent[0],
    h00 * start[1] + h10 * startTangent[1] + h01 * end[1] + h11 * endTangent[1],
    h00 * start[2] + h10 * startTangent[2] + h01 * end[2] + h11 * endTangent[2]
  ];
}

function distancePointToLine(point, start, end) {
  const line = sub3(end, start);
  const denominator = dot3(line, line);
  if (denominator <= EPSILON) return distance3(point, start);
  const t = clamp(dot3(sub3(point, start), line) / denominator, 0, 1);
  return distance3(point, add3(start, scale3(line, t)));
}

function adaptiveCurveSamples(evaluate, options) {
  const result = [{ t: 0, position: evaluate(0) }];
  const maximumDepth = Math.max(4, Math.min(14, Math.floor(options.maximumDepth || 11)));
  const tolerance = Math.max(0.002, finite(options.tolerance, 0.05));
  const minimumStep = Math.max(1e-5, finite(options.minimumParameterStep, 1 / 4096));

  function subdivide(t0, p0, t1, p1, depth) {
    const midpointT = (t0 + t1) * 0.5;
    const midpoint = evaluate(midpointT);
    const error = distancePointToLine(midpoint, p0, p1);
    const chord = Math.max(EPSILON, distance3(p0, p1));
    const a = normalize3(sub3(midpoint, p0));
    const b = normalize3(sub3(p1, midpoint));
    const bend = Math.acos(clamp(dot3(a, b), -1, 1));
    if (
      depth < maximumDepth
      && t1 - t0 > minimumStep
      && (error > tolerance || bend > options.maximumAngleRadians || chord > options.maximumChord)
    ) {
      subdivide(t0, p0, midpointT, midpoint, depth + 1);
      subdivide(midpointT, midpoint, t1, p1, depth + 1);
      return;
    }
    result.push({ t: t1, position: p1 });
  }

  subdivide(0, result[0].position, 1, evaluate(1), 0);
  return result;
}

function arcLengthResample(raw, spacing) {
  if (raw.length < 2) return raw.map(sample => ({ ...sample, distance: 0 }));
  const cumulative = [0];
  for (let index = 1; index < raw.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance3(raw[index - 1].position, raw[index].position));
  }
  const total = cumulative.at(-1);
  const step = Math.max(0.05, spacing);
  const count = Math.max(1, Math.ceil(total / step));
  const output = [];
  let rawIndex = 1;
  for (let index = 0; index <= count; index += 1) {
    const target = index === count ? total : total * index / count;
    while (rawIndex < cumulative.length - 1 && cumulative[rawIndex] < target) rawIndex += 1;
    const previousIndex = Math.max(0, rawIndex - 1);
    const interval = Math.max(EPSILON, cumulative[rawIndex] - cumulative[previousIndex]);
    const local = clamp((target - cumulative[previousIndex]) / interval, 0, 1);
    output.push({
      t: raw[previousIndex].t + (raw[rawIndex].t - raw[previousIndex].t) * local,
      position: lerp3(raw[previousIndex].position, raw[rawIndex].position, local),
      distance: target
    });
  }
  return output;
}

function profileTerrainData(samples, terrainHeightAt, terrainNormalAt) {
  return samples.map(sample => {
    const [x, y, z] = sample.position;
    const terrainY = typeof terrainHeightAt === 'function' ? finite(terrainHeightAt(x, z), y) : y;
    const terrainNormal = typeof terrainNormalAt === 'function'
      ? normalize3(terrainNormalAt(x, z), [0, 1, 0])
      : [0, 1, 0];
    return { ...sample, baseY: terrainY, terrainNormal };
  });
}

function enforceVerticalLimits(samples, engineering, endpoints) {
  if (samples.length < 2) return { samples, feasible: true, maximumGradePercent: 0 };
  const maximumGrade = engineering.maxGradePercent / 100;
  const startY = endpoints.start[1];
  const endY = endpoints.end[1];
  const totalHorizontal = samples.slice(1).reduce((sum, sample, index) => {
    const previous = samples[index];
    return sum + Math.hypot(sample.position[0] - previous.position[0], sample.position[2] - previous.position[2]);
  }, 0);
  const unavoidableGrade = totalHorizontal > EPSILON ? Math.abs(endY - startY) / totalHorizontal : Infinity;
  const feasible = unavoidableGrade <= maximumGrade + 1e-5;

  let horizontalDistance = 0;
  const cumulative = [0];
  for (let index = 1; index < samples.length; index += 1) {
    horizontalDistance += Math.hypot(
      samples[index].position[0] - samples[index - 1].position[0],
      samples[index].position[2] - samples[index - 1].position[2]
    );
    cumulative.push(horizontalDistance);
  }

  for (let index = 0; index < samples.length; index += 1) {
    const fraction = horizontalDistance > EPSILON ? cumulative[index] / horizontalDistance : 0;
    const anchorLine = startY + (endY - startY) * fraction;
    // Terrain-mode nodes author a corridor on the terrain, not a chord suspended
    // between two terrain samples. The old solver preferred the Hermite curve's
    // interpolated Y for every interior station. A harmless valley between two
    // terrain nodes therefore looked like several metres of required fill and
    // Civil Assist promoted an ordinary dirt path into a bridge with piers.
    //
    // Absolute/offset endpoints still retain the authored curve as their
    // vertical authority, which is how an intentionally raised crossing is
    // represented. Terrain endpoints instead prefer the natural sampled
    // profile and the grade passes below make only the bounded adjustments
    // required to keep the route traversable.
    const preferred = endpoints.preferTerrain
      ? samples[index].baseY
      : samples[index].position[1];
    // An infeasible endpoint pair has no profile that can satisfy both hard
    // anchors and the configured grade. Keep its diagnostic guide monotone and
    // honest instead of clamping the interior and creating a fake cliff beside
    // a re-snapped endpoint.
    const smooth = feasible
      ? (
          endpoints.preferTerrain
            ? preferred
            : anchorLine + (preferred - anchorLine) * Math.sin(Math.PI * fraction) * 0.35
        )
      : anchorLine;
    samples[index].position[1] = index === 0 ? startY : index === samples.length - 1 ? endY : smooth;
  }

  for (let pass = 0; feasible && pass < 4; pass += 1) {
    for (let index = 1; index < samples.length; index += 1) {
      const horizontal = Math.max(EPSILON, cumulative[index] - cumulative[index - 1]);
      const limit = horizontal * maximumGrade;
      samples[index].position[1] = clamp(
        samples[index].position[1],
        samples[index - 1].position[1] - limit,
        samples[index - 1].position[1] + limit
      );
    }
    samples[samples.length - 1].position[1] = endY;
    for (let index = samples.length - 2; index >= 0; index -= 1) {
      const horizontal = Math.max(EPSILON, cumulative[index + 1] - cumulative[index]);
      const limit = horizontal * maximumGrade;
      samples[index].position[1] = clamp(
        samples[index].position[1],
        samples[index + 1].position[1] - limit,
        samples[index + 1].position[1] + limit
      );
    }
    samples[0].position[1] = startY;
  }

  let maximumGradePercent = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const horizontal = Math.max(EPSILON, cumulative[index] - cumulative[index - 1]);
    maximumGradePercent = Math.max(
      maximumGradePercent,
      Math.abs(samples[index].position[1] - samples[index - 1].position[1]) / horizontal * 100
    );
  }
  return { samples, feasible, unavoidableGradePercent: unavoidableGrade * 100, maximumGradePercent };
}

function assignParallelTransportFrames(samples) {
  let previousSide = null;
  for (let index = 0; index < samples.length; index += 1) {
    const previous = samples[Math.max(0, index - 1)].position;
    const next = samples[Math.min(samples.length - 1, index + 1)].position;
    const tangent = normalize3(sub3(next, previous), [0, 0, 1]);
    let side = normalize3(cross3([0, 1, 0], tangent), previousSide || [1, 0, 0]);
    if (previousSide && dot3(side, previousSide) < 0) side = scale3(side, -1);
    const normal = normalize3(cross3(tangent, side), [0, 1, 0]);
    samples[index].tangent = tangent;
    samples[index].side = side;
    samples[index].normal = normal;
    previousSide = side;
  }
  return samples;
}

function sampleMetrics(samples) {
  let maximumCut = 0;
  let maximumFill = 0;
  let maximumTerrainSlopeDegrees = 0;
  let maximumGradePercent = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    maximumCut = Math.max(maximumCut, sample.baseY - sample.position[1]);
    maximumFill = Math.max(maximumFill, sample.position[1] - sample.baseY);
    maximumTerrainSlopeDegrees = Math.max(
      maximumTerrainSlopeDegrees,
      Math.acos(clamp(sample.terrainNormal[1], -1, 1)) * 180 / Math.PI
    );
    if (index > 0) {
      const previous = samples[index - 1];
      const horizontal = Math.max(EPSILON, Math.hypot(
        sample.position[0] - previous.position[0],
        sample.position[2] - previous.position[2]
      ));
      maximumGradePercent = Math.max(maximumGradePercent, Math.abs(sample.position[1] - previous.position[1]) / horizontal * 100);
    }
  }
  return { maximumCut, maximumFill, maximumTerrainSlopeDegrees, maximumGradePercent };
}

function civilAssistMode(segment, metrics, engineering) {
  if (segment.constructionLocked && segment.constructionMode !== 'auto') {
    return { mode: segment.constructionMode, reason: 'user-locked', automatic: false };
  }
  if (segment.constructionMode !== 'auto') {
    return { mode: segment.constructionMode, reason: 'user-selected', automatic: false };
  }
  if (!engineering.civilAssist) return { mode: 'conform', reason: 'civil-assist-disabled', automatic: false };
  const pedestrian = segment.gameplayRules.vehicleClass === 'pedestrian';
  if (metrics.maximumGradePercent > engineering.maxGradePercent + 0.05) {
    if (pedestrian) return { mode: 'stairs', reason: 'grade-exceeds-pedestrian-limit', automatic: true };
    return { mode: 'invalid', reason: 'unavoidable-grade-exceeds-limit', automatic: true };
  }
  if (metrics.maximumCut > engineering.tunnelThreshold) {
    return { mode: 'tunnel', reason: 'cut-depth-exceeds-tunnel-threshold', automatic: true };
  }
  if (metrics.maximumFill > engineering.bridgeThreshold) {
    return { mode: 'bridge', reason: 'fill-depth-exceeds-bridge-threshold', automatic: true };
  }
  if (
    metrics.maximumTerrainSlopeDegrees > 38
    || Math.max(metrics.maximumCut, metrics.maximumFill) > engineering.retainingWallThreshold
  ) {
    return { mode: 'retaining-wall', reason: 'side-slope-requires-structure', automatic: true };
  }
  const profile = segment.crossSectionProfile || {};
  const surfaceTolerance = Math.max(
    0.25,
    Math.min(0.75, (
      finite(profile.shoulderDrop, 0.08)
      + (profile.drainageEnabled === false ? 0 : finite(profile.ditchDepth, 0.2))
    ) * 1.25)
  );
  if (metrics.maximumCut > surfaceTolerance || metrics.maximumFill > surfaceTolerance) {
    return { mode: 'cut-fill', reason: 'vertical-profile-requires-earthwork', automatic: true };
  }
  return { mode: 'conform', reason: 'terrain-and-grade-within-limits', automatic: true };
}

function mergeConstructionIntervals(intervals) {
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (
      previous
      && previous.mode === interval.mode
      && previous.reason === interval.reason
      && previous.automatic === interval.automatic
      && previous.endSampleIndex === interval.startSampleIndex
    ) {
      previous.endDistance = interval.endDistance;
      previous.endSampleIndex = interval.endSampleIndex;
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

function constructionIntervalsFor(segment, samples, engineering, overallMetrics) {
  const wholeSegment = construction => [{
    segmentId: segment.id,
    startDistance: 0,
    endDistance: overallMetrics.length,
    startSampleIndex: 0,
    endSampleIndex: Math.max(0, samples.length - 1),
    ...construction
  }];
  const selected = civilAssistMode(segment, overallMetrics, engineering);
  if (
    segment.constructionLocked
    || segment.constructionMode !== 'auto'
    || !engineering.civilAssist
    || selected.mode === 'invalid'
    || samples.length < 2
  ) return wholeSegment(selected);

  const intervals = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const start = samples[index];
    const end = samples[index + 1];
    const horizontal = Math.max(EPSILON, Math.hypot(
      end.position[0] - start.position[0],
      end.position[2] - start.position[2]
    ));
    const metrics = {
      length: end.distance - start.distance,
      maximumCut: Math.max(start.baseY - start.position[1], end.baseY - end.position[1], 0),
      maximumFill: Math.max(start.position[1] - start.baseY, end.position[1] - end.baseY, 0),
      maximumTerrainSlopeDegrees: Math.max(
        Math.acos(clamp(start.terrainNormal[1], -1, 1)) * 180 / Math.PI,
        Math.acos(clamp(end.terrainNormal[1], -1, 1)) * 180 / Math.PI
      ),
      maximumGradePercent: Math.abs(end.position[1] - start.position[1]) / horizontal * 100
    };
    intervals.push({
      segmentId: segment.id,
      startDistance: start.distance,
      endDistance: end.distance,
      startSampleIndex: index,
      endSampleIndex: index + 1,
      ...civilAssistMode(segment, metrics, engineering)
    });
  }

  const merged = mergeConstructionIntervals(intervals);
  const minimumBridgeLength = Math.max(3, finite(segment.crossSectionProfile?.width, 3));
  for (const interval of merged) {
    const length = interval.endDistance - interval.startDistance;
    if (interval.mode === 'bridge' && length < minimumBridgeLength) {
      interval.mode = 'cut-fill';
      interval.reason = 'short-gap-resolved-with-earthwork';
    } else if (interval.mode === 'bridge' && length > engineering.maximumBridgeSpan) {
      interval.mode = 'invalid';
      interval.reason = 'bridge-run-exceeds-maximum-span';
    }
  }
  return mergeConstructionIntervals(merged);
}

function representativeConstruction(intervals) {
  const priority = new Map([
    ['invalid', 7],
    ['tunnel', 6],
    ['bridge', 5],
    ['retaining-wall', 4],
    ['stairs', 3],
    ['cut-fill', 2],
    ['conform', 1]
  ]);
  return intervals.reduce((selected, interval) => (
    !selected || (priority.get(interval.mode) || 0) > (priority.get(selected.mode) || 0)
      ? interval
      : selected
  ), null) || { mode: 'conform', reason: 'terrain-and-grade-within-limits', automatic: true };
}

function harmonizeTwoArmFrames(network, compiledSegments) {
  const endpoints = new Map(network.nodes.map(node => [node.id, []]));
  for (const segment of compiledSegments) {
    if (!segment.samples.length) continue;
    endpoints.get(segment.fromNode)?.push({
      segmentId: segment.id,
      sample: segment.samples[0]
    });
    endpoints.get(segment.toNode)?.push({
      segmentId: segment.id,
      sample: segment.samples.at(-1)
    });
  }

  let connectionCount = 0;
  for (const entries of endpoints.values()) {
    if (entries.length !== 2) continue;
    const first = entries[0].sample;
    const second = entries[1].sample;
    const alignedSecondSide = dot3(first.side, second.side) < 0
      ? scale3(second.side, -1)
      : second.side;
    const sharedSide = normalize3(add3(first.side, alignedSecondSide), first.side);
    const alignedSecondNormal = dot3(first.normal, second.normal) < 0
      ? scale3(second.normal, -1)
      : second.normal;
    let sharedNormal = normalize3(add3(first.normal, alignedSecondNormal), [0, 1, 0]);
    if (sharedNormal[1] < 0) sharedNormal = scale3(sharedNormal, -1);
    first.side = [...sharedSide];
    second.side = [...sharedSide];
    first.normal = [...sharedNormal];
    second.normal = [...sharedNormal];
    connectionCount += 1;
  }
  return connectionCount;
}

function curvatureAt(samples, index) {
  if (index <= 0 || index >= samples.length - 1) return 0;
  const a = normalize3(sub3(samples[index].position, samples[index - 1].position));
  const b = normalize3(sub3(samples[index + 1].position, samples[index].position));
  const angle = Math.acos(clamp(dot3(a, b), -1, 1));
  const distance = Math.max(EPSILON, (
    distance3(samples[index].position, samples[index - 1].position)
    + distance3(samples[index + 1].position, samples[index].position)
  ) * 0.5);
  const direction = Math.sign(dot3(cross3(a, b), [0, 1, 0])) || 1;
  return angle / distance * direction;
}

function compileSegment(segment, network, positions, adjacency, nodeMap, options) {
  const fromNode = nodeMap.get(segment.fromNode);
  const toNode = nodeMap.get(segment.toNode);
  const start = positions.get(fromNode.id);
  const end = positions.get(toNode.id);
  const tension = clamp(options.tension ?? 0.5, 0, 1);
  const { startTangent, endTangent } = segmentTangents(segment, fromNode, toNode, positions, adjacency, tension);
  const evaluate = segment.curveType === 'linear'
    ? t => lerp3(start, end, t)
    : t => hermitePoint(start, end, startTangent, endTangent, t);
  const derivative = segment.curveType === 'linear'
    ? () => sub3(end, start)
    : t => hermiteDerivative(start, end, startTangent, endTangent, t);
  const width = segment.crossSectionProfile.width;
  const spacing = clamp(options.spacing ?? Math.min(0.75, width * 0.18), 0.05, 10);
  const raw = adaptiveCurveSamples(evaluate, {
    tolerance: Math.min(width * 0.01, options.tolerance ?? 0.04),
    maximumAngleRadians: clamp(options.maximumAngleDegrees ?? 4, 0.25, 45) * Math.PI / 180,
    maximumChord: Math.max(spacing * 2, width * 0.35),
    maximumDepth: options.maximumDepth
  });
  let samples = profileTerrainData(arcLengthResample(raw, spacing), options.terrainHeightAt, options.terrainNormalAt);
  const vertical = enforceVerticalLimits(samples, network.engineering, {
    start,
    end,
    preferTerrain: fromNode.heightMode === 'terrain' && toNode.heightMode === 'terrain'
  });
  samples = assignParallelTransportFrames(vertical.samples);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index].segmentId = segment.id;
    samples[index].curveTangent = normalize3(derivative(samples[index].t), samples[index].tangent);
    samples[index].curvature = curvatureAt(samples, index);
  }
  const metrics = {
    ...sampleMetrics(samples),
    length: samples.at(-1)?.distance || 0,
    unavoidableGradePercent: vertical.unavoidableGradePercent,
    profileFeasible: vertical.feasible
  };
  const constructionIntervals = constructionIntervalsFor(segment, samples, network.engineering, metrics);
  const construction = representativeConstruction(constructionIntervals);
  return {
    id: segment.id,
    fromNode: segment.fromNode,
    toNode: segment.toNode,
    samples,
    metrics,
    construction: {
      mode: construction.mode,
      reason: construction.reason,
      automatic: construction.automatic
    },
    constructionIntervals,
    crossSectionProfile: segment.crossSectionProfile,
    materialProfile: segment.materialProfile,
    gameplayRules: segment.gameplayRules
  };
}

function junctionsFor(network, compiledSegments) {
  const armsByNode = new Map(network.nodes.map(node => [node.id, []]));
  for (const segment of compiledSegments) {
    const first = segment.samples[0];
    const last = segment.samples.at(-1);
    if (segment.samples.length > 1) {
      armsByNode.get(segment.fromNode)?.push({
        segmentId: segment.id,
        direction: normalize3(sub3(segment.samples[1].position, first.position)),
        width: segment.crossSectionProfile.width,
        endpoint: 'from'
      });
      armsByNode.get(segment.toNode)?.push({
        segmentId: segment.id,
        direction: normalize3(sub3(segment.samples.at(-2).position, last.position)),
        width: segment.crossSectionProfile.width,
        endpoint: 'to'
      });
    }
  }
  const positions = new Map(network.nodes.map(node => [node.id, node.position]));
  return [...armsByNode.entries()]
    .filter(([, arms]) => arms.length > 2)
    .map(([nodeId, arms]) => ({
      nodeId,
      position: positions.get(nodeId),
      arms: arms.sort((a, b) => Math.atan2(a.direction[2], a.direction[0]) - Math.atan2(b.direction[2], b.direction[0]))
    }));
}

export function compilePathNetwork(input, options = {}) {
  const network = normalizePathNetwork(input, { pathId: input?.id });
  const validation = validatePathNetwork(network);
  if (!validation.valid) throw new Error(`Cannot compile invalid path network: ${validation.errors.join(' ')}`);
  const nodeMap = pathNetworkNodeMap(network);
  const positions = new Map(network.nodes.map(node => [node.id, nodePosition(node, options.terrainHeightAt)]));
  const adjacency = adjacencyFor(network);
  const segments = network.segments.map(segment => compileSegment(
    segment,
    network,
    positions,
    adjacency,
    nodeMap,
    options
  ));
  const twoArmConnectionCount = harmonizeTwoArmFrames(network, segments);
  const stations = [];
  let networkDistance = 0;
  for (const segment of segments) {
    for (let index = 0; index < segment.samples.length; index += 1) {
      if (index > 0) networkDistance += distance3(segment.samples[index - 1].position, segment.samples[index].position);
      stations.push({ ...segment.samples[index], networkDistance });
    }
  }
  const junctions = junctionsFor(network, segments);
  const invalidSegments = segments.filter(segment => segment.construction.mode === 'invalid');
  return {
    schemaVersion: 1,
    sourceNetworkId: network.id,
    sourceRevision: network.revision,
    generationRevision: finite(options.generationRevision, network.revision),
    engineering: { ...network.engineering },
    nodes: network.nodes.map(node => ({ ...node, resolvedPosition: positions.get(node.id) })),
    segments,
    stations,
    junctions,
    constructionIntervals: segments.flatMap(segment => segment.constructionIntervals.map(interval => ({ ...interval }))),
    diagnostics: {
      valid: invalidSegments.length === 0,
      nodeCount: network.nodes.length,
      segmentCount: segments.length,
      junctionCount: junctions.length,
      twoArmConnectionCount,
      stationCount: stations.length,
      invalidSegmentIds: invalidSegments.map(segment => segment.id),
      totalLength: segments.reduce((sum, segment) => sum + segment.metrics.length, 0),
      maximumGradePercent: Math.max(0, ...segments.map(segment => segment.metrics.maximumGradePercent)),
      maximumCut: Math.max(0, ...segments.map(segment => segment.metrics.maximumCut)),
      maximumFill: Math.max(0, ...segments.map(segment => segment.metrics.maximumFill))
    }
  };
}

export function nearestCompiledStation(compiled, point) {
  const target = Array.isArray(point) ? point : [finite(point?.x), finite(point?.y), finite(point?.z)];
  let nearest = null;
  for (const segment of compiled?.segments || []) {
    for (let index = 0; index < segment.samples.length - 1; index += 1) {
      const start = segment.samples[index];
      const end = segment.samples[index + 1];
      const line = sub3(end.position, start.position);
      const denominator = dot3(line, line);
      const t = denominator > EPSILON ? clamp(dot3(sub3(target, start.position), line) / denominator, 0, 1) : 0;
      const position = add3(start.position, scale3(line, t));
      const distance = distance3(position, target);
      if (!nearest || distance < nearest.distance) {
        nearest = {
          segmentId: segment.id,
          sampleIndex: index,
          localT: t,
          curveT: start.t + (end.t - start.t) * t,
          position,
          distance
        };
      }
    }
  }
  return nearest;
}

export { PATH_CONSTRUCTION_MODES };
