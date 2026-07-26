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
    """  assert.match(sky, /float radiusPixels=mix\\(max\\(0\\.4,uStarSizeMin\\*0\\.52\\)/);\n  assert.match(sky, /rayLength=radiusPixels\\*mix\\(2\\.0,4\\.2/);\n  assert.match(sky, /float psf=exp\\(-0\\.5\\*pow\\(pixelDistance\\/sigmaPixels,2\\.0\\)\\)/);\n  assert.match(sky, /float disc=psf\\*0\\.94/);\n  assert.doesNotMatch(sky, /float disc=max\\(core,psf/);""",
    """  assert.match(sky, /float microRadius=mix\\(clamp\\(authoredMin\\*0\\.36,0\\.12,0\\.32\\)/);\n  assert.match(sky, /float heroRadius=clamp\\(microRadius\\*\\(1\\.45\\+sizeRandom\\*0\\.65\\),0\\.72,2\\.05\\)/);\n  assert.match(sky, /rayLength=radiusPixels\\*mix\\(2\\.0,4\\.2/);\n  assert.match(sky, /float psf=exp\\(-0\\.5\\*pow\\(pixelDistance\\/sigmaPixels,2\\.0\\)\\)/);\n  assert.match(sky, /float core=psf\\*mix\\(0\\.76,0\\.94,hero\\)/);\n  assert.match(sky, /float halo=exp\\(-0\\.5\\*pow\\(pixelDistance\\/haloSigma,2\\.0\\)\\)\\*hero\\*0\\.16/);\n  assert.match(sky, /hero\\*uStarRayStrength\\*0\\.045/);\n  assert.doesNotMatch(sky, /float disc=max\\(core,psf/);""",
)

replace_once(
    'tests/phase1c-stabilization.test.mjs',
    """  assert.match(sky, /eclipseSilhouette=eclipseDisc\\*eclipseActive\\*uDayFactor/);""",
    """  assert.match(sky, /float eclipsePresentationVisibility=uSunVisibility\\*celestialHorizonMask/);\n  assert.match(sky, /eclipseSilhouette=eclipseDisc\\*eclipseActive\\*eclipsePresentationVisibility/);""",
)

replace_once(
    'tests/phase1c-visual-projection.test.mjs',
    """  assert.match(sky, /float radiusPixels=mix\\(max\\(0\\.4,uStarSizeMin\\*0\\.52\\)/);\n  assert.match(sky, /float psf=exp\\(-0\\.5\\*pow\\(pixelDistance\\/sigmaPixels,2\\.0\\)\\)/);\n  assert.match(sky, /float disc=psf\\*0\\.94/);\n  assert.doesNotMatch(sky, /float disc=max\\(core,psf/);""",
    """  assert.match(sky, /float microRadius=mix\\(clamp\\(authoredMin\\*0\\.36,0\\.12,0\\.32\\)/);\n  assert.match(sky, /float heroRadius=clamp\\(microRadius\\*\\(1\\.45\\+sizeRandom\\*0\\.65\\),0\\.72,2\\.05\\)/);\n  assert.match(sky, /float psf=exp\\(-0\\.5\\*pow\\(pixelDistance\\/sigmaPixels,2\\.0\\)\\)/);\n  assert.match(sky, /float core=psf\\*mix\\(0\\.76,0\\.94,hero\\)/);\n  assert.match(sky, /float halo=exp\\(-0\\.5\\*pow\\(pixelDistance\\/haloSigma,2\\.0\\)\\)\\*hero\\*0\\.16/);\n  assert.match(sky, /hero\\*uStarRayStrength\\*0\\.045/);\n  assert.doesNotMatch(sky, /float disc=max\\(core,psf/);""",
)

replace_once(
    'tests/phase1c-visual-projection.test.mjs',
    """  assert.match(sky, /eclipseSilhouette=eclipseDisc\\*eclipseActive\\*uDayFactor/);""",
    """  assert.match(sky, /float eclipsePresentationVisibility=uSunVisibility\\*celestialHorizonMask/);\n  assert.match(sky, /eclipseSilhouette=eclipseDisc\\*eclipseActive\\*eclipsePresentationVisibility/);""",
)

print('Updated test contracts:')
for relative in CHANGED:
    print(f'- {relative}')
