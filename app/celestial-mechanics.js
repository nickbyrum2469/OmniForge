const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const clamp01 = value => clamp(value, 0, 1);
const fract = value => value - Math.floor(value);
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((Number(value) - edge0) / ((edge1 - edge0) || 1));
  return t * t * (3 - 2 * t);
};
const wrapDegrees = value => ((Number(value) % 360) + 360) % 360;
const wrapRadians = value => ((Number(value) % TAU) + TAU) % TAU;
const signedRadians = value => {
  const wrapped = wrapRadians(value);
  return wrapped > Math.PI ? wrapped - TAU : wrapped;
};

export function directionFromAzimuthElevation(azimuthDegrees = 0, elevationDegrees = 0) {
  const azimuth = Number(azimuthDegrees || 0) * DEG;
  const elevation = Number(elevationDegrees || 0) * DEG;
  const horizontal = Math.cos(elevation);
  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    -Math.cos(azimuth) * horizontal
  ];
}

function dot(a, b) {
  return Number(a?.[0] || 0) * Number(b?.[0] || 0)
    + Number(a?.[1] || 0) * Number(b?.[1] || 0)
    + Number(a?.[2] || 0) * Number(b?.[2] || 0);
}

function eclipticToEquatorial(longitude, latitude = 0) {
  const obliquity = 23.43928 * DEG;
  const cosLatitude = Math.cos(latitude);
  const x = Math.cos(longitude) * cosLatitude;
  const y = Math.sin(longitude) * cosLatitude * Math.cos(obliquity) - Math.sin(latitude) * Math.sin(obliquity);
  const z = Math.sin(longitude) * cosLatitude * Math.sin(obliquity) + Math.sin(latitude) * Math.cos(obliquity);
  return {
    rightAscension: wrapRadians(Math.atan2(y, x)),
    declination: Math.asin(clamp(z, -1, 1))
  };
}

function horizontalFromHourAngle(hourAngle, declination, latitude) {
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinDeclination = Math.sin(declination);
  const cosDeclination = Math.cos(declination);
  const elevation = Math.asin(clamp(
    sinLatitude * sinDeclination + cosLatitude * cosDeclination * Math.cos(hourAngle),
    -1,
    1
  ));
  const azimuth = wrapRadians(Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * sinLatitude - Math.tan(declination) * cosLatitude
  ) + Math.PI);
  return { azimuth: azimuth * RAD, elevation: elevation * RAD };
}

function resolveAbsoluteDay(time = {}) {
  const day = Number.isFinite(Number(time.absoluteDay)) ? Number(time.absoluteDay) : Number(time.dayOfYear || 172);
  const hours = ((Number(time.hours || 0) % 24) + 24) % 24;
  return day + hours / 24;
}

function resolveSun(world, absoluteDay) {
  const time = world.time || {};
  const sky = world.sky || {};
  const latitude = clamp(time.latitude ?? 37.3, -89.5, 89.5) * DEG;
  const hours = ((Number(time.hours || 0) % 24) + 24) % 24;
  const dayOfYear = ((Math.floor(absoluteDay) % 365) + 365) % 365;
  const eclipticLongitude = wrapRadians((dayOfYear - 79.25) / 365.2422 * TAU);
  const equatorial = eclipticToEquatorial(eclipticLongitude, 0);
  const hourAngle = (hours - 12) * 15 * DEG;
  const astronomical = horizontalFromHourAngle(hourAngle, equatorial.declination, latitude);
  const manual = String(sky.celestialMode || 'astronomical') === 'manual';
  const azimuth = manual ? Number(sky.sunAzimuth ?? astronomical.azimuth) : astronomical.azimuth;
  const elevation = manual ? Number(sky.sunElevation ?? astronomical.elevation) : astronomical.elevation;
  return {
    azimuth: wrapDegrees(azimuth),
    elevation: clamp(elevation, -90, 90),
    direction: directionFromAzimuthElevation(azimuth, elevation),
    hourAngle,
    rightAscension: equatorial.rightAscension,
    declination: equatorial.declination,
    eclipticLongitude
  };
}

