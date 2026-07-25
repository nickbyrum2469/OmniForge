# Phase 1A — Authoritative RenderGraph and Frame Resources

## Purpose

Phase 1A replaces the implicit monolithic frame sequence with one explicit, inspectable RenderGraph while preserving the approved Phase 0 rendered appearance.

This phase is infrastructure. It deliberately does not introduce linear HDR, GGX PBR, global illumination, cascaded shadows, production volumetric clouds, or water rendering. Those systems depend on this graph and will be implemented in later gated phases.

## Starting authority

- Repository: `nickbyrum2469/OmniForge`
- Starting branch: `phase0/celestial-authority-stabilization`
- Starting commit: `6bde2ebd4cc80abdbf99cc39869f4cef02fe07a5`
- Phase branch: `phase1/linear-hdr-rendergraph-lighting-core`

The Phase 0 Sun/Moon proxy authority, smooth celestial interpolation, editor readability behavior, viewport stability fixes, terrain/path foundation, asset registry, and Surface Recipe authority must remain intact.

## Problems being corrected

Before Phase 1A, `Renderer3D.render()` directly performed every operation in one sequence:

1. resize;
2. camera and lighting preparation;
3. shadow rendering;
4. default-framebuffer clear;
5. sky rendering;
6. terrain/object rendering;
7. foliage rendering;
8. grid, paths, and selection overlays;
9. WebGL diagnostics.

The ordering worked, but it had no formal pass contract, no declared resource relationships, no per-pass timings, no stable frame-resource revision, and no safe suspension path for WebGL context loss. Adding HDR, temporal reconstruction, reflections, water, clouds, and GI directly to that method would create an unmaintainable renderer.

## Authoritative architecture

```text
Renderer3D
├── RenderCapabilities
├── FrameResources
├── RenderGraph
│   ├── shadow
│   ├── environment
│   ├── opaque-world
│   ├── editor-overlays
│   └── diagnostics
└── FrameContext
```

### RenderCapabilities

Detected from the actual WebGL2 context:

- floating-point color-buffer support;
- floating-point linear filtering;
- GPU timestamp-query support;
- maximum texture size;
- maximum cubemap size;
- maximum color attachments;
- maximum draw buffers;
- maximum samples;
- combined texture units;
- renderer/vendor when the browser exposes them;
- context-recovery mode.

Capabilities describe what the active machine can do. They do not independently enable visual features in Phase 1A.

### FrameResources

The frame-resource authority owns:

- canvas physical width and height;
- device-pixel ratio;
- resize revision;
- context generation;
- context-lost state;
- externally owned resources such as the default framebuffer and shadow resources.

Later phases will add HDR scene color, depth, normal, velocity, history, cloud, reflection, and GI resources through this same authority.

### RenderGraph

Every pass declares:

- stable name;
- dependency passes;
- resources read;
- resources written;
- enabled condition;
- critical/noncritical behavior;
- CPU/GPU timing category;
- execute function.

The graph validates missing dependencies, dependency cycles, and resources read before import or production.

### FrameContext

Each frame receives one prepared context containing:

- scene;
- camera;
- selected object;
- editor mode;
- view-projection matrix;
- authoritative lights;
- authoritative environment snapshot;
- shadow matrix;
- foliage grouping;
- frame-resource snapshot;
- pass diagnostics.

Passes may use the context but must not replace the authoritative scene or environment state.

## Pass contracts

### `shadow`

Reads:

- scene;
- camera;
- lighting.

Writes:

- shadow-map.

Disabled when the authoritative Sun has shadows disabled.

### `environment`

Reads:

- camera;
- environment;
- default framebuffer.

Writes:

- scene-color;
- scene-depth.

It binds and clears the default framebuffer, renders the existing renderer-owned sky, and restores the depth state required by world geometry. Phase 1A preserves the current sky shader and display mapping.

### `opaque-world`

Reads:

- scene;
- camera;
- lighting;
- environment;
- shadow-map;
- scene-color;
- scene-depth.

Writes:

- scene-color;
- scene-depth.

It renders terrain, scene objects, decals, imported models, and foliage using the existing material shader.

### `editor-overlays`

Reads:

