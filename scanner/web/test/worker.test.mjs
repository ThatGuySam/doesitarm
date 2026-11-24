import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { initSync, scan } from '../../pkg/scan_wasm.js';
import { DEFAULT_BUDGET, MAX_BUDGET, emptyResult } from '../public/scan-result.js';
import { createHandler } from '../worker/handler.js';
import { dnsResponse, expectedRemote, fixture, rangedResponse } from './helpers.mjs';

initSync({ module: new WebAssembly.Module(readFileSync(new URL('../../pkg/scan_wasm_bg.wasm', import.meta.url))) });
const target = 'https://downloads.example.net/test';
const client = 'https://preview.example.net';
const dmg = fixture('hfsx.dmg');
const bytes = readFileSync(dmg);
const env = {
  ASSETS: { fetch: async () => new Response('static fixture') },
  SCAN_LIMIT: { limit: async () => ({ success: true }) },
};

function request(url = target, budget, method = 'GET') {
  const endpoint = new URL('/api/scan', client);
  if (url !== null) endpoint.searchParams.set('url', url);
  if (budget !== undefined) endpoint.searchParams.set('budget', budget);
  return new Request(endpoint, { method });
}

function withDNS(outbound, addresses) {
  return (url, options) => url.hostname === 'cloudflare-dns.com'
    ? Promise.resolve(dnsResponse(url, addresses))
    : outbound(url, options);
}

test('serves assets and rejects invalid targets without outbound fetches', async () => {
  const handle = createHandler({
    scan,
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
    scan,
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

test('blocks a private DNS answer or redirect before requesting its body', async () => {
  const privateHost = createHandler({
    scan,
    outbound: withDNS(async () => assert.fail('Private hostname reached'), ['93.184.215.14', '::ffff:127.0.0.1']),
  });
  assert.equal((await privateHost(request(), env)).status, 400);

  const redirected = createHandler({
    scan,
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
    [new Response(stream(), { status: 200 }), /206/],
    [new Response(stream(), { status: 206, headers: { 'Content-Range': 'bytes 0-0/*' } }), /Content-Range/],
    [new Response(stream(), { status: 206, headers: { 'Content-Range': 'bytes 0-0/100',
      'Content-Encoding': 'gzip' } }), /encoded/],
    [new Response(stream(), { status: 206, headers: { 'Content-Range': 'bytes 0-0/100' } }), /exceeded/],
  ]) {
    const handle = createHandler({ scan, outbound: withDNS(async () => response) });
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
    scan,
    outbound: withDNS(async (_url, { headers }) => {
      const range = headers.get('Range');
      return rangedResponse(range, bytes, range === 'bytes=0-0' ? {} : { ETag: '"changed"' });
    }),
  });
  const changed = await changing(request(), env);
  assert.equal(changed.status, 502);
  assert.match((await changed.json()).error, /ETag changed/);

  const consistent = createHandler({ scan, outbound: withDNS(async (_url, { headers }) =>
    rangedResponse(headers.get('Range'), bytes)) });
  const small = await consistent(request(target, 600), env);
  assert.deepEqual(await small.json(), expectedRemote(dmg, 600));
  assert.equal((await (await consistent(request(target, 600), env)).json()).status, 'budget_exhausted');

  const cap = createHandler({
    scan: async (size, budget) => {
      assert.equal(size, 900_000_000n);
      assert.equal(budget, BigInt(MAX_BUDGET - 1));
      return JSON.stringify(emptyResult('complete', null, Number(size)));
    },
    outbound: withDNS(async () => new Response('x', {
      status: 206, headers: { 'Content-Range': 'bytes 0-0/900000000' },
    })),
  });
  assert.equal((await cap(request(target, '999999999999'), env)).status, 200);
});

test('caps redirects, total subrequests and wall time', async () => {
  let redirects = 0;
  const loop = createHandler({
    scan,
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
    scan: async (size, _budget, read) => {
      const partial = emptyResult('complete', null, Number(size));
      partial.bundle_id = 'partial.evidence';
      try {
        for (let index = 0; index < 100; index += 1) await read(1n, 1);
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
  assert.equal(limited.bytes_read, 34);

  const slow = createHandler({
    scan,
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
    scan,
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
