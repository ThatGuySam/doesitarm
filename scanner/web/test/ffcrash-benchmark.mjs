import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { startPreview } from '../scripts/serve.mjs';

const [engine, route, directory, assets] = process.argv.slice(2);
if (!['firefox', 'chromium'].includes(engine) ||
    !['picker-only', 'picker', 'handle', 'entries'].includes(route) || !directory || !assets) {
  throw new Error('Usage: node ffcrash-benchmark.mjs firefox|chromium picker-only|picker|handle|entries Applications wasm-asset-root');
}
const modulePath = process.env.PLAYWRIGHT_MODULE ?? join(homedir(), '.cache/scanner-ffcrash-tools/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(modulePath));
const root = resolve(directory);
const { server, url } = await startPreview({ fromSource: true, extraAssets: new Map(
  ['/pkg/scan_wasm.js', '/pkg/scan_wasm_bg.wasm', '/scanner-build.json']
    .map((path) => [path, pathToFileURL(join(assets, path))])),
async api(request) {
  const params = new URL(request.url).searchParams;
  const path = resolve(root, params.get('path') || '.');
  if (path !== root && !path.startsWith(root + sep)) return new Response(null, { status: 404 });
  if (params.has('dir')) {
    return Response.json((await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => [entry.name, entry.isDirectory()]));
  }
  if (params.has('size')) return Response.json((await stat(path)).size);
  return new Response(await readFile(path));
} });

const scratch = await mkdtemp(join(tmpdir(), 'scanner-ffcrash-'));
const executable = engine === 'chromium' ? '/usr/bin/chromium' : playwright.firefox.executablePath();
const pidFile = join(scratch, 'pid');
const wrapper = join(scratch, 'browser');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(wrapper, `#!/bin/sh\nprintf '%s\\n' "$$" > ${quote(pidFile)}\nexec ${quote(executable)} "$@"\n`, { mode: 0o700 });
let browser;
let timer;
let guard;
const started = performance.now();
let phase = 'launch';
const samples = {};
const stamp = () => Math.round(performance.now() - started);
function proc(pid, name) {
  try { return readFileSync(`/proc/${pid}/${name}`, 'utf8'); }
  catch { return ''; }
}
function sample(pid) {
  const rss = (id) => Number(/^VmRSS:\s+(\d+)/m.exec(proc(id, 'status'))?.[1] ?? 0) / 1024;
  const parents = new Map();
  for (const id of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    const status = proc(id, 'status');
    const parent = Number(/^PPid:\s+(\d+)/m.exec(status)?.[1]);
    if (!parents.has(parent)) parents.set(parent, []);
    parents.get(parent).push(Number(id));
  }
  const children = [pid];
  for (const id of children) children.push(...parents.get(id) ?? []);
  const content = [...children].filter((id) => {
    const command = proc(id, 'cmdline');
    return engine === 'firefox' ? command.includes('-contentproc') && /(?:tab|web)\x00$/.test(command) :
      command.includes('--type=renderer');
  });
  const row = samples[phase] ??= { content: 0, parent: 0, total: 0 };
  row.content = Math.max(row.content, ...content.map(rss));
  row.parent = Math.max(row.parent, rss(pid));
  row.total = Math.max(row.total, [...children].reduce((sum, child) => sum + rss(child), 0));
  const available = Number(/^MemAvailable:\s+(\d+)/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0) / 1024;
  if (!guard && ((available && available < 2560) || row.total > 2500)) {
    guard = new Error(`Memory ceiling reached during ${phase} (${Math.round(available)} MiB free, ${Math.round(row.total)} MiB RSS)`);
    clearInterval(timer);
    void browser.close().catch(() => {});
  }
}

try {
  // A remote Playwright connection uploads the whole directory from Node.
  // Launch locally so setInputFiles passes only the disk directory path.
  browser = await playwright[engine].launch({ executablePath: wrapper, headless: true });
  const pid = Number(await readFile(pidFile, 'utf8'));
  timer = setInterval(() => sample(pid), 50);
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('crash', () => console.log(JSON.stringify({ crash: phase, ms: stamp() })));
  page.on('pageerror', (error) => console.log(JSON.stringify({ error: error.message, ms: stamp() })));
  page.on('console', (message) => {
    if (!message.text().startsWith('FFCRASH ')) return;
    sample(pid);
    const event = JSON.parse(message.text().slice(8));
    phase = event.phase;
    console.log(JSON.stringify({ ...event, ms: stamp() }));
  });
  await page.addInitScript(({ route, name }) => {
    const mark = (phase, details = {}) => console.log(`FFCRASH ${JSON.stringify({ phase, ...details })}`);
    window.markScan = mark;
    window.addEventListener('change', (event) => {
      if (event.target.id === 'folder') {
        mark('change', { files: event.target.files.length });
        if (route === 'picker-only') return;
        mark('discover');
      }
    }, { capture: true });
    document.addEventListener('DOMContentLoaded', () => {
      const list = document.getElementById('scan-results');
      if (!list) return;
      const observer = new MutationObserver(() => {
        if (list.querySelector('.result[data-status="scanning"]')) {
          mark('scan');
          observer.disconnect();
        }
      });
      observer.observe(list, { childList: true, subtree: true, attributes: true });
    });
    const get = async (path, query) => {
      const response = await fetch(`/api/tree?path=${encodeURIComponent(path)}${query}`);
      if (!response.ok) throw new Error(`Cannot read ${path}`);
      return response;
    };
    const handle = (path, name, dir) => ({
      name,
      kind: dir ? 'directory' : 'file',
      async *values() {
        for (const [child, directory] of await (await get(path, '&dir')).json()) {
          yield handle(`${path}/${child}`.replace(/^\//, ''), child, directory);
        }
      },
      async getDirectoryHandle(name) { return handle(path ? `${path}/${name}` : name, name, true); },
      async getFileHandle(name) { return handle(path ? `${path}/${name}` : name, name, false); },
      async getFile() { return new File([await (await get(path, '')).blob()], name); },
    });
    // The real OS dialog has no headless Playwright chooser hook for this API.
    // Use the same handle methods with lazily fetched, real fixture entries.
    if (route === 'handle') window.showDirectoryPicker = async () => handle('', name, true);
    if (route !== 'entries') return;
    function entry(value) {
      return {
        name: value.name, isDirectory: value.kind === 'directory',
        file(success, failure) { value.getFile().then(success, failure); },
        getFile(name, options, success, failure) { value.getFileHandle(name).then((child) => success(entry(child)), failure); },
        getDirectory(name, options, success, failure) { value.getDirectoryHandle(name).then((child) => success(entry(child)), failure); },
        createReader() {
          const children = value.values();
          return { async readEntries(success, failure) {
            try {
              const batch = [];
              for (let i = 0; i < 100; i += 1) {
                const child = await children.next();
                if (child.done) break;
                batch.push(entry(child.value));
              }
              success(batch);
            } catch (error) { failure(error); }
          } };
        },
      };
    }
    window.dropFixture = () => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([], name));
      const dir = entry(handle('', name, true));
      DataTransferItem.prototype.webkitGetAsEntry = () => dir;
      document.querySelector('#drop-zone').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    };
  }, { route, name: basename(root) });
  if (route === 'picker-only') {
    await page.route(`${url}/`, (request) => request.fulfill({ body: '<input id="folder" type="file" webkitdirectory multiple>', contentType: 'text/html' }));
  }
  await page.goto(url);
  await page.waitForTimeout(500);
  const hasHandle = await page.evaluate(() => typeof window.showDirectoryPicker === 'function');
  sample(pid);
  phase = 'selection';
  const selected = stamp();
  if (route.startsWith('picker')) await page.locator('#folder').setInputFiles(root, { timeout: 180_000 });
  else if (route === 'handle') await page.locator('#choose-folder').click();
  else await page.evaluate(() => window.dropFixture());
  if (route === 'picker-only') {
    console.log(JSON.stringify({ hasHandle, files: await page.locator('#folder').evaluate((input) => input.files.length), selection_ms: stamp() - selected }));
  } else {
    const result = await page.waitForFunction(() => {
      const count = document.querySelector('#results-count').textContent;
      const notice = document.querySelector('#input-status').textContent;
      if (document.querySelector('#cancel-all').hidden && (count || notice)) return { count, notice };
    }, null, { timeout: 900_000 });
    console.log(JSON.stringify({ phase: 'settled', ...(await result.jsonValue()), scan_ms: stamp() - selected, hasHandle }));
    const results = page.locator('#download-results');
    if (await results.isVisible()) await results.click();
    else if (await results.count() && await page.locator('#results-tools-disclosure').isVisible()) await results.evaluate((button) => button.click());
    const link = page.locator('a[download="scanner-results.json"]');
    if (await results.count() && await page.locator('#results-tools-disclosure').isVisible()) {
      phase = 'export';
      await link.waitFor({ state: 'attached', timeout: 30_000 });
      const pending = page.waitForEvent('download');
      void pending.catch(() => {});
      await link.evaluate((element) => element.click());
      const download = await pending;
      const data = JSON.parse(await readFile(await download.path(), 'utf8'));
      await download.delete();
      console.log(JSON.stringify({ exported: data.results.length, rows: data.results.reduce((counts, row) => {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        return counts;
      }, {}), wasm: data.run.wasm_sha256, profile: data.run.method, ms: stamp() }));
    }
  }
  await page.waitForTimeout(300);
  sample(pid);
} catch (error) {
  console.log(JSON.stringify({ phase, error: (guard ?? error).message, ms: stamp() }));
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  console.log(JSON.stringify({ engine, route, peak_RSS_MiB: samples }));
  await browser?.close().catch(() => {});
  await rm(scratch, { recursive: true, force: true });
  server.close();
}
