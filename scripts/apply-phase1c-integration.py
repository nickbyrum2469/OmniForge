from pathlib import Path
import subprocess
import sys

REQUIRED = {
    'app/renderer.js': [
        "import { directionFromAzimuthElevation } from './celestial-mechanics.js';",
        'if(object.properties?.celestialRole)return null;',
        'sunAuthorityId:',
        'mix(0.66,1.0,sum/9.0)'
    ],
    'app/app.js': [
        "import { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';",
        'const renderCrashGuard = new RenderCrashGuard',
        'function rebuildRendererAfterFailure',
        'renderResult=renderCrashGuard.run',
        'window.__omniforgeVisualTestCapture',
        'selectedId=null',
        'selectedId=originalSelectedId'
    ],
    'desktop/main.cjs': [
        'const INCIDENT_DIR =',
        'function writeIncident',
        'recoverRendererProcess',
        "app.on('child-process-gone'",
        'VISUAL_CAPTURE_DIR',
        'installVisualCaptureWatcher',
        "replace(/^\\uFEFF/,'')"
    ],
    'server/v010-api.mjs': [
        'visualDurationMs: 1100',
        '.filter(object => Boolean(object.properties?.celestialRole))'
    ],
    'server/v010-systems.mjs': [
        "lookPreset: existing.lookPreset || 'clear-day'",
        'dayFogMultiplier:',
        'moonCraterStrength:',
        'starRayStrength: 0.12',
        'starSizeMin: 0.36',
        'milkyWayIntensity: 0.34',
        'milkyWayClumping:',
        'ambientIntensity: (0.09 + day * 0.22',
        'renderProxy: false'
    ],
    'app/v010.js': [
        'v010MoonCraters',
        'v010Haze',
        'v010StarRays',
        'v010MilkyWayWarp',
        'id="v010MoonSize" type="range" min="0.1" max="32"',
        "lookPreset: options.preservePreset ?",
        "body: JSON.stringify({ seconds: 1 })"
    ],
    'app/sky-pass.js': [
        'vec2 hemisphereOctEncode',
        'vec3 hemisphereOctDecode',
        'float probability=clamp(uStarDensity*0.014',
        'float radius=mix(0.00072,0.00235',
        'float rayLength=radius*mix(2.0,4.5',
        'float craterField',
        'uMilkyWayClumping',
        'uStarRayStrength',
        'vec3 galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78))',
        'microStructure=',
        'vec3 periodic=vec3(cos(longitude),sin(longitude),latitude)',
        'uMilkyWayIntensity*0.92',
        'float coronaInner=pow(sunDot,1500.0)',
        'sky=mix(sky,vec3(0.00001),eclipseSilhouette)',
        'float eclipseSilhouette=eclipseDisc*uSolarEclipse*uDayFactor'
    ],
    'app/world-runtime.js': ['environmentTracks', "mode: 'continuous-linear'"],
    'app/environment-runtime.js': ['moonCraterStrength', 'milkyWayWidthVariation', 'solarEclipseCoverage', '0.1, 32'],
    'app/environment-presets.js': ["'clear-day'", "'horror-fog'", "'fantasy-sky'", "id: 'custom'", "indirectStrength: 0.9"]
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
    broad_missing = [item for item in missing if not any(marker in item for marker in [
        'hemisphereOctEncode', 'hemisphereOctDecode', 'vec3 periodic=', 'eclipseSilhouette',
        'VisualTestCapture', 'VISUAL_CAPTURE_DIR', 'installVisualCaptureWatcher', 'replace(/^\\uFEFF/',
        'mix(0.66', 'starRayStrength: 0.12', 'starSizeMin: 0.36', 'milkyWayIntensity: 0.34',
        'uStarDensity*0.014', 'mix(0.00072,0.00235', 'rayLength=radius*mix(2.0,4.5',
        'galacticNormal=normalize', 'microStructure=', 'uMilkyWayIntensity*0.92', 'coronaInner=pow(sunDot,1500.0)',
        'sky=mix(sky,vec3(0.00001)', 'indirectStrength: 0.9', 'ambientIntensity: (0.09',
        'max="32"', '0.1, 32', 'selectedId=null', 'selectedId=originalSelectedId'
    ])]
    if broad_missing:
        print('Phase 1C broad integration is required:')
        for item in broad_missing:
            print(f'  - {item}')
        subprocess.run([sys.executable, 'scripts/apply-phase1c-stabilization.py'], check=True)
    else:
        print('Phase 1C broad integration is already complete.')
else:
    print('Phase 1C broad integration is already complete; migration skipped.')

subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-qa.py'], check=True)
subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-idempotency.py'], check=True)
subprocess.run([sys.executable, 'scripts/apply-phase1c-capture-protocol.py'], check=True)
subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-quality.py'], check=True)
subprocess.run([sys.executable, 'scripts/apply-phase1c-final-visual.py'], check=True)
subprocess.run([sys.executable, 'scripts/apply-phase1c-test-contracts.py'], check=True)

remaining = missing_contracts()
if remaining:
    raise RuntimeError('Phase 1C integration postconditions are incomplete: ' + '; '.join(remaining))

print('Phase 1C integration, projection repair, capture protocol, final visual tuning, and permanent test contracts are complete.')
