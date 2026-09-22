# PULSE Lighting 0.1 — Persistent Surface Transport

PULSE (Persistent Unified Light-State Engine) is OmniForge's experimental dynamic global-illumination architecture.

This branch deliberately replaces the previous probe-volume direction with a much cheaper WebGL2-compatible foundation:

- lighting state is attached to real receiving surfaces;
- the world transport graph is solved outside the render thread in a module Web Worker;
- camera motion does not invalidate the world-lighting solution;
- the renderer receives only compact per-object directional irradiance;
- lighting changes produce signed radiance deltas, including negative deltas when a light turns off;
- no 3D probe texture is uploaded every frame;
- no multi-dozen-ray GI loop is executed per shaded pixel.

## Current 0.1 representation

PULSE 0.1 creates six directional surface cells for box-like scene objects and one cell for planes. Each cell stores:

- world-space position;
- world-space receiver normal;
- surface albedo;
- surface area;
- a small list of important visible transport links.

Transport links are created only when the two receiver faces can see one another and face each other. Link strength uses a form-factor-inspired cosine / area / distance term.

The implementation is intentionally sparse. Each cell retains only its strongest links.

## Lighting update

Direct sun and point lights inject first-bounce reflected radiance into the surface cells.

That energy is propagated through the persistent graph for a small configurable number of bounces.

The solver keeps the previous indirect solution and calculates:

```
delta = currentIndirect - previousIndirect
```

This means turning a light off creates negative radiance deltas rather than requiring a temporal history buffer to slowly forget the previous lighting.

PULSE 0.1 currently re-solves the compact graph when authored lighting changes. The signed delta data is already exposed internally so a future phase can replace the full graph solve with a true prioritized delta-propagation queue.

## Threading model

The transport topology and lighting solution live in `app/pulse-worker.js`.

The main editor/rendering thread does not trace the transport graph.

The render thread only receives compact object lighting records:

- six face normals;
- six face irradiance values.

The WebGL2 material shader performs a small normal-weighted lookup and adds the PULSE irradiance before tone mapping.

## Integration

Shared engine logic:

```
engine/lighting/pulse-core.js
engine/lighting/pulse-benchmark.js
```

Browser/editor integration:

```
app/pulse-lighting.js
app/pulse-worker.js
app/renderer.js
```

The server exposes `/engine/*` as read-only static engine modules so the module worker and Node-side engine logic can share the same PULSE implementation.

The Windows desktop builder packages the `engine/` directory.

## Scene settings

PULSE can be enabled with:

```json
{
  "lightingMode": "pulse",
  "pulseLighting": {
    "enabled": true,
    "intensity": 1.18,
    "maxBounces": 3,
    "maxLinks": 12,
    "maxDistance": 32,
    "bounceRetention": 0.70
  }
}
```

Unlike ordinary edit-mode scenes, PULSE scenes do not receive OmniForge's forced editor ambient-fill minimum. Authored dark levels therefore remain dark enough to expose leaks and incorrect bounce.

## PULSE Foundry benchmark

Create a scene and select:

**PULSE Foundry — lighting benchmark**

The benchmark is intentionally much more demanding than the old ARL box room. It contains:

- an exterior courtyard and sun transition;
- a deep interior gallery;
- a black occlusion doorway;
- red and blue bounce chambers;
- a neutral receiver wall;
- a very thin divider for wrong-side leak testing;
- bright white and near-black receivers;
- rough, matte, and metallic test objects;
- pillars, steps, canopies, and small geometric transitions;
- warm, blue, red, and white point lights.

The initial camera enters from the bright courtyard toward the dark foundry so indoor/outdoor adaptation and light leakage are immediately visible.

## Runtime inspection

PULSE stats are available through both runtime bridges:

```js
window.__omniforgeV011Bridge.pulse()
window.__omniforgeDebug.pulse()
```

The viewport FPS badge also reports either:

```
PULSE warming
```

or the last worker solve time.

## 0.1 constraints

This is a foundation, not the final PULSE architecture.

Current intentional limitations:

- box-like objects use six face cells rather than adaptively subdivided surfels;
- terrain is not part of PULSE transport yet;
- imported meshes are approximated by object-oriented face cells;
- topology rebuild is CPU-side in the Worker;
- lighting changes currently solve the compact graph rather than processing only a queued delta frontier;
- direct point lighting is still limited by the existing renderer's four-light forward path;
- reflections and volumetrics are not yet connected to PULSE state.

## Next phases

1. Adaptive surface-cell subdivision around visibility/radiance gradients.
2. True signed delta frontier propagation with a strict work budget.
3. Persistent and transient radiance lanes.
4. Dynamic visibility epochs for doors and destruction.
5. Surface spatial hash for local queries.
6. Screen-space last-mile verification.
7. Directional transport reservoirs instead of fixed face records.
8. Direct-light importance reservoirs.
9. Reflection queries that shade their hit using PULSE.
10. A global Lighting Work Auction across GI, shadows, reflections, and volumetrics.

The design goal is that steady-state cost approaches the cost of sampling already-solved lighting, while world-lighting work scales primarily with meaningful lighting changes rather than with camera movement or a fixed 3D probe volume.
