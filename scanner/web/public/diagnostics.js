import { observedInventory } from './bundle-inventory.js';
import { timeSlice } from './folder-walk.js';
import { prettyBytes } from './scan-view.js';

export const PLAIN_JSON_LIMIT = 5_000;

const duration = (end, start) => start === null || end === null ? null : Math.max(0, end - start);

export function watchLongTasks() {
  const entries = [];
  let observer;
  if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
    observer = new PerformanceObserver((list) => {
      for (const { startTime, duration } of list.getEntries()) entries.push({ startTime, duration });
    });
    observer.observe({ type: 'longtask' });
  }
  return (start, end) => {
    if (!observer) return null;
    for (const { startTime, duration } of observer.takeRecords()) entries.push({ startTime, duration });
    return entries.filter(({ startTime, duration }) => startTime + duration >= start && startTime <= end)
      .map(({ startTime, duration }) => ({ offset_ms: startTime - start, duration_ms: duration }));
  };
}

function scannerBuild() {
  return fetch('./scanner-build.json')
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({}));
}

let build;
export async function runHeader(run, finished, longTasks) {
  build ??= scannerBuild();
  const now = performance.now();
  const end = run.ended ?? now;
  const scanMs = duration(run.ended === null && run.active ? now : run.lastScan, run.firstScan);
  const header = {
    schema_version: 1,
    profile: run.profile,
    scheduling_mode: run.mode.passive ? 'passive' : 'foreground',
    scheduling_modes: [...run.modes],
    user_agent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform ?? null,
    hardware_concurrency: navigator.hardwareConcurrency ?? null,
    device_memory_gib: navigator.deviceMemory ?? null,
    started_at: new Date(performance.timeOrigin + run.started).toISOString(),
    ...run.stats,
    skipped_entries: { ...run.stats.skipped_entries },
    skip_examples: [...(run.stats.skip_examples ?? [])],
    app_bundles: run.appCount,
    enumeration_ms: duration(run.enumerated, run.started),
    scan_ms: scanMs,
    throughput_results_per_second: scanMs ? finished * 1000 / scanMs : null,
    throughput_bytes_per_second: scanMs ? run.bytes * 1000 / scanMs : null,
    peak_worker_count: run.peak,
    long_tasks: longTasks(run.started, end),
    canceled: Boolean(run.canceled),
  };
  const { commit, version, wasm_sha256, working_tree_dirty } = await build;
  return {
    scanner_git_commit: commit ?? null,
    scanner_version: version ?? null,
    scanner_working_tree_dirty: working_tree_dirty ?? null,
    wasm_sha256: wasm_sha256 ?? null,
    ...header,
  };
}

