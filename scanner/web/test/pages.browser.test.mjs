import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { emptyResult } from '../public/scan-result.js';
import { requireBrowserHeadroom } from './browser-helpers.mjs';

const devices = [
  ['', 'Windows', 'Win32', 0, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 1024, false],
  ['', 'Android', 'Linux armv8l', 5, 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', 320, false],
  ['iPhone', null, 'iPhone', 5, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 390, false],
  ['iPad-as-Mac', null, 'MacIntel', 5, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 768, false],
  ['macOS', 'macOS', 'MacIntel', 0, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 1440, true],
];

const entryCopy = "Paste a download link or the app's download page";
const publisher = 'https://publisher.example.net';
const artifacts = ['arm64', 'universal', 'x86_64'].map((arch) => ({
  arch, os: 'macos', kind: 'direct_file', filename: `Tool-${arch}.dmg`,
  url: `https://cdn.example.net/Tool-${arch}.dmg`,
  host: 'cdn.example.net',
  evidence: { page: 'publisher.example.net', path: '/app', selector: 'a[href]', text: 'Download for Mac' },
}));

test('device-aware entry and phase changes in a real Chromium page', { timeout: 60_000 }, async (t) => {
  await requireBrowserHeadroom();
  let resolveRead;
  let resolveScan;
  const fetched = [];
  const { url, server } = await startPreview({
    fromSource: true,
    api: async (request) => {
      const path = new URL(request.url).pathname;
      const target = request.method === 'GET' ? new URL(request.url).searchParams.get('url') : (await request.json()).url;
      fetched.push([path, target]);
      if (target.endsWith('/limited') || target.endsWith('/limited.dmg')) {
        return Response.json(emptyResult('limit_reached', 'Too many scans. Try again in a minute.'), { status: 429 });
      }
      if (path === '/api/scan-download') {
        await new Promise((resolve) => { resolveScan = resolve; });
        return Response.json(emptyResult('complete', null, 1024));
      }
      if (target.endsWith('/gated')) return Response.json({ decision: 'gated', reason: 'vendor_action', candidates: [] });
      if (target.endsWith('/store')) return Response.json({
        decision: 'gated', reason: 'app_store', candidates: [],
        handoff: { url: 'https://apps.apple.com/us/app/test/id123' },
      });
      if (target.endsWith('/auto')) return Response.json({ decision: 'resolved', candidates: artifacts });
      await new Promise((resolve) => { resolveRead = resolve; });
      return Response.json({ decision: 'ambiguous', candidates: artifacts });
    },
  });
  t.after(() => { resolveRead?.(); resolveScan?.(); server.closeAllConnections(); server.close(); });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
  t.after(() => browser.close());

  for (const [label, hint, platform, touches, userAgent, width, mac] of devices) {
    await t.test(label || hint, async () => {
      const context = await browser.newContext({ userAgent, hasTouch: touches > 0, viewport: { width, height: 850 } });
      try {
        await context.addInitScript(({ hint, platform, touches }) => {
          Object.defineProperties(navigator, {
            userAgentData: { value: hint ? { platform: hint } : undefined },
            platform: { value: platform },
            maxTouchPoints: { value: touches },
          });
        }, { hint, platform, touches });
        const page = await context.newPage();
        await page.goto(url);
        await page.locator(`#drop-zone[data-entry="${mac ? 'files' : 'url'}"]`).waitFor();
        assert.equal(await page.getByLabel(entryCopy).isVisible(), !mac);
        assert.equal(await page.getByRole('button', { name: 'Select Apps' }).isVisible(), mac);
        assert.equal(await page.locator('#device-files').evaluate((node) => node.open), mac);
        assert.equal(await page.locator('#advanced').evaluate((node) => node.open), !mac);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        if (touches > 0) {
          await page.evaluate(() => document.querySelector('.dia-scanner').classList.add('drag-active'));
          assert.equal(await page.locator('.drop-hint').isVisible(), false);
          await page.getByText('Scan files instead').click();
          assert.equal(await page.locator('.drag-copy').isVisible(), false);
        }
        if (label === 'macOS') {
          await page.locator('#more-options > summary').click();
          await page.locator('#advanced > summary').click();
          await page.reload();
          await page.locator('#drop-zone[data-entry="url"]').waitFor();
          assert.equal(await page.getByLabel(entryCopy).isVisible(), true);
        }
        if (label === 'iPad-as-Mac') {
          await page.reload();
          await page.locator('#drop-zone[data-entry="files"]').waitFor();
          assert.equal(await page.getByRole('button', { name: 'Select Apps' }).isVisible(), true);
        }
      } finally {
        await context.close();
      }
    });
  }

  await t.test('reads the page, discloses sources, lets the user pick, and scans', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto(url);
      const input = page.getByLabel(entryCopy);
      await input.fill(publisher + '/app');
      await page.getByRole('button', { name: 'Scan URL', exact: true }).click();
      await page.getByText('Reading the page…', { exact: true }).waitFor();
      assert.ok(await page.locator('#url-phase.is-loading').isVisible());
      while (!resolveRead) await new Promise((resolve) => setTimeout(resolve, 10));
      resolveRead();
      await page.getByText('Found 3 possible downloads', { exact: true }).waitFor();
      assert.deepEqual(fetched, [['/api/resolve', publisher + '/app']]);
      await page.getByText('Download sources', { exact: true }).click();
      await page.getByText('Found at publisher.example.net/app · a[href] · Download for Mac', { exact: true }).first().waitFor();
      const picker = page.getByLabel('Choose a macOS download');
      assert.equal(await picker.locator('option').count(), 4);
      await picker.selectOption('0');
      await page.getByRole('button', { name: 'Scan selected download' }).click();
      await page.getByText('Scanning macOS download (arm64)…', { exact: true }).waitFor();
      assert.ok(await page.locator('#url-phase.is-loading').isVisible());
      while (!resolveScan) await new Promise((resolve) => setTimeout(resolve, 10));
      resolveScan();
      await page.getByText('Scan finished. See results below.', { exact: true }).waitFor();
      assert.deepEqual(fetched.at(-1), ['/api/scan-download', artifacts[0].url]);
      await input.fill(publisher + '/gated');
      await page.getByRole('button', { name: 'Scan URL', exact: true }).click();
      await page.getByText(/The publisher requires a step/).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Open publisher’s download page' }).getAttribute('href'), publisher + '/gated');
      await input.fill(publisher + '/store');
      await page.getByRole('button', { name: 'Scan URL', exact: true }).click();
      await page.getByText(/This app is distributed through the Mac App Store/).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Open Mac App Store listing' }).getAttribute('href'),
        'https://apps.apple.com/us/app/test/id123');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      await page.evaluate(() => {
        const phase = document.getElementById('url-phase');
        window.phaseHistory = [];
        new MutationObserver(() => window.phaseHistory.push(phase.textContent)).observe(phase, { childList: true });
      });
      resolveScan = undefined;
      await input.fill(publisher + '/auto');
      await page.getByRole('button', { name: 'Scan URL', exact: true }).click();
      await page.getByText('Scanning macOS download (arm64)…', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => window.phaseHistory.includes('Found 3 possible downloads')));
      while (!resolveScan) await new Promise((resolve) => setTimeout(resolve, 10));
      resolveScan();
      await page.getByText('Scan finished. See results below.', { exact: true }).waitFor();
      assert.deepEqual(fetched.at(-1), ['/api/scan-download', artifacts[0].url]);
    } finally {
      await context.close();
    }
  });

  await t.test('reports both resolver and scan API rate limits in the toaster', async () => {
    const page = await browser.newPage();
    try {
      // Keep the browser's direct download attempt local to this test.
      await page.route(`${publisher}/limited.dmg`, (route) => route.abort());
      await page.goto(url);
      const input = page.getByLabel(entryCopy);
      const submit = page.getByRole('button', { name: 'Scan URL', exact: true });
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Download requests are rate limited.' });
      for (const path of ['/limited', '/limited.dmg']) {
        await input.fill(publisher + path);
        await submit.click();
        await toast.waitFor();
        assert.match(await toast.innerText(), /Try again in a minute/);
        await toast.getByRole('button', { name: /^Dismiss/ }).click();
        await toast.waitFor({ state: 'detached' });
      }
      assert.deepEqual(fetched.slice(-2), [['/api/resolve', publisher + '/limited'], ['/api/scan', publisher + '/limited.dmg']]);
    } finally {
      await page.close();
    }
  });
});
