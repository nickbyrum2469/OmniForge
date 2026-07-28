from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, changed: list[str], label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected source contract not found for {label}.')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    changed.append(path.relative_to(ROOT).as_posix())


def append_once(path: Path, marker: str, block: str, changed: list[str]) -> None:
    text = path.read_text(encoding='utf-8')
    if marker in text:
        return
    path.write_text(text.rstrip() + '\n\n' + block.strip() + '\n', encoding='utf-8')
    changed.append(path.relative_to(ROOT).as_posix())


def apply(root: Path, changed: list[str]) -> None:
    worldgen = root / 'app/worldgen.js'
    replace_once(
        worldgen,
        """    carveTerrain: Boolean(properties.carveTerrain),
    maxGradePercent: clamp(properties.maxGradePercent ?? 12, 0.1, 100),
    maxCutDepth: clamp(properties.maxCutDepth ?? 6, 0, 1000),
    maxFillDepth: clamp(properties.maxFillDepth ?? 2.5, 0, 1000),
    cutShoulder: clamp(properties.cutShoulder ?? properties.blendDistance ?? 3, 0.1, 200),
    surfaceOffset: Number(properties.surfaceOffset ?? 0.03),
    profileRevision: Number(properties.profileRevision || 1)""",
        """    carveTerrain: properties.carveTerrain !== false,
    conformToTerrain: properties.conformToTerrain !== false,
    collider: properties.collider !== false,
    navigation: properties.navigation !== false,
    pathPreset: String(properties.pathPreset || 'dirtRoad'),
    roadClass: String(properties.roadClass || 'rural'),
    laneCount: Math.round(clamp(properties.laneCount ?? 2, 1, 12)),
    laneWidth: clamp(properties.laneWidth ?? 2.4, 0.5, 8),
    shoulderWidth: clamp(properties.shoulderWidth ?? 0.9, 0, 20),
    shoulderDrop: clamp(properties.shoulderDrop ?? 0.08, 0, 2),
    crownHeight: clamp(properties.crownHeight ?? 0.08, -1, 2),
    maxGradePercent: clamp(properties.maxGradePercent ?? 12, 0.1, 100),
    profileSmoothingPasses: Math.round(clamp(properties.profileSmoothingPasses ?? 4, 0, 16)),
    verticalCurveStrength: clamp(properties.verticalCurveStrength ?? 0.62, 0, 1),
    minimumCurveRadius: clamp(properties.minimumCurveRadius ?? 10, 0.5, 10000),
    designSpeedKph: clamp(properties.designSpeedKph ?? 30, 1, 250),
    bankMode: ['auto', 'manual', 'none'].includes(properties.bankMode) ? properties.bankMode : 'auto',
    bankStrength: clamp(properties.bankStrength ?? 0.55, 0, 1.5),
    maxBankDegrees: clamp(properties.maxBankDegrees ?? 7, 0, 30),
    manualBankDegrees: clamp(properties.manualBankDegrees ?? 0, -30, 30),
    maxCutDepth: clamp(properties.maxCutDepth ?? 6, 0, 1000),
    maxFillDepth: clamp(properties.maxFillDepth ?? 2.5, 0, 1000),
    cutShoulder: clamp(properties.cutShoulder ?? properties.blendDistance ?? 3, 0.1, 200),
    sideSlopeWidth: clamp(properties.sideSlopeWidth ?? properties.cutShoulder ?? 3.4, 0.2, 200),
    drainageEnabled: properties.drainageEnabled !== false,
    ditchDepth: clamp(properties.ditchDepth ?? 0.22, 0, 5),
    bridgeThreshold: clamp(properties.bridgeThreshold ?? 5, 0, 1000),
    tunnelThreshold: clamp(properties.tunnelThreshold ?? 8, 0, 1000),
    retainingWallThreshold: clamp(properties.retainingWallThreshold ?? 3.5, 0, 1000),
    meshSpacing: clamp(properties.meshSpacing ?? 0.55, 0.15, 5),
    textureRepeatLength: clamp(properties.textureRepeatLength ?? 5, 0.25, 100),
    renderLiftMode: properties.renderLiftMode === 'manual' ? 'manual' : 'auto',
    renderLift: clamp(properties.renderLift ?? 0.028, 0.006, 0.25),
    surfaceOffset: Number(properties.surfaceOffset ?? 0.03),
    profileRevision: Number(properties.profileRevision || 1)""",
        changed,
        'Pathway Studio normalized properties'
    )

    replace_once(
        worldgen,
        """function profileSignature(pathObject, terrain) {
  const p = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const t = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  return JSON.stringify([p.points, p.spline, p.splineTension, p.samplesPerSegment, p.maxGradePercent, p.surfaceOffset, p.profileRevision, t.seed, t.height, t.macroScale, t.detailScale, t.bounds, t.generatedRevision]);
}

export function compilePathProfile(pathObject, terrain) {
  if (!pathObject || !terrain) return [];
  const signature = profileSignature(pathObject, terrain);
  const cached = profileCache.get(pathObject);
  if (cached?.signature === signature) return cached.profile;
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const samples = samplePathSpline(pathObject, { spacing: Math.max(0.5, Number(properties.width || 3) * 0.32) });
  const profile = samples.map(sample => ({ ...sample, y: terrainBaseHeightAt(terrain, sample.x, sample.z) + properties.surfaceOffset }));
  const grade = properties.maxGradePercent / 100;
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1], current = profile[index];
    const distance = Math.max(EPSILON, Math.hypot(current.x - previous.x, current.z - previous.z));
    current.y = clamp(current.y, previous.y - distance * grade, previous.y + distance * grade);
  }
  for (let index = profile.length - 2; index >= 0; index -= 1) {
    const next = profile[index + 1], current = profile[index];
    const distance = Math.max(EPSILON, Math.hypot(current.x - next.x, current.z - next.z));
    current.y = clamp(current.y, next.y - distance * grade, next.y + distance * grade);
  }
  profileCache.set(pathObject, { signature, profile });
  return profile;
}""",
        """function profileSignature(pathObject, terrain) {
  const p = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const t = normalizeTerrainProperties(terrain.properties || {}, terrain.transform || {});
  return JSON.stringify([
    p.points, p.spline, p.splineTension, p.samplesPerSegment, p.meshSpacing,
    p.maxGradePercent, p.profileSmoothingPasses, p.verticalCurveStrength,
    p.maxCutDepth, p.maxFillDepth, p.surfaceOffset, p.profileRevision,
    t.seed, t.height, t.macroScale, t.detailScale, t.bounds, t.generatedRevision
  ]);
}

function enforceProfileGrade(profile, maximumGrade) {
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1], current = profile[index];
    const distance = Math.max(EPSILON, Math.hypot(current.x - previous.x, current.z - previous.z));
    current.y = clamp(current.y, previous.y - distance * maximumGrade, previous.y + distance * maximumGrade);
  }
  for (let index = profile.length - 2; index >= 0; index -= 1) {
    const next = profile[index + 1], current = profile[index];
    const distance = Math.max(EPSILON, Math.hypot(current.x - next.x, current.z - next.z));
    current.y = clamp(current.y, next.y - distance * maximumGrade, next.y + distance * maximumGrade);
  }
}

export function compilePathProfile(pathObject, terrain) {
  if (!pathObject || !terrain) return [];
  const signature = profileSignature(pathObject, terrain);
  const cached = profileCache.get(pathObject);
  if (cached?.signature === signature) return cached.profile;
  const properties = normalizePathProperties(pathObject.properties || {}, pathObject.transform || {});
  const samples = samplePathSpline(pathObject, { spacing: properties.meshSpacing });
  let accumulatedDistance = 0;
  const profile = samples.map((sample, index) => {
    if (index > 0) accumulatedDistance += Math.hypot(sample.x - samples[index - 1].x, sample.z - samples[index - 1].z);
    const baseY = terrainBaseHeightAt(terrain, sample.x, sample.z);
    return { ...sample, distance: accumulatedDistance, baseY, y: baseY + properties.surfaceOffset };
  });
  const maximumGrade = properties.maxGradePercent / 100;
  enforceProfileGrade(profile, maximumGrade);
  for (let pass = 0; pass < properties.profileSmoothingPasses; pass += 1) {
    const source = profile.map(point => point.y);
    for (let index = 1; index < profile.length - 1; index += 1) {
      const target = (source[index - 1] + source[index] * 2 + source[index + 1]) * 0.25;
      const smoothed = lerp(source[index], target, properties.verticalCurveStrength);
      profile[index].y = clamp(smoothed, profile[index].baseY - properties.maxCutDepth, profile[index].baseY + properties.maxFillDepth);
    }
    enforceProfileGrade(profile, maximumGrade);
  }
  for (let index = 0; index < profile.length; index += 1) {
    const previous = profile[Math.max(0, index - 1)], next = profile[Math.min(profile.length - 1, index + 1)];
    const horizontal = Math.max(EPSILON, Math.hypot(next.x - previous.x, next.z - previous.z));
    profile[index].gradePercent = ((next.y - previous.y) / horizontal) * 100;
  }
  profileCache.set(pathObject, { signature, profile });
  return profile;
}""",
        changed,
        'grade-aware pathway profile compiler'
    )

    replace_once(
        worldgen,
        """    const width = Math.max(0.1, Number(properties.width || 3));
    const shoulder = Math.max(0.05, Number(properties.blendDistance ?? 2.5));
    const irregularity = Number(properties.edgeNoise ?? 0.45);
    const noise = valueNoise(x * 0.19, z * 0.19, Number(properties.seed || 17)) * irregularity * 0.34;
    const blend = 1 - smoothstep(width * 0.5 + noise, width * 0.5 + shoulder + noise, nearest.distance);""",
        """    const width = Math.max(0.1, Number(properties.width || 3));
    const roadAndShoulder = width * 0.5 + Math.max(0, Number(properties.shoulderWidth || 0));
    const shoulder = Math.max(0.05, Number(properties.blendDistance ?? 2.5));
    const irregularity = Number(properties.edgeNoise ?? 0.45);
    const noise = valueNoise(x * 0.19, z * 0.19, Number(properties.seed || 17)) * irregularity * 0.34;
    const blend = 1 - smoothstep(roadAndShoulder + noise, roadAndShoulder + shoulder + noise, nearest.distance);""",
        changed,
        'path material corridor blend'
    )

    replace_once(
        worldgen,
        """    const width = Math.max(0.1, Number(properties.width || 3));
    const shoulder = Math.max(0.1, Number(properties.cutShoulder || properties.blendDistance || 3));
    const influence = 1 - smoothstep(width * 0.5, width * 0.5 + shoulder, nearest.distance);""",
        """    const width = Math.max(0.1, Number(properties.width || 3));
    const shoulder = Math.max(
      0.1,
      Number(properties.cutShoulder || properties.blendDistance || 3),
      Number(properties.shoulderWidth || 0) + Number(properties.sideSlopeWidth || 0)
    );
    const influence = 1 - smoothstep(width * 0.5, width * 0.5 + shoulder, nearest.distance);""",
        changed,
        'terrain cut/fill corridor influence'
    )

    visuals = root / 'app/path-visuals.js'
    visuals_text = """import { normalizePathProperties } from './worldgen.js';
export {
  analyzePathwayCorridor,
  buildPathwayCorridor,
  buildTerrainConformingPathSurface,
  computePathwayRenderLift,
  terrainPathSamplingDiagnostics
} from './pathway-corridor.js';

function normalize2(x, z) {
  const magnitude = Math.hypot(x, z);
  return magnitude > 1e-6 ? [x / magnitude, z / magnitude] : [1, 0];
}

export function buildPathGuideSegments(samples, width, heightAt, surfaceOffset = 0.09) {
  const dense = Array.isArray(samples) ? samples : [];
  const properties = normalizePathProperties({ width });
  const halfWidth = Math.max(0.05, Number(properties.width) || 0) * 0.5;
  const center = [];
  const edges = [];
  if (dense.length < 2 || typeof heightAt !== 'function') return { center, edges };
  const joined = dense.map((point, index) => {
    const previous = dense[Math.max(0, index - 1)];
    const next = dense[Math.min(dense.length - 1, index + 1)];
    const [tx, tz] = normalize2(next.x - previous.x, next.z - previous.z);
    const sideX = -tz, sideZ = tx;
    const leftX = point.x + sideX * halfWidth, leftZ = point.z + sideZ * halfWidth;
    const rightX = point.x - sideX * halfWidth, rightZ = point.z - sideZ * halfWidth;
    return {
      center: [point.x, heightAt(point.x, point.z) + surfaceOffset, point.z],
      left: [leftX, heightAt(leftX, leftZ) + surfaceOffset, leftZ],
      right: [rightX, heightAt(rightX, rightZ) + surfaceOffset, rightZ]
    };
  });
  for (let index = 0; index < joined.length - 1; index += 1) {
    const a = joined[index], b = joined[index + 1];
    center.push(...a.center, ...b.center);
    edges.push(...a.left, ...b.left, ...a.right, ...b.right);
  }
  return { center, edges };
}
"""
    if visuals.read_text(encoding='utf-8') != visuals_text:
        visuals.write_text(visuals_text, encoding='utf-8')
        changed.append(visuals.relative_to(root).as_posix())

    renderer = root / 'app/renderer.js'
    replace_once(
        renderer,
        """    const data=buildTerrainConformingPathSurface(pathObject,terrain,paths);if(!data.indices.length)return null;
    const mesh=createBufferMesh(this.gl,data);this.pathSurfaces.set(pathObject.id,{signature,mesh});return mesh;""",
        """    const data=buildTerrainConformingPathSurface(pathObject,terrain,paths);if(!data.indices.length)return null;
    const mesh=createBufferMesh(this.gl,data);mesh.pathwayDiagnostics=data.diagnostics||null;this.pathSurfaces.set(pathObject.id,{signature,mesh,diagnostics:data.diagnostics||null});return mesh;""",
        changed,
        'pathway mesh diagnostics cache'
    )
    replace_once(
        renderer,
        """const firstPath=materialPath||scene.objects.find(o=>o.type==='path'&&o.visible),baseAsset=this.materialAsset(materialPath?.properties?.materialId||object.properties?.materialId),pathAsset=this.materialAsset(firstPath?.properties?.materialId),""",
        """const firstPath=materialPath||scene.objects.find(o=>o.type==='path'&&o.visible),baseAsset=this.materialAsset(object.properties?.materialId),pathAsset=this.materialAsset(firstPath?.properties?.materialId),""",
        changed,
        'terrain-to-road material authority'
    )
    replace_once(
        renderer,
        """    gl.disable(gl.BLEND);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1,-1);
    for(const pathObject of paths){const mesh=this.pathSurfaceFor(pathObject,scene);if(!mesh)continue;const proxy={id:`path-surface:${pathObject.id}`,type:'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{...pathObject.properties,color:pathObject.properties?.color||'#73573d',opacity:1,castsShadows:false}};this.drawMesh(proxy,mesh,viewProj,lightViewProj,scene,false,camera,lights,null,pathObject);}""",
        """    gl.disable(gl.BLEND);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);
    for(const pathObject of paths){const mesh=this.pathSurfaceFor(pathObject,scene);if(!mesh)continue;const proxy={id:`path-surface:${pathObject.id}`,type:'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{...pathObject.properties,materialId:terrain.properties?.materialId||null,color:terrain.properties?.color||'#35522f',opacity:1,castsShadows:false,receivesShadows:true}};this.drawMesh(proxy,mesh,viewProj,lightViewProj,scene,false,camera,lights,null,pathObject);}""",
        changed,
        'multi-material pathway corridor pass'
    )
    replace_once(
        renderer,
        """getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport,terrainSampling:this.lastTerrainSamplingDiagnostics,pathSurfaceCount:this.pathSurfaces.size};}""",
        """getRenderDiagnostics(){return {capabilities:this.capabilities,frameResources:this.frameResources.snapshot(),hdrPipeline:this.hdrPipeline.snapshot(),renderGraph:this.renderGraph.diagnosticsSnapshot(),lastFrameReport:this.lastFrameReport,terrainSampling:this.lastTerrainSamplingDiagnostics,pathSurfaceCount:this.pathSurfaces.size,pathwayCorridors:[...this.pathSurfaces.entries()].map(([id,entry])=>({id,...(entry.diagnostics||{})}))};}""",
        changed,
        'Pathway Studio render telemetry'
    )

    app = root / 'app/app.js'
    replace_once(
        app,
        """import { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';""",
        """import { RenderCrashGuard, sanitizeCameraState } from './render-crash-guard.js';
import { applyPathwayPreset, renderPathwayInspector } from './pathway-studio.js';""",
        changed,
        'Pathway Studio app import'
    )
    replace_once(
        app,
        """  if (object.type==='path') return materialSelect(p.materialId)+propColor('Fallback color','color',p.color)+propNumber('Path width','width',p.width||3,'0.1',.2,50)+propNumber('Blend shoulder','blendDistance',p.blendDistance??2.5,'0.1',.1,30)+propNumber('Edge irregularity','edgeNoise',p.edgeNoise??.5,'0.05',0,4)+propCheck('Conform to terrain','conformToTerrain',p.conformToTerrain!==false)+propCheck('Collision','collider',p.collider!==false)+propCheck('Navigation','navigation',p.navigation!==false)+propNumber('Nature clearance','vegetationExclusion',p.vegetationExclusion||0,'0.1',0,20)+`<div class="surface-blend-callout">The terrain remains authoritative. This path paints a soft, noise-broken material mask into the terrain instead of floating a hard-edged mesh above it.</div>`;""",
        """  if (object.type==='path') return renderPathwayInspector(object,scene?.objects.find(item=>item.type==='terrain'&&item.visible!==false),scene?.objects.filter(item=>item.type==='path'&&item.visible!==false)||[],{materialSelect,propColor,propNumber,propCheck,escapeHtml});""",
        changed,
        'Pathway Studio inspector'
    )
    replace_once(
        app,
        """function bindInspector(object) {
  if(object.properties?.celestialProxy)return;""",
        """function bindInspector(object) {
  if(object.properties?.celestialProxy)return;
  if(object.type==='path'){
    $$('[data-pathway-live]').forEach(input=>input.addEventListener('input',()=>{
      const key=input.dataset.propertyKey;if(!key)return;
      object.properties[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
      markLocalMutation();
    }));
    $('#applyPathwayPresetButton')?.addEventListener('click',()=>{
      const preset=$('[data-pathway-preset]')?.value||'dirtRoad';
      patchObject(object.id,{properties:applyPathwayPreset(object.properties,preset)});
    });
    $('#fitPathwayLanesButton')?.addEventListener('click',()=>{
      const laneCount=Math.max(1,Number(object.properties.laneCount||2)),laneWidth=Math.max(.5,Number(object.properties.laneWidth||2.4));
      patchObject(object.id,{properties:{width:laneCount*laneWidth,profileRevision:Number(object.properties.profileRevision||1)+1}});
    });
    $('#reversePathwayButton')?.addEventListener('click',()=>{
      const points=deepClone(object.properties.points||[]).reverse();
      patchObject(object.id,{properties:{points,profileRevision:Number(object.properties.profileRevision||1)+1}});
    });
    $('#rebuildPathwayButton')?.addEventListener('click',()=>patchObject(object.id,{properties:{profileRevision:Number(object.properties.profileRevision||1)+1}}));
  }""",
        changed,
        'Pathway Studio actions and live preview'
    )

    styles = root / 'app/styles.css'
    append_once(
        styles,
        '.pathway-studio{display:grid;gap:10px}',
        """
.pathway-studio{display:grid;gap:10px}
.pathway-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px;border:1px solid #4b3a69;border-radius:10px;background:linear-gradient(145deg,rgba(86,54,131,.22),rgba(20,27,38,.92))}
.pathway-hero>div{display:grid;gap:4px}.pathway-hero strong{font-size:13px}.pathway-hero p,.pathway-preset-description,.pathway-control p{margin:0;color:var(--muted);font-size:10px;line-height:1.45}
.pathway-kicker{font-size:9px;letter-spacing:.12em;color:#c8a7ff;font-weight:800}
.pathway-status{white-space:nowrap;border:1px solid #355c4b;background:#14291f;color:#8ce0b2;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:800}.pathway-status.warn{border-color:#665126;background:#2a2112;color:#e8bf6c}
.pathway-preset-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.pathway-preset-row select,.pathway-control input,.pathway-control select{width:100%;min-height:31px;border:1px solid var(--line);border-radius:7px;background:#0d131c;padding:5px 7px}
.pathway-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.pathway-metric{display:grid;gap:2px;padding:8px;border:1px solid var(--line-soft);border-radius:8px;background:#0d131b}.pathway-metric strong{font-size:12px}.pathway-metric span{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.pathway-metric.good{border-color:#294b3d}.pathway-metric.warn{border-color:#5d4824}.pathway-metric.bad{border-color:#683541}
.pathway-warnings{display:grid;gap:5px}.pathway-warnings p{margin:0;padding:7px 8px;border-left:3px solid var(--yellow);background:#211b11;color:#d8bd82;font-size:10px;line-height:1.4}
.pathway-group{border:1px solid var(--line-soft);border-radius:9px;background:#0c1118;overflow:hidden}.pathway-group summary{cursor:pointer;padding:9px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;background:#111822}.pathway-group[open] summary{border-bottom:1px solid var(--line-soft)}
.pathway-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:9px}.pathway-control{display:grid;gap:4px}.pathway-control label{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:10px;color:#cbd5e4}.pathway-control label small{color:var(--muted);font-size:8px}
.pathway-checks{display:grid;gap:5px;padding:0 9px 9px}.pathway-check{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border:1px solid var(--line-soft);border-radius:7px;background:#101720}.pathway-check span{display:grid;gap:2px}.pathway-check strong{font-size:10px}.pathway-check small{font-size:9px;color:var(--muted);line-height:1.35}
.pathway-actions{display:flex;flex-wrap:wrap;gap:6px;padding:0 9px 9px}.pathway-actions .button{height:29px;font-size:10px}
""",
        changed
    )

    tests = root / 'tests/phase1j-pathway-studio.test.mjs'
    if not tests.exists():
        tests.write_text(
            """import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePathProperties, compilePathProfile } from '../app/worldgen.js';
import { buildPathwayCorridor, analyzePathwayCorridor } from '../app/pathway-corridor.js';
import { PATHWAY_PRESETS, applyPathwayPreset } from '../app/pathway-studio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terrain={id:'large',type:'terrain',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{preset:'rollingHills',sizeX:2048,sizeZ:2048,resolutionX:64,resolutionZ:64,height:34,seed:91}};
const pathObject={id:'mountain-route',type:'path',visible:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},properties:{worldSpacePoints:true,points:[[-420,-260],[-120,30],[80,170],[390,250]],...PATHWAY_PRESETS.mountainRoad,carveTerrain:true}};

test('path properties expose engineering-grade corridor controls with bounded defaults',()=>{
  const properties=normalizePathProperties({});
  assert.equal(properties.carveTerrain,true);
  assert.equal(properties.bankMode,'auto');
  assert.ok(properties.shoulderWidth>0);
  assert.ok(properties.sideSlopeWidth>0);
  assert.ok(properties.meshSpacing>=.15);
  assert.ok(properties.profileSmoothingPasses>=0);
});

test('Pathway Studio presets preserve spline authority while applying complete road designs',()=>{
  const source={points:[[0,0],[10,0]],worldSpacePoints:true,materialId:'material-dirt',profileRevision:4};
  const next=applyPathwayPreset(source,'highway');
  assert.deepEqual(next.points,source.points);
  assert.equal(next.materialId,'material-dirt');
  assert.equal(next.laneCount,4);
  assert.equal(next.width,14.4);
  assert.equal(next.profileRevision,5);
});

test('grade-aware profile stays within configured grade and cut/fill bounds',()=>{
  const profile=compilePathProfile(pathObject,terrain);
  const properties=normalizePathProperties(pathObject.properties,pathObject.transform);
  assert.ok(profile.length>20);
  for(let index=1;index<profile.length;index++){
    const previous=profile[index-1],current=profile[index],distance=Math.max(1e-6,Math.hypot(current.x-previous.x,current.z-previous.z));
    assert.ok(Math.abs((current.y-previous.y)/distance)*100<=properties.maxGradePercent+.001);
    assert.ok(current.y>=current.baseY-properties.maxCutDepth-.001);
    assert.ok(current.y<=current.baseY+properties.maxFillDepth+.001);
  }
});

test('corridor contains road crown, shoulders, drainage slopes, and terrain seams',()=>{
  const mesh=buildPathwayCorridor(pathObject,terrain,[pathObject]);
  assert.ok(mesh.positions.length>500);
  assert.ok(mesh.indices.length>500);
  assert.equal(mesh.diagnostics.crossSectionBands,9);
  const firstRow=[...mesh.blends.slice(0,9)];
  assert.deepEqual(firstRow,[0,.12,.48,1,1,1,.48,.12,0]);
  assert.ok(mesh.diagnostics.triangleCount>0);
  assert.ok(mesh.diagnostics.renderLift>0);
  assert.ok([...mesh.normals].every(Number.isFinite));
});

test('route diagnostics surface terrain risk and civil-engineering recommendations',()=>{
  const diagnostics=analyzePathwayCorridor(pathObject,terrain,[pathObject]);
  assert.equal(diagnostics.valid,true);
  assert.ok(diagnostics.length>500);
  assert.ok(diagnostics.terrainSpacing>pathObject.properties.width);
  assert.ok(Array.isArray(diagnostics.warnings));
  assert.ok(diagnostics.warnings.some(message=>message.includes('terrain grid')));
});

test('renderer and editor expose Pathway Studio authority and telemetry',()=>{
  const renderer=fs.readFileSync(path.join(ROOT,'app','renderer.js'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'app','app.js'),'utf8');
  assert.match(renderer,/pathwayCorridors:/);
  assert.match(renderer,/materialId:terrain\\.properties\\?\\.materialId/);
  assert.match(renderer,/gl\\.polygonOffset\\(-2,-2\\)/);
  assert.match(app,/renderPathwayInspector/);
  assert.match(app,/applyPathwayPreset/);
  assert.match(app,/fitPathwayLanesButton/);
  assert.doesNotMatch(app,/paints a soft, noise-broken material mask into the terrain instead of floating/);
});
""",
            encoding='utf-8'
        )
        changed.append(tests.relative_to(root).as_posix())
