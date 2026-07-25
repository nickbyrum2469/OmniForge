from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, content):
    Path(path).write_text(content, encoding='utf-8')
    print(f'updated {path}')


def replace_required(source, before, after, path, marker=None):
    if marker and marker in source:
        return source
    if after in source:
        return source
    if before not in source:
        raise RuntimeError(f'Expected block not found in {path}: {before[:120]!r}')
    return source.replace(before, after, 1)


def edit(path, fn):
    source = read(path)
    result = fn(source)
    if result != source:
        write(path, result)


# Stable World payload when the project has no assets.
edit('server/v010-api.mjs', lambda s: s.replace(
    "assets: state.assets.filter(item => ['model', 'foliageSpecies', 'foliageFamily', 'biomeRecipe', 'windProfile'].includes(item.type)),",
    "assets: (state.assets || []).filter(item => ['model', 'foliageSpecies', 'foliageFamily', 'biomeRecipe', 'windProfile'].includes(item.type)),",
    1
))


def patch_v010_systems(source):
    source = replace_required(source, '''    sky: {
      starIntensity: 1,
      starDensity: 0.72,
      milkyWayIntensity: 0.35,
      moonSize: 1,
      moonPhase: 0.72,
      auroraIntensity: 0,
      shootingStarRate: 0.05,
      suns: [{ id: 'sun-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1 }],
      moons: [{ id: 'moon-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1, phase: 0.72 }],
      ...existing.sky
    },''', '''    sky: {
      celestialMode: 'astronomical',
      sunAzimuth: -90,
      sunElevation: 45,
      sunSize: 1,
      sunGlow: 1,
      starIntensity: 1,
      starDensity: 0.72,
      starDaylightExtinction: 1.35,
      milkyWayIntensity: 0.35,
      moonAzimuth: 90,
      moonElevation: 32,
      moonSize: 1.45,
      moonPhase: 0.72,
      moonBrightness: 1,
      moonGlow: 0.7,
      moonDetail: 1,
      moonColor: '#a9c5eb',
      planetEnabled: false,
      planetAzimuth: 215,
      planetElevation: 28,
      planetSize: 4.5,
      planetColor: '#d49a72',
      planetBrightness: 0.8,
      planetRings: 0.65,
      auroraIntensity: 0,
      shootingStarRate: 0.05,
      suns: [{ id: 'sun-primary', enabled: true, size: 1, radiance: 1, orbitSpeed: 1 }],
      moons: [{ id: 'moon-primary', enabled: true, size: 1.45, radiance: 1, orbitSpeed: 1, phase: 0.72 }],
      ...existing.sky
    },''', 'server/v010-systems.mjs', 'celestialMode:')
    source = replace_required(source, '''    clouds: {
      quality: 'layered',
      coverage: 0.25,
      density: 0.45,
      altitude: 2200,
      windSpeed: 12,
      shadowStrength: 0.28,
      ...existing.clouds
    },''', '''    clouds: {
      quality: 'layered',
      coverage: 0.25,
      density: 0.45,
      altitude: 2200,
      thickness: 1800,
      windSpeed: 12,
      shadowStrength: 0.28,
      ...existing.clouds
    },''', 'server/v010-systems.mjs', 'thickness: 1800')
    source = replace_required(source, '''  const angle = ((hour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const day = clamp((elevation + 0.08) / 0.32, 0, 1);''', '''  const angle = ((hour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const astronomicalElevationDegrees = Math.asin(clamp(elevation, -1, 1)) * 180 / Math.PI;
  const celestialMode = String(world.sky.celestialMode || 'astronomical');
  const automaticSunAzimuth = (hour / 24) * 360 - 90;
  const sunAzimuth = celestialMode === 'manual' ? Number(world.sky.sunAzimuth ?? automaticSunAzimuth) : automaticSunAzimuth;
  const sunElevationDegrees = celestialMode === 'manual' ? Number(world.sky.sunElevation ?? astronomicalElevationDegrees) : astronomicalElevationDegrees;
  const moonAzimuth = celestialMode === 'manual' ? Number(world.sky.moonAzimuth ?? sunAzimuth + 180) : sunAzimuth + 180;
  const moonElevationDegrees = celestialMode === 'manual' ? Number(world.sky.moonElevation ?? -sunElevationDegrees) : -sunElevationDegrees * 0.92 + 5;
  const day = clamp((elevation + 0.08) / 0.32, 0, 1);''', 'server/v010-systems.mjs', 'astronomicalElevationDegrees')
    source = replace_required(source, '''  const azimuth = (hour / 24) * 360 - 90;
  sun.name = 'Sun';
  sun.transform.rotation = [90 - elevation * 82, azimuth, 0];''', '''  sun.name = 'Sun';
  sun.transform.rotation = [-sunElevationDegrees, sunAzimuth + 180, 0];''', 'server/v010-systems.mjs', 'sun.transform.rotation = [-sunElevationDegrees')
    source = replace_required(source, '''  };
  return { hour, day, night, twilight, elevation, sunId: sun.id };
}''', '''  };

  let moon = scene.objects.find(object => object.properties?.celestialRole === 'moon');
  if (!moon) {
    moon = {
      id: 'celestial-v010-moon',
      type: 'empty',
      name: 'Moon',
      visible: true,
      locked: false,
      parentId: null,
      transform: { position: [0, 0, 0], rotation: [32, 90, 0], scale: [1, 1, 1] },
      properties: {},
      components: []
    };
    scene.objects.push(moon);
  }
  moon.name = 'Moon';
  moon.transform.rotation = [moonElevationDegrees, moonAzimuth, 0];
  moon.properties = {
    ...(moon.properties || {}),
    celestialRole: 'moon',
    color: world.sky.moonColor || '#a9c5eb',
    intensity: Number(world.lighting.moonIntensity || 0.12) * night * Number(world.sky.moonBrightness || 1),
    phase: Number(world.sky.moonPhase ?? 0.72),
    angularSize: Number(world.sky.moonSize ?? 1.45),
    azimuth: moonAzimuth,
    elevation: moonElevationDegrees,
    castsShadows: false
  };
  return { hour, day, night, twilight, elevation, sunId: sun.id, moonId: moon.id, sunAzimuth, sunElevationDegrees, moonAzimuth, moonElevationDegrees };
}''', 'server/v010-systems.mjs', "id: 'celestial-v010-moon'")
    return source


