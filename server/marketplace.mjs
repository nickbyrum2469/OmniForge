import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RUNTIME_ROOT, ROOT, readState } from './state-store.mjs';

const now=()=>new Date().toISOString();
const USER_AGENT='OmniForge/0.9.0 (+https://openai.com; asset marketplace)';
const CACHE_ROOT=path.join(RUNTIME_ROOT,'cache','providers');
const STAGING_ROOT=path.join(RUNTIME_ROOT,'downloads','marketplace');
const CURATED_ROOT=path.join(ROOT,'data','catalogs');
const MOCK_ROOT=process.env.OMNIFORGE_MARKETPLACE_MOCK_ROOT?path.resolve(process.env.OMNIFORGE_MARKETPLACE_MOCK_ROOT):null;

function ensureDirs(){fs.mkdirSync(CACHE_ROOT,{recursive:true});fs.mkdirSync(STAGING_ROOT,{recursive:true});}
function slug(value,fallback='asset'){return String(value||fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96)||fallback;}
function safeJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
function isFresh(file,maxAgeMs){try{return Date.now()-fs.statSync(file).mtimeMs<maxAgeMs;}catch{return false;}}
function cleanUrl(value){try{const url=new URL(String(value));if(!['https:','http:'].includes(url.protocol))return null;return url.toString();}catch{return null;}}
function unique(values){return [...new Set(values.filter(Boolean))];}
function toTags(value){if(Array.isArray(value))return unique(value.flatMap(item=>typeof item==='string'?[item]:Object.values(item||{}).filter(v=>typeof v==='string')).map(v=>String(v).trim()).filter(Boolean)).slice(0,40);if(typeof value==='string')return value.split(/[;,]/).map(v=>v.trim()).filter(Boolean).slice(0,40);return [];}
function firstString(...values){for(const value of values){if(typeof value==='string'&&value.trim())return value.trim();}return '';}
function inferExt(url,name=''){const raw=firstString(name,url).split('?')[0];const ext=path.extname(raw).toLowerCase();return ext||'';}
function inferKind(value=''){const text=String(value).toLowerCase();if(/hdri|environment|hdr\b|exr\b/.test(text))return'hdri';if(/texture|material|surface|terrain|decal/.test(text))return'material';if(/animation/.test(text))return'animation';return'model';}
function inferResolution(value=''){const match=String(value).toLowerCase().match(/(?:^|[^0-9])(1k|2k|4k|8k|12k|16k|24k)(?:[^0-9]|$)/);return match?match[1].toUpperCase():'Original';}
function recursiveDownloads(node,pathParts=[],result=[]){
  if(!node)return result;
  if(Array.isArray(node)){node.forEach((item,index)=>recursiveDownloads(item,[...pathParts,String(index)],result));return result;}
  if(typeof node!=='object')return result;
  const url=cleanUrl(node.url||node.downloadUrl||node.downloadLink||node.rawLink||node.link);
  if(url){const name=firstString(node.fileName,node.filename,node.name,path.basename(new URL(url).pathname));result.push({url,name,localPath:node.localPath?String(node.localPath):null,bytes:Number(node.size||node.fileSize||node.sizeBytes)||null,checksum:firstString(node.sha256,node.md5,node.checksum),checksumType:node.sha256?'sha256':node.md5?'md5':null,path:pathParts.join('/'),extension:inferExt(url,name),resolution:inferResolution([...pathParts,name].join(' '))});}
  for(const [key,value] of Object.entries(node))if(!['url','downloadUrl','downloadLink','rawLink','link'].includes(key))recursiveDownloads(value,[...pathParts,key],result);
  return result;
}

