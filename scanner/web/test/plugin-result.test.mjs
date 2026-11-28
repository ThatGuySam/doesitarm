import assert from 'node:assert/strict';
import test from 'node:test';
import { bundleKind } from '../public/bundle-kind.js';
import { resultRecord } from '../public/diagnostics.js';
import { pluginExport, pluginVerdict } from '../public/plugin-result.js';
import { verdict } from '../public/scan-view.js';

const slice = (name, header_verified = true) => ({ name, header_verified });

test('bundle kinds recognize the leaf extension without accepting lookalikes', () => {
  for (const [path, kind] of [
    ['Apps/App.app', 'app'], ['Components/Audio.COMPONENT', 'au'], ['Audio.vst', 'vst2'],
    ['Audio.vst3', 'vst3'], ['Audio.CLAP', 'clap'], ['Audio.aaxplugin', 'aax'],
    ['Audio.vst3/Contents', null], ['Audio.vst3.zip', null], ['._Audio.component', null],
    ['.app', null], ['plugin.toString', null], ['folder.clap/', null],
  ]) {
    assert.equal(bundleKind(path), kind, path);
  }
});

test('plug-in verdicts describe verified slices without app launcher or Rosetta advice', () => {
  for (const [architectures, expected] of [
    [[slice('arm64')], 'native'], [[slice('arm64e'), slice('x86_64')], 'universal'],
    [[slice('i386'), slice('x86_64')], 'intel-only'], [[slice('ppc')], 'legacy'],
    [[slice('arm64'), slice('x86_64', false)], 'unknown'], [[], 'unknown'],
  ]) {
    const result = { format: 'au', status: 'complete', architectures };
    assert.equal(pluginVerdict(result), expected);
    assert.doesNotMatch(verdict(result).text, /launcher|Rosetta/);
  }
  assert.equal(pluginVerdict({ status: 'invalid', architectures: [slice('arm64')] }), 'unknown');
});

test('CSV, JSON and diagnostics export only path-free plug-in records', async () => {
  const row = {
    kind: 'plugin', label: '/Users/marcy/Library/Audio/Private.component',
    result: {
      format: 'au', name: 'A "quoted" synth', bundle_id: 'com.example.synth', version: '=1+8',
      architectures: [slice('arm64')], status: 'source_error',
      error: 'Could not open /Volumes/Backup/Private.component',
      bundle_path: '/Users/marcy/Library/Audio/Private.component',
      audio_components: [{ name: 'C:%5cUsers%5cmarcy%5cInstrument', type: 'aumu', subtype: 'Inst', version: 7 }],
    },
    evidence: { info_plist: { custom: '/Users/marcy' } },
  };
  const json = await (await pluginExport([row], 'json')).text();
  const [result] = JSON.parse(json);
  assert.equal(result.name, 'A "quoted" synth');
  assert.equal(result.audio_components[0].name, null);
  assert.equal(result.verdict, 'unknown');
  assert.match(result.error, /plug-in scan/);
  assert.deepEqual(JSON.parse(JSON.stringify(resultRecord(row, true))), result);
  assert.doesNotMatch(json, /marcy|Library|Volumes|Private\.component|info_plist|bundle_path/);

  const csv = await (await pluginExport([row], 'csv')).text();
  assert.match(csv, /^name,version,bundle_id,format,architectures,verdict,status,error\r\n/);
  assert.match(csv, /"A ""quoted"" synth","'=1\+8","com\.example\.synth","Audio Unit \(AU\)","arm64","unknown","source_error"/);
  assert.doesNotMatch(csv, /marcy|Library|Volumes|Private\.component/);
});
