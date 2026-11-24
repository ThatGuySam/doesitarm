import { inventoryDetails } from './inventory-view.js';
import { emptyResult } from './scan-result.js';
import { estimateBatch, estimateRemaining, formatDuration, recordSample } from './scan-progress.js';
import {
  batchTotals, formatSeconds, formatSize, rowPhrase, steadyRate, totalsPhrase,
} from './scan-totals.js';

export const get = (id) => document.getElementById(id);
export const statuses = {
  complete: 'Complete',
  budget_exhausted: 'Byte limit reached',
  limit_reached: 'Scan limit reached',
  invalid: 'Invalid data',
  unsupported: 'Unsupported',
  not_found: 'Missing data',
  source_error: 'Read failed',
};

const reasons = {
  budget_exhausted: 'read limit reached',
  limit_reached: 'scan limit reached',
  invalid: 'damaged or unrecognised data',
  unsupported: 'unsupported format',
  not_found: 'no app executable found',
  source_error: 'the file could not be read',
};

const TIMER_THRESHOLD = 5_000;
const METRICS_INTERVAL = 1_000;
const ANNOUNCE_INTERVAL = 10_000;

// Display sizes are decimal (kB, MB, GB). Exact byte counts stay in the JSON.
export const prettyBytes = formatSize;

export function architectures(scan) {
  return scan.architectures.map(({ name, header_verified }) =>
    header_verified ? name : `${name} (slice unverified)`).join(', ');
}

// Plain-language verdict with a non-colour cue.
export function verdict(result) {
  if (result.status !== 'complete') {
    return { tone: 'unknown', icon: '?', text: `Unknown — ${reasons[result.status] ?? result.status}` };
  }
  const names = new Set(result.architectures.filter((arch) => arch.header_verified).map((arch) => arch.name));
  const arm = names.has('arm64') || names.has('arm64e');
  const intel = names.has('x86_64') || names.has('x86_64h') || names.has('i386');
  if (arm && intel) return { tone: 'native', icon: '✓', text: 'Apple Silicon native (Universal)' };
  if (arm) return { tone: 'native', icon: '✓', text: 'Apple Silicon native' };
  if (intel) return { tone: 'intel', icon: '◆', text: 'Intel only · may run with Rosetta' };
  if (!result.architectures.length) return { tone: 'unknown', icon: '?', text: 'Unknown — no Mach-O slices found' };
  return { tone: 'unknown', icon: '?', text: 'Other architecture · not verified for Apple silicon' };
}

