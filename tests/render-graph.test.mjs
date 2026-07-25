import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderGraph } from '../app/render-graph.js';

function graph() {
  return new RenderGraph({ gl: null, gpuSampleInterval: 1 });
}

test('RenderGraph compiles stable dependency order and resource contracts', () => {
  const order = [];
  const renderGraph = graph();
  renderGraph.importResource('scene', { id: 'scene' });
  renderGraph.addPass({ name: 'shadow', reads: ['scene'], writes: ['shadow-map'], execute: () => order.push('shadow') });
  renderGraph.addPass({ name: 'environment', after: ['shadow'], reads: ['scene'], writes: ['scene-color'], execute: () => order.push('environment') });
  renderGraph.addPass({ name: 'opaque', after: ['environment'], reads: ['scene-color', 'shadow-map'], writes: ['scene-color'], execute: () => order.push('opaque') });
  assert.deepEqual(renderGraph.compile(), ['shadow', 'environment', 'opaque']);
  const report = renderGraph.execute({});
  assert.deepEqual(order, ['shadow', 'environment', 'opaque']);
  assert.deepEqual(report.passes.map(pass => pass.status), ['ok', 'ok', 'ok']);
  assert.ok(report.totalCpuMs >= 0);
  assert.equal(renderGraph.diagnosticsSnapshot().resources.find(resource => resource.name === 'scene-color')?.descriptor.producer, 'opaque');
});

test('RenderGraph rejects dependency cycles', () => {
  const renderGraph = graph();
  renderGraph.addPass({ name: 'a', after: ['b'], execute() {} });
  renderGraph.addPass({ name: 'b', after: ['a'], execute() {} });
  assert.throws(() => renderGraph.compile(), /dependency cycle/i);
});

test('RenderGraph rejects missing pass dependencies', () => {
  const renderGraph = graph();
  renderGraph.addPass({ name: 'opaque', after: ['missing'], execute() {} });
  assert.throws(() => renderGraph.compile(), /missing pass/i);
});

test('RenderGraph rejects reads before import or production', () => {
  const renderGraph = graph();
  renderGraph.addPass({ name: 'opaque', reads: ['scene-color'], execute() {} });
  assert.throws(() => renderGraph.compile(), /reads "scene-color" before/i);
});

test('disabled passes are reported and not executed', () => {
  let executed = false;
  const renderGraph = graph();
  renderGraph.importResource('scene', {});
  renderGraph.addPass({ name: 'shadow', reads: ['scene'], writes: ['shadow-map'], enabled: false, execute: () => { executed = true; } });
  const report = renderGraph.execute({});
  assert.equal(executed, false);
  assert.equal(report.passes[0].status, 'disabled');
});

test('noncritical pass failures are contained and later passes continue', () => {
  const order = [];
  const renderGraph = graph();
  renderGraph.importResource('scene-color', null);
  renderGraph.addPass({ name: 'optional', reads: ['scene-color'], writes: ['telemetry'], critical: false, execute: () => { throw new Error('optional failure'); } });
  renderGraph.addPass({ name: 'after', after: ['optional'], reads: ['scene-color'], execute: () => order.push('after') });
  const report = renderGraph.execute({});
  assert.equal(report.passes[0].status, 'error');
  assert.match(report.passes[0].error.message, /optional failure/);
  assert.deepEqual(order, ['after']);
});

test('critical pass failures propagate with a partial diagnostic report', () => {
  const renderGraph = graph();
  renderGraph.addPass({ name: 'critical', execute: () => { throw new Error('critical failure'); } });
  assert.throws(() => renderGraph.execute({}), /critical failure/);
  assert.equal(renderGraph.lastReport.passes[0].status, 'error');
});

test('RenderGraph suspend and resume preserve explicit frame status', () => {
  let executions = 0;
  const renderGraph = graph();
  renderGraph.addPass({ name: 'frame', execute: () => { executions += 1; } });
  renderGraph.suspend('context-lost');
  const suspended = renderGraph.execute({});
  assert.equal(suspended.suspended, true);
  assert.equal(suspended.reason, 'context-lost');
  assert.equal(executions, 0);
  renderGraph.resume();
  const resumed = renderGraph.execute({});
  assert.equal(resumed.suspended, false);
  assert.equal(executions, 1);
});
