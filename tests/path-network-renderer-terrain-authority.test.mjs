import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePathNetwork } from '../app/path-network/model.js';
import { compileScenePathRuntimes, sampleScenePathTerrain } from '../app/path-network/runtime.js';
import { activePathChunkKeys, terrainMesh } from '../app/renderer.js';

function terrainFixture() {
  return {
    id: 'terrain-render-authority',
    type: 'terrain',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: {
      preset: 'rollingHills',
      seed: 73,
      height: 5,
      macroScale: 55,
      detailScale: 13,
      bounds: { minX: -43, maxX: 57, minZ: -47, maxZ: 53 },
      resolutionX: 48,
      resolutionZ: 52,
      chunkSize: 16
    }
  };
}

function pathFixture(mode, y = 8) {
  const network = normalizePathNetwork({
    id: `${mode}-render-authority`,
    nodes: [
      { id: 'a', position: [-28, y, 0], heightMode: 'absolute' },
      { id: 'b', position: [28, y, 0], heightMode: 'absolute' }
    ],
    segments: [{
      id: 'ab',
      fromNode: 'a',
      toNode: 'b',
      constructionMode: mode,
      constructionLocked: true
    }]
  });
  return {
    id: `${mode}-path`,
    type: 'path',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: { pathNetwork: network, pathNetworkSchemaVersion: 2 }
  };
}

function bytes(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

test('schema-v2 terrain never falls back to stale legacy point fields while compiled authority is unavailable', () => {
  const terrain = terrainFixture();
  const path = pathFixture('cut-fill', 10);
  Object.assign(path.properties, {
    points: [[-40, 0], [40, 0]],
    nodeElevations: [40, 40],
    width: 24,
    carveTerrain: true
  });
  const baseline = terrainMesh(structuredClone(terrain), [], []);
  const pending = terrainMesh(structuredClone(terrain), [path], []);
  assert.deepEqual(bytes(pending.positions), bytes(baseline.positions));
  assert.deepEqual(bytes(pending.blends), bytes(baseline.blends));
});

const EPSILON = 1e-7;
function areaXZ(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area * 0.5;
}

function clipPolygonXZ(subject, edgeStart, edgeEnd) {
  const output = [];
  const side = point => (
    (edgeEnd[0] - edgeStart[0]) * (point[1] - edgeStart[1])
    - (edgeEnd[1] - edgeStart[1]) * (point[0] - edgeStart[0])
  );
  for (let index = 0; index < subject.length; index += 1) {
    const current = subject[index];
    const next = subject[(index + 1) % subject.length];
    const currentSide = side(current);
    const nextSide = side(next);
    const currentInside = currentSide >= -EPSILON;
    const nextInside = nextSide >= -EPSILON;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const amount = currentSide / (currentSide - nextSide || 1);
      output.push([
        current[0] + (next[0] - current[0]) * amount,
        current[1] + (next[1] - current[1]) * amount
      ]);
    }
  }
  return output;
}

function triangleIntersectionXZ(left, right) {
  let result = areaXZ(left) < 0 ? [...left].reverse() : [...left];
  const clip = areaXZ(right) < 0 ? [...right].reverse() : right;
  for (let index = 0; index < clip.length && result.length >= 3; index += 1) {
    result = clipPolygonXZ(result, clip[index], clip[(index + 1) % clip.length]);
  }
  return Math.abs(areaXZ(result)) > EPSILON ? result : [];
}

function interpolateXZ(point, triangle, values) {
  const [a, b, c] = triangle;
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const first = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
  const second = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
  return values[0] * first + values[1] * second + values[2] * (1 - first - second);
}

