import { redactPath, redactPaths, stringifyRedacted } from './path-privacy.js';

// A small breadcrumb journal for scans. A browser crash cannot be caught from
// the page, so the journal is written often and cheaply to IndexedDB. A session
// that never reaches its clean end marker is offered as a crash report on the
// next load. Nothing is uploaded, and no file contents are recorded. Text that
// may carry a path goes through the same redaction as the diagnostics.
const DATABASE = 'scanner-crash-journal';
const STORE = 'sessions';
const BEAT_MS = 1_000;
const KEEP_SESSIONS = 5;
const MAX_EVENTS = 200;
const MAX_SAMPLES = 240;
const MAX_LONG_TASKS = 100;
const LOCK_PREFIX = 'scanner-crash-';
const STALE_MS = 15_000;

let connection;
function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        connection = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Journal storage is blocked.'));
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

const answer = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function put(record, durability = 'relaxed') {
  const db = await database();
  const transaction = db.transaction(STORE, 'readwrite', { durability });
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
  transaction.objectStore(STORE).put(record);
  await done;
}

// Feature detection first; the user agent only supplies the version number.
export function browserInfo(env = globalThis) {
  const nav = env.navigator ?? {};
  const ua = nav.userAgent ?? '';
  const brands = nav.userAgentData?.brands;
  let name = 'unknown';
  let version = null;
  if (brands?.length || env.chrome) {
    const brand = brands?.find(({ brand }) => !/not.?a.?brand/i.test(brand) && brand !== 'Chromium') ??
      brands?.find(({ brand }) => brand === 'Chromium');
    name = brand?.brand ?? 'Chromium';
    version = brand?.version ?? /Chrom(?:e|ium)\/([\d.]+)/.exec(ua)?.[1] ?? null;
  } else if ('mozInnerScreenX' in env || typeof env.InstallTrigger !== 'undefined') {
    name = 'Firefox';
    version = /Firefox\/([\d.]+)/.exec(ua)?.[1] ?? null;
  } else if ('ApplePaySession' in env || env.GestureEvent) {
    name = 'Safari';
    version = /Version\/([\d.]+)/.exec(ua)?.[1] ?? null;
  }
  return {
    name, version, user_agent: ua,
    show_directory_picker: typeof env.showDirectoryPicker === 'function',
    memory_api: Boolean(env.performance?.memory),
    web_locks: Boolean(nav.locks),
    hardware_concurrency: nav.hardwareConcurrency ?? null,
    device_memory_gib: nav.deviceMemory ?? null,
  };
}

function memoryReading() {
  const memory = performance.memory;
  return memory ? {
    js_heap_used: memory.usedJSHeapSize, js_heap_total: memory.totalJSHeapSize, js_heap_limit: memory.jsHeapSizeLimit,
  } : {};
}

export function memoryPressure() {
  const { js_heap_used: used, js_heap_limit: limit } = memoryReading();
  return used && limit ? used / limit : 0;
}

function describeError(error) {
  const value = error?.reason ?? error;
  return {
    name: String(value?.name ?? typeof value).slice(0, 80),
    message: redactPath(String(value?.message ?? value ?? '').slice(0, 400)),
    stack: redactPath(String(value?.stack ?? '').slice(0, 1200)) || undefined,
  };
}

class CrashJournal {
  #record;
  #snapshot = () => ({});
  #timer;
  #writing = false;
  #longTasks;
  #build = () => Promise.resolve({});
  #release;
  #started = 0;

  attach(snapshot, build) {
    this.#snapshot = snapshot;
    if (build) this.#build = build;
  }

  get active() { return Boolean(this.#record); }

  // Returns true when this call started the session.
  begin(input) {
    if (this.#record) {
      this.event('input', { input });
      return false;
    }
    this.#started = performance.now();
    const id = crypto.randomUUID();
    this.#record = {
      id, schema_version: 1, started_at: new Date().toISOString(), clean: false, input,
      stage: 'enumerating', browser: browserInfo(), build: {}, events: [], samples: [], long_tasks: [],
      counts: {}, heartbeat: Date.now(), page: { visibility: document.visibilityState },
    };
    this.#holdLock(id);
    void this.#build().then((build) => {
      if (this.#record?.id !== id) return;
      const { commit, version, wasm_sha256, working_tree_dirty } = build;
      this.#record.build = { commit: commit ?? null, version: version ?? null, wasm_sha256: wasm_sha256 ?? null, dirty: working_tree_dirty ?? null };
      void this.#flush('strict');
    }).catch(() => {});
    this.#watchLongTasks();
    this.event('begin', { input });
    this.#timer = setInterval(() => this.#beat(), BEAT_MS);
    return true;
  }

