from __future__ import annotations

import re
from pathlib import Path


def _write(path: Path, text: str, changed: list[str], root: Path) -> None:
    current = path.read_text(encoding='utf-8')
    if current == text:
        return
    path.write_text(text, encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'Expected runtime contract was not found: {label}')
    return text.replace(old, new, 1)


def apply_environment(root: Path, changed: list[str]) -> None:
    path = root / 'app/environment-runtime.js'
    text = path.read_text(encoding='utf-8')
    text = _replace_once(
        text,
        """  const geometricDay = smoothstep(-0.08, 0.14, sunDirection[1]);
  const authoredNight = Number(world.nightFactor);
  const dayFactor = Number.isFinite(authoredNight) ? 1 - clamp01(authoredNight) : geometricDay;
  const nightFactor = 1 - dayFactor;
  const authoredTwilight = Number(world.twilightFactor);
  const twilightFactor = Number.isFinite(authoredTwilight)
    ? clamp01(authoredTwilight)
    : clamp01(1 - smoothstep(0.08, 0.52, Math.abs(sunDirection[1])));""",
        """  const sunElevationDegrees = Math.asin(clamp(sunDirection[1], -1, 1)) / DEG;
  // Visual lighting is evaluated continuously from the current interpolated
  // solar direction. Server values are synchronization anchors, not render buckets.
  const dayFactor = smoothstep(-6, 8, sunElevationDegrees);
  const nightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees);
  const twilightRise = smoothstep(-18, -6, sunElevationDegrees);
  const twilightFall = 1 - smoothstep(-2, 12, sunElevationDegrees);
  const twilightFactor = clamp01(twilightRise * twilightFall);""",
        'continuous solar factors',
    )
    text = _replace_once(
        text,
        """  const sunSize = clamp(worldSky.sunSize ?? worldSky.suns?.[0]?.size ?? 1, 0.1, 12);
  const moonSize = clamp(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25, 0.1, 32);
  const sunAngularRadius = 0.2666 * sunSize;
  const sunElevationDegrees = Math.asin(clamp(sunDirection[1], -1, 1)) / DEG;
  const sunVisibility = smoothstep(-sunAngularRadius, sunAngularRadius, sunElevationDegrees);""",
        """  const celestialMode = String(worldSky.celestialMode || 'astronomical');
  const physicalCelestial = celestialMode === 'astronomical';
  const authoredSunSize = Number(worldSky.sunSize ?? worldSky.suns?.[0]?.size ?? 1);
  const authoredMoonSize = Number(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25);
  const sunSize = physicalCelestial ? clamp(authoredSunSize, 0.85, 1.15) : clamp(authoredSunSize, 0.1, 12);
  const moonSize = physicalCelestial ? clamp(authoredMoonSize, 0.85, 1.35) : clamp(authoredMoonSize, 0.1, 32);
  const sunAngularRadius = 0.2666 * sunSize;
  const sunVisibility = smoothstep(-sunAngularRadius, sunAngularRadius, sunElevationDegrees);""",
        'physical celestial sizing',
    )
    text = _replace_once(
        text,
        """    starSizeMin: clamp(worldSky.starSizeMin ?? 0.18, 0.02, 4),
    starSizeMax: clamp(worldSky.starSizeMax ?? 1.35, 0.02, 8),
    starColorVariation: clamp01(worldSky.starColorVariation ?? 0.72),
    starRayStrength: clamp(worldSky.starRayStrength ?? 0.24, 0, 2),
    starRayLength: clamp(worldSky.starRayLength ?? 1.15, 0.1, 4),
    starHeroFraction: clamp01(worldSky.starHeroFraction ?? 0.035),""",
        """    starSizeMin: physicalCelestial
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
      : clamp01(worldSky.starHeroFraction ?? 0.035),""",
        'physical star limits',
    )
    text = _replace_once(
        text,
        """    sunDirection,
    moonDirection,""",
        """    sunDirection,
    moonDirection,
    celestialMode,
    physicalCelestial,""",
        'celestial diagnostics state',
    )
    _write(path, text, changed, root)


