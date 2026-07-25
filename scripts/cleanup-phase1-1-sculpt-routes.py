from pathlib import Path

path = Path('server/v011-api.mjs')
source = path.read_text(encoding='utf-8')
start = "    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt$/);"
end = "    ids = match(url.pathname, /^\\/api\\/v011\\/path\\/([^/]+)$/);"
first = source.find(start)
end_index = source.find(end, first if first >= 0 else 0)
if first < 0 or end_index < 0:
    raise RuntimeError('Could not find the Phase 1.1 sculpt route range.')
segment = source[first:end_index]
second = segment.find(start, len(start))
if second >= 0:
    one_group = segment[:second]
    source = source[:first] + one_group + source[end_index:]
    path.write_text(source, encoding='utf-8')
    print('Removed duplicate terrain sculpt route groups.')
else:
    print('Terrain sculpt routes are already unique.')