async function fetchJson(url,{cacheKey,maxAgeMs=6*60*60*1000,offlineMode=false,headers={}}={}){
  ensureDirs();const cacheFile=path.join(CACHE_ROOT,`${slug(cacheKey||url)}.json`);
  if(MOCK_ROOT){const mock=safeJson(path.join(MOCK_ROOT,`${slug(cacheKey||url)}.json`));if(mock)return mock;}
  if(offlineMode){const cached=safeJson(cacheFile);if(cached)return cached;throw new Error('Offline mode is enabled and no cached provider response is available.');}
  if(isFresh(cacheFile,maxAgeMs)){const cached=safeJson(cacheFile);if(cached)return cached;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{headers:{'user-agent':USER_AGENT,'accept':'application/json',...headers},signal:controller.signal,redirect:'follow'});
    if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
    const payload=await response.json();atomicJson(cacheFile,{cachedAt:now(),payload});return payload;
  }catch(error){const cached=safeJson(cacheFile);if(cached?.payload)return cached.payload;throw new Error(`Provider request failed: ${error.message}`);}finally{clearTimeout(timer);}
}
function unwrapCache(value){return value?.payload??value;}

export function curatedCatalog(providerId){const file=path.join(CURATED_ROOT,`${providerId}.json`);const payload=safeJson(file,{assets:[]});return Array.isArray(payload)?payload:(payload.assets||[]);}

function normalizeCurated(providerId,item){return{id:String(item.id),providerId,name:item.name,description:firstString(item.shortDescription,item.longDescription,item.description),kind:item.kind||inferKind(item.category),category:item.category||'Curated pack',tags:toTags(item.tags),license:item.license||'CC0',creator:item.creator||providerId,thumbnail:item.thumbnail||null,sourcePage:item.sourcePage||null,downloadChoices:Array.isArray(item.downloadChoices)?item.downloadChoices:[],automatedDownload:Boolean(item.downloadChoices?.length),metadata:{curated:true,pack:item.pack||null}};}

