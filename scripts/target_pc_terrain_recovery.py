from __future__ import annotations

from pathlib import Path


PATH_VISUALS = r'''import { normalizePathProperties, normalizeTerrainProperties, samplePathSpline, terrainHeightAt, terrainNormalAt } from './worldgen.js';

function normalize2(x, z) {
  const magnitude = Math.hypot(x, z);
  return magnitude > 1e-6 ? [x / magnitude, z / magnitude] : [1, 0];
}

export function buildPathGuideSegments(samples, width, heightAt, surfaceOffset = 0.09) {
  const dense = Array.isArray(samples) ? samples : [];
  const halfWidth = Math.max(0.05, Number(width) || 0) * 0.5;
  const center = [];
  const edges = [];
  if (dense.length < 2 || typeof heightAt !== 'function') return { center, edges };

  const joined = dense.map((point, index) => {
    const previous = dense[Math.max(0, index - 1)];
    const next = dense[Math.min(dense.length - 1, index + 1)];
    const [tx, tz] = normalize2(next.x - previous.x, next.z - previous.z);
    const sideX = -tz;
    const sideZ = tx;
    const leftX = point.x + sideX * halfWidth;
    const leftZ = point.z + sideZ * halfWidth;
    const rightX = point.x - sideX * halfWidth;
    const rightZ = point.z - sideZ * halfWidth;
    return {
      center: [point.x, heightAt(point.x, point.z) + surfaceOffset, point.z],
      left: [leftX, heightAt(leftX, leftZ) + surfaceOffset, leftZ],
      right: [rightX, heightAt(rightX, rightZ) + surfaceOffset, rightZ]
    };
  });

  for (let index = 0; index < joined.length - 1; index += 1) {
    const a = joined[index];
    const b = joined[index + 1];
    center.push(...a.center, ...b.center);
    edges.push(...a.left, ...b.left, ...a.right, ...b.right);
  }
  return { center, edges };
}

export function terrainPathSamplingDiagnostics(terrain, paths = []) {
  if (!terrain) return { available: false, undersampled: false, pathCount: 0 };
  const properties = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  const visiblePaths = (paths || []).filter(path => path && path.visible !== false);
  const spacingX = properties.sizeX / Math.max(1, properties.resolutionX);
  const spacingZ = properties.sizeZ / Math.max(1, properties.resolutionZ);
  const maximumSpacing = Math.max(spacingX, spacingZ);
  const widths = visiblePaths.map(path => normalizePathProperties(path.properties || {}, path.transform || {}).width);
  const minimumPathWidth = widths.length ? Math.min(...widths) : Infinity;
  const recommendedSpacing = Number.isFinite(minimumPathWidth) ? Math.max(0.25, minimumPathWidth * 0.35) : maximumSpacing;
  return {
    available: true,
    undersampled: visiblePaths.length > 0 && maximumSpacing > recommendedSpacing,
    pathCount: visiblePaths.length,
    spacingX,
    spacingZ,
    maximumSpacing,
    minimumPathWidth: Number.isFinite(minimumPathWidth) ? minimumPathWidth : null,
    recommendedSpacing,
    resolutionX: properties.resolutionX,
    resolutionZ: properties.resolutionZ,
    sizeX: properties.sizeX,
    sizeZ: properties.sizeZ,
    dedicatedPathSurface: true
  };
}

export function buildTerrainConformingPathSurface(pathObject, terrain, allPaths = [], options = {}) {
  const empty = {
    positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(),
    uvs: new Float32Array(), blends: new Float32Array()
  };
  if (!pathObject || !terrain || pathObject.visible === false) return empty;
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const width = Math.max(0.1, Number(properties.width || 3));
  const spacing = Math.max(0.18, Math.min(1.25, Number(options.spacing || width * 0.14)));
  const renderLift = Math.max(0.012, Math.min(0.08, Number(options.renderLift ?? 0.025)));
  const samples = samplePathSpline(pathObject, { spacing });
  if (samples.length < 2) return empty;
  const paths = (allPaths || []).filter(path => path && path.visible !== false);
  const halfWidth = width * 0.5;
  const positions = [], normals = [], indices = [], uvs = [], blends = [];
  let accumulatedDistance = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const point = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    if (index > 0) accumulatedDistance += Math.hypot(point.x - previous.x, point.z - previous.z);
    const [tx, tz] = normalize2(next.x - previous.x, next.z - previous.z);
    const sideX = -tz, sideZ = tx;
    const normalStep = Math.max(0.2, Math.min(1, width * 0.12));
    for (const side of [-1, 1]) {
      const x = point.x + sideX * halfWidth * side;
      const z = point.z + sideZ * halfWidth * side;
      const y = terrainHeightAt(terrain, x, z, paths) + renderLift;
      const normal = terrainNormalAt(terrain, x, z, paths, normalStep);
      positions.push(x, y, z);
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(side < 0 ? 0 : 1, accumulatedDistance / Math.max(0.25, width));
      blends.push(1);
    }
    if (index > 0) {
      const previousLeft = (index - 1) * 2;
      const previousRight = previousLeft + 1;
      const left = index * 2;
      const right = left + 1;
      indices.push(previousLeft, previousRight, left, previousRight, right, left);
    }
  }

  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices),
    uvs: new Float32Array(uvs), blends: new Float32Array(blends)
  };
}
'''


