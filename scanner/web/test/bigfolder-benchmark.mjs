import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { dropPaths, monitorChromiumMemory, requireBrowserHeadroom } from './browser-helpers.mjs';

const MiB = 1024 ** 2;
const validRungs = [10_000, 100_000, 300_000, 500_000];
const generator = fileURLToPath(new URL('../../scripts/generate-bigfolder.py', import.meta.url));
const generateFixture = promisify(execFile);
const { values } = parseArgs({ options: {
  files: { type: 'string', default: validRungs.join(',') },
  route: { type: 'string', default: 'drop-entry' },
  output: { type: 'string' },
  trace: { type: 'string' },
  'wasm-dir': { type: 'string' },
  timeout: { type: 'string', default: '600000' },
  'no-symlinks': { type: 'boolean' },
  'allow-mismatches': { type: 'boolean' },
} });
const stopped = new AbortController();
const rungs = values.files.split(',').map(Number);
assert.ok(rungs.every((rung) => validRungs.includes(rung)), `Choose file counts from ${validRungs.join(', ')}.`);
const drop = ['drop', 'drop-entry'].includes(values.route);
const synthetic = values.route === 'file-list';
assert.ok(drop || synthetic || values.route === 'picker', '--route must be drop, drop-entry, picker, or file-list.');
assert.ok(!values.trace || rungs.length === 1, '--trace requires a single file count.');
const timeout = Number(values.timeout);
assert.ok(Number.isSafeInteger(timeout) && timeout > 0, '--timeout must be positive milliseconds.');

async function within(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function trackDom(entryOnly) {
  const state = {
    started: null, input: null, firstSkeleton: null, firstCard: null,
    firstResult: null, last: null, fileListLength: null, tasks: [],
  };
  window.folderBenchmark = state;
  const longTasks = new PerformanceObserver((list) => {
    for (const { startTime, duration } of list.getEntries()) state.tasks.push({ startTime, duration });
  });
  longTasks.observe({ type: 'longtask', buffered: true });
  window.addEventListener('drop', () => {
    state.input ??= performance.now();
    performance.mark('bigfolder-drop-event');
    requestAnimationFrame(() => { state.dropFrame = performance.now(); });
    setTimeout(() => { state.dropTimer = performance.now(); }, 0);
    void globalThis.scheduler?.yield().then(() => { state.dropYield = performance.now(); });
  }, { capture: true });
  for (const method of ['getAsEntry', 'webkitGetAsEntry', 'getAsFile']) {
    const original = DataTransferItem.prototype[method];
    if (!original) continue;
    DataTransferItem.prototype[method] = function () {
      const result = original.call(this);
      state[method] = result ? { name: result.name, directory: result.isDirectory } : null;
      return result;
    };
  }
  if (entryOnly) {
    delete DataTransferItem.prototype.getAsFileSystemHandle;
  } else if (DataTransferItem.prototype.getAsFileSystemHandle) {
    const getHandle = DataTransferItem.prototype.getAsFileSystemHandle;
    DataTransferItem.prototype.getAsFileSystemHandle = function () {
      state.dropHandle = 'pending';
      return getHandle.call(this).then((handle) => {
        state.dropHandle = handle?.name ?? 'unavailable';
        return handle;
      }, (error) => {
        state.dropHandle = error.name;
        throw error;
      });
    };
  }
  window.addEventListener('change', (event) => {
    if (event.target.id === 'folder') {
      state.input ??= performance.now();
      state.fileListLength = event.target.files.length;
      performance.mark('bigfolder-change-event');
    }
  }, { capture: true });

  document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('scan-results');
    const progress = document.getElementById('overall-progress');
    const cancel = document.getElementById('cancel-all');
    const observer = new MutationObserver(() => {
      if (state.input === null) return;
      const now = performance.now();
      if (state.firstSkeleton === null && list.querySelector('.folder-skeleton')) state.firstSkeleton = now;
      if (state.firstCard === null && list.querySelector('.result:not(.folder-skeleton) h3')) state.firstCard = now;
      if (state.firstResult === null && list.querySelector('.result[data-status]:not([data-status="queued"]):not([data-status="scanning"])')) {
        state.firstResult = now;
      }
      if (state.last === null && progress.hasAttribute('value') && progress.value === progress.max && cancel.hidden) {
        state.last = now;
        performance.mark('bigfolder-last-result');
      }
    });
    observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-status'] });
    observer.observe(progress, { attributes: true, attributeFilter: ['value', 'max'] });
    observer.observe(cancel, { attributes: true, attributeFilter: ['hidden'] });
  });
}

