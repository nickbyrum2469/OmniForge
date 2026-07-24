# OmniForge v0.21 — Adaptive Optimization and Low-End Hardware Certification

## Product objective

OmniForge v0.21 adds a non-destructive, evidence-driven optimization system that can analyze a project, benchmark the actual target PC, classify bottlenecks, propose reversible changes, build and launch the game, measure the result, and repeat until the selected performance target is met or the engine can explain exactly why it is not currently achievable.

The primary reference target is a **GeForce GTX 1650-class system with approximately 4 GB of dedicated graphics memory**, while the architecture remains hardware-driven rather than hardwired to one GPU name. Laptop variants, different memory types, CPUs, RAM amounts, display resolutions, thermal limits, and drivers can behave differently, so the final profile is calibrated by a real benchmark on the user's machine.

"Runs perfectly" must be represented by measurable targets. OmniForge should support at least these presets:

- **GTX 1650 Balanced 60** — targets smooth 60 FPS gameplay with dynamic resolution and restrained effects.
- **GTX 1650 Quality 30** — targets stable 30 FPS with higher visual quality.
- **Low-End Competitive 60** — prioritizes latency, clarity, and consistent frame time.
- **Emergency Compatibility** — preserves gameplay on weaker or thermally constrained machines with aggressive reductions.

The system must never claim success from an editor estimate alone. The exported game must run on the target machine and provide real frame-time, memory, loading, and stutter evidence.

---

## 1. Cross-release performance metadata

Auto-optimization cannot be bolted on at the end. Earlier OmniForge systems must emit performance metadata that v0.21 can reason about.

### v0.9 Surface Studio

Every Surface Recipe and compiled material should record:

- Shader feature count.
- Texture count and dimensions.
- Estimated resident texture memory.
- Sampler count.
- Transparency and overdraw risk.
- Parallax or displacement cost.
- Triplanar/world-projection cost.
- Decal compatibility and batching cost.
- Mobile/low-end fallback material.
- Compiled shader variants actually used.

### v0.10 Terrain, foliage, and biomes

Record:

- Terrain chunk dimensions and resolution.
- Active terrain layers.
- Foliage instance count by species and LOD.
- Shadow-casting instance count.
- Wind quality tier.
- Impostor availability.
- Streaming distance.
- Density and overdraw estimates.
- Region-level CPU/GPU/memory budgets.

### v0.11 Physics and navigation

Record:

- Active rigid-body count.
- Dynamic collider count and type.
- Triangle-collider usage.
- Fixed-timestep cost.
- Broadphase and contact counts.
- Navigation tile count.
- Agent and path-query frequency.

### v0.13–v0.14 Characters and animation

Record:

- Skinned vertex count.
- Bones per character.
- Active animation layers.
- IK and constraint cost.
- Update-distance tiers.
- Shadow and material cost.

### v0.17 Gameplay

Record:

- Per-system update frequency.
- AI agent count.
- Expensive script timings.
- Event volume.
- Save and streaming costs.

### v0.18 Audio, VFX, UI, and cinematics

Record:

- Particle count and overdraw.
- Active light count.
- Post-processing passes.
- Audio voice count.
- UI draw and layout cost.
- Cinematic quality overrides.

### v0.19–v0.20 Build and profiling

Provide:

- Standalone-build telemetry.
- CPU/GPU frame-time capture.
- VRAM and system-memory usage.
- Loading and streaming traces.
- Shader-compilation events.
- Stutter markers.
- Scene and region heatmaps.

---

## 2. Target Hardware Profiles

A Performance Profile is a versioned project asset, not a collection of unrelated settings.

```ts
interface PerformanceProfile {
  id: string;
  name: string;
  targetClass: string;

  targetResolution: { width: number; height: number };
  targetFrameRate: number;
  fallbackFrameRate: number;
  maximumFrameTimeMs: number;

  dynamicResolution: {
    enabled: boolean;
    minimumScale: number;
    maximumScale: number;
    recoverySpeed: number;
  };

  memory: {
    detectedDedicatedMemoryMb?: number;
    safeBudgetFraction: number;
    textureBudgetMb?: number;
    geometryBudgetMb?: number;
    streamingReserveMb?: number;
  };

  budgets: {
    drawCalls?: number;
    visibleTriangles?: number;
    shadowCasters?: number;
    activeLights?: number;
    particles?: number;
    foliageInstances?: number;
    physicsBodies?: number;
    audioVoices?: number;
  };

  qualityFloor: QualityGuardrails;
  systemOverrides: Record<string, unknown>;
  calibration: HardwareCalibrationReport;
}
```

The GTX 1650 profile starts from conservative defaults but replaces them with benchmark-derived limits whenever possible. Memory budgets should be calculated from detected dedicated memory and leave operating-system, driver, swap-chain, and transient-resource headroom.

---

## 3. Hardware detection and calibration

On first use, OmniForge should offer a guided hardware calibration.

Detect:

- GPU name and vendor.
- Dedicated and shared memory.
- Graphics API and feature level.
- Driver version.
- CPU model, core count, and logical threads.
- System RAM.
- Storage type and measured streaming throughput.
- Display resolution and refresh rate.
- Laptop power state where available.
- Thermal or clock throttling indicators where available.

