// Session lifetime and invalidation (Security checklist item 22)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const express = require('express');
const pool = require('../db/db');
const { hashPassword } = require('../lib/password');
const app = require('../server');
const authRoutes = require('../routes/auth');

test('every request pushes the session expiry forward, so idle sessions expire', async () => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // Starting an OAuth sign-in is the one way to get a session without a database
    const start = await fetch(base + '/api/auth/github', { redirect: 'manual' });
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const later = await fetch(base + '/api/auth/status', { headers: { cookie } });
    assert.match(later.headers.get('set-cookie') || '', /gpa\.sid=.*Expires=/);
  } finally {
    server.close();
  }
});

test("a password change ends the account's other sessions, including ones mid-setup", async () => {
  const hash = await hashPassword('old-password-1');
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: hash }]];
    return [{ affectedRows: 1 }];
  };
  const own = express();
  own.use(express.json());
  own.use((req, _res, next) => {
    req.sessionID = 'current';
    req.session = { userId: 7, cookie: {}, regenerate: cb => cb(), save: cb => cb() };
    next();
  });
  own.use('/api/auth', authRoutes);
  const server = own.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old-password-1', newPassword: 'new-password-2' }),
    });
    assert.equal(res.status, 200);
    const cleanup = queries.find(q => q.sql.startsWith('DELETE FROM sessions'));
    assert.match(cleanup.sql, /\$\.userId/);
    assert.match(cleanup.sql, /\$\.pendingUserId/);
    assert.deepEqual(cleanup.params, ['current', 7, 7]);
  } finally {
    server.close();
  }
});
