import { emptyResult, MIB } from './scan-result.js';

export class RangeFailure extends Error {
  constructor(message, status = 'source_error', httpStatus = 502) {
    super(message);
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

export function discard(response) {
  void response.body?.cancel().catch(() => {});
}

export function deadlineError() {
  return new RangeFailure('Scan reached the network time limit.', 'limit_reached', 504);
}

async function rangeBytes(response, length) {
  if (!response.body) throw new RangeFailure('The range response had no body.');
  const data = new Uint8Array(length);
  const reader = response.body.getReader();
  let filled = 0;
  let done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      done = chunk.done;
      if (done) break;
      if (chunk.value.byteLength > length - filled) {
        throw new RangeFailure('The response body exceeded the requested range.');
      }
      data.set(chunk.value, filled);
      filled += chunk.value.byteLength;
    }
    if (filled !== length) throw new RangeFailure('The response body was shorter than the requested range.');
    return data;
  } finally {
    if (!done) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readRange(fetchRange, signal, from, length, previous) {
  const end = from + length - 1;
  const response = await fetchRange(`bytes=${from}-${end}`, previous?.etag, signal);
  const fail = (message) => {
    discard(response);
    throw new RangeFailure(message);
  };
  if (response.status !== 206) fail(`Download origin returned HTTP ${response.status}; expected 206 for a range.`);

  const declared = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('Content-Range') ?? '');
  const size = declared ? Number(declared[3]) : 0;
  if (!declared || Number(declared[1]) !== from || Number(declared[2]) !== end ||
      !Number.isSafeInteger(size) || size <= end) {
    fail('The download origin did not provide a valid Content-Range header.');
  }
  if (previous && size !== previous.size) fail('The download size changed during the scan.');
  const encoding = response.headers.get('Content-Encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') fail('The download returned an encoded range.');
  const contentLength = response.headers.get('Content-Length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== length)) {
    fail('Content-Length did not match the requested range.');
  }
  const observed = response.headers.get('ETag');
  const strong = observed && /^"[^"]*"$/.test(observed) ? observed : null;
  if (previous?.etag && strong && previous.etag !== strong) fail('The download ETag changed during the scan.');

  return { size, etag: strong ?? previous?.etag, bytes: await rangeBytes(response, length) };
}

// Match the CLI's discovery accounting and retrieval cap. The range stream
// is consumed only after validating its headers.
export async function scanRemote({ scan, fetchRange, budget, signal, onProgress = () => {} }) {
  let representation;
  let sourceFailure;
  let bytesRead = 0;
  let reads = 0;
  const progress = () => onProgress(bytesRead, representation?.size ?? 0);

  function classify(error) {
    if (error instanceof RangeFailure) return error;
    if (signal.aborted) return deadlineError();
    if (error instanceof WebAssembly.RuntimeError) {
      return new RangeFailure('The scanner could not continue within its Wasm resources.', 'limit_reached', 503);
    }
    return new RangeFailure('Could not fetch a validated byte range from the download origin.');
  }

  try {
    reads += 1;
    const { size, etag } = await readRange(fetchRange, signal, 0, 1);
    representation = { size, etag };
    bytesRead = 1;
    progress();

    const coreBudget = Math.max(0, Math.min(budget, size - 1) - 1);
    const result = JSON.parse(await scan(BigInt(size), BigInt(coreBudget), async (offset, length) => {
      reads += 1;
      try {
        if (signal.aborted) throw deadlineError();
        if (length > 16 * MIB) {
          throw new RangeFailure('Scan requested a range larger than 16 MiB.', 'limit_reached', 503);
        }
        const range = await readRange(fetchRange, signal, Number(offset), length, representation);
        representation.etag = range.etag;
        bytesRead += length;
        progress();
        return range.bytes;
      } catch (error) {
        sourceFailure = classify(error);
        throw error;
      }
    }));
    result.bytes_read = bytesRead;
    result.reads = reads;
    if (representation.etag) result.source_etag = representation.etag;
    if (sourceFailure) {
      result.status = sourceFailure.status;
      result.error = sourceFailure.message;
    }
    return { result, httpStatus: sourceFailure?.status === 'source_error' ? sourceFailure.httpStatus : 200 };
  } catch (error) {
    const failure = sourceFailure ?? classify(error);
    const result = emptyResult(failure.status, failure.message, representation?.size);
    result.bytes_read = bytesRead;
    result.reads = reads;
    if (representation?.etag) result.source_etag = representation.etag;
    return { result, httpStatus: failure.httpStatus };
  }
}
