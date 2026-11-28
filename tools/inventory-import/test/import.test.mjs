import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decode, parseInventory } from '../formats.mjs';
import { approvedGroups, groupInventory, joinedResult, nativeEvidence } from '../inventory.mjs';
import { batchInventory, endpoint, lookupBatches } from '../mcp.mjs';
import { run } from '../import.mjs';

const fixtures = new URL('./fixtures/', import.meta.url);
const fixture = name => fileURLToPath(new URL(name, fixtures));
const load = name => readFile(fixture(name), 'utf8');
const normalize = (format, data, options) => groupInventory(parseInventory(format, data, options), format);
const rowsOf = ({ groups }) => groups.map(group => group.row);
const named = (name, version, publisher) => ({ name, version, ...(publisher ? { publisher } : {}) });
const bundled = (name, bundle_id, version) => ({ name, bundle_id, version });
const firefox = bundled('Firefox', 'org.mozilla.firefox', '128.0');
const vlc = bundled('VLC', 'org.videolan.vlc', '3.0.21');
const code = bundled('Visual Studio Code', 'com.microsoft.VSCode', '1.96.0');
const noNetwork = () => assert.fail('Offline mode tried to use the network');

async function scratch(t) {
  const directory = await mkdtemp(join(tmpdir(), 'inventory-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function capture(args, fetchImpl = noNetwork) {
  let output = '';
  await run(args, { stdout: text => { output += text; }, fetchImpl });
  return output;
}

function reply(id, result) {
  return Response.json({ jsonrpc: '2.0', id, result });
}

const cases = [
  ['jamf-pro-applications.csv', 'jamf-pro-applications',
    [named('Firefox.app', '128.0'), named('VLC.app', '3.0.21')], 'provisional_labels', [2, 1]],
  ['jamf-pro-inventory.json', 'jamf-pro-inventory',
    [{ ...firefox, name: 'Firefox.app' }, { ...vlc, name: 'VLC.app' }, { ...code, name: 'Visual Studio Code.app' }], 'distinct_devices', [2, 1, 1]],
  ['iru-prism-apps.csv', 'iru-prism-apps', [firefox, code], 'distinct_devices', [2, 1]],
  ['intune-discovered-apps.csv', 'intune-discovered-apps',
    [named('Firefox', '128.0', 'Mozilla'), named('VLC', '3.0.21', 'VideoLAN'), named('Visual Studio Code', '1.96.0', 'Microsoft')],
    'provider_reported', [2, 1, 1]],
  ['fleet-report.csv', 'fleet-csv', [firefox, vlc], 'provisional_labels', [2, 1]],
  ['jumpcloud-system-app.csv', 'jumpcloud-system-app',
    [named('Firefox', '128.0', 'Mozilla'), named('VLC', '3.0.21', 'VideoLAN')], 'distinct_devices', [2, 1]],
  ['munkireport-applications.csv', 'munkireport-applications', [code, vlc], 'distinct_devices', [2, 1]],
  ['system-profiler.json', 'system-profiler-json',
    [named('Firefox', '128.0'), named('VLC', '3.0.21'), named('Visual Studio Code', '1.96.0')], 'rows', [1, 1, 1]],
];

for (const [file, format, expected, kind, counts] of cases) {
  test(file + ' projects, counts and previews only approved tuples', async t => {
    const path = await scratch(t);
    const approvals = join(path, 'review.json');
    const report = join(path, 'local.json');
    const args = ['--format', format, fixture(file)];
    assert.equal(await capture([...args, '--review', approvals, '--local-report', report]), '');
    const projected = await readFile(approvals, 'utf8');
    const local = await readFile(report, 'utf8');
    assert.deepEqual(JSON.parse(projected), expected);
    assert.deepEqual(rowsOf(JSON.parse(local)), expected);
    assert.deepEqual(JSON.parse(local).groups.map(group => group.devices), counts.map(count => ({ kind, count })));
    assert.ok(JSON.parse(local).groups.every(group => !('device' in group) && !('label' in group)));
    const dry = await capture([...args, '--approved', approvals, '--dry-run']);
    assert.deepEqual(JSON.parse(dry), {
      jsonrpc: '2.0', id: '1:0', method: 'tools/call',
      params: { name: 'check_inventory', arguments: { rows: expected, limit: 50 } },
    });
    assert.doesNotMatch(projected + dry, /SYNTHETIC|\/Applications\/|example\.invalid|000000000000000000009001|last_fetched|DeviceCount|source_rows|architecture|devices/);
    assert.doesNotMatch(local, /SYNTHETIC|\/Applications\/|example\.invalid|000000000000000000009001/);
  });
}

test('Jamf continuation stops at orphans, separators, malformed rows and a new app', async () => {
  const header = 'Application Name,Version,Computer Name,Architecture Type';
  const data = [
    header, ',,orphan,arm64', 'Firefox,128.0,,', ',,first,arm64', ',,second,x86_64',
    ',,,', ',,orphan,arm64', 'VLC,3.0.21,third,arm64', 'bad,width', ',,orphan,x86_64',
    'Firefox,129.0,,', ',,fourth,arm64', '',
  ].join('\n');
  const result = normalize('jamf-pro-applications', data);
  assert.deepEqual(rowsOf(result), [named('Firefox', '128.0'), named('VLC', '3.0.21'), named('Firefox', '129.0')]);
  assert.deepEqual(result.groups.map(group => group.devices.count), [2, 1, 1]);
  assert.deepEqual(result.unresolved.map(row => row.reason), [
    'unresolved_continuation', 'unresolved_continuation', 'column_count', 'unresolved_continuation',
  ]);
  assert.deepEqual(Object.keys(result.groups[0].architecture), ['unknown']);
  const alternate = data.replace('Application Name', 'Application');
  assert.throws(() => normalize('jamf-pro-applications', alternate), /Headers/);
  assert.deepEqual(rowsOf(normalize('jamf-pro-applications', alternate, { verifiedHeaders: true })), rowsOf(result));
});

test('Jamf keeps builds separate and Iru only maps a confirmed build', async () => {
  const jamf = JSON.parse(await load('jamf-pro-inventory.json'));
  jamf.results[0].applications[0].cfBundleVersion = ' 0100 ';
  jamf.results[1].applications[0].cfBundleVersion = '0101';
  delete jamf.results[0].applications[1].cfBundleShortVersionString;
  const rows = rowsOf(normalize('jamf-pro-inventory', JSON.stringify(jamf)));
  assert.deepEqual(rows.filter(row => row.bundle_id === firefox.bundle_id).map(row => row.build), ['0100', '0101']);
  assert.equal(rows.find(row => row.bundle_id === vlc.bundle_id).version, undefined);
  assert.equal(rowsOf(normalize('jamf-pro-inventory', JSON.stringify(jamf), { verifiedVersion: true }))[1].version, vlc.version);
  const iru = (await load('iru-prism-apps.csv')).replaceAll('128.0,128.0', '12345,128.0');
  assert.deepEqual(rowsOf(normalize('iru-prism-apps', iru))[0], firefox);
  assert.deepEqual(rowsOf(normalize('iru-prism-apps', iru, { verifiedBuild: true }))[0], { ...firefox, build: '12345' });
});

test('Intune filters Windows, never uses report IDs and retains overlapping counts separately', async () => {
  const fixtureText = (await load('intune-discovered-apps.csv')).trimEnd();
  const result = normalize('intune-discovered-apps', fixtureText + '\r\nFirefox,Windows,128.0,10,Mozilla\r\nFirefox,macOS,128.0,4,Mozilla');
  assert.deepEqual(result.groups[0].devices, { kind: 'provider_reported', count: null });
  assert.deepEqual(result.groups[0].source_counts, [{ row: 2, count: 2 }, { row: 6, count: 4 }]);
  const text = 'ApplicationName,ApplicationVersion,ApplicationShortVersion,Platform,ApplicationKey,DeviceId\n' +
    'Firefox,99,128.0,macOS,org.mozilla.firefox,1\nFirefox,99,128.0,macOS,org.mozilla.firefox,1';
  assert.deepEqual(rowsOf(normalize('intune-discovered-apps', text)), [named('Firefox', '99')]);
  const confirmed = normalize('intune-discovered-apps', text, { verifiedVersion: true });
  assert.deepEqual(rowsOf(confirmed), [named('Firefox', '128.0')]);
  assert.deepEqual(confirmed.groups[0].devices, { kind: 'distinct_devices', count: 1 });
  const graph = JSON.stringify({ value: [{ displayName: 'Firefox', version: '128.0', platform: 'macOS', deviceCount: 2 }] });
  assert.equal(normalize('intune-graph', graph).groups[0].devices.count, 2);
});

test('Fleet duplicate rows, formula-wrapped digits, quoted fields, TSV and BOMs are handled locally', async () => {
  const text = await load('fleet-report.csv');
  const repeated = text.trimEnd() + '\n' + text.split('\n')[1];
  assert.equal(normalize('fleet-csv', repeated).groups[0].devices.count, 2);
  const data = 'name\tbundle_identifier\tbundle_short_version\tbundle_version\thost_display_name\n' +
    '"App ""One""\nmore"\tcom.example.one\t01.002\t"=""0123"""\ta\n' +
    'App Two\tcom.example.two\t1.2b3\t"=NOT_A_FORMULA()"\tb';
  for (const bytes of [
    Buffer.from('\uFEFF' + data, 'utf8'), Buffer.from('\uFEFF' + data, 'utf16le'),
    Buffer.from('\uFEFF' + data, 'utf16le').swap16(),
  ]) {
    const rows = rowsOf(normalize('fleet-csv', decode(bytes)));
    assert.equal(rows[0].name, 'App "One"\nmore');
    assert.equal(rows[0].version, '01.002');
    assert.equal(rows[0].build, '0123');
    assert.equal(rows[1].version, '1.2b3');
    assert.equal(rows[1].build, '=NOT_A_FORMULA()');
  }
  assert.throws(() => decode(Buffer.from([0xc3, 0x28])), /encoding/);
  assert.equal(decode(Buffer.from([0x63, 0x61, 0x66, 0xe9]), 'windows-1252'), 'café');
  const ambiguous = 'name,bundle_identifier,bundle_short_version,X\tname\tbundle_identifier\tbundle_short_version\n';
  assert.throws(() => normalize('fleet-csv', ambiguous), /Ambiguous delimiter/);
  assert.deepEqual(rowsOf(normalize('fleet-csv', ambiguous, { delimiter: ',' })), []);
});

test('Fleet nested and JumpCloud direct results keep stable IDs local', () => {
  const fields = { name: 'Firefox', bundle_identifier: 'org.mozilla.firefox', bundle_short_version: '128.0', bundle_version: '01' };
  for (const [profile, items] of [
    ['fleet-json', [1, 2, 1].map(host_id => ({ host_id, columns: fields, last_fetched: '2026-11-27T20:00:00Z' }))],
    ['jumpcloud-system-insights', [1, 2, 1].map(system_id => ({ ...fields, system_id, path: '/private/MY_PATH' }))],
  ]) {
    const result = normalize(profile, JSON.stringify(items));
    assert.deepEqual(rowsOf(result), [{ ...firefox, build: '01' }]);
    assert.deepEqual(result.groups[0].devices, { kind: 'distinct_devices', count: 2 });
    assert.doesNotMatch(JSON.stringify(result), /host_id|system_id|MY_PATH/);
  }
});

test('JumpCloud PowerShell preamble requires its explicit profile', async () => {
  const file = '#TYPE System.Management.Automation.PSCustomObject\r\n' + await load('jumpcloud-system-app.csv');
  assert.equal(normalize('jumpcloud-system-app', file).groups[0].devices.count, 2);
  assert.throws(() => normalize('fleet-csv', file), /preamble/);
});

test('MunkiReport keeps both architecture buckets and separates a scoped native candidate', async () => {
  const inventory = normalize('munkireport-applications', await load('munkireport-applications.csv'));
  const group = inventory.groups[0];
  const finding = {
    status: 'native', evidence: { basis: 'catalog_statement', observed_version: '1.54' },
    catalog_hint: { url: 'https://doesitarm.com/app/visual-studio-code/' },
  };
  const reported = joinedResult(group, finding, 'fixture', new Map());
  assert.equal(reported.status, 'unknown');
  assert.equal(reported.catalog_status, 'native');
  assert.equal(reported.native_as_of, '1.54');
  assert.equal(reported.native_availability.status, 'unknown');
  assert.deepEqual(reported.architecture, {
    intel: { kind: 'distinct_devices', count: 1 }, universal: { kind: 'distinct_devices', count: 1 },
  });
  assert.equal(batchInventory(inventory.groups)[0].args.rows.filter(row => row.name === code.name).length, 1);
  const binary = { basis: 'binary_architecture', observed_version: '1.96.0', architectures: ['arm64'], source_url: finding.catalog_hint.url };
  const sameVersion = joinedResult(group, { ...finding, evidence: binary }, 'fixture', new Map());
  assert.equal(sameVersion.native_availability.status, 'same_version_native_variant');
  assert.equal(sameVersion.native_availability.candidate_version, '1.96.0');
  const verified = nativeEvidence([{
    installed: code, status: 'native_version_available', candidate_version: '1.97.0', candidate_build: '100',
    architectures: ['arm64'], channel: 'stable', source_url: 'https://example.com/release',
    evidence_basis: 'vendor', minimum_macos: '12',
  }], inventory.groups);
  assert.equal(joinedResult(group, finding, 'fixture', verified).native_availability.minimum_macos, '12');
});

test('Architecture buckets and app groups show overlap without adding device counts', () => {
  const text = 'Name,Serial Number,Name,Bundle Version,Bundle ID,Architecture\n' +
    'host,serial,Code,1,com.example.Code,Intel 64-bit\n' +
    'host,serial,code,1,com.example.code,Universal 2\n' +
    'host,serial,code,1,com.example.code,Universal 2';
  const { groups: [group] } = normalize('munkireport-applications', text);
  assert.equal(group.devices.count, 1);
  assert.equal(group.architecture.intel.count, 1);
  assert.equal(group.architecture.universal.count, 1);
});

test('System Information plist and JSON agree and ignore other report categories', async () => {
  const source = JSON.parse(await load('system-profiler.json'));
  const apps = source.SPApplicationsDataType.map(app => '<dict>' + Object.entries(app).map(
    ([key, value]) => '<key>' + key + '</key><string>' + value + '</string>',
  ).join('') + '</dict>').join('');
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';
  const plist = declaration + '<plist version="1.0"><array><dict><key>_dataType</key><string>Hardware</string></dict>' +
    '<dict><key>_dataType</key><string>SPApplicationsDataType</string><key>_items</key><array>' + apps + '</array></dict></array></plist>';
  const fromXml = normalize('system-profiler-plist', plist);
  const fromJson = normalize('system-profiler-json', JSON.stringify({ ...source, Hardware: [{ _name: 'PRIVATE_HOST' }] }));
  assert.deepEqual(fromXml.groups, fromJson.groups);
  assert.throws(() => normalize('system-profiler-json', '{"_items":[]}'), /shape/);
  assert.throws(() => normalize('system-profiler-plist', '<plist><dict></dict></plist>'), /shape/);
  assert.throws(() => normalize('system-profiler-plist', plist.replace('</dict>', '</array>')), /Malformed XML/);
  assert.throws(() => normalize('system-profiler-plist',
    '<!DOCTYPE plist [<!ENTITY leak SYSTEM "file:///hidden">]><plist><string>&leak;</string></plist>'), /declaration/);
  assert.throws(() => normalize('system-profiler-plist',
    '<plist>' + '<array>'.repeat(65) + '</array>'.repeat(65) + '</plist>'), /nesting/);
  let deeplyNested = source.SPApplicationsDataType;
  for (let index = 0; index < 33; index++) deeplyNested = [{ _items: deeplyNested }];
  assert.throws(() => normalize('system-profiler-json', JSON.stringify({ SPApplicationsDataType: deeplyNested })), /nesting/);
  source.SPApplicationsDataType[0].arch_kind = 'arch_future';
  source.SPApplicationsDataType[1].arch_kind = 'arch_ios';
  source.SPApplicationsDataType.push({ _name: 'Web Clip', version: '1', arch_kind: 'arch_web' });
  source.SPApplicationsDataType.push({ _name: 'Other', version: '1', arch_kind: 'arch_other' });
  const classified = normalize('system-profiler-json', JSON.stringify(source));
  assert.deepEqual(classified.groups.map(group => Object.keys(group.architecture)[0]), ['unknown', 'ios', 'intel', 'web', 'other']);
  assert.deepEqual(classified.groups.map(group => group.lookup_eligible), [true, false, true, false, false]);
});

test('Approval prevents private app fields and metadata from reaching stdout or MCP', async t => {
  const path = await scratch(t);
  const source = join(path, 'inventory.csv');
  const approval = join(path, 'approved.json');
  const privateReview = join(path, 'review.json');
  await writeFile(source, 'name,bundle_id,short_version,serial_number,device__user_email,path\n' +
    'Firefox,org.mozilla.firefox,128.0,SERIAL_SENTINEL,EMAIL_SENTINEL,PATH_SENTINEL\n' +
    'INTERNAL_APP_SENTINEL,com.internal.sentinel,SECRET_VERSION_SENTINEL,SERIAL_SENTINEL,EMAIL_SENTINEL,PATH_SENTINEL');
  const args = ['--format', 'iru-prism-apps', source];
  assert.equal(await capture([...args, '--review', privateReview]), '');
  assert.equal((await stat(privateReview)).mode & 0o777, 0o600);
  assert.match(await readFile(privateReview, 'utf8'), /INTERNAL_APP_SENTINEL/);
  await assert.rejects(capture([...args, '--dry-run']), /Missing approval/);
  await writeFile(approval, JSON.stringify([firefox]));
  const dry = await capture([...args, '--approved', approval, '--dry-run']);
  const live = await capture([...args, '--approved', approval, '--lookup'], async (url, { body, redirect }) => {
    assert.equal(url, endpoint);
    assert.equal(redirect, 'error');
    assert.equal(body + '\n', dry);
    assert.doesNotMatch(body, /SENTINEL|com\.internal\.sentinel/);
    return reply('1:0', { structuredContent: {
      counts: { unique: 1, invalid: 0 }, catalog_revision: 'fixture', next_offset: null,
      results: [{ row: 1, status: 'unknown', unknown_reason: 'ambiguous_identity' }],
    } });
  });
  assert.doesNotMatch(dry + live, /SENTINEL|com\.internal\.sentinel/);
  assert.equal(JSON.parse(live).results[0].devices.count, 1);
  await writeFile(approval, JSON.stringify([{ ...firefox, device_count: 1 }]));
  await assert.rejects(capture([...args, '--approved', approval, '--dry-run']), /only name, bundle_id/);
  await writeFile(approval, JSON.stringify([{ ...firefox, version: 'stale' }]));
  await assert.rejects(capture([...args, '--approved', approval, '--dry-run']), /no exact, eligible match/);
});

test('A joined name-only result stays unknown, even when the catalog hint is native', () => {
  const inventory = normalize('intune-discovered-apps',
    'ApplicationName,ApplicationVersion,ApplicationPublisher,Platform,DeviceCount\nFirefox,128.0,Mozilla,macOS,2');
  const row = inventory.groups[0];
  const finding = { row: 1, status: 'unknown', catalog_hint: { reported_status: 'native', url: 'https://doesitarm.com/app/firefox/' } };
  const report = joinedResult(row, finding, 'fixture', new Map());
  assert.equal(report.status, 'unknown');
  assert.equal(report.native_as_of, null);
  assert.equal(report.link, finding.catalog_hint.url);
});

test('Batch limits apply after grouping, including UTF-8 input and escaped CSV arguments', () => {
  const header = 'name,bundle_id,short_version\n';
  const dupe = normalize('iru-prism-apps', header + 'Firefox,org.mozilla.firefox,128.0\n'.repeat(250));
  assert.equal(batchInventory(approvedGroups(dupe.groups, [firefox]))[0].args.rows.length, 1);

  const unique = Array.from({ length: 251 }, (_, index) => ({ row: { name: 'App ' + index } }));
  assert.deepEqual(batchInventory(unique).map(batch => batch.args.rows.length), [250, 1]);
  const manyBundleIds = unique.slice(0, 26).map((group, index) => ({ row: { ...group.row, bundle_id: 'test.app.' + index } }));
  assert.deepEqual(batchInventory(manyBundleIds).map(batch => batch.args.rows.length), [25, 1]);

  const unicode = unique.map((_, index) => ({ row: { name: 'é'.repeat(156) + index } }));
  const structured = batchInventory(unicode);
  assert.ok(structured.length > 1);
  assert.ok(structured.every(batch => Buffer.byteLength(JSON.stringify(batch.args.rows)) <= 65536));
  const escaped = unique.map((_, index) => ({ row: {
    name: '\t'.repeat(156) + index, publisher: '\t'.repeat(159) + 'x',
  } }));
  const csvBatches = batchInventory(escaped, { wire: 'csv', target: 28 });
  assert.ok(csvBatches.length > 1);
  assert.ok(csvBatches.every(batch => Buffer.byteLength(batch.args.csv) <= 65536 &&
    Buffer.byteLength(JSON.stringify({ ...batch.args, offset: 249, catalog_revision: 'x'.repeat(128) })) <= 98304));
  const [left, right] = [
    { row: { name: 'A|B', publisher: 'C' } }, { row: { name: 'A', publisher: 'B|C' } },
  ];
  assert.equal(batchInventory([left, right]).length, 2);
});

test('Pagination resends the same batch, restarts on revision change and joins by row', async () => {
  const groups = Array.from({ length: 51 }, (_, index) => ({ row: { name: 'App ' + index }, architecture: {} }));
  const [batch] = batchInventory(groups, { target: 28 });
  const requests = [];
  const result = await lookupBatches([batch], {
    fetchImpl: async (_url, { body }) => {
      const call = JSON.parse(body);
      requests.push(call.params.arguments);
      const offset = call.params.arguments.offset ?? 0;
      if (requests.length === 2) {
        return reply(call.id, { isError: true, content: [{ type: 'text', text: 'catalog_revision no longer matches' }] });
      }
      const count = offset ? 1 : 50;
      return reply(call.id, { structuredContent: {
        counts: { unique: 51, invalid: 0 },
        catalog_revision: requests.length === 1 ? 'stale' : 'fresh',
        results: Array.from({ length: count }, (_, index) => ({ row: offset + index + 1, status: 'unknown' })),
        next_offset: offset ? null : 50,
      } });
    },
  });
  assert.deepEqual(requests, [batch.args, { ...batch.args, offset: 50, catalog_revision: 'stale' },
    batch.args, { ...batch.args, offset: 50, catalog_revision: 'fresh' }]);
  assert.equal(result.length, 51);
  assert.ok(result.every((row, index) => row.catalog_revision === 'fresh' && row.app === 'App ' + index));
});

test('CSV emit matches the CSV in the exact dry-run request arguments', async t => {
  const path = await scratch(t);
  const approval = join(path, 'review.json');
  const args = ['--format', 'fleet-csv', fixture('fleet-report.csv'), '--wire', 'csv'];
  await capture([...args, '--review', approval]);
  const request = JSON.parse(await capture([...args, '--approved', approval, '--dry-run']));
  const output = await capture([...args, '--approved', approval, '--emit']);
  assert.equal(output, 'name,bundle_id,version,build,publisher\nFirefox,org.mozilla.firefox,128.0,,\nVLC,org.videolan.vlc,3.0.21,,');
  assert.equal(output, request.params.arguments.csv);
});

test('Additional profiles require confirmed scope and field mappings', () => {
  const addigy = JSON.stringify({ items: [
    { name: 'Firefox', identifier: 'org.mozilla.firefox', short_version: '128.0', version: '100', agent_id: 'same', orgid: '1' },
    { name: 'Firefox', identifier: 'org.mozilla.firefox', short_version: '128.0', version: '100', agent_id: 'same', orgid: '2' },
  ] });
  assert.throws(() => normalize('addigy-mdm', addigy), /Mac scope/);
  assert.equal(normalize('addigy-mdm', addigy, { macOnly: true }).groups[0].devices.count, 2);
  const school = JSON.stringify({ device: { id: '1', apps: [{ name: 'Firefox', identifier: 'org.mozilla.firefox', version: '128.0' }] } });
  assert.throws(() => normalize('jamf-school', school), /verified Mac/);
  assert.deepEqual(rowsOf(normalize('jamf-school', school, { macOnly: true, verifiedHeaders: true })), [firefox]);
  const lansweeper = 'AssetID,AssetType,Software,Version,Publisher\nA,Windows,Firefox,128.0,Mozilla\nB,Mac,Firefox,128.0,Mozilla';
  assert.equal(normalize('lansweeper-classic', lansweeper).groups[0].devices.count, 1);
  const mapped = 'Name,Name,Installed Version,Serial\nHOST,Firefox,128.0,SERIAL';
  assert.deepEqual(rowsOf(normalize('mapped-csv', mapped, {
    delimiter: ',', macOnly: true, columns: { name: 2, version: 3, device: 4 },
  })), [named('Firefox', '128.0')]);
});
