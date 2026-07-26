import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyCompactWorldRuntime,
  resolveViewportLighting,
  shouldAdvanceWorldTime,
  updateCelestialRuntimeInterpolation
} from '../app/world-runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('automatic world time cannot replace the editor workspace while authoring', () => {
  assert.equal(shouldAdvanceWorldTime({ enabled: true, editorMode: 'edit' }), false);
  assert.equal(shouldAdvanceWorldTime({ enabled: true, editorMode: 'play' }), true);
  assert.equal(shouldAdvanceWorldTime({ enabled: true, editorMode: 'edit', previewInEditor: true }), true);
  assert.equal(shouldAdvanceWorldTime({ enabled: false, editorMode: 'play' }), false);
  assert.equal(shouldAdvanceWorldTime({ enabled: true, editorMode: 'play', documentHidden: true }), false);
  assert.equal(shouldAdvanceWorldTime({ enabled: true, editorMode: 'play', inFlight: true }), false);
});

test('compact world runtime queues continuous celestial and lighting interpolation without replacing editor state', () => {
  const state = {
    engine: { revision: 7 },
    project: { id: 'project-a' },
    editor: { mode: 'edit', selectedMaterialId: 'material-a' }
  };
  const scene = {
    id: 'scene-a',
    settings: { ambientIntensity: 0.2, exposure: 0, gridVisible: true },
    objects: [
      {
        id: 'sun-a',
        type: 'directionalLight',
        visible: true,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        properties: { celestialRole: 'sun', intensity: 1 }
      },
      { id: 'box-a', type: 'box', properties: { color: '#ffffff' } }
    ]
  };
  const untouchedProject = state.project;
  const untouchedEditor = state.editor;
  const untouchedBox = scene.objects[1];
  const applied = applyCompactWorldRuntime({ state, scene }, {
    engineRevision: 9,
    sceneId: 'scene-a',
    visualDurationMs: 1000,
    settings: { ambientIntensity: 0.12, exposure: 0.82, environmentV010: { nightFactor: 1 } },
    celestialObjects: [{
      id: 'sun-a',
      visible: false,
      transform: { position: [0, 100, 0], rotation: [-80, 20, 0], scale: [1, 1, 1] },
      properties: { celestialRole: 'sun', intensity: 0.05 }
    }]
  }, { now: 0, durationMs: 1000 });

  assert.equal(applied, true);
  assert.equal(state.engine.revision, 9);
  assert.equal(state.project, untouchedProject);
  assert.equal(state.editor, untouchedEditor);
  assert.equal(scene.objects[1], untouchedBox);
  assert.equal(scene.settings.gridVisible, true);
  assert.equal(scene.settings.ambientIntensity, 0.2);
  assert.equal(scene.objects[0].visible, false);
  assert.equal(scene.objects[0].properties.intensity, 1);
  assert.deepEqual(scene.objects[0].transform.rotation, [0, 0, 0]);

  updateCelestialRuntimeInterpolation({ state, scene }, 500);
  assert.ok(scene.objects[0].properties.intensity < 1 && scene.objects[0].properties.intensity > 0.05);
  assert.ok(scene.objects[0].transform.rotation[0] < 0 && scene.objects[0].transform.rotation[0] > -80);
  assert.equal(scene.settings.ambientIntensity, 0.16);
  assert.equal(scene.settings.exposure, 0.41);
  updateCelestialRuntimeInterpolation({ state, scene }, 1000);
  assert.equal(scene.objects[0].properties.intensity, 0.05);
  assert.deepEqual(scene.objects[0].transform.rotation, [-80, 20, 0]);
  assert.equal(scene.settings.ambientIntensity, 0.12);
  assert.equal(scene.settings.exposure, 0.82);
  assert.equal(applyCompactWorldRuntime({ state, scene }, { sceneId: 'other-scene' }), false);
});

test('night remains readable in Edit mode without changing authored Play lighting', () => {
  const settings = { ambientIntensity: 0.08, exposure: 0.72, environmentV010: { nightFactor: 1 } };
  const edit = resolveViewportLighting(settings, 'edit', 0.03);
  assert.ok(edit.ambientIntensity >= 0.26 && edit.ambientIntensity < 0.42);
  assert.ok(edit.exposure >= 0.8 && edit.exposure < 0.9);
  assert.equal(edit.sunIntensity, 0.03);
  assert.ok(edit.editorFill > 0 && edit.editorFill < 0.2);
  assert.equal(edit.authoringAssist, true);

  const play = resolveViewportLighting(settings, 'play', 0.03);
  assert.deepEqual(play, { ambientIntensity: 0.08, exposure: 0.72, sunIntensity: 0.03, editorFill: 0, authoringAssist: false });
});

test('runtime source contains polling, compact-step, persistent celestial migration, and traceable-build safeguards', () => {
  const editor = fs.readFileSync(path.join(ROOT, 'app', 'app.js'), 'utf8');
  const worldUi = fs.readFileSync(path.join(ROOT, 'app', 'v010.js'), 'utf8');
  const worldApi = fs.readFileSync(path.join(ROOT, 'server', 'v010-api.mjs'), 'utf8');
  const worldgenApi = fs.readFileSync(path.join(ROOT, 'server', 'v011-api.mjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  const worldgenUi = fs.readFileSync(path.join(ROOT, 'app', 'v011.js'), 'utf8');
  const builder = fs.readFileSync(path.join(ROOT, 'BUILD_DESKTOP_WINDOWS.ps1'), 'utf8');

  assert.match(editor, /remotePollInFlight/);
  assert.match(editor, /interactionActiveUntil/);
  assert.match(editor, /renderer\.render\(scene,camera,selectedId,\{editorMode:/);
  assert.match(renderer, /uniform float uEditorFill/);
  assert.match(renderer, /set1\('uEditorFill',lights\.editorFill\)/);
  assert.match(renderer, /baseLinear\*vec3\(uEditorFill\)/);

  const timer = worldUi.slice(worldUi.indexOf('timeTimer = window.setInterval'), worldUi.indexOf("window.addEventListener('beforeunload'"));
  assert.match(timer, /shouldAdvanceWorldTime/);
  assert.match(timer, /timeStepInFlight/);
  assert.match(timer, /synchronizeRuntimeOnly/);
  assert.doesNotMatch(timer, /synchronizeAuthoritativeEditor/);
  assert.match(worldUi, /Preview time while editing/);
  assert.match(worldUi, /updateCelestialRuntimeInterpolation/);
  assert.match(worldApi, /compactWorldRuntime/);
  assert.match(worldApi, /visualDurationMs: 1100/);
  assert.match(worldApi.slice(worldApi.indexOf("'/api/v010/world/step'"), worldApi.indexOf("'/api/v010/foliage/species'")), /includeFullState[\s\S]*\.\.\.\(includeFullState \? \{ state: result\.state \} : \{\}\)/);
  assert.match(worldgenApi, /ensureWorldFoundationState/);
  assert.match(worldgenUi, /MutationObserver/);
  assert.match(builder, /source-commit/);
});
