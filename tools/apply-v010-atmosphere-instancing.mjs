import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceOnce(file, before, after, label) {
  const source = read(file);
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Atmosphere/instancing patch target not found: ${label || file}`);
  write(file, source.replace(before, after));
  return true;
}

replaceOnce(
  'server/v010-systems.mjs',
  "  const fogMultiplier = 1 - Number(world.weather.fog || 0) * 0.88;\n  scene.settings = {",
  "  const weatherPreset = String(world.weather.preset || 'clear');\n  const presetPrecipitation = { rain: 0.65, storm: 1, snow: 0.55 }[weatherPreset] || 0;\n  const presetFog = { fog: 0.72, rain: 0.18, storm: 0.24, snow: 0.14, overcast: 0.1 }[weatherPreset] || 0;\n  const precipitation = clamp(Math.max(Number(world.weather.precipitation || 0), presetPrecipitation), 0, 1);\n  const weatherFog = clamp(Math.max(Number(world.weather.fog || 0), presetFog), 0, 1);\n  const cloudCoverage = clamp(Number(world.clouds.coverage || 0), 0, 1);\n  const cloudDensity = clamp(Number(world.clouds.density || 0), 0, 1);\n  const cloudAttenuation = 1 - clamp(cloudCoverage * cloudDensity * Number(world.clouds.shadowStrength || 0.28), 0, 0.82);\n  const atmosphericHaze = clamp(Number(world.atmosphere.haze || 0) + Number(world.atmosphere.mie || 0) * 0.45 + Number(world.atmosphere.humidity || 0) * 0.18, 0, 0.9);\n  const fogMultiplier = Math.max(0.04, (1 - weatherFog * 0.88) * (1 - atmosphericHaze * 0.55));\n  scene.settings = {",
  'weather and cloud derived state'
);

replaceOnce(
  'server/v010-systems.mjs',
  "    ambientIntensity: 0.08 + day * 0.42 + Number(world.lighting.indirectStrength || 0.4) * 0.12,\n    fogNear: Math.max(6, Number(world.atmosphere.visibilityKm || 120) * 0.55 * Math.max(0.08, fogMultiplier)),\n    fogFar: Math.max(22, Number(world.atmosphere.visibilityKm || 120) * 2.2 * Math.max(0.08, fogMultiplier)),\n    exposure: clamp(Number(world.atmosphere.exposure || 1) * (0.82 + day * 0.18), 0.2, 3),",
  "    ambientIntensity: (0.08 + day * 0.42 + Number(world.lighting.indirectStrength || 0.4) * 0.12) * (0.72 + cloudAttenuation * 0.28),\n    fogNear: Math.max(6, Number(world.atmosphere.visibilityKm || 120) * 0.55 * fogMultiplier),\n    fogFar: Math.max(22, Number(world.atmosphere.visibilityKm || 120) * 2.2 * fogMultiplier),\n    exposure: clamp(Number(world.atmosphere.exposure || 1) * (0.82 + day * 0.18) * (0.88 + cloudAttenuation * 0.12), 0.2, 3),\n    weatherWetness: clamp(Math.max(Number(world.weather.wetness || 0), precipitation * (weatherPreset === 'snow' ? 0.2 : 0.85)), 0, 1),\n    weatherSnow: clamp(Math.max(Number(world.weather.snow || 0), weatherPreset === 'snow' ? precipitation : 0), 0, 1),\n    windDirection: Array.isArray(world.weather.windDirection) ? world.weather.windDirection.slice(0, 3) : [1, 0, 0.25],\n    windStrength: clamp(Math.max(Number(world.weather.windStrength || 0), weatherPreset === 'storm' ? 0.88 : weatherPreset === 'rain' ? 0.48 : 0), 0, 1),\n    cloudCoverage,\n    cloudDensity,\n    cloudAttenuation,\n    starIntensity: clamp(Number(world.sky.starIntensity || 0) * night * (1 - cloudCoverage * 0.8), 0, 3),\n    starDensity: clamp(Number(world.sky.starDensity || 0.72), 0, 1),\n    milkyWayIntensity: clamp(Number(world.sky.milkyWayIntensity || 0) * night * (1 - cloudCoverage * 0.7), 0, 3),\n    auroraIntensity: clamp(Number(world.sky.auroraIntensity || 0) * night * (1 - cloudCoverage * 0.5), 0, 3),\n    atmosphereQuality: world.atmosphere.quality || 'balanced',",
  'scene environment integration'
);

replaceOnce(
  'server/v010-systems.mjs',
  "    intensity: Number(world.lighting.sunIntensity || 3.2) * Math.max(0.015, day),",
  "    intensity: Number(world.lighting.sunIntensity || 3.2) * Math.max(0.015, day) * cloudAttenuation,",
  'cloud light attenuation'
);

replaceOnce(
  'app/v010.js',
  "function populate() {\n  if (!snapshot?.world) return;\n  const world = snapshot.world;",
  "function applyViewportEnvironment() {\n  const wrap = document.getElementById('viewportWrap');\n  const settings = snapshot?.scene?.settings || snapshot?.state?.scenes?.find(item => item.id === snapshot?.state?.activeSceneId)?.settings || {};\n  if (!wrap) return;\n  wrap.style.setProperty('--v010-stars', String(Math.max(0, Math.min(1, Number(settings.starIntensity || 0) / 1.5))));\n  wrap.style.setProperty('--v010-star-density', String(Math.max(0.12, Math.min(1, Number(settings.starDensity || 0.72)))));\n  wrap.style.setProperty('--v010-milky-way', String(Math.max(0, Math.min(1, Number(settings.milkyWayIntensity || 0) / 1.5))));\n  wrap.style.setProperty('--v010-aurora', String(Math.max(0, Math.min(1, Number(settings.auroraIntensity || 0) / 1.5))));\n  wrap.style.setProperty('--v010-clouds', String(Math.max(0, Math.min(0.95, Number(settings.cloudCoverage || 0) * (0.45 + Number(settings.cloudDensity || 0) * 0.55)))));\n  wrap.style.setProperty('--v010-cloud-speed', `${Math.max(18, 130 - Number(snapshot?.world?.clouds?.windSpeed || 12) * 4)}s`);\n  wrap.dataset.weather = String(snapshot?.world?.weather?.preset || 'clear');\n}\n\nfunction populate() {\n  if (!snapshot?.world) return;\n  const world = snapshot.world;",
  'viewport atmosphere visuals'
);

replaceOnce(
  'app/v010.js',
  "  field('v010SelectedAsset').textContent = selectedAssetId() || 'none';\n}",
  "  field('v010SelectedAsset').textContent = selectedAssetId() || 'none';\n  applyViewportEnvironment();\n}",
  'apply viewport atmosphere variables'
);

const cssAppend = `

#viewportWrap {
  isolation: isolate;
  overflow: hidden;
}

