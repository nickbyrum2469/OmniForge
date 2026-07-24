import os from 'node:os';

const now = () => new Date().toISOString();

export const PROVIDER_STATES = Object.freeze(['connected','disconnected','unavailable','installing','updating','degraded','failed']);
export const JOB_STATES = Object.freeze(['queued','running','succeeded','failed','cancelled','interrupted']);

export function starterProviders() {
  return [
    {
      id:'local-project-assets',
      displayName:'Project Asset Library',
      description:'Searches and validates assets already managed by the active OmniForge project.',
      kind:'asset-source',
      capabilities:['asset-search'],
      operations:['provider-health-check','asset-index','project-integrity'],
      enabled:true,
      required:true,
      settings:{ includeUnvalidated:true },
      status:{ state:'connected',message:'Managed asset registry available.',version:'1.0.0',executionBackend:'local',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'local-procedural-surfaces',
      displayName:'Local Surface Generator',
      description:'Creates deterministic seamless starter surfaces without a network connection or paid credits.',
      kind:'generation',
      capabilities:['text-to-image','retexture'],
      operations:['provider-health-check'],
      enabled:true,
      required:false,
      settings:{ defaultResolution:512 },
      status:{ state:'connected',message:'Local procedural surface tools available.',version:'1.0.0',executionBackend:'cpu',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'poly-haven',
      displayName:'Poly Haven',
      description:'Searches Poly Haven’s live CC0 models, materials, and HDRIs through its public API.',
      kind:'asset-source-remote',
      capabilities:['asset-search','asset-download','models','materials','hdris'],
      operations:['provider-health-check','marketplace-download'],
      enabled:true,
      required:false,
      settings:{ apiBase:'https://api.polyhaven.com', attributionLabel:'Assets from Poly Haven', preferredResolution:'2K' },
      status:{ state:'disconnected',message:'Run a health check to test the live API.',version:null,executionBackend:'remote',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'ambientcg',
      displayName:'ambientCG',
      description:'Searches ambientCG’s live CC0 PBR materials, HDRIs, terrain assets, and models.',
      kind:'asset-source-remote',
      capabilities:['asset-search','asset-download','models','materials','hdris'],
      operations:['provider-health-check','marketplace-download'],
      enabled:true,
      required:false,
      settings:{ apiBase:'https://ambientcg.com/api/v3', preferredResolution:'2K', preferredEncoding:'JPG' },
      status:{ state:'disconnected',message:'Run a health check to test the live API.',version:'v3',executionBackend:'remote',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'kenney',
      displayName:'Kenney',
      description:'Curated CC0 game-asset packs with source links and manual selective installation.',
      kind:'asset-source-curated',
      capabilities:['asset-search','curated-packs','models','materials'],
      operations:['provider-health-check'],
      enabled:true,
      required:false,
      settings:{ catalog:'data/catalogs/kenney.json' },
      status:{ state:'connected',message:'Bundled curated catalog available.',version:'curated-1',executionBackend:'local',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'quaternius',
      displayName:'Quaternius',
      description:'Curated CC0 3D game-asset packs with source links and manual selective installation.',
      kind:'asset-source-curated',
      capabilities:['asset-search','curated-packs','models'],
      operations:['provider-health-check'],
      enabled:true,
      required:false,
      settings:{ catalog:'data/catalogs/quaternius.json' },
      status:{ state:'connected',message:'Bundled curated catalog available.',version:'curated-1',executionBackend:'local',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'quaternius-animations',
      displayName:'Quaternius Animation Library',
      description:'Curated CC0 Universal Animation Library metadata for later retargeting and animation workflows.',
      kind:'animation-library',
      capabilities:['asset-search','animation-library'],
      operations:['provider-health-check'],
      enabled:true,
      required:false,
      settings:{ catalog:'data/catalogs/quaternius-animations.json' },
      status:{ state:'connected',message:'Bundled animation catalog available.',version:'curated-1',executionBackend:'local',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    },
    {
      id:'local-worker-host',
      displayName:'Isolated Worker Host',
      description:'Runs long operations outside the editor process with progress, logs, cancellation, and failure isolation.',
      kind:'worker-host',
      capabilities:['worker-execution'],
      operations:['provider-health-check','diagnostic-delay','asset-index','project-integrity'],
      enabled:true,
      required:true,
      settings:{ maxMemoryMb:4096 },
      status:{ state:'connected',message:'Node worker runtime available.',version:process.versions.node,executionBackend:'local',lastHealthCheck:null },
      createdAt:now(),updatedAt:now()
    }
  ];
}

export function normalizeProvider(provider={}, fallback={}) {
  const merged={...fallback,...provider};
  if(merged.id==='ambientcg'&&String(merged.settings?.apiBase||'').includes('/api/v2'))merged.settings={...merged.settings,apiBase:'https://ambientcg.com/api/v3'};
  const status={...(fallback.status||{}),...(provider.status||{})};
  if(merged.id==='ambientcg'&&status.version==='v2')status.version='v3';
  const state=PROVIDER_STATES.includes(status.state)?status.state:(merged.enabled===false?'disconnected':'unavailable');
  return {
    id:String(merged.id||'').slice(0,100),
    displayName:String(merged.displayName||merged.id||'Provider').slice(0,120),
    description:String(merged.description||'').slice(0,800),
    kind:String(merged.kind||'provider').slice(0,60),
    capabilities:Array.isArray(merged.capabilities)?[...new Set(merged.capabilities.map(v=>String(v).slice(0,60)))]:[],
    operations:Array.isArray(merged.operations)?[...new Set(merged.operations.map(v=>String(v).slice(0,60)))]:[],
    enabled:merged.required?true:merged.enabled!==false,
    required:Boolean(merged.required),
    settings:merged.settings&&typeof merged.settings==='object'?structuredClone(merged.settings):{},
    status:{
      state:merged.enabled===false&&!merged.required?'disconnected':state,
      message:String(status.message||'').slice(0,1000),
      version:status.version?String(status.version).slice(0,100):null,
      executionBackend:status.executionBackend?String(status.executionBackend).slice(0,40):null,
      lastHealthCheck:status.lastHealthCheck||null,
      hardware:status.hardware&&typeof status.hardware==='object'?structuredClone(status.hardware):null
    },
    createdAt:merged.createdAt||now(),updatedAt:now()
  };
}

export function normalizeProviders(providers=[]) {
  const defaults=starterProviders();
  const result=[];
  for(const base of defaults){
    const existing=providers.find(item=>item?.id===base.id);
    result.push(normalizeProvider(existing||base,base));
  }
  for(const provider of providers){
    if(!provider?.id||result.some(item=>item.id===provider.id))continue;
    result.push(normalizeProvider(provider));
  }
  return result;
}

export function defaultIntegrationSettings() {
  return {
    setupState:'pending',
    completedAt:null,
    dismissedAt:null,
    downloadDirectory:'downloads',
    cacheDirectory:'cache/providers',
    cacheLimitGb:20,
    maxConcurrentJobs:2,
    retainCompletedJobs:100,
    offlineMode:false
  };
}

export function normalizeIntegrationSettings(settings={}) {
  const merged={...defaultIntegrationSettings(),...(settings||{})};
  const clamp=(value,min,max,fallback)=>{const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback));};
  return {
    setupState:['pending','completed','dismissed'].includes(merged.setupState)?merged.setupState:'pending',
    completedAt:merged.completedAt||null,
    dismissedAt:merged.dismissedAt||null,
    downloadDirectory:String(merged.downloadDirectory||'downloads').slice(0,500),
    cacheDirectory:String(merged.cacheDirectory||'cache/providers').slice(0,500),
    cacheLimitGb:clamp(merged.cacheLimitGb,1,500,20),
    maxConcurrentJobs:Math.round(clamp(merged.maxConcurrentJobs,1,8,2)),
    retainCompletedJobs:Math.round(clamp(merged.retainCompletedJobs,10,1000,100)),
    offlineMode:Boolean(merged.offlineMode)
  };
}

export function normalizeJob(job={}) {
  const state=JOB_STATES.includes(job.state)?job.state:'queued';
  return {
    id:String(job.id||''),providerId:String(job.providerId||'local-worker-host'),operation:String(job.operation||'diagnostic-delay'),
    title:String(job.title||job.operation||'Background job').slice(0,180),
    inputs:job.inputs&&typeof job.inputs==='object'?structuredClone(job.inputs):{},prompt:String(job.prompt||'').slice(0,10000),settings:job.settings&&typeof job.settings==='object'?structuredClone(job.settings):{},
    state,stage:String(job.stage||state).slice(0,120),progress:Math.max(0,Math.min(1,Number(job.progress)||0)),
    createdAt:job.createdAt||now(),startedAt:job.startedAt||null,completedAt:job.completedAt||null,elapsedMs:Math.max(0,Number(job.elapsedMs)||0),
    logs:Array.isArray(job.logs)?job.logs.slice(-300):[],warnings:Array.isArray(job.warnings)?job.warnings.slice(-100):[],errors:Array.isArray(job.errors)?job.errors.slice(-100):[],
    cancellationRequested:Boolean(job.cancellationRequested),outputs:Array.isArray(job.outputs)?job.outputs:[],
    validation:job.validation&&typeof job.validation==='object'?structuredClone(job.validation):{state:'pending',warnings:[]},retryEligible:Boolean(job.retryEligible),
    cost:job.cost&&typeof job.cost==='object'?structuredClone(job.cost):{currency:null,estimated:null,actual:null},attempt:Math.max(1,Number(job.attempt)||1),sourceJobId:job.sourceJobId||null,importedAssetId:job.importedAssetId||null,updatedAt:now()
  };
}

export function normalizeJobs(jobs=[]) {
  return (Array.isArray(jobs)?jobs:[]).map(job=>normalizeJob(job)).slice(0,1000);
}

export function localHardwareSummary() {
  return {
    platform:process.platform,architecture:process.arch,node:process.versions.node,
    cpuModel:os.cpus()?.[0]?.model||'Unknown CPU',logicalCores:os.cpus()?.length||1,
    totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem()
  };
}
