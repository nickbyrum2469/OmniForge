Original prompt: Implement the attached OmniForge sky, celestial, atmosphere, cloud, lighting, eclipse, biome-lighting, performance, and packaged visual-evidence plan against the 14 supplied reference images on phase1c/crash-celestial-atmosphere-stabilization.

## Path Network v2 replacement

- New request: replace the legacy path runtime with one authoritative 3D graph, compiler, terrain modifier, construction system, worker pipeline, editor, API, and packaged verification path.
- Preserved the previous 1,003-line unverified path experiment on local-only branch `backup/pathway-experiment-20260729` at commit `eacc958`.
- Clean implementation branch: `feature/v012-path-network-replacement`, based on `c982e4b88e5c378931b8c72fcdc00c88aa693025`.
- Exact immutable failure fixture remains at `C:\Users\nickb\Documents\OmniForge-TargetPC-Pathway-Test\20260728-192556`; project state SHA-256 is `3C3548710AEF8D732E493A2553ED50469182F3E158874A7309C24E101B07B134`.
- Gate 1 adds the versioned graph, deterministic legacy migration, validation, and atomic transaction foundation without changing rendering.
- Gate 2 adds the standalone authoritative compiler: adaptive Hermite curves, arc-length stations, height-mode resolution, bounded vertical profiles, parallel-transport frames, junction discovery, nearest-point queries, and deterministic Civil Assist decisions.
- Gate 3 begins the replacement geometry: road core and shoulders share compiled stations, true dead ends alone receive caps, and multi-arm intersections use cleaned filleted portal polygons with validated Earcut triangulation instead of radial discs.
- Gate 4 begins explicit terrain ownership: the unchanged procedural terrain is queried through a chunk-indexed signed-distance modifier field with distinct road, shoulder, drainage, blend, bridge, and tunnel behavior. No live renderer cutover has occurred yet.
- Construction geometry now derives from the same compiled stations and terrain boundary registry: cut/fill earthworks, retaining faces, bridge girders/piers, swept tunnel lining, and bounded pedestrian stairs are structural submeshes rather than cosmetic junction patches.
- A cached runtime bundle now owns the graph, compiled stations, terrain modifier, geometry, and generation diagnostics. Collision, navigation, foliage, grounding, streaming, and rendering adapters reference that same bundle instead of resampling the route independently.
- The live WebGL renderer now consumes the v2 runtime for terrain heights/material masks, road and construction meshes, editor center/edge/junction guides, terrain picking, and path shadow submission. Legacy source remains only as a temporary rollback target until packaged visual approval.
- The first live v2 browser cutover defects are corrected: the browser uses a vendored, licensed Earcut module; minor sub-drainage profile corrections stay conforming instead of generating broad earthwork; and two-arm spline nodes share exact cross-section frames. The regenerated saved scene at `output/path-network-v2-live-3` has no prior brown wedge and no browser console errors; generated evidence remains untracked.
- The constraint-driven world foundation begins by wrapping the existing procedural terrain in one `TerrainQueryService`: explicit natural/authored/proposed/final/runtime views, multiresolution tile samples with halo borders, revisioned dirty bounds, and cached slope/aspect/curvature/roughness/relief/flow/suitability fields. Path compilation now reads authored-natural terrain through that service, preventing self-reinforcing grading.
- A distinct data-driven trail family and deterministic terrain-aware solver are under test. It uses 16-direction heading state, nonlinear local-grade cost, full edge sampling, hard limits, forbidden-region checks, diverse policies, fine accepted-route revalidation, and per-segment cost reports. It does not claim to solve roads, highways, or rail.

## Live-project visual regression gate

- The exact packaged `04fa2169e98c966eb62910055b9528e9b865c0eb` build was confirmed running from the authoritative repository.
- The user's saved `Custom` world exposed two gaps not covered by the controlled capture presets:
  - normal Moon rendering did not mask stellar and Milky Way contributions composited later in the sky shader;
  - depth-tested spline guides z-fought with steep terrain and appeared as disconnected fragments.
- Added a shared celestial mask for normal Moon and eclipse occlusion and made spline guides explicit depth-independent editor overlays.
- Added direction-space Sun/Moon interpolation so the nightly azimuth singularity at the nadir cannot sling the light around the horizon.
- Protected Ctrl+W in both the renderer input path and Electron main process so crouch/descend + forward cannot close the editor.
- Added source-contract and behavior regression coverage. Next: run tests, commit/push the bounded repair, rebuild the exact package, and visually test both the saved Custom state and a named realistic-night profile.

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

