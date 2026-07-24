# OmniForge v0.5.1 Master Production Plan

## Purpose

This document turns the next OmniForge development program into one dependency-ordered implementation plan. It covers the unified recipe architecture, Surface Studio, intelligent material masking, asset health, modular kits, foliage, biomes, contextual AI actions, Style DNA, design-intent locking, and the acceptance evidence required before any subsystem is represented as production-ready.

The v0.5.1 package implements the desktop lifecycle, Project Hub, editor usability, project locking, schema migration, and supporting persistence needed to begin this program safely. The production systems below are staged work unless explicitly marked **Implemented in v0.5.1**.

## Non-negotiable production rules

1. Work only in the authoritative OmniForge application and project model.
2. Do not create parallel material, asset, terrain, path, foliage, prefab, or AI systems.
3. Preserve approved entities, materials, layouts, scenes, assets, and project data.
4. Give every persistent object a stable ID independent of its display name.
5. Preserve source files and generate reversible derivatives.
6. Treat preview, validation, approval, application, and rollback as distinct states.
7. Require license and provenance before an external asset can become approved.
8. Never guess world placement. Query terrain, bounds, collision, navigation, hierarchy, sockets, protected zones, and intended player approach.
9. Never accept compilation or a visible panel as proof of a complete workflow.
10. Keep manual editing fully usable when no AI provider is connected.
11. Prevent AI and workers from unrestricted file access, unrestricted shell execution, secret access, and destructive project-wide changes.
12. Record every AI action, output, warning, affected entity, validation result, and undo transaction.

# Part I — Current v0.5.1 foundation

## Desktop lifecycle — Implemented in v0.5.1

The current desktop layer owns:

- One native Electron application window.
- One hidden local runtime child.
- One random loopback port and one session token.
- One `%APPDATA%\OmniForge` data root.
- One application instance.
- Stale-runtime detection.
- Process-tree shutdown.
- Unclean-session detection.
- Recovery choice.
- Safe Mode.
- Atomic state and backup files.
- Window-state persistence.
- Restricted navigation and denied permission requests.
- Separate browser-development startup.
- App icon, product name, version, About metadata, and executable resource-stamping script.

## Project Hub — Implemented in v0.5.1

The Project Hub owns:

- Project creation.
- Recent-project ordering.
- Project thumbnails.
- Project opening.
- Duplication.
- Archiving.
- Folder import.
- Schema migration.
- Missing-directory detection.
- Locate-and-restore workflow.
- Project write locks.
- Recovery of the last readable project state.

## Editor usability — Implemented in v0.5.1

The editor owns:

- Resizable left, right, and bottom panels.
- Collapsible panels.
- Saved workspace layouts.
- Searchable command palette.
- Remappable keyboard shortcuts.
- Selection breadcrumbs.
- Clear no-selection state.
- Saved, dirty, saving, and error indicators.
- Structured error presentation.
- First-use navigation tutorial.
- Focus-selection and reset-camera commands.
- Horizontal and vertical look inversion.
- Sensitivity, movement speed, and FOV settings.

# Part II — Shared data and transaction architecture

## 1. Recipe asset base

Every recipe type derives from a common record:

```ts
interface RecipeRecord {
  id: string;
  recipeType:
    | "surface"
    | "asset"
    | "modular-kit"
    | "foliage-family"
    | "biome"
    | "assembly";
  name: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  sourceAssetIds: string[];
  derivativeAssetIds: string[];
  dependencyIds: string[];
  tags: string[];
  provenance: ProvenanceRecord[];
  validation: ValidationReport;
  approvalState: "draft" | "previewed" | "validated" | "approved" | "rejected";
  protected: boolean;
  revision: number;
}
```

### Recipe guarantees

- IDs never change when a recipe is renamed.
- Recipes reference assets by stable IDs, never by fragile display names.
- Missing dependencies are reported, not silently removed.
- Recipe edits run through undoable transactions.
- Preview state never mutates an approved recipe.
- Saving and reloading produces byte-equivalent functional behavior.
- Project migration includes recipe migration and validation.
- Recipes expose their dependencies and usages to human and AI search.

## 2. Shared preview transaction

Every authored or AI-created change uses:

