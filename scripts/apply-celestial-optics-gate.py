from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGED: list[str] = []


def replace_once(relative_path: str, old: str, new: str) -> None:
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Expected source contract was not found in {relative_path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    CHANGED.append(relative_path)


def append_once(relative_path: str, marker: str, block: str) -> None:
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    path.write_text(text.rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")
    CHANGED.append(relative_path)


replace_once(
    "app/environment-runtime.js",
    """  const sunSize = clamp(worldSky.sunSize ?? worldSky.suns?.[0]?.size ?? 1, 0.1, 12);\n  const moonSize = clamp(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25, 0.1, 32);\n  const moonBrightness = clamp(worldSky.moonBrightness ?? worldSky.moons?.[0]?.radiance ?? 0.92, 0, 8);""",
    """  const sunSize = clamp(worldSky.sunSize ?? worldSky.suns?.[0]?.size ?? 1, 0.1, 12);\n  const moonSize = clamp(worldSky.moonSize ?? worldSky.moons?.[0]?.size ?? 1.25, 0.1, 32);\n  const sunAngularRadius = 0.2666 * sunSize;\n  const sunElevationDegrees = Math.asin(clamp(sunDirection[1], -1, 1)) / DEG;\n  const sunVisibility = smoothstep(-sunAngularRadius, sunAngularRadius, sunElevationDegrees);\n  const moonBrightness = clamp(worldSky.moonBrightness ?? worldSky.moons?.[0]?.radiance ?? 0.92, 0, 8);""",
)

replace_once(
    "app/environment-runtime.js",
    """    sunAngularRadius: 0.2666 * sunSize,\n    sunGlow: clamp(worldSky.sunGlow ?? 0.5, 0, 5),""",
    """    sunAngularRadius,\n    sunVisibility,\n    sunGlow: clamp(worldSky.sunGlow ?? 0.5, 0, 5),""",
)

replace_once(
    "app/sky-pass.js",
    """uniform float uDayFactor;\nuniform float uNightFactor;\nuniform float uTwilightFactor;""",
    """uniform float uDayFactor;\nuniform float uNightFactor;\nuniform float uTwilightFactor;\nuniform float uSunVisibility;""",
)

replace_once(
    "app/sky-pass.js",
    """    float sizeRandom=hash21(cell+seed+33.4);\n    float hero=step(1.0-uStarHeroFraction,hash21(cell+seed+8.8));\n    float radiusPixels=mix(max(0.4,uStarSizeMin*0.52),max(0.48,uStarSizeMax*1.08),pow(sizeRandom,2.8));\n    radiusPixels*=1.0+hero*0.72;\n    float sigmaPixels=max(0.42,radiusPixels*0.54);\n    float psf=exp(-0.5*pow(pixelDistance/sigmaPixels,2.0));\n    psf*=1.0-smoothstep(radiusPixels*2.2,radiusPixels*3.15,pixelDistance);\n    float disc=psf*0.94;\n    float rayLength=radiusPixels*mix(2.0,4.2,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));\n    float thin=max(0.18,radiusPixels*0.095);\n    float horizontal=exp(-abs(pixelDelta.y)/thin)*exp(-abs(pixelDelta.x)/max(rayLength,0.0001));\n    float vertical=exp(-abs(pixelDelta.x)/thin)*exp(-abs(pixelDelta.y)/max(rayLength,0.0001));\n    float diagonal=exp(-abs(pixelDelta.x+pixelDelta.y)/(thin*1.5))*exp(-abs(pixelDelta.x-pixelDelta.y)/max(rayLength*0.65,0.0001));\n    float rays=(horizontal+vertical+diagonal*0.1)*hero*uStarRayStrength*0.018;\n    float phase=hash21(cell+seed+43.2)*TAU;\n    float speed=mix(0.35,2.1,hash21(cell+seed+9.3))*uStarTwinkleSpeed;\n    float pulse=0.5+0.5*sin(uTime*speed+phase);\n    float shimmer=0.5+0.5*sin(uTime*speed*1.73+phase*1.41);\n    float horizonTwinkle=1.0-smoothstep(0.04,0.68,starDirection.y);\n    float twinkleAmount=uStarTwinkleAmount*mix(0.24,1.0,horizonTwinkle)*mix(0.42,1.0,sizeRandom);\n    float twinkle=mix(1.0,mix(0.78,1.19,pulse)*mix(0.96,1.04,shimmer),twinkleAmount);\n    float temperature=hash21(cell+seed+71.4);\n    vec3 warm=vec3(1.0,0.83,0.67),neutral=vec3(0.94,0.97,1.0),cool=vec3(0.72,0.84,1.0);\n    vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);\n    starColor=mix(vec3(0.92,0.95,1.0),starColor,uStarColorVariation);\n    float energy=(0.18+pow(sizeRandom,2.2)*1.18+hero*1.12)*uStarBrightness*twinkle;\n    accumulated+=starColor*(disc+rays)*energy;""",
    """    float sizeRandom=hash21(cell+seed+33.4);\n    float hero=step(1.0-uStarHeroFraction,hash21(cell+seed+8.8));\n    float authoredMin=clamp(uStarSizeMin,0.02,4.0);\n    float authoredMax=max(authoredMin,clamp(uStarSizeMax,0.02,8.0));\n    float microRadius=mix(clamp(authoredMin*0.36,0.12,0.32),clamp(authoredMax*0.46,0.28,0.9),pow(sizeRandom,4.6));\n    float heroRadius=clamp(microRadius*(1.45+sizeRandom*0.65),0.72,2.05);\n    float radiusPixels=mix(microRadius,heroRadius,hero);\n    float sigmaPixels=mix(max(0.24,radiusPixels*0.38),max(0.34,radiusPixels*0.44),hero);\n    float psf=exp(-0.5*pow(pixelDistance/sigmaPixels,2.0));\n    psf*=1.0-smoothstep(radiusPixels*1.65,radiusPixels*2.45,pixelDistance);\n    float core=psf*mix(0.76,0.94,hero);\n    float haloSigma=max(0.62,radiusPixels*1.42);\n    float halo=exp(-0.5*pow(pixelDistance/haloSigma,2.0))*hero*0.16;\n    halo*=1.0-smoothstep(radiusPixels*2.2,radiusPixels*4.4,pixelDistance);\n    float rayLength=radiusPixels*mix(2.0,4.2,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));\n    float thin=max(0.15,radiusPixels*0.075);\n    float horizontal=exp(-abs(pixelDelta.y)/thin)*exp(-abs(pixelDelta.x)/max(rayLength,0.0001));\n    float vertical=exp(-abs(pixelDelta.x)/thin)*exp(-abs(pixelDelta.y)/max(rayLength,0.0001));\n    float diagonal=exp(-abs(pixelDelta.x+pixelDelta.y)/(thin*1.55))*exp(-abs(pixelDelta.x-pixelDelta.y)/max(rayLength*0.62,0.0001));\n    float phase=hash21(cell+seed+43.2)*TAU;\n    float speed=mix(0.35,2.1,hash21(cell+seed+9.3))*uStarTwinkleSpeed;\n    float pulse=0.5+0.5*sin(uTime*speed+phase);\n    float shimmer=0.5+0.5*sin(uTime*speed*1.73+phase*1.41);\n    float rays=(horizontal+vertical+diagonal*0.12)*hero*uStarRayStrength*0.045*(0.72+0.28*pulse);\n    float horizonTwinkle=1.0-smoothstep(0.04,0.68,starDirection.y);\n    float twinkleAmount=uStarTwinkleAmount*mix(0.2,1.0,horizonTwinkle)*mix(0.34,1.0,sizeRandom);\n    float twinkle=mix(1.0,mix(0.84,1.14,pulse)*mix(0.97,1.03,shimmer),twinkleAmount);\n    float temperature=hash21(cell+seed+71.4);\n    vec3 warm=vec3(1.0,0.83,0.67),neutral=vec3(0.94,0.97,1.0),cool=vec3(0.72,0.84,1.0);\n    vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);\n    starColor=mix(vec3(0.92,0.95,1.0),starColor,uStarColorVariation);\n    float energy=(0.16+pow(sizeRandom,2.4)*1.08+hero*1.18)*uStarBrightness*twinkle;\n    accumulated+=starColor*(core+halo+rays)*energy;""",
)

replace_once(
    "app/sky-pass.js",
    """  float horizon=pow(clamp(1.0-abs(ray.y),0.0,1.0),4.2);\n  float upper=smoothstep(-0.04,0.82,ray.y),below=smoothstep(-0.45,-0.02,ray.y);""",
    """  float horizon=pow(clamp(1.0-abs(ray.y),0.0,1.0),4.2);\n  float celestialHorizonMask=smoothstep(-0.003,0.0045,ray.y);\n  float upper=smoothstep(-0.04,0.82,ray.y),below=smoothstep(-0.45,-0.02,ray.y);""",
)

replace_once(
    "app/sky-pass.js",
    """  float sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uDayFactor;""",
    """  float sunDisc=smoothstep(sunThresholdOuter,sunThresholdInner,sunDot)*uSunVisibility*celestialHorizonMask;""",
)

replace_once(
    "app/sky-pass.js",
    """  float forwardHalo=exp(-pow(sunAngularDistance/max(0.25,forwardHaloScale),1.35))\n    *(uMie*1.25+uHaze*0.5+uSunGlow*0.1)*uDayFactor;\n  float innerHaloScale=max(0.2,uSunAngularRadius*(1.7+uSunGlow*0.35));\n  float innerHalo=exp(-pow(sunAngularDistance/innerHaloScale,1.55))\n    *(0.32+uSunGlow*0.28+uMie*0.65)*uDayFactor;""",
    """  float forwardHalo=exp(-pow(sunAngularDistance/max(0.25,forwardHaloScale),1.35))\n    *(uMie*1.25+uHaze*0.5+uSunGlow*0.1)*uSunVisibility*celestialHorizonMask;\n  float innerHaloScale=max(0.2,uSunAngularRadius*(1.7+uSunGlow*0.35));\n  float innerHalo=exp(-pow(sunAngularDistance/innerHaloScale,1.55))\n    *(0.32+uSunGlow*0.28+uMie*0.65)*uSunVisibility*celestialHorizonMask;""",
)

replace_once(
    "app/sky-pass.js",
    """  float sunGlow=pow(sunDot,mix(11.0,36.0,clamp(uSunGlow/3.0,0.0,1.0)))*(0.07+uSunGlow*0.15+uTwilightFactor*0.38);""",
    """  float sunGlow=pow(sunDot,mix(11.0,36.0,clamp(uSunGlow/3.0,0.0,1.0)))*(0.07+uSunGlow*0.15+uTwilightFactor*0.38)*uSunVisibility*celestialHorizonMask;""",
)

replace_once(
    "app/sky-pass.js",
    """  float totality=smoothstep(0.995,1.035,eclipseAngularRatio)*eclipseCentered*uSolarEclipse;\n  float annularity=(1.0-smoothstep(0.94,1.0,eclipseAngularRatio))*eclipseCentered*uSolarEclipse;""",
    """  float eclipsePresentationVisibility=uSunVisibility*celestialHorizonMask;\n  float totality=smoothstep(0.995,1.035,eclipseAngularRatio)*eclipseCentered*uSolarEclipse*eclipsePresentationVisibility;\n  float annularity=(1.0-smoothstep(0.94,1.0,eclipseAngularRatio))*eclipseCentered*uSolarEclipse*eclipsePresentationVisibility;""",
)

replace_once(
    "app/sky-pass.js",
    """  float diamondWindow=exp(-pow((eclipseAngularRatio-0.975)/0.032,2.0))*eclipseCentered*uSolarEclipse;""",
    """  float diamondWindow=exp(-pow((eclipseAngularRatio-0.975)/0.032,2.0))*eclipseCentered*uSolarEclipse*eclipsePresentationVisibility;""",
)

replace_once(
    "app/sky-pass.js",
    """  float eclipseSilhouette=eclipseDisc*eclipseActive*uDayFactor;""",
    """  float eclipseSilhouette=eclipseDisc*eclipseActive*eclipsePresentationVisibility;""",
)

replace_once(
    "app/sky-pass.js",
    """  float moonRadius=length(moonUv),moonDisc=1.0-smoothstep(0.965,1.015,moonRadius);\n  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));\n  float independentMoonVisibility=uMoonVisibility*(1.0-eclipseActive);""",
    """  float moonRadius=length(moonUv),moonDisc=1.0-smoothstep(0.965,1.015,moonRadius);\n  float moonHorizonAngle=sin(radians(max(0.02,uMoonAngularRadius)));\n  float moonCenterVisibility=smoothstep(-moonHorizonAngle,moonHorizonAngle,uMoonDirection.y);\n  moonDisc*=moonCenterVisibility*celestialHorizonMask;\n  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));\n  float independentMoonVisibility=uMoonVisibility*(1.0-eclipseActive);""",
)

replace_once(
    "app/sky-pass.js",
    """    float eclipseMoonEnergy=mix(1.0,0.22,uLunarEclipse);\n    sky+=eclipsedMoon*moonDisc*phaseLighting*independentMoonVisibility*uMoonBrightness*1.7*eclipseMoonEnergy;""",
    """    float eclipseMoonEnergy=mix(1.0,0.22,uLunarEclipse);\n    float moonSurfaceEnergy=pow(max(phaseLighting,uMoonEarthshine*0.35),0.72);\n    sky+=eclipsedMoon*moonDisc*moonSurfaceEnergy*independentMoonVisibility*uMoonBrightness*1.7*eclipseMoonEnergy;""",
)

replace_once(
    "app/sky-pass.js",
    """  float moonGlow=pow(moonDot,mix(42.0,130.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*independentMoonVisibility*uMoonGlow*0.15;""",
    """  float moonGlow=pow(moonDot,mix(42.0,130.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*independentMoonVisibility*moonCenterVisibility*celestialHorizonMask*uMoonGlow*0.15;""",
)

replace_once(
    "app/sky-pass.js",
    """      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uRayleigh'""",
    """      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uSunVisibility','uRayleigh'""",
)

replace_once(
    "app/sky-pass.js",
    """      uDayFactor:environment.dayFactor,uNightFactor:environment.nightFactor,uTwilightFactor:environment.twilightFactor,uRayleigh:environment.atmosphereRayleigh""",
    """      uDayFactor:environment.dayFactor,uNightFactor:environment.nightFactor,uTwilightFactor:environment.twilightFactor,uSunVisibility:environment.sunVisibility,uRayleigh:environment.atmosphereRayleigh""",
)

TEST_PATH = ROOT / "tests" / "phase1g-celestial-optics.test.mjs"
if not TEST_PATH.exists():
    TEST_PATH.write_text(
        """import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport { normalizeEnvironmentState } from '../app/environment-runtime.js';\n\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\n\nfunction sceneAtSunElevation(elevation) {\n  return {\n    settings: {\n      skyTop: '#1f65b7',\n      skyBottom: '#69a9d8',\n      skyGround: '#17242d',\n      environmentV010: {\n        nightFactor: 1,\n        twilightFactor: 1,\n        sky: { sunSize: 1, moonSize: 1.25 },\n        clouds: {}, weather: {}, atmosphere: {}, lighting: {}\n      }\n    },\n    objects: [\n      { properties: { celestialRole: 'sun', azimuth: 270, elevation } },\n      { properties: { celestialRole: 'moon', azimuth: 90, elevation: 25, skyVisibility: 1, illumination: 0.75 } }\n    ]\n  };\n}\n\ntest('solar-disc visibility is geometric and independent from the broad day factor', () => {\n  const lights = { dir: [0, -1, 0], color: [1, 0.94, 0.78], exposure: 1 };\n  const partial = normalizeEnvironmentState(sceneAtSunElevation(-0.1), lights, 0);\n  assert.equal(partial.dayFactor, 0);\n  assert.ok(partial.sunVisibility > 0 && partial.sunVisibility < 1);\n\n  const hidden = normalizeEnvironmentState(sceneAtSunElevation(-1), lights, 0);\n  assert.equal(hidden.sunVisibility, 0);\n\n  const visible = normalizeEnvironmentState(sceneAtSunElevation(1), lights, 0);\n  assert.equal(visible.sunVisibility, 1);\n});\n\ntest('sky shader keeps compact stars and separates celestial visibility from lighting state', () => {\n  const sky = fs.readFileSync(path.join(ROOT, 'app', 'sky-pass.js'), 'utf8');\n  assert.match(sky, /uniform float uSunVisibility/);\n  assert.match(sky, /sunDisc=.*uSunVisibility\\*celestialHorizonMask/);\n  assert.doesNotMatch(sky, /sunDisc=.*uDayFactor/);\n  assert.match(sky, /microRadius=.*0\\.12,0\\.32/);\n  assert.match(sky, /heroRadius=clamp\\([^\\n]+0\\.72,2\\.05\\)/);\n  assert.match(sky, /float halo=.*hero\\*0\\.16/);\n  assert.match(sky, /rays=.*hero\\*uStarRayStrength\\*0\\.045/);\n  assert.match(sky, /moonDisc\\*=moonCenterVisibility\\*celestialHorizonMask/);\n  assert.match(sky, /moonSurfaceEnergy=pow\\(max\\(phaseLighting,uMoonEarthshine\\*0\\.35\\),0\\.72\\)/);\n});\n""",
        encoding="utf-8",
    )
    CHANGED.append("tests/phase1g-celestial-optics.test.mjs")

append_once(
    "progress.md",
    "## Celestial visibility and optical-star gate",
    """## Celestial visibility and optical-star gate\n\n- Separates geometric Sun-disc visibility from the broad day/night lighting factor so the physical Sun can cross the horizon instead of crossfading into another celestial presentation.\n- Clips Sun, Moon, eclipse silhouette, corona, and celestial glow against the geometric horizon.\n- Preserves the visible Moon independently from its daytime world-light contribution and removes an unnecessary second linear phase-darkening term.\n- Caps ordinary stellar point-spread footprints, reserves larger halos and glints for rare hero stars, and strengthens bounded hero-star rays without restoring square or dash artifacts.\n- Adds behavior and shader-contract tests. Exact packaged visual approval is still required.\n""",
)

print("Changed files:")
for item in CHANGED:
    print(f"- {item}")
