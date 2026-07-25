from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, content):
    Path(path).write_text(content, encoding='utf-8')
    print(f'updated {path}')


def replace_once(source, before, after, path, marker=None):
    if marker and marker in source:
        return source
    if before not in source:
        raise RuntimeError(f'Expected block not found in {path}: {before[:160]!r}')
    return source.replace(before, after, 1)


def edit(path, transform):
    source = read(path)
    result = transform(source)
    if result != source:
        write(path, result)


def patch_v010_systems(source):
    source = replace_once(source,
        "  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight');",
        "  let sun = scene.objects.find(object => object.type === 'directionalLight' && object.properties?.celestialRole === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight' && String(object.name || '').trim().toLowerCase() === 'sun')\n    || scene.objects.find(object => object.type === 'directionalLight');",
        'server/v010-systems.mjs', "String(object.name || '').trim().toLowerCase() === 'sun'")
    source = replace_once(source,
        "    ambientColor: hex(mix([55, 69, 104], [190, 207, 224], day)),\n    ambientIntensity: (0.08 + day * 0.42 + Number(world.lighting.indirectStrength || 0.4) * 0.12) * (0.72 + cloudAttenuation * 0.28),\n    fogNear: Math.max(6, Number(world.atmosphere.visibilityKm || 120) * 0.55 * fogMultiplier),\n    fogFar: Math.max(22, Number(world.atmosphere.visibilityKm || 120) * 2.2 * fogMultiplier),\n    exposure: clamp(Number(world.atmosphere.exposure || 1) * (0.82 + day * 0.18) * (0.88 + cloudAttenuation * 0.12), 0.2, 3),",
        "    ambientColor: hex(mix([24, 36, 70], [142, 172, 211], day)),\n    ambientIntensity: (0.055 + day * 0.28 + Number(world.lighting.indirectStrength || 0.4) * 0.09) * (0.78 + cloudAttenuation * 0.22),\n    fogNear: Math.max(12, Number(world.atmosphere.visibilityKm || 120) * 1.1 * fogMultiplier),\n    fogFar: Math.max(48, Number(world.atmosphere.visibilityKm || 120) * 4.8 * fogMultiplier),\n    exposure: clamp(Number(world.atmosphere.exposure || 1) * (0.92 + day * 0.08) * (0.96 + cloudAttenuation * 0.04), 0.2, 2.2),",
        'server/v010-systems.mjs', 'ambientColor: hex(mix([24, 36, 70]')
    return source


edit('server/v010-systems.mjs', patch_v010_systems)


def patch_v010_api(source):
    source = replace_once(source,
        "} from './v010-systems.mjs';",
        "} from './v010-systems.mjs';\nimport { celestialAuthorityNeedsRepair, repairCelestialAuthority } from './celestial-authority.mjs';",
        'server/v010-api.mjs', "from './celestial-authority.mjs'")
    source = replace_once(source,
        "    engineRevision: Number(state.engine?.revision || 0),\n    sceneId: scene.id,",
        "    engineRevision: Number(state.engine?.revision || 0),\n    sceneId: scene.id,\n    sampledAt: Date.now(),\n    visualDurationMs: 2050,",
        'server/v010-api.mjs', 'visualDurationMs: 2050')
    source = replace_once(source,
        "function ensureWorld(state) {\n  state.worldV010 = defaultWorldSettings(state.worldV010 || {});\n  applyWorldToScene(activeScene(state), state.worldV010);\n  return state.worldV010;\n}",
        "function ensureWorld(state, reason = 'world-update') {\n  return repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason }).world;\n}",
        'server/v010-api.mjs', "reason = 'world-update'")
    source = replace_once(source,
        "    if (req.method === 'GET' && url.pathname === '/api/v010/world') {\n      const state = readState();\n      const world = ensureWorld(state);\n      json(res, 200, {",
        "    if (req.method === 'GET' && url.pathname === '/api/v010/world') {\n      let state = readState();\n      if (celestialAuthorityNeedsRepair(state, activeScene)) {\n        state = mutateState(current => repairCelestialAuthority(current, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'world-read-migration' })).state;\n      }\n      const world = defaultWorldSettings(state.worldV010 || {});\n      json(res, 200, {",
        'server/v010-api.mjs', "reason: 'world-read-migration'")
    source = replace_once(source,
        "        const derived = applyWorldToScene(activeScene(state), state.worldV010);\n        addActivity(state, 'world', 'Updated connected time, lighting, atmosphere, sky, clouds, or weather.', { derived });",
        "        const repaired = repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason: 'world-patch' });\n        const derived = repaired.derived;\n        addActivity(state, 'world', 'Updated connected time, lighting, atmosphere, sky, clouds, or weather.', { derived, celestial: repaired.diagnostics });",
        'server/v010-api.mjs', "reason: 'world-patch'")
    return source


