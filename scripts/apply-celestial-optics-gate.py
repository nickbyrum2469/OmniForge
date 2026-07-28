from __future__ import annotations

from pathlib import Path

from celestial_authoring_capture_profiles import apply as apply_authoring_capture_profiles, prepare_base_test
from celestial_authoring_controls import apply as apply_authoring
from celestial_recovery_capture import apply as apply_capture
from celestial_recovery_followup import apply as apply_followup
from celestial_recovery_runtime import apply as apply_runtime
from celestial_recovery_sky import apply as apply_sky
from celestial_recovery_tests import apply as apply_tests
from celestial_recovery_twilight import apply as apply_twilight
from celestial_recovery_twilight_final import apply as apply_twilight_final
from celestial_recovery_twilight_followup import apply as apply_twilight_followup
from pathway_studio_followup import apply as apply_pathway_studio_followup
from pathway_studio_recovery import apply as apply_pathway_studio
from target_pc_terrain_recovery_guarded import apply as apply_target_pc_terrain

ROOT = Path(__file__).resolve().parents[1]
CHANGED: list[str] = []


def source(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding='utf-8')


def final_contract_failures() -> list[str]:
    values = {
        'app/sky-pass.js': source('app/sky-pass.js'),
        'app/environment-runtime.js': source('app/environment-runtime.js'),
        'app/world-runtime.js': source('app/world-runtime.js'),
        'tests/phase1g-celestial-optics.test.mjs': source('tests/phase1g-celestial-optics.test.mjs'),
        'tests/phase1c-visual-projection.test.mjs': source('tests/phase1c-visual-projection.test.mjs'),
        'tests/phase1-1-world-authoring.test.mjs': source('tests/phase1-1-world-authoring.test.mjs'),
    }
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
            "const celestialScaleMode = String(worldSky.celestialScaleMode || 'physical') === 'artistic' ? 'artistic' : 'physical';",
            "const physicalCelestial = celestialScaleMode === 'physical';",
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
    forbidden = {
        'app/sky-pass.js': ['celestialHorizonMask'],
        'app/world-runtime.js': ["mode: 'continuous-linear'"],
    }
    failures: list[str] = []
    for relative_path, markers in required.items():
        for marker in markers:
            if marker not in values[relative_path]:
                failures.append(f'{relative_path}: missing {marker}')
    for relative_path, markers in forbidden.items():
        for marker in markers:
            if marker in values[relative_path]:
                failures.append(f'{relative_path}: rejected marker remains: {marker}')
    return failures


def append_progress(marker: str, lines: list[str], final_line: str) -> None:
    progress = ROOT / 'progress.md'
    text = progress.read_text(encoding='utf-8')
    if marker in text:
        return
    block = '\n\n' + marker + '\n\n' + ''.join(f'- {line}\n' for line in lines) + '\n' + final_line + '\n'
    progress.write_text(text.rstrip() + block, encoding='utf-8')
    CHANGED.append('progress.md')


prepare_base_test(ROOT, CHANGED)
apply_authoring(ROOT, CHANGED)
apply_authoring_capture_profiles(ROOT, CHANGED)
apply_target_pc_terrain(ROOT, CHANGED)
apply_pathway_studio(ROOT, CHANGED)
apply_pathway_studio_followup(ROOT, CHANGED)

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

sky_source = source('app/sky-pass.js')
environment_source = source('app/environment-runtime.js')
if 'const stellarEmergence =' not in environment_source or 'float civilTwilightLift=' not in sky_source:
    apply_twilight(ROOT, CHANGED)
    sky_source = source('app/sky-pass.js')
if 'sky+=civilTwilightColor*civilTwilightLift*(0.12+0.28*horizon);' in sky_source:
    apply_twilight_followup(ROOT, CHANGED)
    sky_source = source('app/sky-pass.js')
if 'sky+=civilTwilightColor*civilTwilightLift*(0.14+0.36*horizon);' in sky_source:
    apply_twilight_final(ROOT, CHANGED)

apply_capture(ROOT, CHANGED)

append_progress(
    '## Celestial compositor recovery gate',
    [
        'Removed the ray-level horizon guillotine that visibly sliced Sun and Moon discs.',
        'Composed stars, hero glints, planets, and Milky Way behind one geometric Moon occluder.',
        'Composited the opaque lunar surface after the masked astronomical background.',
        'Added lunar-map highlight compression and capped micro/medium/hero star optics.',
        'Derived day, night, and twilight continuously from interpolated solar elevation.',
        'Added predictive spherical interpolation across compact runtime snapshot intervals.',
        'Preserved wide manual Custom ranges while constraining astronomical Physical mode.',
        'Added gradual civil-twilight star emergence and delayed Milky Way emergence.',
        'Added bounded capture retries and health checks for exact packaged evidence.',
    ],
    'The branch remains blocked pending exact packaged Windows visual validation.',
)
append_progress(
    '## Target-PC terrain and path surface recovery',
    [
        'Added a dense terrain-conforming road surface independent of the capped terrain vertex grid.',
        'Preserved analytic terrain cut/fill, picking, physics, and saved spline coordinates.',
        'Added target-PC diagnostics when terrain vertex spacing is too coarse for path blending.',
        'Kept spline guides as editor overlays while the actual road renders in the opaque world pass.',
    ],
    'The branch remains blocked until the user validates the saved terrain and path on the RX 7900 XTX package.',
)
append_progress(
    '## Pathway Studio engineering corridor gate',
    [
        'Replaced the two-edge ribbon with a nine-band crowned roadbed, shoulders, drainage, side slopes, and terrain seams.',
        'Added grade limits, vertical smoothing, banking, curve-radius diagnostics, and scale-aware depth lift.',
        'Added trail, dirt, gravel, paved, mountain, highway, and fantasy-stone presets.',
        'Added live Pathway Studio controls and bridge, tunnel, and retaining-wall recommendations.',
        'Added route telemetry for target-PC proof instead of relying on editor spline visibility.',
    ],
    "The branch remains blocked until the exact Windows package is tested against the user's saved terrain on the RX 7900 XTX.",
)

if CHANGED:
    print('Celestial, terrain, and Pathway Studio recovery repair applied.')
    for relative in dict.fromkeys(CHANGED):
        print(f'  - {relative}')
else:
    print('Celestial, terrain, and Pathway Studio recovery repair is idempotent; second pass changed no files.')
