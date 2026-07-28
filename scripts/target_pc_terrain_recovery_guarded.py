from __future__ import annotations

from pathlib import Path

from target_pc_terrain_recovery_v2 import apply as apply_legacy_target_pc_terrain


def apply(root: Path, changed: list[str]) -> None:
    renderer = (root / 'app/renderer.js').read_text(encoding='utf-8')
    path_visuals = (root / 'app/path-visuals.js').read_text(encoding='utf-8')
    if 'pathwayCorridors:' in renderer and 'buildPathwayCorridor' in path_visuals:
        print('Pathway Studio supersedes the intermediate target-PC ribbon migration; legacy terrain migration skipped.')
        return
    apply_legacy_target_pc_terrain(root, changed)
