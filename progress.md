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

## Remaining visual work

- Dense antialiased pole-safe starfield.
- Structured realistic and stylized Milky Way.
- Moon surface/exposure refinement.
- Partial, annular, total, and diamond-ring eclipse rendering with world response.
- Cloud lighting and volumetric shafts.
- Data-driven biome/style profiles and authoring controls.
- Expanded packaged capture manifest and measured GTX 1650 quality budgets.
