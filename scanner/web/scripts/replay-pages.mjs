import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createResolver } from '../../pkg/worker/scan_wasm_factory.js';
import { DEFAULT_BUDGET } from '../public/scan-result.js';
import { createDownloadService } from '../worker/downloads.js';
import { validatePageTarget } from '../worker/egress.js';
import { dnsResponse } from '../test/helpers.mjs';
import { digest } from '../worker/http-body.js';

const defaultData = join(homedir(), 'Code/doesitarm-data/download-pages');
const baselineFile = new URL('../../crates/page-resolver/tests/corpus-baseline.json', import.meta.url);
const module = new WebAssembly.Module(await readFile(new URL('../../pkg/worker/scan_wasm_bg.wasm', import.meta.url)));
const ownHost = 'preview.fixture.net';
const env = { DOWNLOAD_HOST_LIMIT: { limit: async () => ({ success: true }) } };
const redirects = new Set([301, 302, 303, 307, 308]);
const ARTIFACT = new Set(['direct_file', 'redirect', 'installer_stub']);

function key(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    if (['www.dropbox.com', 'dropbox.com'].includes(url.hostname) &&
        (url.pathname.startsWith('/s/') || url.pathname.startsWith('/scl/fi/'))) {
      url.searchParams.delete('dl');
      url.searchParams.delete('raw');
    }
    return url.href;
  } catch {
    return null;
  }
}

async function loadFixture(directory, path) {
  if (!path) return null;
  assert.ok(!isAbsolute(path) && normalize(path).startsWith('snapshots/'), 'Fixture paths must stay in snapshots');
  return gunzipSync(await readFile(join(directory, path)), { maxOutputLength: 4 * 1024 * 1024 });
}

function registerChain(map, requested, final, chain, end) {
  const first = key(requested);
  const last = key(final) ?? first;
  if (!first || !last) return;
  if (first !== last && !(chain?.some((hop) => redirects.has(hop.status)))) {
    map.set(first, { status: 302, redirect: last });
  }
  for (let i = 0; i < (chain?.length ?? 0); i++) {
    const hop = chain[i];
    const url = key(hop.url);
    const location = key(chain[i + 1]?.url ?? hop.location ?? last);
    if (url && location && url !== location && redirects.has(hop.status)) {
      map.set(url, { status: hop.status, redirect: location });
    }
  }
  // Some captures trim signature fields or CDN path components in one
  // observation but retain the same terminal response under its chain URL.
  const terminal = chain?.at(-1);
  const terminalAlias = terminal && !redirects.has(terminal.status) ? key(terminal.url) : null;
  if (terminalAlias) map.set(terminalAlias, end);
  map.set(last, end);
}

function sizeOf(observation) {
  const range = /^bytes 0-0\/(\d+)$/.exec(observation.content_range ?? '');
  return Number(range?.[1] ?? observation.content_length);
}

function registerArtifacts(map, row, seat) {
  const official = new Set();
  const exactlyRanged = new Set();
  for (const link of row.download_links ?? row.macos_download_links ?? []) {
    const verification = link.verification ?? {};
    const range = seat === 'astra' ? verification.range_0_0 : verification.method === 'RANGE' ? verification : null;
    const sampled = seat === 'astra' ? verification.byte_range_confirmed === true : range?.status === 206;
    const headersOnly = seat === 'sol' && verification.verification_state === 'file_headers' && !sampled;
    const observation = sampled ? range : seat === 'astra' ? verification.range_0_0 ?? verification.head : verification;
    const valid = sampled || headersOnly;
    if (!observation || !link.url) continue;
    if (valid) {
      // A captured redirect hop represents the same observed artifact. This
      // includes stable GitHub release URLs ahead of expiring storage URLs.
      const chain = observation.chain ?? observation.redirect_chain ?? [];
      for (const url of [link.url, observation.final_url, ...chain.map((hop) => hop.url)].map(key).filter(Boolean)) {
        official.add(url);
        if (sampled) exactlyRanged.add(url);
      }
    }
    const name = observation.content_disposition_filename ?? observation.filename;
    const size = sizeOf(observation);
    const end = {
      status: observation.terminal_status ?? observation.status ?? 404,
      type: observation.content_type ?? 'application/octet-stream',
      disposition: observation.content_disposition ?? (name ? 'attachment; filename="' + name + '"' : undefined),
      ...(valid && Number.isSafeInteger(size) && size > 1 ? { file: true, size, synthetic: !sampled } : {}),
    };
    registerChain(map, link.url, observation.final_url, observation.chain ?? observation.redirect_chain, end);
  }
  return { official, exactlyRanged };
}

function registerMetadata(map, data) {
  if (!data) return;
  const list = data.responses ?? data.documents ?? [data];
  for (const doc of list) {
    const endpoint = doc.endpoint ?? doc.source;
    if (!endpoint) continue;
    const response = doc.response ?? doc;
    const bytes = doc.body_text ?? (Object.hasOwn(doc, 'body') || Object.hasOwn(doc, 'payload')
      ? JSON.stringify(doc.body ?? doc.payload) : null);
    if (bytes === null) continue;
    const end = { status: response.status ?? 200, type: doc.body_text ? response.content_type : 'application/json', bytes };
    registerChain(map, endpoint, response.final_url, response.chain ?? doc.redirect_chain, end);
  }
}

