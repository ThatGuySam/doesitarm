import { discard, RangeFailure } from '../public/range-scan.js';
import { createPageEgress, validatePageTarget } from './egress.js';
import { contentType, digest, identityEncoding, readBounded } from './http-body.js';

const HTML = new Set(['text/html', 'application/xhtml+xml']);
const DOCUMENTS = new Set([
  ...HTML, 'application/json', 'text/plain', 'application/xml', 'text/xml',
  'application/rss+xml', 'application/atom+xml',
]);
const FEED_TYPES = new Set(['text/yaml', 'application/yaml', 'application/x-yaml', 'text/x-yaml']);
const FILE_TYPES = new Set([
  'application/x-apple-diskimage', 'application/x-newton-compatible-pkg', 'application/vnd.apple.installer+xml',
  'application/x-xar', 'application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/x-gzip',
  'application/x-tar', 'application/x-gtar', 'application/x-bzip2', 'application/x-mach-binary',
]);
const BINARY_TYPES = new Set(['application/octet-stream', 'application/download', 'application/force-download',
  'application/x-download', 'binary/octet-stream', 'multipart/form-data', 'application/x-iso9660-image']);
const FILE_SUFFIX = /\.(?:dmg|pkg|zip|tar\.gz|tgz|macho)$/i;
const MAC_BINARY = /[._-](?:darwin|macos)[._-](?:arm64|aarch64|x86[_-]64|x64|amd64|universal)$/i;
const OTHER_SUFFIX = /\.(?:exe|msi|msix|rpm|deb|appimage|apk|dmg\.sig|zip\.sig|asc|sha256|torrent)$/i;
const ACTIONS = 3;
const ROOT_LIMIT = 2 * 1024 * 1024;
const FOLLOW_LIMIT = 512 * 1024;
const ARTIFACTS = new Set(['direct_file', 'redirect', 'installer_stub']);
const METADATA = new Set(['feed', 'release_api']);
const ACCESS = new Set([401, 403, 429, 451]);
const CACHE_TTL = 60_000;
const CACHE_SIZE = 32;

function urlPath(url) {
  try { return decodeURIComponent(url.pathname); } catch { return url.pathname; }
}

function filename(url, headers) {
  const disposition = (headers.get('Content-Disposition') ?? '').slice(0, 1024);
  const encoded = /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let declared = /(?:^|;)\s*filename=(?:"([^"]+)"|([^;]+))/i.exec(disposition)?.slice(1).find(Boolean)?.trim();
  if (encoded) {
    try { declared = decodeURIComponent(encoded); } catch { /* use the ordinary filename */ }
  }
  return declared?.split(/[\\/]/).at(-1) || urlPath(url).split('/').filter(Boolean).at(-1) || 'Download';
}

function artifactType(response, url, name) {
  const mime = contentType(response.headers);
  if (!identityEncoding(response.headers) || OTHER_SUFFIX.test(name) || OTHER_SUFFIX.test(urlPath(url))) return false;
  return FILE_TYPES.has(mime) || (BINARY_TYPES.has(mime) && (FILE_SUFFIX.test(name) || FILE_SUFFIX.test(urlPath(url)) || MAC_BINARY.test(name)));
}

function representation(response, url, budget) {
  const name = filename(url, response.headers);
  if (response.status !== 206 || !artifactType(response, url, name)) return null;
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('Content-Range') ?? '');
  const size = range && Number(range[3]);
  if (!Number.isSafeInteger(size) || size < 2 || size <= Number(range[2]) ||
      !Number.isSafeInteger(Number(range[1])) || Number(range[1]) > Number(range[2])) return null;
  if (size > budget) return { tooLarge: true };
  return { size, name, bounded: Number(range[1]) === 0 && Number(range[2]) === 0 };
}

function allowedDocument(url, mime, entry) {
  if (DOCUMENTS.has(mime) || mime.endsWith('+json')) return true;
  if (FEED_TYPES.has(mime)) return entry?.kind === 'feed' && /(?:latest|stable)-(?:mac|darwin)[\w.-]*\.ya?ml$/i.test(url.pathname);
  return false;
}

function cleanLabel(text, limit = 160) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, limit);
}

function display(candidate, found, source) {
  return {
    // Preserve the durable advertised URL. The scan route verifies redirects again.
    url: candidate.url,
    host: new URL(candidate.url).hostname,
    filename: cleanLabel(found.name),
    arch: candidate.arch,
    os: candidate.os === 'unknown' && /\.(?:dmg|pkg)$/i.test(found.name) ? 'macos' : candidate.os,
    kind: candidate.kind,
    evidence: {
      ...candidate.evidence,
      page: source.hostname,
      selector: cleanLabel(candidate.evidence.selector),
      text: cleanLabel(candidate.evidence.text),
    },
  };
}

