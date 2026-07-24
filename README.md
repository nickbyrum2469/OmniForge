# OmniForge 3D Engine v0.9.0

OmniForge is a general-purpose, AI-native 3D game-creation workspace. It combines a navigable WebGL editor, persistent projects and scenes, PBR material authoring, terrain-conforming paths, reusable prefabs, guarded Codex tools, and a native Windows desktop lifecycle.

This package is a production-oriented vertical slice, not yet a feature-complete replacement for a mature commercial engine. Features listed as implemented below exist in the authoritative source and are covered by the available automated tests. Features in the roadmap are planned work and are not represented as finished.


## v0.9 Recipe Core and Production Surface Studio

Assets → Surfaces now contains one connected production workspace: Simple and Advanced controls edit the same Surface Recipe v2, Map Tools create non-destructive PBR derivatives, Decal Studio creates first-class decal recipes and live scene decals, and Atlas + Trim creates persistent layout recipes. Surface compilation records deterministic cache keys, validation, estimated cost, and initial GTX 1650-class profile hints.

See `docs/SURFACE_STUDIO_V09.md` and `docs/VERIFICATION_V090.md`.

## v0.8 Free Asset Marketplace

Assets → Marketplace now searches normalized provider catalogs, displays source and license information before download, stages files through persistent background jobs, and imports completed downloads through the canonical model or material pipeline. Poly Haven and ambientCG are live API adapters; Kenney and Quaternius are curated CC0 catalogs with official source links. Downloads never become approved assets automatically.

See `docs/MARKETPLACE.md` and `docs/VERIFICATION_V080.md`.

## Start on Windows

1. Extract the ZIP into a normal writable folder.
2. Double-click `START_ENGINE.bat`.
3. The first launch assembles the pinned Electron desktop runtime and stamps `OmniForge.exe` with OmniForge icon and version metadata.
4. Later launches open `dist\OmniForge-win32-x64\OmniForge.exe` directly.
5. Use `STOP_ENGINE.bat` only when you need to force-close a stale development or desktop runtime.

Normal startup does not open a browser tab or expose a Node terminal. `START_BROWSER_DEV.bat` is an intentionally separate development launcher.

## Connect Codex

Run `CONNECT_CODEX.bat`, restart Codex, and ask it to use the `omniforge_*` tools. The MCP process shares the same `%APPDATA%\OmniForge` data root as the desktop editor, so both operate on the same project catalog and scene state.

## Implemented through v0.9.0

### Desktop lifecycle

- Native Electron window and hidden local runtime.
- Single-instance enforcement.
- Dedicated `%APPDATA%\OmniForge` application-data directory.
- Random loopback port and per-session authentication token.
- Hidden child process with runtime and desktop logs.
- Stale-runtime detection and process-tree cleanup.
- Clean child-process shutdown.
- Unclean-session detection.
- Recovery prompt and Safe Mode.
- Atomic project-state writes and backup recovery.
- Window-position and size persistence.
- Context isolation, sandboxing, restricted navigation, native clipboard IPC, and trusted-origin pointer-lock permissions.
- Separate browser-development launcher.
- OmniForge application name, icon, About metadata, and executable version stamping.

### Project Hub

- Create blank or starter 3D projects.
- Open recent projects.
- Persist recent-project ordering.
- Capture and display project thumbnails.
- Duplicate projects without copied build/cache folders.
- Archive managed projects without permanent deletion.
- Import existing folders into managed storage.
- Migrate legacy state to schema version 8.
- Detect missing or moved project directories.
- Locate and restore moved projects.
- Prevent simultaneous writes to the same project through project locks and runtime health checks.

### Editor usability

- Resizable hierarchy, inspector, and bottom dock.
- Independently collapsible panels.
- Default, world-building, material, viewport-focus, and custom saved layouts.
- Searchable command palette.
- Remappable keyboard shortcuts with conflict detection.
- Clear no-selection state.
- Hierarchy breadcrumbs.
- Saved, dirty, saving, and error indicators.
- Structured error dialog and persistent recent-error records.
- First-use navigation tutorial.
- Reset-camera and focus-selection commands.
- Separate horizontal and vertical look inversion.
- Mouse sensitivity, movement speed, and field-of-view controls.


