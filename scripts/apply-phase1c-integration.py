from pathlib import Path
import subprocess
import sys

REQUIRED = {
    'app/renderer.js': [
        "import { directionFromAzimuthElevation } from './celestial-mechanics.js';",
        'if(object.properties?.celestialRole)return null;',
        'sunAuthorityId:',
        'return sum/9.0;'
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
        'ambientIntensity: (0.12 + day * 0.45',
        'const ambientDay = mix([12, 20, 48], [154, 178, 210], day)',
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
        'float probability=clamp(uStarDensity*0.13',
        'float radius=max(aa*0.85',
        'float rayLength=radius*mix(2.0,4.2',
        'vec2 craterField',
        'return vec2(clamp(albedo,-0.28,0.16),clamp(height,-0.48,0.24))',
        'uMilkyWayClumping',
        'uStarRayStrength',
        'vec3 galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78))',
        'float dustTransmission=',
        'float centralPresence=',
        'vec3 periodic=vec3(cos(longitude),sin(longitude),latitude)',
        'float coronaEnvelope=exp(-coronaDistance/max(0.035,coronaReach))',
        'float edgeLight=1.0-smoothstep(threshold,threshold+0.38,cloudField)',
        'float twilightSunward=pow(max(dot(horizonDirection,sunHorizonDirection),0.0),2.4)',
        'sunLinear*horizon*uTwilightFactor*(0.025+twilightSunward*0.34)',
        'float eclipseAngularRatio=eclipseRadius/max(0.0001,uSunAngularRadius)',
        'float diamondCore=exp(-dot(diamondDelta,diamondDelta)/0.00055)*diamondWindow',
        'float aa=max(fwidth(angularDistance)*0.5,0.000035)',
        'float disc=psf*0.94',
        'eclipseStarVisibility=smoothstep(0.975,1.0,uSolarEclipse)*uDayFactor*0.09',
        'uCloudQuality>=0.5&&uCloudCoverage>=0.35&&ray.y>=0.09',
        'vec2 sunCoronaUv=celestialUv(ray,uSunDirection,uSunAngularRadius)',
        'float eclipseActive=step(0.001,uSolarEclipse)',
        'float eclipseSilhouette=eclipseDisc*eclipseActive*uDayFactor',
        'independentMoonVisibility=uMoonVisibility*(1.0-eclipseActive)',
        'float diamondRing=',
        'sky=mix(sky,vec3(0.00001),eclipseSilhouette)',
    ],
    'app/world-runtime.js': ['environmentTracks', "mode: 'continuous-linear'"],
    'app/environment-runtime.js': ['moonCraterStrength', 'milkyWayWidthVariation', 'solarEclipseCoverage', '0.1, 32'],
    'app/celestial-mechanics.js': [
        'export function solarDiscCoverage',
        'const geometricSolarCoverage = solarDiscCoverage',
        'geometricSolarCoverage * nodeAlignment'
    ],
    'app/environment-presets.js': ["'clear-day'", "'horror-fog'", "'fantasy-sky'", "id: 'custom'", "indirectStrength: 0.9"]
}

BASE_FINAL_VISUAL_MARKERS = {
    'app/renderer.js': ['return sum/9.0;'],
    'app/sky-pass.js': [
        'uStarDensity*0.13',
        'rayLength=radius*mix(2.0,4.2',
        'galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78))',
        'float dustTransmission=',
        'float centralPresence=',
        'coronaEnvelope=exp(-coronaDistance/max(0.035,coronaReach))',
        'sunCoronaUv=celestialUv(ray,uSunDirection,uSunAngularRadius)',
        'eclipseSilhouette=eclipseDisc*eclipseActive*uDayFactor',
        'sky=mix(sky,vec3(0.00001),eclipseSilhouette)'
    ],
    'app/environment-runtime.js': ['0.1, 32'],
    'app/v010.js': ['id="v010MoonSize" type="range" min="0.1" max="32"'],
    'server/v010-systems.mjs': [
        'ambientIntensity: (0.12 + day * 0.45',
        'const ambientDay = mix([12, 20, 48], [154, 178, 210], day)'
    ],
    'app/app.js': ['selectedId=null', 'selectedId=originalSelectedId'],
    'scripts/run-phase1c-visual-captures.ps1': ['starHeroFraction=.006', 'milkyWayOrientation=32', '$moonWorld=@{sky=@{moonSize=4}}', 'moonSize=22', 'sunSize=9']
}

