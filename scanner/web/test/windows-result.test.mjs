import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lookupMac, macCandidate, windowsVerdict } from '../public/windows-result.js';
import { architectures, verdict } from '../public/scan-view.js';

const catalog = JSON.parse(readFileSync(new URL('../public/mac-catalog.json', import.meta.url)));
const windows = (overrides) => ({
  architectures: [],
  main_architecture: null,
  native_arm64: false,
  arm64ec: false,
  arm64x: false,
  emulated_only: false,
  ...overrides,
});

test('Windows architecture copy distinguishes native, hybrid, emulated and managed apps', () => {
  for (const [arch, label] of [
    ['arm64', 'native ARM64'],
    ['arm64ec', 'ARM64EC (works with emulated x64 code)'],
    ['arm64x', 'ARM64X (ARM64 and ARM64EC)'],
    ['x64', 'x64 only · requires Prism emulation on Windows 11 on Arm'],
    ['x86', 'x86 only · requires Prism emulation on Windows 11 on Arm'],
    ['anycpu', '.NET AnyCPU (depends on the installed runtime)'],
  ]) {
    const result = { status: 'complete', architectures: [], windows: windows({ architectures: [arch], main_architecture: arch }) };
    assert.equal(verdict(result).text, `Windows app · ${label}`);
    assert.notEqual(architectures(result), '');
  }
});

test('opaque installers and archive members do not imply main app support', () => {
  assert.equal(windowsVerdict(windows({
    bootstrapper_architecture: 'x86',
    payload_status: 'unknown, installer payload not inspectable',
  })).text, 'Windows app · unknown, installer payload not inspectable');
  assert.match(windowsVerdict(windows({
    architectures: ['arm64'], architecture_source: 'msi_template', main_architecture: 'arm64',
  })).text, /ARM64 MSI package · app payload unknown/);
  assert.match(windowsVerdict(windows({
    architectures: ['arm64', 'x64'], native_arm64: true, architecture_source: 'archive_pe_headers',
  })).text, /main app architecture unknown/);
});

test('Mac lookup uses unique exact names or verified publisher aliases', () => {
  assert.deepEqual(macCandidate({ product_name: 'Spotify Installer', publisher: 'Spotify AB' }, catalog), {
    title: 'Spotify', url: 'https://doesitarm.com/app/spotify/', status: 'native',
  });
  assert.equal(macCandidate({ product_name: 'Spotify', publisher: 'Spotify Ltd' }, catalog).status, 'native');
  assert.equal(macCandidate({ product_name: 'Spotify Installer', publisher: 'Someone Else' }, catalog), null);
  assert.equal(macCandidate({ product_name: 'Spotify Installer' }, catalog), null);
  assert.equal(macCandidate({ product_name: 'Spotify', publisher: 'Someone Else' }, catalog), null);
  assert.equal(macCandidate({ product_name: 'Spo' }, catalog), null);
  assert.equal(macCandidate({ product_name: 'Visual Studio Code', publisher: 'Microsoft Corporation' }, catalog).url,
    'https://doesitarm.com/app/vs-code/');
  for (const [product_name, publisher, path] of [
    ['Figma Desktop', 'Figma, Inc.', '/app/figma/'],
    ['Slack Desktop', 'Slack Technologies Inc.', '/app/slack/'],
    ['Zoom Workplace (ARM64)', 'Zoom', '/app/zoom/'],
  ]) {
    assert.equal(macCandidate({ product_name, publisher }, catalog).url, `https://doesitarm.com${path}`);
    assert.equal(macCandidate({ product_name, publisher: 'Unrelated Publisher' }, catalog), null);
  }
  assert.equal(macCandidate({ product_name: 'Steam' }, catalog).status, 'Rosetta');
  assert.equal(macCandidate({ product_name: 'Safe App' }, [['Safe App', '/app/safe-app', 'unsupported']]).status, 'unsupported');
  assert.equal(macCandidate({ product_name: 'Safe App' }, [
    ['Safe App', '/app/safe-app', 'native'], ['safe app', '/app/safe-app-2', 'rosetta'],
  ]), null);
  assert.equal(macCandidate({ product_name: 'Safe App' }, [['Safe App', '//unexpected.example.net', 'native']]), null);
});

test('Mac lookup loads one same-origin asset and shares it across results', async () => {
  let requests = 0;
  const fetchCatalog = async (url, options) => {
    requests += 1;
    assert.equal(url.href, new URL('../public/mac-catalog.json', import.meta.url).href);
    assert.deepEqual(options, { credentials: 'omit' });
    return { ok: true, json: async () => catalog };
  };
  assert.equal(await lookupMac({}, fetchCatalog), null);
  assert.equal(requests, 0);
  const [spotify, steam] = await Promise.all([
    lookupMac({ product_name: 'Spotify', publisher: 'Spotify Ltd' }, fetchCatalog),
    lookupMac({ product_name: 'Steam' }, fetchCatalog),
  ]);
  assert.equal(spotify.status, 'native');
  assert.equal(steam.status, 'Rosetta');
  assert.equal(requests, 1);
});