  #holdLock(id) {
    if (!navigator.locks) return;
    // The lock goes away with the page, even if the page crashes. Another tab
    // can then tell a live scan from an abandoned journal.
    void navigator.locks.request(LOCK_PREFIX + id, () => new Promise((resolve) => { this.#release = resolve; })).catch(() => {});
  }

  #watchLongTasks() {
    if (!globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) return;
    this.#longTasks = new PerformanceObserver((list) => {
      const tasks = this.#record?.long_tasks;
      if (!tasks) return;
      for (const { startTime, duration } of list.getEntries()) {
        if (tasks.length < MAX_LONG_TASKS) tasks.push({ at_ms: Math.round(startTime - this.#started), duration_ms: Math.round(duration) });
      }
    });
    this.#longTasks.observe({ type: 'longtask' });
  }

  stage(name) {
    const record = this.#record;
    if (!record || record.stage === name) return;
    record.stage = name;
    this.event('stage', { stage: name }, true);
  }

  event(type, detail = {}, strict = false) {
    const record = this.#record;
    if (!record) return;
    const events = record.events;
    if (events.length >= MAX_EVENTS) events.splice(1, 1);
    events.push(redactPaths({ at_ms: Math.round(performance.now() - this.#started), type, ...detail }));
    if (strict) void this.#flush('strict');
  }

  error(kind, error, detail = {}) {
    this.event(kind, { ...describeError(error), ...detail, ...this.#counts() }, true);
  }

  #counts() {
    try {
      return { counts: this.#snapshot() };
    } catch {
      return {};
    }
  }

  #beat() {
    const record = this.#record;
    if (!record) return;
    const counts = this.#snapshot();
    const sample = {
      at_ms: Math.round(performance.now() - this.#started), stage: counts.stage ?? record.stage, ...counts, ...memoryReading(),
    };
    if (counts.stage && counts.stage !== 'idle') this.stage(counts.stage);
    record.counts = counts;
    record.samples.push(sample);
    if (record.samples.length > MAX_SAMPLES) {
      // Thin the older half so the start and the end of the trail both stay.
      const old = record.samples.slice(0, MAX_SAMPLES / 2).filter((_, index) => index % 2 === 0);
      record.samples = [...old, ...record.samples.slice(MAX_SAMPLES / 2)];
    }
    record.heartbeat = Date.now();
    void this.#flush();
  }

  async #flush(durability = 'relaxed') {
    const record = this.#record;
    if (!record || (this.#writing && durability === 'relaxed')) return;
    this.#writing = true;
    try {
      record.page.visibility = document.visibilityState;
      await put(JSON.parse(JSON.stringify(record)), durability);
    } catch {
      // The journal is best effort and never interrupts a scan.
    } finally {
      this.#writing = false;
    }
  }

  pageEvent(type) {
    if (!this.#record) return;
    this.#record.heartbeat = Date.now();
    this.event(type, { visibility: document.visibilityState, ...this.#counts() }, true);
  }

  async end(reason = 'complete') {
    const record = this.#record;
    if (!record) return;
    clearInterval(this.#timer);
    this.#longTasks?.disconnect();
    this.#longTasks = undefined;
    this.#record = undefined;
    record.clean = true;
    record.ended_at = new Date().toISOString();
    record.end_reason = reason;
    record.stage = 'ended';
    record.counts = this.#snapshotOrEmpty();
    record.events.push({ at_ms: Math.round(performance.now() - this.#started), type: 'clean_end', reason });
    try {
      await put(JSON.parse(JSON.stringify(record)), 'strict');
    } catch {
      // Best effort.
    }
    this.#release?.();
    this.#release = undefined;
  }

  #snapshotOrEmpty() {
    try { return this.#snapshot(); } catch { return {}; }
  }
}

export const crash = new CrashJournal();

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    crash.error('js_error', event.error ?? { name: 'Error', message: event.message }, { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => crash.error('unhandled_rejection', event));
  window.addEventListener('pagehide', (event) => crash.pageEvent(event.persisted ? 'pagehide_persisted' : 'pagehide'));
  document.addEventListener('visibilitychange', () => crash.pageEvent(`visibility_${document.visibilityState}`));
}

async function liveSessions() {
  if (!navigator.locks?.query) return null;
  const { held = [], pending = [] } = await navigator.locks.query();
  return new Set([...held, ...pending].map(({ name }) => name));
}

// Sessions that never reached their clean end, oldest pruned first.
export async function uncleanSessions() {
  const db = await database();
  const all = await answer(db.transaction(STORE).objectStore(STORE).getAll());
  const live = await liveSessions();
  all.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const stale = all.filter((record) => !record.clean && (live ? !live.has(LOCK_PREFIX + record.id) :
    Date.now() - record.heartbeat > STALE_MS));
  const drop = all.filter((record) => record.clean).slice(KEEP_SESSIONS);
  if (drop.length) await discardSessions(drop.map(({ id }) => id));
  return stale;
}

export async function discardSessions(ids) {
  const db = await database();
  const transaction = db.transaction(STORE, 'readwrite');
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
  for (const id of ids) transaction.objectStore(STORE).delete(id);
  await done;
}

export function crashReportLines(session) {
  const { events, samples, long_tasks: longTasks, ...header } = session;
  return [
    { type: 'crash_report', report_schema_version: 1, outcome: 'no_clean_end', ...header,
      event_count: events.length, sample_count: samples.length, long_task_count: longTasks.length },
    ...events.map(({ type, ...entry }) => ({ type: 'journal_event', event: type, ...entry })),
    ...samples.map((entry) => ({ type: 'sample', ...entry })),
    ...longTasks.map((entry) => ({ type: 'long_task', ...entry })),
  ].map((line) => stringifyRedacted(line)).join('\n') + '\n';
}

export async function crashReportBlob(session) {
  const text = new Blob([crashReportLines(session)]);
  const compressed = text.stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).blob().then((blob) => new Blob([blob], { type: 'application/gzip' }));
}

export async function showCrashNotice() {
  const notice = document.getElementById('crash-notice');
  if (!notice) return;
  let sessions;
  try {
    sessions = await uncleanSessions();
  } catch {
    return;
  }
  if (!sessions.length) return;
  const latest = sessions[0];
  const download = document.getElementById('crash-download');
  const dismiss = document.getElementById('crash-dismiss');
  download.addEventListener('click', async () => {
    const blob = await crashReportBlob(latest);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'scanner-crash-report.ndjson.gz';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  });
  dismiss.addEventListener('click', async () => {
    notice.hidden = true;
    await discardSessions(sessions.map(({ id }) => id)).catch(() => {});
  });
  notice.hidden = false;
}
