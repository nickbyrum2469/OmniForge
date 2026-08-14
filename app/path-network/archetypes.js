export const PATH_ARCHETYPES = Object.freeze({
  'animal-trail': Object.freeze({
    id: 'animal-trail',
    label: 'Animal trail',
    solverFamily: 'trail',
    maximumGradePercent: 35,
    preferredGradePercent: 12,
    maximumCrossSlopeDegrees: 42,
    minimumTurnRadius: 1.5,
    width: 0.65,
    clearance: 1.2,
    surfaceTreatment: 'natural-worn',
    structurePermissions: [],
    terrainModificationTolerance: 0.05,
    drainageRequired: false,
    trafficType: 'wildlife',
    weights: { distance: 1, grade: 2.1, crossSlope: 0.7, roughness: 0.45, earthwork: 4, scenic: 0.2 }
  }),
  'human-footpath': Object.freeze({
    id: 'human-footpath',
    label: 'Human footpath',
    solverFamily: 'trail',
    maximumGradePercent: 22,
    preferredGradePercent: 8,
    maximumCrossSlopeDegrees: 32,
    minimumTurnRadius: 2,
    width: 1.2,
    clearance: 2.4,
    surfaceTreatment: 'compacted-earth',
    structurePermissions: ['stairs', 'boardwalk'],
    terrainModificationTolerance: 0.15,
    drainageRequired: true,
    trafficType: 'pedestrian',
    weights: { distance: 1, grade: 3, crossSlope: 1.25, roughness: 0.8, earthwork: 2.4, scenic: 0.35 }
  }),
  'mountain-hiking-trail': Object.freeze({
    id: 'mountain-hiking-trail',
    label: 'Mountain hiking trail',
    solverFamily: 'trail',
    maximumGradePercent: 28,
    preferredGradePercent: 10,
    maximumCrossSlopeDegrees: 38,
    minimumTurnRadius: 2.5,
    width: 1.1,
    clearance: 2.5,
    surfaceTreatment: 'reinforced-natural',
    structurePermissions: ['stairs', 'boardwalk', 'retaining-wall'],
    terrainModificationTolerance: 0.25,
    drainageRequired: true,
    trafficType: 'pedestrian',
    weights: { distance: 0.85, grade: 3.4, crossSlope: 1.45, roughness: 0.6, earthwork: 1.7, scenic: 0.7 }
  }),
  'pack-trail': Object.freeze({
    id: 'pack-trail',
    label: 'Pack trail',
    solverFamily: 'trail',
    maximumGradePercent: 16,
    preferredGradePercent: 6,
    maximumCrossSlopeDegrees: 26,
    minimumTurnRadius: 4,
    width: 1.8,
    clearance: 3,
    surfaceTreatment: 'compacted-earth',
    structurePermissions: ['bridge', 'retaining-wall'],
    terrainModificationTolerance: 0.35,
    drainageRequired: true,
    trafficType: 'pack-animal',
    weights: { distance: 1, grade: 4.2, crossSlope: 1.8, roughness: 1, earthwork: 1.8, scenic: 0.15 }
  })
});

export function pathArchetype(id = 'human-footpath') {
  const profile = PATH_ARCHETYPES[id];
  if (!profile) throw new Error(`Unknown path archetype ${id}.`);
  return structuredClone(profile);
}

export function trailArchetypes() {
  return Object.values(PATH_ARCHETYPES)
    .filter(profile => profile.solverFamily === 'trail')
    .map(profile => structuredClone(profile));
}
