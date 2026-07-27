from __future__ import annotations

from pathlib import Path

from celestial_recovery_followup import apply as apply_followup
from celestial_recovery_runtime import apply as apply_runtime
from celestial_recovery_sky import apply as apply_sky
from celestial_recovery_tests import apply as apply_tests

ROOT = Path(__file__).resolve().parents[1]
CHANGED: list[str] = []

apply_runtime(ROOT, CHANGED)
apply_sky(ROOT, CHANGED)
apply_tests(ROOT, CHANGED)
apply_followup(ROOT, CHANGED)

progress = ROOT / 'progress.md'
progress_text = progress.read_text(encoding='utf-8')
marker = '## Celestial compositor recovery gate'
if marker not in progress_text:
    progress.write_text(
        progress_text.rstrip()
        + '\n\n'
        + marker
        + '\n\n'
        + '- Removed the ray-level horizon guillotine that visibly sliced Sun and Moon discs.\n'
        + '- Composed stars, hero glints, planets, and Milky Way behind one geometric Moon occluder.\n'
        + '- Composited the opaque lunar surface after the masked astronomical background.\n'
        + '- Added lunar-map highlight compression and capped micro/medium/hero star optics.\n'
        + '- Derived day, night, and twilight continuously from interpolated solar elevation.\n'
        + '- Added predictive spherical interpolation across compact runtime snapshot intervals.\n'
        + '- Preserved wide manual Custom ranges while constraining astronomical Physical mode.\n\n'
        + 'The branch remains blocked pending exact packaged Windows visual validation.\n',
        encoding='utf-8',
    )
    CHANGED.append('progress.md')

print('Celestial recovery repair applied.')
for relative in dict.fromkeys(CHANGED):
    print(f'  - {relative}')