function verify(manifest, exported) {
  const pending = new Map(manifest.map((entry) => [entry.display_path, entry]));
  const seen = new Set();
  const mismatches = [];
  let matched = 0;
  const counts = {};
  for (const result of exported) {
    const { display_path: path, status, architectures, error } = result;
    counts[status] = (counts[status] ?? 0) + 1;
    const expected = pending.get(path);
    if (!expected) {
      mismatches.push({ path, issue: seen.has(path) ? 'duplicate' : 'unexpected', status, error });
      continue;
    }
    seen.add(path);
    pending.delete(path);
    const arch = [...(architectures ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const differs = status !== expected.status || arch.some((slice) => slice.header_verified !== true) ||
      JSON.stringify(arch.map((slice) => slice.name)) !== JSON.stringify([...expected.architectures].sort()) ||
      (result.parent_bundle_path ?? null) !== (expected.parent_bundle_path ?? null) ||
      (result.bundle_role ?? null) !== (expected.bundle_role ?? null);
    if (differs) {
      mismatches.push({ path, issue: 'result', expected, actual: {
        status, architectures: arch, error, bundle_role: result.bundle_role, parent_bundle_path: result.parent_bundle_path,
      } });
    } else {
      matched++;
    }
  }
  for (const path of pending.keys()) mismatches.push({ path, issue: 'missing' });
  return { matched, expected: manifest.length, actual: exported.length, counts, mismatches };
}

async function exportedResults(page, session) {
  const button = page.locator('#download-results');
  if (await button.count()) {
    // A CDP filesystem drop can leave native dragging pending even after the renderer's drop event.
    if (drop) await session.send('Input.cancelDragging').catch(() => {});
    await button.evaluate((element) => element.click());
    const link = page.locator('a[download="scanner-results.json"]');
    await link.waitFor({ timeout: Math.min(20_000, timeout) });
    const pending = page.waitForEvent('download', { timeout });
    void pending.catch(() => {});
    await link.evaluate((element) => element.click());
    const download = await pending;
    const data = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.ok(Array.isArray(data.results), 'Results download has no results array.');
    await download.delete();
    return data;
  }
  // Allows a baseline comparison with the pre-pagination UI, which has no export.
  const results = await page.locator('#scan-results .result').evaluateAll((cards) => cards.map((card) => ({
    ...JSON.parse(card.querySelector('pre').textContent),
    display_path: card.querySelector('h3').textContent,
  })));
  return { results };
}

async function buildFileList(expected) {
  const response = await fetch('/benchmark-file-list.json');
  if (!response.ok) throw new Error(`Could not load FileList recipe: ${response.status}`);
  const recipe = await response.json();
  let length = 0;
  const ranges = recipe.map(([path, data]) => {
    const start = length;
    length += typeof data === 'number' ? data : 1;
    return { start, end: length, path, data };
  });
  if (length !== expected || !ranges[0]?.path.startsWith('Applications/')) throw new Error('Invalid FileList recipe.');
  let section = 0;
  const files = new Proxy({ length }, {
    get(list, property) {
      if (property === 'length') return list.length;
      if (typeof property !== 'string') return;
      const index = Number(property);
      if (!Number.isSafeInteger(index) || index < 0 || index >= length) return;
      if (index < ranges[section].start) section = 0;
      while (index >= ranges[section].end) section++;
      const { start, path, data } = ranges[section];
      if (typeof data === 'number') {
        const name = `${path}/cache-${String(index - start).padStart(6, '0')}.dat`;
        return { name, size: 0 };
      }
      return new File(data ? [Uint8Array.fromBase64(data)] : [], path);
    },
  });
  // Chromium rebuilds DataTransfer's FileList on each items.add() call.
  // Use metadata for empty filler and real Files for inputs the scanner reads.
  Object.defineProperty(document.getElementById('folder'), 'files', { value: files });
}

async function submitNativePicker(session, input) {
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#folder' });
  assert.ok(nodeId, 'The webkitdirectory input was not found.');
  await within(session.send('DOM.setFileInputFiles', { nodeId, files: [input] }), timeout,
    'CDP DOM.setFileInputFiles did not return.');
}

async function readTrace(session, path) {
  const completed = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.end');
  const { stream } = await completed;
  assert.ok(stream, 'Chromium returned no performance trace stream.');
  const output = await open(path, 'w');
  try {
    while (true) {
      const { data, base64Encoded, eof } = await session.send('IO.read', { handle: stream, size: 256 * 1024 });
      if (data) await output.writeFile(Buffer.from(data, base64Encoded ? 'base64' : 'utf8'));
      if (eof) break;
    }
  } finally {
    await output.close();
    await session.send('IO.close', { handle: stream });
  }
}

async function runRung(browser, browserSession, url, cache, files, report, extraAssets) {
  const scratch = await mkdtemp(join(cache, 'run-'));
  let context;
  let page;
  let timer;
  let sample;
  let uiSampleError;
  let monitor;
  const errors = [];
  const memory = { peakRss: 0, peakPss: 0, heap: 0, domNodes: 0, minAvailable: null };
  try {
    memory.minAvailable = await requireBrowserHeadroom();
    monitor = await monitorChromiumMemory(browser, ({ rss, pss, available }) => {
      memory.peakRss = Math.max(memory.peakRss, rss);
      memory.peakPss = Math.max(memory.peakPss, pss);
      memory.minAvailable = Math.min(memory.minAvailable, available);
    });
    console.error(`Generating ${files.toLocaleString('en-US')} files in ${scratch}`);
    const generatorArgs = [generator, scratch, String(files)];
    if (synthetic) generatorArgs.push('--file-list');
    if (values['no-symlinks']) generatorArgs.push('--no-symlinks');
    await generateFixture('python3', generatorArgs, { signal: stopped.signal });
    if (synthetic) extraAssets.set('/benchmark-file-list.json', pathToFileURL(join(scratch, 'file-list.json')));
    if (monitor.failure) throw monitor.failure;
    const manifest = JSON.parse(await readFile(join(scratch, 'manifest.json'), 'utf8'));
    context = await browser.newContext({ viewport: { width: 1180, height: 880 } });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(trackDom, values.route === 'drop-entry');
    const session = await context.newCDPSession(page);
    await page.goto(url);
    await page.locator('#cask-results tr').first().waitFor();
    await page.bringToFront();

    async function sampleMemory() {
      const [heap, dom] = await Promise.all([
        session.send('Runtime.getHeapUsage'), session.send('Memory.getDOMCounters'),
      ]);
      memory.heap = Math.max(memory.heap, heap.usedSize);
      memory.domNodes = Math.max(memory.domNodes, dom.nodes);
    }
    await sampleMemory();
    timer = setInterval(() => {
      if (sample || uiSampleError) return;
      sample = sampleMemory().catch((error) => {
        uiSampleError = error;
      }).finally(() => { sample = null; });
    }, 250);

    const input = join(scratch, 'Applications');
    let fixtureFileListMs = null;
    if (synthetic) {
      const setup = performance.now();
      await within(page.evaluate(buildFileList, files), timeout, 'Synthetic FileList setup did not finish.');
      fixtureFileListMs = performance.now() - setup;
    }
    if (values.trace) await browserSession.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: { includedCategories: ['toplevel', 'devtools.timeline', 'v8', 'blink.user_timing'] },
    });
    await page.evaluate(() => {
      window.folderBenchmark.started = performance.now();
      performance.mark('bigfolder-start');
    });
    console.error(`Submitting ${files.toLocaleString('en-US')} files through ${values.route}.`);
    if (drop) {
      await within(dropPaths(page, session, [input]), timeout, 'CDP directory drop did not return.');
    } else if (synthetic) {
      await within(page.locator('#folder').dispatchEvent('change'), timeout, 'Synthetic change did not return.');
    } else {
      await submitNativePicker(session, input);
    }

    await page.waitForFunction(() => window.folderBenchmark.last !== null, null, { timeout });
    const measured = await page.evaluate(async () => {
      // Let the observer deliver the task containing the final DOM update.
      await new Promise((resolve) => setTimeout(resolve, 75));
      const { started, input, firstSkeleton, firstCard, firstResult, last, fileListLength, tasks } = window.folderBenchmark;
      return {
        inputMs: input - started,
        fileListLength,
        firstSkeletonMs: firstSkeleton === null ? null : firstSkeleton - started,
        firstCardMs: firstCard === null ? null : firstCard - started,
        firstResultMs: firstResult === null ? null : firstResult - started,
        lastResultMs: last - started,
        inputToFirstCardMs: firstCard === null ? null : firstCard - input,
        inputToLastResultMs: last - input,
        longTasks: tasks.filter(({ startTime }) => startTime >= started && startTime <= last)
          .map(({ startTime, duration }) => ({
            startMs: Math.round(startTime - started), duration,
            phase: startTime + duration <= input ? 'before_input' : startTime < input ? 'straddles_input' : 'after_input',
          })),
        documentNodes: document.getElementsByTagName('*').length,
        renderedCards: document.querySelectorAll('#scan-results .result').length,
      };
    });
    clearInterval(timer);
    await sample;
    if (uiSampleError) throw uiSampleError;
    await sampleMemory();
    if (values.trace) await readTrace(browserSession, values.trace);

    console.error(`Finished browser scan of ${files.toLocaleString('en-US')} files in ${Math.round(measured.lastResultMs)} ms; verifying results export.`);

    const data = await exportedResults(page, session);
    const comparison = verify(manifest.results, data.results);
    if (data.run && (data.run.files_seen !== manifest.files || data.run.directories_seen !== manifest.directories)) {
      comparison.mismatches.push({
        issue: 'enumeration_count',
        expected: { files: manifest.files, directories: manifest.directories },
        actual: { files: data.run.files_seen, directories: data.run.directories_seen },
      });
    }
    const entry = {
      files, directories: manifest.directories, fixtureLogicalBytes: manifest.logical_bytes,
      route: values.route, fixtureFileListMs, ...measured,
      longestTaskMs: measured.longTasks.reduce((longest, task) => Math.max(longest, task.duration), 0),
      browserRssMiB: Math.round(memory.peakRss / MiB),
      browserPssMiB: Math.round(memory.peakPss / MiB),
      pageHeapMiB: Math.round(memory.heap / MiB),
      peakDomNodes: memory.domNodes,
      minAvailableMiB: Math.round(memory.minAvailable / MiB),
      resultsPerSecond: Math.round(data.results.length / (measured.lastResultMs / 1000)),
      ...comparison,
      run: data.run,
      errors,
    };
    report.rungs.push(entry);
    const { mismatches, run, ...summary } = entry;
    console.log(JSON.stringify({ ...summary, mismatchCount: mismatches.length, examples: mismatches.slice(0, 8) }));
    if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2));
  } catch (error) {
    const failure = monitor?.failure ?? stopped.signal.reason ?? error;
    report.stopped = { files, reason: failure.message, memory };
    if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2));
    if (!monitor?.failure && page && !page.isClosed()) {
      const state = page.evaluate(() => {
        const text = (id) => document.getElementById(id)?.innerText;
        return { loader: text('folder-loader'), results: text('results-count'), notice: text('input-status'),
          diagnostics: document.querySelector('.diagnostic-summary')?.innerText,
          observed: window.folderBenchmark };
      });
      const detail = await within(state, 3_000, 'The renderer did not return a timeout snapshot.').catch(() => null);
      console.error(JSON.stringify({ files, detail, errors }));
    }
    throw failure;
  } finally {
    clearInterval(timer);
    await sample;
    await monitor?.stop();
    await context?.close().catch(() => {});
    extraAssets.delete('/benchmark-file-list.json');
    await rm(scratch, { recursive: true, force: true });
  }
}