function signing(result) {
  const flags = result.architectures.map((arch) => arch.code_signature_present).filter((flag) => flag !== null && flag !== undefined);
  if (!flags.length) return null;
  if (flags.every(Boolean)) return 'Code signature present';
  if (!flags.some(Boolean)) return 'No code signature';
  return 'Signed in some slices';
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

export class ScanView {
  #pool;
  #nextId = 0;
  #pending = new Map();
  #batch;
  #discovering = false;
  #clock;
  #refresh;
  #metricsAt = 0;
  #announcedAt = 0;
  #dialogRow;

  constructor(pool) {
    this.#pool = pool;
    const dialog = get('scan-dialog');
    dialog?.addEventListener('close', () => {
      const trigger = this.#dialogRow?.dialogButton;
      this.#dialogRow = undefined;
      if (trigger?.isConnected) trigger.focus();
    });
  }

  add(jobs) {
    if (!jobs.length) return;
    const now = performance.now();
    if (!this.#pending.size) {
      this.#batch = {
        started: now, total: 0, finished: 0, canceled: 0, bytes: 0, extended: false, rows: [],
      };
      this.#metricsAt = 0;
      this.#announcedAt = now;
      this.#announce(`Scanning ${jobs.length} ${jobs.length === 1 ? 'item' : 'items'}.`);
    } else if (this.#batch.finished > 0) {
      this.#batch.extended = true;
    }
    const batch = this.#batch;
    batch.total += jobs.length;

    const rows = document.createDocumentFragment();
    const submitted = jobs.map((job) => {
      const id = ++this.#nextId;
      const row = this.#createRow(id, job);
      this.#pending.set(id, row);
      batch.rows.push(row);
      rows.append(row.el);
      return { job, id, row };
    });
    get('scan-results').prepend(rows);
    get('results').hidden = false;
    for (const { job, id, row } of submitted) {
      if (job.kind === 'error') {
        this.#receive(id, row, {
          type: 'done', result: emptyResult('source_error', job.error), source: 'Browser',
        });
      } else {
        this.#pool.submit(id, job, (event) => this.#receive(id, row, event));
      }
    }
    get('overall-progress').hidden = false;
    this.#renderBatch(now, true);
    if (this.#pending.size && !this.#clock) this.#clock = setInterval(() => this.#tick(), 250);
  }

  // Remove finished rows once nothing is pending; the next batch starts from an empty list.
  clear() {
    if (this.#pending.size || this.#discovering) return;
    get('scan-results').replaceChildren();
    this.#batch = undefined;
    get('results').hidden = true;
    get('clear-results').hidden = true;
    this.#announce('Results cleared.');
    get('choose-files').focus();
  }

  setDiscovering(discovering) {
    this.#discovering = discovering;
    this.#renderBatch(performance.now(), true);
  }

  resetEstimates() {
    for (const row of this.#pending.values()) {
      row.samples = [];
      row.eta = null;
      row.estimate.textContent = '';
    }
    this.#renderBatch(performance.now(), true);
  }

  #createRow(id, job) {
    const el = get('result-card').content.firstElementChild.cloneNode(true);
    const heading = el.querySelector('h3');
    heading.textContent = job.label;
    heading.id = `scan-${id}`;
    const monogram = el.querySelector('.result-monogram');
    monogram.textContent = Array.from(job.label.split('/').at(-1))[0]?.toLocaleUpperCase() ?? '·';
    // Full artifact size: the file, the picked bundle's files, or a URL's Content-Length once known.
    const size = job.file?.size ?? job.size;
    const sizeLabel = el.querySelector('.result-size');
    sizeLabel.textContent = size === undefined ? '' : formatSize(size);
    const progress = el.querySelector('progress');
    progress.setAttribute('aria-labelledby', `${heading.id} ${heading.id}-reads`);
    const readLabel = el.querySelector('.result-read-label');
    readLabel.id = `${heading.id}-reads`;
    const cancel = el.querySelector('.cancel-button');
    cancel.setAttribute('aria-label', `Cancel ${job.label}`);
    cancel.addEventListener('click', () => this.#pool.cancel(id));
    const dialogButton = el.querySelector('.open-dialog');
    dialogButton.setAttribute('aria-label', `View full scan details for ${job.label}`);

    const row = {
      el, label: job.label, kind: job.kind, heading, progress, cancel, dialogButton, bytes: 0, planned: null, eta: null,
      size: size ?? null, sizeLabel, outcome: 'pending',
      status: el.querySelector('.scan-status'),
      metrics: el.querySelector('.result-metrics'),
      timer: el.querySelector('.result-timer'),
      estimate: el.querySelector('.result-estimate'),
      samples: [],
    };
    dialogButton.addEventListener('click', () => this.#openDialog(row));
    return row;
  }

  #receive(id, row, event) {
    const now = performance.now();
    if (event.type === 'start') {
      row.started = now;
      row.el.dataset.state = 'active';
      row.status.textContent = 'Scanning';
      row.progress.hidden = false;
    } else if (event.type === 'progress') {
      this.#read(row, event, now);
    } else if (event.type === 'remote') {
      row.status.textContent = 'Scanning on Cloudflare';
      this.#read(row, { bytes: event.bytes, planned: null }, now);
    } else {
      row.ended = now;
      if (event.type === 'done') this.#showResult(row, event);
      else {
        row.el.dataset.status = 'canceled';
        row.el.dataset.state = 'done';
        row.outcome = 'canceled';
        row.status.textContent = 'Canceled';
        row.progress.hidden = true;
        this.#batch.canceled += 1;
      }
      if (this.#showElapsed(row, now)) this.#announceTimers([row.label]);
      row.estimate.textContent = '';
      if (document.activeElement === row.cancel) row.heading.focus({ preventScroll: true });
      row.cancel.hidden = true;
      this.#pending.delete(id);
      this.#batch.finished += 1;
      if (!this.#pending.size) {
        this.#batch.ended = now;
        clearInterval(this.#clock);
        this.#clock = undefined;
      }
    }
    this.#requestRefresh();
  }

  #read(row, { bytes, planned }, now) {
    this.#batch.bytes += Math.max(0, bytes - row.bytes);
    row.bytes = Math.max(row.bytes, bytes);
    if (planned !== row.planned) {
      row.samples = [];
      row.eta = null;
      row.estimate.textContent = '';
      row.planned = planned;
    }
    if (planned === null) row.progress.removeAttribute('value');
    else {
      if (now !== undefined) row.samples = recordSample(row.samples, now, row.bytes);
      row.progress.max = planned;
      row.progress.value = row.bytes;
    }
    setText(row.metrics, `${formatSize(row.bytes)} read`);
  }

  #showResult(row, { result, source, bytes }) {
    row.result = result;
    row.source = source;
    row.outcome = result.status;
    row.el.dataset.status = result.status;
    row.el.dataset.state = 'done';
    row.status.textContent = '';
    this.#read(row, { bytes: bytes ?? result.bytes_read, planned: row.planned });
    row.progress.max = row.planned ?? 1;
    row.progress.value = row.progress.max;
    row.progress.hidden = true;
    // URL jobs learn their size from Content-Length; a dropped bundle's total_size is only plist + executable.
    if (row.size === null && row.kind === 'url' && result.total_size > 0) {
      row.size = result.total_size;
      row.sizeLabel.textContent = formatSize(row.size);
    }
    const elapsed = row.started === undefined ? 0 : row.ended - row.started;
    row.el.querySelector('.result-time').textContent = formatSeconds(elapsed);

    const { tone, icon, text } = verdict(result);
    const line = row.el.querySelector('.result-verdict');
    line.dataset.tone = tone;
    line.querySelector('.verdict-icon').textContent = icon;
    line.querySelector('.verdict-text').textContent = text;
    const arch = architectures(result);
    const badges = line.querySelector('.result-arch');
    badges.replaceChildren(...result.architectures.map(({ name }) => {
      const badge = document.createElement('code');
      badge.textContent = name;
      return badge;
    }));
    line.hidden = false;

    const details = row.el.querySelector('.result-details');
    const values = {
      ...result,
      architectures: arch,
      signing: signing(result),
      source,
      bytes_read: `${formatSize(row.bytes)} (${row.bytes.toLocaleString()} B)`,
      status: statuses[result.status] ?? result.status,
    };
    for (const field of details.querySelectorAll('dd')) {
      field.textContent = values[field.dataset.field] || '—';
    }
    details.querySelector('.result-speed').textContent = result.status === 'complete'
      ? rowPhrase({ size: row.size, read: row.bytes, elapsedMs: elapsed })
      : `Stopped after ${formatSeconds(elapsed)}, reading ${formatSize(row.bytes)}. Not counted in the scanned total.`;
    if (result.error) {
      const error = details.querySelector('.result-error');
      error.textContent = result.error;
      error.hidden = false;
    }
    if (result.inventory) {
      const { binaries, x86_64_only: intel } = result.inventory;
      if (intel.length && !binaries.some(({ path, role }) => role === 'main' && intel.includes(path))) {
        const summary = document.createElement('span');
        summary.className = 'result-arch';
        summary.textContent = `${binaries.length} ${binaries.length === 1 ? 'binary' : 'binaries'}, ${intel.length} Intel-only`;
        row.el.querySelector('.result-verdict').append(summary);
      }
      details.addEventListener('toggle', () => {
        if (details.open && !details.querySelector('.binary-inventory')) {
          const inventory = inventoryDetails(result.inventory, row.label);
          inventory.className = 'binary-inventory';
          details.querySelector('.panel').append(inventory);
        }
      });
    }
    details.hidden = false;
  }

  #openDialog(row) {
    const dialog = get('scan-dialog');
    const { result } = row;
    if (!dialog || !result) return;
    this.#dialogRow = row;
    get('scan-dialog-title').textContent = `Scan details for ${row.label}`;
    const elapsed = row.started === undefined ? 0 : row.ended - row.started;
    const facts = [
      ['Verdict', verdict(result).text],
      ['Status', statuses[result.status] ?? result.status],
      ['Source', [row.source, result.format].filter(Boolean).join(' · ')],
      ['Full size', row.size > 0 ? `${formatSize(row.size)} (${row.size.toLocaleString()} B)` : 'Unknown'],
      ['Wall time', formatSeconds(elapsed)],
      ['Speed', result.status === 'complete' ? rowPhrase({ size: row.size, read: row.bytes, elapsedMs: elapsed }) : 'Not counted'],
      ['Bytes read', `${row.bytes.toLocaleString()} B in ${result.reads ?? 0} reads`],
      ['Bytes requested', `${(result.bytes_requested ?? 0).toLocaleString()} B`],
      ['Bytes decoded', `${(result.decoded_bytes ?? 0).toLocaleString()} B`],
      ['Executable', [result.executable_name, result.executable_size ? formatSize(result.executable_size) : null].filter(Boolean).join(' · ') || '—'],
      ['Architectures', architectures(result) || '—'],
      ['Min macOS', result.min_macos || '—'],
    ];
    if (result.error) facts.push(['Error', result.error]);
    const list = get('dialog-facts');
    list.replaceChildren(...facts.map(([term, value]) => {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      wrap.append(dt, dd);
      return wrap;
    }));
    const review = get('dialog-review');
    review.href = `https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${encodeURIComponent(result.name || row.label)}`;
    review.setAttribute('aria-label', `Request a review of ${row.label}`);
    get('dialog-json').open = false;
    get('dialog-json').querySelector('pre').textContent = JSON.stringify(result, null, 2);
    dialog.showModal();
    get('scan-dialog-title').focus();
  }

  #showElapsed(row, now) {
    if (row.started === undefined || now - row.started < TIMER_THRESHOLD) return false;
    const first = row.timer.hidden;
    row.timer.hidden = false;
    setText(row.timer, `Elapsed ${formatDuration(now - row.started)}`);
    return first;
  }

  #tick() {
    const now = performance.now();
    const slow = [];
    for (const row of this.#pending.values()) {
      if (this.#showElapsed(row, now)) slow.push(row.label);
      row.eta = estimateRemaining(row.samples, now, row.bytes, row.planned);
      setText(row.estimate, row.eta === null ? '' : `About ${formatDuration(row.eta)} left`);
    }
    if (slow.length) this.#announceTimers(slow);
    this.#renderBatch(now);
  }

  #announceTimers(labels) {
    get('timer-notice').textContent = labels.length === 1
      ? `Elapsed time is available for ${labels[0]}.`
      : `Elapsed time is available for ${labels.length} more scans.`;
  }

  #announce(text) {
    get('batch-notice').textContent = text;
  }

  #requestRefresh() {
    if (this.#refresh) return;
    this.#refresh = setTimeout(() => {
      this.#refresh = undefined;
      this.#renderBatch(performance.now(), true);
    }, 150);
  }

  #renderBatch(now, force = false) {
    const cancelAll = get('cancel-all');
    if (this.#pending.size || this.#discovering) cancelAll.hidden = false;
    else {
      if (document.activeElement === cancelAll) get('results-title').focus({ preventScroll: true });
      cancelAll.hidden = true;
    }
    get('clear-results').hidden = !this.#batch || !cancelAll.hidden;
    if (!this.#batch) return;

    const { total, finished, canceled, started, ended, extended, rows } = this.#batch;
    const active = [...this.#pending.values()].filter((row) => row.started !== undefined);
    const queued = this.#pending.size - active.length;
    const counts = [`${finished} of ${total} finished`];
    if (active.length) counts.push(`${active.length} scanning`);
    if (queued) counts.push(`${queued} queued`);
    if (canceled) counts.push(`${canceled} canceled`);
    const countText = counts.join(' · ');
    const countChanged = get('results-count').textContent !== countText;
    setText(get('results-count'), countText);

    const progress = get('overall-progress');
    if (extended && finished < total) progress.removeAttribute('value');
    else {
      if (progress.max !== total) progress.max = total;
      if (progress.value !== finished || !progress.hasAttribute('value')) progress.value = finished;
    }

    // The totals sentence changes at most once a second while running, so it reads steadily.
    const done = ended !== undefined;
    if (!done && !force && !countChanged && now - this.#metricsAt < METRICS_INTERVAL) return;
    this.#metricsAt = now;
    const elapsed = (ended ?? now) - started;
    const totals = batchTotals(rows.map((row) => ({ status: row.outcome, size: row.size, read: row.bytes })), elapsed);
    if (!done && totals.rate) totals.rate = steadyRate(totals.rate);
    const parts = [];
    const phrase = totalsPhrase(totals, { withTime: done });
    if (phrase) parts.push(phrase);
    if (totals.notChecked) parts.push(`${totals.notChecked} not checked`);
    if (!done) {
      parts.push(`Elapsed ${formatDuration(elapsed)}`);
      const eta = estimateBatch(queued, active.map((row) => row.eta));
      if (eta !== null) parts.push(`About ${formatDuration(eta)} left`);
    } else if (!phrase) {
      parts.push(`Finished in ${formatSeconds(elapsed)}`);
    }
    setText(get('batch-metrics'), parts.length ? ` · ${parts.join(' · ')}` : '');

    if (done && this.#batch.announcedEnd !== total) {
      this.#batch.announcedEnd = total;
      this.#announce(`Finished ${finished} of ${total}. ${parts.join('. ')}.`);
    } else if (!done && countChanged && now - this.#announcedAt >= ANNOUNCE_INTERVAL) {
      this.#announcedAt = now;
      this.#announce(`${countText}.`);
    }
  }
}
