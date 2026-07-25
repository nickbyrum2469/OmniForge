# Phase 1B — Lunar Cycle, HDR Display, Starfield, and Lighting Presets

## Objective

Phase 1B makes the Moon an independently orbiting celestial body, derives its illuminated phase from Sun–Moon geometry, supports automatic and authored eclipse events, replaces per-shader display mapping with one HDR scene/display pipeline, replaces the aurora-like Milky Way approximation with a structured galactic band, and exposes complete starfield and lighting-look controls.

## Authority chain

```text
World time + latitude + absolute day
→ celestial mechanics
→ persistent Sun/Moon proxies
→ EnvironmentSnapshot
→ linear HDR scene target
→ one display transform
→ editor overlays
```

The Moon is not a mirrored Sun transform. Its orbit uses a synodic period, draconic/node period, inclination, epoch, and independent right ascension/declination. Its visible phase is derived from the actual angle between the rendered Sun and Moon unless the user explicitly selects manual phase authority.

## Phase 1B-A — Independent lunar orbit

Required:

- Independent Moon rise, transit, and set times.
- Moon may appear during daylight.
- Moon may be below the horizon for an entire night segment.
- New Moon can be effectively invisible except during a solar eclipse.
- Full Moon occurs when Sun and Moon are opposite in the sky.
- Quarter phases occur near 90-degree separation.
- World time crossing midnight advances an absolute day counter so the lunar cycle continues.
- Existing manual Sun/Moon positioning remains an artistic override.

## Phase 1B-B — Lunar phase and events

Required:

- Sun-relative phase is the default authority.
- Manual phase remains available for stylized worlds.
- Moon age, orbit period, orbit inclination, Earthshine, and eclipse mode are editable.
- Automatic solar and lunar eclipses depend on conjunction/opposition and orbital-node proximity.
- Forced solar/lunar eclipse modes exist for authoring and validation.
- Solar eclipse darkens the Sun and sky while preserving a corona.
- Lunar eclipse dims and reddens the Moon.
- Moonlight intensity follows illumination, horizon position, daylight, cloud attenuation, and lunar eclipse strength.

## Phase 1B-C — HDR and display transform

Required:

- Sky and surfaces output linear scene radiance.
- A floating-point RGBA16F scene target is used when supported.
- RGBA8 remains a bounded compatibility fallback.
- Exposure, saturation, contrast, vibrance, tone mapping, and output gamma occur once in the display-transform pass.
- Depth is preserved for editor overlays after the HDR scene is presented.
- Renderer diagnostics report HDR format, size, and revision.

## Phase 1B-D — Stars and Milky Way

Required star controls:

- Density.
- Brightness.
- Minimum and maximum apparent size.
- Twinkle amount and speed.
- Color-temperature variation.
- Seed.
- Daylight extinction.

Required Milky Way controls:

- Brightness.
- Width.
- Detail.
- Orientation.
- Dust-lane strength.
- Color authority.

The Milky Way must read as a broad irregular galactic band with luminous cloud structure, granular star clouds, and dark dust lanes. It must not resemble a vertical aurora curtain.

## Phase 1B-E — Lighting-look presets

Presets edit the same authoritative controls visible in World Studio. They are not hidden renderer modes.

Initial presets:

- Natural Balanced.
- Clear Alpine.
- Golden Hour.
- Overcast Soft.
- Moonlit Night.
- Cinematic Vivid.
- Storm Drama.

Every preset preserves unrelated authored controls and can be inspected and adjusted after application.

## Automated exit gates

- New, quarter, and full Moon geometry tests.
- Independent day/night Moon visibility tests.
- Forced eclipse determinism tests.
- Preset authority tests.
- Static contract proving one HDR display pass and no per-mesh ACES transform.
- Complete repository tests and verification on Linux and Windows.
- Native Windows package built from the exact verified SHA.
- Packaged files include celestial mechanics, HDR pipeline, environment presets, sky shader, and server integration.
- Packaged startup retains one authoritative Sun and Moon.
- Packaged API test proves phase metadata and forced lunar eclipse propagation.

## Target-PC visual acceptance

The final merge requires direct rendered inspection of:

1. New Moon, quarter Moon, full Moon, waxing and waning phases.
2. Moon visible in daylight.
3. Moon rising after midnight and Moon absent during part of a night.
4. Solar and lunar eclipses.
5. Star size variation and twinkle without crawling or block artifacts.
6. Milky Way band orientation, dust lanes, and absence of aurora-like morphology.
7. All seven look presets at noon, sunset, overcast, and night.
8. HDR highlight rolloff, shadow color, material saturation, and editor-overlay depth.
9. Stable viewport navigation, resizing, context recovery, and celestial selection.

## Explicit non-goals

Phase 1B does not yet claim production GGX PBR, image-based lighting, global illumination, cascaded Sun shadows, temporal cloud reconstruction, water reflections, or path-traced lighting. It establishes the correct celestial and HDR/display foundation those systems require.
