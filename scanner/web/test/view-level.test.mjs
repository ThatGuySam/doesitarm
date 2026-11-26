import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLevel, drawOutcomes } from '../public/view-level.js';

test('only a valid versioned object selects a level', () => {
  assert.equal(parseLevel(null), 'minimal');
  assert.equal(parseLevel('nope'), 'minimal');
  assert.equal(parseLevel('[]'), 'minimal');
  assert.equal(parseLevel('{"level":"expert"}'), 'minimal');
  assert.equal(parseLevel('{"level":"more"}'), 'more');
  assert.equal(parseLevel('{"level":"research"}'), 'research');
});

test('drawOutcomes is exported for the outcome strip', () => {
  assert.equal(typeof drawOutcomes, 'function');
});
