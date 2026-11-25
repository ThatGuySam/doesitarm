import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { createResolver } from '../../pkg/worker/scan_wasm_factory.js';
import { DEFAULT_BUDGET, emptyResult } from '../public/scan-result.js';
import { createHandler } from '../worker/handler.js';
import { dnsResponse, fixture, rangedResponse } from './helpers.mjs';

const module = new WebAssembly.Module(readFileSync(new URL('../../pkg/worker/scan_wasm_bg.wasm', import.meta.url)));
const publisher = 'https://downloads.example.net';
const client = 'https://preview.example.net';
const target = publisher + '/product';
const pass = { limit: async () => ({ success: true }) };
const env = { SCAN_LIMIT: pass, DOWNLOAD_HOST_LIMIT: pass, DOWNLOAD_GLOBAL_LIMIT: pass };
const html = (body, headers) => new Response(body, { headers: { 'Content-Type': 'text/html', ...headers } });
const redirect = (url) => new Response(null, { status: 302, headers: { Location: url } });

function request(url = target, route = '/api/resolve', headers = {}) {
  return new Request(client + route, {
    method: 'POST',
    headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ url }),
  });
}

function handler(origin, options = {}) {
  const { addresses, ...overrides } = options;
  return createHandler({
    createResolver: () => createResolver(module),
    createScan: () => async (size) => JSON.stringify(emptyResult('complete', null, Number(size))),
    outbound: async (url, init) => {
      assert.equal(init.redirect, 'manual');
      assert.equal(init.credentials, 'omit');
      assert.equal(init.referrerPolicy, 'no-referrer');
      const headers = new Headers(init.headers);
      for (const secret of ['Cookie', 'Authorization', 'Referer']) assert.equal(headers.get(secret), null);
      if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url, addresses?.(url.searchParams.get('name')));
      assert.equal(headers.get('Accept-Encoding'), 'identity');
      return origin(url, headers, init.signal);
    },
    ...overrides,
  });
}

test('public page contract rejects IP literals, userinfo, private suffixes and non-HTTPS schemes', async () => {
  let calls = 0;
  const handle = handler(() => { calls++; });
  for (const url of [
    'https://127.0.0.1/', 'https://169.254.169.254/', 'https://[::1]/',
    'https://2130706433/', 'https://0177.0.0.1/', 'https://0x7f000001/',
    'https://8.8.8.8/', 'https://localhost./a', 'https://service.cluster.local/',
    'https://router.home.arpa/', 'https://preview.example.net./loop', 'https://safe.example.net:80/',
    'https://a@safe.example.net/', 'https://@safe.example.net/', 'https://a%40b@safe.example.net/',
    'https://safe.example.net\\@unexpected.example.net/', 'http://a.example.net/',
    'javascript:void(0)', 'data:text/html,read', 'file:///tmp/test', 'ftp://safe.example.net/',
  ]) assert.equal((await handle(request(url), env)).status, 400, url);
  assert.equal(calls, 0);
});

test('validates every redirect and DNS outcome before requesting a target', async () => {
  for (const bad of [
    'https://127.0.0.1/a', 'https://169.254.169.254/', 'https://[::1]/',
    'https://2130706433/', 'https://0177.0.0.1/', 'https://0x7f000001/',
    'https://attested@downloads.example.net/a', 'https://internal.example.net/',
    'javascript:alert(0)', 'data:text/html,body', 'file:///dev/null', 'ftp://example.net/',
  ]) {
    const visited = [];
    const handle = handler((url) => { visited.push(url.href); return redirect(bad); }, {
      addresses: (host) => host === 'internal.example.net' ? ['8.8.8.8', '10.0.0.1', '2606:4700::1111'] : undefined,
    });
    const result = await handle(request(), env);
    assert.equal(result.status, 400, bad);
    assert.deepEqual(visited, [target]);
    const message = await result.text();
    assert.ok(!message.includes('internal.example.net') && !message.includes('169.254'));
  }
});

test('rechecks DNS when a same-host redirect changes address', async () => {
  let dnsLookups = 0;
  const visits = [];
  const handle = handler((url) => {
    visits.push(url.href);
    return redirect('/redirected');
  }, { addresses: () => ++dnsLookups > 2 ? ['8.8.8.8', '3fff::1'] : undefined });
  assert.equal((await handle(request(), env)).status, 400);
  assert.deepEqual(visits, [target]);
});

