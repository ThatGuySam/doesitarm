import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { linkSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createScanner } from '../../pkg/worker/scan_wasm_factory.js';
import { DEFAULT_BUDGET } from '../public/scan-result.js';
import { formatSize } from '../public/scan-totals.js';
import { startPreview } from '../scripts/serve.mjs';
import { createHandler } from '../worker/handler.js';
import { emulateMac, dropPaths, monitorChromiumMemory, openDisclosure, processMemory, requireBrowserHeadroom, readScanJson, sparseFat } from './browser-helpers.mjs';
import { cli, dnsResponse, expectedRemote, fixture, rangedResponse } from './helpers.mjs';

const names = [
  'thin.macho', 'fat.macho', 'fat64.macho', 'stored.zip', 'deflated-zip64.zip', 'app.tar.gz',
  'app-binary-first.tar.gz', 'gzip-newc.pkg', 'stored-odc.pkg', 'pbzx.pkg', 'hfsx.dmg', 'apfs.dmg',
];

function extractBundle(parent, { binary = false } = {}) {
  execFileSync('python3', ['-c',
    'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
    fixture('stored.zip'), parent]);
  const bundle = join(parent, 'Fixture.app');
  if (binary) {
    execFileSync('python3', ['-c', `
import plistlib, sys
from pathlib import Path
plist = Path(sys.argv[1])
plist.write_bytes(plistlib.dumps(plistlib.loads(plist.read_bytes()), fmt=plistlib.FMT_BINARY))
`, join(bundle, 'Contents/Info.plist')]);
  }
  const fat = readFileSync(fixture('fat.macho'));
  const offset = fat.readUInt32BE(16);
  const size = fat.readUInt32BE(20);
  writeFileSync(join(bundle, 'Contents', 'MacOS', 'OtherExecutable'), fat.subarray(offset, offset + size));
  return bundle;
}

function assertBundle(actual, bundle) {
  const executable = cli(join(bundle, 'Contents/MacOS/FixtureBinary'));
  const plistSize = statSync(join(bundle, 'Contents/Info.plist')).size;
  assert.equal(actual.format, 'app');
  assert.equal(actual.status, 'complete');
  assert.equal(actual.bundle_path, 'Fixture.app');
  assert.equal(actual.executable_path, 'Fixture.app/Contents/MacOS/FixtureBinary');
  assert.equal(actual.executable_resolution, 'declared');
  assert.deepEqual(actual.architectures, executable.architectures);
  assert.equal(actual.bytes_read, plistSize + executable.bytes_read);
  assert.equal(actual.total_size, plistSize + executable.total_size);
  assert.deepEqual(actual.inventory.x86_64_only, ['Fixture.app/Contents/MacOS/OtherExecutable']);
  assert.equal(actual.inventory.all_arm64_capable, false);
  const helper = actual.inventory.binaries.find(({ role }) => role === 'helper');
  assert.deepEqual(helper.architectures, cli(join(bundle, 'Contents/MacOS/OtherExecutable')).architectures);
}

function resultCard(page, label) {
  return page.locator('.result').filter({ has: page.getByRole('heading', { name: label, exact: true }) }).first();
}

async function scanResult(page, label) {
  return readScanJson(page, resultCard(page, label));
}

function assertLocalScan(actual, expected, label) {
  // The browser also reads diagnostic evidence. Compare the scan outcome and
  // verify that its distinct source coverage stays inside the selected file.
  for (const field of ['format', 'status', 'architectures', 'bundle_path', 'bundle_id',
    'version', 'min_macos', 'executable_name', 'executable_size', 'total_size']) {
    assert.deepEqual(actual[field], expected[field], `${label} · ${field}`);
  }
  assert.ok(actual.bytes_read <= actual.total_size && actual.bytes_requested >= actual.bytes_read, label);
}

