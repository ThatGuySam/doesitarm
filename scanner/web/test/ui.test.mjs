import assert from 'node:assert/strict';
import test from 'node:test';
import { scanMode } from '../public/scan-mode.js';
import { estimateBatch, estimateRemaining, formatDuration, recordSample } from '../public/scan-progress.js';
import { ScanPool } from '../public/worker-pool.js';
import { verdict } from '../public/scan-view.js';
import { summarizeInventory } from '../public/scan-result.js';

const foreground = { limit: 3, passive: false };
const gentle = { limit: 1, passive: true };
const file = (size) => ({ kind: 'file', file: { size } });
const flush = () => new Promise(setImmediate);

class FakeWorker extends EventTarget {
  messages = [];
  terminated = false;

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

function scenario(t, mode = foreground) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = [];
  const pool = new ScanPool(mode, () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const events = [];
  return {
    pool, workers, events,
    submit: (id, job) => pool.submit(id, job, (event) => events.push([id, event.type])),
  };
}

const starts = (events) => events.filter(([, event]) => event === 'start').map(([id]) => id);

test('automatic mode leaves two cores free when possible and caps concurrency', () => {
  const policy = { visible: true, focused: true, gentle: false, conserve: false };
  for (const [cores, limit] of [[undefined, 1], [1, 1], [2, 1], [3, 1], [4, 2], [8, 6], [128, 6]]) {
    assert.deepEqual(scanMode({ ...policy, cores }), { passive: false, limit });
  }
  assert.deepEqual(scanMode({ ...policy, cores: 8, visible: false }), { passive: true, limit: 2 });
  assert.deepEqual(scanMode({ ...policy, cores: 4, focused: false }), gentle);
  assert.deepEqual(scanMode({ ...policy, cores: 8, gentle: true }), gentle);
  assert.deepEqual(scanMode({ ...policy, cores: 8, conserve: true }), gentle);
});

test('parallel slots take stable smallest-first work and reuse idle workers', async (t) => {
  const { events, submit, workers } = scenario(t);
  submit(1, file(500));
  submit(2, file(20));
  submit(3, { kind: 'url' });
  submit(4, file(20));
  submit(5, { kind: 'bundle', size: 120, getPlist: async () => ({ size: 30 }) });
  submit(6, { kind: 'url' });
  await flush();
  assert.deepEqual(starts(events), [2, 4, 5]);
  assert.equal(workers.length, 3);
  assert.deepEqual(workers.map((worker) => worker.messages[0]?.id), [2, 4, 5]);

  workers[1].emit({ id: 999, type: 'done' });
  assert.equal(events.length, 3);
  workers[0].emit({ id: 2, type: 'done' });
  workers[1].emit({ id: 4, type: 'done' });
  workers[2].emit({ id: 5, type: 'done' });
  await flush();
  assert.deepEqual(starts(events), [2, 4, 5, 1, 3, 6]);
  assert.equal(workers.length, 3);

  for (const [index, id] of [1, 3, 6].entries()) workers[index].emit({ id, type: 'done' });
  t.mock.timers.tick(9999);
  assert.ok(workers.every((worker) => !worker.terminated));
  t.mock.timers.tick(1);
  assert.ok(workers.every((worker) => worker.terminated));
});

test('downshift drains running jobs, upshift fills new slots, and both notify active workers', async (t) => {
  const { pool, events, submit, workers } = scenario(t);
  for (let id = 1; id <= 7; id++) submit(id, file(id));
  await flush();

  pool.setMode(gentle);
  await flush();
  assert.deepEqual(starts(events), [1, 2, 3]);
  for (const worker of workers) {
    assert.equal(worker.terminated, false);
    assert.deepEqual(worker.messages.at(-1), { type: 'mode', passive: true });
  }

  for (const id of [1, 2]) workers[id - 1].emit({ id, type: 'done' });
  await flush();
  assert.deepEqual(starts(events), [1, 2, 3]);
  assert.ok(workers[0].terminated && workers[1].terminated);
  workers[2].emit({ id: 3, type: 'done' });
  await flush();
  assert.equal(workers[2].messages.at(-1).id, 4);
  assert.equal(workers[2].messages.at(-1).passive, true);

  pool.setMode(foreground);
  await flush();
  assert.deepEqual(starts(events), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(workers[2].messages.at(-1), { type: 'mode', passive: false });
});

test('cancel removes queued tasks, replaces a running worker, and leaves no work after Cancel all', async (t) => {
  const { pool, events, submit, workers } = scenario(t, gentle);
  for (let id = 1; id <= 4; id++) submit(id, file(id));
  await flush();
  pool.cancel(2);
  pool.cancel(1);
  workers[0].emit({ id: 1, type: 'done' });
  await flush();

  assert.deepEqual(events, [[1, 'start'], [2, 'canceled'], [1, 'canceled'], [3, 'start']]);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].messages[0].id, 3);
  pool.cancelAll();
  await flush();
  assert.deepEqual(events.slice(-2), [[4, 'canceled'], [3, 'canceled']]);
  assert.equal(workers[1].terminated, true);
  assert.equal(workers.length, 2);
  submit(5, file(5));
  await flush();
  assert.equal(workers[2].messages[0].id, 5);
});

