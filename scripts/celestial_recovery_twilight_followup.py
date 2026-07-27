from __future__ import annotations

from pathlib import Path


def replace_once(path: Path, old: str, new: str, changed: list[str], root: Path, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected twilight follow-up contract was not found for {label}.')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def apply(root: Path, changed: list[str]) -> None:
    sky = root / 'app/sky-pass.js'
    replace_once(
        sky,
        """  vec3 civilTwilightColor=mix(vec3(0.025,0.035,0.09),vec3(0.24,0.075,0.018),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.12+0.28*horizon);""",
        """  vec3 civilTwilightColor=mix(vec3(0.028,0.04,0.1),vec3(0.32,0.1,0.025),twilightSunward);
  sky+=civilTwilightColor*civilTwilightLift*(0.14+0.36*horizon);""",
        changed,
        root,
        'sunward civil-twilight readability',
    )

    tests = root / 'tests/phase1g-celestial-optics.test.mjs'
    replace_once(
        tests,
        """  assert.match(sky, /sky\\+=civilTwilightColor\\*civilTwilightLift\\*\\(0\\.12\\+0\\.28\\*horizon\\)/);""",
        """  assert.match(sky, /sky\\+=civilTwilightColor\\*civilTwilightLift\\*\\(0\\.14\\+0\\.36\\*horizon\\)/);""",
        changed,
        root,
        'twilight source contract test',
    )
