from __future__ import annotations

from pathlib import Path


def _replace_once(path: Path, old: str, new: str, changed: list[str], root: Path, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected follow-up contract was not found for {label}: {old[:140]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def apply(root: Path, changed: list[str]) -> None:
    environment = root / 'app/environment-runtime.js'
    _replace_once(
        environment,
        """  const dayFactor = smoothstep(-6, 8, sunElevationDegrees);
  const nightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees);
  const twilightRise = smoothstep(-18, -6, sunElevationDegrees);
  const twilightFall = 1 - smoothstep(-2, 12, sunElevationDegrees);
  const twilightFactor = clamp01(twilightRise * twilightFall);""",
        """  const derivedDayFactor = smoothstep(-6, 8, sunElevationDegrees);
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
    : Number.isFinite(authoredTwilight) ? clamp01(authoredTwilight) : derivedTwilightFactor;""",
        changed,
        root,
        'continuous live factors with snapshot fallback',
    )

    runtime = root / 'app/world-runtime.js'
    _replace_once(
        runtime,
        """    object.properties = nextProperties;
    changed = true;""",
        """    object.properties = nextProperties;
    // Synchronization anchors remain exact for deterministic save/load and
    // tests. Between and beyond anchors the direction stays predictive.
    if (Math.abs(rawAmount - 1) <= 1e-9) {
      object.transform = cloneTransform(track.toTransform);
      object.properties = { ...object.properties, ...structuredClone(track.finalProperties) };
    }
    changed = true;""",
        changed,
        root,
        'exact synchronization anchor',
    )

    adjustable = root / 'tests/phase1-1-world-authoring.test.mjs'
    _replace_once(
        adjustable,
        "sky: { sunSize: 2, moonSize: 3, moonPhase: 0.5, moonPhaseMode: 'manual',",
        "sky: { celestialMode: 'manual', sunSize: 2, moonSize: 3, moonPhase: 0.5, moonPhaseMode: 'manual',",
        changed,
        root,
        'manual artistic disc-size test',
    )

    projection = root / 'tests/phase1c-visual-projection.test.mjs'
    malformed = "  assert.match(sky, /float heroRadius=clamp\\([^\n]+0\\.68,1\\.45\\)/);"
    corrected = "  assert.match(sky, /float heroRadius=clamp\\(.+0\\.68,1\\.45\\)/);"
    _replace_once(
        projection,
        malformed,
        corrected,
        changed,
        root,
        'single-line hero-radius regex',
    )

    integration = root / 'scripts/apply-phase1c-integration.py'
    _replace_once(
        integration,
        """        'const dayFactor = smoothstep(-6, 8, sunElevationDegrees)',
        'const nightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees)',
        'const twilightRise = smoothstep(-18, -6, sunElevationDegrees)',""",
        """        'const derivedDayFactor = smoothstep(-6, 8, sunElevationDegrees)',
        'const derivedNightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees)',
        'const twilightRise = smoothstep(-18, -6, sunElevationDegrees)',
        'const dayFactor = sunObject',
        'const twilightFactor = sunObject',""",
        changed,
        root,
        'continuous-factor source validator',
    )
