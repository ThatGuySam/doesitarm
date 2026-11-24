import { RangeFailure, scanRemote } from '../public/range-scan.js';
import { DEFAULT_BUDGET, emptyResult, MAX_BUDGET } from '../public/scan-result.js';
import { createEgress, validateTarget } from './egress.js';

function json(result, status, headers = {}) {
  return Response.json(result, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function readBudget(value) {
  if (value === null) return DEFAULT_BUDGET;
  if (!/^\d{1,20}$/.test(value)) {
    throw new RangeFailure('Budget must be a nonnegative integer in bytes.', 'source_error', 400);
  }
  return Math.min(Number(value), MAX_BUDGET);
}

export function createHandler({ scan, outbound = fetch, timeoutMs = 20_000 }) {
  // One active scan per isolate keeps Wasm allocations and network buffers bounded.
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

    let target;
    let budget;
    try {
      target = validateTarget(url.searchParams.get('url'), url.hostname);
      budget = readBudget(url.searchParams.get('budget'));
    } catch (error) {
      return json(emptyResult(error.status, error.message), error.httpStatus);
    }
    if (budget === 0) return json(emptyResult('budget_exhausted', 'byte budget reached'), 200);

    if (env.SCAN_LIMIT) {
      const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      if (!(await env.SCAN_LIMIT.limit({ key })).success) {
        return json(emptyResult('limit_reached', 'Too many scans. Try again in a minute.'), 429, { 'Retry-After': '60' });
      }
    }
    if (active) {
      return json(emptyResult('limit_reached', 'The scanner is busy. Try again in a few seconds.'), 503, { 'Retry-After': '3' });
    }

    active = true;
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const fetchRange = createEgress({ target, ownHost: url.hostname, outbound, signal });
      const { result, httpStatus } = await scanRemote({ scan, fetchRange, budget, signal });
      return json(result, httpStatus);
    } finally {
      active = false;
    }
  };
}
