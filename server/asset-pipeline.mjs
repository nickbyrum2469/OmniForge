import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const now=()=>new Date().toISOString();
const slugify=(value,fallback='asset')=>String(value||fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||fallback;
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const checksum=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const align4=value=>(value+3)&~3;

export function decodeAssetDataUrl(dataUrl){
  const match=/^data:([^;,]+)?;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||''));
  if(!match)throw new Error('A base64 asset data URL is required.');
  const buffer=Buffer.from(match[2],'base64');
  if(!buffer.length)throw new Error('The imported asset is empty.');
  if(buffer.length>70_000_000)throw new Error('The imported asset exceeds the 70 MB safety limit.');
  return {mime:match[1]||'application/octet-stream',buffer};
}

function componentInfo(componentType){
  const map={5120:{bytes:1,read:'readInt8'},5121:{bytes:1,read:'readUInt8'},5122:{bytes:2,read:'readInt16LE'},5123:{bytes:2,read:'readUInt16LE'},5125:{bytes:4,read:'readUInt32LE'},5126:{bytes:4,read:'readFloatLE'}};
  const info=map[componentType];if(!info)throw new Error(`Unsupported glTF component type ${componentType}.`);return info;
}
function componentCount(type){const map={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};if(!map[type])throw new Error(`Unsupported glTF accessor type ${type}.`);return map[type];}
function normalizedValue(value,componentType){
  if(componentType===5120)return Math.max(value/127,-1);if(componentType===5121)return value/255;if(componentType===5122)return Math.max(value/32767,-1);if(componentType===5123)return value/65535;return value;
}
function accessorArray(gltf, buffers, index) {
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
function decodeDataUri(uri){
  const match=/^data:([^;,]+)?;base64,([A-Za-z0-9+/=]+)$/.exec(String(uri||''));if(!match)return null;return Buffer.from(match[2],'base64');
}
export function parseGlb(buffer){
  if(buffer.length<20||buffer.readUInt32LE(0)!==0x46546c67)throw new Error('The file is not a valid binary glTF (GLB).');
  const version=buffer.readUInt32LE(4),declaredLength=buffer.readUInt32LE(8);if(version!==2)throw new Error(`GLB version ${version} is unsupported; glTF 2.0 is required.`);if(declaredLength>buffer.length)throw new Error('The GLB header length exceeds the file size.');
  let offset=12,jsonChunk=null,binChunk=null;
  while(offset+8<=declaredLength){const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4);offset+=8;if(offset+length>declaredLength)throw new Error('A GLB chunk exceeds the file length.');const chunk=buffer.subarray(offset,offset+length);offset+=length;if(type===0x4e4f534a)jsonChunk=chunk;else if(type===0x004e4942&&!binChunk)binChunk=chunk;}
  if(!jsonChunk)throw new Error('GLB JSON chunk is missing.');
  const gltf=JSON.parse(jsonChunk.toString('utf8').replace(/\u0000+$/,''));return {gltf,buffers:[binChunk||Buffer.alloc(0)],container:'glb'};
}
export function parseGltf(buffer){
  const gltf=JSON.parse(buffer.toString('utf8'));const buffers=[];for(const descriptor of gltf.buffers||[]){const data=decodeDataUri(descriptor.uri);if(!data)throw new Error('External .gltf buffer files are not accepted by the single-file importer. Use GLB or embed buffers as data URIs.');buffers.push(data);}return {gltf,buffers,container:'gltf'};
}
function triangleIndices(primitive,vertexCount,gltf,buffers){
  if(primitive.mode!==undefined&&primitive.mode!==4)throw new Error(`Primitive mode ${primitive.mode} is unsupported; triangle lists are required.`);
  if(primitive.indices===undefined)return Array.from({length:vertexCount},(_,i)=>i);
  return accessorArray(gltf,buffers,primitive.indices).values.map(value=>Number(value));
}
function computeNormals(positions,indices){
  const normals=new Array(positions.length).fill(0);
  for(let i=0;i+2<indices.length;i+=3){const ia=indices[i]*3,ib=indices[i+1]*3,ic=indices[i+2]*3;const ax=positions[ia],ay=positions[ia+1],az=positions[ia+2],bx=positions[ib],by=positions[ib+1],bz=positions[ib+2],cx=positions[ic],cy=positions[ic+1],cz=positions[ic+2];const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az,nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;for(const p of [ia,ib,ic]){normals[p]+=nx;normals[p+1]+=ny;normals[p+2]+=nz;}}
  for(let i=0;i<normals.length;i+=3){const length=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=length;normals[i+1]/=length;normals[i+2]/=length;}return normals;
}

