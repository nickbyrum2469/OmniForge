from pathlib import Path
import re

sky_path = Path('app/sky-pass.js')
sky = sky_path.read_text(encoding='utf-8')

if 'float galacticCloudEnvelope=' not in sky:
    replacement = r'''vec3 milkyWay(vec3 ray,float horizonMask){
  float orientation=radians(uMilkyWayOrientation);
  vec3 galacticNormal=normalize(vec3(cos(orientation)*0.78,0.32,sin(orientation)*0.78));
  vec3 reference=abs(galacticNormal.y)>.94?vec3(1,0,0):vec3(0,1,0);
  vec3 tangent=normalize(cross(reference,galacticNormal));
  vec3 bitangent=normalize(cross(galacticNormal,tangent));
  float latitude=dot(ray,galacticNormal);
  float longitude=atan(dot(ray,bitangent),dot(ray,tangent));
  vec3 periodic=vec3(cos(longitude),sin(longitude),latitude);
  float coarse=fbm3(periodic*vec3(1.35,1.35,3.0)+vec3(3.7,11.2,5.4)+uStarSeed*0.00031);
  float medium=fbm3(periodic*vec3(3.4,3.4,7.6)+vec3(17.4,2.8,23.1)+uStarSeed*0.00057);
  float fine=fbm3(periodic*vec3(8.2,8.2,15.0)+vec3(31.3,8.1,4.6)+uStarSeed*0.00093);
  float warp=(coarse-0.5)*uMilkyWayWidth*uMilkyWayWarp*0.62;
  warp+=sin(longitude*2.0+medium*2.2)*uMilkyWayWidth*uMilkyWayWarp*0.12;
  float widthVariation=mix(0.72,1.34,coarse);
  widthVariation*=1.0+sin(longitude*3.0+medium*1.7)*uMilkyWayWidthVariation*0.13;
  float localWidth=max(0.01,uMilkyWayWidth*max(0.42,widthVariation));
  float signedDistance=latitude-warp;
  float coreBand=exp(-pow(abs(signedDistance)/localWidth,2.0)*1.7);
  float diffuseHalo=exp(-pow(abs(signedDistance)/max(0.018,localWidth*2.7),2.0)*1.25)*0.08;
  float filamentUpper=exp(-pow(abs(signedDistance-localWidth*0.7)/max(0.007,localWidth*0.3),2.0)*2.1)*0.1;
  float filamentLower=exp(-pow(abs(signedDistance+localWidth*0.82)/max(0.007,localWidth*0.34),2.0)*2.15)*0.07;
  float galacticCore=exp(-pow(wrappedDistance(longitude,-0.62)/0.52,2.0))*uMilkyWayCoreStrength;
  float longitudinalBreakup=0.38+0.62*smoothstep(0.24,0.78,coarse*0.64+medium*0.36);
  longitudinalBreakup=mix(0.62,longitudinalBreakup,clamp(uMilkyWayClumping,0.0,1.35));
  float cloudTexture=0.34+coarse*0.28+medium*0.28+fine*0.1;
  float galacticCloudEnvelope=(coreBand+diffuseHalo+filamentUpper+filamentLower)*cloudTexture*longitudinalBreakup;
  float subtleKnots=smoothstep(0.62,0.88,fine)*coreBand*uMilkyWayDetail*0.16;
  float centralDust=exp(-pow(abs(signedDistance)/max(0.004,localWidth*0.2),2.0)*2.4);
  centralDust*=smoothstep(0.34,0.76,medium*0.62+fine*0.38)*uMilkyWayDust;
  float brokenDust=exp(-pow(abs(signedDistance-localWidth*0.34)/max(0.004,localWidth*0.16),2.0)*2.2);
  brokenDust*=smoothstep(0.56,0.84,fine)*uMilkyWayDust*0.26;
  float luminance=max(0.0,(galacticCloudEnvelope+subtleKnots+galacticCore*coreBand*0.22)*(1.0-centralDust*0.86-brokenDust));
  vec3 warmCore=vec3(0.96,0.78,0.62);
  vec3 color=mix(uMilkyWayColor,warmCore,clamp(galacticCore*0.24,0.0,0.3));
  return color*luminance*uMilkyWayIntensity*0.7*horizonMask;
}'''
    sky, count = re.subn(r'vec3 milkyWay\(vec3 ray,float horizonMask\)\{.*?\n\}', replacement, sky, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Could not replace Milky Way function; matches={count}.')

# Soften repetitive crater-ring outlines while keeping readable basin relief.
sky = sky.replace('  return ring*0.62-basin*0.36;', '  return ring*0.28-basin*0.42;')

if 'float galacticCloudEnvelope=' not in sky:
    raise RuntimeError('Refined galactic cloud envelope is missing.')
if 'microStructure=' in sky:
    raise RuntimeError('Thresholded galactic blob noise survived refinement.')

sky_path.write_text(sky, encoding='utf-8')

capture_path = Path('scripts/run-phase1c-visual-captures.ps1')
capture = capture_path.read_text(encoding='utf-8')
old_night = "sky=@{celestialMode='manual';sunAzimuth=180;sunElevation=-35;moonAzimuth=150;moonElevation=-18;planetEnabled=$false;eclipseMode='auto';starIntensity=1;starDensity=.62;starBrightness=.86;starTwinkleAmount=.42;starTwinkleSpeed=.9;starSizeMin=.38;starSizeMax=1.4;starRayStrength=.1;starRayLength=.9;starHeroFraction=.006;milkyWayIntensity=.62;milkyWayWidth=.2;milkyWayDetail=1.05;milkyWayOrientation=32;milkyWayDust=.72;milkyWayWarp=.42;milkyWayClumping=.72;milkyWayCoreStrength=.72;milkyWayWidthVariation=.52}"
new_night = "sky=@{celestialMode='manual';sunAzimuth=180;sunElevation=-35;moonAzimuth=150;moonElevation=-18;planetEnabled=$false;eclipseMode='auto';starIntensity=1;starDensity=.62;starBrightness=.86;starTwinkleAmount=.42;starTwinkleSpeed=.9;starSizeMin=.38;starSizeMax=1.4;starRayStrength=.06;starRayLength=.7;starHeroFraction=.004;milkyWayIntensity=0;milkyWayWidth=.2;milkyWayDetail=1.05;milkyWayOrientation=32;milkyWayDust=.72;milkyWayWarp=.42;milkyWayClumping=.72;milkyWayCoreStrength=.72;milkyWayWidthVariation=.52}"
if new_night not in capture:
    if old_night not in capture:
        raise RuntimeError('Star-only night capture authority anchor is missing.')
    capture = capture.replace(old_night, new_night, 1)

milky_way_patch = "sky=@{starIntensity=0;milkyWayIntensity=.72;milkyWayWidth=.18;milkyWayDetail=1.05;milkyWayOrientation=32;milkyWayDust=.72;milkyWayWarp=.42;milkyWayClumping=.76;milkyWayCoreStrength=.72;milkyWayWidthVariation=.52}"
if milky_way_patch not in capture:
    old_capture_pair = "  Request-Capture $captureDir 'night-sky' @{position=@(0,20,0);yaw=-.65;pitch=.92;fov=78}|Out-Null\n  Request-Capture $captureDir 'milky-way' @{position=@(0,20,0);yaw=-1.0123;pitch=1.1815;fov=74}|Out-Null"
    new_capture_pair = "  Request-Capture $captureDir 'night-sky' @{position=@(0,20,0);yaw=-.65;pitch=.92;fov=78}|Out-Null\n  Patch-World $port @{" + milky_way_patch + "}\n  Request-Capture $captureDir 'milky-way' @{position=@(0,20,0);yaw=-1.0123;pitch=1.1815;fov=74}|Out-Null"
    if old_capture_pair not in capture:
        raise RuntimeError('Separated star/Milky Way capture anchor is missing.')
    capture = capture.replace(old_capture_pair, new_capture_pair, 1)

capture_path.write_text(capture, encoding='utf-8')
print('Rebuilt the Milky Way as smooth layered dust and separated star-only visual evidence.')
