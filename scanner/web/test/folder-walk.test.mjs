import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { folderStats, walkDirectory, walkFileList } from '../public/folder-walk.js';

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
