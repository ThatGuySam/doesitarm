import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelLabel, countPhrase, rowStatus, tailState } from '../public/tail-state.js';

test('a batch with queued work is never the tail', () => {
  const state = tailState({ started: [0, 0], queued: 3, now: 60_000 });
  assert.equal(state.tail, false);
  assert.equal(cancelLabel(state), 'Cancel all');
  assert.equal(countPhrase(state), '2 scanning');
});

test('only slow scans left says so and offers Cancel for those', () => {
  const state = tailState({ started: [0, 1_000], queued: 0, now: 40_000 });
  assert.equal(state.tail, true);
  assert.equal(countPhrase(state), '2 still scanning');
  assert.equal(cancelLabel(state), 'Cancel 2 still scanning');
});

test('a fresh scan next to a slow one keeps the ordinary wording', () => {
  const state = tailState({ started: [0, 39_000], queued: 0, now: 40_000 });
  assert.equal(state.tail, false);
  assert.equal(state.slow, 1);
});

test('a row reports still working after the threshold, never earlier', () => {
  assert.equal(rowStatus(0, 14_999), 'Scanning');
  assert.equal(rowStatus(0, 15_000), 'Still working');
  assert.equal(rowStatus(0, 90_000, true), 'Scanning on Cloudflare');
});
