from pathlib import Path


def edit(path, transform):
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    result = transform(source)
    if result != source:
        file.write_text(result, encoding='utf-8')
        print(f'updated {path}')


def replace_once(source, before, after, path, marker=None):
    if marker and marker in source:
        return source
    if before not in source:
        raise RuntimeError(f'Expected Phase 0 follow-up block not found in {path}: {before[:160]!r}')
    return source.replace(before, after, 1)


def patch_world_system(source):
    return replace_once(
        source,
        "  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight' && String(object.name || '').trim().toLowerCase() === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight');",
        "  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight' && String(object.name || '').trim().toLowerCase() === 'sun');",
        'server/v010-systems.mjs',
        "trim().toLowerCase() === 'sun');\n  if (!sun)"
    )


edit('server/v010-systems.mjs', patch_world_system)


def patch_server(source):
    replacements = [
        (
            "      const body=await readBody(req);releaseActiveProjectLock();const state=createProject({name:body.name,template:body.template,id:body.id});acquireActiveProjectLock(state);\n      addActivity(state,'project',`Created project: ${state.project.name}`);writeState(state);",
            "      const body=await readBody(req);releaseActiveProjectLock();const state=createProject({name:body.name,template:body.template,id:body.id});ensureCelestialState(state, 'project-create');acquireActiveProjectLock(state);\n      addActivity(state,'project',`Created project: ${state.project.name}`);writeState(state);",
            "ensureCelestialState(state, 'project-create')"
        ),
        (
            "      const body=await readBody(req);await assertProjectUnlocked(body.projectId);releaseActiveProjectLock();const state=openProject(body.projectId);acquireActiveProjectLock(state);",
            "      const body=await readBody(req);await assertProjectUnlocked(body.projectId);releaseActiveProjectLock();const state=openProject(body.projectId);ensureCelestialState(state, 'project-open');writeState(state);acquireActiveProjectLock(state);",
            "ensureCelestialState(state, 'project-open')"
        ),
        (
            "      const body=await readBody(req);const state=duplicateProject(body.projectId,body.name);releaseActiveProjectLock();acquireActiveProjectLock(state);",
            "      const body=await readBody(req);const state=duplicateProject(body.projectId,body.name);ensureCelestialState(state, 'project-duplicate');writeState(state);releaseActiveProjectLock();acquireActiveProjectLock(state);",
            "ensureCelestialState(state, 'project-duplicate')"
        ),
        (
            "      const body=await readBody(req);const state=importProject(body.sourcePath,{name:body.name});releaseActiveProjectLock();acquireActiveProjectLock(state);",
            "      const body=await readBody(req);const state=importProject(body.sourcePath,{name:body.name});ensureCelestialState(state, 'project-import');writeState(state);releaseActiveProjectLock();acquireActiveProjectLock(state);",
            "ensureCelestialState(state, 'project-import')"
        ),
        (
            "      const body=await readBody(req);const state=locateProject(body.projectId,body.sourcePath);releaseActiveProjectLock();acquireActiveProjectLock(state);",
            "      const body=await readBody(req);const state=locateProject(body.projectId,body.sourcePath);ensureCelestialState(state, 'project-locate');writeState(state);releaseActiveProjectLock();acquireActiveProjectLock(state);",
            "ensureCelestialState(state, 'project-locate')"
        ),
        (
            "      const body = await readBody(req);\n      const incoming = sanitizeScene(body.scene);",
            "      const body = await readBody(req);\n      const incoming = sanitizeScene(body.scene);",
            None
        )
    ]
    for before, after, marker in replacements:
        if marker:
            source = replace_once(source, before, after, 'server/server.mjs', marker)
    return source


edit('server/server.mjs', patch_server)
print('Applied Phase 0 authority follow-up: preserve unrelated lights and repair project lifecycle responses.')
