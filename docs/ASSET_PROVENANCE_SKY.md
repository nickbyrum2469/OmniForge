# Sky Asset Provenance

## LRO Moon Color Mosaic

- Runtime file: `app/sky-assets/lroc_color_2k.jpg`
- Original filename: `lroc_color_2k.jpg`
- Source: NASA Scientific Visualization Studio, CGI Moon Kit
- Source page: https://svs.gsfc.nasa.gov/4720/
- Direct source file: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg
- Dataset: Lunar Reconnaissance Orbiter Camera natural-color Hapke-normalized WAC mosaic
- Visualizer: Ernie Wright (USRA)
- Scientist: Noah Petro (NASA/GSFC)
- Credit requested by source: NASA's Scientific Visualization Studio
- NASA media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- Downloaded: 2026-07-25
- SHA-256: `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170`
- Dimensions: 2048 × 1024
- File size: 457,942 bytes

### Runtime use

The sRGB color mosaic supplies the authoritative lunar albedo in the renderer-owned sky pass. The built-in file deliberately lives outside the server's reserved `/assets/` route, which is owned by imported project assets. The shader maps the equirectangular mosaic onto the Moon's spherical normal, applies the existing physically connected Sun–Moon phase lighting, and retains restrained procedural micro-relief. If the image cannot be loaded, the existing procedural lunar surface remains available as a deterministic fallback.

The texture contains no NASA insignia, logo, identifiable person, or promotional endorsement. OmniForge credits NASA's Scientific Visualization Studio as the source and must not imply NASA endorsement.