edit('server/v010-systems.mjs', patch_v010_systems)


def patch_v010_ui(source):
    celestial_card = '''    <div class="v010-card">
      <header><b>Celestial Studio</b><span id="v010CelestialReadout" class="v010-chip">SUN + MOON</span></header>
      <div class="v010-grid">
        <label>Positioning<select id="v010CelestialMode"><option value="astronomical">Time-driven orbit</option><option value="manual">Manual azimuth/elevation</option></select></label>
        <label>Sun size<input id="v010SunSize" type="range" min="0.1" max="8" step="0.05"></label>
        <label>Sun glow<input id="v010SunGlow" type="range" min="0" max="5" step="0.05"></label>
        <label>Sun azimuth<input id="v010SunAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Sun elevation<input id="v010SunElevation" type="number" min="-90" max="90" step="1"></label>
        <label>Moon size<input id="v010MoonSize" type="range" min="0.1" max="12" step="0.05"></label>
        <label>Moon phase<input id="v010MoonPhase" type="range" min="0" max="1" step="0.005"></label>
        <label>Moon brightness<input id="v010MoonBrightness" type="range" min="0" max="5" step="0.05"></label>
        <label>Moon glow<input id="v010MoonGlow" type="range" min="0" max="5" step="0.05"></label>
        <label>Moon detail<input id="v010MoonDetail" type="range" min="0" max="3" step="0.05"></label>
        <label>Moon azimuth<input id="v010MoonAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Moon elevation<input id="v010MoonElevation" type="number" min="-90" max="90" step="1"></label>
        <label>Show planet<input id="v010PlanetEnabled" type="checkbox"></label>
        <label>Planet size<input id="v010PlanetSize" type="range" min="0.1" max="18" step="0.1"></label>
        <label>Planet azimuth<input id="v010PlanetAzimuth" type="number" min="-720" max="720" step="1"></label>
        <label>Planet elevation<input id="v010PlanetElevation" type="number" min="-90" max="90" step="1"></label>
        <label>Planet rings<input id="v010PlanetRings" type="range" min="0" max="1" step="0.01"></label>
      </div>
      <p class="v010-section-note">Time-driven mode follows world time. Manual mode preserves the exact Sun, Moon, and planet positions entered here.</p>
    </div>

'''
    atmosphere_start = '''    <div class="v010-card">
      <header><b>Atmosphere Studio</b><span class="v010-chip">SCATTERING + AERIAL PERSPECTIVE</span></header>'''
    if 'id="v010CelestialMode"' not in source:
        if atmosphere_start not in source:
            raise RuntimeError('Atmosphere card insertion point is missing in app/v010.js')
        source = source.replace(atmosphere_start, celestial_card + atmosphere_start, 1)
    source = replace_required(source, '''        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Cloud cover<input id="v010Clouds" type="range" min="0" max="1" step="0.01"></label>
        <label>Fog<input id="v010Fog" type="range" min="0" max="1" step="0.01"></label>''', '''        <label>Exposure<input id="v010Exposure" type="range" min="0.2" max="3" step="0.02"></label>
        <label>Stars<input id="v010Stars" type="range" min="0" max="3" step="0.05"></label>
        <label>Star density<input id="v010StarDensity" type="range" min="0.08" max="2" step="0.02"></label>
        <label>Daylight star extinction<input id="v010StarExtinction" type="range" min="0.1" max="4" step="0.05"></label>
        <label>Milky Way<input id="v010MilkyWay" type="range" min="0" max="3" step="0.05"></label>
        <label>Cloud mode<select id="v010CloudQuality"><option value="layered">Optimized layered</option><option value="balanced">Volumetric balanced</option><option value="quality">Volumetric quality</option><option value="reference">Volumetric reference</option></select></label>
        <label>Cloud cover<input id="v010Clouds" type="range" min="0" max="1" step="0.01"></label>
        <label>Cloud density<input id="v010CloudDensity" type="range" min="0" max="1" step="0.01"></label>
        <label>Cloud altitude<input id="v010CloudAltitude" type="number" min="50" max="20000" step="50"></label>
        <label>Cloud thickness<input id="v010CloudThickness" type="number" min="50" max="20000" step="50"></label>
        <label>Cloud wind speed<input id="v010CloudWindSpeed" type="number" min="0" max="300" step="1"></label>
        <label>Fog<input id="v010Fog" type="range" min="0" max="1" step="0.01"></label>''', 'app/v010.js', 'id="v010CloudQuality"')
    old_populate = '''  field('v010Humidity').value = world.atmosphere.humidity;
  field('v010Stars').value = world.sky.starIntensity;
  field('v010Clouds').value = world.clouds.coverage;
  field('v010Fog').value = world.weather.fog;
  field('v010Weather').value = world.weather.preset;

  const models = snapshot.assets.filter(item => item.type === 'model' && !item.archived);
  const species = snapshot.assets.filter(item => item.type === 'foliageSpecies');'''
    new_populate = '''  field('v010Humidity').value = world.atmosphere.humidity;
  field('v010Exposure').value = world.atmosphere.exposure;
  field('v010CelestialMode').value = world.sky.celestialMode || 'astronomical';
  field('v010SunSize').value = world.sky.sunSize ?? 1;
  field('v010SunGlow').value = world.sky.sunGlow ?? 1;
  field('v010SunAzimuth').value = world.sky.sunAzimuth ?? -90;
  field('v010SunElevation').value = world.sky.sunElevation ?? 45;
  field('v010MoonSize').value = world.sky.moonSize ?? 1.45;
  field('v010MoonPhase').value = world.sky.moonPhase ?? 0.72;
  field('v010MoonBrightness').value = world.sky.moonBrightness ?? 1;
  field('v010MoonGlow').value = world.sky.moonGlow ?? 0.7;
  field('v010MoonDetail').value = world.sky.moonDetail ?? 1;
  field('v010MoonAzimuth').value = world.sky.moonAzimuth ?? 90;
  field('v010MoonElevation').value = world.sky.moonElevation ?? 32;
  field('v010PlanetEnabled').checked = Boolean(world.sky.planetEnabled);
  field('v010PlanetSize').value = world.sky.planetSize ?? 4.5;
  field('v010PlanetAzimuth').value = world.sky.planetAzimuth ?? 215;
  field('v010PlanetElevation').value = world.sky.planetElevation ?? 28;
  field('v010PlanetRings').value = world.sky.planetRings ?? 0.65;
  field('v010Stars').value = world.sky.starIntensity;
  field('v010StarDensity').value = world.sky.starDensity ?? 0.72;
  field('v010StarExtinction').value = world.sky.starDaylightExtinction ?? 1.35;
  field('v010MilkyWay').value = world.sky.milkyWayIntensity ?? 0.35;
  field('v010CloudQuality').value = world.clouds.quality || 'layered';
  field('v010Clouds').value = world.clouds.coverage;
  field('v010CloudDensity').value = world.clouds.density ?? 0.45;
  field('v010CloudAltitude').value = world.clouds.altitude ?? 2200;
  field('v010CloudThickness').value = world.clouds.thickness ?? 1800;
  field('v010CloudWindSpeed').value = world.clouds.windSpeed ?? 12;
  field('v010Fog').value = world.weather.fog;
  field('v010Weather').value = world.weather.preset;
  field('v010CelestialReadout').textContent = (world.sky.celestialMode === 'manual' ? 'MANUAL' : formatTime(world.time.hours)) + ' · MOON ' + (Number(world.sky.moonPhase ?? 0.72) * 100).toFixed(0) + '%';

  const assets = Array.isArray(snapshot.assets) ? snapshot.assets : Array.isArray(snapshot.state?.assets) ? snapshot.state.assets : [];
  const models = assets.filter(item => item.type === 'model' && !item.archived);
  const species = assets.filter(item => item.type === 'foliageSpecies');'''
    source = replace_required(source, old_populate, new_populate, 'app/v010.js', 'const assets = Array.isArray(snapshot.assets)')
    old_payload = '''    lighting: { sunIntensity: numeric('v010SunIntensity', 3.2), profile: field('v010LightingProfile').value },
    atmosphere: {
      quality: field('v010AtmosphereQuality').value,
      visibilityKm: numeric('v010Visibility', 120),
      rayleigh: numeric('v010Rayleigh', 1),
      mie: numeric('v010Mie', 0.16),
      humidity: numeric('v010Humidity', 0.22)
    },
    sky: { starIntensity: numeric('v010Stars', 1) },
    clouds: { coverage: numeric('v010Clouds', 0.25) },'''
    new_payload = '''    lighting: { sunIntensity: numeric('v010SunIntensity', 3.2), profile: field('v010LightingProfile').value },
    atmosphere: {
      quality: field('v010AtmosphereQuality').value,
      visibilityKm: numeric('v010Visibility', 120),
      rayleigh: numeric('v010Rayleigh', 1),
      mie: numeric('v010Mie', 0.16),
      humidity: numeric('v010Humidity', 0.22),
      exposure: numeric('v010Exposure', 1)
    },
    sky: {
      celestialMode: field('v010CelestialMode').value,
      sunSize: numeric('v010SunSize', 1), sunGlow: numeric('v010SunGlow', 1),
      sunAzimuth: numeric('v010SunAzimuth', -90), sunElevation: numeric('v010SunElevation', 45),
      moonSize: numeric('v010MoonSize', 1.45), moonPhase: numeric('v010MoonPhase', 0.72),
      moonBrightness: numeric('v010MoonBrightness', 1), moonGlow: numeric('v010MoonGlow', 0.7), moonDetail: numeric('v010MoonDetail', 1),
      moonAzimuth: numeric('v010MoonAzimuth', 90), moonElevation: numeric('v010MoonElevation', 32),
      planetEnabled: Boolean(field('v010PlanetEnabled').checked), planetSize: numeric('v010PlanetSize', 4.5),
      planetAzimuth: numeric('v010PlanetAzimuth', 215), planetElevation: numeric('v010PlanetElevation', 28), planetRings: numeric('v010PlanetRings', 0.65),
      starIntensity: numeric('v010Stars', 1), starDensity: numeric('v010StarDensity', 0.72),
      starDaylightExtinction: numeric('v010StarExtinction', 1.35), milkyWayIntensity: numeric('v010MilkyWay', 0.35)
    },
    clouds: {
      quality: field('v010CloudQuality').value,
      coverage: numeric('v010Clouds', 0.25), density: numeric('v010CloudDensity', 0.45),
      altitude: numeric('v010CloudAltitude', 2200), thickness: numeric('v010CloudThickness', 1800), windSpeed: numeric('v010CloudWindSpeed', 12)
    },'''
    return replace_required(source, old_payload, new_payload, 'app/v010.js', "celestialMode: field('v010CelestialMode')")


