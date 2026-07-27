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
        'runtime: compactWorldRuntime(result.state)',
    ],
    'server/v010-systems.mjs': [
        "lookPreset: existing.lookPreset || 'clear-day'",
        "celestialMode: 'astronomical'",
        "celestialScaleMode: 'physical'",
        'moonOrbitPeriodDays: 29.530588',
        "eclipseMode: 'automatic'",
        'dayFogMultiplier:',
        'moonCraterStrength:',
        'starRayStrength: 0.12',
        'milkyWayClumping:',
        'renderProxy: false',
    ],
    'app/v010.js': [
        'v010MoonCraters',
        'v010Haze',
        'v010StarRays',
        'v010MilkyWayWarp',
        'id="v010CelestialScaleMode"',
        'id="v010SunSizeValue"',
        'id="v010MoonSizeValue"',
        'id="v010MoonSize" type="range" min="0.1" max="32"',
        'data-v010-live-world',
        'scheduleLiveWorldApply',
        'runtimeOnly: true',
        "celestialScaleMode: field('v010CelestialScaleMode').value",
        "lookPreset: options.preservePreset ?",
        "body: JSON.stringify({ seconds: 1 })",
    ],
    'app/sky-pass.js': [
        'vec2 hemisphereOctEncode',
        'vec3 hemisphereOctDecode',
        'float probability=clamp(uStarDensity*0.13',
        'vec2 pixelDelta=(vNdc-starNdc)/ndcPixel',
        'float heroProbability=clamp(uStarHeroFraction,0.001,0.008)',
        'float mediumProbability=',
        'float microRadius=mix(clamp(authoredMin*0.22,0.07,0.16)',
        'float heroRadius=clamp(mediumRadius*1.45+0.18,0.68,1.45)',
        'medium*0.025+hero*0.1',
        'hero*uStarRayStrength*0.028',
        'craterField(vec2 uv,float scale,float seed,float density)',
        'marePotential+=lunarEllipse',
        'float mappedLuma=',
        'float compressedLuma=',
        'uMilkyWayClumping',
        'vec3 periodic=vec3(cos(longitude),sin(longitude),latitude)',
        'float dustTransmission=',
        'float coronaEnvelope=exp(-coronaDistance/max(0.035,coronaReach))',
        'float eclipsePresentationVisibility=uSunVisibility;',
        'float moonOcclusionDisc=1.0-smoothstep(0.94,1.045,moonRadius)',
        'float stellarCelestialMask=(1.0-eclipseSilhouette)*(1.0-moonOcclusionDisc)',
        'sky=mix(sky,moonComposite,clamp(moonDisc,0.0,1.0))',
        'sky=mix(sky,vec3(0.00001),eclipseSilhouette)',
    ],
    'app/world-runtime.js': [
        'environmentTracks',
        'function slerpDirection',
        'const predictiveAmount =',
        'const celestialAmount = predictiveAmount(rawAmount)',
        "mode: 'continuous-predictive'",
    ],
    'app/environment-runtime.js': [
        'const derivedDayFactor = smoothstep(-6, 8, sunElevationDegrees)',
        'const derivedNightFactor = 1 - smoothstep(-12, -4, sunElevationDegrees)',
        'const twilightRise = smoothstep(-18, -6, sunElevationDegrees)',
        'const dayFactor = sunObject',
        'const twilightFactor = sunObject',
        "const celestialScaleMode = String(worldSky.celestialScaleMode || 'physical') === 'artistic' ? 'artistic' : 'physical'",
        "const physicalCelestial = celestialScaleMode === 'physical'",
        'celestialScaleMode,',
        'starHeroFraction: physicalCelestial',
        'sunVisibility,',
        'moonCraterStrength',
        'milkyWayWidthVariation',
        'solarEclipseCoverage',
    ],
    'app/celestial-mechanics.js': [
        'export function solarDiscCoverage',
        'const geometricSolarCoverage = solarDiscCoverage',
        'geometricSolarCoverage * nodeAlignment',
        'const eclipticLongitude = wrapRadians(sun.eclipticLongitude + elongation)',
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
        'solar, night, and twilight factors are continuous functions',
        'scale authority constrains physical presentation',
        'sky compositor removes ray-level slicing',
        'star optics use capped micro, medium, and rare hero classes',
        'celestial interpolation predicts continuously across snapshot boundaries',
    ],
    'tests/phase1h-celestial-authoring-controls.test.mjs': [
        'celestial scale authority is independent from orbital positioning',
        'world defaults and persistence retain explicit body scale authority',
        'World panel exposes readable live size controls without replacing the workspace',
    ],
}

FORBIDDEN = {
    'app/sky-pass.js': [
        'celestialHorizonMask',
        'moonStellarOcclusion=clamp(moonDisc*independentMoonVisibility',
        'float heroRadius=clamp(microRadius*(1.45+sizeRandom*0.65),0.72,2.05)',
    ],
    'app/environment-runtime.js': [
        "const physicalCelestial = celestialMode === 'astronomical'",
    ],
    'tests/phase1g-celestial-optics.test.mjs': [
        'sunDisc=.*uSunVisibility\\*celestialHorizonMask',
        'astronomical mode constrains destructive presentation',
    ],
}


def validate() -> list[str]:
    failures: list[str] = []
    for relative, markers in REQUIRED.items():
        path = Path(relative)
        if not path.is_file():
            failures.append(f'{relative}: missing file')
            continue
        source = path.read_text(encoding='utf-8')
        for marker in markers:
            if marker not in source:
                failures.append(f'{relative}: missing {marker}')
    for relative, markers in FORBIDDEN.items():
        path = Path(relative)
        if not path.is_file():
            continue
        source = path.read_text(encoding='utf-8')
        for marker in markers:
            if marker in source:
                failures.append(f'{relative}: forbidden {marker}')
    return failures


failures = validate()
if failures:
    print('Phase 1C celestial recovery source contracts are incomplete:')
    for item in failures:
        print(f'  - {item}')
    raise SystemExit(1)

print('Phase 1C celestial recovery source contracts passed.')
