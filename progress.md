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
- Eclipse evidence expansion found that the compositor snapped its occluder direction toward the Sun at high coverage, preventing honest partial geometry. The correction keeps the Moon silhouette on the real Moon direction, anchors the corona to the real Sun, and treats explicitly authored manual azimuth/elevation as authoritative instead of applying an unrelated orbital-node veto.
- The first expanded packaged capture rejected partial-eclipse rendering because eclipse strength made the occluder translucent and the normal Moon surface remained visible through the daytime event. The compositor now treats geometric overlap as an opaque silhouette while retaining fractional eclipse strength for sky and world-light response. The same evidence gate now records golden hour, twilight, partial, annular, and overcast states plus an exact build/GPU/camera/state manifest.
- Manual review of the first annular capture rejected its totality-dark world response. Automatic eclipse strength now derives from analytic Sun/Moon angular-disc intersection area instead of a center-alignment heuristic, so an undersized centered Moon retains the correct uncovered solar energy.
- Manual review of golden hour, twilight, and overcast rejected uniform gray cloud lighting and the full-horizon magenta wash. Both cloud paths now include edge-aware Sun tint and forward scattering, twilight scattering is localized relative to the Sun, and golden/twilight evidence uses the quality cloud path with a camera that actually includes the low Sun.
- The next packaged twilight frame proved that the legacy full-horizon Sun tint and saturated `Clean Twilight` preset still overwhelmed the new directional scattering. The Sun tint is now localized to the Sun-facing horizon and realistic twilight is restrained; saturated violet treatment remains isolated to the fantasy profile.
- The visual harness now requests the complete twenty named Phase 1C states and records exact per-frame camera, time, seed, revision, and world-state hashes. Forest and coastal mood frames remain evidence of the current authoritative scene only; they are expected to fail biome-content criteria until licensed production foliage and water exist.

## Remaining visual work

- Dense antialiased pole-safe starfield.
- Structured realistic and stylized Milky Way.
- Moon surface/exposure refinement.
- Partial, annular, total, and diamond-ring eclipse rendering with world response.
- Cloud lighting and volumetric shafts.
- Data-driven biome/style profiles and authoring controls.
- Expanded packaged capture manifest and measured GTX 1650 quality budgets.

## Twenty-frame corrective gate

- Manual inspection of the exact packaged `bc22c5e` evidence found four bounded harness/compositor defects:
  - the world-scale Moon reused the close-up `moonSize=22`;
  - eclipse variant classification used the authoring size multiplier instead of the rendered Sun/Moon angular-radius ratio;
  - the diamond-ring state had only a symmetric annular rim;
  - quality volumetric clouds produced unstable horizon speckling at shallow ray angles.
