# OmniForge

OmniForge is a general-purpose, AI-native 3D game engine and editor.

## Authoritative source policy

This GitHub repository is the authoritative source for OmniForge development. Do not replace it with a disconnected prototype, alternate editor, stale ZIP, duplicate scene system, or diagnostic-only build.

Current source baseline to upload: **OmniForge v0.9.0**.

Upload the contents inside the extracted `OmniForge-3D-Engine-v0.9.0` directory directly to the repository root. Do not upload only the ZIP and do not add an extra nested wrapper directory.

After the source is present, development should use milestone branches and pull requests. The immediate repair branch will be:

`milestone-10/import-cleanup-foliage-foundation`

## Immediate repair scope

- Correct remaining GLB/glTF import defects.
- Prevent stack overflow and recursive node traversal failures.
- Validate scene/node graphs before canonical conversion.
- Preserve node transforms, mesh instances, materials, texture references, skins, and animations when supported.
- Add safe deletion for imported assets.
- Remove or archive derivatives, thumbnails, recipes, previews, scene usages, and staged data without leaving orphan references.
- Prevent deletion while an asset is still used by a scene unless the user explicitly removes or replaces those usages.
- Add preview, confirmation, undo/audit records, and clear failure messages.
- Clean the Assets workspace and import status flow.
- Preserve every approved v0.5–v0.9 system.

## Development standard

A feature is not complete because it compiles or displays a panel. Test the real workflow in the authoritative application, inspect the rendered result, test persistence and restart, verify failure handling, and retest surrounding approved systems.
