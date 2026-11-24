// Count visible elements on the original Does It ARM scanner and on this page, per the UX research
// counting spec (docs/research/macho-wasm-scanner-2026-11-23-team/seats/ux-research/notes.md).
//
//   node scripts/count-elements.mjs                 # counts, JSON + table on stdout
//   node scripts/count-elements.mjs --ledger        # include every counted element
//   node scripts/count-elements.mjs --shots DIR     # also save desktop and phone screenshots
//
// Runs headless Chromium on loopback only. The original page is a scripts-free snapshot in
// test/fixtures/original-app-test; its scan rows are rebuilt from pages/apple-silicon-app-test.vue.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, truncateSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startPreview } from './serve.mjs';
import { fixture } from '../test/helpers.mjs';

const args = process.argv.slice(2);
const shotDir = args.includes('--shots') ? resolve(args[args.indexOf('--shots') + 1]) : null;
const withLedger = args.includes('--ledger');
const widths = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

// Runs in the page. Counts headings/paragraphs/text runs, named controls, progress, images,
// row dividers and loaders that are rendered, not clipped, not transparent, and not inside
// closed <details> or <dialog>.
function countElements(rootSelector) {
  const root = document.querySelector(rootSelector);
  const atomic = new Set(['BUTTON', 'A', 'SUMMARY', 'INPUT', 'SELECT', 'TEXTAREA', 'PROGRESS', 'IMG', 'svg', 'VIDEO', 'CANVAS']);
  const ledger = [];
  const hosts = new Set();
  const text = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 70);
  const transparent = (color) => /rgba\(.*,\s*0\)$|transparent/.test(color);
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const clipped = (el) => {
    const box = el.getBoundingClientRect();
    return box.width <= 1 && box.height <= 1;
  };
  function textHost(node) {
    let host = node.parentElement;
    while (host !== root && getComputedStyle(host).display === 'inline') host = host.parentElement;
    return host;
  }
  function divider(el, style) {
    if (el.tagName === 'TD' || el.tagName === 'TH') return;
    const side = (name) => parseFloat(style[`border${name}Width`]) > 0 && style[`border${name}Style`] !== 'none'
      && !transparent(style[`border${name}Color`]);
    if (side('Left') || side('Right')) return;
    if (side('Top')) ledger.push({ kind: 'divider', where: 'top', selector: el.className || el.tagName });
    if (side('Bottom')) ledger.push({ kind: 'divider', where: 'bottom', selector: el.className || el.tagName });
  }
  function walk(el) {
    if (!shown(el) || clipped(el)) return;
    const style = getComputedStyle(el);
    if (el.classList.contains('shimmer') && el.tagName !== 'BUTTON') {
      ledger.push({ kind: 'loader', selector: '.shimmer', value: '' });
      return;
    }
    if (atomic.has(el.tagName) && !(el.tagName === 'INPUT' && el.type === 'hidden')) {
      ledger.push({ kind: el.tagName.toLowerCase(), value: text(el) });
      return;
    }
    if (el.tagName === 'HR') ledger.push({ kind: 'divider', where: 'hr', selector: 'hr' });
    else divider(el, style);
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() && !transparent(style.color)) {
        const host = textHost(child);
        if (!hosts.has(host)) {
          hosts.add(host);
          ledger.push({ kind: 'text', selector: `${host.tagName.toLowerCase()}${host.id ? `#${host.id}` : ''}`, value: text(host) });
        }
      }
    }
    for (const child of el.children) walk(child);
  }
  for (const child of root.children) walk(child);
  return { total: ledger.length, ledger };
}

// Rebuild the original's result rows from the Vue template: finished rows show their content,
// unfinished rows carry the .shimmer class that hides everything but the loader.
function originalRows({ finished, unfinished }) {
  const tester = document.querySelector('.app-tester');
  const total = finished + unfinished;
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
  const rows = names.slice(0, total).map((name, index) => {
    const done = index < finished;
    return `<li class="relative"><div class="flex flex-col justify-center inset-x-0 hover:bg-darkest border-2 border-white border-opacity-0 rounded-lg space-y-3 -mx-5 pl-5 md:pl-20 pr-6 md:pr-64 py-5 ${done ? '' : 'shimmer'}">
      <div class="absolute hidden left-0 h-12 w-12 rounded-full md:flex items-center justify-center bg-darker">${name[0]}</div>
      ${name}.app ${done ? '- v2.1.0 - App 1.2 GB - Binary 48 MB' : ''}
      <div class="text-sm leading-5 font-bold">${done ? '✅ This app is natively compatible with Apple Silicon!' : 'Scanning...'}</div>
      <details class="w-full pt-6"><summary class="cursor-pointer mb-3">Details</summary><div><ul><li><strong>Architectures</strong> <span>arm64, x86_64</span></li></ul></div></details>
      <div class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4"><a href="#" class="underline">Request a Review</a></div>
    </div></li>`;
  }).join('');
  tester.insertAdjacentHTML('beforeend', `<div class="w-full text-center">Total Files: ${total}</div>
    <div class="app-scans-container relative divide-y divide-gray-700 w-full rounded-lg border border-gray-700 bg-gradient-to-br from-darker to-dark spac-y-3 my-4 px-5">
    <ul class="results-container divide-y divide-gray-700">${rows}</ul></div>`);
}

