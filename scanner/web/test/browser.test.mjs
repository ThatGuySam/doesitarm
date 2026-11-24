import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { closeSync, copyFileSync, linkSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { initSync, scan } from '../../pkg/scan_wasm.js';
import { DEFAULT_BUDGET } from '../public/scan-result.js';
import { startPreview } from '../scripts/serve.mjs';
import { createHandler } from '../worker/handler.js';
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
  copyFileSync(fixture('thin.macho'), join(bundle, 'Contents', 'MacOS', 'OtherExecutable'));
  return bundle;
}

function expectedBundle(bundle, archive) {
  const plistSize = statSync(join(bundle, 'Contents/Info.plist')).size;
  const packed = cli(fixture(archive));
  const executable = cli(join(bundle, 'Contents/MacOS/FixtureBinary'), DEFAULT_BUDGET - plistSize);
  return {
    ...packed,
    format: 'app',
    architectures: executable.architectures,
    bytes_read: plistSize + executable.bytes_read,
    reads: 1 + executable.reads,
    total_size: plistSize + executable.total_size,
  };
}

function sparseFat(path) {
  const data = readFileSync(fixture('fat64.macho'));
  const offset = 4 * 1024 ** 3 + 4096;
  const size = 5 * 1024 ** 3;
  execFileSync('truncate', ['-s', String(size), path]);
  const headerAndArm = data.subarray(0, 1024);
  headerAndArm.writeBigUInt64BE(BigInt(offset), 16);
  const fd = openSync(path, 'r+');
  try {
    writeSync(fd, headerAndArm, 0, headerAndArm.length, 0);
    writeSync(fd, data, 1024, data.length - 1024, offset);
  } finally {
    closeSync(fd);
  }
  assert.equal(statSync(path).size, size);
  assert.ok(statSync(path).blocks * 512 < 64 * 1024);
  return { offset, size };
}

async function processMemory(session) {
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  const samples = await Promise.allSettled(processInfo.map(({ id }) => readFile(`/proc/${id}/smaps_rollup`, 'utf8')));
  return samples.reduce((sum, sample) => {
    if (sample.status !== 'fulfilled') return sum;
    return sum + Number(/^Pss:\s+(\d+)/m.exec(sample.value)?.[1] ?? 0);
  }, 0) * 1024;
}

function resultCard(page, label) {
  return page.locator('.result').filter({ has: page.getByRole('heading', { name: label, exact: true }) }).first();
}

async function scanResult(page, label) {
  const card = resultCard(page, label);
  await card.locator('details:not([hidden])').waitFor({ state: 'visible' });
  return JSON.parse(await card.locator('pre').textContent());
}

async function dropPaths(page, session, paths) {
  const zone = page.locator('#drop-zone');
  await zone.scrollIntoViewIfNeeded();
  const bounds = await zone.boundingBox();
  const x = Math.round(bounds.x + bounds.width / 2);
  const y = Math.round(bounds.y + bounds.height / 2);
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await session.send('Input.dispatchDragEvent', { type, x, y, data });
  }
}

