# OmniForge v0.7.1 Verification Record

## Requested work

Continue v0.7 Provider Framework and Job Center development, clean the overlapping Asset Workspace shown in the Windows screenshots, and repair the GLB importer that separated the imported car into incorrectly positioned parts.

## Root causes found

### Asset Workspace overlap

The Assets tab placed model import, model library, health report, material library, Surface Studio, and prefabs in one long column. Saved panel widths could also consume too much space at smaller desktop-window sizes.

### Exploded GLB hierarchy

The v0.6 canonical importer concatenated mesh primitives in local mesh coordinates but ignored glTF scene-node transforms. A vehicle assembled from separately translated, rotated, scaled, or nested nodes therefore collapsed into the wrong coordinate space. The renderer also treated the merged result as one material.

## Changes made

- Split Assets into focused Models, Surfaces, and Prefabs subviews.
- Added responsive wrapping and minimum viewport protections.
- Added dynamic layout fitting after restore and window resize.
- Applied active-scene node hierarchy transforms during canonical import.
- Applied inverse-transpose normal transforms.
- Corrected triangle winding for mirrored node transforms.
- Preserved mesh instances and primitive material groups.
- Rendered canonical material groups with individual base-color, roughness, metallic, and double-sided settings.
- Added canonical revision tracking and renderer cache invalidation.
- Added `Rebuild import` for assets imported by older hierarchy-unaware builds.
- Preserved the previous canonical mesh under a history directory before rebuilding.
- Reset rebuilt assets to draft so rendered inspection is mandatory.
- Added guarded API and Codex rebuild operations.
- Implemented Provider Registry, Integrations workspace, Job Center, isolated workers, health checks, progress, logs, cancellation, retry, and restart-safe interruption handling.

## Commands run

```text
node --check server/server.mjs
node --check server/provider-framework.mjs
node --check server/job-manager.mjs
node --check workers/local-worker.mjs
node --check bridge/mcp-server.mjs
node --check app/app.js
node --check app/renderer.js
node --check desktop/main.cjs
npm test
npm run verify
```

## Automated result

- 35 automated tests passed.
- 0 automated tests failed.
- Server, provider framework, job manager, local worker, MCP bridge, editor, renderer, and desktop shell syntax passed.
- Real HTTP asset import, rebuild, collision, LOD, preview, commit, persistence, and recipe synchronization passed.
- Nested transform and multi-material fixture passed.
- Canonical rebuild preserved the original source and stored rollback history.
- Actual MCP import and canonical rebuild passed.
- Provider health, project validation, cancellation, retry, persistence, and interrupted-job recovery passed through isolated worker processes.

## Visual inspection

The supplied Windows screenshots were used to identify the overlap and import defects. A fresh Windows render of v0.7.1 is still required because this Linux environment cannot launch the packaged Windows Electron executable, and its managed Chromium cannot create a usable WebGL/EGL context.

## Target-machine checks still required

- Confirm Models, Surfaces, and Prefabs subviews do not overlap at the user's window size.
- Select the previously imported car and press `Rebuild import`.
- Confirm body panels, wheels, seats, and nested pieces retain authored transforms.
- Inspect front, side, rear, top, close, wide, and player views.
- Confirm material groups are visually distinct.
- Confirm source textures are preserved; note that full authored glTF texture-slot reproduction remains incomplete.
- Confirm save/reload and application restart preserve the rebuilt asset.
- Run provider health and a diagnostic job through the visible Job Center.

## Known limitations

- External-buffer `.gltf` packages remain unsupported by the single-file importer.
- Sparse accessors, Draco compression, triangle strips/fans, full authored texture slots, skinning, morph evaluation, and animation playback remain explicit future work.
- Current LOD generation is deterministic triangle sampling, not production-quality silhouette-aware decimation.
- Bounds collision still requires doorway and gameplay-clearance inspection.
