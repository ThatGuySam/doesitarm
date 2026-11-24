import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('../../', import.meta.url));
const web = join(scanner, 'web');
const localBindgen = join(scanner, 'target/tools/bin/wasm-bindgen');
const bindgen = process.env.WASM_BINDGEN || (existsSync(localBindgen) ? localBindgen : 'wasm-bindgen');

function run(command, args) {
  const { status, error } = spawnSync(command, args, { cwd: scanner, stdio: 'inherit' });
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

// Leave headroom for the Worker isolate's JS heap and HTTP buffers.
run('cargo', ['rustc', '--locked', '-j2', '-p', 'scan-wasm', '--release',
  '--target', 'wasm32-unknown-unknown', '--', '-C', 'link-arg=--max-memory=83886080']);
run(bindgen, ['--target', 'web', '--out-dir', 'pkg', 'target/wasm32-unknown-unknown/release/scan_wasm.wasm']);

const dist = join(web, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(web, 'public'), dist, { recursive: true });
mkdirSync(join(dist, 'pkg'));
for (const asset of ['scan_wasm.js', 'scan_wasm_bg.wasm']) {
  cpSync(join(scanner, 'pkg', asset), join(dist, 'pkg', asset));
}
cpSync(join(scanner, 'results/homebrew-run-1.json'), join(dist, 'homebrew-run-1.json'));
