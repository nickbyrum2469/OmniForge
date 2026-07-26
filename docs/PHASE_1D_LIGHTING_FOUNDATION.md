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

The second correction package passed automated thresholds but remained manually blocked. A follow-up composition study in the same packaged scene showed that the previous evidence camera was aligned exactly with the galactic plane, exaggerating a horizontal horizon-like presentation. The next evidence revision deliberately frames the configured galactic core off-center and diagonally while keeping the same authoritative world and renderer. The shader also reduces uniform broad-band light, introduces broken central and branching dust lanes, adds contrast-controlled cloud masses and deterministic granular stars, and increases authored daytime sky irradiance without using Editor-only fill lighting.

Exact packaged evidence from `05ed7c6769354e719af1aacc43ec46b03496e836` proved the remaining Moon and eclipse failures. The lunar surface used bright analytic ring profiles that read as stamped circles, while the eclipse used two rotationally uniform Sun-dot powers and left the daytime atmosphere nearly unchanged. The next gate replaces those models with subdued crater basins, coherent maria, a deterministic polar corona with structured streamers, annular and diamond-ring states, daylight star emergence, and eclipse-driven direct/ambient world-light response.

The first packaged result of that gate (`37086f7c759202f6a43b8554b36d0c63f2cf12a9`) correctly darkened the atmosphere and produced a directional corona, but manual inspection found three new presentation defects: oversized discrete maria read as a cartoon paw, low-frequency corona sectors read as triangular wedges, and daylight stars were composed over the occulting lunar silhouette. The corrective revision warps and blends the maria regions, reduces analytic rim energy, increases angular corona detail, and applies the same eclipse silhouette as an occlusion mask to the star pass.

Packaged commit `9c045c107f179e207efbb0410ec47481de1db0f5` corrected the paw-like maria and eclipse star leak. The next stellar gate keeps the existing high-quality bright-star population, adds two inexpensive direct-cell micro-star layers for photographic density, and further breaks the Milky Way's central dust into irregular gaps and dark pockets. The background layers avoid the nine-neighbor loop used for hero stars, preserving a bounded fragment cost suitable for lower-end profiles.

That direct-cell optimization was rejected after exact packaged commit `c3de29af11f17707384163dcd204e456da115226` exposed radial shard aliasing at real viewport resolution. It was removed completely. The corrected gate raises accepted density inside the existing pole-safe, neighbor-aware point-spread-function renderer, retaining one visually correct star representation instead of shipping a cheaper conflicting path.

Packaged commit `88047b34086d43e1f29e7dc79741c316ffe42e7a` restored dense PSF stars without the shard artifact. A source trace then confirmed that the visible Sun, directional shadow, and BRDF use one authority with the correct direction sign. Clear-day underexposure was therefore corrected at the authored exposure and sky-irradiance inputs rather than with an artificial Editor-only lamp. The galactic lane is also given a larger noisy offset, variable width, and a discontinuous presence mask so it cannot remain a single straight stripe.

The eclipse compositor is also corrected to preserve real angular geometry: the lunar silhouette is projected from the authoritative Moon direction, while the corona remains projected around the authoritative Sun. Manual celestial coordinates no longer receive an unrelated astronomical node penalty, because their authored azimuth and elevation already define both alignment axes. This provides a real basis for partial, annular, total, and diamond-ring evidence instead of recentering every strong eclipse into totality.

## Protected behavior

- The continuous terrain-conforming path remains authoritative.
- The terrain, path, celestial, and persistence systems are not duplicated.
- Play mode always uses authored lighting.
- Authoring Assist remains available for readable nighttime editing.
- Normal editor polling and compact celestial interpolation remain intact.

## Remaining packages

This foundation does not claim the complete visual program is approved. Star populations, Milky Way art direction, lunar detail, eclipse event rendering, cloud lighting, volumetric shafts, biome/style profiles, automatic exposure, expanded capture views, and measured GTX 1650 quality budgets remain separate reviewable gates. Merge remains blocked until exact packaged captures are manually approved.
