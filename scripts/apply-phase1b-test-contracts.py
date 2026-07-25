from pathlib import Path

path = Path('tests/v010.test.mjs')
source = path.read_text(encoding='utf-8')
old = """    assert.equal(initial.body.world.schemaVersion, 1);
    assert.ok(initial.body.scene.settings.environmentV010);"""
new = """    assert.equal(initial.body.world.schemaVersion, 2);
    assert.ok(Number.isFinite(initial.body.world.time.absoluteDay));
    assert.equal(initial.body.world.sky.moonPhaseMode, 'sun-relative');
    assert.ok(Number(initial.body.world.sky.moonOrbitPeriodDays) > 1);
    assert.ok(initial.body.scene.settings.environmentV010);
    assert.ok(initial.body.scene.settings.environmentV010.celestial?.moon);"""
if new in source:
    print('Phase 1B v0.10 bootstrap contract is already current.')
elif old in source:
    path.write_text(source.replace(old, new, 1), encoding='utf-8')
    print('Upgraded the v0.10 bootstrap regression to the Phase 1B World schema.')
else:
    raise RuntimeError('The v0.10 bootstrap schema assertion was not found.')
