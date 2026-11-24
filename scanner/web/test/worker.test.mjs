import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createScanner } from '../../pkg/worker/scan_wasm_factory.js';
import { DEFAULT_BUDGET, emptyResult } from '../public/scan-result.js';
import { createHandler } from '../worker/handler.js';
import { dnsResponse, expectedRemote, fixture, rangedResponse } from './helpers.mjs';

const module = new WebAssembly.Module(readFileSync(new URL('../../pkg/worker/scan_wasm_bg.wasm', import.meta.url)));
const createScan = () => createScanner(module);
const target = 'https://downloads.example.net/test';
const client = 'https://preview.example.net';
const dmg = fixture('hfsx.dmg');
const bytes = readFileSync(dmg);
const env = {
  ASSETS: { fetch: async () => new Response('static fixture') },
  SCAN_LIMIT: { limit: async () => ({ success: true }) },
};

function request(url = target, budget, method = 'GET', headers = { 'Sec-Fetch-Site': 'same-origin' }) {
  const endpoint = new URL('/api/scan', client);
  if (url !== null) endpoint.searchParams.set('url', url);
  if (budget !== undefined) endpoint.searchParams.set('budget', budget);
  return new Request(endpoint, { method, headers });
}

function withDNS(outbound, addresses) {
  return (url, options) => url.hostname === 'cloudflare-dns.com'
    ? Promise.resolve(dnsResponse(url, addresses))
    : outbound(url, options);
}

test('serves assets and rejects invalid targets without outbound fetches', async () => {
  const handle = createHandler({
    createScan,
    outbound: async () => assert.fail('Unexpected outbound request'),
  });
  assert.equal(await (await handle(new Request(client), env)).text(), 'static fixture');
  assert.equal((await handle(new Request(`${client}/api/other`), env)).status, 404);
  assert.equal((await handle(request(target, 8, 'POST'), env)).headers.get('Allow'), 'GET');
  for (const url of [
    null, 'http://example.com/a', 'https://x:y@example.com/a', 'https://example.com:444/a',
    'https://127.0.0.1/', 'https://2130706433/', 'https://192.168.1.1/', 'https://169.254.169.254/',
    'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[fc00::1]/', 'https://[fe80::1]/',
    'https://preview.example.net./a', 'https://localhost/', 'https://test.local/',
    'https://8.8.8.8/',
  ]) {
    const response = await handle(request(url), env);
    assert.equal(response.status, 400, url);
    assert.equal((await response.json()).status, 'source_error', url);
  }
  for (const badBudget of ['', '-1', '1e6', '1.5']) {
    assert.equal((await handle(request(target, badBudget), env)).status, 400);
  }
  const zero = await handle(request(target, 0), env);
  assert.deepEqual(await zero.json(), expectedRemote(dmg, 0));
});

test('follows HTTPS redirects, validates each DNS destination, and returns CLI-equivalent JSON', async () => {
  const ranges = [];
  const dns = [];
  const handle = createHandler({
    createScan,
    outbound: async (url, options) => {
      if (url.hostname === 'cloudflare-dns.com') {
        dns.push(url.searchParams.get('name'));
        return dnsResponse(url);
      }
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.get('Accept-Encoding'), 'identity');
      assert.equal(options.headers.get('Authorization'), null);
      assert.equal(options.headers.get('Cookie'), null);
      const range = options.headers.get('Range');
      ranges.push([url.hostname, range]);
      if (url.hostname === 'downloads.example.net') {
        return new Response(null, { status: 302, headers: { Location: 'https://cdn.example.net/file' } });
      }
      if (ranges.length > 2) assert.equal(options.headers.get('If-Match'), '"fixture"');
      return rangedResponse(range, bytes);
    },
  });

  const response = await handle(request(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), expectedRemote(dmg, DEFAULT_BUDGET));
  assert.deepEqual(ranges.slice(0, 2), [
    ['downloads.example.net', 'bytes=0-0'],
    ['cdn.example.net', 'bytes=0-0'],
  ]);
  assert.ok(ranges.slice(1).every(([host]) => host === 'cdn.example.net'));
  assert.deepEqual(dns, ['downloads.example.net', 'downloads.example.net', 'cdn.example.net', 'cdn.example.net']);
});

