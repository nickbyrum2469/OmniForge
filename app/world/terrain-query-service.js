import {
  normalizeTerrainProperties,
  terrainBaseHeightAt,
  terrainBounds
} from '../worldgen.js';
import { samplePathTerrainModifier } from '../path-network/terrain-modifier.js';

export const TERRAIN_VIEWS = Object.freeze([
  'natural',
  'authored-natural',
  'proposed-construction',
  'final-construction',
  'runtime-deformed'
]);

export const TERRAIN_ANALYSIS_CHANNELS = Object.freeze([
  'slope',
  'aspect',
  'planCurvature',
  'profileCurvature',
  'roughness',
  'localRelief',
  'ridgeProbability',
  'valleyProbability',
  'flowDirectionX',
  'flowDirectionZ',
  'constructionSuitability',
  'traversability'
]);

const LEVELS = Object.freeze({
  regional: { resolution: 8, analysisStep: 8 },
  medium: { resolution: 16, analysisStep: 4 },
  local: { resolution: 32, analysisStep: 2 },
  high: { resolution: 64, analysisStep: 1 }
});
const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const smoothstep = (minimum, maximum, value) => {
  const t = clamp((value - minimum) / Math.max(EPSILON, maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
};

function cleanView(value) {
  if (!TERRAIN_VIEWS.includes(value)) throw new Error(`Unknown terrain view ${value}.`);
  return value;
}

function cleanLevel(value) {
  if (!Object.hasOwn(LEVELS, value)) throw new Error(`Unknown terrain query level ${value}.`);
  return value;
}

function normalizeBounds(value) {
  const minX = Math.min(finite(value?.minX), finite(value?.maxX));
  const maxX = Math.max(finite(value?.minX), finite(value?.maxX));
  const minZ = Math.min(finite(value?.minZ), finite(value?.maxZ));
  const maxZ = Math.max(finite(value?.minZ), finite(value?.maxZ));
  return { minX, maxX, minZ, maxZ };
}

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function tileKey(x, z) {
  return `${x}:${z}`;
}

function standardDeviation(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, values.length));
}

function combineConstructionSample(pathRuntimes, baseHeight, x, z) {
  let selected = null;
  for (const runtime of pathRuntimes || []) {
    const sample = samplePathTerrainModifier(runtime?.terrainModifier, x, z);
    if (
      !selected
      || sample.influence > selected.influence
      || (
        sample.influence === selected.influence
        && sample.lateralDistance < selected.lateralDistance
      )
    ) selected = sample;
  }
  if (!selected || !Number.isFinite(selected.lateralDistance)) {
    return {
      height: baseHeight,
      influence: 0,
      zone: 'terrain',
      sourceId: null
    };
  }
  return {
    height: selected.height,
    influence: selected.influence,
    zone: selected.zone,
    sourceId: selected.segmentId
  };
}

export class TerrainQueryService {
  constructor({ terrain, pathRuntimes = [], tileSize, halo = 1 } = {}) {
    if (!terrain || terrain.type !== 'terrain') throw new Error('TerrainQueryService requires an authoritative terrain object.');
    this.terrain = terrain;
    this.properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
    this.bounds = terrainBounds(terrain);
    this.tileSize = clamp(tileSize ?? this.properties.chunkSize ?? 64, 4, 4096);
    this.halo = Math.round(clamp(halo, 1, 8));
    this.naturalTerrain = {
      ...terrain,
      transform: structuredClone(terrain.transform || {}),
      properties: {
        ...(terrain.properties || {}),
        sculptLayers: []
      }
    };
    this.pathRuntimes = [...pathRuntimes];
    this.revisions = {
      natural: Math.max(1, Math.floor(finite(this.properties.generatedRevision, 1))),
      authoredNatural: Math.max(1, Math.floor(finite(this.properties.generatedRevision, 1))),
      construction: Math.max(0, ...this.pathRuntimes.map(runtime => finite(runtime?.generationRevision))),
      runtime: 0,
      service: 1
    };
    this.tileCache = new Map();
    this.analysisCache = new Map();
    this.dirtyTiles = new Map();
  }

  setPathRuntimes(pathRuntimes = []) {
    this.pathRuntimes = [...pathRuntimes];
    this.revisions.construction = Math.max(
      this.revisions.construction + 1,
      ...this.pathRuntimes.map(runtime => finite(runtime?.generationRevision))
    );
    this.revisions.service += 1;
    this.invalidate(this.bounds, ['construction', 'elevation', 'material']);
  }

  tileCoordinates(x, z) {
    return {
      x: Math.floor(finite(x) / this.tileSize),
      z: Math.floor(finite(z) / this.tileSize)
    };
  }

  tileBounds(tileX, tileZ) {
    return {
      minX: tileX * this.tileSize,
      maxX: (tileX + 1) * this.tileSize,
      minZ: tileZ * this.tileSize,
      maxZ: (tileZ + 1) * this.tileSize
    };
  }

