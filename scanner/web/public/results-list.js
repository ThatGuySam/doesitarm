import { redactPath } from './path-privacy.js';
import { diagnosticControls, runHeader, watchLongTasks } from './diagnostics.js';
import { folderStats, timeSlice } from './folder-walk.js';
import { formatDuration, estimateBatch, estimateRemaining, recordSample } from './scan-progress.js';
import { emptyResult } from './scan-result.js';
import { get, ScanCards, statuses } from './scan-view.js';
import { observedInventory } from './bundle-inventory.js';
import { emptyBatchTotals, finishBatchTotals, formatSeconds, recordBatchResult, steadyRate, totalsPhrase } from './scan-totals.js';

const PAGE_SIZE = 24;
const number = new Intl.NumberFormat();
const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const labels = { ...statuses, no_executable: 'No executable', script: 'Script', canceled: 'Canceled', queued: 'Queued', scanning: 'Scanning' };

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function select(label, options, change) {
  const input = document.createElement('select');
  for (const [value, text] of options) input.add(new Option(text, value));
  const field = document.createElement('label');
  field.append(label, input);
  input.addEventListener('change', change);
  return { field, input };
}

function navButton(text, click) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet-button';
  button.textContent = text;
  button.addEventListener('click', click);
  return button;
}

function count(map, key, delta) {
  const next = (map.get(key) ?? 0) + delta;
  if (next) map.set(key, next);
  else map.delete(key);
}

const archNames = (result) => [...new Set(result.architectures
  .filter(({ header_verified }) => header_verified)
  .map(({ name }) => name))];

async function sortRows(rows, compare, pause) {
  // Keep each native sort bounded, then merge the runs cooperatively.
  const size = 256;
  for (let start = 0; start < rows.length; start += size) {
    const chunk = rows.slice(start, start + size).sort(compare);
    for (let i = 0; i < chunk.length; i += 1) rows[start + i] = chunk[i];
    const wait = pause();
    if (wait) await wait;
  }
  let spare = new Array(rows.length);
  for (let width = size; width < rows.length; width *= 2) {
    for (let start = 0; start < rows.length; start += width * 2) {
      let left = start;
      let right = Math.min(start + width, rows.length);
      const middle = right;
      const end = Math.min(start + width * 2, rows.length);
      for (let out = start; out < end; out += 1) {
        const takeLeft = left < middle && (right === end || compare(rows[left], rows[right]) <= 0);
        spare[out] = rows[takeLeft ? left++ : right++];
        if ((out & 255) === 0) {
          const wait = pause();
          if (wait) await wait;
        }
      }
    }
    [rows, spare] = [spare, rows];
  }
  return rows;
}

export class ResultsList {
  #pool;
  #mode;
  #rowCount = 0;
  #nextId = 0;
  #runs = [];
  #runsByChoice;
  #pending = new Map();
  #active = new Set();
  #statusCounts = new Map();
  #archCounts = new Map();
  #longTasks = watchLongTasks();
  #list = get('scan-results');
  #rendered = new Map();
  #dirty = new Set();
  #refresh;
  #clock;
  #batch;
  #cards;
  #discoveries = 0;
  #artifactListings = new Set();
  #latestFolder;
  #skeleton;
  #tools;
  #diagnostics;
  #summary;
  #filters;
  #nav;
  #page = 0;
  #matched = null;
  #searchVersion = 0;
  #searchDirty = false;
  #searching = false;

