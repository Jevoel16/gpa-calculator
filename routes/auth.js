const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db/db');
const { hashPassword, verifyPassword } = require('../lib/password');

const router = express.Router();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  ALLOWED_EMAIL_DOMAINS = '',
  ALLOW_EXTERNAL_EMAILS = 'true'
} = process.env;

// The public address of the site (e.g. https://gpa.example.com); the OAuth callback URLs are built from it.
// On Vercel it falls back to the project's production domain (your custom domain once one is added).
const APP_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  `http://localhost:${process.env.PORT || 3000}`
).replace(/\/+$/, '');
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${APP_URL}/api/auth/google/callback`;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || `${APP_URL}/api/auth/github/callback`;

const allowedDomains = ALLOWED_EMAIL_DOMAINS
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// When enabled, any verified Google account (e.g. @gmail.com) may sign in, not only school domains
const allowExternal = ALLOW_EXTERNAL_EMAILS.toLowerCase() === 'true' || !allowedDomains.length;

const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

function isAllowedAccount(payload) {
  if (!payload || payload.email_verified !== true || !payload.email) return false;
  if (allowExternal) return true;
  const hd = String(payload.hd || '').toLowerCase();
  const email = payload.email.toLowerCase();
  return allowedDomains.includes(hd) && email.endsWith(`@${hd}`);
}

async function findOrCreateUser(payload) {
  const email = payload.email.toLowerCase();

  const [bySub] = await pool.query('SELECT id FROM users WHERE google_sub = ?', [payload.sub]);
  if (bySub.length) return bySub[0].id;

  // Link an existing account with the same email so its history is kept
  const [byEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (byEmail.length) {
    await pool.query('UPDATE users SET google_sub = ? WHERE id = ?', [payload.sub, byEmail[0].id]);
    return byEmail[0].id;
  }

  const name = (payload.name || email.split('@')[0]).slice(0, 100);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)',
    [name, email, payload.sub]
  );
  return result.insertId;
}

// GitHub has no hd claim, so the school domain is checked from the email itself
function isAllowedEmail(email) {
  if (allowExternal) return true;
  const domain = email.toLowerCase().split('@')[1];
  return allowedDomains.includes(domain);
}

async function findOrCreateGithubUser(ghUser, verifiedEmail) {
  const email = verifiedEmail.toLowerCase();

  const [byId] = await pool.query('SELECT id FROM users WHERE github_id = ?', [ghUser.id]);
  if (byId.length) return byId[0].id;

  // Link an existing (e.g. Google) account with the same verified email so its history is kept
  const [byEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (byEmail.length) {
    await pool.query('UPDATE users SET github_id = ? WHERE id = ?', [ghUser.id, byEmail[0].id]);
    return byEmail[0].id;
  }

  const name = (ghUser.name || ghUser.login).slice(0, 100);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, github_id) VALUES (?, ?, ?)',
    [name, email, ghUser.id]
  );
  return result.insertId;
}

// Starts a fresh session (prevents session fixation) holding the given values
function startSession(req, values, cb) {
  req.session.regenerate(err => {
    if (err) return cb(err);
    Object.assign(req.session, values);
    req.session.save(cb);
  });
}

// After OAuth: accounts without a username and password must finish setup before they get a real session
async function logIn(req, res, userId) {
  const [rows] = await pool.query('SELECT username, password_hash FROM users WHERE id = ?', [userId]);
  const needsSetup = !rows.length || !rows[0].username || !rows[0].password_hash;
  startSession(req, needsSetup ? { pendingUserId: userId } : { userId }, err => {
    if (err) {
      console.error(err);
      return res.redirect('/login?error=oauth');
    }
    res.redirect(needsSetup ? '/setup' : '/dashboard');
  });
}

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

function isValidPassword(value) {
  return typeof value === 'string' && value.length >= MIN_PASSWORD && value.length <= MAX_PASSWORD;
}

// Best-effort brute-force guard. It lives in memory, so on serverless hosts each instance counts on its own.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const failedLogins = new Map();

function loginKey(req, identifier) {
  return `${req.ip}|${identifier}`;
}

function isThrottled(key) {
  const entry = failedLogins.get(key);
  if (entry && entry.resetAt < Date.now()) failedLogins.delete(key);
  return Boolean(entry && entry.resetAt >= Date.now() && entry.count >= MAX_FAILED_LOGINS);
}

function recordFailedLogin(key) {
  const now = Date.now();
  if (failedLogins.size > 10000) {
    for (const [k, v] of failedLogins) if (v.resetAt < now) failedLogins.delete(k);
  }
  const entry = failedLogins.get(key);
  if (entry && entry.resetAt >= now) entry.count++;
  else failedLogins.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
}

// Compared against when no account matches, so a wrong username takes as long as a wrong password
let dummyHash = null;

// Start Google sign-in
router.get('/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const url = client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    // The hd hint limits Google's account chooser to the school domain, so skip it when external accounts are allowed
    ...(allowExternal ? {} : { hd: allowedDomains[0] }),
    prompt: 'select_account'
  });

  req.session.save(err => {
    if (err) {
      console.error(err);
      return res.redirect('/login?error=oauth');
    }
    res.redirect(url);
  });
});

// Google redirects back here
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = req.session.oauthState;
    delete req.session.oauthState;

    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect('/login?error=oauth');
    }

    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!isAllowedAccount(payload)) {
      return res.redirect('/login?error=domain');
    }

    const userId = await findOrCreateUser(payload);
    await logIn(req, res, userId);
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=oauth');
  }
});

// Start GitHub sign-in
router.get('/github', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: 'read:user user:email',
    state
  });

  req.session.save(err => {
    if (err) {
      console.error(err);
      return res.redirect('/login?error=oauth');
    }
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });
});

// GitHub redirects back here
router.get('/github/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = req.session.oauthState;
    delete req.session.oauthState;

    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect('/login?error=oauth');
    }

    // GitHub returns no ID token, so trade the code for an access token and read the profile from the API
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(`GitHub token exchange failed: ${tokenData.error || tokenRes.status}`);
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'gpa-calculator' // GitHub's API rejects requests without one
    };
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers })
    ]);
    if (!userRes.ok || !emailsRes.ok) {
      throw new Error(`GitHub API error: ${userRes.status}/${emailsRes.status}`);
    }
    const ghUser = await userRes.json();
    const emails = await emailsRes.json();

    // Only a primary, verified email is trusted (it may be private on the profile)
    const primary = emails.find(e => e.primary && e.verified);
    if (!primary) return res.redirect('/login?error=email');
    if (!isAllowedEmail(primary.email)) return res.redirect('/login?error=domain');

    const userId = await findOrCreateGithubUser(ghUser, primary.email);
    await logIn(req, res, userId);
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=oauth');
  }
});

// Sign in with a username (or email) and password
router.post('/login', async (req, res) => {
  try {
    const identifier = String(req.body.identifier ?? '').trim().toLowerCase();
    const { password } = req.body;
    if (!identifier || typeof password !== 'string' || !password || password.length > MAX_PASSWORD) {
      return res.status(400).json({ error: 'Enter your username or email and your password' });
    }

    const key = loginKey(req, identifier);
    if (isThrottled(key)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait a few minutes and try again.' });
    }

    const column = identifier.includes('@') ? 'email' : 'username';
    const [rows] = await pool.query(`SELECT id, password_hash FROM users WHERE ${column} = ?`, [identifier]);
    const user = rows[0];

    if (!user || !user.password_hash) {
      dummyHash = dummyHash || await hashPassword('not-a-real-password');
      await verifyPassword(password, dummyHash);
    }
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      recordFailedLogin(key);
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    failedLogins.delete(key);
    startSession(req, { userId: user.id }, err => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
      }
      res.json({ ok: true });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// The account waiting for a username and password after its first OAuth sign-in
router.get('/setup', async (req, res) => {
  try {
    if (!(req.session && req.session.pendingUserId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const [rows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.session.pendingUserId]);
    if (!rows.length) return res.status(401).json({ error: 'Unauthorized' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/setup', async (req, res) => {
  try {
    const userId = req.session && req.session.pendingUserId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const username = String(req.body.username ?? '').trim();
    const { password } = req.body;
    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–30 characters: letters, numbers, dots or underscores' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters` });
    }

    const [taken] = await pool.query('SELECT id FROM users WHERE username = ? AND id <> ?', [username, userId]);
    if (taken.length) return res.status(409).json({ error: 'That username is taken' });

    try {
      await pool.query(
        'UPDATE users SET username = ?, password_hash = ? WHERE id = ?',
        [username.toLowerCase(), await hashPassword(password), userId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That username is taken' });
      throw err;
    }

    startSession(req, { userId }, err => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
      }
      res.json({ ok: true });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Exposes the sign-in policy so the login page can describe it
router.get('/config', (req, res) => {
  res.json({ allowedDomains, allowExternal });
});

router.post('/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => {
    res.clearCookie('gpa.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: req.secure });
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  try {
    if (!(req.session && req.session.userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const [rows] = await pool.query('SELECT id, name, email, username FROM users WHERE id = ?', [req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