  affectedTileKeys(bounds) {
    const region = normalizeBounds(bounds);
    const minimum = this.tileCoordinates(region.minX, region.minZ);
    const maximum = this.tileCoordinates(region.maxX, region.maxZ);
    const result = [];
    for (let x = minimum.x; x <= maximum.x; x += 1) {
      for (let z = minimum.z; z <= maximum.z; z += 1) result.push(tileKey(x, z));
    }
    return result.sort();
  }

  invalidate(bounds, channels = ['elevation']) {
    const region = normalizeBounds(bounds);
    const normalizedChannels = [...new Set(channels.map(value => String(value)))].sort();
    const affected = this.affectedTileKeys(region);
    this.revisions.service += 1;
    for (const key of affected) {
      const current = this.dirtyTiles.get(key);
      this.dirtyTiles.set(key, {
        revision: this.revisions.service,
        channels: [...new Set([...(current?.channels || []), ...normalizedChannels])].sort(),
        bounds: current ? {
          minX: Math.min(current.bounds.minX, region.minX),
          maxX: Math.max(current.bounds.maxX, region.maxX),
          minZ: Math.min(current.bounds.minZ, region.minZ),
          maxZ: Math.max(current.bounds.maxZ, region.maxZ)
        } : region
      });
    }
    for (const [key, tile] of this.tileCache) {
      if (boundsOverlap(tile.bounds, region)) this.tileCache.delete(key);
    }
    for (const [key, tile] of this.analysisCache) {
      if (boundsOverlap(tile.bounds, region)) this.analysisCache.delete(key);
    }
    return affected;
  }

  clearDirty(tileKeys = null) {
    if (!tileKeys) {
      this.dirtyTiles.clear();
      return;
    }
    for (const key of tileKeys) this.dirtyTiles.delete(key);
  }

  elevationAt(x, z, { view = 'authored-natural' } = {}) {
    const selectedView = cleanView(view);
    const worldX = finite(x);
    const worldZ = finite(z);
    const natural = terrainBaseHeightAt(
      selectedView === 'natural' ? this.naturalTerrain : this.terrain,
      worldX,
      worldZ
    );
    if (selectedView === 'natural' || selectedView === 'authored-natural') return natural;
    return combineConstructionSample(this.pathRuntimes, natural, worldX, worldZ).height;
  }

  normalAt(x, z, { view = 'authored-natural', step = 0.5 } = {}) {
    const distance = Math.max(0.01, finite(step, 0.5));
    const left = this.elevationAt(x - distance, z, { view });
    const right = this.elevationAt(x + distance, z, { view });
    const down = this.elevationAt(x, z - distance, { view });
    const up = this.elevationAt(x, z + distance, { view });
    const normal = [left - right, distance * 2, down - up];
    const length = Math.hypot(...normal) || 1;
    return normal.map(value => value / length);
  }

  analysisAt(x, z, { view = 'authored-natural', level = 'local' } = {}) {
    const selectedView = cleanView(view);
    const selectedLevel = cleanLevel(level);
    const step = LEVELS[selectedLevel].analysisStep;
    const center = this.elevationAt(x, z, { view: selectedView });
    const left = this.elevationAt(x - step, z, { view: selectedView });
    const right = this.elevationAt(x + step, z, { view: selectedView });
    const down = this.elevationAt(x, z - step, { view: selectedView });
    const up = this.elevationAt(x, z + step, { view: selectedView });
    const diagonals = [
      this.elevationAt(x - step, z - step, { view: selectedView }),
      this.elevationAt(x + step, z - step, { view: selectedView }),
      this.elevationAt(x - step, z + step, { view: selectedView }),
      this.elevationAt(x + step, z + step, { view: selectedView })
    ];
    const dx = (right - left) / (2 * step);
    const dz = (up - down) / (2 * step);
    const gradient = Math.hypot(dx, dz);
    const dxx = (right - 2 * center + left) / (step * step);
    const dzz = (up - 2 * center + down) / (step * step);
    const dxy = (diagonals[3] - diagonals[2] - diagonals[1] + diagonals[0]) / (4 * step * step);
    const denominator = Math.max(EPSILON, gradient * gradient);
    const profileCurvature = (dxx * dx * dx + 2 * dxy * dx * dz + dzz * dz * dz) / denominator;
    const planCurvature = (dxx * dz * dz - 2 * dxy * dx * dz + dzz * dx * dx) / denominator;
    const neighborhood = [center, left, right, down, up, ...diagonals];
    const localAverage = (left + right + down + up) * 0.25;
    const ridgeAmount = center - localAverage;
    const roughness = standardDeviation(neighborhood);
    const localRelief = Math.max(...neighborhood) - Math.min(...neighborhood);
    const slopeDegrees = Math.atan(gradient) * 180 / Math.PI;
    const flowLength = Math.max(EPSILON, gradient);
    const constructionSuitability = 1
      - smoothstep(8, 42, slopeDegrees) * 0.65
      - smoothstep(0.2, 4, roughness) * 0.35;
    return {
      elevation: center,
      slope: slopeDegrees,
      aspect: (Math.atan2(-dx, -dz) * 180 / Math.PI + 360) % 360,
      planCurvature,
      profileCurvature,
      roughness,
      localRelief,
      ridgeProbability: smoothstep(0.05, Math.max(0.1, localRelief * 0.5), ridgeAmount),
      valleyProbability: smoothstep(0.05, Math.max(0.1, localRelief * 0.5), -ridgeAmount),
      flowDirectionX: gradient > EPSILON ? -dx / flowLength : 0,
      flowDirectionZ: gradient > EPSILON ? -dz / flowLength : 0,
      constructionSuitability: clamp(constructionSuitability, 0, 1),
      traversability: clamp(1 - smoothstep(18, 55, slopeDegrees) - smoothstep(1, 6, roughness) * 0.35, 0, 1)
    };
  }

