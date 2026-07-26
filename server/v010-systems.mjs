import { terrainHeightAt as sharedTerrainHeightAt, terrainNormalAt as sharedTerrainNormalAt, distanceToPaths as sharedDistanceToPaths } from '../app/worldgen.js';
import { evaluateCelestialSystem } from '../app/celestial-mechanics.js';
import { atmosphereVisibilityRange } from '../app/world-units.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const smoothstep = (edge0, edge1, value) => { const t = clamp((Number(value) - edge0) / ((edge1 - edge0) || 1), 0, 1); return t * t * (3 - 2 * t); };
const now = () => new Date().toISOString();

export function seededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function terrainHeightAt(terrain, x, z, paths = []) { return sharedTerrainHeightAt(terrain, x, z, paths); }

export function terrainNormalAt(terrain, x, z, paths = [], step = 0.35) { return sharedTerrainNormalAt(terrain, x, z, paths, step); }

export function distanceToPaths(paths, x, z) { return sharedDistanceToPaths(paths, x, z); }

export function defaultWorldSettings(existing = {}) {
  const existingTime = existing.time || {};
  const absoluteDay = Number.isFinite(Number(existingTime.absoluteDay))
    ? Number(existingTime.absoluteDay)
    : Number(existingTime.dayOfYear ?? 172);
  return {
    schemaVersion: 2,
    lookPreset: existing.lookPreset || 'clear-day',
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
      viewportMode: 'authoring-assist',
      sunIntensity: 2.35,
      moonIntensity: 0.14,
      shadowQuality: 'balanced',
      indirectStrength: 0.72,
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
      mie: 0.035,
      mieAnisotropy: 0.78,
      ozone: 1,
      haze: 0.006,
      humidity: 0.04,
      dust: 0.02,
      visibilityKm: 320,
      aerialPerspective: 1,
      dayFogMultiplier: 0.04,
      nightFogMultiplier: 0.18,
      exposure: 0.7,
      saturation: 1.08,
      contrast: 1.03,
      vibrance: 0.1,
      toneMapper: 'neutral',
      ...existing.atmosphere
    },
    sky: {
      celestialMode: 'astronomical',
      sunAzimuth: -90,
      sunElevation: 45,
      sunSize: 1,
      sunGlow: 0.38,
      moonAzimuth: 90,
      moonElevation: 32,
      moonSize: 1.25,
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
      moonBrightness: 0.92,
      moonGlow: 0.22,
      moonDetail: 1.45,
      moonColor: '#c9d4e4',
      solarEclipseCoverage: 1.08,
      moonCraterStrength: 0.85,
      moonMariaStrength: 0.62,
      moonSurfaceContrast: 1.18,
      moonPatternRotation: -12,
      moonPatternSeed: 2718,
      moonReliefStrength: 0.38,
      moonLimbDarkening: 0.28,
      moonStyle: 'earth-like',
      starRayStrength: 0.12,
      starRayLength: 1.15,
      starHeroFraction: 0.018,
      milkyWayWarp: 0.48,
      milkyWayClumping: 0.72,
      milkyWayCoreStrength: 0.65,
      milkyWayWidthVariation: 0.6,
      starIntensity: 0.9,
      starDensity: 0.55,
      starBrightness: 0.82,
      starTwinkleAmount: 0.32,
      starTwinkleSpeed: 1,
      starSizeMin: 0.36,
      starSizeMax: 1.55,
      starColorVariation: 0.65,
      starSeed: 1337,
      starDaylightExtinction: 1.35,
      milkyWayIntensity: 0.34,
      milkyWayWidth: 0.22,
      milkyWayDetail: 1.15,
      milkyWayOrientation: 22,
      milkyWayDust: 0.7,
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
      coverage: 0.03,
      density: 0.16,
      altitude: 2200,
      thickness: 1800,
      windSpeed: 12,
      shadowStrength: 0.12,
      ...existing.clouds
    },
    weather: {
      preset: 'clear',
      precipitation: 0,
      fog: 0,
      wetness: 0,
      snow: 0,
      windDirection: [1, 0, 0.25],
      windStrength: 0.25,
      ...existing.weather
    },
    updatedAt: existing.updatedAt || now()
  };
}
function mix(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function hex(rgb) {
  return `#${rgb.map(value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function applyWorldToScene(scene, world) {
  const celestial = evaluateCelestialSystem(world);
  const sunAzimuth = celestial.sun.azimuth;
  const sunElevationDegrees = celestial.sun.elevation;
  const moonAzimuth = celestial.moon.azimuth;
  const moonElevationDegrees = celestial.moon.elevation;
  const day = smoothstep(-6, 8, sunElevationDegrees);
  const twilight = (1 - smoothstep(2, 18, Math.abs(sunElevationDegrees))) * (1 - day * 0.42);
  const night = 1 - day;
  const sunrise = [244, 112, 68];
  const dayTop = [31, 101, 183];
  const dayBottom = [105, 174, 219];
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
  const atmosphericHaze = clamp(Number(world.atmosphere.haze || 0) + Number(world.atmosphere.mie || 0) * 0.22 + Number(world.atmosphere.humidity || 0) * 0.05, 0, 0.9);
  const authoredFogMultiplier = day * Number(world.atmosphere.dayFogMultiplier ?? 0.04) + night * Number(world.atmosphere.nightFogMultiplier ?? 0.18);
  const fogVisibility = atmosphereVisibilityRange({
    visibilityKm: world.atmosphere.visibilityKm,
    weatherFog: clamp(weatherFog * (0.85 + authoredFogMultiplier), 0, 1),
    haze: atmosphericHaze
  });
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
    ambientIntensity: (0.12 + day * 0.45 + Number(world.lighting.indirectStrength ?? 0.72) * 0.66) * (0.74 + cloudAttenuation * 0.26) * eclipseDaylight,
    fogNear: fogVisibility.near,
    fogFar: fogVisibility.far,
    viewportLightingMode: String(world.lighting.viewportMode || 'authoring-assist'),
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
    intensity: Number(world.lighting.sunIntensity || 2.35) * Math.max(0.002, day) * cloudAttenuation * eclipseDaylight,
    azimuth: sunAzimuth,
    elevation: sunElevationDegrees,
    angularSize: Number(world.sky.sunSize ?? 1),
    glow: Number(world.sky.sunGlow ?? 0.72),
    solarEclipse,
    castsShadows: true,
    renderProxy: false,
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
    * (1 - day * 0.94)
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
    castsShadows: false,
    renderProxy: false
  };
  return {
    hour: Number(world.time.hours || 0), day, night, twilight,
    elevation: Math.sin(sunElevationDegrees * Math.PI / 180),
    sunId: sun.id, moonId: moon.id, sunAzimuth, sunElevationDegrees, moonAzimuth, moonElevationDegrees,
    moonIllumination: celestial.moon.illumination, moonAgeDays: celestial.moon.ageDays,
    celestialEvent: celestial.event.type, solarEclipse, lunarEclipse
  };
}
function categoryGroundingMode(category) {
  if (category === 'foliage') return 'root-socket';
  if (category === 'vehicle') return 'wheel-contact';
  if (category === 'architecture') return 'foundation';
  return 'support-plane';
}

export function fitGroundContact({ object, asset, terrain, maxTilt = 35 }) {
  const scale = object.transform?.scale || [1, 1, 1];
  const position = object.transform?.position || [0, 0, 0];
  const bounds = asset?.bounds || { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5], size: [1, 1, 1], center: [0, 0, 0] };
  const category = asset?.category || object.type;
  const halfX = Math.max(0.05, Math.abs((bounds.size?.[0] || 1) * scale[0] / 2));
  const halfZ = Math.max(0.05, Math.abs((bounds.size?.[2] || 1) * scale[2] / 2));
  const yaw = (object.transform?.rotation?.[1] || 0) * Math.PI / 180;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]]
    .map(([x, z]) => [position[0] + x * c - z * s, position[2] + x * s + z * c]);
  const heights = corners.map(([x, z]) => terrainHeightAt(terrain, x, z));
  const centerHeight = terrainHeightAt(terrain, position[0], position[2]);
  const averageHeight = (heights.reduce((a, b) => a + b, 0) + centerHeight) / 5;

  let pitch = 0;
  let roll = 0;
  if (!['foliage', 'character', 'architecture', 'vehicle'].includes(category)) {
    pitch = Math.atan2((heights[2] + heights[3]) - (heights[0] + heights[1]), halfZ * 4) * 180 / Math.PI;
    roll = -Math.atan2((heights[1] + heights[2]) - (heights[0] + heights[3]), halfX * 4) * 180 / Math.PI;
    pitch = clamp(pitch, -maxTilt, maxTilt);
    roll = clamp(roll, -maxTilt, maxTilt);
  }

  const burial = category === 'foliage' ? Number(object.properties?.rootBurial ?? asset?.placement?.rootBurial ?? 0.08) : 0;
  const base = Number(bounds.min?.[1] ?? -0.5) * scale[1];
  object.transform.position = [position[0], averageHeight - base - burial, position[2]];
  object.transform.rotation = [pitch, object.transform.rotation?.[1] || 0, roll];
  const errors = heights.map(height => Math.abs((object.transform.position[1] + base) - height));
  object.properties = {
    ...(object.properties || {}),
    grounding: {
      mode: categoryGroundingMode(category),
      supportPoints: corners.map((point, index) => [point[0], heights[index], point[1]]),
      terrainSlopeDegrees: Math.acos(clamp(terrainNormalAt(terrain, position[0], position[2])[1], -1, 1)) * 180 / Math.PI,
      maxContactError: Math.max(...errors),
      floatingError: Math.max(0, ...errors),
      penetrationError: 0,
      updatedAt: now()
    }
  };
  return object.properties.grounding;
}

export function generateFoliagePlacements({ scene, species, center = [0, 0, 0], radius = 24, density = 0.035, seed = 1, maxInstances = 1500 }) {
  const terrain = scene.objects.find(object => object.type === 'terrain');
  if (!terrain) throw new Error('Foliage placement requires an authoritative terrain.');
  const paths = scene.objects.filter(object => object.type === 'path' && object.visible !== false);
  const structures = scene.objects.filter(object => ['box', 'model', 'cylinder'].includes(object.type) && !object.properties?.foliageInstance);
  const random = seededRandom(seed);
  const area = Math.PI * radius * radius;
  const target = Math.min(maxInstances, Math.max(1, Math.round(area * density)));
  const spacing = Math.max(0.25, Number(species.spacing || 2.5));
  const placements = [];
  const attempts = target * 25;
  for (let attempt = 0; attempt < attempts && placements.length < target; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * radius;
    const x = center[0] + Math.cos(angle) * dist;
    const z = center[2] + Math.sin(angle) * dist;
    const pathDistance = distanceToPaths(paths, x, z);
    if (pathDistance < Math.max(Number(species.pathExclusion || 2.5), 0)) continue;

    let blocked = false;
    for (const object of structures) {
      const p = object.transform?.position || [0, 0, 0];
      const r = Math.max(1, Math.hypot(object.transform?.scale?.[0] || 1, object.transform?.scale?.[2] || 1) * 0.6);
      if (Math.hypot(x - p[0], z - p[2]) < r + Number(species.structureExclusion || 2)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    if (placements.some(item => Math.hypot(item.position[0] - x, item.position[2] - z) < spacing)) continue;

    const normal = terrainNormalAt(terrain, x, z, paths);
    const slope = Math.acos(clamp(normal[1], -1, 1)) * 180 / Math.PI;
    if (slope > Number(species.maxSlope || 42)) continue;
    const scale = Number(species.scaleMin || 0.85) + random() * (Number(species.scaleMax || 1.2) - Number(species.scaleMin || 0.85));
    const y = terrainHeightAt(terrain, x, z, paths) - Number(species.rootBurial || 0.08);
    placements.push({
      position: [x, y, z],
      rotation: [0, random() * 360, 0],
      scale: [scale, scale, scale],
      slope,
      chunk: [Math.floor(x / 32), Math.floor(z / 32)]
    });
  }
  return placements;
}