async function buildReplay(row, seat, directory) {
  const map = new Map();
  const { official, exactlyRanged } = registerArtifacts(map, row, seat);
  const root = await loadFixture(directory, typeof row.snapshot === 'string' ? row.snapshot : row.snapshot?.path);
  if (root && row.snapshot?.sha256_uncompressed) assert.equal(await digest(root), row.snapshot.sha256_uncompressed);
  registerChain(map, row.page_url, row.final_page_url, row.page_redirect_chain, {
    status: row.http_status ?? 404, type: row.content_type ?? 'text/html',
    bytes: root ?? (row.page_challenge_signal ? '<title>Client Challenge</title>' : ''),
  });
  for (const page of row.supporting_pages ?? row.intermediate_pages ?? []) {
    const bytes = await loadFixture(directory, page.snapshot);
    const response = page.response ?? page;
    if (bytes) registerChain(map, page.request_url ?? page.endpoint, response.final_url, response.chain, {
      status: response.status ?? 200, bytes, type: response.content_type ?? 'text/html',
    });
  }
  const metadata = await loadFixture(directory, row.api_snapshot ?? row.api_fixture?.snapshot);
  if (metadata) registerMetadata(map, JSON.parse(metadata.toString('utf8')));
  return { map, official, exactlyRanged, root };
}

function network(map, allowSynthetic, misses) {
  return async (url, options) => {
    if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url);
    const endpoint = map.get(key(url));
    if (!endpoint) {
      misses.add(url.href);
      return new Response(null, { status: 404 });
    }
    if (endpoint.redirect) return new Response(null, { status: endpoint.status, headers: { Location: endpoint.redirect } });
    const headers = new Headers({ 'Content-Type': endpoint.type });
    if (endpoint.disposition) headers.set('Content-Disposition', endpoint.disposition);
    if (endpoint.file && (!endpoint.synthetic || allowSynthetic)) {
      if (new Headers(options.headers).get('Range') === 'bytes=0-0') {
        headers.set('Content-Range', 'bytes 0-0/' + endpoint.size);
        headers.set('Content-Length', '1');
        return new Response(new Uint8Array([0]), { status: 206, headers });
      }
      headers.set('Content-Length', String(endpoint.size));
      return new Response(null, { status: 200, headers });
    }
    if (endpoint.status === 200) return new Response(endpoint.bytes ?? '', { status: 200, headers });
    return new Response(null, { status: endpoint.status, headers });
  };
}

function classify(result, official) {
  if (result.decision === 'gated') return 'gated';
  if (result.decision === 'ambiguous') return 'ambiguous';
  if (result.decision !== 'resolved') return 'unresolved';
  return official.has(key(result.candidates[0]?.url)) ? 'correct' : 'wrong';
}

function countByPattern(results) {
  const patterns = new Map();
  for (const row of results) {
    const id = row.seat + '/' + row.pattern;
    const counts = patterns.get(id) ?? { rows: 0, correct: 0, wrong: 0, ambiguous: 0, unresolved: 0, gated: 0 };
    counts.rows++;
    counts[row.outcome]++;
    patterns.set(id, counts);
  }
  return [...patterns].sort(([a], [b]) => a.localeCompare(b));
}

