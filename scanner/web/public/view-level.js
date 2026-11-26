// The scanner's detail level: minimal (default), more, or research. The level only changes
// what is shown, never what is scanned. It is kept under one versioned localStorage key.
export const VIEW_KEY = 'doesitarm.scanner.view.v1';
export const LEVELS = ['minimal', 'more', 'research'];

export function parseLevel(raw) {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value) && LEVELS.includes(value.level)) return value.level;
  } catch { /* Missing or malformed values mean Minimal. */ }
  return 'minimal';
}

function readLevel(storage) {
  try { return parseLevel(storage.getItem(VIEW_KEY)); } catch { return 'minimal'; }
}

// Shape instead of numbers: one bar, fixed order native / Intel / unknown / other.
const OUTCOMES = [['native', 'Native', 'var(--native)'], ['intel', 'Intel', 'var(--gold)'], ['unknown', 'Unknown', 'var(--muted)'], ['other', 'Other', 'var(--border, #556)']];
export function drawOutcomes(svg, tones) {
  const total = OUTCOMES.reduce((sum, [key]) => sum + (tones.get(key) ?? 0), 0);
  svg.replaceChildren();
  if (!total) {
    svg.setAttribute('aria-label', '');
    return;
  }
  let at = 0;
  const words = [];
  for (const [key, label, fill] of OUTCOMES) {
    const n = tones.get(key) ?? 0;
    if (!n) continue;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const width = (n / total) * 100;
    rect.setAttribute('x', String(at));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', '10');
    rect.setAttribute('fill', fill);
    svg.append(rect);
    at += width;
    words.push(`${n} ${label.toLowerCase()}`);
  }
  svg.setAttribute('aria-label', `Outcomes: ${words.join(', ')}`);
}

export function bindViewLevel({ storage = globalThis.localStorage, root = document.documentElement } = {}) {
  const more = document.getElementById('more-options');
  const research = document.getElementById('research-view');
  const reset = document.getElementById('reset-view');
  let level = readLevel(storage);
  function apply(next, save = true) {
    level = next;
    root.dataset.level = level;
    more.open = level !== 'minimal';
    research.open = level === 'research';
    if (!save) return;
    try { storage.setItem(VIEW_KEY, JSON.stringify({ level })); } catch { /* Kept in memory for this page. */ }
  }
  apply(level, false);
  more.addEventListener('toggle', () => {
    if (!more.open) apply('minimal');
    else if (level === 'minimal') apply('more');
  });
  research.addEventListener('toggle', () => {
    if (research.open && level !== 'research') apply('research');
    else if (!research.open && level === 'research') apply('more');
  });
  reset.addEventListener('click', () => {
    try { storage.removeItem(VIEW_KEY); } catch { /* Nothing to remove. */ }
    apply('minimal', false);
    more.querySelector('summary').focus();
  });
  return { get level() { return level; } };
}
