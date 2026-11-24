import { observedInventory } from './bundle-inventory.js';
import { timeSlice } from './folder-walk.js';
import { prettyBytes } from './scan-view.js';

const duration = (end, start) => start === null || end === null ? null : Math.max(0, end - start);

export function watchLongTasks() {
  const entries = [];
  let observer;
  if (globalThis.PerformanceObserver?.supportedEntryTypes.includes('longtask')) {
    observer = new PerformanceObserver((list) => {
      for (const { startTime, duration } of list.getEntries()) entries.push({ startTime, duration });
    });
    observer.observe({ type: 'longtask' });
  }
  return (start, end) => {
    if (!observer) return null;
    for (const { startTime, duration } of observer.takeRecords()) entries.push({ startTime, duration });
    return entries.filter(({ startTime }) => startTime >= start && startTime <= end)
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
  const { commit, version, wasm_sha256, working_tree_dirty } = await build;
  const now = performance.now();
  const end = run.ended ?? now;
  const scanMs = duration(run.ended === null && run.active ? now : run.lastScan, run.firstScan);
  return {
    schema_version: 1,
    scanner_git_commit: commit ?? null,
    scanner_version: version ?? null,
    scanner_working_tree_dirty: working_tree_dirty ?? null,
    wasm_sha256: wasm_sha256 ?? null,
    profile: run.profile,
    scheduling_mode: run.mode.passive ? 'passive' : 'foreground',
    scheduling_modes: [...run.modes],
    user_agent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform ?? null,
    hardware_concurrency: navigator.hardwareConcurrency ?? null,
    device_memory_gib: navigator.deviceMemory ?? null,
    started_at: new Date(performance.timeOrigin + run.started).toISOString(),
    ...run.stats,
    app_bundles: run.appCount,
    enumeration_ms: duration(run.enumerated, run.started),
    scan_ms: scanMs,
    throughput_results_per_second: scanMs ? finished * 1000 / scanMs : null,
    throughput_bytes_per_second: scanMs ? run.bytes * 1000 / scanMs : null,
    peak_worker_count: run.peak,
    long_tasks: longTasks(run.started, end),
    canceled: Boolean(run.canceled),
  };
}

export function resultRecord(row, full) {
  const { result, evidence } = row;
  const displayPath = row.label;
  const parent = row.parentBundlePath;
  const record = {
    id: row.id,
    display_path: displayPath,
    parent_bundle_path: parent,
    bundle_role: result.bundle_role ?? (row.kind === 'bundle' ? (parent ? 'nested_app' : 'app') : null),
    source: row.source,
    ...result,
    executable_path: result.executable_path ?? (result.format === 'macho' ? displayPath : null),
    error_class: result.error_class ?? (result.error ? result.status : null),
    elapsed_ms: duration(row.ended, row.started),
    info_plist_keys: evidence?.info_plist_keys ?? null,
  };
  if (!full) return record;
  const plistPath = evidence?.info_plist_path ?? null;
  const executablePath = record.executable_path;
  const copy = row.kind === 'bundle'
    ? [plistPath && `${displayPath}/${plistPath}`, executablePath].filter(Boolean)
    : [displayPath];
  const embedded = evidence?.plist_in_container ? [plistPath, executablePath].filter(Boolean) : [];
  const candidates = result.candidate_executables ?? (row.relativeCandidates ?? []).map((candidate) => {
    const path = typeof candidate === 'string' ? candidate : candidate.path;
    const fullPath = `${displayPath}/${path}`;
    return {
      path: fullPath,
      size: fullPath === executablePath ? result.executable_size : candidate.size ??
        row.directoryListings?.macos?.entries.find(({ name }) => path === `Contents/MacOS/${name}`)?.size ?? null,
      architectures: fullPath === executablePath ? result.architectures : [],
    };
  });
  return {
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
    nested_artifacts: result.nested_artifacts ?? row.nestedArtifacts ?? [],
    read_log: evidence?.read_log ?? null,
    reproduction: result.status === 'complete' ? null : {
      relative_path: displayPath,
      copy_from_selection: copy,
      container_member_paths: embedded,
      missing_executable: result.status === 'no_executable',
      expected_status: result.status,
      command: ['scan-cli', 'scan', displayPath, '--profile', 'local', '--json'],
    },
  };
}

function button(id, text) {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = id;
  el.className = 'secondary';
  el.textContent = text;
  return el;
}

export async function makeExport(header, rows, kind, redact) {
  const worker = new Worker(new URL('./diagnostics-worker.js', import.meta.url), { type: 'module' });
  const finished = new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.error) reject(new Error(data.error));
      else resolve(data.blob);
    };
    worker.onerror = () => reject(new Error('The diagnostics worker stopped.'));
  });
  // Attach a handler while the producer is still sending rows.
  void finished.catch(() => {});
  worker.postMessage({ header, kind, redact });
  try {
    const pause = timeSlice();
    const records = [];
    const send = () => {
      if (records.length) worker.postMessage({ records: records.splice(0) });
    };
    for (const row of rows) {
      if (row.result && (kind !== 'failures' || !['complete', 'canceled'].includes(row.result.status))) {
        records.push(resultRecord(row, kind !== 'results' && kind !== 'copy'));
        if (records.length >= 16) send();
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
  const label = document.createElement('label');
  const privacy = document.createElement('input');
  privacy.type = 'checkbox';
  privacy.checked = true;
  privacy.id = 'hide-username';
  label.append(privacy, ' Hide my username');
  const feedback = document.createElement('p');
  feedback.className = 'muted diagnostic-summary';
  const formatLabel = document.createElement('label');
  const format = document.createElement('select');
  format.append(new Option('JSON', 'json'), new Option('NDJSON', 'ndjson'));
  formatLabel.append('Diagnostics format ', format);
  const save = document.createElement('a');
  save.hidden = true;
  let blobURL;
  let selection;
  const controls = [];

  function reset() {
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = undefined;
    save.hidden = true;
    feedback.textContent = '';
  }

  async function prepare(kind) {
    reset();
    for (const control of controls) control.disabled = true;
    privacy.disabled = true;
    format.disabled = true;
    feedback.textContent = 'Preparing the local export…';
    try {
      const filter = kind === 'failures' ? 'failures' : kind === 'results' || kind === 'copy' ? 'results' : 'diagnostics';
      const { header, rows } = await resolver();
      const type = filter === 'diagnostics' ? format.value : 'json';
      const blob = await makeExport(header, rows, filter === 'diagnostics' ? type : kind, privacy.checked);
      blobURL = URL.createObjectURL(blob);
      save.href = blobURL;
      save.download = `scanner-${filter}.${type}`;
      save.textContent = kind === 'copy' ? 'Save results JSON' : `Save ${filter} ${type.toUpperCase()}`;
      save.hidden = false;
      selection = kind;
      const contents = filter === 'results' ? 'Scan results and metadata' :
        `${filter === 'failures' ? 'Failure' : 'Success and failure'} details, including Info.plist and up to 64 executable bytes per result`;
      feedback.textContent = `${contents} · ${prettyBytes(blob.size)} · local file`;
      if (kind === 'copy') {
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
      for (const control of controls) control.disabled = false;
      privacy.disabled = false;
      format.disabled = false;
    }
  }

  for (const [kind, text] of [
    ['diagnostics', 'Download diagnostics'], ['results', 'Download results JSON'],
    ['failures', 'Download failures JSON'], ['copy', 'Copy results JSON'],
  ]) {
    const control = button(kind === 'copy' ? 'copy-results' : `download-${kind}`, text);
    control.addEventListener('click', () => void prepare(kind));
    controls.push(control);
  }
  privacy.addEventListener('change', reset);
  format.addEventListener('change', () => { if (selection === 'diagnostics') reset(); });
  container.append(...controls, formatLabel, label, feedback, save);
  return container;
}