#viewportWrap::before,
#viewportWrap::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#viewportWrap::before {
  z-index: 0;
  opacity: max(var(--v010-stars, 0), var(--v010-aurora, 0));
  background-image:
    radial-gradient(circle at 7% 14%, rgba(255,255,255,0.95) 0 0.7px, transparent 1.4px),
    radial-gradient(circle at 21% 32%, rgba(190,218,255,0.9) 0 0.6px, transparent 1.2px),
    radial-gradient(circle at 37% 11%, rgba(255,236,202,0.92) 0 0.8px, transparent 1.5px),
    radial-gradient(circle at 53% 27%, rgba(255,255,255,0.9) 0 0.55px, transparent 1.2px),
    radial-gradient(circle at 73% 8%, rgba(190,218,255,0.9) 0 0.75px, transparent 1.4px),
    radial-gradient(circle at 88% 36%, rgba(255,245,224,0.9) 0 0.7px, transparent 1.35px),
    linear-gradient(116deg, transparent 25%, rgba(83,255,190,calc(var(--v010-aurora, 0) * 0.32)) 43%, rgba(83,133,255,calc(var(--v010-aurora, 0) * 0.24)) 54%, transparent 72%),
    radial-gradient(ellipse at 58% 32%, rgba(188,205,255,calc(var(--v010-milky-way, 0) * 0.18)), transparent 54%);
  background-size:
    calc(180px / var(--v010-star-density, .72)) calc(140px / var(--v010-star-density, .72)),
    calc(230px / var(--v010-star-density, .72)) calc(190px / var(--v010-star-density, .72)),
    calc(310px / var(--v010-star-density, .72)) calc(210px / var(--v010-star-density, .72)),
    calc(270px / var(--v010-star-density, .72)) calc(250px / var(--v010-star-density, .72)),
    calc(350px / var(--v010-star-density, .72)) calc(180px / var(--v010-star-density, .72)),
    calc(290px / var(--v010-star-density, .72)) calc(230px / var(--v010-star-density, .72)),
    100% 100%, 100% 100%;
  mix-blend-mode: screen;
  transition: opacity 1.2s ease;
}

