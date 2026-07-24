# OmniForge v0.9 — Production Surface Studio

## Purpose

v0.9 turns the earlier texture generator and Surface Recipe editor into one authoritative surface-production pipeline. Simple controls, advanced masks, graph metadata, processed derivatives, decals, atlases, and Codex tools all read and write the same registered material and Surface Recipe assets.

The system does not create a parallel shader format. A material remains the source of PBR maps and physical settings; its linked Surface Recipe defines layering, world response, compilation metadata, and validation.

## Authoritative data model

### Material asset

A material owns:

- Stable material ID.
- Original or generated texture maps.
- Real-world tile size.
- UV rotation and offsets.
- Roughness, metallic, normal, AO, and height strengths.
- Provenance, license, tags, source relationships, and derivatives.
- The active linked Surface Recipe ID.

### Surface Recipe v2

A Surface Recipe owns:

- Stable recipe ID and base material link.
- Non-destructive source-recipe relationship.
- Dirt, moss, wetness, snow, damage, color variation, roughness variation, detail amount, and detail scale.
- Layer colors.
- Upward, downward, slope, cavity, convex-edge, ground-contact, water-contact, sun, shade, wind, path-distance, structure-distance, terrain-layer, vertex-paint, and authored-mask inputs.
- UV, world-space, or triplanar projection metadata.
- Macro/detail scales, blend sharpness, parallax steps, and layer order.
- Shared simple/advanced graph representation.
- Weather-response settings.
- Validation and deterministic compilation metadata.

Simple mode and Advanced mode edit the same recipe. Switching modes cannot create incompatible copies.

## Live rendering

The current WebGL renderer consumes the linked material and recipe together. It supports:

- Base color, normal, roughness, metallic, AO, and height response.
- Dirt, moss, wetness, snow, damage, and macro variation.
- Deterministic geometry/world masks.
- Scene water level, wetness, snow, season, wind strength, and wind direction.
- Structure proximity and terrain/path context where available.
- Transparent planar decals with depth-safe ordering and fading.

The renderer remains a custom foundation. Some advanced recipe fields are stored and validated before their final high-end runtime implementation, but they are not represented as separate fake systems.

## Surface compilation

Compilation creates a deterministic SHA-256 cache key from the normalized recipe. It records:

- Renderer version.
- Compile time.
- Validation errors and warnings.
- Active layers and masks.
- Estimated texture-sampling and arithmetic cost.
- Low-end warnings.
- Initial GTX 1650-class profile hints.

The estimates are advisory instrumentation for the future v0.21 optimizer; actual exported-build profiling remains authoritative.

## Map tools

The Map Tools workspace performs non-destructive image processing in the editor:

- Source preview.
- 2×2 tile preview.
- Half-offset seam preview.
- Seam-repair derivative generation.
- Base-color preservation.
- Normal reconstruction.
- Roughness generation.
- Ambient-occlusion generation.
- Height generation.
- Generated-map registration as a new material derivative.

The original material and source maps remain intact. The processed material receives a stable ID, source-material relationship, derivative operation, linked recipe, provenance, and validation state.

## Decal Studio foundation

Decals are first-class recipe assets. A decal stores:

- Stable ID.
- Source material.
- Category.
- Affected material channels.
- Projection depth and angle.
- Surface limit.
- Sort order.
- Fade distance.
- Opacity.
- Batching compatibility.
- Provenance and validation.

Current placement creates a live planar scene decal with stable recipe/material references. Arbitrary mesh projection, receiver filtering, and production decal batching remain later renderer work.

## Atlas and trim-sheet foundation

Atlas recipes store:

- Stable ID.
- Atlas or trim-sheet kind.
- Resolution.
- Source materials.
- Deterministic normalized UV rectangles.
- Occupancy.
- Source relationship and validation.

The current implementation creates the authoritative layout recipe and interactive preview. It does not yet bake all source maps into a physically packed bitmap set or rewrite mesh UVs. Those operations are intentionally recorded as remaining production work rather than implied by the presence of the panel.

## Preview and reversibility

Surface changes use preview state before commit. Users can:

- Edit live values.
- Review the viewport and validation.
- Commit the recipe.
- Revert to the baseline.
- Create a recipe variant.
- Create a material instance or processed material derivative.

Protected materials and recipes remain protected. Processing never overwrites source maps.

## Codex tools

v0.9 adds guarded tools for:

- Compiling Surface Recipes.
- Updating the full v2 recipe schema.
- Creating recipe variants.
- Creating decal recipes.
- Placing decals.
- Creating atlas or trim-sheet recipes.

Codex uses the same normalization, validation, audit, and persistence paths as the visible editor.

## Current limitations

- Advanced graph nodes are normalized, displayed, compiled, and used as deterministic feature inputs, but there is not yet a free-form node wiring canvas or arbitrary shader-code generation.
- Triplanar and UV projection are represented in the recipe; the current terrain-oriented renderer remains primarily world-projected.
- Seam repair is deterministic image processing, not a content-aware clone/heal brush.
- Atlas/trim recipes do not yet bake physical multi-channel texture atlases or modify model UVs.
- Decals currently use planar projection rather than arbitrary receiver-volume projection.
- Texture compression and platform-specific GPU formats remain export-pipeline work.
- Final visual approval requires the Windows desktop build because the managed Chromium environment used here blocks local application origins.
