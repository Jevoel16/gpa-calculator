require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./db/db');

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
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
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

// Shares the app's pool so a serverless instance doesn't open a second set of connections
const sessionStore = new MySQLStore({ createDatabaseTable: true }, pool);

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

// On Vercel the CDN serves public/ directly and this is skipped; it serves the files when running locally
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    console.error(err);
    res.status(503).json({ ok: false, db: false });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/gpa', require('./routes/gpa'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.get('/', (req, res) => {
  res.redirect(req.session && req.session.userId ? '/dashboard.html' : '/login.html');
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
