import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
// SCANNER_PUBLIC lets scripts/count-elements.mjs measure an older copy of public/.
const source = process.env.SCANNER_PUBLIC ?? fileURLToPath(new URL('../public', import.meta.url));
const sourceAssets = new Map([
  ['/pkg/scan_wasm.js', new URL('../../pkg/scan_wasm.js', import.meta.url)],
  ['/pkg/scan_wasm_bg.wasm', new URL('../../pkg/scan_wasm_bg.wasm', import.meta.url)],
  ['/scanner-build.json', new URL('../../pkg/scanner-build.json', import.meta.url)],
  ['/homebrew-run-1.json', new URL('../../results/homebrew-edge-sample.json', import.meta.url)],
]);
const contentTypes = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json',
  wasm: 'application/wasm',
};

export async function startPreview({ port = 0, api = null, fromSource = false, extraAssets = new Map() } = {}) {
  const root = fromSource ? source : dist;
  const lines = (await readFile(resolve(root, '_headers'), 'utf8')).trimEnd().split('\n');
  const headers = Object.fromEntries(lines.slice(1).map((line) => {
    const colon = line.indexOf(':');
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${server.address().port}`);
      if (url.pathname.startsWith('/api/')) {
        if (!api) {
          response.writeHead(503, { 'Content-Type': 'text/plain' });
          return response.end('Use the deployed Worker for server-assisted URL scans.');
        }
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const options = { method: request.method, headers: request.headers };
        if (hasBody) Object.assign(options, { body: Readable.toWeb(request), duplex: 'half' });
        const result = await api(new Request(url, options));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        if (result.body) Readable.fromWeb(result.body).pipe(response);
        else response.end();
        return;
      }

      const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const asset = extraAssets.get(pathname) ?? (fromSource ? sourceAssets.get(pathname) : undefined);
      const path = asset ? fileURLToPath(asset) : resolve(root, `.${pathname}`);
      if (!asset && !path.startsWith(`${root}${sep}`)) throw new Error();
      const type = contentTypes[path.split('.').at(-1)];
      if (!type || !(await stat(path)).isFile()) throw new Error();
      response.writeHead(200, { ...headers, 'Content-Type': type });
      createReadStream(path).pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startPreview({ port: Number(process.env.PORT ?? 8787) });
  console.log(url);
}
