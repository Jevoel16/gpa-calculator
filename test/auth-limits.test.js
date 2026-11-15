// Rate limits on sign-in, account setup and OAuth starts (Security checklist items 15 and 23)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const express = require('express');
const pool = require('../db/db');
const authRoutes = require('../routes/auth');

// No user matches a sign-in, every setup username is taken, and the attempt counters fall back to memory
pool.query = async sql => {
  if (sql.includes('auth_attempts')) throw new Error('no database in tests');
  if (sql.startsWith('SELECT id FROM users WHERE username')) return [[{ id: 99 }]];
  return [[]];
};

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use((req, _res, next) => {
  const pending = Number(req.get('x-test-pending'));
  req.session = { cookie: {}, save: cb => cb(), ...(pending ? { pendingUserId: pending } : {}) };
  next();
});
app.use('/api/auth', authRoutes);

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (path, body, headers) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('one account is locked after 30 failures even when each comes from a new IP', async () => {
  const login = ip => post('/api/auth/login', { identifier: 'victim', password: 'wrong' }, { 'X-Forwarded-For': ip });
  for (let i = 1; i <= 30; i++) assert.equal((await login(`10.0.0.${i}`)).status, 401, `attempt ${i}`);
  assert.equal((await login('10.0.1.1')).status, 429);
  // Other accounts from a fresh address are unaffected
  const other = await post(
    '/api/auth/login',
    { identifier: 'someone-else', password: 'wrong' },
    { 'X-Forwarded-For': '10.0.2.1' }
  );
  assert.equal(other.status, 401);
});

test('setup stops answering "username taken" after 20 tries', async () => {
  const setup = () =>
    post(
      '/api/auth/setup',
      { username: 'taken_name', password: 'long-enough-password' },
      { 'x-test-pending': '5', 'X-Forwarded-For': '10.1.0.1' }
    );
  for (let i = 1; i <= 20; i++) assert.equal((await setup()).status, 409, `try ${i}`);
  assert.equal((await setup()).status, 429);
});

test('one IP can start at most 30 OAuth sign-ins per window', async () => {
  const start = () =>
    fetch(base + '/api/auth/github', { headers: { 'X-Forwarded-For': '10.2.0.1' }, redirect: 'manual' });
  for (let i = 1; i <= 30; i++) assert.match((await start()).headers.get('location'), /^https:\/\/github\.com\//);
  assert.equal((await start()).headers.get('location'), '/login?error=busy');
});
