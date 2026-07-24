import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('tests/v010.test.mjs');
let source = fs.readFileSync(file, 'utf8');
if (source.includes("embedded glTF texture is extracted and linked to authored UV material")) {
  console.log('Embedded texture fixture test already exists.');
  process.exit(0);
}

const marker = "test('v0.10 desktop package, UI, and MCP share the connected authorities'";
if (!source.includes(marker)) throw new Error('Texture test insertion point was not found.');

const testBlock = String.raw`test('v0.10 embedded glTF texture is extracted and linked to authored UV material', () => {
  const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniforge-textured-gltf-'));
  try {
    const geometry = Buffer.alloc(66);
    const positions = new Float32Array(geometry.buffer, geometry.byteOffset, 9);
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uvs = new Float32Array(geometry.buffer, geometry.byteOffset + 36, 6);
    uvs.set([0, 0, 1, 0, 0, 1]);
    const indices = new Uint16Array(geometry.buffer, geometry.byteOffset + 60, 3);
    indices.set([0, 1, 2]);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=';
    const gltf = {
      asset: { version: '2.0', generator: 'OmniForge embedded texture fixture' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      buffers: [{ byteLength: geometry.length, uri: 'data:application/octet-stream;base64,' + geometry.toString('base64') }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 24 },
        { buffer: 0, byteOffset: 60, byteLength: 6 }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
        { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' }
      ],
      images: [{ name: 'Pixel', uri: 'data:image/png;base64,' + png }],
      textures: [{ source: 0 }],
      materials: [{ name: 'Textured material', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.7 } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }]
    };
    const dataUrl = 'data:model/gltf+json;base64,' + Buffer.from(JSON.stringify(gltf)).toString('base64');
    const asset = importModelAsset({ assetRoot, name: 'Textured triangle', fileName: 'textured.gltf', dataUrl, category: 'static-prop' });
    assert.notEqual(asset.health.state, 'failed');
    assert.equal(asset.canonicalImporterVersion, 3);
    assert.equal(asset.textures.length, 1);
    assert.match(asset.textures[0].url, /canonical\/textures\/image-000\.png$/);
    assert.ok(fs.existsSync(path.join(assetRoot, 'models', asset.id, 'canonical', 'textures', 'image-000.png')));
    const mesh = JSON.parse(fs.readFileSync(path.join(assetRoot, 'models', asset.id, 'canonical', 'mesh.json'), 'utf8'));
    assert.match(mesh.groups[0].material.textureUrls.baseColor, /image-000\.png$/);
    assert.equal(mesh.groups[0].material.authoredUvSet, 0);
    const renderer = fs.readFileSync(path.join(ROOT, 'app', 'renderer.js'), 'utf8');
    assert.match(renderer, /uIsTerrain>.5\?vWorld\.xz\/max\(uBaseTextureScale,0\.05\):vUV/);
    assert.match(renderer, /textureFromUrl\(material\.textureUrls\?\.baseColor,false\)/);
  } finally {
    fs.rmSync(assetRoot, { recursive: true, force: true });
  }
});

`;
source = source.replace(marker, testBlock + marker);
fs.writeFileSync(file, source, 'utf8');
console.log('Added embedded glTF texture extraction and authored-UV renderer test.');
