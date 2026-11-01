const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../lib/password');

test('hashes with scrypt and a random salt', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.match(a, /^scrypt\$[0-9a-f]{32}\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(a, b);
  assert.ok(!a.includes('correct horse'));
});

test('verifies the right password only', async () => {
  const hash = await hashPassword('s3cret-pass');
  assert.equal(await verifyPassword('s3cret-pass', hash), true);
  assert.equal(await verifyPassword('wrong-pass', hash), false);
});

test('rejects stored values that are not scrypt hashes', async () => {
  assert.equal(await verifyPassword('anything', null), false);
  assert.equal(await verifyPassword('anything', 'plaintext'), false);
  assert.equal(await verifyPassword('anything', 'bcrypt$abc$def'), false);
});
