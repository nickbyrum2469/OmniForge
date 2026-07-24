# OmniForge Roadmap — v0.6 through v0.21

## Roadmap contract

This roadmap continues from the v0.5.1 desktop, Project Hub, persistence, editor usability, material-tuning, terrain-path, prefab, and Codex foundations. Releases are dependency ordered. A later release must not bypass an incomplete earlier authority layer by creating a disconnected substitute.

Each release contains:

- Product objective.
- Authoritative systems changed.
- Implementation work.
- AI tool expansion.
- Required tests.
- Exit gate.
- Explicit non-goals.

Version numbers describe production milestones, not promises that every listed item is already implemented.

---

# v0.6 — Canonical Asset Foundation

## Objective

Make every imported, generated, downloaded, or authored asset traceable, previewable, validatable, and reusable through one authoritative asset graph.

## Core implementation

### Canonical asset record

Add stable records for:

- Source asset.
- Canonical derivative.
- Provider and provider asset ID.
- Creator and source URI.
- License and attribution.
- Checksum.
- Unit scale.
- Up and forward axes.
- Bounds.
- Triangle and vertex counts.
- Material slots.
- Texture descriptors.
- Skeleton.
- Animation clips.
- Collision.
- LODs.
- Tags.
- Semantic description.
- Affordances.
- Validation.
- Scene usages.
- Source/derivative graph.

### Staging and quarantine

Create:

- Controlled import staging directory.
- Unvalidated Imports collection.
- Failed Imports collection.
- Suspicious-file quarantine.
- Deterministic cleanup.
- Import job logs.

### GLB/glTF 2.0 import

Support:

- GLB and glTF parsing.
- External URI containment.
- Buffer and image validation.
- Material and texture preservation.
- Skeleton and skin preservation.
- Animation preservation.
- Morph-target preservation.
- Camera/light preservation where supported.
- Extension reporting.
- Unsupported-feature reporting.
- Scale and axis normalization.
- Canonical derivative generation.

### Asset Health Report

Implement category-aware health checks for geometry, materials, textures, collision, LOD, rig, animation, transparency, overdraw, memory, provenance, and recommended repairs.

### Preview and thumbnail service

- Isolated 3D preview scene.
- Orbit controls.
- Standard lighting profiles.
- Bounds and scale ruler.
- Material slots.
- Skeleton overlay.
- LOD preview.
- Collision overlay.
- Thumbnail generation.

## AI tools

- `asset.search`
- `asset.get`
- `asset.getDependencies`
- `asset.getUsages`
- `asset.preview`
- `asset.import`
- `asset.validate`
- `asset.createDerivative`
- `asset.requestDelete`

## Tests

- Import static GLB.
- Import rigged GLB.
- Import animated GLB.
- Detect malformed buffer.
- Reject external path traversal.
- Detect duplicate checksum.
- Preserve provenance after rename.
- Save/reload/restart.
- Place imported asset in real scene.

## Exit gate

A real GLB can be staged, inspected, normalized, validated, approved, placed, saved, reloaded, reopened after restart, and queried by stable ID without lost materials or provenance.

## Non-goals

- No online marketplace yet.
- No AI reconstruction yet.
- No automatic rigging yet.

---

# v0.7 — Provider Framework, Integrations, and Job Center

## Objective

Create one optional, replaceable provider and worker architecture before connecting external catalogs or model-generation services.

## Core implementation

### Provider SDK

Capabilities:

- Asset search.
- Asset download.
- Text-to-image.
- Image-to-3D.
- Text-to-3D.
- Retexture.
- Remesh.
- Rigging.
- Animation library.
- Animation generation.

States:

- Connected.
- Disconnected.
- Unavailable.
- Installing.
- Updating.
- Degraded.
- Failed.

Every provider exposes:

- Settings schema.
- Status.
- Version.
- Backend.
- Hardware requirements.
- Health check.
- Connect/disconnect.
- Repair.
- Logs.

### Shared job system

Jobs contain:

- ID.
- Provider.
- Operation.
- Inputs.
- Prompt.
- Settings.
- Stage.
- Progress.
- Logs.
- Warnings.
- Errors.
- Outputs.
- Timing.
- Cancellation.
- Validation.
- Retry eligibility.
- Credit/compute cost.

