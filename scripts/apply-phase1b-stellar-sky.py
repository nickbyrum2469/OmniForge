from pathlib import Path


def replace_once(path, before, after, label):
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if after in text:
        return False
    if before not in text:
        raise RuntimeError(f'Phase 1B migration could not find {label} in {path}.')
    target.write_text(text.replace(before, after, 1), encoding='utf-8')
    return True


changed = []

if replace_once(
    'server/v010-systems.mjs',
    """      starIntensity: 1,
      starDensity: 0.72,
      starDaylightExtinction: 1.35,
      milkyWayIntensity: 0.35,
      moonAzimuth: 90,
""",
    """      starIntensity: 1,
      starDensity: 0.72,
      starDaylightExtinction: 1.35,
      starSizeMin: 0.55,
      starSizeMax: 2.4,
      starBrightnessVariation: 0.62,
      starColorVariation: 0.38,
      starTwinkleAmount: 0.48,
      starTwinkleSpeed: 1,
      starSeed: 1337,
      starRotation: 0,
      starHorizonFade: 0.18,
      starWarmColor: '#ffd8aa',
      starCoolColor: '#a9c9ff',
      milkyWayIntensity: 0.35,
      milkyWayWidth: 16,
      milkyWayDetail: 1.25,
      milkyWayDust: 0.68,
      milkyWayCore: 0.78,
      milkyWayAzimuth: 18,
      milkyWayElevation: 62,
      milkyWayRotation: 27,
      milkyWayColor: '#7187bd',
      milkyWayCoreColor: '#e2c9a5',
      moonAzimuth: 90,
""",
    'stellar sky defaults'
): changed.append('server/v010-systems.mjs')

if replace_once(
    'server/v010-systems.mjs',
    """      auroraIntensity: 0,
      shootingStarRate: 0.05,
""",
    """      auroraIntensity: 0,
      auroraColor: '#58e7c1',
      auroraSecondaryColor: '#7668ff',
      auroraSpeed: 0.35,
      auroraScale: 1,
      shootingStarRate: 0.05,
""",
    'aurora defaults'
): changed.append('server/v010-systems.mjs')

if replace_once(
    'server/v010-systems.mjs',
    """    starDensity: clamp(Number(world.sky.starDensity || 0.72), 0, 1),
""",
    """    starDensity: clamp(Number(world.sky.starDensity || 0.72), 0.08, 2),
""",
    'star density persistence range'
): changed.append('server/v010-systems.mjs')

if replace_once(
    'app/environment-runtime.js',
    """function horizontalWind(value) {
  const source = Array.isArray(value) ? value : [1, 0, 0.25];
  const x = Number(source[0]) || 0;
  const z = Number(source[2] ?? source[1]) || 0;
  const magnitude = Math.hypot(x, z) || 1;
  return [x / magnitude, z / magnitude];
}
""",
    """function horizontalWind(value) {
  const source = Array.isArray(value) ? value : [1, 0, 0.25];
  const x = Number(source[0]) || 0;
  const z = Number(source[2] ?? source[1]) || 0;
  const magnitude = Math.hypot(x, z) || 1;
  return [x / magnitude, z / magnitude];
}

function galacticBasis(azimuthDegrees = 18, elevationDegrees = 62, rotationDegrees = 27) {
  const normal = directionFromAzimuthElevation(azimuthDegrees, elevationDegrees);
  const reference = Math.abs(normal[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(reference, normal));
  const up = normalize(cross(normal, right));
  const angle = Number(rotationDegrees || 0) * DEG;
  const axis = normalize([
    right[0] * Math.cos(angle) + up[0] * Math.sin(angle),
    right[1] * Math.cos(angle) + up[1] * Math.sin(angle),
    right[2] * Math.cos(angle) + up[2] * Math.sin(angle)
  ]);
  return { normal, axis };
}
""",
    'galactic basis helper'
): changed.append('app/environment-runtime.js')