Run short isolated tests for:

- Pixel and fill-rate pressure.
- Texture sampling and bandwidth.
- Geometry throughput.
- Skinning.
- Shadow rendering.
- Particle overdraw.
- Draw-call/CPU submission rate.
- Physics stepping.
- Streaming and decompression.
- Shader compilation.

The result becomes a local calibration record. OmniForge must report the backend and result actually observed, not assume performance from the GPU model name.

---

## 4. Automatic performance capture

The editor should maintain repeatable Performance Routes containing camera paths, player paths, combat encounters, loading boundaries, dense environment views, and stress events.

A capture records:

- Average, median, 95th-percentile, and 99th-percentile frame times.
- One-percent-low and minimum FPS with context.
- CPU main-thread time.
- GPU time.
- Render-thread time.
- VRAM and system-memory high-water marks.
- Draw calls, triangles, shader/material switches, and light count.
- Physics and AI time.
- Loading stalls and shader-compilation stalls.
- Streaming misses.
- Thermal/clock changes where available.
- Scene, region, and camera location for every spike.

The Performance Center should display a timeline and a world-space heatmap, allowing the user and AI to jump directly to problem locations.

---

## 5. Bottleneck classifier

OmniForge should classify each failure as one or more of:

- GPU shading/fill-rate bound.
- Geometry bound.
- Shadow bound.
- Texture bandwidth bound.
- VRAM pressure or thrashing.
- CPU submission/draw-call bound.
- Physics bound.
- AI/gameplay bound.
- Animation/skinning bound.
- Streaming or storage bound.
- Shader-compilation stutter.
- Garbage collection or allocation churn.
- Thermal or power constrained.

Recommendations must be linked to observed evidence. The AI should not suggest reducing textures when the actual bottleneck is CPU-side physics.

---

## 6. Non-destructive optimization passes

Every optimization creates a profile override or derivative. Approved source assets and authoring settings remain preserved.

### Resolution and presentation

- Dynamic resolution.
- Temporal or spatial upscaling where supported.
- Render-scale caps.
- Resolution-dependent post-processing.
- Optional frame-rate cap and pacing.
- Reduced editor-preview quality separate from game quality.

### Textures and materials

- Per-platform maximum texture size.
- Texture compression profiles.
- Mip generation and streaming.
- Channel packing.
- Texture-array and atlas opportunities.
- Removal of unused maps from the build derivative.
- Material-instance consolidation.
- Shader-feature stripping.
- Low-end Surface Recipe variants.
- Disable or reduce parallax, displacement, clear coat, transmission, and expensive layered masks by distance or profile.
- Preserve UI and gameplay-critical texture readability.

### Geometry

- LOD generation and validation.
- HLOD cluster creation.
- Impostors for distant assets.
- GPU instancing.
- Static mesh batching where safe.
- Occlusion-culling groups.
- Distance and screen-size culling.
- Skinned-mesh LODs and bone reduction.
- Never alter collision or interaction geometry without a separate validated operation.

### Shadows and lighting

- Shadow-map resolution.
- Cascade count and distance.
- Per-object shadow eligibility.
- Static/baked lighting derivatives where supported.
- Reduced update rates for distant or slow lights.
- Light count and overlap limits.
- Contact-shadow and ambient-occlusion quality tiers.
- Protected visual-composition exceptions.

### Terrain and foliage

- Terrain LOD and chunk size.
- Reduced distant terrain-layer complexity.
- Foliage density tiers.
- Shadow distance by species.
- Wind quality by distance.
- Impostor transition distances.
- Reduced transparent ground-cover overdraw.
- Chunk streaming and deterministic culling.
- Preserve roads, cover, sightlines, resources, and gameplay-significant foliage.

### VFX and post-processing

- Particle emission, lifetime, and maximum count.
- Screen-space overdraw limits.
- Lower-cost material variants.
- Reduced volumetric steps.
- Bloom, depth-of-field, motion blur, reflections, ambient occlusion, and fog tiers.
- Gameplay-critical effects maintain minimum readability.

### Physics, gameplay, animation, and audio

- Physics sleep thresholds and simulation-distance tiers.
- Simplified distant colliders.
- AI update scheduling and distance-based tick rates.
- Animation update tiers and skinning LODs.
- IK and constraint quality tiers.
- Audio voice and spatialization limits.
- Background simulation throttling.
- No change may alter required gameplay outcomes without explicit approval and regression tests.

### Streaming and loading

- Asset bundles/regions.
- Asynchronous loading.
- Prefetch routes.
- Memory-resident priority groups.
- Streaming reserve enforcement.
- Shader prewarming.
- Background decompression limits.

---

## 7. Optimization workflow

```text
Select GTX 1650 target
    ↓
Detect and calibrate actual PC
    ↓
Run baseline standalone build
    ↓
Capture repeatable performance routes
    ↓
Classify bottlenecks
    ↓
Generate ranked optimization proposal
    ↓
Preview visual and gameplay differences
    ↓
Apply reversible profile overrides/derivatives
    ↓
Build and launch again
    ↓
Compare performance and visual evidence
    ↓
Regress gameplay, collision, navigation, and protected views
    ↓
Commit, revise, or revert
```