edit('server/v010-api.mjs', patch_v010_api)


def patch_server(source):
    source = replace_once(source,
        "import { terrainHeightAt as sharedTerrainHeightAt } from '../app/worldgen.js';",
        "import { terrainHeightAt as sharedTerrainHeightAt } from '../app/worldgen.js';\nimport { defaultWorldSettings, applyWorldToScene } from './v010-systems.mjs';\nimport { celestialAuthorityNeedsRepair, isCelestialProxy, patchCelestialWorldFromProxy, repairCelestialAuthority } from './celestial-authority.mjs';",
        'server/server.mjs', "from './celestial-authority.mjs'")
    helper_marker = "function ensureCelestialState(state, reason = 'state-read')"
    if helper_marker not in source:
        anchor = "function applyObjectPatch(object, patch) {"
        helper = """function ensureCelestialState(state, reason = 'state-read') {
  return repairCelestialAuthority(state, { activeScene, defaultWorldSettings, applyWorldToScene, addActivity, reason });
}

function readStateWithCelestialAuthority(reason = 'state-read') {
  let snapshot = readState();
  if (celestialAuthorityNeedsRepair(snapshot, activeScene)) {
    snapshot = mutateState(state => ensureCelestialState(state, reason)).state;
  }
  return snapshot;
}

"""
        if anchor not in source:
            raise RuntimeError('Could not install celestial state helpers in server/server.mjs')
        source = source.replace(anchor, helper + anchor, 1)
    source = replace_once(source,
        "  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, readState());",
        "  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, readStateWithCelestialAuthority('initial-state-read'));",
        'server/server.mjs', "initial-state-read")
    source = replace_once(source,
        "      if (index < 0) state.scenes.push(incoming); else state.scenes[index] = incoming;\n      state.activeSceneId = incoming.id;\n      if (body.selection) state.selection = body.selection;",
        "      if (index < 0) state.scenes.push(incoming); else state.scenes[index] = incoming;\n      state.activeSceneId = incoming.id;\n      if (body.selection) state.selection = body.selection;\n      ensureCelestialState(state, 'scene-save');",
        'server/server.mjs', "ensureCelestialState(state, 'scene-save')")
    source = replace_once(source,
        "      state.scenes.push(scene);\n      state.activeSceneId = scene.id;\n      state.selection = { objectId: scene.objects[0]?.id || null };",
        "      state.scenes.push(scene);\n      state.activeSceneId = scene.id;\n      state.selection = { objectId: scene.objects[0]?.id || null };\n      ensureCelestialState(state, 'scene-create');",
        'server/server.mjs', "ensureCelestialState(state, 'scene-create')")
    source = replace_once(source,
        "      state.activeSceneId = body.sceneId;\n      state.selection = { objectId: activeScene(state).objects[0]?.id || null };",
        "      state.activeSceneId = body.sceneId;\n      state.selection = { objectId: activeScene(state).objects[0]?.id || null };\n      ensureCelestialState(state, 'scene-select');",
        'server/server.mjs', "ensureCelestialState(state, 'scene-select')")
    source = replace_once(source,
        "      const object = findObject(state, objectId);\n      if (!object) throw new Error('Object not found.');\n      applyObjectPatch(object, body);",
        "      let object = findObject(state, objectId);\n      if (!object) { ensureCelestialState(state, 'object-patch-repair'); object = findObject(state, objectId); }\n      if (!object) throw new Error('Object not found.');\n      if (isCelestialProxy(object)) {\n        patchCelestialWorldFromProxy(state, object, body, defaultWorldSettings);\n        const repaired = ensureCelestialState(state, 'celestial-proxy-patch');\n        object = object.properties?.celestialRole === 'moon' ? repaired.moon : repaired.sun;\n      } else applyObjectPatch(object, body);",
        'server/server.mjs', "celestial-proxy-patch")
    source = replace_once(source,
        "      if (!object) throw new Error('Object not found.');\n      if (object.locked) throw new Error('Object is locked.');\n      scene.objects = scene.objects.filter(item => item.id !== objectId && item.parentId !== objectId);",
        "      if (!object) throw new Error('Object not found.');\n      if (isCelestialProxy(object)) throw new Error('The authoritative Sun and Moon cannot be deleted. Edit them in Celestial Studio.');\n      if (object.locked) throw new Error('Object is locked.');\n      scene.objects = scene.objects.filter(item => item.id !== objectId && item.parentId !== objectId);",
        'server/server.mjs', 'The authoritative Sun and Moon cannot be deleted')
    source = replace_once(source,
        "      const object = findObject(state, body.objectId);\n      if (!object) throw new Error('Object not found.');\n      const clone = structuredClone(object);",
        "      const object = findObject(state, body.objectId);\n      if (!object) throw new Error('Object not found.');\n      if (isCelestialProxy(object)) throw new Error('Celestial proxies cannot be duplicated. Configure additional celestial bodies through Celestial Studio.');\n      const clone = structuredClone(object);",
        'server/server.mjs', 'Celestial proxies cannot be duplicated')
    source = replace_once(source,
        "      if (body.objectId && !findObject(state, body.objectId)) throw new Error('Object not found.');\n      state.selection.objectId = body.objectId || null;",
        "      if (body.objectId && !findObject(state, body.objectId)) ensureCelestialState(state, 'selection-repair');\n      if (body.objectId && !findObject(state, body.objectId)) throw new Error('Object not found.');\n      state.selection.objectId = body.objectId || null;",
        'server/server.mjs', "ensureCelestialState(state, 'selection-repair')")
    return source


