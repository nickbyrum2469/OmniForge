# OmniForge Phase 1 — Renderer-Owned Sky and Atmosphere Foundation

## Authority and starting point

This milestone starts from authoritative `main` commit `ab8944bed7f0a805fda8fc5dcad747db18402566`, which contains the machine-verified Scene Block Inspector freeze repair and opt-in runtime diagnostics.

The editor freeze root cause was an Inspector `MutationObserver` reacting to its own inserted Scene Block panel. Phase 1 must preserve the stable `data-v011-panel` marker, coalesced observer callback, diagnostic mode, Edit-mode fill lighting, pointer-lock behavior, camera persistence, spline editing, and bounded remote polling.

No extracted ZIP, old executable, substitute renderer, duplicate atmosphere scene, or second world-state authority may be introduced.

## Current atmosphere problem

The current visible sky is split between DOM/CSS and WebGL:

- `app/v010.js` assigns a CSS linear gradient to `#viewportWrap`.
- `app/v010.css` draws stars and aurora through `#viewportWrap::before`.
- `app/v010.css` draws blurred radial-gradient clouds through `#viewportWrap::after`.
- `app/renderer.js` clears the WebGL color buffer with alpha zero, allowing the CSS background to remain visible behind the 3D scene.

This creates a screen-space environment rather than a world-space environment. The sky and cloud pattern are attached to the viewport rectangle, cannot share the renderer's camera basis, do not produce correct world directions, and cannot become authoritative inputs for lighting, fog, water, reflections, weather, or exported gameplay.

## Phase 1 objective

Replace the normal CSS-backed viewport environment with a renderer-owned world-direction sky pass that:

- responds correctly to camera rotation;
- ignores camera translation for infinitely distant sky features;
- keeps the horizon aligned to world up;
- renders visible sun and moon discs from authoritative celestial directions;
- renders world-anchored stars;
- provides a low-cost world-space cloud foundation;
- shares environment state with terrain fog and scene lighting;
- preserves Edit-mode readability without changing authored Play-mode darkness;
- remains scalable for GTX 1650-class hardware;
- remains compatible with future HDR environments, reflection probes, water, weather, and volumetric clouds;
- remains responsive under the existing Windows interaction soak.

## Non-goals for this milestone

Phase 1 does not claim:

- full physically based atmospheric scattering;
- cinematic multiple-scattering volumetric clouds;
- environment-map import and prefiltering;
- reflection probes;
- cloud-to-terrain shadow maps;
- rain, snow, lightning, wetness accumulation, or indoor weather exclusion;
- OmniHydro water reflections;
- a compute backend;
- a complete render graph.

The architecture must leave clean extension points for those systems without pretending they are already implemented.

## Architecture

### 1. Environment runtime authority

Add `app/environment-runtime.js` as a pure, testable module. It will normalize saved scene/world values into one renderer-facing environment state.

Proposed output:

```js
{
  sunDirection: [x, y, z],
  moonDirection: [x, y, z],
  sunColor: [r, g, b],
  moonColor: [r, g, b],
  dayFactor,
  nightFactor,
  twilightFactor,
  starVisibility,
  horizonColor: [r, g, b],
  zenithColor: [r, g, b],
  groundColor: [r, g, b],
  fogColor: [r, g, b],
  cloudCoverage,
  cloudDensity,
  cloudAltitude,
  cloudThickness,
  cloudSeed,
  cloudWindDirection: [x, z],
  cloudWindSpeed,
  cloudQuality,
  exposure,
  editorMode
}
```

The active directional-light object remains the authoritative sunlight direction until the celestial model is formally migrated. The visible sun disc, direct-light shader, shadow matrix, sky scattering, and future cloud lighting must use that same direction.

The moon direction may initially be derived from the sun direction and time state, but it must be exposed through the shared environment state rather than calculated independently inside unrelated shaders.

### 2. Camera sky basis

Add a pure helper that derives:

- camera forward;
- camera right;
- camera up;
- vertical field-of-view tangent;
- aspect ratio.

The sky ray for normalized screen position `(x, y)` will be:

```text
normalize(forward + right * x * tanHalfFov * aspect + up * y * tanHalfFov)
```

Camera position must not participate in this calculation. Tests will verify that translation leaves the sky ray unchanged while yaw and pitch change it.

### 3. Dedicated `SkyPass`

Add `app/sky-pass.js` with an isolated WebGL2 full-screen triangle pass.

Responsibilities:

- compile and own sky shaders;
- own the full-screen VAO if required;
- bind environment uniforms;
- draw before terrain and scene meshes;
- disable depth writes and depth testing during the pass;
- restore renderer state afterward;
- expose a safe fallback when shader creation fails;
- emit diagnostic timing only when diagnostic mode is enabled.

The sky pass must not allocate arrays or compile shaders per frame.

### 4. Sky shader foundation

The initial analytic shader will include:

