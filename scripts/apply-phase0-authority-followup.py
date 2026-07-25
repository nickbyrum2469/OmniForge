from pathlib import Path
import re


def edit(path, transform):
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    result = transform(source)
    if result != source:
        file.write_text(result, encoding='utf-8')
        print(f'updated {path}')


def replace_regex_once(source, pattern, replacement, path, marker, flags=0):
    if marker in source:
        return source
    result, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'Expected Phase 0 follow-up pattern not found in {path}: {pattern[:180]!r}')
    return result


def patch_world_system(source):
    source = replace_regex_once(
        source,
        r"  let sun = scene\.objects\.find\(object => object\.type === 'directionalLight' && object\.properties\?\.celestialRole === 'sun'\)\s*\|\| scene\.objects\.find\(object => object\.type === 'directionalLight' && String\(object\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'sun'\)\s*\|\| scene\.objects\.find\(object => object\.type === 'directionalLight'\);",
        "  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight' && String(object.name || '').trim().toLowerCase() === 'sun');",
        'server/v010-systems.mjs',
        "trim().toLowerCase() === 'sun');\n  if (!sun)"
    )
    source = replace_regex_once(
        source,
        r"(    celestialRole: 'sun',\n    color: hex\(mix\(\[255, 123, 79\], \[255, 244, 214\], day\)\),\n    intensity: Number\(world\.lighting\.sunIntensity \|\| 3\.2\) \* Math\.max\(0\.015, day\) \* cloudAttenuation,)",
        "\\1\n    azimuth: sunAzimuth,\n    elevation: sunElevationDegrees,\n    angularSize: Number(world.sky.sunSize ?? 1),\n    glow: Number(world.sky.sunGlow ?? 1),",
        'server/v010-systems.mjs',
        'angularSize: Number(world.sky.sunSize ?? 1)'
    )
    source = replace_regex_once(
        source,
        r"(    angularSize: Number\(world\.sky\.moonSize \?\? 1\.45\),\n    azimuth: moonAzimuth,\n    elevation: moonElevationDegrees,)",
        "\\1\n    brightness: Number(world.sky.moonBrightness ?? 1),\n    glow: Number(world.sky.moonGlow ?? 0.7),\n    detail: Number(world.sky.moonDetail ?? 1),",
        'server/v010-systems.mjs',
        'brightness: Number(world.sky.moonBrightness ?? 1)'
    )
    return source


edit('server/v010-systems.mjs', patch_world_system)


def insert_after_route_call(source, route, call_pattern, insertion, marker):
    if marker in source:
        return source
    route_pattern = re.escape(f"url.pathname === '{route}'")
    pattern = rf"(?P<prefix>{route_pattern}[\s\S]{{0,500}}?{call_pattern})(?P<suffix>\s*;?)"
    replacement = rf"\g<prefix>;{insertion}\g<suffix>"
    result, count = re.subn(pattern, replacement, source, count=1)
    if count != 1:
        raise RuntimeError(f'Could not patch {marker} in route {route}.')
    return result


def patch_server(source):
    source = insert_after_route_call(
        source, '/api/projects/create',
        r"const state=createProject\(\{name:body\.name,template:body\.template,id:body\.id\}\)",
        "ensureCelestialState(state, 'project-create')",
        "ensureCelestialState(state, 'project-create')"
    )
    source = insert_after_route_call(
        source, '/api/projects/open',
        r"const state=openProject\(body\.projectId\)",
        "ensureCelestialState(state, 'project-open');writeState(state)",
        "ensureCelestialState(state, 'project-open')"
    )
    source = insert_after_route_call(
        source, '/api/projects/duplicate',
        r"const state=duplicateProject\(body\.projectId,body\.name\)",
        "ensureCelestialState(state, 'project-duplicate');writeState(state)",
        "ensureCelestialState(state, 'project-duplicate')"
    )
    source = insert_after_route_call(
        source, '/api/projects/import',
        r"const state=importProject\(body\.sourcePath,\{name:body\.name\}\)",
        "ensureCelestialState(state, 'project-import');writeState(state)",
        "ensureCelestialState(state, 'project-import')"
    )
    source = insert_after_route_call(
        source, '/api/projects/locate',
        r"const state=locateProject\(body\.projectId,body\.sourcePath\)",
        "ensureCelestialState(state, 'project-locate');writeState(state)",
        "ensureCelestialState(state, 'project-locate')"
    )
    source = insert_after_route_call(
        source, '/api/project',
        r"const state=createProject\(\{name:body\.name,template:body\.template,id:body\.id\}\)",
        "ensureCelestialState(state, 'legacy-project-create');writeState(state)",
        "ensureCelestialState(state, 'legacy-project-create')"
    )
    return source


edit('server/server.mjs', patch_server)
print('Applied Phase 0 authority follow-up: preserve unrelated lights, expose complete proxy details, and repair project lifecycle responses.')
