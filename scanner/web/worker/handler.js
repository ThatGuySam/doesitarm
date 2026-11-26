import ipaddr from 'ipaddr.js';
import { redactPaths } from '../public/path-privacy.js';
import { deadlineError, RangeFailure, scanRemote } from '../public/range-scan.js';
import { DEFAULT_BUDGET, emptyResult } from '../public/scan-result.js';
import { createEgress, validatePageTarget } from './egress.js';
import { createDownloadService } from './downloads.js';
import { contentType, readBounded } from './http-body.js';

function json(result, status, headers = {}, redact = true) {
  return Response.json(redact ? redactPaths(result) : result, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function readBudget(value, configuredCap) {
  const cap = /^\d{1,16}$/.test(configuredCap) && Number.isSafeInteger(Number(configuredCap))
    ? Number(configuredCap) : DEFAULT_BUDGET;
  if (value === null) return Math.min(DEFAULT_BUDGET, cap);
  if (!/^\d{1,20}$/.test(value)) {
    throw new RangeFailure('Budget must be a nonnegative integer in bytes.', 'source_error', 400);
  }
  return Math.min(Number(value), cap);
}

function clientKey(request) {
  const text = request.headers.get('CF-Connecting-IP');
  if (!text || !ipaddr.isValid(text)) return 'unknown';
  const address = ipaddr.process(text);
  if (address.kind() === 'ipv4') return address.toString();
  return `${new ipaddr.IPv6([...address.parts.slice(0, 4), 0, 0, 0, 0]).toString()}/64`;
}

export function createHandler({
  createScan, createResolver, createRuntime, outbound = fetch, timeoutMs = 20_000, discoveryTimeoutMs = 5_000, logUnresolved,
}) {
  let runtime;
  const getRuntime = () => runtime ??= createRuntime();
  const downloads = createDownloadService({
    createResolver: createResolver ?? getRuntime, outbound, logUnresolved,
  });
  let scan;
  // Reserve the isolate before awaiting the rate limiter.
  let active = false;
  return async function handle(request, env) {
    const url = new URL(request.url);
    const resolving = url.pathname === '/api/resolve';
    const resolvedScan = url.pathname === '/api/scan-download';
    const discoveryRoute = resolving || resolvedScan;
    if (url.pathname !== '/api/scan' && !discoveryRoute) {
      if (url.pathname.startsWith('/api/')) {
        return json(emptyResult('not_found', 'Unknown API endpoint.'), 404);
      }
      return env.ASSETS.fetch(request);
    }
    const method = discoveryRoute ? 'POST' : 'GET';
    if (request.method !== method) {
      return json(emptyResult('source_error', 'This API does not accept that request method.'), 405, { Allow: method });
    }
    if (request.headers.get('Sec-Fetch-Site') !== 'same-origin' &&
        request.headers.get('X-Scan-Client') !== 'browser') {
      return json(emptyResult('source_error', 'Open the scanner to scan a URL.'), 403);
    }

    if (env.SCAN_DISABLED === 'true' ||
        (discoveryRoute && (env.PAGE_RESOLUTION_DISABLED === 'true' || !env.SCAN_LIMIT))) {
      return json(emptyResult('limit_reached', 'The scanner is temporarily unavailable.'), 503);
    }
    let target;
    let budget;
    if (!discoveryRoute) {
      try {
        target = validatePageTarget(url.searchParams.get('url'), url.hostname);
        budget = readBudget(url.searchParams.get('budget'), env.SCAN_MAX_BUDGET);
      } catch (error) {
        return json(emptyResult(error.status, error.message), error.httpStatus);
      }
      if (budget === 0) return json(emptyResult('budget_exhausted', 'byte budget reached'), 200);
    }

    if (active) {
      return json(emptyResult('limit_reached', 'The scanner is busy. Try again in a few seconds.'), 503, { 'Retry-After': '3' });
    }

    active = true;
    const controller = new AbortController();
    const { signal } = controller;
    const timeout = resolving ? Math.min(timeoutMs, discoveryTimeoutMs) : timeoutMs;
    const expiresAt = Date.now() + timeout;
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = deadlineError();
          controller.abort(error);
          reject(error);
        }, timeout);
      });
      const run = async () => {
        if (env.SCAN_LIMIT && !(await env.SCAN_LIMIT.limit({ key: clientKey(request) })).success) {
          return json(emptyResult('limit_reached', 'Too many scans. Try again in a minute.'), 429, { 'Retry-After': '60' });
        }
        signal.throwIfAborted();
        const ownHost = url.hostname;
        if (discoveryRoute) {
          if (!env.DOWNLOAD_GLOBAL_LIMIT || !(await env.DOWNLOAD_GLOBAL_LIMIT.limit({ key: 'downloads' })).success) {
            return json(emptyResult('limit_reached', 'Too many download requests. Try again in a minute.'), 429, { 'Retry-After': '60' });
          }
          try {
            if (contentType(request.headers) !== 'application/json' || url.search) throw new Error();
            const body = await readBounded(request, 8192, signal);
            const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
            target = validatePageTarget(input.url, ownHost);
            budget = readBudget(null, env.SCAN_MAX_BUDGET);
          } catch {
            signal.throwIfAborted();
            return json(emptyResult('source_error', 'Provide a public HTTPS download URL.'), 400);
          }
          if (resolving) {
            const result = await downloads.resolveDownload({ target, budget, env, ownHost, signal });
            if (signal.aborted || Date.now() >= expiresAt) throw deadlineError();
            return json(result, 200, {}, false);
          }
        }
        scan ??= createScan ? createScan() : getRuntime().scan;
        const fetchRange = resolvedScan
          ? downloads.checkedRange({ target, budget, env, ownHost, signal })
          : createEgress({ target, ownHost, outbound, signal });
        const expired = () => signal.aborted || Date.now() >= expiresAt;
        const { result, httpStatus } = await scanRemote({
          scan, fetchRange, budget, signal, profile: 'worker', expired, throwOnTrap: true,
        });
        if (httpStatus === 504 || expired()) throw deadlineError();
        if (httpStatus >= 400) delete result.source_etag;
        return json(result, httpStatus);
      };
      return await Promise.race([deadline, run()]);
    } catch (error) {
      scan = undefined;
      runtime = undefined;
      downloads.reset();
      if (discoveryRoute) {
        if (resolving) {
          const status = error instanceof RangeFailure ? error.httpStatus : 502;
          return json({ decision: 'none', reason: status === 504 ? 'timeout' : status === 422
            ? 'document_limit' : status === 429 ? 'host_rate_limit' : 'unreadable_page', candidates: [] }, status);
        }
      }
      if (error instanceof RangeFailure) {
        return json(emptyResult(error.status, error.message), error.httpStatus);
      }
      if (error instanceof WebAssembly.RuntimeError) {
        return json(emptyResult('limit_reached', 'The scanner could not continue within its Wasm resources.'), 503);
      }
      return json(emptyResult('source_error', 'The scanner could not complete this request.'), 502);
    } finally {
      clearTimeout(timer);
      controller.abort();
      active = false;
    }
  };
}