```text
Intent
  ↓
Read current authoritative state
  ↓
Resolve dependencies and protected work
  ↓
Create preview transaction
  ↓
Generate derivative data
  ↓
Apply preview to isolated scene/runtime layer
  ↓
Capture evidence and diagnostics
  ↓
Validate
  ↓
Approve and commit OR reject and discard
  ↓
Persist audit and undo records
```

A transaction records:

- Transaction ID.
- Requesting user or AI.
- Start and end time.
- Project and scene revisions.
- Input assets and entities.
- Created derivatives.
- Modified records.
- Protected-work intersections.
- Runtime reload scope.
- Tests and evidence.
- Validation failures.
- Commit or rollback result.

## 3. Shared validation service

Validation is capability-based rather than panel-specific. Validators include:

- Asset parse validation.
- Geometry validation.
- Material validation.
- Texture validation.
- Collision validation.
- LOD validation.
- Rig validation.
- Animation validation.
- Terrain contact validation.
- Placement validation.
- Navigation validation.
- Performance-budget validation.
- Provenance and license validation.
- Style DNA validation.
- Protected-work validation.
- Save/reload validation.
- Export-inclusion validation.

# Part III — Unified recipe types

## 4. Surface Recipe

A Surface Recipe is the authoritative reusable description of a rendered surface.

### Data

- Base material asset ID.
- Base color.
- Normal.
- Roughness.
- Metallic.
- Ambient occlusion.
- Height or displacement.
- Emissive.
- Opacity.
- Macro color variation.
- Macro roughness variation.
- Detail normal layers.
- Dirt layer.
- Moss layer.
- Wetness layer.
- Snow layer.
- Damage layer.
- Edge treatment.
- Cavity treatment.
- Decal compatibility.
- Weather response.
- Season response.
- Real-world scale.
- Projection mode.
- Shader features.
- Texture compression profile.
- Validation report.

### Runtime contract

A Surface Recipe provides:

- Material instance parameters.
- Required textures.
- Required shader features.
- Environmental inputs.
- Terrain/path blending compatibility.
- Decal channel support.
- Quality-tier variants.

### Required tests

- Map presence and color-space correctness.
- Tiling at multiple distances.
- Seam visibility.
- Real-world scale.
- Roughness and metallic limits.
- Normal orientation.
- Height stability.
- Weather and season transitions.
- Variant isolation.
- Save/reload.
- Build inclusion.

## 5. Asset Recipe

An Asset Recipe makes an imported, generated, or downloaded object production-ready.

### Data

- Original source asset.
- Canonical GLB derivative.
- Materials and slots.
- Collision.
- LODs.
- Sockets.
- Affordances.
- Tags.
- Pivot.
- Orientation.
- Dimensions.
- Category.
- Validation.
- Provenance.
- Scene usages.
- Style DNA report.

### Category-aware profiles

Profiles differ for:

- Static prop.
- Architecture.
- Modular piece.
- Foliage.
- Terrain feature.
- Character.
- Creature.
- Weapon.
- Vehicle.
- Animated mechanism.
- VFX mesh.

The category changes collision recommendations, LOD rules, rig requirements, pivot expectations, affordances, placement checks, and performance budgets.

## 6. Modular Kit Recipe

A Modular Kit Recipe defines compatible building pieces rather than a loose folder of meshes.

### Data

- Piece asset IDs.
- Grid size.
- Piece dimensions.
- Connection sockets.
- Socket orientation and gender/type.
- Valid neighbors.
- Wall thickness.
- Door openings.
- Window openings.
- Roof connections.
- Stair connections.
- Corner rules.
- Foundation rules.
- Material assignment rules.
- Collision.
- Navigation clearance.
- Assembly constraints.
- Style DNA.

### Required behavior

- Grid, surface, and vertex snapping.
- Compatible-piece filtering.
- Automatic inner/outer corner selection.
- Door and window insertion without destructive mesh stretching.
- Roof generation from compatible pieces.
- Stair placement with rise/run and clearance validation.
- Foundation fitting against terrain.
- Interior and exterior material assignment.
- Doorway, collision, and navigation validation.

## 7. Foliage Family Recipe

A Foliage Family Recipe groups related species and ecology rules.

### Data

- Species records.
- Mesh variants.
- Growth stages.
- Dead variants.
- Fallen variants.
- Seasonal variants.
- Placement rules.
- Parent-child relationships.
- Wind profiles.
- Collision profiles.
- LODs.
- Impostors.
- Interaction rules.
- Biome compatibility.

