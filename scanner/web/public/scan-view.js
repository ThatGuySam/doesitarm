import { redactPath, stringifyRedacted } from './path-privacy.js';
import { inventoryDetails } from './inventory-view.js';
import { formatDuration } from './scan-progress.js';
import {
  formatSeconds, formatSize, rowPhrase,
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
  no_executable: 'No executable',
  script: 'Script',
};

const reasons = {
  budget_exhausted: 'read limit reached',
  limit_reached: 'scan limit reached',
  invalid: 'damaged or unrecognised data',
  unsupported: 'unsupported format',
  not_found: 'no app executable found',
  source_error: 'the file could not be read',
  no_executable: 'no app executable found',
  script: 'the main executable is a script',
};

const TIMER_THRESHOLD = 5_000;

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

export class ScanCards {
  #cancel;
  #inventory;
  #dialogTrigger;

  constructor(cancel, inventory) {
    this.#cancel = cancel;
    this.#inventory = inventory;
    get('scan-dialog').addEventListener('close', () => {
      const trigger = this.#dialogTrigger;
      this.#dialogTrigger = undefined;
      if (trigger?.isConnected) trigger.focus();
      else if (!get('results').hidden) get('results-title').focus({ preventScroll: true });
    });
  }

  create(row) {
    const el = get('result-card').content.firstElementChild.cloneNode(true);
    const heading = el.querySelector('h3');
    const label = redactPath(row.label);
    heading.textContent = label;
    heading.id = `scan-${row.id}`;
    const monogram = el.querySelector('.result-monogram');
    monogram.textContent = Array.from(label.split(/[\\/]/).at(-1))[0]?.toLocaleUpperCase() ?? '·';
    // Full artifact size: the file, the picked bundle's files, or a URL's Content-Length once known.
    const sizeLabel = el.querySelector('.result-size');
    const progress = el.querySelector('progress');
    progress.setAttribute('aria-labelledby', `${heading.id} ${heading.id}-reads`);
    const readLabel = el.querySelector('.result-read-label');
    readLabel.id = `${heading.id}-reads`;
    const cancel = el.querySelector('.cancel-button');
    cancel.setAttribute('aria-label', `Cancel ${redactPath(row.label)}`);
    cancel.addEventListener('click', () => this.#cancel(row.id));
    const dialogButton = el.querySelector('.open-dialog');
    dialogButton.setAttribute('aria-label', `View full scan details for ${redactPath(row.label)}`);

    const card = {
      el, heading, progress, cancel, dialogButton, sizeLabel,
      status: el.querySelector('.scan-status'),
      metrics: el.querySelector('.result-metrics'),
      timer: el.querySelector('.result-timer'),
      estimate: el.querySelector('.result-estimate'),
    };
    dialogButton.addEventListener('click', () => this.#openDialog(row, card));
    const details = el.querySelector('.result-details');
    details.addEventListener('toggle', () => {
      if (details.open) this.#showInventory(row, card);
    });
    return card;
  }

  patch(row, card, now) {
    const { result, status } = row;
    card.el.dataset.status = status;
    card.el.dataset.state = result ? 'done' : row.started === null ? 'queued' : 'active';
    setText(card.sizeLabel, row.size == null ? '' : formatSize(row.size));
    setText(card.status, result
      ? status === 'canceled' ? 'Canceled' : ''
      : row.remote ? 'Scanning on Cloudflare' : row.started === null ? 'Queued' : 'Scanning');
    card.progress.hidden = Boolean(result || row.started === null);
    if (result?.status === 'complete') {
      card.progress.max = row.planned ?? 1;
      card.progress.value = card.progress.max;
    } else if (row.planned === null) card.progress.removeAttribute('value');
    else {
      card.progress.max = row.planned;
      card.progress.value = row.bytes;
    }
    setText(card.metrics, row.started === null ? '' : `${formatSize(row.bytes)} read`);
    const elapsed = row.started === null ? 0 : (row.ended ?? now) - row.started;
    card.timer.hidden = elapsed < TIMER_THRESHOLD;
    if (!card.timer.hidden) setText(card.timer, `Elapsed ${formatDuration(elapsed)}`);
    setText(card.estimate, row.eta == null ? '' : `About ${formatDuration(row.eta)} left`);
    if (!result) return;
    if (!card.populated) {
      card.populated = true;
      if (document.activeElement === card.cancel) card.heading.focus({ preventScroll: true });
      card.cancel.hidden = true;
      if (status === 'canceled') return;
      this.#showResult(row, card, elapsed);
    }
    if (status === 'canceled') return;
    this.#showInventory(row, card);
  }

  #showResult(row, card, elapsed) {
    const { result } = row;
    card.el.querySelector('.result-time').textContent = formatSeconds(elapsed);
    const { tone, icon, text } = verdict(result);
    const line = card.el.querySelector('.result-verdict');
    line.dataset.tone = tone;
    line.querySelector('.verdict-icon').textContent = icon;
    line.querySelector('.verdict-text').textContent = redactPath(text);
    const arch = architectures(result);
    const badges = line.querySelector('.result-arch');
    badges.replaceChildren(...result.architectures.map(({ name }) => {
      const badge = document.createElement('code');
      badge.textContent = name;
      return badge;
    }));
    line.hidden = false;

    const details = card.el.querySelector('.result-details');
    const values = {
      ...result,
      architectures: arch,
      signing: signing(result),
      source: row.source,
      bytes_read: `${formatSize(row.bytes)} (${row.bytes.toLocaleString()} B)`,
      status: statuses[result.status] ?? result.status,
    };
    for (const field of details.querySelectorAll('dd')) {
      field.textContent = redactPath(values[field.dataset.field]) || '—';
    }
    details.querySelector('.result-speed').textContent = result.status === 'complete'
      ? rowPhrase({ size: row.size, read: row.bytes, elapsedMs: elapsed })
      : `Stopped after ${formatSeconds(elapsed)}, reading ${formatSize(row.bytes)}. Not counted in the scanned total.`;
    if (result.error) {
      const error = details.querySelector('.result-error');
      error.textContent = redactPath(result.error);
      error.hidden = false;
    }
    details.hidden = false;
  }

  #inventoryField(row) {
    const inventory = this.#inventory(row);
    return inventory ? { inventory } : {};
  }

