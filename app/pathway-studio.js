import { analyzePathwayCorridor } from './pathway-corridor.js';

export const PATHWAY_PRESETS = Object.freeze({
  footTrail: {
    label: 'Natural foot trail',
    description: 'Narrow low-impact trail with soft shoulders and higher allowable grade.',
    pathPreset: 'footTrail', roadClass: 'trail', width: 1.4, laneCount: 1, laneWidth: 1.4,
    shoulderWidth: 0.35, shoulderDrop: 0.03, crownHeight: 0.015, maxGradePercent: 24,
    minimumCurveRadius: 2.5, designSpeedKph: 8, bankMode: 'none', maxBankDegrees: 0,
    cutShoulder: 1.2, sideSlopeWidth: 1.4, maxCutDepth: 2.5, maxFillDepth: 1.4,
    drainageEnabled: false, ditchDepth: 0, edgeNoise: 0.8, meshSpacing: 0.35,
    vegetationExclusion: 1.2, textureRepeatLength: 3.5
  },
  dirtRoad: {
    label: 'Dirt road',
    description: 'Rural two-way dirt road with crowned drainage and forgiving shoulders.',
    pathPreset: 'dirtRoad', roadClass: 'rural', width: 4.8, laneCount: 2, laneWidth: 2.4,
    shoulderWidth: 0.9, shoulderDrop: 0.08, crownHeight: 0.08, maxGradePercent: 14,
    minimumCurveRadius: 10, designSpeedKph: 30, bankMode: 'auto', bankStrength: 0.35, maxBankDegrees: 5,
    cutShoulder: 3, sideSlopeWidth: 3.4, maxCutDepth: 5, maxFillDepth: 3,
    drainageEnabled: true, ditchDepth: 0.22, edgeNoise: 0.6, meshSpacing: 0.55,
    vegetationExclusion: 3, textureRepeatLength: 5
  },
  gravelRoad: {
    label: 'Gravel road',
    description: 'Engineered gravel route with stronger grade control, shoulders, and drainage.',
    pathPreset: 'gravelRoad', roadClass: 'collector', width: 6.2, laneCount: 2, laneWidth: 3.1,
    shoulderWidth: 1.35, shoulderDrop: 0.1, crownHeight: 0.11, maxGradePercent: 10,
    minimumCurveRadius: 20, designSpeedKph: 45, bankMode: 'auto', bankStrength: 0.55, maxBankDegrees: 7,
    cutShoulder: 4.5, sideSlopeWidth: 4.5, maxCutDepth: 7, maxFillDepth: 4,
    drainageEnabled: true, ditchDepth: 0.32, edgeNoise: 0.28, meshSpacing: 0.65,
    vegetationExclusion: 4, textureRepeatLength: 6
  },
  pavedRoad: {
    label: 'Two-lane paved road',
    description: 'Crowned asphalt road with automatic superelevation and engineered side slopes.',
    pathPreset: 'pavedRoad', roadClass: 'arterial', width: 7.2, laneCount: 2, laneWidth: 3.6,
    shoulderWidth: 1.8, shoulderDrop: 0.12, crownHeight: 0.14, maxGradePercent: 8,
    minimumCurveRadius: 35, designSpeedKph: 65, bankMode: 'auto', bankStrength: 0.82, maxBankDegrees: 9,
    cutShoulder: 5.5, sideSlopeWidth: 5.5, maxCutDepth: 9, maxFillDepth: 5.5,
    drainageEnabled: true, ditchDepth: 0.42, edgeNoise: 0.08, meshSpacing: 0.7,
    vegetationExclusion: 5.5, textureRepeatLength: 8
  },
  mountainRoad: {
    label: 'Mountain road',
    description: 'Compact switchback-ready route with stronger cut/fill and retaining-wall diagnostics.',
    pathPreset: 'mountainRoad', roadClass: 'mountain', width: 5.8, laneCount: 2, laneWidth: 2.9,
    shoulderWidth: 0.8, shoulderDrop: 0.1, crownHeight: 0.09, maxGradePercent: 12,
    minimumCurveRadius: 12, designSpeedKph: 30, bankMode: 'auto', bankStrength: 0.9, maxBankDegrees: 11,
    cutShoulder: 6.5, sideSlopeWidth: 6.5, maxCutDepth: 12, maxFillDepth: 7,
    drainageEnabled: true, ditchDepth: 0.48, edgeNoise: 0.18, meshSpacing: 0.5,
    bridgeThreshold: 4.5, tunnelThreshold: 7.5, retainingWallThreshold: 3,
    vegetationExclusion: 4, textureRepeatLength: 5
  },
  highway: {
    label: 'Four-lane highway',
    description: 'Wide high-speed corridor with large-radius curves and strict vertical grading.',
    pathPreset: 'highway', roadClass: 'highway', width: 14.4, laneCount: 4, laneWidth: 3.6,
    shoulderWidth: 3, shoulderDrop: 0.14, crownHeight: 0.18, maxGradePercent: 6,
    minimumCurveRadius: 120, designSpeedKph: 110, bankMode: 'auto', bankStrength: 1, maxBankDegrees: 10,
    cutShoulder: 10, sideSlopeWidth: 10, maxCutDepth: 14, maxFillDepth: 8,
    drainageEnabled: true, ditchDepth: 0.55, edgeNoise: 0.02, meshSpacing: 1,
    bridgeThreshold: 6, tunnelThreshold: 10, retainingWallThreshold: 4,
    vegetationExclusion: 10, textureRepeatLength: 12
  },
  stoneWay: {
    label: 'Fantasy stone way',
    description: 'Broad hand-built stone route for towns, ruins, castles, and stylized worlds.',
    pathPreset: 'stoneWay', roadClass: 'stone', width: 5.2, laneCount: 1, laneWidth: 5.2,
    shoulderWidth: 0.65, shoulderDrop: 0.04, crownHeight: 0.04, maxGradePercent: 15,
    minimumCurveRadius: 7, designSpeedKph: 18, bankMode: 'none', maxBankDegrees: 0,
    cutShoulder: 3.2, sideSlopeWidth: 3.5, maxCutDepth: 6, maxFillDepth: 4,
    drainageEnabled: true, ditchDepth: 0.16, edgeNoise: 0.12, meshSpacing: 0.45,
    vegetationExclusion: 3, textureRepeatLength: 4
  }
});

