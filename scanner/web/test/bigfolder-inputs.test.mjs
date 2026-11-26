import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { emulateMac, monitorChromiumMemory, requireBrowserHeadroom } from './browser-helpers.mjs';

async function fixturePicker(executable) {
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
  for (const app of ['Primary.app', 'Primary.app/Contents/Library/LoginItems/Nested.app']) {
    await write(`${app}/Contents/Info.plist`, `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0"><dict>
        <key>CFBundleExecutable</key><string>Run</string>
        <key>CFBundleIdentifier</key><string>org.doesitarm.folder</string>
        <key>OtherProperties</key><dict><key>Support</key><string>/Users/synthetic-owner/Library/Scanner</string></dict>
      </dict></plist>`);
    await write(`${app}/Contents/MacOS/Run`, new Uint8Array(executable));
  }
  await write('Utilities/standalone runtime', new Uint8Array(executable));
  window.fixtureDirectory = applications;
  window.showDirectoryPicker = (options) => {
    window.observedPickerMode = options.mode;
    return new Promise((resolve) => { window.finishFixturePicker = () => resolve(applications); });
  };
}

test('read-only folder picker scans real OPFS handles and exports all local evidence', { timeout: 45_000 }, async () => {
  await requireBrowserHeadroom();
  const { server, url } = await startPreview({ fromSource: true });
  let browser;
  let monitor;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
    monitor = await monitorChromiumMemory(browser);
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await emulateMac(page.context());
    page.setDefaultTimeout(8000);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.addInitScript(() => localStorage.setItem('doesitarm.scanner.view.v1', '{"level":"research"}'));
    await page.goto(url);
    await page.evaluate(() => { document.documentElement.dataset.level = 'research'; });
    const executable = await readFile(new URL('../../fixtures/thin.macho', import.meta.url));
    await page.evaluate(fixturePicker, [...executable]);
    await page.evaluate(() => {
      const open = window.showDirectoryPicker;
      window.showDirectoryPicker = (options) => {
        window.showDirectoryPicker = open;
        return Promise.reject(new DOMException('Access closed', 'AbortError'));
      };
    });
    await page.getByRole('button', { name: 'Choose folder' }).click();
    await page.locator('#input-status').getByText(/Drag your folder here/).waitFor();
    await page.getByRole('button', { name: 'Choose folder' }).click();
    assert.equal(await page.evaluate(() => window.observedPickerMode), 'read');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const loader = page.locator('#folder-loader');
    await loader.locator('span[aria-hidden]').filter({ hasText: 'Reading folder…' }).waitFor();
    assert.equal(await loader.evaluate((element) => getComputedStyle(element.firstElementChild).animationName), 'none');
    assert.match(await loader.evaluate((element) => getComputedStyle(element.firstElementChild, '::after').content), /•••/);
    await page.evaluate(() => window.finishFixturePicker());
    await page.getByText('Found 2 apps in 5 files · 3 of 3 finished', { exact: true }).waitFor();
    assert.equal(await page.locator('#hide-username').count(), 0);
    await page.locator('#results-tools-disclosure > summary').click();
    await page.locator('.diagnostic-actions select').selectOption('json');
    await page.locator('#download-diagnostics').click();
    const link = page.locator('a[download="scanner-diagnostics.json"]');
    await link.waitFor();
    assert.match(await page.locator('.diagnostic-summary').textContent(), /64 executable bytes.*local file/);
    const awaitingDownload = page.waitForEvent('download');
    void awaitingDownload.catch(() => {});
    await link.click();
    const download = await awaitingDownload;
    const artifact = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    assert.equal(artifact.run.method, 'showDirectoryPicker');
    assert.equal(artifact.run.profile, 'local');
    assert.equal(artifact.run.files_seen, 5);
    assert.equal(artifact.run.app_bundles, 2);
    assert.match(artifact.run.scanner_git_commit, /^[a-f0-9]{40}$/);
    const wasm = await readFile(new URL('../../pkg/scan_wasm_bg.wasm', import.meta.url));
    assert.equal(artifact.run.wasm_sha256, createHash('sha256').update(wasm).digest('hex'));
    assert.equal(artifact.results.length, 3);
    const nested = artifact.results.find((row) => row.display_path.endsWith('/Nested.app'));
    assert.equal(nested.parent_bundle_path, 'Applications/Primary.app');
    assert.equal(nested.bundle_role, 'nested_app');
    assert.equal(nested.info_plist_encoding, 'xml_bom');
    assert.equal(nested.info_plist.OtherProperties.Support, '/Users/<user>/Library/Scanner');
    assert.equal(nested.executable_prefix_hex, executable.subarray(0, 64).toString('hex'));
    assert.equal(nested.architectures[0].header_verified, true);
    assert.equal(nested.load_commands.length, 1);
    assert.deepEqual(nested.load_commands[0].commands.map(({ id }) => id), [0x32, 0x1d]);
    assert.ok(nested.read_log.some((entry) => entry.offset === 0 && entry.length === 64));
    assert.ok(nested.directory_listings.macos.entries.some((entry) => entry.name === 'Run' && entry.size === executable.length));
    const primary = artifact.results.find((row) => row.display_path === 'Applications/Primary.app');
    assert.ok(primary.inventory.binaries.some((entry) => entry.role === 'login_item' && entry.path === nested.executable_path));
    const standalone = artifact.results.find((row) => row.display_path.endsWith('/standalone runtime'));
    assert.equal(standalone.status, 'complete');
    await page.evaluate(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([], 'fallback'));
      DataTransferItem.prototype.getAsFileSystemHandle = () => Promise.resolve(window.fixtureDirectory);
      DataTransferItem.prototype.webkitGetAsEntry = () => ({ isDirectory: true, name: 'unused entry' });
      document.getElementById('drop-zone').dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true }));
    });
    await page.getByRole('combobox', { name: 'Export scan' }).locator('option').nth(1).waitFor({ state: 'attached' });
    await page.getByText('Found 2 apps in 5 files · 3 of 3 finished', { exact: true }).waitFor();
    await page.locator('#download-diagnostics').click();
    await link.waitFor();
    const awaitingDrop = page.waitForEvent('download');
    void awaitingDrop.catch(() => {});
    await link.click();
    const dropDownload = await awaitingDrop;
    const droppedExport = JSON.parse(await readFile(await dropDownload.path(), 'utf8'));
    await dropDownload.delete();
    assert.equal(droppedExport.run.method, 'getAsFileSystemHandle');
    assert.equal(droppedExport.results.length, 3);
    assert.ok(requests.every((request) => new URL(request).origin === url));
    assert.deepEqual(errors, []);
  } catch (error) {
    throw monitor?.failure ?? error;
  } finally {
    await monitor?.stop();
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
