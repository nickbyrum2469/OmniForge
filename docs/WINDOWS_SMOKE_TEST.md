# OmniForge v0.9.0 — Target-Windows Smoke Test

## 1. Clean startup and regression

1. Close prior OmniForge and Node processes.
2. Extract v0.9.0 into a fresh writable folder.
3. Run `START_ENGINE.bat`.
4. Confirm an older packaged executable is rebuilt automatically.
5. Confirm one desktop window opens with no browser tab and no visible Node terminal.
6. Confirm pointer-lock navigation and right-mouse navigation work.
7. Confirm Copy Details pastes into Notepad.
8. Confirm saved layouts, panel resizing, project opening, and save state still work.

## 2. Surface Studio layout

1. Open Assets → Surfaces.
2. Test Simple, Advanced, Map Tools, Decals, and Atlas + Trim.
3. Resize the app wide and narrow.
4. Confirm controls wrap without covering the viewport or each other.
5. Confirm the center viewport always remains usable.

## 3. Shared Simple/Advanced recipe

1. Select Highland Grass.
2. Change dirt, moss, wetness, snow, damage, color variation, and detail.
3. Switch to Advanced.
4. Change upward, slope, cavity, ground-contact, shade, sun, path-distance, and structure-distance masks.
5. Return to Simple and confirm the same recipe remains active.
6. Compile the recipe.
7. Inspect cache key, sample-cost estimate, ALU estimate, and warnings.
8. Commit, save, restart OmniForge, and confirm persistence.
9. Repeat once using Revert instead of Commit.

## 4. World response

1. Open World Settings.
2. Change season, scene wetness, scene snow, water level, wind direction, and wind strength.
3. Confirm linked Surface Recipes visibly respond where implemented.
4. Inspect terrain and path from close, side, elevated, wide, and player views.
5. Confirm no hard path borders, z-fighting, detached shadows, or unreadable surfaces.

## 5. Map processing

1. Import a licensed seamless or near-seamless texture.
2. Inspect source, 2×2 tile, and half-offset previews.
3. Generate a processed derivative.
4. Confirm the original material remains unchanged.
5. Inspect generated base color, normal, roughness, AO, and height maps.
6. Adjust real-world scale and PBR strengths.
7. Apply the derivative to a real object and inspect repetition, seams, scale, and depth.
8. Save and restart.

## 6. Decals

1. Create dirt, moss, crack, or damage Decal Recipe from a registered material.
2. Confirm affected channels, projection depth, angle, surface limit, sort order, opacity, and fade distance persist.
3. Place decals on terrain and a test surface.
4. Inspect depth fighting, clipping, sorting, fade, angle, and camera readability.
5. Save and restart.

## 7. Atlas and trim recipes

1. Select at least two materials.
2. Create an atlas recipe and inspect occupancy/UV rectangles.
3. Create a trim-sheet recipe.
4. Save and restart.
5. Confirm the records remain editable.
6. Do not treat the recipe as a baked texture atlas; physical packing is not part of v0.9.

## 8. Codex

1. Run `CONNECT_CODEX.bat` and restart Codex.
2. Compile a selected Surface Recipe through the guarded tool.
3. Create a Decal Recipe.
4. Place a decal.
5. Create an atlas recipe.
6. Confirm all operations appear in OmniForge and remain undoable or removable through supported editor workflows.

## 9. Evidence and failure rule

Capture the Surface Studio in every mode, a compiled recipe, seam previews, processed material, decal result, atlas recipe, close/wide terrain views, and saved/restarted state. Any screenshot showing overlap, clipping, broken materials, unreadable controls, hard transitions, or another defect is a failed check and must be repaired before approval.