- The current gate gives the world-scale Moon its own `moonSize=4` capture state and restores `moonSize=22` only for the close-up.
- Eclipse silhouette radius, totality, annularity, and diamond-window logic now use the same rendered angular radii and actual Sun/Moon directional separation.
- Diamond-ring rendering adds a bounded asymmetric photosphere core and horizontal/vertical flare localized to the correct limb.
- Quality clouds use the stable layered solution near the horizon and crossfade into bounded volumetric marching above it.
- Focused lunar/celestial/projection tests: 19/19 passed.
- PowerShell visual-harness parser: passed.
- Next: run full verification, package the exact committed head, and manually inspect frames 09, 12, 13, and 15 before accepting this gate.
- Exact packaged `34aa554` evidence passed the four bounded fixes: corrected world Moon scale, distinct annularity, asymmetric diamond ring, and restored landscape corona.
- Manual review still rejected hard-edged one-pixel stars and excessive daytime eclipse stars. The follow-up removes the hard disc maximum so all star cores use the antialiased Gaussian PSF, and gates sparse eclipse stars to near-totality only.
- Exact packaged `ab0c367` removed annular-daylight stars but proved the PSF footprint was still over-expanded by raw scalar `fwidth`, producing dash-like points. It also isolated a low-coverage volumetric-cloud cluster in the annular frame.
- The next correction uses a half-pixel derivative footprint with a smaller Gaussian radius and routes sparse cloud coverage through the stable layered path; bounded volumetrics remain for overcast/storm coverage.
- Exact packaged `3d562ab` removed the sparse-cloud cluster and reduced star elongation, but manual review still found perspective-stretched points near the viewport edges.
- Star identities and distribution remain deterministic in world-space; only the optical point-spread evaluation moves into projection-aware pixel coordinates so every non-hero star stays circular across the camera frustum.
- The legacy Phase 1C integration runner interpreted the intentional star marker change as a missing migration and attempted broad source rewrites. Its default mode is now validation-only; legacy mutation requires the explicit `OMNIFORGE_ALLOW_PHASE1C_MIGRATION=1` opt-in.
- Exact packaged `1956607` verifies circular screen-space star PSFs throughout the camera frustum. The deterministic world-space distribution, density classes, colors, and rare hero rays remain intact.
- The next Moon gate replaces the uniformly populated crater grid with sparse hierarchical populations, irregular rims, restrained ejecta, and a stronger six-region maria layout; the realistic evidence profile uses a neutral lunar albedo instead of the default cool fantasy tint.
- Exact packaged `138060f` failed manual review because max-composited dark ellipses formed a synthetic paw pattern. The replacement uses noisy weighted basin potentials with overlapping continental structure, reduces maria contrast, and tightens the proof camera from 12° to 7° FOV.
- Exact packaged `df79755` still failed manual Moon review: the basin boundaries were softer, but three isolated dark islands remained visibly synthetic. The next gate replaces procedural macro-albedo with NASA SVS's compact 2025 LRO 2K color mosaic, records provenance and checksum, and keeps the procedural system only as a deterministic fallback and restrained micro-relief source.
- Exact packaged `70b3071` proved the initial LRO integration silently used its fallback: the built-in texture existed in the package, but `/assets/*` is reserved for imported project assets and returned 404 for the application file. The built-in Moon texture now uses `/sky-assets/*` and emits explicit ready/failure diagnostics.
- Exact packaged `e69e2a6` loaded the LRO mosaic, but the capture exposed world-space albedo mapping: the visible lunar face changed with orbital direction and put a longitude seam through the disc. Surface lighting remains world-space, while stable albedo coordinates now use the Moon-local sphere normal. The close-up proof uses a temporary 38-unit disc and restores the authored world scale afterward.
- Exact packaged `af06c00` passes the bounded Moon gate: the attributed LRO albedo is loaded, the familiar maria and crater structure remain stable in Moon-local coordinates, the limb is clean, and the world-scale capture remains separate from the close-up proof.
- Manual review then found a capture-authority defect rather than a renderer defect: the twenty-state harness PATCHed state sequentially, so `sunSize=9` and other eclipse/Moon properties leaked into later golden-hour, twilight, cloud, biome, and final path frames. Those contaminated frames are rejected as lighting evidence.
- The next bounded gate gives every complete visual state a shared deterministic sky baseline before applying its authored overrides. Faint and dramatic Milky Way frames remain intentional derivatives of the isolated night state.
- Exact packaged `467d99f` proves capture-state isolation: the physical Sun scale is restored in golden hour and every later non-eclipse frame, cloud states no longer inherit Moon/eclipsing-disc settings, and the final path proof returns to the same deterministic clear-day sky.
- The clean evidence still rejects a weak golden-hour aureole, globally saturated twilight, and dark world surfaces. The next bounded atmosphere gate narrows warm twilight scattering toward the Sun, preserves a cooler anti-solar upper sky, and adds a constant-cost analytic low-Sun aureole driven by the existing Mie, haze, and humidity controls.
- Exact packaged `9717b9c` reduces realistic-twilight red energy while increasing blue separation, adds modest readable energy to golden/forest/coastal frames, and retains the one-unit physical Sun. The result is improved but world surfaces remain visually too flat and dark.
- The next bounded PBR gate replaces the single-color ambient approximation with normalized zenith/horizon/ground hemisphere irradiance from the same authoritative environment. A daylight-only indirect lift improves readability without altering night or introducing an Editor-only light.
- Exact packaged `12a86ff` validated the new hemisphere uniforms and raised daylight luminance, but manual review rejected the initial 42% chromatic influence: it pushed grass toward cyan and suppressed the brown path toward black. The model is retained while its normalized directional tint is reduced to 18% so authored albedo remains dominant.
- Exact packaged `7de19e8` preserves authored grass/path color while retaining the modest daylight readability gain and true zenith/horizon/ground coupling. The next bounded eclipse gate removes the visible five-fold cosine starburst and replaces it with continuous multi-scale angular noise plus restrained magnetic-axis anisotropy at the same three-noise-sample cost.
- Exact packaged `83adb8b` removes the old geometric five-fold corona wedges. Manual review accepts that root correction but still rejects the evenly mirrored magnetic lobes and the diamond ring's obvious horizontal/vertical mathematical cross.
- The current bounded follow-up makes the two magnetic poles intentionally unequal and replaces axis-aligned exponential bars with a compact Gaussian bead, soft halo, and unequal Moon-limb-local tangential/radial glare. It does not add texture fetches, draw calls, or CPU work.
- Exact packaged `34ba69f` proves the cross artifact is gone, but manual review rejects the first smooth replacement because its subpixel Gaussian footprint almost disappears after real viewport sampling and HDR display mapping. The follow-up widens the same local Gaussian components in Sun-disc space so the bead survives at the evidence resolution without restoring hard bars.
- Exact packaged `3bafc59` restores a readable asymmetric limb event without restoring the screen-axis cross. The overall eclipse remains below photographic final approval, but the bounded bead/corona correction is accepted as the new foundation.
- The next authoring gate exposes atmosphere properties the renderer already owns but the World UI could not edit: Mie directionality, ozone, dust, aerial perspective, saturation, contrast, vibrance, tone mapping, and Milky Way color. It also adds named, data-driven forest, coastal, realistic/faint/fantasy galaxy, total-eclipse, and annular-eclipse profiles without creating parallel sky state.
- Exact packaged `5955f61` contains the expanded controls and profile definitions at the same source identity and retains all twenty visual states. The next bounded physical-atmosphere gate gives stars and the Milky Way one shared analytic optical-depth transmission so haze, Mie, humidity, daylight, and twilight attenuate astronomical backgrounds near the horizon instead of compositing them over bright air.
- Exact packaged `eb82123` passes the optical-depth gate: faint and dramatic Milky Way states remain readable while the twilight frame loses stellar contrast through dense low-altitude air. The renderer already owns per-pass CPU and optional GPU timer-query telemetry; the next evidence gate preserves those real measurements beside every packaged capture instead of inventing GTX 1650 claims from a different GPU.