test('cancel suppresses late messages from async bundle lookups', async (t) => {
  const { pool, submit, workers } = scenario(t, gentle);
  const plist = Promise.withResolvers();
  submit(1, { kind: 'bundle', getPlist: () => plist.promise });
  await flush();
  pool.cancel(1);
  plist.resolve({});
  await flush();
  assert.deepEqual(workers[0].messages, []);

  const binary = Promise.withResolvers();
  submit(2, { kind: 'bundle', getPlist: async () => ({}), getExecutable: () => binary.promise });
  await flush();
  workers[1].emit({ id: 2, type: 'executable-needed', name: 'Test' });
  pool.cancel(2);
  binary.resolve({});
  await flush();
  assert.equal(workers[1].messages.length, 1);
});

test('a crashed worker reports a failure and the queue continues', async (t) => {
  const { events, workers, submit } = scenario(t, gentle);
  submit(1, file(1));
  submit(2, file(2));
  await flush();
  workers[0].dispatchEvent(new Event('error'));
  await flush();
  assert.deepEqual(events, [[1, 'start'], [1, 'done'], [2, 'start']]);
  assert.ok(workers[0].terminated);
  assert.equal(workers[1].messages[0].id, 2);
});

test('timer formats minute and hour boundaries and floors partial seconds', () => {
  assert.equal(formatDuration(-1000), '0:00');
  assert.equal(formatDuration(4999), '0:04');
  assert.equal(formatDuration(83000), '1:23');
  assert.equal(formatDuration(3723000), '1:02:03');
});

test('ETA requires known remaining work and at least two seconds of stable, recent reads', () => {
  const samples = [
    { now: 0, bytes: 100 },
    { now: 1000, bytes: 800 },
    { now: 2000, bytes: 1600 },
  ];
  assert.equal(estimateRemaining(samples, 2000, 1600, 3100), 2000);
  assert.equal(estimateRemaining(samples, 2000, 1600, 1601), 1000);
  assert.equal(estimateRemaining(samples, 2000, 1600, null), null);
  assert.equal(estimateRemaining(samples, 2000, 1600, 1600), null);
  assert.equal(estimateRemaining(samples.slice(1), 2000, 1600, 3100), null);
  assert.equal(estimateRemaining(samples, 3501, 1600, 3100), null);
  assert.equal(recordSample(samples, 3000, 1600), samples);
  assert.equal(estimateRemaining(recordSample(samples, 3000, 5600), 3000, 5600, 7600), null);
  assert.equal(recordSample(samples, 2000, 1700), samples);
  assert.deepEqual(recordSample(samples, 5000, 1900).map(({ now }) => now), [1000, 2000, 5000]);
});

test('batch ETA requires all outstanding scans to be running with usable estimates', () => {
  assert.equal(estimateBatch(0, [4000, 7000]), 7000);
  assert.equal(estimateBatch(1, [4000, 7000]), null);
  assert.equal(estimateBatch(0, [4000, null]), null);
  assert.equal(estimateBatch(0, []), null);
});

test('a universal launcher headline scopes the observed slices to the launcher', () => {
  const architectures = ['arm64', 'x86_64'].map((name) => ({ name, header_verified: true }));
  const binaries = [
    { path: 'Contents/MacOS/Launcher', role: 'main', architectures },
    { path: 'Contents/jbr/Contents/Home/bin/java', role: 'runtime', architectures: [architectures[1]] },
  ];
  const inventory = summarizeInventory(binaries, 'Some components were unavailable');
  const result = { status: 'complete', bundle_path: 'Fixture.app', architectures, inventory };
  assert.equal(inventory.has_x86_64_only, true);
  assert.equal(inventory.all_arm64_capable, false);
  assert.equal(inventory.binaries.length, 2);
  assert.equal(verdict(result).text, 'Apple Silicon native launcher (Universal)');
});

test('legacy i386 and PowerPC slices do not get a Rosetta verdict', () => {
  const architectures = ['i386', 'ppc'].map((name) => ({ name, header_verified: true }));
  const result = { status: 'complete', bundle_path: 'LaTeXiT.app', architectures };
  assert.equal(verdict(result).text, 'Legacy 32-bit Intel and PowerPC');
});

test('the wrapper layout alone does not give a native macOS verdict', () => {
  const result = {
    status: 'complete',
    bundle_path: 'Outer.app/Wrapper/Inner.app',
    wrapper_path: 'Outer.app',
    architectures: [{ name: 'arm64', header_verified: true }],
  };
  assert.equal(verdict(result).text, 'Wrapped app · Arm launcher');
});
