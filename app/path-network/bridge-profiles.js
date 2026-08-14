import { pathCrossSectionLayout } from './cross-section-profiles.js';

export const PATH_BRIDGE_STYLES = Object.freeze([
  'auto',
  'timber-trestle',
  'stone-arch',
  'steel-girder',
  'masonry-causeway',
  'rope-footbridge'
]);

export const PATH_BRIDGE_PROFILES = Object.freeze({
  'timber-trestle': Object.freeze({
    id: 'timber-trestle',
    label: 'Timber trestle',
    minimumSpan: 3,
    maximumSpan: 18,
    maximumWidth: 6,
    deckWidthScale: 0.92,
    minimumClearWidth: 3.2,
    deckEdgeOverhang: 0.18,
    deckThickness: 0.28,
    approachTaperLength: 6,
    abutmentSeatLength: 1.2,
    carrySidewalks: false,
    supportSpacing: 6,
    materialFamily: 'timber'
  }),
  'stone-arch': Object.freeze({
    id: 'stone-arch',
    label: 'Stone arch',
    minimumSpan: 6,
    maximumSpan: 26,
    maximumWidth: 12,
    deckWidthScale: 0.96,
    minimumClearWidth: 3.2,
    deckEdgeOverhang: 0.32,
    deckThickness: 0.55,
    approachTaperLength: 8,
    abutmentSeatLength: 1.8,
    carrySidewalks: true,
    supportSpacing: 0,
    materialFamily: 'stone'
  }),
  'steel-girder': Object.freeze({
    id: 'steel-girder',
    label: 'Steel girder',
    minimumSpan: 12,
    maximumSpan: 60,
    maximumWidth: 24,
    deckWidthScale: 1,
    minimumClearWidth: 3.5,
    deckEdgeOverhang: 0.45,
    deckThickness: 0.72,
    approachTaperLength: 10,
    abutmentSeatLength: 2.2,
    carrySidewalks: true,
    supportSpacing: 24,
    materialFamily: 'steel'
  }),
  'masonry-causeway': Object.freeze({
    id: 'masonry-causeway',
    label: 'Masonry causeway',
    minimumSpan: 2,
    maximumSpan: 16,
    maximumWidth: 14,
    deckWidthScale: 1,
    minimumClearWidth: 3.2,
    deckEdgeOverhang: 0.3,
    deckThickness: 0.5,
    approachTaperLength: 6,
    abutmentSeatLength: 1.5,
    carrySidewalks: true,
    supportSpacing: 0,
    materialFamily: 'masonry'
  }),
  'rope-footbridge': Object.freeze({
    id: 'rope-footbridge',
    label: 'Rope footbridge',
    minimumSpan: 5,
    maximumSpan: 35,
    maximumWidth: 2.8,
    deckWidthScale: 0.72,
    minimumClearWidth: 1.4,
    deckEdgeOverhang: 0.12,
    deckThickness: 0.16,
    approachTaperLength: 5,
    abutmentSeatLength: 0.8,
    carrySidewalks: false,
    supportSpacing: 0,
    materialFamily: 'rope'
  })
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const BRIDGE_MATERIAL_ROOT = '/assets/materials/path-structures';
const VEHICLE_MINIMUM_CLEAR_WIDTH = Object.freeze({
  pedestrian: 1.2,
  bicycle: 1.8,
  equestrian: 2.4,
  passenger: 3,
  mixed: 3.2,
  service: 3.5,
  heavy: 4
});

function textureSet(family) {
  const root = `${BRIDGE_MATERIAL_ROOT}/${family}`;
  return {
    baseColor: `${root}/basecolor.jpg`,
    normal: `${root}/normal-gl.jpg`,
    roughness: `${root}/roughness.jpg`,
    ao: `${root}/ao.jpg`
  };
}

export function normalizeBridgeProfile(input = {}) {
  const hasAuthoredSupportSpacing = Object.prototype.hasOwnProperty.call(input || {}, 'supportSpacing')
    && input.supportSpacing !== null
    && input.supportSpacing !== '';
  return {
    bridgeStyle: PATH_BRIDGE_STYLES.includes(input.bridgeStyle) ? input.bridgeStyle : 'auto',
    railings: input.railings !== false,
    deckThickness: Math.max(0.12, Math.min(2, finite(input.deckThickness, 0.28))),
    supportSpacing: hasAuthoredSupportSpacing
      ? Math.max(2, Math.min(60, finite(input.supportSpacing, 8)))
      : null
  };
}

/**
 * Validate one automatic bridge portal against the terrain on its approach
 * side. A threshold crossing is not, by itself, a buildable abutment: the
 * landing station must have bounded cut/fill support and a compatible
 * authored road grade. A steep terrain bank is reported separately because
 * the adjoining earthwork, retaining wall, and abutment own that transition.
 *
 * `outsideSample` is the first sample away from the open span. End-of-segment
 * portals may omit it; their authored endpoint is then the only available
 * support authority.
 */
export function bridgePortalLandingStatus(sample, outsideSample, engineering = {}) {
  const landing = sample || {};
  const outside = outsideSample || null;
  const supportSamples = outside ? [landing, outside] : [landing];
  const maximumFillDepth = Math.max(0, finite(engineering.maxFillDepth, 2.5));
  const maximumCutDepth = Math.max(0, finite(engineering.maxCutDepth, 6));
  const maximumGradePercent = Math.max(0.1, finite(engineering.maxGradePercent, 12));
  const maximumFill = Math.max(0, ...supportSamples.map(candidate => (
    finite(candidate?.position?.[1]) - finite(candidate?.baseY, candidate?.position?.[1])
  )));
  const maximumCut = Math.max(0, ...supportSamples.map(candidate => (
    finite(candidate?.baseY, candidate?.position?.[1]) - finite(candidate?.position?.[1])
  )));
  let roadGradePercent = 0;
  let terrainGradePercent = 0;
  let gradeDeltaPercent = 0;
  if (outside) {
    const horizontal = Math.max(1e-6, Math.hypot(
      finite(landing?.position?.[0]) - finite(outside?.position?.[0]),
      finite(landing?.position?.[2]) - finite(outside?.position?.[2])
    ));
    const roadDelta = finite(landing?.position?.[1]) - finite(outside?.position?.[1]);
    const terrainDelta = finite(landing?.baseY, landing?.position?.[1])
      - finite(outside?.baseY, outside?.position?.[1]);
    roadGradePercent = Math.abs(roadDelta) / horizontal * 100;
    terrainGradePercent = Math.abs(terrainDelta) / horizontal * 100;
    gradeDeltaPercent = Math.abs(terrainDelta - roadDelta) / horizontal * 100;
  }
  const supportValid = maximumFill <= maximumFillDepth + 1e-6
    && maximumCut <= maximumCutDepth + 1e-6;
  // The deck/road grade is a hard portal constraint. A steep terrain bank is
  // not automatically a rejected landing: the abutment and the adjoining
  // cut/fill or retaining run own that bank. Report it separately so Civil
  // Assist and diagnostics can expose the required approach work without
  // moving the deck boundary all the way to flat ground (which creates an
  // oversized dirt causeway around real ravines).
  const gradeValid = roadGradePercent <= maximumGradePercent + 0.05;
  const terrainApproachValid = terrainGradePercent <= maximumGradePercent + 0.05
    && gradeDeltaPercent <= maximumGradePercent + 0.05;
  const reasons = [];
  if (maximumFill > maximumFillDepth + 1e-6) reasons.push('portal-fill-support-exceeds-limit');
  if (maximumCut > maximumCutDepth + 1e-6) reasons.push('portal-cut-support-exceeds-limit');
  if (roadGradePercent > maximumGradePercent + 0.05) reasons.push('portal-road-grade-exceeds-limit');
  const warnings = [];
  if (terrainGradePercent > maximumGradePercent + 0.05) warnings.push('portal-terrain-grade-exceeds-limit');
  if (gradeDeltaPercent > maximumGradePercent + 0.05) warnings.push('portal-grade-mismatch-exceeds-limit');
  return Object.freeze({
    valid: supportValid && gradeValid,
    supportValid,
    gradeValid,
    terrainApproachValid,
    maximumFill,
    maximumCut,
    maximumFillDepth,
    maximumCutDepth,
    roadGradePercent,
    terrainGradePercent,
    gradeDeltaPercent,
    maximumGradePercent,
    reasons: Object.freeze(reasons),
    warnings: Object.freeze(warnings)
  });
}

function minimumClearWidthForVehicleClass(vehicleClass) {
  return VEHICLE_MINIMUM_CLEAR_WIDTH[vehicleClass]
    ?? VEHICLE_MINIMUM_CLEAR_WIDTH.mixed;
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Return the authored bridge influence at one arc-length station. This is the
 * single longitudinal taper authority used by render geometry, terrain
 * support, collision/navigation surfaces, foliage exclusion, and procedural
 * surface-detail scale. Keeping it here prevents each consumer from inventing
 * a slightly different portal transition.
 */
export function bridgeApproachAmount(distance, bridgeAuthority) {
  const station = finite(distance);
  const startDistance = finite(bridgeAuthority?.startDistance);
  const endDistance = Math.max(startDistance, finite(bridgeAuthority?.endDistance, startDistance));
  const taper = Math.max(0.25, finite(bridgeAuthority?.profile?.approachTaperLength, 5));
  if (station >= startDistance && station <= endDistance) return 1;
  if (station < startDistance && station >= startDistance - taper) {
    return smoothstep((station - (startDistance - taper)) / taper);
  }
  if (station > endDistance && station <= endDistance + taper) {
    return smoothstep(((endDistance + taper) - station) / taper);
  }
  return 0;
}

/**
 * Resolve the complete width state at one station. Consumers should use the
 * returned road/accessory/outer widths rather than re-running bridge profile
 * math. The deck safety width deliberately includes a small maintenance
 * margin so foliage cannot intersect rails or structural deck edges.
 */
export function bridgeCrossSectionState(crossSectionProfile = {}, distance = 0, bridgeAuthorities = []) {
  const layout = pathCrossSectionLayout(crossSectionProfile);
  const width = layout.profile.width;
  const authoredHalfWidth = layout.halfRoad;
  const leftAccessoryWidth = layout.left.outerEdge - layout.halfRoad;
  const rightAccessoryWidth = layout.right.outerEdge - layout.halfRoad;
  let selected = null;
  let amount = 0;
  for (const authority of bridgeAuthorities || []) {
    const candidate = bridgeApproachAmount(distance, authority);
    if (
      candidate > amount
      || (
        Math.abs(candidate - amount) <= 1e-9
        && candidate > 0
        && String(authority?.interval?.segmentId || authority?.profile?.bridgeStyle || '')
          .localeCompare(String(selected?.interval?.segmentId || selected?.profile?.bridgeStyle || '')) < 0
      )
    ) {
      selected = authority;
      amount = candidate;
    }
  }

  if (!selected || amount <= 1e-9) {
    return Object.freeze({
      roadHalfWidth: authoredHalfWidth,
      roadWidth: width,
      surfaceDetailRoadWidth: width,
      accessoryScale: 1,
      leftOuterEdge: authoredHalfWidth + leftAccessoryWidth,
      rightOuterEdge: authoredHalfWidth + rightAccessoryWidth,
      maximumOuterEdge: authoredHalfWidth + Math.max(leftAccessoryWidth, rightAccessoryWidth),
      exclusionHalfWidth: authoredHalfWidth + Math.max(leftAccessoryWidth, rightAccessoryWidth),
      amount: 0,
      bridge: null
    });
  }

  const targetHalfWidth = Math.max(0.05, finite(selected.profile?.clearWidth, width) * 0.5);
  const carriesSidewalks = selected.profile?.carrySidewalks === true;
  const hasUrbanSection = layout.left.urban || layout.right.urban;
  const targetAccessoryScale = hasUrbanSection && carriesSidewalks ? 1 : 0;
  const accessoryScale = 1 + (targetAccessoryScale - 1) * amount;
  const roadHalfWidth = authoredHalfWidth + (targetHalfWidth - authoredHalfWidth) * amount;
  const leftOuterEdge = roadHalfWidth + leftAccessoryWidth * accessoryScale;
  const rightOuterEdge = roadHalfWidth + rightAccessoryWidth * accessoryScale;
  const authoredMaximumOuterEdge = authoredHalfWidth + Math.max(leftAccessoryWidth, rightAccessoryWidth);
  const deckSafetyHalfWidth = Math.max(
    targetHalfWidth,
    finite(selected.profile?.deckWidth, targetHalfWidth * 2) * 0.5
      + Math.max(0.25, finite(selected.profile?.deckEdgeOverhang, 0.25))
  );
  return Object.freeze({
    roadHalfWidth,
    roadWidth: roadHalfWidth * 2,
    surfaceDetailRoadWidth: roadHalfWidth * 2,
    accessoryScale,
    leftOuterEdge,
    rightOuterEdge,
    maximumOuterEdge: Math.max(leftOuterEdge, rightOuterEdge),
    exclusionHalfWidth: authoredMaximumOuterEdge + (deckSafetyHalfWidth - authoredMaximumOuterEdge) * amount,
    amount,
    bridge: selected
  });
}

function resolveBridgeDimensions(family, authored, span, width, vehicleClass) {
  const minimumRequiredClearWidth = Math.max(
    family.minimumClearWidth,
    minimumClearWidthForVehicleClass(vehicleClass)
  );
  const clearWidth = Math.max(minimumRequiredClearWidth, width * family.deckWidthScale);
  const deckWidth = clearWidth + family.deckEdgeOverhang * 2;
  const spanRange = Math.max(0.001, family.maximumSpan - family.minimumSpan);
  const spanRatio = smoothstep((span - family.minimumSpan) / spanRange);
  const spanScaledThickness = family.deckThickness * (0.85 + spanRatio * 0.5);

  return {
    minimumRequiredClearWidth,
    clearWidth,
    deckWidth,
    deckThickness: clamp(Math.max(authored.deckThickness, spanScaledThickness), 0.12, 4)
  };
}

function evaluateBridgeCompatibility(family, dimensions, {
  span,
  width,
  vehicleClass,
  hasSidewalks
}) {
  const errors = [];
  const warnings = [];
  const addError = (code, message, actual, limit) => errors.push({ code, message, actual, limit });
  const addWarning = (code, message, actual, limit) => warnings.push({ code, message, actual, limit });

  if (span < family.minimumSpan) {
    addError(
      'span-below-minimum',
      `${family.label} requires a span of at least ${family.minimumSpan} m.`,
      span,
      family.minimumSpan
    );
  }
  if (span > family.maximumSpan) {
    addError(
      'span-exceeds-maximum',
      `${family.label} supports spans up to ${family.maximumSpan} m.`,
      span,
      family.maximumSpan
    );
  }
  if (dimensions.clearWidth > family.maximumWidth) {
    addError(
      'clear-width-exceeds-maximum',
      `${family.label} supports a clear deck width up to ${family.maximumWidth} m.`,
      dimensions.clearWidth,
      family.maximumWidth
    );
  }
  if (family.id === 'rope-footbridge' && vehicleClass !== 'pedestrian') {
    addError(
      'rope-footbridge-requires-pedestrian',
      'Rope footbridges are restricted to pedestrian paths.',
      vehicleClass,
      'pedestrian'
    );
  }
  if (dimensions.clearWidth < width - 0.001) {
    addWarning(
      'approach-taper-required',
      `${family.label} narrows the authored path and requires a controlled approach taper.`,
      dimensions.clearWidth,
      width
    );
  }
  if (hasSidewalks && !family.carrySidewalks) {
    addWarning(
      'sidewalk-transition-required',
      `${family.label} does not carry sidewalks; pedestrian edges require an explicit transition.`,
      true,
      false
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function hasAuthoredSidewalks(segment) {
  const crossSection = segment?.crossSectionProfile || {};
  return finite(crossSection.sidewalkWidth, 0) > 0
    || finite(crossSection.sidewalkLeftWidth, 0) > 0
    || finite(crossSection.sidewalkRightWidth, 0) > 0;
}

export function resolveBridgeProfile(segment, sections = [], baseHeightAt = () => 0) {
  const authored = normalizeBridgeProfile(segment?.structureProfile);
  const startDistance = finite(sections[0]?.distance);
  const endDistance = finite(sections.at(-1)?.distance, startDistance);
  const span = Math.max(0, endDistance - startDistance);
  const width = Math.max(0.1, finite(segment?.crossSectionProfile?.width, 3));
  const vehicleClass = String(segment?.gameplayRules?.vehicleClass || 'mixed');
  let maximumClearance = 0;
  for (const section of sections) {
    const center = Array.isArray(section?.center) ? section.center : [0, 0, 0];
    const terrainY = finite(baseHeightAt(center[0], center[2]), center[1]);
    maximumClearance = Math.max(maximumClearance, center[1] - terrainY);
  }

  let style = authored.bridgeStyle;
  if (style === 'auto') {
    const candidateStyles = vehicleClass === 'pedestrian'
      ? ['rope-footbridge', 'masonry-causeway', 'timber-trestle', 'stone-arch', 'steel-girder']
      : maximumClearance <= 2.25
        ? ['masonry-causeway', 'timber-trestle', 'stone-arch', 'steel-girder']
        : ['timber-trestle', 'stone-arch', 'steel-girder', 'masonry-causeway'];
    style = candidateStyles.find(candidateStyle => {
      const family = PATH_BRIDGE_PROFILES[candidateStyle];
      const dimensions = resolveBridgeDimensions(family, authored, span, width, vehicleClass);
      return evaluateBridgeCompatibility(family, dimensions, {
        span,
        width,
        vehicleClass,
        hasSidewalks: hasAuthoredSidewalks(segment)
      }).valid;
    }) || 'steel-girder';
  }

  const family = PATH_BRIDGE_PROFILES[style];
  const dimensions = resolveBridgeDimensions(family, authored, span, width, vehicleClass);
  const compatibility = evaluateBridgeCompatibility(family, dimensions, {
    span,
    width,
    vehicleClass,
    hasSidewalks: hasAuthoredSidewalks(segment)
  });
  if (authored.bridgeStyle === 'auto' && !compatibility.valid) {
    compatibility.errors.unshift({
      code: 'no-compatible-automatic-profile',
      message: 'No bridge family can safely satisfy the authored span, width, and traffic class.',
      actual: { span, width, vehicleClass },
      limit: null
    });
  }
  if (authored.bridgeStyle !== 'auto' && !compatibility.valid) {
    compatibility.errors = compatibility.errors.map(diagnostic => ({
      ...diagnostic,
      authoredStyle: authored.bridgeStyle
    }));
  }

  if (dimensions.clearWidth > width + 0.001) {
    compatibility.warnings.push({
      code: 'approach-widening-required',
      message: `${family.label} must widen the authored path to preserve safe clear width.`,
      actual: width,
      limit: dimensions.clearWidth
    });
  }

  const legacyAutomaticSpacing = authored.bridgeStyle === 'auto' && authored.supportSpacing === 8;
  const familySupportSpacing = family.supportSpacing;
  return {
    ...family,
    ...authored,
    bridgeStyle: style,
    requestedBridgeStyle: authored.bridgeStyle,
    automaticallySelected: authored.bridgeStyle === 'auto',
    supportSpacing: authored.supportSpacing === null || legacyAutomaticSpacing
      ? familySupportSpacing
      : authored.supportSpacing,
    ...dimensions,
    span,
    width,
    vehicleClass,
    maximumClearance,
    valid: compatibility.valid,
    compatibility,
    compatibilityDiagnostics: compatibility.errors
  };
}

export function bridgeMaterialForRole(role = '') {
  const text = String(role);
  if (text.includes('timber') || text.includes('deck-slat')) {
    return {
      name: 'bridge-timber',
      baseColor: [0.72, 0.58, 0.42, 1],
      roughness: 0.82,
      metallic: 0,
      textureTintStrength: 0.38,
      normalStrength: 0.82,
      aoStrength: 0.9,
      textureUrls: textureSet('timber')
    };
  }
  if (text.includes('rope')) {
    return {
      name: 'bridge-rope',
      baseColor: [0.34, 0.19, 0.075, 1],
      roughness: 0.96,
      metallic: 0,
      textureTintStrength: 0.42,
      normalStrength: 0.62,
      aoStrength: 0.75,
      textureUrls: textureSet('timber')
    };
  }
  if (text.includes('steel')) {
    return {
      name: 'bridge-steel',
      baseColor: [0.58, 0.64, 0.7, 1],
      roughness: 0.34,
      metallic: 0.72,
      textureTintStrength: 0.32,
      normalStrength: 0.72,
      aoStrength: 0.85,
      textureUrls: textureSet('steel')
    };
  }
  if (text.includes('concrete')) {
    return {
      name: 'bridge-concrete',
      baseColor: [0.76, 0.77, 0.76, 1],
      roughness: 0.9,
      metallic: 0,
      textureTintStrength: 0.28,
      normalStrength: 0.88,
      aoStrength: 0.9,
      textureUrls: textureSet('concrete')
    };
  }
  if (text.includes('stone') || text.includes('masonry') || text.includes('retaining') || text.includes('tunnel')) {
    return {
      name: 'bridge-masonry',
      baseColor: [0.68, 0.64, 0.56, 1],
      roughness: 0.92,
      metallic: 0,
      textureTintStrength: 0.3,
      normalStrength: 0.92,
      aoStrength: 0.95,
      textureUrls: textureSet('masonry')
    };
  }
  return { name: 'path-structure', baseColor: [0.31, 0.34, 0.37, 1], roughness: 0.78, metallic: 0.05 };
}
