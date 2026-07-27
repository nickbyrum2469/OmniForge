import { DEG, cameraForward, cameraRight, cross, normalize, scale, hexToRgb } from './math.js';
import { directionFromAzimuthElevation } from './celestial-mechanics.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const smoothstep = (a, b, value) => {
  const t = clamp01((Number(value) - a) / ((b - a) || 1));
  return t * t * (3 - 2 * t);
};

function color(value, fallback) {
  return hexToRgb(typeof value === 'string' ? value : fallback);
}

function horizontalWind(value) {
  const source = Array.isArray(value) ? value : [1, 0, 0.25];
  const x = Number(source[0]) || 0;
  const z = Number(source[2] ?? source[1]) || 0;
  const magnitude = Math.hypot(x, z) || 1;
  return [x / magnitude, z / magnitude];
}

function celestialObject(scene, role) {
  return scene?.objects?.find(item => item.properties?.celestialRole === role) || null;
}

function celestialObjectDirection(scene, role, fallback) {
  const object = celestialObject(scene, role);
  if (!object) return fallback;
  const azimuth = Number(object.properties?.azimuth);
  const elevation = Number(object.properties?.elevation);
  if (Number.isFinite(azimuth) && Number.isFinite(elevation)) {
    return normalize(directionFromAzimuthElevation(azimuth, elevation));
  }
  const rotation = object.transform?.rotation || [0, 0, 0];
  return normalize(directionFromAzimuthElevation(Number(rotation[1] || 0), Number(rotation[0] || 0)));
}

export function cameraSkyBasis(camera = {}) {
  const forward = cameraForward(camera);
  const right = cameraRight(camera);
  const up = normalize(cross(right, forward));
  return { forward, right, up };
}

export function skyRayFromNdc(camera = {}, ndcX = 0, ndcY = 0, aspect = 1) {
  const { forward, right, up } = cameraSkyBasis(camera);
  const tanHalfFov = Math.tan((Number(camera.fov || 62) * DEG) * 0.5);
  return normalize([
    forward[0] + right[0] * Number(ndcX) * tanHalfFov * Number(aspect || 1) + up[0] * Number(ndcY) * tanHalfFov,
    forward[1] + right[1] * Number(ndcX) * tanHalfFov * Number(aspect || 1) + up[1] * Number(ndcY) * tanHalfFov,
    forward[2] + right[2] * Number(ndcX) * tanHalfFov * Number(aspect || 1) + up[2] * Number(ndcY) * tanHalfFov
  ]);
}

