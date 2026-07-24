import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const resolve = file => path.join(root, file);
const read = file => fs.readFileSync(resolve(file), 'utf8');
const write = (file, content) => fs.writeFileSync(resolve(file), content, 'utf8');

function replaceOnce(file, before, after, label) {
  const source = read(file);
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Patch target not found: ${label || file}`);
  write(file, source.replace(before, after));
  return true;
}

function replaceRegex(file, pattern, replacement, alreadyPresent, label) {
  const source = read(file);
  if (alreadyPresent && source.includes(alreadyPresent)) return false;
  if (!pattern.test(source)) throw new Error(`Patch target not found: ${label || file}`);
  write(file, source.replace(pattern, replacement));
  return true;
}

function accessorArrayV010(gltf, buffers, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid accessor index ${index}.`);
  const accessor = gltf.accessors?.[index];
  if (!accessor) throw new Error(`Missing accessor ${index}.`);
  if (!Number.isInteger(accessor.count) || accessor.count < 0 || accessor.count > 50_000_000) throw new Error(`Accessor ${index} has an invalid element count.`);
  if (accessor.sparse) throw new Error(`Accessor ${index} uses sparse data, which is preserved in the source but is not yet supported by the canonical preview.`);
  if (!Number.isInteger(accessor.bufferView)) throw new Error(`Accessor ${index} has no buffer view.`);
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`Accessor ${index} references missing buffer view ${accessor.bufferView}.`);
  if (!Number.isInteger(view.buffer) || view.buffer < 0) throw new Error(`Buffer view ${accessor.bufferView} references an invalid buffer.`);
  const source = buffers[view.buffer];
  if (!source) throw new Error(`Missing glTF buffer ${view.buffer}.`);
  const info = componentInfo(accessor.componentType);
  const size = componentCount(accessor.type);
  const packed = info.bytes * size;
  const stride = view.byteStride || packed;
  if (stride < packed || stride % info.bytes !== 0) throw new Error(`Accessor ${index} has invalid byte stride ${stride}.`);
  const viewStart = Number(view.byteOffset || 0);
  const viewLength = Number(view.byteLength || 0);
  const accessorOffset = Number(accessor.byteOffset || 0);
  const start = viewStart + accessorOffset;
  if (viewStart < 0 || viewLength < 0 || start < 0 || viewStart + viewLength > source.length) throw new Error(`Buffer view ${accessor.bufferView} exceeds buffer ${view.buffer}.`);
  const required = accessor.count ? ((accessor.count - 1) * stride + packed) : 0;
  if (accessorOffset + required > viewLength || start + required > source.length) throw new Error(`Accessor ${index} exceeds its declared buffer view.`);
  const out = new Array(accessor.count * size);
  for (let item = 0; item < accessor.count; item += 1) {
    for (let component = 0; component < size; component += 1) {
      const offset = start + item * stride + component * info.bytes;
      let value = source[info.read](offset);
      if (accessor.normalized) value = normalizedValue(value, accessor.componentType);
      out[item * size + component] = value;
    }
  }
  return { values: out, count: accessor.count, size, componentType: accessor.componentType, min: accessor.min || null, max: accessor.max || null };
}

function sceneMeshInstancesV010(gltf) {
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  const scenes = Array.isArray(gltf.scenes) ? gltf.scenes : [];
  if (!nodes.length) return (gltf.meshes || []).map((_, meshIndex) => ({ meshIndex, nodeIndex: null, nodeName: `Mesh ${meshIndex}`, worldMatrix: mat4Identity() }));

  const childSet = new Set();
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex] || {};
    if (!Array.isArray(node.children)) continue;
    for (const child of node.children) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length) throw new Error(`Node ${nodeIndex} references invalid child ${child}.`);
      childSet.add(child);
    }
  }

  const configured = scenes[gltf.scene ?? 0]?.nodes;
  let roots = Array.isArray(configured) && configured.length
    ? configured.slice()
    : nodes.map((_, index) => index).filter(index => !childSet.has(index));
  roots = roots.filter(index => Number.isInteger(index) && index >= 0 && index < nodes.length);
  if (!roots.length) roots = nodes.map((_, index) => index);

  const instances = [];
  const stack = roots.slice().reverse().map(nodeIndex => ({ nodeIndex, parentMatrix: mat4Identity(), ancestors: new Set(), depth: 0 }));
  let visitedSteps = 0;
  const maxSteps = Math.max(1000, nodes.length * 64);
  const maxDepth = Math.min(4096, Math.max(256, nodes.length * 4));
  while (stack.length) {
    const entry = stack.pop();
    if (++visitedSteps > maxSteps) throw new Error('glTF node traversal exceeded its safety budget. The source may contain a cycle or pathological repeated hierarchy.');
    if (entry.depth > maxDepth) throw new Error(`glTF node hierarchy exceeds the maximum safe depth at node ${entry.nodeIndex}.`);
    if (entry.ancestors.has(entry.nodeIndex)) throw new Error(`glTF node hierarchy contains a cycle at node ${entry.nodeIndex}.`);
    const node = nodes[entry.nodeIndex];
    if (!node) continue;
    const worldMatrix = mat4Multiply(entry.parentMatrix, nodeLocalMatrix(node));
    if (Number.isInteger(node.mesh)) {
      if (!gltf.meshes?.[node.mesh]) throw new Error(`Node ${entry.nodeIndex} references missing mesh ${node.mesh}.`);
      instances.push({ meshIndex: node.mesh, nodeIndex: entry.nodeIndex, nodeName: node.name || `Node ${entry.nodeIndex}`, worldMatrix });
    }
    const ancestors = new Set(entry.ancestors);
    ancestors.add(entry.nodeIndex);
    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ nodeIndex: children[index], parentMatrix: worldMatrix, ancestors, depth: entry.depth + 1 });
    }
  }
  if (!instances.length) return (gltf.meshes || []).map((_, meshIndex) => ({ meshIndex, nodeIndex: null, nodeName: `Mesh ${meshIndex}`, worldMatrix: mat4Identity() }));
  return instances;
}

