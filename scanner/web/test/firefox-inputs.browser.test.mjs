import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { startPreview } from '../scripts/serve.mjs';
import { requireBrowserHeadroom } from './browser-helpers.mjs';

async function withFirefox(check) {
  await requireBrowserHeadroom();
  const modulePath = process.env.PLAYWRIGHT_MODULE;
  const { firefox } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright-core');
  const { server, url } = await startPreview({ fromSource: true });
  let browser;
  try {
    browser = await firefox.launch({ headless: true });
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.setDefaultTimeout(8_000);
    await page.addInitScript(() => localStorage.setItem('scanner-entry', 'files'));
    await page.goto(url);
    await check(page);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Firefox Select Apps gives persistent folder guidance and the flat picker can scan a file', { timeout: 30_000 }, async () => {
  await withFirefox(async (page) => {
    let chooserCount = 0;
    page.on('filechooser', () => { chooserCount += 1; });
    const selectApps = page.getByRole('button', { name: 'Select Apps' });
    await selectApps.click();
    const guidance = page.getByRole('region', { name: 'Scanner notifications' })
      .getByText(/Drag your folder here/);
    await guidance.waitFor();
    // Pass the usual Sonner auto-dismiss interval.
    await page.waitForTimeout(4_200);
    assert.equal(await guidance.isVisible(), true);
    assert.equal(chooserCount, 0);
    assert.equal(await page.getByRole('button', { name: 'Choose folder' }).count(), 0);
    await page.getByRole('button', { name: /^Dismiss Drag and drop/ }).focus();
    await page.keyboard.press('Escape');
    await guidance.waitFor({ state: 'detached' });
    assert.equal(await selectApps.evaluate((button) => button === document.activeElement), true);

    const chooserPending = page.waitForEvent('filechooser');
    void chooserPending.catch(() => {});
    await page.getByRole('button', { name: 'Select files or archives' }).click();
    const chooser = await chooserPending;
    assert.equal(await chooser.element().getAttribute('webkitdirectory'), null);
    await chooser.setFiles(fileURLToPath(new URL('../../fixtures/thin.macho', import.meta.url)));
    await page.getByText(/1 of 1 finished/).first().waitFor();
    assert.equal(chooserCount, 1);
  });
});