test('bounds a chain of open redirects and detects a meta refresh loop', async () => {
  const paths = [];
  const handle = handler((url) => {
    paths.push(url.pathname);
    return redirect(publisher + '/r' + paths.length);
  });
  assert.equal((await handle(request(), env)).status, 422);
  assert.deepEqual(paths, ['/product', '/r1', '/r2', '/r3']);

  const loops = [];
  const refresh = handler((url) => {
    loops.push(url.pathname);
    const next = url.pathname === '/product' ? '/intermediate' : '/product';
    return html(`<meta http-equiv=refresh content="0; url=${next}">`);
  });
  assert.equal((await (await refresh(request(), env)).json()).decision, 'none');
  assert.deepEqual(loops, ['/product', '/intermediate']);
});

test('blocks large declared, streamed, endless and compressed bodies', async () => {
  let canceled = 0;
  const stream = (start) => new ReadableStream({ start, cancel() { canceled++; } });
  const cases = [
    [html(stream(() => {}), { 'Content-Length': String(3 * 1024 * 1024) }), 422],
    [html(stream((body) => body.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)))), 422],
    [html(stream(() => {})), 504],
    [html(stream((body) => body.enqueue(gzipSync(Buffer.alloc(4 * 1024 * 1024)))), { 'Content-Encoding': 'gzip' }), 422],
    [html(stream(() => {}), { 'Content-Encoding': 'br, gzip' }), 422],
  ];
  for (const [body, status] of cases) {
    const handle = handler(() => body, { discoveryTimeoutMs: 100 });
    const result = await handle(request(), env);
    assert.equal(result.status, status, await result.clone().text());
  }
  assert.equal(canceled, cases.length);
});

test('HTML structure limits and link-farm refusal schedule no candidate requests', async () => {
  const sources = [
    '<div>'.repeat(100),
    '<a href="/a">a</a>'.repeat(100_000),
    Array.from({ length: 12 }, (_, i) => `<a href="https://mirror${i}.example.net/tool.dmg">Mac</a>`).join(''),
  ];
  for (const body of sources) {
    const visits = [];
    const handle = handler((url) => { visits.push(url.href); return html(body); });
    const result = await (await handle(request(), env)).json();
    assert.equal(result.decision, 'none');
    assert.deepEqual(visits, [target]);
    assert.match(result.reason, /document_limit|too_many_hosts/);
  }
});

test('accepts only bounded file responses and re-probes before a scan', async () => {
  const bytes = readFileSync(fixture('hfsx.dmg'));
  const visits = [];
  const handle = handler((url, headers) => {
    visits.push([url.href, headers.get('Range')]);
    if (url.href === target) return html('<a href="/Tool-arm64.dmg">Download for Mac</a>');
    return rangedResponse(headers.get('Range'), bytes, { 'Content-Type': 'application/x-apple-diskimage' });
  });
  const found = await handle(request(), env);
  assert.equal(found.status, 200);
  const { decision, candidates } = await found.json();
  assert.equal(decision, 'resolved');
  assert.equal(candidates[0].arch, 'arm64');
  assert.equal(candidates[0].evidence.page, 'downloads.example.net');
  assert.equal(candidates[0].evidence.path, '/product');
  assert.equal(candidates[0].evidence.selector, 'a[href]');
  assert.equal(found.headers.get('Cache-Control'), 'no-store');
  const response = await handle(request(candidates[0].url, '/api/scan-download'), env);
  assert.equal((await response.json()).status, 'complete');
  assert.deepEqual(visits, [[target, null], [publisher + '/Tool-arm64.dmg', 'bytes=0-0'],
    [publisher + '/Tool-arm64.dmg', 'bytes=0-0']]);
});

