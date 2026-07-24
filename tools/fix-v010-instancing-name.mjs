import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('app/renderer.js');
let source = fs.readFileSync(file, 'utf8');

const blockPattern = /    setM4\('uModel',model\);setM4\('uViewProj',viewProj\);setM4\('uLightViewProj',lightViewProj\);gl\.uniformMatrix3fv\(gl\.getUniformLocation\(p,'uNormalMat'\),false,normalMatrix3\(model\)\);[\s\S]*?(?=    set3\('uBaseColor')/;
const canonicalBlock = `    setM4('uModel',model);setM4('uViewProj',viewProj);setM4('uLightViewProj',lightViewProj);gl.uniformMatrix3fv(gl.getUniformLocation(p,'uNormalMat'),false,normalMatrix3(model));
    set1('uInstanced',instanced?1:0);
    const instanceCount=instanced?this.prepareInstances(mesh,instances):0,asset=object.type==='model'?this.assets.find(item=>item.type==='model'&&item.id===object.properties?.assetId):null,bounds=asset?.bounds||{min:[0,0,0],size:[1,1,1]},foliageWind=object.properties?.wind||{};
    set1('uTime',(performance.now()-this.renderStart)/1000);set1('uFoliageWind',instanced?1:0);set1('uFoliageWindStrength',Number(foliageWind.strength??.35)*Number(scene.settings.windStrength??.35));set1('uFoliageWindFrequency',Number(foliageWind.frequency??1));set1('uFoliageBaseY',Number(bounds.min?.[1]??0));set1('uFoliageHeight',Math.max(.001,Number(bounds.size?.[1]??1)));set3('uFoliageWindDirection',new Float32Array(Array.isArray(scene.settings.windDirection)?scene.settings.windDirection:[1,0,.25]));
    const drawRange=(count,offset=0)=>{if(instanced)gl.drawElementsInstanced(gl.TRIANGLES,count,mesh.indexType,offset,instanceCount);else gl.drawElements(gl.TRIANGLES,count,mesh.indexType,offset);};
`;

if (!blockPattern.test(source)) throw new Error('The foliage instancing uniform block could not be canonicalized.');
source = source.replace(blockPattern, canonicalBlock);
fs.writeFileSync(file, source, 'utf8');
console.log('Canonicalized the foliage instancing uniform block to one byte-stable declaration.');
