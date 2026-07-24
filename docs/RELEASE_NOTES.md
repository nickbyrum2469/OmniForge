# OmniForge v0.9.0 — Recipe Core and Production Surface Studio

## Added

- Surface Recipe schema v2 with one shared Simple/Advanced representation.
- Expanded layers, layer colors, environment masks, weather response, graph metadata, and deterministic compilation.
- Surface compilation cache keys, warnings, cost estimates, and initial GTX 1650-class profile hints.
- Production Surface Studio modes: Simple, Advanced, Map Tools, Decals, and Atlas + Trim.
- Scene controls for season, wetness, snow, water level, wind direction, wind strength, exposure, and fog.
- Non-destructive source, tile, and offset seam previews.
- Deterministic normal, roughness, AO, and height derivative generation.
- Processed material derivatives with source relationships and provenance.
- Stable Decal Recipes and planar scene placement.
- Stable atlas and trim-sheet layout recipes with occupancy reports.
- Four guarded Codex operations for compilation, decals, and atlases.

## Preserved

- Native desktop lifecycle, project recovery, project locks, and editor navigation.
- Canonical asset import and hierarchy-transform repair.
- Provider Framework, Job Center, and Marketplace staging.
- Material tiling, terrain-conforming paths, soft borders, prefabs, and scene persistence.

## Validation

- 42 automated tests passed.
- `npm run verify` passed all syntax, test, and package checks.
- Real API derivative/compile/decal/atlas flow passed.
- Real MCP initialization and new-tool calls passed with 57 tools exposed.
- Target-Windows rendered inspection remains required because the managed Chromium environment blocks local application origins.

## Honest boundaries

- Atlas/trim recipes do not yet bake physical atlases or rewrite UVs.
- Decals are planar rather than full receiver-volume projections.
- Advanced graph data is structured and compiled but does not yet provide arbitrary shader-code nodes.
- Generated PBR derivatives require artistic review.
