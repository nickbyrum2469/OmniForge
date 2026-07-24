# OmniHydro and OmniHydro GeoMorph — Foundation Plan

## Status

OmniHydro is planned, not implemented in v0.11.

It is defined as a foundational OmniForge engine subsystem rather than a water shader, isolated physics demo, or set of disconnected effects. OmniHydro GeoMorph is its terrain-evolution, erosion, sediment-transport, and deposition subsystem.

No visual water plane, scrolling river texture, fake physics query, or non-conserved erosion system should be added under the OmniHydro name.

## Why v0.11 comes first

The previous terrain and path systems were not safe foundations for connected hydrology:

- Procedural height changed when terrain transform scale changed.
- Paths used straight chords rather than stable sampled splines.
- Terrain, physics, foliage, grounding, and rendering duplicated height equations.
- World expansion was equivalent to stretching existing geometry.
- Roads could not expose bounded cut/fill, grade, drainage, or future culvert relationships.

v0.11 establishes the prerequisites OmniHydro will require:

- Stable world-space terrain sampling.
- Explicit terrain bounds.
- Continuous directional world expansion.
- Deterministic terrain seeds and revisions.
- Shared terrain normals.
- Stable path splines.
- Path width and shoulder fields.
- Bounded road/path cut and fill.
- Maximum-grade profiles.
- Chunk metadata.
- Reserved sea-level and hydrology-ready terrain fields.
- One authority consumed by rendering, physics, grounding, foliage, APIs, MCP, and persistence.

## OmniHydro architecture to preserve

The future system remains organized around:

- **HydroGraph** — persistent connectivity between oceans, lakes, river reaches, streams, ponds, waterfalls, culverts, pipes, drains, reservoirs, flooded rooms, sources, pumps, and gates.
- **HydroPorts** — explicit mass, momentum, sediment, temperature, foam, ice, and control transfers.
- **HydroLedger** — solver-independent authoritative water state.
- **HydroDomains** — active static, thin-film, hydraulic, shallow-water, spectral, wavelet, breaker, volumetric, particle, or material representations.
- **HydroDirector** — fixed CPU, GPU, memory, particle, reflection, streaming, and simulation budgets.
- **WaveForge** — physically constrained and art-directed ocean, swell, wake, surf, breaker, barrel, storm, and impact authoring.
- **OmniHydro GeoMorph** — geology, erosion, sediment continuity, deposition, channel migration, canyon formation, plunge pools, and infrastructure scour.

## Required terrain contract

The terrain service must eventually expose:

```text
sampleHeight(position)
sampleNormal(position)
sampleSlope(position)
sampleMaterial(position)
samplePermeability(position)
sampleErosionResistance(position)
sampleProtectedState(position)
sampleBathymetry(position)
applyPreviewDelta(region, delta)
commitTerrainRevision(transaction)
rebuildDependentCollision(revision)
rebuildDependentNavigation(revision)
```

v0.11 supplies deterministic height, normal, slope, bounds, path proximity, and revision foundations. Material geology, permeability, erosion resistance, bathymetry, protected hydraulic regions, and transactional terrain deltas remain future work.

## Required path and infrastructure contract

Paths and roads must eventually provide:

- Center spline.
- Width.
- Shoulder.
- Crown and side slope.
- Cut and fill profile.
- Permeability.
- Ditches.
- Culverts.
- Bridge approaches.
- Flood overtopping limits.
- Washout policy.
- Protected-state policy.

v0.11 provides the center spline, width, shoulder, maximum grade, and bounded cut/fill profile. It deliberately does not invent hidden culverts or allow a path to become an infinite hydraulic wall.

## Dependency-ordered implementation

### Phase 0 — audit and schemas

- Record authoritative source, renderer, physics, scene schema, materials, terrain, persistence, build, tests, and exported runtime.
- Define versioned WaterBody, HydroGraph, HydroPort, HydroLedger, WaterMaterial, WaterInteraction, geology, sediment, and quality-profile schemas.
- Define migrations, permissions, transactions, undo, protected regions, and performance budgets.
- Add validation scenes and debug overlays.

### Phase 1 — queryable saved water foundation

- Static lakes and ponds.
- Basic ocean surface.
- WaterBody components and profiles.
- WaterWorldService and WaterQueryService.
- Reflection, refraction, absorption, underwater state, and basic buoyancy.
- Matching rendered and queried surfaces.
- Save, reload, restart, and exported-runtime validation.

### Phase 2 — render architecture

- Explicit water passes.
- Water identification and depth.
- Reflection and refraction sources.
- Surface, foam, and underwater passes.
- GPU timing and quality budgets.
- WebGL2 fallback plus compute-capable backend path.

### Phase 3 — connectivity and flow

- HydroGraph and HydroPorts.
- Sources, drains, culverts, gates, dams, and waterfalls.
- One-dimensional river reaches.
- Conservative two-dimensional flow.
- Wet/dry cells, flooding, currents, and shoreline changes.

### Phase 4 and later

- Spectral oceans and large-lake waves.
- Local wave packets and wakes.
- Character, creature, vehicle, and boat interaction.
- Breakers, barrels, and local volumetric domains.
- GeoMorph erosion, sediment, deposition, canyons, valleys, and waterfall retreat.
- Rain, runoff, freezing, ice, snowmelt, and phase changes.
- Navigation, audio, foliage, biomes, streaming, multiplayer policy, and production profiling.

## First real OmniHydro implementation

The smallest acceptable first implementation is not a decorative plane. It must create one real water body that is:

- Visible.
- Saved and reloadable.
- Queryable by physics and gameplay.
- Bounded in world space.
- Assigned an authoritative water level and volume.
- Rendered with matching surface height.
- Capable of basic buoyancy.
- Connected to weather and terrain queries.
- Profiled through a fixed quality budget.
- Present in the exported runtime.

That first implementation must preserve room for HydroGraph connectivity and later solver promotion without replacing its data model.

## Validation before code claims

OmniHydro cannot be called implemented until the editor and exported runtime pass real tests for water visibility, queries, buoyancy, reflections, underwater transitions, save/reload, restart, performance limits, and no-water zero-cost behavior.

GeoMorph cannot be called implemented until removed terrain becomes tracked sediment or debris, transported material is conserved, deposition occurs elsewhere, dependent collision and navigation revisions are updated, and protected paths, roads, foundations, towns, and structures are honored.
