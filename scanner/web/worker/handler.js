import ipaddr from 'ipaddr.js';
import { redactPaths } from '../public/path-privacy.js';
import { deadlineError, RangeFailure, scanRemote } from '../public/range-scan.js';
import { DEFAULT_BUDGET, emptyResult } from '../public/scan-result.js';
import { createEgress, validateTarget } from './egress.js';

function json(result, status, headers = {}) {
  return Response.json(redactPaths(result), {
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

export function createHandler({ createScan, outbound = fetch, timeoutMs = 20_000 }) {
  let scan;
  // Reserve the isolate before awaiting the rate limiter.
  let active = false;
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/scan') {
      if (url.pathname.startsWith('/api/')) {
        return json(emptyResult('not_found', 'Unknown API endpoint.'), 404);
      }
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') {
      return json(emptyResult('source_error', 'Use GET to request a scan.'), 405, { Allow: 'GET' });
    }
    if (request.headers.get('Sec-Fetch-Site') !== 'same-origin' &&
        request.headers.get('X-Scan-Client') !== 'browser') {
      return json(emptyResult('source_error', 'Open the scanner to scan a URL.'), 403);
    }

    let target;
    let budget;
    try {
      target = validateTarget(url.searchParams.get('url'), url.hostname);
      budget = readBudget(url.searchParams.get('budget'), env.SCAN_MAX_BUDGET);
    } catch (error) {
      return json(emptyResult(error.status, error.message), error.httpStatus);
    }
    if (budget === 0) return json(emptyResult('budget_exhausted', 'byte budget reached'), 200);

    if (active) {
      return json(emptyResult('limit_reached', 'The scanner is busy. Try again in a few seconds.'), 503, { 'Retry-After': '3' });
    }

    active = true;
    const controller = new AbortController();
    const { signal } = controller;
    const expiresAt = Date.now() + timeoutMs;
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = deadlineError();
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });
      const run = async () => {
        if (env.SCAN_LIMIT && !(await env.SCAN_LIMIT.limit({ key: clientKey(request) })).success) {
          return json(emptyResult('limit_reached', 'Too many scans. Try again in a minute.'), 429, { 'Retry-After': '60' });
        }
        signal.throwIfAborted();
        scan ??= createScan();
        const fetchRange = createEgress({ target, ownHost: url.hostname, outbound, signal });
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