def apply_interpolation(root: Path, changed: list[str]) -> None:
    path = root / 'app/world-runtime.js'
    text = path.read_text(encoding='utf-8')
    replacement = r'''const clampedAmount = value => clamp01(value);
const predictiveAmount = value => Math.max(0, Math.min(2.25, Number(value) || 0));
const DEG = Math.PI / 180;

function directionFromAngles(azimuth, elevation) {
  const azimuthRadians = Number(azimuth || 0) * DEG;
  const elevationRadians = Number(elevation || 0) * DEG;
  const horizontal = Math.cos(elevationRadians);
  return [
    Math.sin(azimuthRadians) * horizontal,
    Math.sin(elevationRadians),
    -Math.cos(azimuthRadians) * horizontal
  ];
}

function normalizeDirection(direction, fallback) {
  const magnitude = Math.hypot(...direction);
  return magnitude < 1e-7 ? [...fallback] : direction.map(value => value / magnitude);
}

function slerpDirection(from, to, amount) {
  const cosine = Math.max(-0.999999, Math.min(0.999999, from.reduce((sum, value, index) => sum + value * to[index], 0)));
  const angle = Math.acos(cosine);
  if (angle < 1e-5) return normalizeDirection(from.map((value, index) => lerp(value, to[index], amount)), from);
  const denominator = Math.sin(angle);
  const fromWeight = Math.sin((1 - amount) * angle) / denominator;
  const toWeight = Math.sin(amount * angle) / denominator;
  return normalizeDirection(from.map((value, index) => value * fromWeight + to[index] * toWeight), amount < 0.5 ? from : to);
}

function interpolateCelestialAngles(fromProperties, toProperties, amount) {
  const values = [
    fromProperties?.azimuth, fromProperties?.elevation,
    toProperties?.azimuth, toProperties?.elevation
  ].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const direction = slerpDirection(
    directionFromAngles(values[0], values[1]),
    directionFromAngles(values[2], values[3]),
    amount
  );
  return {
    azimuth: ((Math.atan2(direction[0], -direction[2]) / DEG) % 360 + 360) % 360,
    elevation: Math.asin(Math.max(-1, Math.min(1, direction[1]))) / DEG
  };
}

const INTERPOLATED_SETTING_KEYS'''
    text, count = re.subn(
        r'const linearAmount = value => clamp01\(value\);.*?const INTERPOLATED_SETTING_KEYS',
        replacement,
        text,
        count=1,
        flags=re.S,
    )
    if count != 1 and 'const predictiveAmount' not in text:
        raise RuntimeError('Expected interpolation helper block was not found')
    text = text.replace(
        'const amount = linearAmount((timestamp - environmentTrack.startedAt) / environmentTrack.durationMs);',
        'const amount = clampedAmount((timestamp - environmentTrack.startedAt) / environmentTrack.durationMs);',
    )

    update_block = r'''    const rawAmount = (timestamp - track.startedAt) / track.durationMs;
    const visualAmount = clampedAmount(rawAmount);
    const celestialAmount = predictiveAmount(rawAmount);
    const from = track.fromTransform;
    const to = track.toTransform;
    object.transform = {
      position: from.position.map((value, index) => lerp(value, to.position[index], visualAmount)),
      rotation: from.rotation.map((value, index) => lerpAngle(value, to.rotation[index], visualAmount)),
      scale: from.scale.map((value, index) => lerp(value, to.scale[index], visualAmount))
    };
    const nextProperties = {
      ...(object.properties || {}),
      ...(rawAmount >= 1 ? structuredClone(track.finalProperties) : {})
    };
    const celestialAngles = interpolateCelestialAngles(track.fromProperties, track.toProperties, celestialAmount);
    for (const [property, targetValue] of Object.entries(track.toProperties)) {
      const startValue = track.fromProperties[property] ?? targetValue;
      nextProperties[property] = celestialAngles && (property === 'azimuth' || property === 'elevation')
        ? celestialAngles[property]
        : property === 'azimuth'
          ? lerpAngle(startValue, targetValue, visualAmount)
        : lerp(startValue, targetValue, visualAmount);
    }
    if (celestialAngles) {
      object.transform.rotation[0] = -celestialAngles.elevation;
      object.transform.rotation[1] = celestialAngles.azimuth + 180;
    }
    object.properties = nextProperties;
    changed = true;'''
    text, count = re.subn(
        r'    const amount = linearAmount\(\(timestamp - track\.startedAt\) / track\.durationMs\);.*?      celestialTracks\.delete\(key\);\n    \}',
        update_block,
        text,
        count=1,
        flags=re.S,
    )
    if count != 1 and 'const celestialAmount = predictiveAmount(rawAmount);' not in text:
        raise RuntimeError('Expected celestial interpolation update block was not found')
    text = text.replace("mode: 'continuous-linear'", "mode: 'continuous-predictive'")
    _write(path, text, changed, root)


def apply(root: Path, changed: list[str]) -> None:
    apply_environment(root, changed)
    apply_interpolation(root, changed)