Long-running jobs persist across panel changes and recover after restart when the provider supports it.

### Local worker protocol

- Versioned protocol.
- Health endpoint.
- Capability report.
- Hardware report.
- Dependency report.
- Queue.
- Progress events.
- Cancellation.
- Timeout.
- Crash recovery.
- Output isolation.
- Memory and concurrency limits.

### Secret storage

- Operating-system credential store abstraction.
- No keys in project files, source, logs, manifests, or exports.
- Disconnect/revoke/replace controls.
- Paid-operation policies and explicit confirmation.

### Setup and integrations UI

- Skippable first-launch Asset and AI Setup.
- Settings → Integrations.
- Provider cards.
- Install/connect/test/repair/update/remove.
- Cache location.
- Disk usage.
- Export/import non-secret settings.

## AI tools

- `provider.list`
- `provider.getStatus`
- `provider.healthCheck`
- `provider.install`
- `provider.repair`
- `job.list`
- `job.get`
- `job.cancel`
- `job.retry`

## Tests

- Offline startup.
- Provider timeout.
- Broken provider isolation.
- Worker crash.
- Cancelled job.
- Restart recovery.
- Secret-exclusion scan.
- CPU/backend reporting.

## Exit gate

A failing provider cannot break the editor, jobs remain responsive and cancellable, settings persist, and provider secrets never enter project or exported data.

---

# v0.8 — Free Asset Marketplace and Curated Libraries

## Objective

Connect free and CC0 catalogs to the canonical asset pipeline without turning the marketplace into a web wrapper or second asset database.

## Providers

- Poly Haven.
- ambientCG.
- Curated Kenney packs.
- Curated Quaternius packs.
- Quaternius Universal Animation Library metadata.

## Core implementation

### Unified marketplace result

Normalize:

- Name.
- Provider.
- Preview.
- Category.
- Description.
- License.
- Creator.
- Available formats.
- Resolutions.
- File sizes.
- PBR maps.
- Rig status.
- Animation metadata.
- Local/downloaded status.

### Marketplace browser

- Search.
- Semantic search.
- Provider filters.
- License filters.
- Asset-category filters.
- Rig/animation compatibility.
- Polygon range.
- Texture resolution.
- PBR availability.
- LOD/collision availability.
- Local/remote.
- Validated/unvalidated.
- Grid/list views.
- Favorites.
- Downloads.

### Import flow

```text
Search → Preview → License → Download to staging → Validate → Import → Thumbnail → Place
```

### Metadata caching

- Cache provider catalogs.
- Refresh incrementally.
- Clear metadata separately from imported assets.
- Preserve provider IDs and source links.

## AI tools

- `market.search`
- `market.getDetails`
- `market.download`
- `market.findCompatibleAnimation`
- `market.findStyleMatch`

## Tests

For each provider:

- Real search.
- Real preview metadata.
- License visibility.
- Selective download.
- Validation.
- Import.
- Scene placement.
- Restart persistence.

## Exit gate

At least one real asset from each enabled source passes search-to-scene placement with intact license and provenance.

---

# v0.9 — Recipe Core and Production Surface Studio

## Objective

Introduce authoritative recipe assets and expand the current material editor into one production Surface Studio.

## Recipe types introduced

- Surface Recipe.
- Asset Recipe.
- Assembly Recipe base.

## Surface Studio

### Inputs

- Natural language.
- Negative constraints.
- Imported image.
- Clipboard image.
- Existing material.
- Generated image.
- Multiple references.
- Photogrammetry set.
- Marketplace material.

### Simple mode

- Type.
- Scale.
- Rotation.
- Offset.
- Roughness.
- Metallic.
- Normal/AO/height strengths.
- Dirt.
- Moss.
- Wetness.
- Snow.
- Damage.
- Color variation.
- Detail.

### Advanced graph

- Texture/noise/color nodes.
- Height blending.
- Slope and world masks.
- Vertex colors.
- Curvature/cavity/edge masks.
- Ground/water contact.
- Sun/shade/wind exposure.
- Path/structure distance.
- Weather/season/gameplay state.
- Layering.

