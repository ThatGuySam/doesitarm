// Spacing check: padding, edge contact, overflow, sibling gutters, label/control collisions and over-padding,
// across every UI state, view level and width. Usage:
//   node test/padding-check.mjs [--target standalone|layout] [--url URL] [--out file.json] [--shots dir]
//        [--widths desktop,tablet,phone] [--levels minimal,more,research] [--states a,b] [--allow-fail]
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { emulateMac, requireBrowserHeadroom } from './browser-helpers.mjs';
import { fixture } from './helpers.mjs';
import { LIMITS, measureSpacing } from './padding-measure.mjs';

const WIDTHS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  phone: { width: 390, height: 844 },
};
const LEVELS = ['minimal', 'more', 'research'];
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : process.argv[at + 1];
};

async function fixturePicker(count) {
  const root = await navigator.storage.getDirectory();
  const applications = await root.getDirectoryHandle('Applications', { create: true });
  const bytes = new Uint8Array(await (await fetch('/__thin.macho')).arrayBuffer());
  async function write(folder, path, data) {
    const parts = path.split('/');
    for (const directory of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(directory, { create: true });
    const file = await folder.getFileHandle(parts.at(-1), { create: true });
    const stream = await file.createWritable();
    await stream.write(data);
    await stream.close();
  }
  const plist = (id) => `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Run</string><key>CFBundleIdentifier</key><string>org.padding.${id}</string></dict></plist>`;
  for (let index = 0; index < count; index++) {
    await write(applications, `App ${index}.app/Contents/Info.plist`, plist(index));
    await write(applications, `App ${index}.app/Contents/MacOS/Run`, bytes);
  }
  window.showDirectoryPicker = () => Promise.resolve(applications);
}

function inputs(scratch) {
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

const open = (page, selector) => page.locator(selector).evaluate((node) => { node.open = true; });
const doneRows = (page, count) => page.waitForFunction((n) => document.querySelectorAll('.result[data-state="done"]').length >= n, count, { timeout: 60_000 });

// Each state returns after the page shows it. `levels` limits where it applies.
const STATES = {
  empty: { run: async () => {} },
  'empty-expanded': {
    levels: ['more', 'research'],
    run: async (page) => { for (const id of ['more-options', 'advanced', 'how']) await open(page, `#${id}`); },
  },
  url: {
    entry: 'url',
    run: async (page) => {
      await open(page, '#more-options');
      await page.locator('#scan-url').fill('not a link');
      await page.getByRole('button', { name: 'Scan URL' }).click();
    },
  },
  scanning: {
    run: async (page, ctx) => {
      await page.locator('#files').setInputFiles(ctx.inputs);
      await page.waitForFunction(() => /scanning/.test(document.getElementById('results-count').textContent));
      await page.waitForTimeout(800);
    },
  },
  results: {
    run: async (page, ctx) => {
      await page.locator('#files').setInputFiles(ctx.inputs);
      await doneRows(page, 6);
    },
  },
  'results-details': {
    run: async (page, ctx) => {
      await page.locator('#files').setInputFiles(ctx.inputs.slice(0, 2));
      await doneRows(page, 2);
      await page.locator('.result-details > summary').first().click();
    },
  },
  dialog: {
    levels: ['research'],
    run: async (page, ctx) => {
      await page.locator('#files').setInputFiles(ctx.inputs.slice(0, 1));
      await doneRows(page, 1);
      await page.locator('.result-details > summary').first().click();
      await page.getByRole('button', { name: /View full scan details/ }).first().click();
      await page.locator('#scan-dialog[open]').waitFor();
      await open(page, '#dialog-json');
    },
  },
  error: {
    run: async (page, ctx) => {
      await page.locator('#files').setInputFiles([ctx.bogus, ...ctx.inputs.slice(0, 1)]);
      await doneRows(page, 2);
      await page.locator('.result-details > summary').first().click();
    },
  },
  windows: {
    run: async (page) => {
      await page.locator('#files').setInputFiles(['arm64.exe', 'anycpu.exe', 'arm64.msi', 'burn.exe'].map((name) => fixture(`windows/${name}`)));
      await doneRows(page, 4);
      await page.locator('.result-details > summary').first().click();
    },
  },
  bigfolder: {
    run: async (page) => {
      await page.evaluate(fixturePicker, 60);
      await page.getByRole('button', { name: 'Choose folder' }).click();
      await page.getByText(/Found 60 apps/).first().waitFor({ timeout: 90_000 });
      if (await page.locator('#results-tools-disclosure').count()) await open(page, '#results-tools-disclosure');
    },
  },
  saved: {
    run: async (page) => {
      await page.evaluate(() => new Promise((done, fail) => {
        const request = indexedDB.open('scanner-folder-runs', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('runs', { keyPath: 'id' });
          request.result.createObjectStore('rows', { keyPath: ['runId', 'id'] });
        };
        request.onerror = () => fail(request.error);
        request.onsuccess = () => {
          const tx = request.result.transaction(['runs', 'rows'], 'readwrite');
          tx.objectStore('runs').put({ id: 'run-1', state: 'complete', header: { folder_name: 'Applications', started_at: '2026-11-20T10:00:00Z' } });
          tx.objectStore('rows').put({ runId: 'run-1', id: 1, data: '{}' });
          tx.oncomplete = () => { request.result.close(); done(); };
        };
      }));
      await page.reload();
      await page.locator('#saved-folders').waitFor({ state: 'visible' });
      await open(page, '#saved-folders');
    },
  },
  crash: { run: async (page) => { await page.evaluate(() => { document.getElementById('crash-notice').hidden = false; }); } },
  homebrew: {
    levels: ['research'],
    run: async (page) => {
      await page.locator('#run-date').filter({ hasText: /casks/ }).waitFor({ state: 'attached' });
      await open(page, '#homebrew');
      await page.locator('#cask-region').waitFor({ state: 'visible' });
    },
  },
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export async function overPadding(allStats) {
  // Group similar containers; flag any side above 2x the group median (floor 24 px so small values never trip).
  const groups = new Map();
  for (const stat of allStats) {
    if (!groups.has(stat.group)) groups.set(stat.group, []);
    groups.get(stat.group).push(stat);
  }
  const kinds = new Map();
  for (const stat of allStats) {
    if (!kinds.has(stat.kind)) kinds.set(stat.kind, []);
    kinds.get(stat.kind).push(stat);
  }
  const found = [];
  for (const stat of allStats) {
    const own = groups.get(stat.group);
    if (own.length < 3 && !['panel', 'dialog'].includes(stat.kind)) continue;
    const peers = own.length >= 3 ? own : kinds.get(stat.kind);
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const typical = median(peers.map((peer) => peer[side]).filter((value) => value > 0));
      const allowed = Math.max(2 * (typical || 0), 24);
      if (stat[side] > allowed + 0.5) found.push({ rule: 'over-padding', selector: stat.selector, side, gap: stat[side], median: typical, allowed, state: stat.state, width: stat.width, level: stat.level });
    }
  }
  return found;
}

export async function runCheck({ target = 'standalone', url: liveUrl, widths = Object.keys(WIDTHS), levels = LEVELS, states = Object.keys(STATES), shots, layoutRoute } = {}) {
  await requireBrowserHeadroom();
  const scratch = mkdtempSync(join(homedir(), '.cache', 'doesitarm-padding-'));
  const files = { inputs: inputs(scratch), bogus: join(scratch, 'notes.txt') };
  writeFileSync(files.bogus, 'not an executable');
  const delay = (await import('node:fs')).readFileSync(new URL('../scripts/ux-delay-worker.js', import.meta.url), 'utf8');
  const thin = (await import('node:fs')).readFileSync(fixture('thin.macho'));
  let preview;
  let base = liveUrl;
  if (!base) {
    preview = await startPreview({ fromSource: true });
    base = target === 'layout' ? `${preview.url}${layoutRoute ?? '/layout/'}` : preview.url;
  }
  const rootSelector = target === 'layout' || liveUrl?.includes('v=3') ? '.dia-scanner' : '.dia-scanner, body';
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
  const violations = [];
  const stats = [];
  const visited = [];
  try {
    for (const widthName of widths) {
      for (const level of levels) {
        for (const stateName of states) {
          const state = STATES[stateName];
          if (state.levels && !state.levels.includes(level)) continue;
          const phone = widthName === 'phone';
          const context = await browser.newContext({
            viewport: WIDTHS[widthName], reducedMotion: 'reduce',
            userAgent: phone ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' : undefined,
          });
          if (!phone) await emulateMac(context);
          await context.addInitScript(({ level: value, entry, slow }) => {
            if (value !== 'minimal') localStorage.setItem('doesitarm.scanner.view.v1', JSON.stringify({ level: value }));
            localStorage.setItem('scanner-entry', entry);
            if (slow) {
              Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 3 });
              const NativeWorker = window.Worker;
              window.Worker = class extends NativeWorker {
                constructor(workerUrl, options) {
                  super(new URL(`./ux-delay-worker.js?slow=Charlie.macho,Delta.macho,Echo.macho,Foxtrot.macho`, workerUrl), options);
                }
              };
            }
          }, { level, entry: state.entry ?? 'files', slow: stateName === 'scanning' });
          await context.route('**/ux-delay-worker.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: delay }));
          await context.route('**/__thin.macho', (route) => route.fulfill({ contentType: 'application/octet-stream', body: thin }));
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          page.on('crash', () => console.error('PAGE CRASH', stateName));
          page.on('pageerror', (e) => process.env.PC_TRACE && console.error('pageerror', e.message.slice(0, 160)));
          try {
            if (process.env.PC_TRACE) console.error(widthName, level, stateName);
            await page.goto(base);
            await page.locator('#files').waitFor({ state: 'attached' });
            await page.waitForTimeout(200);
            await state.run(page, files);
            await page.waitForTimeout(150);
            const measured = await page.evaluate(measureSpacing, { rootSelector, limits: LIMITS });
            const tag = { state: stateName, width: widthName, level };
            for (const item of measured.violations) violations.push({ ...tag, ...item });
            for (const item of measured.stats) stats.push({ ...tag, ...item });
            visited.push(`${widthName}/${level}/${stateName}`);
            if (shots) {
              mkdirSync(shots, { recursive: true });
              await page.screenshot({ path: join(shots, `${widthName}-${level}-${stateName}.png`), fullPage: true });
            }
          } catch (error) {
            violations.push({ state: stateName, width: widthName, level, rule: 'driver-error', selector: '', text: String(error.message).split('\n')[0] });
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    if (preview) {
      preview.server.closeAllConnections();
      await new Promise((done) => preview.server.close(done));
    }
    rmSync(scratch, { recursive: true, force: true });
  }
  violations.push(...await overPadding(stats));
  const unique = new Map();
  for (const item of violations) unique.set(JSON.stringify([item.rule, item.selector, item.side, item.state, item.width, item.level]), item);
  const list = [...unique.values()];
  const counts = {};
  for (const item of list) counts[item.rule] = (counts[item.rule] ?? 0) + 1;
  return { target, url: base, visited: visited.length, total: list.length, counts, violations: list };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runCheck({
    target: arg('target', 'standalone'),
    url: arg('url'),
    widths: arg('widths', Object.keys(WIDTHS).join(',')).split(','),
    levels: arg('levels', LEVELS.join(',')).split(','),
    states: arg('states', Object.keys(STATES).join(',')).split(','),
    shots: arg('shots') && resolve(arg('shots')),
  });
  if (arg('out')) {
    mkdirSync(resolve(arg('out'), '..'), { recursive: true });
    writeFileSync(resolve(arg('out')), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`${result.visited} state views, ${result.total} violations`, result.counts);
  for (const item of result.violations.slice(0, 25)) console.log(`${item.width}/${item.level}/${item.state} ${item.rule} ${item.selector} ${item.side ?? ''} ${item.gap ?? ''}`);
  process.exit(result.total && !process.argv.includes('--allow-fail') ? 1 : 0);
}
