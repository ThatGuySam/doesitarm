import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from './serve.mjs';
import { dropPaths, monitorChromiumMemory, processMemory, requireBrowserHeadroom, sparseFat, workerHeap } from '../test/browser-helpers.mjs';
import { fixture } from '../test/helpers.mjs';
import { appsFolder, heldInputs, mixedInputs, streamInput, timerInput } from '../test/ui-fixtures.mjs';

const MiB = 1024 ** 2;
const rounded = (value) => Math.round(value * 10) / 10;
const mib = (bytes) => rounded(bytes / MiB);

function installProbe() {
  const NativeWorker = window.Worker;
  const probe = { starts: [], completions: [], modes: [], stopped: [], longTasks: [], peakActive: 0 };
  const active = new Map();
  let lastSlot = 0;
  window.uiProbe = probe;
  const now = () => performance.timeOrigin + performance.now();

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      probe.longTasks.push({ start: performance.timeOrigin + entry.startTime, duration: entry.duration });
    }
  }).observe({ type: 'longtask', buffered: true });

  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      const slot = ++lastSlot;
      super(new URL(`./ui-smoke-worker.js?slot=${slot}`, url), options);
      this.addEventListener('message', ({ data }) => {
        if (data.type === 'ui-probe') probe.completions.push({ slot, ...data.record });
        if (data.type === 'done') active.delete(slot);
      });
      const post = this.postMessage.bind(this);
      this.postMessage = (data) => {
        if (data.job) {
          const { id, job, passive } = data;
          active.set(slot, id);
          probe.peakActive = Math.max(probe.peakActive, active.size);
          probe.starts.push({ slot, id, label: job.label, passive, at: now() });
        } else if (data.type === 'mode') {
          probe.modes.push({ slot, passive: data.passive });
        }
        return post(data);
      };
      const terminate = this.terminate.bind(this);
      this.terminate = () => {
        probe.stopped.push({ slot, job: active.get(slot) ?? null });
        active.delete(slot);
        return terminate();
      };
    }
  };
}

async function withPage(browser, url, run, { cores, gentle = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 880 }, reducedMotion });
  try {
    await context.route((request) => request.origin !== url, (route) => route.abort());
    await context.addInitScript(installProbe);
    if (gentle) await context.addInitScript(() => localStorage.setItem('scan-mode', 'gentle'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15_000);
    const cdp = await context.newCDPSession(page);
    if (cores) await cdp.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: cores });
    await page.goto(url);
    await page.bringToFront();
    await page.getByRole('heading', { name: 'Apple Silicon App Test' }).waitFor();
    await page.getByRole('button', { name: 'Rescan zed' }).waitFor();
    await run(page, cdp, context);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function waitForCount(page, count) {
  await page.waitForFunction((text) => document.getElementById('results-count').textContent
    .replace(/^Found .*? · /, '') === text, count);
}

