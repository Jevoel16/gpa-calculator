const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db/db');

const router = express.Router();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  ALLOWED_EMAIL_DOMAINS = '',
  ALLOW_EXTERNAL_EMAILS = 'true'
} = process.env;

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

  const name = payload.name || email.split('@')[0];
  const [result] = await pool.query(
    'INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)',
    [name, email, payload.sub]
  );
  return result.insertId;
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
    res.clearCookie('gpa.sid');
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
