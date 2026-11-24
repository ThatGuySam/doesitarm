import { droppedJobs, pickedFolders } from './local-inputs.js';
import { emptyResult, MIB } from './scan-result.js';
import { ScanPool } from './worker-pool.js';

const get = (id) => document.getElementById(id);
const files = get('files');
const folder = get('folder');
const dropZone = get('drop-zone');
const results = get('scan-results');
const pool = new ScanPool(Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)));
const divider = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const bytePercent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
const statuses = {
  complete: 'Complete',
  budget_exhausted: 'Byte limit reached',
  limit_reached: 'Scan limit reached',
  invalid: 'Invalid data',
  unsupported: 'Unsupported',
  not_found: 'Missing data',
  source_error: 'Read failed',
};
let submitted = 0;
let finished = 0;
let announceTimer;

function reportCount() {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    get('results-count').textContent = `${finished} of ${submitted} finished`;
  }, 150);
}

function prettyBytes(bytes) {
  const units = [[1024 ** 3, 'GiB'], [MIB, 'MiB'], [1024, 'KiB']];
  const unit = units.find(([size]) => bytes >= size);
  return unit ? `${divider.format(bytes / unit[0])} ${unit[1]}` : `${bytes} B`;
}

function readFraction(bytes, total) {
  if (!total) return `${prettyBytes(bytes)} read`;
  const percent = (100 * bytes) / total;
  const formatted = percent > 0 && percent < 0.001 ? '<0.001' : bytePercent.format(percent);
  return `${prettyBytes(bytes)} of ${prettyBytes(total)} read (${formatted}%)`;
}

function architectures(scan) {
  return scan.architectures.map(({ name, header_verified }) =>
    header_verified ? name : `${name} (slice unverified)`).join(', ') || '—';
}

function newScan(job) {
  const id = ++submitted;
  reportCount();
  get('empty-results').hidden = true;
  const card = get('result-card').content.firstElementChild.cloneNode(true);
  const heading = card.querySelector('h3');
  heading.textContent = job.label;
  const status = card.querySelector('.scan-status');
  const sourceLabel = card.querySelector('.result-source');
  const progress = card.querySelector('progress');
  progress.setAttribute('aria-label', `Fraction of source bytes read for ${job.label}`);
  const metrics = card.querySelector('.result-metrics');
  const facts = card.querySelector('.result-facts');
  const errorLabel = card.querySelector('.result-error');
  const details = card.querySelector('details');
  status.textContent = 'Queued';
  progress.hidden = true;
  if (job.kind === 'file') metrics.textContent = readFraction(0, job.file.size);
  results.prepend(card);

  function setProgress(bytes, total, elapsed) {
    if (total > 0) progress.value = Math.min(bytes / total, 1);
    else progress.removeAttribute('value');
    metrics.textContent = `${readFraction(bytes, total)} · ${divider.format(elapsed / 1000)} s`;
  }

  function update(event) {
    if (event.type === 'start') {
      status.textContent = 'Scanning';
      progress.hidden = false;
      if (job.kind === 'file') progress.value = 0;
    } else if (event.type === 'progress') {
      setProgress(event.bytes, event.total, event.elapsed);
    } else if (event.type === 'remote') {
      status.textContent = 'Scanning on Cloudflare';
      progress.removeAttribute('value');
      metrics.textContent = '';
    } else if (event.type === 'done') {
      const { result, source, elapsed } = event;
      card.dataset.status = result.status;
      status.textContent = statuses[result.status] ?? result.status;
      sourceLabel.textContent = [source, result.format].filter(Boolean).join(' · ');
      setProgress(result.bytes_read, result.total_size, elapsed);
      progress.hidden = !result.total_size;
      facts.hidden = false;
      const values = { ...result, architectures: architectures(result) };
      for (const field of facts.querySelectorAll('dd')) {
        field.textContent = values[field.dataset.field] ?? '—';
      }
      if (result.error) {
        errorLabel.textContent = result.error;
        errorLabel.hidden = false;
      }
      details.querySelector('pre').textContent = JSON.stringify(result, null, 2);
      details.hidden = false;
      finished += 1;
      reportCount();
    }
  }

  if (job.kind === 'error') {
    update({ type: 'done', result: emptyResult('source_error', job.error), source: 'Browser', elapsed: 0 });
  } else {
    pool.submit(id, job, job.kind === 'url' ? Number(get('budget').value) * MIB : undefined, update);
  }
}

get('choose-files').addEventListener('click', () => files.click());
get('choose-folder').addEventListener('click', () => folder.click());
files.addEventListener('change', () => {
  for (const file of files.files) newScan({ kind: 'file', file, label: file.name });
  files.value = '';
});
folder.addEventListener('change', () => {
  for (const job of pickedFolders(folder.files)) newScan(job);
  folder.value = '';
});

const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
let dragDepth = 0;
dropZone.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  dragDepth += 1;
  dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropZone.classList.remove('dragging');
});
window.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = dropZone.contains(event.target) ? 'copy' : 'none';
});
window.addEventListener('drop', async (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove('dragging');
  if (!dropZone.contains(event.target)) return;
  const notice = get('input-status');
  notice.textContent = '';
  let found = false;
  try {
    for await (const job of droppedJobs(event.dataTransfer)) {
      found = true;
      newScan(job);
    }
    if (!found) notice.textContent = 'No files were found. Try choosing the folder directly.';
  } catch {
    notice.textContent = 'The browser could not open this drop. Try the file or folder picker.';
  }
});

function publicDownload(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '80')) {
    throw new TypeError('Use a public HTTPS download URL without credentials.');
  }
  url.hash = '';
  return url;
}

get('url-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = get('scan-url');
  const error = get('url-error');
  error.textContent = '';
  input.removeAttribute('aria-invalid');
  try {
    const url = publicDownload(input.value);
    const path = url.pathname.split('/').filter(Boolean).at(-1);
    newScan({ kind: 'url', url: url.href, label: path || url.hostname });
  } catch {
    error.textContent = 'Enter a public HTTPS download URL without credentials.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
});

async function loadHomebrew() {
  const status = get('run-status');
  try {
    const response = await fetch('./homebrew-run-1.json');
    if (!response.ok) throw new Error();
    const run = await response.json();
    const body = get('cask-results');
    const rows = document.createDocumentFragment();
    for (const app of run.apps) {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cask-button';
      button.textContent = app.cask;
      button.setAttribute('aria-label', `Rescan ${app.cask}`);
      button.addEventListener('click', () => {
        newScan({ kind: 'url', url: app.url, label: app.cask, forceWorker: true });
        get('results-title').focus();
      });
      name.append(button);
      row.append(name);

      const { scan } = app;
      const values = [
        app.expected_format,
        statuses[scan.status] ?? scan.status,
        architectures(scan),
        scan.bundle_id,
        scan.version,
        scan.min_macos,
        readFraction(scan.bytes_read, scan.total_size),
        `${divider.format(app.elapsed_seconds)} s`,
      ];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = value ?? '—';
        row.append(cell);
      }
      rows.append(row);
    }
    body.append(rows);
    get('run-date').textContent = `${run.apps.length} casks · ${run.started_at.slice(0, 10)}`;
    get('run-description').hidden = false;
    get('cask-region').hidden = false;
    status.hidden = true;
  } catch {
    status.textContent = 'The recorded Homebrew results could not be loaded.';
  }
}

void loadHomebrew();
