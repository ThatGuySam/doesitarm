#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, process.argv[2] ?? 'target/debug/scan-cli');
const pkg = resolve(root, process.argv[3] ?? 'pkg');
const { default: init, scan, bundle_metadata, scan_target: scanTarget } =
  await import(pathToFileURL(resolve(pkg, 'scan_wasm.js')));
await init({ module_or_path: await readFile(resolve(pkg, 'scan_wasm_bg.wasm')) });

const maxSafeSize = BigInt(Number.MAX_SAFE_INTEGER);
for (const size of [maxSafeSize + 1n, 1n << 64n, -1n]) {
  let calls = 0;
  await assert.rejects(scan(size, 4n, () => { calls++; return new Uint8Array(4); }), /size/i);
  assert.equal(calls, 0);
}
const offsets = [];
const boundary = JSON.parse(await scan(maxSafeSize, 1028n, (offset, length) => {
  offsets.push(offset);
  return new Uint8Array(length);
}));
assert.equal(boundary.status, 'unsupported');
assert.deepEqual(offsets, [0n, maxSafeSize - 512n, 0n]);
assert.equal(boundary.total_size, Number.MAX_SAFE_INTEGER);

const depth = 65;
const plist = Buffer.from(`<plist>${'<array>'.repeat(depth)}${'</array>'.repeat(depth)}</plist>`);
const trailer = Buffer.alloc(512);
trailer.write('koly');
trailer.writeUInt32BE(4, 4);
trailer.writeUInt32BE(512, 8);
trailer.writeBigUInt64BE(BigInt(plist.length), 224);
const image = Buffer.concat([plist, trailer]);
const invalidBundle = JSON.parse(bundle_metadata(plist, 'Fixture.app'));
assert.equal(invalidBundle.status, 'invalid');
assert.match(invalidBundle.error, /nesting/);
const timer = new AbortController();
try {
  const invalid = JSON.parse(await Promise.race([
    scan(BigInt(image.length), BigInt(image.length + 4),
      (offset, length) => image.subarray(Number(offset), Number(offset) + length)),
    delay(2000, undefined, { signal: timer.signal }).then(() => {
      throw new Error('Nested plist scan did not settle');
    }),
  ]));
  assert.equal(invalid.status, 'invalid');
  assert.match(invalid.error, /nesting/);
} finally {
  timer.abort();
}

const help = spawnSync(cli, ['--help'], { encoding: 'utf8' });
assert.ifError(help.error);
assert.equal(help.status, 0);
assert.match(help.stdout, /Default requested-byte budget: 67108864 bytes/);
assert.match(help.stdout, /Default decoded-byte budget: 67108864 bytes/);

const fixtures = resolve(root, 'fixtures');
let comparisons = 0;
for (const name of (await readdir(fixtures)).sort()) {
  if (!/\.(macho|zip|tar(?:\.(?:gz|bz2|xz))?|dmg|pkg)$/.test(name)) continue;
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
    const budgets = [[0], [52], [64 * 1024 * 1024], [8192, 0]];
    if (name === 'late-bom.pkg') budgets.push([600 * 1024]);
    for (const [budget, decoded] of budgets) {
      const args = ['scan', file, '--budget', String(budget), '--json'];
      if (decoded !== undefined) args.push('--decoded-budget', String(decoded));
      const native = spawnSync(cli, args, {
        encoding: 'utf8',
      });
      assert.ifError(native.error);
      assert.ok([0, 1].includes(native.status), native.stderr);
      const expected = JSON.parse(native.stdout);
      if (budget === 64 * 1024 * 1024) assert.equal(expected.status, 'complete', name);
      if (name === 'late-bom.pkg' && budget === 600 * 1024) {
        assert.equal(expected.status, 'complete', name);
        assert.equal(expected.bundle_metadata_source, 'bom_verified_gzip_cpio_tail');
      }
      for (const [mode, reader] of [['sync', read], ['async', readAsync]]) {
        const ranges = [];
        let bytesRequested = 0;
        const host = (offset, length) => {
          ranges.push([Number(offset), Number(offset) + length]);
          bytesRequested += length;
          return reader(offset, length);
        };
        const actual = JSON.parse(await scan(size, BigInt(budget), host,
          decoded === undefined ? undefined : BigInt(decoded)));
        assert.deepEqual(actual, expected, `${name}, ${mode}, budget ${budget}, decoded ${decoded}`);
        let end = 0;
        let unique = 0;
        for (const [start, stop] of ranges.sort((a, b) => a[0] - b[0])) {
          unique += Math.max(stop - Math.max(start, end), 0);
          end = Math.max(end, stop);
        }
        assert.equal(actual.reads, ranges.length);
        assert.equal(actual.bytes_read, unique);
        assert.equal(actual.bytes_requested, bytesRequested);
        comparisons++;
      }
    }
    if (name === 'stored.zip' || name === 'apfs.dmg') {
      for (const { kind, option, path } of [
        { kind: 'bundle', option: '--bundle-path', path: 'Fixture.app' },
        { kind: 'executable', option: '--binary-path', path: 'Fixture.app/Contents/MacOS/FixtureBinary' },
      ]) {
        const budget = 8 * 1024 * 1024;
        const native = spawnSync(cli, ['scan', file, '--budget', String(budget), '--json', option, path], {
          encoding: 'utf8',
        });
        assert.ifError(native.error);
        assert.equal(native.status, 0, native.stderr);
        const expected = JSON.parse(native.stdout);
        const actual = JSON.parse(await scanTarget(size, BigInt(budget), readAsync, kind, path));
        assert.deepEqual(actual, expected, `${name}, ${kind}, ${path}`);
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
assert.equal(rejected.bytes_requested, 4);
const wrong = JSON.parse(await scan(72n, 72n, () => new Uint8Array(3)));
assert.equal(wrong.status, 'source_error');
assert.equal(wrong.bytes_read, 0);
assert.equal(wrong.bytes_requested, 4);
console.log(`${comparisons} native/Wasm comparisons passed, plus JS boundary, plist and callback cases.`);
