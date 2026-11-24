import init, { bundle_metadata, scan } from './pkg/scan_wasm.js';
import { scanRemote } from './range-scan.js';
import { emptyResult, MIB } from './scan-result.js';

let resolveExecutable;

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'executable') {
    resolveExecutable?.(data.file ?? null);
    return;
  }

  const { id, job, budget } = data;
  const start = performance.now();
  let lastProgress = -Infinity;
  let bytes = 0;
  let total = job.file?.size ?? job.plist?.size ?? 0;

  function progress(read, size, force = false) {
    bytes = read;
    total = size;
    const now = performance.now();
    if (force || now - lastProgress >= 80) {
      lastProgress = now;
      self.postMessage({ type: 'progress', id, bytes, total, elapsed: now - start });
    }
  }

  let source = 'Browser';
  let result;
  try {
    if (job.kind !== 'url' || !job.forceWorker) await init();
    if (job.kind === 'file') {
      result = await scanFile(job.file, budget, progress);
    } else if (job.kind === 'bundle') {
      result = await scanBundle(job, budget, progress, id);
    } else {
      if (!job.forceWorker) {
        const direct = await scanRemote({
          scan,
          budget,
          signal: AbortSignal.timeout(12_000),
          onProgress: progress,
          fetchRange: (range, _etag, signal) => fetch(job.url, {
            headers: { Range: range },
            mode: 'cors',
            redirect: 'error',
            credentials: 'omit',
            cache: 'no-store',
            signal,
          }),
        });
        if (direct.result.status !== 'source_error') result = direct.result;
      }

      if (!result) {
        source = 'Cloudflare Worker';
        self.postMessage({ type: 'remote', id });
        result = await requestWorker(job.url, budget);
      }
    }
  } catch (error) {
    const limited = error instanceof WebAssembly.RuntimeError;
    const message = limited ? 'The scanner could not continue within its Wasm resources.' :
      error instanceof Error ? error.message : String(error);
    result = emptyResult(limited ? 'limit_reached' : 'source_error', message, total);
    result.bytes_read = bytes;
  }
  self.postMessage({ type: 'done', id, result, source, elapsed: performance.now() - start });
});

async function scanFile(file, budget, progress) {
  let read = 0;
  let sourceError;
  const result = JSON.parse(await scan(BigInt(file.size), BigInt(budget), async (offset, length) => {
    const start = Number(offset);
    const end = start + length;
    if (!Number.isSafeInteger(end) || end > file.size || length > 16 * MIB) {
      sourceError = 'The scanner requested a range outside the supported file bounds.';
      throw new RangeError(sourceError);
    }
    try {
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
      read += bytes.byteLength;
      progress(read, file.size);
      return bytes;
    } catch (error) {
      sourceError = 'The browser could not read this file range. Check that the file is still available.';
      throw error;
    }
  }));
  if (sourceError) result.error = sourceError;
  return result;
}

async function scanBundle(job, budget, progress, id) {
  const { plist, label } = job;
  if (!plist) return emptyResult('not_found', 'The app folder has no readable Contents/Info.plist.');
  if (plist.size > 2 * MIB) return emptyResult('limit_reached', 'Info.plist exceeds 2 MiB.', plist.size);
  if (plist.size > budget) return emptyResult('budget_exhausted', 'The byte budget is smaller than Info.plist.', plist.size);

  const bytes = new Uint8Array(await plist.slice(0, plist.size).arrayBuffer());
  const metadata = JSON.parse(bundle_metadata(bytes, label));
  progress(metadata.bytes_read, plist.size, true);
  if (metadata.error) return metadata;

  const executable = await new Promise((resolve) => {
    resolveExecutable = resolve;
    self.postMessage({ type: 'executable-needed', id, name: metadata.executable_name });
  });
  resolveExecutable = undefined;
  if (!executable) {
    return {
      ...metadata,
      status: 'not_found',
      error: 'The CFBundleExecutable named in Info.plist could not be opened under Contents/MacOS.',
    };
  }

  const totalSize = plist.size + executable.size;
  progress(plist.size, totalSize, true);
  const result = await scanFile(executable, budget - plist.size, (read) => progress(plist.size + read, totalSize));
  return {
    ...metadata,
    status: result.status,
    error: result.error,
    architectures: result.architectures,
    min_macos: metadata.min_macos ?? result.min_macos,
    executable_size: executable.size,
    bytes_read: plist.size + result.bytes_read,
    reads: metadata.reads + result.reads,
    total_size: totalSize,
  };
}

async function requestWorker(url, budget) {
  const endpoint = new URL('/api/scan', self.location.origin);
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('budget', budget);
  const signal = AbortSignal.timeout(25_000);
  try {
    const response = await fetch(endpoint, { signal, cache: 'no-store' });
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      const result = await response.json();
      if (typeof result.status === 'string' && Array.isArray(result.architectures)) return result;
    }

    // Cloudflare can terminate an isolate before our handler can serialize a result.
    if (response.status === 503 || response.status === 504 || response.status === 500 ||
        response.status === 502 || response.status === 520 || response.status === 522) {
      const error = await response.text();
      if (/\b1102\b|exceeded resource limits/i.test(error)) {
        return emptyResult('limit_reached', 'Cloudflare ended this scan at its CPU or memory limit.');
      }
    }
    return emptyResult('source_error', `The scanner API returned HTTP ${response.status} without a scan result.`);
  } catch {
    return signal.aborted
      ? emptyResult('limit_reached', 'The scanner API reached the network time limit.')
      : emptyResult('source_error', 'The scanner API could not be reached.');
  }
}
