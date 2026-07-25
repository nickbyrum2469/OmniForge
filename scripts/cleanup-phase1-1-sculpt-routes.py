from pathlib import Path

path = Path('server/v011-api.mjs')
source = path.read_text(encoding='utf-8')
start = "    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt$/);"
end = "    ids = match(url.pathname, /^\\/api\\/v011\\/path\\/([^/]+)$/);"
first = source.find(start)
end_index = source.find(end, first if first >= 0 else 0)
if first < 0 or end_index < 0:
    raise RuntimeError('Could not find the Phase 1.1 sculpt route range.')

canonical = '''    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt$/);
    if (ids && req.method === 'POST') {
      const input = await readJsonBody(req);
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        const layer = addTerrainSculptLayer(terrain, input);
        addActivity(state, 'worldgen', 'Applied ' + layer.mode + ' sculpt stamp to ' + terrain.name + '.', { terrainId: terrain.id, layer });
        return { terrain, layer };
      });
      json(res, 201, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt\\/undo$/);
    if (ids && req.method === 'POST') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        return { terrain, removed: undoTerrainSculpt(terrain) };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

    ids = match(url.pathname, /^\\/api\\/v011\\/terrain\\/([^/]+)\\/sculpt$/);
    if (ids && req.method === 'DELETE') {
      const result = mutateState(state => {
        ensureWorldFoundationState(state);
        const terrain = requireTerrain(state, ids[0]);
        return { terrain, removedCount: clearTerrainSculpt(terrain) };
      });
      json(res, 200, { ...result.result, state: result.state });
      return true;
    }

'''
next_source = source[:first] + canonical + source[end_index:]
if next_source != source:
    path.write_text(next_source, encoding='utf-8')
    print('Normalized terrain sculpt routes to one POST, undo, and DELETE group.')
else:
    print('Terrain sculpt routes are already canonical.')
