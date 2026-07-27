from __future__ import annotations

from pathlib import Path

from celestial_recovery_followup import apply as apply_followup
from celestial_recovery_runtime import apply as apply_runtime
from celestial_recovery_sky import apply as apply_sky
from celestial_recovery_tests import apply as apply_tests

ROOT = Path(__file__).resolve().parents[1]
CHANGED: list[str] = []


def source(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding='utf-8')


def final_contract_failures() -> list[str]:
    sky = source('app/sky-pass.js')
    environment = source('app/environment-runtime.js')
    runtime = source('app/world-runtime.js')
    optics_tests = source('tests/phase1g-celestial-optics.test.mjs')
    projection_tests = source('tests/phase1c-visual-projection.test.mjs')
    world_tests = source('tests/phase1-1-world-authoring.test.mjs')

    failures: list[str] = []
    required = {
        'app/sky-pass.js': [
            'float heroProbability=clamp(uStarHeroFraction,0.001,0.008)',
            'float mediumProbability=',
            'float moonOcclusionDisc=1.0-smoothstep(0.94,1.045,moonRadius)',
            'float stellarCelestialMask=(1.0-eclipseSilhouette)*(1.0-moonOcclusionDisc)',
            'sky=mix(sky,moonComposite,clamp(moonDisc,0.0,1.0))',
            'float eclipsePresentationVisibility=uSunVisibility;',
        ],
        'app/environment-runtime.js': [
            'const derivedDayFactor = smoothstep(-6, 8, sunElevationDegrees);',
            'const derivedNightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees);',
            'const derivedTwilightFactor = clamp01(twilightRise * twilightFall);',
            "const celestialMode = String(worldSky.celestialMode || 'astronomical');",
            'const physicalCelestial = celestialMode === \'astronomical\';',
        ],
        'app/world-runtime.js': [
            'const predictiveAmount = value => Math.max(0, Math.min(2.25, Number(value) || 0));',
            'const celestialAmount = predictiveAmount(rawAmount);',
            "mode: 'continuous-predictive'",
            'if (Math.abs(rawAmount - 1) <= 1e-9)',
        ],
        'tests/phase1g-celestial-optics.test.mjs': [
            "test('sky compositor removes ray-level slicing and occludes background astronomy before the Moon'",
            "test('celestial interpolation predicts continuously across snapshot boundaries'",
        ],
        'tests/phase1c-visual-projection.test.mjs': [
            'float moonOcclusionDisc=1\\.0-smoothstep\\(0\\.94,1\\.045,moonRadius\\)',
            'assert.doesNotMatch(sky, /celestialHorizonMask/);',
        ],
        'tests/phase1-1-world-authoring.test.mjs': [
            "sky: { celestialMode: 'manual', sunSize: 2, moonSize: 3",
        ],
    }
    values = {
        'app/sky-pass.js': sky,
        'app/environment-runtime.js': environment,
        'app/world-runtime.js': runtime,
        'tests/phase1g-celestial-optics.test.mjs': optics_tests,
        'tests/phase1c-visual-projection.test.mjs': projection_tests,
        'tests/phase1-1-world-authoring.test.mjs': world_tests,
    }
    for relative_path, markers in required.items():
        for marker in markers:
            if marker not in values[relative_path]:
                failures.append(f'{relative_path}: missing {marker}')

    forbidden = {
        'app/sky-pass.js': ['celestialHorizonMask'],
        'app/world-runtime.js': ["mode: 'continuous-linear'"],
    }
    for relative_path, markers in forbidden.items():
        for marker in markers:
            if marker in values[relative_path]:
                failures.append(f'{relative_path}: rejected marker remains: {marker}')
    return failures


initial_failures = final_contract_failures()
if initial_failures:
    apply_runtime(ROOT, CHANGED)
    apply_sky(ROOT, CHANGED)
    apply_tests(ROOT, CHANGED)
    apply_followup(ROOT, CHANGED)

    remaining = final_contract_failures()
    if remaining:
        print('Celestial recovery failed to reach the final source contract:')
        for failure in remaining:
            print(f'  - {failure}')
        raise SystemExit(1)
else:
    print('Celestial recovery final source contract already present; no source migration required.')

progress = ROOT / 'progress.md'
progress_text = progress.read_text(encoding='utf-8')
marker = '## Celestial compositor recovery gate'
if marker not in progress_text:
    progress.write_text(
        progress_text.rstrip()
        + '\n\n'
        + marker
        + '\n\n'
        + '- Removed the ray-level horizon guillotine that visibly sliced Sun and Moon discs.\n'
        + '- Composed stars, hero glints, planets, and Milky Way behind one geometric Moon occluder.\n'
        + '- Composited the opaque lunar surface after the masked astronomical background.\n'
        + '- Added lunar-map highlight compression and capped micro/medium/hero star optics.\n'
        + '- Derived day, night, and twilight continuously from interpolated solar elevation.\n'
        + '- Added predictive spherical interpolation across compact runtime snapshot intervals.\n'
        + '- Preserved wide manual Custom ranges while constraining astronomical Physical mode.\n\n'
        + 'The branch remains blocked pending exact packaged Windows visual validation.\n',
        encoding='utf-8',
    )
    CHANGED.append('progress.md')

if CHANGED:
    print('Celestial recovery repair applied.')
    for relative in dict.fromkeys(CHANGED):
        print(f'  - {relative}')
else:
    print('Celestial recovery repair is idempotent; second pass changed no files.')