export function resultRecord(row, full) {
  const { result, evidence } = row;
  const displayPath = row.label;
  const parent = row.parentBundlePath;
  const record = {
    ...result,
    id: row.id,
    stable_id: `${row.kind}:${displayPath}`,
    display_path: displayPath,
    parent_bundle_path: parent,
    bundle_role: result.bundle_role ?? (row.kind === 'bundle' ? (parent ? 'nested_app' : 'app') : null),
    source: row.source,
    executable_path: result.executable_path ?? (result.format === 'macho' ? displayPath : null),
    executable_size: result.executable_size ?? (result.format === 'macho' ? result.total_size : null),
    error_class: result.error_class ?? (result.error ? result.status : null),
    elapsed_ms: duration(row.ended, row.started),
    info_plist_keys: evidence?.info_plist_keys ?? null,
  };
  if (!full) return record;
  const plistPath = evidence?.info_plist_path ?? null;
  const executablePath = record.executable_path;
  const existingExecutable = record.executable_size !== null || record.error_class === 'unreadable_executable' ||
    record.error_class === 'permission_denied';
  const copy = row.kind === 'bundle'
    ? [plistPath && `${displayPath}/${plistPath}`, existingExecutable && executablePath].filter(Boolean)
    : [displayPath];
  const embedded = evidence?.plist_in_container ? [plistPath, executablePath].filter(Boolean) : [];
  const candidates = result.candidate_executables?.slice() ?? (row.relativeCandidates ?? []).map((candidate) => {
    const path = typeof candidate === 'string' ? candidate : candidate.path;
    const fullPath = `${displayPath}/${path}`;
    return {
      path: fullPath,
      size: fullPath === executablePath ? result.executable_size : candidate.size ??
        row.directoryListings?.macos?.entries.find(({ name }) => path === `Contents/MacOS/${name}`)?.size ?? null,
      architectures: fullPath === executablePath ? result.architectures : [],
    };
  });
  if (executablePath && row.kind === 'bundle' && !candidates.some(({ path }) => path === executablePath)) {
    candidates.push({ path: executablePath, size: record.executable_size, architectures: result.architectures });
  }
  const nestedArtifacts = result.nested_artifacts ?? row.nestedArtifacts ?? [];
  const diagnostic = {
    ...record,
    info_plist: evidence?.info_plist ?? null,
    info_plist_path: plistPath,
    info_plist_size: evidence?.info_plist_size ?? null,
    plist_in_container: Boolean(evidence?.plist_in_container),
    info_plist_encoding: evidence?.info_plist_encoding ?? null,
    executable_prefix_hex: evidence?.executable_prefix_hex ?? null,
    load_commands: evidence?.load_commands ?? null,
    directory_listings: row.directoryListings ?? null,
    candidate_executables: candidates,
    inventory: result.inventory ?? (row.kind === 'bundle' ? observedInventory(row) : null),
    nested_artifacts: nestedArtifacts,
    read_log: evidence?.read_log ?? null,
    reproduction: ['complete', 'canceled'].includes(result.status) ? null : {
      relative_path: displayPath,
      copy_from_selection: copy,
      container_member_paths: embedded,
      supporting_paths: row.kind === 'bundle' ? [...new Set([
        ...candidates.filter(({ size }) => size !== null).map(({ path }) => path), ...nestedArtifacts,
      ])].filter((path) => !copy.includes(path)) : [],
      missing_executable: result.status === 'no_executable',
      expected_executable_path: executablePath,
      expected_status: result.status,
      command: ['scan-cli', 'scan', displayPath, '--profile', 'local', '--json'],
    },
  };
  return result.status === 'complete' ? compactSuccess(diagnostic) : diagnostic;
}

function compactSuccess(record) {
  if (record.info_plist != null) delete record.info_plist_keys;
  if (record.bundle_path === record.display_path) delete record.bundle_path;
  if (!record.plist_in_container) delete record.plist_in_container;
  record.candidate_executables = record.candidate_executables.filter((candidate) => {
    if (candidate.path !== record.executable_path || candidate.size !== record.executable_size) return true;
    const slices = candidate.architectures ?? [];
    return slices.length && JSON.stringify(slices) !== JSON.stringify(record.architectures);
  });
  return Object.fromEntries(Object.entries(record).filter(([key, value]) =>
    value != null && value !== '' && (key === 'info_plist' || !Array.isArray(value) || value.length > 0)));
}

function button(id, text) {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = id;
  el.className = 'quiet-button';
  el.textContent = text;
  return el;
}

export async function makeExport(header, rows, { count, format = 'ndjson.gz', scope = 'diagnostics' }) {
  if ((format === 'json' && !(count < PLAIN_JSON_LIMIT)) || !['json', 'ndjson.gz'].includes(format)) {
    throw new RangeError('Plain JSON is available for exports under 5,000 rows.');
  }
  const worker = new Worker(new URL('./diagnostics-worker.js', import.meta.url), { type: 'module' });
  let acknowledge;
  const finished = new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.error) reject(new Error(data.error));
      else if (data.ready) acknowledge?.();
      else resolve(data.blob);
    };
    worker.onerror = () => reject(new Error('The diagnostics worker stopped.'));
  });
  // Attach a handler while the producer is still sending rows.
  void finished.catch(() => {});
  worker.postMessage({ header, format, plainLimit: PLAIN_JSON_LIMIT });
  try {
    const pause = timeSlice();
    const records = [];
    let sent = 0;
    const send = () => {
      if (!records.length) return;
      worker.postMessage({ records: records.splice(0) });
      sent += 1;
    };
    for (const row of rows) {
      if (row.result && (scope !== 'failures' || !['complete', 'canceled'].includes(row.result.status))) {
        records.push(resultRecord(row, scope !== 'results'));
        if (records.length >= 16) send();
      }
      if (sent >= 8) {
        // Bound the structured-clone queue independently of export size.
        const ready = new Promise((resolve) => { acknowledge = resolve; });
        worker.postMessage({ checkpoint: true });
        await Promise.race([ready, finished]);
        acknowledge = undefined;
        sent = 0;
      }
      const wait = pause();
      if (wait) {
        send();
        await wait;
      }
    }
    send();
    worker.postMessage({ end: true });
    return await finished;
  } finally {
    worker.terminate();
  }
}

