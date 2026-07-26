# Phase 1D Lighting Foundation Project Snapshot

## Authority

- Repository: `nickbyrum2469/OmniForge`
- Branch: `phase1c/crash-celestial-atmosphere-stabilization`
- Starting commit: `0413feff30d1d363c19b14efd14a0838342ebaf8`
- World scale: one world unit equals one meter.
- One server-owned world state drives the Sun, Moon, atmosphere, fog, clouds, weather, terrain, imported objects, and foliage.

## Baseline evidence

The unchanged packaged baseline was built from the exact starting commit. Its capture sequence was one authoritative state behind: night remained day, the Milky Way remained day, the Moon appeared in the eclipse frame, and the requested eclipse did not appear. The capture protocol used a fixed sleep and did not wait for or apply the server revision it had just created.

The baseline also exposed permanent rendering defects:

- approximate gamma instead of exact sRGB transfer functions;
- arbitrary base-color texture multipliers;
- a 66% direct-light leak inside fully shadowed pixels;
- Blinn-Phong direct specular rather than metallic/roughness GGX;
- nonphysical linear point-light attenuation;
- a capped smoothstep fog overlay;
- editor reference objects participating in surface masks and proof captures;
- blending enabled throughout the opaque pass;
- silent edit-mode lighting assistance.

## Implemented gate

- Exact sRGB decode for color inputs and exact sRGB output encoding.
- Linear HDR world shading.
- Cook–Torrance GGX direct BRDF with metallic/roughness response.
- Unbiased PCF shadow visibility.
- Range-windowed inverse-square point-light attenuation.
- Exponential distance transmittance for world fog.
- Explicit opaque and transparent blend state.
- One-world-unit-per-meter conversion helpers.
- Visibility in kilometers converted to authoritative world distance.
- Explicit `Authoring Assist` and `Game Accurate` editor lighting modes.
- Editor-only render classification for the Scale Reference Block and World Marker.
- Editor references excluded from surface-recipe structure masks and game-accurate evidence.
- Capture revision barrier tied to the exact world mutation revision.
- PowerShell 5.1-compatible repository-relative path handling in the Windows evidence gate.

## Packaged correction gate

The first revision-synchronized package built from `878d9b29404f7714f6afaf890ae1d3fce726a94b` produced all five requested frames and correctly failed the visual gate. Manual inspection found black terrain, sparse square stars, a symmetric fog-like galactic band, synthetic crater rings, and a simple eclipse disc.

The next small corrective gate:

- treats procedural material textures as authoritative albedo instead of multiplying them by a dark fallback object color;
- preserves glTF base-color factors as explicit linear texture tints;
- decodes Sun, Moon, and point-light colors before BRDF evaluation;
- increases deterministic stellar population density;
- renders stars with a radial antialiased point-spread function;
- varies twinkle by altitude, brightness, identity, and time;
- rebuilds the Milky Way with a framed core bulge, asymmetric cloud masses, branching dust, multiple filaments, granular knots, and periodic direction-space noise;
- updates integration contracts so repeatable migration cannot restore the older shader.

Every corrective package must still be built from a clean commit, capture the exact server revision, and pass manual inspection before approval.

## Protected behavior

- The continuous terrain-conforming path remains authoritative.
- The terrain, path, celestial, and persistence systems are not duplicated.
- Play mode always uses authored lighting.
- Authoring Assist remains available for readable nighttime editing.
- Normal editor polling and compact celestial interpolation remain intact.

## Remaining packages

This foundation does not claim the complete visual program is approved. Star populations, Milky Way art direction, lunar detail, eclipse event rendering, cloud lighting, volumetric shafts, biome/style profiles, automatic exposure, expanded capture views, and measured GTX 1650 quality budgets remain separate reviewable gates. Merge remains blocked until exact packaged captures are manually approved.
