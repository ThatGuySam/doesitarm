import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emptyResult, DEFAULT_BUDGET } from '../public/scan-result.js';

export const fixture = (name) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const native = fileURLToPath(new URL('../../target/debug/scan-cli', import.meta.url));

export function cli(path, budget = DEFAULT_BUDGET) {
  try {
    return JSON.parse(execFileSync(native, ['scan', path, '--budget', String(budget), '--json']));
  } catch (error) {
    if (error.status === 1) return JSON.parse(error.stdout);
    throw error;
  }
}

export function expectedRemote(path, budget, etag = '"fixture"') {
  const size = readFileSync(path).length;
  if (!budget) return emptyResult('budget_exhausted', 'byte budget reached');
  const result = cli(path, Math.max(0, Math.min(budget, size - 1) - 1));
  result.bytes_read += 1;
  result.reads += 1;
  if (etag) result.source_etag = etag;
  return result;
}

export function rangedResponse(range, data, extras = {}) {
  const match = /^bytes=(\d+)-(\d+)$/.exec(range);
  if (!match) throw new Error(`Invalid range in test: ${range}`);
  const start = Number(match[1]);
  const stop = Number(match[2]);
  if (start > stop || stop >= data.length) throw new Error(`Out-of-bounds test range: ${range}`);
  return new Response(data.subarray(start, stop + 1), {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${stop}/${data.length}`,
      'Content-Length': String(stop - start + 1),
      ETag: '"fixture"',
      ...extras,
    },
  });
}

export function dnsResponse(url, addresses = ['93.184.215.14']) {
  const type = url.searchParams.get('type') === 'AAAA' ? 28 : 1;
  return Response.json({
    Status: 0,
    Answer: addresses
      .filter((value) => value.includes(':') === (type === 28))
      .map((data) => ({ type, data })),
  });
}
