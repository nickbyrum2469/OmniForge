const clone = value => structuredClone(value);

export const ENVIRONMENT_PRESETS = Object.freeze({
  'clear-day': Object.freeze({
    label: 'Clear Day',
    description: 'Clean blue daylight, minimal haze, long visibility, readable shadows, and restrained highlights.',
    patch: {
      lighting: { profile: 'balanced', sunIntensity: 2.35, moonIntensity: 0.14, indirectStrength: 0.9 },
      atmosphere: { exposure: 0.86, haze: 0.006, mie: 0.035, humidity: 0.04, visibilityKm: 320, rayleigh: 1.08, dayFogMultiplier: 0.04, nightFogMultiplier: 0.18, saturation: 1.08, contrast: 1.03, vibrance: 0.1, toneMapper: 'neutral' },
      sky: { sunGlow: 0.38, moonBrightness: 0.92, moonGlow: 0.22, starIntensity: 0.9, milkyWayIntensity: 0.18 },
      clouds: { coverage: 0.03, density: 0.16, shadowStrength: 0.12 },
      weather: { preset: 'clear', fog: 0 }
    }
  }),
  'natural-balanced': Object.freeze({
    label: 'Natural Balanced',
    description: 'Neutral outdoor lighting with moderate depth, clean color, and light atmospheric perspective.',
    patch: {
      lighting: { profile: 'balanced', sunIntensity: 2.55, moonIntensity: 0.16, indirectStrength: 0.66 },
      atmosphere: { exposure: 0.74, haze: 0.015, mie: 0.055, humidity: 0.08, visibilityKm: 230, dayFogMultiplier: 0.08, nightFogMultiplier: 0.22, saturation: 1.06, contrast: 1.04, vibrance: 0.1, toneMapper: 'neutral' },
      sky: { sunGlow: 0.48, moonBrightness: 0.96, moonGlow: 0.28, starIntensity: 1, milkyWayIntensity: 0.23 },
      clouds: { coverage: 0.12, density: 0.28, shadowStrength: 0.18 },
      weather: { preset: 'clear', fog: 0.004 }
    }
  }),
  'clear-alpine': Object.freeze({
    label: 'Clear Alpine',
    description: 'Deep blue high-altitude sky, very long visibility, crisp sunlight, and vivid terrain separation.',
    patch: {
      lighting: { profile: 'quality', sunIntensity: 2.75, moonIntensity: 0.15, indirectStrength: 0.62 },
      atmosphere: { exposure: 0.68, haze: 0.003, mie: 0.022, humidity: 0.025, visibilityKm: 420, rayleigh: 1.28, dayFogMultiplier: 0.01, nightFogMultiplier: 0.12, saturation: 1.13, contrast: 1.06, vibrance: 0.14, toneMapper: 'neutral' },
      sky: { sunGlow: 0.32, starIntensity: 1.12, milkyWayIntensity: 0.28 },
      clouds: { coverage: 0.02, density: 0.12, shadowStrength: 0.1 },
      weather: { preset: 'clear', fog: 0 }
    }
  }),
  'golden-hour': Object.freeze({
    label: 'Golden Hour',
    description: 'Warm low-angle sunlight, cool open shadows, gentle haze, and cinematic separation.',
    patch: {
      time: { hours: 18.15 },
      lighting: { profile: 'quality', sunIntensity: 2.9, indirectStrength: 0.68 },
      atmosphere: { exposure: 0.66, haze: 0.055, mie: 0.11, humidity: 0.18, visibilityKm: 160, dayFogMultiplier: 0.12, nightFogMultiplier: 0.2, saturation: 1.15, contrast: 1.07, vibrance: 0.18, toneMapper: 'neutral' },
      sky: { sunGlow: 0.95, starIntensity: 0.82, milkyWayIntensity: 0.18 },
      clouds: { coverage: 0.22, density: 0.38, shadowStrength: 0.24 },
      weather: { preset: 'partly-cloudy', fog: 0.008 }
    }
  }),
  'overcast-soft': Object.freeze({
    label: 'Overcast Soft',
    description: 'Broad soft illumination with restrained highlights and preserved material color.',
    patch: {
      lighting: { profile: 'balanced', sunIntensity: 1.15, moonIntensity: 0.1, indirectStrength: 0.92 },
      atmosphere: { exposure: 0.78, haze: 0.06, mie: 0.1, humidity: 0.52, visibilityKm: 135, dayFogMultiplier: 0.12, nightFogMultiplier: 0.2, saturation: 1.04, contrast: 0.94, vibrance: 0.12, toneMapper: 'neutral' },
      sky: { sunGlow: 0.15, starIntensity: 0.3, milkyWayIntensity: 0.04 },
      clouds: { coverage: 0.88, density: 0.68, shadowStrength: 0.42 },
      weather: { preset: 'overcast', fog: 0.018 }
    }
  }),
  'clean-twilight': Object.freeze({
    label: 'Clean Twilight',
    description: 'Deep blue twilight with a clean horizon, early stars, and controlled atmospheric glow.',
    patch: {
      time: { hours: 19.45 },
      lighting: { profile: 'quality', sunIntensity: 2.2, moonIntensity: 0.18, indirectStrength: 0.68 },
      atmosphere: { exposure: 0.82, haze: 0.018, mie: 0.05, humidity: 0.07, visibilityKm: 260, dayFogMultiplier: 0.05, nightFogMultiplier: 0.12, saturation: 1.03, contrast: 1.03, vibrance: 0.08, toneMapper: 'neutral' },
      sky: { sunGlow: 0.54, moonBrightness: 1, moonGlow: 0.3, starIntensity: 0.94, milkyWayIntensity: 0.2 },
      clouds: { coverage: 0.08, density: 0.22, shadowStrength: 0.15 },
      weather: { preset: 'clear', fog: 0.002 }
    }
  }),
  'forest-morning-shafts': Object.freeze({
    label: 'Forest Morning Shafts',
    description: 'Cool humid morning air, warm low-angle sunlight, long shadows, and restrained mist for wooded worlds.',
    patch: {
      time: { hours: 7 },
      lighting: { profile: 'quality', sunIntensity: 2.8, indirectStrength: 0.72 },
      atmosphere: { exposure: 0.86, haze: 0.075, mie: 0.14, mieAnisotropy: 0.84, ozone: 1.05, humidity: 0.72, dust: 0.01, aerialPerspective: 1.28, visibilityKm: 115, dayFogMultiplier: 0.26, nightFogMultiplier: 0.3, saturation: 1.05, contrast: 1.06, vibrance: 0.08, toneMapper: 'neutral' },
      sky: { sunGlow: 0.82, starIntensity: 0, milkyWayIntensity: 0 },
      clouds: { quality: 'quality', coverage: 0.12, density: 0.28, shadowStrength: 0.14 },
      weather: { preset: 'fog', fog: 0.18 }
    }
  }),
  'coastal-backlight': Object.freeze({
    label: 'Coastal Backlight',
    description: 'Humid low-Sun glare, warm highlights, cool open shadows, and long-distance coastal haze.',
    patch: {
      time: { hours: 17.65 },
      lighting: { profile: 'quality', sunIntensity: 3.05, indirectStrength: 0.7 },
      atmosphere: { exposure: 0.76, haze: 0.065, mie: 0.13, mieAnisotropy: 0.86, ozone: 1.08, humidity: 0.62, dust: 0.018, aerialPerspective: 1.18, visibilityKm: 150, dayFogMultiplier: 0.16, nightFogMultiplier: 0.22, saturation: 1.1, contrast: 1.08, vibrance: 0.16, toneMapper: 'neutral' },
      sky: { sunGlow: 1.18, starIntensity: 0, milkyWayIntensity: 0 },
      clouds: { quality: 'quality', coverage: 0.14, density: 0.3, shadowStrength: 0.18 },
      weather: { preset: 'partly-cloudy', fog: 0.012 }
    }
  }),
  'realistic-night-core': Object.freeze({
    label: 'Realistic Galactic Core',
    description: 'A restrained astronomical palette with dense stars, irregular dust lanes, and a warm galactic core.',
    patch: {
      time: { hours: 1 },
      lighting: { profile: 'quality', moonIntensity: 0.2, indirectStrength: 0.46 },
      atmosphere: { exposure: 0.82, haze: 0.008, mie: 0.025, mieAnisotropy: 0.76, ozone: 0.94, humidity: 0.025, dust: 0.008, aerialPerspective: 0.82, visibilityKm: 360, dayFogMultiplier: 0.02, nightFogMultiplier: 0.1, saturation: 1.04, contrast: 1.08, vibrance: 0.06, toneMapper: 'neutral' },
      sky: { moonBrightness: 0.9, moonGlow: 0.18, starIntensity: 1.12, starDensity: 0.74, starBrightness: 0.76, starSizeMin: 0.34, starSizeMax: 1.45, starTwinkleAmount: 0.24, starRayStrength: 0.08, starHeroFraction: 0.012, milkyWayIntensity: 0.82, milkyWayWidth: 0.2, milkyWayDetail: 1.55, milkyWayOrientation: 22, milkyWayDust: 0.86, milkyWayWarp: 0.5, milkyWayClumping: 0.92, milkyWayCoreStrength: 1.08, milkyWayWidthVariation: 0.78, milkyWayColor: '#8fa7d8' },
      clouds: { coverage: 0.02, density: 0.12, shadowStrength: 0.08 },
      weather: { preset: 'clear', fog: 0 }
    }
  }),
  'faint-natural-milkyway': Object.freeze({
    label: 'Faint Natural Milky Way',
    description: 'A subtle naked-eye galaxy with dark adapted stars and low-contrast dust structure.',
    patch: {
      time: { hours: 1.4 },
      lighting: { profile: 'balanced', moonIntensity: 0.12, indirectStrength: 0.42 },
      atmosphere: { exposure: 0.78, haze: 0.012, mie: 0.032, humidity: 0.035, visibilityKm: 310, dayFogMultiplier: 0.02, nightFogMultiplier: 0.12, saturation: 1.02, contrast: 1.04, vibrance: 0.03, toneMapper: 'neutral' },
      sky: { moonBrightness: 0.72, moonGlow: 0.14, starIntensity: 0.9, starDensity: 0.64, starBrightness: 0.66, starTwinkleAmount: 0.2, starRayStrength: 0.04, starHeroFraction: 0.008, milkyWayIntensity: 0.28, milkyWayWidth: 0.17, milkyWayDetail: 1.2, milkyWayDust: 0.78, milkyWayWarp: 0.34, milkyWayClumping: 0.66, milkyWayCoreStrength: 0.56, milkyWayWidthVariation: 0.5, milkyWayColor: '#91a0bd' },
      clouds: { coverage: 0.04, density: 0.14, shadowStrength: 0.08 },
      weather: { preset: 'clear', fog: 0.001 }
    }
  }),
  'fantasy-violet-galaxy': Object.freeze({
    label: 'Fantasy Violet Galaxy',
    description: 'An intentional magenta-violet galactic treatment isolated from realistic night profiles.',
    patch: {
      time: { hours: 21.2 },
      lighting: { profile: 'quality', moonIntensity: 0.24, indirectStrength: 0.6 },
      atmosphere: { exposure: 0.8, haze: 0.018, mie: 0.045, humidity: 0.04, visibilityKm: 300, dayFogMultiplier: 0.04, nightFogMultiplier: 0.12, saturation: 1.24, contrast: 1.08, vibrance: 0.3, toneMapper: 'neutral' },
      sky: { moonBrightness: 1.2, moonGlow: 0.45, starIntensity: 1.5, starDensity: 0.84, starBrightness: 0.98, starRayStrength: 0.32, starHeroFraction: 0.045, milkyWayIntensity: 0.92, milkyWayWidth: 0.25, milkyWayDetail: 1.45, milkyWayDust: 0.74, milkyWayWarp: 0.82, milkyWayClumping: 1.08, milkyWayCoreStrength: 1.02, milkyWayWidthVariation: 0.94, milkyWayColor: '#b889e8' },
      clouds: { coverage: 0.06, density: 0.16, shadowStrength: 0.1 },
      weather: { preset: 'clear', fog: 0 }
    }
  }),
  'total-eclipse-realistic': Object.freeze({
    label: 'Total Eclipse — Realistic',
    description: 'Centered totality with a restrained white corona and physically connected world dimming.',
    patch: {
      time: { hours: 12 },
      lighting: { profile: 'quality', indirectStrength: 0.58 },
      atmosphere: { exposure: 0.78, haze: 0.018, mie: 0.045, humidity: 0.05, saturation: 1.02, contrast: 1.05, vibrance: 0.04, toneMapper: 'neutral' },
      sky: { celestialMode: 'manual', sunAzimuth: 0, sunElevation: 30, sunSize: 1, moonAzimuth: 0, moonElevation: 30, moonSize: 1.04, eclipseMode: 'force-solar', solarEclipseCoverage: 1.08, starIntensity: 0.3, milkyWayIntensity: 0 },
      clouds: { coverage: 0.02, density: 0.12, shadowStrength: 0.08 },
      weather: { preset: 'clear', fog: 0 }
    }
  }),
  'annular-eclipse-warm': Object.freeze({
    label: 'Annular Eclipse — Warm',
    description: 'A low-altitude annular event with warm atmospheric extinction and controlled cloud response.',
    patch: {
      time: { hours: 17.4 },
      lighting: { profile: 'quality', indirectStrength: 0.62 },
      atmosphere: { exposure: 0.76, haze: 0.065, mie: 0.12, mieAnisotropy: 0.84, humidity: 0.2, aerialPerspective: 1.18, saturation: 1.12, contrast: 1.06, vibrance: 0.12, toneMapper: 'neutral' },
      sky: { celestialMode: 'manual', sunAzimuth: 0, sunElevation: 16, sunSize: 1, moonAzimuth: 0, moonElevation: 16, moonSize: 0.83, eclipseMode: 'automatic', solarEclipseCoverage: 1, starIntensity: 0, milkyWayIntensity: 0 },
      clouds: { quality: 'quality', coverage: 0.18, density: 0.32, shadowStrength: 0.2 },
      weather: { preset: 'partly-cloudy', fog: 0.006 }
    }
  }),
  'moonlit-night': Object.freeze({
    label: 'Moonlit Night',
    description: 'Dark blue-silver moonlight with readable silhouettes, strong stars, and light night haze.',
    patch: {
      time: { hours: 0.4 },
      lighting: { profile: 'quality', sunIntensity: 2.2, moonIntensity: 0.28, indirectStrength: 0.52 },
      atmosphere: { exposure: 0.86, haze: 0.012, mie: 0.04, humidity: 0.05, visibilityKm: 280, dayFogMultiplier: 0.03, nightFogMultiplier: 0.12, saturation: 1.1, contrast: 1.07, vibrance: 0.15, toneMapper: 'neutral' },
      sky: { moonBrightness: 1.22, moonGlow: 0.34, moonEarthshine: 0.08, starIntensity: 1.18, starDensity: 0.62, starBrightness: 0.82, starSizeMin: 0.38, starSizeMax: 1.45, starTwinkleAmount: 0.42, starRayStrength: 0.1, starHeroFraction: 0.018, milkyWayIntensity: 0.56, milkyWayWidth: 0.2, milkyWayWarp: 0.42, milkyWayClumping: 0.7 },
      clouds: { coverage: 0.06, density: 0.18, shadowStrength: 0.12 },
      weather: { preset: 'clear', fog: 0.002 }
    }
  }),
  'cinematic-vivid': Object.freeze({
    label: 'Cinematic Vivid',
    description: 'Rich but controlled color, warm/cool contrast, readable blacks, and soft highlight rolloff.',
    patch: {
      lighting: { profile: 'quality', sunIntensity: 2.7, moonIntensity: 0.2, indirectStrength: 0.7 },
      atmosphere: { exposure: 0.67, haze: 0.024, mie: 0.065, humidity: 0.1, visibilityKm: 210, dayFogMultiplier: 0.06, nightFogMultiplier: 0.16, saturation: 1.16, contrast: 1.1, vibrance: 0.22, toneMapper: 'neutral' },
      sky: { sunGlow: 0.58, moonBrightness: 1.06, moonGlow: 0.3, starIntensity: 1.12, milkyWayIntensity: 0.34 },
      clouds: { coverage: 0.2, density: 0.34, shadowStrength: 0.22 },
      weather: { preset: 'partly-cloudy', fog: 0.006 }
    }
  }),
  'storm-drama': Object.freeze({
    label: 'Storm Drama',
    description: 'Dense storm mass, preserved local color, darkened sky, and wet-weather atmosphere.',
    patch: {
      lighting: { profile: 'quality', sunIntensity: 1.5, moonIntensity: 0.08, indirectStrength: 0.58 },
      atmosphere: { exposure: 0.76, haze: 0.14, mie: 0.19, humidity: 0.9, visibilityKm: 70, dayFogMultiplier: 0.34, nightFogMultiplier: 0.4, saturation: 1.06, contrast: 1.08, vibrance: 0.13, toneMapper: 'neutral' },
      sky: { sunGlow: 0.18, starIntensity: 0.1, milkyWayIntensity: 0.01 },
      clouds: { quality: 'quality', coverage: 0.96, density: 0.88, shadowStrength: 0.68 },
      weather: { preset: 'storm', fog: 0.12, precipitation: 0.82, wetness: 0.72, windStrength: 0.9 }
    }
  }),
  'horror-fog': Object.freeze({
    label: 'Horror Fog',
    description: 'Intentional low-visibility ground fog and desaturated light for horror or mystery scenes.',
    patch: {
      lighting: { profile: 'balanced', sunIntensity: 1.3, moonIntensity: 0.13, indirectStrength: 0.42 },
      atmosphere: { exposure: 0.72, haze: 0.32, mie: 0.28, humidity: 0.92, visibilityKm: 28, dayFogMultiplier: 0.72, nightFogMultiplier: 1.15, saturation: 0.78, contrast: 1.08, vibrance: -0.08, toneMapper: 'neutral' },
      sky: { sunGlow: 0.1, moonBrightness: 0.78, moonGlow: 0.5, starIntensity: 0.05, milkyWayIntensity: 0 },
      clouds: { coverage: 0.72, density: 0.68, shadowStrength: 0.56 },
      weather: { preset: 'fog', fog: 0.82 }
    }
  }),
  'fantasy-sky': Object.freeze({
    label: 'Fantasy Sky',
    description: 'Stylized deep color, visible galactic structure, stronger hero stars, and a luminous Moon.',
    patch: {
      time: { hours: 21.2 },
      lighting: { profile: 'quality', sunIntensity: 2.3, moonIntensity: 0.24, indirectStrength: 0.62 },
      atmosphere: { exposure: 0.8, haze: 0.018, mie: 0.045, humidity: 0.04, visibilityKm: 300, dayFogMultiplier: 0.04, nightFogMultiplier: 0.12, saturation: 1.24, contrast: 1.08, vibrance: 0.3, toneMapper: 'neutral' },
      sky: { moonBrightness: 1.3, moonGlow: 0.52, starIntensity: 1.65, starDensity: 0.86, starBrightness: 1.05, starRayStrength: 0.44, starHeroFraction: 0.06, milkyWayIntensity: 0.72, milkyWayWarp: 0.78, milkyWayClumping: 0.95, milkyWayCoreStrength: 0.95 },
      clouds: { coverage: 0.08, density: 0.18, shadowStrength: 0.12 },
      weather: { preset: 'clear', fog: 0 }
    }
  })
});

function mergeSection(target, patch) {
  return { ...(target || {}), ...(patch || {}) };
}

export function applyEnvironmentPreset(world = {}, presetId = 'natural-balanced') {
  if (presetId === 'custom') return { ...clone(world), lookPreset: 'custom' };
  const preset = ENVIRONMENT_PRESETS[presetId] || ENVIRONMENT_PRESETS['natural-balanced'];
  const resolvedId = ENVIRONMENT_PRESETS[presetId] ? presetId : 'natural-balanced';
  const patch = preset.patch;
  return {
    ...clone(world),
    time: mergeSection(world.time, patch.time),
    lighting: mergeSection(world.lighting, patch.lighting),
    atmosphere: mergeSection(world.atmosphere, patch.atmosphere),
    sky: mergeSection(world.sky, patch.sky),
    clouds: mergeSection(world.clouds, patch.clouds),
    weather: mergeSection(world.weather, patch.weather),
    lookPreset: resolvedId
  };
}

export function environmentPresetOptions() {
  return [
    { id: 'custom', label: 'Custom', description: 'The current world contains manual environment edits.' },
    ...Object.entries(ENVIRONMENT_PRESETS).map(([id, preset]) => ({ id, label: preset.label, description: preset.description }))
  ];
}