function row(page, name) {
  return page.locator('.result').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

async function cardJSON(card) {
  await card.locator('details').first().evaluate((node) => {
    node.open = true;
    node.querySelector('details').open = true;
  });
  return JSON.parse(await card.locator('pre').filter({ hasText: /^{/ }).textContent());
}

function readOverlap(completions) {
  const edges = completions
    .filter(({ firstRead, ended }) => firstRead !== null && ended > firstRead)
    .flatMap(({ firstRead, ended }) => [[firstRead, 1], [ended, -1]])
    .sort(([a, aDelta], [b, bDelta]) => a - b || aDelta - bDelta);
  let active = 0;
  let peak = 0;
  for (const [, delta] of edges) {
    active += delta;
    peak = Math.max(peak, active);
  }
  return peak;
}

async function mainThreadTime(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find(({ name }) => name === 'TaskDuration').value * 1000;
}

async function measure(page, cdp, browserCDP, label, count, limit, load) {
  await cdp.send('Performance.enable');
  const baseline = await processMemory(browserCDP);
  const initialMainTime = await mainThreadTime(cdp);
  let peak = baseline;
  let pending;
  const sample = () => {
    pending ??= processMemory(browserCDP).then((bytes) => {
      peak = Math.max(peak, bytes);
    }).finally(() => { pending = undefined; });
    return pending;
  };
  const monitor = setInterval(sample, 35);
  const started = await page.evaluate(() => performance.timeOrigin + performance.now());
  let elapsed;
  let mainThreadMs;
  try {
    await load();
    await waitForCount(page, `${count} of ${count} finished`);
    elapsed = await page.evaluate((start) => performance.timeOrigin + performance.now() - start, started);
    mainThreadMs = rounded(await mainThreadTime(cdp) - initialMainTime);
  } finally {
    clearInterval(monitor);
    await sample();
  }

  const probe = await page.evaluate(() => window.uiProbe);
  assert.equal(probe.starts.length, count);
  assert.equal(probe.completions.length, count);
  assert.equal(new Set(probe.completions.map(({ id }) => id)).size, count);
  assert.equal(await page.locator('.result[data-status="complete"]').count(), Math.min(24, count));
  assert.equal(await page.locator('#overall-progress').evaluate((progress) => progress.position), 1);
  assert.match(await page.locator('#batch-metrics').innerText(), /read · Elapsed \d+:\d\d/);

  const realOverlap = readOverlap(probe.completions);
  assert.equal(probe.peakActive, Math.min(limit, count));
  assert.ok(realOverlap >= (limit > 1 && count > 1 ? 2 : 1), `only ${realOverlap} read lifetimes overlapped`);
  assert.ok(realOverlap <= limit);
  const { targetInfos } = await browserCDP.send('Target.getTargets');
  const workers = targetInfos.filter(({ type }) => type === 'worker');
  const workerMemory = await Promise.all(page.workers().map(async (worker) => {
    const workerURL = worker.url();
    const target = workers.find(({ url }) => url === workerURL);
    assert.ok(target, `missing Chromium target for ${workerURL}`);
    const [wasm, heap] = await Promise.all([
      worker.evaluate(async () => {
        const { default: init } = await import('/pkg/scan_wasm.js');
        return (await init()).memory.buffer.byteLength;
      }),
      workerHeap(browserCDP, target.targetId),
    ]);
    return {
      slot: Number(new URL(workerURL).searchParams.get('slot')),
      wasmMiB: mib(wasm),
      jsHeapMiB: mib(heap.usedSize),
      backingStorageMiB: mib(heap.backingStorageSize),
    };
  }));
  workerMemory.sort((a, b) => a.slot - b.slot);

  const longTasks = probe.longTasks.filter(({ start }) => start >= started).map(({ duration }) => duration);
  const longest = Math.max(0, ...longTasks);
  const blocking = longTasks.reduce((total, duration) => total + Math.max(0, duration - 50), 0);
  assert.ok(longest < 150, `main-thread task took ${longest} ms`);
  assert.ok(blocking < 200, `main thread blocked for ${blocking} ms past the long-task threshold`);
  if (baseline) assert.ok(peak - baseline < 512 * MiB, 'Chromium grew by more than 512 MiB PSS');
  console.log(JSON.stringify({
    label, count, limit, actualReadOverlap: realOverlap,
    workerMs: rounded(Math.max(...probe.completions.map(({ ended }) => ended)) - probe.starts[0].at),
    uiMs: rounded(elapsed), mainThreadMs, longTasksMs: longTasks, blockingMs: blocking,
    baselinePssMiB: mib(baseline), peakPssMiB: mib(peak), workerMemory,
  }));
  return probe;
}

test('offline Chromium scans, timing, cancellation and scheduling', { timeout: 120_000 }, async (t) => {
  await requireBrowserHeadroom();
  const scratch = mkdtempSync(join(homedir(), '.cache', 'doesitarm-ui-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const mixed = mixedInputs(scratch);
  const folder = appsFolder(scratch, 120);
  const held = heldInputs(scratch, 9);
  const timer = timerInput(scratch);
  const sparse = join(scratch, '5 GiB sparse.macho');
  const { offset, size } = sparseFat(sparse);

  const { server, url } = await startPreview({
    fromSource: true,
    extraAssets: new Map([['/ui-smoke-worker.js', new URL('../test/ui-worker-probe.js', import.meta.url)]]),
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
  let memory;
  t.after(async () => {
    await memory?.stop();
    await browser.close();
    if (memory?.failure) throw memory.failure;
  });
  memory = await monitorChromiumMemory(browser);
  const browserCDP = await browser.newBrowserCDPSession();
  console.log(`Chromium ${browser.version()}`);

  for (const [count, gentle] of [[10, false], [30, false], [100, false], [30, true]]) {
    await t.test(`${count} mixed inputs in ${gentle ? 'Gentle' : 'Foreground'}`, async () => {
      await withPage(browser, url, async (page, cdp) => {
        const cores = await page.evaluate(() => navigator.hardwareConcurrency);
        const limit = gentle ? 1 : Math.min(6, Math.max(1, cores - 2));
        await page.waitForFunction((mode) => document.getElementById('mode-status').textContent.startsWith(mode),
          gentle ? 'Passive' : 'Foreground');
        const inputs = mixed.slice(0, count);
        const probe = await measure(page, cdp, browserCDP, `mixed-${count}-${gentle ? 'gentle' : 'foreground'}`,
          count, limit, () => page.locator('#files').setInputFiles(inputs.map(({ path }) => path)));
        assert.deepEqual(probe.starts.map(({ label }) => label),
          inputs.toSorted((a, b) => a.size - b.size).map(({ name }) => name));
        assert.ok(probe.starts.every(({ passive }) => passive === gentle));
        if (gentle && await page.evaluate(() => Boolean(globalThis.scheduler?.postTask))) {
          assert.ok(probe.completions.every(({ yields }) => yields > 0));
        }
        for (const width of [320, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 850 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
      }, { gentle });
    });
  }

  await t.test('drops a real folder containing 120 app bundles', async () => {
    await withPage(browser, url, async (page, cdp) => {
      const limit = await page.evaluate(() => Math.min(6, Math.max(1, navigator.hardwareConcurrency - 2)));
      await page.evaluate(() => { DataTransferItem.prototype.getAsFileSystemHandle = undefined; });
      const probe = await measure(page, cdp, browserCDP, 'folder-drop', 120, limit, () => dropPaths(page, cdp, [folder]));
      assert.equal(new Set(probe.starts.map(({ label }) => label)).size, 120);
      assert.ok(probe.starts.every(({ label }) => /^Apps\/Fixture \d+\.app$/.test(label)));
    });
  });

  await t.test('reads a slice beyond 4 GiB from a sparse file', async () => {
    await withPage(browser, url, async (page, cdp) => {
      await measure(page, cdp, browserCDP, 'sparse-mach-o', 1, 1, () => page.locator('#files').setInputFiles(sparse));
      const scan = await cardJSON(row(page, '5 GiB sparse.macho'));
      assert.equal(scan.total_size, size);
      assert.ok(scan.bytes_read < 1024);
      assert.ok(scan.architectures.some((arch) => arch.offset === offset && arch.header_verified));
      console.log(`Sparse file ${size} logical bytes, ${statSync(sparse).blocks * 512} allocated bytes, ${scan.bytes_read} unique bytes read`);
    });
  });

  await t.test('browser local profile accepts more than the Worker decoded budget', async () => {
    const large = streamInput(scratch, { name: 'large-output.tar.gz', sizeMiB: 65, compressible: true });
    await withPage(browser, url, async (page) => {
      await page.locator('#files').setInputFiles(large);
      await waitForCount(page, '1 of 1 finished');
      const scan = await cardJSON(row(page, 'large-output.tar.gz'));
      assert.equal(scan.status, 'complete');
      assert.ok(scan.decoded_bytes > 64 * MiB);
      console.log(`Local archive decoded ${scan.decoded_bytes} bytes from ${scan.bytes_read} unique source bytes`);
    });
  });

  await t.test('focus and Gentle changes drain the queue without disrupting scans; both cancellations work', async () => {
    await withPage(browser, url, async (page, cdp, context) => {
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      await page.bringToFront();
      await page.locator('#files').setInputFiles(held);
      await waitForCount(page, '0 of 9 finished · 6 scanning · 3 queued');
      const queued = row(page, 'hold-8.macho').getByRole('button', { name: 'Cancel hold-8.macho' });
      await queued.focus();
      await queued.press('Enter');
      await waitForCount(page, '1 of 9 finished · 6 scanning · 2 queued · 1 canceled');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'hold-8.macho');

      const second = await context.newPage();
      await second.bringToFront();
      await page.waitForFunction(() => document.getElementById('mode-status').textContent === 'Passive · up to 2 workers');
      assert.ok(!(await page.evaluate(() => window.uiProbe.stopped.some(({ job }) => job !== null))));
      assert.equal(await page.locator('.scan-status').filter({ hasText: /^Scanning$/ }).count(), 6);
      await page.bringToFront();
      await page.waitForFunction(() => document.getElementById('mode-status').textContent.startsWith('Foreground'));

      const toggle = page.getByRole('checkbox', { name: 'Gentle' });
      await toggle.focus();
      await toggle.press('Space');
      await page.waitForFunction(() => document.getElementById('mode-status').textContent === 'Passive · up to 1 worker');
      assert.equal(await page.evaluate(() => localStorage.getItem('scan-mode')), 'gentle');
      await row(page, 'hold-0.macho').getByRole('button').click();
      await page.waitForFunction(() => window.uiProbe.stopped.some(({ job }) => job === 1));
      await page.waitForFunction(() => window.uiProbe.starts.length === 7);
      const afterDrain = await page.evaluate(() => window.uiProbe.starts.at(-1));
      assert.equal(afterDrain.label, 'hold-6.macho');
      assert.equal(afterDrain.passive, true);
      await page.getByRole('button', { name: 'Cancel all' }).click();
      await waitForCount(page, '9 of 9 finished · 4 canceled');
      const probe = await page.evaluate(() => window.uiProbe);
      assert.equal(probe.completions.length, 5);
      assert.equal(probe.starts.length, 7);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
      await second.close();

      await page.reload();
      assert.ok(await toggle.isChecked());
      await page.locator('#files').setInputFiles(fixture('thin.macho'));
      await waitForCount(page, '1 of 1 finished');
      assert.equal(await page.locator('.result[data-status="complete"]').count(), 1);
    }, { cores: 8 });
  });

  await t.test('indeterminate and planned progress, quiet timer updates, and defensible ETA', async () => {
    await withPage(browser, url, async (page) => {
      await page.locator('#files').setInputFiles([timer, fixture('thin.macho')]);
      const item = row(page, 'timer-thin.macho');
      const timerLabel = item.locator('.result-timer');
      assert.ok(await timerLabel.isHidden());
      const progress = item.getByRole('progressbar', { name: 'timer-thin.macho Source reads' });
      const overall = page.getByRole('progressbar', { name: 'Batch progress by scans finished' });
      await progress.waitFor({ state: 'visible' });
      await waitForCount(page, '1 of 2 finished · 1 scanning');
      assert.equal(await overall.evaluate((bar) => bar.position), 0.5);
      await page.locator('#files').setInputFiles(fixture('stored.zip'));
      await waitForCount(page, '2 of 3 finished · 1 scanning');
      assert.equal(await overall.getAttribute('value'), null);
      await page.waitForFunction((label) => {
        const heading = [...document.querySelectorAll('.result h3')].find((node) => node.textContent === label);
        const bar = heading.closest('.result').querySelector('progress');
        return bar.hasAttribute('value') && bar.position > 0 && bar.position < 1;
      }, 'timer-thin.macho');
      await progress.evaluate((bar) => {
        window.readPositions = [bar.position];
        new MutationObserver(() => window.readPositions.push(bar.position)).observe(bar, {
          attributes: true, attributeFilter: ['value'],
        });
      });
      assert.equal(await progress.evaluate((bar) => bar.max), 1_048_612);
      assert.ok(statSync(timer).size > 3 * (await progress.evaluate((bar) => bar.max)));
      await page.waitForFunction(() => /About \d+:\d\d left/.test(document.getElementById('batch-metrics').textContent));
      await timerLabel.filter({ hasText: /^Elapsed 0:05$/ }).waitFor({ state: 'visible' });
      assert.equal(await page.locator('#timer-notice').textContent(), 'Elapsed time is available for timer-thin.macho.');
      await timerLabel.filter({ hasText: /^Elapsed 0:06$/ }).waitFor({ state: 'visible' });
      assert.equal(await page.locator('#timer-notice').textContent(), 'Elapsed time is available for timer-thin.macho.');
      await waitForCount(page, '3 of 3 finished');
      assert.equal(await progress.evaluate((bar) => bar.position), 1);
      assert.equal(await overall.evaluate((bar) => bar.position), 1);
      const positions = await page.evaluate(() => window.readPositions);
      assert.ok(positions.length > 2 && positions.every((position, i) => !i || position >= positions[i - 1]));
      assert.doesNotMatch(await page.locator('#batch-metrics').textContent(), /left/);

      // A live unplanned scan remains indeterminate, with no animation in reduced motion.
      await page.locator('#files').setInputFiles(held[0]);
      const unknown = row(page, 'hold-0.macho').getByRole('progressbar');
      await unknown.waitFor({ state: 'visible' });
      assert.equal(await unknown.getAttribute('value'), null);
      assert.equal(await unknown.evaluate((bar) => getComputedStyle(bar).animationName), 'none');
      await page.getByRole('button', { name: 'Cancel all' }).click();
      await waitForCount(page, '1 of 1 finished · 1 canceled');
      assert.ok(await unknown.isHidden());
    }, { reducedMotion: 'reduce' });
  });
});
