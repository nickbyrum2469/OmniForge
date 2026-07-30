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
    supportSpacing: 6,
    materialFamily: 'timber'
  }),
  'stone-arch': Object.freeze({
    id: 'stone-arch',
    label: 'Stone arch',
    minimumSpan: 6,
    maximumSpan: 26,
    maximumWidth: 12,
    supportSpacing: 0,
    materialFamily: 'stone'
  }),
  'steel-girder': Object.freeze({
    id: 'steel-girder',
    label: 'Steel girder',
    minimumSpan: 12,
    maximumSpan: 60,
    maximumWidth: 24,
    supportSpacing: 24,
    materialFamily: 'steel'
  }),
  'masonry-causeway': Object.freeze({
    id: 'masonry-causeway',
    label: 'Masonry causeway',
    minimumSpan: 2,
    maximumSpan: 16,
    maximumWidth: 14,
    supportSpacing: 0,
    materialFamily: 'masonry'
  }),
  'rope-footbridge': Object.freeze({
    id: 'rope-footbridge',
    label: 'Rope footbridge',
    minimumSpan: 5,
    maximumSpan: 35,
    maximumWidth: 2.8,
    supportSpacing: 0,
    materialFamily: 'rope'
  })
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const BRIDGE_MATERIAL_ROOT = '/assets/materials/path-structures';

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

export function resolveBridgeProfile(segment, sections = [], baseHeightAt = () => 0) {
  const authored = normalizeBridgeProfile(segment?.structureProfile);
  const startDistance = finite(sections[0]?.distance);
  const endDistance = finite(sections.at(-1)?.distance, startDistance);
  const span = Math.max(0, endDistance - startDistance);
  const width = Math.max(0.1, finite(segment?.crossSectionProfile?.width, 3));
  const vehicleClass = String(segment?.gameplayRules?.vehicleClass || 'mixed');
  let maximumClearance = 0;
  for (const section of sections) {
    const terrainY = finite(baseHeightAt(section.center[0], section.center[2]), section.center[1]);
    maximumClearance = Math.max(maximumClearance, section.center[1] - terrainY);
  }

  let style = authored.bridgeStyle;
  if (style === 'auto') {
    if (vehicleClass === 'pedestrian' && width <= PATH_BRIDGE_PROFILES['rope-footbridge'].maximumWidth) {
      style = 'rope-footbridge';
    } else if (maximumClearance <= 2.25 && span <= PATH_BRIDGE_PROFILES['masonry-causeway'].maximumSpan) {
      style = 'masonry-causeway';
    } else if (span <= PATH_BRIDGE_PROFILES['timber-trestle'].maximumSpan && width <= PATH_BRIDGE_PROFILES['timber-trestle'].maximumWidth) {
      style = 'timber-trestle';
    } else if (span <= PATH_BRIDGE_PROFILES['stone-arch'].maximumSpan && width <= PATH_BRIDGE_PROFILES['stone-arch'].maximumWidth) {
      style = 'stone-arch';
    } else {
      style = 'steel-girder';
    }
  }

  const legacyAutomaticSpacing = authored.bridgeStyle === 'auto' && authored.supportSpacing === 8;
  const familySupportSpacing = PATH_BRIDGE_PROFILES[style].supportSpacing;
  return {
    ...PATH_BRIDGE_PROFILES[style],
    ...authored,
    bridgeStyle: style,
    supportSpacing: authored.supportSpacing === null || legacyAutomaticSpacing
      ? familySupportSpacing
      : authored.supportSpacing,
    span,
    width,
    maximumClearance
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
      baseColor: [0.15, 0.065, 0.018, 1],
      roughness: 0.96,
      metallic: 0,
      textureTintStrength: 0.55,
      normalStrength: 0.45,
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