def replace_once(path: Path, old: str, new: str, changed: list[str], root: Path, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected source contract not found for {label}.')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    changed.append(path.relative_to(root).as_posix())


def apply(root: Path, changed: list[str]) -> None:
    visuals = root / 'app/path-visuals.js'
    visuals_text = visuals.read_text(encoding='utf-8')
    if 'buildTerrainConformingPathSurface' not in visuals_text:
        if 'export function buildPathGuideSegments' not in visuals_text:
            raise RuntimeError('Path visual authority was not found.')
        visuals.write_text(PATH_VISUALS, encoding='utf-8')
        changed.append(visuals.relative_to(root).as_posix())

    renderer = root / 'app/renderer.js'
    replace_once(
        renderer,
        "import { buildPathGuideSegments } from './path-visuals.js';",
        "import { buildPathGuideSegments, buildTerrainConformingPathSurface, terrainPathSamplingDiagnostics } from './path-visuals.js';",
        changed, root, 'path surface imports'
    )
    replace_once(
        renderer,
        "this.dynamic=new Map();this.pathLines=new Map();this.textureCache=new Map();",
        "this.dynamic=new Map();this.pathLines=new Map();this.pathSurfaces=new Map();this.lastTerrainSamplingDiagnostics=null;this.terrainSamplingWarningSignature='';this.textureCache=new Map();",
        changed, root, 'path surface renderer state'
    )
    replace_once(
        renderer,
        """  pathBuffers(pathObject,scene){
    const terrain=scene.objects.find(o=>o.type==='terrain'),signature=JSON.stringify([pathObject.properties,pathObject.transform,terrain?.properties,terrain?.transform]),cached=this.pathLines.get(pathObject.id);if(cached?.signature===signature)return cached;
    if(cached){for(const item of [cached.center,cached.edges])if(item){this.gl.deleteVertexArray(item.vao);this.gl.deleteBuffer(item.buffer);}}
    const data=pathLineData(pathObject,terrain,scene.objects.filter(object=>object.type==='path'&&object.visible!==false)),next={signature,center:createLineBuffer(this.gl,data.center),edges:createLineBuffer(this.gl,data.edges)};this.pathLines.set(pathObject.id,next);return next;
  }""",
        """  pathBuffers(pathObject,scene){
    const terrain=scene.objects.find(o=>o.type==='terrain'),signature=JSON.stringify([pathObject.properties,pathObject.transform,terrain?.properties,terrain?.transform]),cached=this.pathLines.get(pathObject.id);if(cached?.signature===signature)return cached;
    if(cached){for(const item of [cached.center,cached.edges])if(item){this.gl.deleteVertexArray(item.vao);this.gl.deleteBuffer(item.buffer);}}
    const data=pathLineData(pathObject,terrain,scene.objects.filter(object=>object.type==='path'&&object.visible!==false)),next={signature,center:createLineBuffer(this.gl,data.center),edges:createLineBuffer(this.gl,data.edges)};this.pathLines.set(pathObject.id,next);return next;
  }
  pathSurfaceFor(pathObject,scene){
    const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false),paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);
    if(!terrain)return null;
    const signature=JSON.stringify([pathObject.properties,pathObject.transform,terrain.properties,terrain.transform,paths.map(path=>[path.id,path.properties,path.transform])]),cached=this.pathSurfaces.get(pathObject.id);
    if(cached?.signature===signature)return cached.mesh;
    if(cached){for(const buffer of cached.mesh.buffers||[])this.gl.deleteBuffer(buffer);this.gl.deleteVertexArray(cached.mesh.vao);}
    const data=buildTerrainConformingPathSurface(pathObject,terrain,paths);if(!data.indices.length)return null;
    const mesh=createBufferMesh(this.gl,data);this.pathSurfaces.set(pathObject.id,{signature,mesh});return mesh;
  }
  updateTerrainSamplingDiagnostics(scene){
    const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false),paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);
    const diagnostics=terrainPathSamplingDiagnostics(terrain,paths);this.lastTerrainSamplingDiagnostics=diagnostics;
    const signature=JSON.stringify(diagnostics);
    if(diagnostics.undersampled&&signature!==this.terrainSamplingWarningSignature){
      this.terrainSamplingWarningSignature=signature;
      window.__omniforgeDiagnostics?.warn?.('terrain-path-grid-undersampled',diagnostics);
    }
    return diagnostics;
  }""",
        changed, root, 'path surface mesh cache'
    )
    replace_once(
        renderer,
        "drawMesh(object,mesh,viewProj,lightViewProj,scene,selected,camera,lights,instances=null){",
        "drawMesh(object,mesh,viewProj,lightViewProj,scene,selected,camera,lights,instances=null,materialPath=null){",
        changed, root, 'path material draw authority'
    )
    replace_once(
        renderer,
        "const firstPath=scene.objects.find(o=>o.type==='path'&&o.visible),baseAsset=this.materialAsset(object.properties?.materialId),pathAsset=this.materialAsset(firstPath?.properties?.materialId),",
        "const firstPath=materialPath||scene.objects.find(o=>o.type==='path'&&o.visible),baseAsset=this.materialAsset(materialPath?.properties?.materialId||object.properties?.materialId),pathAsset=this.materialAsset(firstPath?.properties?.materialId),",
        changed, root, 'path material selection'
    )
    replace_once(
        renderer,
        """      this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);
      if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.CULL_FACE);} """,
        """      this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);
      if(object.type==='terrain')this.renderPathSurfacePass(frame);
      if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.CULL_FACE);} """,
        changed, root, 'path surface render insertion'
    )
    replace_once(
        renderer,
        """  renderEditorOverlayPass(frame){
    const {gl,scene,camera,selectedId,viewProj}=frame;""",
        """  renderPathSurfacePass(frame){
    const {gl,scene,camera,selectedId,viewProj,lightViewProj,lights}=frame;
    const terrain=scene.objects.find(object=>object.type==='terrain'&&object.visible!==false);if(!terrain)return;
    const paths=scene.objects.filter(object=>object.type==='path'&&object.visible!==false);
    if(!paths.length)return;
    gl.disable(gl.BLEND);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1,-1);
    for(const pathObject of paths){
      const mesh=this.pathSurfaceFor(pathObject,scene);if(!mesh)continue;
      const proxy={id:`path-surface:${pathObject.id}`,type:'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{...pathObject.properties,color:pathObject.properties?.color||'#73573d',opacity:1,castsShadows:false}};
      this.drawMesh(proxy,mesh,viewProj,lightViewProj,scene,false,camera,lights,null,pathObject);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
  }
  renderEditorOverlayPass(frame){
    const {gl,scene,camera,selectedId,viewProj}=frame;""",
        changed, root, 'dedicated path surface pass'
    )
    replace_once(
        renderer,
        """    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    lights.environment=environment;""",
        """    const environment=normalizeEnvironmentState(scene,lights,(performance.now()-this.renderStart)/1000);
    this.updateTerrainSamplingDiagnostics(scene);
    lights.environment=environment;""",
        changed, root, 'terrain sampling diagnostics update'
    )
    replace_once(
        renderer,
        "getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport};}",
        "getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport,terrainSampling:this.lastTerrainSamplingDiagnostics,pathSurfaceCount:this.pathSurfaces.size};}",
        changed, root, 'terrain render diagnostics exposure'
    )

    tests = root / 'tests/phase1i-target-pc-terrain.test.mjs'
    if not tests.exists():
        tests.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTerrainConformingPathSurface, terrainPathSamplingDiagnostics } from '../app/path-visuals.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const terrain = {
  id: 'terrain-large', type: 'terrain', visible: true,
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  properties: { preset: 'rollingHills', sizeX: 2048, sizeZ: 2048, resolutionX: 64, resolutionZ: 64, height: 22, seed: 17 }
};
const pathObject = {
  id: 'path-narrow', type: 'path', visible: true,
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  properties: { worldSpacePoints: true, points: [[-300, -120], [0, 40], [310, 180]], width: 3, blendDistance: 2.5, carveTerrain: true, maxGradePercent: 12, surfaceOffset: 0.03 }
};

