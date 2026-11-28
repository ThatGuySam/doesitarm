import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { FolderCrashGuardError, folderCrashGuard, folderStats, walkDirectory, walkFileList } from '../public/folder-walk.js';

const thin = await readFile(new URL('../../fixtures/thin.macho', import.meta.url));

function directory(name, ...children) {
  return {
    name,
    isDirectory: true,
    createReader() {
      let offset = 0;
      return { readEntries: (callback) => callback(children.slice(offset, offset += 100)) };
    },
  };
}

test('legacy directory entries only open snapshots for possible binaries', async () => {
  const opened = [];
  function entry(name, content) {
    const file = new File([content], name);
    return {
      name,
      getMetadata: (callback) => callback({ size: file.size }),
      file(callback) {
        opened.push(name);
        callback(file);
      },
    };
  }
  const assets = Array.from({ length: 250 }, (_, index) => entry(`${index}.dat`, ''));
  const root = directory('Applications', directory('Suite.app', directory('Contents',
    entry('Info.plist', 'metadata'), directory('MacOS', entry('Suite', thin), entry('Helper', thin)),
    directory('Resources', ...assets))));
  const stats = folderStats('webkitGetAsEntry');
  const jobs = [];
  await walkDirectory(root, 'entry', { stats, onJob: (job) => jobs.push(job) });
  assert.equal(stats.files_seen, 253);
  assert.equal(stats.directories_seen, 5);
  const [app] = jobs;
  assert.equal(jobs.length, 1);
  assert.deepEqual(app.artifacts.map(({ label }) => label), [
    'Applications/Suite.app/Contents/MacOS/Suite', 'Applications/Suite.app/Contents/MacOS/Helper',
  ]);
  assert.deepEqual(opened, ['Suite', 'Helper']);
  assert.ok(app.artifacts.every((job) => !job.file && typeof job.openFile === 'function'));
  assert.equal((await app.getExecutable('Contents/MacOS/Suite')).size, thin.length);
  assert.deepEqual(opened, ['Suite', 'Helper', 'Suite']);
  assert.equal(await (await app.getPlist()).text(), 'metadata');
});

test('FileList discovery handles interleaved folders and preserves nested parent paths', async () => {
  function file(path, content) {
    const selected = new File([content], path.split('/').at(-1));
    Object.defineProperty(selected, 'webkitRelativePath', { value: path });
    return selected;
  }
  const parent = 'Applications/Suite.app';
  const child = `${parent}/Contents/Helpers/Companion.app`;
  const selected = [file(`${parent}/Contents/Info.plist`, 'outer'), file(`${child}/Info.plist`, 'inner'),
    file(`${parent}/Contents/MacOS/Independent`, thin), file(`${child}/Companion`, thin)];
  const stats = folderStats('webkitdirectory');
  const jobs = [];
  await walkFileList(selected, { stats, onJob: (job) => jobs.push(job) });
  assert.deepEqual(jobs.map(({ label }) => label), [parent, child]);
  assert.equal(jobs[1].parentBundlePath, parent);
  assert.equal(stats.folder_name, 'Applications');
  assert.equal(stats.files_seen, 4);
  assert.equal((await jobs[0].getExecutable('Contents/MacOS/Independent')).size, thin.length);
  assert.equal((await jobs[1].getExecutable('Companion')).size, thin.length);
});

test('the entries crash guard counts known skips and keeps completed apps and pending loose binaries', async () => {
  const opens = [];
  function entry(name) {
    return {
      name,
      file(callback) {
        opens.push(name);
        callback(new File([thin], name));
      },
    };
  }
  const root = directory('Applications', directory('Done.app'), entry('standalone'),
    directory('Unfinished.app', entry('never-opened'), entry('also-skipped')), directory('Skipped.app'));
  const stats = folderStats('webkitGetAsEntry');
  const jobs = [];
  await assert.rejects(walkDirectory(root, 'entry', {
    stats,
    crashGuard: folderCrashGuard(stats, { entries: 4, appBundles: 100 }),
    onJob: (job) => jobs.push(job.label),
  }), (error) => error instanceof FolderCrashGuardError && error.limit === 4 && error.unfinishedApps === 1);
  assert.deepEqual(jobs, ['Applications/Done.app', 'Applications/standalone']);
  assert.deepEqual(opens, ['standalone']);
  assert.equal(stats.files_seen + stats.directories_seen, 4);
  assert.equal(stats.partial, true);
  assert.equal(stats.skipped_entries.browser_crash_guard, 3);
  assert.deepEqual(stats.skip_examples, [{ path: 'Applications/Unfinished.app/never-opened', reason: 'browser_crash_guard' }]);
});

test('the bundle crash guard spans dropped roots and accepts the exact limit', async () => {
  const stats = folderStats('webkitGetAsEntry');
  const jobs = [];
  const crashGuard = folderCrashGuard(stats, { entries: 100, appBundles: 2 });
  const options = { stats, crashGuard, onJob: (job) => jobs.push(job.label) };
  await walkDirectory(directory('One.app'), 'entry', options);
  await walkDirectory(directory('Folder', directory('Two.app')), 'entry', options);
  assert.equal(stats.partial, undefined);
  await assert.rejects(walkDirectory(directory('Three.app'), 'entry', options),
    { name: 'Error', limit: 2, units: 'app bundles' });
  assert.deepEqual(jobs, ['One.app', 'Folder/Two.app']);
});
