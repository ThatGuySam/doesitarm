import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { folderStats, walkDirectory } from '../public/folder-walk.js';
import { pluginVerdict } from '../public/plugin-result.js';
import { ScanPool } from '../public/worker-pool.js';

const directory = (name, ...children) => {
  const members = new Map(children.map((entry) => [entry.name, entry]));
  function lookup(member) {
    if (!members.has(member)) throw new DOMException('Missing fixture', 'NotFoundError');
    return members.get(member);
  }
  return {
    kind: 'directory', name,
    async *values() { yield* members.values(); },
    async getDirectoryHandle(member) { return lookup(member); },
    async getFileHandle(member) { return lookup(member); },
  };
};
function legacy(handle) {
  const isDirectory = handle.kind === 'directory';
  return {
    isDirectory, name: handle.name,
    createReader() {
      const children = handle.values();
      return { readEntries: (resolve, reject) => children.next().then(({ value, done }) => {
        resolve(done ? [] : [legacy(value)]);
      }, reject) };
    },
    getDirectory: (name, _options, resolve, reject) => handle.getDirectoryHandle(name).then(
      (entry) => resolve(legacy(entry)), reject),
    getFile: (name, _options, resolve, reject) => handle.getFileHandle(name).then(
      (entry) => resolve(legacy(entry)), reject),
    file: (resolve, reject) => handle.getFile().then(resolve, reject),
  };
}
const plist = (body) => file('Info.plist', `<plist><dict>${body}</dict></plist>`);
const file = (name, content) => ({ kind: 'file', name, getFile: async () => new File([content], name) });

