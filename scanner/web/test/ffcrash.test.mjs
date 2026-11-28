import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';
import { FOLDER_CRASH_GUARD, FolderCrashGuardError, folderCrashGuard, folderStats, walkDirectory } from '../public/folder-walk.js';

// Firefox on macOS crashed when a 300,000-file Applications folder went
// through <input webkitdirectory>: the browser builds one File per file in its
// parent process before any page code runs. These tests pin the two halves of
// the fix: no page path may ask the browser for the whole recursive list, and
// the lazy walker must keep only per-bundle state while it reads the tree.
v8.setFlagsFromString('--expose-gc');
const collect = vm.runInNewContext('gc');

const pagePath = (name) => new URL(`../public/${name}`, import.meta.url);

test('the page never offers a recursive webkitdirectory input', async () => {
  for (const name of ['index.html', 'local-inputs.js', 'app.js']) {
    assert.doesNotMatch(await readFile(pagePath(name), 'utf8'), /webkitdirectory/i, name);
  }
});

const BUNDLES = 169;
const FILES = 300_000;

// A lazy handle tree: nothing exists until the walker asks for it.
function lazyApplications(stats) {
  const perBundle = Math.floor(FILES / BUNDLES);
  const file = (name, size) => ({
    kind: 'file', name,
    async getFile() {
      stats.opened += 1;
      return { size, name, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) };
    },
  });
  const directory = (name, values) => ({
    kind: 'directory', name,
    async *values() { yield* values(); },
  });
  return directory('Applications', async function* () {
    for (let app = 0; app < BUNDLES; app += 1) {
      const count = (app === BUNDLES - 1 ? FILES - perBundle * (BUNDLES - 1) : perBundle) - 1;
      yield directory(`Product ${app}.app`, async function* () {
        yield directory('Contents', async function* () {
          yield file('Info.plist', 64);
          for (let group = 0; group * 1000 < count; group += 1) {
            yield directory(`Resources${group}`, async function* () {
              for (let index = 0; index < Math.min(1000, count - group * 1000); index += 1) {
                yield file(`asset-${index}.dat`, 1);
              }
            });
          }
        });
      });
    }
  });
}

test('a 300,000-file, 169-bundle walk keeps per-bundle state only', { timeout: 120_000 }, async () => {
  const counts = { opened: 0 };
  const stats = folderStats('handle');
  const jobs = [];
  let peak = 0;
  collect();
  const before = process.memoryUsage().heapUsed;
  await walkDirectory(lazyApplications(counts), 'handle', {
    stats,
    onJob(job) {
      // The UI keeps counts and a small row per bundle, not file references.
      jobs.push({ kind: job.kind, label: job.label, artifacts: job.artifacts?.length });
    },
    onProgress() { peak = Math.max(peak, process.memoryUsage().heapUsed - before); },
  });
  collect();
  const retained = process.memoryUsage().heapUsed - before;
  assert.equal(stats.files_seen, FILES);
  assert.equal(jobs.filter(({ kind }) => kind === 'bundle').length, BUNDLES);
  assert.ok(jobs.every(({ artifacts }) => !artifacts));
  assert.ok(retained < 32 * 1024 * 1024, `retained ${(retained / 1048576).toFixed(1)} MiB after the walk`);
  assert.ok(peak < 192 * 1024 * 1024, `peak ${(peak / 1048576).toFixed(1)} MiB during the walk`);
});

test('the default crash guard stops the 300,000-file fixture at 100,000 entries', { timeout: 30_000 }, async () => {
  const counts = { opened: 0 };
  const stats = folderStats('handle');
  let completeApps = 0;
  await assert.rejects(walkDirectory(lazyApplications(counts), 'handle', {
    stats,
    crashGuard: folderCrashGuard(stats),
    onJob(job) { if (job.kind === 'bundle') completeApps += 1; },
  }), (error) => error instanceof FolderCrashGuardError && error.limit === 100_000);
  assert.equal(stats.files_seen + stats.directories_seen, 100_000);
  assert.ok(counts.opened < 100_000);
  assert.ok(completeApps > 0 && completeApps < FOLDER_CRASH_GUARD.appBundles);
});