test('Worker JSON masks home paths in metadata and binary inventory', async () => {
  const handle = createHandler({
    createScan: () => async () => JSON.stringify({
      ...emptyResult('complete', null, bytes.length),
      bundle_path: '/home/fixture-owner/Sample.app',
      inventory: {
        binaries: [{ path: String.raw`C:\Users\local-account\Helper`, role: 'helper', architectures: [] }],
      },
    }),
    outbound: withDNS(async (_url, { headers }) => rangedResponse(headers.get('Range'), bytes)),
  });

  const response = await handle(request(), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.bundle_path, '/Users/<user>/Sample.app');
  assert.equal(result.inventory.binaries[0].path, '/Users/<user>/Helper');
  assert.equal(result.inventory.binaries[0].role, 'helper');
});

test('blocks a private DNS answer or redirect before requesting its body', async () => {
  const privateHost = createHandler({
    createScan,
    outbound: withDNS(async () => assert.fail('Private hostname reached'), ['93.184.215.14', '::ffff:127.0.0.1']),
  });
  assert.equal((await privateHost(request(), env)).status, 400);

  const redirected = createHandler({
    createScan,
    outbound: withDNS(async (url) => {
      assert.equal(url.hostname, 'downloads.example.net');
      return new Response(null, { status: 307, headers: { Location: 'https://169.254.169.254/latest' } });
    }),
  });
  const response = await redirected(request(), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /blocked/);
});

test('rejects and cancels a whole-file response, wrong metadata, or oversized body', async () => {
  let cancelled = 0;
  const stream = () => new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([1, 2])); },
    cancel() { cancelled += 1; },
  });
  for (const [response, message] of [
    [new Response(stream(), { status: 200 }), /usable byte range/],
    [new Response(stream(), { status: 206, headers: { 'Content-Range': 'bytes 0-0/*' } }), /Content-Range/],
    [new Response(stream(), { status: 206, headers: { 'Content-Range': 'bytes 0-0/100',
      'Content-Encoding': 'gzip' } }), /encoded/],
    [new Response(stream(), { status: 206, headers: { 'Content-Range': 'bytes 0-0/100' } }), /exceeded/],
  ]) {
    const handle = createHandler({ createScan, outbound: withDNS(async () => response) });
    const reply = await handle(request(), env);
    assert.equal(reply.status, 502);
    const result = await reply.json();
    assert.equal(result.bytes_read, 0);
    assert.equal(result.reads, 1);
    assert.match(result.error, message);
  }
  assert.equal(cancelled, 4);
});

test('reports representation changes and enforces small and oversized budgets', async () => {
  const changing = createHandler({
    createScan,
    outbound: withDNS(async (_url, { headers }) => {
      const range = headers.get('Range');
      return rangedResponse(range, bytes, range === 'bytes=0-0' ? {} : { ETag: '"changed"' });
    }),
  });
  const changed = await changing(request(), env);
  assert.equal(changed.status, 502);
  assert.match((await changed.json()).error, /ETag changed/);

  const consistent = createHandler({ createScan, outbound: withDNS(async (_url, { headers }) =>
    rangedResponse(headers.get('Range'), bytes)) });
  const small = await consistent(request(target, 600), env);
  assert.deepEqual(await small.json(), expectedRemote(dmg, 600));
  assert.equal((await (await consistent(request(target, 600), env)).json()).status, 'budget_exhausted');

  const requestBudgets = [];
  const cap = createHandler({
    createScan: () => async (size, budget, _read, _decoded, profile) => {
      assert.equal(size, 900_000_000n);
      assert.equal(profile, 'worker');
      requestBudgets.push(budget);
      return JSON.stringify(emptyResult('complete', null, Number(size)));
    },
    outbound: withDNS(async () => new Response('x', {
      status: 206, headers: { 'Content-Range': 'bytes 0-0/900000000' },
    })),
  });
  for (const configured of [undefined, '1024', 'invalid']) {
    for (const budget of [undefined, '999999999999']) {
      assert.equal((await cap(request(target, budget), { ...env, SCAN_MAX_BUDGET: configured })).status, 200);
    }
  }
  const normal = BigInt(DEFAULT_BUDGET - 1);
  assert.deepEqual(requestBudgets, [normal, normal, 1023n, 1023n, normal, normal]);
});