The loop continues until the target passes or OmniForge produces an **Unmet Target Report** explaining the limiting systems and the quality/scope reductions required to continue.

---

## 8. Performance Center UI

Add a dedicated Performance Center with:

- Target hardware selector.
- Detected-hardware summary.
- Calibration status.
- Frame-rate and resolution target.
- Analyze Current Scene.
- Analyze Full Game Route.
- Optimize for GTX 1650.
- Preview Proposed Changes.
- Apply Selected Changes.
- Revert Optimization Pass.
- Before/after performance comparison.
- Before/after screenshots and clips.
- Visual-quality difference overlay.
- World-space hot-spot list and heatmap.
- CPU, GPU, VRAM, RAM, draw, texture, foliage, physics, AI, and streaming sections.
- Quality guardrails and protected systems.
- Exported-build certification status.

The default interface should explain impact in user-facing language, while an advanced view exposes raw budgets and timings.

---

## 9. Guarded AI tools

```ts
performance.listProfiles()
performance.detectHardware()
performance.runCalibration(profileId)
performance.createRoute(...)
performance.captureBaseline(...)
performance.analyzeCapture(captureId)
performance.findHotspots(captureId)
performance.proposeOptimizations(captureId, profileId)
performance.previewPlan(planId)
performance.applyPlan(planId)
performance.revertPlan(planId)
performance.compareCaptures(beforeId, afterId)
performance.certifyBuild(buildId, profileId)
performance.explainUnmetTarget(reportId)
```

All AI operations require:

- Evidence-backed reasoning.
- Preview.
- Quality-impact summary.
- Affected assets and systems.
- Validation plan.
- Undo record.
- Explicit approval for destructive or gameplay-altering changes.

---

## 10. Quality guardrails

The optimizer must respect:

- Protected objects, materials, paths, buildings, regions, and views.
- Minimum UI and text readability.
- Minimum gameplay-effect readability.
- Navigation and collision correctness.
- Doorway, road, combat-area, and spawn clearance.
- Character silhouette and animation quality.
- Maximum acceptable LOD popping.
- Art-direction Style DNA.
- License and provenance.
- User-selected systems that may never be downgraded.

The user may choose whether the optimizer prioritizes frame rate, image quality, latency, battery/power, or memory.

---

## 11. GTX 1650-class certification profiles

### Balanced 60

- Preferred target: 60 FPS.
- Uses dynamic resolution within an approved range.
- Moderate shadows and post-processing.
- Aggressive distant LOD, foliage, and effect scaling.
- Maintains gameplay readability and stable frame pacing.

### Quality 30

- Locked or paced 30 FPS target.
- Higher material, shadow, foliage, and post-processing quality.
- Uses remaining GPU headroom for visual stability rather than unstable peak FPS.

### Competitive 60

- Prioritizes latency and clarity.
- Restricts motion blur, depth of field, expensive volumetrics, and visual clutter.
- More aggressive CPU/AI and shadow budgeting.

### Compatibility

- Lower render-scale floor.
- Reduced shadows, effects, foliage, and texture residency.
- Stronger streaming and LOD behavior.
- Intended as a last-resort playable profile, not the default presentation.

---

## 12. Acceptance criteria

v0.21 cannot pass until a representative game is tested on an actual GTX 1650-class machine.

Required workflow:

1. Detect the target hardware correctly.
2. Run calibration and record the actual backend.
3. Export and launch a baseline standalone build.
4. Run repeatable traversal, combat, dense-environment, and streaming routes.
5. Capture CPU/GPU frame times, memory, stutter, and world locations.
6. Produce evidence-linked bottleneck classifications.
7. Generate a reversible optimization plan.
8. Preview visual changes from close, wide, side, rear, elevated, and player views.
9. Apply selected optimizations.
10. Export and launch the optimized build.
11. Re-run the identical routes.
12. Demonstrate improved frame-time stability and memory behavior.
13. Confirm collision, navigation, gameplay, saves, animation, and protected visuals remain correct.
14. Restart the game and verify the profile persists.
15. Revert the optimization pass and confirm the original state is recoverable.
16. If the target remains unmet, produce an honest report identifying the remaining bottleneck and required tradeoffs.

A single average-FPS number is not sufficient evidence. Frame pacing, percentile frame time, stutter, VRAM pressure, loading, and gameplay regressions must also pass.

---

## 13. Relationship to v0.20

v0.20 builds the broad profiler, large-world, collaboration, multiplayer, and release foundations. v0.21 turns that telemetry into an automated, target-hardware optimization and certification loop.

Performance instrumentation begins in earlier releases so that v0.21 does not need to reverse-engineer opaque systems at the end.

---

## Final constraint

No optimizer can make an arbitrarily expensive game run perfectly on low-end hardware without tradeoffs. OmniForge's job is to make those tradeoffs intelligent, measurable, reversible, visually inspected, and explicit—then push as far as the project's protected quality and gameplay rules allow.