### Production texture tools

- Seam repair.
- Offset preview.
- Clone/heal.
- Normal reconstruction and inversion detection.
- Roughness/metallic range edits.
- Height cleanup.
- Color-space validation.
- Resolution matching.
- Channel packing.
- Mips.
- Compression.
- Detail maps.
- Triplanar/world projection.
- UV selection.
- Texture arrays.
- Material instances.
- Compilation cache.

### Trim/atlas/decal foundation

- Trim-sheet regions.
- Texel density.
- UV snapping.
- Atlas packing and occupancy.
- First-class decal records and projection validation.

## AI tools

- `surface.create`
- `surface.createVariant`
- `surface.preview`
- `surface.validate`
- `surface.apply`
- `surface.repairMaps`
- `surface.compile`

## Tests

- Real imported PBR set.
- Generated local material.
- Seam repair.
- Variant isolation.
- Moss/wet/snow masks.
- Real-world scale.
- Save/reload/restart.
- Runtime/build consistency.

## Exit gate

One material passes description/import through repair, layered masks, real-scene preview, variant creation, persistence, restart, and test-runtime inclusion.

---

# v0.10 — Terrain, Paths, Foliage, and Biome Foundation

## Objective

Make terrain surfaces, paths, structures, vegetation, wind, weather, and performance rules one connected world-authoring system.

## Terrain

- Height queries.
- Normals and surface types.
- Non-destructive sculpt layers.
- Procedural generation.
- Material layers.
- Holes.
- Collision.
- Region regeneration.
- Streaming chunks.

## Paths

- Editable splines.
- Terrain-conforming default mode.
- Width/shoulder/blend masks.
- Intersections and branches.
- Entrance/bridge anchors.
- Vegetation masks.
- Collision/navigation updates.
- Explicit construction modes for trenches, embankments, stairs, tunnels, bridges.

## Foliage assets

- Species.
- Families.
- Mesh variants.
- Growth/dead/fallen/seasonal states.
- Wind/collision/LOD/impostor profiles.
- Biome tags.

## Placement

- Blue noise.
- Poisson disc.
- Clusters/groves/edge bands/clearings.
- Parent-child ecology.
- Deterministic seeds.
- Terrain, moisture, sun, shade, water, path, structure, gameplay, navigation queries.

## Foliage masks

- Hard exclusion.
- Soft road reduction.
- Edge encroachment.
- Maintenance state.
- Sightline, doorway, combat, spawn, navigation, shoreline clearances.

## World wind and environmental states

- Authoritative wind service.
- Species response profiles.
- Seasons.
- Wetness.
- Snow/frost.
- Drought/burn/wind damage.

## Biome Studio foundation

- Climate.
- Surfaces.
- Foliage.
- Placement.
- Environment.
- Gameplay.
- Performance.
- Region-only preview.

## AI tools

- `foliage.createSpecies`
- `foliage.createFamily`
- `foliage.createBiome`
- `foliage.previewRegion`
- `foliage.paintDensity`
- `foliage.paintExclusion`
- `foliage.regenerateRegion`
- `foliage.validateRegion`

## Tests

- Forest biome.
- Road and doorway preservation.
- Navigation clearance.
- Deterministic regeneration.
- Wind/weather/season changes.
- Streaming.
- Quality profiles.
- Floating/buried/repetition validators.

## Exit gate

A real forest biome creates canopy, understory, ground cover, rocks, and debris while preserving roads, structures, navigation, sightlines, deterministic seeds, performance budgets, and save/reload.

---

# v0.11 — Production Physics, Navigation, Modular Kits, and Assemblies

## Objective

Provide reliable spatial validation and construction systems required for AI placement and authored gameplay spaces.

## Physics

- Static/dynamic/kinematic bodies.
- Box/sphere/capsule/convex/compound/mesh colliders.
- Layers and masks.
- Triggers.
- Ray/shape casts.
- Continuous collision.
- Joints.
- Sleeping.
- Fixed timestep.
- Debug overlays.

## Character controller

- Capsule movement.
- Ground detection.
- Move-and-slide.
- Slopes and steps.
- Jump/crouch.
- Moving platforms.
- Collision recovery.
- First/third-person options.