function upwardPathSurfaces(runtime) {
  const result = [];
  for (const meshName of ['road', 'shoulder', 'gutter', 'sidewalk']) {
    const mesh = runtime.geometry.meshes[meshName];
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
      const indices = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
      const role = mesh.roles[indices[0]] || '';
      const vertices = indices.map(index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
      const ab = vertices[1].map((value, index) => value - vertices[0][index]);
      const ac = vertices[2].map((value, index) => value - vertices[0][index]);
      const normalY = ab[2] * ac[0] - ab[0] * ac[2];
      if (normalY <= EPSILON) continue;
      const points = vertices.map(point => [point[0], point[2]]);
      result.push({
        meshName,
        role,
        points,
        heights: vertices.map(point => point[1]),
        bounds: {
          minX: Math.min(...points.map(point => point[0])),
          maxX: Math.max(...points.map(point => point[0])),
          minZ: Math.min(...points.map(point => point[1])),
          maxZ: Math.max(...points.map(point => point[1]))
        }
      });
    }
  }
  return result;
}

function terrainSurfacePenetrations(mesh, surfaces, clearance = 0.001) {
  const failures = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const indices = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
    const vertices = indices.map(index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
    const points = vertices.map(point => [point[0], point[2]]);
    const bounds = {
      minX: Math.min(...points.map(point => point[0])),
      maxX: Math.max(...points.map(point => point[0])),
      minZ: Math.min(...points.map(point => point[1])),
      maxZ: Math.max(...points.map(point => point[1]))
    };
    for (const surface of surfaces) {
      if (
        surface.bounds.maxX < bounds.minX
        || surface.bounds.minX > bounds.maxX
        || surface.bounds.maxZ < bounds.minZ
        || surface.bounds.minZ > bounds.maxZ
      ) continue;
      const overlap = triangleIntersectionXZ(points, surface.points);
      for (const point of overlap) {
        const terrainY = interpolateXZ(point, points, vertices.map(vertex => vertex[1]));
        const surfaceY = interpolateXZ(point, surface.points, surface.heights);
        if (terrainY >= surfaceY - clearance) {
          failures.push({ point, terrainY, surfaceY, surface: `${surface.meshName}:${surface.role}`, terrainTriangleOffset: offset });
          if (failures.length >= 8) return failures;
        }
      }
    }
  }
  return failures;
}

function terrainCoversPointXZ(mesh, x, z) {
  const point = [x, z];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const triangle = [0, 1, 2].map(vertex => {
      const index = mesh.indices[offset + vertex];
      return [mesh.positions[index * 3], mesh.positions[index * 3 + 2]];
    });
    const signedArea = areaXZ(triangle);
    if (Math.abs(signedArea) <= EPSILON) continue;
    const oriented = signedArea < 0 ? [...triangle].reverse() : triangle;
    let inside = true;
    for (let edge = 0; edge < 3; edge += 1) {
      const start = oriented[edge];
      const end = oriented[(edge + 1) % 3];
      const side = (
        (end[0] - start[0]) * (point[1] - start[1])
        - (end[1] - start[1]) * (point[0] - start[0])
      );
      if (side < -EPSILON) {
        inside = false;
        break;
      }
    }
    if (inside) return true;
  }
  return false;
}

function curvedRoadBridgeFixture() {
  const terrain = terrainFixture();
  terrain.properties.seed = 17;
  terrain.properties.height = 14;
  terrain.properties.macroScale = 35;
  terrain.properties.detailScale = 10;
  terrain.properties.bounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };
  terrain.properties.resolutionX = 48;
  terrain.properties.resolutionZ = 48;
  const pathNetwork = normalizePathNetwork({
    id: 'curved-road-bridge-render-authority',
    nodes: [
      { id: 'a', position: [-34, 0, -16], heightMode: 'absolute' },
      { id: 'b', position: [0, 0, 14], heightMode: 'absolute' },
      { id: 'c', position: [34, 0, -12], heightMode: 'absolute' },
      { id: 'd', position: [-5, 0, -35], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b', constructionMode: 'cut-fill', constructionLocked: true },
      { id: 'bc', fromNode: 'b', toNode: 'c', constructionMode: 'bridge', constructionLocked: true },
      { id: 'db', fromNode: 'd', toNode: 'b', constructionMode: 'cut-fill', constructionLocked: true }
    ]
  });
  const path = {
    id: 'curved-road-bridge-path',
    type: 'path',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: { pathNetwork, pathNetworkSchemaVersion: 2 }
  };
  return { terrain, path };
}

