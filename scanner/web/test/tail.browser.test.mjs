import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { emulateMac, readScanJson, requireBrowserHeadroom } from './browser-helpers.mjs';
import { fixture } from './helpers.mjs';

const tail = (name) => new URL(`../../fixtures/tail/${name}`, import.meta.url).pathname;

async function open(t) {
  await requireBrowserHeadroom();
  const { server, url } = await startPreview({});
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1180, height: 880 } });
  await emulateMac(context);
  await context.addInitScript(() => {
    if (!localStorage.getItem('doesitarm.scanner.view.v1')) localStorage.setItem('doesitarm.scanner.view.v1', '{"level":"research"}');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return { page, url };
}

test('a compressed nested disk image reports no more bytes read than the file holds', { timeout: 60_000 }, async (t) => {
  const { page, url } = await open(t);
  await page.goto(url);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select Apps' }).click();
  await (await chooser).setFiles([tail('deflated-dmg.zip')]);
  const card = page.locator('.result').filter({ has: page.getByRole('heading', { name: 'deflated-dmg.zip', exact: true }) });
  const result = await readScanJson(page, card.first());
  const size = statSync(tail('deflated-dmg.zip')).size;
  assert.equal(result.status, 'complete');
  assert.ok(result.bytes_read <= size, `${result.bytes_read} > ${size}`);
  assert.ok(result.bytes_requested <= 3 * size, `requested ${result.bytes_requested} of ${size}`);
});

test('when only a stalled scan remains the batch says so and Cancel keeps finished results', { timeout: 60_000 }, async (t) => {
  const { page, url } = await open(t);
  await page.addInitScript(() => {
    // The second worker never answers, like a read that has not come back.
    const Real = window.Worker;
    let made = 0;
    window.Worker = class extends EventTarget {
      constructor(...args) {
        super();
        made += 1;
        if (made === 2) return Object.assign(new EventTarget(), { postMessage() {}, terminate() {} });
        return new Real(...args);
      }
    };
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4 });
    const now = performance.now.bind(performance);
    window.__skew = 0;
    performance.now = () => now() + window.__skew;
  });
  await page.goto(url);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select Apps' }).click();
  await (await chooser).setFiles([fixture('thin.macho'), fixture('hfsx.dmg')]);
  const line = page.locator('#results-count');
  await line.getByText(/1 of 2 finished/).waitFor().catch(() => {});
  await page.waitForFunction(() => /1 of 2 finished/.test(document.getElementById('results-count').textContent));
  assert.match(await line.textContent(), /1 scanning/);
  assert.doesNotMatch(await line.textContent(), /still scanning/);
  await page.evaluate(() => { window.__skew = 30_000; });
  await page.waitForFunction(() => /1 still scanning/.test(document.getElementById('results-count').textContent));
  const cancel = page.getByRole('button', { name: 'Cancel 1 still scanning' });
  await cancel.click();
  await page.waitForFunction(() => /2 of 2 finished/.test(document.getElementById('results-count').textContent));
  assert.match(await line.textContent(), /1 canceled/);
  const done = page.locator('.result').filter({ has: page.getByRole('heading', { name: 'thin.macho', exact: true }) });
  assert.equal((await readScanJson(page, done.first())).status, 'complete');
});