## Navigation

- Navmesh generation.
- Region rebuilds.
- Agent profiles.
- Dynamic obstacles.
- Off-mesh links.
- Door/bridge links.
- Path and clearance queries.

## Modular Kit Recipe

- Sockets.
- Grid/surface/vertex snapping.
- Compatible neighbors.
- Corners.
- Doors/windows.
- Roofs.
- Stairs.
- Foundations.
- Material rules.
- Collision/navigation/doorway validation.

## Assembly Recipe

- Hierarchical reusable authored objects.
- Per-instance overrides.
- Dependency validation.
- Source updates with diff and protected overrides.

## AI tools

- `scene.raycast`
- `scene.sweep`
- `scene.overlap`
- `scene.findNavigationPath`
- `scene.validatePlacement`
- `asset.createKit`
- `asset.createAssembly`
- `building.preview`
- `building.commit`

## Tests

- Character route across terrain/path/stairs/doors/bridges.
- Building assembly from real kit.
- Doorway clearance.
- Navigation and collision.
- Assembly save/reload.

## Exit gate

A two-story modular building can be previewed, validated, assembled, traversed, saved, reloaded, and modified without broken sockets, doors, collision, or navigation.

---

# v0.12 — Local Image-to-3D and Mesh Processing

## Objective

Turn reference images into validated canonical assets through isolated, hardware-aware workers.

## Initial provider

- TripoSR local worker.

## Experimental providers

- SPAR3D.
- Stable Fast 3D.
- Remote/self-hosted compatible worker.

## Pipeline

- Generation brief.
- Imported/generated references.
- Background removal.
- Crop/recenter/mask/exposure/edge cleanup.
- Reconstruction.
- Topology analysis.
- Cleanup/remesh.
- UV and PBR processing.
- Scale/axis/pivot.
- Collision.
- LODs.
- Validation.
- Asset library.

## Hardware handling

- Detect actual backend.
- AMD/CPU/remote/unsupported reporting.
- No claimed GPU support without completed inference.
- Memory/concurrency controls.

## AI tools

- `generation.createBrief`
- `generation.submit`
- `generation.cancel`
- `mesh.analyze`
- `mesh.repair`
- `mesh.generateCollision`
- `mesh.generateLods`

## Tests

- Known health-check image.
- CPU fallback.
- Worker cancellation.
- Worker crash recovery.
- Real generated mesh placement.

## Exit gate

A real image produces a parseable, processed, validated asset with materials, collision, two LODs, correct scale/orientation, and stable scene placement.

---

# v0.13 — Character, Rigging, and Retarget Foundations

## Objective

Create production character assets without overwriting source meshes or accepting broken rigs.

## UniRig worker

- Suitability classification.
- Topology/symmetry analysis.
- Skeleton generation.
- Skin weighting.
- Validation.
- Canonical humanoid retarget profile.
- Multi-motion preview.

## Character asset recipe

- Original mesh.
- Rigged derivative.
- Skeleton.
- Skin weights.
- Retarget profile.
- Collider/ragdoll profile.
- Sockets.
- Animation compatibility.
- Validation.

## Validation

- Hierarchy.
- Bone bounds.
- Missing/disconnected bones.
- Weight normalization.
- Unweighted/excessively influenced vertices.
- Collapsing joints.
- Twisted limbs.
- Root placement.
- Symmetry.
- Scale.

## AI tools

- `rig.analyzeSuitability`
- `rig.generate`
- `rig.validate`
- `rig.createRetargetProfile`
- `rig.previewMotions`

## Tests

- Real unrigged humanoid.
- Three test animations.
- Front/side/rear/close/wide/player views.
- Save/reload/restart.

## Exit gate

A suitable character is rigged as a derivative, passes weight/skeleton validation, plays three motions without severe collapse or twisting, and remains editable after restart.

---

# v0.14 — Production Animation Workspace

## Objective

Provide editable animation authoring, retargeting, IK, constraints, and runtime state systems rather than simple clip playback.

## Workspace