function sparseInputs(scratch) {
  const plan = [
    ['Alpha.macho', 'fat.macho', 0.62e9], ['Bravo.macho', 'thin.macho', 1.4e9],
    ['Charlie.macho', 'fat.macho', 2.1e9], ['Delta.macho', 'thin.macho', 3.3e9],
    ['Echo.macho', 'fat.macho', 4.8e9], ['Foxtrot.macho', 'thin.macho', 7.5e9],
  ];
  return plan.map(([name, source, size]) => {
    const path = join(scratch, name);
    copyFileSync(fixture(source), path);
    truncateSync(path, Math.round(size));
    return path;
  });
}

const slow = 'Charlie.macho,Delta.macho,Echo.macho,Foxtrot.macho';
function installDelay(slowLabels) {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 3 });
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(new URL(`./ux-delay-worker.js?slow=${slowLabels}`, url), options);
    }
  };
}

const scratch = mkdtempSync(join(homedir(), '.cache', 'doesitarm-ux-'));
const { server, url } = await startPreview({
  fromSource: true,
  extraAssets: new Map([
    ['/ux-delay-worker.js', new URL('./ux-delay-worker.js', import.meta.url)],
    ['/original/index.html', new URL('../test/fixtures/original-app-test/index.html', import.meta.url)],
    ['/original/site.css', new URL('../test/fixtures/original-app-test/site.css', import.meta.url)],
  ]),
});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const results = [];
const shots = [];

async function shot(page, name, fullPage = false) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  const path = join(shotDir, `${name}.png`);
  await page.screenshot({ path, fullPage });
  shots.push(path);
}

try {
  const inputs = sparseInputs(scratch);
  for (const [device, viewport] of Object.entries(widths)) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await context.route((target) => target.origin !== url, (route) => route.abort());
    await context.addInitScript(installDelay, slow);
    const page = await context.newPage();

    const original = async (state, rows) => {
      await page.goto(`${url}/original/index.html`);
      if (rows) await page.evaluate(originalRows, rows);
      const counted = await page.evaluate(countElements, '.app-main');
      results.push({ page: 'original', device, state, ...counted });
      if (state === 'idle') await shot(page, `original-${device}-idle`);
    };
    await original('idle');
    await original('mid-scan', { finished: 2, unfinished: 4 });
    await original('done', { finished: 6, unfinished: 0 });

    await page.goto(url);
    await page.locator('#run-date').filter({ hasText: /casks/ }).waitFor({ state: 'attached' });
    results.push({ page: 'ours', device, state: 'idle', ...(await page.evaluate(countElements, 'main')) });
    await shot(page, `${device}-idle`);

    await page.locator('#files').setInputFiles(inputs);
    await page.waitForFunction(() => document.getElementById('results-count').textContent === '2 of 6 finished · 1 scanning · 3 queued');
    await page.waitForTimeout(1100);
    results.push({ page: 'ours', device, state: 'mid-scan', ...(await page.evaluate(countElements, 'main')) });
    await page.locator('#results').scrollIntoViewIfNeeded();
    await shot(page, `${device}-mid-scan`);

    await page.waitForFunction(() => document.getElementById('results-count').textContent === '6 of 6 finished', null, { timeout: 60_000 });
    results.push({ page: 'ours', device, state: 'done', ...(await page.evaluate(countElements, 'main')) });
    const first = page.locator('.result').filter({ has: page.getByRole('heading', { name: 'Charlie.macho', exact: true }) });
    await first.locator('summary').click();
    await page.locator('#results').scrollIntoViewIfNeeded();
    await shot(page, `${device}-done`);
    await first.getByRole('button', { name: /View full scan details/ }).click();
    await page.locator('#scan-dialog').waitFor();
    await shot(page, `${device}-dialog`);
    await page.keyboard.press('Escape');
    await context.close();
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  rmSync(scratch, { recursive: true, force: true });
}

const range = (n) => [Math.ceil(0.9 * n), Math.floor(1.1 * n)];
const table = [];
for (const device of Object.keys(widths)) {
  for (const state of ['idle', 'mid-scan', 'done']) {
    const o = results.find((r) => r.page === 'original' && r.device === device && r.state === state);
    const ours = results.find((r) => r.page === 'ours' && r.device === device && r.state === state);
    const [low, high] = range(o.total);
    table.push({ device, state, original: o.total, ours: ours.total, low, high, within: ours.total >= low && ours.total <= high });
  }
}
console.log(JSON.stringify({ table, shots, ...(withLedger ? { results } : {}) }, null, 2));
console.log('\n| Width | State | Original | Target ±10% | Ours | Within |\n|---|---|---:|---|---:|---|');
for (const row of table) {
  console.log(`| ${row.device} | ${row.state} | ${row.original} | ${row.low}–${row.high} | ${row.ours} | ${row.within ? 'yes' : 'no'} |`);
}
