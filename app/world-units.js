export const WORLD_UNITS_PER_METER = 1;
export const METERS_PER_KILOMETER = 1000;

export function metersToWorldUnits(meters) {
  return Math.max(0, Number(meters) || 0) * WORLD_UNITS_PER_METER;
}

export function kilometersToWorldUnits(kilometers) {
  return metersToWorldUnits(Math.max(0, Number(kilometers) || 0) * METERS_PER_KILOMETER);
}

export function atmosphereVisibilityRange({
  visibilityKm = 320,
  weatherFog = 0,
  haze = 0
} = {}) {
  const base = kilometersToWorldUnits(Math.max(0.025, Number(visibilityKm) || 320));
  const fogScale = Math.exp(-Math.max(0, Math.min(1, Number(weatherFog) || 0)) * 5.25);
  const hazeScale = Math.exp(-Math.max(0, Math.min(1, Number(haze) || 0)) * 3.2);
  const far = Math.max(metersToWorldUnits(25), base * fogScale * hazeScale);
  return { near: Math.max(0, far * 0.015), far };
}