- world-up horizon evaluation;
- zenith/horizon gradient based on world ray elevation;
- sun-direction haze and forward scattering approximation;
- sunset/twilight color response;
- visible antialiased sun disc;
- visible moon disc with restrained night contribution;
- procedural directional stars with stable hashing;
- horizon extinction for stars;
- exposure and tone mapping compatible with the existing material pass;
- compatibility cloud evaluation.

The shader should use deterministic, bounded loops only. Compatibility mode must avoid expensive full volumetric ray marching.

### 5. Compatibility cloud foundation

The first real cloud mode will be world-direction based rather than screen-space based.

It will use:

- a saved seed;
- low-cost multi-scale procedural noise;
- world-oriented coordinates derived from view direction and cloud altitude;
- coverage and density controls;
- wind direction and speed;
- time-based advection;
- sun-facing lighting approximation;
- horizon fade;
- weather-dependent darkening;
- zero-cloud fast path.

The cloud layer should visually rotate with the world because the viewed direction changes, not because a flat image is glued to the camera. Camera translation should not move the infinitely distant compatibility cloud layer. Later tiers may add finite-altitude parallax and volumetric reprojection.

### 6. Renderer integration

Modify `app/renderer.js` minimally:

- import `SkyPass` and environment-state helpers;
- create one `SkyPass` in `Renderer3D` construction;
- request an opaque WebGL context where practical, or always render opaque sky output;
- stop clearing to transparent black as the normal environment path;
- clear depth, render sky, then render shadows/world geometry/editor overlays;
- derive fog color from the same normalized environment state;
- preserve the existing Edit-mode `uEditorFill` material behavior;
- preserve diagnostic WebGL checks at the existing one-second cadence;
- avoid changing terrain, path, selection, or model rendering authority.

Proposed order:

```text
Resize
→ Normalize environment state
→ Shadow pass
→ Bind default framebuffer
→ Sky pass
→ Clear depth
→ Terrain and opaque meshes
→ Foliage instances
→ Decals and transparency
→ Grid and spline overlays
→ Selection overlay
→ Diagnostic sampling
```

The shadow pass may remain before the sky pass because it renders to a separate framebuffer.

### 7. CSS and world-panel migration

Modify `app/v010.css`:

- disable normal `#viewportWrap::before` and `::after` atmospheric content;
- retain the legacy CSS environment only under an explicit diagnostic class or data attribute, such as `[data-legacy-sky="1"]`;
- keep `pointer-events: none` for any debug comparison layer;
- keep the WebGL canvas as the authoritative visible environment.

Modify `app/v010.js`:

- stop assigning the production sky gradient to `wrap.style.background`;
- stop using CSS variables as the normal renderer input;
- continue saving and applying atmosphere, cloud, star, time, weather, and lighting settings through authoritative scene/world state;
- mark the viewport as renderer-owned for diagnostics and regression checks;
- optionally expose a diagnostic-only legacy comparison switch without placing it in the normal user workflow.

### 8. State and schema compatibility

Do not delete existing saved atmosphere fields. Existing projects must migrate without destructive changes.

The initial renderer should consume current fields such as:

- `skyTop`;
- `skyBottom`;
- `starIntensity`;
- `starDensity`;
- `cloudCoverage`;
- `cloudDensity`;
- `windDirection`;
- `windStrength`;
- `environmentV010.nightFactor`;
- existing world time and weather fields.

New cloud altitude, thickness, seed, and quality values should receive deterministic defaults if absent. A formal schema migration should be added only when values must be persisted.

## Implementation stages

### Stage 1A — pure environment and camera helpers

Files:

- `app/environment-runtime.js`
- `tests/environment-runtime.test.mjs`

Acceptance:

- translation-invariant sky basis;
- rotation-sensitive sky basis;
- normalized sun/moon directions;
- bounded day/night/twilight factors;
- deterministic cloud defaults;
- current saved projects normalize without mutation.

### Stage 1B — renderer-owned analytic sky

Files:

- `app/sky-pass.js`
- `app/renderer.js`
- `tests/renderer-sky-authority.test.mjs`

Acceptance:

- full-screen sky pass exists inside WebGL;
- opaque output replaces transparent clear dependency;
- sky renders before geometry;
- sun direction is shared with scene lighting;
- shader creation failure produces an explicit fallback and diagnostic rather than a blank viewport.

### Stage 1C — remove production CSS background

Files:

- `app/v010.css`
- `app/v010.js`
- `tests/v010-sky-migration.test.mjs`

Acceptance:

- no normal CSS gradient is assigned as the visible sky;
- pseudo-element stars/clouds are disabled by default;
- legacy comparison requires an explicit diagnostic flag;
- world controls continue to update saved atmosphere state.

### Stage 1D — compatibility clouds and celestial visuals

Files:

- `app/sky-pass.js`
- `app/environment-runtime.js`
- relevant world defaults/schema files only if persistence is required;
- targeted tests.