function materialInfoV010(gltf, index) {
  const material = gltf.materials?.[index] || {};
  const pbr = material.pbrMetallicRoughness || {};
  const factor = pbr.baseColorFactor || [0.65, 0.68, 0.74, 1];
  return {
    name: material.name || `Material ${index ?? 0}`,
    baseColor: [finite(factor[0], 0.65), finite(factor[1], 0.68), finite(factor[2], 0.74), finite(factor[3], 1)],
    metallic: finite(pbr.metallicFactor, 0),
    roughness: finite(pbr.roughnessFactor, 0.8),
    doubleSided: Boolean(material.doubleSided),
    alphaMode: material.alphaMode || 'OPAQUE',
    alphaCutoff: finite(material.alphaCutoff, 0.5),
    emissiveFactor: Array.isArray(material.emissiveFactor) ? material.emissiveFactor.map(value => finite(value, 0)).slice(0, 3) : [0, 0, 0],
    textureSlots: {
      baseColor: Number.isInteger(pbr.baseColorTexture?.index) ? pbr.baseColorTexture.index : null,
      metallicRoughness: Number.isInteger(pbr.metallicRoughnessTexture?.index) ? pbr.metallicRoughnessTexture.index : null,
      normal: Number.isInteger(material.normalTexture?.index) ? material.normalTexture.index : null,
      occlusion: Number.isInteger(material.occlusionTexture?.index) ? material.occlusionTexture.index : null,
      emissive: Number.isInteger(material.emissiveTexture?.index) ? material.emissiveTexture.index : null
    }
  };
}

function functionSource(fn, targetName) {
  return fn.toString().replace(fn.name, targetName);
}

const packageFile = 'package.json';
const pkg = JSON.parse(read(packageFile));
pkg.version = '0.10.0';
pkg.description = 'General-purpose AI-native 3D game engine with connected asset, foliage, lighting, atmosphere, and world systems.';
pkg.scripts.start = 'node server/v010-bootstrap.mjs';
write(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

replaceOnce('desktop/main.cjs', "const PRODUCT_VERSION = '0.9.0';", "const PRODUCT_VERSION = '0.10.0';", 'desktop version');
replaceOnce('desktop/main.cjs', "const serverScript=path.join(APP_ROOT,'server','server.mjs');", "const serverScript=path.join(APP_ROOT,'server','v010-bootstrap.mjs');", 'desktop runtime entry');

replaceOnce(
  'BUILD_DESKTOP_WINDOWS.ps1',
  "$Folders = @('app','server','bridge','desktop','assets','data','workspace','captures','logs','docs','scripts','tests','resources')",
  "$Folders = @('app','server','bridge','desktop','workers','assets','data','workspace','captures','logs','docs','scripts','tests','resources')",
  'package workers directory'
);
for (const [before, after, label] of [
  ["version = '0.9.0'", "version = '0.10.0'", 'package version'],
  ["--set-file-version '0.9.0.0'", "--set-file-version '0.10.0.0'", 'file version'],
  ["--set-product-version '0.9.0.0'", "--set-product-version '0.10.0.0'", 'product version'],
  ["OmniForge 0.9.0`nElectron", "OmniForge 0.10.0`nElectron", 'version marker']
]) replaceOnce('BUILD_DESKTOP_WINDOWS.ps1', before, after, label);

replaceOnce('server/server.mjs', "version:'0.9.0'", "version:'0.10.0'", 'server health version');
replaceOnce('bridge/mcp-server.mjs', "const SERVER_INFO={name:'omniforge',version:'0.9.0'};", "const SERVER_INFO={name:'omniforge',version:'0.10.0'};", 'MCP version');

replaceOnce('app/index.html', '<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="v010.css">', 'v0.10 stylesheet');
replaceOnce('app/index.html', '<script type="module" src="app.js"></script>', '<script type="module" src="app.js"></script>\n  <script type="module" src="v010.js"></script>', 'v0.10 UI module');
replaceOnce('app/index.html', '<span id="engineVersion">v0.9.0</span>', '<span id="engineVersion">v0.10.0</span>', 'editor version');

const pipelineFile = 'server/asset-pipeline.mjs';
replaceRegex(
  pipelineFile,
  /function accessorArray\(gltf,buffers,index\)\{[\s\S]*?\n\}\nfunction decodeDataUri/,
  `${functionSource(accessorArrayV010, 'accessorArray')}\nfunction decodeDataUri`,
  'invalid element count',
  'validated accessor reader'
);
replaceRegex(
  pipelineFile,
  /function sceneMeshInstances\(gltf\)\{[\s\S]*?\n\}\nfunction materialInfo/,
  `${functionSource(sceneMeshInstancesV010, 'sceneMeshInstances')}\nfunction materialInfo`,
  'traversal exceeded its safety budget',
  'iterative scene traversal'
);
replaceRegex(
  pipelineFile,
  /function materialInfo\(gltf,index\)\{[\s\S]*?\n\}/,
  functionSource(materialInfoV010, 'materialInfo'),
  'textureSlots:',
  'material metadata'
);

fs.rmSync(resolve('APPLY_V010_ERROR.txt'), { force: true });
console.log('OmniForge v0.10 existing-source patches applied successfully.');
