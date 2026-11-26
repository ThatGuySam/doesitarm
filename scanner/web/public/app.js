import { redactPath } from './path-privacy.js';
import { inventoryDetails } from './inventory-view.js';
import { bindDownloadInput, configureScannerEntry } from './download-input.js';
import { bindLocalInputs } from './local-inputs.js';
import { bindViewLevel } from './view-level.js';
import { showCrashNotice } from './crash-journal.js';
import { ResultsList } from './results-list.js';
import { scanMode } from './scan-mode.js';
import { ScanPool } from './worker-pool.js';
import { architectures, get, prettyBytes, statuses } from './scan-view.js';

const entry = configureScannerEntry();
bindViewLevel();
const gentleToggle = get('gentle');
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
const view = new ResultsList(pool, () => mode);

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

bindLocalInputs({ view, mode: () => mode });
get('clear-results').addEventListener('click', () => view.clear());

bindDownloadInput({ view, remember: entry.remember });

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
      button.textContent = redactPath(app.cask);
      button.setAttribute('aria-label', `Rescan ${redactPath(app.cask)}`);
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
        cell.textContent = redactPath(value) ?? '—';
        row.append(cell);
      }
      const inventory = document.createElement('td');
      inventory.append(inventoryDetails(scan.inventory, app.cask) ?? '—');
      row.append(inventory);
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
void showCrashNotice();
