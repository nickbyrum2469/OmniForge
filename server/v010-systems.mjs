import { terrainHeightAt as sharedTerrainHeightAt, terrainNormalAt as sharedTerrainNormalAt, distanceToPaths as sharedDistanceToPaths } from '../app/worldgen.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
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
  return {
    schemaVersion: 1,
    time: {
      enabled: true,
      hours: 12,
      timeScale: 60,
      dayLengthSeconds: 1440,
      latitude: 37.3,
      dayOfYear: 172,
      ...existing.time
    },
    lighting: {
      profile: 'balanced',
      sunIntensity: 3.2,
      moonIntensity: 0.12,
      shadowQuality: 'balanced',
      indirectStrength: 0.42,
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
      haze: 0.08,
      humidity: 0.22,
      dust: 0.02,
      visibilityKm: 120,
      aerialPerspective: 1,
      exposure: 1,
      ...existing.atmosphere
    },
    sky: {
      celestialMode: 'astronomical',
      sunAzimuth: -90,
      sunElevation: 45,
      sunSize: 1,
      sunGlow: 1,
      starIntensity: 1,
      starDensity: 0.72,
      starDaylightExtinction: 1.35,
      starSizeMin: 0.55,
      starSizeMax: 2.4,
      starBrightnessVariation: 0.62,
      starColorVariation: 0.38,
      starTwinkleAmount: 0.48,
      starTwinkleSpeed: 1,
      starSeed: 1337,
      starRotation: 0,
      starHorizonFade: 0.18,
      starWarmColor: '#ffd8aa',
      starCoolColor: '#a9c9ff',
      milkyWayIntensity: 0.35,
      milkyWayWidth: 16,
      milkyWayDetail: 1.25,
      milkyWayDust: 0.68,
      milkyWayCore: 0.78,
      milkyWayAzimuth: 18,
      milkyWayElevation: 62,
      milkyWayRotation: 27,
      milkyWayColor: '#7187bd',
      milkyWayCoreColor: '#e2c9a5',
      moonAzimuth: 90,
      moonElevation: 32,
      moonSize: 1.45,
      moonPhase: 0.72,
      moonBrightness: 1,
      moonGlow: 0.7,
      moonDetail: 1,
      moonColor: '#a9c5eb',
      planetEnabled: false,
      planetAzimuth: 215,
      planetElevation: 28,
      planetSize: 4.5,
      planetColor: '#d49a72',
      planetBrightness: 0.8,
      planetRings: 0.65,
      auroraIntensity: 0,
      auroraColor: '#58e7c1',
      auroraSecondaryColor: '#7668ff',
      auroraSpeed: 0.35,
      auroraScale: 1,
      shootingStarRate: 0.05,
      suns: [{ id: 'sun-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1 }],
      moons: [{ id: 'moon-primary', enabled: true, size: 1.45, radiance: 1, orbitSpeed: 1, phase: 0.72 }],
      ...existing.sky
    },
    clouds: {
      quality: 'layered',
      coverage: 0.25,
      density: 0.45,
      altitude: 2200,
      thickness: 1800,
      windSpeed: 12,
      shadowStrength: 0.28,
      ...existing.clouds
    },
    weather: {
      preset: 'clear',
      precipitation: 0,
      fog: 0.04,
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
  const hour = ((Number(world.time.hours) || 0) % 24 + 24) % 24;
  const angle = ((hour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const astronomicalElevationDegrees = Math.asin(clamp(elevation, -1, 1)) * 180 / Math.PI;
  const celestialMode = String(world.sky.celestialMode || 'astronomical');
  const automaticSunAzimuth = (hour / 24) * 360 - 90;
  const sunAzimuth = celestialMode === 'manual' ? Number(world.sky.sunAzimuth ?? automaticSunAzimuth) : automaticSunAzimuth;
  const sunElevationDegrees = celestialMode === 'manual' ? Number(world.sky.sunElevation ?? astronomicalElevationDegrees) : astronomicalElevationDegrees;
  const moonAzimuth = celestialMode === 'manual' ? Number(world.sky.moonAzimuth ?? sunAzimuth + 180) : sunAzimuth + 180;
  const moonElevationDegrees = celestialMode === 'manual' ? Number(world.sky.moonElevation ?? -sunElevationDegrees) : -sunElevationDegrees * 0.92 + 5;
  const day = clamp((elevation + 0.08) / 0.32, 0, 1);
  const twilight = clamp(1 - Math.abs(elevation) / 0.22, 0, 1) * (1 - day * 0.55);
  const night = 1 - day;
  const sunrise = [238, 108, 63];
  const dayTop = [70, 139, 210];
  const dayBottom = [174, 211, 237];
  const nightTop = [3, 8, 24];
  const nightBottom = [12, 22, 45];
  const top = mix(nightTop, dayTop, day);
  const bottom = mix(nightBottom, dayBottom, day);
  for (let i = 0; i < 3; i += 1) bottom[i] = Math.round(bottom[i] * (1 - twilight * 0.35) + sunrise[i] * twilight * 0.35);

  const weatherPreset = String(world.weather.preset || 'clear');
  const presetPrecipitation = { rain: 0.65, storm: 1, snow: 0.55 }[weatherPreset] || 0;
  const presetFog = { fog: 0.72, rain: 0.18, storm: 0.24, snow: 0.14, overcast: 0.1 }[weatherPreset] || 0;
  const precipitation = clamp(Math.max(Number(world.weather.precipitation || 0), presetPrecipitation), 0, 1);
  const weatherFog = clamp(Math.max(Number(world.weather.fog || 0), presetFog), 0, 1);
  const cloudCoverage = clamp(Number(world.clouds.coverage || 0), 0, 1);
  const cloudDensity = clamp(Number(world.clouds.density || 0), 0, 1);
  const cloudAttenuation = 1 - clamp(cloudCoverage * cloudDensity * Number(world.clouds.shadowStrength || 0.28), 0, 0.82);
  const atmosphericHaze = clamp(Number(world.atmosphere.haze || 0) + Number(world.atmosphere.mie || 0) * 0.45 + Number(world.atmosphere.humidity || 0) * 0.18, 0, 0.9);
  const fogMultiplier = Math.max(0.04, (1 - weatherFog * 0.88) * (1 - atmosphericHaze * 0.55));
  scene.settings = {
    ...(scene.settings || {}),
    skyTop: hex(top),
    skyBottom: hex(bottom),
    ambientColor: hex(mix([24, 36, 70], [142, 172, 211], day)),
    ambientIntensity: (0.055 + day * 0.28 + Number(world.lighting.indirectStrength || 0.4) * 0.09) * (0.78 + cloudAttenuation * 0.22),
    fogNear: Math.max(12, Number(world.atmosphere.visibilityKm || 120) * 1.1 * fogMultiplier),
    fogFar: Math.max(48, Number(world.atmosphere.visibilityKm || 120) * 4.8 * fogMultiplier),
    exposure: clamp(Number(world.atmosphere.exposure || 1) * (0.92 + day * 0.08) * (0.96 + cloudAttenuation * 0.04), 0.2, 2.2),
    weatherWetness: clamp(Math.max(Number(world.weather.wetness || 0), precipitation * (weatherPreset === 'snow' ? 0.2 : 0.85)), 0, 1),
    weatherSnow: clamp(Math.max(Number(world.weather.snow || 0), weatherPreset === 'snow' ? precipitation : 0), 0, 1),
    windDirection: Array.isArray(world.weather.windDirection) ? world.weather.windDirection.slice(0, 3) : [1, 0, 0.25],
    windStrength: clamp(Math.max(Number(world.weather.windStrength || 0), weatherPreset === 'storm' ? 0.88 : weatherPreset === 'rain' ? 0.48 : 0), 0, 1),
    cloudCoverage,
    cloudDensity,
    cloudAttenuation,
    starIntensity: clamp(Number(world.sky.starIntensity || 0) * night * (1 - cloudCoverage * 0.8), 0, 3),
    starDensity: clamp(Number(world.sky.starDensity || 0.72), 0.08, 2),
    milkyWayIntensity: clamp(Number(world.sky.milkyWayIntensity || 0) * night * (1 - cloudCoverage * 0.7), 0, 3),
    auroraIntensity: clamp(Number(world.sky.auroraIntensity || 0) * night * (1 - cloudCoverage * 0.5), 0, 3),
    atmosphereQuality: world.atmosphere.quality || 'balanced',
    environmentV010: {
      ...world,
      sunElevation: elevation,
      sunDayFactor: day,
      nightFactor: night,
      twilightFactor: twilight
    }
  };

  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')
    || scene.objects.find(object => object.type === 'directionalLight' && String(object.name || '').trim().toLowerCase() === 'sun');
  if (!sun) {
    sun = {
      id: 'directionalLight-v010-sun',
      type: 'directionalLight',
      name: 'Sun',
      visible: true,
      locked: false,
      parentId: null,
      transform: { position: [0, 20, 0], rotation: [45, -35, 0], scale: [1, 1, 1] },
      properties: {},
      components: []
    };
    scene.objects.push(sun);
  }
  sun.name = 'Sun';
  sun.transform.rotation = [-sunElevationDegrees, sunAzimuth + 180, 0];
  sun.properties = {
    ...(sun.properties || {}),
    celestialRole: 'sun',
    color: hex(mix([255, 123, 79], [255, 244, 214], day)),
    intensity: Number(world.lighting.sunIntensity || 3.2) * Math.max(0.015, day) * cloudAttenuation,
    azimuth: sunAzimuth,
    elevation: sunElevationDegrees,
    angularSize: Number(world.sky.sunSize ?? 1),
    glow: Number(world.sky.sunGlow ?? 1),
    castsShadows: true,
    shadowQuality: world.lighting.shadowQuality,
    hybridLightingProfile: world.lighting.profile
  };

  let moon = scene.objects.find(object => object.properties?.celestialRole === 'moon');
  if (!moon) {
    moon = {
      id: 'celestial-v010-moon',
      type: 'empty',
      name: 'Moon',
      visible: true,
      locked: false,
      parentId: null,
      transform: { position: [0, 0, 0], rotation: [32, 90, 0], scale: [1, 1, 1] },
      properties: {},
      components: []
    };
    scene.objects.push(moon);
  }
  moon.name = 'Moon';
  moon.transform.rotation = [moonElevationDegrees, moonAzimuth, 0];
  moon.properties = {
    ...(moon.properties || {}),
    celestialRole: 'moon',
    color: world.sky.moonColor || '#a9c5eb',
    intensity: Number(world.lighting.moonIntensity || 0.12) * night * Number(world.sky.moonBrightness || 1),
    phase: Number(world.sky.moonPhase ?? 0.72),
    angularSize: Number(world.sky.moonSize ?? 1.45),
    azimuth: moonAzimuth,
    elevation: moonElevationDegrees,
    brightness: Number(world.sky.moonBrightness ?? 1),
    glow: Number(world.sky.moonGlow ?? 0.7),
    detail: Number(world.sky.moonDetail ?? 1),
    castsShadows: false
  };
  return { hour, day, night, twilight, elevation, sunId: sun.id, moonId: moon.id, sunAzimuth, sunElevationDegrees, moonAzimuth, moonElevationDegrees };
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