test('renderer chunk-size remap includes the compiled junction polygon bounds', () => {
  const keys = activePathChunkKeys([{
    terrainModifier: {
      chunkSize: 64,
      terrainDirtyChunkKeys: ['0:0'],
      terrainEntries: [],
      junctionEntries: [{
        bounds: { minX: 31.5, maxX: 33.25, minZ: -17.5, maxZ: -14.5 }
      }]
    }
  }], 16);

  assert.deepEqual([...keys].sort(), ['1:-1', '1:-2', '2:-1', '2:-2']);
});

test('mixed construction classifies tunnel surfaces without terrain-modifier sampling', () => {
  const terrain = terrainFixture();
  terrain.properties.bounds = { minX: -60, maxX: 60, minZ: -40, maxZ: 40 };
  terrain.properties.resolutionX = 48;
  terrain.properties.resolutionZ = 32;
  const pathNetwork = normalizePathNetwork({
    id: 'mixed-visible-and-tunnel',
    nodes: [
      { id: 'a', position: [-50, 2, -10], heightMode: 'absolute' },
      { id: 'b', position: [-5, 2, -10], heightMode: 'absolute' },
      { id: 'c', position: [5, -5, 10], heightMode: 'absolute' },
      { id: 'd', position: [50, -5, 10], heightMode: 'absolute' }
    ],
    segments: [
      { id: 'ab', fromNode: 'a', toNode: 'b', constructionMode: 'cut-fill', constructionLocked: true },
      { id: 'cd', fromNode: 'c', toNode: 'd', constructionMode: 'tunnel', constructionLocked: true }
    ]
  });
  const path = {
    id: 'mixed-visible-and-tunnel-path',
    type: 'path',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    properties: { pathNetwork, pathNetworkSchemaVersion: 2 }
  };
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  assert.deepEqual(runtimes[0].compiled.segments.map(segment => segment.construction.mode), ['cut-fill', 'tunnel']);

  const mesh = terrainMesh(structuredClone(terrain), [path], runtimes);
  const clipping = terrainMesh.lastPathDetail.surfaceClipping;
  assert.ok(clipping.maskTriangleCount > 0, 'visible cut/fill surface was not indexed');
  assert.ok(clipping.constructionRejectedSurfaceTriangleCount > 0, 'tunnel travel surface was not rejected');
  assert.ok(clipping.constructionClassifierQueryCount > 0, 'mixed-mode classifier was not exercised');
  assert.ok(
    clipping.constructionClassifierPairTestCount <= clipping.constructionClassifierQueryCount * 64,
    'mixed-mode classification regressed to an unbounded station scan'
  );
  assert.equal([...mesh.positions, ...mesh.normals].every(Number.isFinite), true);
});

test('tunnel runtime preserves the exact authored terrain mesh', () => {
  const terrain = terrainFixture();
  const baseline = terrainMesh(structuredClone(terrain), [], []);
  const path = pathFixture('tunnel', -5);
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  assert.equal(runtimes[0].compiled.segments[0].construction.mode, 'tunnel');

  const candidate = terrainMesh(structuredClone(terrain), [path], runtimes);
  assert.equal(terrainMesh.lastPathDetail.strategy, 'authored-base-no-terrain-modifier');
  assert.equal(terrainMesh.lastPathDetail.highTileCount, 0);
  assert.equal(terrainMesh.lastPathDetail.boundaryStitches.triangleCount, 0);
  assert.equal(bytes(candidate.positions).equals(bytes(baseline.positions)), true, 'tunnel changed terrain positions');
  assert.equal(bytes(candidate.indices).equals(bytes(baseline.indices)), true, 'tunnel changed terrain topology');
  assert.equal(bytes(candidate.normals).equals(bytes(baseline.normals)), true, 'tunnel changed terrain normals');
  assert.equal(bytes(candidate.blends).equals(bytes(baseline.blends)), true, 'tunnel painted a duplicate terrain surface');
});

