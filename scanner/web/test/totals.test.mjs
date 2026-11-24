import assert from 'node:assert/strict';
import test from 'node:test';
import {
  batchTotals, formatPercent, formatRate, formatSeconds, formatSize, rowPhrase, steadyRate, totalsPhrase,
} from '../public/scan-totals.js';

test('sizes use decimal units with three significant figures', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(999), '999 B');
  assert.equal(formatSize(1000), '1 kB');
  assert.equal(formatSize(38_400), '38.4 kB');
  assert.equal(formatSize(1_234_567), '1.23 MB');
  assert.equal(formatSize(14_200_000_000), '14.2 GB');
  assert.equal(formatSize(312_400_000_000), '312 GB');
  assert.equal(formatSize(999_700_000), '1 GB', 'no "1,000 MB"');
  assert.equal(formatSize(5 * 1024 ** 3), '5.37 GB', 'a 5 GiB file is 5.37 GB');
  assert.equal(formatSize(-1), '—');
});

test('rates switch from MB/s to GB/s at 1 GB/s', () => {
  assert.equal(formatRate(2_300_000_000), '2.3 GB/s');
  assert.equal(formatRate(1_000_000_000), '1 GB/s');
  assert.equal(formatRate(999_000_000), '999 MB/s');
  assert.equal(formatRate(250_000_000), '250 MB/s');
  assert.equal(formatRate(12_345), '12.3 kB/s');
  assert.equal(formatRate(0), null);
  assert.equal(formatRate(Infinity), null);
});

test('durations and percentages round once at display', () => {
  assert.equal(formatSeconds(40), '<0.1 s');
  assert.equal(formatSeconds(6_150), '6.1 s');
  assert.equal(formatSeconds(9_990), '9.9 s');
  assert.equal(formatSeconds(42_900), '42 s');
  assert.equal(formatSeconds(125_000), '2:05');
  assert.equal(formatPercent(38_000, 14_200_000_000), '0.00027%');
  assert.equal(formatPercent(1, 1e9), '<0.0001%');
  assert.equal(formatPercent(50, 100), '50%');
  assert.equal(formatPercent(0, 100), '0%');
  assert.equal(formatPercent(5, 0), null);
});

test('batch totals count only complete checks, and the rate uses wall time', () => {
  const jobs = [
    { status: 'complete', size: 4e9, read: 20_000 },
    { status: 'complete', size: 2e9, read: 18_000 },
    { status: 'budget_exhausted', size: 9e9, read: 8e6 },
    { status: 'source_error', size: 1e9, read: 0 },
    { status: 'canceled', size: 3e9, read: 100 },
    { status: 'pending', size: 5e9, read: 400 },
  ];
  const totals = batchTotals(jobs, 3_000);
  assert.deepEqual(totals, {
    checked: 2, scanned: 6e9, read: 38_000, unsized: 0, notChecked: 2, rate: 2e9, elapsedMs: 3_000,
  });
  assert.equal(totalsPhrase(totals), '6 GB scanned at 2 GB/s, reading only 38 kB (0.00063%)');
});

test('unknown sizes suppress the rate instead of understating it', () => {
  const totals = batchTotals([
    { status: 'complete', size: 2e9, read: 1_000 },
    { status: 'complete', size: null, read: 500 },
  ], 2_000);
  assert.equal(totals.rate, null);
  assert.equal(totalsPhrase(totals), '2 GB scanned across 1 of 2 with known sizes, reading only 1.5 kB');
  assert.equal(totalsPhrase(batchTotals([{ status: 'complete', read: 900 }], 1_000)),
    '1 checked, sizes unknown, reading 900 B');
  assert.equal(totalsPhrase(batchTotals([{ status: 'source_error', size: 1e9 }], 1_000)), null);
});

test('URL scans use the Content-Length size and the same wall-time rate', () => {
  const totals = batchTotals([{ status: 'complete', size: 310_000_000, read: 2_100_000 }], 4_000);
  assert.equal(totalsPhrase(totals), '310 MB scanned at 77.5 MB/s, reading only 2.1 MB (0.68%)');
});

test('per-row phrase and steady live rate', () => {
  assert.equal(rowPhrase({ size: 1.2e9, read: 12_000, elapsedMs: 400 }),
    'Scanned 1.2 GB in 0.4 s (3 GB/s), reading only 12 kB (0.001%)');
  assert.equal(rowPhrase({ size: null, read: 640, elapsedMs: 50 }), 'Checked in <0.1 s, reading 640 B');
  assert.equal(steadyRate(2_345_678_901), 2_300_000_000);
  assert.equal(steadyRate(87_654), 88_000);
});