## 8. Biome Recipe

A Biome Recipe coordinates world surfaces and ecosystems.

### Data

- Terrain surfaces.
- Cliff and shore surfaces.
- Foliage families.
- Rock and debris sets.
- Path styles.
- Water rules.
- Weather profile.
- Lighting profile.
- Wind profile.
- Environment audio.
- Navigation effects.
- Gameplay exclusions.
- Streaming profile.
- Performance budgets.
- Quality tiers.

## 9. Assembly Recipe

An Assembly Recipe creates one complete authored object from multiple systems.

Example:

```text
Campfire Assembly
├── Stone-ring asset
├── Log assets
├── Flame VFX
├── Ember VFX
├── Smoke VFX
├── Point light
├── Spatial audio source
├── Heat volume
├── Interaction socket
├── Save-state component
└── Navigation avoidance
```

### Assembly requirements

- Every child has a stable local transform.
- Dependencies are validated before placement.
- Dragging an assembly creates the complete hierarchy.
- Assembly instances preserve a source-recipe reference.
- Per-instance overrides are explicit.
- Updates show a diff before applying to existing instances.
- Protected overrides survive source updates.

# Part IV — Surface Studio

## 10. One authoritative material model

Simple mode and advanced mode edit one Surface Recipe and one material asset. They cannot diverge.

### Simple mode

Controls:

- Surface type.
- Real-world scale.
- Rotation.
- Offset.
- Roughness.
- Metallic.
- Normal strength.
- AO strength.
- Height strength.
- Dirt.
- Moss.
- Wetness.
- Snow.
- Damage.
- Color variation.
- Detail amount.

### Advanced mode

The material graph compiles to the same data model. Nodes include:

- Texture sample.
- Noise.
- Color adjustment.
- Height blend.
- Slope mask.
- World-space mask.
- Object-space mask.
- Vertex color.
- Curvature.
- Cavity.
- Convex edge.
- Ground contact.
- Water contact.
- Sun exposure.
- Wind exposure.
- Terrain surface.
- Distance from paths.
- Distance from structures.
- Weather state.
- Season state.
- Gameplay state.
- Material layer.

### Graph rules

- Graph edits compile deterministically.
- Compilation errors identify the node and dependency.
- Compiled variants are cached by graph and input checksums.
- Simple-mode sliders update graph parameters, not a second shader.
- Removing a feature cleans unused shader variants and textures safely.
- Preview uses the same runtime material path as the real scene.

## 11. Surface inputs

The author can begin from:

- Natural-language description.
- Negative constraints.
- Imported image.
- Clipboard image.
- Existing material.
- Generated image.
- Multiple references.
- Photogrammetry set.
- Provider-downloaded material.

Every input is preserved as a source record. Generated or optimized files become derivatives.

## 12. Intelligent material masking

### Required masks

- Upward-facing.
- Downward-facing.
- Slope.
- Cavity.
- Convex edge.
- Ground contact.
- Water contact.
- Sun exposure.
- Shade.
- Wind-facing direction.
- Distance from roads.
- Distance from structures.
- Terrain layer.
- Vertex paint.
- Authored texture mask.

### Deterministic AI translation

For a request such as “add moss mainly in crevices, on shaded sides, and close to the ground,” the AI produces a preview graph equivalent to:

```text
Moss weight =
  CavityMask * 0.45
+ ShadeMask * 0.30
+ GroundContactFalloff * 0.25
then clamp, soften, and modulate with low-frequency noise
```

The user sees:

- Resolved masks.
- Weights.
- Preview.
- Affected materials.
- Estimated shader cost.
- Validation warnings.
- Undo option.

## 13. Production material tools

### Source-map repair

- Seam removal.
- Offset seam preview.
- Clone and heal.
- Normal reconstruction.
- Normal inversion detection.
- Roughness range editing.
- Metallic range editing.
- Height-map cleanup.
- Color-space validation.
- Map-resolution matching.
- Channel packing.
- Mip generation.
- Texture compression.

### Projection and reuse

- Detail maps.
- Triplanar projection.
- World-space projection.
- UV0 and UV1 selection.
- Texture arrays.
- Terrain-layer blending.
- Material instances.
- Per-object overrides without texture duplication.
- Material compilation caching.

### Derivative policy

