import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { monitorChromiumMemory, requireBrowserHeadroom } from './browser-helpers.mjs';

const MiB = 1024 ** 2;
const rowCount = 50_000;
const failureCount = 3;
const exportBudget = 200 * MiB;
const run = promisify(execFile);
const fixtureTool = fileURLToPath(new URL('../../scripts/diagnostics-to-fixtures.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../../target/debug/scan-cli', import.meta.url));

async function measureExport({ format, rowCount, failureCount, executablePrefix }) {
  const { makeExport } = await import('/diagnostics.js');
  const msec = [];
  const observer = new PerformanceObserver((list) => msec.push(...list.getEntries()));
  observer.observe({ type: 'longtask' });
  const header = {
    schema_version: 1, profile: 'local', folder_name: 'Applications', method: 'synthetic', files_seen: rowCount * 2,
  };
  const plist = {
    CFBundleIdentifier: 'org.doesitarm.diagnostics',
    CFBundleExecutable: 'Sample',
    CFBundleName: 'Synthetic Sample',
    CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: '1.2.3',
    LSMinimumSystemVersion: '14.0',
    OtherMetadata: { nested: ['🧪', '雪', 42, true], home: '/Users/fixture-owner/Library/Application Support' },
  };
  const readLog = [
    { offset: 0, length: 574, purpose: 'info_plist', outcome: 'ok' },
    { offset: 0, length: 4, purpose: 'magic', outcome: 'ok' },
    { offset: 0, length: 32, purpose: 'mach_header', outcome: 'ok' },
    { offset: 32, length: 40, purpose: 'load_commands', outcome: 'ok' },
    { offset: 0, length: 64, purpose: 'diagnostic_executable_prefix', outcome: 'ok' },
  ];
  const loadCommands = [
    { arch: 'arm64e', offset: 0, commands: [{ command: 50, size: 24, platform: 1, min_macos: '13.1' },
      { command: 29, size: 16, data_offset: 0, data_size: 0 }] },
  ];
  const arch = [{ name: 'arm64e', cpu_type: 16777228, cpu_subtype: 2, offset: 0, size: 72,
    header_verified: true, min_macos: '13.1.0', code_signature_present: true }];
  const listings = {
    contents: { entries: [{ name: 'Info.plist', type: 'file', size: 574, symlink_target: null },
      { name: 'MacOS', type: 'directory', size: null, symlink_target: null }], truncated: false },
    macos: { entries: [{ name: 'Sample', type: 'file', size: 72, symlink_target: null }], truncated: false },
  };

  function* rows() {
    for (let index = 0; index < rowCount; index++) {
      const label = `Applications/Synthetic ${String(index).padStart(5, '0')}.app`;
      const failure = index >= rowCount - failureCount;
      const script = index === rowCount - 2;
      const wrapper = index === rowCount - 1;
      const launchPath = `${label}/Contents/MacOS/Sample`;
      const scriptHex = '23212f62696e2f73680a6578697420300a';
      yield {
        id: index + 1, label, kind: 'bundle', parentBundlePath: null, source: 'Browser', started: 0, ended: 20,
        directoryListings: failure ? { ...listings, macos: { entries: [], truncated: false } } : listings,
        relativeCandidates: failure ? [] : ['Contents/MacOS/Sample'],
        nestedArtifacts: wrapper ? [`${label}/Wrapper/Nested.app`] : [],
        evidence: wrapper ? { read_log: [] } : {
          info_plist: plist, info_plist_size: 574, info_plist_encoding: 'xml', info_plist_path: 'Contents/Info.plist',
          info_plist_keys: Object.keys(plist), executable_prefix_hex: script ? scriptHex : failure ? null : executablePrefix,
          load_commands: failure ? [] : loadCommands, read_log: failure ? readLog.slice(0, 1) : readLog,
        },
        result: {
          format: 'app', status: script ? 'script' : failure ? 'no_executable' : 'complete',
          bundle_role: wrapper ? 'wrapper' : 'app', architectures: failure ? [] : arch,
          bundle_id: plist.CFBundleIdentifier, version: plist.CFBundleShortVersionString, min_macos: '14.0',
          executable_name: wrapper ? null : 'Sample', executable_path: wrapper ? null : launchPath,
          executable_size: script ? scriptHex.length / 2 : failure ? null : 72,
          error: failure ? 'The app has no Mach-O launcher.' : null,
          bytes_read: failure ? 574 : 646, bytes_requested: failure ? 574 : 650,
          decoded_bytes: 0, reads: failure ? 1 : 4, total_size: failure ? 574 : 646,
        },
      };
    }
  }

  const started = performance.now();
  const blob = await makeExport(header, rows(), format, true);
  const ended = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 75));
  msec.push(...observer.takeRecords());
  observer.disconnect();
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `diagnostics.${format}`;
  anchor.click();
  return {
    size: blob.size,
    elapsedMs: Math.round(ended - started),
    longTasks: msec.filter(({ startTime }) => startTime >= started && startTime <= ended)
      .map(({ duration, startTime }) => ({ duration, startMs: Math.round(startTime - started) })),
  };
}

