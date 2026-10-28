const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db/db');

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

// Starts a fresh session for the user (prevents session fixation) and sends them to the dashboard
function logIn(req, res, userId) {
  req.session.regenerate(err => {
    if (err) {
      console.error(err);
      return res.redirect('/login.html?error=oauth');
    }
    req.session.userId = userId;
    req.session.save(saveErr => {
      if (saveErr) {
        console.error(saveErr);
        return res.redirect('/login.html?error=oauth');
      }
      res.redirect('/dashboard.html');
    });
  });
}

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
      return res.redirect('/login.html?error=oauth');
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
      return res.redirect('/login.html?error=oauth');
    }

    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!isAllowedAccount(payload)) {
      return res.redirect('/login.html?error=domain');
    }

    const userId = await findOrCreateUser(payload);
    logIn(req, res, userId);
  } catch (err) {
    console.error(err);
    res.redirect('/login.html?error=oauth');
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
      return res.redirect('/login.html?error=oauth');
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
      return res.redirect('/login.html?error=oauth');
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
    if (!primary) return res.redirect('/login.html?error=email');
    if (!isAllowedEmail(primary.email)) return res.redirect('/login.html?error=domain');

    const userId = await findOrCreateGithubUser(ghUser, primary.email);
    logIn(req, res, userId);
  } catch (err) {
    console.error(err);
    res.redirect('/login.html?error=oauth');
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
    const [rows] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