REFINED_VISUAL_MARKERS = {
    'app/renderer.js': ['return sum/9.0;'],
    'app/sky-pass.js': [
        'uStarDensity*0.13',
        'rayLength=radius*mix(2.0,4.2',
        'float dustTransmission=',
        'float centralPresence=',
        'return vec2(clamp(albedo,-0.28,0.16),clamp(height,-0.48,0.24))',
        'coronaEnvelope=exp(-coronaDistance/max(0.035,coronaReach))',
        'sunCoronaUv=celestialUv(ray,uSunDirection,uSunAngularRadius)',
        'eclipseSilhouette=eclipseDisc*eclipseActive*uDayFactor',
        'sky=mix(sky,vec3(0.00001),eclipseSilhouette)'
    ],
    'app/environment-runtime.js': ['0.1, 32'],
    'app/v010.js': ['id="v010MoonSize" type="range" min="0.1" max="32"'],
    'server/v010-systems.mjs': [
        'ambientIntensity: (0.12 + day * 0.45',
        'const ambientDay = mix([12, 20, 48], [154, 178, 210], day)'
    ],
    'app/app.js': ['selectedId=null', 'selectedId=originalSelectedId'],
    'scripts/run-phase1c-visual-captures.ps1': ['starHeroFraction=.004', 'milkyWayOrientation=32', 'starIntensity=.24;starDensity=.72', '$moonWorld=@{sky=@{moonSize=4}}', 'moonSize=22', 'sunSize=9']
}


def contracts_missing(contract_map):
    missing = []
    for relative, markers in contract_map.items():
        path = Path(relative)
        if not path.is_file():
            missing.append(f'{relative}: missing file')
            continue
        source = path.read_text(encoding='utf-8')
        for marker in markers:
            if marker not in source:
                missing.append(f'{relative}: {marker}')
    return missing


def missing_contracts():
    return contracts_missing(REQUIRED)


missing = missing_contracts()
if missing:
    broad_missing = [item for item in missing if not any(marker in item for marker in [
        'hemisphereOctEncode', 'hemisphereOctDecode', 'vec3 periodic=', 'eclipseSilhouette',
        'VisualTestCapture', 'VISUAL_CAPTURE_DIR', 'installVisualCaptureWatcher', 'replace(/^\\uFEFF/',
        'return sum/9.0', 'starRayStrength: 0.12', 'starSizeMin: 0.36', 'milkyWayIntensity: 0.34',
        'uStarDensity*0.014', 'uStarDensity*0.052', 'uStarDensity*0.13', 'microStarLayer', 'mix(0.00072,0.00235', 'float radius=max(aa*1.08', 'float radius=max(aa*1.45', 'rayLength=radius*mix(2.0,4.5', 'rayLength=radius*mix(2.0,4.2',
        'galacticNormal=normalize', 'galacticCloudEnvelope=', 'dustTransmission=', 'ring*0.28', 'return vec2(clamp(albedo', 'coronaInner=pow(sunDot,1500.0)', 'coronaEnvelope=exp(-coronaDistance', 'sunCoronaUv=celestialUv',
        'sky=mix(sky,vec3(0.00001)', 'indirectStrength: 0.9', 'ambientIntensity: (0.09',
        'max="32"', '0.1, 32', 'ambientIntensity: (0.09', 'ambientIntensity: (0.12',
        'const ambientDay = mix([12, 20, 48]', 'selectedId=null', 'selectedId=originalSelectedId'
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

base_visual_missing = contracts_missing(BASE_FINAL_VISUAL_MARKERS)
refined_visual_missing = contracts_missing(REFINED_VISUAL_MARKERS)
if base_visual_missing and refined_visual_missing:
    print('Base Phase 1C rendered-visual integration is required:')
    for item in base_visual_missing:
        print(f'  - {item}')
    subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-qa.py'], check=True)
    subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-idempotency.py'], check=True)
    subprocess.run([sys.executable, 'scripts/apply-phase1c-capture-protocol.py'], check=True)
    subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-quality.py'], check=True)
    subprocess.run([sys.executable, 'scripts/apply-phase1c-final-visual.py'], check=True)
else:
    print('Base or refined Phase 1C rendered-visual source is already integrated; broad visual rewrites skipped.')
    subprocess.run([sys.executable, 'scripts/apply-phase1c-visual-idempotency.py'], check=True)
    subprocess.run([sys.executable, 'scripts/apply-phase1c-capture-protocol.py'], check=True)

subprocess.run([sys.executable, 'scripts/apply-phase1c-galaxy-refinement.py'], check=True)
subprocess.run([sys.executable, 'scripts/apply-phase1c-test-contracts.py'], check=True)

remaining = missing_contracts()
if remaining:
    raise RuntimeError('Phase 1C integration postconditions are incomplete: ' + '; '.join(remaining))

print('Phase 1C integration, projection repair, separated stellar evidence, final visual tuning, and permanent test contracts are complete.')