### v0.9 Production Surface Studio

- Surface Recipe schema v2 with shared Simple/Advanced editing.
- Dirt, moss, wetness, snow, damage, macro color, macro roughness, and detail controls.
- Geometry and world masks for orientation, slope, cavities, edges, contact, water, sun, shade, wind, paths, structures, terrain layers, vertex paint, and authored masks.
- Scene controls for season, weather wetness/snow, water level, wind, exposure, and fog.
- Deterministic Surface Recipe compilation and cache keys.
- Estimated shader sample/ALU cost and low-end profile hints.
- Non-destructive seam preview and local PBR derivative generation.
- Stable Decal Recipes and planar scene placement.
- Stable atlas/trim layout recipes and occupancy preview.
- Guarded Codex tools using the same authoritative validation paths.

### v0.7 Provider Framework and Job Center

- Normalized provider records, capabilities, health, settings, and independent enable/disable state.
- Integrations workspace with visible status, hardware reports, execution backend, and guarded health checks.
- Persistent Job Center with stages, progress, logs, warnings, errors, outputs, validation, cancellation, retry, and restart-safe interruption records.
- Isolated local workers so long operations do not run in the Electron renderer or block editor navigation.
- Current jobs cover provider health, managed asset indexing, project-integrity validation, and diagnostic cancellation/retry tests.
- Codex receives guarded provider and job tools through the same authoritative state.

### v0.8.0 asset workspace and GLB repair

- Models, Surfaces, and Prefabs now use focused subviews instead of one overlapping asset column.
- Restored layouts are clamped to maintain a usable center viewport, and controls wrap at narrower sizes.
- Canonical GLB/glTF import now applies active-scene node hierarchy transforms, nested translation/rotation/scale, inverse-transpose normal transforms, mirrored winding correction, mesh instancing, and primitive material groups.
- Imported groups render individual base-color, metallic, roughness, and double-sided factors.
- Older imports can be repaired with **Rebuild import** without changing their stable asset ID or overwriting the preserved source.
- The previous canonical mesh is retained as rollback history, the asset returns to Draft, and the live renderer reloads the new canonical revision.

See `docs/PROVIDER_SDK.md`, `docs/JOB_SYSTEM.md`, `docs/WORKER_PROTOCOL.md`, and `docs/VERIFICATION_V071.md`.

### v0.6 Canonical Asset Foundation

- Import binary glTF 2.0 and single-file glTF 2.0 with embedded buffers.
- Preserve original files in a controlled source directory.
- Generate deterministic canonical preview meshes for supported triangle geometry.
- Create stable model asset IDs, checksums, provenance, validation, and scene usage records.
- Create linked Asset Recipes and keep collision, LOD, approval, thumbnail, and usage data synchronized.
- Show Asset Health Reports instead of hiding unsupported features.
- Create non-destructive repair derivatives.
- Generate bounds collision and two inspectable LOD derivatives.
- Search and filter the real model-asset library.
- Preview imported models in the actual 3D scene, then commit or cancel placement.
- Place approved assets with terrain-aware grounding.
- Capture asset thumbnails from the live viewport.
- Give Codex guarded model import, inspection, processing, and placement tools.

See `docs/ASSET_PIPELINE.md` for the architecture and current format limitations.

### v0.5.2 viewport and recipe pass

- Repaired the error-dialog **Copy details** workflow with native Windows clipboard support and two browser fallbacks.
- Repaired desktop viewport capture by allowing pointer lock only for the trusted active editor origin.
- Added right-mouse-drag plus WASD navigation as a fallback.
- Added stable Surface Recipe assets with migrations, validation, preview transactions, commit, revert, and variants.
- Added dirt, moss, wetness, snow, damage, color variation, and detail layers.
- Added upward, slope, cavity, and ground-contact material masks.
- Connected recipes to the live terrain/path renderer and guarded Codex tools.