test('rejects HTML, suspicious formats and unbounded files even with a download filename', async () => {
  for (const [type, suffix, size, expected] of [
    ['text/html', 'Tool.dmg', '100', 'no_public_download'],
    ['text/plain', 'Tool.dmg', '100', 'no_public_download'],
    ['application/octet-stream', 'Tool.dmg', String(DEFAULT_BUDGET + 1), 'artifact_too_large'],
    ['application/x-dosexec', 'Tool.dmg', '100', 'no_public_download'],
  ]) {
    const handle = handler((url) => url.href === target ? html(`<a href="/${suffix}">Mac download</a>`)
      : new Response('x', { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes 0-0/${size}` } }));
    const result = await (await handle(request(), env)).json();
    assert.equal(result.decision, 'none');
    assert.equal(result.reason, expected);
    const scan = await (await handle(request(`${publisher}/${suffix}`, '/api/scan-download'), env)).json();
    assert.equal(scan.status, 'source_error');
  }
});

test('validates candidates and second-document links with the same public policy', async () => {
  const visits = [];
  const handle = handler((url) => {
    visits.push(url.href);
    if (url.href === target) return html('<a href="https://private.example.net/Tool.dmg">Mac</a><meta http-equiv="refresh" content="0;url=/intermediate">');
    if (url.pathname === '/intermediate') return html('<a href="https://169.254.169.254/Tool.dmg">Mac</a><meta http-equiv=refresh content="0;url=/another-document">');
    if (url.pathname === '/another-document') return html('<a href="/final.dmg">Mac</a>');
    assert.fail('Unexpected target ' + url.pathname);
  }, { addresses: (host) => host === 'private.example.net' ? ['::1'] : undefined });
  const result = await (await handle(request(), env)).json();
  assert.equal(result.decision, 'none');
  assert.ok(!visits.includes('https://private.example.net/Tool.dmg'));
  assert.ok(!visits.includes(publisher + '/final.dmg'));
});

test('caps candidate attempts and hashes unresolved URLs in operational logs', async () => {
  const visits = [];
  const records = [];
  const handle = handler((url) => {
    visits.push(url.href);
    if (url.href === target + '?secret=private') return html(
      Array.from({ length: 9 }, (_, i) => `<a href="/Mac-${i}.dmg?key=private">Mac</a>`).join(''));
    return new Response(null, { status: 404 });
  }, { logUnresolved: (record) => records.push(record) });
  const result = await (await handle(request(target + '?secret=private'), env)).json();
  assert.equal(result.decision, 'none');
  assert.equal(visits.length, 4);
  assert.match(records[0].original_url, /^sha256:[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(records).includes('private'));
});

test('enforces client, global, per-host, busy and kill-switch controls before egress', async () => {
  let visits = 0;
  const handle = handler(() => { visits++; return html('Nothing'); });
  const reject = { limit: async () => ({ success: false }) };
  assert.equal((await handle(request(target, '/api/resolve', { 'Sec-Fetch-Site': 'cross-site' }), env)).status, 403);
  assert.equal((await handle(request(), { ...env, PAGE_RESOLUTION_DISABLED: 'true' })).status, 503);
  assert.equal((await handle(request(), { ...env, SCAN_LIMIT: reject })).status, 429);
  assert.equal((await handle(request(), { ...env, DOWNLOAD_GLOBAL_LIMIT: reject })).status, 429);
  assert.equal((await handle(request(), { ...env, DOWNLOAD_HOST_LIMIT: reject })).status, 429);
  const { promise, resolve } = Promise.withResolvers();
  const first = handle(request(), { ...env, SCAN_LIMIT: { limit: () => promise } });
  assert.equal((await handle(request(), env)).status, 503);
  resolve({ success: false });
  assert.equal((await first).status, 429);
  assert.equal(visits, 0);
});

test('revalidates a small public parsed response by URL and ETag', async () => {
  let origins = 0;
  const handle = handler((_url, headers) => {
    origins++;
    if (origins === 1) {
      assert.equal(headers.get('If-None-Match'), null);
      return html('<title>Downloads</title>', { ETag: '"v1"', 'Cache-Control': 'public, max-age=60' });
    }
    assert.equal(headers.get('If-None-Match'), '"v1"');
    return new Response(null, { status: 304 });
  });
  const first = await (await handle(request(), env)).json();
  const second = await (await handle(request(), env)).json();
  assert.deepEqual(first, second);
  assert.equal(origins, 2);
});

test('hands off the Mac App Store listing after an unconfirmed release route', async () => {
  const mobile = 'https://itunes.apple.com/us/app/tool/id111?mt=8';
  const desktop = 'https://itunes.apple.com/us/app/tool/id222?mt=12';
  const release = 'https://api.github.com/repos/acme/tool/releases/latest';
  const visits = [];
  const handle = handler((url) => {
    visits.push(url.href);
    if (url.href === target) {
      return html('<a href="' + mobile + '">App Store</a><a href="' + desktop +
        '">App Store</a><a href="https://github.com/acme/tool/releases">GitHub releases</a>');
    }
    assert.equal(url.href, release);
    return new Response(null, { status: 404 });
  });
  const result = await (await handle(request(), env)).json();
  assert.deepEqual(visits, [target, release]);
  assert.equal(result.decision, 'gated');
  assert.equal(result.reason, 'app_store');
  assert.deepEqual(result.handoff, { url: desktop, host: 'itunes.apple.com' });
});

test('honors anonymous forge API rate limits across requests', async () => {
  let apiCalls = 0;
  const project = 'https://github.com/acme/tool';
  const handle = handler((url) => {
    if (url.hostname === 'api.github.com') {
      apiCalls++;
      return new Response(null, { status: 403, headers: {
        'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + 120),
      } });
    }
    assert.equal(url.href, project);
    return html('<title>Project</title>');
  });
  assert.equal((await (await handle(request(project), env)).json()).reason, 'host_rate_limit');
  assert.equal((await (await handle(request(project), env)).json()).reason, 'host_rate_limit');
  assert.equal(apiCalls, 1);
});

test('reads one named Mac YAML feed and rejects executable-document MIME', async () => {
  const page = 'https://signal.org/download/';
  const feed = 'https://updates.signal.org/desktop/latest-mac.yml';
  const file = 'https://updates.signal.org/desktop/Signal-universal.dmg';
  for (const mime of ['application/yaml', 'text/javascript']) {
    const visits = [];
    const handle = handler((url, headers) => {
      visits.push(url.href);
      if (url.href === page) return html('<title>Signal downloads</title>');
      if (url.href === feed) {
        return new Response('version: 1.0.0\nfiles:\n  - url: Signal-universal.dmg\npath: decoy.dmg\n',
          { headers: { 'Content-Type': mime } });
      }
      assert.equal(url.href, file);
      assert.equal(headers.get('Range'), 'bytes=0-0');
      return new Response('x', { status: 206, headers: {
        'Content-Type': 'application/x-apple-diskimage', 'Content-Range': 'bytes 0-0/120',
      } });
    });
    const result = await (await handle(request(page), env)).json();
    assert.equal(result.decision, mime === 'application/yaml' ? 'resolved' : 'none');
    assert.deepEqual(visits, mime === 'application/yaml' ? [page, feed, file] : [page, feed]);
  }
});

test('uses the canonical Mac manifest before opaque links and cache-buster variants', async () => {
  const page = 'https://signal.org/download/';
  const feed = 'https://updates.signal.org/desktop/latest-mac.yml';
  const file = 'https://updates.signal.org/desktop/Signal-universal.dmg';
  const visits = [];
  const handle = handler((url) => {
    visits.push(url.href);
    if (url.href === page) return html(`<a href="/download/macos/">Mac</a><script>const source = "${feed}?bar=";</script>`);
    if (url.href === feed) return Response.json({ files: [{ url: 'Signal-universal.dmg' }] });
    assert.equal(url.href, file);
    return new Response('x', { status: 206, headers: {
      'Content-Type': 'application/x-apple-diskimage', 'Content-Range': 'bytes 0-0/120',
    } });
  });
  const result = await (await handle(request(page), env)).json();
  assert.equal(result.decision, 'resolved');
  assert.equal(result.candidates[0].url, file);
  assert.deepEqual(visits.slice(0, 3), [page, feed, file]);
});

test('permits the scoped GitHub Desktop handoff as one intermediate', async () => {
  const page = 'https://desktop.github.com/download/';
  const doc = 'https://github.com/apps/desktop';
  const file = 'https://cdn.example.net/Desktop-ARM64.dmg';
  const visits = [];
  const handle = handler((url) => {
    visits.push(url.href);
    if (url.href === page) return html(`<meta http-equiv=refresh content="0; url=${doc}">`);
    if (url.href === doc) return html(`<a href="${file}">Download macOS</a>`);
    assert.equal(url.href, file);
    return new Response('x', { status: 206, headers: {
      'Content-Type': 'application/x-apple-diskimage', 'Content-Range': 'bytes 0-0/120',
    } });
  });
  const result = await (await handle(request(page), env)).json();
  assert.equal(result.decision, 'resolved');
  assert.deepEqual(visits, [page, doc, file]);
});