## HDR backbuffer correction gate

- Exact packaged `4f5de8f` preserved runtime evidence and exposed a real every-frame Chromium/WebGL failure: `GL_INVALID_OPERATION: glBlitFramebuffer: Invalid operation on multisampled framebuffer`. The HDR target is single-sampled while Electron's default backbuffer is multisampled, so copying the HDR depth renderbuffer into the default depth buffer is invalid.
- The bounded root correction keeps editor overlays in the HDR render graph, where the authoritative scene depth already exists, then performs the display transform once at the end. `HDRPipeline.present()` no longer attempts a cross-sample-count depth blit. A permanent renderer-contract test locks both the pass order and the absence of `blitFramebuffer`.
- Exact packaged `c76f04d` runs the twenty-state evidence set with `shadow > environment > opaque-world > editor-overlays > display-transform > diagnostics`; preserved runtime logs contain zero framebuffer errors, WebGL context losses, render-pass failures, or crashes. A separate guides-enabled packaged capture proves the grid and terrain-conforming spline remain visible and depth-aware in HDR.
- Manual review still rejects the weak low-Sun mood in golden-hour, forest-morning, and coastal-backlight states. The next bounded atmosphere correction derives wavelength-dependent Sun transmission from the existing Rayleigh, Mie, haze, and dust state, then adds one localized azimuth/elevation lobe so low-Sun energy is warm and directional rather than a full-horizon color wash.
- Exact packaged `7819ef7` keeps clear-day and night identities intact, adds a localized warm low-Sun region, preserves a cool upper twilight sky, and gives the physical Sun a compact angular halo. The same exact package records zero runtime/WebGL failures. Golden-hour and twilight are improved foundations but remain below the photographic references; forest shafts and coastal reflections cannot be honestly approved until licensed trees and production water exist in the authoritative scene.

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
- Exact packaged `641082b` records twenty render-graph snapshots. On this PC's RX 7900 XTX, the environment pass measured about 0.30–0.38 ms for clear, twilight, galaxy, and eclipse states and about 1.05–1.12 ms for quality overcast/storm states. These are valid measurements for this GPU only, not GTX 1650 certification. The evidence harness now also preserves desktop/server logs, incidents, crash dumps, and session lifecycle records before deleting its temporary runtime.

## Celestial visibility and optical-star gate

- Separates geometric Sun-disc visibility from the broad day/night lighting factor so the physical Sun can cross the horizon instead of crossfading into another celestial presentation.
- Clips Sun, Moon, eclipse silhouette, corona, and celestial glow against the geometric horizon.
- Preserves the visible Moon independently from its daytime world-light contribution and removes an unnecessary second linear phase-darkening term.
- Caps ordinary stellar point-spread footprints, reserves larger halos and glints for rare hero stars, and strengthens bounded hero-star rays without restoring square or dash artifacts.
- Adds behavior and shader-contract tests. Exact packaged visual approval is still required.

## Celestial compositor recovery gate

- Removed the ray-level horizon guillotine that visibly sliced Sun and Moon discs.
- Composed stars, hero glints, planets, and Milky Way behind one geometric Moon occluder.
- Composited the opaque lunar surface after the masked astronomical background.
- Added lunar-map highlight compression and capped micro/medium/hero star optics.
- Derived day, night, and twilight continuously from interpolated solar elevation.
- Added predictive spherical interpolation across compact runtime snapshot intervals.
- Preserved wide manual Custom ranges while constraining astronomical Physical mode.

The branch remains blocked pending exact packaged Windows visual validation.

## Celestial authoring controls

- Decoupled orbital positioning from visual body scale.
- Physical mode retains safe angular-size clamps; Artistic mode honors full Sun, Moon, and star sliders while time-driven orbits continue normally.
- Added numeric authored/rendered readouts so clamping is explicit instead of silent.
- Added debounced runtime-only preview and persistence for celestial, atmospheric, star, Milky Way, cloud, and weather controls.
- Added server runtime responses and regression coverage for persistence, scale authority, and UI wiring.

The PR remains draft pending exact packaged Windows and target-PC interaction validation.

## Target-PC terrain and path surface recovery

