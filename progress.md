Original prompt: Implement the attached OmniForge sky, celestial, atmosphere, cloud, lighting, eclipse, biome-lighting, performance, and packaged visual-evidence plan against the 14 supplied reference images on phase1c/crash-celestial-atmosphere-stabilization.

## Current gate

- Starting authoritative commit: `0413feff30d1d363c19b14efd14a0838342ebaf8`.
- Lighting-foundation commit: `878d9b29404f7714f6afaf890ae1d3fce726a94b`.
- Baseline packaged captures proved the capture protocol was one server revision behind.
- Added revision-synchronized capture, linear/sRGB color management, physically based direct lighting, inverse-square point attenuation, physical visibility units, editor-reference capture exclusion, and an initial atmosphere-scattering foundation.
- `npm.cmd test`: 129/129 passed.
- `npm.cmd run verify`: passed.

## Next validation

- Exact packaged build completed and `source-commit` matched `878d9b29404f7714f6afaf890ae1d3fce726a94b`.
- Revision-synchronized packaged capture completed all five frames.
- Visual gate correctly failed on Milky Way structure.
- Preserved failed evidence under `output/phase1d-878d9b2/captures`.
- Manual inspection found:
  - clear-day terrain is nearly black;
  - stars remain sparse and square;
  - Milky Way is a symmetric horizontal fog band;
  - Moon crater rings are synthetic and highlights are washed out;
  - eclipse lacks corona structure and world/atmosphere response.
- Next: correct daylight energy/sign behavior, then rebuild the starfield and Milky Way before moving to Moon and eclipse polish.

## Packaged correction results

- Commit `cee7130a15c8e3e5bbe516e58803d7778c649f71` built with an exact matching `source-commit`.
- All five revision-synchronized frames passed the automated evidence thresholds.
- Daylight terrain dark-pixel fraction fell from about 36% to about 2.7%; authored terrain texture became readable.
- Star density and antialiasing improved, but manual review still found too many one-pixel points.
- Milky Way peak luma increased from about 0.27 to about 0.72, but manual review still rejected its horizontal cloud-bank composition.
- Additional packaged camera trials proved framing contributed to the horizontal look, while the shader still needed stronger dust breakup and granular stellar structure.
- Current uncommitted gate increases authored sky irradiance, strengthens stellar PSF sampling, adds broken multi-branch dust and granular galactic stars, and frames the Milky Way evidence on a diagonal.
- `npm.cmd test`: 132/132 passed.
- `npm.cmd run verify`: passed.
- Exact packaged commit `05ed7c6769354e719af1aacc43ec46b03496e836` passed automated capture thresholds but failed manual visual review: daylight remained underlit, stellar density remained low, the galactic dust lane remained too straight, lunar craters read as rings, and the eclipse remained a flat black disc with a uniform halo.
- The next bounded gate replaces ring decals with layered lunar basins/maria, renders a deterministic structured corona with annular and diamond-ring states, and connects eclipse coverage to the authoritative ambient/direct world light and daylight star visibility.
- Exact packaged commit `37086f7c759202f6a43b8554b36d0c63f2cf12a9` proved the eclipse atmosphere and corona direction are working, but manual review rejected a cartoon four-basin lunar pattern, coarse triangular corona wedges, and stars composited over the occulting Moon. The follow-up softens and warps maria, reduces analytic crater rims, increases corona angular detail, and masks eclipse stars behind the silhouette.
- Exact packaged commit `9c045c107f179e207efbb0410ec47481de1db0f5` removed the lunar paw pattern and the star leak through the eclipsing disc. The Moon is materially more coherent, and the eclipse now has a readable cool atmosphere plus a structured white corona, but both remain short of the photographic references.
- The next gate adds two low-cost deterministic micro-star populations, keeps bright hero stars on the existing antialiased path, removes the Milky Way's continuous central dust line, and strengthens irregular dust pockets and granular stellar structure.
- Exact packaged commit `c3de29af11f17707384163dcd204e456da115226` rejected the direct-cell micro-star optimization: it aliased into obvious radial shard patterns at viewport resolution. The implementation is removed rather than hidden. Density is instead raised inside the existing pole-safe, neighbor-aware PSF population, preserving one correct star representation.
- Exact packaged commit `88047b34086d43e1f29e7dc79741c316ffe42e7a` restores correct dense PSF stars without radial shards. Manual review still blocks the slightly dash-like smallest points, the continuous central galactic lane, and a clear-day scene that remains too dark.
- Direction tracing confirmed one Sun authority and the correct sign from celestial direction through shadow projection and BRDF N·L. The daylight correction therefore raises authored clear-day exposure and environment irradiance instead of adding a fake Editor-only light. The same gate widens, warps, and intermittently removes the central galactic dust lane.

## Remaining visual work

- Dense antialiased pole-safe starfield.
- Structured realistic and stylized Milky Way.
- Moon surface/exposure refinement.
- Partial, annular, total, and diamond-ring eclipse rendering with world response.
- Cloud lighting and volumetric shafts.
- Data-driven biome/style profiles and authoring controls.
- Expanded packaged capture manifest and measured GTX 1650 quality budgets.