edit('server/server.mjs', patch_server)


def patch_v010_ui(source):
    source = replace_once(source,
        "import { applyCompactWorldRuntime, shouldAdvanceWorldTime } from './world-runtime.js';",
        "import { applyCompactWorldRuntime, clearCelestialRuntimeInterpolation, shouldAdvanceWorldTime, updateCelestialRuntimeInterpolation } from './world-runtime.js';",
        'app/v010.js', 'updateCelestialRuntimeInterpolation')
    source = replace_once(source,
        "let timeTimer = null;\nlet timeStepInFlight = false;",
        "let timeTimer = null;\nlet celestialAnimationFrame = null;\nlet timeStepInFlight = false;",
        'app/v010.js', 'let celestialAnimationFrame')
    source = replace_once(source,
        "function synchronizeAuthoritativeEditor() {\n  if (snapshot?.state) window.dispatchEvent(new CustomEvent('omniforge:apply-state', { detail: { state: snapshot.state } }));\n}",
        "function synchronizeAuthoritativeEditor() {\n  const target = window.__omniforgeV011Bridge?.snapshot?.();\n  if (target?.scene?.id) clearCelestialRuntimeInterpolation(target.scene.id);\n  if (snapshot?.state) window.dispatchEvent(new CustomEvent('omniforge:apply-state', { detail: { state: snapshot.state } }));\n}",
        'app/v010.js', 'clearCelestialRuntimeInterpolation(target.scene.id)')
    if 'function animateCelestialRuntime' not in source:
        anchor = "function setStatus(message, error = false) {"
        helper = """function animateCelestialRuntime(now) {
  const target = window.__omniforgeV011Bridge?.snapshot?.();
  if (target) updateCelestialRuntimeInterpolation(target, now);
  celestialAnimationFrame = window.requestAnimationFrame(animateCelestialRuntime);
}

function ensureCelestialAnimation() {
  if (celestialAnimationFrame === null) celestialAnimationFrame = window.requestAnimationFrame(animateCelestialRuntime);
}

"""
        if anchor not in source:
            raise RuntimeError('Could not install smooth celestial animation in app/v010.js')
        source = source.replace(anchor, helper + anchor, 1)
    source = replace_once(source,
        "      <p class=\"v010-section-note\">Time-driven mode follows world time. Manual mode preserves the exact Sun, Moon, and planet positions entered here.</p>\n    </div>",
        "      <p class=\"v010-section-note\">Time-driven mode follows world time. Manual mode preserves the exact Sun, Moon, and planet positions entered here.</p>\n      <div id=\"v010EnvironmentDiagnostics\" class=\"v010-status\">Celestial authority loading…</div>\n    </div>",
        'app/v010.js', 'id="v010EnvironmentDiagnostics"')
    source = replace_once(source,
        "  field('v010CelestialReadout').textContent = (world.sky.celestialMode === 'manual' ? 'MANUAL' : formatTime(world.time.hours)) + ' · MOON ' + (Number(world.sky.moonPhase ?? 0.72) * 100).toFixed(0) + '%';",
        "  field('v010CelestialReadout').textContent = (world.sky.celestialMode === 'manual' ? 'MANUAL' : formatTime(world.time.hours)) + ' · MOON ' + (Number(world.sky.moonPhase ?? 0.72) * 100).toFixed(0) + '%';\n  const environment = snapshot.scene?.settings?.environmentV010 || snapshot.state?.scenes?.find(item => item.id === snapshot.state?.activeSceneId)?.settings?.environmentV010 || {};\n  const diagnostics = field('v010EnvironmentDiagnostics');\n  if (diagnostics) diagnostics.textContent = `Authority: 1 Sun + 1 Moon · Day ${Number(environment.sunDayFactor || 0).toFixed(2)} · Twilight ${Number(environment.twilightFactor || 0).toFixed(2)} · Night ${Number(environment.nightFactor || 0).toFixed(2)} · Exposure ${Number(snapshot.scene?.settings?.exposure ?? 1).toFixed(2)} · ${previewTimeInEditor ? 'smooth editor preview' : 'authoritative edit pause'}`;",
        'app/v010.js', 'Authority: 1 Sun + 1 Moon')
    source = replace_once(source,
        "window.addEventListener('beforeunload', () => {\n  if (timeTimer) window.clearInterval(timeTimer);\n});",
        "window.addEventListener('beforeunload', () => {\n  if (timeTimer) window.clearInterval(timeTimer);\n  if (celestialAnimationFrame !== null) window.cancelAnimationFrame(celestialAnimationFrame);\n});",
        'app/v010.js', 'cancelAnimationFrame(celestialAnimationFrame)')
    source = replace_once(source,
        "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWorldPanel);\nelse installWorldPanel();",
        "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { installWorldPanel(); ensureCelestialAnimation(); });\nelse { installWorldPanel(); ensureCelestialAnimation(); }",
        'app/v010.js', 'ensureCelestialAnimation(); }')
    return source