function normalizePolyAssets(payload,query='',type='all'){
  const root=unwrapCache(payload)||{},items=Array.isArray(root)?root:Object.entries(root).map(([id,value])=>({id,...value}));const q=query.toLowerCase();
  return items.map(item=>{const rawType=String(item.type??item.asset_type??item.kind??'').toLowerCase();const kind=rawType==='0'||rawType.includes('hdri')?'hdri':rawType==='1'||rawType.includes('texture')?'material':rawType==='2'||rawType.includes('model')?'model':inferKind(`${item.category||''} ${rawType}`);const id=String(item.id||item.slug||item.asset_id||'');const name=firstString(item.name,item.title,id.replaceAll('_',' '));const tags=toTags(item.tags);const haystack=`${id} ${name} ${item.description||''} ${item.category||''} ${tags.join(' ')}`.toLowerCase();return{id,providerId:'poly-haven',name,description:item.description||'',kind,category:item.category||kind,tags,license:'CC0',creator:firstString(item.authors?.[0]?.name,Object.keys(item.authors||{})[0],item.author,item.creator,'Poly Haven'),thumbnail:cleanUrl(item.thumbnail_url||item.thumbnail||item.preview_url)||`https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?height=256`,sourcePage:`https://polyhaven.com/a/${encodeURIComponent(id)}`,automatedDownload:true,metadata:{rawType,downloadCount:item.download_count||null,datePublished:item.date_published||null}};}).filter(item=>item.id&&(!q||`${item.id} ${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(q))&&(type==='all'||item.kind===type));
}

function normalizeAmbientAssets(payload,query='',type='all'){
  const root=unwrapCache(payload)||{},items=root.foundAssets||root.assets||root.data||[];const q=query.toLowerCase();
  return (Array.isArray(items)?items:[]).map(item=>{const id=String(item.assetId||item.assetID||item.id||item.assetIdString||'');const rawType=firstString(item.dataType,item.type,item.assetType,item.category);const kind=inferKind(rawType);const tags=toTags(item.tags||item.tagData||item.categories);let thumbnail=firstString(item.previewImage,item.previewImageThumbnail,item.thumbnail,item.imageUrl);if(!thumbnail){const found=recursiveDownloads(item.thumbnails||item.previews||item.imageData||{}).find(entry=>['.png','.jpg','.jpeg','.webp'].includes(entry.extension));thumbnail=found?.url||'';}const name=firstString(item.title,item.displayName,item.name,id.replace(/([A-Z])/g,' $1').trim());const haystack=`${id} ${name} ${item.description||''} ${rawType} ${tags.join(' ')}`.toLowerCase();return{id,providerId:'ambientcg',name,description:firstString(item.shortDescription,item.longDescription,item.description),kind,category:rawType||kind,tags,license:'CC0',creator:'ambientCG',thumbnail:cleanUrl(thumbnail)||`https://ambientcg.com/get?file=${encodeURIComponent(id)}_Preview.jpg`,sourcePage:`https://ambientcg.com/view?id=${encodeURIComponent(id)}`,automatedDownload:true,metadata:{raw:item}};}).filter(item=>item.id&&(!q||`${item.id} ${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(q))&&(type==='all'||item.kind===type));
}

export async function searchMarketplace({providerId,query='',type='all',limit=30,offset=0}={}){
  const state=readState(),provider=(state.providers||[]).find(item=>item.id===providerId);if(!provider)throw new Error('Marketplace provider not found.');if(!provider.enabled)throw new Error(`${provider.displayName} is disabled.`);const offlineMode=Boolean(state.settings?.integrations?.offlineMode);limit=Math.max(1,Math.min(60,Number(limit)||30));offset=Math.max(0,Number(offset)||0);
  let results=[];
  if(providerId==='poly-haven'){
    const endpoint=provider.settings?.apiBase||'https://api.polyhaven.com';const payload=await fetchJson(`${endpoint}/assets`,{cacheKey:'poly-haven-assets',offlineMode});results=normalizePolyAssets(payload,query,type);
  }else if(providerId==='ambientcg'){
    const endpoint=provider.settings?.apiBase||'https://ambientcg.com/api/v3';const params=new URLSearchParams({limit:String(Math.max(limit,30)),offset:String(offset),include:'type,releaseDate,shortDescription,longDescription,title,url,tags,dimensions,downloads,previews,thumbnails'});if(query)params.set('q',query);if(type!=='all')params.set('type',type==='model'?'3d-model':type==='hdri'?'hdri':'material');const payload=await fetchJson(`${endpoint}/assets?${params}`,{cacheKey:`ambientcg-v3-${query}-${type}-${offset}-${limit}`,maxAgeMs:12*60*60*1000,offlineMode});results=normalizeAmbientAssets(payload,query,type);
  }else if(['kenney','quaternius','quaternius-animations'].includes(providerId)){
    const q=query.toLowerCase();results=curatedCatalog(providerId).map(item=>normalizeCurated(providerId,item)).filter(item=>(!q||`${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(q))&&(type==='all'||item.kind===type));
  }else throw new Error('This provider does not expose marketplace search.');
  return{providerId,query,type,total:results.length,results:results.slice(offset,offset+limit),cachedAt:now()};
}

function polyChoices(id,payload){const entries=recursiveDownloads(unwrapCache(payload));const choices=[];for(const entry of entries){if(!entry.url)continue;const ext=entry.extension;const importable=['.glb','.gltf','.zip','.hdr','.exr','.png','.jpg','.jpeg','.webp'].includes(ext);if(!importable)continue;choices.push({id:crypto.createHash('sha1').update(entry.url).digest('hex').slice(0,12),label:`${entry.resolution} ${ext.replace('.','').toUpperCase()}${entry.bytes?` · ${(entry.bytes/1048576).toFixed(1)} MB`:''}`,resolution:entry.resolution,format:ext.replace('.',''),files:[entry],importHint:['.glb','.gltf','.zip'].includes(ext)?'model':['.hdr','.exr'].includes(ext)?'hdri':'material'});}return choices.slice(0,100);}
function ambientChoices(asset){const entries=recursiveDownloads(asset.metadata?.raw?.downloads||asset.metadata?.raw?.downloadData||asset.metadata?.raw||{});const zipEntries=entries.filter(entry=>entry.extension==='.zip');return (zipEntries.length?zipEntries:entries).map(entry=>({id:crypto.createHash('sha1').update(entry.url).digest('hex').slice(0,12),label:`${entry.resolution} ${entry.extension.replace('.','').toUpperCase()}${entry.bytes?` · ${(entry.bytes/1048576).toFixed(1)} MB`:''}`,resolution:entry.resolution,format:entry.extension.replace('.',''),files:[entry],importHint:asset.kind==='model'?'model':asset.kind==='hdri'?'hdri':'material'})).slice(0,80);}

export async function marketplaceDetails(providerId,assetId){
  const state=readState(),offlineMode=Boolean(state.settings?.integrations?.offlineMode),provider=(state.providers||[]).find(item=>item.id===providerId);
  if(!provider)throw new Error('Marketplace provider not found.');
  let asset=null;
  if(providerId==='poly-haven'){
    const payload=await fetchJson(`${provider.settings?.apiBase||'https://api.polyhaven.com'}/assets`,{cacheKey:'poly-haven-assets',offlineMode});
    asset=normalizePolyAssets(payload,'','all').find(item=>item.id===assetId);
  }else if(providerId==='ambientcg'){
    const endpoint=provider.settings?.apiBase||'https://ambientcg.com/api/v3';const params=new URLSearchParams({id:assetId,limit:'1',include:'type,releaseDate,shortDescription,longDescription,title,url,tags,dimensions,downloads,previews,thumbnails'});const payload=await fetchJson(`${endpoint}/assets?${params}`,{cacheKey:`ambientcg-v3-details-${assetId}`,maxAgeMs:12*60*60*1000,offlineMode});asset=normalizeAmbientAssets(payload,'','all').find(item=>item.id===assetId)||null;
  }else if(['kenney','quaternius','quaternius-animations'].includes(providerId)){
    asset=curatedCatalog(providerId).map(item=>normalizeCurated(providerId,item)).find(item=>item.id===assetId)||null;
  }
  if(!asset)throw new Error('Marketplace asset was not found.');
  if(providerId==='poly-haven'){
    const payload=await fetchJson(`${provider.settings?.apiBase||'https://api.polyhaven.com'}/files/${encodeURIComponent(assetId)}`,{cacheKey:`poly-haven-files-${assetId}`,offlineMode});
    asset={...asset,downloadChoices:polyChoices(assetId,payload)};
  }else if(providerId==='ambientcg')asset={...asset,downloadChoices:ambientChoices(asset)};
  return asset;
}

export function prepareMarketplaceDownload({providerId,asset,choice}){
  ensureDirs();if(!asset||!choice||!Array.isArray(choice.files)||!choice.files.length)throw new Error('A downloadable marketplace choice is required.');const destination=path.join(STAGING_ROOT,providerId,slug(asset.id),`${Date.now().toString(36)}-${slug(choice.label,'download')}`);return{providerId,asset:{id:asset.id,name:asset.name,kind:asset.kind,category:asset.category,license:asset.license,creator:asset.creator,sourcePage:asset.sourcePage,tags:asset.tags,thumbnail:asset.thumbnail},choice,files:choice.files,destination};
}

export function inspectDownloadedJob(job){const output=(job.outputs||[]).find(item=>item.type==='marketplace-download');if(!output)throw new Error('The job does not contain a marketplace download.');return output.value||output;}

function extractZip(zipFile,destination){fs.mkdirSync(destination,{recursive:true});let result;if(process.platform==='win32'){const escaped=s=>String(s).replaceAll("'","''");result=spawnSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${escaped(zipFile)}' -DestinationPath '${escaped(destination)}' -Force`],{encoding:'utf8',timeout:120000,windowsHide:true});}else result=spawnSync('unzip',['-o',zipFile,'-d',destination],{encoding:'utf8',timeout:120000});if(result.status!==0)throw new Error(`Archive extraction failed: ${result.stderr||result.stdout||'unknown error'}`);}
function walk(dir,output=[]){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full,output);else output.push(full);}return output;}
function classifyMap(file){const name=path.basename(file).toLowerCase();if(/(basecolor|base_color|albedo|diffuse|_color|_col\b)/.test(name))return'baseColor';if(/normalgl|normal_gl|_nor_gl|_normal/.test(name))return'normal';if(/rough/.test(name))return'roughness';if(/metal/.test(name))return'metallic';if(/ambientocclusion|ambient_occlusion|_ao\b/.test(name))return'ambientOcclusion';if(/height|displacement|_disp\b/.test(name))return'height';if(/emiss/.test(name))return'emissive';if(/opacity|alpha/.test(name))return'opacity';return null;}