export function normalizeEnvironmentState(scene = {}, lights = {}, timeSeconds = 0) {
  const settings = scene.settings || {};
  const world = settings.environmentV010 || {};
  const worldClouds = world.clouds || {};
  const worldWeather = world.weather || {};
  const worldSky = world.sky || {};
  const worldAtmosphere = world.atmosphere || {};
  const worldLighting = world.lighting || {};
  const moonObject = celestialObject(scene, 'moon');
  const sunObject = celestialObject(scene, 'sun');
  const lightDirection = Array.isArray(lights.dir) ? lights.dir : [0.45, -0.8, 0.25];
  const fallbackSun = normalize(scale(lightDirection, -1));
  const sunDirection = celestialObjectDirection(scene, 'sun', fallbackSun);
  const automaticMoon = normalize([-sunDirection[0] * 0.94, -sunDirection[1], -sunDirection[2] * 0.94 + 0.18]);
  const moonDirection = celestialObjectDirection(scene, 'moon', automaticMoon);
  const sunElevationDegrees = Math.asin(clamp(sunDirection[1], -1, 1)) / DEG;
  // Visual lighting is evaluated continuously from the current interpolated
  // solar direction. Server values are synchronization anchors, not render buckets.
  const derivedDayFactor = smoothstep(-6, 8, sunElevationDegrees);
  const derivedNightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees);
  const twilightRise = smoothstep(-18, -6, sunElevationDegrees);
  const twilightFall = 1 - smoothstep(-2, 12, sunElevationDegrees);
  const derivedTwilightFactor = clamp01(twilightRise * twilightFall);
  // Live scenes always consume the continuously interpolated Sun. Authored
  // factors remain a compatibility fallback only for headless snapshots that
  // contain no authoritative celestial object.
  const authoredNight = Number(world.nightFactor);
  const authoredTwilight = Number(world.twilightFactor);
  const dayFactor = sunObject
    ? derivedDayFactor
    : Number.isFinite(authoredNight) ? 1 - clamp01(authoredNight) : derivedDayFactor;
  const nightFactor = sunObject
    ? derivedNightFactor
    : Number.isFinite(authoredNight) ? clamp01(authoredNight) : derivedNightFactor;
  const twilightFactor = sunObject
    ? derivedTwilightFactor
    : Number.isFinite(authoredTwilight) ? clamp01(authoredTwilight) : derivedTwilightFactor;
  const cloudCoverage = clamp01(settings.cloudCoverage ?? worldClouds.coverage ?? 0.1);
  const cloudDensity = clamp01(settings.cloudDensity ?? worldClouds.density ?? 0.28);
  const starIntensity = Math.max(0, Number(settings.starIntensity ?? worldSky.starIntensity ?? 1));
  const starDensity = clamp(settings.starDensity ?? worldSky.starDensity ?? 0.55, 0.01, 2);
  const starExtinction = clamp(worldSky.starDaylightExtinction ?? 1.8, 0.1, 8);
  const daylightSuppression = Math.pow(Math.max(0, 1 - dayFactor), starExtinction * 3.2);
  const weather = String(settings.weatherPreset || worldWeather.preset || 'clear');
  const weatherDarkening = ({ overcast: 0.18, rain: 0.26, storm: 0.44, snow: 0.1, fog: 0.14 })[weather] || 0;
  const windDirection = settings.windDirection ?? worldWeather.windDirection;
  const planetEnabled = Boolean(worldSky.planetEnabled);
  const planetDirection = normalize(directionFromAzimuthElevation(worldSky.planetAzimuth ?? 215, worldSky.planetElevation ?? 28));
  const celestialMode = String(worldSky.celestialMode || 'astronomical');
  const physicalCelestial = celestialMode === 'astronomical';
  const authoredSunSize = Number(worldSky.sunSize ?? worldSky.suns?.[0]?.size ?? 1);
  const authoredMoonSize = Number(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25);
  const sunSize = physicalCelestial ? clamp(authoredSunSize, 0.85, 1.15) : clamp(authoredSunSize, 0.1, 12);
  const moonSize = physicalCelestial ? clamp(authoredMoonSize, 0.85, 1.35) : clamp(authoredMoonSize, 0.1, 32);
  const sunAngularRadius = 0.2666 * sunSize;
  const sunVisibility = smoothstep(-sunAngularRadius, sunAngularRadius, sunElevationDegrees);
  const moonBrightness = clamp(worldSky.moonBrightness ?? worldSky.moons?.[0]?.radiance ?? 0.92, 0, 8);
  const moonIllumination = clamp01(moonObject?.properties?.illumination ?? moonObject?.properties?.phase ?? worldSky.moonPhase ?? 0.72);
  const moonVisibility = clamp01(moonObject?.properties?.skyVisibility ?? 1);
  const solarEclipseFactor = clamp01(moonObject?.properties?.solarEclipse ?? sunObject?.properties?.solarEclipse ?? 0);
  const lunarEclipseFactor = clamp01(moonObject?.properties?.lunarEclipse ?? 0);
  const exposureMultiplier = Math.max(0.05, Number(lights.exposure ?? settings.exposure ?? worldAtmosphere.exposure ?? 0.72));
  const haze = clamp(worldAtmosphere.haze ?? 0.012, 0, 1);
  const mie = clamp(worldAtmosphere.mie ?? 0.055, 0, 1);
  const humidity = clamp(worldAtmosphere.humidity ?? 0.08, 0, 1);
  const weatherFog = clamp(worldWeather.fog ?? 0, 0, 1);

  return {
    sunDirection,
    moonDirection,
    celestialMode,
    physicalCelestial,
    sunColor: Array.isArray(lights.color) ? lights.color.map(Number) : [1, 0.94, 0.78],
    moonColor: color(worldSky.moonColor ?? settings.moonColor, '#c9d4e4'),
    zenithColor: color(settings.skyTop, '#1f65b7'),
    horizonColor: color(settings.skyBottom, '#69a9d8'),
    groundColor: color(settings.skyGround, '#17242d'),
    fogColor: color(settings.skyBottom, '#69a9d8'),
    dayFactor: clamp01(dayFactor),
    nightFactor: clamp01(nightFactor),
    twilightFactor,
    atmosphereRayleigh: clamp(worldAtmosphere.rayleigh ?? 1.05, 0, 3),
    atmosphereMie: mie,
    atmosphereMieAnisotropy: clamp(worldAtmosphere.mieAnisotropy ?? 0.78, 0, 0.95),
    atmosphereOzone: clamp(worldAtmosphere.ozone ?? 1, 0, 3),
    atmosphereDust: clamp(worldAtmosphere.dust ?? 0.02, 0, 1),
    aerialPerspective: clamp(worldAtmosphere.aerialPerspective ?? 1, 0, 3),
    atmosphereHaze: haze,
    atmosphereHumidity: humidity,
    weatherFog,
    dayFogMultiplier: clamp(worldAtmosphere.dayFogMultiplier ?? 0.12, 0, 2),
    nightFogMultiplier: clamp(worldAtmosphere.nightFogMultiplier ?? 0.3, 0, 2),
    starVisibility: clamp01(nightFactor * starIntensity * daylightSuppression),
    starDensity,
    starBrightness: clamp(worldSky.starBrightness ?? 0.82, 0, 8),
    starTwinkleAmount: clamp01(worldSky.starTwinkleAmount ?? 0.42),
    starTwinkleSpeed: clamp(worldSky.starTwinkleSpeed ?? 0.85, 0, 12),
    starSizeMin: physicalCelestial
      ? clamp(worldSky.starSizeMin ?? 0.18, 0.05, 0.35)
      : clamp(worldSky.starSizeMin ?? 0.18, 0.02, 4),
    starSizeMax: physicalCelestial
      ? clamp(worldSky.starSizeMax ?? 0.9, 0.2, 1.1)
      : clamp(worldSky.starSizeMax ?? 1.35, 0.02, 8),
    starColorVariation: clamp01(worldSky.starColorVariation ?? 0.72),
    starRayStrength: clamp(worldSky.starRayStrength ?? 0.24, 0, 2),
    starRayLength: clamp(worldSky.starRayLength ?? 1.15, 0.1, 4),
    starHeroFraction: physicalCelestial
      ? clamp(worldSky.starHeroFraction ?? 0.004, 0.001, 0.008)
      : clamp01(worldSky.starHeroFraction ?? 0.035),
    starSeed: Number(worldSky.starSeed ?? 1337),
    starDaylightExtinction: starExtinction,
    milkyWayIntensity: Math.max(0, Number(worldSky.milkyWayIntensity ?? 0.22)) * nightFactor * daylightSuppression,
    milkyWayWidth: clamp(worldSky.milkyWayWidth ?? 0.22, 0.02, 0.8),
    milkyWayDetail: clamp(worldSky.milkyWayDetail ?? 1.15, 0, 3),
    milkyWayOrientation: Number(worldSky.milkyWayOrientation ?? 22),
    milkyWayDust: clamp01(worldSky.milkyWayDust ?? 0.7),
    milkyWayWarp: clamp(worldSky.milkyWayWarp ?? 0.48, 0, 2),
    milkyWayClumping: clamp(worldSky.milkyWayClumping ?? 0.72, 0, 2),
    milkyWayCoreStrength: clamp(worldSky.milkyWayCoreStrength ?? 0.65, 0, 3),
    milkyWayWidthVariation: clamp(worldSky.milkyWayWidthVariation ?? 0.6, 0, 2),
    milkyWayColor: color(worldSky.milkyWayColor, '#91a4cf'),
    sunAngularRadius,
    sunVisibility,
    sunGlow: clamp(worldSky.sunGlow ?? 0.5, 0, 5),
    solarEclipseCoverage: clamp(worldSky.solarEclipseCoverage ?? 1.08, 0.5, 2),
    moonAngularRadius: 0.259 * moonSize,
    moonGlow: clamp(worldSky.moonGlow ?? 0.28, 0, 5),
    moonPhase: moonIllumination,
    moonIllumination,
    moonWaxing: moonObject?.properties?.waxing !== false,
    moonVisibility,
    moonEarthshine: clamp01(moonObject?.properties?.earthshine ?? worldSky.moonEarthshine ?? 0.06),
    moonBrightness,
    moonDetail: clamp(worldSky.moonDetail ?? 1.45, 0, 3),
    moonCraterStrength: clamp(worldSky.moonCraterStrength ?? 0.85, 0, 2),
    moonMariaStrength: clamp(worldSky.moonMariaStrength ?? 0.62, 0, 2),
    moonSurfaceContrast: clamp(worldSky.moonSurfaceContrast ?? 1.18, 0.2, 3),
    moonPatternRotation: Number(worldSky.moonPatternRotation ?? -12),
    moonPatternSeed: Number(worldSky.moonPatternSeed ?? 2718),
    moonReliefStrength: clamp(worldSky.moonReliefStrength ?? 0.38, 0, 2),
    moonLimbDarkening: clamp01(worldSky.moonLimbDarkening ?? 0.28),
    moonStyle: String(worldSky.moonStyle || 'earth-like'),
    moonLightIntensity: Math.max(0, Number(moonObject?.properties?.intensity ?? worldLighting.moonIntensity ?? 0.14)),
    lunarEclipseFactor,
    solarEclipseFactor,
    celestialEvent: String(moonObject?.properties?.eventType || 'none'),
    planetEnabled,
    planetDirection,
    planetColor: color(worldSky.planetColor, '#d49a72'),
    planetAngularRadius: clamp(worldSky.planetSize ?? 4.5, 0.1, 18) * 0.259,
    planetBrightness: clamp(worldSky.planetBrightness ?? 0.8, 0, 5),
    planetRings: clamp01(worldSky.planetRings ?? 0.65),
    cloudCoverage,
    cloudDensity,
    cloudWindDirection: horizontalWind(windDirection),
    cloudWindSpeed: Math.max(0, Number(settings.cloudWindSpeed ?? worldClouds.windSpeed ?? 12)),
    cloudSeed: Number(settings.cloudSeed ?? worldClouds.seed ?? 1337),
    cloudQuality: String(settings.cloudQuality || worldClouds.quality || settings.atmosphereQuality || worldAtmosphere.quality || 'compatibility'),
    cloudAltitude: Math.max(50, Number(worldClouds.altitude ?? 2200)),
    cloudThickness: Math.max(50, Number(worldClouds.thickness ?? 1800)),
    cloudShadowStrength: clamp01(worldClouds.shadowStrength ?? 0.2),
    weather,
    weatherDarkening,
    exposure: exposureMultiplier,
    exposureEV: Number.isFinite(Number(settings.displayExposureEV)) ? Number(settings.displayExposureEV) : Math.log2(exposureMultiplier),
    saturation: clamp(worldAtmosphere.saturation ?? settings.colorSaturation ?? 1.06, 0, 3),
    contrast: clamp(worldAtmosphere.contrast ?? settings.colorContrast ?? 1.04, 0.2, 3),
    vibrance: clamp(worldAtmosphere.vibrance ?? settings.colorVibrance ?? 0.1, -1, 1),
    toneMapper: String(worldAtmosphere.toneMapper || settings.toneMapper || 'neutral'),
    timeSeconds: Number(timeSeconds) || 0
  };
}