edit('app/v010.js', patch_v010_ui)


def patch_worldgen(source):
    if 'function normalizeSculptLayer' not in source:
        marker = 'function presetKey(value) {'
        helper = '''function normalizeSculptLayer(layer = {}) {
  return {
    id: String(layer.id || `sculpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    mode: ['raise', 'lower', 'flatten'].includes(layer.mode) ? layer.mode : 'raise',
    x: Number(layer.x || 0), z: Number(layer.z || 0), radius: clamp(layer.radius ?? 8, 0.25, 5000),
    strength: clamp(layer.strength ?? 2, 0.001, 1000), targetHeight: Number(layer.targetHeight || 0),
    falloff: clamp(layer.falloff ?? 0.72, 0.05, 1), createdAt: layer.createdAt || new Date().toISOString()
  };
}

function applySculptLayers(height, x, z, layers = []) {
  let result = height;
  for (const layer of layers) {
    const distance = Math.hypot(x - layer.x, z - layer.z);
    if (distance >= layer.radius) continue;
    const normalized = distance / Math.max(EPSILON, layer.radius);
    const influence = 1 - smoothstep(Math.max(0, layer.falloff - 0.35), 1, normalized);
    if (layer.mode === 'lower') result -= layer.strength * influence;
    else if (layer.mode === 'flatten') result = lerp(result, layer.targetHeight, clamp(layer.strength, 0, 1) * influence);
    else result += layer.strength * influence;
  }
  return result;
}

'''
        if marker not in source:
            raise RuntimeError('worldgen sculpt helper insertion point missing')
        source = source.replace(marker, helper + marker, 1)
    source = replace_required(source, '''    expandStep: clamp(properties.expandStep ?? 100, 1, 10000),
    chunkSize: clamp(properties.chunkSize ?? 64, 8, 1024),''', '''    expandStep: clamp(properties.expandStep ?? 100, 1, 10000),
    chunkSize: clamp(properties.chunkSize ?? 64, 8, 1024),
    sculptLayers: (Array.isArray(properties.sculptLayers) ? properties.sculptLayers : []).slice(-512).map(normalizeSculptLayer),
    densityLimited: Boolean(properties.densityLimited),''', 'app/worldgen.js', 'sculptLayers: (Array.isArray')
    source = replace_required(source, '  return properties.baseElevation + shape * properties.height;\n}', '  const proceduralHeight = properties.baseElevation + shape * properties.height;\n  return applySculptLayers(proceduralHeight, x, z, properties.sculptLayers);\n}', 'app/worldgen.js', 'applySculptLayers(proceduralHeight')
    source = replace_required(source, '''    showSpline: properties.showSpline !== false,
    carveTerrain: Boolean(properties.carveTerrain),''', '''    showSpline: properties.showSpline !== false,
    width: clamp(properties.width ?? 3, 0.1, 200),
    blendDistance: clamp(properties.blendDistance ?? 2.5, 0.05, 200),
    edgeNoise: clamp(properties.edgeNoise ?? 0.45, 0, 5),
    carveTerrain: Boolean(properties.carveTerrain),''', 'app/worldgen.js', 'width: clamp(properties.width')
    source = replace_required(source, '''export function expandTerrain(terrain, direction, amount) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const delta = Math.max(1, Number(amount || properties.expandStep || 100));
  const bounds = { ...properties.bounds };''', '''export function expandTerrain(terrain, direction, amount) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const oldSizeX = properties.bounds.maxX - properties.bounds.minX;
  const oldSizeZ = properties.bounds.maxZ - properties.bounds.minZ;
  const spacingX = oldSizeX / Math.max(1, properties.resolutionX);
  const spacingZ = oldSizeZ / Math.max(1, properties.resolutionZ);
  const delta = Math.max(1, Number(amount || properties.expandStep || 100));
  const bounds = { ...properties.bounds };''', 'app/worldgen.js', 'const oldSizeX = properties.bounds.maxX')
    source = replace_required(source, '  terrain.properties = normalizeTerrainProperties({ ...properties, bounds, generatedRevision: properties.generatedRevision + 1 }, { ...terrain.transform, scale: [1, 1, 1] });', '''  const requiredResolutionX = Math.ceil((bounds.maxX - bounds.minX) / Math.max(EPSILON, spacingX));
  const requiredResolutionZ = Math.ceil((bounds.maxZ - bounds.minZ) / Math.max(EPSILON, spacingZ));
  terrain.properties = normalizeTerrainProperties({
    ...properties,
    bounds,
    resolutionX: Math.min(256, Math.max(properties.resolutionX, requiredResolutionX)),
    resolutionZ: Math.min(256, Math.max(properties.resolutionZ, requiredResolutionZ)),
    densityLimited: requiredResolutionX > 256 || requiredResolutionZ > 256,
    generatedRevision: properties.generatedRevision + 1
  }, { ...terrain.transform, scale: [1, 1, 1] });''', 'app/worldgen.js', 'requiredResolutionX = Math.ceil')
    if 'export function addTerrainSculptLayer' not in source:
        marker = 'export function migrateSceneWorldFoundation(scene) {'
        functions = '''export function addTerrainSculptLayer(terrain, layer = {}) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const nextLayer = normalizeSculptLayer(layer);
  terrain.properties = normalizeTerrainProperties({ ...properties, sculptLayers: [...properties.sculptLayers, nextLayer], generatedRevision: properties.generatedRevision + 1 }, terrain.transform || {});
  return nextLayer;
}

export function undoTerrainSculpt(terrain) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const removed = properties.sculptLayers.at(-1) || null;
  terrain.properties = normalizeTerrainProperties({ ...properties, sculptLayers: properties.sculptLayers.slice(0, -1), generatedRevision: properties.generatedRevision + 1 }, terrain.transform || {});
  return removed;
}

export function clearTerrainSculpt(terrain) {
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const removedCount = properties.sculptLayers.length;
  terrain.properties = normalizeTerrainProperties({ ...properties, sculptLayers: [], generatedRevision: properties.generatedRevision + 1 }, terrain.transform || {});
  return removedCount;
}

'''
        source = source.replace(marker, functions + marker, 1)
    return source