### Current 3D and AI foundation

- Navigable WebGL 2 viewport.
- Terrain, terrain-conforming paths, primitives, and lights.
- PBR starter materials and texture-map authoring.
- Real-world material tiling, rotation, offsets, and response controls.
- Soft path material shoulders.
- Reusable prefabs.
- Basic component and play-mode physics foundation.
- Persistent scenes and editor camera.
- Guarded Codex MCP tools for projects, scenes, objects, materials, prefabs, commands, files, and captures.

## Important boundaries

The Linux validation environment cannot launch the packaged Windows executable. The source, builder, project lifecycle, runtime server, project locking, MCP handshake, and automated tests were exercised here; the final `OmniForge.exe` still requires a direct Windows launch and visual pass on the target machine.

The managed Chromium installation in this environment blocks local application origins before OmniForge loads. A Chromium/Xvfb launch was attempted against the real v0.9 server, but only the organization-policy block page rendered; it was rejected as application evidence. A fresh Windows desktop capture remains part of the target-machine smoke test.

Full arbitrary-node shader compilation, physical atlas/trim baking and UV rewriting, receiver-volume decals, complete authored glTF texture-extension reproduction, production rigid-body physics, navigation meshes, skeletal animation, rigging, foliage ecosystems, build export, audio, VFX, and multiplayer remain roadmap items.

## Documentation

- `docs/OMNIFORGE_V051_IMPLEMENTATION_PLAN.md` — unified recipe, surface, asset, foliage, biome, and AI-authoring production plan.
- `docs/ROADMAP_V06_TO_V21.md` — dependency-ordered releases from 0.6 through 0.21.
- `docs/ARCHITECTURE.md` — current source architecture and authority boundaries.
- `docs/SURFACE_STUDIO_V09.md` — Surface Recipe v2, processing, decals, atlases, compilation, and limitations.
- `docs/VERIFICATION_V090.md` — exact v0.9 tests, runtime/MCP evidence, and remaining Windows checks.
- `docs/FILES_CHANGED_V090.md` — source areas changed in v0.9.
- `docs/AUTO_OPTIMIZATION_V021.md` — adaptive low-end optimization and GTX 1650-class certification plan.
- `docs/ACCEPTANCE_CRITERIA.md` — release gates and end-to-end tests.
- `docs/VERIFICATION_V052.md` — exact viewport, clipboard, recipe, API, and MCP validation.
- `docs/VERIFICATION_V051.md` — earlier desktop and Project Hub validation.
- `docs/WINDOWS_SMOKE_TEST.md` — target-Windows launch, lifecycle, recovery, and UI evidence checklist.
- `docs/FILES_CHANGED_V052.md` — source areas changed in the current release.
- `docs/FILES_CHANGED_V051.md` — earlier desktop and Project Hub changes.
- `docs/CODEX_SETUP.md` — MCP connection and operating rules.
- `docs/MATERIAL_AUTHORING.md` — current PBR material and tiling behavior.
- `docs/PROVIDER_SDK.md` — normalized provider architecture and extension rules.
- `docs/JOB_SYSTEM.md` — job states, scheduling, cancellation, retry, and recovery.
- `docs/WORKER_PROTOCOL.md` — isolated local worker request and event protocol.
- `docs/VERIFICATION_V071.md` — v0.7.1 provider, job, layout, and hierarchical import validation.
- `docs/FILES_CHANGED_V071.md` — source areas changed in v0.7.1.

## Commands

```text
npm test
npm run verify
npm start
npm run mcp
npm run reset
```

The authoritative rule is simple: an interface element, successful compile, or plausible AI description does not prove a workflow works. Changes advance only after the latest build, persistence, runtime behavior, failure handling, regression coverage, and rendered evidence pass the applicable gates.
