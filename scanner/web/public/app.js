import { droppedJobs, pickedFolders } from './local-inputs.js';
import { scanMode } from './scan-mode.js';
import { ScanPool } from './worker-pool.js';
import { architectures, get, prettyBytes, ScanView, statuses } from './scan-view.js';

const files = get('files');
const folder = get('folder');
const dropZone = get('drop-zone');
const gentleToggle = get('gentle');
const notice = get('input-status');
const discoveries = new Set();
const divider = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const coveragePercent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

try {
  gentleToggle.checked = localStorage.getItem('scan-mode') === 'gentle';
} catch {
  // A blocked storage policy does not prevent scanning.
}

let onLowBattery = false;
function currentMode() {
  return scanMode({
    cores: navigator.hardwareConcurrency,
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    gentle: gentleToggle.checked,
    conserve: navigator.connection?.saveData || onLowBattery,
  });
}

let mode = currentMode();
const pool = new ScanPool(mode);
const view = new ScanView(pool);

function updateMode() {
  const next = currentMode();
  if (mode.passive !== next.passive || mode.limit !== next.limit) {
    mode = next;
    pool.setMode(mode);
    view.resetEstimates();
  }
  const status = get('mode-status');
  const text = `${mode.passive ? 'Passive' : 'Foreground'} · up to ${mode.limit} ${mode.limit === 1 ? 'worker' : 'workers'}`;
  if (status.textContent !== text) status.textContent = text;
}

gentleToggle.addEventListener('change', () => {
  try {
    localStorage.setItem('scan-mode', gentleToggle.checked ? 'gentle' : 'automatic');
  } catch {
    // The setting still works for this page.
  }
  updateMode();
});
document.addEventListener('visibilitychange', updateMode);
window.addEventListener('focus', updateMode);
window.addEventListener('blur', updateMode);
navigator.connection?.addEventListener('change', updateMode);
navigator.getBattery?.().then((battery) => {
  function updateBattery() {
    onLowBattery = !battery.charging && battery.level <= 0.2;
    updateMode();
  }
  battery.addEventListener('chargingchange', updateBattery);
  battery.addEventListener('levelchange', updateBattery);
  updateBattery();
}).catch(() => {});
updateMode();

get('cancel-all').addEventListener('click', () => {
  discoveries.clear();
  pool.cancelAll();
  notice.textContent = '';
  view.setDiscovering(false);
});

get('choose-files').addEventListener('click', () => files.click());
get('choose-folder').addEventListener('click', () => folder.click());
files.addEventListener('change', () => {
  view.add(Array.from(files.files, (file) => ({ kind: 'file', file, label: file.name })));
  files.value = '';
});
folder.addEventListener('change', () => {
  view.add([...pickedFolders(folder.files)]);
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
// Any file drag over the page points at the drop zone, so the target is obvious before the pointer reaches it.
window.addEventListener('dragenter', (event) => {
  if (hasFiles(event)) document.body.classList.add('drag-active');
});
window.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.body.classList.remove('drag-active');
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
  document.body.classList.remove('drag-active');
  if (!dropZone.contains(event.target)) return;
  const discovery = {};
  discoveries.add(discovery);
  view.setDiscovering(true);
  notice.textContent = 'Finding apps and files…';
  const jobs = [];
  try {
    for await (const job of droppedJobs(event.dataTransfer)) {
      if (!discoveries.has(discovery)) return;
      jobs.push(job);
      if (jobs.length % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!discoveries.has(discovery)) return;
    view.add(jobs);
    notice.textContent = jobs.length ? '' : 'No files were found in that drop. Some browsers, including Firefox, do not expose dropped folders. Use Choose folder instead.';
  } catch {
    if (discoveries.has(discovery)) {
      view.add(jobs);
      notice.textContent = 'The browser could not open this drop. Try the file or folder picker.';
    }
  } finally {
    discoveries.delete(discovery);
    view.setDiscovering(discoveries.size > 0);
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
    view.add([{ kind: 'url', url: url.href, label: path || url.hostname }]);
  } catch {
    error.textContent = 'Enter a public HTTPS download URL without credentials.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
});

function recordedCoverage(bytes, size) {
  if (!size) return `${prettyBytes(bytes)} read`;
  const percent = (100 * bytes) / size;
  const label = percent > 0 && percent < 0.001 ? '<0.001' : coveragePercent.format(percent);
  return `${prettyBytes(bytes)} of ${prettyBytes(size)} read (${label}%)`;
}

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
        view.add([{ kind: 'url', url: app.url, label: app.cask, forceWorker: true }]);
        get('results-title').focus();
        get('results-title').scrollIntoView({ block: 'center' });
      });
      name.append(button);
      row.append(name);

      const { scan } = app;
      const values = [
        app.expected_format,
        statuses[scan.status] ?? scan.status,
        architectures(scan) || '—',
        scan.bundle_id,
        scan.version,
        scan.min_macos,
        recordedCoverage(scan.bytes_read, scan.total_size),
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
