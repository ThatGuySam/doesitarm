import init, { bundle_metadata, bundle_binary_is_macho, bundle_binary_role, scan } from './pkg/scan_wasm.js';
import { scanRemote } from './range-scan.js';
import { emptyResult, MIB, summarizeInventory, URL_BUDGET_TIERS } from './scan-result.js';

let resolveExecutable;
let resolveInventory;

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'executable') {
    resolveExecutable?.(data);
    return;
  }

  if (data.type === 'inventory') {
    resolveInventory?.(data);
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
      result = await scanFile(job.file, progress);
    } else if (job.kind === 'bundle') {
      result = await scanBundle(job, progress, id);
    } else {
      if (!job.forceWorker) {
        for (const tier of URL_BUDGET_TIERS) {
          if (tier > budget) break;
          const direct = await scanRemote({
            scan,
            budget: tier,
            profile: 'remote-cli',
            onProgress: progress,
            fetchRange: (range) => fetch(job.url, {
              headers: { Range: range },
              mode: 'cors',
              redirect: 'error',
              credentials: 'omit',
              cache: 'no-store',
            }),
          });
          result = direct.result;
          if (result.status === 'source_error') {
            result = undefined;
            break;
          }
          if (result.status !== 'budget_exhausted') break;
        }
      }

      if (!result) {
        source = 'Cloudflare Worker';
        self.postMessage({ type: 'remote', id });
        result = await requestWorker(job.url);
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

async function scanFile(file, progress) {
  let read = 0;
  let sourceError;
  const result = JSON.parse(await scan(BigInt(file.size), 0n, async (offset, length) => {
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
  }, undefined, 'local'));
  if (sourceError) result.error = sourceError;
  return result;
}

async function scanBundle(job, progress, id) {
  const { plist, label } = job;
  if (!plist) return emptyResult('not_found', 'The app folder has no readable Contents/Info.plist.');
  if (plist.size > 2 * MIB) return emptyResult('limit_reached', 'Info.plist exceeds 2 MiB.', plist.size);

  const bytes = new Uint8Array(await plist.slice(0, plist.size).arrayBuffer());
  const metadata = JSON.parse(bundle_metadata(bytes, label));
  progress(metadata.bytes_read, plist.size, true);
  if (metadata.error) return metadata;

  const primaryPath = metadata.executable_path.slice(label.length + 1);
  const { file, path, resolution } = await new Promise((resolve) => {
    resolveExecutable = resolve;
    self.postMessage({ type: 'executable-needed', id, path: primaryPath });
  });
  resolveExecutable = undefined;
  let totalSize = plist.size + (file?.size ?? 0);
  const primary = file
    ? await scanFile(file, (read) => progress(plist.size + read, totalSize))
    : emptyResult('not_found', 'The CFBundleExecutable named in Info.plist could not be opened.');

  const { files, reason } = await new Promise((resolve) => {
    resolveInventory = resolve;
    self.postMessage({ type: 'inventory-needed', id });
  });
  resolveInventory = undefined;
  const candidates = files
    .filter(([name, candidate]) => name !== path && candidate.size >= 8)
    .map(([name, candidate]) => ({ name, candidate, role: bundle_binary_role(name) }))
    .filter(({ role }) => role);
  totalSize += candidates.reduce((size, { candidate }) => size + candidate.size, 0);

  const binaries = primary.architectures.length
    ? [{ path, role: 'main', architectures: primary.architectures }] : [];
  let incomplete = reason ?? (primary.error === 'unsupported: declared executable is a script' ? null : primary.error);
  let bytesRead = plist.size + primary.bytes_read;
  let requested = plist.size + primary.bytes_requested;
  let reads = metadata.reads + primary.reads;
  for (const { name, candidate, role } of candidates) {
    try {
      const header = new Uint8Array(await candidate.slice(0, 12).arrayBuffer());
      requested += header.length;
      reads += 1;
      if (!bundle_binary_is_macho(header)) {
        bytesRead += header.length;
        continue;
      }
      const observed = await scanFile(candidate, (read) => progress(bytesRead + read, totalSize));
      if (observed.architectures.length) binaries.push({ path: name, role, architectures: observed.architectures });
      incomplete ||= observed.error;
      bytesRead += observed.bytes_read;
      requested += observed.bytes_requested;
      reads += observed.reads;
    } catch (error) {
      incomplete ||= error instanceof Error ? error.message : 'A bundle file could not be read.';
    }
  }

  return {
    ...metadata,
    status: primary.status,
    error: primary.error,
    architectures: primary.architectures,
    min_macos: metadata.min_macos ?? primary.min_macos,
    executable_path: `${label}/${path}`,
    executable_resolution: resolution,
    executable_size: file?.size ?? null,
    inventory: summarizeInventory(binaries, incomplete),
    bytes_read: bytesRead,
    bytes_requested: requested,
    decoded_bytes: primary.decoded_bytes,
    reads,
    total_size: totalSize,
  };
}

async function requestWorker(url) {
  const endpoint = new URL('/api/scan', self.location.origin);
  endpoint.searchParams.set('url', url);
  try {
    const response = await fetch(endpoint, { headers: { 'X-Scan-Client': 'browser' }, cache: 'no-store' });
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
    return emptyResult('source_error', 'The scanner API could not be reached.');
  }
}
