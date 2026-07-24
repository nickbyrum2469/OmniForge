# OmniForge Lighting, Sky, Time, Weather, and Water Roadmap

This roadmap is dependency-ordered and preserves the existing OmniForge renderer, scene system, asset records, Surface Recipes, project persistence, AI tools, and low-end optimization goals.

## Milestone A — Import, download, grounding, and editor cleanup

Before expanding rendering, repair the current production blockers:

- Package every registered marketplace worker and verify it exists in the assembled Windows application.
- Make marketplace downloads independent of MCP.
- Repair GLB/glTF traversal, materials, textures, deletion, archive/restore, and diagnostics.
- Implement category-aware terrain contact using authored support points and sampled terrain.
- Clean the editor into understandable workflow stages with progressive disclosure.

## Milestone B — OmniLight: scalable realistic lighting

### Rendering strategy

OmniLight should be a hybrid system rather than a mandatory full path tracer.

1. Rasterized PBR remains the reliable baseline.
2. Screen-space techniques provide inexpensive local detail.
3. Probe and radiance-cache systems provide stable indirect light beyond the screen.
4. Software ray queries use scene BVHs for selected shadows, reflections, and contact lighting on non-RT hardware.
5. Hardware ray queries are optional on supported D3D12/Vulkan devices.
6. A progressive path-traced reference mode is available for editor validation, screenshots, and light baking—not the default gameplay renderer.
7. Temporal accumulation, spatial filtering, blue-noise sampling, dynamic resolution, and strict ray budgets scale quality by hardware profile.

### Core systems

- Unified light records for suns, moons, local lights, emissive surfaces, and environment radiance.
- Physically meaningful intensity, color temperature, radius, angular size, attenuation, and exposure controls.
- Directional-light cascaded shadows with cached static regions.
- Contact shadows and screen-space shadow refinement.
- Diffuse global illumination from irradiance probes and a sparse world radiance cache.
- Screen-space reflections with probe/radiance-cache fallback.
- Optional ray-query reflections and shadows.
- Reflection probes and planar reflections where appropriate.
- Lightmap/probe baking for static low-end profiles.
- Emissive contribution rules and material-response validation.
- Volumetric lighting with quality-scaled froxel grids.
- GPU and CPU timing for every lighting stage.

### Low-end GTX 1650 profile

The GTX 1650 path must not require hardware ray tracing.

- Rasterized direct light.
- Cached cascaded shadows.
- Half/quarter-resolution screen-space effects.
- Sparse irradiance probes.
- Low-frequency radiance cache updates spread over frames.
- One or a few software rays only for prioritized pixels/objects.
- Temporal reuse and neighborhood reconstruction.
- Static-light baking and probe streaming.
- Dynamic resolution and quality adaptation against a frame-time budget.
- Per-feature fallback states with visible diagnostics.

### Optional higher-end path

On capable devices, OmniLight may use inline ray queries or a ray-tracing pipeline through the native renderer backend. DirectX Raytracing is designed to integrate ray tracing incrementally alongside raster and compute rather than requiring an all-or-nothing renderer. WebGPU remains a portable compute/raster backend; native ray tracing must therefore remain an optional backend capability rather than a universal editor assumption.

### Imported-object integration

Every imported mesh must automatically register:

- Render bounds and acceleration-structure participation.
- Shadow casting/receiving.
- Material response.
- Emissive contribution.
- Reflection classification.
- Static/dynamic mobility.
- Probe influence and update priority.
- LOD-specific lighting bounds.

No object should require a separate manual step merely to participate in normal lighting.

## Milestone C — Celestial, time, sky, clouds, and weather

### Authoritative time service

- Calendar and astronomical time.
- Paused, real-time, accelerated, scripted, and reverse time modes.
- Configurable time scale.
- Day length, year length, latitude-like controls, and custom fictional-world calendars.
- Deterministic save/reload and network-ready time state.
- Time events, alarms, curves, and gameplay hooks.

### Celestial body assets

Support multiple configurable:

- Suns.
- Moons.
- Planets.
- Stars and star fields.
- Comets and shooting stars.
- Milky-Way-like sky structures.
- Auroras.

Each body stores size, distance/visual parallax policy, orbit, rotation, phase, texture, radiance, color, angular size, eclipse role, shadow role, and time-driven curves.

### Atmosphere

- Physically inspired Rayleigh and Mie scattering.
- Ozone/absorption approximation.
- Sun disk and moon disk rendering.
- Sunrise and sunset color response.
- Aerial perspective and height fog.
- Exposure adaptation.
- Quality-scaled lookup tables and caching.

### Stars and night sky

- Catalog/procedural star layers.
- Magnitude, density, color distribution, twinkle, and visibility controls.
- Milky Way texture/procedural band controls.
- Light-pollution and moonlight visibility response.
- Configurable constellations and fictional sky layers.

### Clouds

- Layered 2D fallback for low-end systems.
- Volumetric cloud mode with temporal reprojection for higher profiles.
- Weather-driven coverage, type, altitude, thickness, density, wind, precipitation, and storm state.
- Sun/moon shadowing and silver-lining response.
- Cloud shadows projected onto terrain and objects.
- Quality-scaled ray marching.

### Weather events

- Rain, snow, hail, fog, wind gusts, lightning, storms, shooting stars, auroras, and scripted celestial events.
- Surface wetness, snow, puddle, foliage, audio, VFX, visibility, navigation, and gameplay hooks.

## Milestone D — OmniWater, immediately after lighting/sky/time/weather

Water is the next dedicated version after the lighting and environment milestone.

### Water hierarchy

- Oceans.
- Lakes.
- Rivers.
- Streams.
- Ponds.
- Waterfalls.
- Shallow puddles.
- Local gameplay volumes.

### Scalable simulation

- Far field: spectral/analytic waves and low-cost normal animation.
- Mid field: shallow-water height/velocity fields around shores and obstacles.
- Near field: localized interaction tiles for characters, vehicles, impacts, and buoyancy.
- Waterfalls/whitewater: particles, sheets, foam, and flow maps rather than full volumetric simulation everywhere.
- Optional high-quality offline/reference simulation for authored assets.

### Rendering

- Reflection hierarchy: screen-space, planar/probe fallback, optional ray queries.
- Refraction, absorption, scattering, depth color, caustics, foam, shore wetness, underwater fog, and surface normals.
- Lighting participation with suns, moons, clouds, weather, emissives, and local lights.
- Water-quality profiles including GTX 1650 budgets.

### World integration

- Terrain shorelines and river carving metadata.
- Path/bridge/structure clearance.
- Navigation and swimming regions.
- Buoyancy and physics queries.
- Weather input and evaporation/freeze states.
- Audio and VFX.
- Save/reload and world streaming.

## Acceptance standard

No milestone passes solely because a panel exists or shaders compile. It must pass real editor interaction, imported-object integration, visual inspection, frame-time budgets, save/reload, application restart, failure handling, and exported-build regression tests.
