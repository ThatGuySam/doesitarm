import init, { local_bundle_metadata, scan, scan_diagnostic } from './pkg/scan_wasm.js';
import { machoEvidence } from './macho-evidence.js';
import { scanRemote } from './range-scan.js';
import { emptyResult, MIB } from './scan-result.js';

let passive = false;
let executableRequest;

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
  const evidence = job.kind === 'url' ? null : { read_log: [] };
  let result;
  try {
    if (job.kind !== 'url' || !job.forceWorker) await init();
    if (job.kind === 'file') {
      if (job.probe) {
        evidence.read_log.push({
          path: job.label, offset: 0, length: 4, purpose: 'folder_magic_probe', outcome: 'ok',
        });
      }
      result = await scanFile(job.file, job.label, progress, evidence);
    } else if (job.kind === 'bundle') {
      result = await scanBundle(job, progress, id, evidence);
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
  self.postMessage({ type: 'done', id, result, source, bytes, evidence });
});

const READ_CHUNK = 4 * MIB;
const PLANNED_READ_CHUNK = 64 * 1024;
const THIN_HEADERS = new Map([
  [0xfeedface, 28], [0xcefaedfe, 28],
  [0xfeedfacf, 32], [0xcffaedfe, 32],
]);

async function capturePrefix(file, path, evidence, onRead) {
  const length = Math.min(file.size, 64);
  if (!length) {
    evidence.executable_prefix_hex = '';
    return false;
  }
  const record = { path, offset: 0, length, purpose: 'diagnostic_executable_prefix', outcome: 'error' };
  evidence.read_log.push(record);
  try {
    const waiting = yieldForPassive();
    if (waiting) await waiting;
    const bytes = new Uint8Array(await file.slice(0, length).arrayBuffer());
    if (bytes.length !== length) return false;
    record.outcome = 'ok';
    onRead(bytes.length);
    evidence.executable_prefix_hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return bytes[0] === 0x23 && bytes[1] === 0x21;
  } catch {
    return false;
  }
}

async function scanFile(file, path, progress, evidence, declared = false) {
  let read = 0;
  let sourceError;
  let thinHeader;
  let planned = null;
  const macho = machoEvidence();
  let script = false;
  const readAt = async (offset, length) => {
    const start = Number(offset);
    const end = start + length;
    const purpose = macho.purpose(start, length);
    const record = { path, offset: start, length, purpose, outcome: 'error' };
    evidence.read_log.push(record);
    if (!Number.isSafeInteger(end) || end > file.size) {
      sourceError = 'The scanner requested a range outside the supported file bounds.';
      throw new RangeError(sourceError);
    }

    // Wasm identifies the last source read of a bare thin Mach-O.
    if (start === thinHeader) {
      planned = read + length;
      progress(read, file.size, planned);
    }
    try {
      const chunk = planned === null ? READ_CHUNK : PLANNED_READ_CHUNK;
      let bytes = length > chunk ? new Uint8Array(length) : null;
      for (let position = start; position < end; position += chunk) {
        const waiting = yieldForPassive();
        if (waiting) await waiting;
        const chunkEnd = Math.min(position + chunk, end);
        const physical = length > chunk ? {
          path, offset: position, length: chunkEnd - position, purpose, scope: 'source_chunk', outcome: 'error',
        } : record;
        if (physical !== record) evidence.read_log.push(physical);
        const current = new Uint8Array(await file.slice(position, chunkEnd).arrayBuffer());
        if (current.byteLength !== chunkEnd - position) throw new Error('Incomplete file range');
        physical.outcome = 'ok';
        read += current.byteLength;
        progress(read, file.size, planned);
        if (length > chunk) bytes.set(current, position - start);
        else bytes = current;
      }
      record.outcome = 'ok';
      if (length) {
        if (purpose === 'format_magic') {
          thinHeader = THIN_HEADERS.get(new DataView(bytes.buffer).getUint32(0));
          script = bytes[0] === 0x23 && bytes[1] === 0x21;
        }
        macho.observe(start, bytes, purpose);
      }
      return bytes ?? new Uint8Array();
    } catch (error) {
      sourceError = 'The browser could not read this file range. Check that the file is still available.';
      throw error;
    }
  };
  let magic = !declared && file.size >= 4 ? await readAt(0n, 4) : null;
  const readSource = (offset, length) => {
    if (magic && offset === 0n && length === 4) {
      const cached = magic;
      magic = null;
      return cached;
    }
    return readAt(offset, length);
  };
  // Keep the thin Mach-O read plan exact. Archive diagnostics can use the
  // core's prefix cache because their progress is indeterminate.
  const result = JSON.parse(await (declared || macho.recognized
    ? scan(BigInt(file.size), 0n, readSource, undefined, 'local')
    : scan_diagnostic(BigInt(file.size), readSource)));
  const diagnostic = result.diagnostic;
  delete result.diagnostic;
  if (sourceError) result.error = sourceError;
  if (declared || result.format === 'macho') {
    const capturedScript = await capturePrefix(file, path, evidence, (length) =>
      progress(read + length, file.size, planned));
    script ||= capturedScript;
  }
  if (declared && script) {
    result.status = 'script';
    result.error_class = 'executable_is_script';
    result.error = 'CFBundleExecutable is a script. Its file does not declare a Mach-O architecture.';
  }
  if (diagnostic) Object.assign(evidence, diagnostic, { plist_in_container: Boolean(diagnostic.info_plist_path) });
  else evidence.load_commands = macho.lists.length ? macho.lists : null;
  return result;
}