#viewportWrap::after {
  z-index: 0;
  opacity: var(--v010-clouds, 0);
  background:
    radial-gradient(ellipse at 12% 24%, rgba(235,242,249,.72) 0 9%, transparent 25%),
    radial-gradient(ellipse at 34% 18%, rgba(219,231,241,.65) 0 12%, transparent 28%),
    radial-gradient(ellipse at 59% 28%, rgba(238,244,249,.68) 0 11%, transparent 27%),
    radial-gradient(ellipse at 82% 16%, rgba(205,220,233,.64) 0 13%, transparent 29%),
    linear-gradient(to bottom, rgba(160,180,198,.18), transparent 58%);
  background-size: 720px 330px, 880px 390px, 760px 350px, 940px 410px, 100% 100%;
  filter: blur(12px) saturate(.82);
  mix-blend-mode: screen;
  animation: v010-cloud-drift var(--v010-cloud-speed, 82s) linear infinite;
  transition: opacity 1.4s ease;
}

#viewportWrap[data-weather='storm']::after,
#viewportWrap[data-weather='overcast']::after {
  filter: blur(10px) saturate(.55) brightness(.62);
  mix-blend-mode: normal;
}

#viewport {
  position: relative;
  z-index: 1;
}

@keyframes v010-cloud-drift {
  from { background-position: 0 0, 140px 12px, 330px -4px, 520px 18px, 0 0; }
  to { background-position: 720px 0, 1020px 12px, 1090px -4px, 1460px 18px, 0 0; }
}
`;
if (!read('app/v010.css').includes('@keyframes v010-cloud-drift')) write('app/v010.css', read('app/v010.css') + cssAppend);

replaceOnce(
  'app/renderer.js',
  "layout(location=3) in float aBlend;\nuniform mat4 uModel;",
  "layout(location=3) in float aBlend;\nlayout(location=4) in vec4 aInstance0;\nlayout(location=5) in vec4 aInstance1;\nlayout(location=6) in vec4 aInstance2;\nlayout(location=7) in vec4 aInstance3;\nuniform mat4 uModel;\nuniform float uInstanced;\nuniform float uTime;\nuniform float uFoliageWind;\nuniform float uFoliageWindStrength;\nuniform float uFoliageWindFrequency;\nuniform float uFoliageBaseY;\nuniform float uFoliageHeight;\nuniform vec3 uFoliageWindDirection;",
  'foliage instance shader inputs'
);

replaceOnce(
  'app/renderer.js',
  "void main(){\n  vec4 world=uModel*vec4(aPosition,1.0);\n  vWorld=world.xyz;\n  vNormal=normalize(uNormalMat*aNormal);",
  "void main(){\n  mat4 instanceModel=mat4(aInstance0,aInstance1,aInstance2,aInstance3);\n  mat4 model=uInstanced>.5?instanceModel:uModel;\n  vec3 localPosition=aPosition;\n  if(uFoliageWind>.5){\n    float height=max(uFoliageHeight,.001);\n    float bend=clamp((aPosition.y-uFoliageBaseY)/height,0.0,1.0);\n    float phase=dot(model[3].xz,vec2(.173,.119));\n    float sway=sin(uTime*uFoliageWindFrequency+phase)*uFoliageWindStrength*bend*bend;\n    localPosition.xz+=normalize(uFoliageWindDirection.xz+vec2(.0001))*sway;\n  }\n  vec4 world=model*vec4(localPosition,1.0);\n  vWorld=world.xyz;\n  vNormal=normalize(uInstanced>.5?mat3(model)*aNormal:uNormalMat*aNormal);",
  'foliage instance and wind vertex transform'
);

replaceOnce(
  'app/renderer.js',
  "layout(location=0) in vec3 aPosition;\nuniform mat4 uModel;\nuniform mat4 uLightViewProj;\nvoid main(){gl_Position=uLightViewProj*uModel*vec4(aPosition,1.0);}`;",
  "layout(location=0) in vec3 aPosition;\nlayout(location=4) in vec4 aInstance0;\nlayout(location=5) in vec4 aInstance1;\nlayout(location=6) in vec4 aInstance2;\nlayout(location=7) in vec4 aInstance3;\nuniform mat4 uModel;\nuniform mat4 uLightViewProj;\nuniform float uInstanced;\nvoid main(){mat4 instanceModel=mat4(aInstance0,aInstance1,aInstance2,aInstance3);mat4 model=uInstanced>.5?instanceModel:uModel;gl_Position=uLightViewProj*model*vec4(aPosition,1.0);}`;",
  'instanced depth shader'
);

