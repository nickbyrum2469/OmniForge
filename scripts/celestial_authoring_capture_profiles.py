from __future__ import annotations

from pathlib import Path


CAPTURE_OLD = """$captureSkyDefaults=@{
  celestialMode='manual'
  sunAzimuth=-90;sunElevation=45;sunSize=1;sunGlow=.38"""

CAPTURE_NEW = """$captureSkyDefaults=@{
  # These deterministic evidence profiles intentionally enlarge celestial bodies
  # for Moon/eclipses and therefore declare Artistic scale explicitly. Runtime
  # product defaults remain Physical unless the author selects Artistic mode.
  celestialMode='manual'
  celestialScaleMode='artistic'
  sunAzimuth=-90;sunElevation=45;sunSize=1;sunGlow=.38"""

TEST_MARKER = "test('packaged visual profiles declare artistic body scale explicitly'"
TEST_BLOCK = r'''
test('packaged visual profiles declare artistic body scale explicitly', () => {
  const capture = fs.readFileSync(path.join(ROOT, 'scripts', 'run-phase1c-visual-captures.ps1'), 'utf8');
  assert.match(capture, /\$captureSkyDefaults=@\{[\s\S]*celestialMode='manual'[\s\S]*celestialScaleMode='artistic'/);
  assert.match(capture, /moonSize=1\.25/);
  assert.match(capture, /starSizeMin=\.36;starSizeMax=1\.55/);
});
'''


def prepare_base_test(root: Path, changed: list[str]) -> None:
    """Temporarily restore the base helper-owned test file before validation.

    The original authoring migration validates its baseline file exactly. Later
    guarded migrations may append tests, so remove only this known extension
    before the base migration and restore it afterward. The complete second pass
    remains byte-identical.
    """
    test_path = root / 'tests/phase1h-celestial-authoring-controls.test.mjs'
    test_source = test_path.read_text(encoding='utf-8')
    suffix = '\n\n' + TEST_BLOCK.strip() + '\n'
    if TEST_MARKER in test_source:
        if not test_source.endswith(suffix):
            raise RuntimeError('Celestial authoring capture-profile test extension has unexpected placement.')
        test_path.write_text(test_source[:-len(suffix)].rstrip() + '\n', encoding='utf-8')
        changed.append('tests/phase1h-celestial-authoring-controls.test.mjs')


def apply(root: Path, changed: list[str]) -> None:
    capture_path = root / 'scripts/run-phase1c-visual-captures.ps1'
    capture_source = capture_path.read_text(encoding='utf-8')
    if CAPTURE_NEW not in capture_source:
        if CAPTURE_OLD not in capture_source:
            raise RuntimeError('Expected Phase 1C visual capture sky defaults were not found.')
        capture_path.write_text(capture_source.replace(CAPTURE_OLD, CAPTURE_NEW, 1), encoding='utf-8')
        changed.append('scripts/run-phase1c-visual-captures.ps1')

    test_path = root / 'tests/phase1h-celestial-authoring-controls.test.mjs'
    test_source = test_path.read_text(encoding='utf-8')
    if TEST_MARKER not in test_source:
        test_path.write_text(test_source.rstrip() + '\n\n' + TEST_BLOCK.strip() + '\n', encoding='utf-8')
        changed.append('tests/phase1h-celestial-authoring-controls.test.mjs')
