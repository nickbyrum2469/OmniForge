# OmniForge AI Game Creation Roadmap

The active production roadmap is split into two detailed documents:

1. [`OMNIFORGE_V051_IMPLEMENTATION_PLAN.md`](./OMNIFORGE_V051_IMPLEMENTATION_PLAN.md) defines the unified recipe architecture, Surface Studio, intelligent masks, material tools, trim sheets, decals, asset health, modular kits, foliage ecology, Biome Studio, contextual actions, Style DNA, design-intent locking, AI permissions, and acceptance evidence.
2. [`ROADMAP_V06_TO_V20.md`](./ROADMAP_V06_TO_V20.md) maps that architecture into dependency-ordered releases from v0.6 through v0.20.

## Current implemented baseline

OmniForge v0.5.1 establishes:

- Native desktop lifecycle and hidden runtime.
- Project Hub and project catalog.
- Project locks and recovery.
- Resizable/collapsible/saved layouts.
- Command palette and shortcut editor.
- Selection breadcrumbs and save-state reporting.
- First-use tutorial and structured errors.
- Existing 3D viewport, materials, paths, prefabs, persistence, and Codex tools.

## Next implementation milestone

v0.6 begins the canonical asset graph, staging area, GLB/glTF import, Asset Health Report, preview service, provenance, checksums, dependencies, usages, and validation. This foundation precedes provider catalogs, generation workers, rigging, animation, foliage, and autonomous scene construction.

## Long-term completion test

A production-ready OmniForge should allow a user to:

1. Create or open a project.
2. Search, import, download, or generate an asset.
3. Preserve its source, license, provenance, and derivatives.
4. Repair and validate geometry, materials, collision, LODs, rig, and animation.
5. Build Surface, Asset, Kit, Foliage, Biome, and Assembly Recipes.
6. Place or assemble content through real terrain, collision, navigation, socket, and protected-work queries.
7. Let AI inspect, suggest, preview, validate, apply, and undo through guarded typed tools.
8. Inspect rendered evidence.
9. Export and launch a standalone game.
10. Reopen the editor without lost references, settings, approvals, or audit history.
