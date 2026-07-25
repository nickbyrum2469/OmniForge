import { DEG, cameraForward, cameraRight, cross, normalize, scale, hexToRgb } from './math.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
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
  const lightDirection = Array.isArray(lights.dir) ? lights.dir : [0.45, -0.8, 0.25];
  const sunDirection = normalize(scale(lightDirection, -1));
  const moonDirection = normalize([-sunDirection[0] * 0.94, -sunDirection[1], -sunDirection[2] * 0.94 + 0.18]);
  const geometricDay = smoothstep(-0.08, 0.14, sunDirection[1]);
  const authoredNight = Number(settings.environmentV010?.nightFactor);
  const dayFactor = Number.isFinite(authoredNight) ? 1 - clamp01(authoredNight) : geometricDay;
  const nightFactor = 1 - dayFactor;
  const twilightFactor = clamp01(1 - smoothstep(0.08, 0.52, Math.abs(sunDirection[1])));
  const cloudCoverage = clamp01(settings.cloudCoverage ?? settings.environmentV010?.cloudCoverage ?? 0.32);
  const cloudDensity = clamp01(settings.cloudDensity ?? 0.52);
  const starIntensity = Math.max(0, Number(settings.starIntensity ?? settings.environmentV010?.starIntensity ?? 1));
  const starDensity = Math.max(0.08, Math.min(2, Number(settings.starDensity ?? 0.72)));
  const weather = String(settings.weatherPreset || settings.environmentV010?.weatherPreset || 'clear');
  const weatherDarkening = ({ overcast: 0.24, rain: 0.3, storm: 0.46, snow: 0.12, fog: 0.18 })[weather] || 0;

  return {
    sunDirection,
    moonDirection,
    sunColor: Array.isArray(lights.color) ? lights.color.map(Number) : [1, 0.95, 0.82],
    moonColor: color(settings.moonColor, '#a9c5eb'),
    zenithColor: color(settings.skyTop, '#183a68'),
    horizonColor: color(settings.skyBottom, '#8ca6b8'),
    groundColor: color(settings.skyGround, '#18222a'),
    fogColor: color(settings.skyBottom, '#8ca6b8'),
    dayFactor: clamp01(dayFactor),
    nightFactor: clamp01(nightFactor),
    twilightFactor,
    starVisibility: clamp01(nightFactor * starIntensity),
    starDensity,
    cloudCoverage,
    cloudDensity,
    cloudWindDirection: horizontalWind(settings.windDirection),
    cloudWindSpeed: Math.max(0, Number(settings.cloudWindSpeed ?? settings.windSpeed ?? 12)),
    cloudSeed: Number(settings.cloudSeed ?? 1337),
    cloudQuality: String(settings.cloudQuality || settings.atmosphereQuality || 'compatibility'),
    weather,
    weatherDarkening,
    exposure: Math.max(0.05, Number(lights.exposure ?? settings.exposure ?? 1)),
    timeSeconds: Number(timeSeconds) || 0
  };
}
