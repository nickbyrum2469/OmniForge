# OmniForge Material Authoring

## Authoritative material settings

Every material uses one stable asset ID and a normalized settings record. Settings are shared by every scene entity referencing that material.

- `worldScale`: size of one repeat in world units. Smaller values repeat more frequently.
- `uvRotation`: world-projected texture rotation in degrees.
- `uvOffset`: X/Z texture offset.
- `roughness`: fallback roughness when no roughness map exists.
- `roughnessMultiplier`: multiplier applied to the roughness map.
- `metallic`: metallic response.
- `normalStrength`: normal-map intensity.
- `aoStrength`: ambient-occlusion contribution.
- `heightStrength`: height-map parallax depth.

The editor clamps unsafe values before persistence. The renderer applies the same settings to base terrain materials and path materials, so the border blend remains consistent across base color, normals, roughness, ambient occlusion, and height detail.

## Non-destructive variants

A variant shares the source material maps but stores independent tuning values and provenance through `sourceAssetId`. Use variants when one object, biome, path family, or weather state needs different tiling or surface response.

## Runtime verification

Material tuning is not considered validated merely because values save. Validation requires:

1. Apply the material to a real object or terrain layer.
2. Inspect close, wide, shallow-angle, and player-height views.
3. Check for visible seams, excessive repetition, swimming, scale mismatch, overstrong normals, crushed AO, and parallax distortion.
4. Save and reload the scene.
5. Restart OmniForge and confirm persistence.
6. Capture the rendered viewport as evidence.
