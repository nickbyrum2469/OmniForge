# OmniForge v0.9.0 Verification Record

## Scope

This record covers the Recipe Core and Production Surface Studio implementation built on the authoritative v0.8.0 source.

## Source identity

- Product: OmniForge
- Package version: 0.9.0
- State schema: 8
- Project schema: 8
- Surface Recipe schema: 2
- Surface renderer contract: `surface-runtime-2`
- MCP server version: 0.9.0

The supplied source archive does not include Git metadata, so an authoritative branch name and commit hash could not be recorded. The v0.8.0 package supplied in the conversation was treated as the authoritative base.

## Implemented and exercised

### Recipe Core

- Stable Surface Recipe v2 normalization.
- One shared simple/advanced material model.
- Non-destructive recipe variants.
- Validation reports.
- Deterministic compilation and cache keys.
- Performance-cost metadata and GTX 1650-class hints.
- Scene weather, water, season, and wind settings.

### Surface Studio

- Simple material/layer controls.
- Advanced mask and graph controls.
- Shared recipe persistence.
- Compilation controls and cache status.
- Live world-setting controls for environment masks.
- Non-destructive source/offset seam previews.
- Local PBR-map derivative generation.
- Processed material derivatives with provenance.

### Decals

- Stable Decal Recipe schema.
- Channel, projection, fading, sorting, opacity, and validation fields.
- Scene decal placement.
- Renderer ordering and alpha behavior.
- Guarded server and MCP operations.

### Atlas and trim recipes

- Stable recipe records.
- Deterministic UV-region layouts.
- Occupancy reports.
- Editor preview.
- Persistence and MCP creation.

## Automated validation

The final source ran:

```text
npm test
npm run verify
```

Result:

```text
42 tests passed
0 tests failed
```

The verification command also passed syntax checks for:

- Runtime server.
- Provider Framework.
- Job Manager.
- Marketplace.
- Isolated local worker.
- MCP bridge.
- Editor.
- Renderer.
- Desktop shell.

Package-structure checks passed.

## Real API validation

The integration suite started an isolated OmniForge runtime and exercised:

- Processed material derivative creation.
- Surface Recipe compilation.
- Decal Recipe creation.
- Decal scene placement.
- Atlas recipe creation.
- State persistence.

All operations returned normalized records and persisted through the authoritative state store.

## Real MCP validation

A real MCP process completed:

- `initialize`
- `tools/list`
- `omniforge_compile_surface_recipe`
- `omniforge_create_decal_recipe`
- `omniforge_create_surface_atlas`

Observed result:

```text
57 tools exposed
Surface compilation: valid
Decal Recipe: valid
Atlas Recipe: valid
```

## Regression coverage

All inherited tests from v0.5 through v0.8 remained passing, including:

- Desktop lifecycle and stale-build rejection.
- Project Hub and project locking.
- Clipboard and pointer-lock security paths.
- Terrain/path material blending.
- Material tiling.
- Canonical GLB/glTF import and hierarchy transforms.
- Asset repair, collision, LOD, and placement.
- Provider health and isolated jobs.
- Marketplace staged downloads and canonical import.
- Managed-path containment.

## Visual inspection attempt

A Chromium/Xvfb visual run was attempted against the real local server. Chromium launched, but the managed browser displayed an organization-policy block page for both `127.0.0.1` and a custom local hostname before OmniForge loaded. The blocked images were not accepted as application evidence.

The Linux environment also cannot launch the packaged Windows Electron executable. Therefore the following still require the target-Windows pass:

- Full Production Surface Studio layout inspection.
- Live shader compilation and WebGL error inspection on the target GPU/driver.
- Close/wide/player views of layer and mask changes.
- Decal depth, fade, sorting, and clipping.
- Seam-repair quality on real project textures.
- Save/restart behavior inside `OmniForge.exe`.

## Known limitations

- The material graph is a structured production graph foundation, not yet an arbitrary node-canvas shader compiler.
- Atlas and trim-sheet records are authoritative layouts but do not yet bake packed texture images or rewrite UVs.
- Decals are planar and not yet full receiver-volume decals.
- Generated normal/roughness/AO/height maps use deterministic local processing and need artistic review.
- Performance cost is an estimate, not a substitute for exported-build timing on actual hardware.
- Windows executable launch and rendered visual acceptance remain unperformed in this Linux environment.
