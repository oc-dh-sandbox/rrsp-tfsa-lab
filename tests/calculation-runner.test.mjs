import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalculationRunner } from '../calculation-runner.js';

function harness(options = {}) {
  let sequence = 0;
  const timers = new Map(), workers = [], results = [], errors = [], inputs = [];
  const runner = createCalculationRunner({
    createWorker() {
      if (options.constructorError) throw new Error('Worker blocked');
      if (options.unsupported) return null;
      const worker = {
        terminated: false,
        postMessage(message) { this.message = message; if (options.postError) throw new Error('Cannot post'); },
        terminate() { this.terminated = true; }
      };
      workers.push(worker); return worker;
    },
    calculate(settings) {
      inputs.push(settings);
      if (options.calculateError) throw new Error('Model failure');
      return { value: settings.budget };
    },
    onResult: result => results.push(result), onError: error => errors.push(error),
    schedule(fn, delay) { timers.set(++sequence, { fn, delay }); return sequence; },
    unschedule: id => timers.delete(id)
  });
  function tick(delay) {
    const entry = [...timers].find(([, task]) => task.delay === delay);
    assert.ok(entry, `Expected timer at ${delay}ms`);
    timers.delete(entry[0]); entry[1].fn();
  }
  return { runner, timers, workers, results, errors, inputs, tick };
}

test('completed workers are terminated; late errors cannot invalidate success', () => {
  const h = harness(); h.runner.start({ budget: 7 });
  const worker = h.workers[0], lateError = worker.onerror, lateMessage = worker.onmessage;
  worker.onmessage({ data: { id: worker.message.id, result: { value: 7 } } });
  assert.equal(worker.terminated, true); assert.equal(worker.onmessage, null);
  assert.equal(h.timers.size, 0);
  lateError({ message: 'Script error.', preventDefault() {} });
  lateMessage({ data: { id: worker.message.id, error: 'Too late' } });
  assert.deepEqual(h.results, [{ value: 7 }]); assert.equal(h.errors.length, 0);
  assert.equal(h.inputs.length, 0); assert.equal(h.timers.size, 0);
});

for (const option of ['unsupported', 'constructorError', 'postError']) {
  test(`${option} falls back with an immutable input snapshot`, () => {
    const h = harness({ [option]: true }), settings = { budget: 7 };
    h.runner.start(settings); settings.budget = 99;
    h.tick(0);
    assert.deepEqual(h.inputs, [{ budget: 7 }]); assert.deepEqual(h.results, [{ value: 7 }]);
    assert.equal(h.errors.length, 0); assert.equal(h.timers.size, 0);
    assert.ok(h.workers.every(w => w.terminated));
  });
}

for (const event of ['onerror', 'onmessageerror']) {
  test(`${event} recovers once, ignoring queued replies and avoiding broken-worker retry loops`, () => {
    const h = harness(); h.runner.start({ budget: 7 });
    const worker = h.workers[0], error = worker[event], message = worker.onmessage;
    error({ preventDefault() {} }); error({ preventDefault() {} });
    message({ data: { id: worker.message.id, result: { value: 999 } } });
    assert.equal(worker.terminated, true);
    assert.equal(h.timers.size, 1); h.tick(0);
    assert.deepEqual(h.results, [{ value: 7 }]);
    h.runner.start({ budget: 11 }); h.tick(0);
    assert.equal(h.workers.length, 1);
    assert.deepEqual(h.results, [{ value: 7 }, { value: 11 }]); assert.equal(h.errors.length, 0);
  });
}

test('unresponsive and unreadable worker replies have a bounded same-model fallback', () => {
  for (const malformed of [false, true]) {
    const h = harness(); h.runner.start({ budget: 7 });
    const worker = h.workers[0];
    if (malformed) worker.onmessage({ data: { id: worker.message.id } });
    else h.tick(15000);
    h.tick(0);
    assert.deepEqual(h.results, [{ value: 7 }]); assert.equal(h.errors.length, 0);
    assert.equal(h.timers.size, 0); assert.equal(worker.terminated, true);
  }
});

test('worker model errors remain genuine failures, not fabricated recovery successes', () => {
  const h = harness(); h.runner.start({ budget: 7 });
  const worker = h.workers[0];
  worker.onmessage({ data: { id: worker.message.id, error: 'Model failure' } });
  assert.equal(h.errors[0].message, 'Model failure'); assert.equal(h.errors.length, 1);
  assert.equal(h.results.length, 0); assert.equal(h.inputs.length, 0); assert.equal(h.timers.size, 0);
});

test('fallback model exceptions fail once and a later explicit retry can succeed', () => {
  const options = { unsupported: true, calculateError: true }, h = harness(options);
  h.runner.start({ budget: 7 }); h.tick(0);
  assert.equal(h.errors[0].message, 'Model failure'); assert.equal(h.results.length, 0);
  options.calculateError = false;
  h.runner.start({ budget: 7 }); h.tick(0);
  assert.deepEqual(h.results, [{ value: 7 }]); assert.equal(h.errors.length, 1);
  assert.equal(h.timers.size, 0);
});

test('canceled worker errors/results cannot change a newer job or its worker availability', () => {
  const h = harness(); h.runner.start({ budget: 7 });
  const old = h.workers[0], lateError = old.onerror, lateMessage = old.onmessage;
  h.runner.cancel(); h.runner.start({ budget: 11 });
  lateError({ message: 'Script error.', preventDefault() {} });
  lateMessage({ data: { id: old.message.id, result: { value: 7 } } });
  lateMessage({ data: { id: old.message.id, error: 'Old failure' } });
  const latest = h.workers[1];
  latest.onmessage({ data: { id: old.message.id, result: { value: 7 } } });
  assert.equal(h.results.length, 0); assert.equal(h.errors.length, 0);
  latest.onmessage({ data: { id: latest.message.id, result: { value: 11 } } });
  assert.deepEqual(h.results, [{ value: 11 }]);
  h.runner.start({ budget: 12 }); assert.equal(h.workers.length, 3);
  h.runner.cancel(); assert.equal(h.timers.size, 0);
});

test('cancel also invalidates an already queued main-thread fallback', () => {
  const h = harness({ unsupported: true }); h.runner.start({ budget: 7 });
  const queued = [...h.timers.values()][0].fn;
  h.runner.cancel(); h.runner.start({ budget: 11 });
  queued(); h.tick(0);
  assert.deepEqual(h.inputs, [{ budget: 11 }]); assert.deepEqual(h.results, [{ value: 11 }]);
  assert.equal(h.errors.length, 0); assert.equal(h.timers.size, 0);
});