test('caps redirects, total subrequests and wall time', async () => {
  let redirects = 0;
  const loop = createHandler({
    createScan,
    outbound: withDNS(async () => {
      redirects += 1;
      return new Response(null, { status: 301, headers: { Location: '/redirect' } });
    }),
  });
  const looped = await loop(request(), env);
  assert.equal(looped.status, 503);
  assert.match((await looped.json()).error, /redirect limit/);
  assert.equal(redirects, 7);

  let fetches = 0;
  const capped = createHandler({
    createScan: () => async (size, _budget, read) => {
      const partial = emptyResult('complete', null, Number(size));
      partial.bundle_id = 'partial.evidence';
      try {
        for (let index = 0; index < 100; index += 1) {
          await read(BigInt(index), 1);
          partial.bytes_read += 1;
        }
      } catch {
        partial.status = 'source_error';
      }
      return JSON.stringify(partial);
    },
    outbound: async (url, options) => {
      fetches += 1;
      if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url);
      return rangedResponse(options.headers.get('Range'), bytes);
    },
  });
  const limited = await (await capped(request(), env)).json();
  assert.equal(fetches, 36);
  assert.equal(limited.status, 'limit_reached');
  assert.equal(limited.bundle_id, 'partial.evidence');
  assert.equal(limited.bytes_read, 33);
  assert.equal(limited.bytes_requested, 35);

  const slow = createHandler({
    createScan,
    timeoutMs: 15,
    outbound: withDNS(async (_url, { signal }) => new Promise((resolve, reject) => {
      const activeTimer = setTimeout(resolve, 500);
      signal.addEventListener('abort', () => {
        clearTimeout(activeTimer);
        reject(signal.reason);
      }, { once: true });
    })),
  });
  const timed = await slow(request(), env);
  assert.equal(timed.status, 504);
  assert.equal((await timed.json()).status, 'limit_reached');
});

test('returns retry information for rate-limited callers and a busy isolate', async () => {
  const started = Promise.withResolvers();
  const held = Promise.withResolvers();
  const handle = createHandler({
    createScan,
    outbound: withDNS(async (_url, { headers }) => {
      started.resolve();
      await held.promise;
      return rangedResponse(headers.get('Range'), bytes);
    }),
  });
  const blocked = await handle(request(), { SCAN_LIMIT: { limit: async () => ({ success: false }) } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');

  const first = handle(request(), env);
  await started.promise;
  try {
    const busy = await handle(request(), env);
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get('Retry-After'), '3');
  } finally {
    held.resolve();
    await first;
  }
});


test('requires a same-origin browser request or the scanner client header', async () => {
  const handle = createHandler({
    createScan: () => assert.fail('Unexpected Wasm initialization'),
    outbound: async () => assert.fail('Unexpected outbound request'),
  });
  const noToken = { SCAN_LIMIT: { limit: async () => assert.fail('Unexpected rate-limit token') } };
  for (const headers of [
    {},
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
    { 'X-Scan-Client': 'unknown' },
  ]) {
    assert.equal((await handle(request(target, 0, 'GET', headers), noToken)).status, 403);
  }
  for (const headers of [{ 'Sec-Fetch-Site': 'same-origin' }, { 'X-Scan-Client': 'browser' }]) {
    assert.equal((await handle(request(target, 0, 'GET', headers), noToken)).status, 200);
  }
});

test('normalizes rate-limit keys and spends no token on busy requests', async () => {
  const keys = [];
  const waiting = Promise.withResolvers();
  const release = Promise.withResolvers();
  const handler = createHandler({
    createScan: () => async () => JSON.stringify(emptyResult('complete', null)),
    outbound: withDNS(async (_url, { headers }) => rangedResponse(headers.get('Range'), bytes)),
  });
  const requestFrom = (ip) => request(target, undefined, 'GET', {
    'X-Scan-Client': 'browser',
    'CF-Connecting-IP': ip,
  });
  const limiter = { SCAN_LIMIT: { limit: async ({ key }) => {
    keys.push(key);
    if (keys.length === 1) {
      waiting.resolve();
      await release.promise;
    }
    return { success: true };
  } } };
  const first = handler(requestFrom('2001:db8:abcd:1234::1'), limiter);
  await waiting.promise;
  try {
    assert.equal((await handler(requestFrom('2001:db8:abcd:1234::2'), limiter)).status, 503);
    assert.equal(keys.length, 1);
  } finally {
    release.resolve();
    assert.equal((await first).status, 200);
  }
  for (const ip of ['2001:0db8:abcd:1234:ffff:0000:0000:0002', '2001:db8:abcd:1235::1',
    '198.51.100.9', '::ffff:198.51.100.9']) {
    assert.equal((await handler(requestFrom(ip), limiter)).status, 200);
  }
  assert.deepEqual(keys, [
    '2001:db8:abcd:1234::/64', '2001:db8:abcd:1234::/64', '2001:db8:abcd:1235::/64',
    '198.51.100.9', '198.51.100.9',
  ]);
});

test('hard timeout and Wasm trap both release the isolate and replace the scanner', async () => {
  let instances = 0;
  let rangeSignal;
  const handler = createHandler({
    timeoutMs: 100,
    createScan: () => {
      const instance = ++instances;
      return async () => {
        if (instance === 1) return new Promise(() => {});
        if (instance === 2) throw new WebAssembly.RuntimeError('internal fixture trap');
        return JSON.stringify(emptyResult('complete', null));
      };
    },
    outbound: withDNS(async (_url, { headers, signal }) => {
      rangeSignal = signal;
      return rangedResponse(headers.get('Range'), bytes);
    }),
  });
  const timed = await handler(request(), env);
  assert.equal(timed.status, 504);
  assert.equal((await timed.json()).status, 'limit_reached');
  assert.ok(rangeSignal.aborted);
  const trapped = await handler(request(), env);
  assert.equal(trapped.status, 503);
  const error = await trapped.json();
  assert.equal(error.status, 'limit_reached');
  assert.doesNotMatch(error.error, /internal fixture trap/);
  assert.equal((await handler(request(), env)).status, 200);
  assert.equal((await handler(request(), env)).status, 200);
  assert.equal(instances, 3);
});

test('deadline also rejects scans that finish after blocking the timer', async () => {
  const handler = createHandler({
    timeoutMs: 20,
    createScan: () => () => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
      return JSON.stringify(emptyResult('complete', null));
    },
    outbound: withDNS(async (_url, { headers }) => rangedResponse(headers.get('Range'), bytes)),
  });
  assert.equal((await handler(request(), env)).status, 504);
});

