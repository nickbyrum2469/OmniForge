from pathlib import Path

path = Path('app/sky-pass.js')
source = path.read_text(encoding='utf-8')
block = "  float eclipseSilhouette=eclipseDisc*uSolarEclipse*uDayFactor;\n  sky=mix(sky,vec3(0.0015,0.002,0.003),eclipseSilhouette*0.985);\n"

while block + block in source:
    source = source.replace(block + block, block, 1)

count = source.count(block)
if count != 1:
    raise RuntimeError(f'Expected exactly one daylight eclipse silhouette block, found {count}.')

path.write_text(source, encoding='utf-8')
print('Canonicalized the Phase 1C eclipse compositor to one silhouette block.')