- Original files remain immutable.
- Each repair records settings and input checksum.
- Re-running the same deterministic operation reuses its derivative.
- Optimized derivatives are platform-specific when required.
- The user can compare source and derivative.

## 14. Trim Sheet and Atlas tools

### Trim Sheet Studio

- Define reusable beam, border, edge, panel, roof, and frame regions.
- Display UV regions and texel density.
- Snap UV shells to trim regions.
- Preview on actual modular pieces.
- Store trim compatibility in the Modular Kit Recipe.

### Atlas Studio

- Pack selected assets.
- Display occupancy and wasted space.
- Preserve padding and mip safety.
- Support material-ID masks.
- Produce platform-specific compressed outputs.
- Repack a kit without breaking stable material references.
- Record source-to-atlas region relationships.

## 15. Decal Studio

Decals are first-class assets, not anonymous scene projections.

### Categories

- Dirt.
- Cracks.
- Moss.
- Leaks.
- Road markings.
- Signs.
- Blood.
- Damage.
- Scorch marks.
- Graffiti.
- Footprints.
- Puddles.
- Snow patches.

### Decal record

- Stable ID.
- Affected material channels.
- Projection depth.
- Projection angle.
- Surface limits.
- Sort order.
- Fade distance.
- Batching compatibility.
- Provenance.
- Validation.

### Placement contract

Before applying a decal, query target surface, normal, bounds, nearby geometry, UV/projection suitability, protected work, and gameplay purpose.

# Part V — Asset intake and health

## 16. Goal-aware importing

The import wizard asks the intended category before recommendations are generated. Automatic inference may suggest a category, but the user can correct it.

### Automatic Asset Health Report

Every asset reports:

- Real-world dimensions.
- Unit scale.
- Up and forward axes.
- Facing.
- Pivot.
- Bounds.
- Triangle count.
- Vertex count.
- Material count.
- Texture memory.
- UV channels.
- Texel density.
- Tangents.
- Normal quality.
- Non-manifold geometry.
- Open edges.
- Duplicate vertices.
- Collision status.
- LOD status.
- Skeleton status.
- Animation status.
- Transparency.
- Overdraw.
- Estimated draw calls.
- License.
- Provenance.
- Recommended repairs.

### Repair Safe Issues

Safe repairs may include:

- Normalize transforms.
- Correct axis conversion.
- Recalculate tangents.
- Merge exact duplicate vertices.
- Remove zero-area triangles.
- Consolidate compatible material slots.
- Generate missing bounds.
- Create a centered or base pivot derivative.

Every repair creates a derivative, displays a diff, and remains reversible.

# Part VI — Modular Kit authoring

## 17. Kit-authoring workspace

### Editing tools

- Socket authoring.
- Socket visualization.
- Grid snapping.
- Surface snapping.
- Vertex snapping.
- Compatible-piece filters.
- Automatic corner selection.
- Door and window insertion.
- Roof generation.
- Stair placement.
- Foundation fitting.
- Interior/exterior material assignment.
- Collision validation.
- Navigation validation.
- Doorway-clearance validation.

### AI building flow

For a building request, the AI must:

1. Inspect the site bounds, terrain, roads, paths, entrances, protected views, and gameplay zones.
2. Calculate a footprint and orientation.
3. Select a compatible kit.
4. Produce a floor plan and piece list.
5. Preview the structure.
6. Validate sockets, doors, stairs, collision, navigation, roads, and camera sightlines.
7. Apply coherent Surface Recipes.
8. Capture close, wide, side, rear, elevated, doorway, interior, and player views.
9. Commit only after approval.

The AI may not stretch unrelated meshes to fake missing kit pieces.

# Part VII — Foliage production

## 18. Foliage Species asset

Each species defines:

- Mesh variants.
- Growth stages.
- Dead variants.
- Fallen variants.
- Stumps.
- Seasonal materials.
- Wet and snow variants.
- Burned variants.
- Scale range.
- Tilt range.
- Root burial depth.
- Wind profile.
- Collision profile.
- Navigation effect.
- LOD profile.
- Impostor.
- Interaction profile.
- Biome tags.

## 19. Foliage Families and ecology graph

Families include:

- Canopy trees.
- Young trees.
- Shrubs.
- Ferns.
- Flowers.
- Grass.
- Ground cover.
- Mushrooms.
- Fallen logs.
- Stumps.
- Rocks.
- Forest debris.