if replace_once(
    'app/environment-runtime.js',
    """  const moonBrightness = clamp(worldSky.moonBrightness ?? worldSky.moons?.[0]?.radiance ?? 1, 0, 8);

  return {
""",
    """  const moonBrightness = clamp(worldSky.moonBrightness ?? worldSky.moons?.[0]?.radiance ?? 1, 0, 8);
  const starSizeMin = clamp(worldSky.starSizeMin ?? 0.55, 0.1, 6);
  const starSizeMax = Math.max(starSizeMin, clamp(worldSky.starSizeMax ?? 2.4, 0.1, 8));
  const milkyWayBasis = galacticBasis(
    worldSky.milkyWayAzimuth ?? 18,
    worldSky.milkyWayElevation ?? 62,
    worldSky.milkyWayRotation ?? 27
  );

  return {
""",
    'stellar normalization prelude'
): changed.append('app/environment-runtime.js')

if replace_once(
    'app/environment-runtime.js',
    """    starVisibility: clamp01(nightFactor * starIntensity * daylightSuppression),
    starDensity,
    starDaylightExtinction: starExtinction,
    milkyWayIntensity: Math.max(0, Number(worldSky.milkyWayIntensity ?? 0.35)) * nightFactor * daylightSuppression,
    sunAngularRadius: 0.2666 * sunSize,
""",
    """    starVisibility: clamp01(nightFactor * starIntensity * daylightSuppression),
    starDensity,
    starDaylightExtinction: starExtinction,
    starSizeMin,
    starSizeMax,
    starBrightnessVariation: clamp01(worldSky.starBrightnessVariation ?? 0.62),
    starColorVariation: clamp01(worldSky.starColorVariation ?? 0.38),
    starTwinkleAmount: clamp01(worldSky.starTwinkleAmount ?? 0.48),
    starTwinkleSpeed: clamp(worldSky.starTwinkleSpeed ?? 1, 0, 8),
    starSeed: Number(worldSky.starSeed ?? 1337),
    starRotation: clamp(worldSky.starRotation ?? 0, -720, 720),
    starHorizonFade: clamp(worldSky.starHorizonFade ?? 0.18, 0.01, 0.8),
    starWarmColor: color(worldSky.starWarmColor, '#ffd8aa'),
    starCoolColor: color(worldSky.starCoolColor, '#a9c9ff'),
    milkyWayIntensity: Math.max(0, Number(worldSky.milkyWayIntensity ?? 0.35)) * nightFactor * daylightSuppression,
    milkyWayWidth: clamp(worldSky.milkyWayWidth ?? 16, 2, 45),
    milkyWayDetail: clamp(worldSky.milkyWayDetail ?? 1.25, 0.2, 4),
    milkyWayDust: clamp01(worldSky.milkyWayDust ?? 0.68),
    milkyWayCore: clamp(worldSky.milkyWayCore ?? 0.78, 0, 2),
    milkyWayNormal: milkyWayBasis.normal,
    milkyWayAxis: milkyWayBasis.axis,
    milkyWayColor: color(worldSky.milkyWayColor, '#7187bd'),
    milkyWayCoreColor: color(worldSky.milkyWayCoreColor, '#e2c9a5'),
    auroraIntensity: Math.max(0, Number(worldSky.auroraIntensity ?? 0)) * nightFactor * daylightSuppression,
    auroraColor: color(worldSky.auroraColor, '#58e7c1'),
    auroraSecondaryColor: color(worldSky.auroraSecondaryColor, '#7668ff'),
    auroraSpeed: clamp(worldSky.auroraSpeed ?? 0.35, 0, 4),
    auroraScale: clamp(worldSky.auroraScale ?? 1, 0.2, 4),
    sunAngularRadius: 0.2666 * sunSize,
""",
    'stellar environment output'
): changed.append('app/environment-runtime.js')