replaceOnce(
  'app/renderer.js',
  "    this.dynamic=new Map();this.pathLines=new Map();this.textureCache=new Map();this.assets=[];",
  "    this.dynamic=new Map();this.pathLines=new Map();this.textureCache=new Map();this.instanceBuffers=new Set();this.renderStart=performance.now();this.assets=[];",
  'instance renderer state'
);

replaceOnce(
  'app/renderer.js',
  "  pathBuffers(pathObject,scene){",
  "  prepareInstances(mesh,objects){\n    const gl=this.gl,matrices=new Float32Array(objects.length*16);\n    objects.forEach((object,index)=>matrices.set(modelMatrix(object.transform),index*16));\n    if(!mesh.instanceBuffer){mesh.instanceBuffer=gl.createBuffer();mesh.buffers.push(mesh.instanceBuffer);this.instanceBuffers.add(mesh.instanceBuffer);}\n    gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,matrices,gl.DYNAMIC_DRAW);\n    for(let column=0;column<4;column++){const location=4+column;gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,64,column*16);gl.vertexAttribDivisor(location,1);}\n    return objects.length;\n  }\n  foliageGroups(scene,camera){\n    const groups=new Map();\n    for(const object of scene.objects){\n      if(!object.visible||object.type!=='model'||!object.properties?.foliageInstance)continue;\n      const limit=Number(object.properties?.lod?.impostor||180),distance=Math.hypot(object.transform.position[0]-camera.position[0],object.transform.position[1]-camera.position[1],object.transform.position[2]-camera.position[2]);\n      if(distance>limit)continue;\n      const key=`${object.properties.assetId||'missing'}:${object.properties.foliageSpeciesId||'species'}`;\n      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);\n    }\n    return groups;\n  }\n  pathBuffers(pathObject,scene){",
  'instance buffer and foliage grouping methods'
);

replaceOnce(
  'app/renderer.js',
  "  drawMesh(object,mesh,viewProj,lightViewProj,scene,selected,camera,lights){\n    const gl=this.gl,p=this.meshProgram;gl.useProgram(p);gl.bindVertexArray(mesh.vao);let transform=object.transform;if(object.type==='directionalLight'||object.type==='pointLight')transform={...object.transform,scale:[.7,.7,.7]};const model=modelMatrix(transform);",
  "  drawMesh(object,mesh,viewProj,lightViewProj,scene,selected,camera,lights,instances=null){\n    const gl=this.gl,p=this.meshProgram;gl.useProgram(p);gl.bindVertexArray(mesh.vao);const instanced=Array.isArray(instances)&&instances.length>0;let transform=object.transform;if(object.type==='directionalLight'||object.type==='pointLight')transform={...object.transform,scale:[.7,.7,.7]};const model=instanced?mat4Identity():modelMatrix(transform);",
  'drawMesh instancing signature'
);

