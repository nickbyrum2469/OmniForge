from pathlib import Path
import re


def edit(path, transform):
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    updated = transform(source)
    if updated != source:
        file.write_text(updated, encoding='utf-8')
        print(f'updated {path}')
    else:
        print(f'unchanged {path}')


def replace_once(source, before, after, path, marker=None):
    if marker and marker in source:
        return source
    if before not in source:
        raise RuntimeError(f'Expected block not found in {path}: {before[:120]!r}')
    return source.replace(before, after, 1)


def replace_regex(source, pattern, replacement, path, marker=None):
    if marker and marker in source:
        return source
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Expected regex block not found in {path}: {pattern[:120]!r}')
    return updated


def patch_systems(source):
    if "celestial-mechanics.js" not in source:
        source = source.replace(
            "import { terrainHeightAt as sharedTerrainHeightAt, terrainNormalAt as sharedTerrainNormalAt, distanceToPaths as sharedDistanceToPaths } from '../app/worldgen.js';",
            "import { terrainHeightAt as sharedTerrainHeightAt, terrainNormalAt as sharedTerrainNormalAt, distanceToPaths as sharedDistanceToPaths } from '../app/worldgen.js';\nimport { evaluateCelestialSystem } from '../app/celestial-mechanics.js';"
        )
    if 'const smoothstep = (edge0, edge1, value)' not in source:
        source = source.replace(
            "const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));",
            "const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));\nconst smoothstep = (edge0, edge1, value) => { const t = clamp((Number(value) - edge0) / ((edge1 - edge0) || 1), 0, 1); return t * t * (3 - 2 * t); };"
        )

    default_world = '''export function defaultWorldSettings(existing = {}) {
  const existingTime = existing.time || {};
  const absoluteDay = Number.isFinite(Number(existingTime.absoluteDay))
    ? Number(existingTime.absoluteDay)
    : Number(existingTime.dayOfYear ?? 172);
  return {
    schemaVersion: 2,
    lookPreset: existing.lookPreset || 'natural-balanced',
    time: {
      enabled: true,
      hours: 12,
      timeScale: 60,
      dayLengthSeconds: 1440,
      latitude: 37.3,
      dayOfYear: 172,
      absoluteDay,
      ...existingTime
    },
    lighting: {
      profile: 'balanced',
      sunIntensity: 3.05,
      moonIntensity: 0.18,
      shadowQuality: 'balanced',
      indirectStrength: 0.5,
      reflectionQuality: 'balanced',
      contactShadows: true,
      dynamicResolution: true,
      targetFrameMs: 16.67,
      ...existing.lighting
    },
    atmosphere: {
      quality: 'balanced',
      planetRadiusKm: 6371,
      atmosphereHeightKm: 100,
      rayleigh: 1,
      mie: 0.16,
      mieAnisotropy: 0.78,
      ozone: 1,
      haze: 0.045,
      humidity: 0.18,
      dust: 0.02,
      visibilityKm: 145,
      aerialPerspective: 1,
      exposure: 0.92,
      saturation: 1.04,
      contrast: 1.03,
      vibrance: 0.08,
      toneMapper: 'aces',
      ...existing.atmosphere
    },
    sky: {
      celestialMode: 'astronomical',
      sunAzimuth: -90,
      sunElevation: 45,
      sunSize: 1,
      sunGlow: 0.72,
      moonAzimuth: 90,
      moonElevation: 32,
      moonSize: 1.45,
      moonPhase: 0.72,
      moonPhaseMode: 'sun-relative',
      moonOrbitPeriodDays: 29.530588,
      moonNodePeriodDays: 27.212221,
      lunarEpochDay: 157.234706,
      moonNodeEpochDay: 151.1,
      moonOrbitOffset: 0,
      moonOrbitInclination: 5.145,
      moonAscendingNode: 0,
      moonEarthshine: 0.08,
      eclipseMode: 'automatic',
      moonBrightness: 1.05,
      moonGlow: 0.48,
      moonDetail: 1,
      moonColor: '#a9c5eb',
      starIntensity: 1.05,
      starDensity: 0.72,
      starBrightness: 1,
      starTwinkleAmount: 0.32,
      starTwinkleSpeed: 1,
      starSizeMin: 0.35,
      starSizeMax: 1.8,
      starColorVariation: 0.65,
      starSeed: 1337,
      starDaylightExtinction: 1.35,
      milkyWayIntensity: 0.32,
      milkyWayWidth: 0.16,
      milkyWayDetail: 0.72,
      milkyWayOrientation: 22,
      milkyWayDust: 0.58,
      milkyWayColor: '#8fa7d8',
      planetEnabled: false,
      planetAzimuth: 215,
      planetElevation: 28,
      planetSize: 4.5,
      planetColor: '#d49a72',
      planetBrightness: 0.8,
      planetRings: 0.65,
      auroraIntensity: 0,
      shootingStarRate: 0.05,
      suns: [{ id: 'sun-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1 }],
      moons: [{ id: 'moon-primary', enabled: true, size: 1.45, radiance: 1, orbitSpeed: 1, phase: 0.72 }],
      ...existing.sky
    },
    clouds: {
      quality: 'layered',
      coverage: 0.2,
      density: 0.42,
      altitude: 2200,
      thickness: 1800,
      windSpeed: 12,
      shadowStrength: 0.24,
      ...existing.clouds
    },
    weather: {
      preset: 'clear',
      precipitation: 0,
      fog: 0.018,
      wetness: 0,
      snow: 0,
      windDirection: [1, 0, 0.25],
      windStrength: 0.25,
      ...existing.weather
    },
    updatedAt: existing.updatedAt || now()
  };
}
'''
    source = replace_regex(
        source,
        r"export function defaultWorldSettings\(existing = \{\}\) \{.*?\n\}\n(?=\nfunction mix)",
        default_world.rstrip(),
        'server/v010-systems.mjs',
        marker="moonPhaseMode: 'sun-relative'"
    )

    apply_world = '''export function applyWorldToScene(scene, world) {
  const celestial = evaluateCelestialSystem(world);
  const sunAzimuth = celestial.sun.azimuth;
  const sunElevationDegrees = celestial.sun.elevation;
  const moonAzimuth = celestial.moon.azimuth;
  const moonElevationDegrees = celestial.moon.elevation;
  const day = smoothstep(-6, 8, sunElevationDegrees);
  const twilight = (1 - smoothstep(2, 18, Math.abs(sunElevationDegrees))) * (1 - day * 0.42);
  const night = 1 - day;
  const sunrise = [244, 112, 68];
  const dayTop = [48, 115, 196];
  const dayBottom = [155, 199, 229];
  const nightTop = [2, 5, 18];
  const nightBottom = [8, 16, 36];
  const top = mix(nightTop, dayTop, day);
  const bottom = mix(nightBottom, dayBottom, day);
  for (let i = 0; i < 3; i += 1) bottom[i] = Math.round(bottom[i] * (1 - twilight * 0.42) + sunrise[i] * twilight * 0.42);

  const weatherPreset = String(world.weather.preset || 'clear');
  const presetPrecipitation = { rain: 0.65, storm: 1, snow: 0.55 }[weatherPreset] || 0;
  const presetFog = { fog: 0.72, rain: 0.18, storm: 0.24, snow: 0.14, overcast: 0.1 }[weatherPreset] || 0;
  const precipitation = clamp(Math.max(Number(world.weather.precipitation || 0), presetPrecipitation), 0, 1);
  const weatherFog = clamp(Math.max(Number(world.weather.fog || 0), presetFog), 0, 1);
  const cloudCoverage = clamp(Number(world.clouds.coverage || 0), 0, 1);
  const cloudDensity = clamp(Number(world.clouds.density || 0), 0, 1);
  const cloudAttenuation = 1 - clamp(cloudCoverage * cloudDensity * Number(world.clouds.shadowStrength || 0.28), 0, 0.82);
  const atmosphericHaze = clamp(Number(world.atmosphere.haze || 0) + Number(world.atmosphere.mie || 0) * 0.35 + Number(world.atmosphere.humidity || 0) * 0.12, 0, 0.9);
  const fogMultiplier = Math.max(0.04, (1 - weatherFog * 0.88) * (1 - atmosphericHaze * 0.5));
  const solarEclipse = celestial.moon.solarEclipse;
  const lunarEclipse = celestial.moon.lunarEclipse;
  const eclipseDaylight = 1 - solarEclipse * 0.82;
  const ambientDay = mix([12, 20, 48], [108, 145, 196], day);
  const ambientTwilight = mix(ambientDay, [92, 55, 73], twilight * 0.5);
  const exposure = clamp(Number(world.atmosphere.exposure || 1), 0.1, 4);
  world.sky.moonPhase = celestial.moon.illumination;

  scene.settings = {
    ...(scene.settings || {}),
    skyTop: hex(top),
    skyBottom: hex(bottom),
    skyGround: hex(mix([4, 7, 14], [31, 43, 50], day)),
    ambientColor: hex(ambientTwilight),
    ambientIntensity: (0.028 + day * 0.15 + Number(world.lighting.indirectStrength || 0.5) * 0.18) * (0.7 + cloudAttenuation * 0.3) * eclipseDaylight,
    fogNear: Math.max(18, Number(world.atmosphere.visibilityKm || 120) * 1.35 * fogMultiplier),
    fogFar: Math.max(70, Number(world.atmosphere.visibilityKm || 120) * 6.2 * fogMultiplier),
    exposure,
    displayExposureEV: Math.log2(Math.max(0.05, exposure)),
    colorSaturation: clamp(Number(world.atmosphere.saturation || 1), 0, 3),
    colorContrast: clamp(Number(world.atmosphere.contrast || 1), 0.2, 3),
    colorVibrance: clamp(Number(world.atmosphere.vibrance || 0), -1, 1),
    toneMapper: String(world.atmosphere.toneMapper || 'aces'),
    weatherPreset,
    weatherWetness: clamp(Math.max(Number(world.weather.wetness || 0), precipitation * (weatherPreset === 'snow' ? 0.2 : 0.85)), 0, 1),
    weatherSnow: clamp(Math.max(Number(world.weather.snow || 0), weatherPreset === 'snow' ? precipitation : 0), 0, 1),
    windDirection: Array.isArray(world.weather.windDirection) ? world.weather.windDirection.slice(0, 3) : [1, 0, 0.25],
    windStrength: clamp(Math.max(Number(world.weather.windStrength || 0), weatherPreset === 'storm' ? 0.88 : weatherPreset === 'rain' ? 0.48 : 0), 0, 1),
    cloudCoverage,
    cloudDensity,
    cloudAttenuation,
    starIntensity: clamp(Number(world.sky.starIntensity || 0) * night * (1 - cloudCoverage * 0.8), 0, 3),
    starDensity: clamp(Number(world.sky.starDensity || 0.72), 0, 2),
    milkyWayIntensity: clamp(Number(world.sky.milkyWayIntensity || 0) * night * (1 - cloudCoverage * 0.7), 0, 3),
    auroraIntensity: clamp(Number(world.sky.auroraIntensity || 0) * night * (1 - cloudCoverage * 0.5), 0, 3),
    atmosphereQuality: world.atmosphere.quality || 'balanced',
    environmentV010: {
      ...world,
      sunElevation: Math.sin(sunElevationDegrees * Math.PI / 180),
      sunDayFactor: day,
      nightFactor: night,
      twilightFactor: twilight,
      celestial
    }
  };

  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')
    || scene.objects.find(object => object.type === 'directionalLight' && String(object.name || '').trim().toLowerCase() === 'sun');
  if (!sun) {
    sun = {
      id: 'directionalLight-v010-sun', type: 'directionalLight', name: 'Sun', visible: true, locked: false, parentId: null,
      transform: { position: [0, 20, 0], rotation: [45, -35, 0], scale: [1, 1, 1] }, properties: {}, components: []
    };
    scene.objects.push(sun);
  }
  sun.name = 'Sun';
  sun.transform.rotation = [-sunElevationDegrees, sunAzimuth + 180, 0];
  sun.properties = {
    ...(sun.properties || {}),
    celestialRole: 'sun',
    color: hex(mix([255, 113, 66], [255, 244, 216], smoothstep(-4, 28, sunElevationDegrees))),
    intensity: Number(world.lighting.sunIntensity || 3.05) * Math.max(0.002, day) * cloudAttenuation * eclipseDaylight,
    azimuth: sunAzimuth,
    elevation: sunElevationDegrees,
    angularSize: Number(world.sky.sunSize ?? 1),
    glow: Number(world.sky.sunGlow ?? 0.72),
    solarEclipse,
    castsShadows: true,
    shadowQuality: world.lighting.shadowQuality,
    hybridLightingProfile: world.lighting.profile
  };

  let moon = scene.objects.find(object => object.properties?.celestialRole === 'moon');
  if (!moon) {
    moon = {
      id: 'celestial-v010-moon', type: 'empty', name: 'Moon', visible: true, locked: false, parentId: null,
      transform: { position: [0, 0, 0], rotation: [32, 90, 0], scale: [1, 1, 1] }, properties: {}, components: []
    };
    scene.objects.push(moon);
  }
  moon.name = 'Moon';
  moon.transform.rotation = [moonElevationDegrees, moonAzimuth, 0];
  const moonLight = Number(world.lighting.moonIntensity || 0.18)
    * Math.pow(celestial.moon.illumination, 0.72)
    * celestial.moon.horizonVisibility
    * (1 - day * 0.86)
    * (1 - lunarEclipse * 0.82);
  moon.properties = {
    ...(moon.properties || {}),
    celestialRole: 'moon',
    color: world.sky.moonColor || '#a9c5eb',
    intensity: moonLight,
    phase: celestial.moon.illumination,
    illumination: celestial.moon.illumination,
    waxing: celestial.moon.waxing,
    phaseName: celestial.moon.phaseName,
    ageDays: celestial.moon.ageDays,
    angularSize: Number(world.sky.moonSize ?? 1.45),
    azimuth: moonAzimuth,
    elevation: moonElevationDegrees,
    brightness: Number(world.sky.moonBrightness ?? 1.05),
    glow: Number(world.sky.moonGlow ?? 0.48),
    detail: Number(world.sky.moonDetail ?? 1),
    earthshine: Number(world.sky.moonEarthshine ?? 0.08),
    skyVisibility: celestial.moon.visibility,
    solarEclipse,
    lunarEclipse,
    eventType: celestial.event.type,
    separationDegrees: celestial.moon.separationDegrees,
    orbitInclination: Number(world.sky.moonOrbitInclination ?? 5.145),
    castsShadows: false
  };
  return {
    hour: Number(world.time.hours || 0), day, night, twilight,
    elevation: Math.sin(sunElevationDegrees * Math.PI / 180),
    sunId: sun.id, moonId: moon.id, sunAzimuth, sunElevationDegrees, moonAzimuth, moonElevationDegrees,
    moonIllumination: celestial.moon.illumination, moonAgeDays: celestial.moon.ageDays,
    celestialEvent: celestial.event.type, solarEclipse, lunarEclipse
  };
}
'''
    source = replace_regex(
        source,
        r"export function applyWorldToScene\(scene, world\) \{.*?\n\}\n(?=\nfunction categoryGroundingMode)",
        apply_world.rstrip(),
        'server/v010-systems.mjs',
        marker='moonIllumination: celestial.moon.illumination'
    )
    return source


