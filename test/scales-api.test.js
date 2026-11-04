// Grading-system handling in the GPA and preference routes, with the database stubbed out
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const express = require('express');
const pool = require('../db/db');
const gpaRoutes = require('../routes/gpa');
const authRoutes = require('../routes/auth');

// Each test sets `db` to answer the queries it expects; every query is recorded in `queries`
let db = () => [[]];
let queries = [];
pool.query = async (sql, params) => {
  queries.push({ sql, params });
  return db(sql, params);
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
app.use('/api/gpa', gpaRoutes);
app.use('/api/auth', authRoutes);

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
test.beforeEach(() => { queries = []; db = () => [[]]; });

const send = (method, path, body) => fetch(base + path, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const course = { name: 'Calculus', units: 3, grade: '1.50' };
const insertOf = table => queries.find(q => q.sql.startsWith(`INSERT INTO ${table}`));

test('a new term without a scale uses the account default', async () => {
  db = sql => sql.includes('default_scale') ? [[{ defaultScale: 'msu-iit' }]] : [{ insertId: 1 }];
  const res = await send('POST', '/api/gpa/save', { termName: 'Sem 1', courses: [course] });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).scaleId, 'msu-iit');
  assert.equal(insertOf('gpa_records').params.at(-1), 'msu-iit');
});

test('a stored default that no longer exists falls back to the app default', async () => {
  db = sql => sql.includes('default_scale') ? [[{ defaultScale: 'retired-scale' }]] : [{ insertId: 1 }];
  const res = await send('POST', '/api/gpa/save', { termName: 'Sem 1', courses: [course] });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).scaleId, 'msu-iit');
});

test('unknown grading systems are rejected before anything is written', async () => {
  for (const scaleId of ['nope', 'constructor', 'x'.repeat(41), 12]) {
    const res = await send('POST', '/api/gpa/save', { termName: 'Sem 1', courses: [course], scaleId });
    assert.equal(res.status, 400, String(scaleId));
  }
  assert.equal(insertOf('gpa_records'), undefined);
});

test('grades must be on the chosen scale', async () => {
  const res = await send('POST', '/api/gpa/save', { termName: 'Sem 1', scaleId: 'msu-iit', courses: [{ ...course, grade: 'A' }] });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /MSU-IIT/);
});

test('editing without a scale keeps the term\'s own scale', async () => {
  db = sql => sql.startsWith('SELECT scale_id') ? [[{ scaleId: 'msu-iit' }]] : [{ affectedRows: 1 }];
  const res = await send('PUT', '/api/gpa/5', { termName: 'Sem 1', courses: [course] });
  assert.equal(res.status, 200);
  const update = queries.find(q => q.sql.startsWith('UPDATE gpa_records'));
  assert.deepEqual(update.params.slice(3), ['msu-iit', 5, 7]);
  assert.ok(!queries.some(q => q.sql.includes('default_scale')), 'the account default is not consulted');
});

test('a cumulative GPA refuses terms from different grading systems', async () => {
  db = () => [[
    { id: 1, termName: 'A', coursesJson: '[]', gpa: 1.5, scaleId: 'msu-iit' },
    { id: 2, termName: 'B', coursesJson: '[]', gpa: 3.5, scaleId: 'other-school' }
  ]];
  const res = await send('POST', '/api/gpa/calculate-cumulative', { scaleId: 'msu-iit', termIds: [1, 2] });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /different grading systems/);

  const save = await send('POST', '/api/gpa/save-cgpa', { recordName: 'Year 1', termIds: [1, 2] });
  assert.equal(save.status, 400);
  assert.equal(insertOf('cgpa_records'), undefined);
});

test('a cumulative GPA uses and stores the terms\' scale', async () => {
  const courses = JSON.stringify([{ name: 'X', units: 3, grade: '2.00' }]);
  db = sql => sql.startsWith('SELECT id, term_name')
    ? [[{ id: 1, termName: 'A', coursesJson: courses, gpa: 2, scaleId: 'msu-iit' }]]
    : [{ insertId: 9 }];
  const calc = await send('POST', '/api/gpa/calculate-cumulative', { termIds: [1] });
  assert.equal(calc.status, 200);
  const body = await calc.json();
  assert.equal(body.scaleId, 'msu-iit');
  assert.equal(body.cumulativeGpa, 2);

  const save = await send('POST', '/api/gpa/save-cgpa', { recordName: 'Year 1', scaleId: 'msu-iit', termIds: [1] });
  assert.equal(save.status, 201);
  assert.equal(insertOf('cgpa_records').params.at(-1), 'msu-iit');
});

test('the default grading system preference is validated', async () => {
  db = () => [{ affectedRows: 1 }];
  assert.equal((await send('PUT', '/api/auth/preferences', { defaultScale: 'nope' })).status, 400);
  assert.equal((await send('PUT', '/api/auth/preferences', {})).status, 400);
  assert.equal(queries.length, 0);

  const ok = await send('PUT', '/api/auth/preferences', { defaultScale: 'msu-iit' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { defaultScale: 'msu-iit' });
  assert.deepEqual(queries[0].params, ['msu-iit', 7]);
});
