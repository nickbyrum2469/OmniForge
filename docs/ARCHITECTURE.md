# OmniForge v0.5.1 Architecture

## Authority model

OmniForge v0.5.1 has one authoritative local project state per active project. The editor UI, runtime server, desktop shell, and Codex MCP bridge share structured project and scene data rather than maintaining separate mock models.

## Source and runtime roots

### Application source root

Contains:

- Editor HTML, CSS, and JavaScript.
- Renderer.
- Server and state store.
- Desktop shell.
- MCP bridge.
- Bundled starter materials.
- Tests and documentation.

### Desktop runtime root

Normal Windows desktop operation uses:

```text
%APPDATA%\OmniForge
├── assets
├── captures
├── crashes
├── data
├── logs
├── sessions
├── workspace\projects
└── workspace\archive
```

The browser-development launcher uses the extracted source directory unless `OMNIFORGE_DATA_ROOT` is supplied.

## Desktop process topology

```text
OmniForge.exe
├── Electron main process
│   ├── single-instance lock
│   ├── lifecycle and recovery marker
│   ├── native dialogs and shell operations
│   ├── BrowserWindow
│   └── child-process ownership
└── hidden local runtime process
    ├── random loopback port
    ├── session token
    ├── project lock
    ├── state API
    ├── static editor assets
    └── scene/material/project persistence
```

The desktop main process owns the child runtime and terminates its process tree during shutdown. Stale runtime markers are health-checked and cleaned before a new runtime starts.

## Recovery architecture

- State writes use a temporary file and atomic rename.
- The previous engine state is preserved as a backup.
- Each managed project has `.omniforge/project-state.json`.
- An unclean desktop lifecycle marker triggers a recovery choice.
- Safe Mode disables play mode and automatic capture while project data is inspected.
- Missing project folders remain in the catalog and can be located/restored.

## Project catalog

`data/project-catalog.json` records:

- Stable project ID.
- Display name.
- Managed root.
- Template.
- Schema version.
- Created, modified, and last-opened times.
- Thumbnail.
- Archived/missing state.
- Import source.

The catalog is refreshed against actual project folders. Project state remains the source of truth for project-specific content.

## Project locking

Each open project receives:

```text
<project>\.omniforge\project.lock.json
```

The lock records project ID, runtime port, process ID, session token, and start time. A second runtime probes the lock owner’s health endpoint. A live owner blocks the second writer; an unreachable stale lock is removed.

## State schema 5

The current state owns:

- Engine metadata.
- Project metadata.
- Scenes.
- Selection.
- Editor camera and editor state.
- Materials.
- Prefabs.
- Commands.
- Evidence.
- Activity.
- Runtime settings.

Migration adds missing editor layout, shortcuts, recovery fields, material settings, camera controls, and schema metadata without creating parallel project formats.

## Editor architecture

### Layout

CSS variables define left-panel width, right-panel width, and bottom-dock height. Pointer resize handles update the shared editor layout. Collapse state and custom layouts persist in project state.

### Commands and shortcuts

The command palette and keyboard shortcuts resolve to the same editor functions. Shortcut editing validates conflicts before persistence.

### Save state

The editor displays:

- Dirty — local edit not yet persisted.
- Saving — authoritative API mutation in progress.
- Saved — mutation succeeded.
- Error — persistence failed.

### Selection

One selected object ID is shared by hierarchy, viewport picking, inspector, breadcrumbs, status bar, and Codex state snapshots.

## Renderer and scene

The current renderer remains a custom WebGL 2 vertical slice. Scene objects are structured records with stable IDs, hierarchy links, transforms, components, and properties. Supported current types include terrain, path, primitives, lights, and empty entities.

The renderer supports current PBR map inputs, terrain material blending, directional shadows, fog, camera navigation, and object picking. A formal future runtime decision remains part of the v0.6+ roadmap.

## Material architecture

Material assets contain stable IDs, map references, provenance, tags, protection state, and normalized settings:

- World scale.
- UV rotation.
- UV offset.
- Roughness.
- Roughness multiplier.
- Metallic.
- Normal strength.
- AO strength.
- Height strength.

Variants reference source material IDs and do not duplicate texture files unnecessarily.

## MCP architecture

The MCP bridge uses standard input/output and the same data root as the desktop application. Tools are typed and scoped to managed state and workspace paths. It does not grant arbitrary filesystem access outside the managed workspace.

Current tool groups include:

- Project lifecycle.
- State inspection.
- Search.
- Scene/object operations.
- Material operations.
- Prefabs.
- Commands.
- Managed files.
- Captures.

## Security boundaries

- BrowserWindow context isolation enabled.
- Renderer Node integration disabled.
- BrowserWindow sandbox enabled.
- Permission requests denied.
- Navigation restricted to the local runtime origin.
- New windows denied; HTTPS links may be opened externally.
- Project file access contained to managed roots.
- MCP file tools use guarded workspace paths.
- Runtime uses a per-session token for lock-owner identity.
- Secrets are not yet implemented; provider secret storage is a v0.7 requirement.

## Planned architecture extensions

The v0.6–v0.20 roadmap adds:

- Canonical asset graph and GLB import.
- Provider and job framework.
- Recipe assets.
- Surface Studio.
- Terrain, foliage, and biomes.
- Production physics and navigation.
- Reconstruction workers.
- Rigging and animation.
- Scene Intelligence and AI permissions.
- Gameplay systems.
- Audio, VFX, UI, and cinematics.
- Standalone game export.
- Large worlds and multiplayer.
