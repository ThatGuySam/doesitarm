import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeBrowserBuildInfo(scanner, wasm, output) {
  function git(...args) {
    try {
      return execFileSync('git', args, { cwd: scanner, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  }
  const cargo = readFileSync(join(scanner, 'Cargo.toml'), 'utf8');
  const version = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const trackedChanges = git('status', '--porcelain', '--untracked-files=no', '--', '.');
  const info = {
    commit: git('rev-parse', 'HEAD'),
    version,
    wasm_sha256: createHash('sha256').update(readFileSync(wasm)).digest('hex'),
    working_tree_dirty: trackedChanges === null ? null : Boolean(trackedChanges),
  };
  writeFileSync(output, JSON.stringify(info) + '\n');
}
