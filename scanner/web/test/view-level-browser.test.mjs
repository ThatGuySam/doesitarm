import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { requireBrowserHeadroom } from './browser-helpers.mjs';
import { fixture } from './helpers.mjs';

const KEY = 'doesitarm.scanner.view.v1';

test('view levels: Minimal by default, disclosure persists, reset returns to Minimal', { timeout: 90_000 }, async () => {
  await requireBrowserHeadroom();
  const { server, url } = await startPreview({ fromSource: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(() => { localStorage.setItem('scanner-entry', 'files'); });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(url);
    const level = () => page.evaluate(() => document.documentElement.dataset.level);
    const reach = (value) => page.waitForFunction((want) => document.documentElement.dataset.level === want, value);
    const stored = () => page.evaluate((key) => localStorage.getItem(key), KEY);
    assert.equal(await level(), 'minimal');
    assert.match(await page.locator('#drop-prompt').innerText(), /^Drag an app, a folder, or a folder of apps here\./);
    assert.equal(await page.locator('#more-options').evaluate((node) => node.open), false);
    assert.equal(await page.locator('#homebrew').isVisible(), false);

    // Choose folder only exists where showDirectoryPicker does.
    assert.equal(await page.locator('#choose-folder').isVisible(), true);

    await page.locator('#files').setInputFiles(fixture('fat.macho'));
    const row = page.locator('.result[data-state="done"]');
    await row.waitFor();
    assert.equal(await row.locator('.result-verdict').isVisible(), false);
    assert.match(await row.locator('summary').innerText(), /Apple Silicon native.*Details/s);
    assert.equal(await row.locator('.result-size').isVisible(), false);
    assert.equal(await page.locator('#results-tools-disclosure').isVisible(), false);

    await page.locator('#more-options > summary').click();
    await reach('more');
    assert.equal(await stored(), '{"level":"more"}');
    assert.equal(await row.locator('.result-verdict').isVisible(), true);
    assert.equal(await page.locator('#outcome-strip').isVisible(), true);
    assert.equal(await page.locator('#homebrew').isVisible(), false);

    await page.locator('#research-view > summary').click();
    await reach('research');
    assert.equal(await page.locator('#homebrew').isVisible(), true);
    await page.reload();
    assert.equal(await level(), 'research');
    assert.equal(await page.locator('#research-view').evaluate((node) => node.open), true);

    // Closing More closes Research with it.
    await page.locator('#more-options > summary').click();
    await reach('minimal');
    assert.equal(await page.locator('#research-view').evaluate((node) => node.open), false);

    await page.locator('#more-options > summary').click();
    await page.locator('#reset-view').click();
    assert.equal(await stored(), null);
    await reach('minimal');
    await page.waitForTimeout(300);
    assert.equal(await stored(), null);
    assert.equal(await page.evaluate(() => document.activeElement.parentElement.id), 'more-options');

    await page.evaluate((key) => localStorage.setItem(key, '{"level":"bogus"}'), KEY);
    await page.reload();
    assert.equal(await level(), 'minimal');

    // Without showDirectoryPicker (Firefox, Safari) Choose folder is hidden.
    const plain = await context.newPage();
    await plain.addInitScript(() => { delete window.showDirectoryPicker; });
    await plain.goto(url);
    assert.equal(await plain.locator('#choose-folder').isHidden(), true);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
