from pathlib import Path
import subprocess
import sys

REQUIRED = {
    'app/renderer.js': [
        "import { directionFromAzimuthElevation } from './celestial-mechanics.js';",
        'if(object.properties?.celestialRole)return null;',
        'sunAuthorityId:',
        'mix(0.48,1.0,sum/9.0)'
    ],
    'app/app.js': [
        "import { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';",
        'const renderCrashGuard = new RenderCrashGuard',
        'function rebuildRendererAfterFailure',
        'renderResult=renderCrashGuard.run'
    ],
    'desktop/main.cjs': [
        'const INCIDENT_DIR =',
        'function writeIncident',
        'recoverRendererProcess',
        "app.on('child-process-gone'"
    ],
    'server/v010-api.mjs': [
        'visualDurationMs: 1100',
        '.filter(object => Boolean(object.properties?.celestialRole))'
    ],
    'server/v010-systems.mjs': [
        "lookPreset: existing.lookPreset || 'clear-day'",
        'dayFogMultiplier:',
        'moonCraterStrength:',
        'starRayStrength:',
        'milkyWayClumping:',
        'renderProxy: false'
    ],
    'app/v010.js': [
        'v010MoonCraters',
        'v010Haze',
        'v010StarRays',
        'v010MilkyWayWarp',
        "lookPreset: options.preservePreset ?",
        "body: JSON.stringify({ seconds: 1 })"
    ],
    'app/sky-pass.js': ['vec3 cubeProjection', 'float craterField', 'uMilkyWayClumping', 'uStarRayStrength'],
    'app/world-runtime.js': ['environmentTracks', 'mode: \'continuous-linear\''],
    'app/environment-runtime.js': ['moonCraterStrength', 'milkyWayWidthVariation', 'solarEclipseCoverage'],
    'app/environment-presets.js': ["'clear-day'", "'horror-fog'", "'fantasy-sky'", "id: 'custom'"]
}


def missing_contracts():
    missing = []
    for relative, markers in REQUIRED.items():
        path = Path(relative)
        if not path.is_file():
            missing.append(f'{relative}: missing file')
            continue
        source = path.read_text(encoding='utf-8')
        for marker in markers:
            if marker not in source:
                missing.append(f'{relative}: {marker}')
    return missing


missing = missing_contracts()
if missing:
    print('Phase 1C broad integration is required:')
    for item in missing:
        print(f'  - {item}')
    subprocess.run([sys.executable, 'scripts/apply-phase1c-stabilization.py'], check=True)
else:
    print('Phase 1C broad integration is already complete; migration skipped.')

subprocess.run([sys.executable, 'scripts/apply-phase1c-test-contracts.py'], check=True)

remaining = missing_contracts()
if remaining:
    raise RuntimeError('Phase 1C integration postconditions are incomplete: ' + '; '.join(remaining))

print('Phase 1C integration and permanent test contracts are complete.')