- scene-color;
- scene-depth;
- scene;
- camera.

Writes:

- scene-color.

It renders the grid, path overlays, selected-object outline, and editor-only X-ray path state.

### `diagnostics`

Reads:

- scene-color.

Writes:

- frame-telemetry.

It samples WebGL errors only when diagnostics are enabled and records the frame graph report.

## Context loss and recovery

On `webglcontextlost`:

1. prevent the browser default;
2. mark frame resources lost;
3. suspend the RenderGraph;
4. stop submitting rendering commands;
5. report structured diagnostics.

On `webglcontextrestored`:

1. mark a new context generation;
2. report restoration;
3. reload the editor from its authoritative persisted project state.

Phase 1A uses authoritative-state reload rather than pretending all GPU objects can safely survive restoration. In-place GPU resource reconstruction may replace this policy after all resource types are graph-owned.

## Performance telemetry

Every enabled pass records CPU duration every frame.

When `EXT_disjoint_timer_query_webgl2` is available, the graph samples GPU duration at a bounded interval. Missing GPU timing support never disables rendering.

The diagnostic snapshot contains:

- compiled pass order;
- compile revision;
- frame index;
- resource revisions;
- pass status;
- pass CPU milliseconds;
- latest sampled GPU milliseconds;
- errors;
- total graph CPU time;
- context generation and resize revision.

## Required automated gates

### Pure RenderGraph tests

- deterministic dependency ordering;
- cycle rejection;
- missing dependency rejection;
- read-before-write rejection;
- imported-resource support;
- disabled pass reporting;
- optional-pass failure containment;
- critical-pass failure propagation;
- CPU timing and diagnostic snapshot;
- suspend/resume behavior.

### FrameResources tests

- physical canvas sizing;
- device-pixel-ratio cap;
- no revision change when size is unchanged;
- revision increment after resize;
- external-resource registration;
- context-loss state;
- context-generation increment after restoration;
- capability fallback without optional extensions.

### Renderer source-contract tests

- imports RenderGraph and FrameResources;
- stable pass names exist exactly once;
- monolithic operations are moved into pass methods;
- graph execution owns the frame;
- context-loss events suspend rendering;
- context restoration reloads authoritative state;
- Phase 0 celestial interpolation remains connected;
- existing mesh and sky display mapping remain unchanged in Phase 1A.

### Existing regression suite

All existing editor, viewport, celestial, terrain, path, world, asset, desktop, and verification tests must remain green.

## Windows acceptance route

1. Build the native Windows package from the exact branch commit.
2. Verify packaged `source-commit` equals branch HEAD.
3. Launch the package normally.
4. Open the same project used for Phase 0 evidence.
5. Confirm one Sun and one Moon.
6. Confirm smooth celestial movement.
7. Navigate continuously for at least three minutes.
8. Resize the window repeatedly, including maximized and restored states.
9. Toggle grid and splines.
10. Select terrain, path, ordinary objects, Sun, and Moon.
11. Run noon, sunset, night, fog, and overcast reference views.
12. Confirm no visual regression from the accepted Phase 0 baseline.
13. Enable diagnostics and inspect pass order and timings.
14. Confirm no repeating WebGL errors or runaway resource revisions.
15. Save, close cleanly, reopen, and confirm state persistence.

## Exit gate

Phase 1A passes only when:

- every ordinary frame is submitted through the compiled RenderGraph;
- pass dependencies and resource declarations validate;
- canvas resizing updates one frame-resource authority;
- context loss suspends rendering without corrupting project state;
- context restoration returns through authoritative-state reload;
- per-pass CPU timings are available;
- GPU timings appear when supported;
- the exact Windows package launches and passes the acceptance route;
- accepted Phase 0 appearance and behavior remain intact.

## Explicit non-goals

Phase 1A does not claim:

- linear HDR scene color;
- one final tone-map pass;
- physically based GGX materials;
- image-based lighting;
- reflection probes;
- global illumination;
- cascaded shadow maps;
- clustered local lights;
- motion vectors or TAA;
- production temporal volumetric clouds;
- water rendering;
- hardware ray tracing.

The immediate next phase after acceptance is **Phase 1B — Linear HDR and one authoritative display transform**.