test('large terrain reports vertex sampling that cannot reliably carry a narrow road', () => {
  const diagnostics = terrainPathSamplingDiagnostics(terrain, [pathObject]);
  assert.equal(diagnostics.available, true);
  assert.equal(diagnostics.undersampled, true);
  assert.ok(diagnostics.maximumSpacing > diagnostics.minimumPathWidth);
  assert.equal(diagnostics.dedicatedPathSurface, true);
});

test('terrain-conforming path surface remains dense and renderable independent of terrain grid resolution', () => {
  const mesh = buildTerrainConformingPathSurface(pathObject, terrain, [pathObject]);
  assert.ok(mesh.positions.length > 60);
  assert.ok(mesh.indices.length > 30);
  assert.equal(mesh.positions.length / 3, mesh.blends.length);
  assert.ok([...mesh.blends].every(value => value === 1));
  assert.ok([...mesh.positions].every(Number.isFinite));
  assert.ok([...mesh.normals].every(Number.isFinite));
  const firstWidth = Math.hypot(mesh.positions[0] - mesh.positions[3], mesh.positions[2] - mesh.positions[5]);
  assert.ok(Math.abs(firstWidth - 3) < 0.05);
});

test('renderer owns a separate opaque path surface pass instead of relying only on terrain vertex blend', () => {
  const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
  assert.match(renderer, /pathSurfaceFor\(pathObject,scene\)/);
  assert.match(renderer, /renderPathSurfacePass\(frame\)/);
  assert.match(renderer, /buildTerrainConformingPathSurface/);
  assert.match(renderer, /gl\.polygonOffset\(-1,-1\)/);
  assert.match(renderer, /terrain-path-grid-undersampled/);
  assert.match(renderer, /pathSurfaceCount:this\.pathSurfaces\.size/);
});
''', encoding='utf-8')
        changed.append(tests.relative_to(root).as_posix())
