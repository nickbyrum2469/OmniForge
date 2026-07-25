# Phase 1B — Stellar Sky Authoring

## Purpose

Phase 1B corrects the night-sky systems without modifying the verified Phase 1A RenderGraph architecture.

The previous Milky Way implementation was a smooth blue procedural band with one noise layer. It had no galactic core, dark dust lanes, structured stellar clouds, independent orientation, or separate aurora model. It could therefore resemble a broad auroral glow instead of the Milky Way.

The previous star field also used binary procedural points with a fixed size and a hard-coded twinkle expression. Density and overall intensity were the only useful authoring controls.

Phase 1B introduces three independent renderer-owned phenomena:

1. authored stellar field;
2. structured Milky Way;
3. optional aurora curtains.

## Starting authority

- Repository: `nickbyrum2469/OmniForge`
- Starting branch: `phase1/linear-hdr-rendergraph-lighting-core`
- Starting commit: `44bbd047e9c9f6e97cea3b58586ffb6cb87ac089`
- Phase branch: `phase1b/stellar-sky-authoring`

Phase 1A pass ordering, frame resources, context-loss handling, Sun/Moon authority, terrain, paths, materials, clouds, and editor behavior remain authoritative.

## Stellar field

The new star renderer uses two sparse octahedrally mapped procedural layers. Each visible sky ray evaluates one cell per layer; it does not scan a 3×3 neighborhood. This keeps the field stable in world direction while avoiding a costly per-pixel neighbor loop.

Every generated star receives deterministic values from the authored seed:

- cell position;
- angular size;
- base brightness;
- twinkle frequency;
- twinkle phase;
- warm/cool temperature mixture.

### Authoring controls

- intensity;
- density;
- daylight extinction;
- minimum size;
- maximum size;
- brightness variation;
- color variation;
- twinkle amount;
- twinkle speed;
- deterministic seed;
- field rotation;
- horizon fade;
- warm-star color;
- cool-star color.

Twinkle time is independent of cloud wind time. Changing cloud speed can no longer change star scintillation speed.

## Milky Way

The Milky Way is represented in a galactic coordinate basis rather than a fixed screen-space or world-space color stripe.

The author controls a plane normal with azimuth and elevation. A third roll control rotates the galactic core and dust structure within that plane.

The shader constructs:

- a finite-width galactic envelope;
- large stellar-cloud structure;
- finer filamentary structure;
- a concentrated galactic core;
- a narrow irregular dark dust lane;
- local stellar knots;
- separate outer-band and core colors.

The dust lane subtracts light from the center of the band rather than adding another colored glow. The core is longitudinally concentrated, making the result read as a galaxy rather than an aurora.

### Authoring controls

- brightness;
- angular width;
- procedural detail frequency;
- dust-lane strength;
- core concentration;
- azimuth;
- elevation;
- roll;
- outer stellar-cloud color;
- galactic-core color.

## Aurora

Aurora is now a separate optional phenomenon. It defaults to zero intensity.

The aurora shader produces vertically bounded animated curtains using independent flow, ribbon, and wisp terms. It does not reuse the Milky Way plane or colors.

### Authoring controls

- intensity;
- primary color;
- secondary color;
- animation speed;
- curtain scale.

## Performance strategy

The night sky remains a single full-screen sky pass inside the Phase 1A Environment pass.

The implementation avoids:

- star geometry objects;
- per-star draw calls;
- CPU-updated star positions;
- texture uploads per frame;
- per-pixel 3×3 star-cell searches;
- coupling star animation to cloud animation;
- separate full-resolution compositing passes for stars, galaxy, and aurora.

The star field uses two constant-cost sparse layers. The more expensive Milky Way and aurora functions return immediately when their authored intensity is effectively zero.

## Persistence and authority

All controls are stored inside the existing authoritative `environmentV010.sky` state. Existing scenes receive backward-compatible defaults. New projects receive stable deterministic defaults.

The World Studio reads and writes the same state used by:

- the renderer;
- saved projects;
- API world updates;
- desktop builds;
- runtime exports.

No separate UI-only sky state is introduced.

## Required regression gates

Automated tests must prove:

- all stellar values normalize to bounded renderer inputs;
- minimum and maximum star size remain ordered;
- Milky Way normal and core axis are normalized and orthogonal;
- aurora defaults off;
- star, Milky Way, aurora, and cloud clocks are independent;
- the old fixed blue Milky Way band is absent;
- the old binary star-cell implementation is absent;
- the optimized stellar field contains no neighborhood loop;
- every authoring control exists in the World Studio;
- every authoring control is persisted in the world PATCH payload;
- stable defaults exist for new projects;
- all previous Phase 0 and Phase 1A tests remain green.

## Windows viewport acceptance

Use the exact packaged commit and validate these reference states:

### Star controls

1. Set star density low and high; confirm the distribution changes without crawling across the camera.
2. Set minimum and maximum size far apart; confirm visible size variation.
3. Set twinkle amount to zero; confirm stars remain stable.
4. Raise twinkle amount and speed; confirm stars scintillate independently rather than pulsing together.
5. Set color variation to zero; confirm neutral stars.
6. Raise color variation; confirm warm and cool stars appear without becoming neon.
7. Change seed; confirm a new deterministic field.
8. Reopen the project; confirm the same field returns.
9. Rotate the star field; confirm it rotates in world space and remains camera-independent.

### Milky Way controls

1. Set aurora intensity to zero.
2. Raise Milky Way brightness.
3. Confirm the band contains irregular bright stellar clouds and a dark central dust lane.
4. Increase core concentration; confirm a localized warm galactic center appears.
5. Change width; confirm the band widens without becoming a uniform gradient.
6. Change azimuth and elevation; confirm the entire galactic plane moves.
7. Change roll; confirm the core and dust structure rotate within the plane.
8. Set Milky Way brightness to zero; confirm it disappears completely while stars remain.

### Aurora separation

1. Keep the Milky Way visible.
2. Raise aurora intensity from zero.
3. Confirm animated vertical curtains appear separately from the galactic band.
4. Change aurora colors and speed.
5. Set aurora intensity back to zero; confirm the Milky Way is unchanged.

### Stability and performance

1. Navigate continuously for at least three minutes.
2. Resize, maximize, and restore the window.
3. Switch between noon, sunset, night, fog, and storm.
4. Test layered, balanced, quality, and reference cloud modes.
5. Confirm no repeating shader, WebGL, promise, or state errors.
6. Confirm the renderer remains interactive on the target machine.
7. Save, close, reopen, and confirm all authored stellar values persist.

## Exit gate

Phase 1B passes only when:

- the Milky Way no longer reads as an aurora;
- stars visibly vary in size and brightness;
- star twinkle is independently controllable;
- star colors and seed are authorable;
- Milky Way orientation, width, dust, core, detail, and colors are authorable;
- aurora is visually and authoritatively independent;
- the complete automated suite passes on Linux and Windows;
- the native Windows package matches the verified source SHA;
- packaged startup and Phase 0 celestial authority pass;
- direct target-PC viewport acceptance passes.

This phase remains separate from future physically based atmospheric scattering, HDR display conversion, temporal volumetric clouds, and astronomical star catalog import.
