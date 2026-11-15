// User A must never read, change or delete user B's terms and CGPAs (Security checklist item 24)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const express = require('express');
const pool = require('../db/db');
const gpaRoutes = require('../routes/gpa');

const ALICE = 7;
const BOB = 8;
const courses = JSON.stringify([{ name: 'Calculus', units: 3, grade: '1.50' }]);

// A tiny fake of the two record tables. It filters by owner only when the SQL itself has
// `user_id = ?`, so a route that drops the filter would leak Bob's rows and fail these tests.
let terms;
let cgpas;
function match(rows, sql, params) {
  const byUser = sql.includes('WHERE user_id = ?') ? params[0] : sql.includes('AND user_id = ?') ? params.at(-1) : null;
  const byId = sql.includes('id IN (?)')
    ? params.at(-1)
    : sql.includes('WHERE id = ?')
      ? [Number(params.at(-2) ?? params[0])]
      : null;
  return rows.filter(r => (byUser === null || r.userId === byUser) && (byId === null || byId.includes(r.id)));
}
pool.query = async (sql, params = []) => {
  if (sql.includes('default_scale')) return [[{ defaultScale: 'msu-iit' }]];
  const table = sql.includes('cgpa_records') ? 'cgpas' : sql.includes('gpa_records') ? 'terms' : null;
  if (!table) return [[]];
  const rows = table === 'terms' ? terms : cgpas;
  if (sql.startsWith('INSERT')) return [{ insertId: 99 }];
  const hit = match(rows, sql, params);
  if (sql.startsWith('SELECT')) return [hit];
  if (sql.startsWith('DELETE')) {
    if (table === 'terms') terms = terms.filter(r => !hit.includes(r));
    else cgpas = cgpas.filter(r => !hit.includes(r));
  }
  return [{ affectedRows: hit.length }];
};

const app = express();
app.use(express.json());
// The test picks who is signed in per request; no header means signed out
app.use((req, _res, next) => {
  const user = Number(req.get('x-test-user'));
  req.session = user ? { userId: user } : {};
  next();
});
app.use('/api/gpa', gpaRoutes);

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
test.beforeEach(() => {
  terms = [{ id: 5, userId: BOB, termName: 'Bob Sem 1', coursesJson: courses, gpa: 1.5, scaleId: 'msu-iit' }];
  cgpas = [{ id: 3, userId: BOB, recordName: 'Bob Year 1', cgpaData: '{}', cgpa: 1.5, scaleId: 'msu-iit' }];
});

const as = (user, method, path, body) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': String(user) } : {}) },
    body: body && JSON.stringify(body),
  });

test('the owner sees their own records (the fake database works)', async () => {
  const { items: history } = await (await as(BOB, 'GET', '/api/gpa/history')).json();
  assert.deepEqual(
    history.map(t => t.id),
    [5]
  );
});

test("another user's history and CGPA list don't include them", async () => {
  assert.deepEqual(await (await as(ALICE, 'GET', '/api/gpa/history')).json(), { items: [], nextOffset: null });
  assert.deepEqual(await (await as(ALICE, 'GET', '/api/gpa/cgpa')).json(), { items: [], nextOffset: null });
});

test("another user's term can't be edited or deleted", async () => {
  const edit = await as(ALICE, 'PUT', '/api/gpa/5', { termName: 'Mine now', courses: JSON.parse(courses) });
  assert.equal(edit.status, 404);
  assert.equal((await as(ALICE, 'DELETE', '/api/gpa/5')).status, 404);
  assert.equal(terms.length, 1, "Bob's term is still there");
});

test("another user's CGPA record can't be deleted", async () => {
  assert.equal((await as(ALICE, 'DELETE', '/api/gpa/cgpa/3')).status, 404);
  assert.equal(cgpas.length, 1);
});

test("another user's terms can't be pulled into a cumulative GPA", async () => {
  const calc = await as(ALICE, 'POST', '/api/gpa/calculate-cumulative', { termIds: [5] });
  assert.equal(calc.status, 400);
  const save = await as(ALICE, 'POST', '/api/gpa/save-cgpa', { recordName: 'Stolen', termIds: [5] });
  assert.equal(save.status, 400);
});

test('signed-out requests are refused on every GPA endpoint', async () => {
  const endpoints = [
    ['GET', '/api/gpa/history'],
    ['GET', '/api/gpa/cgpa'],
    ['POST', '/api/gpa/save'],
    ['POST', '/api/gpa/calculate-cumulative'],
    ['POST', '/api/gpa/save-cgpa'],
    ['PUT', '/api/gpa/5'],
    ['DELETE', '/api/gpa/5'],
    ['DELETE', '/api/gpa/cgpa/3'],
  ];
  for (const [method, path] of endpoints) {
    assert.equal((await as(null, method, path, method === 'GET' ? undefined : {})).status, 401, `${method} ${path}`);
  }
  assert.equal(terms.length, 1);
});
