import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { requireBrowserHeadroom } from './browser-helpers.mjs';

async function fixtureFolder(executable) {
  const root = await navigator.storage.getDirectory();
  const applications = await root.getDirectoryHandle('Applications', { create: true });
  async function write(path, bytes) {
    const parts = path.split('/');
    let folder = applications;
    for (const directory of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(directory, { create: true });
    const file = await folder.getFileHandle(parts.at(-1), { create: true });
    const stream = await file.createWritable();
    await stream.write(bytes);
    await stream.close();
  }
  await write('Primary.app/Contents/Info.plist', `<?xml version="1.0" encoding="UTF-8"?>
    <plist version="1.0"><dict><key>CFBundleExecutable</key><string>Run</string></dict></plist>`);
  await write('Primary.app/Contents/MacOS/Run', new Uint8Array(executable));
  window.showDirectoryPicker = async () => applications;
}

// A crashed browser takes the page and its memory with it. Rows written to
// IndexedDB as they settle must be offered again, with a diagnostics export,
// when the page is reopened.
test('a reloaded page offers the rows a folder scan saved before it was lost', { timeout: 60_000 }, async () => {
  await requireBrowserHeadroom();
  const { server, url } = await startPreview({ fromSource: true });
  const profile = await mkdtemp(join(tmpdir(), 'scanner-recovery-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    // Non-Mac browsers open on the URL tab; this test drives the file tab.
    await page.addInitScript(() => localStorage.setItem('scanner-entry', 'files'));
    await page.goto(url);
    const executable = await readFile(new URL('../../fixtures/thin.macho', import.meta.url));
    await page.evaluate(fixtureFolder, [...executable]);
    await page.getByRole('button', { name: 'Choose folder' }).click();
    await page.getByText(/\b1 of 1 finished/).first().waitFor();
    // Mark the run as interrupted, as if the browser died before it finished.
    await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('scanner-folder-runs');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('runs', 'readwrite');
        const store = tx.objectStore('runs');
        store.getAll().onsuccess = (event) => {
          for (const run of event.target.result) store.put({ ...run, state: 'in_progress' });
        };
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }));
    const reopened = await context.newPage();
    await page.close();
    reopened.setDefaultTimeout(10_000);
    await reopened.goto(url);
    const saved = reopened.locator('#saved-folders');
    await saved.locator('summary').click();
    await saved.locator('[role=status]').waitFor();
    assert.match(await saved.innerText(), /Incomplete · 1 result saved on this device/);
    await saved.locator('.diagnostic-actions select').selectOption('json');
    await saved.locator('#saved-download-diagnostics').click();
    const link = saved.locator('a[download]');
    await link.waitFor();
    const pending = reopened.waitForEvent('download');
    void pending.catch(() => {});
    await link.click();
    const exported = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
    assert.equal(exported.run.recovery_state, 'in_progress');
    assert.equal(exported.results.length, 1);
    assert.equal(exported.results[0].display_path, 'Applications/Primary.app');
  } finally {
    await context?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