async function scanBundle(job, progress, id, evidence) {
  const { plist, label, plistPath, parentBundlePath, roleHint } = job;
  const role = roleHint === 'wrapper' ? 'wrapper' : parentBundlePath ? 'nested_app' : 'app';
  const app = { format: 'app', bundle_path: label, bundle_role: role };
  if (!plist) {
    const reason = role === 'wrapper' ? 'This wrapper has a nested app and has no Info.plist of its own.' :
      'The app folder has no readable Info.plist.';
    return {
      ...emptyResult(role === 'wrapper' ? 'no_executable' : 'not_found', reason),
      ...app,
      error_class: role === 'wrapper' ? 'wrapper_bundle' : 'missing_info_plist',
    };
  }
  evidence.info_plist_path = plistPath ?? 'Contents/Info.plist';
  evidence.info_plist_size = plist.size;
  // Match the core's structural plist bound before allocating the buffer.
  if (plist.size > 2 * MIB) {
    return { ...emptyResult('limit_reached', 'Info.plist exceeds 2 MiB.', plist.size), ...app,
      error_class: 'plist_size_limit' };
  }

  const waiting = yieldForPassive();
  if (waiting) await waiting;
  const record = {
    path: `${label}/${evidence.info_plist_path}`, offset: 0, length: plist.size, purpose: 'info_plist', outcome: 'error',
  };
  evidence.read_log.push(record);
  const bytes = new Uint8Array(await plist.arrayBuffer());
  record.outcome = 'ok';
  progress(bytes.byteLength, plist.size);
  const {
    result: metadata, bundle_role, error_class, executable_relative_path, executable_resolution,
    info_plist, info_plist_encoding, info_plist_keys,
  } = JSON.parse(local_bundle_metadata(bytes, label, evidence.info_plist_path, Boolean(parentBundlePath), roleHint ?? ''));
  Object.assign(evidence, { info_plist, info_plist_encoding, info_plist_keys });
  const bundle = { ...metadata, bundle_role, error_class };
  const fallback = executable_resolution === 'bundle_name_fallback';
  if (!executable_relative_path || (metadata.error && !fallback)) return bundle;

  const { file: executable, errorClass, path: resolvedPath, resolution } = await new Promise((resolve) => {
    executableRequest = { id, resolve };
    self.postMessage({ type: 'executable-needed', id, path: executable_relative_path });
  });
  executableRequest = undefined;
  if (!executable) {
    if (fallback && !errorClass) return bundle;
    return {
      ...bundle,
      status: errorClass ? 'source_error' : 'no_executable',
      error_class: errorClass ?? 'missing_executable_file',
      error: errorClass ? 'The browser could not read the executable named in Info.plist.' :
        'The executable named in Info.plist is missing from the selected app.',
    };
  }

  const path = `${label}/${resolvedPath ?? executable_relative_path}`;
  const totalSize = plist.size + executable.size;
  const result = await scanFile(executable, path, (read, size, planned) =>
    progress(plist.size + read, plist.size + size, planned === null ? null : plist.size + planned), evidence, true);
  if (result.format && result.format !== 'macho') {
    result.status = 'invalid';
    result.error_class = 'executable_not_macho';
    result.error = 'CFBundleExecutable names a file that is not a Mach-O executable.';
    result.architectures = [];
  }
  const verified = result.format === 'macho' && result.status === 'complete' &&
    result.architectures.some(({ header_verified }) => header_verified);
  return {
    ...bundle,
    executable_path: path,
    executable_resolution: resolution ?? executable_resolution,
    status: fallback && !verified ? bundle.status : result.status,
    error: fallback && !verified ? bundle.error : result.error,
    error_class: fallback && !verified ? bundle.error_class : result.error_class ?? (result.error ? result.status : null),
    architectures: fallback && !verified ? [] : result.architectures,
    min_macos: metadata.min_macos ?? result.min_macos,
    executable_size: executable.size,
    bytes_read: plist.size + result.bytes_read,
    bytes_requested: plist.size + result.bytes_requested,
    decoded_bytes: result.decoded_bytes,
    reads: metadata.reads + result.reads,
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
