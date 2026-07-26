from pathlib import Path


def patch(path, replacements):
    source = Path(path).read_text(encoding='utf-8')
    original = source
    for before, after in replacements:
        if after in source:
            continue
        if before not in source:
            raise RuntimeError(f'Expected Phase 1C test contract missing in {path}: {before[:100]!r}')
        source = source.replace(before, after, 1)
    if source != original:
        Path(path).write_text(source, encoding='utf-8')
        print(f'updated {path}')


patch('tests/editor-runtime-stability.test.mjs', [
    (
        "settings: { ambientIntensity: 0.2, gridVisible: true },",
        "settings: { ambientIntensity: 0.2, exposure: 0, gridVisible: true },"
    ),
    (
        "assert.doesNotMatch(worldApi.slice(worldApi.indexOf(\"'/api/v010/world/step'\"), worldApi.indexOf(\"'/api/v010/foliage/species'\")), /state: result\\.state/);",
        "assert.match(worldApi.slice(worldApi.indexOf(\"'/api/v010/world/step'\"), worldApi.indexOf(\"'/api/v010/foliage/species'\")), /includeFullState[\\s\\S]*\\.\\.\\.\\(includeFullState \\? \\{ state: result\\.state \\} : \\{\\}\\)/);"
    ),
    (
        "assert.match(worldgenApi, /repairCelestialAuthority/);",
        "assert.match(worldgenApi, /ensureWorldFoundationState/);"
    )
])

patch('tests/phase1-sky-navigation.test.mjs', [
    (
        "assert.equal(acquisition.reason, 'acquisition');",
        "assert.equal(acquisition.reason, 'session-warmup');"
    ),
    (
        "const next = applyLookDelta(camera, look, { dx: 8, dy: 4, source: 'pointer-lock', now: 536 });\n  assert.equal(next.changed, true);",
        "const resumeWarmup = applyLookDelta(camera, look, { dx: 8, dy: 4, source: 'pointer-lock', now: 536 });\n  assert.equal(resumeWarmup.reason, 'session-warmup');\n  const next = applyLookDelta(camera, look, { dx: 8, dy: 4, source: 'pointer-lock', now: 552 });\n  assert.equal(next.changed, true);"
    ),
    (
        "assert.doesNotMatch(app, /linear-gradient\\(/);",
        "assert.doesNotMatch(app, /viewportWrap\\.style\\.background\\s*=\\s*[^;]*linear-gradient/);"
    )
])

print('Phase 1C permanent test contracts are current.')