  #showInventory(row, card) {
    if (!row.result) return;
    const inventory = this.#inventory(row);
    const details = card.el.querySelector('.result-details');
    if (!inventory) return;
    const { binaries, x86_64_only: intel } = inventory;
    const mainIsIntel = verdict(row.result).tone === 'intel';
    if (intel.length && !mainIsIntel) {
      card.inventorySummary ??= document.createElement('span');
      card.inventorySummary.className = 'result-arch';
      setText(card.inventorySummary, `${binaries.length} ${binaries.length === 1 ? 'binary' : 'binaries'}, ${intel.length} Intel-only`);
      if (!card.inventorySummary.isConnected) card.el.querySelector('.result-verdict').append(card.inventorySummary);
    }
    if (!details.open || card.inventory === inventory) return;
    const panel = details.querySelector('.panel');
    const next = inventoryDetails(inventory, row.label);
    next.className = 'binary-inventory';
    if (card.inventoryDetails) {
      next.open = card.inventoryDetails.open;
      card.inventoryDetails.replaceWith(next);
    } else panel.append(next);
    card.inventory = inventory;
    card.inventoryDetails = next;
  }

  #openDialog(row, card) {
    const dialog = get('scan-dialog');
    const { result } = row;
    if (!dialog || !result) return;
    this.#dialogTrigger = card.dialogButton;
    get('scan-dialog-title').textContent = `Scan details for ${redactPath(row.label)}`;
    const elapsed = row.started === null ? 0 : row.ended - row.started;
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
      dd.textContent = redactPath(value);
      wrap.append(dt, dd);
      return wrap;
    }));
    const review = get('dialog-review');
    review.href = `https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${encodeURIComponent(redactPath(result.name || row.label))}`;
    review.setAttribute('aria-label', `Request a review of ${redactPath(row.label)}`);
    get('dialog-json').open = false;
    get('dialog-json').querySelector('pre').textContent = stringifyRedacted({ ...result, ...this.#inventoryField(row) }, 2);
    dialog.showModal();
    get('scan-dialog-title').focus();
  }
}
