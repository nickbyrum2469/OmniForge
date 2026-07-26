from pathlib import Path


def replace_required(source, old, new, label):
    if new in source:
        return source
    if old not in source:
        raise RuntimeError(f'Missing final visual anchor: {label}')
    return source.replace(old, new, 1)


sky_path = Path('app/sky-pass.js')
sky = sky_path.read_text(encoding='utf-8')
sky = replace_required(
    sky,
    '  float probability=clamp(uStarDensity*0.0065,0.00018,0.018);',
    '  float probability=clamp(uStarDensity*0.014,0.00035,0.035);',
    'ordinary-star population',
)
sky = replace_required(
    sky,
    '    float rayLength=radius*mix(3.5,9.0,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));',
    '    float rayLength=radius*mix(2.0,4.5,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));',
    'hero-star ray length',
)
sky = replace_required(
    sky,
    '    float rays=(horizontal+vertical+diagonal*0.18)*hero*uStarRayStrength*0.085;',
    '    float rays=(horizontal+vertical+diagonal*0.12)*hero*uStarRayStrength*0.026;',
    'hero-star ray energy',
)
sky = replace_required(
    sky,
    '  vec3 galacticNormal=normalize(vec3(0.31*sin(orientation)+0.18,0.74,0.31*cos(orientation)-0.51));',
    '  vec3 galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78));',
    'galactic plane orientation',
)
sky = replace_required(
    sky,
    '  float broadHalo=exp(-pow(abs(signedDistance)/max(0.016,localWidth*3.4),2.0)*1.05)*0.22;',
    '  float broadHalo=exp(-pow(abs(signedDistance)/max(0.016,localWidth*3.1),2.0)*1.15)*0.09;',
    'Milky Way broad halo',
)
sky = replace_required(
    sky,
    '  float upperWisp=exp(-pow(abs(signedDistance-localWidth*0.72)/max(0.006,localWidth*0.42),2.0)*1.7)*0.28;',
    '  float upperWisp=exp(-pow(abs(signedDistance-localWidth*0.72)/max(0.006,localWidth*0.38),2.0)*1.9)*0.14;',
    'upper galactic wisp',
)
sky = replace_required(
    sky,
    '  float lowerWisp=exp(-pow(abs(signedDistance+localWidth*0.9)/max(0.006,localWidth*0.52),2.0)*1.8)*0.19;',
    '  float lowerWisp=exp(-pow(abs(signedDistance+localWidth*0.9)/max(0.006,localWidth*0.46),2.0)*2.0)*0.1;',
    'lower galactic wisp',
)
sky = replace_required(
    sky,
    '  float stellarKnots=pow(max(0.0,fine-0.5),2.6)*2.6*uMilkyWayDetail;',
    '  float stellarKnots=pow(max(0.0,fine-0.46),2.2)*4.2*uMilkyWayDetail;\n  float microStructure=pow(smoothstep(0.52,0.88,noise3(periodic*vec3(28.0,28.0,52.0)+uStarSeed*0.0017)),3.2)*2.4*uMilkyWayDetail;',
    'galactic knots',
)
sky = replace_required(
    sky,
    '  float structure=(coreBand+broadHalo+upperWisp+lowerWisp)*(0.38+coarse*0.46+galacticCore*0.72+stellarKnots);',
    '  float structure=(coreBand+broadHalo+upperWisp+lowerWisp)*(0.24+coarse*0.34+galacticCore*0.72+stellarKnots+microStructure);',
    'galactic structure composition',
)
sky = replace_required(
    sky,
    '  float coronaInner=pow(sunDot,520.0),coronaOuter=pow(sunDot,120.0);',
    '  float coronaInner=pow(sunDot,1500.0),coronaOuter=pow(sunDot,420.0);',
    'eclipse corona radius',
)
sky = replace_required(
    sky,
    '  sky+=vec3(1.0,0.88,0.64)*(coronaInner*2.8+coronaOuter*0.38)*uSolarEclipse*(1.0-eclipseDisc*0.92);',
    '  sky+=vec3(1.0,0.88,0.64)*(coronaInner*2.2+coronaOuter*0.24)*uSolarEclipse*(1.0-eclipseDisc);\n  sky=mix(sky,vec3(0.00001),eclipseSilhouette);',
    'eclipse silhouette final composite',
)
sky_path.write_text(sky, encoding='utf-8')

