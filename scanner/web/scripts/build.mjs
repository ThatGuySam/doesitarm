import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const wasm = 'target/wasm32-unknown-unknown/release/scan_wasm.wasm';
run('cargo', ['build', '--locked', '-j2', '-p', 'scan-wasm', '--release', '--target', 'wasm32-unknown-unknown']);
run(bindgen, ['--target', 'web', '--out-dir', 'pkg', wasm]);

// Leave headroom for the Worker isolate's JS heap and HTTP buffers.
run('cargo', ['rustc', '--locked', '-j2', '-p', 'scan-wasm', '--release',
  '--target', 'wasm32-unknown-unknown', '--', '-C', 'link-arg=--max-memory=83886080']);
run(bindgen, ['--target', 'web', '--out-dir', 'pkg/worker', wasm]);

// wasm-bindgen's web glue normally caches one instance per module. Give each
// factory invocation its own Wasm exports, JS handles, and memory views so
// discarded scans can never access a replacement instance.
const workerPkg = join(scanner, 'pkg/worker');
const glue = readFileSync(join(workerPkg, 'scan_wasm.js'), 'utf8');
const exports = glue.replace(/^export (?=(?:async )?function )/gm, '')
  .replace(/^export \{ initSync, __wbg_init as default \};$/m, '');
if (/^export /m.test(exports) || !/^function initSync\(/m.test(exports) ||
    !/^function scan\(/m.test(exports)) {
  throw new Error('Unexpected wasm-bindgen web glue. Check the Worker instance factory.');
}
writeFileSync(join(workerPkg, 'scan_wasm_factory.js'),
  `export function createScanner(moduleOrBytes) {\n${exports}\ninitSync({ module: moduleOrBytes });\nreturn scan;\n}\n`);

const dist = join(web, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(web, 'public'), dist, { recursive: true });
mkdirSync(join(dist, 'pkg'));
for (const asset of ['scan_wasm.js', 'scan_wasm_bg.wasm']) {
  cpSync(join(scanner, 'pkg', asset), join(dist, 'pkg', asset));
}
cpSync(join(scanner, 'results/homebrew-edge-sample.json'), join(dist, 'homebrew-run-1.json'));

writeBrowserBuildInfo(scanner, join(scanner, 'pkg/scan_wasm_bg.wasm'), join(scanner, 'pkg/scanner-build.json'));
cpSync(join(scanner, 'pkg/scanner-build.json'), join(dist, 'scanner-build.json'));
