from __future__ import annotations

from pathlib import Path


REQUIRED = {
    'app/renderer.js': [
        "import { directionFromAzimuthElevation } from './celestial-mechanics.js';",
        'if(object.properties?.celestialRole)return null;',
        'sunAuthorityId:',
        'return sum/9.0;',
        'renderEditorOverlayPass(frame)',
    ],
    'app/app.js': [
        "import { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';",
        'const renderCrashGuard = new RenderCrashGuard',
        'function rebuildRendererAfterFailure',
        'window.__omniforgeVisualTestCapture',
        'selectedId=null',
        'selectedId=originalSelectedId',
    ],
    'desktop/main.cjs': [
        'const INCIDENT_DIR =',
        'function writeIncident',
        'recoverRendererProcess',
        "app.on('child-process-gone'",
        'VISUAL_CAPTURE_DIR',
        'installVisualCaptureWatcher',
        'Protected viewport Ctrl+W navigation chord',
    ],
    'server/v010-api.mjs': [
        'visualDurationMs: 1100',
        '.filter(object => Boolean(object.properties?.celestialRole))',
    ],
    'server/v010-systems.mjs': [
        "lookPreset: existing.lookPreset || 'clear-day'",
        'dayFogMultiplier:',
        'moonCraterStrength:',
        'starRayStrength: 0.12',
        'starSizeMin: 0.36',
        'milkyWayIntensity: 0.34',
        'milkyWayClumping:',
        'ambientIntensity: (0.12 + day * 0.57',
        'const ambientDay = mix([12, 20, 48], [154, 178, 210], day)',
        'renderProxy: false',
    ],
    'app/v010.js': [
        'v010MoonCraters',
        'v010Haze',
        'v010StarRays',
        'v010MilkyWayWarp',
        'id="v010MoonSize" type="range" min="0.1" max="32"',
        "lookPreset: options.preservePreset ?",
        "body: JSON.stringify({ seconds: 1 })",
    ],
    'app/sky-pass.js': [
        'vec2 hemisphereOctEncode',
        'vec3 hemisphereOctDecode',
        'float probability=clamp(uStarDensity*0.13',
        'vec2 pixelDelta=(vNdc-starNdc)/ndcPixel',
        'float microRadius=mix(clamp(authoredMin*0.36,0.12,0.32)',
        'float heroRadius=clamp(microRadius*(1.45+sizeRandom*0.65),0.72,2.05)',
        'float halo=exp(-0.5*pow(pixelDistance/haloSigma,2.0))*hero*0.16',
        'hero*uStarRayStrength*0.045',
        'craterField(vec2 uv,float scale,float seed,float density)',
        'marePotential+=lunarEllipse',
        'uMilkyWayClumping',
        'vec3 galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78))',
        'float dustTransmission=',
        'float centralPresence=',
        'vec3 periodic=vec3(cos(longitude),sin(longitude),latitude)',
        'float coronaEnvelope=exp(-coronaDistance/max(0.035,coronaReach))',
        'float twilightSunward=pow(max(dot(horizonDirection,sunHorizonDirection),0.0),3.1)',
        'float eclipseAngularRatio=eclipseRadius/max(0.0001,uSunAngularRadius)',
        'float diamondCore=exp(-pow(diamondRadialDistance/0.055,2.0)',
        'float celestialHorizonMask=smoothstep(-0.003,0.0045,ray.y)',
        'sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uSunVisibility*celestialHorizonMask',
        'float eclipsePresentationVisibility=uSunVisibility*celestialHorizonMask',
        'float eclipseSilhouette=eclipseDisc*eclipseActive*eclipsePresentationVisibility',
        'moonDisc*=moonCenterVisibility*celestialHorizonMask',
        'float moonSurfaceEnergy=pow(max(phaseLighting,uMoonEarthshine*0.35),0.72)',
        'float stellarCelestialMask=(1.0-eclipseSilhouette)*(1.0-moonStellarOcclusion)',
        'uCloudQuality>=0.5&&uCloudCoverage>=0.35&&ray.y>=0.09',
        'sky=mix(sky,vec3(0.00001),eclipseSilhouette)',
    ],
    'app/world-runtime.js': [
        'environmentTracks',
        "mode: 'continuous-linear'",
        'interpolateCelestialAngles',
    ],
    'app/environment-runtime.js': [
        'const sunVisibility = smoothstep(-sunAngularRadius, sunAngularRadius, sunElevationDegrees)',
        'sunVisibility,',
        'moonCraterStrength',
        'milkyWayWidthVariation',
        'solarEclipseCoverage',
        '0.1, 32',
    ],
    'app/celestial-mechanics.js': [
        'export function solarDiscCoverage',
        'const geometricSolarCoverage = solarDiscCoverage',
        'geometricSolarCoverage * nodeAlignment',
    ],
    'app/environment-presets.js': [
        "'clear-day'",
        "'realistic-night-core'",
        "'faint-natural-milkyway'",
        "'fantasy-violet-galaxy'",
        "'total-eclipse-realistic'",
        "id: 'custom'",
    ],
    'tests/phase1g-celestial-optics.test.mjs': [
        'solar-disc visibility is geometric and independent from the broad day factor',
        'sky shader keeps compact stars and separates celestial visibility from lighting state',
    ],
}


def validate() -> list[str]:
    missing: list[str] = []
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


missing = validate()
if missing:
    print('Phase 1C current-source contracts are incomplete:')
    for item in missing:
        print(f'  - {item}')
    raise SystemExit(1)

print('Phase 1C current-source contracts passed. Legacy broad source mutation is disabled.')
