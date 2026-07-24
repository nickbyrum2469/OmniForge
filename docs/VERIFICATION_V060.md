# OmniForge v0.6.0 Verification Record

## Requested milestone

Implement the Canonical Asset Foundation on top of the working v0.5.2 editor without replacing the desktop lifecycle, viewport controls, Surface Recipes, materials, terrain paths, project system, or Codex bridge.

## Implemented

- Stable model asset IDs based on name and source checksum
- GLB 2.0 import
- Embedded-buffer glTF 2.0 import
- Original-source preservation
- Canonical renderer-mesh derivatives
- Asset Health Reports
- Duplicate-checksum warning
- Goal-aware model categories
- Source, creator, license, and checksum provenance
- Linked Asset Recipes
- Non-destructive safe repair derivatives
- Bounds collision generation
- Two configurable LOD derivatives
- Asset library search and status filters
- Asset inspector and processing controls
- Actual 3D viewport loading and selection of canonical model geometry
- Terrain-grounded placement previews
- Commit and cancel placement transactions
- Approved placement flow
- Viewport thumbnail capture
- Scene usage tracking
- Nine guarded model-asset MCP tools

## Commands run

- `node --check server/asset-pipeline.mjs`
- `node --check server/state-store.mjs`
- `node --check server/server.mjs`
- `node --check bridge/mcp-server.mjs`
- `node --check app/app.js`
- `node --check app/renderer.js`
- `npm test`
- `npm run verify`

## Automated results

- 28 tests passed
- 0 tests failed
- Real server integration test imported a GLB, created its Asset Recipe, preserved source and canonical files, generated collision and two LODs, approved it, created a scene preview, committed the preview, persisted the usage, and re-read the recipe.
- MCP initialization and tool discovery passed.
- Package syntax and required-file checks passed.

## Visual inspection status

The current Linux container could not establish a usable Chromium WebGL/EGL context for a fresh v0.6 screenshot. The failure occurred before application rendering in the container graphics stack. No screenshot is presented as v0.6 evidence.

The v0.6 asset workspace, actual imported-model rendering, placement, material appearance, collision volume, LOD silhouette, grounding, and desktop restart persistence still require the included target-Windows smoke test.

## Known limitations

- The canonical viewport currently renders the first material factor on the merged preview mesh.
- Authored texture slots remain preserved in the source but are not fully rendered.
- Node transforms are reported but are not flattened into canonical geometry.
- Skeletons, skinning, animation playback, and morph evaluation remain future runtime milestones.
- Bounds collision is unsuitable for doors, arches, hollow architecture, and other open geometry without manual review.
- LOD generation uses deterministic triangle sampling and requires visual inspection.
- External-buffer `.gltf` packages are not supported by the single-file import flow.
- The Windows Electron executable cannot be launched in this Linux environment.

## Remaining target-platform evidence

- Import a real production GLB in `OmniForge.exe`.
- Inspect front, side, rear, elevated, close, wide, and player views.
- Confirm pivot, orientation, scale, and grounding.
- Inspect generated collision against open spaces and interaction areas.
- Inspect LOD transitions and silhouettes.
- Save, close, reopen, and confirm source, recipe, scene reference, and thumbnail persistence.
