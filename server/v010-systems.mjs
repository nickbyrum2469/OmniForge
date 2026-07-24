const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const now = () => new Date().toISOString();

export function seededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function terrainHeightAt(terrain, x, z) {
  if (!terrain) return 0;
  const p = terrain.transform?.position || [0, 0, 0];
  const s = terrain.transform?.scale || [1, 1, 1];
  const props = terrain.properties || {};
  const lx = (x - p[0]) / (s[0] || 1);
  const lz = (z - p[2]) / (s[2] || 1);
  const seed = Number(props.seed || 0);
  const f = Number(props.frequency || 0.05);
  const a = Number(props.amplitude || 0);
  const n1 = Math.sin((lx + seed * 2.13) * f) * Math.cos((lz - seed * 0.73) * f * 1.17);
  const n2 = Math.sin((lx + lz) * f * 0.47 + seed * 1.91) * 0.48;
  const n3 = Math.cos((lx * 0.37 - lz * 0.61) * f * 1.9 - seed) * 0.22;
  const n4 = Math.sin((lx * 0.73 + lz * 0.19) * f * 3.4 + seed * 0.31) * 0.09;
  return p[1] + (n1 + n2 + n3 + n4) * a * (s[1] || 1);
}

export function terrainNormalAt(terrain, x, z, step = 0.35) {
  const hL = terrainHeightAt(terrain, x - step, z);
  const hR = terrainHeightAt(terrain, x + step, z);
  const hD = terrainHeightAt(terrain, x, z - step);
  const hU = terrainHeightAt(terrain, x, z + step);
  const nx = hL - hR;
  const ny = step * 2;
  const nz = hD - hU;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function segmentDistance(x, z, a, b) {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const wx = x - a[0];
  const wz = z - a[1];
  const den = vx * vx + vz * vz || 1;
  const t = clamp((wx * vx + wz * vz) / den, 0, 1);
  return Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
}

export function distanceToPaths(paths, x, z) {
  let nearest = Infinity;
  for (const object of paths || []) {
    const pts = object.properties?.points || [];
    const ox = object.transform?.position?.[0] || 0;
    const oz = object.transform?.position?.[2] || 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      nearest = Math.min(
        nearest,
        segmentDistance(x, z, [pts[i][0] + ox, pts[i][1] + oz], [pts[i + 1][0] + ox, pts[i + 1][1] + oz]) - Number(object.properties?.width || 3) / 2
      );
    }
  }
  return nearest;
}

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
      starIntensity: 1,
      starDensity: 0.72,
      milkyWayIntensity: 0.35,
      moonSize: 1,
      moonPhase: 0.72,
      auroraIntensity: 0,
      shootingStarRate: 0.05,
      suns: [{ id: 'sun-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1 }],
      moons: [{ id: 'moon-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1, phase: 0.72 }],
      ...existing.sky
    },
    clouds: {
      quality: 'layered',
      coverage: 0.25,
      density: 0.45,
      altitude: 2200,
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
    ambientColor: hex(mix([55, 69, 104], [190, 207, 224], day)),
    ambientIntensity: (0.08 + day * 0.42 + Number(world.lighting.indirectStrength || 0.4) * 0.12) * (0.72 + cloudAttenuation * 0.28),
    fogNear: Math.max(6, Number(world.atmosphere.visibilityKm || 120) * 0.55 * fogMultiplier),
    fogFar: Math.max(22, Number(world.atmosphere.visibilityKm || 120) * 2.2 * fogMultiplier),
    exposure: clamp(Number(world.atmosphere.exposure || 1) * (0.82 + day * 0.18) * (0.88 + cloudAttenuation * 0.12), 0.2, 3),
    weatherWetness: clamp(Math.max(Number(world.weather.wetness || 0), precipitation * (weatherPreset === 'snow' ? 0.2 : 0.85)), 0, 1),
    weatherSnow: clamp(Math.max(Number(world.weather.snow || 0), weatherPreset === 'snow' ? precipitation : 0), 0, 1),
    windDirection: Array.isArray(world.weather.windDirection) ? world.weather.windDirection.slice(0, 3) : [1, 0, 0.25],
    windStrength: clamp(Math.max(Number(world.weather.windStrength || 0), weatherPreset === 'storm' ? 0.88 : weatherPreset === 'rain' ? 0.48 : 0), 0, 1),
    cloudCoverage,
    cloudDensity,
    cloudAttenuation,
    starIntensity: clamp(Number(world.sky.starIntensity || 0) * night * (1 - cloudCoverage * 0.8), 0, 3),
    starDensity: clamp(Number(world.sky.starDensity || 0.72), 0, 1),
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
    || scene.objects.find(object => object.type === 'directionalLight');
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
  const azimuth = (hour / 24) * 360 - 90;
  sun.name = 'Sun';
  sun.transform.rotation = [90 - elevation * 82, azimuth, 0];
  sun.properties = {
    ...(sun.properties || {}),
    celestialRole: 'sun',
    color: hex(mix([255, 123, 79], [255, 244, 214], day)),
    intensity: Number(world.lighting.sunIntensity || 3.2) * Math.max(0.015, day) * cloudAttenuation,
    castsShadows: true,
    shadowQuality: world.lighting.shadowQuality,
    hybridLightingProfile: world.lighting.profile
  };
  return { hour, day, night, twilight, elevation, sunId: sun.id };
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

    const normal = terrainNormalAt(terrain, x, z);
    const slope = Math.acos(clamp(normal[1], -1, 1)) * 180 / Math.PI;
    if (slope > Number(species.maxSlope || 42)) continue;
    const scale = Number(species.scaleMin || 0.85) + random() * (Number(species.scaleMax || 1.2) - Number(species.scaleMin || 0.85));
    const y = terrainHeightAt(terrain, x, z) - Number(species.rootBurial || 0.08);
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