- Skeleton tree.
- Bone selection.
- Pose mode.
- Timeline.
- Dope sheet.
- Curve editor.
- Keyframes.
- Layers/additive layers.
- Masks.
- Clip trim/split/loop.
- Events.
- Contact tracks.
- Root motion.
- Non-destructive takes.
- Undo/redo.

## IK and constraints

- Full body.
- Limb/foot/hand.
- Look-at/aim.
- Parent/position/rotation.
- Joint limits.
- Motion warping.

## Animation library

- Quaternius metadata.
- Canonical skeleton.
- Retarget maps.
- Root-motion classification.
- Contact data.
- User-correctable bone mapping.

## Runtime

- Animation groups/clips.
- Blend trees.
- State machines.
- Transition rules.
- Layered playback.

## AI tools

- `animation.search`
- `animation.retarget`
- `animation.createTake`
- `animation.addIK`
- `animation.addEvent`
- `animation.validate`

## Tests

- Import Quaternius clip.
- Retarget to another character.
- Edit curve/key.
- Add IK and event.
- Root-motion preview.
- Save as new clip.
- Restart persistence.

## Exit gate

A retargeted clip remains editable, grounded, event-capable, and usable after restart with no severe foot slip, twisting, or lost references.

---

# v0.15 — Scene Intelligence, Style DNA, and Design-Intent Locking

## Objective

Give humans and AI a typed understanding of actual 3D relationships and protect approved work.

## Stable entity descriptors

- GUID.
- Semantic type.
- Hierarchy.
- Local/world transforms.
- Bounds.
- Mesh/materials.
- Collider.
- Navigation role.
- Sockets.
- Affordances.
- Skeleton.
- Animations.
- Tags.

## Scene queries

- Entity/children/hierarchy.
- World bounds.
- Nearby entities.
- Raycast/sweep/overlap.
- Terrain sample/ground point.
- Navigation path.
- Placement preview and validation.
- Socket/affordance compatibility.

## Style DNA

- Texel density.
- Palette.
- Roughness/metallic ranges.
- Geometry density.
- Shape/edge language.
- Weathering.
- Foliage density/proportions.
- Scale language.
- Lighting targets.
- Material complexity.
- Performance budgets.

## Protected work

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
- Paths.

## AI permission modes

- Observe.
- Suggest.
- Preview.
- Apply.
- Restricted destructive.

## Tests

- Query actual object relationships.
- Detect protected intersection.
- Preview placement.
- Reject navigation/collision conflict.
- Undo commit.
- Style warning without destructive auto-change.

## Exit gate

The AI can inspect and preview a placement using stable scene data, report conflicts accurately, preserve protected work, and commit/undo through the same action used by the editor UI.

---

# v0.16 — AI Orchestration and Scene-Aware Interactions

## Objective

Turn natural-language requests into deterministic plans, previews, validation, correction loops, and auditable commits.

## Intent compiler

Produces:

- Desired result.
- Affected systems.
- Stable targets.
- Dependencies.
- Protected work.
- Acceptance criteria.
- Required evidence.
- Reload scope.

## Task graph

- Dependency order.
- Specialized worker/agent assignment.
- Transaction boundaries.
- Tests.
- Retry/rollback.

## Automatic inspection

- Affected bounds.
- Player approaches.
- Standard views.
- Streaming/physics/lighting stabilization.
- Color/depth/normal/object-ID captures.
- Collision/navigation/mask overlays.
- Baseline comparison.

## Interaction workflows

- Walk to.
- Reach/grip.
- Look/aim.
- Open/use.
- Sit.
- Climb.
- Attack.
- Pick up/equip.

## Example acceptance workflow

NPC walks to chest, aligns, reaches handle with IK, opens around authored hinge, preserves feet, avoids collision, saves an editable animation take, and rolls back cleanly.

## Exit gate

A complete scene-aware interaction passes navigation, motion warping, IK, collision, animation, evidence, approval, and undo without guessed coordinates.

---

# v0.17 — Gameplay Framework and Reusable Game Systems

## Objective

Allow AI and humans to create reusable gameplay systems through registered components and contracts rather than scattered scripts.

## Core systems

