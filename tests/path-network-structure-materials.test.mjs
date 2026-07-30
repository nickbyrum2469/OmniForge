import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridgeMaterialForRole } from '../app/path-network/bridge-profiles.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedHashes = {
  'concrete/ao.jpg': '4ae378b8eb5e6f4ec8963efa5d46b3d8eea7d6c79cfd5675b03d8aa564c482a7',
  'concrete/basecolor.jpg': '3ea5b493379c4d30c02c04b93361d3e34f91ed04058ffb4ea915702f1cd17049',
  'concrete/normal-gl.jpg': '433250def341793e0b544dfb28ad46e5d546de5e94b4cfe2f282c1a9328b5f1a',
  'concrete/roughness.jpg': '6427f98c3e4a94f500f6c0ca0e453daff61592004f248bd06fd9e14d2c6c1ae1',
  'masonry/ao.jpg': '68cfd2fb711f26def6e6c0ca4c3f2622c7f396acf8e8fe148c088ebf14c42aa8',
  'masonry/basecolor.jpg': '1c42fe616560553caf8f61f298750e6a2cee06bf2a4af9156a930057d02da003',
  'masonry/normal-gl.jpg': '9be1475eb6dde811e8cea0f950f2700ed75bc23c7b3fd66b6d7731c639b7faba',
  'masonry/roughness.jpg': '57f07432fea65e2282b31fc730978d5ae98a3cb432c3f7e48f5b9892c3104d6d',
  'steel/ao.jpg': '031142984b8deb259203d1998e737de37ee571833ae80e5c05e0add3c5b2b86e',
  'steel/basecolor.jpg': '6e80877d0e9d5973d96298c6091df7ace906b0a6760afc4f3592e4855f3f1d4c',
  'steel/normal-gl.jpg': '58736fbb8aa4fc6690cf8152b174db65caf22a766375b625fb0087e1bc955bc7',
  'steel/roughness.jpg': '73a6bd6393f6de7be42058584c2d382f2a3e9148ceabc2d02e748e2c860e74d1',
  'timber/ao.jpg': 'baee35ae240bd5a39e005b1f40fec7fe3f16d2158e954e913737d73699d4cee9',
  'timber/basecolor.jpg': 'd758be23e8fe7bfbd73bc4ab257cfd59406e1835f6557c12a67cd4fdb15de0d8',
  'timber/normal-gl.jpg': '5e570e57d688b016b217b9e8e0592f9a8b3364406e22bf6cd775da990452bdb6',
  'timber/roughness.jpg': 'ef640502cec94bd2b6500e252891a778a7a721be16b5536d4efc9fe4d99b12aa'
};

test('vendored bridge PBR maps retain their recorded production assets', () => {
  for (const [relative, expected] of Object.entries(expectedHashes)) {
    const file = path.join(root, 'assets', 'materials', 'path-structures', relative);
    assert.equal(fs.existsSync(file), true, relative);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(hash, expected, relative);
  }
});

test('bridge material families expose complete PBR texture sets', () => {
  for (const role of [
    'bridge-timber-trestle-post',
    'bridge-stone-arch-ring',
    'bridge-steel-main-girder',
    'bridge-concrete-pier-column'
  ]) {
    const material = bridgeMaterialForRole(role);
    assert.ok(material.textureUrls);
    for (const map of ['baseColor', 'normal', 'roughness', 'ao']) {
      assert.match(material.textureUrls[map], /^\/assets\/materials\/path-structures\//);
    }
    assert.ok(material.normalStrength > 0);
    assert.ok(material.aoStrength > 0);
  }
});

test('grouped structure rendering binds normal, roughness, and AO maps', () => {
  const renderer = fs.readFileSync(path.join(root, 'app', 'renderer.js'), 'utf8');
  assert.match(renderer, /textureFromUrl\(material\.textureUrls\?\.normal,false\)/);
  assert.match(renderer, /textureFromUrl\(material\.textureUrls\?\.roughness,false\)/);
  assert.match(renderer, /textureFromUrl\(material\.textureUrls\?\.ao,false\)/);
  assert.match(renderer, /else if\(uUseBaseNormal>\.5\)/);
  assert.match(renderer, /bindMap\(2,'uBaseNormalTexture',importedNormal\)/);
  assert.match(renderer, /bindMap\(4,'uBaseRoughnessTexture',importedRoughness\)/);
  assert.match(renderer, /bindMap\(6,'uBaseAOTexture',importedAO\)/);
});