edit('app/worldgen.js', patch_worldgen)


def patch_v011_systems(source):
    if 'addTerrainSculptLayer' not in source.split("from '../app/worldgen.js';", 1)[0]:
        source = source.replace("  splitPath\n} from '../app/worldgen.js';", "  splitPath,\n  addTerrainSculptLayer,\n  undoTerrainSculpt,\n  clearTerrainSculpt\n} from '../app/worldgen.js';", 1)
    source = source.replace('export { expandTerrain, insertPathPoint, splitPath, normalizeTerrainProperties, normalizePathProperties, migrateSceneWorldFoundation, terrainHeightAt, terrainNormalAt, samplePathSpline };', 'export { expandTerrain, insertPathPoint, splitPath, addTerrainSculptLayer, undoTerrainSculpt, clearTerrainSculpt, normalizeTerrainProperties, normalizePathProperties, migrateSceneWorldFoundation, terrainHeightAt, terrainNormalAt, samplePathSpline };', 1)
    return source


edit('server/v011-systems.mjs', patch_v011_systems)


def patch_v011_api(source):
    if 'addTerrainSculptLayer' not in source.split("from './v011-systems.mjs';", 1)[0]:
        source = source.replace('  splitPath,\n  normalizePathProperties,', '  splitPath,\n  addTerrainSculptLayer,\n  undoTerrainSculpt,\n  clearTerrainSculpt,\n  normalizePathProperties,', 1)
    if '/sculpt/undo' not in source:
        marker = "    ids = match(url.pathname, /^\\/api\\/v011\\/path\\/([^/]+)$/);"
        routes = '''    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        const layer = addTerrainSculptLayer(terrain, input);
        addActivity(state, 'worldgen', 'Applied ' + layer.mode + ' sculpt stamp to ' + terrain.name + '.', { terrainId: terrain.id, layer });
        return { terrain, layer };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt\\/undo$/);
    if (ids && req.method === 'POST') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        return { terrain, removed: undoTerrainSculpt(terrain) };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt$/);
    if (ids && req.method === 'DELETE') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        return { terrain, removedCount: clearTerrainSculpt(terrain) };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

'''
        if marker not in source:
            raise RuntimeError('v0.11 terrain sculpt route insertion point missing')
        source = source.replace(marker, routes + marker, 1)
    old = '''        const path = requirePath(state, ids[0]);
        const inserted = insertPathPoint(path, Number(input.x), Number(input.z));
        updatePathProperties(path, { points: inserted.points });'''
    new = '''        const path = requirePath(state, ids[0]);
        let inserted;
        if (Number.isInteger(Number(input.index))) {
          const properties = normalizePathProperties(path.properties || {}, path.transform || {});
          const points = properties.points.map(point => [...point]);
          const index = Math.max(0, Math.min(points.length, Number(input.index)));
          points.splice(index, 0, [Number(input.x), Number(input.z)]);
          inserted = { points, index };
        } else inserted = insertPathPoint(path, Number(input.x), Number(input.z));
        updatePathProperties(path, { points: inserted.points });'''
    return replace_required(source, old, new, 'server/v011-api.mjs', 'Number.isInteger(Number(input.index))')