function resolveMoon(world, absoluteDay, sun) {
  const time = world.time || {};
  const sky = world.sky || {};
  const latitude = clamp(time.latitude ?? 37.3, -89.5, 89.5) * DEG;
  const synodicDays = clamp(sky.moonOrbitPeriodDays ?? 29.530588, 1, 2000);
  const draconicDays = clamp(sky.moonNodePeriodDays ?? 27.212221, 1, 2000);
  const epochDay = Number.isFinite(Number(sky.lunarEpochDay)) ? Number(sky.lunarEpochDay) : 157.234706;
  const nodeEpochDay = Number.isFinite(Number(sky.moonNodeEpochDay)) ? Number(sky.moonNodeEpochDay) : 151.1;
  const orbitOffset = Number(sky.moonOrbitOffset ?? 0);
  const ageFraction = fract((absoluteDay - epochDay) / synodicDays + orbitOffset);
  const ageDays = ageFraction * synodicDays;
  const elongation = ageFraction * TAU;
  const nodePhase = wrapRadians((absoluteDay - nodeEpochDay) / draconicDays * TAU + Number(sky.moonAscendingNode ?? 0) * DEG);
  const inclination = clamp(sky.moonOrbitInclination ?? 5.145, 0, 45) * DEG;
  const eclipticLatitude = inclination * Math.sin(nodePhase);
  const eclipticLongitude = wrapRadians(sun.eclipticLongitude + elongation);
  const equatorial = eclipticToEquatorial(eclipticLongitude, eclipticLatitude);
  const localSidereal = wrapRadians(sun.hourAngle + sun.rightAscension);
  const moonHourAngle = signedRadians(localSidereal - equatorial.rightAscension);
  const astronomical = horizontalFromHourAngle(moonHourAngle, equatorial.declination, latitude);
  const manual = String(sky.celestialMode || 'astronomical') === 'manual';
  const azimuth = manual ? Number(sky.moonAzimuth ?? astronomical.azimuth) : astronomical.azimuth;
  const elevation = manual ? Number(sky.moonElevation ?? astronomical.elevation) : astronomical.elevation;
  const direction = directionFromAzimuthElevation(azimuth, elevation);
  const separation = Math.acos(clamp(dot(sun.direction, direction), -1, 1));
  const geometricIllumination = clamp01((1 - Math.cos(separation)) * 0.5);
  const manualPhase = clamp01(sky.moonPhase ?? 0.72);
  const phaseMode = String(sky.moonPhaseMode || 'sun-relative');
  const illumination = phaseMode === 'manual' ? manualPhase : geometricIllumination;
  const waxing = ageFraction < 0.5;
  const nodeDistance = Math.abs(eclipticLatitude) * RAD;
  const solarAlignment = 1 - smoothstep(0.12, 1.45, separation * RAD);
  const lunarAlignment = 1 - smoothstep(0.15, 1.8, Math.abs(180 - separation * RAD));
  const nodeAlignment = 1 - smoothstep(0.18, 1.35, nodeDistance);
  const eclipseMode = String(sky.eclipseMode || 'automatic');
  let solarEclipse = eclipseMode === 'off' ? 0 : solarAlignment * nodeAlignment;
  let lunarEclipse = eclipseMode === 'off' ? 0 : lunarAlignment * nodeAlignment;
  if (eclipseMode === 'force-solar') solarEclipse = 1;
  if (eclipseMode === 'force-lunar') lunarEclipse = 1;
  if (eclipseMode === 'force-solar') lunarEclipse = 0;
  if (eclipseMode === 'force-lunar') solarEclipse = 0;
  const horizonVisibility = smoothstep(-1.5, 2.5, elevation);
  const earthshine = clamp01(sky.moonEarthshine ?? 0.08);
  const visibleFraction = clamp01(illumination + earthshine * (1 - illumination));
  const visibility = horizonVisibility * clamp01(0.04 + visibleFraction * 0.96 + solarEclipse * 0.8);
  const phaseName = illumination < 0.03 ? 'New Moon'
    : illumination > 0.97 ? 'Full Moon'
      : Math.abs(illumination - 0.5) < 0.08 ? (waxing ? 'First Quarter' : 'Last Quarter')
        : illumination < 0.5 ? (waxing ? 'Waxing Crescent' : 'Waning Crescent')
          : (waxing ? 'Waxing Gibbous' : 'Waning Gibbous');
  return {
    azimuth: wrapDegrees(azimuth),
    elevation: clamp(elevation, -90, 90),
    direction,
    ageDays,
    ageFraction,
    illumination,
    waxing,
    phaseName,
    eclipticLatitudeDegrees: eclipticLatitude * RAD,
    nodeDistanceDegrees: nodeDistance,
    solarEclipse: clamp01(solarEclipse),
    lunarEclipse: clamp01(lunarEclipse),
    visibility,
    horizonVisibility,
    earthshine,
    separationDegrees: separation * RAD
  };
}

export function evaluateCelestialSystem(world = {}) {
  const absoluteDay = resolveAbsoluteDay(world.time || {});
  const sun = resolveSun(world, absoluteDay);
  const moon = resolveMoon(world, absoluteDay, sun);
  const eventType = moon.solarEclipse > 0.05 ? 'solar-eclipse'
    : moon.lunarEclipse > 0.05 ? 'lunar-eclipse'
      : 'none';
  return {
    absoluteDay,
    sun,
    moon,
    event: {
      type: eventType,
      strength: Math.max(moon.solarEclipse, moon.lunarEclipse)
    }
  };
}

export function moonAgeForWorld(world = {}) {
  return evaluateCelestialSystem(world).moon.ageDays;
}

export function lunarPhaseLabel(world = {}) {
  return evaluateCelestialSystem(world).moon.phaseName;
}