- Component registry.
- Script behavior API.
- Typed events.
- Variables/data assets.
- Input actions.
- Game-state service.
- Save/load registration.
- Prefab/assembly runtime.
- Interaction framework.
- Spawn/checkpoint systems.

## Gameplay modules

- Health/damage.
- Abilities.
- Inventory/equipment.
- Combat foundation.
- Quests.
- Dialogue.
- AI state graphs/behavior trees.
- Triggers.
- Camera systems.

## System contract compiler

Checks:

- Ownership.
- Required capabilities.
- Duplicate authorities.
- Initialization/shutdown.
- Save/load.
- Multiplayer readiness marker.
- Tests.
- Build inclusion.

## AI tools

- `system.create`
- `system.inspectContract`
- `system.registerDependency`
- `component.add`
- `behavior.create`
- `gameplay.preview`
- `gameplay.validate`

## Exit gate

A reusable gameplay system can be generated, attached, configured, saved, tested, reused in another project, and exported without direct undocumented file patching.

---

# v0.18 — Audio, VFX, UI, Environment, and Cinematics

## Objective

Complete the player-facing authoring stack and environmental feedback systems.

## Audio

- Asset import/generation hooks.
- Spatial sources.
- Attenuation.
- Mix buses.
- Reverb zones.
- Surface footsteps.
- Randomization/concurrency.
- Adaptive music.
- Ambient zones.

## VFX

- Particles.
- Decals.
- Trails/beams.
- Fire/smoke.
- Weather.
- Combat impacts.
- Material reactions.
- Performance budgets.

## UI

- Canvas editor.
- Responsive layout.
- Input navigation.
- Accessibility.
- Localization.
- HUD/menu templates.
- Data binding.
- UI animation.

## Environment

- Physical day/night sunlight.
- Atmosphere/sky.
- Clouds.
- Weather.
- Wind.
- Wetness/snow.
- Water.
- Fog/lightning.
- Environment audio.

## Cinematics

- Sequencer.
- Camera tracks.
- Animation/audio/event tracks.
- Dialogue.
- Lighting.
- Scene transitions.
- Skipping and state restoration.

## Exit gate

A small playable scene includes responsive UI, spatial audio, environmental VFX, physical time/weather lighting, and a cinematic sequence that survives save/reload and export.

---

# v0.19 — Standalone Game Build, Export, and Launch Validation

## Objective

Export games that run independently of OmniForge, Node, a browser, Codex, or development tools.

## Build profiles

- Quick Playtest.
- Validated Test.
- Performance.
- Release Candidate.

## Pipeline

1. Save authoritative project.
2. Validate system registrations.
3. Validate assets and licenses.
4. Resolve dependencies.
5. Compile shaders/material variants.
6. Bake required navigation/physics/streaming data.
7. Run required tests.
8. Package runtime and assets.
9. Write named folder to Downloads.
10. Launch executable.
11. Confirm startup scene.
12. Confirm input, shaders, assets, audio, and save access.
13. Capture logs and screenshot.
14. Record build.

## Build Center

- Profiles.
- Progress.
- Logs.
- Errors.
- Open folder.
- Launch.
- Compare builds.
- Roll back to last validated build.

## Exit gate

The user double-clicks the exported executable, reaches the intended scene, moves, interacts, saves, closes, reopens, and loads without OmniForge installed or running.

---

# v0.20 — Production Scale, Performance, Multiplayer, and Release Operations

## Objective

Scale OmniForge projects to large worlds, multiple quality targets, collaborative production, and optional multiplayer.

## Performance Center

- CPU/GPU frame profiler.
- Memory profiler.
- Draw calls.
- Texture memory.
- Overdraw.
- Physics.
- Navigation.
- AI.
- Audio.
- Streaming.
- Shader variants.
- Automated budget regressions.

## Large worlds

- Region/world partition.
- Chunk streaming.
- Origin rebasing.
- Hierarchical LOD.
- Background loading.
- Streaming budgets.
- Regional regeneration.
- Deterministic procedural generation.
- Build partitioning.

## Collaboration

- Authoritative project revisions.
- Change transactions.
- Merge-aware asset/scene records.
- Locks for non-mergeable assets.
- Review and approval queues.
- Audit history.
- CI validation hooks.

