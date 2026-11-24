#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import { mkdtemp, open, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateRawSync, gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, process.argv[2] ?? 'target/debug/scan-cli');
const pkg = resolve(root, process.argv[3] ?? 'pkg');
const { default: init, scan, bundle_metadata, bundle_binary_role, bundle_binary_is_macho,
  scan_target: scanTarget } =
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
assert.equal(boundary.status, 'budget_exhausted');
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
assert.match(help.stdout, /URL attempts default to remote-cli with 8, 64, and 256 MiB tiers/);
assert.match(help.stdout, /Worker defaults: 8388608 bytes requested, 67108864 bytes decoded/);

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
      const args = ['scan', file, '--profile', 'worker', '--budget', String(budget), '--json'];
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
        const native = spawnSync(cli, ['scan', file, '--profile', 'worker', '--budget', String(budget), '--json', option, path], {
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
const thin = await readFile(resolve(fixtures, 'thin.macho'));
let deadlineReads = 0;
const timed = JSON.parse(await scan(BigInt(thin.length), 1024n,
  () => { deadlineReads++; }, undefined, 'worker', () => true));
assert.equal(timed.status, 'limit_reached');
assert.match(timed.error, /deadline/);
assert.equal(deadlineReads, 0);

const padding = 65 * 1024 * 1024;
const payload = await readFile(resolve(fixtures, 'app.tar'));
const tar = Buffer.alloc(512 + padding + payload.length);
tar.write('padding');
tar.write(padding.toString(8).padStart(11, '0') + '\0', 124);
tar.fill(32, 148, 156);
tar.write('0', 156);
tar.write('ustar\0', 257);
const checksum = tar.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
tar.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
payload.copy(tar, 512 + padding);
const large = gzipSync(tar);
const fromTar = (offset, length) => large.subarray(Number(offset), Number(offset) + length);
const local = JSON.parse(await scan(BigInt(large.length), 1n, fromTar, 1n, 'local'));
assert.equal(local.status, 'complete');
assert.ok(local.decoded_bytes > 64 * 1024 * 1024);
const worker = JSON.parse(await scan(BigInt(large.length), 8n * 1024n * 1024n, fromTar, undefined, 'worker'));
assert.equal(worker.status, 'limit_reached');
assert.match(worker.error, /decoded-byte budget/);

// Put a supported image past the buffering threshold. Its trailer sits after
// the padding, then the filesystem parser seeks back to earlier ranges.
function zipMember(name, data) {
  const path = Buffer.from(name);
  const packed = deflateRawSync(data);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(path.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50, 0);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt32LE(crc, 16);
  directory.writeUInt32LE(packed.length, 20);
  directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(path.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length + path.length, 12);
  end.writeUInt32LE(local.length + path.length + packed.length, 16);
  return Buffer.concat([local, path, packed, directory, path, end]);
}

const dmg = await readFile(resolve(fixtures, 'hfsx.dmg'));
const nested = Buffer.concat([dmg.subarray(0, -512), Buffer.alloc(33 * 1024 * 1024), dmg.subarray(-512)]);
const zip = zipMember('nested.dmg', nested);
const fromZip = (offset, length) => zip.subarray(Number(offset), Number(offset) + length);
const replayed = JSON.parse(await scan(BigInt(zip.length), 0n, fromZip, undefined, 'local'));
assert.equal(replayed.status, 'complete', replayed.error);
assert.equal(replayed.bundle_id, 'org.doesitarm.fixture');
assert.deepEqual(replayed.nested_artifacts, ['nested.dmg']);
const bounded = JSON.parse(await scan(BigInt(zip.length), 8n * 1024n * 1024n, fromZip, undefined, 'worker'));
assert.equal(bounded.status, 'limit_reached');
assert.match(bounded.error, /compressed nested ZIP member/);

assert.equal(bundle_binary_role('Contents/jbr/Contents/Home/bin/java'), 'runtime');
assert.equal(bundle_binary_role('Contents/Info.plist'), undefined);
assert.ok(bundle_binary_is_macho(new Uint8Array(await readFile(resolve(fixtures, 'thin.macho')))));
assert.equal(bundle_binary_is_macho(Buffer.from('cafebabe0000004100020100', 'hex')), false);

const edgeDirectory = await mkdtemp(resolve(tmpdir(), 'doesitarm-wasm-edge-'));
try {
  for (const [token, path] of [
    ['android-studio'],
    ['backuploupe'],
    ['mailmate@beta'],
    ['qt-design-studio'],
    ['codeql-bundle', 'codeql/codeql'],
    ['cursor-cli', 'dist-package/cursor-agent'],
    ['terminal-browser', 'terminal-browser/bin/terminal-browser'],
    ['steam'],
    ['tiptoi-manager'],
    ['prezi-video'],
    ['libreoffice-language-pack'],
    ['empoche'],
    ['gingko'],
    ['hydrus-network'],
    ['linked-zip'],
    ['ti-smartview-ce-for-the-ti-84-plus-family'],
  ]) {
    const file = resolve(edgeDirectory, token);
    const generated = spawnSync(resolve(fixtures, 'edge', token, 'fixture.sh'), [file], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    const bytes = await readFile(file);
    const read = (offset, length) => bytes.subarray(Number(offset), Number(offset) + length);
    for (const profile of ['local', 'worker']) {
      const budget = 8 * 1024 * 1024;
      const args = ['scan', file, '--profile', profile, '--budget', String(budget), '--json'];
      if (path) args.push('--binary-path', path);
      const native = spawnSync(cli, args, { encoding: 'utf8' });
      assert.ok([0, 1].includes(native.status), native.stderr);
      const size = BigInt(bytes.length);
      const normalized = path
        ? await scanTarget(size, BigInt(budget), read, 'executable', path, undefined, profile)
        : await scan(size, BigInt(budget), read, undefined, profile);
      assert.deepEqual(JSON.parse(normalized), JSON.parse(native.stdout), `${token}: ${profile}`);
      comparisons++;
    }
  }
} finally {
  await rm(edgeDirectory, { recursive: true, force: true });
}

console.log(`${comparisons} native/Wasm comparisons passed, plus JS boundary, plist, callback, and profile cases.`);