export function resolveMarketplaceImportFiles(job){const output=inspectDownloadedJob(job),root=path.resolve(output.destination),files=Array.isArray(output.files)?output.files.map(file=>path.resolve(file.path)):[];if(files.some(file=>path.extname(file).toLowerCase()==='.zip')){const extracted=path.join(root,'extracted');for(const archive of files.filter(file=>path.extname(file).toLowerCase()==='.zip'))extractZip(archive,extracted);files.push(...walk(extracted));}const modelFiles=files.filter(file=>['.glb','.gltf'].includes(path.extname(file).toLowerCase())).sort((a,b)=>(path.extname(a)==='.glb'?-1:1));const images=files.filter(file=>['.png','.jpg','.jpeg','.webp'].includes(path.extname(file).toLowerCase()));const hdris=files.filter(file=>['.hdr','.exr'].includes(path.extname(file).toLowerCase()));return{...output,files,modelFiles,images,hdris,maps:Object.fromEntries(images.map(file=>[classifyMap(file),file]).filter(([key])=>key))};}

export function createMaterialFromMarketplaceDownload({assetRoot,download}){
  const resolved=resolveMarketplaceImportFiles({outputs:[{type:'marketplace-download',value:download}]});
  if(!Object.keys(resolved.maps).length)throw new Error('No recognized PBR texture maps were found in the downloaded files.');
  const materialId=`material-${slug(download.asset?.providerId||download.providerId||'market')}-${slug(download.asset?.id||download.asset?.name||'surface')}-${Date.now().toString(36)}`;
  const folder=path.join(assetRoot,'materials',materialId);fs.mkdirSync(folder,{recursive:true});const maps={};
  for(const [mapName,source] of Object.entries(resolved.maps)){const extension=path.extname(source).toLowerCase()||'.png',fileName=`${mapName}${extension}`;fs.copyFileSync(source,path.join(folder,fileName));maps[mapName]={file:`assets/materials/${materialId}/${fileName}`,url:`/assets/materials/${encodeURIComponent(materialId)}/${encodeURIComponent(fileName)}`};}
  return{id:materialId,type:'material',name:String(download.asset?.name||'Marketplace Material').slice(0,120),category:'surface',source:`${download.providerId}:${download.asset?.id||''}`,provider:download.providerId,providerAssetId:download.asset?.id||null,sourceUri:download.asset?.sourcePage||null,creator:download.asset?.creator||download.providerId,license:download.asset?.license||'Review required',attributionRequired:false,attribution:download.asset?.creator||null,createdAt:now(),updatedAt:now(),maps,settings:{worldScale:2,uvRotation:0,uvOffset:[0,0],roughness:.8,roughnessMultiplier:1,metallic:0,normalStrength:1,aoStrength:1,heightStrength:.035},tags:unique([...(download.asset?.tags||[]),download.providerId,'marketplace','pbr']),protected:false,approvalState:'draft',provenance:{provider:download.providerId,providerAssetId:download.asset?.id||null,sourcePage:download.asset?.sourcePage||null,downloadedAt:download.downloadedAt||now(),downloadJobFiles:(download.files||[]).map(file=>({name:file.name,sha256:file.sha256,bytes:file.bytes,sourceUrl:file.sourceUrl}))}};
}