const cache = join(homedir(), '.cache', 'bigfolder-fixtures');
await mkdir(cache, { recursive: true });
await requireBrowserHeadroom();
const extraAssets = new Map();
if (values['wasm-dir']) {
  for (const name of ['scan_wasm.js', 'scan_wasm_bg.wasm']) {
    extraAssets.set(`/pkg/${name}`, pathToFileURL(resolve(values['wasm-dir'], name)));
  }
}
const { server, url } = await startPreview({ fromSource: true, extraAssets });
let browser;
const stopBrowser = (signal) => {
  stopped.abort(new Error(`Interrupted by ${signal}`));
  process.exitCode = signal === 'SIGTERM' ? 143 : 130;
  void browser?.close().catch(() => {});
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stopBrowser);
const report = { date: new Date().toISOString(), rungs: [] };
try {
  for (const files of rungs) {
    stopped.signal.throwIfAborted();
    await requireBrowserHeadroom();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', handleSIGINT: false, handleSIGTERM: false,
    });
    try {
      stopped.signal.throwIfAborted();
      report.chromium = browser.version();
      const browserSession = await browser.newBrowserCDPSession();
      await runRung(browser, browserSession, url, cache, files, report, extraAssets);
    } finally {
      await browser.close();
      browser = null;
    }
  }
} finally {
  for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, stopBrowser);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2));
}
if (report.rungs.some(({ errors }) => errors.length)) process.exitCode = 1;
if (!values['allow-mismatches'] && report.rungs.some(({ mismatches }) => mismatches.length)) process.exitCode = 1;