edit('server/v011-api.mjs', patch_v011_api)


def patch_v011_ui(source):
    source = replace_required(source, 'let splineEditPathId = null;\nlet draggingNode = null;', 'let splineEditPathId = null;\nlet selectedSplineNodeIndex = null;\nlet terrainSculptMode = null;\nlet draggingNode = null;', 'app/v011.js', 'let selectedSplineNodeIndex')
    source = replace_required(source, '''  const diagnostics = foundation?.terrainDiagnostics;
  return `<section class="v011-authoring-panel" data-v011-panel="terrain">''', '''  const diagnostics = foundation?.terrainDiagnostics;
  const resolutionX = Number(properties.resolutionX || properties.resolution || 128);
  const resolutionZ = Number(properties.resolutionZ || properties.resolution || 128);
  const spacingX = properties.bounds ? (properties.bounds.maxX - properties.bounds.minX) / Math.max(1, resolutionX) : 0;
  const spacingZ = properties.bounds ? (properties.bounds.maxZ - properties.bounds.minZ) / Math.max(1, resolutionZ) : 0;
  const densityStatus = properties.densityLimited ? 'LIMIT REACHED' : Math.max(spacingX, spacingZ) > 2 ? 'COARSE' : 'OK';
  return `<section class="v011-authoring-panel" data-v011-panel="terrain">''', 'app/v011.js', 'const densityStatus = properties.densityLimited')
    old_bounds = '''    <div class="v011-readout"><span>Bounds</span><code>${properties.bounds ? `${properties.bounds.minX.toFixed(0)}, ${properties.bounds.minZ.toFixed(0)} → ${properties.bounds.maxX.toFixed(0)}, ${properties.bounds.maxZ.toFixed(0)}` : 'not migrated'}</code></div>'''
    sculpt_ui = '''    <div class="v011-sculpt-controls">
      <div class="v011-panel-title"><div><small>LOCAL TERRAIN EDITING</small><strong>Non-destructive sculpt stamps</strong></div><span>${properties.sculptLayers?.length || 0} edits</span></div>
      <div class="v011-grid">
        <label class="v011-field"><span>Mode</span><select id="v011SculptMode"><option value="raise">Raise</option><option value="lower">Lower</option><option value="flatten">Flatten</option></select></label>
        ${numberControl('Radius', 'sculptRadius', 8, { step: 0.5, min: 0.25, max: 500 })}
        ${numberControl('Strength', 'sculptStrength', 2, { step: 0.1, min: 0.001, max: 1000 })}
        ${numberControl('Flatten height', 'sculptTargetHeight', properties.baseElevation || 0, { step: 0.25, min: -1000, max: 1000 })}
      </div>
      <div class="v011-actions"><button id="v011ToggleSculpt" type="button">${terrainSculptMode?.terrainId === object.id ? 'Finish sculpting' : 'Sculpt in viewport'}</button><button id="v011UndoSculpt" type="button">Undo last sculpt</button><button id="v011ClearSculpt" type="button">Clear sculpt layer</button></div>
      <p class="v011-note">Click terrain to apply a local reversible stamp. Global procedural controls remain available above.</p>
    </div>
    <div class="v011-readout"><span>Bounds</span><code>${properties.bounds ? `${properties.bounds.minX.toFixed(0)}, ${properties.bounds.minZ.toFixed(0)} → ${properties.bounds.maxX.toFixed(0)}, ${properties.bounds.maxZ.toFixed(0)}` : 'not migrated'}</code></div>
    <div class="v011-readout"><span>Mesh density</span><code>${spacingX.toFixed(2)} × ${spacingZ.toFixed(2)} m/vertex · ${densityStatus}</code></div>'''
    source = replace_required(source, old_bounds, sculpt_ui, 'app/v011.js', 'id="v011ToggleSculpt"')
    source = replace_required(source, '''  const diagnostics = foundation?.pathDiagnostics?.find(item => item.pathId === object.id);
  const middle = Math.max(1, Math.floor((properties.points?.length || 2) / 2));''', '''  const diagnostics = foundation?.pathDiagnostics?.find(item => item.pathId === object.id);
  const middle = Math.max(1, Math.floor((properties.points?.length || 2) / 2));
  const selectedIndex = Math.max(0, Math.min((properties.points?.length || 1) - 1, Number(selectedSplineNodeIndex ?? middle)));
  const selectedPoint = properties.points?.[selectedIndex] || [0, 0];''', 'app/v011.js', 'const selectedPoint = properties.points')
    source = replace_required(source, '''      ${numberControl('Spline tension', 'splineTension', properties.splineTension, { step: 0.05, min: 0, max: 1 })}
      ${numberControl('Samples/segment', 'samplesPerSegment', properties.samplesPerSegment, { step: 1, min: 2, max: 64 })}''', '''      ${numberControl('Width', 'width', properties.width ?? 3, { step: 0.25, min: 0.1, max: 200 })}
      ${numberControl('Blend shoulder', 'blendDistance', properties.blendDistance ?? 2.5, { step: 0.25, min: 0.05, max: 200 })}
      ${numberControl('Surface offset', 'surfaceOffset', properties.surfaceOffset ?? 0.03, { step: 0.01, min: -10, max: 10 })}
      ${numberControl('Edge noise', 'edgeNoise', properties.edgeNoise ?? 0.45, { step: 0.05, min: 0, max: 5 })}
      ${numberControl('Spline tension', 'splineTension', properties.splineTension, { step: 0.05, min: 0, max: 1 })}
      ${numberControl('Samples/segment', 'samplesPerSegment', properties.samplesPerSegment, { step: 1, min: 2, max: 64 })}''', 'app/v011.js', "numberControl('Width', 'width'")
    old_actions = '''    <div class="v011-actions"><button id="v011ReversePath" type="button">Reverse direction</button><label>Split at node <input id="v011SplitIndex" type="number" min="1" max="${Math.max(1, (properties.points?.length || 2) - 2)}" step="1" value="${middle}"></label><button id="v011SplitPath" type="button">Split path</button></div>'''
    new_actions = '''    <div class="v011-node-editor">
      <div class="v011-panel-title"><div><small>SELECTED NODE</small><strong>Node ${selectedIndex + 1}</strong></div><span>X/Z</span></div>
      <div class="v011-grid"><label class="v011-field"><span>X</span><input id="v011NodeX" type="number" step="0.1" value="${Number(selectedPoint[0] || 0)}"></label><label class="v011-field"><span>Z</span><input id="v011NodeZ" type="number" step="0.1" value="${Number(selectedPoint[1] || 0)}"></label></div>
      <div class="v011-actions"><button id="v011ApplyNode" type="button">Apply coordinates</button><button id="v011InsertBefore" type="button">Insert before</button><button id="v011InsertAfter" type="button">Insert after</button><button id="v011DeleteNode" type="button">Delete node</button><button id="v011SplitPath" type="button">Split selected node</button></div>
    </div>
    <div class="v011-actions"><button id="v011ReversePath" type="button">Reverse direction</button></div>'''
    source = replace_required(source, old_actions, new_actions, 'app/v011.js', 'id="v011DeleteNode"')
    source = replace_required(source, "  container.querySelectorAll('[data-v011-panel=\"terrain\"] [data-v011-property]').forEach(input => input.addEventListener('change', () => updateTerrain(object.id, { [input.dataset.v011Property]: Number(input.value) })));", "  container.querySelectorAll('[data-v011-panel=\"terrain\"] [data-v011-property]').forEach(input => { if (input.dataset.v011Property.startsWith('sculpt')) return; input.addEventListener('change', () => updateTerrain(object.id, { [input.dataset.v011Property]: Number(input.value) })); });", 'app/v011.js', "startsWith('sculpt')")
    expand_listener = "  container.querySelectorAll('[data-v011-expand]').forEach(button => button.addEventListener('click', () => expandWorld(object.id, button.dataset.v011Expand)));"
    sculpt_listeners = expand_listener + '''
  $('#v011ToggleSculpt')?.addEventListener('click', () => {
    terrainSculptMode = terrainSculptMode?.terrainId === object.id ? null : {
      terrainId: object.id,
      mode: $('#v011SculptMode')?.value || 'raise',
      radius: Number(container.querySelector('[data-v011-property="sculptRadius"]')?.value || 8),
      strength: Number(container.querySelector('[data-v011-property="sculptStrength"]')?.value || 2),
      targetHeight: Number(container.querySelector('[data-v011-property="sculptTargetHeight"]')?.value || 0)
    };
    document.body.classList.toggle('v011-terrain-sculpting', Boolean(terrainSculptMode));
    enhanceInspector();
  });
  $('#v011UndoSculpt')?.addEventListener('click', () => terrainSculptAction(object.id, 'undo'));
  $('#v011ClearSculpt')?.addEventListener('click', () => terrainSculptAction(object.id, 'clear'));'''
    source = replace_required(source, expand_listener, sculpt_listeners, 'app/v011.js', "terrainSculptAction(object.id, 'undo')")
    source = replace_required(source, '''  $('#v011ReversePath')?.addEventListener('click', () => pathAction(object.id, 'reverse'));
  $('#v011SplitPath')?.addEventListener('click', () => pathAction(object.id, 'split', { index: Number($('#v011SplitIndex')?.value || 1) }));''', '''  $('#v011ReversePath')?.addEventListener('click', () => pathAction(object.id, 'reverse'));
  $('#v011ApplyNode')?.addEventListener('click', () => updatePathNode(object.id, selectedIndex, Number($('#v011NodeX')?.value || 0), Number($('#v011NodeZ')?.value || 0)));
  $('#v011InsertBefore')?.addEventListener('click', () => insertPathNode(object.id, selectedIndex, selectedPoint));
  $('#v011InsertAfter')?.addEventListener('click', () => insertPathNode(object.id, selectedIndex + 1, selectedPoint));
  $('#v011DeleteNode')?.addEventListener('click', () => deletePathNode(object.id, selectedIndex));
  $('#v011SplitPath')?.addEventListener('click', () => pathAction(object.id, 'split', { index: selectedIndex }));''', 'app/v011.js', "updatePathNode(object.id, selectedIndex")
    if 'async function terrainSculptAction' not in source:
        marker = 'async function updatePath(id, properties) {'
        helpers = '''async function terrainSculptAction(id, action) {
  try {
    const route = action === 'undo' ? '/api/v011/terrain/' + encodeURIComponent(id) + '/sculpt/undo' : '/api/v011/terrain/' + encodeURIComponent(id) + '/sculpt';
    const options = action === 'clear' ? { method: 'DELETE' } : { method: 'POST', body: {} };
    await applyMutation(await api(route, options), true);
    bridge()?.showToast?.(action === 'undo' ? 'Undid the last terrain sculpt stamp' : 'Cleared local terrain sculpt edits', 'success');
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function updatePathNode(id, index, x, z) {
  try {
    await applyMutation(await api('/api/v011/path/' + encodeURIComponent(id) + '/node/' + index, { method: 'PATCH', body: { x, z } }), true);
    selectedSplineNodeIndex = index;
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function insertPathNode(id, index, point) {
  try {
    const x = Number(point?.[0] || 0) + 0.01;
    const z = Number(point?.[1] || 0) + 0.01;
    await applyMutation(await api('/api/v011/path/' + encodeURIComponent(id) + '/node', { method: 'POST', body: { x, z, index } }), true);
    selectedSplineNodeIndex = index;
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

async function deletePathNode(id, index) {
  try {
    await applyMutation(await api('/api/v011/path/' + encodeURIComponent(id) + '/node/' + index, { method: 'DELETE' }), true);
    selectedSplineNodeIndex = Math.max(0, index - 1);
  } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
}

'''
        if marker not in source:
            raise RuntimeError('v011 helper insertion point missing')
        source = source.replace(marker, helpers + marker, 1)
    source = source.replace("    splineEditPathId = action === 'split' ? null : splineEditPathId;", "    if (action === 'split') { splineEditPathId = null; selectedSplineNodeIndex = null; }", 1)
    source = replace_required(source, '''    handle.hidden = false;
    handle.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    handle.textContent = String(index + 1);''', '''    handle.hidden = false;
    handle.classList.toggle('selected', index === Number(selectedSplineNodeIndex));
    handle.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    handle.textContent = String(index + 1);''', 'app/v011.js', "classList.toggle('selected'")
    source = replace_required(source, "  draggingNode = { pathId: path.id, index: Number(event.currentTarget.dataset.splineNode), pointerId: event.pointerId };", "  selectedSplineNodeIndex = Number(event.currentTarget.dataset.splineNode);\n  draggingNode = { pathId: path.id, index: selectedSplineNodeIndex, pointerId: event.pointerId };\n  enhanceInspector();", 'app/v011.js', 'index: selectedSplineNodeIndex')
    old_install = '''  canvas.addEventListener('mousedown', event => {
    if (!splineEditPathId) return;'''
    new_install = '''  canvas.addEventListener('click', async event => {
    if (!terrainSculptMode || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const snapshot = currentSnapshot();
    const point = bridge()?.renderer?.()?.terrainPointFromScreen?.(snapshot.scene, snapshot.camera, event.clientX, event.clientY);
    if (!point) return bridge()?.showToast?.('The sculpt cursor did not hit terrain.', 'error');
    try {
      await applyMutation(await api('/api/v011/terrain/' + encodeURIComponent(terrainSculptMode.terrainId) + '/sculpt', { method: 'POST', body: { ...terrainSculptMode, x: point[0], z: point[2], targetHeight: terrainSculptMode.mode === 'flatten' ? terrainSculptMode.targetHeight : point[1] } }), true);
      bridge()?.showToast?.('Applied ' + terrainSculptMode.mode + ' terrain sculpt', 'success');
    } catch (error) { bridge()?.showToast?.(error.message, 'error'); }
  }, true);
  canvas.addEventListener('mousedown', event => {
    if (!splineEditPathId) return;'''
    return replace_required(source, old_install, new_install, 'app/v011.js', "if (!terrainSculptMode || event.button !== 0)")


