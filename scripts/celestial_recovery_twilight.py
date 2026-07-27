from __future__ import annotations

from pathlib import Path


def replace_once(path: Path, old: str, new: str, changed: list[str], root: Path, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected twilight contract was not found for {label}.')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def append_once(path: Path, marker: str, block: str, changed: list[str], root: Path) -> None:
    text = path.read_text(encoding='utf-8')
    if marker in text:
        return
    path.write_text(text.rstrip() + '\n\n' + block.strip() + '\n', encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def apply(root: Path, changed: list[str]) -> None:
    environment = root / 'app/environment-runtime.js'
    replace_once(
        environment,
        """  const starExtinction = clamp(worldSky.starDaylightExtinction ?? 1.8, 0.1, 8);
  const daylightSuppression = Math.pow(Math.max(0, 1 - dayFactor), starExtinction * 3.2);""",
        """  const starExtinction = clamp(worldSky.starDaylightExtinction ?? 1.8, 0.1, 8);
  const daylightSuppression = Math.pow(Math.max(0, 1 - dayFactor), starExtinction * 3.2);
  // Bright stars emerge gradually during civil twilight. The galactic band
  // remains delayed until nautical twilight so dusk never jumps to full night.
  const stellarEmergence = 1 - smoothstep(-10, -2, sunElevationDegrees);
  const galacticEmergence = 1 - smoothstep(-14, -6, sunElevationDegrees);""",
        changed,
        root,
        'twilight emergence factors',
    )
    replace_once(
        environment,
        """    starVisibility: clamp01(nightFactor * starIntensity * daylightSuppression),""",
        """    starVisibility: clamp01(stellarEmergence * starIntensity * daylightSuppression),""",
        changed,
        root,
        'continuous star visibility',
    )
    replace_once(
        environment,
        """    milkyWayIntensity: Math.max(0, Number(worldSky.milkyWayIntensity ?? 0.22)) * nightFactor * daylightSuppression,""",
        """    milkyWayIntensity: Math.max(0, Number(worldSky.milkyWayIntensity ?? 0.22)) * galacticEmergence * daylightSuppression,""",
        changed,
        root,
        'delayed galactic visibility',
    )

    sky = root / 'app/sky-pass.js'
    sky_text = sky.read_text(encoding='utf-8')
    if 'float civilTwilightLift=' not in sky_text:
        original = "  physicalScatter+=twilightScatter*(uOzone*uTwilightFactor*horizon)*0.06;"
        initial = """  physicalScatter+=twilightScatter*(uOzone*uTwilightFactor*horizon)*0.06;
  // Preserve readable civil twilight without a bucketed exposure jump. This
  // continuous lift is strongest along the sunward horizon and fades as either
  // daylight or full night takes authority.
  float civilTwilightLift=uTwilightFactor*(1.0-uDayFactor)*(1.0-uNightFactor);
  vec3 civilTwilightColor=mix(vec3(0.025,0.035,0.09),vec3(0.24,0.075,0.018),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.12+0.28*horizon);"""
        if original not in sky_text:
            raise RuntimeError('Expected twilight contract was not found for continuous civil twilight luminance.')
        sky.write_text(sky_text.replace(original, initial, 1), encoding='utf-8')
        changed.append(sky.relative_to(root).as_posix())

    tests = root / 'tests/phase1g-celestial-optics.test.mjs'
    append_once(
        tests,
        "test('civil twilight reveals bright stars continuously before full night'",
        r"""
test('civil twilight reveals bright stars continuously before full night', () => {
  const lights = { dir: [0, -1, 0], color: [1, 0.94, 0.78], exposure: 1 };
  const early = normalizeEnvironmentState(sceneAtSunElevation(-1), lights, 0);
  const civil = normalizeEnvironmentState(sceneAtSunElevation(-4), lights, 0);
  const nautical = normalizeEnvironmentState(sceneAtSunElevation(-9), lights, 0);
  assert.equal(early.starVisibility, 0);
  assert.ok(civil.starVisibility > 0 && civil.starVisibility < nautical.starVisibility);
  assert.ok(civil.milkyWayIntensity <= 1e-9);
  assert.ok(nautical.milkyWayIntensity > civil.milkyWayIntensity);

  const sky = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');
  assert.match(sky, /float civilTwilightLift=uTwilightFactor\*\(1\.0-uDayFactor\)\*\(1\.0-uNightFactor\)/);
  assert.match(sky, /sky\+=civilTwilightColor\*civilTwilightLift\*\(0\.12\+0\.28\*horizon\)/);
});
""",
        changed,
        root,
    )
