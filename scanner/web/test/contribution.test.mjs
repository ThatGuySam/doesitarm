import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CATALOG_URL, STORE_URL, contributionPayload, createUpgradeCheck, supportedVersion } from '../public/contribution.js';
import { INFO_PLIST_ALLOWED_KEYS, MAX_VALUE_LENGTH, pickAllowedInfoPlist } from '../public/scan-allowlist.js';
import { scannerFragment } from '../scripts/fragment.mjs';

const slice = (name, header_verified = true) => ({ name, header_verified, signature: 'cafebabe' });
const long = 'x'.repeat(MAX_VALUE_LENGTH + 30);

function appRow() {
  return {
    kind: 'file',
    label: '/Users/alice/Downloads/Example.zip',
    result: {
      status: 'complete',
      bundle_path: 'Folder/Example.app',
      architectures: [slice('x86_64'), slice('arm64'), slice('arm64'), slice('arm64e', false), slice('ppc')],
      bundle_id: 'com.example.app',
      name: 'Example',
      version: '2.1',
      min_macos: '11.0',
    },
    evidence: {
      raw: 'cafebabe',
      info_plist: {
        CFBundleIdentifier: 'com.example.app',
        CFBundleName: 'Example',
        CFBundleDisplayName: '/Users/alice/Downloads/Example.app',
        CFBundleShortVersionString: '2.1',
        CFBundleVersion: 42,
        CFBundlePackageType: 'APPL',
        LSMinimumSystemVersion: '11.0',
        LSMinimumSystemVersionByArchitecture: { arm64: '11.0' },
        LSArchitecturePriority: ['arm64'],
        LSRequiresNativeExecution: false,
        NSHumanReadableCopyright: long,
        DTXcode: '1500',
        SUFeedURL: 'https://publisher.invalid/appcast.xml',
      },
    },
  };
}

const architectures = ['arm64', 'x86_64'];
const body = {
  filename: 'Example.app',
  appVersion: '2.1',
  result: '✅',
  architectures,
  machoMeta: JSON.stringify({ architectures }),
  infoPlist: JSON.stringify({
    CFBundleIdentifier: 'com.example.app',
    CFBundleName: 'Example',
    CFBundleShortVersionString: '2.1',
    CFBundleVersion: 42,
    CFBundlePackageType: 'APPL',
    LSMinimumSystemVersion: '11.0',
    LSRequiresNativeExecution: false,
    NSHumanReadableCopyright: 'x'.repeat(256),
    DTXcode: '1500',
  }),
};
const catalog = [
  { name: 'Example', bundleIds: ['com.other.app'], endpoint: '/app/other' },
  { name: 'Example for Mac', bundleIds: ['com.example.app'], endpoint: '/app/example' },
];
const listing = { href: 'https://doesitarm.com/app/example', label: 'View on Does It ARM' };
const storeResponse = { status: 'Done', supportedVersionNumber: '3.0' };

function recorder({ store = Response.json(storeResponse), apps = catalog, online = () => true } = {}) {
  const calls = [];
  const check = createUpgradeCheck({
    online,
    async fetch(url, options) {
      calls.push({ url, options });
      return url === STORE_URL ? store.clone() : Response.json(apps);
    },
  });
  return { calls, check };
}

test('the shared plist allowlist drops extra keys, objects, arrays, null and non-finite numbers', () => {
  assert.deepEqual(pickAllowedInfoPlist({
    CFBundleName: long,
    CFBundleDisplayName: '',
    LSMinimumSystemVersionByArchitecture: { arm64: '11.0' },
    LSArchitecturePriority: ['arm64'],
    LSRequiresNativeExecution: false,
    CFBundleVersion: 0,
    CFBundlePackageType: null,
    DTSDKName: Infinity,
    DTXcode: { $plist: 'date', value: '2020' },
    SUFeedURL: 'https://publisher.invalid/appcast.xml',
  }), {
    CFBundleName: 'x'.repeat(256),
    CFBundleDisplayName: '',
    CFBundleVersion: 0,
    LSRequiresNativeExecution: false,
  });
  assert.equal(pickAllowedInfoPlist(['CFBundleName']), null);
});

test('payload mirrors v1 and keeps just verified launcher architectures and the bundle base name', () => {
  assert.deepEqual(contributionPayload(appRow()), body);
  const intel = appRow();
  intel.result.architectures = [slice('i386'), slice('x86_64h'), slice('arm64', false)];
  intel.result.bundle_path = 'C:\\Users\\alice\\Example.app';
  assert.deepEqual(contributionPayload(intel), {
    ...body,
    result: '🔶',
    architectures: ['x86_64h', 'i386'],
    machoMeta: '{"architectures":["x86_64h","i386"]}',
  });
});

test('scans without parsed plist evidence use the scanner report; partial and non-app rows are skipped', () => {
  const row = appRow();
  row.evidence = null;
  row.result.bundle_path = null;
  assert.deepEqual(contributionPayload(row), {
    ...body,
    filename: null,
    infoPlist: '{"CFBundleIdentifier":"com.example.app","CFBundleName":"Example","CFBundleShortVersionString":"2.1","LSMinimumSystemVersion":"11.0"}',
  });
  assert.equal(contributionPayload({ ...row, parentBundlePath: 'Wrapper.app' }), null);
  for (const fields of [
    { status: 'budget_exhausted' },
    { windows: {} },
    { wrapper_path: 'Wrapper.app' },
    { bundle_id: null },
    { architectures: [slice('arm64', false)] },
  ]) {
    assert.equal(contributionPayload({ ...row, result: { ...row.result, ...fields } }), null);
  }
});