edit('app/v011.js', patch_v011_ui)


def patch_v011_css(source):
    marker = '.v011-terrain-sculpting #viewport'
    if marker in source:
        return source
    return source.rstrip() + '''

.v011-terrain-sculpting #viewport { cursor:cell; }
.v011-sculpt-controls, .v011-node-editor { margin-top:12px; padding-top:10px; border-top:1px solid rgba(123,143,175,.18); }
.spline-node-handle { width:30px; height:30px; margin:-15px 0 0 -15px; font-size:10px; }
.spline-node-handle.selected { background:#f0a8ff; border-color:#ffffff; box-shadow:0 0 0 5px rgba(156,82,230,.42),0 5px 18px rgba(0,0,0,.58); }
.v011-readout code { max-width:65%; overflow-wrap:anywhere; }
'''


edit('app/v011.css', patch_v011_css)


def patch_renderer(source):
    source = replace_required(source, '''uniform vec3 uLightColor;
uniform float uLightIntensity;''', '''uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonIntensity;''', 'app/renderer.js', 'uniform float uMoonIntensity;')
    source = replace_required(source, '''  vec3 diffuse=uLightColor*ndl*uLightIntensity*shadow;
  vec3 halfDir=normalize(lightDir+viewDir);''', '''  vec3 diffuse=uLightColor*ndl*uLightIntensity*shadow;
  float moonNdl=max(dot(n,normalize(uMoonDir)),0.0);
  vec3 moonDiffuse=uMoonColor*moonNdl*uMoonIntensity;
  vec3 halfDir=normalize(lightDir+viewDir);''', 'app/renderer.js', 'vec3 moonDiffuse=')
    source = replace_required(source, '  vec3 color=(baseLinear*(ambient+diffuse)+editorAmbient)*slopeCavity+uLightColor*spec*uLightIntensity;', '  vec3 color=(baseLinear*(ambient+diffuse+moonDiffuse)+editorAmbient)*slopeCavity+uLightColor*spec*uLightIntensity;', 'app/renderer.js', 'ambient+diffuse+moonDiffuse')
    source = source.replace("    const sun=scene.objects.find(o=>o.type==='directionalLight'&&o.visible);", "    const sun=scene.objects.find(o=>o.type==='directionalLight'&&o.visible&&o.properties?.celestialRole==='sun')||scene.objects.find(o=>o.type==='directionalLight'&&o.visible);", 1)
    source = replace_required(source, "    set3('uLightDir',lights.dir);set3('uLightColor',lights.color);set1('uLightIntensity',lights.intensity);gl.uniform1i(gl.getUniformLocation(p,'uPointCount'),lights.points.length);", "    set3('uLightDir',lights.dir);set3('uLightColor',lights.color);set1('uLightIntensity',lights.intensity);set3('uMoonDir',lights.moonDir||[0,1,0]);set3('uMoonColor',lights.moonColor||[.66,.78,.92]);set1('uMoonIntensity',Number(lights.moonIntensity||0));gl.uniform1i(gl.getUniformLocation(p,'uPointCount'),lights.points.length);", 'app/renderer.js', "set1('uMoonIntensity'")
    source = replace_required(source, '''    lights.environment=environment;
    if(lights.shadows)this.renderShadow(scene,lightViewProj);''', '''    lights.environment=environment;
    lights.moonDir=environment.moonDirection;
    lights.moonColor=environment.moonColor;
    lights.moonIntensity=environment.moonLightIntensity;
    if(lights.shadows)this.renderShadow(scene,lightViewProj);''', 'app/renderer.js', 'lights.moonIntensity=environment.moonLightIntensity')
    old_splines = "    if(scene.settings.splinesVisible!==false)for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){const buffers=this.pathBuffers(pathObject,scene),selected=pathObject.id===selectedId;this.drawLines(buffers.edges,mat4Identity(),viewProj,selected?[.83,.62,1,.9]:[.30,.22,.15,.28],selected?2:1);if(selected)this.drawLines(buffers.center,mat4Identity(),viewProj,[.92,.8,1,1],2);}"
    new_splines = "    if(scene.settings.splinesVisible!==false){const xray=typeof document!=='undefined'&&document.body.classList.contains('v011-spline-editing');if(xray)gl.disable(gl.DEPTH_TEST);for(const pathObject of scene.objects.filter(o=>o.type==='path'&&o.visible&&o.properties?.showSpline!==false)){const buffers=this.pathBuffers(pathObject,scene),selected=pathObject.id===selectedId;this.drawLines(buffers.edges,mat4Identity(),viewProj,selected?[.96,.56,1,1]:[.56,.34,.18,.7],selected?3:2);if(selected)this.drawLines(buffers.center,mat4Identity(),viewProj,[1,.9,1,1],3);}if(xray)gl.enable(gl.DEPTH_TEST);}"
    return replace_required(source, old_splines, new_splines, 'app/renderer.js', "classList.contains('v011-spline-editing')")


edit('app/renderer.js', patch_renderer)
print('Applied Phase 1.1 celestial, volumetric-cloud, path, and terrain-authoring corrections.')