def patch_api(source):
    old = '''        if (world.time.enabled !== false) {
          world.time.hours = ((Number(world.time.hours || 0) + seconds * Number(world.time.timeScale || 0) / 3600) % 24 + 24) % 24;
        }'''
    new = '''        if (world.time.enabled !== false) {
          const currentHours = Number(world.time.hours || 0);
          const totalHours = currentHours + seconds * Number(world.time.timeScale || 0) / 3600;
          const dayDelta = Math.floor(totalHours / 24);
          world.time.hours = ((totalHours % 24) + 24) % 24;
          world.time.absoluteDay = Number(world.time.absoluteDay ?? world.time.dayOfYear ?? 172) + dayDelta;
          world.time.dayOfYear = ((Math.floor(world.time.absoluteDay) % 365) + 365) % 365;
        }'''
    return replace_once(source, old, new, 'server/v010-api.mjs', marker='world.time.absoluteDay =')


def patch_v010(source):
    if "environment-presets.js" not in source:
        source = source.replace(
            "import { applyCompactWorldRuntime, clearCelestialRuntimeInterpolation, shouldAdvanceWorldTime, updateCelestialRuntimeInterpolation } from './world-runtime.js';",
            "import { applyCompactWorldRuntime, clearCelestialRuntimeInterpolation, shouldAdvanceWorldTime, updateCelestialRuntimeInterpolation } from './world-runtime.js';\nimport { applyEnvironmentPreset, environmentPresetOptions } from './environment-presets.js';"
        )
    source = replace_once(source,
'''        <label>Lighting profile<select id="v010LightingProfile"><option value="compatibility">GTX 1650 compatibility</option><option value="balanced">Balanced</option><option value="quality">Quality</option><option value="reference">Reference capture</option></select></label>
        <label>Preview time while editing<input id="v010PreviewTime" type="checkbox"></label>''',
'''        <label>Lighting profile<select id="v010LightingProfile"><option value="compatibility">GTX 1650 compatibility</option><option value="balanced">Balanced</option><option value="quality">Quality</option><option value="reference">Reference capture</option></select></label>
        <label>Look preset<select id="v010LookPreset">${environmentPresetOptions().map(item => `<option value="${item.id}">${item.label}</option>`).join('')}</select></label>
        <label>Preview time while editing<input id="v010PreviewTime" type="checkbox"></label>''',
'app/v010.js', marker='id="v010LookPreset"')
    source = replace_once(source,
'''      <div class="v010-actions"><button id="v010ApplyWorld" class="button primary" type="button">Apply world</button><button id="v010ToggleTime" class="button subtle" type="button">Pause time</button></div>''',
'''      <div class="v010-actions"><button id="v010ApplyWorld" class="button primary" type="button">Apply world</button><button id="v010ApplyPreset" class="button subtle" type="button">Apply look preset</button><button id="v010ToggleTime" class="button subtle" type="button">Pause time</button></div>''',
'app/v010.js', marker='id="v010ApplyPreset"')
    source = replace_once(source,
'''        <label>Moon size<input id="v010MoonSize" type="range" min="0.1" max="12" step="0.05"></label>
        <label>Moon phase<input id="v010MoonPhase" type="range" min="0" max="1" step="0.005"></label>
        <label>Moon brightness<input id="v010MoonBrightness" type="range" min="0" max="5" step="0.05"></label>''',
'''        <label>Moon size<input id="v010MoonSize" type="range" min="0.1" max="12" step="0.05"></label>
        <label>Phase authority<select id="v010MoonPhaseMode"><option value="sun-relative">Computed from Sun–Moon geometry</option><option value="manual">Manual artistic phase</option></select></label>
        <label>Moon age (days)<input id="v010MoonAge" type="range" min="0" max="29.530588" step="0.02"></label>
        <label>Manual phase<input id="v010MoonPhase" type="range" min="0" max="1" step="0.005"></label>
        <label>Orbit period (days)<input id="v010MoonOrbitPeriod" type="number" min="1" max="2000" step="0.001"></label>
        <label>Orbit inclination<input id="v010MoonInclination" type="number" min="0" max="45" step="0.01"></label>
        <label>Earthshine<input id="v010MoonEarthshine" type="range" min="0" max="0.5" step="0.005"></label>
        <label>Lunar events<select id="v010EclipseMode"><option value="automatic">Automatic eclipses</option><option value="off">Disabled</option><option value="force-solar">Force solar eclipse</option><option value="force-lunar">Force lunar eclipse</option></select></label>
        <label>Moon brightness<input id="v010MoonBrightness" type="range" min="0" max="5" step="0.05"></label>''',
'app/v010.js', marker='id="v010MoonAge"')
    source = replace_once(source,
'''        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Star density<input id="v010StarDensity" type="range" min="0.08" max="2" step="0.02"></label>
        <label>Daylight star extinction<input id="v010StarExtinction" type="range" min="0.1" max="4" step="0.05"></label>
        <label>Milky Way<input id="v010MilkyWay" type="range" min="0" max="3" step="0.05"></label>''',
'''        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Star density<input id="v010StarDensity" type="range" min="0.02" max="2" step="0.02"></label>
        <label>Star brightness<input id="v010StarBrightness" type="range" min="0" max="8" step="0.05"></label>
        <label>Twinkle amount<input id="v010StarTwinkle" type="range" min="0" max="1" step="0.01"></label>
        <label>Twinkle speed<input id="v010StarTwinkleSpeed" type="range" min="0" max="12" step="0.05"></label>
        <label>Minimum star size<input id="v010StarSizeMin" type="range" min="0.05" max="4" step="0.05"></label>
        <label>Maximum star size<input id="v010StarSizeMax" type="range" min="0.05" max="8" step="0.05"></label>
        <label>Star color variation<input id="v010StarColorVariation" type="range" min="0" max="1" step="0.01"></label>
        <label>Star seed<input id="v010StarSeed" type="number" step="1"></label>
        <label>Daylight star extinction<input id="v010StarExtinction" type="range" min="0.1" max="8" step="0.05"></label>
        <label>Milky Way brightness<input id="v010MilkyWay" type="range" min="0" max="3" step="0.05"></label>
        <label>Milky Way width<input id="v010MilkyWayWidth" type="range" min="0.02" max="0.8" step="0.01"></label>
        <label>Milky Way detail<input id="v010MilkyWayDetail" type="range" min="0" max="3" step="0.05"></label>
        <label>Milky Way orientation<input id="v010MilkyWayOrientation" type="range" min="-180" max="180" step="1"></label>
        <label>Milky Way dust lanes<input id="v010MilkyWayDust" type="range" min="0" max="1" step="0.01"></label>''',
'app/v010.js', marker='id="v010StarTwinkle"')
    source = replace_once(source,
"  field('v010LightingProfile').value = world.lighting.profile;",
"  field('v010LightingProfile').value = world.lighting.profile;\n  field('v010LookPreset').value = world.lookPreset || 'natural-balanced';",
'app/v010.js', marker="field('v010LookPreset').value")
    source = replace_once(source,
'''  field('v010MoonSize').value = world.sky.moonSize ?? 1.45;
  field('v010MoonPhase').value = world.sky.moonPhase ?? 0.72;
  field('v010MoonBrightness').value = world.sky.moonBrightness ?? 1;''',
'''  field('v010MoonSize').value = world.sky.moonSize ?? 1.45;
  field('v010MoonPhaseMode').value = world.sky.moonPhaseMode || 'sun-relative';
  const celestialState = snapshot.scene?.settings?.environmentV010?.celestial || {};
  field('v010MoonAge').value = celestialState.moon?.ageDays ?? 14.765;
  field('v010MoonPhase').value = world.sky.moonPhase ?? 0.72;
  field('v010MoonOrbitPeriod').value = world.sky.moonOrbitPeriodDays ?? 29.530588;
  field('v010MoonInclination').value = world.sky.moonOrbitInclination ?? 5.145;
  field('v010MoonEarthshine').value = world.sky.moonEarthshine ?? 0.08;
  field('v010EclipseMode').value = world.sky.eclipseMode || 'automatic';
  field('v010MoonBrightness').value = world.sky.moonBrightness ?? 1.05;''',
'app/v010.js', marker="field('v010MoonAge').value")
    source = replace_once(source,
'''  field('v010Stars').value = world.sky.starIntensity;
  field('v010StarDensity').value = world.sky.starDensity ?? 0.72;
  field('v010StarExtinction').value = world.sky.starDaylightExtinction ?? 1.35;
  field('v010MilkyWay').value = world.sky.milkyWayIntensity ?? 0.35;''',
'''  field('v010Stars').value = world.sky.starIntensity;
  field('v010StarDensity').value = world.sky.starDensity ?? 0.72;
  field('v010StarBrightness').value = world.sky.starBrightness ?? 1;
  field('v010StarTwinkle').value = world.sky.starTwinkleAmount ?? 0.32;
  field('v010StarTwinkleSpeed').value = world.sky.starTwinkleSpeed ?? 1;
  field('v010StarSizeMin').value = world.sky.starSizeMin ?? 0.35;
  field('v010StarSizeMax').value = world.sky.starSizeMax ?? 1.8;
  field('v010StarColorVariation').value = world.sky.starColorVariation ?? 0.65;
  field('v010StarSeed').value = world.sky.starSeed ?? 1337;
  field('v010StarExtinction').value = world.sky.starDaylightExtinction ?? 1.35;
  field('v010MilkyWay').value = world.sky.milkyWayIntensity ?? 0.32;
  field('v010MilkyWayWidth').value = world.sky.milkyWayWidth ?? 0.16;
  field('v010MilkyWayDetail').value = world.sky.milkyWayDetail ?? 0.72;
  field('v010MilkyWayOrientation').value = world.sky.milkyWayOrientation ?? 22;
  field('v010MilkyWayDust').value = world.sky.milkyWayDust ?? 0.58;''',
'app/v010.js', marker="field('v010StarTwinkle').value")
    source = replace_once(source,
"  field('v010CelestialReadout').textContent = (world.sky.celestialMode === 'manual' ? 'MANUAL' : formatTime(world.time.hours)) + ' · MOON ' + (Number(world.sky.moonPhase ?? 0.72) * 100).toFixed(0) + '%';",
"  const celestialReadout = snapshot.scene?.settings?.environmentV010?.celestial;\n  field('v010CelestialReadout').textContent = (world.sky.celestialMode === 'manual' ? 'MANUAL' : formatTime(world.time.hours)) + ' · ' + (celestialReadout?.moon?.phaseName || 'Moon') + ' ' + (Number(celestialReadout?.moon?.illumination ?? world.sky.moonPhase ?? 0.72) * 100).toFixed(0) + '%' + (celestialReadout?.event?.type && celestialReadout.event.type !== 'none' ? ' · ' + celestialReadout.event.type.replace('-', ' ').toUpperCase() : '');",
'app/v010.js', marker='celestialReadout?.moon?.phaseName')
    source = replace_once(source,
'''      moonSize: numeric('v010MoonSize', 1.45), moonPhase: numeric('v010MoonPhase', 0.72),
      moonBrightness: numeric('v010MoonBrightness', 1), moonGlow: numeric('v010MoonGlow', 0.7), moonDetail: numeric('v010MoonDetail', 1),''',
'''      moonSize: numeric('v010MoonSize', 1.45), moonPhase: numeric('v010MoonPhase', 0.72), moonPhaseMode: field('v010MoonPhaseMode').value,
      lunarEpochDay: Number(snapshot?.world?.time?.absoluteDay ?? snapshot?.world?.time?.dayOfYear ?? 172) + numeric('v010Hours', 12) / 24 - numeric('v010MoonAge', 14.765),
      moonOrbitPeriodDays: numeric('v010MoonOrbitPeriod', 29.530588), moonOrbitInclination: numeric('v010MoonInclination', 5.145),
      moonEarthshine: numeric('v010MoonEarthshine', 0.08), eclipseMode: field('v010EclipseMode').value,
      moonBrightness: numeric('v010MoonBrightness', 1.05), moonGlow: numeric('v010MoonGlow', 0.48), moonDetail: numeric('v010MoonDetail', 1),''',
'app/v010.js', marker="moonPhaseMode: field('v010MoonPhaseMode')")
    source = replace_once(source,
'''      starIntensity: numeric('v010Stars', 1), starDensity: numeric('v010StarDensity', 0.72),
      starDaylightExtinction: numeric('v010StarExtinction', 1.35), milkyWayIntensity: numeric('v010MilkyWay', 0.35)''',
'''      starIntensity: numeric('v010Stars', 1), starDensity: numeric('v010StarDensity', 0.72), starBrightness: numeric('v010StarBrightness', 1),
      starTwinkleAmount: numeric('v010StarTwinkle', 0.32), starTwinkleSpeed: numeric('v010StarTwinkleSpeed', 1),
      starSizeMin: numeric('v010StarSizeMin', 0.35), starSizeMax: numeric('v010StarSizeMax', 1.8), starColorVariation: numeric('v010StarColorVariation', 0.65), starSeed: numeric('v010StarSeed', 1337),
      starDaylightExtinction: numeric('v010StarExtinction', 1.35), milkyWayIntensity: numeric('v010MilkyWay', 0.32),
      milkyWayWidth: numeric('v010MilkyWayWidth', 0.16), milkyWayDetail: numeric('v010MilkyWayDetail', 0.72), milkyWayOrientation: numeric('v010MilkyWayOrientation', 22), milkyWayDust: numeric('v010MilkyWayDust', 0.58)''',
'app/v010.js', marker="starTwinkleAmount: numeric('v010StarTwinkle'")
    if "field('v010ApplyPreset').addEventListener" not in source:
        insertion = '''
  field('v010ApplyPreset').addEventListener('click', async () => {
    try {
      const presetId = field('v010LookPreset').value;
      const nextWorld = applyEnvironmentPreset(snapshot?.world || {}, presetId);
      snapshot = await api('/api/v010/world', { method: 'PATCH', body: JSON.stringify(nextWorld) });
      synchronizeAuthoritativeEditor();
      populate();
      setStatus(`Applied ${field('v010LookPreset').selectedOptions[0]?.textContent || presetId}. The preset edits the same authoritative world controls shown below.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
'''
        anchor = "  field('v010ToggleTime').addEventListener('click', async () => {"
        if anchor not in source:
            raise RuntimeError('Preset listener anchor missing in app/v010.js')
        source = source.replace(anchor, insertion + '\n' + anchor, 1)
    return source


