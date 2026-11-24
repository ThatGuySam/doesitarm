// Batch and per-row totals: what was checked, how big it was, how fast, and how little was read.
// Units are decimal (SI): 1 GB = 10^9 bytes, 1 MB = 10^6 bytes, 1 kB = 10^3 bytes.
// A no-break space joins each number to its unit so lines never wrap between them.
const NBSP = '\u00a0';

const KB = 1e3;
const MB = 1e6;
const GB = 1e9;
const TB = 1e12;

const units = [[TB, 'TB'], [GB, 'GB'], [MB, 'MB'], [KB, 'kB']];

// Three significant figures below 100, whole numbers above: 1.23 GB, 14.2 GB, 312 GB.
function compact(value) {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const unit = units.find(([size]) => bytes >= size * 0.9995);
  return unit ? `${compact(bytes / unit[0])}${NBSP}${unit[1]}` : `${Math.round(bytes)}${NBSP}B`;
}

// GB/s at or above 1 GB/s, otherwise MB/s (or kB/s for very slow reads).
export function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  if (bytesPerSecond >= GB) return `${compact(bytesPerSecond / GB)}${NBSP}GB/s`;
  if (bytesPerSecond >= MB) return `${compact(bytesPerSecond / MB)}${NBSP}MB/s`;
  return `${compact(Math.max(bytesPerSecond, 1) / KB)}${NBSP}kB/s`;
}

export function formatSeconds(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  if (milliseconds < 100) return `<0.1${NBSP}s`;
  const seconds = milliseconds / 1000;
  if (seconds < 10) return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.floor(seconds * 10) / 10)}${NBSP}s`;
  if (seconds < 60) return `${Math.floor(seconds)}${NBSP}s`;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const rest = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// Two significant figures, with floors for tiny shares: 0.0031%, <0.0001%.
export function formatPercent(part, whole) {
  if (!(whole > 0) || !(part >= 0)) return null;
  const percent = (100 * part) / whole;
  if (percent === 0) return '0%';
  if (percent < 0.0001) return '<0.0001%';
  if (percent >= 100) return '100%';
  return `${new Intl.NumberFormat(undefined, { maximumSignificantDigits: 2 }).format(percent)}%`;
}

/**
 * Sum a batch.
 * @param {Array<{status: string, size?: number|null, read?: number}>} jobs settled jobs.
 *   `status` is the scan status (`complete`, `canceled`, an error status) or `pending`.
 *   `size` is the full artifact size (file size, picked bundle size, URL Content-Length), not bytes read.
 * @param {number} elapsedMs batch wall time from the first accepted job to now or the last terminal event.
 */
export function batchTotals(jobs, elapsedMs) {
  let scanned = 0;
  let read = 0;
  let checked = 0;
  let unsized = 0;
  let notChecked = 0;
  for (const job of jobs) {
    if (job.status === 'pending' || job.status === 'canceled') continue;
    if (job.status !== 'complete') {
      notChecked += 1;
      continue;
    }
    checked += 1;
    read += Math.max(0, job.read ?? 0);
    if (Number.isFinite(job.size) && job.size > 0) scanned += job.size;
    else unsized += 1;
  }
  const seconds = elapsedMs / 1000;
  // A rate over a partial size set would understate the speed, so it needs every size.
  const rate = checked && !unsized && scanned > 0 && seconds > 0 ? scanned / seconds : null;
  return { checked, scanned, read, unsized, notChecked, rate, elapsedMs };
}

// "7.2 GB scanned at 1.2 GB/s, reading only 38 kB (0.0005%)"
export function totalsPhrase({ checked, scanned, read, unsized, rate, elapsedMs }, { withTime = false } = {}) {
  if (!checked) return null;
  const parts = [];
  if (scanned > 0) {
    let phrase = `${formatSize(scanned)} scanned`;
    if (unsized) phrase += ` across ${checked - unsized} of ${checked} with known sizes`;
    if (withTime) phrase += ` in ${formatSeconds(elapsedMs)}`;
    const speed = formatRate(rate);
    if (speed) phrase += ` at ${speed}`;
    parts.push(phrase);
    // The share needs the same job set on both sides of the fraction.
    const share = unsized ? null : formatPercent(read, scanned);
    parts.push(`reading only ${formatSize(read)}${share ? ` (${share})` : ''}`);
  } else {
    parts.push(`${checked} checked${withTime ? ` in ${formatSeconds(elapsedMs)}` : ''}, sizes unknown`);
    parts.push(`reading ${formatSize(read)}`);
  }
  return parts.join(', ');
}

// Per-row: "Scanned 1.2 GB in 0.4 s (3 GB/s), reading only 12 kB (0.001%)"
export function rowPhrase({ size, read, elapsedMs }) {
  const time = formatSeconds(elapsedMs);
  if (!(size > 0)) return `Checked in ${time}, reading ${formatSize(read ?? 0)}`;
  const speed = formatRate(elapsedMs > 0 ? size / (elapsedMs / 1000) : null);
  const share = formatPercent(read ?? 0, size);
  return `Scanned ${formatSize(size)} in ${time}${speed ? ` (${speed})` : ''}, reading only ${formatSize(read ?? 0)}${share ? ` (${share})` : ''}`;
}

// Round a live rate so the text does not flicker every tick: two significant figures.
export function steadyRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return rate;
  const magnitude = 10 ** (Math.floor(Math.log10(rate)) - 1);
  return Math.round(rate / magnitude) * magnitude;
}