function outcome(decision, reason, candidates = []) {
  return { decision, reason, candidates };
}

function comparableHost(a, b) {
  return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
}

function readCandidates(state, level, tasks) {
  const { resolution, url } = state;
  if (level >= 2 || ['gated', 'none'].includes(resolution.decision)) return;
  const minimum = resolution.decision === 'needs_api' ? 34 : 48;
  const candidates = resolution.candidates.filter((candidate) => ARTIFACTS.has(candidate.kind) && candidate.score >= minimum);
  if (candidates.length > 0) tasks.push(...candidates.map((candidate) => ({ candidate, source: url, level: level + 1 })));
  // After an intermediate document, the remaining actions are file probes only.
  if (level === 0) {
    const endpoints = resolution.candidates.filter((candidate) => METADATA.has(candidate.kind));
    const jobs = endpoints.map((candidate) => ({ candidate, source: url, level: 1 }));
    if (resolution.decision === 'needs_api' && candidates.every((candidate) => !['meta[http-equiv=refresh]', 'include-fragment[src]'].includes(candidate.evidence.selector))) {
      tasks.unshift(...jobs);
    } else {
      tasks.push(...jobs);
    }
  }
}

function handoff(resolution, pasted) {
  const store = resolution.candidates.find((candidate) => candidate.kind === 'app_store');
  const result = outcome('gated', resolution.reason);
  if (resolution.reason === 'app_store') {
    const url = store ? new URL(store.url) : pasted;
    if (url) result.handoff = { url: url.href, host: url.hostname };
  }
  return result;
}

