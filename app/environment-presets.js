const clone = value => structuredClone(value);

export const ENVIRONMENT_PRESETS = Object.freeze({
  'natural-balanced': Object.freeze({
    label: 'Natural Balanced',
    description: 'Neutral daylight, realistic contrast, restrained haze, and clean material color.',
    patch: {
      lighting: { profile: 'balanced', sunIntensity: 3.05, moonIntensity: 0.18, indirectStrength: 0.5 },
      atmosphere: { exposure: 0.92, haze: 0.045, humidity: 0.18, visibilityKm: 145, saturation: 1.04, contrast: 1.03, vibrance: 0.08, toneMapper: 'aces' },
      sky: { sunGlow: 0.72, moonBrightness: 1.05, moonGlow: 0.48, starIntensity: 1.05, milkyWayIntensity: 0.32 },
      clouds: { coverage: 0.2, density: 0.42, shadowStrength: 0.24 },
      weather: { preset: 'clear', fog: 0.018 }
    }
  }),
  'clear-alpine': Object.freeze({
    label: 'Clear Alpine',
    description: 'Deep blue high-altitude sky, crisp sunlight, long visibility, and vivid terrain color.',
    patch: {
      lighting: { profile: 'quality', sunIntensity: 3.35, moonIntensity: 0.16, indirectStrength: 0.46 },
      atmosphere: { exposure: 0.88, haze: 0.018, humidity: 0.08, visibilityKm: 230, rayleigh: 1.18, mie: 0.075, saturation: 1.1, contrast: 1.06, vibrance: 0.12, toneMapper: 'aces' },
      sky: { sunGlow: 0.55, starIntensity: 1.2, milkyWayIntensity: 0.38 },
      clouds: { coverage: 0.12, density: 0.34, shadowStrength: 0.22 },
      weather: { preset: 'clear', fog: 0.008 }
    }
  }),
  'golden-hour': Object.freeze({
    label: 'Golden Hour',
    description: 'Warm low-angle sunlight with deeper blue shadows and cinematic color separation.',
    patch: {
      time: { hours: 18.15 },
      lighting: { profile: 'quality', sunIntensity: 3.7, indirectStrength: 0.52 },
      atmosphere: { exposure: 0.86, haze: 0.12, humidity: 0.26, visibilityKm: 105, saturation: 1.14, contrast: 1.08, vibrance: 0.18, toneMapper: 'aces' },
      sky: { sunGlow: 1.35, starIntensity: 0.8, milkyWayIntensity: 0.24 },
      clouds: { coverage: 0.28, density: 0.48, shadowStrength: 0.31 },
      weather: { preset: 'partly-cloudy', fog: 0.035 }
    }
  }),
  'overcast-soft': Object.freeze({
    label: 'Overcast Soft',
    description: 'Soft broad illumination, controlled highlights, and saturated surfaces without gray washout.',
    patch: {
      lighting: { profile: 'balanced', sunIntensity: 1.45, moonIntensity: 0.12, indirectStrength: 0.68 },
      atmosphere: { exposure: 0.96, haze: 0.16, humidity: 0.62, visibilityKm: 82, saturation: 1.08, contrast: 0.96, vibrance: 0.13, toneMapper: 'aces' },
      sky: { sunGlow: 0.25, starIntensity: 0.4, milkyWayIntensity: 0.08 },
      clouds: { coverage: 0.88, density: 0.72, shadowStrength: 0.5 },
      weather: { preset: 'overcast', fog: 0.085 }
    }
  }),
  'moonlit-night': Object.freeze({
    label: 'Moonlit Night',
    description: 'Readable but genuinely dark moonlight with blue-silver separation and visible stars.',
    patch: {
      time: { hours: 0.4 },
      lighting: { profile: 'quality', sunIntensity: 2.8, moonIntensity: 0.32, indirectStrength: 0.36 },
      atmosphere: { exposure: 1.02, haze: 0.045, humidity: 0.12, visibilityKm: 170, saturation: 1.12, contrast: 1.08, vibrance: 0.16, toneMapper: 'aces' },
      sky: { moonBrightness: 1.42, moonGlow: 0.58, moonEarthshine: 0.11, starIntensity: 1.65, starDensity: 0.95, milkyWayIntensity: 0.62 },
      clouds: { coverage: 0.12, density: 0.3, shadowStrength: 0.24 },
      weather: { preset: 'clear', fog: 0.012 }
    }
  }),
  'cinematic-vivid': Object.freeze({
    label: 'Cinematic Vivid',
    description: 'Rich color depth, strong warm/cool separation, and controlled highlight rolloff.',
    patch: {
      lighting: { profile: 'quality', sunIntensity: 3.45, moonIntensity: 0.22, indirectStrength: 0.58 },
      atmosphere: { exposure: 0.84, haze: 0.07, humidity: 0.2, visibilityKm: 135, saturation: 1.2, contrast: 1.13, vibrance: 0.24, toneMapper: 'aces' },
      sky: { sunGlow: 0.9, moonBrightness: 1.18, moonGlow: 0.55, starIntensity: 1.25, milkyWayIntensity: 0.46 },
      clouds: { coverage: 0.34, density: 0.5, shadowStrength: 0.33 },
      weather: { preset: 'partly-cloudy', fog: 0.025 }
    }
  }),
  'storm-drama': Object.freeze({
    label: 'Storm Drama',
    description: 'Dark cloud mass, preserved local color, strong contrast, and storm-ready atmosphere.',
    patch: {
      lighting: { profile: 'quality', sunIntensity: 1.9, moonIntensity: 0.1, indirectStrength: 0.48 },
      atmosphere: { exposure: 0.9, haze: 0.22, humidity: 0.88, visibilityKm: 54, saturation: 1.12, contrast: 1.12, vibrance: 0.16, toneMapper: 'aces' },
      sky: { sunGlow: 0.3, starIntensity: 0.15, milkyWayIntensity: 0.02 },
      clouds: { quality: 'quality', coverage: 0.95, density: 0.88, shadowStrength: 0.72 },
      weather: { preset: 'storm', fog: 0.16, precipitation: 0.82, wetness: 0.72, windStrength: 0.9 }
    }
  })
});

function mergeSection(target, patch) {
  return { ...(target || {}), ...(patch || {}) };
}

export function applyEnvironmentPreset(world = {}, presetId = 'natural-balanced') {
  const preset = ENVIRONMENT_PRESETS[presetId] || ENVIRONMENT_PRESETS['natural-balanced'];
  const patch = preset.patch;
  return {
    ...clone(world),
    time: mergeSection(world.time, patch.time),
    lighting: mergeSection(world.lighting, patch.lighting),
    atmosphere: mergeSection(world.atmosphere, patch.atmosphere),
    sky: mergeSection(world.sky, patch.sky),
    clouds: mergeSection(world.clouds, patch.clouds),
    weather: mergeSection(world.weather, patch.weather),
    lookPreset: presetId
  };
}

export function environmentPresetOptions() {
  return Object.entries(ENVIRONMENT_PRESETS).map(([id, preset]) => ({ id, label: preset.label, description: preset.description }));
}
