// With the database unreachable the limiter must keep counting in memory rather than fail open
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const rateLimit = require('../lib/rate-limit');

test('counts failures and clears them', async () => {
  const key = `test|${Date.now()}`;
  assert.equal(await rateLimit.getCount(key), 0);
  await rateLimit.recordFailure(key, 60_000);
  await rateLimit.recordFailure(key, 60_000);
  await rateLimit.recordFailure(key, 60_000);
  assert.equal(await rateLimit.getCount(key), 3);
  await rateLimit.clear(key);
  assert.equal(await rateLimit.getCount(key), 0);
});

test('counts reset once the window has passed', async () => {
  const key = `window|${Date.now()}`;
  await rateLimit.recordFailure(key, 1);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(await rateLimit.getCount(key), 0);
});

test('keys are counted separately', async () => {
  const a = `a|${Date.now()}`;
  const b = `b|${Date.now()}`;
  await rateLimit.recordFailure(a, 60_000);
  assert.equal(await rateLimit.getCount(a), 1);
  assert.equal(await rateLimit.getCount(b), 0);
});
