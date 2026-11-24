#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, process.argv[2] ?? 'target/debug/scan-cli');
const pkg = resolve(root, process.argv[3] ?? 'pkg');
const { default: init, scan } = await import(pathToFileURL(resolve(pkg, 'scan_wasm.js')));
await init({ module_or_path: await readFile(resolve(pkg, 'scan_wasm_bg.wasm')) });

const fixtures = resolve(root, 'fixtures');
let comparisons = 0;
for (const name of (await readdir(fixtures)).sort()) {
  if (!/\.(macho|zip|tar\.gz|dmg|pkg)$/.test(name)) continue;
  const file = resolve(fixtures, name);
  const size = (await stat(file, { bigint: true })).size;
  const fd = openSync(file, 'r');
  const handle = await open(file, 'r');
  try {
    const read = (offset, size) => {
      assert.equal(typeof offset, 'bigint');
      assert.ok(offset <= BigInt(Number.MAX_SAFE_INTEGER));
      const destination = new Uint8Array(size);
      const count = readSync(fd, destination, 0, size, Number(offset));
      return destination.subarray(0, count);
    };
    const readAsync = async (offset, size) => {
      assert.equal(typeof offset, 'bigint');
      assert.ok(offset <= BigInt(Number.MAX_SAFE_INTEGER));
      const destination = new Uint8Array(size);
      const { bytesRead } = await handle.read(destination, 0, size, Number(offset));
      return destination.subarray(0, bytesRead);
    };
    for (const budget of [0, 52, 64 * 1024 * 1024]) {
      const native = spawnSync(cli, ['scan', file, '--budget', String(budget), '--json'], {
        encoding: 'utf8',
      });
      assert.ifError(native.error);
      assert.ok([0, 1].includes(native.status), native.stderr);
      const expected = JSON.parse(native.stdout);
      if (budget === 64 * 1024 * 1024) assert.equal(expected.status, 'complete', name);
      for (const [mode, reader] of [['sync', read], ['async', readAsync]]) {
        let reads = 0;
        let bytesRead = 0;
        const host = (offset, length) => {
          reads++;
          bytesRead += length;
          return reader(offset, length);
        };
        const actual = JSON.parse(await scan(size, BigInt(budget), host));
        assert.deepEqual(actual, expected, `${name}, ${mode}, budget ${budget}`);
        assert.equal(actual.reads, reads);
        assert.equal(actual.bytes_read, bytesRead);
        comparisons++;
      }
    }
    console.log(`${name}: native and Wasm agree for sync and async reads`);
  } finally {
    closeSync(fd);
    await handle.close();
  }
}

assert.ok(comparisons >= 6, 'No scanner fixtures found');
const rejected = JSON.parse(await scan(72n, 72n, () => Promise.reject(new Error('fixture'))));
assert.equal(rejected.status, 'source_error');
assert.equal(rejected.reads, 1);
assert.equal(rejected.bytes_read, 0);
const wrong = JSON.parse(await scan(72n, 72n, () => new Uint8Array(3)));
assert.equal(wrong.status, 'source_error');
assert.equal(wrong.bytes_read, 0);
console.log(`${comparisons} native/Wasm comparisons passed, plus JS callback error cases.`);
