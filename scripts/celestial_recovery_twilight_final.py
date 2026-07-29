from __future__ import annotations

from pathlib import Path


PREVIOUS_SKY = """  vec3 civilTwilightColor=mix(vec3(0.028,0.04,0.1),vec3(0.32,0.1,0.025),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.14+0.36*horizon);"""

FINAL_SKY = """  vec3 civilTwilightColor=mix(vec3(0.029,0.0415,0.103),vec3(0.345,0.108,0.027),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.145+0.38*horizon);"""

PREVIOUS_TEST = """  assert.match(sky, /sky\\+=civilTwilightColor\\*civilTwilightLift\\*\\(0\\.14\\+0\\.36\\*horizon\\)/);"""
FINAL_TEST = """  assert.match(sky, /sky\\+=civilTwilightColor\\*civilTwilightLift\\*\\(0\\.145\\+0\\.38\\*horizon\\)/);"""


def apply(root: Path, changed: list[str]) -> None:
    sky = root / 'app/sky-pass.js'
    sky_text = sky.read_text(encoding='utf-8')
    if FINAL_SKY not in sky_text:
        if PREVIOUS_SKY not in sky_text:
            raise RuntimeError('Expected calibrated civil-twilight block was not found.')
        sky.write_text(sky_text.replace(PREVIOUS_SKY, FINAL_SKY, 1), encoding='utf-8')
        changed.append(sky.relative_to(root).as_posix())

    tests = root / 'tests/phase1g-celestial-optics.test.mjs'
    test_text = tests.read_text(encoding='utf-8')
    if FINAL_TEST not in test_text:
        if PREVIOUS_TEST not in test_text:
            raise RuntimeError('Expected calibrated civil-twilight test contract was not found.')
        tests.write_text(test_text.replace(PREVIOUS_TEST, FINAL_TEST, 1), encoding='utf-8')
        changed.append(tests.relative_to(root).as_posix())