  constructor(pool, mode) {
    this.#pool = pool;
    this.#mode = mode;
    this.#cards = new ScanCards((id) => this.#pool.cancel(id), (row) => this.#inventory(row));
    const change = () => {
      this.#page = 0;
      this.#searchVersion += 1;
      this.#searchDirty = true;
      this.#render();
    };
    const status = select('Status', [['', 'All statuses'], ...Object.entries(labels)], change);
    const arch = select('Architecture', [['', 'All architectures'], ['none', 'No verified architecture']], change);
    const sort = select('Sort by', [
      ['', 'Latest scan first'], ['name', 'Name'], ['status', 'Status'], ['architecture', 'Architecture'],
    ], change);
    this.#filters = { status: status.input, arch: arch.input, sort: sort.input };
    this.#summary = document.createElement('p');
    this.#summary.className = 'muted result-summary';
    const controls = document.createElement('div');
    controls.className = 'result-tools';
    controls.append(status.field, arch.field, sort.field);
    const exportRun = select('Export scan', [], () => {
      this.#diagnostics.reset();
      this.#updateDiagnostics();
    });
    exportRun.field.hidden = true;
    this.#runsByChoice = exportRun;
    controls.append(exportRun.field);

    this.#tools = document.createElement('details');
    this.#tools.id = 'results-tools-disclosure';
    this.#tools.className = 'section-details';
    this.#tools.hidden = true;
    const toolSummary = document.createElement('summary');
    toolSummary.textContent = 'Results tools';
    this.#diagnostics = diagnosticControls(async () => {
      const run = this.#runs[Number(exportRun.input.value)];
      if (!run) return { header: {}, rows: [], count: 0 };
      const length = run.rows.length;
      const count = run.finished;
      const cutoff = performance.now();
      const rows = function* () {
        for (let i = 0; i < length; i += 1) {
          const row = run.rows[i];
          if (row.ended !== null && row.ended <= cutoff) yield row;
        }
      };
      // Only settled rows are included. The header records the run snapshot.
      return { header: await runHeader(run, count, this.#longTasks), rows: rows(), count, cutoff };
    });
    this.#tools.append(toolSummary, this.#summary, controls, this.#diagnostics.element);
    this.#list.before(this.#tools);
    const previous = navButton('Previous page', () => this.#showPage(this.#page - 1));
    const next = navButton('Next page', () => this.#showPage(this.#page + 1));
    const caption = document.createElement('span');
    caption.className = 'muted';
    const nav = document.createElement('nav');
    nav.className = 'result-pagination';
    nav.setAttribute('aria-label', 'Scan result pages');
    nav.hidden = true;
    nav.append(previous, caption, next);
    this.#list.after(nav);
    this.#nav = { nav, previous, caption, next };
  }

  #newBatch() {
    this.#batch = {
      started: performance.now(), ended: null, totals: emptyBatchTotals(), total: 0, finished: 0,
      canceled: 0, extended: false, metricsAt: -Infinity, announcedAt: performance.now(),
    };
    this.#latestFolder = null;
  }