test('renderer consumes bridge portal-seat chunks while leaving the open span at authored terrain', () => {
  const terrain = terrainFixture();
  terrain.properties.height = 0;
  const path = pathFixture('bridge', 2);
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  const runtime = runtimes[0];
  assert.equal(runtime.compiled.segments[0].construction.mode, 'bridge');
  assert.ok(runtime.terrainModifier.terrainDirtyChunkKeys.length > 0);
  assert.equal(runtime.terrainModifier.terrainDirtyChunkKeys.some(key => key.startsWith('0:')), false);

  const center = sampleScenePathTerrain(runtimes, 0, 0, 0);
  const portal = sampleScenePathTerrain(runtimes, 0, -28, 0);
  assert.equal(center.constructionMode, 'bridge');
  assert.equal(center.influence, 0);
  assert.equal(center.height, 0);
  assert.equal(portal.constructionMode, 'bridge');
  assert.ok(portal.influence > 0.99);

  const mesh = terrainMesh(structuredClone(terrain), [path], runtimes);
  assert.equal(terrainMesh.lastPathDetail.strategy, 'watertight-chunks');
  assert.ok(terrainMesh.lastPathDetail.highTileCount > 0, 'portal terrain authority never reached the renderer');
  assert.equal(terrainMesh.lastPathDetail.surfaceClipping.clippedTriangleCount, 0);
  let openSpanVertices = 0;
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    if (Math.abs(x) > 10 || Math.abs(z) > 5) continue;
    openSpanVertices += 1;
    const authored = runtime.terrainService.elevationAt(x, z, { view: 'authored-natural' });
    assert.ok(Math.abs(y - authored) <= 1e-5, 'safe open-span terrain was removed or displaced');
  }
  assert.ok(openSpanVertices > 20, 'fixture must sample terrain below the open bridge span');
});

test('a structural bridge deck cannot subtract an unstitched hole from authored terrain', () => {
  const terrain = terrainFixture();
  terrain.properties.height = 0;
  const path = pathFixture('bridge', -2);
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  const runtime = runtimes[0];
  assert.equal(runtime.compiled.segments[0].construction.mode, 'bridge');
  assert.ok(runtime.geometry.meshes.structure.indices.length > 0, 'fixture must contain a structural bridge deck');
  assert.equal(runtime.geometry.meshes.road.indices.length, 0, 'fixture must isolate bridge structure from ordinary road clipping');

  const mesh = terrainMesh(structuredClone(terrain), [path], runtimes);
  const clipping = terrainMesh.lastPathDetail.surfaceClipping;
  assert.equal(clipping.maskTriangleCount, 0, 'bridge deck entered the subtractive terrain-mask authority');
  assert.equal(clipping.clippedTriangleCount, 0, 'bridge deck clipped authored terrain below the open span');
  assert.equal(clipping.removedTriangleCount, 0, 'bridge deck removed terrain without boundary closure topology');
  assert.equal(clipping.addedVertexCount, 0, 'bridge deck caused terrain-fragment topology to be generated');

  for (let x = -18; x <= 18; x += 3) {
    assert.equal(
      terrainCoversPointXZ(mesh, x, 0),
      true,
      `authored terrain coverage opened below the bridge at x=${x}`
    );
  }
});

test('compiled road surface exclusively owns path material above its terrain underlay', () => {
  const terrain = terrainFixture();
  terrain.properties.height = 0;
  const path = pathFixture('cut-fill', 2);
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  const mesh = terrainMesh(structuredClone(terrain), [path], runtimes);
  const runtime = runtimes[0];

  assert.ok(runtime.geometry.meshes.road.indices.length > 0, 'the compiled road surface must exist');
  assert.equal(Math.max(...mesh.blends), 0, 'supporting terrain must not render a second road material');

  let ownedRoadVertices = 0;
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    const sample = sampleScenePathTerrain(runtimes, 0, x, z);
    if (!sample.terrainApplied || sample.zone !== 'road') continue;
    ownedRoadVertices += 1;
    assert.ok(
      y <= sample.surfaceHeight - 0.004,
      `terrain intruded above road ownership at ${x}, ${z}: terrain ${y}, road ${sample.surfaceHeight}`
    );
  }
  assert.ok(ownedRoadVertices > 20, 'fixture must exercise a meaningful road-underlay area');
});

