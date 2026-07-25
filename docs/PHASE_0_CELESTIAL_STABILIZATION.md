# Phase 0 — Celestial Authority, Motion, Readability, and Evidence

## Purpose

Phase 0 converts the current Sun and Moon implementation from a mixture of legacy scene lights, transient world-derived objects, and stepped runtime updates into one clean, persistent celestial authority. It is a stabilization milestone, not the final OmniAether or OmniRadiance renderer.

The phase is complete only when the packaged Windows editor proves that the hierarchy, selection, save/reload, automatic time, manual positioning, viewport navigation, exposure assistance, and diagnostic evidence all remain coherent on the target PC.

## 0A — Celestial authority cleanup

### Implemented architecture

- Exactly one canonical Sun proxy and one canonical Moon proxy exist in the active scene.
- Legacy Sun/Moon candidates are merged into the canonical proxies and removed.
- Proxies are persisted before they are exposed through `/api/state` or `/api/v010/world`.
- A GET route may no longer create a selectable entity that does not exist in saved state.
- Selection and editor focus references are remapped when a duplicate legacy object is removed.
- Proxies are protected from deletion, duplication, prefab creation, component authoring, arbitrary renaming, and generic scene-object editing.
- Proxy selection remains valid across save, restart, project reopen, scene switching, and world refresh.
- The Inspector identifies the entry as a shared Celestial Studio authority and links directly to the World workspace.

### Legacy migration rules

A directional light is a legacy Sun candidate when it already has `celestialRole: sun`, is named Sun/Main Sun, or uses one of the known historical Sun IDs. Moon candidates use the equivalent role/name/ID rules. Unrelated directional lights are preserved.

The existing authoritative candidate is reused where possible so scene references are preserved. Duplicate candidates are removed only after a canonical replacement has been resolved.

## 0B — Smooth celestial motion

### Authoritative versus rendered time

The server continues to own deterministic world time. Compact runtime snapshots arrive at a bounded cadence. The viewport no longer copies each sampled celestial rotation directly into the rendered scene.

Instead:

1. The current rendered transform becomes interpolation state A.
2. The incoming authoritative transform becomes state B.
3. Rotation follows the shortest angular path.
4. Numeric celestial properties such as intensity, elevation, and azimuth interpolate over the runtime interval.
5. Large manual/time discontinuities still apply through a full authoritative state update.

This removes visible two-second ticks without weakening save-state or simulation authority.

## 0C — Editor readability and exposure restraint

The existing renderer is still pre-HDR and does not yet provide full physical indirect lighting. Phase 0 therefore applies a restrained correction rather than pretending that OmniRadiance is complete.

- Edit mode uses a small nondirectional authoring fill.
- Edit mode no longer fabricates a white directional Sun at night.
- Exposure assistance remains below the previous forced 1.08 floor.
- Ambient color retains more blue/night and sky/day chroma instead of converging toward gray-white.
- Clear-weather fog distances are increased so terrain depth is visible without becoming a white wall.
- Authored Play-mode exposure, Sun intensity, and ambient values remain unchanged by the authoring assist.
- The World panel reports day/twilight/night factors, exposure, and whether smooth preview is active.

A later renderer milestone will replace independent shader tone mapping with a linear HDR scene target and one final display transform.

## 0D — Evidence and release gates

### Automated gates

- Legacy duplicate migration leaves one Sun and one Moon.
- Both proxies are locked, persistent, and selectable.
- Moon identity survives save/reload.
- Selection repair cannot point at a transient object.
- Deletion and duplication of proxies are blocked.
- Celestial rotation interpolation uses the shortest angular path.
- Edit-mode readability does not invent directional sunlight.
- Existing Inspector-freeze, viewport-navigation, world-time, path, terrain, asset, and packaging tests continue passing.

### Required packaged Windows route

1. Start from the exact branch HEAD and confirm packaged `source-commit` matches it.
2. Open the existing project containing the legacy Sun.
3. Confirm the hierarchy shows exactly one Sun and one Moon.
4. Select Sun, save selection, select Moon, and save selection.
5. Close and restart OmniForge; repeat both selections.
6. Confirm no `Object not found` dialog occurs.
7. Confirm neither proxy can be duplicated, deleted, or converted into a prefab.
8. Open Celestial Studio from each proxy Inspector.
9. Test automatic time for at least three minutes and verify continuous motion.
10. Toggle Edit preview off/on and confirm only the preview mode advances in Edit.
11. Test manual Sun and Moon azimuth/elevation, then return to automatic mode.
12. Capture noon, sunrise, sunset, moonlit night, foggy valley, and overcast views.
13. Verify daytime color is not clipped or gray-white.
14. Verify moonlit terrain remains dark but readable in Edit mode.
15. Enter Play mode and verify the authoring fill is absent.
16. Navigate continuously, Alt-Tab, exit/re-enter pointer lock, and confirm no camera regression.
17. Check diagnostics for errors, rejected promises, WebGL loss, repeated proxy creation, and event-loop stalls.

### Required evidence set

- `phase0-noon.png`
- `phase0-sunrise.png`
- `phase0-sunset.png`
- `phase0-moonlit-night.png`
- `phase0-foggy-valley.png`
- `phase0-overcast.png`
- interaction trace
- renderer CPU profile
- diagnostic log
- packaged build manifest and source commit

## Explicit non-goals

Phase 0 does not claim to complete:

- linear HDR rendering;
- one final tone-map/display pass;
- GGX PBR replacement;
- image-based lighting;
- colored multi-bounce global illumination;
- cascaded Sun shadows;
- production temporal volumetric clouds;
- reflection probes;
- water reflection/refraction integration.

Those become the next expanded version phases after this stabilization gate passes on the real Windows editor.
