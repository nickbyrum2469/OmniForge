# Phase 1C–1F — Crash, Celestial, Atmosphere, and Sky Quality Repair

Authoritative base: `b065136471c86b8a531933e41144c894a704836f`

This corrective milestone treats the target-PC viewport closure and the reported celestial/atmosphere defects as release blockers. The real rendered editor is the final authority.

## Phase 1C — Crash containment and celestial coherence

### Required implementation

1. Record renderer-process, GPU-process, WebGL-context, unhandled renderer, and runtime exits as structured incidents under the desktop data root.
2. Keep the application shell alive after a renderer/GPU failure and perform bounded automatic recovery. Repeated failures must stop automatic reloads and offer Safe Mode rather than loop forever.
3. Guard the animation loop so a single render exception cannot terminate frame scheduling or leave pointer lock active.
4. Do not render protected Sun/Moon authority proxies as ordinary scene spheres.
5. Derive the visible Sun direction and direct-light direction from the same azimuth/elevation authority.
6. Replace eased sample-to-sample celestial interpolation with continuous linear angular interpolation and interpolate lighting/atmosphere settings on the same timeline.
7. Correct solar-eclipse occluder alignment and allow explicit apparent-size coverage.

### Exit gate

- Three minutes of continuous navigation, rapid look motion, Alt-Tab, resize, pointer-lock release/re-entry, and high-speed time preview without application exit.
- Exactly one visible Sun and one visible Moon.
- Direct-light direction matches the visible Sun.
- Sun/Moon motion and lighting do not stop at sample boundaries.
- Forced total solar eclipse fully covers the photosphere while preserving the corona.

## Phase 1D — Atmosphere clarity, exposure, shadows, and presets

### Required implementation

1. Separate clear-air haze, Mie scattering, humidity, weather fog, daytime fog response, and nighttime fog response.
2. Replace permanent-smog defaults with a genuinely clear blue-sky baseline.
3. Increase indirect readability while reducing direct-light clipping and crushed shadow floors.
4. Persist the selected look preset. Manual edits must move the world to an explicit `custom` look instead of silently reverting to Natural Balanced.
5. Add and tune Clear Day, Clear Alpine, Natural Balanced, Golden Hour, Overcast Soft, Clean Twilight, Moonlit Night, Cinematic Vivid, Storm Drama, Horror Fog, and Fantasy Sky.

### Exit gate

- Clear Day has no visible fog at ordinary terrain distances.
- Fog remains available during daytime and nighttime when authored.
- Preset selection survives Apply, project save, restart, and World-panel refresh.
- Shadows retain readable color and detail without making daylight flat.

## Phase 1E — Moon, Milky Way, and stars

### Moon

- Earth-like crater and maria pattern with stable spherical mapping.
- Controllable crater strength, maria strength, relief, surface contrast, pattern rotation, pattern seed, limb darkening, halo, size, brightness, and style.
- The default should evoke the recognizable patchy Earth Moon without claiming a photographic lunar texture.

### Milky Way

- Direction-space noise rather than screen tiles.
- Variable width, warp, clumping, dust lanes, broken regions, galactic-core bulge, and longitudinal brightness variation.
- No equirectangular pole singularity, square cells, radial convergence point, or perfectly uniform straight stripe.

### Stars

- Pole-safe directional distribution.
- Multiple apparent-size and brightness classes.
- Independent color temperature, twinkle phase/speed, and rare hero stars.
- Optional diffraction rays/glints with controllable strength and length.

### Exit gate

- Moon is unmistakably distinct from the Sun at normal view size.
- No square Milky Way artifacts or pinched convergence point.
- Stars remain stable while rotating the camera and visibly twinkle without synchronized flicker.

## Phase 1F — Authoring controls

- Expose all new Moon, eclipse, star, Milky Way, haze/fog, exposure, and shadow controls in the authoritative World panel.
- Preset changes apply intentionally; manual edits become Custom.
- Provide diagnostics for celestial identities, light/visual angular error, interpolation state, active preset, atmosphere clarity, HDR target, and recent crash incident.

## Verification discipline

Every source-changing stage must run syntax checks, the complete automated suite, repository verification, idempotency checks, native Windows packaging, packaged source-identity audit, packaged startup, packaged API smoke, and direct target-PC visual validation. CI success alone cannot prove visual quality or absence of a machine-specific GPU/input crash.
