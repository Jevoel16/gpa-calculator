// The history and CGPA lists come back in bounded pages (Security item 25, Performance item 5)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const express = require('express');
const pool = require('../db/db');
const gpaRoutes = require('../routes/gpa');
const { readPage, toPage, MAX_LIMIT } = require('../lib/page');

test('readPage defaults, clamps and ignores junk', () => {
  assert.deepEqual(readPage({}), { limit: 50, offset: 0 });
  assert.deepEqual(readPage({ limit: '10', offset: '20' }), { limit: 10, offset: 20 });
  assert.deepEqual(readPage({ limit: '5000' }), { limit: MAX_LIMIT, offset: 0 });
  assert.deepEqual(readPage({ limit: '0', offset: '-3' }), { limit: 50, offset: 0 });
  assert.deepEqual(readPage({ limit: 'abc', offset: '1e9x' }), { limit: 50, offset: 1 });
  assert.deepEqual(readPage(undefined), { limit: 50, offset: 0 });
});

test('toPage reports the next offset only when an extra row came back', () => {
  assert.deepEqual(toPage([1, 2, 3], { limit: 2, offset: 4 }), { items: [1, 2], nextOffset: 6 });
  assert.deepEqual(toPage([1, 2], { limit: 2, offset: 4 }), { items: [1, 2], nextOffset: null });
});

// 120 terms and 3 CGPAs for user 7; the fake applies LIMIT and OFFSET from the query parameters
const terms = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  termName: `Term ${i + 1}`,
  coursesJson: '[]',
  gpa: 1.5,
  scaleId: 'msu-iit',
}));
const cgpas = [1, 2, 3].map(id => ({ id, recordName: `Year ${id}`, cgpaData: '{}', cgpa: 1.5, scaleId: 'msu-iit' }));
const queries = [];
pool.query = async (sql, params) => {
  queries.push({ sql, params });
  const [, limit, offset] = params;
  const rows = sql.includes('cgpa_records') ? cgpas : terms;
  return [rows.slice(offset, offset + limit)];
};

const app = express();
app.use((req, _res, next) => {
  req.session = { userId: 7 };
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

const get = async path => (await fetch(base + path)).json();

test('history pages walk through every term exactly once', async () => {
  const seen = [];
  let offset = 0;
  let pages = 0;
  while (offset !== null) {
    const page = await get(`/api/gpa/history?limit=50&offset=${offset}`);
    assert.ok(page.items.length <= 50);
    seen.push(...page.items.map(t => t.id));
    offset = page.nextOffset;
    pages++;
  }
  assert.equal(pages, 3);
  assert.deepEqual(
    seen,
    terms.map(t => t.id)
  );
});

test('a huge limit is capped, and the query asks for one extra row in a stable order', async () => {
  const page = await get('/api/gpa/history?limit=100000');
  assert.equal(page.items.length, MAX_LIMIT);
  assert.equal(page.nextOffset, MAX_LIMIT);
  const last = queries.at(-1);
  assert.match(last.sql, /ORDER BY created_at DESC, id DESC LIMIT \? OFFSET \?/);
  assert.deepEqual(last.params, [7, MAX_LIMIT + 1, 0]);
});

test('the CGPA list uses the same page shape', async () => {
  const page = await get('/api/gpa/cgpa');
  assert.equal(page.items.length, 3);
  assert.equal(page.nextOffset, null);
});
