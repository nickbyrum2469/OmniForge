# OmniForge v0.11 — Terrain, Paths, and World Foundation

## Authority

This release extends the authoritative OmniForge editor and project state. It does not create a second terrain editor, a separate path prototype, or hidden replacement geometry.

The shared terrain and path equations live in `app/worldgen.js` and are consumed by:

- WebGL2 terrain generation and path material blending.
- Viewport spline lines and node editing.
- Server-side grounding.
- Foliage placement and path exclusions.
- Play-mode terrain collision.
- v0.11 HTTP APIs.
- MCP/Codex tools.
- Saved project migration.
- Future OmniHydro terrain, river, shoreline, runoff, and GeoMorph queries.

## Root causes repaired

The old terrain used a small group of sine and cosine functions. Those functions produced visible repeating bands and directional hill patterns.

The old terrain size workflow also relied on object transform scale. Scaling a terrain changed the coordinates used to evaluate its procedural height field. Paths remained in a different coordinate interpretation, causing stretching, shifted material masks, and mismatched terrain contact.

The old path was a polyline. Control points were editable only as numbers, material blending used straight chords, and the visible spline could not be hidden globally.

v0.11 replaces those root causes with:

- Seeded value-noise fractals with rotated octaves.
- Domain warping.
- Ridged mountain synthesis.
- Plateau shaping.
- Valley, canyon, island, archipelago, and coastal-basin shaping.
- Explicit world-space terrain bounds.
- World-space path nodes.
- Catmull-Rom spline sampling.
- Bounded terrain cut/fill and maximum-grade profiles.
- Directional terrain expansion without scaling existing coordinates.

## Terrain presets

The initial production presets are:

- Open plains.
- Rolling hills.
- Layered highlands.
- Plateau country.
- Mountain-surrounded valley.
- Canyon basin.
- Single island.
- Archipelago.
- Coastal basin.

Presets are starting configurations for one authoritative terrain recipe. Advanced controls remain editable after choosing a preset.

## Stable expansion

Terrain stores explicit bounds:

```text
minX
maxX
minZ
maxZ
```

Expanding north, south, east, west, or all directions changes only those bounds. The following remain stable:

- Existing world-space terrain samples.
- Noise scale and seed.
- Landform shape origin and radius.
- Path nodes.
- Placed objects.
- Foliage positions.
- Structure positions.

This is a continuous single-terrain expansion foundation. It is not yet a complete streamed infinite-world terrain system. Chunk metadata is present so later streaming can subdivide the same authority without changing coordinates.

## Spline editing

When a path is selected, **Edit nodes in viewport** enables spline authoring:

- Left-drag a numbered node across terrain.
- Right-click terrain to insert a node into the nearest spline segment.
- Edit node coordinates numerically in the existing Inspector.
- Reverse path direction.
- Split a path at an interior control node.
- Toggle Catmull-Rom spline interpolation.
- Adjust spline tension and sampling density.
- Hide one path spline or all spline overlays.

The **Splines** toolbar checkbox is independent of Grid and Auto Capture. Hiding spline overlays does not hide the path material or remove path data.

## Path grade and terrain cutting

A path may optionally compile a terrain grade profile. The profile:

1. Samples the unsmoothed terrain beneath the spline.
2. Applies a forward grade limit.
3. Applies a backward grade limit.
4. Blends the result into terrain only inside the path width and shoulder.
5. Clamps excavation to maximum cut depth.
6. Clamps embankment to maximum fill depth.

This supports roads and walking paths that cut into steep slopes without flattening the entire terrain. The path remains editable and the terrain remains authoritative.

This release does not yet create retaining walls, switchbacks, bridges, tunnels, culverts, or road drainage automatically. Those require explicit geometry and infrastructure records rather than hidden terrain deformation.

## Scene Block clarification

The old `Scene Block` has no special engine role. It was a starter object for scale, lighting, collision, and shadow inspection.

v0.11 renames it to `Scale Reference Block`, records that purpose in its properties, and keeps it deletable. It is not a player character, scene root, world controller, or prefab manager.

## Character roadmap

A production character is not being faked with the Scale Reference Block.

The planned sequence remains:

1. Character asset validation and skeleton standards.
2. Automatic and assisted rigging.
3. Animation workspace, retargeting, state machines, root motion, and IK.
4. **Character Studio**: modular body, face, hair, clothing, materials, morphs, proportions, voice metadata, LODs, physics assets, and gameplay profile authoring.
5. A protected, animated starter-character prefab assembled through those same systems.

Character Studio is the OmniForge equivalent of a MetaHuman-style crafting workflow, but it must remain asset-provider-neutral and must not claim photorealistic face generation before the rigging, animation, material, LOD, and runtime foundations pass.

## Honest limitations

- Terrain is still a heightfield; overhangs, arches, caves, and undercut canyon walls require later mesh or signed-distance terrain regions.
- Expansion is continuous bounds growth, not complete asynchronous multi-tile streaming.
- Path cutting is bounded cut/fill, not a civil-engineering road solver.
- Spline node dragging uses terrain ray intersection and world-space X/Z nodes; vertical structures and tunnel paths require a later 3D spline mode.
- No OmniHydro water simulation is implemented in v0.11.
- No animated starter character or Character Studio is claimed as implemented in v0.11.

## Acceptance gates

v0.11 is acceptable only when:

- Old terrain samples remain numerically unchanged after expansion.
- Path nodes remain in the same world positions after terrain expansion.
- Legacy transform scaling migrates once into explicit bounds and height.
- Terrain and path transform scale remain `[1,1,1]` after migration.
- Spline rendering, material blending, physics, grounding, and foliage use the same shared samples.
- Maximum compiled path grade respects its configured limit.
- Cut and fill never exceed their configured depths.
- Right-click node insertion and left-drag node movement persist after reload.
- Global spline visibility persists.
- Existing v0.10 import, worker, Marketplace, foliage, atmosphere, lighting, material, MCP, and desktop tests continue to pass.