Acceptance:

- sun and moon discs are visible at valid directions;
- stars are stable in world direction;
- cloud field is deterministic from seed;
- cloud motion uses saved wind;
- zero coverage avoids cloud evaluation work where possible;
- storm/overcast profiles darken clouds without replacing the environment with a flat image.

### Stage 1E — diagnostics and packaged Windows verification

Preserve and extend diagnostic mode with:

- sky-pass timing;
- environment-state summary at low frequency;
- shader compilation failure reporting;
- WebGL context-loss reporting;
- optional world-direction debug view;
- no high-frequency `gl.getError()` calls.

Packaged verification must use the exact branch HEAD and must never report `source-archive` from a Git checkout.

## Performance requirements

Initial targets are provisional and must be measured on actual hardware.

Compatibility target:

- sky and celestial pass: target below 0.5 ms GPU;
- compatibility clouds: target below 1.0 ms GPU;
- no per-frame JavaScript allocations from sky state preparation after warm-up;
- no synchronous texture generation;
- no network requests from the render loop;
- no shader recompilation after initialization;
- no CPU worker required for the analytic compatibility sky;
- zero-cloud mode should be measurably cheaper than cloudy mode.

Balanced and quality volumetric clouds are later work and must use low-resolution buffers, temporal reconstruction, adaptive steps, and fixed GPU budgets.

## Regression protection

The Phase 1 branch must preserve:

- exactly one Scene Block reference panel;
- coalesced Inspector observer behavior;
- all 71 existing tests;
- bounded remote polling;
- stable pointer lock and Escape release;
- WASD and right-drag navigation;
- camera persistence without snapback;
- six spline handles and node editing;
- terrain/path continuity;
- Edit-mode nighttime fill;
- authored Play-mode darkness;
- normal startup without DevTools;
- diagnostic startup with DevTools and JSON instrumentation.

## Automated tests

Required additions:

1. Camera translation does not change normalized sky rays.
2. Camera yaw and pitch change normalized sky rays.
3. Sky ray basis remains orthonormal within tolerance.
4. Sun disc direction uses the same active directional-light vector as material lighting.
5. Night stars are world-direction deterministic.
6. Cloud seed and wind produce deterministic state.
7. Existing project settings normalize safely.
8. WebGL canvas no longer depends on transparent CSS atmosphere.
9. Legacy CSS sky is disabled by default.
10. Zero-cloud mode is supported.
11. Edit-mode fill and Play-mode darkness remain separated.
12. Inspector stability tests remain green.

## Direct Windows acceptance route

Run the actual packaged executable from the authoritative repository and exact branch HEAD.

1. Confirm package `source-commit` equals `git rev-parse HEAD`.
2. Confirm normal startup does not open DevTools.
3. Open diagnostic mode and confirm DevTools/instrumentation work.
4. Select Scene Block and verify one reference panel.
5. Open Hierarchy, Create, Assets, World, and Inspector.
6. Rotate camera continuously through 360 degrees.
7. Confirm horizon and celestial objects remain world-aligned.
8. Translate camera without rotating and confirm the sky does not slide with position.
9. Compare sun disc and terrain shadow direction.
10. Set daytime, sunset, midnight, and sunrise.
11. Confirm nighttime remains readable in Edit mode.
12. Enter Play mode and confirm authored darkness remains unchanged.
13. Change cloud coverage, density, wind direction, and wind speed.
14. Confirm clouds respond without CSS image movement.
15. Enter pointer lock, use WASD, release with Escape, and re-enter.
16. Edit all six spline handles and save.
17. Restart and confirm persistence.
18. Complete a minimum 165-second active interaction soak.
19. Confirm no repeated Inspector mutations, context loss, unhandled errors, failed requests, runaway polling, or post-startup event-loop stalls.
20. Capture daytime, sunset, nighttime, and overcast rendered screenshots plus diagnostic logs.

## Merge gate

Phase 1 may merge only when:

- all source and regression tests pass;
- repository verification passes;
- Windows package verification passes;
- packaged source identity is exact;
- the real packaged editor passes the direct interaction route;
- rendered screenshots demonstrate world-aligned sky behavior;
- the old CSS atmosphere is not visible in normal mode;
- performance measurements are recorded rather than estimated;
- all existing terrain, path, importer, foliage, lighting, persistence, MCP, and editor-stability tests remain green.

## Later environment roadmap

After this milestone:

1. Environment assets: HDR equirectangular import, cubemap conversion, diffuse irradiance, and prefiltered specular maps.
2. Reflection probes and material environment lighting.
3. Balanced volumetric clouds with low-resolution temporal reconstruction.
4. Cloud shadows and weather fronts.
5. Physical atmospheric LUT profiles.
6. Rain, snow, lightning, wetness, accumulation, and indoor exclusion.
7. Water reflection/refraction integration through OmniHydro.
8. Compute-capable backend support without removing the WebGL2 compatibility path.