  tile(tileX, tileZ, { view = 'authored-natural', level = 'medium' } = {}) {
    const selectedView = cleanView(view);
    const selectedLevel = cleanLevel(level);
    const levelDefinition = LEVELS[selectedLevel];
    const revision = JSON.stringify(this.revisions);
    const cacheKey = `${selectedView}:${selectedLevel}:${tileX}:${tileZ}:${revision}`;
    const cached = this.tileCache.get(cacheKey);
    if (cached) return cached;
    const bounds = this.tileBounds(tileX, tileZ);
    const spacing = this.tileSize / levelDefinition.resolution;
    const rowSize = levelDefinition.resolution + 1 + this.halo * 2;
    const heights = new Float32Array(rowSize * rowSize);
    let offset = 0;
    for (let z = -this.halo; z <= levelDefinition.resolution + this.halo; z += 1) {
      for (let x = -this.halo; x <= levelDefinition.resolution + this.halo; x += 1) {
        heights[offset++] = this.elevationAt(
          bounds.minX + x * spacing,
          bounds.minZ + z * spacing,
          { view: selectedView }
        );
      }
    }
    const tile = Object.freeze({
      key: tileKey(tileX, tileZ),
      tileX,
      tileZ,
      view: selectedView,
      level: selectedLevel,
      bounds,
      spacing,
      halo: this.halo,
      rowSize,
      revision,
      heights
    });
    this.tileCache.set(cacheKey, tile);
    return tile;
  }

  analysisTile(tileX, tileZ, { view = 'authored-natural', level = 'medium' } = {}) {
    const selectedView = cleanView(view);
    const selectedLevel = cleanLevel(level);
    const revision = JSON.stringify(this.revisions);
    const cacheKey = `${selectedView}:${selectedLevel}:${tileX}:${tileZ}:${revision}`;
    const cached = this.analysisCache.get(cacheKey);
    if (cached) return cached;
    const elevationTile = this.tile(tileX, tileZ, { view: selectedView, level: selectedLevel });
    const resolution = LEVELS[selectedLevel].resolution;
    const rowSize = resolution + 1;
    const fields = Object.fromEntries(
      TERRAIN_ANALYSIS_CHANNELS.map(channel => [channel, new Float32Array(rowSize * rowSize)])
    );
    let offset = 0;
    for (let z = 0; z <= resolution; z += 1) {
      for (let x = 0; x <= resolution; x += 1) {
        const analysis = this.analysisAt(
          elevationTile.bounds.minX + x * elevationTile.spacing,
          elevationTile.bounds.minZ + z * elevationTile.spacing,
          { view: selectedView, level: selectedLevel }
        );
        for (const channel of TERRAIN_ANALYSIS_CHANNELS) fields[channel][offset] = analysis[channel];
        offset += 1;
      }
    }
    const tile = Object.freeze({
      key: elevationTile.key,
      tileX,
      tileZ,
      view: selectedView,
      level: selectedLevel,
      bounds: elevationTile.bounds,
      spacing: elevationTile.spacing,
      rowSize,
      revision,
      fields
    });
    this.analysisCache.set(cacheKey, tile);
    return tile;
  }

  describe() {
    return {
      schemaVersion: 1,
      terrainId: this.terrain.id,
      views: [...TERRAIN_VIEWS],
      levels: structuredClone(LEVELS),
      tileSize: this.tileSize,
      halo: this.halo,
      revisions: { ...this.revisions },
      dirtyTiles: [...this.dirtyTiles.entries()].map(([key, value]) => ({ key, ...structuredClone(value) })),
      cachedTerrainTiles: this.tileCache.size,
      cachedAnalysisTiles: this.analysisCache.size
    };
  }
}

export function createTerrainQueryService(options) {
  return new TerrainQueryService(options);
}
