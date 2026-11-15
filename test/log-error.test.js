const test = require('node:test');
const assert = require('node:assert/strict');
const logError = require('../lib/log-error');

function captured(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return lines.join('\n');
}

const req = { method: 'POST', baseUrl: '/api/auth', route: { path: '/setup' } };

test('database errors are logged by code only, never with their SQL or values', () => {
  const err = Object.assign(new Error("Duplicate entry 'alice@school.edu' for key 'email'"), {
    sqlState: '23000',
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sql: "INSERT INTO users (email) VALUES ('alice@school.edu')",
  });
  const out = captured(() => logError(req, err));
  assert.match(out, /POST \/api\/auth\/setup: database error ER_DUP_ENTRY \(1062\)/);
  assert.doesNotMatch(out, /alice/);
});

test('other errors keep their stack for debugging', () => {
  const out = captured(() => logError(req, new TypeError('boom')));
  assert.match(out, /POST \/api\/auth\/setup:/);
  assert.match(out, /TypeError: boom/);
});
