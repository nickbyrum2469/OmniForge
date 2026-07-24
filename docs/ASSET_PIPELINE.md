# OmniForge v0.7.1 Canonical Asset Pipeline

## Authority

OmniForge stores imported 3D content as stable asset records and linked Asset Recipes. Scene entities reference stable asset IDs rather than display names or loose files.

## Supported inputs

- Binary glTF 2.0 (`.glb`)
- glTF 2.0 (`.gltf`) when every buffer is embedded as a data URI

External-buffer glTF packages are rejected by the current single-file importer. The original source is preserved even when parsing or validation fails.

## Import transaction

1. Read the selected file through the guarded editor workflow.
2. Enforce request and source-file limits.
3. Calculate a deterministic SHA-256 checksum.
4. Preserve the source under `assets/models/<asset-id>/source/`.
5. Parse glTF 2.0 geometry without executing embedded code.
6. Traverse the active glTF scene hierarchy.
7. Apply nested node matrices, translation, rotation, and scale to canonical positions.
8. Apply inverse-transpose transforms to normals.
9. Repair winding for mirrored node transforms.
10. Preserve mesh instances and primitive material groups.
11. Create an Asset Health Report.
12. Write the canonical renderer mesh under `assets/models/<asset-id>/canonical/mesh.json`.
13. Create or update the stable model asset and linked Asset Recipe.
14. Keep failed imports visible as unvalidated assets.

## Material behavior

The canonical preview now preserves and renders primitive material groups with their base-color factor, metallic factor, roughness factor, and double-sided state.

The original glTF still remains the source of truth for authored images and textures. Full reproduction of every glTF texture slot, sampler, UV transform, and extension remains future work and is reported as a warning rather than silently claimed.

## Existing import rebuild

Assets imported by hierarchy-unaware builds display **Import upgrade recommended**. `Rebuild import`:

- Reads the preserved original source.
- Backs up the current canonical mesh under `canonical/history/`.
- Rebuilds geometry using the current hierarchy and material-group pipeline.
- Keeps the same stable asset ID and scene references.
- Increments the canonical revision so the live renderer reloads the mesh.
- Resets approval to draft.
- Requires rendered inspection before approval.

## Asset Health Report

The report records dimensions, bounds, vertices, triangles, meshes, primitives, material and texture counts, nodes, mesh instances, transform status, skeletons, animations, morph targets, warnings, blocking failures, and recommended repairs.

Explicit current boundaries include:

- External-buffer glTF packages are unsupported.
- Sparse accessors are unsupported.
- Draco-compressed primitives are unsupported.
- Triangle lists are supported; strips and fans are not yet canonicalized.
- Authored image references are preserved but not all texture slots render.
- Skeletons, skinning, morph evaluation, and animation playback remain future runtime systems.

## Reversible processing

`Repair Safe Issues` creates a derivative rather than overwriting the original. Bounds collision and LOD files are explicit derivatives with inspection warnings. Current LOD reduction is deterministic triangle sampling and is not a production-quality silhouette-aware simplifier.

## Placement

Unapproved assets use temporary placement previews that can be committed or cancelled. Approved assets can be placed directly. Placement uses asset bounds and the authoritative terrain query for grounding, then records scene usage in the Asset Recipe.

## Codex boundary

Codex receives guarded tools for listing, inspecting, importing managed files, rebuilding legacy imports, repairing derivatives, generating collision and LODs, previewing placement, committing placement, and cancelling placement. It does not receive unrestricted source-asset deletion or arbitrary filesystem access.
