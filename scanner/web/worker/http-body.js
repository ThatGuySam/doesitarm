import { discard, RangeFailure } from '../public/range-scan.js';

export function identityEncoding(headers) {
  const encoding = headers.get('Content-Encoding');
  return !encoding || encoding.toLowerCase() === 'identity';
}

export function contentType(headers) {
  return (headers.get('Content-Type') ?? '').split(';', 1)[0].trim().toLowerCase();
}

export async function readBounded(response, maximum, signal) {
  const length = response.headers.get('Content-Length');
  if (!identityEncoding(response.headers) ||
      (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum))) {
    discard(response);
    throw new RangeFailure('The response exceeded the allowed size or encoding.', 'limit_reached', 422);
  }
  if (signal?.aborted) {
    discard(response);
    signal.throwIfAborted();
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const bytes = new Uint8Array(maximum);
  let chunks = 0;
  let filled = 0;
  let ended = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) { ended = true; break; }
      if (value.byteLength > maximum - filled || ++chunks > 65_536) {
        throw new RangeFailure('The response exceeded the allowed size.', 'limit_reached', 422);
      }
      bytes.set(value, filled);
      filled += value.byteLength;
    }
    signal?.throwIfAborted();
    return bytes.subarray(0, filled);
  } finally {
    if (!ended) abort();
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}
