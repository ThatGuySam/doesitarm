import { emptyResult, MIB } from './scan-result.js';
import { estimateBatch, estimateRemaining, formatDuration, recordSample } from './scan-progress.js';

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

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const units = [[1024 ** 4, 'TiB'], [1024 ** 3, 'GiB'], [MIB, 'MiB'], [1024, 'KiB']];
const TIMER_THRESHOLD = 5_000;

export function prettyBytes(bytes) {
  const unit = units.find(([size]) => bytes >= size);
  return unit ? `${number.format(bytes / unit[0])} ${unit[1]}` : `${number.format(bytes)} B`;
}

export function architectures(scan) {
  return scan.architectures.map(({ name, header_verified }) =>
    header_verified ? name : `${name} (slice unverified)`).join(', ');
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

  constructor(pool) {
    this.#pool = pool;
  }

  add(jobs) {
    if (!jobs.length) return;
    const now = performance.now();
    if (!this.#pending.size) {
      this.#batch = { started: now, total: 0, finished: 0, canceled: 0, bytes: 0, extended: false };
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
      rows.append(row.el);
      return { job, id, row };
    });
    get('scan-results').prepend(rows);
    for (const { job, id, row } of submitted) {
      if (job.kind === 'error') {
        this.#receive(id, row, {
          type: 'done', result: emptyResult('source_error', job.error), source: 'Browser',
        });
      } else {
        this.#pool.submit(id, job, (event) => this.#receive(id, row, event));
      }
    }
    get('empty-results').hidden = true;
    get('batch-readout').hidden = false;
    this.#renderBatch(now);
    if (this.#pending.size && !this.#clock) this.#clock = setInterval(() => this.#tick(), 250);
  }

  setDiscovering(discovering) {
    this.#discovering = discovering;
    this.#renderBatch(performance.now());
  }

  resetEstimates() {
    for (const row of this.#pending.values()) {
      row.samples = [];
      row.eta = null;
      row.estimate.textContent = '';
    }
    this.#renderBatch(performance.now());
  }

  #createRow(id, job) {
    const el = get('result-card').content.firstElementChild.cloneNode(true);
    const heading = el.querySelector('h3');
    heading.textContent = job.label;
    heading.id = `scan-${id}`;
    const monogram = el.querySelector('.result-monogram');
    monogram.textContent = Array.from(job.label.split('/').at(-1))[0]?.toLocaleUpperCase() ?? '·';
    const size = job.file?.size ?? job.size;
    el.querySelector('.result-size').textContent = size === undefined ? '' : prettyBytes(size);
    const progress = el.querySelector('progress');
    progress.setAttribute('aria-labelledby', `${heading.id} ${heading.id}-reads`);
    const readLabel = el.querySelector('.result-read-label');
    readLabel.id = `${heading.id}-reads`;
    const cancel = el.querySelector('button');
    cancel.setAttribute('aria-label', `Cancel ${job.label}`);
    cancel.addEventListener('click', () => this.#pool.cancel(id));

    return {
      el, label: job.label, heading, progress, cancel, bytes: 0, planned: null, eta: null,
      status: el.querySelector('.scan-status'),
      metrics: el.querySelector('.result-metrics'),
      timer: el.querySelector('.result-timer'),
      estimate: el.querySelector('.result-estimate'),
      samples: [],
    };
  }

  #receive(id, row, event) {
    const now = performance.now();
    if (event.type === 'start') {
      row.started = now;
      row.status.textContent = 'Scanning';
      row.progress.hidden = false;
      row.metrics.textContent = '0 B read';
    } else if (event.type === 'progress') {
      this.#read(row, event, now);
    } else if (event.type === 'remote') {
      row.status.textContent = 'Scanning on Cloudflare';
      this.#read(row, { bytes: event.bytes, planned: null }, now);
    } else {
      if (event.type === 'done') this.#showResult(row, event);
      else {
        row.el.dataset.status = 'canceled';
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
    setText(row.metrics, `${prettyBytes(row.bytes)} read`);
  }

  #showResult(row, { result, source, bytes }) {
    row.el.dataset.status = result.status;
    row.status.textContent = statuses[result.status] ?? result.status;
    this.#read(row, { bytes: bytes ?? result.bytes_read, planned: row.planned });
    row.progress.max = row.planned ?? 1;
    row.progress.value = row.progress.max;
    row.progress.hidden = result.status !== 'complete';

    const arch = architectures(result);
    row.el.querySelector('.result-arch').textContent = arch;
    row.el.querySelector('.result-source').textContent = [source, result.format].filter(Boolean).join(' · ');
    const details = row.el.querySelector('details');
    const values = { ...result, architectures: arch };
    for (const field of details.querySelectorAll('dd')) {
      field.textContent = values[field.dataset.field] || '—';
    }
    if (result.error) {
      const error = row.el.querySelector('.result-error');
      error.textContent = result.error;
      error.hidden = false;
    }
    details.querySelector('pre').textContent = JSON.stringify(result, null, 2);
    details.hidden = false;
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

  #requestRefresh() {
    if (this.#refresh) return;
    this.#refresh = setTimeout(() => {
      this.#refresh = undefined;
      this.#renderBatch(performance.now());
    }, 150);
  }

  #renderBatch(now) {
    const cancelAll = get('cancel-all');
    if (this.#pending.size || this.#discovering) cancelAll.hidden = false;
    else {
      if (document.activeElement === cancelAll) get('results-title').focus({ preventScroll: true });
      cancelAll.hidden = true;
    }
    if (!this.#batch) return;

    const { total, finished, canceled, bytes, started, ended, extended } = this.#batch;
    const active = [...this.#pending.values()].filter((row) => row.started !== undefined);
    const queued = this.#pending.size - active.length;
    const counts = [`${finished} of ${total} finished`];
    if (active.length) counts.push(`${active.length} scanning`);
    if (queued) counts.push(`${queued} queued`);
    if (canceled) counts.push(`${canceled} canceled`);
    setText(get('results-count'), counts.join(' · '));

    const progress = get('overall-progress');
    if (extended && finished < total) progress.removeAttribute('value');
    else {
      if (progress.max !== total) progress.max = total;
      if (progress.value !== finished || !progress.hasAttribute('value')) progress.value = finished;
    }
    const eta = estimateBatch(queued, active.map((row) => row.eta));
    const metrics = [`${prettyBytes(bytes)} read`, `Elapsed ${formatDuration((ended ?? now) - started)}`];
    if (eta !== null) metrics.push(`About ${formatDuration(eta)} left`);
    setText(get('batch-metrics'), metrics.join(' · '));
  }
}