edit('app/v010.js', patch_v010_ui)


def patch_app(source):
    source = replace_once(source,
        "  if (object.type==='directionalLight') return propColor('Light color','color',p.color)+propNumber('Intensity','intensity',p.intensity||1,'0.05',0,12)+propCheck('Cast shadows','castsShadows',p.castsShadows!==false);",
        "  if (p.celestialProxy) { const role=String(p.celestialRole||'celestial'); return `<div class=\"surface-blend-callout celestial-proxy-callout\"><strong>Authoritative ${escapeHtml(role === 'sun' ? 'Sun' : 'Moon')} proxy</strong><p>This hierarchy entry is a protected view of the shared Celestial Studio authority. It cannot be duplicated or deleted, and it survives save/reload with a stable identity.</p><div class=\"property-row\"><label>Azimuth</label><span>${Number(p.azimuth ?? 0).toFixed(2)}°</span></div><div class=\"property-row\"><label>Elevation</label><span>${Number(p.elevation ?? 0).toFixed(2)}°</span></div><div class=\"property-row\"><label>Angular size</label><span>${Number(p.angularSize ?? 1).toFixed(2)}×</span></div><button id=\"openCelestialStudioButton\" class=\"button primary\" type=\"button\">Open Celestial Studio</button></div>`; }\n  if (object.type==='directionalLight') return propColor('Light color','color',p.color)+propNumber('Intensity','intensity',p.intensity||1,'0.05',0,12)+propCheck('Cast shadows','castsShadows',p.castsShadows!==false);",
        'app/app.js', 'celestial-proxy-callout')
    source = replace_once(source,
        "  const object = selectedObject();\n  ui.duplicateButton.disabled = !object;\n  ui.prefabButton.disabled = !object;\n  ui.deleteButton.disabled = !object || object.locked;",
        "  const object = selectedObject();\n  const celestialProxy = Boolean(object?.properties?.celestialProxy);\n  ui.duplicateButton.disabled = !object || celestialProxy;\n  ui.prefabButton.disabled = !object || celestialProxy;\n  ui.deleteButton.disabled = !object || object.locked || celestialProxy;",
        'app/app.js', 'const celestialProxy = Boolean')
    source = replace_once(source,
        "    <div class=\"object-summary\"><div class=\"object-type-icon\">${objectIcon(object.type)}</div><div><input id=\"objectNameInput\" value=\"${escapeHtml(object.name)}\"><div class=\"object-meta\">${escapeHtml(typeLabel(object.type))} · ${escapeHtml(object.id)}</div></div></div>",
        "    <div class=\"object-summary\"><div class=\"object-type-icon\">${objectIcon(object.type)}</div><div><input id=\"objectNameInput\" value=\"${escapeHtml(object.name)}\" ${celestialProxy?'readonly':''}><div class=\"object-meta\">${escapeHtml(celestialProxy?'Celestial Authority Proxy':typeLabel(object.type))} · ${escapeHtml(object.id)}</div></div></div>",
        'app/app.js', "celestialProxy?'readonly':''")
    source = replace_once(source,
        "    ${section('Transform',vectorField('Position',object.transform.position,'position')+vectorField('Rotation',object.transform.rotation,'rotation')+vectorField('Scale',object.transform.scale,'scale'),'WORLD')}\n    ${section('Properties',objectPropertiesHtml(object),object.type.toUpperCase())}\n    ${pathPoints}\n    ${section('Components',`${components || '<p class=\"panel-hint\">No extra behavior components.</p>'}<div class=\"component-add-row\"><button id=\"addRigidbody\" class=\"add-component\" type=\"button\">+ Rigidbody</button><button id=\"addCollider\" class=\"add-component\" type=\"button\">+ Collider</button><button id=\"addRotator\" class=\"add-component\" type=\"button\">+ Rotator</button></div>`,`${object.components?.length||0}`)}\n    ${section('Entity flags',propCheck('Visible','__visible',object.visible)+propCheck('Locked','__locked',object.locked),'SCENE')}",
        "    ${celestialProxy ? section('Celestial authority',objectPropertiesHtml(object),'WORLD AUTHORITY') : section('Transform',vectorField('Position',object.transform.position,'position')+vectorField('Rotation',object.transform.rotation,'rotation')+vectorField('Scale',object.transform.scale,'scale'),'WORLD') + section('Properties',objectPropertiesHtml(object),object.type.toUpperCase()) + pathPoints + section('Components',`${components || '<p class=\"panel-hint\">No extra behavior components.</p>'}<div class=\"component-add-row\"><button id=\"addRigidbody\" class=\"add-component\" type=\"button\">+ Rigidbody</button><button id=\"addCollider\" class=\"add-component\" type=\"button\">+ Collider</button><button id=\"addRotator\" class=\"add-component\" type=\"button\">+ Rotator</button></div>`,`${object.components?.length||0}`) + section('Entity flags',propCheck('Visible','__visible',object.visible)+propCheck('Locked','__locked',object.locked),'SCENE')}",
        'app/app.js', "WORLD AUTHORITY")
    source = replace_once(source,
        "  bindInspector(object);\n  $('#commitAssetPreviewButton')?.addEventListener('click',()=>commitAssetPreview(object.id));",
        "  bindInspector(object);\n  $('#openCelestialStudioButton')?.addEventListener('click',()=>document.querySelector('[data-v010-world-tab]')?.click());\n  $('#commitAssetPreviewButton')?.addEventListener('click',()=>commitAssetPreview(object.id));",
        'app/app.js', 'openCelestialStudioButton')
    source = replace_once(source,
        "function bindInspector(object) {\n  $('#objectNameInput')?.addEventListener('change',event=>patchObject(object.id,{name:event.target.value.trim()||object.name}));",
        "function bindInspector(object) {\n  if(object.properties?.celestialProxy)return;\n  $('#objectNameInput')?.addEventListener('change',event=>patchObject(object.id,{name:event.target.value.trim()||object.name}));",
        'app/app.js', 'if(object.properties?.celestialProxy)return;')
    return source


edit('app/app.js', patch_app)
print('Applied Phase 0A-D celestial authority, interpolation, readability, and inspector stabilization.')