def patch_sky(source):
    uniform_anchor = "uniform float uMoonDetail;"
    if 'uniform float uMoonVisibility;' not in source:
        source = source.replace(uniform_anchor, uniform_anchor + '''
uniform float uMoonVisibility;
uniform float uMoonEarthshine;
uniform float uLunarEclipse;
uniform float uSolarEclipse;''')
    if 'uniform float uStarBrightness;' not in source:
        source = source.replace('uniform float uStarDensity;', '''uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uStarTwinkleAmount;
uniform float uStarTwinkleSpeed;
uniform float uStarSizeMin;
uniform float uStarSizeMax;
uniform float uStarColorVariation;
uniform float uStarSeed;''')
        source = source.replace('uniform float uMilkyWayIntensity;', '''uniform float uMilkyWayIntensity;
uniform float uMilkyWayWidth;
uniform float uMilkyWayDetail;
uniform float uMilkyWayOrientation;
uniform float uMilkyWayDust;
uniform vec3 uMilkyWayColor;''')
    if 'vec3 starLayer(' not in source:
        helper = '''
vec3 starLayer(vec2 uv,float scale,float seed){
  vec2 gridScale=vec2(scale,scale*0.5);
  vec2 cell=floor(uv*gridScale);
  vec2 local=fract(uv*gridScale)-0.5;
  float identity=hash21(cell+seed);
  float probability=clamp(uStarDensity*0.018,0.0004,0.06);
  if(identity<1.0-probability)return vec3(0.0);
  float sizeRandom=hash21(cell+seed+17.7);
  float radius=mix(0.018,0.105,pow(sizeRandom,5.0))*mix(uStarSizeMin,uStarSizeMax,sizeRandom);
  float disc=1.0-smoothstep(radius*0.34,radius,length(local));
  float phase=hash21(cell+seed+43.2)*TAU;
  float speed=mix(0.55,2.6,hash21(cell+seed+9.3))*uStarTwinkleSpeed;
  float pulse=0.5+0.5*sin(uTime*speed+phase);
  float twinkle=mix(1.0,mix(0.52,1.42,pulse),uStarTwinkleAmount);
  float temperature=hash21(cell+seed+71.4);
  vec3 warm=vec3(1.0,0.74,0.52),neutral=vec3(0.92,0.96,1.0),cool=vec3(0.58,0.76,1.0);
  vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);
  starColor=mix(vec3(0.86,0.91,1.0),starColor,uStarColorVariation);
  return starColor*disc*twinkle*uStarBrightness*(0.45+sizeRandom*1.8);
}
vec3 milkyWay(vec3 ray,float horizonMask){
  float orientation=radians(uMilkyWayOrientation);
  vec3 galacticNormal=normalize(vec3(0.36*sin(orientation)+0.24,0.82,0.36*cos(orientation)-0.42));
  vec3 tangent=normalize(cross(abs(galacticNormal.y)>.94?vec3(1,0,0):vec3(0,1,0),galacticNormal));
  vec3 bitangent=normalize(cross(galacticNormal,tangent));
  float latitude=dot(ray,galacticNormal);
  float longitude=atan(dot(ray,bitangent),dot(ray,tangent));
  float warp=(fbm2(vec2(longitude*1.35,4.7))-0.5)*uMilkyWayWidth*0.7*uMilkyWayDetail;
  float distanceFromPlane=abs(latitude-warp);
  float core=exp(-pow(distanceFromPlane/max(0.008,uMilkyWayWidth),2.0)*2.2);
  float halo=exp(-pow(distanceFromPlane/max(0.015,uMilkyWayWidth*2.8),2.0)*1.4)*0.32;
  vec2 cloudUv=vec2(longitude*7.0,latitude/max(0.01,uMilkyWayWidth)*2.3);
  float clouds=0.42+0.58*fbm2(cloudUv*mix(0.7,2.2,uMilkyWayDetail/3.0)+uStarSeed*0.001);
  float granular=pow(noise2(cloudUv*11.0+31.0),4.0)*0.42*uMilkyWayDetail;
  float dustNoise=fbm2(vec2(longitude*11.0,latitude/max(0.01,uMilkyWayWidth)*5.0)+19.2);
  float dustLane=exp(-pow((latitude-warp*0.55)/max(0.004,uMilkyWayWidth*0.18),2.0)*2.0)*smoothstep(0.36,0.76,dustNoise)*uMilkyWayDust;
  float luminance=max(0.0,(core+halo)*(clouds+granular)*(1.0-dustLane*0.88));
  vec3 color=mix(uMilkyWayColor,vec3(0.92,0.72,0.55),smoothstep(0.55,1.0,clouds)*0.2);
  return color*luminance*uMilkyWayIntensity*0.72*horizonMask;
}
'''
        source = source.replace('vec2 celestialUv(vec3 ray,vec3 direction,float angularRadius){', helper + '\nvec2 celestialUv(vec3 ray,vec3 direction,float angularRadius){', 1)
    moon_pattern = r"  float sunDot=max\(dot\(ray,uSunDirection\),0\.0\);.*?  sky\+=uMoonColor\*moonGlow;"
    moon_block = '''  float sunDot=max(dot(ray,uSunDirection),0.0);
  float sunThresholdOuter=cos(radians(max(0.03,uSunAngularRadius*1.18)));
  float sunThresholdInner=cos(radians(max(0.02,uSunAngularRadius*0.90)));
  float sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uDayFactor;
  float sunGlow=pow(sunDot,mix(10.0,34.0,clamp(uSunGlow/3.0,0.0,1.0)))*(0.1+uSunGlow*0.18+uTwilightFactor*0.42);
  float eclipseLight=1.0-uSolarEclipse*0.94;
  sky+=uSunColor*(sunGlow*(1.0-uSolarEclipse*0.72)+sunDisc*(3.8+uSunGlow*1.5)*eclipseLight);
  sky+=uSunColor*horizon*uTwilightFactor*0.22;
  float corona=pow(sunDot,420.0)*uSolarEclipse*(1.0-sunDisc)*3.2;
  sky+=vec3(1.0,0.88,0.62)*corona;

  float moonDot=max(dot(ray,uMoonDirection),0.0);
  vec2 moonUv=celestialUv(ray,uMoonDirection,uMoonAngularRadius);
  float moonRadius=length(moonUv);
  float moonDisc=1.0-smoothstep(0.94,1.02,moonRadius);
  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));
  vec3 moonReference=abs(uMoonDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 moonRight=normalize(cross(moonReference,uMoonDirection));
  vec3 moonUp=normalize(cross(uMoonDirection,moonRight));
  vec3 moonSurfaceNormal=normalize(moonRight*moonUv.x+moonUp*moonUv.y-uMoonDirection*moonSphere);
  float directPhase=max(dot(moonSurfaceNormal,uSunDirection),0.0);
  float phaseLighting=max(directPhase,uMoonEarthshine*(1.0-directPhase));
  float crater=(noise2(moonUv*16.0+uCloudSeed)-0.5)*0.20*uMoonDetail+(noise2(moonUv*41.0+17.0)-0.5)*0.08*uMoonDetail;
  vec3 normalMoonSurface=uMoonColor*(0.78+crater);
  vec3 eclipsedMoon=mix(normalMoonSurface,vec3(0.72,0.12,0.045),uLunarEclipse*0.88);
  float eclipseMoonEnergy=mix(1.0,0.24,uLunarEclipse);
  sky*=1.0-moonDisc*uSolarEclipse*0.985;
  sky+=eclipsedMoon*moonDisc*phaseLighting*uMoonVisibility*uMoonBrightness*2.1*eclipseMoonEnergy;
  float moonGlow=pow(moonDot,mix(38.0,110.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*uMoonVisibility*uMoonGlow*0.22;
  sky+=mix(uMoonColor,vec3(0.78,0.18,0.06),uLunarEclipse)*moonGlow;'''
    source, count = re.subn(moon_pattern, moon_block, source, count=1, flags=re.S)
    if count != 1 and 'moonSurfaceNormal' not in source:
        raise RuntimeError('Moon shader block not found in app/sky-pass.js')
    stars_pattern = r"  vec3 starCell=floor\(ray\*mix\(380\.0,760\.0,clamp\(uStarDensity\*0\.7,0\.0,1\.0\)\)\+uCloudSeed\);.*?  sky\+=vec3\(0\.24,0\.32,0\.55\)\*milkyBand\*milkyNoise\*uMilkyWayIntensity\*0\.28;"
    stars_block = '''  float starHorizon=smoothstep(0.02,0.2,ray.y);
  vec2 starUv=vec2(atan(ray.z,ray.x)/TAU+0.5,asin(clamp(ray.y,-1.0,1.0))/PI+0.5);
  vec3 stars=starLayer(starUv,420.0,uStarSeed)+starLayer(starUv,760.0,uStarSeed+101.0)+starLayer(starUv,1180.0,uStarSeed+271.0);
  sky+=stars*uStarVisibility*starHorizon;
  sky+=milkyWay(ray,starHorizon);'''
    source, count = re.subn(stars_pattern, stars_block, source, count=1, flags=re.S)
    if count != 1 and 'starLayer(starUv' not in source:
        raise RuntimeError('Star/Milky Way shader block not found in app/sky-pass.js')
    source = source.replace('  outColor=vec4(toneMap(max(sky,vec3(0.0001))),1.0);', '  outColor=vec4(max(sky,vec3(0.0001)),1.0);')
    source = source.replace("'uMilkyWayIntensity','uSunAngularRadius'", "'uMilkyWayIntensity','uMilkyWayWidth','uMilkyWayDetail','uMilkyWayOrientation','uMilkyWayDust','uMilkyWayColor','uSunAngularRadius'")
    source = source.replace("'uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail',", "'uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail','uMoonVisibility','uMoonEarthshine','uLunarEclipse','uSolarEclipse',")
    source = source.replace("'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility','uStarDensity',", "'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility','uStarDensity','uStarBrightness','uStarTwinkleAmount','uStarTwinkleSpeed','uStarSizeMin','uStarSizeMax','uStarColorVariation','uStarSeed',")
    source = replace_once(source,
"    gl.uniform1f(u.uStarDensity, environment.starDensity);\n    gl.uniform1f(u.uMilkyWayIntensity, environment.milkyWayIntensity);",
"    gl.uniform1f(u.uStarDensity, environment.starDensity);\n    gl.uniform1f(u.uStarBrightness, environment.starBrightness);\n    gl.uniform1f(u.uStarTwinkleAmount, environment.starTwinkleAmount);\n    gl.uniform1f(u.uStarTwinkleSpeed, environment.starTwinkleSpeed);\n    gl.uniform1f(u.uStarSizeMin, environment.starSizeMin);\n    gl.uniform1f(u.uStarSizeMax, environment.starSizeMax);\n    gl.uniform1f(u.uStarColorVariation, environment.starColorVariation);\n    gl.uniform1f(u.uStarSeed, environment.starSeed);\n    gl.uniform1f(u.uMilkyWayIntensity, environment.milkyWayIntensity);\n    gl.uniform1f(u.uMilkyWayWidth, environment.milkyWayWidth);\n    gl.uniform1f(u.uMilkyWayDetail, environment.milkyWayDetail);\n    gl.uniform1f(u.uMilkyWayOrientation, environment.milkyWayOrientation);\n    gl.uniform1f(u.uMilkyWayDust, environment.milkyWayDust);\n    gl.uniform3fv(u.uMilkyWayColor, environment.milkyWayColor);",
'app/sky-pass.js', marker='u.uStarTwinkleAmount')
    source = replace_once(source,
"    gl.uniform1f(u.uMoonDetail, environment.moonDetail);",
"    gl.uniform1f(u.uMoonDetail, environment.moonDetail);\n    gl.uniform1f(u.uMoonVisibility, environment.moonVisibility);\n    gl.uniform1f(u.uMoonEarthshine, environment.moonEarthshine);\n    gl.uniform1f(u.uLunarEclipse, environment.lunarEclipseFactor);\n    gl.uniform1f(u.uSolarEclipse, environment.solarEclipseFactor);",
'app/sky-pass.js', marker='u.uMoonVisibility')
    return source