export function diagnosticControls(resolver) {
  const container = document.createElement('div');
  container.className = 'diagnostic-actions';
  const feedback = document.createElement('p');
  feedback.className = 'muted diagnostic-summary';
  const formatLabel = document.createElement('label');
  const format = document.createElement('select');
  const compressed = new Option('Compressed NDJSON (.ndjson.gz)', 'ndjson.gz');
  const plain = new Option('Plain JSON', 'json');
  format.append(compressed, plain);
  formatLabel.append('Diagnostics format ', format);
  const save = document.createElement('a');
  save.hidden = true;
  let blobURL;
  let selection;
  const controls = new Map();
  let small = true;

  function reset() {
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = undefined;
    save.hidden = true;
    feedback.textContent = '';
  }

  async function prepare(kind) {
    reset();
    for (const control of controls.values()) control.disabled = true;
    format.disabled = true;
    feedback.textContent = 'Preparing the local export…';
    try {
      const filter = kind === 'failures' ? 'failures' : kind === 'results' || kind === 'copy' ? 'results' : 'diagnostics';
      const { header, rows, count } = await resolver();
      const type = count >= PLAIN_JSON_LIMIT ? 'ndjson.gz' : filter === 'diagnostics' ? format.value : 'json';
      const blob = await makeExport(header, rows, { count, format: type, scope: filter });
      blobURL = URL.createObjectURL(blob);
      save.href = blobURL;
      save.download = `scanner-${filter}.${type}`;
      save.textContent = `Save ${filter} ${type === 'json' ? 'JSON' : 'gzip'}`;
      save.hidden = false;
      selection = kind;
      const contents = filter === 'results' ? 'Scan results and metadata' :
        `${filter === 'failures' ? 'Failure' : 'Success and failure'} details, including Info.plist and up to 64 executable bytes per result`;
      feedback.textContent = `${contents} · ${prettyBytes(blob.size)} · local file`;
      if (kind === 'copy' && type === 'json') {
        const copy = button('copy-results-ready', 'Copy prepared results JSON');
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'text/plain': blob.slice(0, blob.size, 'text/plain') }),
            ]);
            feedback.textContent = `Copied ${prettyBytes(blob.size)} of results JSON.`;
          } catch {
            feedback.textContent = 'Clipboard access is unavailable. Save the prepared JSON instead.';
          }
        });
        feedback.append(' ', copy);
      }
      save.focus();
    } catch {
      reset();
      feedback.textContent = 'The browser could not prepare the export.';
    } finally {
      for (const control of controls.values()) control.disabled = false;
      format.disabled = false;
    }
  }

  for (const [kind, text] of [
    ['diagnostics', 'Download diagnostics'], ['results', 'Download results JSON'],
    ['failures', 'Download failures JSON'], ['copy', 'Copy results JSON'],
  ]) {
    const control = button(kind === 'copy' ? 'copy-results' : `download-${kind}`, text);
    control.addEventListener('click', () => void prepare(kind));
    controls.set(kind, control);
  }
  format.addEventListener('change', () => { if (selection === 'diagnostics') reset(); });
  container.append(...controls.values(), formatLabel, feedback, save);
  return {
    element: container,
    reset,
    update(count) {
      const allowPlain = count < PLAIN_JSON_LIMIT;
      if (small === allowPlain) return;
      small = allowPlain;
      if (allowPlain) format.append(plain);
      else {
        format.value = compressed.value;
        plain.remove();
      }
      formatLabel.hidden = !allowPlain;
      controls.get('copy').hidden = !allowPlain;
      controls.get('results').textContent = allowPlain ? 'Download results JSON' : 'Download results';
      controls.get('failures').textContent = allowPlain ? 'Download failures JSON' : 'Download failures';
    },
  };
}