function option(value, label, selected) {
  return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
}

function numberControl(label, key, value, step, minimum, maximum, unit = '', hint = '') {
  return `<div class="pathway-control"><label>${label}${unit ? `<small>${unit}</small>` : ''}</label><input data-property-key="${key}" data-pathway-live type="number" step="${step}" min="${minimum}" max="${maximum}" value="${Number(value)}">${hint ? `<p>${hint}</p>` : ''}</div>`;
}

function selectControl(label, key, value, choices, hint = '') {
  return `<div class="pathway-control"><label>${label}</label><select data-property-key="${key}" data-pathway-live>${choices.map(choice => option(choice.value, choice.label, value)).join('')}</select>${hint ? `<p>${hint}</p>` : ''}</div>`;
}

function checkControl(label, key, value, hint = '') {
  return `<label class="pathway-check"><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span><input data-property-key="${key}" type="checkbox" ${value ? 'checked' : ''}></label>`;
}

function metric(label, value, status = '') {
  return `<div class="pathway-metric ${status}"><strong>${value}</strong><span>${label}</span></div>`;
}

function format(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

export function applyPathwayPreset(properties = {}, presetKey = 'dirtRoad') {
  const preset = PATHWAY_PRESETS[presetKey] || PATHWAY_PRESETS.dirtRoad;
  return {
    ...properties,
    ...preset,
    pathPreset: presetKey,
    profileRevision: Number(properties.profileRevision || 1) + 1
  };
}

export function renderPathwayInspector(pathObject, terrain, allPaths, helpers) {
  const p = pathObject.properties || {};
  const diagnostics = analyzePathwayCorridor(pathObject, terrain, allPaths);
  const presetKey = PATHWAY_PRESETS[p.pathPreset] ? p.pathPreset : 'dirtRoad';
  const warnings = diagnostics.warnings || [];
  const gradeStatus = diagnostics.maximumGradePercent > Number(p.maxGradePercent || 12) + 0.05 ? 'bad' : 'good';
  const radiusStatus = diagnostics.minimumCurveRadius && diagnostics.minimumCurveRadius < Number(p.minimumCurveRadius || 10) ? 'warn' : 'good';
  const material = helpers.materialSelect(p.materialId);
  const fallbackColor = helpers.propColor('Fallback road color', 'color', p.color || '#73573d');
  return `<div class="pathway-studio">
    <div class="pathway-hero">
      <div><span class="pathway-kicker">PATHWAY STUDIO</span><strong>Grade-aware terrain corridor</strong><p>The spline is the authority. Roadbed, crown, banking, shoulders, drainage, cut/fill slopes, materials, collision and navigation derive from it.</p></div>
      <span class="pathway-status ${warnings.length ? 'warn' : 'good'}">${warnings.length ? `${warnings.length} review item${warnings.length === 1 ? '' : 's'}` : 'Corridor healthy'}</span>
    </div>
    <div class="pathway-preset-row">
      <select data-pathway-preset>${Object.entries(PATHWAY_PRESETS).map(([key, preset]) => option(key, preset.label, presetKey)).join('')}</select>
      <button id="applyPathwayPresetButton" class="button primary" type="button">Apply preset</button>
    </div>
    <p class="pathway-preset-description">${PATHWAY_PRESETS[presetKey].description}</p>

    <div class="pathway-metrics">
      ${metric('length', `${format(diagnostics.length)} m`)}
      ${metric('maximum grade', `${format(diagnostics.maximumGradePercent)}%`, gradeStatus)}
      ${metric('minimum radius', diagnostics.minimumCurveRadius ? `${format(diagnostics.minimumCurveRadius)} m` : 'straight', radiusStatus)}
      ${metric('maximum cut', `${format(diagnostics.maximumCut)} m`, diagnostics.tunnelRecommended ? 'warn' : '')}
      ${metric('maximum fill', `${format(diagnostics.maximumFill)} m`, diagnostics.bridgeRecommended ? 'warn' : '')}
      ${metric('triangles', Math.round(diagnostics.triangleCount || 0).toLocaleString())}
    </div>
    ${warnings.length ? `<div class="pathway-warnings">${warnings.map(item => `<p>${helpers.escapeHtml(item)}</p>`).join('')}</div>` : ''}

    <details class="pathway-group" open><summary>Road geometry</summary><div class="pathway-grid">
      ${numberControl('Road width', 'width', p.width ?? 4.8, 0.1, 0.2, 100, 'm')}
      ${numberControl('Lane count', 'laneCount', p.laneCount ?? 2, 1, 1, 12)}
      ${numberControl('Lane width', 'laneWidth', p.laneWidth ?? 2.4, 0.1, 0.5, 8, 'm')}
      ${numberControl('Shoulder width', 'shoulderWidth', p.shoulderWidth ?? 0.9, 0.05, 0, 20, 'm')}
      ${numberControl('Shoulder drop', 'shoulderDrop', p.shoulderDrop ?? 0.08, 0.01, 0, 2, 'm')}
      ${numberControl('Crown height', 'crownHeight', p.crownHeight ?? 0.08, 0.01, -1, 2, 'm')}
      ${numberControl('Mesh spacing', 'meshSpacing', p.meshSpacing ?? 0.55, 0.05, 0.15, 5, 'm', 'Smaller values increase corridor detail and rebuild cost.')}
      ${numberControl('Texture repeat', 'textureRepeatLength', p.textureRepeatLength ?? 5, 0.25, 0.25, 100, 'm')}
    </div><div class="pathway-actions"><button id="fitPathwayLanesButton" class="button subtle" type="button">Fit width to lanes</button><button id="reversePathwayButton" class="button subtle" type="button">Reverse direction</button><button id="rebuildPathwayButton" class="button subtle" type="button">Recompile corridor</button></div></details>

    <details class="pathway-group" open><summary>Vertical profile and curves</summary><div class="pathway-grid">
      ${numberControl('Maximum grade', 'maxGradePercent', p.maxGradePercent ?? 12, 0.25, 0.1, 100, '%')}
      ${numberControl('Profile smoothing', 'profileSmoothingPasses', p.profileSmoothingPasses ?? 4, 1, 0, 16, 'passes')}
      ${numberControl('Vertical curve strength', 'verticalCurveStrength', p.verticalCurveStrength ?? 0.62, 0.05, 0, 1)}
      ${numberControl('Preferred curve radius', 'minimumCurveRadius', p.minimumCurveRadius ?? 10, 0.5, 0.5, 10000, 'm')}
      ${numberControl('Design speed', 'designSpeedKph', p.designSpeedKph ?? 30, 1, 1, 250, 'km/h')}
      ${selectControl('Banking', 'bankMode', p.bankMode || 'auto', [{value:'auto',label:'Automatic from curvature and speed'},{value:'manual',label:'Manual constant bank'},{value:'none',label:'No banking'}])}
      ${numberControl('Bank strength', 'bankStrength', p.bankStrength ?? 0.55, 0.05, 0, 1.5)}
      ${numberControl('Maximum bank', 'maxBankDegrees', p.maxBankDegrees ?? 7, 0.25, 0, 30, '°')}
      ${numberControl('Manual bank', 'manualBankDegrees', p.manualBankDegrees ?? 0, 0.25, -30, 30, '°')}
    </div></details>

    <details class="pathway-group" open><summary>Terrain engineering</summary><div class="pathway-grid">
      ${numberControl('Cut/fill shoulder', 'cutShoulder', p.cutShoulder ?? 3, 0.1, 0.1, 100, 'm')}
      ${numberControl('Side-slope width', 'sideSlopeWidth', p.sideSlopeWidth ?? 3.4, 0.1, 0.2, 100, 'm')}
      ${numberControl('Maximum cut', 'maxCutDepth', p.maxCutDepth ?? 5, 0.1, 0, 1000, 'm')}
      ${numberControl('Maximum fill', 'maxFillDepth', p.maxFillDepth ?? 3, 0.1, 0, 1000, 'm')}
      ${numberControl('Bridge review threshold', 'bridgeThreshold', p.bridgeThreshold ?? 5, 0.25, 0, 1000, 'm')}
      ${numberControl('Tunnel review threshold', 'tunnelThreshold', p.tunnelThreshold ?? 8, 0.25, 0, 1000, 'm')}
      ${numberControl('Retaining-wall threshold', 'retainingWallThreshold', p.retainingWallThreshold ?? 3.5, 0.25, 0, 1000, 'm')}
      ${selectControl('Render lift', 'renderLiftMode', p.renderLiftMode || 'auto', [{value:'auto',label:'Automatic for world scale and depth precision'},{value:'manual',label:'Manual'}])}
      ${numberControl('Manual render lift', 'renderLift', p.renderLift ?? 0.028, 0.005, 0.006, 0.25, 'm')}
    </div><div class="pathway-checks">
      ${checkControl('Carve terrain', 'carveTerrain', p.carveTerrain !== false, 'Compile the vertical profile into terrain height queries.')}
      ${checkControl('Conform to terrain', 'conformToTerrain', p.conformToTerrain !== false, 'Keep the corridor attached to the authoritative world terrain.')}
      ${checkControl('Drainage ditches', 'drainageEnabled', p.drainageEnabled !== false, 'Lower side bands to create visible drainage transitions.')}
    </div><div class="pathway-grid">${numberControl('Ditch depth', 'ditchDepth', p.ditchDepth ?? 0.22, 0.02, 0, 5, 'm')}${numberControl('Blend shoulder', 'blendDistance', p.blendDistance ?? 2.5, 0.1, 0.05, 100, 'm')}${numberControl('Edge irregularity', 'edgeNoise', p.edgeNoise ?? 0.6, 0.05, 0, 5)}</div></details>

    <details class="pathway-group"><summary>Materials and gameplay</summary>
      ${material}${fallbackColor}
      <div class="pathway-grid">
        ${numberControl('Nature clearance', 'vegetationExclusion', p.vegetationExclusion ?? 3, 0.1, 0, 100, 'm')}
      </div>
      <div class="pathway-checks">
        ${checkControl('Collision', 'collider', p.collider !== false, 'Terrain collision follows the compiled road profile.')}
        ${checkControl('Navigation', 'navigation', p.navigation !== false, 'Expose the corridor as a traversable navigation route.')}
        ${checkControl('Show spline', 'showSpline', p.showSpline !== false, 'Editor-only center and boundary guides.')}
      </div>
    </details>
  </div>`;
}