Ecology relationships are explicit graph edges, for example:

- Ferns prefer shade from canopy instances.
- Mushrooms prefer damp fallen logs.
- Young trees prefer openings.
- Grass density rises near forest edges.
- Dead trees are reduced near maintained paths.
- Rocks favor slopes and erosion channels.

## 20. Foliage placement system

### Placement methods

- Blue-noise spacing.
- Poisson-disc spacing.
- Clusters.
- Groves.
- Lines.
- Edge bands.
- Clearings.
- Parent-child placement.
- Density gradients.
- Noise fields.
- Painted masks.
- Spline-driven placement.
- Hand-authored hero instances.
- Deterministic seeds.

### Required spatial queries

- Ground height.
- Ground normal.
- Slope.
- Altitude.
- Surface type.
- Moisture.
- Sun exposure.
- Shade.
- Water distance.
- Path distance.
- Structure distance.
- Gameplay-zone distance.
- Navigation clearance.
- Nearby foliage.

### Placement outputs

- Species.
- Scale.
- Rotation.
- Tilt.
- Root burial.
- Density.
- Cluster membership.
- Variant.
- LOD/impostor assignment.
- Collision tier.

Validators must flag floating, buried, duplicated rotation, blocked paths, blocked doors, blocked sightlines, and deterministic-seed instability.

## 21. Foliage painting

Brushes:

- Paint density.
- Erase.
- Replace species.
- Increase/decrease scale.
- Reorient.
- Regenerate variants.
- Create clearing.
- Paint exclusion.
- Paint moisture.
- Paint shade.
- Paint age.
- Paint damage.
- Paint season.
- Promote procedural instance to authored object.

A manually edited instance becomes a protected override and survives regeneration.

## 22. Path and structure masks

Paths and structures emit authoritative control masks:

1. Hard exclusion for trunks, rocks, and large obstacles.
2. Soft density reduction near roads.
3. Edge encroachment for grass, flowers, roots, and small stones.
4. Maintenance state for clean, neglected, and overgrown routes.
5. Sightline protection.
6. Door and gate clearance.
7. Combat-area clearance.
8. Spawn-area clearance.
9. Navigation clearance.
10. Water and shoreline exclusion.

These integrations are encoded in the foliage pipeline and do not depend on the user repeating them.

## 23. Authoritative world wind

One world wind service provides:

- Direction.
- Strength.
- Gusts.
- Turbulence.
- Height response.
- Local wind volumes.
- Storm multipliers.
- Sheltered regions.
- Distance-based quality.

Species wind profiles provide:

- Trunk stiffness.
- Branch flexibility.
- Leaf flutter.
- Maximum bend.
- Recovery speed.
- Damage threshold.

## 24. Seasons, weather, and foliage states

Supported states:

- Spring.
- Summer.
- Autumn.
- Winter.
- Wetness.
- Snow accumulation.
- Frost.
- Drought.
- Burned.
- Wind damage.
- Leaf loss.
- Fallen leaves.
- Fallen needles.

Material and density transitions are preferred over whole-mesh replacement when they preserve quality.

## 25. Interactive foliage tiers

### Distant tier

- GPU/thin instancing.
- Simplified wind.
- Simplified shadows.
- No individual physics.

### Nearby tier

- Character bending.
- Footstep response.
- Damage.
- Cutting.
- Harvesting.
- Burning.
- Temporary physics.
- Gameplay components.

Instances can be promoted to interactive entities and later returned to instanced rendering without losing identity or state.

## 26. Foliage performance and debugging

### Performance systems

- Instancing.
- Batching.
- Frustum culling.
- Occlusion strategy.
- Distance culling.
- LOD transitions.
- Impostors.
- Shadow-distance control.
- Density scaling.
- Chunk streaming.
- Platform quality profiles.
- Draw-call budget.
- Instance budget.
- Texture budget.
- Overdraw budget.

### Debug overlays

- Density.
- Species.
- LOD.
- Culling.
- Overdraw.
- Shadow casters.
- Interactive instances.
- Navigation blockers.
- Exclusion zones.
- Streaming chunks.
- Floating/buried instances.
- Repeated variants.

# Part VIII — Biome Studio

## 27. Central biome workspace

### Overview

- Name.
- Climate.
- Moisture.
- Temperature.
- Season.
- Art direction.
- Seed.

### Surfaces