renderer_path = Path('app/renderer.js')
renderer = renderer_path.read_text(encoding='utf-8')
renderer = replace_required(renderer, '  return mix(0.58,1.0,sum/9.0);', '  return mix(0.66,1.0,sum/9.0);', 'final shadow floor')
renderer_path.write_text(renderer, encoding='utf-8')

environment_path = Path('app/environment-runtime.js')
environment = environment_path.read_text(encoding='utf-8')
environment = replace_required(
    environment,
    '  const moonSize = clamp(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25, 0.1, 16);',
    '  const moonSize = clamp(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25, 0.1, 32);',
    'Moon authoring size clamp',
)
environment_path.write_text(environment, encoding='utf-8')

ui_path = Path('app/v010.js')
ui = ui_path.read_text(encoding='utf-8')
ui = replace_required(
    ui,
    '<label>Moon size<input id="v010MoonSize" type="range" min="0.1" max="12" step="0.05"></label>',
    '<label>Moon size<input id="v010MoonSize" type="range" min="0.1" max="32" step="0.05"></label>',
    'Moon size authoring range',
)
ui_path.write_text(ui, encoding='utf-8')

systems_path = Path('server/v010-systems.mjs')
systems = systems_path.read_text(encoding='utf-8')
systems = replace_required(
    systems,
    '    ambientIntensity: (0.07 + day * 0.20 + Number(world.lighting.indirectStrength || 0.72) * 0.26) * (0.72 + cloudAttenuation * 0.28) * eclipseDaylight,',
    '    ambientIntensity: (0.09 + day * 0.22 + Number(world.lighting.indirectStrength || 0.72) * 0.29) * (0.74 + cloudAttenuation * 0.26) * eclipseDaylight,',
    'final ambient-light floor',
)
systems_path.write_text(systems, encoding='utf-8')

app_path = Path('app/app.js')
app = app_path.read_text(encoding='utf-8')
app = replace_required(
    app,
    '  const originalSplines=scene.settings.splinesVisible;\n  try{',
    '  const originalSplines=scene.settings.splinesVisible;\n  const originalSelectedId=selectedId;\n  try{',
    'capture selection snapshot',
)
app = replace_required(
    app,
    '    if(options.hideGuides!==false){scene.settings.gridVisible=false;scene.settings.splinesVisible=false;}',
    '    if(options.hideGuides!==false){scene.settings.gridVisible=false;scene.settings.splinesVisible=false;selectedId=null;}',
    'capture selection suppression',
)
app = replace_required(
    app,
    '    scene.settings.splinesVisible=originalSplines;\n  }',
    '    scene.settings.splinesVisible=originalSplines;\n    selectedId=originalSelectedId;\n  }',
    'capture selection restore',
)
app_path.write_text(app, encoding='utf-8')

capture_path = Path('scripts/run-phase1c-visual-captures.ps1')
capture = capture_path.read_text(encoding='utf-8')
capture = replace_required(capture, 'starHeroFraction=.018', 'starHeroFraction=.006', 'visual-test hero-star fraction')
capture = replace_required(capture, 'milkyWayOrientation=0', 'milkyWayOrientation=32', 'visual-test galactic orientation')
capture = replace_required(capture, "yaw=.2;pitch=.8;fov=80", "yaw=-.65;pitch=.92;fov=78", 'night camera final framing')
capture = replace_required(capture, "yaw=-1.856;pitch=.3;fov=78", "yaw=-1.0123;pitch=1.1815;fov=74", 'Milky Way final framing')
capture = replace_required(capture, 'moonElevation=35;moonSize=8;moonBrightness=1.05', 'moonElevation=35;moonSize=22;moonBrightness=1.05', 'Moon close-up apparent size')
capture = replace_required(capture, 'sunElevation=30;sunSize=4;moonAzimuth=0;moonElevation=30;moonSize=4;solarEclipseCoverage=1.12', 'sunElevation=30;sunSize=9;moonAzimuth=0;moonElevation=30;moonSize=9;solarEclipseCoverage=1.12', 'eclipse apparent size')
capture_path.write_text(capture, encoding='utf-8')

print('Applied final Phase 1C Milky Way, stars, Moon, eclipse, shadow, and evidence-frame correction.')
