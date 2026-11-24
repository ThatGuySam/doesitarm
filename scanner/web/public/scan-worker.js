import init, { bundle_metadata, bundle_binary_is_macho, bundle_binary_role, scan } from './pkg/scan_wasm.js';
import { scanRemote } from './range-scan.js';
import { emptyResult, MIB, summarizeInventory } from './scan-result.js';

let passive = false;
let executableRequest;
let inventoryRequest;

function yieldForPassive() {
  if (!passive) return;
  return globalThis.scheduler?.postTask
    ? scheduler.postTask(() => {}, { priority: 'background' })
    : new Promise((resolve) => setTimeout(resolve, 0));
}

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'mode') {
    passive = data.passive;
    return;
  }
  if (data.type === 'executable') {
    if (executableRequest?.id === data.id) executableRequest.resolve(data);
    return;
  }
  if (data.type === 'inventory') {
    if (inventoryRequest?.id === data.id) inventoryRequest.resolve(data);
    return;
  }

  const { id, job } = data;
  passive = data.passive;
  let lastProgress = -Infinity;
  let bytes = 0;
  let total = job.file?.size ?? job.plist?.size ?? 0;
  let planned = null;

  function progress(read, size, work = null) {
    const now = performance.now();
    const changedPlan = work !== planned;
    bytes = read;
    total = size;
    planned = work;
    if (changedPlan || now - lastProgress >= 150) {
      lastProgress = now;
      self.postMessage({ type: 'progress', id, bytes, planned });
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
        const direct = await scanRemote({
          scan,
          budget: 0,
          profile: 'local',
          onProgress: progress,
          fetchRange: async (range) => {
            const waiting = yieldForPassive();
            if (waiting) await waiting;
            return fetch(job.url, {
              headers: { Range: range },
              mode: 'cors',
              redirect: 'error',
              credentials: 'omit',
              cache: 'no-store',
            });
          },
        });
        if (direct.result.status !== 'source_error') result = direct.result;
      }

      if (!result) {
        source = 'Cloudflare Worker';
        self.postMessage({ type: 'remote', id, bytes });
        result = await requestWorker(job.url);
        bytes += result.bytes_read;
      }
    }
  } catch (error) {
    const limited = error instanceof WebAssembly.RuntimeError;
    const message = limited ? 'The scanner could not continue within its Wasm resources.' :
      error instanceof Error ? error.message : String(error);
    result = emptyResult(limited ? 'limit_reached' : 'source_error', message, total);
    result.bytes_read = bytes;
  }
  self.postMessage({ type: 'done', id, result, source, bytes });
});

const READ_CHUNK = 4 * MIB;
const PLANNED_READ_CHUNK = 64 * 1024;
const THIN_HEADERS = new Map([
  [0xfeedface, 28], [0xcefaedfe, 28],
  [0xfeedfacf, 32], [0xcffaedfe, 32],
]);

async function scanFile(file, progress) {
  let read = 0;
  let sourceError;
  let thinHeader;
  let planned = null;
  const result = JSON.parse(await scan(BigInt(file.size), 0n, async (offset, length) => {
    const start = Number(offset);
    const end = start + length;
    if (!length) return new Uint8Array();
    if (!Number.isSafeInteger(end) || end > file.size) {
      sourceError = 'The scanner requested a range outside the supported file bounds.';
      throw new RangeError(sourceError);
    }

    // A bare thin Mach-O's final source read is the load command table.
    // Use the range selected by Wasm. Archive and fat Mach-O reads remain open-ended.
    if (start === thinHeader) {
      planned = read + length;
      progress(read, file.size, planned);
    }
    try {
      const chunk = planned === null ? READ_CHUNK : PLANNED_READ_CHUNK;
      const range = length > chunk ? new Uint8Array(length) : null;
      for (let position = start; position < end; position += chunk) {
        const waiting = yieldForPassive();
        if (waiting) await waiting;
        const chunkEnd = Math.min(position + chunk, end);
        const bytes = new Uint8Array(await file.slice(position, chunkEnd).arrayBuffer());
        if (bytes.byteLength !== chunkEnd - position) throw new Error('Incomplete file range');
        read += bytes.byteLength;
        progress(read, file.size, planned);
        if (!range) {
          if (start === 0 && length === 4) thinHeader = THIN_HEADERS.get(new DataView(bytes.buffer).getUint32(0));
          return bytes;
        }
        range.set(bytes, position - start);
      }
      return range;
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
  // Match the core's structural plist bound before allocating the buffer.
  if (plist.size > 2 * MIB) return emptyResult('limit_reached', 'Info.plist exceeds 2 MiB.', plist.size);

  const waiting = yieldForPassive();
  if (waiting) await waiting;
  const bytes = new Uint8Array(await plist.slice(0, plist.size).arrayBuffer());
  progress(bytes.byteLength, plist.size);
  const metadata = JSON.parse(bundle_metadata(bytes, label));
  if (metadata.error) return metadata;

  const primaryPath = metadata.executable_path.slice(label.length + 1);
  const { file, path, resolution } = await new Promise((resolve) => {
    executableRequest = { id, resolve };
    self.postMessage({ type: 'executable-needed', id, path: primaryPath });
  });
  executableRequest = undefined;
  let totalSize = plist.size + (file?.size ?? 0);
  const primary = file
    ? await scanFile(file, (read) => progress(plist.size + read, totalSize))
    : emptyResult('not_found', 'The CFBundleExecutable named in Info.plist could not be opened.');

  const { files, reason } = await new Promise((resolve) => {
    inventoryRequest = { id, resolve };
    self.postMessage({ type: 'inventory-needed', id });
  });
  inventoryRequest = undefined;
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
      const waiting = yieldForPassive();
      if (waiting) await waiting;
      const header = new Uint8Array(await candidate.slice(0, 12).arrayBuffer());
      requested += header.length;
      reads += 1;
      bytesRead += header.length;
      progress(bytesRead, totalSize);
      if (!bundle_binary_is_macho(header)) continue;
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