test('folder and pool scan AU and VST3 through the packaged Wasm worker', { timeout: 15_000 }, async (t) => {
  // Use the real worker module and Wasm on Node without starting a browser.
  const client = new EventTarget();
  const worker = new EventTarget();
  const send = (target, data) => queueMicrotask(() => target.dispatchEvent(new MessageEvent('message', { data })));
  worker.postMessage = (data) => send(client, data);
  client.postMessage = (data) => send(worker, data);
  client.terminate = () => {};
  const priorSelf = globalThis.self;
  globalThis.self = worker;
  t.after(() => { globalThis.self = priorSelf; });
  t.mock.method(globalThis, 'fetch', async (url) => new Response(await readFile(new URL(url)),
    { headers: { 'Content-Type': 'application/wasm' } }));
  const { ScanPool: PackagedPool } = await import('../dist/worker-pool.js');
  await import('../dist/scan-worker.js');
  const pool = new PackagedPool({ limit: 1, passive: false }, () => client);
  t.after(() => pool.cancelAll());

  const arm = await readFile(new URL('../../fixtures/thin.macho', import.meta.url));
  const universal = await readFile(new URL('../../fixtures/fat.macho', import.meta.url));
  const unexpected = {
    kind: 'file', name: 'Helper', getFile: async () => assert.fail('The plug-in helper should stay unopened'),
  };
  const au = directory('Instrument.component', directory('Contents', plist(`
    <key>CFBundleExecutable</key><string>InstrumentBinary</string>
    <key>CFBundleDisplayName</key><string>Instrument</string>
    <key>CFBundleShortVersionString</key><string>2.0</string>
    <key>CFBundleIdentifier</key><string>org.example.instrument</string>
    <key>AudioComponents</key><array><dict>
      <key>type</key><string>aumu</string><key>subtype</key><string>inst</string>
      <key>manufacturer</key><string>Test</string><key>version</key><integer>131072</integer>
    </dict></array>`),
  directory('MacOS', file('InstrumentBinary', universal), unexpected)));
  au.values = () => assert.fail('Plug-in bundle contents should stay unenumerated');
  const vst = directory('Synth.vst3', directory('Contents', plist(
    '<key>CFBundleExecutable</key><string>SynthBinary</string>'),
  directory('MacOS', file('SynthBinary', arm)),
  file('moduleinfo.json', "{Name:'Old name'}"),
  directory('Resources', file('moduleinfo.json', "{Name: 'Synth', Version:'1.2', Classes:[{CID:'ABCD',},],}"))));
  const missing = directory('Missing.aaxplugin', directory('Contents', plist(
    '<key>CFBundleExecutable</key><string>MissingBinary</string>'),
  directory('MacOS', unexpected)));
  const intel = Buffer.from(arm);
  intel.writeUInt32LE(0x01000007, 4);
  intel.writeUInt32LE(3, 8);
  const aax = directory('Intel.aaxplugin', directory('Contents', plist(
    '<key>CFBundleExecutable</key><string>DSP</string>'),
  directory('MacOS', file('DSP', intel))));
  const script = directory('Script.clap', directory('Contents', plist(
    '<key>CFBundleExecutable</key><string>Script</string>'),
  directory('MacOS', file('Script', '#!/bin/sh\nexit 0'))));
  const blocked = directory('AAX');
  blocked.values = async function* () { throw new DOMException('Permission denied', 'NotAllowedError'); };
  const stats = folderStats('drop');
  const jobs = [];
  const options = { stats, onJob: (job) => jobs.push(job) };
  await walkDirectory(directory('Components', au), 'handle', options);
  await walkDirectory(directory('Mixed', vst, missing, script, aax), 'handle', options);
  await walkDirectory(legacy(directory('Components', au)), 'entry', options);
  await walkDirectory(blocked, 'handle', options);
  assert.deepEqual(stats.roots, [
    { name: 'Components', status: 'scanned' }, { name: 'Mixed', status: 'scanned' },
    { name: 'Components', status: 'scanned' }, { name: 'AAX', status: 'skipped' },
  ]);
  assert.equal(stats.skipped_entries.permission_denied, 1);
  const results = await Promise.all(jobs.map((job, id) => new Promise((resolve) => {
    pool.submit(id, job, (event) => { if (event.type === 'done') resolve(event.result); });
  })));
  const [instrument, synth, broken, nonMachO, avid, legacyInstrument] = results;
  assert.deepEqual(legacyInstrument, instrument);
  assert.equal(instrument.format, 'au');
  assert.equal(instrument.name, 'Instrument');
  assert.equal(instrument.version, '2.0');
  assert.equal(instrument.bundle_id, 'org.example.instrument');
  assert.equal(instrument.audio_components[0].version, 131072);
  assert.equal(pluginVerdict(instrument), 'universal');
  assert.equal(synth.format, 'vst3');
  assert.equal(synth.name, 'Synth');
  assert.equal(synth.version, '1.2');
  assert.equal(synth.vst3_module_info.classes[0].id, 'ABCD');
  assert.equal(pluginVerdict(synth), 'native');
  assert.equal(broken.format, 'aax');
  assert.equal(broken.error_class, 'missing_executable_file');
  assert.equal(pluginVerdict(broken), 'unknown');
  assert.equal(nonMachO.format, 'clap');
  assert.equal(nonMachO.error_class, 'executable_not_macho');
  assert.equal(nonMachO.architectures.length, 0);
  assert.equal(avid.format, 'aax');
  assert.equal(pluginVerdict(avid), 'intel-only');
});

test('plug-in folder permissions stay distinct from missing metadata', async (t) => {
  const pool = new ScanPool({ limit: 1, passive: false }, () => {
    const idle = new EventTarget();
    idle.terminate = () => {};
    return idle;
  });
  t.after(() => pool.cancelAll());
  const job = {
    kind: 'plugin', format: 'au', label: 'Components/Unreadable.component',
    getPluginPlist: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
  };
  const { result } = await new Promise((resolve) => {
    pool.submit(1, job, (event) => { if (event.type === 'done') resolve(event); });
  });
  assert.equal(result.format, 'au');
  assert.equal(result.error_class, 'permission_denied');
});