## Multiplayer

- Authority model.
- Replication declarations.
- Prediction/reconciliation.
- Networked physics.
- RPC/event security.
- Multiplayer save model.
- Dedicated server target.
- Latency and packet-loss simulation.
- Multiplayer tests.

## Release operations

- Platform profiles.
- Signing/notarization hooks.
- Crash reports.
- Patch manifests.
- Content updates.
- Build provenance.
- Release candidate comparison.

## Exit gate

A representative large-world project meets declared budgets, streams deterministically, exports a release candidate, passes regression gates, and—when multiplayer is enabled—supports a tested authoritative session under simulated network conditions.

---


# v0.21 — Adaptive Optimization and Low-End Hardware Certification

## Objective

Turn v0.20 performance telemetry into an automatic, non-destructive optimization and certification loop, with a GeForce GTX 1650-class system as the first demanding low-end reference target.

## Core implementation

- Hardware detection and real calibration benchmarks.
- Versioned target-hardware Performance Profiles.
- Repeatable standalone-build Performance Routes.
- CPU/GPU/VRAM/RAM/streaming/stutter telemetry.
- World-space performance heatmaps.
- Evidence-based bottleneck classification.
- Reversible optimization plans and platform derivatives.
- Dynamic resolution and upscaling policies.
- Texture, material, shader, mesh, LOD, HLOD, instancing, shadow, foliage, terrain, VFX, physics, AI, animation, audio, and streaming optimization passes.
- Quality guardrails tied to protected work and Style DNA.
- GTX 1650 Balanced 60, Quality 30, Competitive 60, and Compatibility profiles.
- Exported-build certification and honest Unmet Target reports.

## AI tools

- `performance.detectHardware`
- `performance.runCalibration`
- `performance.captureBaseline`
- `performance.analyzeCapture`
- `performance.findHotspots`
- `performance.proposeOptimizations`
- `performance.previewPlan`
- `performance.applyPlan`
- `performance.revertPlan`
- `performance.compareCaptures`
- `performance.certifyBuild`

## Exit gate

A representative game must be exported and tested on an actual GTX 1650-class machine. The optimized build must improve measurable frame-time stability and memory behavior while preserving gameplay, collision, navigation, saves, protected visuals, and reversibility. If the selected target cannot be met, OmniForge must produce an evidence-backed report describing the remaining bottleneck and required tradeoffs rather than claiming success.

Full design: `docs/AUTO_OPTIMIZATION_V021.md`.

---

# Cross-release gates

Every release must pass:

## Authority gate

- Correct source package/repository.
- Correct schema.
- No duplicate owner.
- Migration included.

## UX gate

- Visible controls work.
- Empty/loading/error/offline states exist.
- No placeholder buttons.
- Keyboard and accessibility paths remain usable.

## Persistence gate

- Save/reload.
- Application restart.
- Missing dependency handling.
- Recovery after interrupted write.

## AI gate

- Typed tools.
- Permission checks.
- Preview.
- Validation.
- Audit.
- Undo.
- No false “applied” status.

## Runtime gate

- Real latest build.
- Actual workflow.
- Collision/movement where relevant.
- Connected systems retested.

## Visual gate

- Close.
- Wide.
- Front/side/rear.
- Elevated.
- Player view.
- Relevant debug overlays.
- No unresolved required defect visible.

## Performance gate

- Declared CPU/GPU/memory/draw/instance/texture budgets.
- Stress test.
- Editor responsiveness.

## Export gate

- Required content packaged.
- Standalone executable launched.
- Startup/input/assets/save verified.

# Immediate next production sequence

1. Complete direct Windows v0.5.1 desktop smoke test and visual inspection.
2. Repair any Windows-only lifecycle or UI failures.
3. Begin v0.6 canonical asset graph and GLB import.
4. Build v0.7 provider/job architecture before connecting catalogs.
5. Use v0.9 Surface Recipes as the first recipe implementation.
6. Add terrain/foliage/biome recipes in v0.10.
7. Delay autonomous building and interaction workflows until physics, navigation, kits, animation, and Scene Intelligence exist.
8. Delay multiplayer until gameplay contracts and exported standalone builds are stable.
