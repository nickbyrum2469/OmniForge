from __future__ import annotations

import re
from pathlib import Path


def _write(path: Path, text: str, changed: list[str], root: Path) -> None:
    current = path.read_text(encoding='utf-8')
    if current == text:
        return
    path.write_text(text, encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def _sub_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        if replacement in text:
            return text
        raise RuntimeError(f'Expected sky contract was not found: {label}')
    return updated


def apply(root: Path, changed: list[str]) -> None:
    path = root / 'app/sky-pass.js'
    text = path.read_text(encoding='utf-8')

    star_block = r'''    float sizeRandom=hash21(cell+seed+33.4);
    float classRandom=hash21(cell+seed+8.8);
    float heroProbability=clamp(uStarHeroFraction,0.001,0.008);
    float mediumProbability=clamp(0.035+heroProbability*7.0,0.035,0.09);
    float hero=step(1.0-heroProbability,classRandom);
    float medium=step(1.0-heroProbability-mediumProbability,classRandom)*(1.0-hero);
    float authoredMin=clamp(uStarSizeMin,0.02,4.0);
    float authoredMax=max(authoredMin,clamp(uStarSizeMax,0.02,8.0));
    float microRadius=mix(clamp(authoredMin*0.22,0.07,0.16),clamp(authoredMax*0.24,0.14,0.42),pow(sizeRandom,5.6));
    float mediumRadius=clamp(microRadius*1.38+0.08,0.24,0.72);
    float heroRadius=clamp(mediumRadius*1.45+0.18,0.68,1.45);
    float radiusPixels=mix(microRadius,mediumRadius,medium);
    radiusPixels=mix(radiusPixels,heroRadius,hero);
    float sigmaPixels=max(0.18,radiusPixels*mix(0.32,0.4,medium+hero));
    float psf=exp(-0.5*pow(pixelDistance/sigmaPixels,2.0));
    psf*=1.0-smoothstep(radiusPixels*1.35,radiusPixels*2.1,pixelDistance);
    float core=psf*mix(0.7,0.96,medium*0.45+hero);
    float haloSigma=max(0.48,radiusPixels*1.35);
    float halo=exp(-0.5*pow(pixelDistance/haloSigma,2.0))*(medium*0.025+hero*0.1);
    halo*=1.0-smoothstep(radiusPixels*1.9,radiusPixels*3.7,pixelDistance);
    float rayLength=heroRadius*mix(1.8,3.4,clamp((uStarRayLength-0.1)/3.9,0.0,1.0));
    float thin=max(0.12,heroRadius*0.06);
    float horizontal=exp(-abs(pixelDelta.y)/thin)*exp(-abs(pixelDelta.x)/max(rayLength,0.0001));
    float vertical=exp(-abs(pixelDelta.x)/thin)*exp(-abs(pixelDelta.y)/max(rayLength,0.0001));
    float diagonal=exp(-abs(pixelDelta.x+pixelDelta.y)/(thin*1.5))*exp(-abs(pixelDelta.x-pixelDelta.y)/max(rayLength*0.58,0.0001));
    float phase=hash21(cell+seed+43.2)*TAU;
    float speed=mix(0.28,1.85,hash21(cell+seed+9.3))*uStarTwinkleSpeed;
    float pulse=0.5+0.5*sin(uTime*speed+phase);
    float shimmer=0.5+0.5*sin(uTime*speed*1.71+phase*1.37);
    float glintVariation=0.78+0.22*pulse;
    float rays=(horizontal+vertical+diagonal*0.1)*hero*uStarRayStrength*0.028*glintVariation;
    float horizonTwinkle=1.0-smoothstep(0.04,0.68,starDirection.y);
    float twinkleAmount=uStarTwinkleAmount*mix(0.12,0.72,horizonTwinkle)*mix(0.25,0.8,sizeRandom);
    float twinkle=mix(1.0,mix(0.9,1.1,pulse)*mix(0.98,1.02,shimmer),twinkleAmount);
    float temperature=hash21(cell+seed+71.4);
    vec3 warm=vec3(1.0,0.83,0.67),neutral=vec3(0.94,0.97,1.0),cool=vec3(0.72,0.84,1.0);
    vec3 starColor=temperature<0.5?mix(warm,neutral,temperature*2.0):mix(neutral,cool,(temperature-0.5)*2.0);
    starColor=mix(vec3(0.92,0.95,1.0),starColor,uStarColorVariation);
    float energy=(0.12+pow(sizeRandom,2.8)*0.92+medium*0.42+hero*1.25)*uStarBrightness*twinkle;
    accumulated+=starColor*(core+halo+rays)*energy;'''
    text = _sub_once(
        text,
        r'    float sizeRandom=hash21\(cell\+seed\+33\.4\);.*?    accumulated\+=starColor\*\(core\+halo\+rays\)\*energy;',
        star_block,
        'star optical block',
        re.S,
    )

    text = text.replace(
        '  vec3 mappedAlbedo=srgbToLinear(texture(uMoonAlbedoMap,lunarMapUv).rgb);\n  float low=',
        '  vec3 mappedAlbedo=srgbToLinear(texture(uMoonAlbedoMap,lunarMapUv).rgb);\n'
        '  float mappedLuma=max(0.0001,dot(mappedAlbedo,vec3(0.2126,0.7152,0.0722)));\n'
        '  float compressedLuma=mappedLuma/(0.32+mappedLuma)*0.72;\n'
        '  mappedAlbedo*=compressedLuma/mappedLuma;\n  float low=',
    )
    text = text.replace(
        '  vec3 mappedLunarAlbedo=mappedAlbedo*1.28;',
        '  vec3 mappedLunarAlbedo=pow(max(mappedAlbedo,vec3(0.001)),vec3(0.94))*1.08;',
    )
    text = text.replace(
        '  float mappedSurface=grain*0.12+craters.x*0.1+relief*0.08;',
        '  float mappedSurface=grain*0.07+craters.x*0.035+relief*0.035;',
    )

    text = text.replace('  float celestialHorizonMask=smoothstep(-0.003,0.0045,ray.y);\n', '')
    text = text.replace('*uSunVisibility*celestialHorizonMask;', '*uSunVisibility;')
    text = text.replace(
        'float eclipsePresentationVisibility=uSunVisibility*celestialHorizonMask;',
        'float eclipsePresentationVisibility=uSunVisibility;',
    )

    compositor = r'''  float moonDot=max(dot(ray,uMoonDirection),0.0);
  vec2 moonUv=celestialUv(ray,uMoonDirection,uMoonAngularRadius);
  float moonRadius=length(moonUv);
  float moonGeometricDisc=1.0-smoothstep(0.955,1.025,moonRadius);
  float moonOcclusionDisc=1.0-smoothstep(0.94,1.045,moonRadius);
  float moonHorizonAngle=sin(radians(max(0.02,uMoonAngularRadius)));
  float moonCenterVisibility=smoothstep(-moonHorizonAngle*1.15,moonHorizonAngle*0.85,uMoonDirection.y);
  float moonBodyVisibility=(1.0-eclipseActive)*moonCenterVisibility;
  float moonDisc=moonGeometricDisc*moonBodyVisibility;
  moonOcclusionDisc=clamp(moonOcclusionDisc*moonBodyVisibility,0.0,1.0);
  float moonSphere=sqrt(max(0.0,1.0-moonRadius*moonRadius));
  float independentMoonVisibility=uMoonVisibility*(1.0-eclipseActive);

  if(uPlanetEnabled>.5){
    vec2 planetUv=celestialUv(ray,uPlanetDirection,uPlanetAngularRadius);
    float planetRadius=length(planetUv),planetDisc=1.0-smoothstep(0.96,1.015,planetRadius);
    float bands=0.84+0.16*sin(planetUv.y*18.0+noise2(planetUv*5.0)*2.0);
    sky+=srgbToLinear(uPlanetColor)*planetDisc*bands*uPlanetBrightness*uNightFactor*(1.0-moonOcclusionDisc);
    float ringEllipse=length(vec2(planetUv.x,planetUv.y*4.4));
    float ring=(smoothstep(1.75,1.55,ringEllipse)-smoothstep(1.18,1.02,ringEllipse))*uPlanetRings;
    ring*=1.0-smoothstep(0.0,0.22,abs(planetUv.y));
    sky+=srgbToLinear(uPlanetColor)*ring*uPlanetBrightness*0.72*uNightFactor*(1.0-moonOcclusionDisc);
  }

  float starHorizon=smoothstep(0.015,0.16,ray.y);
  float stellarAirMass=1.0/max(0.12,ray.y+0.09);
  float stellarOpticalDepth=(uHaze*0.9+uMie*0.65+uHumidity*0.18+uDayFactor*0.5+uTwilightFactor*0.16)*stellarAirMass;
  float stellarTransmission=exp(-stellarOpticalDepth);
  vec3 stars=starLayer(ray,180.0,uStarSeed)+starLayer(ray,360.0,uStarSeed+101.0);
  float eclipseStarVisibility=smoothstep(0.975,1.0,uSolarEclipse)*uDayFactor*0.09;
  float stellarCelestialMask=(1.0-eclipseSilhouette)*(1.0-moonOcclusionDisc);
  sky+=stars*max(uStarVisibility,eclipseStarVisibility)*starHorizon*stellarTransmission*stellarCelestialMask;
  sky+=milkyWay(ray,starHorizon*stellarTransmission)*stellarCelestialMask;

  if(moonDisc>0.001){
    vec3 moonReference=abs(uMoonDirection.y)>.94?vec3(1,0,0):vec3(0,1,0);
    vec3 moonRight=normalize(cross(moonReference,uMoonDirection)),moonUp=normalize(cross(uMoonDirection,moonRight));
    vec3 moonSurfaceNormal=normalize(moonRight*moonUv.x+moonUp*moonUv.y-uMoonDirection*moonSphere);
    float directPhase=max(dot(moonSurfaceNormal,uSunDirection),0.0);
    float phaseLighting=max(directPhase,uMoonEarthshine*(1.0-directPhase));
    float limb=mix(1.0,pow(max(0.0,moonSphere),0.32),uMoonLimbDarkening);
    vec3 normalMoonSurface=lunarSurface(moonUv,moonSurfaceNormal,phaseLighting)*limb;
    vec3 eclipsedMoon=mix(normalMoonSurface,vec3(0.58,0.09,0.035)*(0.7+normalMoonSurface),uLunarEclipse*0.9);
    float eclipseMoonEnergy=mix(1.0,0.22,uLunarEclipse);
    float moonSurfaceEnergy=pow(max(phaseLighting,uMoonEarthshine*0.35),0.72);
    vec3 moonComposite=eclipsedMoon*moonSurfaceEnergy*independentMoonVisibility*uMoonBrightness*1.7*eclipseMoonEnergy;
    sky=mix(sky,moonComposite,clamp(moonDisc,0.0,1.0));
  }
  float moonGlow=pow(moonDot,mix(42.0,130.0,clamp(1.0-uMoonGlow/5.0,0.0,1.0)))*independentMoonVisibility*moonCenterVisibility*uMoonGlow*0.15;
  sky+=mix(moonLinear,vec3(0.68,0.14,0.05),uLunarEclipse)*moonGlow;'''
    text = _sub_once(
        text,
        r'  float moonDot=max\(dot\(ray,uMoonDirection\),0\.0\);.*?  sky\+=milkyWay\(ray,starHorizon\*stellarTransmission\)\*stellarCelestialMask;',
        compositor,
        'celestial compositor',
        re.S,
    )

    if 'celestialHorizonMask' in text:
        raise RuntimeError('Rejected ray-level celestial horizon mask remains in sky-pass.js')
    _write(path, text, changed, root)
