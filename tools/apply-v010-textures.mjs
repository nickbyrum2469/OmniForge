import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const resolve = file => path.join(root, file);
const read = file => fs.readFileSync(resolve(file), 'utf8');
const write = (file, content) => fs.writeFileSync(resolve(file), content, 'utf8');

function replaceOnce(file, before, after, label) {
  const source = read(file);
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Texture patch target not found: ${label || file}`);
  write(file, source.replace(before, after));
  return true;
}

function replaceRegex(file, pattern, replacement, alreadyPresent, label) {
  const source = read(file);
  if (alreadyPresent && source.includes(alreadyPresent)) return false;
  if (!pattern.test(source)) throw new Error(`Texture patch target not found: ${label || file}`);
  write(file, source.replace(pattern, replacement));
  return true;
}

function functionSource(fn, targetName) {
  return fn.toString().replace(fn.name, targetName);
}

function imageExtensionV010(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  return null;
}

function imageBufferV010(gltf, buffers, image, imageIndex) {
  if (typeof image?.uri === 'string') {
    const decoded = decodeDataUri(image.uri);
    if (!decoded) return { buffer: null, warning: `Image ${imageIndex} uses an external URI. The single-file importer preserved the source reference but did not copy an external file.` };
    const mimeMatch = /^data:([^;,]+)/.exec(image.uri);
    return { buffer: decoded, mimeType: image.mimeType || mimeMatch?.[1] || 'application/octet-stream' };
  }
  if (Number.isInteger(image?.bufferView)) {
    const view = gltf.bufferViews?.[image.bufferView];
    if (!view) throw new Error(`Image ${imageIndex} references missing buffer view ${image.bufferView}.`);
    if (!Number.isInteger(view.buffer) || view.buffer < 0) throw new Error(`Image ${imageIndex} references an invalid buffer.`);
    const source = buffers[view.buffer];
    if (!source) throw new Error(`Image ${imageIndex} references missing buffer ${view.buffer}.`);
    const start = Number(view.byteOffset || 0);
    const length = Number(view.byteLength || 0);
    if (start < 0 || length <= 0 || start + length > source.length) throw new Error(`Image ${imageIndex} exceeds its declared buffer view.`);
    return { buffer: source.subarray(start, start + length), mimeType: image.mimeType || 'application/octet-stream' };
  }
  return { buffer: null, warning: `Image ${imageIndex} has neither a data URI nor a buffer view.` };
}

function extractEmbeddedTexturesV010(gltf, buffers, canonicalFolder, assetId) {
  const texturesFolder = path.join(canonicalFolder, 'textures');
  const records = [];
  const warnings = [];
  for (let imageIndex = 0; imageIndex < (gltf.images || []).length; imageIndex += 1) {
    const image = gltf.images[imageIndex] || {};
    try {
      const extracted = imageBuffer(gltf, buffers, image, imageIndex);
      if (!extracted.buffer) {
        if (extracted.warning) warnings.push(extracted.warning);
        continue;
      }
      const extension = imageExtension(extracted.mimeType);
      if (!extension) {
        warnings.push(`Image ${imageIndex} uses unsupported MIME type ${extracted.mimeType}; its source bytes remain preserved in the original import.`);
        continue;
      }
      fs.mkdirSync(texturesFolder, { recursive: true });
      const fileName = `image-${String(imageIndex).padStart(3, '0')}.${extension}`;
      const output = path.join(texturesFolder, fileName);
      fs.writeFileSync(output, extracted.buffer);
      records.push({
        id: `texture-${assetId}-${imageIndex}`,
        imageIndex,
        name: image.name || `Image ${imageIndex}`,
        mimeType: extracted.mimeType,
        file: `assets/models/${assetId}/canonical/textures/${fileName}`,
        url: `/assets/models/${encodeURIComponent(assetId)}/canonical/textures/${encodeURIComponent(fileName)}`,
        fileBytes: extracted.buffer.length,
        checksum: checksum(extracted.buffer),
        source: Number.isInteger(image.bufferView) ? 'bufferView' : 'data-uri',
        createdAt: now()
      });
    } catch (error) {
      warnings.push(`Image ${imageIndex}: ${error.message}`);
    }
  }
  return { records, warnings };
}

function attachTextureUrlsV010(gltf, mesh, textures) {
  const images = new Map((textures || []).map(item => [item.imageIndex, item]));
  const textureUrl = textureIndex => {
    if (!Number.isInteger(textureIndex)) return null;
    const texture = gltf.textures?.[textureIndex];
    if (!texture || !Number.isInteger(texture.source)) return null;
    return images.get(texture.source)?.url || null;
  };
  const enrich = material => {
    material.textureUrls = {
      baseColor: textureUrl(material.textureSlots?.baseColor),
      metallicRoughness: textureUrl(material.textureSlots?.metallicRoughness),
      normal: textureUrl(material.textureSlots?.normal),
      occlusion: textureUrl(material.textureSlots?.occlusion),
      emissive: textureUrl(material.textureSlots?.emissive)
    };
    material.authoredUvSet = 0;
    return material;
  };
  for (const material of mesh.materials || []) enrich(material);
  for (const group of mesh.groups || []) {
    if (group.material) enrich(group.material);
  }
  return mesh;
}

function importModelAssetV010({ assetRoot, name, fileName, dataUrl, category = 'static-prop', license = 'User supplied — review before release', creator = 'User', source = 'Local import', tags = [] }) {
  const { buffer } = decodeAssetDataUrl(dataUrl);
  const extension = String(fileName || 'model.glb').toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
  const digest = checksum(buffer);
  const assetId = `asset-${slugify(name || path.basename(fileName || 'model', path.extname(fileName || '')), 'model')}-${digest.slice(0, 10)}`;
  const folder = path.join(assetRoot, 'models', assetId);
  const staging = path.join(folder, 'source');
  const canonical = path.join(folder, 'canonical');
  fs.mkdirSync(staging, { recursive: true });
  fs.mkdirSync(canonical, { recursive: true });
  const sourceFile = path.join(staging, `original.${extension}`);
  if (!fs.existsSync(sourceFile)) fs.writeFileSync(sourceFile, buffer);

  let parsed;
  let mesh;
  let health;
  let parseError = null;
  let textures = [];
  try {
    parsed = extension === 'glb' ? parseGlb(buffer) : parseGltf(buffer);
    mesh = mergePrimitives(parsed.gltf, parsed.buffers);
    const extracted = extractEmbeddedTextures(parsed.gltf, parsed.buffers, canonical, assetId);
    textures = extracted.records;
    attachTextureUrls(parsed.gltf, mesh, textures);
    health = createHealth(parsed.gltf, mesh, buffer.length, parsed.container);
    health.warnings.push(...extracted.warnings);
    if (textures.length) health.warnings.push('Embedded texture images were extracted into the managed canonical asset. Base-color maps render with authored UV0; inspect normal, occlusion, emissive, and metallic-roughness fidelity before approval.');
  } catch (error) {
    parseError = error;
    health = {
      state: 'failed', checkedAt: now(), container: extension, fileBytes: buffer.length,
      dimensions: [0, 0, 0], bounds: null, triangleCount: 0, vertexCount: 0,
      meshCount: 0, primitiveCount: 0, materialCount: 0, textureCount: 0, imageCount: 0,
      nodeCount: 0, skeletonCount: 0, animationCount: 0, morphTargetCount: 0,
      warnings: [], blocking: [error.message], recommendedRepairs: []
    };
  }

  let meshFile = null;
  let meshUrl = null;
  let material = null;
  if (mesh && !parseError) {
    const canonicalData = canonicalMesh(mesh);
    meshFile = path.join(canonical, 'mesh.json');
    writeJson(meshFile, canonicalData);
    meshUrl = `/assets/models/${encodeURIComponent(assetId)}/canonical/mesh.json`;
    material = canonicalData.material;
  }

  const record = {
    id: assetId,
    type: 'model',
    name: String(name || path.basename(fileName || 'Imported Model', path.extname(fileName || ''))).slice(0, 120),
    category: String(category || 'static-prop').slice(0, 50),
    status: health.state === 'failed' ? 'unvalidated' : 'validated',
    approvalState: health.state === 'failed' ? 'unvalidated' : 'draft',
    source: String(source).slice(0, 500),
    sourceUri: String(source).startsWith('http') ? String(source).slice(0, 500) : null,
    creator: String(creator).slice(0, 120),
    license: String(license).slice(0, 240),
    sourceFile: `assets/models/${assetId}/source/original.${extension}`,
    canonicalFile: meshFile ? `assets/models/${assetId}/canonical/mesh.json` : null,
    meshUrl,
    checksum: digest,
    fileBytes: buffer.length,
    unitScale: 1,
    upAxis: 'y',
    forwardAxis: '-z',
    pivotMode: 'source',
    bounds: health.bounds,
    triangleCount: health.triangleCount,
    vertexCount: health.vertexCount,
    materialSlots: mesh?.materials || [],
    textures,
    skeleton: health.skeletonCount ? { skinCount: health.skeletonCount } : null,
    animations: health.animationCount ? Array.from({ length: health.animationCount }, (_, index) => ({ id: `animation-${index}`, name: parsed?.gltf?.animations?.[index]?.name || `Animation ${index + 1}` })) : [],
    collisionStatus: 'missing', lods: [],
    tags: Array.isArray(tags) ? tags.map(value => String(value).slice(0, 40)).slice(0, 30) : [],
    semanticDescription: '', affordances: [],
    health,
    validation: { state: health.state, checkedAt: now(), warnings: health.warnings, errors: health.blocking },
    provenance: {
      source: String(source).slice(0, 200), creator: String(creator).slice(0, 120), license: String(license).slice(0, 240),
      attributionRequired: false, importedAt: now(), originalFileName: path.basename(fileName || `original.${extension}`)
    },
    sourceAssetId: null, derivativeAssetIds: [], sceneUsages: [], thumbnail: null, preview: null, material,
    canonicalImporterVersion: 3, canonicalRevision: Date.now(), createdAt: now(), updatedAt: now()
  };
  writeJson(path.join(folder, 'asset-record.json'), record);
  return record;
}

function rebuildCanonicalAssetV010({ assetRoot, asset }) {
  if (!asset?.sourceFile) throw new Error('The original source file is unavailable for rebuilding.');
  const sourcePath = path.join(assetRoot, path.relative('assets', asset.sourceFile));
  if (!fs.existsSync(sourcePath)) throw new Error('The preserved original source file could not be found.');
  const buffer = fs.readFileSync(sourcePath);
  const extension = sourcePath.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
  const parsed = extension === 'glb' ? parseGlb(buffer) : parseGltf(buffer);
  const mesh = mergePrimitives(parsed.gltf, parsed.buffers);
  const canonicalPath = asset.canonicalFile
    ? path.join(assetRoot, path.relative('assets', asset.canonicalFile))
    : path.join(assetRoot, 'models', asset.id, 'canonical', 'mesh.json');
  const canonicalFolder = path.dirname(canonicalPath);
  fs.mkdirSync(canonicalFolder, { recursive: true });
  const extracted = extractEmbeddedTextures(parsed.gltf, parsed.buffers, canonicalFolder, asset.id);
  attachTextureUrls(parsed.gltf, mesh, extracted.records);
  const health = createHealth(parsed.gltf, mesh, buffer.length, parsed.container);
  health.warnings.push(...extracted.warnings);
  if (extracted.records.length) health.warnings.push('Embedded texture images were rebuilt. Base-color maps render with authored UV0; inspect the remaining PBR channels before approval.');
  const canonicalData = canonicalMesh(mesh);
  if (fs.existsSync(canonicalPath)) {
    const history = path.join(canonicalFolder, 'history');
    fs.mkdirSync(history, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    fs.copyFileSync(canonicalPath, path.join(history, `mesh-before-rebuild-${stamp}.json`));
  }
  writeJson(canonicalPath, canonicalData);
  const canonicalRelative = `assets/${relativeAssetPath(assetRoot, canonicalPath)}`;
  Object.assign(asset, {
    canonicalFile: canonicalRelative,
    meshUrl: `/${canonicalRelative.split('/').map(encodeURIComponent).join('/')}`,
    bounds: health.bounds,
    triangleCount: health.triangleCount,
    vertexCount: health.vertexCount,
    materialSlots: mesh.materials || [],
    textures: extracted.records,
    material: canonicalData.material,
    status: health.state === 'failed' ? 'unvalidated' : 'validated',
    approvalState: 'draft',
    health,
    validation: {
      state: health.state,
      checkedAt: now(),
      warnings: [...(health.warnings || []), 'Canonical import rebuilt with the current transform, material-group, and embedded-texture pipeline. Inspect the rendered result before approval.'],
      errors: health.blocking || []
    },
    canonicalImporterVersion: 3,
    canonicalRevision: Date.now(),
    processingHistory: [
      ...(asset.processingHistory || []),
      { operation: 'rebuild-canonical', at: now(), importerVersion: 3, nodeTransformsApplied: Boolean(health.nodeTransformsApplied), meshInstanceCount: Number(health.meshInstanceCount || 0), extractedTextureCount: extracted.records.length }
    ],
    updatedAt: now()
  });
  writeJson(path.join(assetRoot, 'models', asset.id, 'asset-record.json'), asset);
  return asset;
}

const pipelineFile = 'server/asset-pipeline.mjs';
let pipeline = read(pipelineFile);
if (!pipeline.includes('function imageExtension(')) {
  const marker = 'function mergePrimitives(gltf,buffers){';
  if (!pipeline.includes(marker)) throw new Error('Texture helper insertion point was not found.');
  const helpers = [
    functionSource(imageExtensionV010, 'imageExtension'),
    functionSource(imageBufferV010, 'imageBuffer'),
    functionSource(extractEmbeddedTexturesV010, 'extractEmbeddedTextures'),
    functionSource(attachTextureUrlsV010, 'attachTextureUrls')
  ].join('\n');
  pipeline = pipeline.replace(marker, `${helpers}\n${marker}`);
  write(pipelineFile, pipeline);
}
replaceRegex(
  pipelineFile,
  /export function importModelAsset\([\s\S]*?\n\}\nexport function rebuildCanonicalAsset/,
  `${functionSource(importModelAssetV010, 'importModelAsset')}\nexport function rebuildCanonicalAsset`,
  'canonicalImporterVersion: 3',
  'texture-aware model import'
);
replaceRegex(
  pipelineFile,
  /export function rebuildCanonicalAsset\([\s\S]*?\n\}\n\nexport function createSafeRepairDerivative/,
  `${functionSource(rebuildCanonicalAssetV010, 'rebuildCanonicalAsset')}\n\nexport function createSafeRepairDerivative`,
  'extractedTextureCount:',
  'texture-aware canonical rebuild'
);
replaceOnce(
  pipelineFile,
  "if((gltf.textures||[]).length||(gltf.images||[]).length)warnings.push('Texture and image references are preserved in the original glTF; the current canonical preview reproduces material factors but not every authored texture slot.');",
  "if((gltf.textures||[]).length||(gltf.images||[]).length)warnings.push('Texture and image references are preserved. Embedded PNG, JPEG, and WebP images are extracted when possible; base-color UV0 is rendered and remaining PBR channels require inspection.');",
  'texture health wording'
);

const rendererFile = 'app/renderer.js';
replaceOnce(
  rendererFile,
  'vec2 baseUV=vWorld.xz/max(uBaseTextureScale,0.05);',
  'vec2 baseUV=uIsTerrain>.5?vWorld.xz/max(uBaseTextureScale,0.05):vUV;',
  'authored model UV sampling'
);
replaceOnce(
  rendererFile,
  "  materialAsset(id){return this.assets.find(asset=>asset.id===id&&asset.type==='material')||null;}",
  "  textureFromUrl(url,flipY=false){\n    const fallback=this.whiteTexture;if(!url)return {texture:fallback,ready:false,scale:1};\n    const cacheKey=`imported:${flipY?'flip':'native'}:${url}`,cached=this.textureCache.get(cacheKey);if(cached)return {texture:cached.texture,ready:cached.ready,scale:1};\n    const entry={texture:fallback,ready:false,error:false};this.textureCache.set(cacheKey,entry);const image=new Image();\n    image.onload=()=>{const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flipY);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);entry.texture=t;entry.ready=true;};\n    image.onerror=()=>{entry.error=true;};image.src=url;return {texture:entry.texture,ready:false,scale:1};\n  }\n  materialAsset(id){return this.assets.find(asset=>asset.id===id&&asset.type==='material')||null;}",
  'imported texture loader'
);
replaceOnce(
  rendererFile,
  "        const color=Array.isArray(material.baseColor)?material.baseColor:[.62,.66,.72,1];\n        set3('uBaseColor',new Float32Array([Number(color[0]??.62),Number(color[1]??.66),Number(color[2]??.72)]));\n        set1('uRoughness',Number(material.roughness??.8));set1('uMetallic',Number(material.metallic??0));",
  "        const color=Array.isArray(material.baseColor)?material.baseColor:[.62,.66,.72,1],importedBase=this.textureFromUrl(material.textureUrls?.baseColor,false);\n        set3('uBaseColor',new Float32Array([Number(color[0]??.62),Number(color[1]??.66),Number(color[2]??.72)]));\n        bindMap(0,'uBaseTexture',importedBase);set1('uUseBaseTexture',importedBase.ready?1:0);set1('uBaseTextureScale',1);\n        set1('uOpacity',Number(color[3]??1));set1('uRoughness',Number(material.roughness??.8));set1('uMetallic',Number(material.metallic??0));",
  'per-group imported base-color texture binding'
);

console.log('Embedded glTF texture extraction and authored-UV rendering patches applied.');