test('Chromium picker, directory drop, sparse ranges, URL scans and Homebrew comparisons', { timeout: 90_000 }, async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'doesitarm-browser-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const directFile = fixture('fat.macho');
  const backendFile = fixture('hfsx.dmg');
  const directBytes = readFileSync(directFile);
  const backendBytes = readFileSync(backendFile);
  initSync({ module: new WebAssembly.Module(readFileSync(new URL('../../pkg/scan_wasm_bg.wasm', import.meta.url))) });
  const handler = createHandler({
    scan,
    outbound: async (url, options) => url.hostname === 'cloudflare-dns.com'
      ? dnsResponse(url)
      : rangedResponse(options.headers.get('Range'), backendBytes),
  });
  const apiCalls = [];
  const { server, url } = await startPreview({
    api: (request) => {
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
  t.after(() => browser.close());

  const context = await browser.newContext({ viewport: { width: 1180, height: 880 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(12_000);
  const session = await context.newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  await page.goto(url);
  await page.getByRole('heading', { name: 'App Scanner' }).waitFor();
  assert.match(await page.evaluate(() => navigator.userAgent), /Chrome\//);

  await t.test('multiselect picker scans 12 inputs using at most four module workers', async () => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose files' }).click();
    const chooser = await chooserPromise;
    assert.ok(chooser.isMultiple());
    await chooser.setFiles(names.map(fixture));
    for (const name of names) assert.deepEqual(await scanResult(page, name), cli(fixture(name)), name);
    const size = await page.evaluate(() => Math.min(4, navigator.hardwareConcurrency || 1));
    assert.equal(page.workers().length, size);
    assert.equal(apiCalls.length, 0);
  });

  await t.test('folder picker and a Chromium file-system drop scan the declared executable', async () => {
    const xmlBundle = extractBundle(join(scratch, 'xml'));
    const pickerPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose folder' }).click();
    const picker = await pickerPromise;
    await picker.setFiles(xmlBundle);
    assert.deepEqual(await scanResult(page, 'Fixture.app'), expectedBundle(xmlBundle, 'stored.zip'));

    const binaryBundle = extractBundle(join(scratch, 'binary'), { binary: true });
    await dropPaths(page, session, [binaryBundle, fixture('thin.macho')]);
    await page.locator('.result h3').filter({ hasText: /^Fixture\.app$/ }).nth(1).waitFor();
    assert.deepEqual(await scanResult(page, 'Fixture.app'), expectedBundle(binaryBundle, 'deflated-zip64.zip'));
    await page.locator('.result h3').filter({ hasText: /^thin\.macho$/ }).nth(1).waitFor();
    assert.deepEqual(await scanResult(page, 'thin.macho'), cli(fixture('thin.macho')));
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
      ['direct.macho', expectedRemote(directFile, DEFAULT_BUDGET)],
      ['cors.dmg', expectedRemote(backendFile, DEFAULT_BUDGET)],
      ['whole.dmg', expectedRemote(backendFile, DEFAULT_BUDGET)],
    ]) {
      await page.getByRole('textbox', { name: 'Scan a URL' }).fill(`https://browser.example.net/${filename}`);
      await page.getByRole('button', { name: 'Scan URL' }).click();
      assert.deepEqual(await scanResult(page, filename), result);
    }

    await page.getByRole('textbox', { name: 'Scan a URL' }).fill('https://browser.example.net/resource.dmg');
    await page.getByRole('button', { name: 'Scan URL' }).click();
    assert.equal((await scanResult(page, 'resource.dmg')).status, 'limit_reached');
    assert.deepEqual(apiCalls, ['cors.dmg', 'whole.dmg', 'resource.dmg'].map((name) => `https://browser.example.net/${name}`));
    assert.equal(network[0][1], 'bytes=0-0');
    assert.ok(network.filter(([pathname]) => pathname === '/direct.macho').length > 1);
  });

  await t.test('Homebrew table loads, fits a narrow viewport, and rescans via the Worker', async () => {
    await page.getByRole('button', { name: 'Rescan zed', exact: true }).waitFor();
    assert.equal(await page.locator('#cask-results tr').count(), 30);
    await page.setViewportSize({ width: 375, height: 790 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const region = page.locator('#cask-region');
    assert.ok(await region.evaluate((node) => node.scrollWidth > node.clientWidth));
    assert.equal(await region.getAttribute('tabindex'), '0');

    await page.getByRole('button', { name: 'Rescan zed', exact: true }).click();
    assert.deepEqual(await scanResult(page, 'zed'), expectedRemote(backendFile, DEFAULT_BUDGET));
    assert.match(apiCalls.at(-1), /^https:\/\/github\.com\/zed-industries\/zed\/releases\/download\//);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
  });

  assert.deepEqual(pageErrors, []);
});
