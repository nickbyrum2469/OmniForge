import { DEG, cameraForward, cameraRight, cross, normalize, scale, hexToRgb } from './math.js';

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

function galacticBasis(azimuthDegrees = 18, elevationDegrees = 62, rotationDegrees = 27) {
  const normal = directionFromAzimuthElevation(azimuthDegrees, elevationDegrees);
  const reference = Math.abs(normal[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(reference, normal));
  const up = normalize(cross(normal, right));
  const angle = Number(rotationDegrees || 0) * DEG;
  const axis = normalize([
    right[0] * Math.cos(angle) + up[0] * Math.sin(angle),
    right[1] * Math.cos(angle) + up[1] * Math.sin(angle),
    right[2] * Math.cos(angle) + up[2] * Math.sin(angle)
  ]);
  return { normal, axis };
}

export function directionFromAzimuthElevation(azimuthDegrees = 0, elevationDegrees = 0) {
  const azimuth = Number(azimuthDegrees || 0) * DEG;
  const elevation = Number(elevationDegrees || 0) * DEG;
  const horizontal = Math.cos(elevation);
  return normalize([
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    -Math.cos(azimuth) * horizontal
  ]);
}

function celestialObjectDirection(scene, role, fallback) {
  const object = scene?.objects?.find(item => item.properties?.celestialRole === role);
  if (!object) return fallback;
  const azimuth = Number(object.properties?.azimuth);
  const elevation = Number(object.properties?.elevation);
  if (Number.isFinite(azimuth) && Number.isFinite(elevation)) {
    return directionFromAzimuthElevation(azimuth, elevation);
  }
  const rotation = object.transform?.rotation || [0, 0, 0];
  return directionFromAzimuthElevation(Number(rotation[1] || 0), Number(rotation[0] || 0));
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
  const lightDirection = Array.isArray(lights.dir) ? lights.dir : [0.45, -0.8, 0.25];
  const sunDirection = normalize(scale(lightDirection, -1));
  const automaticMoon = normalize([-sunDirection[0] * 0.94, -sunDirection[1], -sunDirection[2] * 0.94 + 0.18]);
  const moonDirection = celestialObjectDirection(scene, 'moon', automaticMoon);
  const geometricDay = smoothstep(-0.08, 0.14, sunDirection[1]);
  const authoredNight = Number(world.nightFactor);
  const dayFactor = Number.isFinite(authoredNight) ? 1 - clamp01(authoredNight) : geometricDay;
  const nightFactor = 1 - dayFactor;
  const authoredTwilight = Number(world.twilightFactor);
  const twilightFactor = Number.isFinite(authoredTwilight)
    ? clamp01(authoredTwilight)
    : clamp01(1 - smoothstep(0.08, 0.52, Math.abs(sunDirection[1])));
  const cloudCoverage = clamp01(settings.cloudCoverage ?? worldClouds.coverage ?? 0.32);
  const cloudDensity = clamp01(settings.cloudDensity ?? worldClouds.density ?? 0.52);
  const starIntensity = Math.max(0, Number(settings.starIntensity ?? worldSky.starIntensity ?? 1));
  const starDensity = clamp(settings.starDensity ?? worldSky.starDensity ?? 0.72, 0.08, 2);
  const starExtinction = clamp(worldSky.starDaylightExtinction ?? 1.35, 0.1, 4);
  const daylightSuppression = Math.pow(Math.max(0, 1 - dayFactor), starExtinction * 3.2);
  const weather = String(settings.weatherPreset || worldWeather.preset || 'clear');
  const weatherDarkening = ({ overcast: 0.24, rain: 0.3, storm: 0.46, snow: 0.12, fog: 0.18 })[weather] || 0;
  const windDirection = settings.windDirection ?? worldWeather.windDirection;
  const planetEnabled = Boolean(worldSky.planetEnabled);
  const planetDirection = directionFromAzimuthElevation(worldSky.planetAzimuth ?? 215, worldSky.planetElevation ?? 28);
  const sunSize = clamp(worldSky.sunSize ?? worldSky.suns?.[0]?.size ?? 1, 0.1, 12);
  const moonSize = clamp(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.45, 0.1, 16);
  const moonBrightness = clamp(worldSky.moonBrightness ?? worldSky.moons?.[0]?.radiance ?? 1, 0, 8);
  const starSizeMin = clamp(worldSky.starSizeMin ?? 0.55, 0.1, 6);
  const starSizeMax = Math.max(starSizeMin, clamp(worldSky.starSizeMax ?? 2.4, 0.1, 8));
  const milkyWayBasis = galacticBasis(
    worldSky.milkyWayAzimuth ?? 18,
    worldSky.milkyWayElevation ?? 62,
    worldSky.milkyWayRotation ?? 27
  );

  return {
    sunDirection,
    moonDirection,
    sunColor: Array.isArray(lights.color) ? lights.color.map(Number) : [1, 0.95, 0.82],
    moonColor: color(worldSky.moonColor ?? settings.moonColor, '#a9c5eb'),
    zenithColor: color(settings.skyTop, '#183a68'),
    horizonColor: color(settings.skyBottom, '#8ca6b8'),
    groundColor: color(settings.skyGround, '#18222a'),
    fogColor: color(settings.skyBottom, '#8ca6b8'),
    dayFactor: clamp01(dayFactor),
    nightFactor: clamp01(nightFactor),
    twilightFactor,
    starVisibility: clamp01(nightFactor * starIntensity * daylightSuppression),
    starDensity,
    starDaylightExtinction: starExtinction,
    starSizeMin,
    starSizeMax,
    starBrightnessVariation: clamp01(worldSky.starBrightnessVariation ?? 0.62),
    starColorVariation: clamp01(worldSky.starColorVariation ?? 0.38),
    starTwinkleAmount: clamp01(worldSky.starTwinkleAmount ?? 0.48),
    starTwinkleSpeed: clamp(worldSky.starTwinkleSpeed ?? 1, 0, 8),
    starSeed: Number(worldSky.starSeed ?? 1337),
    starRotation: clamp(worldSky.starRotation ?? 0, -720, 720),
    starHorizonFade: clamp(worldSky.starHorizonFade ?? 0.18, 0.01, 0.8),
    starWarmColor: color(worldSky.starWarmColor, '#ffd8aa'),
    starCoolColor: color(worldSky.starCoolColor, '#a9c9ff'),
    milkyWayIntensity: Math.max(0, Number(worldSky.milkyWayIntensity ?? 0.35)) * nightFactor * daylightSuppression,
    milkyWayWidth: clamp(worldSky.milkyWayWidth ?? 16, 2, 45),
    milkyWayDetail: clamp(worldSky.milkyWayDetail ?? 1.25, 0.2, 4),
    milkyWayDust: clamp01(worldSky.milkyWayDust ?? 0.68),
    milkyWayCore: clamp(worldSky.milkyWayCore ?? 0.78, 0, 2),
    milkyWayNormal: milkyWayBasis.normal,
    milkyWayAxis: milkyWayBasis.axis,
    milkyWayColor: color(worldSky.milkyWayColor, '#7187bd'),
    milkyWayCoreColor: color(worldSky.milkyWayCoreColor, '#e2c9a5'),
    auroraIntensity: Math.max(0, Number(worldSky.auroraIntensity ?? 0)) * nightFactor * daylightSuppression,
    auroraColor: color(worldSky.auroraColor, '#58e7c1'),
    auroraSecondaryColor: color(worldSky.auroraSecondaryColor, '#7668ff'),
    auroraSpeed: clamp(worldSky.auroraSpeed ?? 0.35, 0, 4),
    auroraScale: clamp(worldSky.auroraScale ?? 1, 0.2, 4),
    sunAngularRadius: 0.2666 * sunSize,
    sunGlow: clamp(worldSky.sunGlow ?? 1, 0, 5),
    moonAngularRadius: 0.259 * moonSize,
    moonGlow: clamp(worldSky.moonGlow ?? 0.7, 0, 5),
    moonPhase: ((Number(worldSky.moonPhase ?? worldSky.moons?.[0]?.phase ?? 0.72) % 1) + 1) % 1,
    moonBrightness,
    moonDetail: clamp(worldSky.moonDetail ?? 1, 0, 3),
    moonLightIntensity: Math.max(0, Number(worldLighting.moonIntensity ?? 0.12)) * nightFactor * moonBrightness,
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
    cloudShadowStrength: clamp01(worldClouds.shadowStrength ?? 0.28),
    weather,
    weatherDarkening,
    exposure: Math.max(0.05, Number(lights.exposure ?? settings.exposure ?? worldAtmosphere.exposure ?? 1)),
    timeSeconds: Number(timeSeconds) || 0
  };
}