async function verifyArtifact(path, format) {
  let seen = 0;
  let headers = 0;
  let failures = 0;
  function verifyHeader({ run, readme }) {
    assert.equal(seen, 0);
    headers++;
    assert.equal(run.profile, 'local');
    assert.match(readme.schema, /NDJSON/);
  }
  function verifyResult(result) {
    seen++;
    assert.equal(result.id, seen);
    assert.equal(result.stable_id, `bundle:${result.display_path}`);
    if (result.bundle_role === 'wrapper') assert.equal(result.info_plist, null);
    else {
      assert.equal(result.info_plist.OtherMetadata.home, '/Users/<user>/Library/Application Support');
      assert.equal(result.info_plist.OtherMetadata.nested[0], '🧪');
    }
    if (result.reproduction) {
      failures++;
      assert.deepEqual(result.reproduction.command, ['scan-cli', 'scan', result.display_path, '--profile', 'local', '--json']);
      const expected = result.bundle_role === 'wrapper' ? [] : [`${result.display_path}/Contents/Info.plist`];
      if (result.status === 'script') expected.push(result.executable_path);
      assert.deepEqual(result.reproduction.copy_from_selection, expected);
    } else {
      assert.equal(result.status, 'complete');
      assert.equal(result.executable_prefix_hex.length, 128);
      assert.equal(result.architectures[0].header_verified, true);
    }
  }

  if (format === 'ndjson') {
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) {
      const row = JSON.parse(line);
      if (row.type === 'run') verifyHeader(row);
      else {
        assert.equal(row.type, 'result');
        verifyResult(row.result);
      }
    }
  } else {
    const artifact = JSON.parse(await readFile(path, 'utf8'));
    verifyHeader(artifact);
    for (const result of artifact.results) verifyResult(result);
  }
  assert.equal(headers, 1);
  assert.equal(seen, rowCount);
  assert.equal(failures, failureCount);
}

async function verifySkeletons(path, output) {
  const { stdout } = await run(process.execPath, [fixtureTool, path, output]);
  assert.match(stdout, /Created 3 fixture skeletons/);
  const fixtures = await readdir(output, { withFileTypes: true });
  assert.equal(fixtures.length, failureCount);
  const labels = new Set();
  for (const entry of fixtures) {
    assert.ok(entry.isDirectory());
    const folder = join(output, entry.name);
    const diagnostic = JSON.parse(await readFile(join(folder, 'diagnostic.json'), 'utf8'));
    const repro = JSON.parse(await readFile(join(folder, 'repro.json'), 'utf8'));
    labels.add(diagnostic.display_path);
    assert.equal(repro.expected_status, diagnostic.status);
    assert.deepEqual(repro.argv, ['scan-cli', 'scan', `source/${diagnostic.display_path}`, '--profile', 'local', '--json']);
    const replay = await run(cli, repro.argv.slice(1), { cwd: folder }).catch((error) => {
      if (typeof error.code !== 'number' || !error.stdout) throw error;
      return error;
    });
    const actual = JSON.parse(replay.stdout);
    assert.equal(actual.status, diagnostic.status);
    assert.equal(actual.bundle_role, diagnostic.bundle_role);
    assert.deepEqual(actual.architectures, []);
  }
  assert.deepEqual([...labels].sort(), Array.from({ length: failureCount }, (_, index) =>
    `Applications/Synthetic ${rowCount - failureCount + index}.app`));
}

test('50,000 full browser diagnostics stay responsive in JSON and NDJSON', { timeout: 180_000 }, async (t) => {
  await requireBrowserHeadroom();
  const root = await mkdtemp(join(homedir(), '.cache', 'bigfolder-diagnostics-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { server, url } = await startPreview({ fromSource: true });
  let browser;
  const runStats = [];

  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
    const executablePrefix = (await readFile(new URL('../../fixtures/thin.macho', import.meta.url))).subarray(0, 64).toString('hex');
    for (const format of ['json', 'ndjson']) {
      await requireBrowserHeadroom();
      const context = await browser.newContext();
      let peakRss = 0;
      const monitor = await monitorChromiumMemory(browser, ({ rss }) => { peakRss = Math.max(peakRss, rss); });
      try {
        const page = await context.newPage();
        await page.goto(url);
        const awaitingDownload = page.waitForEvent('download', { timeout: 60_000 });
        void awaitingDownload.catch(() => {});
        const result = await page.evaluate(measureExport, { format, rowCount, failureCount, executablePrefix });
        const download = await awaitingDownload;
        const path = join(root, `diagnostics.${format}`);
        await download.saveAs(path);
        await download.delete();
        assert.equal((await stat(path)).size, result.size);
        runStats.push({ path, format, ...result, peakRssMiB: Math.round(peakRss / MiB) });
      } catch (error) {
        throw monitor.failure ?? error;
      } finally {
        await monitor.stop();
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  for (const { path, format, size, elapsedMs, longTasks, peakRssMiB } of runStats) {
    await verifyArtifact(path, format);
    await verifySkeletons(path, join(root, `fixtures-${format}`));
    t.diagnostic(`${format.toUpperCase()} ${size} bytes · ${elapsedMs} ms · ${peakRssMiB} MiB Chromium RSS · ${longTasks.length} long tasks`);
    assert.ok(size < exportBudget, 'Synthetic export exceeds 200 MiB.');
    assert.deepEqual(longTasks, [], 'Export generated a main-thread task of at least 50 ms.');
  }
});
