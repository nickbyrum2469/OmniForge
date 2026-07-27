from __future__ import annotations

from pathlib import Path


INITIAL_SKY = """  vec3 civilTwilightColor=mix(vec3(0.025,0.035,0.09),vec3(0.24,0.075,0.018),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.12+0.28*horizon);"""

SECOND_SKY = """  vec3 civilTwilightColor=mix(vec3(0.028,0.04,0.1),vec3(0.32,0.1,0.025),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.14+0.36*horizon);"""

INITIAL_TEST = """  assert.match(sky, /sky\\+=civilTwilightColor\\*civilTwilightLift\\*\\(0\\.12\\+0\\.28\\*horizon\\)/);"""
SECOND_TEST = """  assert.match(sky, /sky\\+=civilTwilightColor\\*civilTwilightLift\\*\\(0\\.14\\+0\\.36\\*horizon\\)/);"""


def apply(root: Path, changed: list[str]) -> None:
    sky = root / 'app/sky-pass.js'
    sky_text = sky.read_text(encoding='utf-8')
    if SECOND_SKY in sky_text:
        pass
    elif INITIAL_SKY in sky_text:
        sky.write_text(sky_text.replace(INITIAL_SKY, SECOND_SKY, 1), encoding='utf-8')
        changed.append(sky.relative_to(root).as_posix())
    elif 'float civilTwilightColor=' not in sky_text:
        raise RuntimeError('Expected twilight follow-up contract was not found for sunward civil-twilight readability.')
    # A later calibrated twilight block is authoritative and must not be downgraded.

    tests = root / 'tests/phase1g-celestial-optics.test.mjs'
    test_text = tests.read_text(encoding='utf-8')
    if SECOND_TEST in test_text:
        return
    if INITIAL_TEST in test_text:
        tests.write_text(test_text.replace(INITIAL_TEST, SECOND_TEST, 1), encoding='utf-8')
        changed.append(tests.relative_to(root).as_posix())
        return
    if 'civilTwilightColor\\*civilTwilightLift' not in test_text:
        raise RuntimeError('Expected twilight follow-up test contract was not found.')
    # A later calibrated test contract is already present.
