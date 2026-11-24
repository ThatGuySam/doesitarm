import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';

export function streamInput(scratch, { name = 'stream.tar.gz', sizeMiB = 8, compressible = false } = {}) {
  const stream = join(scratch, name);
  execFileSync('python3', ['-c', `
import io, random, sys, tarfile, zipfile
class Zeros:
    def read(self, count):
        return bytes(count)
with zipfile.ZipFile(sys.argv[1]) as archive:
    bundle = [(name, archive.read(name)) for name in archive.namelist()
              if name in ('Fixture.app/Contents/Info.plist', 'Fixture.app/Contents/MacOS/FixtureBinary')]
size = int(sys.argv[3]) * 1024 ** 2
with tarfile.open(sys.argv[2], 'w:gz') as tar:
    padding = tarfile.TarInfo('first.dat')
    padding.size = size
    source = Zeros() if sys.argv[4] == 'true' else io.BytesIO(random.Random(2026).randbytes(size))
    tar.addfile(padding, source)
    for name, data in bundle:
        entry = tarfile.TarInfo(name)
        entry.size = len(data)
        tar.addfile(entry, io.BytesIO(data))
`, fixture('stored.zip'), stream, String(sizeMiB), String(compressible)]);
  return stream;
}

export function mixedInputs(scratch) {
  const padding = join(scratch, 'padded.macho');
  copyFileSync(fixture('thin.macho'), padding);
  truncateSync(padding, 16 * 1024 ** 2);
  const stream = streamInput(scratch);
  const sources = [
    padding, fixture('apfs.dmg'), fixture('deflated-zip64.zip'), fixture('thin.macho'),
    fixture('stored.zip'), fixture('fat.macho'), stream, fixture('late-bom.pkg'),
    fixture('hfsx.dmg'), fixture('nested-dmg.zip'),
  ];
  return Array.from({ length: 100 }, (_, index) => {
    const source = sources[index % sources.length];
    const name = `mix-${String(index).padStart(2, '0')}-${source.split('/').at(-1)}`;
    const path = join(scratch, name);
    copyFileSync(source, path);
    return { name, path, size: statSync(path).size };
  });
}

export function appsFolder(scratch, count) {
  const folder = join(scratch, 'Apps');
  const plist = execFileSync('python3', ['-c', `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    sys.stdout.buffer.write(archive.read('Fixture.app/Contents/Info.plist'))
`, fixture('stored.zip')]);
  for (let index = 0; index < count; index++) {
    const bundle = join(folder, `Fixture ${index}.app`, 'Contents');
    mkdirSync(join(bundle, 'MacOS'), { recursive: true });
    writeFileSync(join(bundle, 'Info.plist'), plist);
    copyFileSync(fixture('thin.macho'), join(bundle, 'MacOS', 'FixtureBinary'));
  }
  return folder;
}

export function heldInputs(scratch, count) {
  return Array.from({ length: count }, (_, index) => {
    const path = join(scratch, `hold-${index}.macho`);
    copyFileSync(fixture('thin.macho'), path);
    truncateSync(path, 128 + index);
    return path;
  });
}

export function timerInput(scratch) {
  const path = join(scratch, 'timer-thin.macho');
  const header = readFileSync(fixture('thin.macho')).subarray(0, 32);
  const commands = Buffer.alloc(1024 ** 2);
  header.writeUInt32LE(1, 16);
  header.writeUInt32LE(commands.length, 20);
  commands.writeUInt32LE(0x7f, 0);
  commands.writeUInt32LE(commands.length, 4);
  writeFileSync(path, Buffer.concat([header, commands]));
  truncateSync(path, 4 * 1024 ** 2);
  return path;
}
