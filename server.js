require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./db/db');
const APP_URL = require('./lib/app-url');

const { SESSION_SECRET, NODE_ENV, PORT = 3000 } = process.env;

const requiredEnv = [
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'
];
const missingEnv = requiredEnv.filter(k => !process.env[k]);
if (missingEnv.length) {
  // Throwing (rather than process.exit) surfaces the message in Vercel's function logs
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const isProduction = NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const app = express();
app.disable('x-powered-by');
// Vercel and most hosts terminate HTTPS at a proxy; trusting it lets secure cookies work
if (isProduction) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  });
  if (isProduction) res.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '100kb' }));
// Express 5 leaves req.body undefined for non-JSON or empty requests; routes expect an object
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// API responses are per-user, so no browser or CDN may store them
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Shares the app's pool so a serverless instance doesn't open a second set of connections.
// The automated tests run without a database, so they keep sessions in memory.
const sessionStore = NODE_ENV === 'test'
  ? new session.MemoryStore()
  : new MySQLStore({ createDatabaseTable: true }, pool);

app.use(session({
  name: 'gpa.sid',
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  proxy: isProduction,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// Blocks cross-site form posts and fetches against state-changing endpoints (defence in depth on top of sameSite cookies)
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  next();
});

// Pages live at /login and /dashboard; old .html links redirect there (Vercel does the same via cleanUrls).
// The strict pattern keeps paths like //evil.com.html from turning into an open redirect.
app.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) || !/^\/[\w-]+\.html$/.test(req.path)) return next();
  res.redirect(301, req.path.slice(0, -'.html'.length) + req.originalUrl.slice(req.path.length));
});

// On Vercel the CDN serves public/ directly and this is skipped; it serves the files when running locally
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// The database check is cached briefly so the public endpoint can't be used to hammer the database
const HEALTH_CACHE_MS = 30 * 1000;
let lastHealth = null;

app.get('/api/health', async (req, res) => {
  if (!lastHealth || Date.now() - lastHealth.at > HEALTH_CACHE_MS) {
    let db = true;
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      console.error('health: database unreachable', err.code || err.message);
      db = false;
    }
    lastHealth = { db, at: Date.now() };
  }
  res.status(lastHealth.db ? 200 : 503).json({ ok: lastHealth.db, db: lastHealth.db });
});

// Built from APP_URL so the absolute URLs match whichever domain the app is deployed on
app.get('/robots.txt', (req, res) => {
  res.type('txt').send([
    'User-agent: *',
    'Allow: /$',
    'Allow: /login',
    'Disallow: /dashboard',
    'Disallow: /setup',
    'Disallow: /api/',
    '',
    `Sitemap: ${APP_URL}/sitemap.xml`,
    ''
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `  <url><loc>${APP_URL}/login</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n` +
    '</urlset>\n'
  );
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/gpa', require('./routes/gpa'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  if (req.session && req.session.pendingUserId) return res.redirect('/setup');
  // Serve the sign-in page here instead of redirecting, so tools that read the
  // home page (like Vercel's project icon) find the favicon links; its canonical is /login
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Anything left over is an unknown page; browsers get the 404 page, other clients a plain message
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) return res.sendFile(path.join(__dirname, 'public', '404.html'));
  res.type('txt').send('Not found');
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

// Vercel imports the app as a function; locally `node server.js` starts a listener
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