- Added a dense terrain-conforming road surface independent of the capped terrain vertex grid.
- Preserved analytic terrain cut/fill, picking, physics, and saved spline coordinates.
- Added target-PC diagnostics when terrain vertex spacing is too coarse for path blending.
- Kept spline guides as editor overlays while the actual road renders in the opaque world pass.

The branch remains blocked until the user validates the saved terrain and path on the RX 7900 XTX package.

## Pathway Studio engineering corridor gate

- Replaced the two-edge ribbon with a nine-band crowned roadbed, shoulders, drainage, side slopes, and terrain seams.
- Added grade limits, vertical smoothing, banking, curve-radius diagnostics, and scale-aware depth lift.
- Added trail, dirt, gravel, paved, mountain, highway, and fantasy-stone presets.
- Added live Pathway Studio controls and bridge, tunnel, and retaining-wall recommendations.
- Added route telemetry for target-PC proof instead of relying on editor spline visibility.

The branch remains blocked until the exact Windows package is tested against the user's saved terrain on the RX 7900 XTX.

## Target-PC pathway authority and feasibility repair

- Baseline captured from the exact packaged commit `20805d70ef556b26d0a08eed75896f6d8aaf58ca` using the real saved project. The visible failure contained a suspended road slab, vertical terrain bands, a folded underside, and a second older terrain-painted path.
- The saved project was copied without mutation to `C:\Users\nickb\Documents\OmniForge-TargetPC-Pathway-Test\20260728-181917\OmniForge`; its state hash matches the original.
- Root cause: the vertical-profile compiler enforced grade after clamping cut/fill. The final grade pass could move stations outside their local cut/fill bounds. The server summed fill over all stations and then declared the route valid using grade alone.
- Additional root cause: the production terrain shader still painted every path through the legacy terrain mask while Pathway Studio separately rendered a dedicated corridor.
- The corridor is now the default surface and terrain-engineering authority. Legacy terrain painting/deformation remains available only through explicit compatibility authority values.
- Grade, cut, and fill are solved as one bounded feasibility problem. Infeasible routes stay within local cut/fill bounds and are marked `BLOCKED` instead of being presented as gameplay-ready.
- Adaptive cut/fill joins search outward for terrain intersection using configurable cut/fill slope ratios.
- Corridor meshes now report finite/index/degenerate/vertical-edge/frame validation. Unsafe terrain joins are blocked from production rendering.
- Editor spline guides now come from the exact final corridor rows rather than independently resampling raw terrain.
- The exact saved branch fixture now reports `blocked-infeasible-profile`; it no longer activates the old terrain material/deformation authority.
- Source tests and repository verification pass with 162 tests. Exact packaged target-PC visual acceptance is still required; merge recommendation remains `BLOCKED`.
- Exact packaged commit `2595a05` removed the giant slab and duplicate terrain mask at the identical saved camera. The invalid branch is withheld from production rendering, and its Pathway Studio inspector reports 119% maximum grade with route state `BLOCKED`.
- Manual UI inspection found the conflict badge inherited the green success styling. A permanent red failure state was added before further package acceptance.
- Live node editing exposed an additional inspector defect: coordinate/insert/delete/split buttons referenced render-local node variables and threw `ReferenceError`. Node selection is now a shared inspector value, and spline-edit/selection state participates in the inspector render signature.
- Added a revision-aware multicore generation pool that reserves one logical processor for editor/render input and rejects or cancels stale route work.
- Added deterministic terrain-aware trail solving with nonlinear grade costs, hard route limits, adaptive edge sampling, multiple candidate policies, and Path Network v2 serialization.
- Generated trail candidates explicitly opt out of terrain deformation; first-pass routing is a non-destructive rendered corridor over authored-natural terrain.
- Path Network v2 now owns the visible path inspector: exact 3D node coordinates, terrain/offset/absolute height modes, construction locks, Civil Assist, revision-aware undo, and right-click insertion use the `/api/v012/path/*` transaction authority.
- Terrain-aware route alternatives run outside the renderer through a lazy work-stealing pool. The pool reserves one logical processor by default, creates only enough workers for queued work, rejects stale revisions, and avoids launching dozens of idle workers on high-core CPUs.
- Four deterministic route policies can be previewed through the same compiled runtime used by road surfaces and spline guides. Preview state is render-only until an explicit commit and does not deform the base terrain.
- A real browser gate generated four alternatives, captured the live preview, committed the selected route, and undid it back to the original node positions with zero console errors. On the 24-logical-processor test PC, the first pool activation measured about 1.41 s and the warm repeat about 0.86 s in headless Chromium.
- The renderer now reuses one compiled scene path-runtime set across surface and guide consumers instead of re-requesting it for each path pass. Headless baseline and preview frame cadence were equivalent; exact visible Windows-package input and GPU timing remain required before the performance gate can pass.
- Path Network editor history now supports revision-checked undo and redo. A new edit clears redo history; restoring either direction creates a new monotonic network revision rather than reviving a stale revision.
- The route candidate inspector reports measured polyline length and labels total solve wall time accurately. The restarted live runtime repeated four-policy generation in 1.39 s cold and 0.85 s warm with no browser errors; all 213 source tests and repository verification passed.
- Authored scene structures now compile into deterministic padded route restrictions before worker dispatch. Imported-model bounds, primitive scale, and Y rotation contribute conservative world-space footprints; terrain, paths, celestial proxies, editor-only scale references, previews, and explicit opt-outs are excluded.
- The terrain-aware solver adaptively samples every candidate segment against those footprints, persists constraint provenance into the generated Path Network, and exposes distance, grade, cross-slope, earthwork, scenic, total-cost, and rejection telemetry in the live inspector.
- Browser evidence after this gate showed the cost breakdown, protected-footprint count, deterministic four-candidate preview, commit, undo, and redo in the real editor with no console or page errors. The default starter scene correctly reported zero protected footprints because both visible primitives are explicitly editor-only references.
- This is an integration gate, not final Path Network acceptance. Semantic door/access/crossing constraints, construction heatmaps, full workerized chunk rebuilding, exact target-PC fixture proof, and legacy-runtime deletion remain pending.
- The editor now exposes an opt-in route-cost overlay whose geometry is taken directly from `CompiledPathNetwork` station positions. Grade, generated route cost, and invalid construction diagnostics produce bounded green-to-red guide colors without creating another spline sampler or runtime authority.
- The live browser gate rendered the cost legend and compiled guide, generated four deterministic alternatives in 1.39 s cold and 0.85 s warm, then committed, undid, and redid the selected route with zero console or page errors. All 221 source tests and repository verification passed.
- The headless browser uses a software-rendered frame cadence around 280 ms and is not accepted as target-PC GPU performance evidence. Exact packaged Windows interaction, the preserved failure fixture, construction heatmaps beyond route cost, and final visual approval remain pending.
- The exact preserved target-PC state is now represented by a compact permanent regression fixture tied to SHA-256 `3C3548710AEF8D732E493A2553ED50469182F3E158874A7309C24E101B07B134`. It retains the failing archipelago terrain and both authored paths without committing runtime logs, imported binaries, or the complete mutable project state.
- Root migration defect found: legacy `carveTerrain: false` incorrectly became a manually selected `conform` construction mode. That bypassed Civil Assist and allowed the impossible branch to report as valid despite a measured local grade over 1,000%. Unlocked legacy segments now migrate to `auto`; the old carve flag no longer chooses a v2 construction authority.
- In the exact copied runtime, the feasible path compiled to conform, retaining-wall, and cut/fill intervals with a 13.3% maximum grade. The impossible branch compiled to two explicit `unavoidable-grade-exceeds-limit` failures, modified no terrain, exposed no traversable road surface, and displayed a persistent red blocked status in the Inspector.
- The fixture editor run had no path/runtime errors. Its only console errors were expected 404s for two imported-model records whose mesh files were not included in the preserved evidence folder. All 226 source tests and repository verification passed.
- Right-click node insertion now selects the target segment through `nearestCompiledStation` on the renderer's shared `CompiledPathNetwork`; the old straight control-point-chord query was removed. A handled-hairpin regression proves insertion selects the visible curved branch even when a nearby straight chord would have won under the legacy shortcut.
- Viewport node dragging no longer mutates the authoritative scene or invalidates the full terrain mesh on every pointer event. A render-only cloned Path Network preview is coalesced to animation frames, while pointer release submits exactly one revision-checked transaction.
- The real browser drag gate raised a node through six pointer moves while the source revision and source coordinates stayed unchanged, the terrain GPU mesh was reused by identity, and the preview visibly moved. Release committed one revision; Undo restored the exact original coordinate; no page or console errors were recorded.
