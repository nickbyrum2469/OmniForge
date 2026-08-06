import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_BRIDGE_PROFILES,
  resolveBridgeProfile
} from '../app/path-network/bridge-profiles.js';

function resolve({
  bridgeStyle = 'auto',
  span = 12,
  width = 4,
  clearance = 6,
  vehicleClass = 'mixed',
  crossSection = {},
  structureProfile = {}
} = {}) {
  return resolveBridgeProfile({
    crossSectionProfile: { width, ...crossSection },
    gameplayRules: { vehicleClass },
    structureProfile: { bridgeStyle, ...structureProfile }
  }, [
    { distance: 0, center: [0, clearance, 0] },
    { distance: span, center: [span, clearance, 0] }
  ], () => 0);
}

test('all five bridge families declare complete nonzero structural transition authority', () => {
  assert.deepEqual(Object.keys(PATH_BRIDGE_PROFILES).sort(), [
    'masonry-causeway',
    'rope-footbridge',
    'steel-girder',
    'stone-arch',
    'timber-trestle'
  ]);

  for (const profile of Object.values(PATH_BRIDGE_PROFILES)) {
    assert.ok(profile.deckWidthScale > 0 && profile.deckWidthScale <= 1, profile.id);
    assert.ok(profile.minimumClearWidth > 0, profile.id);
    assert.ok(profile.deckEdgeOverhang > 0, profile.id);
    assert.ok(profile.deckThickness > 0, profile.id);
    assert.ok(profile.approachTaperLength > 0, profile.id);
    assert.ok(profile.abutmentSeatLength > 0, profile.id);
    assert.equal(typeof profile.carrySidewalks, 'boolean', profile.id);
    assert.ok(profile.maximumWidth >= profile.minimumClearWidth, profile.id);
  }
});

test('each authored bridge family resolves safe clear width, deck width, and compatibility', () => {
  const cases = [
    ['timber-trestle', { span: 14, width: 4 }],
    ['stone-arch', { span: 22, width: 7 }],
    ['steel-girder', { span: 44, width: 9 }],
    ['masonry-causeway', { span: 10, width: 6, clearance: 1 }],
    ['rope-footbridge', { span: 24, width: 2, vehicleClass: 'pedestrian' }]
  ];

  for (const [bridgeStyle, options] of cases) {
    const profile = resolve({ bridgeStyle, ...options });
    assert.equal(profile.bridgeStyle, bridgeStyle);
    assert.equal(profile.requestedBridgeStyle, bridgeStyle);
    assert.equal(profile.automaticallySelected, false);
    assert.equal(profile.valid, true, JSON.stringify(profile.compatibility.errors));
    assert.equal(profile.compatibility.valid, true);
    assert.ok(profile.clearWidth >= profile.minimumRequiredClearWidth, bridgeStyle);
    assert.ok(profile.deckWidth > profile.clearWidth, bridgeStyle);
    assert.ok(profile.deckThickness > 0, bridgeStyle);
    assert.ok(profile.approachTaperLength > 0, bridgeStyle);
    assert.ok(profile.abutmentSeatLength > 0, bridgeStyle);
  }
});

test('automatic selection chooses a compatible family for each production span class', () => {
  const cases = [
    [{ span: 24, width: 2, vehicleClass: 'pedestrian' }, 'rope-footbridge'],
    [{ span: 10, width: 6, clearance: 1 }, 'masonry-causeway'],
    [{ span: 14, width: 4, clearance: 8 }, 'timber-trestle'],
    [{ span: 22, width: 7, clearance: 8 }, 'stone-arch'],
    [{ span: 44, width: 9, clearance: 8 }, 'steel-girder']
  ];

  for (const [options, expectedStyle] of cases) {
    const profile = resolve(options);
    assert.equal(profile.requestedBridgeStyle, 'auto');
    assert.equal(profile.automaticallySelected, true);
    assert.equal(profile.bridgeStyle, expectedStyle);
    assert.equal(profile.valid, true, JSON.stringify(profile.compatibility.errors));
  }
});

test('vehicular bridges preserve minimum safe clear width and report approach widening', () => {
  const mixed = resolve({ bridgeStyle: 'timber-trestle', span: 10, width: 1, vehicleClass: 'mixed' });
  assert.equal(mixed.valid, true);
  assert.ok(mixed.minimumRequiredClearWidth >= 3.2);
  assert.ok(mixed.clearWidth >= 3.2);
  assert.equal(mixed.deckWidth, mixed.clearWidth + PATH_BRIDGE_PROFILES['timber-trestle'].deckEdgeOverhang * 2);
  assert.ok(mixed.compatibility.warnings.some(({ code }) => code === 'approach-widening-required'));

  const heavy = resolve({ bridgeStyle: 'timber-trestle', span: 10, width: 2, vehicleClass: 'heavy' });
  assert.equal(heavy.valid, true);
  assert.ok(heavy.clearWidth >= 4);
});

test('deck thickness scales with span while retaining an authored structural minimum', () => {
  const short = resolve({ bridgeStyle: 'steel-girder', span: 12, width: 8 });
  const long = resolve({ bridgeStyle: 'steel-girder', span: 60, width: 8 });
  assert.equal(short.valid, true);
  assert.equal(long.valid, true);
  assert.ok(long.deckThickness > short.deckThickness);

  const authored = resolve({
    bridgeStyle: 'steel-girder',
    span: 12,
    width: 8,
    structureProfile: { deckThickness: 1.5 }
  });
  assert.ok(authored.deckThickness >= 1.5);
});

test('explicit incompatible selections remain visible and return actionable diagnostics', () => {
  const trafficMismatch = resolve({
    bridgeStyle: 'rope-footbridge',
    span: 20,
    width: 2,
    vehicleClass: 'mixed'
  });
  assert.equal(trafficMismatch.bridgeStyle, 'rope-footbridge');
  assert.equal(trafficMismatch.valid, false);
  assert.equal(trafficMismatch.compatibility.valid, false);
  assert.ok(trafficMismatch.compatibilityDiagnostics.some(diagnostic => (
    diagnostic.code === 'rope-footbridge-requires-pedestrian'
    && diagnostic.authoredStyle === 'rope-footbridge'
  )));

  const spanMismatch = resolve({ bridgeStyle: 'stone-arch', span: 40, width: 7 });
  assert.equal(spanMismatch.bridgeStyle, 'stone-arch');
  assert.equal(spanMismatch.valid, false);
  assert.ok(spanMismatch.compatibilityDiagnostics.some(diagnostic => (
    diagnostic.code === 'span-exceeds-maximum'
    && diagnostic.actual === 40
    && diagnostic.limit === 26
  )));

  const widthMismatch = resolve({ bridgeStyle: 'timber-trestle', span: 12, width: 8 });
  assert.equal(widthMismatch.bridgeStyle, 'timber-trestle');
  assert.equal(widthMismatch.valid, false);
  assert.ok(widthMismatch.compatibilityDiagnostics.some(diagnostic => (
    diagnostic.code === 'clear-width-exceeds-maximum'
    && diagnostic.actual > diagnostic.limit
    && diagnostic.authoredStyle === 'timber-trestle'
  )));
});