  #newRun(stats, mode, profile) {
    const run = {
      stats, mode, profile, started: performance.now(), enumerated: null, firstScan: null, lastScan: null,
      ended: null, canceled: false, appCount: 0, bytes: 0, active: 0, peak: 0, finished: 0,
      pending: 0, listing: 0, rows: [], children: new Map(), bundles: new Map(), bundleCoverage: new Map(), modes: new Set([this.#modeLabel(mode)]),
    };
    const { field, input } = this.#runsByChoice;
    const value = String(this.#runs.length);
    run.option = new Option(redactPath(stats.folder_name || stats.method), value);
    input.add(run.option);
    input.value = value;
    this.#page = 0;
    field.hidden = Boolean(!this.#runs.length);
    this.#runs.push(run);
    return run;
  }

  #modeLabel(mode) {
    return `${mode.passive ? 'passive' : 'foreground'} (${mode.limit} workers)`;
  }

  get #busy() {
    return Boolean(this.#pending.size || this.#discoveries || this.#artifactListings.size);
  }

  beginFolder(stats, mode) {
    if (!this.#busy) this.#newBatch();
    const run = this.#newRun(stats, mode, 'local');
    this.#latestFolder = run;
    this.#discoveries += 1;
    get('results').hidden = false;
    this.#render();
    return run;
  }

  finishFolder(run, canceled) {
    run.enumerated = performance.now();
    run.canceled ||= canceled;
    run.option.text = redactPath(run.stats.folder_name || run.stats.method);
    if (!run.pending && !run.listing) run.ended = run.enumerated;
    this.#discoveries -= 1;
    this.#endBatch();
    this.#render();
  }

  add(jobs, run) {
    if (!jobs.length) return;
    if (!run) {
      if (!this.#busy) this.#newBatch();
      if (this.#batch.finished && this.#pending.size) this.#batch.extended = true;
      const remote = jobs.some(({ kind }) => kind === 'url');
      const stats = folderStats(remote ? 'URL' : 'file picker');
      stats.files_seen = remote ? 0 : jobs.length;
      run = this.#newRun(stats, this.#mode(), remote ? 'browser local or remote worker' : 'local');
      run.enumerated = run.started;
    }
    const batch = this.#batch;
    if (!batch.total) get('batch-notice').textContent = `Scanning ${jobs.length} ${jobs.length === 1 ? 'item' : 'items'}.`;
    if (batch.finished && this.#busy) batch.extended = true;
    batch.total += jobs.length;
    batch.ended = null;
    run.pending += jobs.length;
    run.ended = null;

    const children = (label) => {
      let entries = run.children.get(label);
      if (!entries) {
        entries = [];
        run.children.set(label, entries);
      }
      return entries;
    };
    for (const job of jobs) {
      const row = {
        id: ++this.#nextId, label: job.label, kind: job.kind,
        parentBundlePath: job.parentBundlePath ?? null, size: job.file?.size ?? job.size,
        directoryListings: job.directoryListings, relativeCandidates: job.relativeCandidates,
        nestedArtifacts: job.nestedArtifacts, bytes: 0, planned: null,
        children: job.kind === 'bundle' ? children(job.label) : undefined,
        started: null, ended: null, status: 'queued', samples: null,
      };
      this.#rowCount += 1;
      run.rows.push(row);
      if (job.kind === 'bundle') run.bundles.set(row.label, row);
      if (row.parentBundlePath) children(row.parentBundlePath).push(row);
      this.#pending.set(row.id, row);
      if (job.kind === 'error') {
        this.#receive(row, run, { type: 'done', result: emptyResult('source_error', job.error), source: 'Browser' });
      } else {
        this.#pool.submit(row.id, job, (event) => {
          if (event.type === 'done' && job.artifacts?.length) {
            this.#addArtifacts(job.artifacts, event.result.executable_path, run);
          }
          this.#receive(row, run, event);
          if (event.type === 'done' || event.type === 'canceled') job.onSettled?.(event);
        });
      }
    }
    this.#searchDirty = true;
    get('results').hidden = false;
    if (!this.#clock) this.#clock = setInterval(() => this.#tick(), 250);
    this.#requestRefresh();
  }

  async #addArtifacts(artifacts, executable, run) {
    const batchSize = 32;
    if (artifacts.length <= batchSize) {
      this.add(artifacts.filter(({ label }) => label !== executable), run);
      return;
    }
    const listing = new AbortController();
    this.#artifactListings.add(listing);
    run.listing += 1;
    try {
      const pause = timeSlice();
      let batch = [];
      for (const job of artifacts) {
        if (listing.signal.aborted) break;
        if (job.label !== executable) batch.push(job);
        if (batch.length < batchSize) continue;
        this.add(batch, run);
        batch = [];
        const wait = pause();
        if (wait) await wait;
      }
      if (!listing.signal.aborted) this.add(batch, run);
    } finally {
      run.listing -= 1;
      if (!run.pending && !run.listing && run.enumerated !== null) run.ended = performance.now();
      this.#artifactListings.delete(listing);
      this.#endBatch();
      this.#requestRefresh();
    }
  }

  cancelAll() {
    for (const run of this.#runs) if (run.ended === null) run.canceled = true;
    for (const listing of this.#artifactListings) listing.abort();
    this.#pool.cancelAll();
  }

  resetEstimates() {
    const mode = this.#modeLabel(this.#mode());
    for (const run of this.#runs) if (run.ended === null) run.modes.add(mode);
    for (const row of this.#active) {
      row.samples = [];
      row.eta = null;
      this.#dirty.add(row.id);
    }
    this.#requestRefresh();
  }

  #receive(row, run, event) {
    const now = performance.now();
    if (event.type === 'start') {
      row.started = now;
      row.status = 'scanning';
      row.samples = [];
      this.#searchDirty = true;
      run.firstScan ??= now;
      this.#active.add(row);
      run.active += 1;
      run.peak = Math.max(run.peak, run.active);
    } else if (event.type === 'progress' || event.type === 'remote') {
      if (event.type === 'remote') row.remote = true;
      this.#read(row, run, event.bytes, event.planned ?? null, now);
    } else {
      if (this.#active.delete(row)) run.active -= 1;
      row.ended = now;
      if (row.started !== null) run.lastScan = now;
      row.result = event.result ?? emptyResult('canceled', null, row.size);
      row.status = row.result.status;
      if (row.size == null && row.kind === 'url' && row.result.total_size > 0) row.size = row.result.total_size;
      this.#invalidateInventories(row, run);
      row.source = event.source ?? null;
      row.evidence = event.evidence;
      row.directoryListings = event.directoryListings ?? row.directoryListings;
      row.archNames = archNames(row.result);
      row.archKey = row.archNames.join(', ');
      this.#read(row, run, event.bytes ?? row.result.bytes_read, row.planned);
      row.samples = null;
      row.eta = null;
      count(this.#statusCounts, row.status, 1);
      for (const arch of row.archNames) {
        if (!this.#archCounts.has(arch) && ![...this.#filters.arch.options].some((option) => option.value === arch)) {
          this.#filters.arch.add(new Option(arch, arch));
        }
        count(this.#archCounts, arch, 1);
      }
      this.#recordTotals(row, run);
      if (row.status === 'canceled') this.#batch.canceled += 1;
      this.#batch.finished += 1;
      this.#pending.delete(row.id);
      run.finished += 1;
      run.pending -= 1;
      if (!run.pending && !run.listing && run.enumerated !== null) run.ended = now;
      this.#endBatch();
      this.#searchDirty = true;
    }
    if (this.#rendered.has(row.id)) this.#dirty.add(row.id);
    this.#requestRefresh();
  }

  #recordTotals(row, run) {
    const totals = this.#batch.totals;
    const source = { status: row.status, size: row.size, read: row.bytes };
    if (row.status === 'complete' && row.size > 0) {
      if (row.kind === 'bundle') {
        // A picked bundle's known size includes all direct files. Reconcile
        // members such as archives that finished before their bundle did.
        totals.scanned -= run.bundleCoverage.get(row.label) ?? 0;
      } else if (row.parentBundlePath) {
        const parent = run.bundles.get(row.parentBundlePath);
        source.sizeAlreadyCounted = parent?.status === 'complete' && parent.size > 0;
        if (!source.sizeAlreadyCounted) {
          const bytes = run.bundleCoverage.get(row.parentBundlePath) ?? 0;
          run.bundleCoverage.set(row.parentBundlePath, bytes + row.size);
        }
      }
    }
    recordBatchResult(totals, source);
  }

  #read(row, run, bytes, planned, now) {
    if (!Number.isFinite(bytes)) return;
    const delta = Math.max(0, bytes - row.bytes);
    row.bytes += delta;
    run.bytes += delta;
    if (planned !== row.planned) {
      row.samples = [];
      row.eta = null;
      row.planned = planned;
    }
    if (planned !== null && now !== undefined) row.samples = recordSample(row.samples, now, row.bytes);
  }

  #endBatch() {
    if (this.#busy) return;
    this.#batch.ended = performance.now();
    clearInterval(this.#clock);
    this.#clock = undefined;
  }

  #tick() {
    const now = performance.now();
    const slow = [];
    for (const row of this.#active) {
      if (!row.timerAnnounced && now - row.started >= 5_000) {
        row.timerAnnounced = true;
        slow.push(redactPath(row.label));
      }
      row.eta = estimateRemaining(row.samples, now, row.bytes, row.planned);
      if (this.#rendered.has(row.id)) this.#dirty.add(row.id);
    }
    if (slow.length) setText(get('timer-notice'), slow.length === 1
      ? `Elapsed time is available for ${slow[0]}.`
      : `Elapsed time is available for ${slow.length} more scans.`);
    this.#render();
  }

  #requestRefresh() {
    if (this.#refresh) return;
    this.#refresh = setTimeout(() => {
      this.#refresh = undefined;
      this.#render();
    }, 100);
  }

  #showPage(index) {
    this.#page = index;
    this.#renderPage();
    if (this.#nav.next.disabled && document.activeElement === this.#nav.next) this.#nav.previous.focus();
    else if (this.#nav.previous.disabled && document.activeElement === this.#nav.previous) this.#nav.next.focus();
  }

  #updateSelection() {
    const { status, arch, sort } = this.#filters;
    if (!status.value && !arch.value && !sort.value) {
      this.#matched = null;
      this.#searchDirty = false;
      return;
    }
    if (!this.#searchDirty || this.#searching) return;
    this.#searchDirty = false;
    this.#searching = true;
    const version = this.#searchVersion;
    const state = { status: status.value, arch: arch.value, sort: sort.value };
    void this.#query(state, version).finally(() => {
      this.#searching = false;
      this.#requestRefresh();
    });
  }

  async #query({ status, arch, sort }, version) {
    const pause = timeSlice();
    let rows = [];
    const runs = this.#runs.slice().reverse();
    for (const run of runs) {
      const total = run.rows.length;
      for (let index = 0; index < total; index += 1) {
        const row = run.rows[index];
        const matchesArch = !arch || (arch === 'none' ? row.result && !row.archNames.length : row.archNames?.includes(arch));
        if ((!status || row.status === status) && matchesArch) rows.push(row);
        if ((index & 127) === 0) {
          const wait = pause();
          if (wait) await wait;
          if (version !== this.#searchVersion) return;
        }
      }
    }
    if (sort) {
      const primary = sort === 'name' ? () => 0 : sort === 'status'
        ? (row) => labels[row.status] ?? row.status
        : (row) => row.archKey ?? '';
      rows = await sortRows(rows, (a, b) =>
        byName.compare(primary(a), primary(b)) || byName.compare(a.label, b.label), pause);
    }
    if (version === this.#searchVersion) {
      this.#matched = rows;
      this.#renderPage();
    }
  }

  #inventory(row) {
    if (!row.result || row.kind !== 'bundle') return row.result?.inventory;
    return row.inventory ??= observedInventory(row);
  }

  #invalidateInventories(row, run) {
    let parent = run.bundles.get(row.parentBundlePath);
    while (parent) {
      parent.inventory = undefined;
      if (this.#rendered.has(parent.id)) this.#dirty.add(parent.id);
      parent = run.bundles.get(parent.parentBundlePath);
    }
  }

  clear() {
    if (this.#busy) return;
    this.#rowCount = 0;
    this.#runs = [];
    this.#runsByChoice.input.replaceChildren();
    this.#diagnostics.reset();
    this.#tools.open = false;
    delete this.#tools.dataset.paged;
    this.#statusCounts.clear();
    this.#archCounts.clear();
    const { status, arch, sort } = this.#filters;
    status.value = sort.value = arch.value = '';
    while (arch.options.length > 2) arch.remove(2);
    this.#searchVersion += 1;
    this.#matched = null;
    this.#page = 0;
    this.#batch = this.#latestFolder = undefined;
    get('results').hidden = true;
    get('clear-results').hidden = true;
    get('timer-notice').textContent = '';
    get('batch-notice').textContent = 'Results cleared.';
    this.#renderPage();
    (get('device-files').open ? get('choose-files') : get('scan-url')).focus();
  }

  #latestRows(start) {
    const rows = [];
    for (let index = this.#runs.length - 1; index >= 0 && rows.length < PAGE_SIZE; index -= 1) {
      const batch = this.#runs[index].rows;
      if (start >= batch.length) {
        start -= batch.length;
      } else {
        rows.push(...batch.slice(start, start + PAGE_SIZE - rows.length));
        start = 0;
      }
    }
    return rows;
  }

  #renderPage(now = performance.now()) {
    const total = this.#matched?.length ?? this.#rowCount;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    this.#page = Math.max(0, Math.min(this.#page, pages - 1));
    const start = this.#page * PAGE_SIZE;
    const rows = this.#matched?.slice(start, start + PAGE_SIZE) ?? this.#latestRows(start);
    const visible = new Set(rows.map(({ id }) => id));
    for (const [id, card] of this.#rendered) {
      if (visible.has(id)) continue;
      if (card.el.contains(document.activeElement)) get('results-title').focus({ preventScroll: true });
      card.el.remove();
      this.#rendered.delete(id);
    }
    this.#tools.hidden = !this.#rowCount;
    if (this.#rowCount > PAGE_SIZE && !this.#tools.dataset.paged) {
      this.#tools.dataset.paged = 'true';
      this.#tools.open = true;
    }
    if (this.#discoveries && !this.#rowCount) {
      if (!this.#skeleton) {
        const el = get('result-card').content.firstElementChild.cloneNode(true);
        el.classList.add('folder-skeleton');
        el.querySelector('.scan-status').textContent = '';
        el.setAttribute('aria-hidden', 'true');
        el.querySelector('h3').textContent = 'Finding apps and files…';
        el.querySelector('button').remove();
        this.#skeleton = el;
        this.#list.append(el);
      }
    } else if (this.#skeleton) {
      this.#skeleton.remove();
      this.#skeleton = undefined;
    }
    let expected = this.#list.firstElementChild;
    for (const row of rows) {
      let card = this.#rendered.get(row.id);
      if (!card) {
        card = this.#cards.create(row);
        this.#rendered.set(row.id, card);
        this.#cards.patch(row, card, now);
      } else if (this.#dirty.has(row.id)) this.#cards.patch(row, card, now);
      if (card.el === expected) expected = expected.nextElementSibling;
      else this.#list.insertBefore(card.el, expected);
    }
    this.#dirty.clear();

    const { nav, previous, caption, next } = this.#nav;
    nav.hidden = pages === 1 && Boolean(rows.length || !this.#rowCount);
    previous.disabled = this.#page === 0;
    next.disabled = this.#page >= pages - 1;
    setText(caption, rows.length ? `${number.format(start + 1)}–${number.format(start + rows.length)} of ${number.format(total)}` :
      'No results match these filters.');
  }

  #updateDiagnostics() {
    const run = this.#runs[Number(this.#runsByChoice.input.value)];
    this.#diagnostics.update(run?.finished ?? 0);
  }

  #render() {
    this.#updateSelection();
    this.#updateDiagnostics();
    const now = performance.now();
    this.#renderPage(now);
    const summary = [
      ...Array.from(this.#statusCounts, ([key, value]) => `${number.format(value)} ${labels[key] ?? key}`),
      ...Array.from(this.#archCounts, ([key, value]) => `${key} ${number.format(value)}`),
    ];
    setText(this.#summary, summary.join(' · '));
    const cancelAll = get('cancel-all');
    const scanning = this.#busy;
    if (!scanning && document.activeElement === cancelAll) get('results-title').focus({ preventScroll: true });
    cancelAll.hidden = !scanning;
    get('clear-results').hidden = scanning || !this.#rowCount;
    const batch = this.#batch;
    if (!batch) return;

    const counts = [];
    const folder = this.#latestFolder;
    if (folder?.enumerated != null && folder.appCount) {
      counts.push(`Found ${number.format(folder.appCount)} apps in ${number.format(folder.stats.files_seen)} files`);
    }
    const queued = this.#pending.size - this.#active.size;
    if (batch.total) {
      counts.push(`${number.format(batch.finished)} of ${number.format(batch.total)} finished`);
      if (this.#active.size) counts.push(`${number.format(this.#active.size)} scanning`);
      if (queued) counts.push(`${number.format(queued)} queued`);
    }
    if (batch.canceled) counts.push(`${number.format(batch.canceled)} canceled`);
    const countText = counts.join(' · ');
    const countLabel = get('results-count');
    const changed = countLabel.textContent !== countText;
    setText(countLabel, countText);

    const progress = get('overall-progress');
    if (this.#discoveries || this.#artifactListings.size || !batch.total || (batch.extended && batch.finished < batch.total)) {
      progress.removeAttribute('value');
    } else {
      if (progress.max !== batch.total) progress.max = batch.total;
      if (progress.value !== batch.finished || !progress.hasAttribute('value')) progress.value = batch.finished;
    }
    if (!this.#rowCount && !scanning) get('results').hidden = true;
    if (scanning && now - batch.metricsAt < 1_000) return;
    batch.metricsAt = now;
    const elapsed = (batch.ended ?? now) - batch.started;
    const totals = finishBatchTotals(batch.totals, elapsed);
    if (scanning && totals.rate) totals.rate = steadyRate(totals.rate);
    const parts = [];
    const phrase = totalsPhrase(totals, { withTime: !scanning });
    if (phrase) parts.push(phrase);
    if (totals.notChecked) parts.push(`${number.format(totals.notChecked)} not checked`);
    if (scanning) {
      parts.push(`Elapsed ${formatDuration(elapsed)}`);
      const eta = estimateBatch(queued, Array.from(this.#active, ({ eta }) => eta ?? null));
      if (eta !== null) parts.push(`About ${formatDuration(eta)} left`);
    } else if (!phrase) {
      parts.push(`Finished in ${formatSeconds(elapsed)}`);
    }
    setText(get('batch-metrics'), parts.length ? ` · ${parts.join(' · ')}` : '');
    if (!scanning && batch.total && !batch.announced) {
      batch.announced = true;
      setText(get('batch-notice'), `Finished ${batch.finished} of ${batch.total}. ${parts.join('. ')}.`);
    } else if (scanning && changed && now - batch.announcedAt >= 10_000) {
      batch.announcedAt = now;
      setText(get('batch-notice'), `${countText}.`);
    }
  }
}
