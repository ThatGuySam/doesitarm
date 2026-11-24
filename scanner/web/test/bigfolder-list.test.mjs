import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { monitorChromiumMemory, requireBrowserHeadroom } from './browser-helpers.mjs';

const MiB = 1024 ** 2;

async function seedResults() {
  const { ResultsList } = await import('/results-list.js');
  const { timeSlice } = await import('/folder-walk.js');
  const pool = {
    submit(id, job, update) {
      const status = job.arch ? 'complete' : 'no_executable';
      const architectures = job.arch ? [{ name: job.arch, header_verified: true }] : [];
      update({ type: 'start' });
      update({ type: 'done', source: 'Browser', result: { status, architectures, bytes_read: 72, format: 'app' } });
    },
  };
  const mode = { limit: 2, passive: false };
  const view = new ResultsList(pool, () => mode);
  const run = view.beginFolder({ method: 'synthetic', folder_name: 'Catalog', files_seen: 100_000 }, mode);
  const tasks = [];
  const observer = new PerformanceObserver((list) => tasks.push(...list.getEntries()));
  observer.observe({ type: 'longtask' });
  window.bigListLongTasks = () => [...tasks, ...observer.takeRecords()].map(({ startTime, duration }) => ({ startTime, duration }));
  const started = performance.now();
  const pause = timeSlice();
  const rowCount = 50_000;
  for (let base = rowCount; base > 0; base -= 32) {
    const jobs = [];
    for (let index = base; index > Math.max(0, base - 32); index--) {
      jobs.push({
        kind: 'bundle', label: `Catalog/Product ${String(index).padStart(5, '0')}.app`,
        arch: index % 5 === 0 ? null : index % 2 === 0 ? 'x86_64' : 'arm64',
      });
    }
    view.add(jobs, run);
    const wait = pause();
    if (wait) await wait;
  }
  run.appCount = rowCount;
  view.finishFolder(run, false);
  return Math.round(performance.now() - started);
}

test('whole-list filtering and paging keep the DOM bounded at 50,000 results', { timeout: 60_000 }, async (t) => {
  await requireBrowserHeadroom();
  const { server, url } = await startPreview({ fromSource: true });
  let browser;
  let monitor;
  let peakRss = 0;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
    monitor = await monitorChromiumMemory(browser, ({ rss }) => { peakRss = Math.max(peakRss, rss); });

    const page = await browser.newPage({ viewport: { width: 1180, height: 880 } });
    page.setDefaultTimeout(7000);
    await page.route('**/app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(url);
    const seedMs = await page.evaluate(seedResults);
    const rendered = page.locator('#scan-results .result');
    const heading = rendered.first().locator('h3');
    const firstNodeCount = await page.evaluate(() => document.getElementsByTagName('*').length);
    await page.getByText('1–24 of 50,000', { exact: true }).waitFor();
    assert.equal(await rendered.count(), 24);
    assert.equal(await page.locator('.diagnostic-actions select option[value="json"]').count(), 0);
    assert.equal(await page.locator('#copy-results').isVisible(), false);
    await assert.rejects(page.evaluate(async () => {
      const { makeExport } = await import('/diagnostics.js');
      return makeExport({}, [], { count: 5_000, format: 'json' });
    }), /Plain JSON is available for exports under 5,000 rows/);
    assert.equal(await heading.textContent(), 'Catalog/Product 50000.app');
    assert.match(await page.locator('.result-summary').textContent(), /10,000 No executable.*40,000 Complete.*x86_64 20,000/);

    const filterStart = performance.now();
    await page.getByLabel(/^Status/).selectOption('complete');
    await page.getByLabel(/^Architecture/).selectOption('x86_64');
    await page.getByLabel(/^Sort by/).selectOption('name');
    await page.getByText('1–24 of 20,000', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Catalog/Product 00002.app', exact: true }).waitFor();
    const filterMs = Math.round(performance.now() - filterStart);

    const pageStart = performance.now();
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByText('25–48 of 20,000', { exact: true }).waitFor();
    assert.equal(await heading.textContent(), 'Catalog/Product 00062.app');
    const pageMs = Math.round(performance.now() - pageStart);
    await page.mouse.wheel(0, -550);
    await page.mouse.wheel(0, 550);
    assert.equal(await rendered.count(), 24);
    assert.equal(await page.evaluate(() => document.getElementsByTagName('*').length), firstNodeCount);

    const tasks = await page.evaluate(() => window.bigListLongTasks());
    t.diagnostic(`50,000 rows · 24 rendered · ${firstNodeCount} document elements · ${seedMs} ms insert · ${filterMs} ms filter/sort · ${pageMs} ms next page · ${Math.round(peakRss / MiB)} MiB Chromium RSS · ${tasks.length} long tasks`);
    assert.deepEqual(tasks, [], 'List generated a main-thread task of at least 50 ms.');
  } catch (error) {
    throw monitor?.failure ?? error;
  } finally {
    await monitor?.stop();
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