test('an unchecked scan sends nothing, even when it has a complete app result', async () => {
  const { calls, check } = recorder();
  assert.equal(await check(appRow()), undefined);
  assert.deepEqual(calls, []);
});

test('checked sends exactly the v1 body for each app and reads the catalog once without sending IDs to it', async () => {
  const { calls, check } = recorder();
  const consent = new AbortController().signal;
  for (const row of [appRow(), appRow()]) assert.deepEqual(await check(row, consent), { version: '3.0', link: listing });
  assert.deepEqual(calls.map(({ url }) => url), [STORE_URL, CATALOG_URL, STORE_URL]);
  for (const { options } of calls.filter(({ url }) => url === STORE_URL)) {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), body);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
  }
  assert.equal(calls[1].options.body, undefined);
  assert.equal(calls[1].options.credentials, 'omit');
});

test('catalog links support a unique exact alias for an entry without a bundle ID', async () => {
  const { check } = recorder({ apps: [{ name: 'Example for Mac', aliases: ['Example'], bundleIds: [], endpoint: '/app/example' }] });
  assert.deepEqual(await check(appRow(), new AbortController().signal), { version: '3.0', link: listing });
});

test('a download link can be used when the matching catalog entry has no listing', async () => {
  const href = 'https://publisher.example/download';
  const { check } = recorder({
    apps: [{
      bundleIds: ['com.example.app'],
      relatedLinks: [
        { label: 'Download', href: 'javascript:alert(1)' },
        { label: 'Download', href },
      ],
    }],
  });
  assert.deepEqual(await check(appRow(), new AbortController().signal), {
    version: '3.0', link: { href, label: 'Download' },
  });
});

test('a checked offline scan and a failed store request return the unavailable status', async () => {
  const consent = new AbortController().signal;
  const offline = recorder({ online: () => false });
  assert.deepEqual(await offline.check(appRow(), consent), { unavailable: true });
  assert.deepEqual(offline.calls, []);

  const failure = recorder({ store: new Response(null, { status: 503 }) });
  assert.deepEqual(await failure.check(appRow(), consent), { unavailable: true });
  assert.deepEqual(failure.calls.map(({ url }) => url), [STORE_URL]);
});

test('unchecking prevents queued requests and further catalog requests for the affected scans', async () => {
  let release;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const check = createUpgradeCheck({
    online: () => true,
    fetch(url) {
      calls.push(url);
      started();
      return pending;
    },
  });
  const consent = new AbortController();
  const first = check(appRow(), consent.signal);
  const second = check(appRow(), consent.signal);
  await ready;
  consent.abort();
  release(Response.json(storeResponse));
  assert.deepEqual(await Promise.all([first, second]), [undefined, undefined]);
  assert.deepEqual(calls, [STORE_URL]);
});

test('supported release numbers are displayed without a leading v', () => {
  assert.equal(supportedVersion({ supportedVersionNumber: 'v3.1b' }), '3.1b');
  assert.equal(supportedVersion({ supportedVersionNumber: 3 }), '3');
  assert.equal(supportedVersion({ supportedVersionNumber: 'R25.0 (104)' }), 'R25.0 (104)');
  for (const value of [null, undefined, 0, '0', '', '<img src=x>', {}]) {
    assert.equal(supportedVersion({ supportedVersionNumber: value }), null);
  }
});

test('the embedded scanner checkbox starts unchecked beside the picker with accessible copy and an exact disclosure', () => {
  const fragment = scannerFragment(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'));
  const field = fragment.match(/<label[^>]+for="check-upgrades">([\s\S]+?)<\/label>/)?.[1];
  assert.ok(field);
  const input = field.match(/<input[^>]+>/)?.[0];
  assert.match(input, /type="checkbox" id="check-upgrades" aria-describedby="upgrade-hint"/);
  assert.doesNotMatch(input, /\bchecked\b/);
  assert.match(field, /Also check for Apple Silicon upgrades and download links/);
  assert.match(fragment, /id="upgrade-hint">Sends public app and version IDs for this check\. Files stay here\.<\/p>/);
  assert.match(fragment, /<\/div>\s*<\/div>\s*<button[^>]+id="choose-files"/);
  const disclosure = fragment.match(/<summary>What gets sent\?<\/summary>([\s\S]+?)<\/details>/)?.[1];
  assert.match(disclosure, /added to Does It ARM’s compatibility data/);
  assert.deepEqual([...disclosure.matchAll(/<li><code>([^<]+)<\/code><\/li>/g)].map((match) => match[1]),
    INFO_PLIST_ALLOWED_KEYS);
  for (const key of Object.keys(body)) {
    assert.ok(disclosure.includes(`<code>${key}</code>`));
  }
  assert.match(fragment, /https:\/\/doesitarm\.com\/terms">Terms/);
  assert.match(fragment, /https:\/\/doesitarm\.com\/privacy#scanner">Privacy/);
});
