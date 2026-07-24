# OmniForge — Codex Operating Contract

This source tree is the authoritative OmniForge v0.9.0 application. It is general-purpose and must never assume a specific game, genre, art style, repository, or world until the user creates or selects one.

## Read before changing source

1. Read `omniforge.project.json`.
2. Read `docs/OMNIFORGE_V051_IMPLEMENTATION_PLAN.md` for the unified recipe, Surface Studio, modular-kit, foliage, biome, Style DNA, protected-work, and AI-tool requirements.
3. Read `docs/ROADMAP_V06_TO_V20.md` for release order and exit gates.
4. Call `omniforge_get_state` before changing anything.
5. Check `omniforge_get_commands` for a request queued from the editor and claim it before implementation.

## Required operating flow

1. Identify the active project and scene.
2. Inspect existing systems, assets, materials, terrain, paths, lighting, components, locks, and settings.
3. Reuse existing authorities. Do not create duplicate terrain, time, lighting, wind, input, save, material, path, asset-registry, physics, or navigation controllers.
4. Define affected objects, dependencies, acceptance criteria, rollback scope, and evidence before a substantial change.
5. Apply coherent scene changes through typed OmniForge tools and `omniforge_batch_edit` whenever possible.
6. Use source-file changes only for capabilities that cannot be represented as project or scene data.
7. Request a viewport capture after visual changes.
8. Run relevant tests and inspect actual runtime behavior.
9. Complete a queued command only after recording what changed, what passed, what failed, and what remains untested.

## Authority and safety

- The active project state selected through the Project Hub is authoritative.
- Never maintain a parallel scene, project catalog, asset manifest, or material registry.
- Every generated or imported derivative must preserve source identity, provenance, and undo history.
- Never give an AI unrestricted filesystem deletion or arbitrary shell access.
- Destructive, paid, secret-changing, bulk replacement, migration, and irreversible-bake operations require explicit approval.
- Respect project locks, design-intent locks, protected objects, protected views, roads, doors, paths, gameplay spaces, and approved work.

## Evidence

Never claim a visual result from code inspection, compilation, or an API response. Use the real viewport and `omniforge_request_capture`. A screenshot that reveals a defect is evidence that more work is required.

## Product constraints

- Do not rename the engine for a game project.
- Do not hardcode one game into the editor.
- Do not replace the live 3D viewport with a diagram, fake panel, or demonstration scene.
- Do not flatten terrain for ordinary paths. Use terrain-conforming placement unless an explicit construction mode requires terrain modification.
- Do not claim production physics, navigation, skeletal animation, asset generation, or standalone game export until their roadmap exit gates have passed.

## v0.9 Surface authority

- Simple and Advanced Surface Studio controls edit the same Surface Recipe v2.
- Never overwrite source texture maps during repair; create a derivative and preserve provenance.
- Decals and atlas/trim layouts are stable recipe assets, not loose UI state.
- Compile Surface Recipes through the authoritative compiler and inspect validation/cost warnings.
- Treat atlas baking, arbitrary shader nodes, and receiver-volume decals as incomplete until their real workflows exist.