replaceOnce(
  'app/renderer.js',
  "    setM4('uModel',model);setM4('uViewProj',viewProj);setM4('uLightViewProj',lightViewProj);gl.uniformMatrix3fv(gl.getUniformLocation(p,'uNormalMat'),false,normalMatrix3(model));",
  "    setM4('uModel',model);setM4('uViewProj',viewProj);setM4('uLightViewProj',lightViewProj);gl.uniformMatrix3fv(gl.getUniformLocation(p,'uNormalMat'),false,normalMatrix3(model));\n    set1('uInstanced',instanced?1:0);\n    const instanceCount=instanced?this.prepareInstances(mesh,instances):0,asset=object.type==='model'?this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId):null,bounds=asset?.bounds||{min:[0,0,0],size:[1,1,1]},wind=object.properties?.wind||{};\n    set1('uTime',(performance.now()-this.renderStart)/1000);set1('uFoliageWind',instanced?1:0);set1('uFoliageWindStrength',Number(wind.strength??.35)*Number(scene.settings.windStrength??.35));set1('uFoliageWindFrequency',Number(wind.frequency??1));set1('uFoliageBaseY',Number(bounds.min?.[1]??0));set1('uFoliageHeight',Math.max(.001,Number(bounds.size?.[1]??1)));set3('uFoliageWindDirection',new Float32Array(Array.isArray(scene.settings.windDirection)?scene.settings.windDirection:[1,0,.25]));\n    const drawRange=(count,offset=0)=>{if(instanced)gl.drawElementsInstanced(gl.TRIANGLES,count,mesh.indexType,offset,instanceCount);else gl.drawElements(gl.TRIANGLES,count,mesh.indexType,offset);};",
  'instance uniforms and draw helper'
);

replaceOnce(
  'app/renderer.js',
  "        gl.drawElements(gl.TRIANGLES,Number(group.indexCount||0),mesh.indexType,Number(group.indexOffset||0)*mesh.indexStride);",
  "        drawRange(Number(group.indexCount||0),Number(group.indexOffset||0)*mesh.indexStride);",
  'instanced material group draw'
);

replaceOnce(
  'app/renderer.js',
  "    }else gl.drawElements(gl.TRIANGLES,mesh.count,mesh.indexType,0);",
  "    }else drawRange(mesh.count,0);",
  'instanced mesh draw'
);

replaceOnce(
  'app/renderer.js',
  "    const objects=scene.objects.filter(o=>o.visible&&!['empty','path'].includes(o.type));objects.sort((a,b)=>{const rank=o=>o.type==='terrain'?-20:o.type==='decal'?20+Number(o.properties?.sortOrder||0):0;return rank(a)-rank(b);});for(const object of objects){const mesh=this.meshFor(object,scene);if(!mesh)continue;if(object.type==='decal'){gl.enable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);}this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.enable(gl.CULL_FACE);}}",
  "    const foliageGroups=this.foliageGroups(scene,camera),foliageIds=new Set([...foliageGroups.values()].flat().map(item=>item.id));\n    const objects=scene.objects.filter(o=>o.visible&&!['empty','path'].includes(o.type)&&!foliageIds.has(o.id));objects.sort((a,b)=>{const rank=o=>o.type==='terrain'?-20:o.type==='decal'?20+Number(o.properties?.sortOrder||0):0;return rank(a)-rank(b);});for(const object of objects){const mesh=this.meshFor(object,scene);if(!mesh)continue;if(object.type==='decal'){gl.enable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);}this.drawMesh(object,mesh,viewProj,lightViewProj,scene,object.id===selectedId,camera,lights);if(object.type==='decal'){gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.enable(gl.CULL_FACE);}}\n    for(const instances of foliageGroups.values()){const object=instances[0],mesh=this.meshFor(object,scene);if(mesh)this.drawMesh(object,mesh,viewProj,lightViewProj,scene,false,camera,lights,instances);}",
  'batched foliage render loop'
);

console.log('Connected atmosphere/weather rendering and WebGL2 foliage instancing.');