- Terrain materials.
- Cliff materials.
- Shore materials.
- Mud.
- Snow.
- Wet variants.
- Layer blending.

### Foliage

- Canopy.
- Understory.
- Ground cover.
- Flowers.
- Debris.
- Rocks.
- Fallen trees.

### Placement

- Altitude.
- Slope.
- Moisture.
- Sun.
- Shade.
- Water distance.
- Path distance.
- Structure distance.
- Clustering.
- Clearings.

### Environment

- Lighting.
- Wind.
- Fog.
- Weather.
- Water.
- Ambient VFX.
- Audio.

### Gameplay

- Navigation cost.
- Visibility.
- Cover.
- Harvestables.
- Hazards.
- Spawn suitability.
- Combat clearings.

### Performance

- Instance budget.
- Texture budget.
- Shadow budget.
- LOD profile.
- Streaming distance.
- Quality tiers.

Changes regenerate only affected biome regions during preview.

# Part IX — Application flow and contextual actions

## 28. Central Create menu

```text
Create
├── Surface
├── Decal
├── Static Asset
├── Character
├── Modular Kit
├── Assembly
├── Foliage Species
├── Foliage Family
├── Biome
├── Path Style
├── Building
├── Environment
└── Generated Asset
```

Each option opens a guided workflow but writes to the same authoritative asset, recipe, project, and transaction systems.

## 29. Surface workflow

```text
Describe or import
  ↓
Choose intended use
  ↓
Generate or extract maps
  ↓
Repair maps and seams
  ↓
Set real-world scale
  ↓
Preview on a real scene object
  ↓
Create Surface Recipe
  ↓
Create variants
  ↓
Validate
  ↓
Approve
```

## 30. Asset workflow

```text
Import, generate, or download
  ↓
Identify category
  ↓
Analyze geometry and materials
  ↓
Normalize scale, axes, and pivot
  ↓
Repair safe issues
  ↓
Generate collision and LODs
  ↓
Add sockets and affordances
  ↓
Preview in real scene
  ↓
Validate
  ↓
Approve
```

## 31. Foliage workflow

```text
Import/select meshes
  ↓
Create species
  ↓
Create variants and LODs
  ↓
Define wind and collision
  ↓
Add species to family
  ↓
Define ecology
  ↓
Add family to biome
  ↓
Preview biome region
  ↓
Validate navigation and performance
  ↓
Approve
```

## 32. Contextual actions

Right-click actions use typed operations:

- Create material variant.
- Replace material.
- Match nearby texel density.
- Match nearby material scale.
- Add weathering.
- Add decal.
- Add collision.
- Generate LODs.
- Create prefab.
- Create assembly.
- Add socket.
- Add affordance.
- Add to modular kit.
- Convert to foliage species.
- Add to foliage family.
- Find similar assets.
- Find usages.
- Validate placement.
- Regenerate derivative.
- Protect object.
- Protect view.
- Protect path.
- Protect gameplay area.

Human UI and AI tools call the same service methods.

# Part X — Project Style DNA and protection

## 33. Style DNA

A project defines target ranges and rules for:

- Texel density.
- Color palette.
- Roughness.
- Metallic use.
- Geometry density.
- Shape language.
- Edge treatment.
- Weathering level.
- Foliage density.
- Foliage proportions.
- Realistic or stylized scale.
- Lighting targets.
- Material complexity.
- Performance budgets.

Validation reports deviations without silently changing the asset’s intended design.

## 34. Design-intent locking

Protectable records include:

- Objects.
- Materials.
- Buildings.
- Roads.
- Doorways.
- Gameplay zones.
- Views.
- Compositions.
- Foliage clusters.
- Biome regions.
- Approved paths.

Any intersecting preview lists the protected items and cannot commit without an allowed operation or explicit override.

# Part XI — Guarded AI tools

## 35. Surface tools

```ts
surface.create(...)
surface.createVariant(...)
surface.preview(...)
surface.validate(...)
surface.apply(...)
surface.repairMaps(...)
surface.compile(...)
surface.findUsages(...)
```

## 36. Asset tools

```ts
asset.analyze(...)
asset.repair(...)
asset.generateCollision(...)
asset.generateLods(...)
asset.createKit(...)
asset.createAssembly(...)
asset.findUsages(...)
asset.previewPlacement(...)
asset.commitPlacement(...)
```