if replace_once(
    'app/sky-pass.js',
    """uniform float uStarVisibility;
uniform float uStarDensity;
uniform float uMilkyWayIntensity;
uniform float uSunAngularRadius;
""",
    """uniform float uStarVisibility;
uniform float uStarDensity;
uniform float uStarSizeMin;
uniform float uStarSizeMax;
uniform float uStarBrightnessVariation;
uniform float uStarColorVariation;
uniform float uStarTwinkleAmount;
uniform float uStarTwinkleSpeed;
uniform float uStarSeed;
uniform float uStarRotation;
uniform float uStarHorizonFade;
uniform vec3 uStarWarmColor;
uniform vec3 uStarCoolColor;
uniform float uMilkyWayIntensity;
uniform float uMilkyWayWidth;
uniform float uMilkyWayDetail;
uniform float uMilkyWayDust;
uniform float uMilkyWayCore;
uniform vec3 uMilkyWayNormal;
uniform vec3 uMilkyWayAxis;
uniform vec3 uMilkyWayColor;
uniform vec3 uMilkyWayCoreColor;
uniform float uAuroraIntensity;
uniform vec3 uAuroraColor;
uniform vec3 uAuroraSecondaryColor;
uniform float uAuroraSpeed;
uniform float uAuroraScale;
uniform float uSunAngularRadius;
""",
    'stellar shader uniforms'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """uniform float uTime;
uniform float uExposure;
""",
    """uniform float uTime;
uniform float uCloudTime;
uniform float uExposure;
""",
    'independent cloud clock uniform'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """float fbm3(vec3 p){
  float value=0.0,amplitude=0.56;
  for(int i=0;i<4;i++){
    value+=noise3(p)*amplitude;
    p=p*2.03+vec3(13.1,7.7,19.3);
    amplitude*=0.5;
  }
  return value;
}
vec3 toneMap(vec3 value){
""",
    """float fbm3(vec3 p){
  float value=0.0,amplitude=0.56;
  for(int i=0;i<4;i++){
    value+=noise3(p)*amplitude;
    p=p*2.03+vec3(13.1,7.7,19.3);
    amplitude*=0.5;
  }
  return value;
}
vec3 rotateAroundY(vec3 value,float angle){
  float c=cos(angle),s=sin(angle);
  return vec3(value.x*c-value.z*s,value.y,value.x*s+value.z*c);
}
vec2 octEncode(vec3 direction){
  vec3 p=direction.xzy/max(0.0001,abs(direction.x)+abs(direction.y)+abs(direction.z));
  vec2 encoded=p.xy;
  if(p.z<0.0)encoded=(1.0-abs(encoded.yx))*sign(encoded.xy+vec2(0.00001));
  return encoded*0.5+0.5;
}
vec3 starLayer(vec3 ray,float grid,float probability,float seedOffset){
  vec2 coordinates=octEncode(ray)*grid;
  vec2 cell=floor(coordinates);
  vec2 local=fract(coordinates);
  vec2 seedVector=vec2(uStarSeed*0.013+seedOffset,uStarSeed*0.021-seedOffset*0.37);
  float seed=hash21(cell+seedVector);
  float present=step(1.0-probability,seed);
  vec2 offset=vec2(hash21(cell+seedVector+17.13),hash21(cell+seedVector+53.71));
  offset=0.20+offset*0.60;
  float sizeRandom=pow(hash21(cell+seedVector+91.37),2.2);
  float size=mix(uStarSizeMin,uStarSizeMax,sizeRandom);
  float radius=mix(0.025,0.19,clamp(size/8.0,0.0,1.0));
  float distanceToStar=length(local-offset);
  float core=1.0-smoothstep(radius*0.12,radius,distanceToStar);
  float halo=(1.0-smoothstep(radius,radius*3.2,distanceToStar))*0.18;
  float brightnessRandom=hash21(cell+seedVector+123.4);
  float brightness=mix(1.0-uStarBrightnessVariation*0.62,1.0+uStarBrightnessVariation*1.45,brightnessRandom);
  float frequency=0.62+hash21(cell+seedVector+151.9)*2.4;
  float pulse=0.5+0.5*sin(uTime*uStarTwinkleSpeed*frequency+seed*TAU);
  float twinkle=mix(1.0,0.56+pulse*0.88,uStarTwinkleAmount);
  float temperature=hash21(cell+seedVector+199.2);
  vec3 temperatureColor=mix(uStarWarmColor,uStarCoolColor,temperature);
  vec3 starColor=mix(vec3(1.0),temperatureColor,uStarColorVariation);
  return starColor*(core+halo)*present*brightness*twinkle;
}
vec3 stellarField(vec3 ray){
  vec3 rotated=rotateAroundY(ray,radians(uStarRotation));
  float density01=clamp((uStarDensity-0.08)/1.92,0.0,1.0);
  float grid=mix(170.0,520.0,density01);
  vec3 primary=starLayer(rotated,grid,mix(0.004,0.045,density01),0.0);
  vec3 secondary=starLayer(rotated,grid*0.47,mix(0.003,0.022,density01),37.4)*0.72;
  return primary+secondary;
}
vec3 milkyWayField(vec3 ray){
  if(uMilkyWayIntensity<=0.001)return vec3(0.0);
  vec3 normal=normalize(uMilkyWayNormal);
  vec3 axis=normalize(uMilkyWayAxis-normal*dot(uMilkyWayAxis,normal));
  vec3 side=normalize(cross(normal,axis));
  float latitude=dot(ray,normal);
  float longitude=atan(dot(ray,side),dot(ray,axis));
  float width=max(0.006,sin(radians(uMilkyWayWidth)));
  float envelope=exp(-pow(abs(latitude)/width,1.58));
  float detail=max(0.2,uMilkyWayDetail);
  vec2 galacticUv=vec2(longitude/PI,latitude/width);
  float macro=fbm2(galacticUv*vec2(2.7,1.25)*detail+vec2(uStarSeed*0.0007,9.2));
  float filament=fbm2(galacticUv*vec2(8.4,3.2)*detail+vec2(31.4,uStarSeed*0.0011));
  float coreShape=exp(-pow(abs(longitude)/0.72,2.0))*uMilkyWayCore;
  float density=envelope*(0.17+macro*0.58+filament*0.25)*(0.68+coreShape*0.72);
  float dustNoise=fbm2(galacticUv*vec2(5.5,8.0)*detail+71.0);
  float dustLane=exp(-pow(latitude/max(0.001,width*0.19),2.0))*smoothstep(0.34,0.78,dustNoise)*uMilkyWayDust;
  float stellarKnots=pow(max(0.0,filament-0.56),2.0)*envelope;
  vec3 galacticColor=mix(uMilkyWayColor,uMilkyWayCoreColor,clamp(coreShape+stellarKnots*0.7,0.0,1.0));
  return galacticColor*density*(1.0-dustLane*0.84)*(1.0+stellarKnots*0.65)*uMilkyWayIntensity;
}
vec3 auroraField(vec3 ray){
  if(uAuroraIntensity<=0.001||ray.y<=0.0)return vec3(0.0);
  float azimuth=atan(ray.z,ray.x)/TAU+0.5;
  float scale=max(0.2,uAuroraScale);
  float flow=fbm2(vec2(azimuth*8.0*scale+uTime*uAuroraSpeed*0.025,ray.y*5.2));
  float ribbons=pow(0.5+0.5*sin((azimuth*13.0*scale+flow*1.9+uTime*uAuroraSpeed*0.012)*TAU),7.0);
  float wisps=smoothstep(0.46,0.82,fbm2(vec2(azimuth*19.0*scale-uTime*uAuroraSpeed*0.018,ray.y*8.0+flow)));
  float vertical=smoothstep(0.015,0.12,ray.y)*(1.0-smoothstep(0.56,0.92,ray.y));
  float curtain=vertical*(ribbons*0.72+wisps*0.38)*uAuroraIntensity;
  vec3 color=mix(uAuroraColor,uAuroraSecondaryColor,clamp(ray.y*1.5+flow*0.28,0.0,1.0));
  return color*curtain;
}
vec3 toneMap(vec3 value){
""",
    'stellar shader functions'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """  cloudUv+=uCloudWind*uTime*0.00045;
""",
    """  cloudUv+=uCloudWind*uCloudTime*0.00045;
""",
    'layered cloud clock'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """  vec3 wind=vec3(uCloudWind.x,0.0,uCloudWind.y)*uTime*0.42;
""",
    """  vec3 wind=vec3(uCloudWind.x,0.0,uCloudWind.y)*uCloudTime*0.42;
""",
    'volumetric cloud clock'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """  vec3 starCell=floor(ray*mix(380.0,760.0,clamp(uStarDensity*0.7,0.0,1.0))+uCloudSeed);
  float starSeed=hash31(starCell);
  float starThreshold=mix(0.9988,0.9968,clamp(uStarDensity-0.45,0.0,1.0));
  float star=step(starThreshold,starSeed);
  float twinkle=0.72+0.28*sin(uTime*(1.2+hash31(starCell+7.0)*2.2)+starSeed*31.0);
  float starHorizon=smoothstep(0.04,0.22,ray.y);
  sky+=vec3(0.72,0.84,1.0)*star*twinkle*uStarVisibility*starHorizon;
  vec3 galacticNormal=normalize(vec3(0.22,0.84,-0.5));
  float milkyBand=pow(max(0.0,1.0-abs(dot(ray,galacticNormal))),9.0)*starHorizon;
  float milkyNoise=0.55+0.45*fbm2(ray.xz*46.0+ray.y*19.0);
  sky+=vec3(0.24,0.32,0.55)*milkyBand*milkyNoise*uMilkyWayIntensity*0.28;
""",
    """  float starHorizon=smoothstep(max(0.0,uStarHorizonFade*0.22),max(0.02,uStarHorizonFade),ray.y);
  sky+=stellarField(ray)*uStarVisibility*starHorizon;
  sky+=milkyWayField(ray)*uNightFactor*starHorizon;
  sky+=auroraField(ray)*uNightFactor;
""",
    'legacy stars and fake Milky Way block'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility','uStarDensity',
      'uMilkyWayIntensity','uSunAngularRadius','uSunGlow','uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail',
""",
    """      'uZenithColor','uHorizonColor','uGroundColor','uDayFactor','uNightFactor','uTwilightFactor','uStarVisibility','uStarDensity',
      'uStarSizeMin','uStarSizeMax','uStarBrightnessVariation','uStarColorVariation','uStarTwinkleAmount','uStarTwinkleSpeed','uStarSeed','uStarRotation','uStarHorizonFade','uStarWarmColor','uStarCoolColor',
      'uMilkyWayIntensity','uMilkyWayWidth','uMilkyWayDetail','uMilkyWayDust','uMilkyWayCore','uMilkyWayNormal','uMilkyWayAxis','uMilkyWayColor','uMilkyWayCoreColor',
      'uAuroraIntensity','uAuroraColor','uAuroraSecondaryColor','uAuroraSpeed','uAuroraScale','uSunAngularRadius','uSunGlow','uMoonAngularRadius','uMoonGlow','uMoonPhase','uMoonBrightness','uMoonDetail',
""",
    'stellar uniform locations'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """      'uCloudCoverage','uCloudDensity','uCloudWind','uCloudSeed','uCloudQuality','uCloudAltitude','uCloudThickness','uTime','uExposure','uWeatherDarkening'
""",
    """      'uCloudCoverage','uCloudDensity','uCloudWind','uCloudSeed','uCloudQuality','uCloudAltitude','uCloudThickness','uTime','uCloudTime','uExposure','uWeatherDarkening'
""",
    'cloud time location'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """    gl.uniform1f(u.uStarVisibility, environment.starVisibility);
    gl.uniform1f(u.uStarDensity, environment.starDensity);
    gl.uniform1f(u.uMilkyWayIntensity, environment.milkyWayIntensity);
    gl.uniform1f(u.uSunAngularRadius, environment.sunAngularRadius);
""",
    """    gl.uniform1f(u.uStarVisibility, environment.starVisibility);
    gl.uniform1f(u.uStarDensity, environment.starDensity);
    gl.uniform1f(u.uStarSizeMin, environment.starSizeMin);
    gl.uniform1f(u.uStarSizeMax, environment.starSizeMax);
    gl.uniform1f(u.uStarBrightnessVariation, environment.starBrightnessVariation);
    gl.uniform1f(u.uStarColorVariation, environment.starColorVariation);
    gl.uniform1f(u.uStarTwinkleAmount, environment.starTwinkleAmount);
    gl.uniform1f(u.uStarTwinkleSpeed, environment.starTwinkleSpeed);
    gl.uniform1f(u.uStarSeed, environment.starSeed);
    gl.uniform1f(u.uStarRotation, environment.starRotation);
    gl.uniform1f(u.uStarHorizonFade, environment.starHorizonFade);
    gl.uniform3fv(u.uStarWarmColor, environment.starWarmColor);
    gl.uniform3fv(u.uStarCoolColor, environment.starCoolColor);
    gl.uniform1f(u.uMilkyWayIntensity, environment.milkyWayIntensity);
    gl.uniform1f(u.uMilkyWayWidth, environment.milkyWayWidth);
    gl.uniform1f(u.uMilkyWayDetail, environment.milkyWayDetail);
    gl.uniform1f(u.uMilkyWayDust, environment.milkyWayDust);
    gl.uniform1f(u.uMilkyWayCore, environment.milkyWayCore);
    gl.uniform3fv(u.uMilkyWayNormal, environment.milkyWayNormal);
    gl.uniform3fv(u.uMilkyWayAxis, environment.milkyWayAxis);
    gl.uniform3fv(u.uMilkyWayColor, environment.milkyWayColor);
    gl.uniform3fv(u.uMilkyWayCoreColor, environment.milkyWayCoreColor);
    gl.uniform1f(u.uAuroraIntensity, environment.auroraIntensity);
    gl.uniform3fv(u.uAuroraColor, environment.auroraColor);
    gl.uniform3fv(u.uAuroraSecondaryColor, environment.auroraSecondaryColor);
    gl.uniform1f(u.uAuroraSpeed, environment.auroraSpeed);
    gl.uniform1f(u.uAuroraScale, environment.auroraScale);
    gl.uniform1f(u.uSunAngularRadius, environment.sunAngularRadius);
""",
    'stellar uniform uploads'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/sky-pass.js',
    """    gl.uniform1f(u.uTime, environment.timeSeconds * Math.max(0.05, environment.cloudWindSpeed / 12));
    gl.uniform1f(u.uExposure, environment.exposure);
""",
    """    gl.uniform1f(u.uTime, environment.timeSeconds);
    gl.uniform1f(u.uCloudTime, environment.timeSeconds * Math.max(0.05, environment.cloudWindSpeed / 12));
    gl.uniform1f(u.uExposure, environment.exposure);
""",
    'independent stellar and cloud clocks'
): changed.append('app/sky-pass.js')

if replace_once(
    'app/v010.js',
    """        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Star density<input id="v010StarDensity" type="range" min="0.08" max="2" step="0.02"></label>
        <label>Daylight star extinction<input id="v010StarExtinction" type="range" min="0.1" max="4" step="0.05"></label>
        <label>Milky Way<input id="v010MilkyWay" type="range" min="0" max="3" step="0.05"></label>
        <label>Cloud mode<select id="v010CloudQuality">
""",
    """        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Star density<input id="v010StarDensity" type="range" min="0.08" max="2" step="0.02"></label>
        <label>Daylight star extinction<input id="v010StarExtinction" type="range" min="0.1" max="4" step="0.05"></label>
        <label>Smallest star<input id="v010StarSizeMin" type="range" min="0.1" max="6" step="0.05"></label>
        <label>Largest star<input id="v010StarSizeMax" type="range" min="0.1" max="8" step="0.05"></label>
        <label>Brightness variety<input id="v010StarBrightnessVariation" type="range" min="0" max="1" step="0.01"></label>
        <label>Color variety<input id="v010StarColorVariation" type="range" min="0" max="1" step="0.01"></label>
        <label>Twinkle amount<input id="v010StarTwinkleAmount" type="range" min="0" max="1" step="0.01"></label>
        <label>Twinkle speed<input id="v010StarTwinkleSpeed" type="range" min="0" max="8" step="0.05"></label>
        <label>Star seed<input id="v010StarSeed" type="number" min="-999999" max="999999" step="1"></label>
        <label>Star-field rotation<input id="v010StarRotation" type="number" min="-720" max="720" step="1"></label>
        <label>Horizon fade<input id="v010StarHorizonFade" type="range" min="0.01" max="0.8" step="0.01"></label>
        <label>Warm star color<input id="v010StarWarmColor" type="color"></label>
        <label>Cool star color<input id="v010StarCoolColor" type="color"></label>
        <label>Milky Way brightness<input id="v010MilkyWay" type="range" min="0" max="3" step="0.05"></label>
        <label>Milky Way width<input id="v010MilkyWayWidth" type="range" min="2" max="45" step="0.25"></label>
        <label>Milky Way detail<input id="v010MilkyWayDetail" type="range" min="0.2" max="4" step="0.05"></label>
        <label>Dark dust lanes<input id="v010MilkyWayDust" type="range" min="0" max="1" step="0.01"></label>
        <label>Galactic core<input id="v010MilkyWayCore" type="range" min="0" max="2" step="0.02"></label>
        <label>Galaxy azimuth<input id="v010MilkyWayAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Galaxy elevation<input id="v010MilkyWayElevation" type="number" min="-90" max="90" step="1"></label>
        <label>Galaxy roll<input id="v010MilkyWayRotation" type="number" min="-720" max="720" step="1"></label>
        <label>Galaxy outer color<input id="v010MilkyWayColor" type="color"></label>
        <label>Galaxy core color<input id="v010MilkyWayCoreColor" type="color"></label>
        <label>Aurora intensity<input id="v010AuroraIntensity" type="range" min="0" max="3" step="0.02"></label>
        <label>Aurora primary<input id="v010AuroraColor" type="color"></label>
        <label>Aurora secondary<input id="v010AuroraSecondaryColor" type="color"></label>
        <label>Aurora speed<input id="v010AuroraSpeed" type="range" min="0" max="4" step="0.02"></label>
        <label>Aurora scale<input id="v010AuroraScale" type="range" min="0.2" max="4" step="0.02"></label>
        <label>Cloud mode<select id="v010CloudQuality">
""",
    'stellar authoring controls'
): changed.append('app/v010.js')

if replace_once(
    'app/v010.js',
    """  field('v010Stars').value = world.sky.starIntensity;
  field('v010StarDensity').value = world.sky.starDensity ?? 0.72;
  field('v010StarExtinction').value = world.sky.starDaylightExtinction ?? 1.35;
  field('v010MilkyWay').value = world.sky.milkyWayIntensity ?? 0.35;
  field('v010CloudQuality').value = world.clouds.quality || 'layered';
""",
    """  field('v010Stars').value = world.sky.starIntensity;
  field('v010StarDensity').value = world.sky.starDensity ?? 0.72;
  field('v010StarExtinction').value = world.sky.starDaylightExtinction ?? 1.35;
  field('v010StarSizeMin').value = world.sky.starSizeMin ?? 0.55;
  field('v010StarSizeMax').value = world.sky.starSizeMax ?? 2.4;
  field('v010StarBrightnessVariation').value = world.sky.starBrightnessVariation ?? 0.62;
  field('v010StarColorVariation').value = world.sky.starColorVariation ?? 0.38;
  field('v010StarTwinkleAmount').value = world.sky.starTwinkleAmount ?? 0.48;
  field('v010StarTwinkleSpeed').value = world.sky.starTwinkleSpeed ?? 1;
  field('v010StarSeed').value = world.sky.starSeed ?? 1337;
  field('v010StarRotation').value = world.sky.starRotation ?? 0;
  field('v010StarHorizonFade').value = world.sky.starHorizonFade ?? 0.18;
  field('v010StarWarmColor').value = world.sky.starWarmColor ?? '#ffd8aa';
  field('v010StarCoolColor').value = world.sky.starCoolColor ?? '#a9c9ff';
  field('v010MilkyWay').value = world.sky.milkyWayIntensity ?? 0.35;
  field('v010MilkyWayWidth').value = world.sky.milkyWayWidth ?? 16;
  field('v010MilkyWayDetail').value = world.sky.milkyWayDetail ?? 1.25;
  field('v010MilkyWayDust').value = world.sky.milkyWayDust ?? 0.68;
  field('v010MilkyWayCore').value = world.sky.milkyWayCore ?? 0.78;
  field('v010MilkyWayAzimuth').value = world.sky.milkyWayAzimuth ?? 18;
  field('v010MilkyWayElevation').value = world.sky.milkyWayElevation ?? 62;
  field('v010MilkyWayRotation').value = world.sky.milkyWayRotation ?? 27;
  field('v010MilkyWayColor').value = world.sky.milkyWayColor ?? '#7187bd';
  field('v010MilkyWayCoreColor').value = world.sky.milkyWayCoreColor ?? '#e2c9a5';
  field('v010AuroraIntensity').value = world.sky.auroraIntensity ?? 0;
  field('v010AuroraColor').value = world.sky.auroraColor ?? '#58e7c1';
  field('v010AuroraSecondaryColor').value = world.sky.auroraSecondaryColor ?? '#7668ff';
  field('v010AuroraSpeed').value = world.sky.auroraSpeed ?? 0.35;
  field('v010AuroraScale').value = world.sky.auroraScale ?? 1;
  field('v010CloudQuality').value = world.clouds.quality || 'layered';
""",
    'stellar control population'
): changed.append('app/v010.js')

if replace_once(
    'app/v010.js',
    """      starIntensity: numeric('v010Stars', 1), starDensity: numeric('v010StarDensity', 0.72),
      starDaylightExtinction: numeric('v010StarExtinction', 1.35), milkyWayIntensity: numeric('v010MilkyWay', 0.35)
""",
    """      starIntensity: numeric('v010Stars', 1), starDensity: numeric('v010StarDensity', 0.72),
      starDaylightExtinction: numeric('v010StarExtinction', 1.35),
      starSizeMin: numeric('v010StarSizeMin', 0.55), starSizeMax: numeric('v010StarSizeMax', 2.4),
      starBrightnessVariation: numeric('v010StarBrightnessVariation', 0.62), starColorVariation: numeric('v010StarColorVariation', 0.38),
      starTwinkleAmount: numeric('v010StarTwinkleAmount', 0.48), starTwinkleSpeed: numeric('v010StarTwinkleSpeed', 1),
      starSeed: numeric('v010StarSeed', 1337), starRotation: numeric('v010StarRotation', 0), starHorizonFade: numeric('v010StarHorizonFade', 0.18),
      starWarmColor: field('v010StarWarmColor').value, starCoolColor: field('v010StarCoolColor').value,
      milkyWayIntensity: numeric('v010MilkyWay', 0.35), milkyWayWidth: numeric('v010MilkyWayWidth', 16),
      milkyWayDetail: numeric('v010MilkyWayDetail', 1.25), milkyWayDust: numeric('v010MilkyWayDust', 0.68), milkyWayCore: numeric('v010MilkyWayCore', 0.78),
      milkyWayAzimuth: numeric('v010MilkyWayAzimuth', 18), milkyWayElevation: numeric('v010MilkyWayElevation', 62), milkyWayRotation: numeric('v010MilkyWayRotation', 27),
      milkyWayColor: field('v010MilkyWayColor').value, milkyWayCoreColor: field('v010MilkyWayCoreColor').value,
      auroraIntensity: numeric('v010AuroraIntensity', 0), auroraColor: field('v010AuroraColor').value,
      auroraSecondaryColor: field('v010AuroraSecondaryColor').value, auroraSpeed: numeric('v010AuroraSpeed', 0.35), auroraScale: numeric('v010AuroraScale', 1)
""",
    'stellar control persistence'
): changed.append('app/v010.js')

print('Applied Phase 1B stellar sky authoring migration.')
print('Changed:', ', '.join(sorted(set(changed))) if changed else 'none (already applied)')
