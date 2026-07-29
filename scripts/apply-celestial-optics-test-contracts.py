from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGED: list[str] = []


def replace_once(relative_path: str, old: str, new: str) -> None:
    path = ROOT / relative_path
    source = path.read_text(encoding='utf-8')
    if new in source:
        return
    if old not in source:
        raise RuntimeError(f'Expected test contract was not found in {relative_path}: {old[:120]!r}')
    path.write_text(source.replace(old, new, 1), encoding='utf-8')
    CHANGED.append(relative_path)


replace_once(
    'tests/phase1c-stabilization.test.mjs',
    r'''  assert.match(sky, /float microRadius=mix\(clamp\(authoredMin\*0\.36,0\.12,0\.32\)/);
  assert.match(sky, /float heroRadius=clamp\(microRadius\*\(1\.45\+sizeRandom\*0\.65\),0\.72,2\.05\)/);
  assert.match(sky, /rayLength=radiusPixels\*mix\(2\.0,4\.2/);
  assert.match(sky, /float psf=exp\(-0\.5\*pow\(pixelDistance\/sigmaPixels,2\.0\)\)/);
  assert.match(sky, /float core=psf\*mix\(0\.76,0\.94,hero\)/);
  assert.match(sky, /float halo=exp\(-0\.5\*pow\(pixelDistance\/haloSigma,2\.0\)\)\*hero\*0\.16/);
  assert.match(sky, /hero\*uStarRayStrength\*0\.045/);''',
    r'''  assert.match(sky, /float heroProbability=clamp\(uStarHeroFraction,0\.001,0\.008\)/);
  assert.match(sky, /float mediumProbability=/);
  assert.match(sky, /float microRadius=mix\(clamp\(authoredMin\*0\.22,0\.07,0\.16\)/);
  assert.match(sky, /float heroRadius=clamp\([^\n]+0\.68,1\.45\)/);
  assert.match(sky, /rayLength=heroRadius\*mix\(1\.8,3\.4/);
  assert.match(sky, /float psf=exp\(-0\.5\*pow\(pixelDistance\/sigmaPixels,2\.0\)\)/);
  assert.match(sky, /float core=psf\*mix\(0\.7,0\.96,medium\*0\.45\+hero\)/);
  assert.match(sky, /medium\*0\.025\+hero\*0\.1/);
  assert.match(sky, /hero\*uStarRayStrength\*0\.028/);''',
)

replace_once(
    'tests/phase1c-stabilization.test.mjs',
    r'''  assert.match(sky, /float eclipsePresentationVisibility=uSunVisibility\*celestialHorizonMask/);
  assert.match(sky, /eclipseSilhouette=eclipseDisc\*eclipseActive\*eclipsePresentationVisibility/);
  assert.match(sky, /independentMoonVisibility=uMoonVisibility\*\(1\.0-eclipseActive\)/);''',
    r'''  assert.match(sky, /float eclipsePresentationVisibility=uSunVisibility/);
  assert.match(sky, /eclipseSilhouette=eclipseDisc\*eclipseActive\*eclipsePresentationVisibility/);
  assert.match(sky, /independentMoonVisibility=uMoonVisibility\*\(1\.0-eclipseActive\)/);
  assert.match(sky, /float moonOcclusionDisc=1\.0-smoothstep\(0\.94,1\.045,moonRadius\)/);
  assert.match(sky, /stellarCelestialMask=\(1\.0-eclipseSilhouette\)\*\(1\.0-moonOcclusionDisc\)/);
  assert.doesNotMatch(sky, /celestialHorizonMask/);''',
)

print('Celestial recovery test contracts are current.')
for relative in CHANGED:
    print(f'- {relative}')
