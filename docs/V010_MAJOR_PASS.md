# OmniForge v0.10 Major Pass

OmniForge v0.10 connects the packaged worker, importer safety, reversible asset lifecycle, terrain-contact placement, deterministic foliage, time, hybrid lighting settings, atmosphere, celestial sky, clouds, and weather through the same authoritative project state and scene renderer.

## Connected authorities

The editor, HTTP API, packaged desktop runtime, asset library, scene graph, terrain, lights, materials, foliage records, environment settings, and guarded AI integration must not maintain parallel copies. The v0.10 modules extend the existing v0.9 state and renderer rather than creating a substitute application.

## Marketplace and jobs

- The Windows package includes the `workers` directory.
- Worker resolution checks development, packaged Electron, and current-runtime locations.
- Startup records worker diagnostics.
- A missing worker produces a concise repair message instead of a raw `MODULE_NOT_FOUND` stack trace.
- Marketplace downloading does not require MCP.

## Importer and asset lifecycle

- glTF node traversal is iterative and guarded by cycle, depth, and traversal budgets.
- Accessors validate indices, counts, strides, buffer views, and byte ranges before reading.
- Primitive failures remain isolated and visible in Asset Health diagnostics.
- Source files remain preserved.
- Archive and Restore are reversible state changes.
- Delete first checks scene usages and dependent recipes, then moves managed model files to project trash.
- No deletion is allowed outside the managed asset directory.

## Terrain-contact placement

- Props use four footprint corners plus center to fit a support plane and controlled tilt.
- Foliage remains upright and uses a root socket and burial depth.
- Vehicles remain upright in this release and record a wheel-contact placement mode.
- Architecture uses a foundation mode.
- Every grounding result records support points, terrain slope, contact error, floating error, and penetration error.

## Foliage and biome foundation

- Foliage Species records reference canonical imported models.
- Foliage Families group species with weights.
- Biome Recipes store terrain, species, climate, density, seed, and exclusion metadata.
- Placement is seeded and deterministic.
- Spacing, terrain slope, path clearance, and structure clearance are enforced.
- Generation creates a preview transaction that can be committed or cancelled without leaving hidden objects.
- Instances carry chunk, wind, LOD, shadow, and source-species metadata.

## Lighting, time, atmosphere, and weather

The v0.10 runtime uses the existing WebGL2 PBR renderer, directional and point lights, sun shadows, material response, fog, exposure, and scene sky colors as the optimized baseline. Time and atmosphere drive those same renderer inputs, so imported and generated objects participate automatically.

World state includes:

- paused, forward, reverse, and accelerated time;
- sun angle, color, intensity, and shadow profile;
- compatibility, balanced, quality, and reference lighting profiles;
- Rayleigh, Mie, ozone, humidity, haze, dust, visibility, and exposure metadata;
- stars, Milky Way intensity, moon metadata, aurora, and shooting-star rates;
- layered or quality cloud metadata;
- weather, fog, precipitation, wetness, snow, and wind.

## Honest rendering boundary

v0.10 is an optimized hybrid-lighting and atmosphere foundation. It does not mislabel the WebGL2 runtime as full ray tracing or full path tracing. Hardware ray queries, sparse radiance caches, volumetric multiple-scattering LUTs, and progressive path-traced reference rendering remain backend milestones that must be measured and validated separately.

## Acceptance gates

- Existing v0.5-v0.9 tests continue to pass.
- New deterministic foliage, grounding, and world tests pass.
- Package verification confirms the new runtime files and packaged worker.
- The packaged Windows build launches through `server/v010-bootstrap.mjs`.
- Marketplace downloads work without MCP on Windows.
- A simple and complex GLB import without stack overflow.
- Archive, restore, usage checks, preview cancellation, and managed-trash deletion are exercised.
- Box, foliage, vehicle, rock, and building grounding are visually inspected.
- Sunrise, sunset, twilight, night, cloud, and fog transitions are visually inspected.
- GTX 1650 performance remains a measured certification target, not an unsupported guarantee.