test('Chromium picker, directory drop, sparse ranges, URL scans and Homebrew comparisons', { timeout: 90_000 }, async (t) => {
  await requireBrowserHeadroom();
  const scratch = mkdtempSync(join(homedir(), '.cache', 'doesitarm-browser-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const directFile = fixture('fat.macho');
  const backendFile = fixture('hfsx.dmg');
  const directBytes = readFileSync(directFile);
  const backendBytes = readFileSync(backendFile);
  const module = new WebAssembly.Module(readFileSync(new URL('../../pkg/worker/scan_wasm_bg.wasm', import.meta.url)));
  const handler = createHandler({
    createScan: () => createScanner(module),
    outbound: async (url, options) => url.hostname === 'cloudflare-dns.com'
      ? dnsResponse(url)
      : rangedResponse(options.headers.get('Range'), backendBytes),
  });
  const apiCalls = [];
  const { server, url } = await startPreview({
    api: (request) => {
      assert.equal(request.headers.get('X-Scan-Client'), 'browser');
      const download = new URL(request.url).searchParams.get('url');
      apiCalls.push(download);
      if (download.endsWith('/resource.dmg')) return new Response('Error 1102', { status: 503 });
      return handler(request, {});
    },
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

  const context = await browser.newContext({ viewport: { width: 1180, height: 880 } });
  await emulateMac(context);
  // These checks read the Research view's details; Minimal hides them.
  await context.addInitScript(() => localStorage.setItem('doesitarm.scanner.view.v1', '{"level":"research"}'));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(12_000);
  const session = await context.newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  await page.goto(url);
  await page.getByRole('heading', { name: 'Apple Silicon App Test' }).waitFor();
  assert.match(await page.evaluate(() => navigator.userAgent), /Chrome\//);

  await t.test('multiselect picker scans 12 inputs using the foreground module worker limit', async () => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select Apps' }).click();
    const chooser = await chooserPromise;
    assert.ok(chooser.isMultiple());
    await chooser.setFiles(names.map(fixture));
    for (const name of names) assertLocalScan(await scanResult(page, name), cli(fixture(name)), name);
    const size = await page.evaluate(() => Math.min(6, Math.max(1, (navigator.hardwareConcurrency || 1) - 2)));
    assert.equal(page.workers().length, size);
    assert.equal(apiCalls.length, 0);
  });

  await t.test('folder picker and a Chromium file-system drop scan the declared executable', async () => {
    const xmlBundle = extractBundle(join(scratch, 'xml'));
    await page.evaluate(() => { DataTransferItem.prototype.getAsFileSystemHandle = undefined; });
    await dropPaths(page, session, [xmlBundle]);
    await session.send('Input.cancelDragging').catch(() => {});
    const picked = resultCard(page, 'Fixture.app');
    await picked.locator('.result-verdict').getByText('2 binaries, 1 Intel-only').waitFor();
    assert.match(await picked.locator('.verdict-text').textContent(), /Apple Silicon native/);
    assert.equal(await picked.locator('.binary-inventory li').count(), 0);
    assertBundle(await scanResult(page, 'Fixture.app'), xmlBundle);
    const pickedSize = ['Contents/Info.plist', 'Contents/MacOS/FixtureBinary', 'Contents/MacOS/OtherExecutable']
      .reduce((total, path) => total + statSync(join(xmlBundle, path)).size, 0);
    assert.ok((await page.locator('#batch-metrics').textContent()).includes(`${formatSize(pickedSize)} scanned`));
    await picked.locator('.binary-inventory li').filter({ hasText: 'OtherExecutable' }).waitFor();
    assert.match(await picked.locator('.binary-inventory li').filter({ hasText: 'OtherExecutable' }).textContent(),
      /Helper.*x86_64.*macOS.*signature/);

    const binaryBundle = extractBundle(join(scratch, 'binary'), { binary: true });
    await page.evaluate(() => { DataTransferItem.prototype.getAsFileSystemHandle = undefined; });
    await dropPaths(page, session, [binaryBundle, fixture('thin.macho')]);
    await page.locator('.result h3').filter({ hasText: /^Fixture\.app$/ }).nth(1).waitFor();
    await resultCard(page, 'Fixture.app').locator('.result-verdict').getByText('2 binaries, 1 Intel-only').waitFor();
    assertBundle(await scanResult(page, 'Fixture.app'), binaryBundle);
    await page.locator('.result h3').filter({ hasText: /^thin\.macho$/ }).nth(1).waitFor();
    assertLocalScan(await scanResult(page, 'thin.macho'), cli(fixture('thin.macho')), 'dropped thin.macho');
    await session.send('Input.cancelDragging').catch(() => {});
    assert.equal(apiCalls.length, 0);
  });

  await t.test('12 sparse 5 GiB Mach-O files each read a slice beyond 4 GiB', async (t) => {
    const paths = Array.from({ length: 12 }, (_, index) => join(scratch, `sparse-${index}.macho`));
    const { offset, size } = sparseFat(paths[0]);
    for (const path of paths.slice(1)) linkSync(paths[0], path);
    const baseline = await processMemory(browserSession);
    const start = performance.now();
    let peak = baseline;
    let sample = Promise.resolve();
    const timer = setInterval(() => {
      sample = processMemory(browserSession).then((bytes) => { peak = Math.max(peak, bytes); });
    }, 40);

    try {
      await page.locator('#files').setInputFiles(paths);
      for (const [index, path] of paths.entries()) {
        const result = await scanResult(page, `sparse-${index}.macho`);
        assert.deepEqual(result, cli(path));
        assert.equal(result.total_size, size);
        assert.ok(result.bytes_read < 1024);
        assert.ok(result.architectures.some((arch) => arch.offset === offset && arch.header_verified));
      }
    } finally {
      clearInterval(timer);
      await sample;
      peak = Math.max(peak, await processMemory(browserSession));
    }
    const elapsed = Math.round(performance.now() - start);
    t.diagnostic(`12 × ${size} logical bytes, ${statSync(paths[0]).blocks * 512} allocated source bytes per inode. ` +
      `Batch ${elapsed} ms. Chromium PSS baseline ${Math.round(baseline / 1024 ** 2)} MiB, peak ${Math.round(peak / 1024 ** 2)} MiB.`);
    assert.ok(elapsed < 12_000, 'sparse scan batch took too long');
    if (baseline) assert.ok(peak - baseline < 384 * 1024 ** 2, 'sparse scan batch grew Chromium memory unexpectedly');
    assert.equal(apiCalls.length, 0);
  });

  await t.test('browser uses valid ranges and falls back on CORS or a whole-file response', async () => {
    const network = [];
    await context.route('https://browser.example.net/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      network.push([pathname, request.headers().range]);
      if (pathname === '/whole.dmg') {
        await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'whole file' });
      } else if (pathname !== '/direct.macho') {
        await route.fulfill({ status: 206, headers: { 'Content-Range': 'bytes 0-0/100' }, body: 'x' });
      } else {
        const response = rangedResponse(request.headers().range, directBytes, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range, ETag',
        });
        await route.fulfill({
          status: 206,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      }
    });

    for (const [filename, result] of [
      ['direct.macho', expectedRemote(directFile, 0, '"fixture"', 'local')],
      ['cors.dmg', expectedRemote(backendFile, DEFAULT_BUDGET)],
      ['whole.dmg', expectedRemote(backendFile, DEFAULT_BUDGET)],
    ]) {
      await openDisclosure(page, '#advanced');
      await page.getByRole('textbox', { name: "Paste a download link or the app's download page" }).fill(`https://browser.example.net/${filename}`);
      await page.getByRole('button', { name: 'Scan URL' }).click();
      assert.deepEqual(await scanResult(page, filename), result);
    }

    await page.getByRole('textbox', { name: "Paste a download link or the app's download page" }).fill('https://browser.example.net/resource.dmg');
    await page.getByRole('button', { name: 'Scan URL' }).click();
    assert.equal((await scanResult(page, 'resource.dmg')).status, 'limit_reached');
    assert.deepEqual(apiCalls, ['cors.dmg', 'whole.dmg', 'resource.dmg'].map((name) => `https://browser.example.net/${name}`));
    assert.equal(network[0][1], 'bytes=0-0');
    assert.ok(network.filter(([pathname]) => pathname === '/direct.macho').length > 1);
  });

  await t.test('Homebrew table loads, fits a narrow viewport, and rescans via the Worker', async () => {
    await openDisclosure(page, '#homebrew');
    await page.getByRole('button', { name: 'Rescan zed', exact: true }).waitFor();
    assert.equal(await page.locator('#cask-results tr').count(), 30);
    await page.setViewportSize({ width: 375, height: 790 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const region = page.locator('#cask-region');
    assert.ok(await region.evaluate((node) => node.scrollWidth > node.clientWidth));
    assert.equal(await region.getAttribute('tabindex'), '0');

    await page.getByRole('button', { name: 'Rescan zed', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
    assert.deepEqual(await scanResult(page, 'zed'), expectedRemote(backendFile, DEFAULT_BUDGET));
    assert.match(apiCalls.at(-1), /^https:\/\/github\.com\/zed-industries\/zed\/releases\/download\//);
  });

  await t.test('home paths are masked in rows, Details, raw JSON, and copied results', async () => {
    const privacyPage = await context.newPage();
    try {
      await privacyPage.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: {
          async write([item]) {
            window.copiedResults = await (await item.getType('text/plain')).text();
          },
        } });
      });
      await privacyPage.route('**/app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
      await privacyPage.addInitScript(() => localStorage.setItem('doesitarm.scanner.view.v1', '{"level":"research"}'));
      await privacyPage.goto(url);
      await privacyPage.evaluate(() => { document.documentElement.dataset.level = 'research'; });
      await privacyPage.evaluate(async () => {
        const { ResultsList } = await import('/results-list.js');
        const { emptyResult } = await import('/scan-result.js');
        const mode = { limit: 1, passive: false };
        const view = new ResultsList({
          submit(id, job, update) {
            update({ type: 'done', source: 'Browser', result: {
              ...emptyResult('source_error', String.raw`Cannot open C:\Users\windows-account\app`),
              bundle_id: '/home/linux-account/metadata',
              bundle_path: job.label,
              inventory: {
                complete: false, all_arm64_capable: null, x86_64_only: [],
                binaries: [{ role: 'helper', path: '/Users/helper-account/bin/tool', architectures: [] }],
              },
            } });
          },
        }, () => mode);
        view.add([{ kind: 'file', label: '/Users/mac-account/Application.app' }]);
      });
      const card = resultCard(privacyPage, '/Users/<user>/Application.app');
      const result = await readScanJson(privacyPage, card);
      assert.equal(result.bundle_id, '/Users/<user>/metadata');
      assert.equal(result.error, 'Cannot open /Users/<user>/app');
      assert.equal(result.bundle_path, '/Users/<user>/Application.app');
      assert.equal(await card.locator('.binary-inventory li code').textContent(), '/Users/<user>/bin/tool');
      assert.doesNotMatch(await privacyPage.locator('main').innerText(), /(?:mac|linux|windows|helper)-account/);

      await privacyPage.locator('#results-tools-disclosure > summary').click();
      await privacyPage.locator('#copy-results').click();
      await privacyPage.locator('#copy-results-ready').click();
      await privacyPage.waitForFunction(() => typeof window.copiedResults === 'string');
      const copied = await privacyPage.evaluate(() => window.copiedResults);
      assert.doesNotMatch(copied, /(?:mac|linux|windows|helper)-account/);
      const [exported] = JSON.parse(copied).results;
      assert.equal(exported.display_path, '/Users/<user>/Application.app');
      assert.equal(exported.inventory.binaries[0].path, '/Users/<user>/bin/tool');
      assert.equal(await privacyPage.locator('#hide-username').count(), 0);
    } finally {
      await privacyPage.close();
    }
  });

  assert.deepEqual(pageErrors, []);
});
