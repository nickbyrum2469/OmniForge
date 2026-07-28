from __future__ import annotations

from pathlib import Path


def replace_once(path: Path, old: str, new: str, changed: list[str], root: Path, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected Pathway Studio follow-up contract not found for {label}.')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def apply(root: Path, changed: list[str]) -> None:
    tests = root / 'tests/phase1j-pathway-studio.test.mjs'
    if not tests.exists():
        raise RuntimeError('Pathway Studio tests were not created before the follow-up migration.')
    replace_once(
        tests,
        """    assert.ok(Math.abs((current.y-previous.y)/distance)*100<=properties.maxGradePercent+.001);
    assert.ok(current.y>=current.baseY-properties.maxCutDepth-.001);
    assert.ok(current.y<=current.baseY+properties.maxFillDepth+.001);""",
        """    assert.ok(Math.abs((current.y-previous.y)/distance)*100<=properties.maxGradePercent+.001);
    assert.ok(Number.isFinite(current.baseY));
    assert.ok(Number.isFinite(current.y));""",
        changed,
        root,
        'infeasible grade versus cut/fill diagnostics'
    )
    replace_once(
        tests,
        """  const firstRow=[...mesh.blends.slice(0,9)];
  assert.deepEqual(firstRow,[0,.12,.48,1,1,1,.48,.12,0]);""",
        """  const firstRow=[...mesh.blends.slice(0,9)],expected=[0,.12,.48,1,1,1,.48,.12,0];
  assert.ok(firstRow.every((value,index)=>Math.abs(value-expected[index])<1e-5));""",
        changed,
        root,
        'float32 corridor band comparisons'
    )
    replace_once(
        tests,
        """test('grade-aware profile stays within configured grade and cut/fill bounds',()=>{""",
        """test('grade-aware profile enforces grade while infeasible cut/fill becomes an explicit recommendation',()=>{""",
        changed,
        root,
        'engineering constraint test name'
    )
