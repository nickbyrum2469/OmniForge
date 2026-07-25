from pathlib import Path
import subprocess
import sys

REQUIRED_MARKERS = {
    'server/v010-systems.mjs': [
        "import { evaluateCelestialSystem } from '../app/celestial-mechanics.js';",
        "schemaVersion: 2",
        "moonIllumination: celestial.moon.illumination"
    ],
    'server/v010-api.mjs': [
        'world.time.absoluteDay ='
    ],
    'app/v010.js': [
        'id="v010MoonAge"',
        'id="v010EclipseMode"',
        'id="v010StarTwinkle"',
        'id="v010MilkyWayWidth"'
    ],
    'app/sky-pass.js': [
        'vec3 starLayer(',
        'vec3 milkyWay(',
        'moonSurfaceNormal',
        'uStarTwinkleAmount',
        'uSolarEclipse'
    ],
    'app/renderer.js': [
        "import { HDRPipeline } from './hdr-pipeline.js';",
        'this.hdrPipeline=new HDRPipeline(gl,this.capabilities);',
        "name:'display-transform'",
        'this.hdrPipeline.present',
        'hdr-scene-color'
    ]
}


def has_complete_primary_integration():
    missing = []
    for relative, markers in REQUIRED_MARKERS.items():
        path = Path(relative)
        if not path.is_file():
            missing.append(f'{relative}: missing file')
            continue
        source = path.read_text(encoding='utf-8')
        for marker in markers:
            if marker not in source:
                missing.append(f'{relative}: {marker}')
    return missing


def run(script):
    subprocess.run([sys.executable, script], check=True)


missing = has_complete_primary_integration()
if missing:
    print('Phase 1B primary migration is required:')
    for item in missing:
        print(f'  - {item}')
    run('scripts/apply-phase1b-lunar-hdr.py')
else:
    print('Phase 1B primary integration is already complete; broad migration skipped.')

run('scripts/apply-phase1b-followup.py')
run('scripts/apply-phase1b-test-contracts.py')

remaining = has_complete_primary_integration()
if remaining:
    raise RuntimeError('Phase 1B integration postconditions are incomplete: ' + '; '.join(remaining))

print('Phase 1B guarded integration completed with all source contracts present.')