async function replay(directory = defaultData, kit) {
  const results = [];
  const runtime = createResolver(module);
  const sources = ['sol', 'astra'].map((seat) => ({ seat, base: join(directory, seat) }));
  if (kit) sources.push({ seat: 'kit', base: kit });
  for (const { seat, base } of sources) {
    const corpus = seat === 'kit'
      ? [JSON.parse(await readFile(join(base, 'case.json'), 'utf8'))]
      : (await readFile(join(base, 'corpus.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(corpus.length, seat === 'kit' ? 1 : 100, 'Expected every recorded row');
    for (const row of corpus) {
      const { map, official, exactlyRanged, root } = await buildReplay(row, seat === 'kit' ? 'astra' : seat, base);
      if (seat === 'kit') assert.ok(root && exactlyRanged.size, 'The kit needs HTML and a recorded one-byte range');
      async function run(adapters, budget, allowSynthetic, misses) {
        try {
          const instance = createDownloadService({ createResolver: () => runtime, outbound: network(map, allowSynthetic, misses) });
          return await instance.resolveDownload({
            target: validatePageTarget(row.page_url, ownHost), ownHost, env, budget, adapters,
            signal: AbortSignal.timeout(5_000),
          });
        } catch (error) {
          if (error?.name === 'TimeoutError') throw error;
          return { decision: 'none', reason: 'transport_limit', candidates: [] };
        }
      }
      const misses = new Set();
      const result = await run(true, Number.MAX_SAFE_INTEGER, true, misses);
      const generic = await run(false, Number.MAX_SAFE_INTEGER, true, new Set());
      const worker = await run(true, DEFAULT_BUDGET, false, new Set());
      const staticResult = root ? JSON.parse(runtime.resolvePage(root, row.final_page_url, row.http_status,
        row.content_type ?? 'text/html', '', true)) : null;
      const top = staticResult?.candidates.find((candidate) => ARTIFACT.has(candidate.kind) && candidate.score >= 48);
      if ((process.env.PAGE_REPLAY_TRACE ?? '').split(',').includes(seat + '/' + row.id)) {
        console.error(JSON.stringify({
          id: row.id, requestsWithoutCapture: [...misses], rootCandidates: staticResult?.candidates, result,
        }, null, 2));
      }
      const outcome = classify(result, official);
      const listedExpected = result.candidates.length > 0 && result.candidates.every((candidate) => official.has(key(candidate.url)));
      const good = (outcome === 'correct' || outcome === 'ambiguous') && listedExpected;
      const genericFound = generic.candidates.some((candidate) => official.has(key(candidate.url)));
      const expectedGate = seat === 'astra' ? row.coverage_class === 'gate-or-managed' :
        row.resolution_state === 'gate_or_no_direct_file' && !['package_manager', 'shell_installer', 'source_only', 'web_installer'].includes(row.exposure_pattern);
      results.push({
        id: seat + '/' + row.id, seat, pattern: row.exposure_pattern,
        known: official.size > 0, captured: root !== null, expectedGate, outcome, reason: result.reason,
        genericFound, good,
        rangedWithinBudget: worker.candidates.some((candidate) => exactlyRanged.has(key(candidate.url))),
        unconfirmedStaticTop: Boolean(official.size && top && staticResult.decision === 'resolved' && !official.has(key(top.url))),
        urls: result.candidates.map((candidate) => candidate.url),
        misses: misses.size,
      });
    }
  }
  return results;
}

function summary(results) {
  return {
    totals: Object.fromEntries(['sol', 'astra'].map((seat) => {
      const rows = results.filter((row) => row.seat === seat);
      const count = (check) => rows.filter(check).length;
      return [seat, {
        rows: rows.length, captured: count((r) => r.captured), known: count((r) => r.known),
        correct: count((r) => r.outcome === 'correct'), wrong: count((r) => r.outcome === 'wrong'),
        ambiguous: count((r) => r.outcome === 'ambiguous'), unresolved: count((r) => r.outcome === 'unresolved'),
        gated: count((r) => r.outcome === 'gated'), expectedGates: count((r) => r.expectedGate),
        recognizedGates: count((r) => r.expectedGate && r.outcome === 'gated'),
        genericFound: count((r) => r.good && r.genericFound),
        adaptersAdded: count((r) => r.good && !r.genericFound),
        rangedWithinBudget: count((r) => r.rangedWithinBudget),
        unconfirmedStaticTop: count((r) => r.unconfirmedStaticTop),
      }];
    })),
    patterns: countByPattern(results),
  };
}

const args = process.argv.slice(2);
const results = await replay(process.env.PAGE_CORPUS_DIR ?? defaultData, process.env.PAGE_REPLAY_KIT);
const corpus = results.filter((row) => row.seat !== 'kit');
const current = Object.fromEntries(await Promise.all(corpus.map(async (row) => [
  row.id, {
    outcome: row.outcome, urls: await Promise.all(row.urls.map(digest)),
    rangedWithinBudget: row.rangedWithinBudget,
  },
])));
assert.equal(corpus.length, 200);
if (args.includes('--details')) console.log(JSON.stringify(results, null, 2));
const wrong = results.filter(({ outcome }) => outcome === 'wrong').map(({ id }) => id);
assert.deepEqual(wrong, [], 'No wrong artifact may be selected');
assert.equal(results.filter(({ outcome, good }) => outcome === 'ambiguous' && !good).length, 0, 'Every offered choice must match a recorded artifact');
if (args.includes('--write-baseline')) await writeFile(baselineFile, JSON.stringify(current, null, 2) + '\n');
if (args.includes('--verify')) {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
  assert.deepEqual(Object.keys(current), Object.keys(baseline));
  for (const [id, old] of Object.entries(baseline)) {
    const now = current[id];
    const progress = old.outcome === 'unresolved' && ['correct', 'ambiguous', 'gated'].includes(now.outcome);
    const disambiguated = old.outcome === 'ambiguous' && now.outcome === 'correct' &&
      now.urls.some((url) => old.urls.includes(url));
    if (!progress && !disambiguated) {
      assert.equal(now.outcome, old.outcome, id);
      assert.deepEqual(now.urls, old.urls, id);
    }
    if (old.rangedWithinBudget) assert.equal(now.rangedWithinBudget, true, id + ' lost a file within the Worker cap');
  }
}
if (args.includes('--target')) {
  const id = args[args.indexOf('--target') + 1];
  assert.ok(results.find((row) => row.id === id)?.outcome === 'correct', id + ' did not resolve to its recorded artifact');
}
if (!args.includes('--details')) console.log(JSON.stringify(summary(corpus), null, 2));