test('duplicate terrain chunk-boundary vertices share height and welded normals', () => {
  const terrain = terrainFixture();
  terrain.properties.height = 8;
  const path = pathFixture('cut-fill', 1.5);
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  const mesh = terrainMesh(structuredClone(terrain), [path], runtimes);
  const groups = new Map();

  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    const key = `${x.toFixed(5)}:${z.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      y,
      normal: [mesh.normals[index * 3], mesh.normals[index * 3 + 1], mesh.normals[index * 3 + 2]]
    });
  }

  let sharedBoundaryCount = 0;
  for (const values of groups.values()) {
    if (values.length < 2) continue;
    sharedBoundaryCount += 1;
    const reference = values[0];
    for (const value of values.slice(1)) {
      assert.ok(Math.abs(value.y - reference.y) <= 0.005, 'shared chunk boundary opened vertically');
      assert.ok(Math.hypot(
        value.normal[0] - reference.normal[0],
        value.normal[1] - reference.normal[1],
        value.normal[2] - reference.normal[2]
      ) <= 1e-6, 'shared chunk boundary retained a lighting seam');
    }
  }
  assert.ok(sharedBoundaryCount > 20, 'fixture must cross multiple duplicated chunk boundaries');
  assert.equal([...mesh.normals].every(Number.isFinite), true);
});

test('steep noisy road surfaces clip penetration without degenerate terrain while bridge terrain remains intact', () => {
  const { terrain, path } = curvedRoadBridgeFixture();
  const scene = { settings: { worldChunkSize: 16 }, objects: [terrain, path] };
  const runtimes = compileScenePathRuntimes(scene);
  const runtime = runtimes[0];
  assert.equal(runtime.diagnostics.valid, true, runtime.diagnostics.geometry.errors.join(' '));
  assert.ok(runtime.geometry.junctions.length > 0, 'fixture must include a compiled junction');
  assert.ok(runtime.geometry.bridgeSelections.length > 0, 'fixture must include a compiled bridge portal');

  const mesh = terrainMesh(structuredClone(terrain), [path], runtimes);
  const clipping = terrainMesh.lastPathDetail.surfaceClipping;
  assert.ok(clipping.maskTriangleCount > 0);
  assert.ok(clipping.clippedTriangleCount > 0, 'intruding terrain fixture did not exercise topology clipping');
  assert.ok(
    clipping.outputTriangleCount <= clipping.inputTriangleCount * 1.25,
    `terrain clipping exploded triangle count: ${clipping.inputTriangleCount} -> ${clipping.outputTriangleCount}`
  );
  assert.deepEqual(
    terrainMesh.lastPathDetail.boundaryStitches,
    { vertexCount: 0, triangleCount: 0, maximumWidth: 0 }
  );

  const penetrations = terrainSurfacePenetrations(mesh, upwardPathSurfaces(runtime));
  assert.deepEqual(penetrations, [], `terrain penetrated an ordinary road surface: ${JSON.stringify(penetrations)}`);
  assert.equal([...mesh.positions, ...mesh.normals].every(Number.isFinite), true);
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const points = [0, 1, 2].map(vertex => {
      const index = mesh.indices[offset + vertex];
      return Array.from(mesh.positions.slice(index * 3, index * 3 + 3));
    });
    const ab = points[1].map((value, index) => value - points[0][index]);
    const ac = points[2].map((value, index) => value - points[0][index]);
    assert.ok(Math.hypot(
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ) > 1e-8, 'terrain clipping emitted a zero-area triangle');
  }
});
