import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { requireBrowserHeadroom } from './browser-helpers.mjs';

// Simulates a browser that died mid-scan: the page is closed with the journal
// still open, then the page is loaded again and must offer a crash report.
test('a scan that never reached its clean end is offered as a crash report', { timeout: 60_000 }, async () => {
  await requireBrowserHeadroom();
  const { server, url } = await startPreview({ fromSource: true });
  const profile = await mkdtemp(join(tmpdir(), 'scanner-crash-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', reducedMotion: 'reduce', acceptDownloads: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(url);
    await page.evaluate(async () => {
      const { crash } = await import('/crash-journal.js');
      crash.begin('drop');
      crash.event('probe', { message: 'reading /Users/jane/Applications/Secret.app' });
    });
    await page.waitForTimeout(2500);
    await page.close();
    const reopened = await context.newPage();
    reopened.setDefaultTimeout(10_000);
    await reopened.goto(url);
    const notice = reopened.locator('#crash-notice');
    await notice.waitFor({ state: 'visible' });
    assert.match(await notice.innerText(), /The last scan ended unexpectedly/);
    const pending = reopened.waitForEvent('download');
    await reopened.getByRole('button', { name: 'Download crash report' }).click();
    const lines = gunzipSync(await readFile(await (await pending).path())).toString().trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines[0].type, 'crash_report');
    assert.equal(lines[0].input, 'drop');
    assert.equal(lines[0].outcome, 'no_clean_end');
    assert.ok(lines.some((line) => line.type === 'sample'));
    assert.doesNotMatch(JSON.stringify(lines), /jane/);
    await reopened.getByRole('button', { name: 'Dismiss' }).click();
    await reopened.reload();
    await reopened.waitForTimeout(500);
    assert.equal(await reopened.locator('#crash-notice').isHidden(), true);
  } finally {
    await context?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