test('Worker glue creates independent Wasm instances', async () => {
  const instantiate = WebAssembly.Instance;
  const memories = [];
  WebAssembly.Instance = new Proxy(instantiate, {
    construct(target, args) {
      const instance = Reflect.construct(target, args);
      memories.push(instance.exports.memory);
      return instance;
    },
  });
  let first;
  let second;
  try {
    first = createScan();
    second = createScan();
  } finally {
    WebAssembly.Instance = instantiate;
  }
  assert.equal(memories.length, 2);
  assert.notEqual(memories[0], memories[1]);
  assert.throws(() => memories[0].grow(1280), RangeError); // An additional 80 MiB would exceed the Worker memory ceiling.
  const sample = readFileSync(fixture('thin.macho'));
  const results = await Promise.all([first, second].map((scan) => scan(
    BigInt(sample.length), BigInt(DEFAULT_BUDGET),
    (offset, length) => sample.subarray(Number(offset), Number(offset) + length),
  )));
  assert.ok(results.every((result) => JSON.parse(result).status === 'complete'));
});

test('Worker origin errors keep upstream status and ETag private after discovery', async () => {
  for (const status of [200, 429, 451]) {
    const handler = createHandler({
      createScan,
      outbound: withDNS(async (_url, { headers }) => {
        const range = headers.get('Range');
        if (range === 'bytes=0-0') return rangedResponse(range, bytes, { ETag: '"private-origin"' });
        return new Response('private body', { status, headers: { ETag: '"private-latest"' } });
      }),
    });
    const reply = await handler(request(), env);
    assert.equal(reply.status, 502);
    const result = await reply.json();
    assert.equal(result.status, 'source_error');
    assert.equal(result.error, 'The download origin did not provide a usable byte range.');
    assert.equal(result.source_etag, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private-origin|private-latest|private body/);
  }
});

test('deployment declares CPU and subrequest limits alongside the anonymous budget', () => {
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /^\[limits\]\ncpu_ms = 5000\nsubrequests = 36$/m);
  assert.match(config, /^\[vars\]\nSCAN_MAX_BUDGET = "8388608"$/m);
});