function mat4Identity(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function mat4Multiply(a,b){
  const out=new Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}
function nodeLocalMatrix(node={}){
  if(Array.isArray(node.matrix)&&node.matrix.length===16)return node.matrix.map((value,index)=>finite(value,index%5===0?1:0));
  const t=Array.isArray(node.translation)?node.translation:[0,0,0],q=Array.isArray(node.rotation)?node.rotation:[0,0,0,1],sc=Array.isArray(node.scale)?node.scale:[1,1,1];
  let [x,y,z,w]=q.map(Number),length=Math.hypot(x,y,z,w)||1;x/=length;y/=length;z/=length;w/=length;
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  const sx=finite(sc[0],1),sy=finite(sc[1],1),sz=finite(sc[2],1);
  return [(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,(xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,(xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,finite(t[0]),finite(t[1]),finite(t[2]),1];
}
function transformPosition(matrix,x,y,z){return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];}
function normalMatrixFromMat4(m){
  const a00=m[0],a01=m[4],a02=m[8],a10=m[1],a11=m[5],a12=m[9],a20=m[2],a21=m[6],a22=m[10];
  const b01=a22*a11-a12*a21,b11=-a22*a10+a12*a20,b21=a21*a10-a11*a20,det=a00*b01+a01*b11+a02*b21;
  if(Math.abs(det)<1e-12)return [1,0,0,0,1,0,0,0,1];
  const inv=1/det;
  const i00=b01*inv,i01=(-a22*a01+a02*a21)*inv,i02=(a12*a01-a02*a11)*inv;
  const i10=b11*inv,i11=(a22*a00-a02*a20)*inv,i12=(-a12*a00+a02*a10)*inv;
  const i20=b21*inv,i21=(-a21*a00+a01*a20)*inv,i22=(a11*a00-a01*a10)*inv;
  return [i00,i10,i20,i01,i11,i21,i02,i12,i22];
}
function transformNormal(matrix3,x,y,z){const nx=matrix3[0]*x+matrix3[3]*y+matrix3[6]*z,ny=matrix3[1]*x+matrix3[4]*y+matrix3[7]*z,nz=matrix3[2]*x+matrix3[5]*y+matrix3[8]*z,length=Math.hypot(nx,ny,nz)||1;return [nx/length,ny/length,nz/length];}
function transformDeterminant(matrix){return matrix[0]*(matrix[5]*matrix[10]-matrix[9]*matrix[6])-matrix[4]*(matrix[1]*matrix[10]-matrix[9]*matrix[2])+matrix[8]*(matrix[1]*matrix[6]-matrix[5]*matrix[2]);}
function sceneMeshInstances(gltf) {
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
function materialInfo(gltf, index) {
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
function imageExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  return null;
}
function imageBuffer(gltf, buffers, image, imageIndex) {
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
function extractEmbeddedTextures(gltf, buffers, canonicalFolder, assetId) {
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
function attachTextureUrls(gltf, mesh, textures) {
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
function mergePrimitives(gltf,buffers){
  const positions=[],normals=[],uvs=[],indices=[],materials=[],groups=[];let vertexOffset=0;const unsupported=[],instances=sceneMeshInstances(gltf);
  for(const instance of instances){
    const mesh=gltf.meshes?.[instance.meshIndex];if(!mesh)continue;
    const normalMatrix=normalMatrixFromMat4(instance.worldMatrix),mirrored=transformDeterminant(instance.worldMatrix)<0;
    for(let primitiveIndex=0;primitiveIndex<(mesh.primitives||[]).length;primitiveIndex++){
      const primitive=mesh.primitives[primitiveIndex];
      try{
        if(primitive.extensions?.KHR_draco_mesh_compression)throw new Error('Draco-compressed geometry requires a decoder and was not imported.');
        if(primitive.attributes?.POSITION===undefined)throw new Error('Primitive has no POSITION attribute.');
        const pos=accessorArray(gltf,buffers,primitive.attributes.POSITION);if(pos.size!==3)throw new Error('POSITION must use VEC3.');
        const localPositions=pos.values.map(Number),localIndices=triangleIndices(primitive,pos.count,gltf,buffers);
        if(mirrored)for(let i=0;i+2<localIndices.length;i+=3){const swap=localIndices[i+1];localIndices[i+1]=localIndices[i+2];localIndices[i+2]=swap;}
        const transformedPositions=[];for(let i=0;i<localPositions.length;i+=3)transformedPositions.push(...transformPosition(instance.worldMatrix,localPositions[i],localPositions[i+1],localPositions[i+2]));
        const normalAccessor=primitive.attributes.NORMAL!==undefined?accessorArray(gltf,buffers,primitive.attributes.NORMAL):null;
        let transformedNormals;if(normalAccessor&&normalAccessor.size===3){transformedNormals=[];for(let i=0;i<normalAccessor.values.length;i+=3)transformedNormals.push(...transformNormal(normalMatrix,normalAccessor.values[i],normalAccessor.values[i+1],normalAccessor.values[i+2]));}else transformedNormals=computeNormals(transformedPositions,localIndices);
        const uvAccessor=primitive.attributes.TEXCOORD_0!==undefined?accessorArray(gltf,buffers,primitive.attributes.TEXCOORD_0):null,localUvs=uvAccessor&&uvAccessor.size===2?uvAccessor.values.map(Number):new Array(pos.count*2).fill(0);
        const indexOffset=indices.length,material=materialInfo(gltf,primitive.material);
        positions.push(...transformedPositions);normals.push(...transformedNormals);uvs.push(...localUvs);indices.push(...localIndices.map(index=>index+vertexOffset));
        groups.push({indexOffset,indexCount:localIndices.length,materialIndex:Number.isInteger(primitive.material)?primitive.material:null,material,nodeIndex:instance.nodeIndex,nodeName:instance.nodeName,meshIndex:instance.meshIndex,primitiveIndex});
        materials.push(material);vertexOffset+=pos.count;
      }catch(error){unsupported.push(`${instance.nodeName}: ${error.message}`);}
    }
  }
  if(!positions.length)throw new Error(`No supported triangle geometry was found.${unsupported.length?` ${unsupported.join(' ')}`:''}`);
  return {positions,normals,uvs,indices,materials,groups,unsupported,instanceCount:instances.length,nodeTransformsApplied:true};
}

function computeBounds(positions){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i+=3)for(let c=0;c<3;c++){const value=finite(positions[i+c]);min[c]=Math.min(min[c],value);max[c]=Math.max(max[c],value);}const size=max.map((value,i)=>value-min[i]),center=max.map((value,i)=>(value+min[i])/2);return {min,max,size,center,radius:Math.hypot(...size)/2};
}
function createHealth(gltf,mesh,fileBytes,container){
  const bounds=computeBounds(mesh.positions),warnings=[],blocking=[];
  const nodes=gltf.nodes||[],hasNodeTransforms=nodes.some(node=>Array.isArray(node.matrix)||Array.isArray(node.translation)||Array.isArray(node.rotation)||Array.isArray(node.scale));
  if(mesh.materials.length>1)warnings.push('Multiple material slots are preserved and rendered as separate primitive groups; inspect texture fidelity before approval.');
  if((gltf.textures||[]).length||(gltf.images||[]).length)warnings.push('Texture and image references are preserved. Embedded PNG, JPEG, and WebP images are extracted when possible; base-color UV0 is rendered and remaining PBR channels require inspection.');
  if(hasNodeTransforms&&!mesh.nodeTransformsApplied)warnings.push('Authored node transforms could not be applied to the canonical preview. Inspect the import before approval.');
  if((gltf.skins||[]).length)warnings.push('Skeleton and skin data are preserved in the original glTF but are not yet rendered by the current runtime.');
  if((gltf.animations||[]).length)warnings.push('Animation clips are catalogued and preserved, but animation playback is preserved for the animation-runtime milestone.');
  if((gltf.meshes||[]).some(mesh=>mesh.weights?.length))warnings.push('Morph target weights are preserved in the source but are not currently evaluated by the v0.6 runtime.');
  if(mesh.unsupported.length)warnings.push(...mesh.unsupported);
  if(!gltf.asset?.version?.startsWith('2'))blocking.push('glTF 2.0 metadata is required.');
  if(mesh.indices.length%3!==0)blocking.push('Triangle index count is invalid.');
  if(bounds.size.some(value=>!Number.isFinite(value)))blocking.push('Mesh bounds contain invalid values.');
  if(Math.max(...bounds.size)>10000)warnings.push('Extremely large model dimensions detected.');
  if(Math.max(...bounds.size)<.001)warnings.push('Extremely small model dimensions detected.');
  if(!(gltf.materials||[]).length)warnings.push('The model has no authored material definitions.');
  return {state:blocking.length?'failed':warnings.length?'warning':'valid',checkedAt:now(),container,fileBytes,dimensions:bounds.size,bounds,triangleCount:Math.floor(mesh.indices.length/3),vertexCount:Math.floor(mesh.positions.length/3),meshCount:(gltf.meshes||[]).length,primitiveCount:(gltf.meshes||[]).reduce((sum,m)=>sum+(m.primitives?.length||0),0),materialCount:(gltf.materials||[]).length,textureCount:(gltf.textures||[]).length,imageCount:(gltf.images||[]).length,nodeCount:nodes.length,skeletonCount:(gltf.skins||[]).length,animationCount:(gltf.animations||[]).length,morphTargetCount:(gltf.meshes||[]).reduce((sum,m)=>sum+(m.primitives||[]).reduce((p,primitive)=>p+(primitive.targets?.length||0),0),0),warnings,blocking,recommendedRepairs:[...(bounds.center.some(v=>Math.abs(v)>.001)?['Center pivot derivative']:[]),...(!(gltf.accessors||[]).some(a=>a.type==='VEC3')?['Review geometry attributes']:[]),...((gltf.materials||[]).length>4?['Review material consolidation']:[]),...(hasNodeTransforms&&!mesh.nodeTransformsApplied?['Review canonical transform normalization']:[]) ],nodeTransformsApplied:Boolean(mesh.nodeTransformsApplied),meshInstanceCount:Number(mesh.instanceCount||0)};
}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
function relativeAssetPath(assetRoot,file){return path.relative(assetRoot,file).replaceAll('\\','/');}
function canonicalMesh(mesh){
  const first=mesh.materials[0]||materialInfo({},0);return {schemaVersion:2,positions:mesh.positions,normals:mesh.normals,uvs:mesh.uvs,indices:mesh.indices,blends:new Array(mesh.positions.length/3).fill(0),material:first,sourceMaterials:mesh.materials,groups:mesh.groups||[],nodeTransformsApplied:Boolean(mesh.nodeTransformsApplied),meshInstanceCount:Number(mesh.instanceCount||0),createdAt:now()};
}
function createLod(mesh,ratio){
  const triCount=Math.floor(mesh.indices.length/3),keep=Math.max(1,Math.floor(triCount*ratio)),indices=[];for(let i=0;i<keep;i++){const source=Math.min(triCount-1,Math.floor(i*triCount/keep))*3;indices.push(mesh.indices[source],mesh.indices[source+1],mesh.indices[source+2]);}return {...mesh,indices,createdAt:now(),lodRatio:ratio};
}
export function importModelAsset({ assetRoot, name, fileName, dataUrl, category = 'static-prop', license = 'User supplied — review before release', creator = 'User', source = 'Local import', tags = [] }) {
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
export function rebuildCanonicalAsset({ assetRoot, asset }) {
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

export function createSafeRepairDerivative({assetRoot,source,settings={}}){
  if(!source?.canonicalFile)throw new Error('This asset has no canonical geometry to repair.');const sourceMeshPath=path.join(assetRoot,path.relative('assets',source.canonicalFile));const mesh=JSON.parse(fs.readFileSync(sourceMeshPath,'utf8'));const derivativeId=`${source.id}-repair-${Date.now().toString(36)}`,folder=path.join(assetRoot,'models',derivativeId),canonical=path.join(folder,'canonical');fs.mkdirSync(canonical,{recursive:true});
  const bounds=computeBounds(mesh.positions),center=settings.centerPivot===false?[0,0,0]:bounds.center,positions=mesh.positions.map((value,index)=>value-center[index%3]);const scale=Math.max(.000001,finite(settings.unitScale,1));for(let i=0;i<positions.length;i++)positions[i]*=scale;const repaired={...mesh,positions,normals:computeNormals(positions,mesh.indices),createdAt:now(),repair:{centerPivot:settings.centerPivot!==false,recalculateNormals:true,unitScale:scale,sourceAssetId:source.id}};const meshFile=path.join(canonical,'mesh.json');writeJson(meshFile,repaired);const repairedBounds=computeBounds(positions);const derivative={...structuredClone(source),id:derivativeId,name:`${source.name} — Repaired`,sourceAssetId:source.id,derivativeAssetIds:[],canonicalFile:`assets/models/${derivativeId}/canonical/mesh.json`,meshUrl:`/assets/models/${encodeURIComponent(derivativeId)}/canonical/mesh.json`,bounds:repairedBounds,unitScale:source.unitScale*scale,pivotMode:settings.centerPivot===false?source.pivotMode:'bounds-center',approvalState:'draft',protected:false,health:{...source.health,state:'valid',bounds:repairedBounds,dimensions:repairedBounds.size,warnings:[...(source.health?.warnings||[]),'Safe repair derivative generated; inspect before approval.'],blocking:[],checkedAt:now()},validation:{state:'warning',checkedAt:now(),warnings:['Safe repair derivative requires rendered inspection.'],errors:[]},provenance:{...source.provenance,source:`Derivative of ${source.id}`,importedAt:now()},createdAt:now(),updatedAt:now()};writeJson(path.join(folder,'asset-record.json'),derivative);return derivative;
}
export function generateCollision(asset){
  if(!asset?.bounds)throw new Error('Asset bounds are required before collision can be generated.');return {shape:'box',center:asset.bounds.center,size:asset.bounds.size,generatedAt:now(),source:'automatic-bounds',warning:'Inspect doorways, open spaces, and gameplay clearance before approval.'};
}
export function generateLodsForAsset({assetRoot,asset,ratios=[.5,.2]}){
  if(!asset?.canonicalFile)throw new Error('This asset has no canonical geometry.');const sourcePath=path.join(assetRoot,path.relative('assets',asset.canonicalFile)),mesh=JSON.parse(fs.readFileSync(sourcePath,'utf8')),folder=path.dirname(sourcePath);const lods=[];for(const ratio of ratios){const safe=Math.max(.05,Math.min(.95,finite(ratio,.5))),lod=createLod(mesh,safe),name=`lod-${Math.round(safe*100)}.json`,file=path.join(folder,name);writeJson(file,lod);lods.push({level:lods.length+1,ratio:safe,triangleCount:Math.floor(lod.indices.length/3),file:`assets/models/${asset.id}/canonical/${name}`,url:`/assets/models/${encodeURIComponent(asset.id)}/canonical/${encodeURIComponent(name)}`,generatedAt:now(),validation:'inspect'});}return lods;
}
export function refreshSceneUsages(asset,state){
  const usages=[];for(const scene of state.scenes||[])for(const object of scene.objects||[])if(object.properties?.assetId===asset.id)usages.push({sceneId:scene.id,sceneName:scene.name,objectId:object.id,objectName:object.name});asset.sceneUsages=usages;asset.updatedAt=now();return usages;
}

export function syncAssetRecipe(asset, existing={}){
  if(!asset?.id)throw new Error('Asset recipe requires a source asset.');
  return {
    ...existing,
    id:existing.id||`asset-recipe-${asset.id}`,
    type:'assetRecipe',
    name:existing.name||`${asset.name} Recipe`,
    sourceAssetId:asset.sourceAssetId||asset.id,
    canonicalAssetId:asset.id,
    sourceFile:asset.sourceFile||null,
    canonicalFile:asset.canonicalFile||null,
    materials:asset.materialSlots||[],
    collision:asset.collision||null,
    collisionStatus:asset.collisionStatus||'missing',
    lods:asset.lods||[],
    sockets:asset.sockets||[],
    affordances:asset.affordances||[],
    tags:asset.tags||[],
    pivot:{mode:asset.pivotMode||'source',center:asset.bounds?.center||[0,0,0]},
    orientation:{upAxis:asset.upAxis||'y',forwardAxis:asset.forwardAxis||'-z'},
    dimensions:asset.bounds?.size||[0,0,0],
    validation:asset.validation||{state:'unvalidated',warnings:[],errors:[]},
    provenance:asset.provenance||{},
    sceneUsages:asset.sceneUsages||[],
    sourceRecipeId:existing.sourceRecipeId||null,
    approvalState:asset.approvalState||'draft',
    createdAt:existing.createdAt||now(),
    updatedAt:now()
  };
}