## 37. Foliage tools

```ts
foliage.createSpecies(...)
foliage.createFamily(...)
foliage.createBiome(...)
foliage.previewRegion(...)
foliage.paintDensity(...)
foliage.paintExclusion(...)
foliage.regenerateRegion(...)
foliage.validateRegion(...)
foliage.findBlockedPaths(...)
foliage.findFloatingInstances(...)
foliage.findRepetition(...)
foliage.promoteInstance(...)
foliage.commitPreview(...)
foliage.undo(...)
```

## 38. Mandatory AI operation envelope

Every AI operation requires:

- Permission level.
- Resolved stable IDs.
- Preview.
- Affected bounds.
- Protected-work analysis.
- Validation.
- Evidence.
- Audit record.
- Undo record.
- Explicit approval for destructive or paid operations.

The AI status must use accurate terms: proposed, preview created, validation failed, waiting for approval, applied, reverted, provider unavailable, or blocked.

# Part XII — Acceptance gates

## 39. Surface acceptance

- Create or import a real material.
- Produce all applicable PBR maps.
- Repair a visible seam.
- Set real-world scale.
- Preview on a real scene object.
- Add dirt, moss, wetness, and snow.
- Create an independent variant.
- Save and reload.
- Restart OmniForge.
- Confirm stable references.
- Confirm exported-runtime behavior.

## 40. Asset acceptance

- Import a real GLB.
- Produce the health report.
- Normalize scale, orientation, and pivot.
- Repair safe issues.
- Generate collision.
- Generate at least two LODs.
- Add sockets.
- Place in a real scene.
- Save, reload, and restart.
- Query provenance and usages.

## 41. Modular-kit acceptance

- Create a real kit.
- Assemble a building.
- Validate connections.
- Validate doors and stairs.
- Validate collision.
- Validate navigation.
- Apply coherent surfaces.
- Save and reload.
- Confirm the kit remains editable.

## 42. Foliage acceptance

- Create multiple real species.
- Create a family.
- Create a forest biome.
- Generate canopy, understory, ground cover, rocks, and debris.
- Preserve roads.
- Preserve structures and doorways.
- Preserve navigation.
- Preserve a protected sightline.
- Apply wind.
- Apply weather/season changes.
- Stream by region.
- Save/reload/restart.
- Reproduce deterministic regeneration.

## 43. Performance acceptance

- Measure draw calls.
- Measure instance count.
- Inspect overdraw.
- Inspect active LODs.
- Inspect streaming.
- Test quality profiles.
- Confirm the editor remains responsive during generation and regeneration.

## 44. AI acceptance

- Request a biome preview.
- Confirm terrain, path, structure, navigation, and protected-zone queries occurred.
- Confirm preview precedes application.
- Confirm validation failures are visible.
- Confirm undo restores prior state.
- Confirm the AI does not report applied work without a committed transaction and rendered evidence.

# Part XIII — Evidence protocol

For every substantial subsystem:

1. Record project, schema, source build, and active scene.
2. Capture a baseline.
3. Execute the real workflow.
4. Inspect logs and diagnostics.
5. Capture close, wide, side, rear, elevated, and player-relevant views.
6. Capture collision, navigation, mask, LOD, and performance overlays when applicable.
7. Save and reload.
8. Restart the editor.
9. Test failure and cancellation.
10. Retest protected work and connected systems.
11. Test the exported runtime where applicable.
12. Record pass, failure, blocker, and remaining work without unsupported claims.

# Part XIV — Definition of ready for implementation

A planned epic may enter implementation only when:

- Its dependencies exist.
- Its authoritative data owner is known.
- Its schemas are versioned.
- Its migration plan exists.
- Its AI permissions are defined.
- Its undo boundaries are defined.
- Its validators exist or are included in the epic.
- Its real end-to-end test asset or scene is selected.
- Its performance budget is defined.
- Its required evidence views are defined.

# Part XV — Definition of release-ready

A subsystem is release-ready only when:

- The latest authoritative source is used.
- UI controls execute real operations.
- Preview, validation, apply, and undo all work.
- Data survives save/reload and restart.
- Errors and partial failures are recoverable.
- Protected work is preserved.
- AI and manual workflows produce the same authoritative result.
- Performance stays within the declared budget.
- Export inclusion is confirmed.
- Rendered evidence reveals no unresolved required defect.