def patch_renderer(source):
    if "hdr-pipeline.js" not in source:
        source = source.replace("import { FrameResources, detectRenderCapabilities } from './frame-resources.js';", "import { FrameResources, detectRenderCapabilities } from './frame-resources.js';\nimport { HDRPipeline } from './hdr-pipeline.js';")
    source = source.replace('  color*=max(.05,uExposure);\n  color=(color*(2.51*color+.03))/(color*(2.43*color+.59)+.14);\n  color=pow(clamp(color,0.0,1.0),vec3(1.0/2.2));\n  outColor=vec4(color,clamp(uOpacity,0.0,1.0));', '  outColor=vec4(max(color,vec3(0.0)),clamp(uOpacity,0.0,1.0));')
    source = replace_once(source,
"    this.capabilities=detectRenderCapabilities(gl);\n    this.frameResources=new FrameResources(canvas,gl,{maxDevicePixelRatio:2,onResize:result=>{",
"    this.capabilities=detectRenderCapabilities(gl);\n    this.hdrPipeline=new HDRPipeline(gl,this.capabilities);\n    this.frameResources=new FrameResources(canvas,gl,{maxDevicePixelRatio:2,onResize:result=>{\n      this.hdrPipeline?.ensureSize(result.width,result.height);",
'app/renderer.js', marker='this.hdrPipeline=new HDRPipeline')
    source = source.replace("['default-framebuffer',{kind:'framebuffer',format:'canvas'}]", "['default-framebuffer',{kind:'framebuffer',format:'canvas'}],['hdr-scene-color',{kind:'texture',format:'rgba16f'}],['hdr-scene-depth',{kind:'renderbuffer',format:'depth24'}]")
    source = source.replace("writes:['scene-color','scene-depth']", "writes:['hdr-scene-color','hdr-scene-depth']", 1)
    source = source.replace("reads:['scene','camera','lighting','environment','shadow-map','scene-color','scene-depth'],writes:['scene-color','scene-depth']", "reads:['scene','camera','lighting','environment','shadow-map','hdr-scene-color','hdr-scene-depth'],writes:['hdr-scene-color','hdr-scene-depth']")
    if "name:'display-transform'" not in source:
        source = source.replace(
            "graph.addPass({name:'editor-overlays',category:'editor',after:['opaque-world'],reads:['scene','camera','scene-color','scene-depth'],writes:['scene-color'],execute:frame=>this.renderEditorOverlayPass(frame)});",
            "graph.addPass({name:'display-transform',category:'display',after:['opaque-world'],reads:['hdr-scene-color','hdr-scene-depth','environment'],writes:['scene-color','scene-depth'],execute:frame=>this.renderDisplayPass(frame)});\n    graph.addPass({name:'editor-overlays',category:'editor',after:['display-transform'],reads:['scene','camera','scene-color','scene-depth'],writes:['scene-color'],execute:frame=>this.renderEditorOverlayPass(frame)});"
        )
    source = source.replace('    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);', '    this.hdrPipeline.bindScene(this.canvas.width,this.canvas.height);', 1)
    if 'renderDisplayPass(frame)' not in source:
        anchor = '  renderOpaqueWorldPass(frame){'
        method = '''  renderDisplayPass(frame){
    this.hdrPipeline.present({
      exposure: frame.environment.exposureEV,
      saturation: frame.environment.saturation,
      contrast: frame.environment.contrast,
      vibrance: frame.environment.vibrance,
      toneMapper: frame.environment.toneMapper
    });
  }
'''
        source = source.replace(anchor, method + anchor, 1)
    source = source.replace("getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport};}", "getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport};}")
    source = source.replace("this.renderGraph?.dispose?.();", "this.renderGraph?.dispose?.();this.hdrPipeline?.dispose?.();")
    return source


edit('server/v010-systems.mjs', patch_systems)
edit('server/v010-api.mjs', patch_api)
edit('app/v010.js', patch_v010)
edit('app/sky-pass.js', patch_sky)
edit('app/renderer.js', patch_renderer)
print('Applied Phase 1B lunar astronomy, HDR display, starfield, Milky Way, and lighting preset integration.')