export function createDownloadService({ createResolver, outbound, logUnresolved = () => {} }) {
  let resolver;
  const cache = new Map();
  const cacheIndex = new Map();
  const backoff = new Map();

  function transport({ env, ownHost, signal, scan = false }) {
    return createPageEgress({
      ownHost, signal, outbound,
      ...(scan && { maxOrigins: 34, maxRequests: 36, freshDNS: false }),
      permitHost: async (host) => {
        const key = await digest(host);
        if ((backoff.get(key) ?? 0) > Date.now()) {
          throw new RangeFailure('This host asked the scanner to wait.', 'limit_reached', 429);
        }
        if (!env.DOWNLOAD_HOST_LIMIT || !(await env.DOWNLOAD_HOST_LIMIT.limit({ key })).success) {
          throw new RangeFailure('This host has reached its request limit.', 'limit_reached', 429);
        }
      },
    });
  }

  async function recordBackoff(url, response) {
    const retry = response.headers.get('Retry-After');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (response.status !== 429 && !(response.status === 403 && retry) && remaining !== '0') return;
    const reset = response.headers.get('X-RateLimit-Reset');
    let delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 60_000;
    if (!retry && remaining === '0' && reset && /^\d+$/.test(reset)) delay = Number(reset) * 1000 - Date.now();
    if (backoff.size >= 128) backoff.delete(backoff.keys().next().value);
    backoff.set(await digest(url.hostname), Date.now() + Math.max(1000, Math.min(900_000, Number.isFinite(delay) ? delay : 60_000)));
  }

  function parse(bytes, url, response, mime, adapters) {
    resolver ??= createResolver();
    const link = (response?.headers.get('Link') ?? '').slice(0, 8192);
    return JSON.parse(resolver.resolvePage(bytes, url.href, response?.status ?? 200, mime, link, adapters));
  }

  async function inspect(get, requested, { root = false, entry, source, level = 0, budget, signal, adapters }) {
    const api = METADATA.has(entry?.kind);
    const fileHint = FILE_SUFFIX.test(urlPath(requested)) || ARTIFACTS.has(entry?.kind);
    const mayParse = root || (level === 1 && (api || entry?.kind === 'redirect' || requested.hostname === 'handbrake.fr'));
    const key = !fileHint && !requested.search ? await digest(requested.href) : null;
    const indexed = cacheIndex.get(key);
    const cached = indexed && cache.get(indexed);
    const eligibleCache = cached?.expires > Date.now() && cached.adapters === adapters;
    const { url, response } = await get(requested, {
      range: fileHint && !api ? 'bytes=0-0' : undefined,
      revalidate: eligibleCache ? cached.etag : undefined,
      accept: api ? 'application/json, application/xml, text/plain, */*;q=0.1' : undefined,
    });
    await recordBackoff(url, response);
    if (eligibleCache && response.status === 304 && requested.href === url.href) {
      discard(response);
      return { url, resolution: cached.resolution, hash: cached.hash };
    }

    const verified = representation(response, url, budget);
    if (verified?.tooLarge) {
      discard(response);
      return { url, tooLarge: true };
    }
    if (verified?.bounded) {
      const bytes = await readBounded(response, 1, signal);
      return { url, file: bytes.length === 1 ? verified : undefined };
    }

    if (root && response.status === 200 && artifactType(response, url, filename(url, response.headers))) {
      discard(response);
      const declared = response.headers.get('Content-Length');
      if (/^\d+$/.test(declared ?? '') && Number(declared) > budget) return { url, tooLarge: true };
      const probe = await get(url, { range: 'bytes=0-0' });
      const checked = representation(probe.response, probe.url, budget);
      if (checked?.bounded && (await readBounded(probe.response, 1, signal)).length === 1) {
        return { url: probe.url, file: checked };
      }
      discard(probe.response);
      return { url, tooLarge: checked?.tooLarge };
    }

    const mime = contentType(response.headers);
    if (ACCESS.has(response.status)) {
      discard(response);
      const rateLimited = response.status === 429 ||
        (response.status === 403 && (response.headers.has('Retry-After') || response.headers.get('X-RateLimit-Remaining') === '0'));
      return { url, gated: !rateLimited, rateLimited };
    }
    if (response.status !== 200 || !mayParse || !allowedDocument(url, mime, entry) ||
        (!root && (api ? HTML.has(mime) : !comparableHost(source, url)))) {
      discard(response);
      return { url };
    }

    const bytes = await readBounded(response, root ? ROOT_LIMIT : FOLLOW_LIMIT, signal);
    // Update assets in a GitHub manifest are relative to the release URL.
    // Its HTTP CDN Location may be a temporary path without that context.
    const base = entry?.kind === 'feed' && requested.hostname === 'github.com' &&
      requested.pathname.includes('/releases/') ? requested : url;
    const resolution = parse(bytes, base, response, mime, adapters);
    const hash = await digest(bytes);
    const etag = response.headers.get('ETag');
    const cacheControl = response.headers.get('Cache-Control') ?? '';
    const vary = response.headers.get('Vary') ?? '';
    if (key && requested.href === url.href && /^"[^"\r\n]{1,160}"$/.test(etag ?? '') &&
        /(?:^|,)\s*public\s*(?:,|$)/i.test(cacheControl) &&
        !/\b(?:no-store|no-cache|private)\b/i.test(cacheControl) &&
        (!vary || vary.toLowerCase() === 'accept-encoding') && !response.headers.has('Set-Cookie') &&
        !resolution.candidates.some((candidate) => new URL(candidate.url).search)) {
      const entryKey = await digest(key + ':' + etag);
      if (indexed) cache.delete(indexed);
      if (cache.size >= CACHE_SIZE) {
        const oldest = cache.keys().next().value;
        cacheIndex.delete(cache.get(oldest).key);
        cache.delete(oldest);
      }
      cacheIndex.set(key, entryKey);
      cache.set(entryKey, { key, etag, resolution, hash, adapters, expires: Date.now() + CACHE_TTL });
    }
    return { url, resolution, hash };
  }

  async function ledger(root, target, decision, reason, reached) {
    const urlHash = await digest(target.href);
    const htmlHash = root.hash;
    const top = await Promise.all(root.resolution.candidates.filter((c) => ARTIFACTS.has(c.kind)).slice(0, 5)
      .map(async (candidate) => ({
        url: `sha256:${await digest(candidate.url)}`, score: candidate.score, kind: candidate.kind, reasons: candidate.reasons,
      })));
    logUnresolved({
      schema_version: 1, ledger_id: await digest(`download_page:${urlHash}:${htmlHash}`),
      source: 'download_page', original_url: `sha256:${urlHash}`,
      status: 'unresolved_page', failure_class: 'unresolved_page', error: reason,
      url_redacted: true, redacted: true, time_bucket: htmlHash, settings: { profile: 'page_resolver' }, provenance: [],
      evidence: {
        html_sha256: htmlHash, decision, tried_rules: ['html_controls', 'structured_data', 'literal_urls', 'provider_routes'],
        top_rejected_candidates: top, page_features: { ...root.resolution.page_features, actions: reached },
      },
    });
  }

  async function resolveDownload({ target, budget, env, ownHost, signal, adapters = true }) {
    resolver ??= createResolver();
    const preliminary = parse(new Uint8Array(), target, null, 'text/html', adapters);
    if (preliminary.decision === 'gated') return handoff(preliminary, target);
    const get = transport({ env, ownHost, signal });
    const rewritten = adapters && resolver.shareTarget(target.href);
    const initial = rewritten ? validatePageTarget(rewritten, ownHost) : target;
    let root;
    try {
      root = await inspect(get, initial, { root: true, budget, signal, adapters });
    } catch (error) {
      // The Go downloads index can exceed the HTML cap. Its official compact
      // catalog is sufficient even when the index cannot be read.
      const goCatalog = adapters && target.hostname === 'go.dev' && target.pathname === '/dl/' &&
        !target.search && error instanceof RangeFailure && error.httpStatus === 422;
      if (!goCatalog) throw error;
      root = { url: target, resolution: preliminary, hash: await digest(new Uint8Array()) };
    }
    if (root.file) {
      return outcome('resolved', 'direct_download', [display({
        url: initial.href, arch: 'unknown', os: 'unknown', kind: 'direct_file',
        evidence: { source: 'submitted_url', selector: 'Pasted URL', text: '' },
      }, root.file, target)]);
    }
    if (root.gated) return outcome('gated', 'access_restricted');
    if (root.rateLimited) return outcome('none', 'host_rate_limit');
    if (root.tooLarge) return outcome('none', 'artifact_too_large');
    if (!root.resolution) return outcome('none', 'unsupported_response');
    if (root.resolution.decision === 'gated') return handoff(root.resolution);
    if (root.resolution.reason === 'too_many_hosts') {
      await ledger(root, target, 'none', 'too_many_hosts', 0);
      return outcome('none', 'too_many_hosts');
    }

    const pending = [];
    const visited = new Set([target.href, root.url.href, initial.href]);
    const confirmed = [];
    let reached = 0;
    let tooLarge = false;
    let blocked = false;
    let rateLimited = false;
    let ambiguous = root.resolution.decision === 'ambiguous';
    readCandidates(root, 0, pending);
    while (pending.length && reached < ACTIONS) {
      signal.throwIfAborted();
      const { candidate, source, level } = pending.shift();
      let url;
      try { url = validatePageTarget(candidate.url, ownHost); } catch { continue; }
      if (visited.has(url.href)) continue;
      visited.add(url.href);
      reached++;
      try {
        const found = await inspect(get, url, { entry: candidate, source, level, budget, signal, adapters });
        tooLarge ||= Boolean(found.tooLarge);
        blocked ||= Boolean(found.gated);
        rateLimited ||= Boolean(found.rateLimited);
        if (found.file && ARTIFACTS.has(candidate.kind)) {
          confirmed.push(display(candidate, found.file, source));
          if (!ambiguous && candidate.arch === 'unknown') break;
        } else if (found.resolution?.decision === 'gated') {
          blocked = true;
        } else if (found.resolution && level < 2) {
          ambiguous ||= found.resolution.decision === 'ambiguous';
          readCandidates(found, level, pending);
          // The explicitly selected intermediate owns the remaining candidate slots.
          pending.sort((a, b) => b.level - a.level);
        }
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof RangeFailure && error.httpStatus === 429) rateLimited = true;
      }
    }
    if (confirmed.length) {
      const decision = ambiguous && confirmed.length > 1 ? 'ambiguous' : 'resolved';
      const reason = decision === 'ambiguous' ? 'multiple_downloads' : 'verified_range';
      if (decision === 'ambiguous') await ledger(root, target, decision, reason, reached);
      return outcome(decision, reason, confirmed);
    }
    const reason = tooLarge ? 'artifact_too_large' : rateLimited ? 'host_rate_limit' : blocked ? 'vendor_action'
      : root.resolution.reason === 'document_limit' ? 'document_limit' : 'no_public_download';
    const decision = blocked && !tooLarge ? 'gated' : 'none';
    await ledger(root, target, decision, reason, reached);
    return outcome(decision, reason);
  }

  function checkedRange({ target, budget, env, ownHost, signal }) {
    const get = transport({ env, ownHost, signal, scan: true });
    let current = target;
    let total;
    return async (range, etag) => {
      const { response, url } = await get(current, {
        range, etag,
        within: total === undefined ? undefined : (candidate) => candidate.href === current.href,
      });
      current = url;
      await recordBackoff(url, response);
      const checked = representation(response, url, budget);
      if (!checked || checked.tooLarge || (total === undefined && !checked.bounded) ||
          (total !== undefined && checked.size !== total)) {
        discard(response);
        throw new RangeFailure(checked?.tooLarge ? 'The file exceeds the anonymous scan size limit.'
          : 'The download could not be verified as a public file.', 'source_error', 422);
      }
      total = checked.size;
      return response;
    };
  }

  function reset() { resolver = undefined; }
  return { resolveDownload, checkedRange, reset };
}
