import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scannerFragment } from './fragment.mjs';
import { stringifyRedacted } from '../public/path-privacy.js';
import { withoutWasmNames } from '../../scripts/wasm-sections.mjs';
import { writeBrowserBuildInfo } from '../../scripts/browser-build-info.mjs';

const scanner = fileURLToPath(new URL('../../', import.meta.url));
const web = join(scanner, 'web');
const localBindgen = join(scanner, 'target/tools/bin/wasm-bindgen');
const bindgen = process.env.WASM_BINDGEN || (existsSync(localBindgen) ? localBindgen : 'wasm-bindgen');

function run(command, args) {
  const { status, error } = spawnSync(command, args, { cwd: scanner, stdio: 'inherit' });
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

const wasmProfile = 'wasm-release';
const wasm = `target/wasm32-unknown-unknown/${wasmProfile}/scan_wasm.wasm`;

function packageWasm(outDir, variant) {
  run(bindgen, ['--target', 'web', '--out-dir', outDir, wasm]);
  const filename = 'scan_wasm_bg.wasm';
  const shipped = join(scanner, outDir, filename);
  const symbols = join(scanner, 'target', 'wasm-symbols', variant);
  mkdirSync(symbols, { recursive: true });
  const named = readFileSync(shipped);
  writeFileSync(join(symbols, filename), named);
  writeFileSync(shipped, withoutWasmNames(named));
}

const prebuilt = process.argv.includes('--prebuilt-wasm') || process.env.PREBUILT_WASM === '1';
const workerOnly = process.argv.includes('--worker-only');
if (!workerOnly && !prebuilt) {
  run('cargo', ['build', '--locked', '-j2', '-p', 'scan-wasm', '--profile', wasmProfile,
    '--target', 'wasm32-unknown-unknown']);
  packageWasm('pkg', 'browser');
}

// Leave headroom for the Worker isolate's JS heap and HTTP buffers.
if (!prebuilt) {
run('cargo', ['rustc', '--locked', '-j2', '-p', 'scan-wasm', '--profile', wasmProfile,
  '--target', 'wasm32-unknown-unknown', '--features', 'page-resolution', '--', '-C', 'link-arg=--max-memory=83886080']);
packageWasm('pkg/worker', 'worker');
}

// wasm-bindgen's web glue normally caches one instance per module. Give each
// factory invocation its own Wasm exports, JS handles, and memory views so
// discarded scans can never access a replacement instance.
const workerPkg = join(scanner, 'pkg/worker');
const glue = readFileSync(join(workerPkg, 'scan_wasm.js'), 'utf8');
const exports = glue.replace(/^export (?=(?:async )?function )/gm, '')
  .replace(/^export \{ initSync, __wbg_init as default \};$/m, '');
if (/^export /m.test(exports) || !/^function initSync\(/m.test(exports) ||
    !/^function scan\(/m.test(exports) || !/^function resolve_page\(/m.test(exports)) {
  throw new Error('Unexpected wasm-bindgen web glue. Check the Worker instance factory.');
}
writeFileSync(join(workerPkg, 'scan_wasm_factory.js'),
  `function instantiate(moduleOrBytes) {\n${exports}\ninitSync({ module: moduleOrBytes });\n` +
  `return { scan, resolvePage: resolve_page, shareTarget: download_share_target };\n}\n` +
  `export function createScanner(module) { return instantiate(module).scan; }\n` +
  `export function createResolver(module) { return instantiate(module); }\n`);

if (workerOnly) process.exit(0);

const dist = join(web, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(web, 'public'), dist, { recursive: true });
mkdirSync(join(dist, 'pkg'));
for (const asset of ['scan_wasm.js', 'scan_wasm_bg.wasm']) {
  cpSync(join(scanner, 'pkg', asset), join(dist, 'pkg', asset));
}
writeFileSync(join(dist, 'scanner-fragment.html'), scannerFragment(readFileSync(join(web, 'public/index.html'), 'utf8')));
const homebrew = JSON.parse(readFileSync(join(scanner, 'results/homebrew-edge-sample.json'), 'utf8'));
writeFileSync(join(dist, 'homebrew-run-1.json'), stringifyRedacted(homebrew) + '\n');

writeBrowserBuildInfo(scanner, join(scanner, 'pkg/scan_wasm_bg.wasm'), join(scanner, 'pkg/scanner-build.json'));
cpSync(join(scanner, 'pkg/scanner-build.json'), join(dist, 'scanner-build.json'));
