import assert from 'node:assert/strict';
import test from 'node:test';
import { Coverage } from '../public/coverage.js';

test('re-reading the same range does not grow the unique byte count', () => {
  const coverage = new Coverage(1000);
  for (let i = 0; i < 100; i++) coverage.add(100, 300);
  assert.equal(coverage.bytes, 200);
  assert.equal(coverage.requested, 20000);
});

test('overlapping and adjacent ranges merge', () => {
  const coverage = new Coverage(1000);
  coverage.add(0, 100);
  coverage.add(200, 300);
  coverage.add(100, 200);
  assert.equal(coverage.bytes, 300);
  coverage.add(50, 250);
  assert.equal(coverage.bytes, 300);
  coverage.add(250, 400);
  assert.equal(coverage.bytes, 400);
});

test('unique bytes never exceed the file size', () => {
  const coverage = new Coverage(500);
  coverage.add(0, 500);
  coverage.add(400, 900);
  assert.equal(coverage.bytes, 500);
  assert.ok(coverage.requested > 500);
});
