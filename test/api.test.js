// HTTP behaviour that needs no database: access control, headers, validation and routing
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const app = require('../server');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' });
const post = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
  redirect: 'manual'
});

test('private API routes require a session', async () => {
  for (const path of ['/api/auth/me', '/api/gpa/history', '/api/gpa/cgpa']) {
    const res = await get(path);
    assert.equal(res.status, 401, path);
  }
  for (const [method, path] of [['DELETE', '/api/gpa/1'], ['PUT', '/api/gpa/1'], ['POST', '/api/gpa/save'], ['POST', '/api/auth/password']]) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test('API responses are never cached', async () => {
  const res = await get('/api/auth/status');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('session status is reported without a 401', async () => {
  const res = await get('/api/auth/status');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { signedIn: false, pendingSetup: false });
});

test('security headers are set', async () => {
  const res = await get('/login');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('cross-origin writes are blocked', async () => {
  const res = await post('/api/auth/login', { identifier: 'a', password: 'b' }, { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('bad input is rejected before touching the database', async () => {
  assert.equal((await post('/api/auth/login', '{bad')).status, 400);
  assert.equal((await post('/api/auth/login', {})).status, 400);
  assert.equal((await post('/api/auth/login', { identifier: 'a', password: 'x'.repeat(129) })).status, 400);
  assert.equal((await post('/api/auth/login', 'x'.repeat(200 * 1024))).status, 413);
  // Express 5 leaves req.body undefined when nothing is parsed; routes must still answer 400
  const noBody = await fetch(base + '/api/auth/login', { method: 'POST' });
  assert.equal(noBody.status, 400);
  const formBody = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'identifier=a&password=b'
  });
  assert.equal(formBody.status, 400);
});

test('OAuth start redirects with a state and a short-lived session', async () => {
  const res = await get('/api/auth/github');
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get('location'));
  assert.equal(location.host, 'github.com');
  assert.match(location.searchParams.get('state'), /^[0-9a-f]{32}$/);
  const cookie = res.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const expires = new Date(cookie.match(/Expires=([^;]+)/)[1]);
  assert.ok(expires - Date.now() <= 10 * 60 * 1000 + 5000, 'expires within about 10 minutes');
});

test('OAuth callbacks reject a missing or wrong state', async () => {
  const res = await get('/api/auth/google/callback?code=x&state=y');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login?error=oauth');
});

test('robots.txt and sitemap.xml point at the app URL', async () => {
  const robots = await (await get('/robots.txt')).text();
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: http:\/\/localhost:3000\/sitemap\.xml/);
  const sitemap = await get('/sitemap.xml');
  assert.match(sitemap.headers.get('content-type'), /xml/);
  assert.match(await sitemap.text(), /<loc>http:\/\/localhost:3000\/login<\/loc>/);
});

test('old .html links redirect without becoming an open redirect', async () => {
  const res = await get('/login.html?x=1');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/login?x=1');
  const evil = await get('//evil.example.html');
  assert.notEqual(evil.status, 301);
});

test('unknown pages get a real 404', async () => {
  const page = await get('/no-such-page', { Accept: 'text/html' });
  assert.equal(page.status, 404);
  assert.match(await page.text(), /Page not found/);
  const api = await get('/api/no-such-route');
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: 'Not found' });
});

test('static assets and the web manifest are served', async () => {
  for (const path of ['/manifest.webmanifest', '/favicon.ico', '/fonts/inter-latin-var.woff2', '/og-image.png', '/icons/icon-192.png']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
  }
  const manifest = await (await get('/manifest.webmanifest')).json();
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
});

test('every page loads Vercel Web Analytics from the same origin', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const page of ['login', 'dashboard', 'setup', '404']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', `${page}.html`), 'utf8');
    assert.match(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/, page);
  }
});
